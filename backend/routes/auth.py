from fastapi import APIRouter, Depends, Request
from models.user import (
    UserRegister,
    UserLogin,
    UserProfileUpdate,
    TokenResponse,
    UserSocialLogin,
    RegisterResponse,
    VerifyRequest,
    VerifyResponse,
    ResendOtpRequest,
)
from auth.jwt_handler import get_current_user
from services.email_service import get_smtp_diagnostic
from controllers.auth_controller import (
    register_user_controller,
    login_user_controller,
    get_user_profile_controller,
    update_user_profile_controller,
    social_login_user_controller,
    verify_user_controller,
    resend_otp_controller,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=RegisterResponse)
async def register(user_data: UserRegister, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    return await register_user_controller(user_data, client_ip=client_ip)


@router.post("/verify", response_model=VerifyResponse)
async def verify(verify_data: VerifyRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    return await verify_user_controller(verify_data, client_ip=client_ip)


@router.post("/resend-otp", response_model=RegisterResponse)
async def resend_otp(resend_data: ResendOtpRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    return await resend_otp_controller(resend_data.email, client_ip=client_ip)


@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    return await login_user_controller(login_data, client_ip=client_ip)


@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return await get_user_profile_controller(current_user)


@router.put("/profile")
async def update_profile(update_data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    return await update_user_profile_controller(current_user["id"], update_data, current_user)


@router.post("/social-login", response_model=TokenResponse)
async def social_login(social_data: UserSocialLogin):
    return await social_login_user_controller(social_data)


@router.get("/smtp-status")
async def smtp_status():
    """Safe diagnostic endpoint reporting SMTP readiness without exposing credentials."""
    return get_smtp_diagnostic()
