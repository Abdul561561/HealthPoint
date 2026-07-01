from fastapi import APIRouter, Depends
from typing import List, Optional
from models.doctor import DoctorResponse
from auth.jwt_handler import get_current_user
from controllers.doctor_controller import get_doctors_controller

router = APIRouter(prefix="/doctors", tags=["Doctors"])

@router.get("", response_model=List[DoctorResponse])
async def get_doctors(lat: Optional[float] = None, lng: Optional[float] = None, current_user: dict = Depends(get_current_user)):
    return await get_doctors_controller(lat, lng)
