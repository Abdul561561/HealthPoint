import datetime
from fastapi import HTTPException, status
from database.mongodb import get_database
from auth.jwt_handler import hash_password, verify_password
from pydantic import BaseModel
from typing import Optional


class NotificationPreferences(BaseModel):
    appointmentReminders: bool = True
    medicationAlerts: bool = True
    healthTips: bool = False
    emergencyAlerts: bool = True
    weeklyReport: bool = True
    marketingEmails: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserSettingsUpdate(BaseModel):
    notifications: Optional[NotificationPreferences] = None
    theme: Optional[str] = None
    language: Optional[str] = None
    twoFactor: Optional[bool] = None


async def get_settings_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    settings = await db.settings.find_one({"user_email": user_email})
    if settings:
        settings["id"] = str(settings["_id"])
        del settings["_id"]
        return settings

    # Return sensible defaults if no settings doc yet
    return {
        "user_email": user_email,
        "notifications": {
            "appointmentReminders": True,
            "medicationAlerts": True,
            "healthTips": False,
            "emergencyAlerts": True,
            "weeklyReport": True,
            "marketingEmails": False,
        },
        "theme": "dark",
        "language": "en",
        "twoFactor": False,
    }


async def update_settings_controller(user_email: str, settings_data: UserSettingsUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    update_dict = {}
    if settings_data.notifications is not None:
        update_dict["notifications"] = settings_data.notifications.model_dump()
    if settings_data.theme is not None:
        update_dict["theme"] = settings_data.theme
    if settings_data.language is not None:
        update_dict["language"] = settings_data.language
    if settings_data.twoFactor is not None:
        update_dict["twoFactor"] = settings_data.twoFactor

    update_dict["updatedAt"] = datetime.datetime.utcnow()

    await db.settings.update_one(
        {"user_email": user_email},
        {"$set": update_dict, "$setOnInsert": {"user_email": user_email, "createdAt": datetime.datetime.utcnow()}},
        upsert=True,
    )

    return await get_settings_controller(user_email)


async def change_password_controller(user_email: str, req: ChangePasswordRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    user = await db.users.find_one({"email": user_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.get("password_hash") and not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = hash_password(req.new_password)
    await db.users.update_one(
        {"email": user_email},
        {"$set": {"password_hash": new_hash, "updatedAt": datetime.datetime.utcnow()}},
    )

    return {"success": True, "message": "Password updated successfully"}
