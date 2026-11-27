import datetime
import logging
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from bson import ObjectId
from fastapi import HTTPException

from database.mongodb import get_database
from models.notification import (
    ALLOWED_NOTIFICATION_CATEGORIES,
    CATEGORY_ROUTES,
    NotificationCreate,
    ReminderCreate,
    ReminderUpdate,
)

logger = logging.getLogger("healthpoint.notifications")

WEEKDAY_ABBR = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _serialize_notification(doc: Dict[str, Any]) -> Dict[str, Any]:
    raw_cat = str(doc.get("category") or doc.get("type") or "account").lower()
    if raw_cat not in ALLOWED_NOTIFICATION_CATEGORIES:
        raw_cat = "account"
    created_at = doc.get("created_at") or doc.get("date") or datetime.datetime.now(datetime.timezone.utc).isoformat()
    route = doc.get("route") or CATEGORY_ROUTES.get(raw_cat, "/dashboard")
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", "HealthPoint Notification"),
        "message": doc.get("message", ""),
        "category": raw_cat,
        "route": route,
        "read": bool(doc.get("read", False)),
        "source": doc.get("source", "system"),
        "reminder_id": doc.get("reminder_id"),
        "created_at": created_at,
    }


def _serialize_reminder(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "message": doc.get("message") or f"Time for your scheduled {doc.get('category', 'health')} check-in.",
        "category": doc.get("category", "medicine"),
        "time_of_day": doc.get("time_of_day", "09:00"),
        "days": doc.get("days", list(WEEKDAY_ABBR)),
        "timezone": doc.get("timezone", "UTC"),
        "enabled": bool(doc.get("enabled", True)),
        "route": CATEGORY_ROUTES.get(doc.get("category", "medicine"), "/dashboard"),
        "last_triggered_key": doc.get("last_triggered_key"),
        "last_triggered_at": doc.get("last_triggered_at"),
        "created_at": doc.get("created_at"),
    }


async def get_notifications_controller(
    user_email: str,
    category: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        return []

    query: Dict[str, Any] = {"user_email": user_email}
    if category and category.lower() != "all":
        cat = category.lower()
        query["$or"] = [{"category": cat}, {"type": cat}]
    if unread_only:
        query["read"] = False

    cursor = db.notifications.find(query).sort([("_id", -1)]).limit(max(1, min(limit, 100)))
    items: List[Dict[str, Any]] = []
    async for doc in cursor:
        items.append(_serialize_notification(doc))
    return items


async def create_notification_controller(
    user_email: str,
    payload: NotificationCreate,
    source: str = "user",
    reminder_id: Optional[str] = None,
) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    route = payload.route or CATEGORY_ROUTES.get(payload.category, "/dashboard")
    doc = {
        "user_email": user_email,
        "title": payload.title.strip(),
        "message": payload.message.strip(),
        "category": payload.category,
        "route": route,
        "read": False,
        "source": source,
        "reminder_id": reminder_id,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    res = await db.notifications.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_notification(doc)


async def mark_notification_read_controller(user_email: str, notification_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        return {"success": False}
    try:
        obj_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")
    res = await db.notifications.update_one(
        {"_id": obj_id, "user_email": user_email},
        {"$set": {"read": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


async def mark_notification_unread_controller(user_email: str, notification_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        return {"success": False}
    try:
        obj_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")
    res = await db.notifications.update_one(
        {"_id": obj_id, "user_email": user_email},
        {"$set": {"read": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


async def mark_all_notifications_read_controller(user_email: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        return {"success": False}
    await db.notifications.update_many(
        {"user_email": user_email, "read": False},
        {"$set": {"read": True}},
    )
    return {"success": True}


async def clear_read_notifications_controller(user_email: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    await db.notifications.delete_many({"user_email": user_email, "read": True})
    return {"success": True}


async def delete_notification_controller(user_email: str, notification_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        obj_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")
    res = await db.notifications.delete_one({"_id": obj_id, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


async def clear_all_notifications_controller(user_email: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    await db.notifications.delete_many({"user_email": user_email})
    return {"success": True}


async def get_reminders_controller(user_email: str) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    items: List[Dict[str, Any]] = []
    async for doc in db.reminders.find({"user_email": user_email}).sort("_id", -1):
        items.append(_serialize_reminder(doc))
    return items


async def create_reminder_controller(user_email: str, payload: ReminderCreate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    doc = {
        "user_email": user_email,
        "title": payload.title.strip(),
        "message": (payload.message or "").strip() or f"Reminder: {payload.title.strip()}",
        "category": payload.category,
        "time_of_day": payload.time_of_day,
        "days": payload.days,
        "timezone": payload.timezone,
        "enabled": payload.enabled,
        "last_triggered_key": None,
        "last_triggered_at": None,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    res = await db.reminders.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_reminder(doc)


async def update_reminder_controller(user_email: str, reminder_id: str, payload: ReminderUpdate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID format")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if "message" in updates:
        updates["message"] = updates["message"].strip()

    if not updates:
        existing = await db.reminders.find_one({"_id": oid, "user_email": user_email})
        if not existing:
            raise HTTPException(status_code=404, detail="Reminder not found")
        return _serialize_reminder(existing)

    res = await db.reminders.update_one({"_id": oid, "user_email": user_email}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    updated = await db.reminders.find_one({"_id": oid, "user_email": user_email})
    return _serialize_reminder(updated)


async def delete_reminder_controller(user_email: str, reminder_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(reminder_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reminder ID format")
    res = await db.reminders.delete_one({"_id": oid, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"success": True}


def _now_in_timezone(now_utc: datetime.datetime, tz_name: str) -> datetime.datetime:
    try:
        tz = ZoneInfo(tz_name or "UTC")
    except ZoneInfoNotFoundError:
        tz = datetime.timezone.utc
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=datetime.timezone.utc)
    return now_utc.astimezone(tz)


async def evaluate_due_reminders(
    user_email: Optional[str] = None,
    now_utc: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    """
    Evaluate enabled reminders and create one notification per due schedule window.
    Atomic `last_triggered_key` update prevents duplicate firing within the same minute.
    """
    db = get_database()
    if db is None:
        return {"evaluated": 0, "triggered": 0}

    ref_utc = now_utc or datetime.datetime.now(datetime.timezone.utc)
    query: Dict[str, Any] = {"enabled": True}
    if user_email:
        query["user_email"] = user_email

    evaluated = 0
    triggered = 0
    async for reminder in db.reminders.find(query):
        evaluated += 1
        cat = str(reminder.get("category", "")).lower()
        if cat not in ALLOWED_NOTIFICATION_CATEGORIES:
            continue

        local_now = _now_in_timezone(ref_utc, reminder.get("timezone", "UTC"))
        day_abbr = WEEKDAY_ABBR[local_now.weekday()]
        if day_abbr not in (reminder.get("days") or []):
            continue

        hhmm = local_now.strftime("%H:%M")
        if hhmm != reminder.get("time_of_day"):
            continue

        trigger_key = local_now.strftime("%Y-%m-%d %H:%M")
        # Atomic guard so concurrent workers/polls cannot trigger the same reminder twice
        claim = await db.reminders.update_one(
            {"_id": reminder["_id"], "last_triggered_key": {"$ne": trigger_key}},
            {
                "$set": {
                    "last_triggered_key": trigger_key,
                    "last_triggered_at": ref_utc.isoformat(),
                }
            },
        )
        if claim.modified_count == 0:
            continue

        notif_doc = {
            "user_email": reminder["user_email"],
            "title": reminder.get("title", "Scheduled Health Reminder"),
            "message": reminder.get("message") or f"Scheduled reminder for {cat}.",
            "category": cat,
            "route": CATEGORY_ROUTES.get(cat, "/dashboard"),
            "read": False,
            "source": "scheduler",
            "reminder_id": str(reminder["_id"]),
            "created_at": ref_utc.isoformat(),
        }
        await db.notifications.insert_one(notif_doc)
        triggered += 1

    return {"evaluated": evaluated, "triggered": triggered}
