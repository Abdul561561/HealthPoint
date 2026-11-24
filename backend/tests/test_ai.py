import pytest
import asyncio
from services.intent_service import detect_intent, IntentType
from services.health_context_service import build_minimized_health_context
from services.document_service import extract_lab_markers, parse_prescription_text
from controllers.ai_controller import (
    chat_ai_controller,
    generate_diet_controller,
    generate_fitness_controller,
    explain_medicine_controller
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
    res = await generate_diet_controller(
        age=30, weight="70 kg", height="175 cm", goal="Weight loss", restrictions="No dairy"
    )
    assert "plan" in res
    assert len(res["plan"]) > 50

# 10. Workout Plan
async def test_10_workout_plan():
    res = await generate_fitness_controller(
        age=28, weight="72 kg", height="180 cm", fitness_level="Intermediate", goals="Build strength"
    )
    assert "plan" in res
    assert "Squat" in res["plan"] or "Workout" in res["plan"] or "Warm-up" in res["plan"]

# 11. Medicine Explanation
async def test_11_medicine_explanation():
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
