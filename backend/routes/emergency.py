from fastapi import APIRouter, Depends
from typing import List
from models.emergency import SOSCreate, SOSResponse
from auth.jwt_handler import get_current_user
from controllers.emergency_controller import (
    trigger_sos_controller,
    get_emergency_history_controller
)

router = APIRouter(prefix="/emergency", tags=["Emergency SOS Operations"])

@router.post("/sos", response_model=SOSResponse)
async def trigger_sos(sos_data: SOSCreate, current_user: dict = Depends(get_current_user)):
    return await trigger_sos_controller(current_user["email"], sos_data)

@router.get("/history", response_model=List[SOSResponse])
async def get_emergency_history(current_user: dict = Depends(get_current_user)):
    return await get_emergency_history_controller(current_user["email"])
