import re
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

DELIVERY_STATUS = Literal["Pending", "Sent", "Delivered", "Failed", "Manual Fallback Required"]


def normalize_and_validate_phone(raw_phone: str) -> str:
    """
    Validate Indian (+91 / 10-digit starting 6-9) and E.164 international phone numbers.
    Strips whitespace, hyphens, and parentheses while preserving leading '+'.
    """
    raw = (raw_phone or "").strip()
    if not raw:
        raise ValueError("Phone number is required.")

    cleaned = re.sub(r"[\s\-().]", "", raw)
    # 10-digit Indian mobile number without country code -> normalize to +91
    if re.fullmatch(r"[6-9]\d{9}", cleaned):
        return f"+91{cleaned}"
    # Explicit +91XXXXXXXXXX Indian format
    if re.fullmatch(r"\+91[6-9]\d{9}", cleaned):
        return cleaned
    # General E.164 international format (+ followed by 7 to 15 digits, first non-zero)
    if re.fullmatch(r"\+[1-9]\d{6,14}", cleaned):
        return cleaned
    # Fallback domestic numeric (7-15 digits) allowed cleanly if non-empty digits
    if re.fullmatch(r"\d{7,15}", cleaned):
        return cleaned

    raise ValueError(
        "Enter a valid 10-digit Indian mobile number (e.g. 9876543210 or +919876543210) or E.164 international number."
    )


def normalize_and_validate_optional_email(raw_email: Optional[str]) -> Optional[str]:
    if raw_email is None:
        return None
    cleaned = raw_email.strip()
    if not cleaned:
        return None
    if not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", cleaned):
        raise ValueError("Enter a valid email address for the emergency contact.")
    return cleaned


class EmergencyContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    relation: str = Field(..., min_length=1, max_length=60)
    phone: str = Field(..., min_length=7, max_length=25)
    email: Optional[str] = Field(None, max_length=160)
    priority: int = Field(1, ge=1, le=20)
    is_primary: bool = False

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return normalize_and_validate_phone(v)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: Optional[str]) -> Optional[str]:
        return normalize_and_validate_optional_email(v)


class EmergencyContactUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    relation: Optional[str] = Field(None, min_length=1, max_length=60)
    phone: Optional[str] = Field(None, min_length=7, max_length=25)
    email: Optional[str] = Field(None, max_length=160)
    priority: Optional[int] = Field(None, ge=1, le=20)
    is_primary: Optional[bool] = None

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: Optional[str]) -> Optional[str]:
        return normalize_and_validate_phone(v) if v is not None else None

    @field_validator("email")
    @classmethod
    def check_email(cls, v: Optional[str]) -> Optional[str]:
        return normalize_and_validate_optional_email(v)


class EmergencyContactModel(BaseModel):
    id: Optional[str] = None
    name: str
    relation: str
    phone: str
    email: Optional[str] = None
    priority: int = 1
    is_primary: bool = False


class ContactDeliveryRecord(BaseModel):
    contact_id: Optional[str] = None
    name: str
    relation: str
    phone: str
    email: Optional[str] = None
    sms_status: str = "Pending"
    sms_provider: str = "none"
    provider_message_id: Optional[str] = None
    sms_detail: Optional[str] = None
    sms_composer_url: Optional[str] = None
    email_status: Optional[str] = None
    email_detail: Optional[str] = None
    updated_at: Optional[str] = None


class SOSCreate(BaseModel):
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    accuracy_meters: Optional[float] = Field(None, ge=0.0, le=100000.0)
    location_source: Literal["gps", "manual", "unavailable"] = "gps"
    location_label: Optional[str] = Field(None, max_length=220)
    captured_at: Optional[str] = None
    contacts: List[EmergencyContactModel] = Field(default_factory=list)
    idempotency_key: Optional[str] = Field(None, max_length=80)
    send_email_fallback: bool = True
    notes: Optional[str] = Field(None, max_length=400)


class SOSCancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=250)


class SMSWebhookPayload(BaseModel):
    event_id: str
    contact_phone: Optional[str] = None
    provider_message_id: Optional[str] = None
    status: Literal["Pending", "Sent", "Delivered", "Failed"]
    detail: Optional[str] = None


class SOSResponse(BaseModel):
    id: str
    user_email: str
    user_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_meters: Optional[float] = None
    location_source: str = "gps"
    location_label: Optional[str] = None
    location_sharing_active: bool = True
    captured_at: Optional[str] = None
    maps_url: Optional[str] = None
    osm_url: Optional[str] = None
    alert_message: str = ""
    contacts: List[EmergencyContactModel]
    delivery_results: List[ContactDeliveryRecord] = Field(default_factory=list)
    date: str
    created_at: str
    status: str
    cancelled_at: Optional[str] = None
    cancel_reason: Optional[str] = None
    extra_metadata: Optional[Dict[str, Any]] = None
