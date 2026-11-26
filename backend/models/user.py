from pydantic import BaseModel, EmailStr, Field
from typing import Optional


class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    phone: Optional[str] = None
    # Healthcare profile (optional; never fabricated if omitted)
    dateOfBirth: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None
    bloodGroup: Optional[str] = None
    height: Optional[str] = None
    weight: Optional[str] = None
    # Medical info
    allergies: Optional[str] = None
    medicalConditions: Optional[str] = None
    # Emergency contact
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None
    emergencyContact: Optional[str] = None
    address: Optional[str] = None
    insurance: Optional[str] = None
    role: Optional[str] = "Patient"


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class RegisterResponse(BaseModel):
    status: str  # "verification_required"
    email: EmailStr
    message: str


class VerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyResponse(BaseModel):
    status: str
    email: EmailStr
    message: str


class ResendOtpRequest(BaseModel):
    email: EmailStr


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    phone: Optional[str] = None
    address: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0, le=130)
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
