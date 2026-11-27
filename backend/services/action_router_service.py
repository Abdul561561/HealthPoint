"""
HealthPoint Intelligent Healthcare Action Router
================================================
Bridges conversational AI intents with real backend HealthPoint capabilities:
- OpenStreetMap Overpass & Nominatim doctor & hospital discovery with explicit location consent.
- Manual PIN code / area geocoding fallback (never silently guessing a user's city).
- Follow-up context handling ("Only show dermatologists", "Show hospitals instead",
  "Which one is closest?", "Give me directions", "What should I tell the doctor?").
- Action buttons wired exclusively to real HealthPoint frontend routes and live actions.
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from services.intent_service import IntentType
from services.osm_service import (
    build_manual_osm_url,
    geocode_location,
    normalize_specialty,
    search_nearby_osm_facilities,
)
from controllers.pharmacy_controller import search_medicines_fda

SPECIALTY_PATTERNS: List[Tuple[str, str]] = [
    (r"\bcardiologist(s)?|heart (doctor|specialist|clinic)\b", "Cardiologist"),
    (r"\bdermatologist(s)?|skin (doctor|specialist|clinic)\b", "Dermatologist"),
    (r"\bpediatrician(s)?|child (doctor|specialist)\b", "Pediatrician"),
    (r"\bneurologist(s)?|brain|nerve specialist\b", "Neurologist"),
    (r"\borthopedic|orthopedist|bone|joint doctor\b", "Orthopedic Doctor"),
    (r"\bent\b|ear nose throat\b", "ENT Specialist"),
    (r"\bgynecologist(s)?|obgyn|women('s)? clinic\b", "Gynecologist"),
    (r"\bdentist(s)?|dental\b", "Dentist"),
    (r"\bophthalmologist(s)?|eye doctor\b", "Ophthalmologist"),
    (r"\bpsychiatrist(s)?|mental health\b", "Psychiatrist"),
    (r"\bgeneral physician|physician|gp|family doctor|fever|feverish\b", "General Physician"),
]


def extract_specialty_from_text(text: str) -> Optional[str]:
    low = (text or "").lower()
    for pat, label in SPECIALTY_PATTERNS:
        if re.search(pat, low):
            return label
    return None


def extract_inline_location_query(text: str) -> Optional[str]:
    """Extract explicit city, area, or 6-digit PIN code mentioned directly in a chat message."""
    trimmed = (text or "").strip()
    pin_match = re.search(r"\b(\d{6})\b", trimmed)
    if pin_match:
        return pin_match.group(1)
    loc_match = re.search(
        r"\b(?:in|near|around|at)\s+(?!me\b|my\b|here\b)([A-Za-z][A-Za-z0-9\s,.-]{2,45})$",
        trimmed,
        re.IGNORECASE,
    )
    if loc_match:
        candidate = loc_match.group(1).strip(" .?!")
        if candidate.lower() not in ("health", "my health", "today", "hospital", "hospitals"):
            return candidate
    return None


def looks_like_pure_location_reply(text: str) -> bool:
    """True when user responds concisely with just a PIN code or area/city name."""
    t = (text or "").strip()
    if re.fullmatch(r"\d{6}", t):
        return True
    if 2 <= len(t) <= 60 and "," in t and not any(w in t.lower() for w in ("what", "how", "why", "explain", "pain", "fever")):
        return True
    return False


def build_module_actions(
    intent: str,
    requires_location: bool = False,
    places: Optional[List[Dict[str, Any]]] = None,
    manual_maps_url: Optional[str] = None,
    message_lower: str = "",
) -> List[Dict[str, Any]]:
    """Build actionable UI triggers grounded strictly in real working HealthPoint modules."""
    actions: List[Dict[str, Any]] = []

    if requires_location:
        actions.append({"type": "request_location", "label": "Use My Current Location"})

    if places:
        top = places[0]
        if top.get("directions_url"):
            actions.append({
                "type": "external",
                "label": f"Directions to {top['name'][:28]}",
                "url": top["directions_url"],
            })

    if manual_maps_url and not places and not requires_location:
        actions.append({"type": "external", "label": "Search on OpenStreetMap", "url": manual_maps_url})

    if intent in (IntentType.DOCTOR_DISCOVERY, IntentType.HOSPITAL_DISCOVERY, IntentType.SYMPTOM_TRIAGE):
        actions.append({"type": "route", "label": "Open Find Doctors Map", "path": "/doctors"})

    if intent in (IntentType.EMERGENCY, IntentType.HOSPITAL_DISCOVERY) or "fever" in message_lower:
        actions.append({"type": "route", "label": "Emergency SOS & Hospitals", "path": "/emergency"})

    if intent in (IntentType.SYMPTOM_TRIAGE, IntentType.PHARMACY, IntentType.MEDICATION_PERSONAL, IntentType.MEDICINE_INFO):
        actions.append({"type": "route", "label": "Open Smart Pharmacy", "path": "/pharmacy"})

    if intent in (IntentType.REPORT_ANALYSIS, IntentType.HEALTH_RECORDS):
        actions.append({"type": "route", "label": "Open Medical Records", "path": "/records"})

    if intent == IntentType.DIET_NUTRITION:
        actions.append({"type": "route", "label": "Open Nutrition Tracker", "path": "/nutrition"})

    if intent == IntentType.FITNESS:
        actions.append({"type": "route", "label": "Open Fitness & Workouts", "path": "/fitness"})

    if intent in (IntentType.HEALTH_OVERVIEW, IntentType.HEALTH_TREND, IntentType.PERSONAL_HEALTH):
        actions.append({"type": "route", "label": "View Health Analytics", "path": "/analytics"})
        actions.append({"type": "route", "label": "Open Health Timeline", "path": "/timeline"})

    if intent == IntentType.INSURANCE:
        actions.append({"type": "route", "label": "Open Insurance Assistant", "path": "/insurance"})

    seen = set()
    unique_actions = []
    for a in actions:
        if a["label"] not in seen:
            seen.add(a["label"])
            unique_actions.append(a)
    return unique_actions[:4]


async def route_healthcare_actions(
    message: str,
    intent: str,
    session: Dict[str, Any],
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location_query: Optional[str] = None,
    location_denied: bool = False,
) -> Dict[str, Any]:
    """
    Executes OpenStreetMap facility discovery, symptom triage guidance, medication checks,
    and conversational follow-ups cleanly without inventing facilities or guessing cities.
    """
    msg_lower = (message or "").lower()
    last_location = session.get("last_location")
    last_places: List[Dict[str, Any]] = session.get("last_places") or []
    last_specialty: str = session.get("last_specialty") or "General Physician"

    is_closest_followup = bool(re.search(r"\bwhich (one|facility|doctor|hospital) is closest|closest one\b", msg_lower))
    is_directions_followup = bool(re.search(r"\bgive me directions|directions|how do i get there\b", msg_lower))
    is_prep_followup = bool(re.search(r"\bwhat should i tell the doctor|questions should i ask\b", msg_lower))

    if (is_closest_followup or is_directions_followup) and last_places:
        top = sorted(last_places, key=lambda p: p.get("distance_km", 9999))[0]
        ctx = (
            f"\n[PREVIOUSLY RETRIEVED NEARBY FACILITIES FROM OPENSTREETMAP]:\n"
            f"Closest Facility: {top['name']} ({top.get('specialty', top.get('category', 'Clinic'))})\n"
            f"Address: {top.get('address')}\n"
            f"Distance: {top.get('distance_km')} km\n"
            f"Phone: {top.get('phone') or 'Not listed'}\n"
            f"OpenStreetMap Directions URL: {top.get('directions_url')}\n"
        )
        actions = build_module_actions(
            IntentType.DOCTOR_DISCOVERY,
            requires_location=False,
            places=[top],
            manual_maps_url=top.get("directions_url"),
            message_lower=msg_lower,
        )
        return {
            "places": last_places[:6],
            "places_error": None,
            "manual_maps_url": top.get("directions_url"),
            "requires_location": False,
            "search_center": last_location,
            "actions": actions,
            "router_context": ctx,
            "session_updates": {},
        }

    if is_prep_followup:
        ctx = (
            "\n[CLINICAL VISIT PREPARATION]: Help the user prepare a concise, structured checklist "
            "of symptoms, onset/duration, recorded vitals from their profile, allergies, and current medications "
            "to share with their doctor.\n"
        )
        return {
            "places": [],
            "places_error": None,
            "manual_maps_url": None,
            "requires_location": False,
            "search_center": last_location,
            "actions": build_module_actions(IntentType.DOCTOR_DISCOVERY, message_lower=msg_lower),
            "router_context": ctx,
            "session_updates": {},
        }

    pharmacy_ctx = ""
    if intent == IntentType.SYMPTOM_TRIAGE or (
        "headache" in msg_lower or "fever" in msg_lower or "medicine for" in msg_lower
    ):
        catalog = await search_medicines_fda("")
        otc_suggestions = [
            f"- {m['name']} ({m['purpose']})"
            for m in (catalog or [])
            if not m.get("requiresPrescription", True)
        ][:4]
        if otc_suggestions:
            pharmacy_ctx = (
                "\n[HEALTHPOINT PHARMACY CATALOG (GENERAL OTC REFERENCE ONLY — NOT A PRESCRIPTION)]:\n"
                + "\n".join(otc_suggestions)
                + "\n"
            )

    wants_facility_lookup = intent in (IntentType.DOCTOR_DISCOVERY, IntentType.HOSPITAL_DISCOVERY) or (
        intent == IntentType.SYMPTOM_TRIAGE
        and any(w in msg_lower for w in ("doctor", "nearby", "clinic", "hospital", "visit", "fever", "feverish"))
    )

    if not wants_facility_lookup:
        return {
            "places": [],
            "places_error": None,
            "manual_maps_url": None,
            "requires_location": False,
            "search_center": last_location,
            "actions": build_module_actions(intent, message_lower=msg_lower),
            "router_context": pharmacy_ctx,
            "session_updates": {},
        }

    facility_mode = "hospital" if (
        intent == IntentType.HOSPITAL_DISCOVERY or "hospital" in msg_lower
    ) else "doctor"
    specialty = extract_specialty_from_text(message) or (
        last_specialty if facility_mode == "doctor" and ("only show" in msg_lower or "switch" in msg_lower) else (
            "Hospital" if facility_mode == "hospital" else "All"
        )
    )
    specialty = normalize_specialty(specialty)

    resolved_lat: Optional[float] = float(lat) if lat is not None else None
    resolved_lng: Optional[float] = float(lng) if lng is not None else None
    resolved_label: Optional[str] = None
    session_updates: Dict[str, Any] = {}

    inline_loc = (location_query or "").strip() or extract_inline_location_query(message)
    if inline_loc and (resolved_lat is None or resolved_lng is None):
        geo = await geocode_location(inline_loc)
        if geo.get("ok") and geo.get("results"):
            top_geo = geo["results"][0]
            resolved_lat = float(top_geo["lat"])
            resolved_lng = float(top_geo["lng"])
            resolved_label = top_geo["display_name"]
        else:
            err_msg = geo.get("error") or f"Could not resolve location '{inline_loc}'."
            manual_url = build_manual_osm_url(f"{specialty} {inline_loc}", location_label=inline_loc)
            return {
                "places": [],
                "places_error": err_msg,
                "manual_maps_url": manual_url,
                "requires_location": True,
                "search_center": None,
                "actions": build_module_actions(intent, requires_location=True, manual_maps_url=manual_url, message_lower=msg_lower),
                "router_context": (
                    f"{pharmacy_ctx}\n[LOCATION LOOKUP RESULT]: {err_msg} "
                    "Ask the user to enter a valid city, neighborhood, or 6-digit PIN code or enable browser location.\n"
                ),
                "session_updates": {},
            }

    if (resolved_lat is None or resolved_lng is None) and last_location:
        resolved_lat = last_location.get("lat")
        resolved_lng = last_location.get("lng")
        resolved_label = last_location.get("label")

    if resolved_lat is not None and resolved_lng is not None:
        search_center = {
            "lat": resolved_lat,
            "lng": resolved_lng,
            "label": resolved_label or "Your Current Location",
        }
        session_updates["last_location"] = search_center
    else:
        reason = (
            "Browser location permission was denied. Please enter your city, area, or PIN code."
            if location_denied
            else "Location has not been shared yet."
        )
        return {
            "places": [],
            "places_error": None,
            "manual_maps_url": None,
            "requires_location": True,
            "search_center": None,
            "actions": build_module_actions(intent, requires_location=True, message_lower=msg_lower),
            "router_context": (
                f"{pharmacy_ctx}\n[LOCATION REQUIRED FOR OPENSTREETMAP SEARCH]: {reason}\n"
                f"Requested Care Category: {specialty} ({facility_mode}).\n"
                "Ask the user politely to grant browser location access OR type their city, area, or PIN code "
                "so HealthPoint can search real nearby OpenStreetMap facilities. NEVER guess a city or invent doctors.\n"
            ),
            "session_updates": {"last_specialty": specialty, "last_facility_mode": facility_mode},
        }

    places_res = await search_nearby_osm_facilities(
        lat=resolved_lat,
        lng=resolved_lng,
        specialty=specialty,
        radius=8000 if facility_mode == "hospital" else 5000,
        facility_mode=facility_mode,
        limit=10,
        location_label=resolved_label,
    )

    if not places_res.get("ok"):
        err_text = places_res.get("error") or "OpenStreetMap Overpass search could not complete."
        manual_url = places_res.get("manual_maps_url") or build_manual_osm_url(
            specialty, lat=resolved_lat, lng=resolved_lng, location_label=resolved_label
        )
        return {
            "places": [],
            "places_error": err_text,
            "manual_maps_url": manual_url,
            "requires_location": False,
            "search_center": search_center,
            "actions": build_module_actions(intent, manual_maps_url=manual_url, message_lower=msg_lower),
            "router_context": (
                f"{pharmacy_ctx}\n[OPENSTREETMAP OVERPASS UNAVAILABLE]: {err_text}\n"
                f"Direct OpenStreetMap Search Link: {manual_url}\n"
                "Explain this error honestly to the user, share the manual OpenStreetMap link, and DO NOT invent any nearby doctors or hospitals.\n"
            ),
            "session_updates": {**session_updates, "last_specialty": specialty, "last_facility_mode": facility_mode},
        }

    places = places_res.get("results") or []
    session_updates.update({
        "last_places": places,
        "last_specialty": specialty,
        "last_facility_mode": facility_mode,
    })

    if not places:
        manual_url = places_res.get("manual_maps_url")
        notice = places_res.get("notice") or f"No {specialty} listings found in OpenStreetMap within range near {search_center['label']}."
        return {
            "places": [],
            "places_error": notice,
            "manual_maps_url": manual_url,
            "requires_location": False,
            "search_center": search_center,
            "actions": build_module_actions(intent, manual_maps_url=manual_url, message_lower=msg_lower),
            "router_context": (
                f"{pharmacy_ctx}\n[OPENSTREETMAP SEARCH RESULT]: {notice}\n"
                f"Manual OpenStreetMap Link: {manual_url}\nDo NOT invent facilities.\n"
            ),
            "session_updates": session_updates,
        }

    place_lines = []
    for i, p in enumerate(places[:6], start=1):
        phone_str = p.get("phone") or "Not listed"
        hours_str = ", ".join(p.get("opening_hours") or []) or "Hours not listed"
        place_lines.append(
            f"{i}. {p['name']} ({p.get('category', 'Medical Facility')}) | {p['distance_km']} km away | "
            f"Address: {p['address']} | Phone: {phone_str} | Hours: {hours_str}"
        )

    router_ctx = (
        f"{pharmacy_ctx}\n[REAL OPENSTREETMAP FACILITIES NEAR {search_center['label']} ({specialty})]:\n"
        + "\n".join(place_lines)
        + "\nNote: Present only these OpenStreetMap community listings clearly. Never claim verified qualifications, ratings, or appointment availability.\n"
    )

    return {
        "places": places,
        "places_error": None,
        "manual_maps_url": places_res.get("manual_maps_url"),
        "requires_location": False,
        "search_center": search_center,
        "actions": build_module_actions(
            intent,
            requires_location=False,
            places=places,
            manual_maps_url=places_res.get("manual_maps_url"),
            message_lower=msg_lower,
        ),
        "router_context": router_ctx,
        "session_updates": session_updates,
    }
