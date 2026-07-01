from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6)
    phone: Optional[str] = None
    # Healthcare profile
    dateOfBirth: Optional[str] = None   # "YYYY-MM-DD"
    age: Optional[int] = None           # computed from DOB or supplied directly
    gender: Optional[str] = "Male"
    bloodGroup: Optional[str] = "O+"
    height: Optional[str] = None
    weight: Optional[str] = None
    # Medical info
    allergies: Optional[str] = None
    medicalConditions: Optional[str] = None
    # Emergency contact (now split)
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None
    emergencyContact: Optional[str] = None   # legacy combined field kept for compatibility
    # Legacy fields (optional now)
    address: Optional[str] = None
    insurance: Optional[str] = None
    role: Optional[str] = "Patient"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class RegisterResponse(BaseModel):
    status: str  # "verification_required" or "success"
    email: EmailStr
    message: str
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[dict] = None

class VerifyRequest(BaseModel):
    email: EmailStr
    otp: str

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    age: Optional[int] = None
    height: Optional[str] = None
    weight: Optional[str] = None
    bloodGroup: Optional[str] = None
    emergencyContact: Optional[str] = None
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None
    insurance: Optional[str] = None
    allergies: Optional[str] = None
    medicalConditions: Optional[str] = None
    dateOfBirth: Optional[str] = None
    gender: Optional[str] = None

class UserSocialLogin(BaseModel):
    email: EmailStr
    name: str
    provider: str
