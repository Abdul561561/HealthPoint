"""
HealthPoint OpenStreetMap Controller
====================================
Delegates geolocation search, Nominatim geocoding, and Overpass healthcare
facility discovery to `services/osm_service.py`.
"""

from typing import Any, Dict, Optional
from services.osm_service import (
    get_nominatim_url,
    get_overpass_url,
    geocode_location,
    search_nearby_osm_facilities,
)


async def get_maps_config_controller() -> Dict[str, Any]:
    return {
        "configured": True,
        "provider": "openstreetmap",
        "geocoder": "nominatim",
        "overpass_url_configured": bool(get_overpass_url()),
        "nominatim_url_configured": bool(get_nominatim_url()),
    }


async def geocode_location_controller(query: str) -> Dict[str, Any]:
    return await geocode_location(query)


async def get_nearby_doctors(
    lat: float,
    lng: float,
    specialty: str = "All",
    radius: int = 5000,
    location_label: Optional[str] = None,
) -> Dict[str, Any]:
    return await search_nearby_osm_facilities(
        lat=lat,
        lng=lng,
        specialty=specialty or "All",
        radius=radius or 5000,
        facility_mode="doctor",
        limit=20,
        location_label=location_label,
    )


async def get_nearby_hospitals(
    lat: float,
    lng: float,
    radius: int = 8000,
    location_label: Optional[str] = None,
) -> Dict[str, Any]:
    return await search_nearby_osm_facilities(
        lat=lat,
        lng=lng,
        specialty="Hospital",
        radius=radius or 8000,
        facility_mode="hospital",
        limit=20,
        location_label=location_label,
    )


async def get_nearby_pharmacies(
    lat: float,
    lng: float,
    filter_type: str = "all",
    radius: int = 5000,
    location_label: Optional[str] = None,
) -> Dict[str, Any]:
    res = await search_nearby_osm_facilities(
        lat=lat,
        lng=lng,
        specialty="Pharmacy",
        radius=radius or 5000,
        facility_mode="pharmacy",
        limit=25,
        location_label=location_label,
    )
    if not res.get("ok"):
        return res

    raw_results = list(res.get("results") or [])
    res["total_before_filter"] = len(raw_results)
    if filter_type == "open_now":
        filtered = [p for p in raw_results if p.get("open_now") is True]
        res["results"] = filtered
        res["count"] = len(filtered)
        if not filtered and raw_results:
            notice = (
                f"No pharmacies in OpenStreetMap explicitly list 'opening_hours=24/7' within {int(radius or 5000) // 1000} km; "
                f"{len(raw_results)} nearby pharmacies are available with 'All' selected."
            )
            res["notice"] = notice
            warnings = list(res.get("warnings") or [])
            warnings.append(notice)
            res["warnings"] = warnings
    return res
