from fastapi import APIRouter, Query
from typing import Optional
from controllers.maps_controller import (
    get_nearby_doctors,
    get_nearby_pharmacies,
    get_place_details
)
import os
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)

router = APIRouter(prefix="/maps", tags=["Google Maps"])

@router.get("/config")
async def get_maps_config():
    """Return Google Maps API key for frontend initialization."""
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    return {"apiKey": api_key}

@router.get("/nearby-doctors")
async def nearby_doctors(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    specialty: Optional[str] = Query("All", description="Medical specialty"),
    radius: Optional[int] = Query(5000, description="Search radius in meters")
):
    """Fetch real nearby doctors/clinics from Google Places API."""
    return await get_nearby_doctors(lat, lng, specialty, radius)

@router.get("/nearby-pharmacies")
async def nearby_pharmacies(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    filter_type: Optional[str] = Query("all", description="Filter: all, open_now"),
    radius: Optional[int] = Query(5000, description="Search radius in meters")
):
    """Fetch real nearby pharmacies from Google Places API."""
    return await get_nearby_pharmacies(lat, lng, filter_type, radius)

@router.get("/place-details")
async def place_details(
    place_id: str = Query(..., description="Google Place ID")
):
    """Get detailed info about a specific Google Place."""
    return await get_place_details(place_id)
