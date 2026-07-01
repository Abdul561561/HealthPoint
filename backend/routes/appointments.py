from fastapi import APIRouter, Depends
from typing import List
from backend.models.appointment import AppointmentCreate, AppointmentResponse
from backend.auth.jwt_handler import get_current_user
from backend.controllers.appointment_controller import (
    get_appointments_controller,
    create_appointment_controller,
    cancel_appointment_controller
)

router = APIRouter(prefix="/appointments", tags=["Appointments"])

@router.get("", response_model=List[AppointmentResponse])
async def get_appointments(current_user: dict = Depends(get_current_user)):
    return await get_appointments_controller(current_user["email"])

@router.post("", response_model=AppointmentResponse)
async def create_appointment(appt_data: AppointmentCreate, current_user: dict = Depends(get_current_user)):
    return await create_appointment_controller(current_user["email"], appt_data)

@router.post("/{appt_id}/cancel")
async def cancel_appointment(appt_id: str, current_user: dict = Depends(get_current_user)):
    return await cancel_appointment_controller(current_user["email"], appt_id)
