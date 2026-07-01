from fastapi import APIRouter, Depends, UploadFile, File, Form
from typing import List, Optional
from backend.models.record import RecordCreate, RecordResponse
from backend.auth.jwt_handler import get_current_user
from backend.controllers.record_controller import (
    get_records_controller,
    create_record_controller,
    delete_record_controller,
    upload_record_file_controller
)

router = APIRouter(prefix="/records", tags=["Medical Records"])

@router.get("", response_model=List[RecordResponse])
async def get_records(current_user: dict = Depends(get_current_user)):
    return await get_records_controller(current_user["email"])

@router.post("", response_model=RecordResponse)
async def create_record(record_data: RecordCreate, current_user: dict = Depends(get_current_user)):
    return await create_record_controller(current_user["email"], record_data)

@router.post("/upload", response_model=RecordResponse)
async def upload_record_file(
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str = Form(...),
    date: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    return await upload_record_file_controller(current_user["email"], file, title, category, date)

@router.delete("/{record_id}")
async def delete_record(record_id: str, current_user: dict = Depends(get_current_user)):
    return await delete_record_controller(current_user["email"], record_id)
