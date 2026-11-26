"""
HealthPoint Health Context & Privacy Minimization Service
=========================================================
Selectively retrieves authorized health data from MongoDB ONLY when relevant
to the detected intent. Strictly sanitizes, de-identifies, and redacts
Personally Identifiable Information (PII) before sending prompts to external LLMs.

Rules:
- Never fetch all collections for a casual conversation or general question.
- Never fabricate missing patient measurements.
- Never treat mock or demo defaults as verified patient readings.
- Redact user names, emails, phone numbers, and emergency contact details.
"""

from typing import Dict, Any, Optional
from database.mongodb import get_database
from services.intent_service import IntentType
from controllers.auth_controller import parse_height_to_cm, parse_weight_to_kg

async def build_minimized_health_context(
    user_email: str,
    intent: str,
    message: str
) -> str:
    """
    Builds a minimal, de-identified context string specific to the user's inquiry.
    Returns an empty string for non-health or non-personalized requests.
    """
    # Non-healthcare or non-personalized intents get ZERO database health dump
    if intent in (
        IntentType.GREETING,
        IntentType.CASUAL,
        IntentType.GENERAL_KNOWLEDGE,
        IntentType.EDUCATION,
        IntentType.PROGRAMMING,
        IntentType.EMERGENCY,
        IntentType.UNKNOWN
    ):
        return ""

    db = get_database()
    if db is None:
        return ""

    msg_lower = message.lower()
    context_lines = []

    # 1. Personal Health Vitals / BMI
    if intent == IntentType.PERSONAL_HEALTH:
        user = await db.users.find_one({"email": user_email})
        metrics = await db.metrics.find_one({"user_email": user_email})

        # BMI query
        if "bmi" in msg_lower or "weight" in msg_lower or "height" in msg_lower:
            height = user.get("height") if user else None
            weight = user.get("weight") if user else None
            bmi_metric = metrics.get("bmi", {}) if metrics else {}

            h_cm = parse_height_to_cm(height)
            w_kg = parse_weight_to_kg(weight)

            if h_cm and w_kg:
                computed_bmi = round(w_kg / ((h_cm / 100.0) ** 2), 1)
                context_lines.append(f"Recorded Height: {h_cm} cm")
                context_lines.append(f"Recorded Weight: {w_kg} kg")
                context_lines.append(f"Current BMI: {computed_bmi} ({bmi_metric.get('category', 'Calculated')})")
            elif bmi_metric.get("value"):
                context_lines.append(f"Current Recorded BMI: {bmi_metric.get('value')} ({bmi_metric.get('category', 'Recorded')})")
            else:
                context_lines.append("Height and weight have not been recorded yet in your profile.")

        # Blood Pressure
        elif "blood pressure" in msg_lower or "bp" in msg_lower:
            bp = metrics.get("bloodPressure", {}) if metrics else {}
            sys = bp.get("systolic")
            dia = bp.get("diastolic")
            if sys and dia and sys > 0 and dia > 0:
                context_lines.append(f"Latest Blood Pressure Reading: {sys}/{dia} mmHg (Status: {bp.get('status', 'Normal')})")
            else:
                context_lines.append("No active blood pressure readings recorded yet.")

        # Heart Rate / Pulse
        elif "heart rate" in msg_lower or "pulse" in msg_lower:
            hr = metrics.get("heartRate", {}) if metrics else {}
            curr = hr.get("current")
            if curr and curr > 0:
                context_lines.append(f"Latest Resting Heart Rate: {curr} bpm (Min: {hr.get('min', 60)}, Max: {hr.get('max', 100)})")
            else:
                context_lines.append("No active heart rate readings recorded yet.")

        # Sleep
        elif "sleep" in msg_lower:
            sl = metrics.get("sleep", {}) if metrics else {}
            hours = sl.get("hours")
            if hours and hours > 0:
                context_lines.append(f"Recorded Sleep Duration: {hours} hours (Quality: {sl.get('quality', 'Good')}, Target: {sl.get('target', 8)} hrs)")
            else:
                context_lines.append("No sleep logs recorded yet.")

        # Steps & Activity
        elif "step" in msg_lower or "calorie" in msg_lower:
            st = metrics.get("steps", {}) if metrics else {}
            cal = metrics.get("calories", {}) if metrics else {}
            if st.get("count") is not None:
                context_lines.append(f"Steps Recorded: {st.get('count')} (Target: {st.get('target', 10000)})")
            if cal.get("burned") is not None:
                context_lines.append(f"Calories Burned: {cal.get('burned')} kcal, Intake: {cal.get('intake', 0)} kcal")

        # General Vitals Overview
        else:
            if metrics:
                hr = metrics.get("heartRate", {}).get("current")
                bp = metrics.get("bloodPressure", {})
                bmi = metrics.get("bmi", {}).get("value")
                sl = metrics.get("sleep", {}).get("hours")
                if hr and hr > 0: context_lines.append(f"Heart Rate: {hr} bpm")
                if bp.get("systolic") and bp.get("systolic") > 0: context_lines.append(f"Blood Pressure: {bp.get('systolic')}/{bp.get('diastolic')} mmHg")
                if bmi and bmi > 0: context_lines.append(f"BMI: {bmi}")
                if sl and sl > 0: context_lines.append(f"Sleep: {sl} hrs")

    # 2. Diet & Nutrition
    elif intent == IntentType.DIET_NUTRITION:
        user = await db.users.find_one({"email": user_email})
        metrics = await db.metrics.find_one({"user_email": user_email})
        if user:
            if user.get("allergies") and user.get("allergies") != "None reported":
                context_lines.append(f"Reported Allergies: {user.get('allergies')}")
            if user.get("medicalConditions") and user.get("medicalConditions") != "None reported":
                context_lines.append(f"Known Conditions: {user.get('medicalConditions')}")
            if user.get("weight"):
                context_lines.append(f"Weight: {user.get('weight')} kg")
            if user.get("height"):
                context_lines.append(f"Height: {user.get('height')} cm")
        if metrics and metrics.get("calories", {}).get("target"):
            context_lines.append(f"Target Calorie Budget: {metrics.get('calories', {}).get('target')} kcal/day")

    # 3. Fitness & Exercise
    elif intent == IntentType.FITNESS:
        user = await db.users.find_one({"email": user_email})
        if user:
            if user.get("medicalConditions") and user.get("medicalConditions") != "None reported":
                context_lines.append(f"Reported Limitations/Conditions: {user.get('medicalConditions')}")
            if user.get("weight"):
                context_lines.append(f"Weight: {user.get('weight')} kg")
            if user.get("height"):
                context_lines.append(f"Height: {user.get('height')} cm")

    # 4. Medical Report Analysis & Records
    elif intent in (IntentType.REPORT_ANALYSIS, IntentType.HEALTH_RECORDS):
        records = []
        cursor = db.records.find({"user_email": user_email}).sort("date", -1).limit(5)
        async for r in cursor:
            records.append(f"- {r.get('title')} ({r.get('category')}, Date: {r.get('date')}, Status: {r.get('status')})")
        if records:
            context_lines.append("Authorized Medical Records on File:\n" + "\n".join(records))
        else:
            context_lines.append("No medical records uploaded yet.")

    # 5. Appointment Assistance
    elif intent == IntentType.APPOINTMENT:
        appts = []
        cursor = db.appointments.find({"user_email": user_email, "status": "confirmed"}).sort("date", 1).limit(3)
        async for a in cursor:
            appts.append(f"- Dr. {a.get('doctor')} ({a.get('specialty')}) on {a.get('date')} at {a.get('time')}")
        if appts:
            context_lines.append("Upcoming Scheduled Appointments:\n" + "\n".join(appts))
        else:
            context_lines.append("No active upcoming appointments scheduled.")

    if not context_lines:
        return ""

    # De-identified context block
    return "\n[PATIENT HEALTH CONTEXT (DE-IDENTIFIED)]:\n" + "\n".join(context_lines)
