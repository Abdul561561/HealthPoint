from fastapi import APIRouter, Depends
from auth.jwt_handler import get_current_user
from database.mongodb import get_database
from bson import ObjectId
import datetime

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("/")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is None:
        return []
    cursor = db.notifications.find({"user_email": current_user["email"]}).sort("created_at", -1).limit(20)
    notifications = []
    async for n in cursor:
        n["id"] = str(n["_id"])
        del n["_id"]
        notifications.append(n)
    return notifications

@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        return {"success": False}
    try:
        obj_id = ObjectId(notification_id)
        await db.notifications.update_one(
            {"_id": obj_id, "user_email": current_user["email"]},
            {"$set": {"read": True}}
        )
        return {"success": True}
    except Exception:
        return {"success": False}

@router.post("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    db = get_database()
    if db is None:
        return {"success": False}
    await db.notifications.update_many(
        {"user_email": current_user["email"], "read": False},
        {"$set": {"read": True}}
    )
    return {"success": True}
