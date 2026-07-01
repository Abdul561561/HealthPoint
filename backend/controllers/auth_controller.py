import re
import datetime
from fastapi import HTTPException, status
from bson import ObjectId
from database.mongodb import get_database
from auth.jwt_handler import hash_password, verify_password, create_access_token
from models.user import UserRegister, UserLogin, UserProfileUpdate, UserSocialLogin, VerifyRequest
import random

def parse_height_to_cm(height_str: str) -> float:
    if not height_str:
        return 175.0
    height_str = height_str.lower().strip()
    
    # Check feet/inches e.g. 5'10", 5ft 10in, 5' 10
    ft_in_match = re.search(r"(\d+)\s*(?:'|ft|feet)\s*(\d+)?\s*(?:\"|in|inches)?", height_str)
    if ft_in_match:
        feet = int(ft_in_match.group(1))
        inches = int(ft_in_match.group(2)) if ft_in_match.group(2) else 0
        total_inches = feet * 12 + inches
        return total_inches * 2.54
        
    nums = re.findall(r"\d+\.?\d*", height_str)
    if nums:
        val = float(nums[0])
        if val < 3.0:  # Assumed in meters (e.g. 1.78)
            return val * 100.0
        return val
    return 175.0

def parse_weight_to_kg(weight_str: str) -> float:
    if not weight_str:
        return 70.0
    weight_str = weight_str.lower().strip()
    nums = re.findall(r"\d+\.?\d*", weight_str)
    if not nums:
        return 70.0
    val = float(nums[0])
    if "lb" in weight_str:
        return val * 0.453592
    return val

async def register_user_controller(user_data: UserRegister):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        if existing_user.get("is_verified", True):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered"
            )
        else:
            # Delete the unverified user so they can register again
            await db.users.delete_one({"email": user_data.email})
        
    # Generate 6-digit OTP
    otp_code = str(random.randint(100000, 999999))
    
    # Resolve combined emergency contact (legacy compat)
    emergency_combined = user_data.emergencyContact or ""
    if user_data.emergencyContactName and user_data.emergencyContactPhone:
        emergency_combined = f"{user_data.emergencyContactName} — {user_data.emergencyContactPhone}"

    # Hash password & create user document
    password_hash = hash_password(user_data.password)
    now = datetime.datetime.utcnow()
    user_doc = {
        "name": user_data.name,
        "email": user_data.email,
        "password_hash": password_hash,
        "phone": user_data.phone or "",
        "dateOfBirth": user_data.dateOfBirth or "",
        "age": user_data.age or 25,
        "gender": user_data.gender or "Male",
        "bloodGroup": user_data.bloodGroup or "O+",
        "height": user_data.height or "",
        "weight": user_data.weight or "",
        "allergies": user_data.allergies or "",
        "medicalConditions": user_data.medicalConditions or "",
        "emergencyContactName": user_data.emergencyContactName or "",
        "emergencyContactPhone": user_data.emergencyContactPhone or "",
        "emergencyContact": emergency_combined,
        "address": user_data.address or "",
        "insurance": user_data.insurance or "None",
        "role": user_data.role or "Patient",
        "memberSince": now.strftime("%Y-%m-%d"),
        "createdAt": now,
        "updatedAt": now,
        "is_verified": False,
        "verification_otp": otp_code,
    }
    
    result = await db.users.insert_one(user_doc)
    
    # Print the OTP in console clearly
    print("\n" + "="*50)
    print(f"  [HEALTHPOINT SIGNUP OTP VERIFICATION]")
    print(f"  USER EMAIL: {user_data.email}")
    print(f"  OTP CODE  : {otp_code}")
    print("="*50 + "\n")
    
    return {
        "status": "verification_required",
        "email": user_data.email,
        "message": "Verification OTP has been generated and printed to backend console."
    }


async def verify_user_controller(verify_data: VerifyRequest):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    user = await db.users.find_one({"email": verify_data.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found"
        )
        
    if user.get("is_verified", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified"
        )
        
    if user.get("verification_otp") != verify_data.otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code"
        )
        
    # Mark as verified and remove OTP
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_verified": True}, "$unset": {"verification_otp": ""}}
    )
    
    # Update local dictionary for response
    user["is_verified"] = True
    if "verification_otp" in user:
        del user["verification_otp"]
    
    # Parse metrics
    height_cm = parse_height_to_cm(user.get("height", "175 cm"))
    height_m = height_cm / 100.0
    weight_kg = parse_weight_to_kg(user.get("weight", "70 kg"))
    
    if height_m > 0:
        bmi = weight_kg / (height_m ** 2)
    else:
        bmi = 22.0
        
    if bmi < 18.5:
        bmi_cat = "Underweight"
    elif bmi < 25.0:
        bmi_cat = "Normal"
    elif bmi < 30.0:
        bmi_cat = "Overweight"
    else:
        bmi_cat = "Obese"
        
    # Mifflin-St Jeor Equation
    gender = user.get("gender", "Male")
    age = user.get("age", 25)
    if gender.lower() == "male":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    elif gender.lower() == "female":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 80
        
    target_calories = int(bmr * 1.25)
    
    if age > 55 or bmi >= 30.0:
        target_steps = 8000
    else:
        target_steps = 10000
        
    target_water = max(8, min(12, int(weight_kg * 0.12)))
    
    # Initialize health metrics for the new user
    initial_metrics = {
        "user_email": user["email"],
        "heartRate": { "current": 0, "min": 60, "max": 100, "unit": "bpm", "status": "normal" },
        "bloodPressure": { "systolic": 0, "diastolic": 0, "unit": "mmHg", "status": "normal" },
        "sleep": { "hours": 0.0, "quality": "N/A", "target": 8, "unit": "hrs" },
        "calories": { "burned": 0, "intake": 0, "target": target_calories, "unit": "kcal" },
        "steps": { "count": 0, "target": target_steps, "unit": "steps" },
        "water": { "intake": 0, "target": target_water, "unit": "glasses" },
        "weight": { "current": round(weight_kg, 1), "previous": round(weight_kg, 1), "unit": "kg" },
        "bmi": { "value": round(bmi, 1), "category": bmi_cat },
        "oxygen": { "level": 0, "unit": "%", "status": "normal" },
        "temperature": { "value": 0.0, "unit": "°F", "status": "normal" },
    }
    await db.metrics.insert_one(initial_metrics)
    
    # Initialize default settings document
    now = datetime.datetime.utcnow()
    initial_settings = {
        "user_email": user["email"],
        "notifications": {
            "appointmentReminders": True,
            "medicationAlerts": True,
            "healthTips": False,
            "emergencyAlerts": True,
            "weeklyReport": True,
            "marketingEmails": False
        },
        "theme": "dark",
        "language": "en",
        "twoFactor": False,
        "createdAt": now,
        "updatedAt": now
    }
    await db.settings.insert_one(initial_settings)
    
    # User starts with clean slate of workouts and medical records (no dummy seed data)

    
    user["id"] = str(user["_id"])
    del user["_id"]
    if "password_hash" in user:
        del user["password_hash"]
        
    # Generate token
    token = create_access_token({"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer", "user": user}

async def login_user_controller(login_data: UserLogin):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    user = await db.users.find_one({"email": login_data.email})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
        
    if not user.get("is_verified", True):
        # Generate new OTP, update user record and print to console
        otp_code = str(random.randint(100000, 999999))
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"verification_otp": otp_code}})
        
        print("\n" + "="*50)
        print(f"  [HEALTHPOINT LOGIN OTP VERIFICATION]")
        print(f"  USER EMAIL: {login_data.email}")
        print(f"  OTP CODE  : {otp_code}")
        print("="*50 + "\n")
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "verification_required",
                "email": login_data.email,
                "message": "Please verify your email first. A new OTP has been printed in console logs."
            }
        )
        
    user["id"] = str(user["_id"])
    del user["_id"]
    del user["password_hash"]
    if "verification_otp" in user:
        del user["verification_otp"]
    
    token = create_access_token({"sub": login_data.email})
    return {"access_token": token, "token_type": "bearer", "user": user}

async def get_user_profile_controller(current_user: dict):
    return current_user

async def update_user_profile_controller(user_id: str, update_data: UserProfileUpdate, current_user: dict):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    # Convert string ID to ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
        
    # Prepare update fields
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        return current_user
        
    await db.users.update_one({"_id": obj_id}, {"$set": update_dict})
    
    # Retrieve updated user
    updated_user = await db.users.find_one({"_id": obj_id})
    updated_user["id"] = str(updated_user["_id"])
    del updated_user["_id"]
    if "password_hash" in updated_user:
        del updated_user["password_hash"]
        
    # If height or weight updated, also recalculate and update metrics
    if "height" in update_dict or "weight" in update_dict or "age" in update_dict or "gender" in update_dict:
        height_str = updated_user.get("height", "175 cm")
        weight_str = updated_user.get("weight", "70 kg")
        age = int(updated_user.get("age", 25))
        gender = updated_user.get("gender", "Male")
        
        height_cm = parse_height_to_cm(height_str)
        height_m = height_cm / 100.0
        weight_kg = parse_weight_to_kg(weight_str)
        
        if height_m > 0:
            bmi = weight_kg / (height_m ** 2)
        else:
            bmi = 22.0
            
        if bmi < 18.5:
            bmi_cat = "Underweight"
        elif bmi < 25.0:
            bmi_cat = "Normal"
        elif bmi < 30.0:
            bmi_cat = "Overweight"
        else:
            bmi_cat = "Obese"
            
        # Mifflin-St Jeor Equation
        if gender.lower() == "male":
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
        elif gender.lower() == "female":
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
        else:
            bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 80
            
        target_calories = int(bmr * 1.25)
        
        if age > 55 or bmi >= 30.0:
            target_steps = 8000
        else:
            target_steps = 10000
            
        target_water = max(8, min(12, int(weight_kg * 0.12)))
        
        # Update metrics doc
        await db.metrics.update_one(
            {"user_email": updated_user["email"]},
            {"$set": {
                "weight.current": round(weight_kg, 1),
                "bmi.value": round(bmi, 1),
                "bmi.category": bmi_cat,
                "calories.target": target_calories,
                "steps.target": target_steps,
                "water.target": target_water
            }}
        )
        
    return updated_user

async def social_login_user_controller(social_data: UserSocialLogin):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    user = await db.users.find_one({"email": social_data.email})
    if not user:
        # Register user on-the-fly
        user_doc = {
            "name": social_data.name,
            "email": social_data.email,
            "password_hash": "", 
            "age": 28,
            "gender": "Male",
            "bloodGroup": "O+",
            "height": "175 cm",
            "weight": "70 kg",
            "phone": "",
            "address": "123 Health Ave, San Francisco, CA 94105",
            "emergencyContact": "Sarah Johnson — +1 (555) 987-6543",
            "insurance": "BlueCross BlueShield",
            "role": "Patient",
            "memberSince": datetime.datetime.now().strftime("%Y-%m-%d"),
            "provider": social_data.provider
        }
        result = await db.users.insert_one(user_doc)
        user_doc["id"] = str(result.inserted_id)
        del user_doc["_id"]
        if "password_hash" in user_doc:
            del user_doc["password_hash"]
            
        # Initialize default metrics, workouts, records
        initial_metrics = {
            "user_email": social_data.email,
            "heartRate": { "current": 72, "min": 60, "max": 100, "unit": "bpm", "status": "normal" },
            "bloodPressure": { "systolic": 120, "diastolic": 80, "unit": "mmHg", "status": "normal" },
            "sleep": { "hours": 7.5, "quality": "Good", "target": 8, "unit": "hrs" },
            "calories": { "burned": 1840, "intake": 2000, "target": 2200, "unit": "kcal" },
            "steps": { "count": 8420, "target": 10000, "unit": "steps" },
            "water": { "intake": 6, "target": 8, "unit": "glasses" },
            "weight": { "current": 70.0, "previous": 71.0, "unit": "kg" },
            "bmi": { "value": 22.9, "category": "Normal" },
            "oxygen": { "level": 98, "unit": "%", "status": "normal" },
            "temperature": { "value": 98.4, "unit": "°F", "status": "normal" },
        }
        await db.metrics.insert_one(initial_metrics)
        
        initial_workouts = [
            { "user_email": social_data.email, "name": "Morning Run", "type": "Cardio", "duration": 35, "calories": 320, "completed": True, "date": "2026-06-06" },
            { "user_email": social_data.email, "name": "Upper Body Strength", "type": "Strength", "duration": 45, "calories": 280, "completed": True, "date": "2026-06-05" },
            { "user_email": social_data.email, "name": "Yoga & Stretch", "type": "Flexibility", "duration": 30, "calories": 120, "completed": False, "date": "2026-06-06" }
        ]
        await db.workouts.insert_many(initial_workouts)
        
        initial_records = [
            {
                "user_email": social_data.email,
                "title": "Complete Blood Count (CBC)",
                "type": "Lab Report",
                "date": "2026-05-15",
                "doctor": "Dr. Sarah Mitchell",
                "hospital": "City Heart Center",
                "status": "normal",
                "category": "Blood Test",
                "fileSize": "1.2 MB"
            },
            {
                "user_email": social_data.email,
                "title": "Chest X-Ray",
                "type": "Radiology",
                "date": "2026-04-20",
                "doctor": "Dr. James Chen",
                "hospital": "NeuroHealth Institute",
                "status": "normal",
                "category": "Imaging",
                "fileSize": "3.8 MB"
            }
        ]
        await db.records.insert_many(initial_records)
        user = user_doc
    else:
        user["id"] = str(user["_id"])
        del user["_id"]
        if "password_hash" in user:
            del user["password_hash"]
            
    token = create_access_token({"sub": social_data.email})
    return {"access_token": token, "token_type": "bearer", "user": user}
