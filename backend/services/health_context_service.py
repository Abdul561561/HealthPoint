"""
HealthPoint Personal Health Context Engine
==========================================
Retrieves strictly authorized, de-identified, query-scoped health data from MongoDB
ONLY when relevant to the authenticated user's question.

Core Guarantees:
1. Authenticated ownership only (server-derived `user_email`, never frontend IDs).
2. Minimal data exposure: never send name, email, phone, address, or emergency contacts to LLMs.
3. Explicit timestamps and clear separation between current measurements vs historical trends.
4. Zero fabrication: missing metrics are explicitly flagged as not recorded / not provided.
"""

import re
from typing import Any, Dict, List, Optional
from database.mongodb import get_database
from services.intent_service import IntentType, PERSONAL_CONTEXT_INTENTS
from services.document_service import extract_lab_markers
from controllers.auth_controller import parse_height_to_cm, parse_weight_to_kg


def _is_meaningful(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, str):
        return bool(val.strip()) and val.strip().lower() not in (
            "not provided",
            "none",
            "none reported",
            "n/a",
            "not recorded",
        )
    if isinstance(val, (int, float)):
        return val > 0
    return True


def _latest_timestamp(history: dict, key: str) -> Optional[str]:
    entries = history.get(key) if isinstance(history, dict) else None
    if isinstance(entries, list) and entries:
        ts = entries[-1].get("recordedAt")
        if ts:
            return str(ts)
    return None


def _format_ts(ts: Optional[str]) -> str:
    if not ts:
        return "timestamp not recorded"
    return f"recorded at {ts[:19].replace('T', ' ')} UTC"


def _scrub_pii(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[REDACTED_EMAIL]", text)
    cleaned = re.sub(r"(?im)^(patient(\s+name)?|email|phone|mobile|address)\s*:.*$", "[REDACTED_PII]", cleaned)
    return cleaned


def _summarize_history_series(history: dict, key: str, value_field: str, unit: str = "") -> Dict[str, Any]:
    entries = history.get(key) if isinstance(history, dict) else None
    if not isinstance(entries, list):
        return {"count": 0, "readings": []}
    pts = []
    for e in entries[-7:]:
        if isinstance(e, dict) and isinstance(e.get(value_field), (int, float)) and e[value_field] > 0:
            pts.append({"value": e[value_field], "recordedAt": e.get("recordedAt")})
    if len(pts) < 2:
        return {"count": len(pts), "readings": pts, "summary": f"Only {len(pts)} reading(s) stored; insufficient history for trend comparison."}
    first = pts[0]
    last = pts[-1]
    delta = round(float(last["value"]) - float(first["value"]), 2)
    sign = "+" if delta > 0 else ""
    u = f" {unit}" if unit else ""
    return {
        "count": len(pts),
        "readings": pts,
        "summary": (
            f"{len(pts)} recorded points from {first['value']}{u} ({_format_ts(first.get('recordedAt'))}) "
            f"to {last['value']}{u} ({_format_ts(last.get('recordedAt'))}), net change: {sign}{delta}{u}"
        ),
    }


def _collect_vitals_snapshot(user: Optional[dict], metrics: Optional[dict]) -> Dict[str, Any]:
    metrics = metrics or {}
    history = metrics.get("history", {}) if isinstance(metrics.get("history"), dict) else {}

    hr = metrics.get("heartRate", {}) or {}
    bp = metrics.get("bloodPressure", {}) or {}
    sl = metrics.get("sleep", {}) or {}
    st = metrics.get("steps", {}) or {}
    cal = metrics.get("calories", {}) or {}
    wat = metrics.get("water", {}) or {}
    oxy = metrics.get("oxygen", {}) or {}
    temp = metrics.get("temperature", {}) or {}
    bmi_m = metrics.get("bmi", {}) or {}
    wt_m = metrics.get("weight", {}) or {}
    glu_m = metrics.get("bloodGlucose", {}) or {}

    h_cm = parse_height_to_cm(user.get("height")) if user else None
    w_kg = wt_m.get("current") if _is_meaningful(wt_m.get("current")) else (parse_weight_to_kg(user.get("weight")) if user else None)

    bmi_val = bmi_m.get("value") if _is_meaningful(bmi_m.get("value")) else None
    bmi_cat = bmi_m.get("category") if _is_meaningful(bmi_m.get("category")) else None
    if bmi_val is None and h_cm and w_kg:
        bmi_val = round(float(w_kg) / ((float(h_cm) / 100.0) ** 2), 1)
        if bmi_val < 18.5:
            bmi_cat = "Underweight"
        elif bmi_val < 25.0:
            bmi_cat = "Normal"
        elif bmi_val < 30.0:
            bmi_cat = "Overweight"
        else:
            bmi_cat = "Obese"

    snapshot = {
        "heartRate": {
            "recorded": _is_meaningful(hr.get("current")),
            "value": hr.get("current") if _is_meaningful(hr.get("current")) else None,
            "unit": "bpm",
            "status": hr.get("status"),
            "timestamp": _latest_timestamp(history, "heartRate"),
        },
        "bloodPressure": {
            "recorded": _is_meaningful(bp.get("systolic")) and _is_meaningful(bp.get("diastolic")),
            "systolic": bp.get("systolic") if _is_meaningful(bp.get("systolic")) else None,
            "diastolic": bp.get("diastolic") if _is_meaningful(bp.get("diastolic")) else None,
            "unit": "mmHg",
            "status": bp.get("status"),
            "timestamp": _latest_timestamp(history, "bloodPressure"),
        },
        "sleep": {
            "recorded": _is_meaningful(sl.get("hours")),
            "hours": sl.get("hours") if _is_meaningful(sl.get("hours")) else None,
            "quality": sl.get("quality") if _is_meaningful(sl.get("quality")) else None,
            "target": sl.get("target") or 8,
            "unit": "hrs",
            "timestamp": _latest_timestamp(history, "sleep"),
        },
        "bmi": {
            "recorded": _is_meaningful(bmi_val),
            "value": bmi_val,
            "category": bmi_cat or "Not provided",
            "timestamp": _latest_timestamp(history, "bmi"),
        },
        "steps": {
            "recorded": isinstance(st.get("count"), (int, float)) and st.get("count") > 0,
            "count": st.get("count") if isinstance(st.get("count"), (int, float)) and st.get("count") > 0 else None,
            "target": st.get("target"),
            "timestamp": _latest_timestamp(history, "steps"),
        },
        "calories": {
            "burned": cal.get("burned") if isinstance(cal.get("burned"), (int, float)) else None,
            "intake": cal.get("intake") if isinstance(cal.get("intake"), (int, float)) else None,
            "target": cal.get("target"),
        },
        "water": {
            "recorded": isinstance(wat.get("intake"), (int, float)) and wat.get("intake") > 0,
            "intake": wat.get("intake") if isinstance(wat.get("intake"), (int, float)) and wat.get("intake") > 0 else None,
            "target": wat.get("target") or 8,
            "unit": "glasses",
            "timestamp": _latest_timestamp(history, "water"),
        },
        "oxygen": {
            "recorded": _is_meaningful(oxy.get("level")),
            "level": oxy.get("level") if _is_meaningful(oxy.get("level")) else None,
            "unit": "%",
            "timestamp": _latest_timestamp(history, "oxygen"),
        },
        "temperature": {
            "recorded": _is_meaningful(temp.get("value")),
            "value": temp.get("value") if _is_meaningful(temp.get("value")) else None,
            "unit": "°F",
            "timestamp": _latest_timestamp(history, "temperature"),
        },
        "bloodGlucose": {
            "recorded": _is_meaningful(glu_m.get("value")),
            "value": glu_m.get("value") if _is_meaningful(glu_m.get("value")) else None,
            "unit": glu_m.get("unit") or "mg/dL",
            "timestamp": _latest_timestamp(history, "bloodGlucose"),
        },
        "height_cm": h_cm,
        "weight_kg": w_kg,
    }
    return snapshot


async def build_structured_health_context(
    user_email: str,
    intent: str,
    message: str,
) -> Dict[str, Any]:
    """
    Retrieves scoped, strictly de-identified health context ONLY for personal health intents.
    Returns a structured dict containing `used`, `sources`, `missing_fields`, `data`, and `prompt_text`.
    """
    if intent not in PERSONAL_CONTEXT_INTENTS:
        return {
            "used": False,
            "sources": [],
            "missing_fields": [],
            "data": {},
            "prompt_text": "",
        }

    db = get_database()
    if db is None:
        return {
            "used": False,
            "sources": [],
            "missing_fields": [],
            "data": {},
            "prompt_text": "",
        }

    msg_lower = message.lower()
    user = await db.users.find_one({"email": user_email})
    metrics = await db.metrics.find_one({"user_email": user_email})
    history = (metrics or {}).get("history", {}) if isinstance((metrics or {}).get("history"), dict) else {}
    snap = _collect_vitals_snapshot(user, metrics)

    lines: List[str] = []
    sources: List[str] = []
    missing_fields: List[str] = []
    payload_data: Dict[str, Any] = {}

    def _add_profile_basics(include_conditions: bool = True):
        if not user:
            missing_fields.append("Profile demographics (age, gender)")
            return
        prof_parts = []
        if _is_meaningful(user.get("age")):
            prof_parts.append(f"Age: {user['age']} years")
        else:
            missing_fields.append("Age")
        if _is_meaningful(user.get("gender")):
            prof_parts.append(f"Gender: {user['gender']}")
        if _is_meaningful(user.get("bloodGroup")):
            prof_parts.append(f"Blood Group: {user['bloodGroup']}")
        if snap["height_cm"]:
            prof_parts.append(f"Height: {snap['height_cm']} cm")
        if snap["weight_kg"]:
            prof_parts.append(f"Weight: {snap['weight_kg']} kg")
        if include_conditions:
            if _is_meaningful(user.get("medicalConditions")):
                prof_parts.append(f"Medical Conditions: {user['medicalConditions']}")
            else:
                prof_parts.append("Medical Conditions: None provided in profile")
            if _is_meaningful(user.get("allergies")):
                prof_parts.append(f"Allergies: {user['allergies']}")
            else:
                prof_parts.append("Allergies: None provided in profile")
        if prof_parts:
            sources.append("Profile")
            lines.append("De-identified Profile: " + " | ".join(prof_parts))

    # --- A. Comprehensive Health Overview ("How is my health today?", "What should I improve?") ---
    if intent == IntentType.HEALTH_OVERVIEW:
        _add_profile_basics(include_conditions=True)
        sources.append("Recorded Vitals")

        vitals_lines = []
        if snap["heartRate"]["recorded"]:
            vitals_lines.append(
                f"- Heart Rate: {snap['heartRate']['value']} bpm ({_format_ts(snap['heartRate']['timestamp'])})"
            )
        else:
            missing_fields.append("Heart rate")

        if snap["bloodPressure"]["recorded"]:
            vitals_lines.append(
                f"- Blood Pressure: {snap['bloodPressure']['systolic']}/{snap['bloodPressure']['diastolic']} mmHg ({_format_ts(snap['bloodPressure']['timestamp'])})"
            )
        else:
            missing_fields.append("Blood pressure")

        if snap["sleep"]["recorded"]:
            q = f", Quality: {snap['sleep']['quality']}" if snap["sleep"]["quality"] else ""
            vitals_lines.append(
                f"- Sleep Duration: {snap['sleep']['hours']} hrs{q} ({_format_ts(snap['sleep']['timestamp'])})"
            )
        else:
            missing_fields.append("Sleep duration")

        if snap["bmi"]["recorded"]:
            vitals_lines.append(
                f"- BMI: {snap['bmi']['value']} ({snap['bmi']['category']}) ({_format_ts(snap['bmi']['timestamp'])})"
            )
        else:
            missing_fields.append("BMI / Height & Weight")

        if snap["steps"]["recorded"]:
            tgt = f" / target {snap['steps']['target']}" if snap["steps"]["target"] else ""
            vitals_lines.append(
                f"- Steps: {snap['steps']['count']}{tgt} ({_format_ts(snap['steps']['timestamp'])})"
            )
        else:
            missing_fields.append("Daily steps / activity")

        if snap["water"]["recorded"]:
            vitals_lines.append(
                f"- Water Intake: {snap['water']['intake']} / {snap['water']['target']} glasses ({_format_ts(snap['water']['timestamp'])})"
            )
        else:
            missing_fields.append("Water intake")

        if snap["oxygen"]["recorded"]:
            vitals_lines.append(
                f"- Blood Oxygen (SpO2): {snap['oxygen']['level']}% ({_format_ts(snap['oxygen']['timestamp'])})"
            )
        else:
            missing_fields.append("Blood oxygen (SpO2)")

        if snap["temperature"]["recorded"]:
            vitals_lines.append(
                f"- Body Temperature: {snap['temperature']['value']} °F ({_format_ts(snap['temperature']['timestamp'])})"
            )

        if snap["bloodGlucose"]["recorded"]:
            vitals_lines.append(
                f"- Blood Glucose: {snap['bloodGlucose']['value']} {snap['bloodGlucose']['unit']} ({_format_ts(snap['bloodGlucose']['timestamp'])})"
            )
        else:
            missing_fields.append("Blood glucose / HbA1c")

        if snap["calories"]["intake"] is not None or snap["calories"]["burned"] is not None:
            vitals_lines.append(
                f"- Calories: Intake={snap['calories']['intake'] if snap['calories']['intake'] is not None else 'Not logged'} kcal, "
                f"Burned={snap['calories']['burned'] if snap['calories']['burned'] is not None else 'Not logged'} kcal"
            )

        if vitals_lines:
            lines.append("Latest Recorded Measurements:\n" + "\n".join(vitals_lines))
        else:
            lines.append("Latest Recorded Measurements: No vitals have been recorded yet.")

        # Historical Trends (if >=2 readings exist)
        trend_notes = []
        for k, field, label, unit in [
            ("heartRate", "current", "Heart Rate", "bpm"),
            ("bloodPressure", "systolic", "Systolic BP", "mmHg"),
            ("sleep", "hours", "Sleep", "hrs"),
            ("steps", "count", "Steps", "steps"),
        ]:
            t = _summarize_history_series(history, k, field, unit)
            if t["count"] >= 2:
                trend_notes.append(f"- {label}: {t['summary']}")
        if trend_notes:
            sources.append("Health Trends")
            lines.append("Historical Trends (Verified Past Readings):\n" + "\n".join(trend_notes))
        else:
            lines.append("Historical Trends: Insufficient multi-day readings stored for reliable trend comparison.")

        # Workouts, Meals, Prescriptions & Records brief check
        wk_count = await db.workouts.count_documents({"user_email": user_email, "completed": True})
        meal_count = await db.meals.count_documents({"user_email": user_email})
        if wk_count > 0 or meal_count > 0:
            sources.append("Fitness & Nutrition")
            lines.append(f"Logged Activity Modules: {wk_count} completed workout(s), {meal_count} logged meal(s).")

        rx_doc = await db.prescriptions.find_one({"user_email": user_email}, sort=[("date", -1), ("_id", -1)])
        if rx_doc and (rx_doc.get("analysis") or {}).get("medicines"):
            sources.append("Prescriptions")
            meds = [m.get("name") for m in rx_doc["analysis"]["medicines"] if m.get("name")]
            if meds:
                lines.append(f"Latest Uploaded Prescription ({rx_doc.get('date', 'undated')}): {', '.join(meds[:6])}")
        else:
            missing_fields.append("Current prescription / active medications list")

        rec_count = await db.records.count_documents({"user_email": user_email})
        if rec_count > 0:
            sources.append("Medical Records")
            lines.append(f"Uploaded Medical Records Count: {rec_count} file(s).")
        else:
            missing_fields.append("Uploaded laboratory reports")

    # --- B. Trends & History ("Am I improving?", "How was my sleep this week?") ---
    elif intent == IntentType.HEALTH_TREND:
        sources.append("Health Trends")
        _add_profile_basics(include_conditions=False)
        series_map = [
            ("heartRate", "current", "Heart Rate", "bpm"),
            ("bloodPressure", "systolic", "Blood Pressure (Systolic)", "mmHg"),
            ("sleep", "hours", "Sleep Duration", "hrs"),
            ("steps", "count", "Steps", "steps"),
            ("water", "intake", "Water Intake", "glasses"),
            ("weight", "current", "Weight", "kg"),
        ]
        trend_lines = []
        for k, field, label, unit in series_map:
            t = _summarize_history_series(history, k, field, unit)
            if t["count"] > 0:
                trend_lines.append(f"- {label}: {t['summary']}")
        if trend_lines:
            lines.append("Historical Measurement Logs:\n" + "\n".join(trend_lines))
        else:
            lines.append("Historical Measurement Logs: No historical readings recorded yet.")
            missing_fields.append("Historical time-series readings (at least 2 logged measurements per metric)")

        workouts = []
        async for w in db.workouts.find({"user_email": user_email}).sort("date", -1).limit(5):
            workouts.append(
                f"- {w.get('date', 'N/A')}: {w.get('name')} ({w.get('type')}, {w.get('duration')} min, {w.get('calories')} kcal, completed={w.get('completed')})"
            )
        if workouts:
            sources.append("Fitness")
            lines.append("Recent Logged Workouts:\n" + "\n".join(workouts))

    # --- C. Personal Medication / Pharmacy ("What medicines am I taking?") ---
    elif intent in (IntentType.MEDICATION_PERSONAL, IntentType.PHARMACY):
        sources.append("Pharmacy & Prescriptions")
        rx_list = []
        async for rx in db.prescriptions.find({"user_email": user_email}).sort("date", -1).limit(3):
            analysis = rx.get("analysis") or {}
            meds = analysis.get("medicines") or []
            med_strs = [
                f"{m.get('name')} ({m.get('when_to_have', 'timing not specified')})"
                for m in meds
                if m.get("name")
            ]
            if med_strs:
                rx_list.append(f"- Prescription ({rx.get('date', 'Date not recorded')}): " + "; ".join(med_strs))

        orders_list = []
        async for ord_doc in db.orders.find({"user_email": user_email}).sort("date", -1).limit(3):
            items = [f"{it.get('name', 'Item')} x{it.get('quantity', 1)}" for it in ord_doc.get("items", [])]
            if items:
                orders_list.append(f"- Order ({ord_doc.get('date', 'N/A')}, Status: {ord_doc.get('status')}): {', '.join(items)}")

        if rx_list:
            lines.append("Uploaded Prescriptions & Extracted Medications:\n" + "\n".join(rx_list))
        else:
            lines.append("Uploaded Prescriptions: No active prescription documents uploaded yet.")
            missing_fields.append("Uploaded prescription or active medication list")
        if orders_list:
            lines.append("Pharmacy Orders:\n" + "\n".join(orders_list))

    # --- D. Medical Reports & Records ("Explain my latest blood report") ---
    elif intent in (IntentType.REPORT_ANALYSIS, IntentType.HEALTH_RECORDS):
        sources.append("Medical Records")
        rec_blocks = []
        async for r in db.records.find({"user_email": user_email}).sort("date", -1).limit(5):
            block = f"- {r.get('title')} (Category: {r.get('category')}, Date: {r.get('date')}, Status: {r.get('status')})"
            raw_txt = r.get("extracted_text") or ""
            if raw_txt:
                markers = extract_lab_markers(raw_txt)
                if markers:
                    marker_summary = ", ".join(
                        f"{m['test_name']}: {m['measured_value']} {m['unit']} (Ref: {m['reference_range']}, Status: {m['status']})"
                        for m in markers[:10]
                    )
                    block += f"\n  Extracted Biomarkers: {marker_summary}"
                else:
                    block += f"\n  Extracted Text Snippet: {_scrub_pii(raw_txt[:500])}"
            rec_blocks.append(block)
        if rec_blocks:
            lines.append("Authorized Medical Records on File:\n" + "\n".join(rec_blocks))
        else:
            lines.append("No medical records have been uploaded yet.")
            missing_fields.append("Uploaded medical reports")

    # --- E. Specific Personal Metric Queries ---
    elif intent == IntentType.PERSONAL_HEALTH:
        sources.append("Recorded Vitals")
        if "bmi" in msg_lower or "weight" in msg_lower or "height" in msg_lower or "overweight" in msg_lower:
            _add_profile_basics(include_conditions=False)
            if snap["bmi"]["recorded"]:
                lines.append(
                    f"Latest BMI: {snap['bmi']['value']} ({snap['bmi']['category']}) ({_format_ts(snap['bmi']['timestamp'])})"
                )
            else:
                lines.append("Height and weight / BMI have not been recorded yet in your profile.")
                missing_fields.append("Height and weight / BMI")

        elif "blood pressure" in msg_lower or "bp" in msg_lower:
            _add_profile_basics(include_conditions=True)
            if snap["bloodPressure"]["recorded"]:
                lines.append(
                    f"Latest Blood Pressure Reading: {snap['bloodPressure']['systolic']}/{snap['bloodPressure']['diastolic']} mmHg "
                    f"(Status: {snap['bloodPressure']['status'] or 'Recorded'}, {_format_ts(snap['bloodPressure']['timestamp'])})"
                )
                t = _summarize_history_series(history, "bloodPressure", "systolic", "mmHg")
                if t["count"] >= 2:
                    lines.append(f"Historical Systolic BP: {t['summary']}")
            else:
                lines.append("No active blood pressure readings recorded yet.")
                missing_fields.append("Blood pressure reading")

        elif "heart rate" in msg_lower or "pulse" in msg_lower:
            _add_profile_basics(include_conditions=False)
            if snap["heartRate"]["recorded"]:
                lines.append(
                    f"Latest Resting Heart Rate: {snap['heartRate']['value']} bpm "
                    f"(Normal range: 60-100 bpm, {_format_ts(snap['heartRate']['timestamp'])})"
                )
                t = _summarize_history_series(history, "heartRate", "current", "bpm")
                if t["count"] >= 2:
                    lines.append(f"Historical Heart Rate: {t['summary']}")
            else:
                lines.append("No active heart rate readings recorded yet.")
                missing_fields.append("Heart rate reading")

        elif "sleep" in msg_lower:
            if snap["sleep"]["recorded"]:
                lines.append(
                    f"Latest Sleep Duration: {snap['sleep']['hours']} hours "
                    f"(Quality: {snap['sleep']['quality'] or 'Not specified'}, Target: {snap['sleep']['target']} hrs, "
                    f"{_format_ts(snap['sleep']['timestamp'])})"
                )
                t = _summarize_history_series(history, "sleep", "hours", "hrs")
                if t["count"] > 0:
                    lines.append(f"Sleep History: {t['summary']}")
            else:
                lines.append("Sleep duration has not been recorded yet.")
                missing_fields.append("Sleep duration")

        elif "step" in msg_lower or "calorie" in msg_lower or "activity" in msg_lower:
            sources.append("Fitness")
            if snap["steps"]["recorded"]:
                lines.append(
                    f"Steps Recorded: {snap['steps']['count']} "
                    f"(Target: {snap['steps']['target'] or 'Not set'}, {_format_ts(snap['steps']['timestamp'])})"
                )
            else:
                lines.append("Step count has not been recorded yet.")
                missing_fields.append("Daily steps")
            if snap["calories"]["burned"] is not None or snap["calories"]["intake"] is not None:
                lines.append(
                    f"Calories Burned: {snap['calories']['burned'] or 0} kcal | Intake: {snap['calories']['intake'] or 0} kcal"
                )
            workouts = []
            async for w in db.workouts.find({"user_email": user_email}).sort("date", -1).limit(5):
                workouts.append(f"- {w.get('date')}: {w.get('name')} ({w.get('duration')} min, {w.get('calories')} kcal, completed={w.get('completed')})")
            if workouts:
                lines.append("Recent Workouts:\n" + "\n".join(workouts))

        elif "glucose" in msg_lower or "sugar" in msg_lower:
            if snap["bloodGlucose"]["recorded"]:
                lines.append(
                    f"Latest Blood Glucose: {snap['bloodGlucose']['value']} {snap['bloodGlucose']['unit']} ({_format_ts(snap['bloodGlucose']['timestamp'])})"
                )
            else:
                lines.append("Blood glucose has not been recorded yet in your profile or metrics.")
                missing_fields.append("Blood glucose reading")

        elif "water" in msg_lower:
            if snap["water"]["recorded"]:
                lines.append(
                    f"Water Intake: {snap['water']['intake']} / {snap['water']['target']} glasses ({_format_ts(snap['water']['timestamp'])})"
                )
            else:
                lines.append("Water intake has not been recorded yet.")
                missing_fields.append("Water intake")

        elif "oxygen" in msg_lower or "spo2" in msg_lower:
            if snap["oxygen"]["recorded"]:
                lines.append(f"Blood Oxygen (SpO2): {snap['oxygen']['level']}% ({_format_ts(snap['oxygen']['timestamp'])})")
            else:
                lines.append("Blood oxygen (SpO2) has not been recorded yet.")
                missing_fields.append("Blood oxygen (SpO2)")

        elif "temperature" in msg_lower or "temp" in msg_lower:
            if snap["temperature"]["recorded"]:
                lines.append(f"Body Temperature: {snap['temperature']['value']} °F ({_format_ts(snap['temperature']['timestamp'])})")
            else:
                lines.append("Body temperature has not been recorded yet.")
                missing_fields.append("Body temperature")

        else:
            # General "my recorded metrics / vitals / stats"
            _add_profile_basics(include_conditions=True)
            v_items = []
            if snap["heartRate"]["recorded"]:
                v_items.append(f"- Heart Rate: {snap['heartRate']['value']} bpm ({_format_ts(snap['heartRate']['timestamp'])})")
            else:
                missing_fields.append("Heart rate")
            if snap["bloodPressure"]["recorded"]:
                v_items.append(f"- Blood Pressure: {snap['bloodPressure']['systolic']}/{snap['bloodPressure']['diastolic']} mmHg ({_format_ts(snap['bloodPressure']['timestamp'])})")
            else:
                missing_fields.append("Blood pressure")
            if snap["bmi"]["recorded"]:
                v_items.append(f"- BMI: {snap['bmi']['value']} ({snap['bmi']['category']})")
            else:
                missing_fields.append("BMI")
            if snap["sleep"]["recorded"]:
                v_items.append(f"- Sleep: {snap['sleep']['hours']} hrs ({_format_ts(snap['sleep']['timestamp'])})")
            else:
                missing_fields.append("Sleep duration")
            if snap["steps"]["recorded"]:
                v_items.append(f"- Steps: {snap['steps']['count']} steps")
            if snap["water"]["recorded"]:
                v_items.append(f"- Water Intake: {snap['water']['intake']} glasses")
            if v_items:
                lines.append("Recorded Vitals:\n" + "\n".join(v_items))
            else:
                lines.append("No vitals have been recorded yet.")

    # --- F. Diet & Nutrition ---
    elif intent == IntentType.DIET_NUTRITION:
        sources.append("Nutrition & Profile")
        _add_profile_basics(include_conditions=True)
        if snap["calories"]["target"]:
            lines.append(f"Daily Calorie Target: {snap['calories']['target']} kcal/day")
        meals = []
        total_cal = 0
        async for m in db.meals.find({"user_email": user_email}).sort("_id", -1).limit(8):
            total_cal += int(m.get("calories", 0) or 0)
            meals.append(f"- {m.get('time', 'Meal')}: {m.get('name')} ({m.get('calories')} kcal, P:{m.get('protein')}g C:{m.get('carbs')}g F:{m.get('fat')}g)")
        if meals:
            lines.append(f"Logged Meals (Recent Total: {total_cal} kcal):\n" + "\n".join(meals))
        else:
            lines.append("Logged Meals: No meals logged yet.")

    # --- G. Fitness & Exercise ---
    elif intent == IntentType.FITNESS:
        sources.append("Fitness & Profile")
        _add_profile_basics(include_conditions=True)
        if snap["steps"]["recorded"]:
            lines.append(f"Steps Recorded: {snap['steps']['count']} (Target: {snap['steps']['target'] or 10000})")
        workouts = []
        async for w in db.workouts.find({"user_email": user_email}).sort("date", -1).limit(5):
            workouts.append(f"- {w.get('date')}: {w.get('name')} ({w.get('type')}, {w.get('duration')} min, {w.get('calories')} kcal, completed={w.get('completed')})")
        if workouts:
            lines.append("Logged Workouts:\n" + "\n".join(workouts))
        else:
            lines.append("Logged Workouts: No workouts logged yet.")

    # --- H. Insurance ---
    elif intent == IntentType.INSURANCE:
        sources.append("Insurance")
        claims = []
        async for c in db.claimRequests.find({"user_email": user_email}).sort("date", -1).limit(5):
            claims.append(f"- {c.get('date', 'N/A')}: {c.get('description')} (Amount: {c.get('amount')}, Status: {c.get('status')})")
        if claims:
            lines.append("Submitted Insurance Claims:\n" + "\n".join(claims))
        else:
            lines.append("Submitted Insurance Claims: No insurance claims submitted yet.")

    payload_data = {
        "vitals": snap,
        "missing_fields": missing_fields,
        "sources": sources,
    }

    if missing_fields:
        lines.append("Missing / Unrecorded Information:\n" + "\n".join(f"- {m}: Not recorded in HealthPoint" for m in missing_fields))

    if not lines:
        return {
            "used": False,
            "sources": [],
            "missing_fields": [],
            "data": {},
            "prompt_text": "",
        }

    prompt_text = (
        "\n[AUTHORIZED DE-IDENTIFIED HEALTHPOINT USER CONTEXT]:\n"
        + "\n\n".join(lines)
        + "\n[END OF AUTHORIZED USER CONTEXT]\n"
    )

    return {
        "used": True,
        "sources": list(dict.fromkeys(sources)),
        "missing_fields": list(dict.fromkeys(missing_fields)),
        "data": payload_data,
        "prompt_text": prompt_text,
    }


async def build_minimized_health_context(
    user_email: str,
    intent: str,
    message: str,
) -> str:
    """Backward-compatible wrapper returning formatted de-identified context string."""
    ctx = await build_structured_health_context(user_email, intent, message)
    return ctx.get("prompt_text", "")


async def get_user_health_context_snapshot(user_email: str) -> Dict[str, Any]:
    """Safe summary of authenticated user's live vitals/profile for AIAssistant UI panel."""
    db = get_database()
    if db is None:
        return {"vitals": {}, "missing_fields": [], "records_count": 0, "prescriptions_count": 0, "workouts_count": 0}

    user = await db.users.find_one({"email": user_email})
    metrics = await db.metrics.find_one({"user_email": user_email})
    snap = _collect_vitals_snapshot(user, metrics)

    missing = []
    if not snap["heartRate"]["recorded"]:
        missing.append("Heart rate")
    if not snap["bloodPressure"]["recorded"]:
        missing.append("Blood pressure")
    if not snap["sleep"]["recorded"]:
        missing.append("Sleep duration")
    if not snap["bmi"]["recorded"]:
        missing.append("BMI")
    if not snap["steps"]["recorded"]:
        missing.append("Steps")
    if not snap["bloodGlucose"]["recorded"]:
        missing.append("Blood glucose")

    rec_count = await db.records.count_documents({"user_email": user_email})
    rx_count = await db.prescriptions.count_documents({"user_email": user_email})
    wk_count = await db.workouts.count_documents({"user_email": user_email})

    return {
        "vitals": snap,
        "missing_fields": missing,
        "medical_conditions": user.get("medicalConditions") if user and _is_meaningful(user.get("medicalConditions")) else None,
        "allergies": user.get("allergies") if user and _is_meaningful(user.get("allergies")) else None,
        "records_count": rec_count,
        "prescriptions_count": rx_count,
        "workouts_count": wk_count,
    }
