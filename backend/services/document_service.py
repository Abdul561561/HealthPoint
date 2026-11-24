"""
HealthPoint Medical Document and Prescription Processing Service
================================================================
Handles secure file verification, size/type validation, PDF text extraction,
medical test metric parsing, reference range identification, and prescription
data structuring without fabricating illegible or missing content.
"""

import os
import re
import io
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
from fastapi import UploadFile, HTTPException, status
import pypdf

logger = logging.getLogger("healthpoint.document_service")

# Storage directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(os.path.join(UPLOAD_DIR, "records"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "prescriptions"), exist_ok=True)

# Allowed MIME types and extensions
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp"
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Common Laboratory Reference Ranges for validation
KNOWN_LAB_RANGES = {
    "hemoglobin": {"min": 12.0, "max": 17.5, "unit": "g/dL", "name": "Hemoglobin"},
    "wbc": {"min": 4000, "max": 11000, "unit": "/mcL", "name": "White Blood Cell Count (WBC)"},
    "rbc": {"min": 4.2, "max": 5.9, "unit": "mil/mcL", "name": "Red Blood Cell Count (RBC)"},
    "platelets": {"min": 150000, "max": 450000, "unit": "/mcL", "name": "Platelet Count"},
    "platelet count": {"min": 150000, "max": 450000, "unit": "/mcL", "name": "Platelet Count"},
    "platelet": {"min": 150000, "max": 450000, "unit": "/mcL", "name": "Platelet Count"},
    "fasting blood sugar": {"min": 70, "max": 100, "unit": "mg/dL", "name": "Fasting Blood Glucose"},
    "glucose": {"min": 70, "max": 140, "unit": "mg/dL", "name": "Blood Glucose"},
    "cholesterol": {"min": 125, "max": 200, "unit": "mg/dL", "name": "Total Cholesterol"},
    "hdl": {"min": 40, "max": 60, "unit": "mg/dL", "name": "HDL Cholesterol (Good)"},
    "ldl": {"min": 0, "max": 100, "unit": "mg/dL", "name": "LDL Cholesterol (Bad)"},
    "triglycerides": {"min": 0, "max": 150, "unit": "mg/dL", "name": "Triglycerides"},
    "creatinine": {"min": 0.6, "max": 1.2, "unit": "mg/dL", "name": "Serum Creatinine"},
    "bun": {"min": 7, "max": 20, "unit": "mg/dL", "name": "Blood Urea Nitrogen"},
    "tsh": {"min": 0.4, "max": 4.0, "unit": "mIU/L", "name": "Thyroid Stimulating Hormone (TSH)"},
    "hba1c": {"min": 4.0, "max": 5.6, "unit": "%", "name": "HbA1c Glycated Hemoglobin"},
}

def validate_file_metadata(filename: str, content_type: Optional[str], size: int) -> None:
    """Validate uploaded file extension, MIME type, and size."""
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of 10 MB (provided: {round(size / (1024*1024), 2)} MB)."
        )

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension '{ext}'. Allowed formats: PDF, PNG, JPG, JPEG, WEBP."
        )

    if content_type and content_type.lower() not in ALLOWED_MIME_TYPES:
        # If content_type is octet-stream but extension is valid, allow with warning
        if content_type != "application/octet-stream":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported media type '{content_type}'. Must be PDF or image."
            )

def save_file_locally(content: bytes, original_filename: str, folder: str = "records") -> Tuple[str, str]:
    """
    Saves file bytes locally into backend/uploads/{folder}/ safely.
    Returns: (stored_filename, absolute_path)
    """
    ext = os.path.splitext(original_filename)[1].lower()
    clean_name = re.sub(r'[^a-zA-Z0-9_\-.]', '_', os.path.splitext(original_filename)[0])
    stored_filename = f"{uuid.uuid4().hex[:12]}_{clean_name}{ext}"
    target_dir = os.path.join(UPLOAD_DIR, folder)
    os.makedirs(target_dir, exist_ok=True)
    full_path = os.path.join(target_dir, stored_filename)

    with open(full_path, "wb") as f:
        f.write(content)

    return stored_filename, full_path

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract clean text content across all pages of a PDF document."""
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages_text = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(f"--- Page {idx + 1} ---\n{text.strip()}")
        
        full_text = "\n\n".join(pages_text)
        if not full_text.strip():
            logger.info("PDF has no readable text layer (may be a scanned image).")
            return ""
        return full_text
    except Exception as e:
        logger.warning(f"Error extracting text from PDF: {e}")
        return ""

def extract_lab_markers(text: str) -> List[Dict[str, Any]]:
    """
    Scans extracted text for recognized medical biomarkers and matches them against
    known reference ranges. Does not invent missing test results.
    """
    found_markers = []
    lines = text.split("\n")

    for marker_key, ref_info in KNOWN_LAB_RANGES.items():
        pattern = re.compile(
            rf"\b{re.escape(marker_key)}\b[^\d]*?([0-9]+(?:\.[0-9]+)?)",
            re.IGNORECASE
        )
        match = pattern.search(text)
        if match:
            try:
                val = float(match.group(1))
                min_v = ref_info["min"]
                max_v = ref_info["max"]
                
                flag = "Normal"
                if val < min_v:
                    flag = "Low"
                elif val > max_v:
                    flag = "High"

                found_markers.append({
                    "test_name": ref_info["name"],
                    "measured_value": val,
                    "unit": ref_info["unit"],
                    "reference_range": f"{min_v} - {max_v} {ref_info['unit']}",
                    "status": flag
                })
            except Exception:
                continue

    return found_markers

def parse_prescription_text(text: str, filename: str = "") -> Dict[str, Any]:
    """
    Extracts structured prescription data from text. Marks uncertain items
    for manual pharmacist verification. Does NOT fabricate medications.
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    patient_name = "Not clearly identified"
    doctor_name = "Not clearly identified"
    rx_date = "Not specified"
    medicines = []
    warnings = []

    # Attempt regex pattern matches for metadata
    pat_match = re.search(r"(?:patient(?:\s*name)?|pt(?:\s*name)?):\s*([^\n\r,]+)", text, re.IGNORECASE)
    if pat_match:
        patient_name = pat_match.group(1).strip()

    doc_match = re.search(r"(?:dr\.|doctor|physician)[:\s]+([A-Za-z\s.]+?)(?:,\s*[A-Z]{2,}|[\n\r]|$)", text, re.IGNORECASE)
    if doc_match:
        doc_raw = doc_match.group(1).strip()
        doctor_name = doc_raw if doc_raw.lower().startswith("dr.") else f"Dr. {doc_raw}"

    date_match = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text)
    if date_match:
        rx_date = date_match.group(1)

    # Search for medication lines
    med_pattern = re.compile(
        r"(?:tab(?:\.|let)?|cap(?:\.|sule)?|syr(?:\.|up)?|inj(?:\.|ection)?)?\s*([A-Za-z0-9\-]+(?:\s+[A-Za-z0-9\-]+)?)\s+(\d+\s*(?:mg|ml|mcg|g))\s*(?:-\s*)?((?:once|twice|thrice|\d\s*times)\s*daily|od|bd|tds|qid|after food|before food|sos)?",
        re.IGNORECASE
    )

    for line in lines:
        if any(kw in line.lower() for kw in ["rx", "tab", "cap", "mg", "syrup", "dosage", "tablet"]):
            m = med_pattern.search(line)
            if m:
                name_cand = m.group(1).strip()
                if len(name_cand) > 2 and name_cand.lower() not in ["patient", "doctor", "date", "clinic", "hospital", "prescription", "rx"]:
                    strength = m.group(2) or "Strength not specified"
                    instructions = m.group(3) or "Take strictly as directed by pharmacist"
                    medicines.append({
                        "name": f"{name_cand} ({strength})",
                        "when_to_have": instructions,
                        "how_it_helps": "Supports recovery per prescribed therapeutic indication.",
                        "confidence": "Extracted from document"
                    })

    # If no readable medicines were found in OCR text
    if not medicines:
        warnings.append("Text is partially illegible or contains handwritten entries that could not be verified with confidence.")

    summary = (
        f"Prescription document analysis completed. Found {len(medicines)} legible medication entries. "
        "Notice: This automated summary is for patient convenience and does not replace the physical prescription or consultation with your pharmacist."
    )

    return {
        "patient_name": patient_name,
        "doctor_name": doctor_name,
        "date": rx_date,
        "vitals": {"blood_pressure": "N/A", "pulse": "N/A", "weight": "N/A"},
        "symptoms": [],
        "medicines": medicines,
        "diet_advice": ["Follow any specific dietary advice given by your prescribing physician."],
        "warnings": warnings,
        "summary": summary
    }
