from typing import List, Literal, Optional
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, Field, field_validator


ALLOWED_NOTIFICATION_CATEGORIES = (
    "medicine",
    "water",
    "vitals",
    "activity",
    "workout",
    "sleep",
    "records",
    "account",
    "emergency",
    "custom",
)

VALID_WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

CATEGORY_ROUTES = {
    "medicine": "/pharmacy",
    "water": "/vitals",
    "vitals": "/vitals",
    "activity": "/fitness",
    "workout": "/fitness",
    "sleep": "/vitals",
    "records": "/records",
    "account": "/profile",
    "emergency": "/emergency",
    "custom": "/notifications",
}


def _validate_category(value: str) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned in ("appointment", "appointments", "booking", "consultation"):
        raise ValueError(
            "Appointment notifications are not supported in HealthPoint. "
            "Use medicine, water, activity, workout, sleep, records, account, or emergency."
        )
    if cleaned not in ALLOWED_NOTIFICATION_CATEGORIES:
        raise ValueError(
            f"Unsupported notification category '{value}'. Allowed: {', '.join(ALLOWED_NOTIFICATION_CATEGORIES)}"
        )
    return cleaned


def _validate_timezone(tz: str) -> str:
    cleaned = (tz or "UTC").strip() or "UTC"
    if cleaned == "UTC":
        return "UTC"
    try:
        ZoneInfo(cleaned)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Invalid IANA timezone '{tz}'") from exc
    return cleaned


def _validate_time_of_day(val: str) -> str:
    cleaned = (val or "").strip()
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", cleaned):
        raise ValueError("time_of_day must use 24-hour HH:MM format (e.g., 08:30 or 21:00)")
    return cleaned


def _validate_days(days: List[str]) -> List[str]:
    if not days:
        raise ValueError("Select at least one weekday for the reminder")
    normalized = []
    for d in days:
        match = next((vd for vd in VALID_WEEKDAYS if vd.lower() == str(d).strip().lower()[:3]), None)
        if not match:
            raise ValueError(f"Invalid weekday '{d}'. Expected one of {', '.join(VALID_WEEKDAYS)}")
        if match not in normalized:
            normalized.append(match)
    return normalized


class NotificationCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    message: str = Field(..., min_length=1, max_length=500)
    category: str
    route: Optional[str] = Field(None, max_length=100)

    @field_validator("category")
    @classmethod
    def check_category(cls, v: str) -> str:
        return _validate_category(v)


class ReminderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    message: Optional[str] = Field(None, max_length=400)
    category: str
    time_of_day: str
    days: List[str] = Field(default_factory=lambda: list(VALID_WEEKDAYS))
    timezone: str = "UTC"
    enabled: bool = True

    @field_validator("category")
    @classmethod
    def check_category(cls, v: str) -> str:
        return _validate_category(v)

    @field_validator("time_of_day")
    @classmethod
    def check_time(cls, v: str) -> str:
        return _validate_time_of_day(v)

    @field_validator("days")
    @classmethod
    def check_days(cls, v: List[str]) -> List[str]:
        return _validate_days(v)

    @field_validator("timezone")
    @classmethod
    def check_tz(cls, v: str) -> str:
        return _validate_timezone(v)


class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    message: Optional[str] = Field(None, max_length=400)
    category: Optional[str] = None
    time_of_day: Optional[str] = None
    days: Optional[List[str]] = None
    timezone: Optional[str] = None
    enabled: Optional[bool] = None

    @field_validator("category")
    @classmethod
    def check_category(cls, v: Optional[str]) -> Optional[str]:
        return _validate_category(v) if v is not None else None

    @field_validator("time_of_day")
    @classmethod
    def check_time(cls, v: Optional[str]) -> Optional[str]:
        return _validate_time_of_day(v) if v is not None else None

    @field_validator("days")
    @classmethod
    def check_days(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        return _validate_days(v) if v is not None else None

    @field_validator("timezone")
    @classmethod
    def check_tz(cls, v: Optional[str]) -> Optional[str]:
        return _validate_timezone(v) if v is not None else None
