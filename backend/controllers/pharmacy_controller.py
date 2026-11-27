import httpx
import random
import os
import json
import datetime
import mimetypes
from fastapi import UploadFile, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse
from bson import ObjectId
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from database.mongodb import get_database
from models.pharmacy import OrderCreate
from services.llm_service import get_llm_service
from services.document_service import (
    extract_text_from_pdf,
    parse_prescription_text,
    save_file_locally,
    validate_file_metadata,
    resolve_safe_upload_path,
)

# Load .env
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)
else:
    load_dotenv()

# Configure Cloudinary if environment variable is present
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "")
if CLOUDINARY_URL:
    try:
        cloudinary.config(cloudinary_url=CLOUDINARY_URL)
    except Exception as e:
        print(f"Error configuring Cloudinary: {e}")

# High-fidelity fallback medicines catalog
FALLBACK_MEDICINES = [
    { "name": "Amoxicillin 500mg", "brand": "Amoxil", "genericName": "Amoxicillin", "dosage": "500mg", "form": "Capsule", "price": 12.99, "category": "Antibiotic", "inStock": True, "requiresPrescription": True, "purpose": "Bacterial infections", "manufacturer": "GSK" },
    { "name": "Paracetamol 650mg", "brand": "Dolo 650", "genericName": "Acetaminophen", "dosage": "650mg", "form": "Tablet", "price": 4.50, "category": "Pain Relief", "inStock": True, "requiresPrescription": False, "purpose": "Fever and mild to moderate pain", "manufacturer": "Micro Labs" },
    { "name": "Cetirizine 10mg", "brand": "Zyrtec", "genericName": "Cetirizine Hydrochloride", "dosage": "10mg", "form": "Tablet", "price": 8.75, "category": "Antihistamine", "inStock": True, "requiresPrescription": False, "purpose": "Allergies, runny nose, and hives", "manufacturer": "J&J" },
    { "name": "Ibuprofen 400mg", "brand": "Advil", "genericName": "Ibuprofen", "dosage": "400mg", "form": "Tablet", "price": 9.20, "category": "Pain Relief", "inStock": True, "requiresPrescription": False, "purpose": "Inflammation, fever, and acute pain", "manufacturer": "Pfizer" },
    { "name": "Metformin 500mg", "brand": "Glucophage", "genericName": "Metformin HCl", "dosage": "500mg", "form": "Tablet", "price": 6.80, "category": "Diabetes", "inStock": True, "requiresPrescription": True, "purpose": "Type 2 diabetes blood sugar management", "manufacturer": "Merck" },
    { "name": "Atorvastatin 20mg", "brand": "Lipitor", "genericName": "Atorvastatin Calcium", "dosage": "20mg", "form": "Tablet", "price": 18.50, "category": "Cardiovascular", "inStock": True, "requiresPrescription": True, "purpose": "Cholesterol reduction and cardiac risk prevention", "manufacturer": "Pfizer" },
    { "name": "Omeprazole 20mg", "brand": "Prilosec", "genericName": "Omeprazole", "dosage": "20mg", "form": "Capsule", "price": 11.40, "category": "Gastrointestinal", "inStock": True, "requiresPrescription": False, "purpose": "Acid reflux, GERD, and stomach ulcers", "manufacturer": "AstraZeneca" },
    { "name": "Azithromycin 500mg", "brand": "Zithromax", "genericName": "Azithromycin", "dosage": "500mg", "form": "Tablet", "price": 15.00, "category": "Antibiotic", "inStock": True, "requiresPrescription": True, "purpose": "Respiratory, skin, and ear bacterial infections", "manufacturer": "Pfizer" },
    { "name": "Amlodipine 5mg", "brand": "Norvasc", "genericName": "Amlodipine Besylate", "dosage": "5mg", "form": "Tablet", "price": 7.30, "category": "Cardiovascular", "inStock": True, "requiresPrescription": True, "purpose": "High blood pressure and angina", "manufacturer": "Pfizer" },
    { "name": "Pantoprazole 40mg", "brand": "Protonix", "genericName": "Pantoprazole Sodium", "dosage": "40mg", "form": "Tablet", "price": 10.50, "category": "Gastrointestinal", "inStock": True, "requiresPrescription": True, "purpose": "Erosive esophagitis and stomach acid control", "manufacturer": "Wyeth" },
    { "name": "Montelukast 10mg", "brand": "Singulair", "genericName": "Montelukast Sodium", "dosage": "10mg", "form": "Tablet", "price": 14.20, "category": "Respiratory", "inStock": True, "requiresPrescription": True, "purpose": "Asthma prophylaxis and allergic rhinitis", "manufacturer": "Organon" },
    { "name": "Metoprolol 50mg", "brand": "Lopressor", "genericName": "Metoprolol Tartrate", "dosage": "50mg", "form": "Tablet", "price": 8.90, "category": "Cardiovascular", "inStock": True, "requiresPrescription": True, "purpose": "Hypertension, angina, and heart failure", "manufacturer": "Novartis" }
]

async def search_medicines_fda(query: str = ""):
    query_str = query.strip().lower()
    if not query_str:
        return FALLBACK_MEDICINES

    fda_url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{query_str}+openfda.generic_name:{query_str}&limit=8"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(fda_url)
            if res.status_code == 200:
                results = res.json().get("results", [])
                mapped = []
                for item in results:
                    openfda = item.get("openfda", {})
                    b_name = openfda.get("brand_name", [""])[0]
                    g_name = openfda.get("generic_name", [""])[0]
                    sub_name = openfda.get("substance_name", [""])[0]
                    p_type = openfda.get("product_type", ["Prescription"])[0]
                    purpose = item.get("purpose", item.get("indications_and_usage", ["General clinical therapy"]))[0]
                    
                    if b_name or g_name:
                        name_display = b_name if b_name else g_name
                        mapped.append({
                            "name": name_display.title(),
                            "brand": b_name.title() if b_name else name_display.title(),
                            "genericName": g_name.title() if g_name else sub_name.title(),
                            "dosage": "As Directed",
                            "form": "Tablet / Capsule",
                            "price": round(random.uniform(5.0, 30.0), 2),
                            "category": "FDA Registered Drug",
                            "inStock": True,
                            "requiresPrescription": "prescription" in p_type.lower(),
                            "purpose": purpose[:100] + "..." if len(purpose) > 100 else purpose,
                            "manufacturer": openfda.get("manufacturer_name", ["Verified Manufacturer"])[0]
                        })
                if mapped:
                    return mapped
    except Exception as e:
        print(f"OpenFDA API Request error: {e}. Using local catalogue...")
        
    matched = [
        p for p in FALLBACK_MEDICINES 
        if query_str in p["name"].lower() or query_str in p["brand"].lower() or query_str in p["genericName"].lower()
    ]
    return matched if matched else FALLBACK_MEDICINES

async def analyze_prescription_image(image_bytes: bytes, mime_type: str, filename: str = ""):
    extracted_text = ""
    if image_bytes[:4] == b"%PDF":
        extracted_text = extract_text_from_pdf(image_bytes)

    system_instruction = (
        "You are an expert clinical pharmacist AI. Analyze the uploaded medical prescription. "
        "Extract patient name (if legible), prescribing doctor or clinic (if legible), date, vitals, symptoms, "
        "and a structured list of prescribed medicines with strengths, dosage instructions, and therapeutic indications. "
        "Do NOT invent or guess handwritten names or dosages. If any entry is unclear, mark it as uncertain. "
        "Return valid JSON only matching the schema."
    )
    
    prompt = """
    Provide response in JSON format matching this exact structure:
    {
      "patient_name": "Patient's name (or 'Not clearly legible')",
      "doctor_name": "Doctor's name or Clinic name (or 'Not clearly legible')",
      "date": "Date of prescription (or 'Not specified')",
      "symptoms": ["Symptom 1", "Symptom 2"],
      "vitals": {
        "blood_pressure": "Blood pressure reading (or 'N/A')",
        "pulse": "Pulse rate reading (or 'N/A')",
        "weight": "Weight reading (or 'N/A')"
      },
      "medicines": [
        {
          "name": "Medicine Name (composition/strength if visible)",
          "when_to_have": "Exact timing instructions (e.g., 1 tablet twice daily after food)",
          "how_it_helps": "Clinical indication/how it helps recovery"
        }
      ],
      "diet_advice": ["Diet advice 1", "Hydration/lifestyle tip"],
      "summary": "Brief 2-3 sentence clinical summary. Notice: Informational only, not a valid legal prescription."
    }
    """
    if extracted_text:
        prompt += f"\nExtracted Document Text:\n{extracted_text[:2000]}"

    m_type = mime_type if mime_type else "image/png"
    if image_bytes[:4] == b"%PDF":
        m_type = "application/pdf"
    elif image_bytes[:3] == b"\xff\xd8\xff":
        m_type = "image/jpeg"
    elif image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        m_type = "image/png"
    elif image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        m_type = "image/webp"

    try:
        print("[PharmacyController] Attempting prescription analysis via Google Gemini LLM Service...")
        llm = get_llm_service()
        text = await llm.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instruction,
            image_bytes=image_bytes if (image_bytes and not extracted_text) else None,
            image_mime=m_type if (image_bytes and not extracted_text) else None,
            response_json=True,
            request_mode="multimodal" if (image_bytes and not extracted_text) else "structured",
        )
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            text = "\n".join(lines).strip()
        analysis_data = json.loads(text)
        print("[PharmacyController] Successfully analyzed prescription via Google Gemini LLM Service.")
        return analysis_data
    except Exception as model_err:
        print(f"[PharmacyController] Gemini LLM prescription analysis unavailable ({type(model_err).__name__}). Running local parser.")
        return parse_prescription_text(extracted_text, filename=filename)

def _sanitize_prescription(pres: dict) -> dict:
    doc = dict(pres)
    pres_id = str(doc.pop("_id", doc.get("id", "")))
    doc["id"] = pres_id
    has_local = bool(doc.get("stored_filename") or doc.get("local_path"))
    doc.pop("local_path", None)
    doc.pop("stored_filename", None)
    if has_local or (doc.get("url") or "").startswith("/api/uploads/"):
        doc["url"] = f"/api/pharmacy/prescriptions/{pres_id}/download"
    return doc


async def upload_prescription_cloudinary(user_email: str, file: UploadFile):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    try:
        file_content = await file.read()
        
        # Validate file size, type, and magic bytes
        validate_file_metadata(file.filename, file.content_type, len(file_content), content=file_content)
        
        # Save file locally
        stored_filename, local_path = save_file_locally(file_content, file.filename, folder="prescriptions")
        
        # Analyze prescription
        analysis_data = await analyze_prescription_image(file_content, file.content_type, file.filename)
        
        external_url = None
        if CLOUDINARY_URL or os.getenv("CLOUDINARY_CLOUD_NAME"):
            upload_result = cloudinary.uploader.upload(file_content, folder="prescriptions")
            external_url = upload_result.get("secure_url")
            
        prescription_doc = {
            "user_email": user_email,
            "filename": os.path.basename(file.filename),
            "stored_filename": stored_filename,
            "local_path": local_path,
            "url": external_url,
            "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
            "status": "verified",
            "analysis": analysis_data
        }
        result = await db.prescriptions.insert_one(prescription_doc)
        pres_id = str(result.inserted_id)
        if not external_url:
            download_url = f"/api/pharmacy/prescriptions/{pres_id}/download"
            await db.prescriptions.update_one(
                {"_id": result.inserted_id},
                {"$set": {"url": download_url}}
            )
            prescription_doc["url"] = download_url

        return {
            "id": pres_id,
            "url": prescription_doc["url"],
            "filename": prescription_doc["filename"],
            "status": "verified",
            "analysis": analysis_data
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Prescription upload error: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Failed to upload and analyze prescription")

async def create_pharmacy_order(user_email: str, order_data: OrderCreate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    order_doc = {
        "user_email": user_email,
        "items": [item.model_dump() for item in order_data.items],
        "totalPrice": order_data.totalPrice,
        "shippingAddress": order_data.shippingAddress,
        "paymentMethod": order_data.paymentMethod,
        "prescriptionUrl": order_data.prescriptionUrl,
        "status": "Processing",
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    
    result = await db.orders.insert_one(order_doc)
    order_doc["id"] = str(result.inserted_id)
    del order_doc["_id"]
    return order_doc

async def fetch_order_history(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    cursor = db.orders.find({"user_email": user_email})
    orders = []
    async for order in cursor:
        order["id"] = str(order["_id"])
        del order["_id"]
        orders.append(order)
        
    orders.sort(key=lambda x: x.get("date", ""), reverse=True)
    return orders

async def list_nearby_stores(lat: float = None, lng: float = None):
    if lat is None or lng is None:
        return []
    from services.osm_service import search_nearby_osm_facilities
    res = await search_nearby_osm_facilities(
        lat=lat,
        lng=lng,
        specialty="Pharmacy",
        radius=5000,
        facility_mode="pharmacy",
        limit=15,
    )
    stores = []
    for item in res.get("results") or []:
        stores.append({
            "place_id": item["place_id"],
            "name": item["name"],
            "address": item["address"],
            "distance": f"{item['distance_km']} km",
            "distance_km": item["distance_km"],
            "phone": item.get("phone", ""),
            "hours": item["opening_hours"][0] if item.get("opening_hours") else "Hours not listed in OpenStreetMap",
            "latitude": item["latitude"],
            "longitude": item["longitude"],
            "maps_url": item["maps_url"],
            "directions_url": item["directions_url"],
        })
    return stores

async def get_latest_prescription_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    
    prescription = await db.prescriptions.find_one(
        {"user_email": user_email},
        sort=[("date", -1), ("_id", -1)]
    )
    if not prescription:
        return None
        
    return _sanitize_prescription(prescription)


async def fetch_prescription_history_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    cursor = db.prescriptions.find({"user_email": user_email})
    prescriptions = []
    async for prescription in cursor:
        prescriptions.append(_sanitize_prescription(prescription))
        
    prescriptions.sort(key=lambda x: x.get("date", ""), reverse=True)
    return prescriptions


async def download_prescription_file_controller(user_email: str, prescription_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        obj_id = ObjectId(prescription_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid prescription ID format")

    prescription = await db.prescriptions.find_one({"_id": obj_id})
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    if prescription.get("user_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to access this prescription")

    stored_filename = prescription.get("stored_filename")
    local_path = prescription.get("local_path")
    if stored_filename or local_path:
        safe_path = resolve_safe_upload_path("prescriptions", stored_filename=stored_filename, local_path=local_path)
        download_name = os.path.basename(prescription.get("filename") or os.path.basename(safe_path))
        media_type, _ = mimetypes.guess_type(download_name)
        return FileResponse(
            path=safe_path,
            filename=download_name,
            media_type=media_type or "application/octet-stream",
        )

    ext_url = prescription.get("url") or ""
    if ext_url.startswith("https://"):
        return RedirectResponse(url=ext_url)

    raise HTTPException(status_code=404, detail="No file attached to this prescription")


async def delete_prescription_controller(user_email: str, prescription_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    try:
        obj_id = ObjectId(prescription_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid prescription ID format")
        
    prescription = await db.prescriptions.find_one({"_id": obj_id})
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")
        
    if prescription.get("user_email") != user_email:
        raise HTTPException(status_code=403, detail="Not authorized to delete this prescription")

    try:
        if prescription.get("stored_filename") or prescription.get("local_path"):
            safe_path = resolve_safe_upload_path(
                "prescriptions",
                stored_filename=prescription.get("stored_filename"),
                local_path=prescription.get("local_path"),
            )
            os.remove(safe_path)
    except Exception:
        pass

    result = await db.prescriptions.delete_one({"_id": obj_id, "user_email": user_email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Failed to delete prescription")
        
    return {"success": True, "message": "Prescription deleted successfully"}
