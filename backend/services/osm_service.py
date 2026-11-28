"""
HealthPoint OpenStreetMap Discovery & Geocoding Service
=======================================================
Provides configurable, cache-backed OpenStreetMap facility discovery (Overpass API)
and address/PIN-code geocoding (Nominatim) with zero Google Maps dependencies.

Guarantees:
- Uses only actual OpenStreetMap data returned by Overpass / Nominatim.
- Never invents doctor names, qualifications, ratings, phone numbers, or availability.
- Implements polite User-Agent headers, bounded TTL caching, in-flight request deduplication,
  adaptive Overpass mirror failover, request timeouts, and honest error/empty states.
"""

import asyncio
import logging
import math
import os
import re
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
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

_MIRROR_COOLDOWN_SECONDS = 90.0
_mirror_cooldown_until: Dict[str, float] = {}
_preferred_mirror: Optional[str] = None


def get_overpass_url() -> str:
    return os.getenv("OVERPASS_API_URL", "https://overpass-api.de/api/interpreter").strip()


def get_overpass_candidates() -> List[str]:
    primary = get_overpass_url()
    base: List[str] = [primary] if primary else []
    for fallback in OVERPASS_FALLBACK_URLS:
        if fallback not in base:
            base.append(fallback)

    now = time.monotonic()
    # Keep last known healthy mirror first (unless on cooldown), followed by non-cooled mirrors, then cooled mirrors.
    healthy: List[str] = []
    cooled: List[str] = []
    for endpoint in base:
        if _mirror_cooldown_until.get(endpoint, 0.0) > now:
            cooled.append(endpoint)
        else:
            healthy.append(endpoint)

    if _preferred_mirror and _preferred_mirror in healthy:
        healthy.remove(_preferred_mirror)
        healthy.insert(0, _preferred_mirror)

    if not healthy and cooled:
        return cooled[:1]
    return healthy + cooled


def get_nominatim_url() -> str:
    return os.getenv("NOMINATIM_API_URL", "https://nominatim.openstreetmap.org/search").strip()


def get_osm_user_agent() -> str:
    return os.getenv(
        "OSM_USER_AGENT",
        "HealthPoint-Healthcare-Platform/2.0 (https://health-point-tau.vercel.app)",
    ).strip()


_inflight_overpass: Dict[Tuple[Any, ...], asyncio.Future] = {}
_inflight_geocode: Dict[Tuple[Any, ...], asyncio.Future] = {}


SPECIALTY_FILTER_KEYWORDS: Dict[str, List[str]] = {
    "General Physician": ["general", "physician", "family", "primary", "clinic", "gp", "medicine", "doctor"],
    "Cardiologist": ["cardio", "heart", "cardiology"],
    "Dermatologist": ["derma", "skin", "dermatology"],
    "Pediatrician": ["pediat", "paediat", "child", "kids", "children"],
    "Neurologist": ["neuro", "brain", "nerve", "neurology"],
    "Orthopedic Doctor": ["ortho", "bone", "joint", "fracture", "spine", "orthop"],
    "Orthopedist": ["ortho", "bone", "joint", "fracture", "spine", "orthop"],
    "ENT Specialist": ["ent", "ear", "nose", "throat", "otolaryng"],
    "ENT": ["ent", "ear", "nose", "throat", "otolaryng"],
    "Gynecologist": ["gyne", "gynae", "obstet", "maternity", "women"],
    "Dentist": ["dent", "tooth", "oral", "orthodon"],
    "Ophthalmologist": ["ophthalm", "eye", "vision", "retina", "optom"],
    "Psychiatrist": ["psych", "mental", "psychiatry"],
    "Hospital": ["hospital", "medical center", "medical centre"],
    "Emergency Care": ["emergency", "trauma", "casualty", "hospital"],
    "Pharmacy": ["pharmacy", "chemist", "apothecary", "medical store"],
    "All": [],
}

SPECIALTY_OSM_TAG_REGEX: Dict[str, str] = {
    "Cardiologist": "cardio",
    "Dermatologist": "derma",
    "Pediatrician": "p(e|ae)diat",
    "Neurologist": "neuro",
    "Orthopedic Doctor": "ortho",
    "ENT Specialist": "ent|otolaryng",
    "Gynecologist": "gyn(e|ae)|obstet",
    "Ophthalmologist": "ophthalm",
    "Psychiatrist": "psych",
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

_CACHE_TTL_SECONDS = 900
_CACHE_MAX_ITEMS = 300
_osm_cache: OrderedDict[Tuple[Any, ...], Tuple[float, Dict[str, Any]]] = OrderedDict()


def clear_osm_cache() -> None:
    global _preferred_mirror
    _osm_cache.clear()
    _mirror_cooldown_until.clear()
    _preferred_mirror = None


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
    """Resolve city, area, address, or 6-digit PIN code via OpenStreetMap Nominatim."""
    cleaned = (query or "").strip()
    if len(cleaned) < 2:
        return {"ok": False, "provider": "nominatim", "error": "Please enter a valid city, area, or PIN code.", "results": []}

    cache_key = ("osm_geocode", cleaned.lower())
    cached = _cache_get(cache_key)
    if cached is not None:
        return {**cached, "cached": True}

    existing_fut = _inflight_geocode.get(cache_key)
    if existing_fut is not None and not existing_fut.done():
        return await existing_fut

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    _inflight_geocode[cache_key] = fut

    url = get_nominatim_url()
    headers = {"User-Agent": get_osm_user_agent(), "Accept": "application/json"}

    is_six_digit_pin = bool(re.fullmatch(r"\d{6}", cleaned))
    param_attempts: List[Dict[str, Any]] = [
        {"format": "json", "q": cleaned, "limit": 5, "addressdetails": 1}
    ]
    if is_six_digit_pin:
        param_attempts.append({"format": "json", "postalcode": cleaned, "country": "India", "limit": 5, "addressdetails": 1})

    try:
        items: Optional[List[Any]] = None
        last_error: Optional[Dict[str, Any]] = None

        async with httpx.AsyncClient(timeout=7.0) as client:
            for params in param_attempts:
                for attempt in range(2):
                    try:
                        res = await client.get(url, params=params, headers=headers)
                        if res.status_code == 429:
                            last_error = {
                                "ok": False,
                                "provider": "nominatim",
                                "error": "OpenStreetMap Nominatim rate limit reached. Please wait a moment and try again.",
                                "error_code": "rate_limited",
                                "results": [],
                            }
                            break
                        if res.status_code >= 500:
                            last_error = {
                                "ok": False,
                                "provider": "nominatim",
                                "error": f"Location lookup service returned HTTP {res.status_code}.",
                                "error_code": f"http_{res.status_code}",
                                "results": [],
                            }
                            if attempt == 0:
                                await asyncio.sleep(0.25)
                                continue
                            break
                        if res.status_code != 200:
                            last_error = {
                                "ok": False,
                                "provider": "nominatim",
                                "error": f"Location lookup service returned HTTP {res.status_code}.",
                                "error_code": f"http_{res.status_code}",
                                "results": [],
                            }
                            break

                        parsed = res.json()
                        if isinstance(parsed, list) and parsed:
                            items = parsed
                            break
                        last_error = {
                            "ok": False,
                            "provider": "nominatim",
                            "error": f"No OpenStreetMap location matched '{cleaned}'.",
                            "error_code": "no_match",
                            "results": [],
                        }
                        break
                    except httpx.TimeoutException:
                        last_error = {
                            "ok": False,
                            "provider": "nominatim",
                            "error": "Location lookup timed out. Please try again.",
                            "error_code": "timeout",
                            "results": [],
                        }
                        if attempt == 0:
                            continue
                    except Exception as exc:
                        logger.warning("Nominatim geocoding failed: %s", type(exc).__name__)
                        last_error = {
                            "ok": False,
                            "provider": "nominatim",
                            "error": "Unable to resolve that location right now.",
                            "error_code": "network_error",
                            "results": [],
                        }
                        break

                if items is not None:
                    break
                if last_error and last_error.get("error_code") not in ("no_match",):
                    break

        if not items:
            err_res = last_error or {
                "ok": False,
                "provider": "nominatim",
                "error": f"No OpenStreetMap location matched '{cleaned}'.",
                "error_code": "no_match",
                "results": [],
            }
            if not fut.done():
                fut.set_result(err_res)
            return err_res

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
        out = {"ok": True, "provider": "nominatim", "cached": False, "results": mapped}
        _cache_set(cache_key, out)
        if not fut.done():
            fut.set_result(out)
        return out
    finally:
        _inflight_geocode.pop(cache_key, None)


def _build_overpass_filters(lat: float, lng: float, bounded_radius: int, facility_mode: str, norm_spec: str) -> str:
    if facility_mode == "hospital":
        return (
            f'node["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
        )
    if facility_mode == "pharmacy":
        return (
            f'node["amenity"="pharmacy"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="pharmacy"](around:{bounded_radius},{lat},{lng});'
            f'node["healthcare"="pharmacy"](around:{bounded_radius},{lat},{lng});'
        )
    if facility_mode == "emergency" or norm_spec == "Emergency Care":
        return (
            f'node["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="hospital"](around:{bounded_radius},{lat},{lng});'
            f'node["emergency"="yes"](around:{bounded_radius},{lat},{lng});'
            f'way["emergency"="yes"](around:{bounded_radius},{lat},{lng});'
        )
    if norm_spec == "Dentist":
        return (
            f'node["amenity"="dentist"](around:{bounded_radius},{lat},{lng});'
            f'way["amenity"="dentist"](around:{bounded_radius},{lat},{lng});'
            f'node["healthcare"="dentist"](around:{bounded_radius},{lat},{lng});'
        )

    spec_regex = SPECIALTY_OSM_TAG_REGEX.get(norm_spec)
    spec_clauses = ""
    if spec_regex:
        spec_clauses = (
            f'node["healthcare:speciality"~"{spec_regex}",i](around:{bounded_radius},{lat},{lng});'
            f'way["healthcare:speciality"~"{spec_regex}",i](around:{bounded_radius},{lat},{lng});'
        )

    return (
        f'{spec_clauses}'
        f'node["amenity"~"^(doctors|clinic|hospital|dentist)$"](around:{bounded_radius},{lat},{lng});'
        f'way["amenity"~"^(doctors|clinic|hospital|dentist)$"](around:{bounded_radius},{lat},{lng});'
        f'node["healthcare"~"^(doctor|clinic|hospital|centre|dentist)$"](around:{bounded_radius},{lat},{lng});'
        f'way["healthcare"~"^(doctor|clinic|hospital|centre|dentist)$"](around:{bounded_radius},{lat},{lng});'
    )


def _normalize_nominatim_element(
    item: Dict[str, Any],
    origin_lat: float,
    origin_lng: float,
) -> Optional[Dict[str, Any]]:
    try:
        plat_f = float(item["lat"])
        plng_f = float(item["lon"])
    except (KeyError, TypeError, ValueError):
        return None

    osm_type = str(item.get("osm_type") or "node").lower()
    osm_id = str(item.get("osm_id") or item.get("place_id") or "")
    if not osm_id:
        return None

    item_class = str(item.get("class") or "").lower()
    item_type = str(item.get("type") or "").lower()
    if item_class not in ("amenity", "healthcare", "shop") and item_type not in (
        "pharmacy", "chemist", "hospital", "clinic", "doctors", "doctor", "dentist"
    ):
        return None

    extratags = item.get("extratags") or {}
    addr = item.get("address") or {}

    if item_type == "hospital":
        category = "Hospital"
    elif item_type == "dentist":
        category = "Dental Clinic"
    elif item_type in ("pharmacy", "chemist"):
        category = "Pharmacy"
    elif item_type == "clinic":
        category = "Clinic"
    elif item_type in ("doctors", "doctor"):
        category = "Doctor's Practice"
    else:
        category = item_type.replace("_", " ").title() if item_type else "Healthcare Facility"

    raw_name = str(item.get("name") or addr.get("amenity") or addr.get("healthcare") or "").strip()
    if not raw_name or raw_name.lower() in ("pharmacy", "hospital", "clinic", "doctors", "dentist"):
        display = str(item.get("display_name") or "").split(",")[0].strip()
        name = display if display and display.lower() != item_type else f"Unnamed {category} (OpenStreetMap)"
    else:
        name = raw_name

    raw_spec = str(extratags.get("healthcare:speciality") or extratags.get("speciality") or "").strip()
    specialty_display = raw_spec.replace(";", ", ").replace("_", " ").title() if raw_spec else category

    addr_parts: List[str] = []
    for key in ("road", "neighbourhood", "suburb", "city_district", "city", "state", "postcode"):
        val = str(addr.get(key) or "").strip()
        if val and val not in addr_parts:
            addr_parts.append(val)
    address_str = ", ".join(addr_parts) if addr_parts else (str(item.get("display_name") or "").strip() or "Address not listed in OpenStreetMap")

    phone = str(extratags.get("phone") or extratags.get("contact:phone") or extratags.get("emergency:phone") or "").strip()
    website = str(extratags.get("website") or extratags.get("contact:website") or "").strip()
    opening_hours = str(extratags.get("opening_hours") or "").strip()
    open_now: Optional[bool] = True if opening_hours.lower() == "24/7" else None

    return {
        "place_id": f"osm_{osm_type}_{osm_id}",
        "name": name,
        "specialty": specialty_display,
        "category": category,
        "address": address_str,
        "distance_km": haversine_distance_km(origin_lat, origin_lng, plat_f, plng_f),
        "latitude": plat_f,
        "longitude": plng_f,
        "phone": phone,
        "website": website,
        "opening_hours": [opening_hours] if opening_hours else [],
        "open_now": open_now,
        "rating": None,
        "reviews": 0,
        "maps_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
        "directions_url": build_osm_directions_url(origin_lat, origin_lng, plat_f, plng_f),
        "source": "openstreetmap",
        "verified": False,
        "verification_note": "OpenStreetMap community listing; verify clinician qualifications, hours, and availability directly.",
    }


async def _fallback_nominatim_osm_search(
    lat: float,
    lng: float,
    bounded_radius: int,
    facility_mode: str,
    norm_spec: str,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str], Optional[str]]:
    """
    Bounded OpenStreetMap Nominatim POI fallback used only when all Overpass mirrors fail.
    Returns (normalized_items_or_None, error_code, error_message).
    """
    dlat = bounded_radius / 111320.0
    cos_lat = max(0.2, abs(math.cos(math.radians(lat))))
    dlon = bounded_radius / (111320.0 * cos_lat)
    viewbox = f"{lng - dlon:.5f},{lat + dlat:.5f},{lng + dlon:.5f},{lat - dlat:.5f}"

    if facility_mode == "pharmacy":
        queries = ["pharmacy"]
    elif facility_mode in ("hospital", "emergency") or norm_spec == "Emergency Care":
        queries = ["hospital"]
    elif norm_spec == "Dentist":
        queries = ["dentist"]
    elif norm_spec not in ("All", "General Physician"):
        queries = [norm_spec.lower(), "hospital clinic"]
    else:
        queries = ["hospital", "clinic"]

    url = get_nominatim_url()
    headers = {"User-Agent": get_osm_user_agent(), "Accept": "application/json"}
    collected: List[Dict[str, Any]] = []
    seen_ids = set()
    radius_km = bounded_radius / 1000.0
    any_ok = False
    last_code: Optional[str] = None
    last_msg: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            for q_term in queries:
                res = await client.get(
                    url,
                    params={
                        "format": "json",
                        "q": q_term,
                        "viewbox": viewbox,
                        "bounded": 1,
                        "limit": 25,
                        "addressdetails": 1,
                        "extratags": 1,
                    },
                    headers=headers,
                )
                if res.status_code == 429:
                    last_code = "rate_limited"
                    last_msg = "OpenStreetMap rate limit reached across Overpass and Nominatim. Please wait briefly and retry."
                    continue
                if res.status_code != 200:
                    last_code = f"http_{res.status_code}"
                    last_msg = f"OpenStreetMap fallback returned HTTP {res.status_code}."
                    continue
                any_ok = True
                parsed = res.json()
                if not isinstance(parsed, list):
                    continue
                for raw in parsed:
                    norm = _normalize_nominatim_element(raw, lat, lng)
                    if norm and norm["place_id"] not in seen_ids and norm["distance_km"] <= radius_km + 0.5:
                        seen_ids.add(norm["place_id"])
                        collected.append(norm)
    except httpx.TimeoutException:
        return (collected if any_ok else None), "timeout", "OpenStreetMap POI fallback timed out."
    except Exception as exc:
        logger.warning("Nominatim POI fallback failed: %s", type(exc).__name__)
        return (collected if any_ok else None), "network_error", f"OpenStreetMap POI fallback error ({type(exc).__name__})."

    if not any_ok:
        return None, last_code or "network_error", last_msg or "OpenStreetMap POI fallback failed."
    return collected, None, None


async def search_nearby_osm_facilities(
    lat: float,
    lng: float,
    specialty: str = "All",
    radius: int = 5000,
    facility_mode: str = "doctor",
    limit: int = 20,
    location_label: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Search real nearby healthcare facilities via OpenStreetMap Overpass API.
    Uses bounded timeouts, mirror failover, health cooldowns, caching, and deduplication.
    Never invents doctors, qualifications, phone numbers, ratings, or availability.
    """
    global _preferred_mirror

    if (
        lat is None
        or lng is None
        or not math.isfinite(float(lat))
        or not math.isfinite(float(lng))
        or not (-90 <= float(lat) <= 90 and -180 <= float(lng) <= 180)
    ):
        return {
            "ok": False,
            "provider": "openstreetmap",
            "source": "openstreetmap-overpass",
            "warnings": [],
            "error": "Invalid latitude or longitude coordinates.",
            "error_code": "invalid_coordinates",
            "manual_maps_url": build_manual_osm_url("hospital clinic doctor"),
            "results": [],
        }

    lat = float(lat)
    lng = float(lng)
    norm_spec = normalize_specialty(specialty)
    bounded_radius = max(500, min(int(radius or 5000), 25000))
    bounded_limit = max(1, min(int(limit or 20), 40))

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
        return {**cached, "cached": True, "source": "cache"}

    existing_fut = _inflight_overpass.get(cache_key)
    if existing_fut is not None and not existing_fut.done():
        return await existing_fut

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    _inflight_overpass[cache_key] = fut

    filters = _build_overpass_filters(lat, lng, bounded_radius, facility_mode, norm_spec)
    out_cap = 55 if norm_spec not in ("All", "General Physician") and facility_mode == "doctor" else 40
    overpass_ql = f"[out:json][timeout:8];({filters});out center {out_cap};"

    headers = {
        "User-Agent": get_osm_user_agent(),
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    last_error_code = "network_error"
    last_error_msg = "OpenStreetMap Overpass API could not be reached right now."
    retryable_statuses = {400, 403, 406, 429, 502, 503, 504}
    elements: Optional[List[Dict[str, Any]]] = None
    warnings: List[str] = []
    mirror_used: Optional[str] = None

    try:
        candidates = get_overpass_candidates()
        overpass_started = time.monotonic()
        overpass_budget_s = 8.5
        async with httpx.AsyncClient(timeout=5.5) as client:
            for endpoint in candidates:
                elapsed = time.monotonic() - overpass_started
                if elapsed >= overpass_budget_s:
                    warnings.append("Overpass mirror budget reached; switching to OpenStreetMap Nominatim bounded fallback.")
                    break
                host_label = urllib.parse.urlparse(endpoint).netloc or endpoint
                try:
                    res = await client.post(endpoint, data={"data": overpass_ql}, headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        elements = data.get("elements") or []
                        mirror_used = host_label
                        _preferred_mirror = endpoint
                        _mirror_cooldown_until.pop(endpoint, None)
                        break

                    _mirror_cooldown_until[endpoint] = time.monotonic() + _MIRROR_COOLDOWN_SECONDS
                    if res.status_code == 429:
                        last_error_code = "rate_limited"
                        last_error_msg = "OpenStreetMap Overpass rate limit reached across mirrors. Please wait briefly or retry."
                    elif res.status_code >= 500:
                        last_error_code = "provider_outage"
                        last_error_msg = f"OpenStreetMap Overpass mirrors are temporarily busy (HTTP {res.status_code}). Please retry."
                    else:
                        last_error_code = f"http_{res.status_code}"
                        last_error_msg = f"OpenStreetMap Overpass returned HTTP {res.status_code}."
                    warnings.append(f"{host_label} returned HTTP {res.status_code}; fell back to next mirror.")
                    if res.status_code not in retryable_statuses:
                        break
                    logger.warning("Overpass mirror %s returned HTTP %s; trying fallback.", host_label, res.status_code)
                except httpx.TimeoutException:
                    _mirror_cooldown_until[endpoint] = time.monotonic() + _MIRROR_COOLDOWN_SECONDS
                    last_error_code = "timeout"
                    last_error_msg = "OpenStreetMap Overpass query timed out across available mirrors. Try a smaller radius or retry."
                    warnings.append(f"{host_label} timed out; fell back to next mirror.")
                    logger.warning("Overpass mirror %s timed out; trying fallback.", host_label)
                except Exception as exc:
                    _mirror_cooldown_until[endpoint] = time.monotonic() + _MIRROR_COOLDOWN_SECONDS
                    last_error_code = "network_error"
                    last_error_msg = f"Unable to reach OpenStreetMap Overpass mirrors ({type(exc).__name__})."
                    warnings.append(f"{host_label} network error ({type(exc).__name__}); fell back to next mirror.")
                    logger.warning("Overpass mirror %s failed (%s); trying fallback.", host_label, type(exc).__name__)

        all_items: List[Dict[str, Any]] = []
        source_label = "openstreetmap-overpass"

        if elements is None:
            nom_items, nom_err_code, nom_err_msg = await _fallback_nominatim_osm_search(
                lat=lat,
                lng=lng,
                bounded_radius=bounded_radius,
                facility_mode=facility_mode,
                norm_spec=norm_spec,
            )
            if nom_items is not None:
                all_items = nom_items
                source_label = "openstreetmap-nominatim-fallback"
                mirror_used = "nominatim.openstreetmap.org"
                warnings.append("Primary Overpass mirrors were busy; loaded real OpenStreetMap listings via Nominatim bounded search.")
            else:
                if nom_err_code == "rate_limited" or last_error_code == "rate_limited":
                    final_code = "rate_limited"
                else:
                    final_code = last_error_code
                err_out = {
                    "ok": False,
                    "provider": "openstreetmap",
                    "source": source_label,
                    "warnings": warnings,
                    "error": last_error_msg if not nom_err_msg else f"{last_error_msg}",
                    "error_code": final_code,
                    "manual_maps_url": manual_url,
                    "results": [],
                }
                if not fut.done():
                    fut.set_result(err_out)
                return err_out
        else:
            seen_ids = set()
            for el in elements:
                norm = _normalize_osm_element(el, lat, lng)
                if norm and norm["place_id"] not in seen_ids:
                    seen_ids.add(norm["place_id"])
                    all_items.append(norm)

        all_items.sort(key=lambda x: x["distance_km"])

        if facility_mode == "doctor" and norm_spec not in ("All", "General Physician"):
            matched = [it for it in all_items if _matches_specialty(it, norm_spec)]
            results = matched[:bounded_limit]
            untagged_notice = (
                f"No facilities in OpenStreetMap are explicitly tagged as '{norm_spec}' within {bounded_radius // 1000} km; "
                f"{len(all_items)} general hospitals/clinics exist nearby (community OSM specialty tags are often omitted)."
                if not results and all_items
                else None
            )
            if untagged_notice:
                warnings.append(untagged_notice)
        else:
            results = all_items[:bounded_limit]
            untagged_notice = None

        out: Dict[str, Any] = {
            "ok": True,
            "provider": "openstreetmap",
            "source": source_label,
            "mirror_used": mirror_used,
            "cached": False,
            "warnings": warnings,
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
