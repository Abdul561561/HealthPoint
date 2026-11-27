import datetime
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from auth.jwt_handler import create_access_token
from controllers.notification_controller import evaluate_due_reminders
from database.mongodb import get_database
from main import app
from services.nutrition_service import (
    calculate_nutrients_for_grams,
    clear_food_cache,
    estimate_daily_nutrition_targets,
    search_curated_indian_foods,
    search_openfoodfacts,
    search_usda_foods,
)

pytestmark = pytest.mark.asyncio


def _make_httpx_get_mock(status_code: int, json_body):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json = MagicMock(return_value=json_body)
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(return_value=resp)
    return client


async def test_indian_food_dataset_and_serving_scaling():
    results = search_curated_indian_foods("masala dosa")
    assert len(results) >= 1
    dosa = results[0]
    assert dosa["source"] == "Curated Indian Dataset"
    assert dosa["per_100g"]["calories"] > 0

    scaled = calculate_nutrients_for_grams(
        {"calories": 100.0, "protein": 10.0, "carbs": 12.0, "fat": 2.0, "fiber": 3.0, "sugar": None, "sodium": None},
        150.0,
    )
    assert scaled["calories"] == 150
    assert scaled["protein"] == 15.0
    assert scaled["carbs"] == 18.0
    assert scaled["fat"] == 3.0
    assert scaled["fiber"] == 4.5
    assert scaled["sugar"] is None
    assert scaled["sodium"] is None


async def test_mocked_usda_and_openfoodfacts_preserves_missing_fields():
    clear_food_cache()
    usda_payload = {
        "foods": [
            {
                "fdcId": 171688,
                "description": "Banana, raw",
                "foodCategory": "Fruits",
                "foodNutrients": [
                    {"nutrientName": "Energy", "unitName": "KCAL", "value": 89},
                    {"nutrientName": "Protein", "value": 1.1},
                    {"nutrientName": "Carbohydrate, by difference", "value": 22.8},
                    {"nutrientName": "Total lipid (fat)", "value": 0.3},
                    {"nutrientName": "Fiber, total dietary", "value": 2.6},
                ],
            }
        ]
    }
    mock_client = _make_httpx_get_mock(200, usda_payload)
    with patch("services.nutrition_service.httpx.AsyncClient", return_value=mock_client):
        res = await search_usda_foods("banana")

    assert res["ok"] is True
    assert len(res["results"]) == 1
    item = res["results"][0]
    assert item["source"] == "USDA FoodData Central"
    assert item["per_100g"]["calories"] == 89.0
    assert item["per_100g"]["sugar"] is None
    assert item["per_100g"]["sodium"] is None

    off_barcode_payload = {
        "status": 1,
        "product": {
            "code": "8901058000001",
            "product_name": "Whole Grain Oats",
            "brands": "Sample Brand",
            "nutriments": {
                "energy-kcal_100g": 380,
                "proteins_100g": 13.0,
                "carbohydrates_100g": 67.0,
                "fat_100g": 7.0,
                "fiber_100g": 10.0,
            },
        },
    }
    mock_off = _make_httpx_get_mock(200, off_barcode_payload)
    with patch("services.nutrition_service.httpx.AsyncClient", return_value=mock_off):
        off_res = await search_openfoodfacts("8901058000001")
    assert off_res["ok"] is True
    assert off_res["results"][0]["barcode"] == "8901058000001"
    assert off_res["results"][0]["per_100g"]["calories"] == 380.0


async def test_mifflin_st_jeor_tdee_estimation():
    est = estimate_daily_nutrition_targets(
        age=30,
        weight_kg=70.0,
        height_cm=175.0,
        gender="male",
        activity_level="moderate",
        goal="lose",
    )
    assert est["estimated_from_profile"] is True
    assert 1500 <= est["calories"] <= 2600
    assert "not a medical prescription" in est["disclaimer"].lower()


async def test_nutrition_meal_crud_isolation_and_goals_endpoints():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    user_a = "nutri_user_a@healthpoint.app"
    user_b = "nutri_user_b@healthpoint.app"
    await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
    await db.users.insert_many([
        {"name": "Nutri User A", "email": user_a, "role": "patient", "is_verified": True},
        {"name": "Nutri User B", "email": user_b, "role": "patient", "is_verified": True},
    ])
    token_a = create_access_token({"sub": user_a, "role": "patient"})
    token_b = create_access_token({"sub": user_b, "role": "patient"})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Create custom food
            cf_resp = await client.post(
                "/api/nutrition/custom-foods",
                json={
                    "name": "Homemade Moong Dal Chilla",
                    "serving_label": "1 chilla (80 g)",
                    "serving_grams": 80,
                    "calories": 128,
                    "protein": 7.2,
                    "carbs": 17.6,
                    "fat": 2.8,
                    "fiber": 3.2,
                },
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert cf_resp.status_code == 200
            cf_id = cf_resp.json()["id"]

            # 2. Log meal on specific date
            log_resp = await client.post(
                "/api/nutrition/meals",
                json={
                    "name": "Idli (Steamed)",
                    "time": "Breakfast",
                    "date": "2026-11-20",
                    "quantity": 2,
                    "unit": "piece",
                    "grams": 80,
                    "calories": 117,
                    "protein": 4.0,
                    "carbs": 23.0,
                    "fat": 0.6,
                    "fiber": 1.6,
                    "source": "Curated Indian Foods",
                    "per_100g": {"calories": 146, "protein": 5.0, "carbs": 28.8, "fat": 0.7, "fiber": 2.0},
                },
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert log_resp.status_code == 200
            meal_id = log_resp.json()["id"]

            # 3. Edit quantity recalculates macros cleanly
            edit_resp = await client.put(
                f"/api/nutrition/meals/{meal_id}",
                json={"quantity": 4},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert edit_resp.status_code == 200
            assert edit_resp.json()["calories"] == 234
            assert edit_resp.json()["grams"] == 160.0

            # 4. Cross-user isolation
            iso_edit = await client.put(
                f"/api/nutrition/meals/{meal_id}",
                json={"quantity": 1},
                headers={"Authorization": f"Bearer {token_b}"},
            )
            assert iso_edit.status_code == 404

            # 5. Goals endpoint
            goal_put = await client.put(
                "/api/nutrition/goals",
                json={"calories": 2150, "protein": 135, "activity_level": "active", "goal": "maintain"},
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert goal_put.status_code == 200
            assert goal_put.json()["calories"] == 2150

            # 6. AI Diet planner grounded in logged foods
            with patch(
                "services.llm_service.LLMService.generate_completion",
                new=AsyncMock(return_value="Suggested balanced Indian lunch within your remaining calories."),
            ) as mock_llm:
                diet_resp = await client.post(
                    "/api/ai/diet",
                    json={
                        "age": 29,
                        "weight": "70 kg",
                        "height": "175 cm",
                        "goal": "maintain",
                        "date": "2026-11-20",
                        "question": "What should I eat for lunch?",
                    },
                    headers={"Authorization": f"Bearer {token_a}"},
                )
            assert diet_resp.status_code == 200
            prompt_sent = mock_llm.call_args.kwargs["messages"][0]["content"]
            assert "Idli (Steamed)" in prompt_sent
            assert "Remaining Calorie Budget" in prompt_sent

            # 7. Cleanup endpoints work
            del_meal = await client.delete(
                f"/api/nutrition/meals/{meal_id}",
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert del_meal.status_code == 200
            del_cf = await client.delete(
                f"/api/nutrition/custom-foods/{cf_id}",
                headers={"Authorization": f"Bearer {token_a}"},
            )
            assert del_cf.status_code == 200
    finally:
        await db.users.delete_many({"email": {"$in": [user_a, user_b]}})
        await db.meals.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.customFoods.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.nutritionGoals.delete_many({"user_email": {"$in": [user_a, user_b]}})
        await db.metrics.delete_many({"user_email": {"$in": [user_a, user_b]}})


async def test_notifications_reminders_scheduler_no_duplicates_and_no_appointments():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    user_email = "notif_scheduler_test@healthpoint.app"
    await db.users.delete_many({"email": user_email})
    await db.users.insert_one({"name": "Notif User", "email": user_email, "role": "patient", "is_verified": True})
    token = create_access_token({"sub": user_email, "role": "patient"})

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Appointment notification & reminder categories must be rejected (422)
            bad_notif = await client.post(
                "/api/notifications/",
                json={"title": "Clinic Visit", "message": "Appointment at 10am", "category": "appointment"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert bad_notif.status_code == 422

            bad_rem = await client.post(
                "/api/notifications/reminders",
                json={"title": "Doctor Checkup", "category": "appointment", "time_of_day": "09:00"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert bad_rem.status_code == 422

            # 2. Valid reminder creation (timezone Asia/Kolkata)
            rem_resp = await client.post(
                "/api/notifications/reminders",
                json={
                    "title": "Evening Medicine Dose",
                    "message": "Take Vitamin D3 after dinner",
                    "category": "medicine",
                    "time_of_day": "20:00",
                    "days": ["Fri"],
                    "timezone": "Asia/Kolkata",
                    "enabled": True,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            assert rem_resp.status_code == 200
            rem_id = rem_resp.json()["id"]

            # 2026-11-27 14:30 UTC == 2026-11-27 20:00 IST (Friday)
            due_utc = datetime.datetime(2026, 11, 27, 14, 30, tzinfo=datetime.timezone.utc)
            run1 = await evaluate_due_reminders(user_email=user_email, now_utc=due_utc)
            assert run1["triggered"] == 1

            # Running scheduler again in same minute MUST NOT duplicate notification
            run2 = await evaluate_due_reminders(user_email=user_email, now_utc=due_utc)
            assert run2["triggered"] == 0

            # 3. Verify Inbox fetch, route mapping, mark-read, delete, and clear-all
            inbox_resp = await client.get("/api/notifications/", headers={"Authorization": f"Bearer {token}"})
            assert inbox_resp.status_code == 200
            items = inbox_resp.json()
            assert len(items) == 1
            assert items[0]["category"] == "medicine"
            assert items[0]["route"] == "/pharmacy"
            notif_id = items[0]["id"]

            read_resp = await client.post(
                f"/api/notifications/{notif_id}/read",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert read_resp.status_code == 200

            del_notif = await client.delete(
                f"/api/notifications/{notif_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert del_notif.status_code == 200

            del_rem = await client.delete(
                f"/api/notifications/reminders/{rem_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert del_rem.status_code == 200
    finally:
        await db.users.delete_many({"email": user_email})
        await db.notifications.delete_many({"user_email": user_email})
        await db.reminders.delete_many({"user_email": user_email})
