from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class UploadedDocSchema(BaseModel):
    file_url: str
    file_name: str
    file_type: str

class ClaimCreate(BaseModel):
    date: str
    amount: float
    description: str
    uploaded_documents: Optional[List[UploadedDocSchema]] = []

class ClaimResponse(BaseModel):
    id: str
    date: str
    amount: float
    description: str
    status: str
    uploaded_documents: Optional[List[UploadedDocSchema]] = []
    ai_analysis: Optional[Dict[str, Any]] = None
    timeline: Optional[List[Dict[str, Any]]] = []

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class PlanResponse(BaseModel):
    id: str
    name: str
    provider: str
    type: str
    coverage_amount: float
    premium_range: str
    waiting_period: str
    cashless_support: bool
    benefits: List[str]
    exclusions: List[str]

class FavoriteHospitalRequest(BaseModel):
    hospital_id: str
    name: str
    address: str
    rating: float
    distance: str
    phone: str
    ambulancePhone: str
    latitude: float
    longitude: float

