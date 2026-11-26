import os
import pytest
from unittest.mock import patch, AsyncMock
from fastapi import HTTPException
from services.intent_service import detect_intent, IntentType
from services.llm_service import LLMService, LLMServiceException, get_configured_model
from services.document_service import extract_lab_markers, parse_prescription_text, save_file_locally
from database.mongodb import get_database
from controllers.ai_controller import (
    chat_ai_controller,
    generate_diet_controller,
    generate_fitness_controller,
    explain_medicine_controller,
    analyze_report_controller,
)

pytestmark = pytest.mark.asyncio

# 1. Greeting
async def test_01_greeting():
    intent = detect_intent("Hi")
    assert intent["intent"] == IntentType.GREETING
    assert intent["is_healthcare"] is False
    assert intent["requires_disclaimer"] is False
    
    res = await chat_ai_controller("test_user@healthpoint.app", "Hi")
    assert "reply" in res
    assert "Disclaimer" not in res["reply"]
    assert "🩺 Health Summary" not in res["reply"]

# 2. Casual Conversation
async def test_02_casual_conversation():
    intent = detect_intent("Tell me a joke.")
    assert intent["intent"] == IntentType.CASUAL
    assert intent["requires_disclaimer"] is False

    res = await chat_ai_controller("test_user@healthpoint.app", "Tell me a joke.")
    assert "reply" in res
    assert "Disclaimer" not in res["reply"]

# 3. General Knowledge
async def test_03_general_knowledge():
    intent = detect_intent("What is the capital of France?")
    assert intent["intent"] == IntentType.GENERAL_KNOWLEDGE
    assert intent["requires_disclaimer"] is False

# 4. Programming Explanation
async def test_04_programming_explanation():
    intent_py = detect_intent("Explain Python.")
    assert intent_py["intent"] == IntentType.PROGRAMMING
    
    intent_java = detect_intent("Help me with Java inheritance.")
    assert intent_java["intent"] == IntentType.PROGRAMMING
    assert intent_java["requires_disclaimer"] is False

    with patch(
        "services.llm_service.LLMService.generate_completion",
        new=AsyncMock(return_value="### Python Overview\n```python\nprint('hello')\n```"),
    ):
        res = await chat_ai_controller("test_user@healthpoint.app", "Explain Python.")
        assert "```python" in res["reply"] or "Python" in res["reply"]
        assert "Disclaimer" not in res["reply"]

# 5. Healthcare Question
async def test_05_healthcare_question():
    intent = detect_intent("What are the symptoms of diabetes?")
    assert intent["intent"] == IntentType.HEALTH_INFO
    assert intent["is_healthcare"] is True
    assert intent["requires_disclaimer"] is True

# 6. Personal BMI Question
async def test_06_personal_bmi_question():
    intent = detect_intent("What is my BMI?")
    assert intent["intent"] == IntentType.PERSONAL_HEALTH
    assert intent["requires_health_context"] is True

# 7. Medical Report Analysis
async def test_07_medical_report_analysis():
    sample_text = (
        "Complete Blood Count (CBC) Report\n"
        "Hemoglobin: 10.8 g/dL\n"
        "Fasting Blood Sugar: 128 mg/dL\n"
        "Platelet Count: 210000 /mcL\n"
    )
    markers = extract_lab_markers(sample_text)
    assert len(markers) >= 3
    
    hb = next((m for m in markers if m["test_name"] == "Hemoglobin"), None)
    assert hb is not None
    assert hb["measured_value"] == 10.8
    assert hb["status"] == "Low"

    glu = next((m for m in markers if "Glucose" in m["test_name"]), None)
    assert glu is not None
    assert glu["measured_value"] == 128.0
    assert glu["status"] == "High"

# 8. Prescription Extraction
async def test_08_prescription_extraction():
    rx_sample = (
        "Prescription\n"
        "Dr. Robert Kim, MD\n"
        "Patient: Alex Green\n"
        "Date: 15/10/2026\n"
        "Rx:\n"
        "Tab. Amoxicillin 500mg - twice daily after food\n"
        "Tab. Paracetamol 650mg - sos\n"
    )
    parsed = parse_prescription_text(rx_sample)
    assert parsed["doctor_name"] == "Dr. Robert Kim"
    assert parsed["patient_name"] == "Alex Green"
    assert len(parsed["medicines"]) >= 1
    assert "Amoxicillin" in parsed["medicines"][0]["name"]

# 9. Diet Plan
async def test_09_diet_plan():
    with patch(
        "services.llm_service.LLMService.generate_completion",
        new=AsyncMock(return_value="| Meal | Suggestion |\n|---|---|\n| Breakfast | Oats and berries |"),
    ):
        res = await generate_diet_controller(
            age=30, weight="70 kg", height="175 cm", goal="Weight loss", restrictions="No dairy"
        )
        assert "plan" in res
        assert len(res["plan"]) > 50

# 10. Workout Plan
async def test_10_workout_plan():
    with patch(
        "services.llm_service.LLMService.generate_completion",
        new=AsyncMock(return_value="### Workout Plan\n- Warm-up: 5 mins\n- Squats: 3x12"),
    ):
        res = await generate_fitness_controller(
            age=28, weight="72 kg", height="180 cm", fitness_level="Intermediate", goals="Build strength"
        )
        assert "plan" in res
        assert "Squat" in res["plan"] or "Workout" in res["plan"] or "Warm-up" in res["plan"]

# 11. Medicine Explanation
async def test_11_medicine_explanation():
    mock_json = (
        '{"uses": "Bacterial infection antibiotic.", "how_it_works": "Inhibits cell wall synthesis.", '
        '"common_side_effects": ["Nausea"], "precautions": ["Check penicillin allergy"], '
        '"alternatives": ["Azithromycin"], "dosage_tip": "Take as prescribed.", '
        '"when_to_see_doctor": "Seek care for rash.", "disclaimer": "Informational only."}'
    )
    with patch("services.llm_service.LLMService.generate_completion", new=AsyncMock(return_value=mock_json)):
        res = await explain_medicine_controller("test@healthpoint.app", "Amoxicillin")
        assert "medicine" in res
        exp = res["explanation"]
        assert "uses" in exp
        assert "how_it_works" in exp
        assert "common_side_effects" in exp
        assert "precautions" in exp

# 12. Follow-up Conversation
async def test_12_follow_up():
    intent = detect_intent("Can you elaborate on that?")
    assert intent["intent"] == IntentType.FOLLOW_UP

# 13. Unknown Intent
async def test_13_unknown_intent():
    intent = detect_intent("Supercalifragilisticexpialidocious")
    assert intent["intent"] == IntentType.UNKNOWN

# 14. Emergency-related Question
async def test_14_emergency_guidance():
    intent = detect_intent("I have severe chest pain and cannot breathe!")
    assert intent["intent"] == IntentType.EMERGENCY
    assert intent["is_healthcare"] is True
    
    res = await chat_ai_controller("test@healthpoint.app", "Severe chest pain cannot breathe")
    assert "EMERGENCY" in res["reply"]
    assert "911" in res["reply"] or "112" in res["reply"]


# 14b. Gemini configuration & missing API key gives clear error
async def test_14b_gemini_config_and_missing_key_error():
    configured = get_configured_model()
    assert configured
    assert "gemini" in configured.lower()

    llm = LLMService()
    with patch("services.llm_service.get_api_key", return_value=""):
        health = await llm.check_health()
        assert health["service"] == "Google Gemini Developer API"
        assert health["sdk"] == "google-genai"
        assert health["api_key_configured"] is False

        with pytest.raises(LLMServiceException) as key_exc:
            await llm.generate_completion(messages=[{"role": "user", "content": "hi"}])
        assert key_exc.value.status_code == 401
        assert "not configured" in str(key_exc.value).lower()

        chat_res = await chat_ai_controller("test_user@healthpoint.app", "What is Python?")
        assert chat_res["ai_available"] is False
        assert "gemini_api_key" in chat_res["reply"].lower() or "unavailable" in chat_res["reply"].lower()


# 14c. Required prompt behaviors (greetings, general knowledge, programming, health, and synthetic report)
async def test_14c_prompt_behaviors_and_synthetic_report():
    # 1, 2, 3, 4. Greetings, Casual, General AI, Programming -> no forced medical disclaimer
    for prompt_text, mock_reply in [
        ("Hi", "Hi there! How can I help you today?"),
        ("How are you?", "I'm doing well, thanks for asking! What can I help you with?"),
        ("Explain artificial intelligence.", "Artificial intelligence enables software systems to perform tasks such as reasoning and pattern recognition."),
        ("Explain Python functions.", "In Python, functions are defined with `def` to group reusable logic."),
        ("Explain what OCR is.", "OCR (Optical Character Recognition) converts images of text into machine-readable text."),
    ]:
        with patch(
            "services.llm_service.LLMService.generate_completion",
            new=AsyncMock(return_value=mock_reply),
        ):
            res = await chat_ai_controller("test_user@healthpoint.app", prompt_text)
            assert res["ai_available"] is True
            assert mock_reply in res["reply"]
            assert "Disclaimer" not in res["reply"]

    # 5 & 6. Health questions -> informational guidance with safety disclaimer
    for health_q, mock_reply in [
        ("What is blood pressure?", "Blood pressure measures the force of blood pushing against artery walls."),
        ("How can I improve my sleep cycle?", "Keep a consistent wake time and limit caffeine late in the day."),
    ]:
        with patch(
            "services.llm_service.LLMService.generate_completion",
            new=AsyncMock(return_value=mock_reply),
        ):
            res = await chat_ai_controller("test_user@healthpoint.app", health_q)
            assert res["ai_available"] is True
            assert mock_reply in res["reply"]
            assert "Disclaimer" in res["reply"]

    # 7. Synthetic report analysis without fabrication + disclaimer
    with patch(
        "services.llm_service.LLMService.generate_completion",
        new=AsyncMock(return_value="Review of uploaded synthetic panel: consult your physician for interpretation."),
    ):
        report_res = await analyze_report_controller(
            user_email="test_user@healthpoint.app",
            title="Synthetic Wellness Panel",
            category="Lab Report",
        )
        assert report_res["ai_available"] is True
        assert "Disclaimer" in report_res["analysis"]


# 14d. Gemini multimodal image input + user record isolation
async def test_14d_multimodal_image_report_and_record_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    stored_filename, local_path = save_file_locally(png_bytes, "lab_scan.png", folder="records")
    inserted = await db.records.insert_one({
        "user_email": "owner_img@healthpoint.app",
        "title": "Lipid Panel Scan",
        "category": "Lab Report",
        "stored_filename": stored_filename,
        "local_path": local_path,
    })
    record_id = str(inserted.inserted_id)

    try:
        captured = {}

        async def mock_gen(self, **kwargs):
            captured["image_bytes"] = kwargs.get("image_bytes")
            captured["image_mime"] = kwargs.get("image_mime")
            return "Synthetic image review: image received for inspection."

        with patch("services.llm_service.LLMService.generate_completion", new=mock_gen):
            res = await analyze_report_controller(
                user_email="owner_img@healthpoint.app",
                title="Lipid Panel Scan",
                category="Lab Report",
                record_id=record_id,
            )
            assert res["ai_available"] is True
            assert captured.get("image_bytes") == png_bytes
            assert captured.get("image_mime") == "image/png"
            assert "Disclaimer" in res["analysis"]

        # Another user must NOT be able to analyze or read owner's medical record
        with pytest.raises(HTTPException) as unauth_exc:
            await analyze_report_controller(
                user_email="other_user@healthpoint.app",
                title="Lipid Panel Scan",
                category="Lab Report",
                record_id=record_id,
            )
        assert unauth_exc.value.status_code == 404
    finally:
        await db.records.delete_one({"_id": inserted.inserted_id})
        if os.path.exists(local_path):
            os.remove(local_path)
