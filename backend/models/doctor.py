from pydantic import BaseModel
from typing import List, Optional

class DoctorResponse(BaseModel):
    id: int
    name: str
    specialty: str
    hospital: str
    rating: float
    reviews: int
    experience: str
    fee: float
    available: bool
    nextAvailable: str
    verified: bool
    languages: List[str]
    education: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
