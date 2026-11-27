from typing import Optional
from fastapi import APIRouter, Depends, Query

from auth.jwt_handler import get_current_user
from controllers.notification_controller import (
    clear_all_notifications_controller,
    clear_read_notifications_controller,
    create_notification_controller,
    create_reminder_controller,
    delete_notification_controller,
    delete_reminder_controller,
    evaluate_due_reminders,
    get_notifications_controller,
    get_reminders_controller,
    mark_all_notifications_read_controller,
    mark_notification_read_controller,
    mark_notification_unread_controller,
    update_reminder_controller,
)
from models.notification import NotificationCreate, ReminderCreate, ReminderUpdate

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
@router.get("/")
async def get_notifications(
    category: Optional[str] = Query(None),
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    return await get_notifications_controller(current_user["email"], category=category, unread_only=unread_only, limit=limit)


@router.post("")
@router.post("/")
async def create_notification(
    payload: NotificationCreate,
    current_user: dict = Depends(get_current_user),
):
    return await create_notification_controller(current_user["email"], payload, source="manual")


@router.post("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    return await mark_all_notifications_read_controller(current_user["email"])


@router.delete("/clear-read")
async def clear_read_notifications(current_user: dict = Depends(get_current_user)):
    return await clear_read_notifications_controller(current_user["email"])


@router.delete("/clear-all")
async def clear_all_notifications(current_user: dict = Depends(get_current_user)):
    return await clear_all_notifications_controller(current_user["email"])


@router.get("/reminders")
async def get_reminders(current_user: dict = Depends(get_current_user)):
    return await get_reminders_controller(current_user["email"])


@router.post("/reminders")
async def create_reminder(
    payload: ReminderCreate,
    current_user: dict = Depends(get_current_user),
):
    return await create_reminder_controller(current_user["email"], payload)


@router.put("/reminders/{reminder_id}")
async def update_reminder(
    reminder_id: str,
    payload: ReminderUpdate,
    current_user: dict = Depends(get_current_user),
):
    return await update_reminder_controller(current_user["email"], reminder_id, payload)


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await delete_reminder_controller(current_user["email"], reminder_id)


@router.post("/reminders/evaluate")
async def trigger_due_reminders(current_user: dict = Depends(get_current_user)):
    """Evaluates due scheduled reminders for the authenticated user without duplicates."""
    return await evaluate_due_reminders(user_email=current_user["email"])


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await mark_notification_read_controller(current_user["email"], notification_id)


@router.post("/{notification_id}/unread")
async def mark_notification_unread(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await mark_notification_unread_controller(current_user["email"], notification_id)


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await delete_notification_controller(current_user["email"], notification_id)
