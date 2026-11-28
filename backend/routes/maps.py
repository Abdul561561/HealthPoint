from typing import Optional
from fastapi import APIRouter, Depends, Query
from auth.jwt_handler import get_current_user
from controllers.maps_controller import (
    geocode_location_controller,
    get_maps_config_controller,
    get_nearby_doctors,
    get_nearby_hospitals,
    get_nearby_pharmacies,
)

router = APIRouter(prefix="/maps", tags=["OpenStreetMap Discovery"])


@router.get("/config")
async def get_maps_config(current_user: dict = Depends(get_current_user)):
    """Return active OpenStreetMap discovery provider status."""
    return await get_maps_config_controller()


@router.get("/geocode")
async def geocode(
    q: str = Query(..., min_length=2, description="City, neighborhood, address, or PIN code"),
    current_user: dict = Depends(get_current_user),
):
    """Resolve city, locality, address, or PIN code via OpenStreetMap Nominatim."""
    return await geocode_location_controller(q)


@router.get("/nearby-doctors")
async def nearby_doctors(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    specialty: Optional[str] = Query("All", description="Medical specialty or facility type"),
    radius: Optional[int] = Query(5000, description="Search radius in meters"),
    location_label: Optional[str] = Query(None, description="Optional resolved location label"),
    current_user: dict = Depends(get_current_user),
):
    return await get_nearby_doctors(lat, lng, specialty or "All", radius or 5000, location_label=location_label)


@router.get("/nearby-hospitals")
async def nearby_hospitals(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: Optional[int] = Query(8000, description="Search radius in meters"),
    location_label: Optional[str] = Query(None, description="Optional resolved location label"),
    current_user: dict = Depends(get_current_user),
):
    return await get_nearby_hospitals(lat, lng, radius or 8000, location_label=location_label)


@router.get("/nearby-pharmacies")
async def nearby_pharmacies(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    filter_type: Optional[str] = Query("all", description="Filter: all, open_now"),
    radius: Optional[int] = Query(5000, description="Search radius in meters"),
    location_label: Optional[str] = Query(None, description="Optional resolved location label"),
    current_user: dict = Depends(get_current_user),
):
    return await get_nearby_pharmacies(lat, lng, filter_type or "all", radius or 5000, location_label=location_label)
