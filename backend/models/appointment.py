from pydantic import BaseModel
from typing import Optional

class AppointmentCreate(BaseModel):
    doctorId: int
    doctorName: str
    specialty: str
    date: str # YYYY-MM-DD
    time: str # e.g. "2:30 PM"
    type: str # "In-Person" or "Video Call"
    hospital: str

class AppointmentResponse(BaseModel):
    id: str
    doctor: str
    specialty: str
    date: str
    time: str
    type: str
    status: str # "confirmed", "pending", "cancelled"
    hospital: str
