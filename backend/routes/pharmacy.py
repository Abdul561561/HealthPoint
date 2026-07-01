from fastapi import APIRouter, Depends, UploadFile, File, Query
from typing import Optional
from auth.jwt_handler import get_current_user
from models.pharmacy import OrderCreate
from controllers.pharmacy_controller import (
    upload_prescription_cloudinary,
    create_pharmacy_order,
    fetch_order_history,
    list_nearby_stores,
    get_latest_prescription_controller,
    fetch_prescription_history_controller,
    delete_prescription_controller
)

router = APIRouter(prefix="/pharmacy", tags=["Pharmacy Module"])

@router.get("/prescription")
async def get_latest_prescription(current_user: dict = Depends(get_current_user)):
    return await get_latest_prescription_controller(current_user["email"])

@router.get("/prescriptions")
async def get_prescriptions(current_user: dict = Depends(get_current_user)):
    return await fetch_prescription_history_controller(current_user["email"])

@router.delete("/prescriptions/{prescription_id}")
async def delete_prescription(
    prescription_id: str,
    current_user: dict = Depends(get_current_user)
):
    return await delete_prescription_controller(current_user["email"], prescription_id)

@router.post("/prescription")
async def upload_prescription(
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
):
    return await upload_prescription_cloudinary(current_user["email"], file)

@router.post("/order")
async def place_order(
    order_data: OrderCreate,
    current_user: dict = Depends(get_current_user)
):
    return await create_pharmacy_order(current_user["email"], order_data)

@router.get("/orders")
async def get_orders(current_user: dict = Depends(get_current_user)):
    return await fetch_order_history(current_user["email"])

@router.get("/stores")
async def get_stores(lat: Optional[float] = None, lng: Optional[float] = None):
    return await list_nearby_stores(lat, lng)
