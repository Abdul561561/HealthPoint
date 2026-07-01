from pydantic import BaseModel
from typing import Optional

class ClinicalNoteCreate(BaseModel):
    appointmentId: str
    patientEmail: str
    patientName: str
    doctorName: str
    symptoms: str
    diagnosis: str
    prescription: str
    notes: Optional[str] = ""

class ClinicalNoteResponse(BaseModel):
    id: str
    appointmentId: str
    patientEmail: str
    patientName: str
    doctorName: str
    symptoms: str
    diagnosis: str
    prescription: str
    notes: str
    date: str
