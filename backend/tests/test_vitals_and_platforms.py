import pytest
from httpx import ASGITransport, AsyncClient

from auth.jwt_handler import create_access_token
from database.mongodb import get_database
from main import app

pytestmark = pytest.mark.asyncio


async def test_vitals_crud_validation_alerts_export_and_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    user_a = "vitals_user_a@healthpoint.app"
    user_b = "vitals_user_b@healthpoint.app"
    await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
    await db.users.insert_many([
        {"name": "Vitals A", "email": user_a, "role": "patient", "is_verified": True},
        {"name": "Vitals B", "email": user_b, "role": "patient", "is_verified": True},
    ])
    token_a = create_access_token({"sub": user_a, "role": "patient"})
    token_b = create_access_token({"sub": user_b, "role": "patient"})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Validation rejects out-of-range physiological values and systolic <= diastolic
            bad_bp = await client.post(
                "/api/vitals/readings",
                json={"systolic": 80, "diastolic": 110},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert bad_bp.status_code == 422

            empty_req = await client.post(
                "/api/vitals/readings",
                json={"notes": "empty"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert empty_req.status_code == 422

            # 2. Valid reading with fever & elevated BP produces informational alerts + BMI calculation
            create_resp = await client.post(
                "/api/vitals/readings",
                json={
                    "heart_rate": 84,
                    "systolic": 148,
                    "diastolic": 94,
                    "blood_glucose": 102,
                    "oxygen_saturation": 98,
                    "temperature_f": 101.2,
                    "weight_kg": 70.0,
                    "height_cm": 175.0,
                    "sleep_hours": 7.5,
                    "steps": 6500,
                    "water_glasses": 7,
                    "notes": "Morning check",
                },
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert create_resp.status_code == 200
            created = create_resp.json()
            assert created["bmi"] == 22.9
            assert created["source"] == "manual"
            assert any(a["metric"] == "Blood Pressure" for a in created["alerts"])
            assert any(a["metric"] == "Body Temperature" for a in created["alerts"])
            rid = created["id"]

            # 3. Missing values remain null when another reading only sets heart rate
            create_hr = await client.post(
                "/api/vitals/readings",
                json={"heart_rate": 72},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert create_hr.status_code == 200
            assert create_hr.json()["blood_glucose"] is None

            # 4. Update & Cross-user isolation
            upd_resp = await client.put(
                f"/api/vitals/readings/{rid}",
                json={"temperature_f": 98.6, "systolic": 122, "diastolic": 80},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert upd_resp.status_code == 200
            assert upd_resp.json()["temperature_f"] == 98.6

            iso_resp = await client.put(
                f"/api/vitals/readings/{rid}",
                json={"heart_rate": 99},
                headers={"Authorization": f"Bearer {token_b}"},
            )
            assert iso_resp.status_code == 404

            # 5. Summary & CSV/JSON Export
            sum_resp = await client.get("/api/vitals/summary?range=month", headers={"Authorization": f"Bearer {token_a}"})
            assert sum_resp.status_code == 200
            assert sum_resp.json()["total_readings"] == 2

            csv_resp = await client.get("/api/vitals/export?format=csv", headers={"Authorization": f"Bearer {token_a}"})
            assert csv_resp.status_code == 200
            assert "heart_rate,systolic,diastolic" in csv_resp.text

            # 6. Connected health platforms must NOT claim Connected without real OAuth/native sync
            plat_resp = await client.get("/api/vitals/platforms", headers={"Authorization": f"Bearer {token_a}"})
            assert plat_resp.status_code == 200
            platforms = plat_resp.json()
            assert len(platforms) == 4
            assert all(p["connected"] is False for p in platforms)

            sync_resp = await client.post("/api/vitals/platforms/fitbit/sync", headers={"Authorization": f"Bearer {token_a}"})
            assert sync_resp.status_code == 400

            # 7. Delete readings recalculates snapshot cleanly
            del_1 = await client.delete(f"/api/vitals/readings/{rid}", headers={"Authorization": f"Bearer {token_a}"})
            assert del_1.status_code == 200
    finally:
        await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
        await db.vitalReadings.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.metrics.delete_many({"user_email": {"$in": [user_a, user_b]}})


async def test_notifications_mark_unread_and_clear_read():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    user_email = "notif_unread_clear@healthpoint.app"
    await db.users.delete_many({"email": user_email})
    await db.users.insert_one({"name": "Notif Test", "email": user_email, "role": "patient", "is_verified": True})
    token = create_access_token({"sub": user_email, "role": "patient"})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            n1 = await client.post(
                "/api/notifications/",
                json={"title": "Check BP", "message": "Evening BP reading", "category": "vitals"},
                headers={"Authorization": f"Bearer {token}"},
            )
            n2 = await client.post(
                "/api/notifications/",
                json={"title": "Custom Goal", "message": "Stretch break", "category": "custom"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert n1.status_code == 200
            assert n2.status_code == 200
            id1 = n1.json()["id"]
            id2 = n2.json()["id"]

            await client.post(f"/api/notifications/{id1}/read", headers={"Authorization": f"Bearer {token}"})
            await client.post(f"/api/notifications/{id1}/unread", headers={"Authorization": f"Bearer {token}"})
            inbox = (await client.get("/api/notifications/", headers={"Authorization": f"Bearer {token}"})).json()
            assert next(x for x in inbox if x["id"] == id1)["read"] is False

            await client.post(f"/api/notifications/{id2}/read", headers={"Authorization": f"Bearer {token}"})
            clr_read = await client.delete("/api/notifications/clear-read", headers={"Authorization": f"Bearer {token}"})
            assert clr_read.status_code == 200
            inbox_after = (await client.get("/api/notifications/", headers={"Authorization": f"Bearer {token}"})).json()
            assert len(inbox_after) == 1
            assert inbox_after[0]["id"] == id1
    finally:
        await db.users.delete_many({"email": user_email})
        await db.notifications.delete_many({"user_email": user_email})
