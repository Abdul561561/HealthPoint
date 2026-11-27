import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from main import app
from auth.jwt_handler import create_access_token
from controllers.ai_controller import chat_ai_controller
from database.mongodb import get_database
from services.osm_service import (
    clear_osm_cache,
    geocode_location,
    search_nearby_osm_facilities,
)

pytestmark = pytest.mark.asyncio


def _mock_overpass_payload():
    return {
        "elements": [
            {
                "type": "node",
                "id": 1001,
                "lat": 12.9730,
                "lon": 77.6000,
                "tags": {
                    "name": "City Heart & Medical Clinic",
                    "amenity": "clinic",
                    "healthcare:speciality": "cardiology",
                    "addr:street": "MG Road",
                    "addr:city": "Bengaluru",
                    "phone": "+91 80 1111 2222",
                    "website": "https://example-clinic.test",
                    "opening_hours": "Mo-Sa 09:00-20:00",
                },
            },
            {
                "type": "way",
                "id": 2002,
                "center": {"lat": 12.9610, "lon": 77.6380},
                "tags": {
                    "name": "St. Jude Multi-Specialty Hospital",
                    "amenity": "hospital",
                    "addr:full": "45 Ring Road, Domlur",
                },
            },
            {
                "type": "node",
                "id": 3003,
                "lat": 12.9740,
                "lon": 77.6050,
                "tags": {
                    "name": "Derma Skin Care Clinic",
                    "amenity": "clinic",
                    "healthcare:speciality": "dermatology",
                },
            },
        ]
    }


def _make_httpx_mock(status_code: int, json_body):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json = MagicMock(return_value=json_body)
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=resp)
    client.get = AsyncMock(return_value=resp)
    return client


async def test_osm_overpass_nearby_facilities_and_honest_fields():
    clear_osm_cache()
    mock_client = _make_httpx_mock(200, _mock_overpass_payload())

    with patch("services.osm_service.httpx.AsyncClient", return_value=mock_client):
        res = await search_nearby_osm_facilities(12.9716, 77.5946, specialty="Cardiologist", radius=5000)

    assert res["ok"] is True
    assert res["provider"] == "openstreetmap"
    assert len(res["results"]) == 1
    first = res["results"][0]
    assert first["name"] == "City Heart & Medical Clinic"
    assert first["verified"] is False
    assert first["rating"] is None
    assert first["phone"] == "+91 80 1111 2222"
    assert "openstreetmap.org/directions" in first["directions_url"]
    call_kwargs = mock_client.post.call_args.kwargs
    assert "HealthPoint" in call_kwargs["headers"]["User-Agent"]


async def test_osm_errors_and_empty_never_fabricate_doctors():
    clear_osm_cache()
    mock_429 = _make_httpx_mock(429, {})
    with patch("services.osm_service.httpx.AsyncClient", return_value=mock_429):
        res_429 = await search_nearby_osm_facilities(12.9716, 77.5946, specialty="Dermatologist")
    assert res_429["ok"] is False
    assert res_429["results"] == []
    assert res_429["error_code"] == "rate_limited"
    assert "openstreetmap.org/search" in res_429["manual_maps_url"]

    clear_osm_cache()
    mock_empty = _make_httpx_mock(200, {"elements": []})
    with patch("services.osm_service.httpx.AsyncClient", return_value=mock_empty):
        res_empty = await search_nearby_osm_facilities(12.9716, 77.5946, specialty="All")
    assert res_empty["ok"] is True
    assert res_empty["results"] == []


async def test_pincode_geocode_and_ai_osm_conversation_routing():
    clear_osm_cache()
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    email = "router_osm_user@healthpoint.app"
    await db.chat_history.delete_many({"user_email": email})
    captured_prompts = []

    async def mock_gemini(self, **kwargs):
        captured_prompts.append(kwargs.get("system_instruction", ""))
        return "Here is your OpenStreetMap medical guidance."

    # Denied geolocation permission without PIN -> asks for location, never guesses city
    with patch("services.llm_service.LLMService.generate_completion", new=mock_gemini):
        res_denied = await chat_ai_controller(
            email,
            "I am feeling feverish. Which nearby doctor can I visit?",
            location_denied=True,
        )
    assert res_denied["requires_location"] is True
    assert res_denied["places"] == []
    assert "Bengaluru" not in captured_prompts[-1]

    # PIN code ("560038") + Cardiologist -> Nominatim geocode -> Overpass query
    nom_mock = _make_httpx_mock(200, [{"display_name": "Indiranagar, Bengaluru 560038, India", "lat": "12.9784", "lon": "77.6408"}])
    overpass_mock = _make_httpx_mock(200, _mock_overpass_payload())

    with patch("services.osm_service.httpx.AsyncClient", side_effect=[nom_mock, overpass_mock]):
        with patch("services.llm_service.LLMService.generate_completion", new=mock_gemini):
            res_pin = await chat_ai_controller(
                email,
                "Find a cardiologist near 560038",
                session_id=res_denied["session_id"],
            )
    assert res_pin["requires_location"] is False
    assert len(res_pin["places"]) == 1
    assert res_pin["places"][0]["name"] == "City Heart & Medical Clinic"

    # Follow-ups: Dermatologists, Hospitals, Closest, Directions
    overpass_derm = _make_httpx_mock(200, _mock_overpass_payload())
    with patch("services.osm_service.httpx.AsyncClient", return_value=overpass_derm):
        with patch("services.llm_service.LLMService.generate_completion", new=mock_gemini):
            res_derm = await chat_ai_controller(email, "Only show dermatologists.", session_id=res_denied["session_id"])
    assert len(res_derm["places"]) == 1
    assert res_derm["places"][0]["name"] == "Derma Skin Care Clinic"

    overpass_hosp = _make_httpx_mock(200, _mock_overpass_payload())
    with patch("services.osm_service.httpx.AsyncClient", return_value=overpass_hosp):
        with patch("services.llm_service.LLMService.generate_completion", new=mock_gemini):
            res_hosp = await chat_ai_controller(email, "Show hospitals instead.", session_id=res_denied["session_id"])
    assert any("Hospital" in p["name"] for p in res_hosp["places"])

    with patch("services.llm_service.LLMService.generate_completion", new=mock_gemini):
        res_closest = await chat_ai_controller(email, "Which one is closest?", session_id=res_denied["session_id"])
        res_dir = await chat_ai_controller(email, "Give me directions.", session_id=res_denied["session_id"])
        res_diet = await chat_ai_controller(email, "Suggest a diet.", session_id=res_denied["session_id"])
        res_fit = await chat_ai_controller(email, "How can I improve my fitness?", session_id=res_denied["session_id"])
        res_prog = await chat_ai_controller(email, "Explain Python functions.", session_id=res_denied["session_id"])

    assert res_dir["manual_maps_url"] and "openstreetmap.org/directions" in res_dir["manual_maps_url"]
    assert any(a.get("path") == "/nutrition" for a in res_diet["actions"])
    assert any(a.get("path") == "/fitness" for a in res_fit["actions"])
    assert "Disclaimer" not in res_prog["reply"]

    await db.chat_history.delete_many({"user_email": email})


async def test_maps_http_routes_osm_provider():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    email = "maps_osm_user@healthpoint.app"
    await db.users.delete_many({"email": email})
    await db.users.insert_one({"name": "OSM User", "email": email, "role": "Patient", "is_verified": True})

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get("/api/maps/config")).status_code == 401
            tok = create_access_token({"sub": email, "role": "Patient"})
            cfg = await client.get("/api/maps/config", headers={"Authorization": f"Bearer {tok}"})
            assert cfg.status_code == 200
            assert cfg.json()["configured"] is True
            assert cfg.json()["provider"] == "openstreetmap"

            # Verify pharmacy endpoint returns real OSM data cleanly without fake stores
            pharm_payload = {
                "elements": [
                    {
                        "type": "node",
                        "id": 9001,
                        "lat": 12.9750,
                        "lon": 77.6020,
                        "tags": {
                            "name": "Cornerstone Chemist",
                            "amenity": "pharmacy",
                            "opening_hours": "24/7",
                            "addr:street": "Brigade Road",
                        },
                    }
                ]
            }
            clear_osm_cache()
            mock_pharm = _make_httpx_mock(200, pharm_payload)
            with patch("services.osm_service.httpx.AsyncClient", return_value=mock_pharm):
                ph_res = await client.get(
                    "/api/maps/nearby-pharmacies?lat=12.9716&lng=77.5946&filter_type=open_now",
                    headers={"Authorization": f"Bearer {tok}"},
                )
            assert ph_res.status_code == 200
            assert ph_res.json()["count"] == 1
            assert ph_res.json()["results"][0]["name"] == "Cornerstone Chemist"
            assert ph_res.json()["results"][0]["open_now"] is True
    finally:
        await db.users.delete_many({"email": email})


async def test_osm_overpass_mirror_fallback_on_406_and_502():
    clear_osm_cache()
    resp_406 = MagicMock()
    resp_406.status_code = 406
    resp_406.json = MagicMock(return_value={})

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json = MagicMock(return_value=_mock_overpass_payload())

    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(side_effect=[resp_406, resp_200])

    with patch("services.osm_service.httpx.AsyncClient", return_value=client):
        res = await search_nearby_osm_facilities(12.9716, 77.5946, specialty="Hospital", facility_mode="hospital")

    assert res["ok"] is True
    assert client.post.call_count == 2
    assert any("Hospital" in p["name"] for p in res["results"])
