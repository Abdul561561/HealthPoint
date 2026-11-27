import datetime
import pytest
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport

from main import app
from auth.jwt_handler import create_access_token, hash_password
from database.mongodb import get_database
from controllers.ai_controller import chat_ai_controller
from services.intent_service import detect_intent, IntentType

pytestmark = pytest.mark.asyncio


async def _capture_chat(user_email: str, message: str, mock_reply: str = "Mocked Gemini reply."):
    captured = {}

    async def mock_generate(self, **kwargs):
        captured["system_instruction"] = kwargs.get("system_instruction", "")
        captured["messages"] = kwargs.get("messages", [])
        return mock_reply

    with patch("services.llm_service.LLMService.generate_completion", new=mock_generate):
        res = await chat_ai_controller(user_email, message)
    return res, captured


async def test_personalized_non_medical_and_general_prompts():
    for prompt, expected_intent in [
        ("Hi", IntentType.GREETING),
        ("How are you?", IntentType.CASUAL),
        ("What is OCR?", IntentType.EDUCATION),
        ("Explain Python functions.", IntentType.PROGRAMMING),
    ]:
        detected = detect_intent(prompt)
        assert detected["intent"] == expected_intent
        res, captured = await _capture_chat("nonmed_test@healthpoint.app", prompt, f"Reply to {prompt}")
        assert res["context_used"] is False
        assert "Disclaimer" not in res["reply"]
        assert "AUTHORIZED DE-IDENTIFIED HEALTHPOINT USER CONTEXT" not in captured["system_instruction"]


async def test_personalized_health_context_end_to_end():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    user_a = "pers_a@healthpoint.app"
    user_b = "pers_b@healthpoint.app"
    now = datetime.datetime.now(datetime.timezone.utc)
    ts_old = (now - datetime.timedelta(days=3)).isoformat()
    ts_new = now.isoformat()

    # Clean up before seeding
    for em in (user_a, user_b):
        for col in ("users", "metrics", "records", "workouts", "prescriptions", "chat_history"):
            key = "email" if col == "users" else "user_email"
            await db[col].delete_many({key: em})

    await db.users.insert_one(
        {
            "name": "Alice SecretName",
            "email": user_a,
            "password_hash": hash_password("Pass123!"),
            "role": "Patient",
            "is_verified": True,
            "age": 34,
            "gender": "Female",
            "height": "165",
            "weight": "72.7",
            "bloodGroup": "O+",
            "medicalConditions": "Mild Hypertension",
            "allergies": "Penicillin",
            "phone": "+91-9999988888",
        }
    )
    await db.users.insert_one(
        {
            "name": "Bob OtherUser",
            "email": user_b,
            "password_hash": hash_password("Pass123!"),
            "role": "Patient",
            "is_verified": True,
        }
    )

    await db.metrics.insert_one(
        {
            "user_email": user_a,
            "heartRate": {"current": 75, "min": 60, "max": 100, "unit": "bpm", "status": "normal"},
            "bloodPressure": {"systolic": 120, "diastolic": 80, "unit": "mmHg", "status": "normal"},
            "sleep": {"hours": 7, "quality": "Good", "target": 8, "unit": "hrs"},
            "bmi": {"value": 26.7, "category": "Overweight"},
            "steps": {"count": 8250, "target": 10000, "unit": "steps"},
            "water": {"intake": 6, "target": 8, "unit": "glasses"},
            "history": {
                "heartRate": [{"current": 82, "recordedAt": ts_old}, {"current": 75, "recordedAt": ts_new}],
                "bloodPressure": [
                    {"systolic": 134, "diastolic": 86, "recordedAt": ts_old},
                    {"systolic": 120, "diastolic": 80, "recordedAt": ts_new},
                ],
                "sleep": [{"hours": 6.0, "recordedAt": ts_old}, {"hours": 7.0, "recordedAt": ts_new}],
            },
        }
    )

    await db.workouts.insert_one(
        {
            "user_email": user_a,
            "name": "Brisk Walk",
            "type": "Cardio",
            "duration": 35,
            "calories": 190,
            "completed": True,
            "date": "2026-11-27",
        }
    )
    await db.records.insert_one(
        {
            "user_email": user_a,
            "title": "Annual Metabolic Blood Report",
            "category": "Lab Reports",
            "date": "2026-11-25",
            "status": "normal",
            "extracted_text": "Hemoglobin: 10.8 g/dL\nFasting Blood Sugar: 128 mg/dL",
        }
    )
    await db.prescriptions.insert_one(
        {
            "user_email": user_a,
            "date": "2026-11-26",
            "analysis": {
                "doctor_name": "Dr. Nair",
                "medicines": [
                    {"name": "Metformin 500mg", "when_to_have": "1 tablet twice daily after meals", "how_it_helps": "Blood sugar control"}
                ],
            },
        }
    )

    try:
        # 5. "How is my health today?"
        res5, cap5 = await _capture_chat(
            user_a,
            "How is my health today?",
            "### Your Health Overview\nHeart Rate is 75 bpm.\n### Missing Information\nBlood glucose is not recorded.",
        )
        sys5 = cap5["system_instruction"]
        assert res5["intent"] == IntentType.HEALTH_OVERVIEW
        assert res5["context_used"] is True
        assert "75 bpm" in sys5
        assert "120/80 mmHg" in sys5
        assert "7 hrs" in sys5 or "7 hours" in sys5
        assert "26.7" in sys5
        assert "UTC" in sys5  # Timestamp present
        assert "Blood glucose" in sys5  # Explicit missing field
        assert "### Your Health Overview" in sys5
        assert "Alice SecretName" not in sys5
        assert user_a not in sys5
        assert "+91-9999988888" not in sys5
        assert "Disclaimer" in res5["reply"]

        # 6. Heart rate
        res6, cap6 = await _capture_chat(user_a, "Is my heart rate normal?")
        assert res6["context_used"] is True
        assert "75 bpm" in cap6["system_instruction"]

        # 7. Blood pressure
        res7, cap7 = await _capture_chat(user_a, "Explain my blood pressure.")
        assert res7["context_used"] is True
        assert "120/80 mmHg" in cap7["system_instruction"]

        # 8. Sleep
        res8, cap8 = await _capture_chat(user_a, "How was my sleep?")
        assert res8["context_used"] is True
        assert "7" in cap8["system_instruction"] and "sleep" in cap8["system_instruction"].lower()

        # 9. Fitness / Steps
        res9, cap9 = await _capture_chat(user_a, "How many steps did I complete?")
        assert res9["context_used"] is True
        assert "8250" in cap9["system_instruction"]

        # 10. Historical analysis
        res10, cap10 = await _capture_chat(user_a, "Am I improving?")
        assert res10["intent"] == IntentType.HEALTH_TREND
        assert res10["context_used"] is True
        assert "134" in cap10["system_instruction"] and "120" in cap10["system_instruction"]

        # 11. Missing metric (Blood glucose)
        res11, cap11 = await _capture_chat(user_a, "What is my blood glucose?")
        assert res11["context_used"] is True
        assert "not been recorded yet" in cap11["system_instruction"].lower()

        # 12a. Medical report biomarkers
        res12a, cap12a = await _capture_chat(user_a, "Explain my latest blood report.")
        assert res12a["intent"] == IntentType.REPORT_ANALYSIS
        assert "Annual Metabolic Blood Report" in cap12a["system_instruction"]
        assert "10.8" in cap12a["system_instruction"] and "128" in cap12a["system_instruction"]

        # 12b. Personal medications
        res12b, cap12b = await _capture_chat(user_a, "What medicines am I taking?")
        assert res12b["intent"] == IntentType.MEDICATION_PERSONAL
        assert "Metformin 500mg" in cap12b["system_instruction"]

        # 13. Cross-user isolation
        res_iso, cap_iso = await _capture_chat(user_b, "How is my health today?")
        assert "120/80 mmHg" not in cap_iso["system_instruction"]
        assert "Metformin 500mg" not in cap_iso["system_instruction"]
        assert "Alice SecretName" not in cap_iso["system_instruction"]

        # 13b. /api/ai/context HTTP endpoint auth & scoping
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            unauth = await client.get("/api/ai/context")
            assert unauth.status_code == 401

            tok_a = create_access_token({"sub": user_a, "role": "Patient"})
            ok_a = await client.get("/api/ai/context", headers={"Authorization": f"Bearer {tok_a}"})
            assert ok_a.status_code == 200
            data_a = ok_a.json()
            assert data_a["vitals"]["heartRate"]["value"] == 75
            assert data_a["vitals"]["bloodPressure"]["systolic"] == 120
            assert data_a["records_count"] == 1
            assert data_a["prescriptions_count"] == 1

            tok_b = create_access_token({"sub": user_b, "role": "Patient"})
            ok_b = await client.get("/api/ai/context", headers={"Authorization": f"Bearer {tok_b}"})
            assert ok_b.status_code == 200
            data_b = ok_b.json()
            assert data_b["vitals"]["heartRate"]["value"] is None
            assert data_b["records_count"] == 0
    finally:
        for em in (user_a, user_b):
            for col in ("users", "metrics", "records", "workouts", "prescriptions", "chat_history"):
                key = "email" if col == "users" else "user_email"
                await db[col].delete_many({key: em})
