import os
import math
import httpx
from dotenv import load_dotenv

# Load env
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

SPECIALTY_KEYWORD_MAP = {
    "Cardiologist": "cardiologist heart clinic",
    "Neurologist": "neurologist neurology clinic",
    "Dermatologist": "dermatologist skin clinic",
    "Orthopedist": "orthopedic surgeon bone joint",
    "Pediatrician": "pediatrician children hospital",
    "Psychiatrist": "psychiatrist mental health clinic",
    "General Physician": "general physician doctor clinic",
    "Gynecologist": "gynecologist women health",
    "Ophthalmologist": "ophthalmologist eye clinic",
    "Dentist": "dentist dental clinic",
    "ENT": "ENT ear nose throat specialist",
    "All": "doctor hospital clinic",
}

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two GPS coordinates."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

def build_photo_url(photo_reference: str, max_width: int = 400) -> str:
    if not photo_reference or not GOOGLE_MAPS_API_KEY:
        return ""
    return (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth={max_width}&photo_reference={photo_reference}&key={GOOGLE_MAPS_API_KEY}"
    )

async def get_nearby_doctors(lat: float, lng: float, specialty: str = "All", radius: int = 5000):
    """Fetch real nearby doctors/clinics using Google Places Nearby Search API."""
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured", "results": []}

    keyword = SPECIALTY_KEYWORD_MAP.get(specialty, "doctor hospital clinic")
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "type": "doctor|hospital|health",
        "keyword": keyword,
        "key": GOOGLE_MAPS_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, params=params)
            data = res.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            print(f"Google Places error: {data.get('status')} — {data.get('error_message', '')}")
            return []

        results = []
        for place in data.get("results", []):
            location = place.get("geometry", {}).get("location", {})
            place_lat = location.get("lat", lat)
            place_lng = location.get("lng", lng)
            distance_km = haversine_distance_km(lat, lng, place_lat, place_lng)

            photos = place.get("photos", [])
            photo_url = build_photo_url(photos[0]["photo_reference"]) if photos else ""

            opening_hours = place.get("opening_hours", {})
            open_now = opening_hours.get("open_now", None)

            results.append({
                "place_id": place.get("place_id", ""),
                "name": place.get("name", "Medical Center"),
                "specialty": specialty if specialty != "All" else "General Physician",
                "hospital": place.get("name", ""),
                "address": place.get("vicinity", "Nearby"),
                "rating": place.get("rating", 4.0),
                "reviews": place.get("user_ratings_total", 0),
                "open_now": open_now,
                "distance_km": distance_km,
                "photo_url": photo_url,
                "latitude": place_lat,
                "longitude": place_lng,
                "maps_url": f"https://www.google.com/maps/place/?q=place_id:{place.get('place_id', '')}"
            })

        # Sort by distance
        results.sort(key=lambda x: x["distance_km"])
        return results

    except Exception as e:
        print(f"Google Places doctors error: {e}")
        return []


async def get_nearby_pharmacies(lat: float, lng: float, filter_type: str = "all", radius: int = 5000):
    """Fetch real nearby pharmacies using Google Places Nearby Search API."""
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "Google Maps API key not configured", "results": []}

    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "type": "pharmacy",
        "key": GOOGLE_MAPS_API_KEY,
    }

    if filter_type == "open_now":
        params["opennow"] = "true"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, params=params)
            data = res.json()

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            print(f"Google Places pharmacy error: {data.get('status')}")
            return []

        results = []
        for place in data.get("results", []):
            location = place.get("geometry", {}).get("location", {})
            place_lat = location.get("lat", lat)
            place_lng = location.get("lng", lng)
            distance_km = haversine_distance_km(lat, lng, place_lat, place_lng)

            photos = place.get("photos", [])
            photo_url = build_photo_url(photos[0]["photo_reference"]) if photos else ""

            opening_hours = place.get("opening_hours", {})
            open_now = opening_hours.get("open_now", None)

            results.append({
                "place_id": place.get("place_id", ""),
                "name": place.get("name", "Pharmacy"),
                "address": place.get("vicinity", "Nearby"),
                "rating": place.get("rating", 4.0),
                "reviews": place.get("user_ratings_total", 0),
                "open_now": open_now,
                "distance_km": distance_km,
                "photo_url": photo_url,
                "latitude": place_lat,
                "longitude": place_lng,
                "phone": "",
                "maps_url": f"https://www.google.com/maps/place/?q=place_id:{place.get('place_id', '')}"
            })

        results.sort(key=lambda x: x["distance_km"])
        return results

    except Exception as e:
        print(f"Google Places pharmacies error: {e}")
        return []


async def get_place_details(place_id: str):
    """Get detailed info about a specific place."""
    if not GOOGLE_MAPS_API_KEY or not place_id:
        return {}

    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "name,formatted_phone_number,formatted_address,opening_hours,website,rating,reviews,photos",
        "key": GOOGLE_MAPS_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url, params=params)
            data = res.json()

        if data.get("status") != "OK":
            return {}

        result = data.get("result", {})
        photos = result.get("photos", [])
        photo_url = build_photo_url(photos[0]["photo_reference"]) if photos else ""

        hours_periods = result.get("opening_hours", {}).get("weekday_text", [])

        return {
            "name": result.get("name", ""),
            "phone": result.get("formatted_phone_number", ""),
            "address": result.get("formatted_address", ""),
            "website": result.get("website", ""),
            "rating": result.get("rating", 0),
            "photo_url": photo_url,
            "opening_hours": hours_periods,
            "reviews": [
                {
                    "author": r.get("author_name", ""),
                    "rating": r.get("rating", 0),
                    "text": r.get("text", ""),
                    "time": r.get("relative_time_description", ""),
                }
                for r in result.get("reviews", [])[:3]
            ]
        }
    except Exception as e:
        print(f"Google Place Details error: {e}")
        return {}
