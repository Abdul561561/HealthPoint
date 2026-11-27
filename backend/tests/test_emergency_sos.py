from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from auth.jwt_handler import create_access_token
from database.mongodb import get_database
from main import app

pytestmark = pytest.mark.asyncio


async def test_emergency_contacts_crud_phone_validation_and_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    user_a = "sos_contacts_a@healthpoint.app"
    user_b = "sos_contacts_b@healthpoint.app"
    await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
    await db.users.insert_many([
        {"name": "SOS User A", "email": user_a, "role": "patient", "is_verified": True},
        {"name": "SOS User B", "email": user_b, "role": "patient", "is_verified": True},
    ])
    token_a = create_access_token({"sub": user_a, "role": "patient"})
    token_b = create_access_token({"sub": user_b, "role": "patient"})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Invalid phone rejected (422)
            bad_ct = await client.post(
                "/api/emergency/contacts",
                json={"name": "Invalid", "relation": "Friend", "phone": "abc"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert bad_ct.status_code == 422

            # 2. Indian 10-digit mobile normalized to +91XXXXXXXXXX
            c1 = await client.post(
                "/api/emergency/contacts",
                json={"name": "Asha Sharma", "relation": "Mother", "phone": "9876543210", "priority": 1, "is_primary": True},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert c1.status_code == 200
            cid = c1.json()["id"]
            assert c1.json()["phone"] == "+919876543210"
            assert c1.json()["is_primary"] is True

            # 3. Update & cross-user isolation
            upd = await client.put(
                f"/api/emergency/contacts/{cid}",
                json={"relation": "Primary Guardian", "phone": "+447700900123"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert upd.status_code == 200
            assert upd.json()["phone"] == "+447700900123"

            iso = await client.put(
                f"/api/emergency/contacts/{cid}",
                json={"name": "Hijack"},
                headers={"Authorization": f"Bearer {token_b}"},
            )
            assert iso.status_code == 404

            del_res = await client.delete(
                f"/api/emergency/contacts/{cid}",
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert del_res.status_code == 200
    finally:
        await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
        await db.emergencyContacts.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.emergencyAuditLogs.delete_many({"user_email": {"$in": [user_a, user_b]}})


async def test_emergency_sos_gps_manual_sms_providers_duplicate_cancel_and_isolation(monkeypatch):
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    user_a = "sos_flow_a@healthpoint.app"
    user_b = "sos_flow_b@healthpoint.app"
    await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
    await db.users.insert_many([
        {"name": "Rohan Verma", "email": user_a, "role": "patient", "is_verified": True},
        {"name": "Other User", "email": user_b, "role": "patient", "is_verified": True},
    ])
    token_a = create_access_token({"sub": user_a, "role": "patient"})
    token_b = create_access_token({"sub": user_b, "role": "patient"})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                "/api/emergency/contacts",
                json={"name": "Priya Verma", "relation": "Sister", "phone": "9811122233", "is_primary": True},
                headers={"Authorization": f"Bearer {token_a}"},
            )

            # A. Manual SMS fallback when SMS_PROVIDER=none
            monkeypatch.setenv("SMS_PROVIDER", "none")
            sos_gps = await client.post(
                "/api/emergency/sos",
                json={
                    "latitude": 19.0760,
                    "longitude": 72.8777,
                    "accuracy_meters": 18.0,
                    "location_source": "gps",
                    "idempotency_key": "idem_gps_1",
                    "send_email_fallback": False,
                },
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert sos_gps.status_code == 200
            ev1 = sos_gps.json()
            assert "https://www.google.com/maps?q=19.076000,72.877700" == ev1["maps_url"]
            assert "EMERGENCY ALERT! Rohan Verma" in ev1["alert_message"]
            assert ev1["delivery_results"][0]["sms_status"] == "Manual Fallback Required"
            assert ev1["delivery_results"][0]["sms_composer_url"].startswith("sms:+919811122233")

            # B. Duplicate SOS protection rejects immediate duplicate (409)
            dup = await client.post(
                "/api/emergency/sos",
                json={"latitude": 19.0760, "longitude": 72.8777, "location_source": "gps", "idempotency_key": "idem_gps_1"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert dup.status_code == 409

            # C. Cross-user location/cancel protection
            assert (await client.get(f"/api/emergency/sos/{ev1['id']}/location", headers={"Authorization": f"Bearer {token_b}"})).status_code == 404
            assert (await client.post(f"/api/emergency/sos/{ev1['id']}/cancel", headers={"Authorization": f"Bearer {token_b}"})).status_code == 404

            # D. Cancel SOS & clear active lock
            cancelled = await client.post(
                f"/api/emergency/sos/{ev1['id']}/cancel",
                json={"reason": "False alarm"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert cancelled.status_code == 200
            assert cancelled.json()["status"] == "cancelled"
            assert cancelled.json()["location_sharing_active"] is False

            # E. Mocked SMS webhook provider delivery ("Sent") when GPS denied (manual location)
            monkeypatch.setenv("SMS_PROVIDER", "webhook")
            monkeypatch.setenv("SMS_WEBHOOK_URL", "https://sms-gateway.test/send")
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json = MagicMock(return_value={"status": "Sent", "message_id": "msg_999"})
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)

            with patch("services.emergency_notification_service.httpx.AsyncClient", return_value=mock_client):
                sos_manual = await client.post(
                    "/api/emergency/sos",
                    json={
                        "latitude": None,
                        "longitude": None,
                        "location_source": "manual",
                        "location_label": "Manually Provided: Anna Nagar, Chennai 600040",
                        "send_email_fallback": False,
                    },
                    headers={"Authorization": f"Bearer {token_a}"},
                )
            assert sos_manual.status_code == 200
            ev2 = sos_manual.json()
            assert ev2["delivery_results"][0]["sms_status"] == "Sent"
            assert ev2["delivery_results"][0]["provider_message_id"] == "msg_999"

            # F. Provider timeout test -> Failed status
            await client.post(f"/api/emergency/sos/{ev2['id']}/cancel", headers={"Authorization": f"Bearer {token_a}"})
            import httpx as real_httpx
            timeout_client = MagicMock()
            timeout_client.__aenter__ = AsyncMock(return_value=timeout_client)
            timeout_client.__aexit__ = AsyncMock(return_value=False)
            timeout_client.post = AsyncMock(side_effect=real_httpx.TimeoutException("Timed out"))

            with patch("services.emergency_notification_service.httpx.AsyncClient", return_value=timeout_client):
                sos_timeout = await client.post(
                    "/api/emergency/sos",
                    json={"latitude": None, "longitude": None, "location_source": "unavailable", "send_email_fallback": False},
                    headers={"Authorization": f"Bearer {token_a}"},
                )
            assert sos_timeout.status_code == 200
            assert sos_timeout.json()["delivery_results"][0]["sms_status"] == "Failed"

            # G. Verify Emergency History count & notifications
            hist = await client.get("/api/emergency/history", headers={"Authorization": f"Bearer {token_a}"})
            assert hist.status_code == 200
            assert len(hist.json()) == 3
    finally:
        await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
        await db.emergencyContacts.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.emergencies.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.emergencyAuditLogs.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.notifications.delete_many({"user_email": {"$in": [user_a, user_b]}})
