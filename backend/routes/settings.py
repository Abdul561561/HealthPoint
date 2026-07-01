from fastapi import APIRouter, Depends
from backend.auth.jwt_handler import get_current_user
from backend.controllers.settings_controller import (
    get_settings_controller,
    update_settings_controller,
    change_password_controller,
    UserSettingsUpdate,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/settings", tags=["User Settings"])


@router.get("/")
async def get_settings(current_user: dict = Depends(get_current_user)):
    return await get_settings_controller(current_user["email"])


@router.put("/")
async def update_settings(
    settings_data: UserSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    return await update_settings_controller(current_user["email"], settings_data)


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    return await change_password_controller(current_user["email"], req)
