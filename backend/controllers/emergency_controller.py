from fastapi import HTTPException, status
from bson import ObjectId
import datetime
from database.mongodb import get_database
from models.emergency import SOSCreate

async def trigger_sos_controller(user_email: str, sos_data: SOSCreate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    sos_doc = {
        "user_email": user_email,
        "latitude": sos_data.latitude,
        "longitude": sos_data.longitude,
        "contacts": [c.model_dump() for c in sos_data.contacts],
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": "active"
    }
    
    # Save SOS incident in emergencies collection
    result = await db.emergencies.insert_one(sos_doc)
    sos_doc["id"] = str(result.inserted_id)
    del sos_doc["_id"]
    
    # Insert a real-time notification
    notification_doc = {
        "user_email": user_email,
        "title": "Emergency SOS Broadcast Active",
        "message": f"Emergency distress alert triggered at Lat: {sos_data.latitude:.4f}, Lng: {sos_data.longitude:.4f}. Help is being dispatched.",
        "type": "emergency",
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "read": False
    }
    await db.notifications.insert_one(notification_doc)
    
    return sos_doc

async def get_emergency_history_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    cursor = db.emergencies.find({"user_email": user_email})
    history = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        history.append(doc)
        
    # Sort by date descending
    history.sort(key=lambda x: x.get("date", ""), reverse=True)
    return history
