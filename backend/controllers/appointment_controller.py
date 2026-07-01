from fastapi import HTTPException, status
from bson import ObjectId
import datetime
from backend.database.mongodb import get_database
from backend.models.appointment import AppointmentCreate

async def get_appointments_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    cursor = db.appointments.find({"user_email": user_email})
    appointments = []
    async for appt in cursor:
        appt["id"] = str(appt["_id"])
        del appt["_id"]
        appointments.append(appt)
        
    return appointments

async def create_appointment_controller(user_email: str, appt_data: AppointmentCreate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    appt_doc = {
        "user_email": user_email,
        "doctor": appt_data.doctorName,
        "specialty": appt_data.specialty,
        "date": appt_data.date,
        "time": appt_data.time,
        "type": appt_data.type,
        "status": "confirmed",
        "hospital": appt_data.hospital,
        "notes": getattr(appt_data, 'notes', ''),
        "createdAt": datetime.datetime.utcnow(),
        "updatedAt": datetime.datetime.utcnow(),
    }
    
    result = await db.appointments.insert_one(appt_doc)
    appt_doc["id"] = str(result.inserted_id)
    del appt_doc["_id"]
    return appt_doc

async def cancel_appointment_controller(user_email: str, appt_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    try:
        obj_id = ObjectId(appt_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid appointment ID format"
        )
        
    result = await db.appointments.update_one(
        {"_id": obj_id, "user_email": user_email},
        {"$set": {"status": "cancelled"}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found or unauthorized"
        )
        
    return {"success": True, "message": "Appointment cancelled successfully"}
