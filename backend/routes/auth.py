from fastapi import APIRouter, Depends
from backend.models.user import UserRegister, UserLogin, UserProfileUpdate, TokenResponse, UserSocialLogin, RegisterResponse, VerifyRequest
from backend.auth.jwt_handler import get_current_user
from backend.controllers.auth_controller import (
    register_user_controller,
    login_user_controller,
    get_user_profile_controller,
    update_user_profile_controller,
    social_login_user_controller,
    verify_user_controller
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=RegisterResponse)
async def register(user_data: UserRegister):
    return await register_user_controller(user_data)

@router.post("/verify", response_model=TokenResponse)
async def verify(verify_data: VerifyRequest):
    return await verify_user_controller(verify_data)

@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin):
    return await login_user_controller(login_data)

@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return await get_user_profile_controller(current_user)

@router.put("/profile")
async def update_profile(update_data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    return await update_user_profile_controller(current_user["id"], update_data, current_user)

@router.post("/social-login", response_model=TokenResponse)
async def social_login(social_data: UserSocialLogin):
    return await social_login_user_controller(social_data)
