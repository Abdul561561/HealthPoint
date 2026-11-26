from fastapi import APIRouter, Depends, HTTPException, status
from auth.jwt_handler import get_current_user
from database.mongodb import get_database
from models.consultation import ClinicalNoteCreate
from controllers.consultation_controller import (
    get_video_appointments,
    get_jitsi_room_config,
    save_clinical_note_controller,
    fetch_patient_notes_controller,
)

router = APIRouter(prefix="/consultations", tags=["Video Consultations"])


def _verify_patient_access(current_user: dict, patient_email: str) -> str:
    requested = patient_email.lower().strip()
    user_email = current_user.get("email", "").lower().strip()
    role = (current_user.get("role") or "patient").lower().strip()
    if requested != user_email and role not in {"doctor", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access another patient's consultation data.",
        )
    return requested


@router.get("/appointments")
async def get_consultation_appointments(current_user: dict = Depends(get_current_user)):
    return await get_video_appointments(current_user["email"])


@router.get("/room/{appt_id}")
async def get_consultation_room(appt_id: str, current_user: dict = Depends(get_current_user)):
    return await get_jitsi_room_config(appt_id, current_user)


@router.post("/notes")
async def save_consultation_note(note_data: ClinicalNoteCreate, current_user: dict = Depends(get_current_user)):
    return await save_clinical_note_controller(current_user, note_data)


@router.get("/notes/{patient_email}")
async def fetch_patient_notes(patient_email: str, current_user: dict = Depends(get_current_user)):
    verified_email = _verify_patient_access(current_user, patient_email)
    return await fetch_patient_notes_controller(verified_email)


@router.get("/biometrics/{patient_email}")
async def fetch_patient_biometrics(patient_email: str, current_user: dict = Depends(get_current_user)):
    verified_email = _verify_patient_access(current_user, patient_email)
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    metrics = await db.metrics.find_one({"user_email": verified_email})
    if not metrics:
        return {
            "heartRate": {"current": None, "unit": "bpm", "status": "not_recorded"},
            "bloodPressure": {"systolic": None, "diastolic": None, "unit": "mmHg", "status": "not_recorded"},
            "bmi": {"value": None, "category": "Not provided"},
            "oxygen": {"level": None, "unit": "%", "status": "not_recorded"},
            "weight": {"current": None, "unit": "kg"},
        }
    metrics["id"] = str(metrics["_id"])
    del metrics["_id"]
    metrics.pop("user_email", None)
    return metrics
