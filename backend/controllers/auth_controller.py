import datetime
import hashlib
import hmac
import re
import secrets
from typing import Optional
from bson import ObjectId
from fastapi import HTTPException, status

from auth.jwt_handler import (
    hash_password,
    verify_password,
    create_access_token,
    sanitize_user_document,
    get_otp_hmac_secret,
)
from database.mongodb import get_database
from models.user import UserRegister, UserLogin, UserProfileUpdate, UserSocialLogin, VerifyRequest
from services.email_service import send_otp_email, EmailDeliveryError
from services.rate_limit_service import rate_limiter

OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _as_utc(dt: datetime.datetime) -> datetime.datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def _generate_otp() -> str:
    """Generate a cryptographically secure 6-digit numeric OTP."""
    return f"{secrets.randbelow(1000000):06d}"


def _hash_otp(email: str, otp: str) -> str:
    """Hash a 6-digit OTP using a per-OTP random salt and keyed HMAC-SHA256."""
    salt = secrets.token_hex(16)
    msg = f"{salt}:{email.lower().strip()}:{otp}".encode("utf-8")
    digest = hmac.new(get_otp_hmac_secret(), msg, hashlib.sha256).hexdigest()
    return f"{salt}${digest}"


def _verify_otp_hash(email: str, otp: str, stored_hash: str) -> bool:
    """Verify an OTP against its stored salted HMAC-SHA256 digest in constant time."""
    if not stored_hash or "$" not in stored_hash:
        return False
    salt, expected_digest = stored_hash.split("$", 1)
    msg = f"{salt}:{email.lower().strip()}:{otp}".encode("utf-8")
    candidate = hmac.new(get_otp_hmac_secret(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(candidate, expected_digest)


def parse_height_to_cm(height_str: Optional[str]) -> Optional[float]:
    if not height_str or not str(height_str).strip():
        return None
    cleaned = str(height_str).lower().strip()

    ft_in_match = re.search(r"(\d+)\s*(?:'|ft|feet)\s*(\d+)?\s*(?:\"|in|inches)?", cleaned)
    if ft_in_match:
        feet = int(ft_in_match.group(1))
        inches = int(ft_in_match.group(2)) if ft_in_match.group(2) else 0
        cm = (feet * 12 + inches) * 2.54
        return round(cm, 1) if 30 <= cm <= 300 else None

    nums = re.findall(r"\d+\.?\d*", cleaned)
    if nums:
        val = float(nums[0])
        if val <= 0:
            return None
        if val < 3.0:
            val = val * 100.0
        return round(val, 1) if 30 <= val <= 300 else None
    return None


def parse_weight_to_kg(weight_str: Optional[str]) -> Optional[float]:
    if not weight_str or not str(weight_str).strip():
        return None
    cleaned = str(weight_str).lower().strip()
    nums = re.findall(r"\d+\.?\d*", cleaned)
    if not nums:
        return None
    val = float(nums[0])
    if val <= 0:
        return None
    if "lb" in cleaned:
        val = val * 0.453592
    return round(val, 1) if 10 <= val <= 500 else None


def compute_age_from_dob(dob_str: Optional[str]) -> Optional[int]:
    if not dob_str or not str(dob_str).strip():
        return None
    try:
        dob = datetime.date.fromisoformat(str(dob_str).strip()[:10])
        today = datetime.date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return age if 0 <= age <= 130 else None
    except Exception:
        return None


def compute_bmi_and_targets(
    height_str: Optional[str],
    weight_str: Optional[str],
    age: Optional[int],
    gender: Optional[str],
) -> dict:
    """Compute BMI and metabolic targets ONLY from valid provided measurements."""
    height_cm = parse_height_to_cm(height_str)
    weight_kg = parse_weight_to_kg(weight_str)

    bmi_val = None
    bmi_cat = "Not provided"
    if height_cm and weight_kg and height_cm > 0:
        height_m = height_cm / 100.0
        bmi_val = round(weight_kg / (height_m ** 2), 1)
        if bmi_val < 18.5:
            bmi_cat = "Underweight"
        elif bmi_val < 25.0:
            bmi_cat = "Normal"
        elif bmi_val < 30.0:
            bmi_cat = "Overweight"
        else:
            bmi_cat = "Obese"

    target_calories = None
    target_steps = None
    target_water = None

    if height_cm and weight_kg and age is not None:
        g_lower = (gender or "").lower()
        if g_lower == "male":
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        elif g_lower == "female":
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
        else:
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 80
        target_calories = int(bmr * 1.25)
        target_steps = 8000 if (age > 55 or (bmi_val is not None and bmi_val >= 30.0)) else 10000
        target_water = max(8, min(12, int(weight_kg * 0.12)))

    return {
        "weight_kg": weight_kg,
        "bmi_value": bmi_val,
        "bmi_category": bmi_cat,
        "target_calories": target_calories,
        "target_steps": target_steps,
        "target_water": target_water,
    }


def _build_initial_metrics(user_doc: dict) -> dict:
    calc = compute_bmi_and_targets(
        user_doc.get("height"),
        user_doc.get("weight"),
        user_doc.get("age"),
        user_doc.get("gender"),
    )
    return {
        "user_email": user_doc["email"],
        "heartRate": {"current": None, "min": 60, "max": 100, "unit": "bpm", "status": "not_recorded"},
        "bloodPressure": {"systolic": None, "diastolic": None, "unit": "mmHg", "status": "not_recorded"},
        "sleep": {"hours": None, "quality": "Not provided", "target": 8, "unit": "hrs"},
        "calories": {"burned": None, "intake": None, "target": calc["target_calories"], "unit": "kcal"},
        "steps": {"count": None, "target": calc["target_steps"], "unit": "steps"},
        "water": {"intake": None, "target": calc["target_water"], "unit": "glasses"},
        "weight": {"current": calc["weight_kg"], "previous": None, "unit": "kg"},
        "bmi": {"value": calc["bmi_value"], "category": calc["bmi_category"]},
        "oxygen": {"level": None, "unit": "%", "status": "not_recorded"},
        "temperature": {"value": None, "unit": "°F", "status": "not_recorded"},
        "history": {},
    }


async def register_user_controller(user_data: UserRegister, client_ip: str = "local"):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    email = user_data.email.lower().strip()
    rate_limiter.check("register_ip", client_ip, max_requests=15, window_seconds=300)
    rate_limiter.check("register_email", email, max_requests=5, window_seconds=300)

    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        if existing_user.get("is_verified", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email is already registered.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An unverified account already exists for this email. Please verify your OTP or request a new code.",
        )

    emergency_combined = (user_data.emergencyContact or "").strip()
    if user_data.emergencyContactName and user_data.emergencyContactPhone:
        emergency_combined = f"{user_data.emergencyContactName.strip()} — {user_data.emergencyContactPhone.strip()}"

    resolved_age = user_data.age if user_data.age is not None else compute_age_from_dob(user_data.dateOfBirth)
    password_hash = hash_password(user_data.password)
    now = _utcnow()
    otp_code = _generate_otp()

    user_doc = {
        "name": user_data.name.strip(),
        "email": email,
        "password_hash": password_hash,
        "phone": (user_data.phone or "").strip(),
        "dateOfBirth": (user_data.dateOfBirth or "").strip(),
        "age": resolved_age,
        "gender": user_data.gender.strip() if user_data.gender else None,
        "bloodGroup": user_data.bloodGroup.strip() if user_data.bloodGroup else None,
        "height": (user_data.height or "").strip(),
        "weight": (user_data.weight or "").strip(),
        "allergies": (user_data.allergies or "").strip(),
        "medicalConditions": (user_data.medicalConditions or "").strip(),
        "emergencyContactName": (user_data.emergencyContactName or "").strip(),
        "emergencyContactPhone": (user_data.emergencyContactPhone or "").strip(),
        "emergencyContact": emergency_combined,
        "address": (user_data.address or "").strip(),
        "insurance": (user_data.insurance or "").strip(),
        "role": "Patient",  # Always assign standard role; never trust client-supplied privileged role
        "memberSince": now.strftime("%Y-%m-%d"),
        "createdAt": now,
        "updatedAt": now,
        "is_verified": False,
        "otp_hash": _hash_otp(email, otp_code),
        "otp_expires_at": now + datetime.timedelta(minutes=OTP_EXPIRY_MINUTES),
        "otp_attempts": 0,
        "otp_last_sent_at": now,
    }

    result = await db.users.insert_one(user_doc)

    try:
        await send_otp_email(email, user_doc["name"], otp_code)
    except EmailDeliveryError as exc:
        # Roll back pending user if OTP email cannot be sent so user isn't locked out
        await db.users.delete_one({"_id": result.inserted_id})
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    return {
        "status": "verification_required",
        "email": email,
        "message": "Verification OTP sent to your email address. Please verify within 5 minutes.",
    }


async def verify_user_controller(verify_data: VerifyRequest, client_ip: str = "local"):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    email = verify_data.email.lower().strip()
    rate_limiter.check("otp_verify_ip", client_ip, max_requests=20, window_seconds=300)
    rate_limiter.check("otp_verify_email", email, max_requests=10, window_seconds=300)

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )

    if user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified. Please log in.",
        )

    attempts = int(user.get("otp_attempts", 0))
    if attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum OTP attempts exceeded. Please request a new verification code.",
        )

    otp_hash = user.get("otp_hash")
    expires_at = user.get("otp_expires_at")
    now = _utcnow()

    if not otp_hash or not expires_at or _as_utc(expires_at) < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new OTP.",
        )

    if not _verify_otp_hash(email, verify_data.otp.strip(), otp_hash):
        new_attempts = attempts + 1
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"otp_attempts": new_attempts, "updatedAt": now}},
        )
        if new_attempts >= MAX_OTP_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Maximum OTP attempts exceeded. Please request a new verification code.",
            )
        remaining = MAX_OTP_ATTEMPTS - new_attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"is_verified": True, "updatedAt": now},
            "$unset": {
                "otp_hash": "",
                "otp_expires_at": "",
                "otp_attempts": "",
                "otp_last_sent_at": "",
                "verification_otp": "",
            },
        },
    )

    existing_metrics = await db.metrics.find_one({"user_email": email})
    if not existing_metrics:
        await db.metrics.insert_one(_build_initial_metrics(user))

    existing_settings = await db.settings.find_one({"user_email": email})
    if not existing_settings:
        await db.settings.insert_one(
            {
                "user_email": email,
                "notifications": {
                    "medicationAlerts": True,
                    "healthTips": False,
                    "emergencyAlerts": True,
                    "weeklyReport": True,
                    "marketingEmails": False,
                },
                "theme": "dark",
                "language": "en",
                "twoFactor": False,
                "createdAt": now,
                "updatedAt": now,
            }
        )

    return {
        "status": "verified",
        "email": email,
        "message": "Email verified successfully. You can now log in with your email and password.",
    }


async def resend_otp_controller(email_raw: str, client_ip: str = "local"):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    email = email_raw.lower().strip()
    rate_limiter.check("otp_resend_ip", client_ip, max_requests=10, window_seconds=300)

    user = await db.users.find_one({"email": email})
    if not user or user.get("is_verified", False):
        # Generic response avoids account enumeration
        return {
            "status": "verification_required",
            "email": email,
            "message": "If an unverified account exists for this email, a new verification code has been sent.",
        }

    now = _utcnow()
    last_sent = user.get("otp_last_sent_at")
    if last_sent:
        elapsed = (now - _as_utc(last_sent)).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            wait_sec = max(1, int(RESEND_COOLDOWN_SECONDS - elapsed))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait_sec} seconds before requesting a new verification code.",
                headers={"Retry-After": str(wait_sec)},
            )

    otp_code = _generate_otp()
    new_hash = _hash_otp(email, otp_code)
    new_expiry = now + datetime.timedelta(minutes=OTP_EXPIRY_MINUTES)

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "otp_hash": new_hash,
                "otp_expires_at": new_expiry,
                "otp_attempts": 0,
                "otp_last_sent_at": now,
                "updatedAt": now,
            }
        },
    )

    try:
        await send_otp_email(email, user.get("name", "User"), otp_code)
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    return {
        "status": "verification_required",
        "email": email,
        "message": "A new verification OTP has been sent to your email address.",
    }


async def login_user_controller(login_data: UserLogin, client_ip: str = "local"):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    email = login_data.email.lower().strip()
    rate_limiter.check("login_ip", client_ip, max_requests=25, window_seconds=300)
    rate_limiter.check("login_email", email, max_requests=10, window_seconds=300)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(login_data.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email with the 6-digit OTP before logging in.",
        )

    sanitized_user = sanitize_user_document(user)
    token = create_access_token({"sub": sanitized_user["email"], "role": sanitized_user.get("role", "Patient")})
    return {"access_token": token, "token_type": "bearer", "user": sanitized_user}


async def get_user_profile_controller(current_user: dict):
    return current_user


async def update_user_profile_controller(user_id: str, update_data: UserProfileUpdate, current_user: dict):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    if str(current_user.get("id")) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this profile",
        )

    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )

    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        return current_user

    if update_dict.get("emergencyContactName") and update_dict.get("emergencyContactPhone"):
        update_dict["emergencyContact"] = (
            f"{update_dict['emergencyContactName'].strip()} — {update_dict['emergencyContactPhone'].strip()}"
        )
    update_dict["updatedAt"] = _utcnow()

    await db.users.update_one({"_id": obj_id}, {"$set": update_dict})
    updated_user = await db.users.find_one({"_id": obj_id})
    sanitized_user = sanitize_user_document(updated_user)

    if any(k in update_dict for k in ("height", "weight", "age", "gender")):
        calc = compute_bmi_and_targets(
            sanitized_user.get("height"),
            sanitized_user.get("weight"),
            sanitized_user.get("age"),
            sanitized_user.get("gender"),
        )
        set_fields = {
            "weight.current": calc["weight_kg"],
            "bmi.value": calc["bmi_value"],
            "bmi.category": calc["bmi_category"],
            "calories.target": calc["target_calories"],
            "steps.target": calc["target_steps"],
            "water.target": calc["target_water"],
        }
        await db.metrics.update_one(
            {"user_email": sanitized_user["email"]},
            {"$set": set_fields},
            upsert=True,
        )

    return sanitized_user


async def social_login_user_controller(social_data: UserSocialLogin):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Social login is disabled because verified OAuth provider token verification is not configured. Please register and verify via email OTP.",
    )
