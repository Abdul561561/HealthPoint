from pydantic import BaseModel
from typing import Optional, List

class EmergencyContactModel(BaseModel):
    name: str
    relation: str
    phone: str

class SOSCreate(BaseModel):
    latitude: float
    longitude: float
    contacts: List[EmergencyContactModel]

class SOSResponse(BaseModel):
    id: str
    user_email: str
    latitude: float
    longitude: float
    contacts: List[EmergencyContactModel]
    date: str
    status: str # "active", "resolved"
