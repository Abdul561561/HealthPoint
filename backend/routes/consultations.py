from fastapi import APIRouter, Depends
from typing import List
from auth.jwt_handler import get_current_user
from models.consultation import ClinicalNoteCreate, ClinicalNoteResponse
from controllers.consultation_controller import (
    get_video_appointments,
    get_jitsi_room_config,
    save_clinical_note_controller,
    fetch_patient_notes_controller
)

router = APIRouter(prefix="/consultations", tags=["Video Consultations"])

@router.get("/appointments")
async def get_consultation_appointments(current_user: dict = Depends(get_current_user)):
    return await get_video_appointments(current_user["email"])

@router.get("/room/{appt_id}")
async def get_consultation_room(appt_id: str, current_user: dict = Depends(get_current_user)):
    return await get_jitsi_room_config(appt_id, current_user["email"])

@router.post("/notes")
async def save_consultation_note(note_data: ClinicalNoteCreate, current_user: dict = Depends(get_current_user)):
    return await save_clinical_note_controller(current_user["email"], note_data)

@router.get("/notes/{patient_email}")
async def fetch_patient_notes(patient_email: str, current_user: dict = Depends(get_current_user)):
    return await fetch_patient_notes_controller(patient_email)

@router.get("/biometrics/{patient_email}")
async def fetch_patient_biometrics(patient_email: str, current_user: dict = Depends(get_current_user)):
    from database.mongodb import get_database
    from fastapi import HTTPException
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    metrics = await db.metrics.find_one({"user_email": patient_email})
    if not metrics:
        return {
            "heartRate": { "current": 72, "unit": "bpm", "status": "normal" },
            "bloodPressure": { "systolic": 120, "diastolic": 80, "unit": "mmHg", "status": "normal" },
            "bmi": { "value": 22.8, "category": "Normal" },
            "oxygen": { "level": 98, "unit": "%", "status": "normal" },
            "weight": { "current": 72.0, "unit": "kg" }
        }
    if "_id" in metrics:
        metrics["id"] = str(metrics["_id"])
        del metrics["_id"]
    return metrics
