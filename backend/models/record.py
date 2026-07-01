from pydantic import BaseModel
from typing import Optional

class RecordCreate(BaseModel):
    title: str
    type: str # "Lab Report", "Radiology", "Cardiology Report", etc.
    date: str # YYYY-MM-DD
    doctor: str
    hospital: str
    status: str # "normal", "follow-up", "abnormal"
    category: str # "Blood Test", "Imaging", "Cardiology", etc.
    fileSize: str # e.g. "1.2 MB"
    url: Optional[str] = None

class RecordResponse(BaseModel):
    id: str
    title: str
    type: str
    date: str
    doctor: str
    hospital: str
    status: str
    category: str
    fileSize: str
    url: Optional[str] = None
