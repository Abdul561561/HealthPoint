import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from database.mongodb import get_database

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

WEAK_JWT_SECRETS = {
    "",
    "healthpoint_super_secret_key_12345!@#",
    "secret",
    "changeme",
    "default",
    "jwt_secret",
    "your_jwt_secret",
}

_EPHEMERAL_DEV_SECRET = secrets.token_urlsafe(48)

security_scheme = HTTPBearer()


def is_production_env() -> bool:
    env_val = (
        os.getenv("ENV")
        or os.getenv("ENVIRONMENT")
        or ("production" if os.getenv("RENDER") else "")
    ).strip().lower()
    return env_val in {"prod", "production"}


def is_weak_jwt_secret(secret: Optional[str]) -> bool:
    cleaned = (secret or "").strip()
    if cleaned in WEAK_JWT_SECRETS:
        return True
    if len(cleaned) < 32:
        return True
    return False


def validate_jwt_config() -> str:
    """
    Validate JWT_SECRET_KEY.
    In production, missing or weak secrets fail safely at startup.
    In non-production, weak/missing secrets fall back to a per-process CSPRNG secret
    rather than a hardcoded static string.
    """
    configured = os.getenv("JWT_SECRET_KEY", "").strip()
    if is_production_env() and is_weak_jwt_secret(configured):
        raise RuntimeError(
            "CRITICAL SECURITY ERROR: JWT_SECRET_KEY is missing or weak in production. "
            "Set a random secret of at least 32 characters."
        )
    if not is_weak_jwt_secret(configured):
        return configured
    return _EPHEMERAL_DEV_SECRET


def get_jwt_secret() -> str:
    return validate_jwt_config()


def get_otp_hmac_secret() -> bytes:
    """
    Return the server-side secret key used for keyed HMAC-SHA256 OTP hashing.
    Uses OTP_HMAC_SECRET if explicitly configured with >= 32 chars, otherwise
    derives from the validated JWT secret (never a weak static literal).
    """
    otp_secret = os.getenv("OTP_HMAC_SECRET", "").strip()
    if otp_secret and not is_weak_jwt_secret(otp_secret):
        return otp_secret.encode("utf-8")
    return get_jwt_secret().encode("utf-8")


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    plain_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    try:
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, get_jwt_secret(), algorithm=JWT_ALGORITHM)
    return encoded_jwt


def sanitize_user_document(user: dict) -> dict:
    """Strip sensitive credential and OTP fields before returning user data."""
    sanitized = dict(user)
    if "_id" in sanitized:
        sanitized["id"] = str(sanitized["_id"])
        del sanitized["_id"]
    for secret_field in (
        "password_hash",
        "verification_otp",
        "otp_hash",
        "otp_expires_at",
        "otp_attempts",
        "otp_last_sent_at",
    ):
        sanitized.pop(secret_field, None)
    return sanitized


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> dict:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable. Please try again shortly.",
        )

    try:
        user = await db.users.find_one({"email": email.lower().strip()})
        if user is None:
            raise credentials_exception

        if not user.get("is_verified", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account email is not verified. Please complete email OTP verification.",
            )

        return sanitize_user_document(user)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable.",
        )
