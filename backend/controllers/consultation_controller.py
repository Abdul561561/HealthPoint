import datetime
from fastapi import HTTPException, status
from bson import ObjectId
from database.mongodb import get_database
from models.consultation import ClinicalNoteCreate


async def get_video_appointments(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )
    cursor = db.appointments.find({"user_email": user_email, "type": "Video Call"})
    appts = []
    async for appt in cursor:
        appt["id"] = str(appt["_id"])
        del appt["_id"]
        appts.append(appt)
    return appts


async def get_jitsi_room_config(appt_id: str, current_user: dict):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    user_email = current_user.get("email", "").lower().strip()
    role = (current_user.get("role") or "patient").lower().strip()
    display_name = current_user.get("name", "HealthPoint User")

    try:
        obj_id = ObjectId(appt_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment ID format")

    appt = await db.appointments.find_one({"_id": obj_id})
    if not appt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation appointment not found")

    appt_owner = (appt.get("user_email") or "").lower().strip()
    if appt_owner != user_email and role not in {"doctor", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to join another patient's consultation room",
        )

    is_doctor = role == "doctor" and appt_owner != user_email
    doctor_name = appt.get("doctor", "Assigned Doctor")
    patient_name = display_name if not is_doctor else "Patient"

    return {
        "roomName": f"HealthPoint-Appointment-{appt_id}",
        "displayName": display_name,
        "subject": f"{appt.get('specialty', 'General')} Consultation",
        "isDoctor": is_doctor,
        "doctorName": doctor_name,
        "patientName": patient_name,
        "patientEmail": appt_owner,
    }


async def save_clinical_note_controller(current_user: dict, note_data: ClinicalNoteCreate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    user_email = current_user.get("email", "").lower().strip()
    role = (current_user.get("role") or "patient").lower().strip()
    target_patient = note_data.patientEmail.lower().strip()

    if target_patient != user_email and role not in {"doctor", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to write clinical notes for another user",
        )

    if note_data.appointmentId:
        try:
            appt_obj_id = ObjectId(note_data.appointmentId)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid appointment ID format")
        appt = await db.appointments.find_one({"_id": appt_obj_id})
        if not appt:
            raise HTTPException(status_code=404, detail="Appointment not found")
        if appt.get("user_email", "").lower().strip() != target_patient:
            raise HTTPException(status_code=403, detail="Appointment does not belong to target patient")

    now = datetime.datetime.now(datetime.timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%I:%M %p")

    note_doc = {
        "appointmentId": note_data.appointmentId,
        "patientEmail": target_patient,
        "patientName": note_data.patientName,
        "doctorName": note_data.doctorName,
        "symptoms": note_data.symptoms,
        "diagnosis": note_data.diagnosis,
        "prescription": note_data.prescription,
        "notes": note_data.notes or "",
        "date": date_str,
        "time": time_str,
    }

    result = await db.clinical_notes.insert_one(note_doc)
    note_doc["id"] = str(result.inserted_id)
    del note_doc["_id"]

    record_doc = {
        "user_email": target_patient,
        "title": f"Consultation Summary - {note_data.doctorName}",
        "type": "Consultation Notes",
        "date": date_str,
        "doctor": note_data.doctorName,
        "hospital": "HealthPoint Virtual Care",
        "status": "normal",
        "category": "Doctor Note",
        "fileSize": "Generated Note",
        "diagnosis": note_data.diagnosis,
        "prescription": note_data.prescription,
        "symptoms": note_data.symptoms,
        "clinicalNotes": note_data.notes or "",
    }
    await db.records.insert_one(record_doc)

    if note_data.appointmentId:
        await db.appointments.update_one(
            {"_id": ObjectId(note_data.appointmentId), "user_email": target_patient},
            {"$set": {"status": "completed"}},
        )

    return note_doc


async def fetch_patient_notes_controller(patient_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    cursor = db.clinical_notes.find({"patientEmail": patient_email.lower().strip()})
    notes = []
    async for note in cursor:
        note["id"] = str(note["_id"])
        del note["_id"]
        notes.append(note)

    notes.sort(key=lambda x: x.get("date", ""), reverse=True)
    return notes
