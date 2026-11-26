from fastapi import HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from typing import Any
from bson import ObjectId
import os
import mimetypes
import cloudinary
import cloudinary.uploader
from database.mongodb import get_database
from services.document_service import (
    validate_file_metadata,
    save_file_locally,
    extract_text_from_pdf,
    resolve_safe_upload_path,
)
from services.rag_service import get_rag_service

CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "")
if CLOUDINARY_URL:
    try:
        cloudinary.config(cloudinary_url=CLOUDINARY_URL)
    except Exception as e:
        print(f"Error configuring Cloudinary in records: {e}")


def _sanitize_record(rec: dict) -> dict:
    doc = dict(rec)
    rec_id = str(doc.pop("_id", doc.get("id", "")))
    doc["id"] = rec_id
    has_local_file = bool(doc.get("stored_filename") or doc.get("local_path"))
    doc.pop("local_path", None)
    doc.pop("stored_filename", None)
    if has_local_file:
        doc["url"] = f"/api/records/{rec_id}/download"
    elif (doc.get("url") or "").startswith("/api/uploads/"):
        doc["url"] = f"/api/records/{rec_id}/download"
    return doc


async def get_records_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    cursor = db.records.find({"user_email": user_email})
    records = []
    async for rec in cursor:
        records.append(_sanitize_record(rec))
    return records


async def create_record_controller(user_email: str, record_data: Any):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    raw_url = getattr(record_data, "url", None) or ""
    if raw_url.startswith("/api/uploads/"):
        raw_url = ""

    record_doc = {
        "user_email": user_email,
        "title": record_data.title,
        "type": record_data.type,
        "date": record_data.date,
        "doctor": record_data.doctor or "Not provided",
        "hospital": record_data.hospital or "Not provided",
        "status": record_data.status or "normal",
        "category": record_data.category,
        "fileSize": record_data.fileSize or "Not provided",
        "url": raw_url or None,
    }

    result = await db.records.insert_one(record_doc)
    record_doc["_id"] = result.inserted_id
    return _sanitize_record(record_doc)


async def upload_record_file_controller(user_email: str, file: Any, title: str, category: str, date: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        file_content = await file.read()

        # 1. Validate file size, extension, MIME type, and magic bytes
        validate_file_metadata(file.filename, file.content_type, len(file_content), content=file_content)

        # 2. Save file locally inside protected upload dir
        stored_filename, local_path = save_file_locally(file_content, file.filename, folder="records")

        # 3. Calculate file size label
        size_bytes = len(file_content)
        if size_bytes < 1024 * 1024:
            file_size_str = f"{round(size_bytes / 1024, 1)} KB"
        else:
            file_size_str = f"{round(size_bytes / (1024 * 1024), 1)} MB"

        external_url = None
        if CLOUDINARY_URL or os.getenv("CLOUDINARY_CLOUD_NAME"):
            upload_result = cloudinary.uploader.upload(file_content, folder="medical_records")
            external_url = upload_result.get("secure_url")

        record_doc = {
            "user_email": user_email,
            "title": title,
            "type": "Radiology" if category.lower() == "imaging" else "Lab Report",
            "date": date,
            "doctor": "Self Uploaded",
            "hospital": "Personal Upload",
            "status": "normal",
            "category": category,
            "fileSize": file_size_str,
            "url": external_url,
            "filename": os.path.basename(file.filename),
            "stored_filename": stored_filename,
            "local_path": local_path,
        }

        if file_content[:4] == b"%PDF":
            pdf_text = extract_text_from_pdf(file_content)
            if pdf_text:
                get_rag_service().add_user_document(user_email, title, pdf_text, source="Medical Record")
                record_doc["extracted_text"] = pdf_text[:3000]

        result = await db.records.insert_one(record_doc)
        rec_id = str(result.inserted_id)
        if not external_url:
            await db.records.update_one(
                {"_id": result.inserted_id},
                {"$set": {"url": f"/api/records/{rec_id}/download"}},
            )
            record_doc["url"] = f"/api/records/{rec_id}/download"

        record_doc["_id"] = result.inserted_id
        return _sanitize_record(record_doc)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Record upload error: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Failed to upload medical record file")


async def download_record_file_controller(user_email: str, record_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        obj_id = ObjectId(record_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid record ID format")

    rec = await db.records.find_one({"_id": obj_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Medical record not found")

    if rec.get("user_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to access this medical record")

    stored_filename = rec.get("stored_filename")
    local_path = rec.get("local_path")
    if stored_filename or local_path:
        safe_path = resolve_safe_upload_path("records", stored_filename=stored_filename, local_path=local_path)
        download_name = os.path.basename(rec.get("filename") or os.path.basename(safe_path))
        media_type, _ = mimetypes.guess_type(download_name)
        return FileResponse(
            path=safe_path,
            filename=download_name,
            media_type=media_type or "application/octet-stream",
        )

    ext_url = rec.get("url") or ""
    if ext_url.startswith("https://"):
        return RedirectResponse(url=ext_url)

    raise HTTPException(status_code=404, detail="No downloadable file attached to this record")


async def delete_record_controller(user_email: str, record_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        obj_id = ObjectId(record_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid record ID format",
        )

    rec = await db.records.find_one({"_id": obj_id, "user_email": user_email})
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Medical record not found or unauthorized",
        )

    try:
        if rec.get("stored_filename") or rec.get("local_path"):
            safe_path = resolve_safe_upload_path(
                "records",
                stored_filename=rec.get("stored_filename"),
                local_path=rec.get("local_path"),
            )
            os.remove(safe_path)
    except HTTPException:
        pass
    except Exception:
        pass

    await db.records.delete_one({"_id": obj_id, "user_email": user_email})
    return {"success": True, "message": "Medical record deleted successfully"}
