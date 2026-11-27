"""
HealthPoint OpenStreetMap Discovery & Geocoding Service
=======================================================
Provides configurable, cache-backed OpenStreetMap facility discovery (Overpass API)
and address/PIN-code geocoding (Nominatim) with zero Google Maps dependencies.

Guarantees:
- Uses only actual OpenStreetMap data returned by Overpass / Nominatim.
- Never invents doctor names, qualifications, ratings, phone numbers, or availability.
- Implements polite User-Agent headers, bounded TTL caching, request timeouts,
  configurable provider URLs, and honest error/empty states.
"""

import asyncio
import logging
import math
import os
import time
import urllib.parse
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

logger = logging.getLogger("healthpoint.osm_service")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)

OVERPASS_FALLBACK_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)


def get_overpass_url() -> str:
    return os.getenv("OVERPASS_API_URL", "https://overpass-api.de/api/interpreter").strip()


def get_overpass_candidates() -> List[str]:
    primary = get_overpass_url()
    candidates = [primary] if primary else []
    for fallback in OVERPASS_FALLBACK_URLS:
        if fallback not in candidates:
            candidates.append(fallback)
    return candidates


def get_nominatim_url() -> str:
    return os.getenv("NOMINATIM_API_URL", "https://nominatim.openstreetmap.org/search").strip()


def get_osm_user_agent() -> str:
    return os.getenv(
        "OSM_USER_AGENT",
        "HealthPoint-Healthcare-Platform/2.0 (https://health-point-tau.vercel.app)",
    ).strip()


_inflight_overpass: Dict[Tuple[Any, ...], asyncio.Future] = {}


SPECIALTY_FILTER_KEYWORDS: Dict[str, List[str]] = {
    "General Physician": ["general", "physician", "family", "primary", "clinic", "gp", "medicine"],
    "Cardiologist": ["cardio", "heart"],
    "Dermatologist": ["derma", "skin"],
    "Pediatrician": ["pediat", "paediat", "child", "kids"],
    "Neurologist": ["neuro", "brain", "nerve"],
    "Orthopedic Doctor": ["ortho", "bone", "joint", "fracture", "spine"],
    "Orthopedist": ["ortho", "bone", "joint", "fracture", "spine"],
    "ENT Specialist": ["ent", "ear", "nose", "throat", "otolaryng"],
    "ENT": ["ent", "ear", "nose", "throat", "otolaryng"],
    "Gynecologist": ["gyne", "gynae", "obstet", "maternity", "women"],
    "Dentist": ["dent", "tooth", "oral", "orthodon"],
    "Ophthalmologist": ["ophthalm", "eye", "vision", "retina", "optom"],
    "Psychiatrist": ["psych", "mental"],
    "Hospital": ["hospital", "medical center", "medical centre"],
    "Emergency Care": ["emergency", "trauma", "casualty", "hospital"],
    "Pharmacy": ["pharmacy", "chemist", "apothecary", "medical store"],
    "All": [],
}

CANONICAL_SPECIALTIES = {
    "general physician": "General Physician",
    "physician": "General Physician",
    "gp": "General Physician",
    "cardiologist": "Cardiologist",
    "heart specialist": "Cardiologist",
    "dermatologist": "Dermatologist",
    "skin specialist": "Dermatologist",
    "skin doctor": "Dermatologist",
    "pediatrician": "Pediatrician",
    "child specialist": "Pediatrician",
    "neurologist": "Neurologist",
    "orthopedic": "Orthopedic Doctor",
    "orthopedic doctor": "Orthopedic Doctor",
    "orthopedist": "Orthopedic Doctor",
    "ent": "ENT Specialist",
    "ent specialist": "ENT Specialist",
    "gynecologist": "Gynecologist",
    "dentist": "Dentist",
    "dental": "Dentist",
    "ophthalmologist": "Ophthalmologist",
    "eye doctor": "Ophthalmologist",
    "psychiatrist": "Psychiatrist",
    "hospital": "Hospital",
    "emergency": "Emergency Care",
    "pharmacy": "Pharmacy",
    "all": "All",
}

_CACHE_TTL_SECONDS = 600
_CACHE_MAX_ITEMS = 250
_osm_cache: OrderedDict[Tuple[Any, ...], Tuple[float, Dict[str, Any]]] = OrderedDict()


def clear_osm_cache() -> None:
    _osm_cache.clear()


def _cache_get(key: Tuple[Any, ...]) -> Optional[Dict[str, Any]]:
    item = _osm_cache.get(key)
    if not item:
        return None
    ts, value = item
    if time.monotonic() - ts > _CACHE_TTL_SECONDS:
        _osm_cache.pop(key, None)
        return None
    _osm_cache.move_to_end(key)
    return value


def _cache_set(key: Tuple[Any, ...], value: Dict[str, Any]) -> None:
    _osm_cache[key] = (time.monotonic(), value)
    _osm_cache.move_to_end(key)
    while len(_osm_cache) > _CACHE_MAX_ITEMS:
        _osm_cache.popitem(last=False)


def normalize_specialty(specialty: Optional[str]) -> str:
    if not specialty:
        return "All"
    s = specialty.strip().lower()
    if s in CANONICAL_SPECIALTIES:
        return CANONICAL_SPECIALTIES[s]
    for token, canon in CANONICAL_SPECIALTIES.items():
        if token != "all" and token in s:
            return canon
    return specialty.strip().title()


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)


def build_manual_osm_url(
    query: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location_label: Optional[str] = None,
) -> str:
    full_query = query.strip() or "hospital clinic doctor"
    if location_label:
        full_query = f"{full_query} {location_label.strip()}"
    base = f"https://www.openstreetmap.org/search?query={urllib.parse.quote_plus(full_query)}"
    if lat is not None and lng is not None:
        base += f"#map=14/{lat:.5f}/{lng:.5f}"
    return base


def build_osm_directions_url(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> str:
    return (
        "https://www.openstreetmap.org/directions"
        f"?engine=fossgis_osrm_car&route={origin_lat:.6f}%2C{origin_lng:.6f}%3B{dest_lat:.6f}%2C{dest_lng:.6f}"
    )


def _assemble_osm_address(tags: Dict[str, Any]) -> str:
    if tags.get("addr:full"):
        return str(tags["addr:full"]).strip()
    parts = []
    house = str(tags.get("addr:housenumber") or "").strip()
    street = str(tags.get("addr:street") or "").strip()
    if house or street:
        parts.append(" ".join(p for p in (house, street) if p))
    for k in ("addr:suburb", "addr:neighbourhood", "addr:city", "addr:district", "addr:state", "addr:postcode"):
        val = str(tags.get(k) or "").strip()
        if val and val not in parts:
            parts.append(val)
    return ", ".join(parts) if parts else "Address not listed in OpenStreetMap"


def _normalize_osm_element(
    el: Dict[str, Any],
    origin_lat: float,
    origin_lng: float,
) -> Optional[Dict[str, Any]]:
    plat = el.get("lat")
    plng = el.get("lon")
    if plat is None or plng is None:
        center = el.get("center") or {}
        plat = center.get("lat")
        plng = center.get("lon")
    if plat is None or plng is None:
        return None

    el_type = str(el.get("type") or "node")
    el_id = str(el.get("id") or "")
    tags = el.get("tags") or {}

    name = (tags.get("name") or tags.get("name:en") or tags.get("official_name") or "").strip()
    amenity = str(tags.get("amenity") or "").lower()
    healthcare = str(tags.get("healthcare") or "").lower()
    raw_spec = (tags.get("healthcare:speciality") or tags.get("speciality") or "").strip()

    if amenity == "hospital" or healthcare == "hospital":
        category = "Hospital"
    elif amenity == "dentist" or healthcare == "dentist":
        category = "Dental Clinic"
    elif amenity == "pharmacy" or healthcare == "pharmacy":
        category = "Pharmacy"
    elif amenity == "clinic" or healthcare == "clinic":
        category = "Clinic"
    elif amenity == "doctors" or healthcare == "doctor":
        category = "Doctor's Practice"
    else:
        category = healthcare.replace("_", " ").title() if healthcare else "Healthcare Facility"

    if not name:
        name = f"Unnamed {category} (OpenStreetMap)"

    specialty_display = (
        raw_spec.replace(";", ", ").replace("_", " ").title()
        if raw_spec
        else category
    )

    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("emergency:phone")
        or ""
    ).strip()
    website = (tags.get("website") or tags.get("contact:website") or "").strip()
    opening_hours = (tags.get("opening_hours") or "").strip()
    open_now: Optional[bool] = True if opening_hours.lower() == "24/7" else None

    plat_f = float(plat)
    plng_f = float(plng)

    return {
        "place_id": f"osm_{el_type}_{el_id}",
        "name": name,
        "specialty": specialty_display,
        "category": category,
        "address": _assemble_osm_address(tags),
        "distance_km": haversine_distance_km(origin_lat, origin_lng, plat_f, plng_f),
        "latitude": plat_f,
        "longitude": plng_f,
        "phone": phone,
        "website": website,
        "opening_hours": [opening_hours] if opening_hours else [],
        "open_now": open_now,
        "rating": None,
        "reviews": 0,
        "maps_url": f"https://www.openstreetmap.org/{el_type}/{el_id}",
        "directions_url": build_osm_directions_url(origin_lat, origin_lng, plat_f, plng_f),
        "source": "openstreetmap",
        "verified": False,
        "verification_note": "OpenStreetMap community listing; verify clinician qualifications, hours, and availability directly.",
    }


def _matches_specialty(item: Dict[str, Any], norm_spec: str) -> bool:
    if not norm_spec or norm_spec == "All":
        return True
    keywords = SPECIALTY_FILTER_KEYWORDS.get(norm_spec, [norm_spec.lower()])
    haystack = f"{item.get('name', '')} {item.get('specialty', '')} {item.get('category', '')}".lower()
    if norm_spec == "Dentist" and item.get("category") == "Dental Clinic":
        return True
    if norm_spec in ("Hospital", "Emergency Care") and item.get("category") == "Hospital":
        return True
    if norm_spec == "Pharmacy" and item.get("category") == "Pharmacy":
        return True
    return any(kw in haystack for kw in keywords)


async def geocode_location(query: str) -> Dict[str, Any]:
    """Resolve city, area, address, or PIN code via OpenStreetMap Nominatim."""
    cleaned = (query or "").strip()
    if len(cleaned) < 2:
        return {"ok": False, "provider": "nominatim", "error": "Please enter a valid city, area, or PIN code.", "results": []}

    cache_key = ("osm_geocode", cleaned.lower())
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = get_nominatim_url()
    headers = {"User-Agent": get_osm_user_agent()}
    params = {"format": "json", "q": cleaned, "limit": 5, "addressdetails": 1}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url, params=params, headers=headers)

        if res.status_code == 429:
            return {
                "ok": False,
                "provider": "nominatim",
                "error": "OpenStreetMap Nominatim rate limit reached. Please wait a moment and try again.",
                "error_code": "rate_limited",
                "results": [],
            }
        if res.status_code != 200:
            return {
                "ok": False,
                "provider": "nominatim",
                "error": f"Location lookup service returned HTTP {res.status_code}.",
                "error_code": f"http_{res.status_code}",
                "results": [],
            }

        items = res.json()
        if not isinstance(items, list) or not items:
            return {
                "ok": False,
                "provider": "nominatim",
                "error": f"No OpenStreetMap location matched '{cleaned}'.",
                "results": [],
            }

        mapped = [
            {
                "display_name": item.get("display_name", cleaned),
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
                "provider": "nominatim",
            }
            for item in items
            if item.get("lat") is not None and item.get("lon") is not None
        ]
        out = {"ok": True, "provider": "nominatim", "results": mapped}
        _cache_set(cache_key, out)
        return out
    except httpx.TimeoutException:
        return {
            "ok": False,
            "provider": "nominatim",
            "error": "Location lookup timed out. Please try again.",
            "error_code": "timeout",
            "results": [],
        }
    except Exception as exc:
        logger.warning("Nominatim geocoding failed: %s", type(exc).__name__)
        return {
            "ok": False,
            "provider": "nominatim",
            "error": "Unable to resolve that location right now.",
            "error_code": "network_error",
            "results": [],
        }


async def search_nearby_osm_facilities(
    lat: float,
    lng: float,
    specialty: str = "All",
    radius: int = 5000,
    facility_mode: str = "doctor",
    limit: int = 15,
    location_label: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search real nearby healthcare facilities via OpenStreetMap Overpass API.
    Never invents doctors, qualifications, phone numbers, ratings, or availability.
    """
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return {
            "ok": False,
            "provider": "openstreetmap",
            "error": "Invalid latitude or longitude coordinates.",
            "error_code": "invalid_coordinates",
            "manual_maps_url": build_manual_osm_url("hospital clinic doctor"),
            "results": [],
        }

    norm_spec = normalize_specialty(specialty)
    bounded_radius = max(500, min(int(radius or 5000), 25000))
    bounded_limit = max(1, min(int(limit or 15), 30))

    if facility_mode == "hospital":
        query_label = "hospital"
    elif facility_mode == "pharmacy":
        query_label = "pharmacy"
    elif norm_spec != "All":
        query_label = norm_spec
    else:
        query_label = "doctor clinic hospital"

    manual_url = build_manual_osm_url(query_label, lat=lat, lng=lng, location_label=location_label)

    cache_key = (
        "osm_overpass",
        facility_mode,
        norm_spec.lower(),
        round(lat, 3),
        round(lng, 3),
        bounded_radius,
        bounded_limit,
    )
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    if facility_mode == "hospital":
        filters = (
            f'node["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
        )
    elif facility_mode == "pharmacy":
        filters = (
            f'node["amenity"="pharmacy"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="pharmacy"](around:{bounded_radius},{lat},{lng});'
        )
    elif facility_mode == "emergency" or norm_spec == "Emergency Care":
        filters = (
            f'node["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
            f'node["emergency"="yes"](around:{bounded_radius},{lat},{lng});'
            f'way["emergency"="yes"](around:{bounded_radius},{lat},{lng});'
        )
    elif norm_spec == "Dentist":
        filters = (
            f'node["amenity"="dentist"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="dentist"](around:{bounded_radius},{lat},{lng});'
            f'node["healthcare"="dentist"](around:{bounded_radius},{lat},{lng});'
        )
    else:
        filters = (
            f'node["amenity"~"^(doctors|clinic|hospital|dentist)$"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"~"^(doctors|clinic|hospital|dentist)$"](around:{bounded_radius},{lat},{lng});'
            f'node["healthcare"~"^(doctor|clinic|hospital|centre|dentist)$"](around:{bounded_radius},{lat},{lng});'
            f'way["healthcare"~"^(doctor|clinic|hospital|centre|dentist)$"](around:{bounded_radius},{lat},{lng});'
        )

    overpass_ql = f"[out:json][timeout:15];({filters});out center 40;"

    # Deduplicate concurrent identical requests so UI reloads/filters don't overload public Overpass servers
    existing_fut = _inflight_overpass.get(cache_key)
    if existing_fut is not None and not existing_fut.done():
        return await existing_fut

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    _inflight_overpass[cache_key] = fut

    headers = {
        "User-Agent": get_osm_user_agent(),
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    last_error_code = "network_error"
    last_error_msg = "OpenStreetMap Overpass API could not be reached right now."
    retryable_statuses = {400, 403, 406, 429, 502, 503, 504}
    elements: Optional[List[Dict[str, Any]]] = None

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            for endpoint in get_overpass_candidates():
                try:
                    res = await client.post(endpoint, data={"data": overpass_ql}, headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        elements = data.get("elements") or []
                        break
                    if res.status_code == 429:
                        last_error_code = "rate_limited"
                        last_error_msg = "OpenStreetMap Overpass API rate limit reached across endpoints. Please wait briefly or search on OpenStreetMap."
                    elif res.status_code >= 500:
                        last_error_code = "provider_outage"
                        last_error_msg = f"OpenStreetMap Overpass servers are temporarily busy (HTTP {res.status_code}). Please retry in a moment."
                    else:
                        last_error_code = f"http_{res.status_code}"
                        last_error_msg = f"OpenStreetMap Overpass returned HTTP {res.status_code}."
                    if res.status_code not in retryable_statuses:
                        break
                    logger.warning("Overpass mirror %s returned HTTP %s; trying fallback.", endpoint, res.status_code)
                except httpx.TimeoutException:
                    last_error_code = "timeout"
                    last_error_msg = "OpenStreetMap Overpass query timed out across available endpoints. Try a smaller radius or retry."
                    logger.warning("Overpass mirror %s timed out; trying fallback.", endpoint)
                except Exception as exc:
                    last_error_code = "network_error"
                    last_error_msg = f"Unable to reach OpenStreetMap Overpass API ({type(exc).__name__})."
                    logger.warning("Overpass mirror %s failed (%s); trying fallback.", endpoint, type(exc).__name__)

        if elements is None:
            err_out = {
                "ok": False,
                "provider": "openstreetmap",
                "error": last_error_msg,
                "error_code": last_error_code,
                "manual_maps_url": manual_url,
                "results": [],
            }
            if not fut.done():
                fut.set_result(err_out)
            return err_out

        all_items: List[Dict[str, Any]] = []
        seen_ids = set()
        for el in elements:
            norm = _normalize_osm_element(el, lat, lng)
            if norm and norm["place_id"] not in seen_ids:
                seen_ids.add(norm["place_id"])
                all_items.append(norm)

        all_items.sort(key=lambda x: x["distance_km"])

        if facility_mode in ("doctor",) and norm_spec not in ("All", "General Physician"):
            matched = [it for it in all_items if _matches_specialty(it, norm_spec)]
            results = matched[:bounded_limit]
            untagged_notice = (
                f"No facilities explicitly tagged as '{norm_spec}' were found in OpenStreetMap within {bounded_radius // 1000} km; "
                f"{len(all_items)} general medical clinics/hospitals exist nearby."
                if not results and all_items
                else None
            )
        else:
            results = all_items[:bounded_limit]
            untagged_notice = None

        out: Dict[str, Any] = {
            "ok": True,
            "provider": "openstreetmap",
            "specialty": norm_spec,
            "facility_mode": facility_mode,
            "manual_maps_url": manual_url,
            "results": results,
            "count": len(results),
            "general_facilities_count": len(all_items),
        }
        if untagged_notice:
            out["notice"] = untagged_notice
        _cache_set(cache_key, out)
        if not fut.done():
            fut.set_result(out)
        return out
    finally:
        _inflight_overpass.pop(cache_key, None)
