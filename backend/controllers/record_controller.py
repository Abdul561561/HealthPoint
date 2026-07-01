from fastapi import HTTPException, status, UploadFile
from typing import Any
from bson import ObjectId
import os
import datetime
import cloudinary
import cloudinary.uploader
from database.mongodb import get_database

CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "")
if CLOUDINARY_URL:
    try:
        cloudinary.config(cloudinary_url=CLOUDINARY_URL)
    except Exception as e:
        print(f"Error configuring Cloudinary in records: {e}")

async def get_records_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    cursor = db.records.find({"user_email": user_email})
    records = []
    async for rec in cursor:
        rec["id"] = str(rec["_id"])
        del rec["_id"]
        records.append(rec)
        
    return records

async def create_record_controller(user_email: str, record_data: Any):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    record_doc = {
        "user_email": user_email,
        "title": record_data.title,
        "type": record_data.type,
        "date": record_data.date,
        "doctor": record_data.doctor or "Self Uploaded",
        "hospital": record_data.hospital or "Verified Scan",
        "status": record_data.status or "normal",
        "category": record_data.category,
        "fileSize": record_data.fileSize or "1.5 MB",
        "url": getattr(record_data, "url", ""),
    }
    
    result = await db.records.insert_one(record_doc)
    record_doc["id"] = str(result.inserted_id)
    del record_doc["_id"]
    return record_doc

async def upload_record_file_controller(user_email: str, file: UploadFile, title: str, category: str, date: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    try:
        file_content = await file.read()
        
        # Calculate file size label
        size_bytes = len(file_content)
        if size_bytes < 1024 * 1024:
            file_size_str = f"{round(size_bytes / 1024, 1)} KB"
        else:
            file_size_str = f"{round(size_bytes / (1024 * 1024), 1)} MB"
            
        # Cloudinary upload
        if CLOUDINARY_URL or os.getenv("CLOUDINARY_CLOUD_NAME"):
            upload_result = cloudinary.uploader.upload(file_content, folder="medical_records")
            secure_url = upload_result.get("secure_url")
        else:
            # Simulated upload fallback
            print("CLOUDINARY_URL missing for records. Using dynamic simulation fallback.")
            secure_url = f"https://res.cloudinary.com/healthpoint/image/upload/v1720000000/medical_records/mock_{ObjectId()}_{file.filename}"
            
        record_doc = {
            "user_email": user_email,
            "title": title,
            "type": "Radiology" if category.lower() == "imaging" else "Lab Report",
            "date": date,
            "doctor": "Self Uploaded",
            "hospital": "Verified Scan",
            "status": "normal",
            "category": category,
            "fileSize": file_size_str,
            "url": secure_url,
            "filename": file.filename
        }
        
        result = await db.records.insert_one(record_doc)
        record_doc["id"] = str(result.inserted_id)
        del record_doc["_id"]
        return record_doc
    except Exception as e:
        print(f"Record upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload medical record file")

async def delete_record_controller(user_email: str, record_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    try:
        obj_id = ObjectId(record_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid record ID format"
        )
        
    result = await db.records.delete_one({"_id": obj_id, "user_email": user_email})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medical record not found or unauthorized"
        )
        
    return {"success": True, "message": "Medical record deleted successfully"}
