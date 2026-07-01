import datetime
from fastapi import HTTPException, status
from bson import ObjectId
from backend.database.mongodb import get_database
from backend.models.consultation import ClinicalNoteCreate

async def get_video_appointments(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
    # Find all appointments for the user that are video calls
    cursor = db.appointments.find({"user_email": user_email, "type": "Video Call"})
    appts = []
    async for appt in cursor:
        appt["id"] = str(appt["_id"])
        del appt["_id"]
        appts.append(appt)
    return appts

async def get_jitsi_room_config(appt_id: str, user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
    
    try:
        obj_id = ObjectId(appt_id)
        appt = await db.appointments.find_one({"_id": obj_id})
    except Exception:
        # Fallback for custom room IDs typed directly
        appt = None

    user = await db.users.find_one({"email": user_email})
    display_name = user.get("name", "Patient") if user else "HealthPoint User"

    if appt:
        # Check user role based on name or email. If joining user matches patient email, they are patient, otherwise doctor
        is_doctor = appt.get("user_email") != user_email
        doctor_name = appt.get("doctor", "Dr. Mitchell")
        patient_name = display_name if not is_doctor else "Patient"
        
        return {
            "roomName": f"HealthPoint-Appointment-{appt_id}",
            "displayName": display_name,
            "subject": f"{appt.get('specialty', 'General')} Consultation",
            "isDoctor": is_doctor,
            "doctorName": doctor_name,
            "patientName": patient_name,
            "patientEmail": appt.get("user_email")
        }
    else:
        # Custom meeting code fallback
        return {
            "roomName": f"HealthPoint-Room-{appt_id}",
            "displayName": display_name,
            "subject": "Direct Video Consult",
            "isDoctor": False,
            "doctorName": "Consultant Doctor",
            "patientName": display_name,
            "patientEmail": user_email
        }

async def save_clinical_note_controller(doctor_email: str, note_data: ClinicalNoteCreate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    time_str = datetime.datetime.now().strftime("%I:%M %p")
    
    note_doc = {
        "appointmentId": note_data.appointmentId,
        "patientEmail": note_data.patientEmail,
        "patientName": note_data.patientName,
        "doctorName": note_data.doctorName,
        "symptoms": note_data.symptoms,
        "diagnosis": note_data.diagnosis,
        "prescription": note_data.prescription,
        "notes": note_data.notes,
        "date": date_str,
        "time": time_str
    }
    
    # Insert clinical note
    result = await db.clinical_notes.insert_one(note_doc)
    note_id = str(result.inserted_id)
    note_doc["id"] = note_id
    del note_doc["_id"]
    
    # Automatically add to Patient's medical records
    record_doc = {
        "user_email": note_data.patientEmail,
        "title": f"Consultation Summary - {note_data.doctorName}",
        "type": "Consultation Notes",
        "date": date_str,
        "doctor": note_data.doctorName,
        "hospital": "HealthPoint Virtual Care",
        "status": "normal",
        "category": "Doctor Note",
        "fileSize": "480 KB",
        "diagnosis": note_data.diagnosis,
        "prescription": note_data.prescription,
        "symptoms": note_data.symptoms,
        "clinicalNotes": note_data.notes
    }
    await db.records.insert_one(record_doc)
    
    # Optionally update appointment status to completed
    try:
        appt_obj_id = ObjectId(note_data.appointmentId)
        await db.appointments.update_one(
            {"_id": appt_obj_id},
            {"$set": {"status": "completed"}}
        )
    except Exception:
        pass
        
    return note_doc

async def fetch_patient_notes_controller(patient_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
    
    cursor = db.clinical_notes.find({"patientEmail": patient_email})
    notes = []
    async for note in cursor:
        note["id"] = str(note["_id"])
        del note["_id"]
        notes.append(note)
    
    # Sort notes by date descending
    notes.sort(key=lambda x: x.get("date", ""), reverse=True)
    return notes
