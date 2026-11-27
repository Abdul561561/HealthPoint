import csv
import datetime
import io
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import HTTPException

from controllers.fitness_controller import _empty_metrics_payload
from database.mongodb import get_database
from models.vitals import VitalReadingCreate, VitalReadingUpdate
from services.health_platforms_service import (
    PLATFORM_DEFINITIONS,
    list_platform_integrations,
    sync_platform_vitals,
)


def compute_bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[Dict[str, Any]]:
    if not weight_kg or not height_cm or height_cm <= 0:
        return None
    bmi_val = round(float(weight_kg) / ((float(height_cm) / 100.0) ** 2), 1)
    if bmi_val < 18.5:
        cat = "Underweight"
    elif bmi_val < 25.0:
        cat = "Normal"
    elif bmi_val < 30.0:
        cat = "Overweight"
    else:
        cat = "Obese"
    return {"value": bmi_val, "category": cat}


def evaluate_informational_alerts(reading: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Flags out-of-range physiological readings as informational alerts only (never a medical diagnosis).
    Missing fields are skipped and never treated as zero.
    """
    alerts: List[Dict[str, str]] = []
    hr = reading.get("heart_rate")
    if hr is not None:
        if hr < 50 or hr > 110:
            alerts.append({"metric": "Heart Rate", "level": "warning", "message": f"Heart rate {hr} bpm is outside typical resting range (60–100 bpm). If feeling unwell, seek clinical advice."})
        elif hr < 60 or hr > 100:
            alerts.append({"metric": "Heart Rate", "level": "info", "message": f"Heart rate {hr} bpm is slightly outside 60–100 bpm (informational)."})

    sys_bp = reading.get("systolic")
    dia_bp = reading.get("diastolic")
    if sys_bp is not None and dia_bp is not None:
        if sys_bp >= 180 or dia_bp >= 120:
            alerts.append({"metric": "Blood Pressure", "level": "urgent", "message": f"Blood pressure {sys_bp}/{dia_bp} mmHg is markedly elevated. Recheck calmly and seek urgent medical care if accompanied by chest pain, shortness of breath, or headache."})
        elif sys_bp >= 140 or dia_bp >= 90 or sys_bp < 90 or dia_bp < 60:
            alerts.append({"metric": "Blood Pressure", "level": "warning", "message": f"Blood pressure {sys_bp}/{dia_bp} mmHg is outside typical 90–139 / 60–89 mmHg reference values (informational, not a diagnosis)."})

    spo2 = reading.get("oxygen_saturation")
    if spo2 is not None and spo2 < 95:
        lvl = "urgent" if spo2 < 90 else "warning"
        alerts.append({"metric": "Blood Oxygen (SpO2)", "level": lvl, "message": f"SpO2 {spo2}% is below the typical 95–100% range. Verify finger sensor placement and consult a clinician if persistent."})

    temp = reading.get("temperature_f")
    if temp is not None:
        if temp >= 100.4:
            alerts.append({"metric": "Body Temperature", "level": "warning", "message": f"Temperature {temp} °F indicates fever range (>= 100.4 °F). Monitor symptoms carefully."})
        elif temp < 95.0:
            alerts.append({"metric": "Body Temperature", "level": "warning", "message": f"Temperature {temp} °F is unusually low; recheck thermometer accuracy."})

    glu = reading.get("blood_glucose")
    if glu is not None:
        if glu < 70:
            alerts.append({"metric": "Blood Glucose", "level": "urgent", "message": f"Blood glucose {glu} mg/dL is below 70 mg/dL (low range). Recheck and follow clinical guidance promptly."})
        elif glu >= 200 or (reading.get("glucose_context") == "fasting" and glu >= 126):
            alerts.append({"metric": "Blood Glucose", "level": "warning", "message": f"Blood glucose {glu} mg/dL is elevated for typical reference thresholds (informational only)."})

    return alerts


def _serialize_reading(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    out.pop("user_email", None)
    return out


async def _sync_metrics_snapshot_from_readings(db, user_email: str) -> None:
    """
    Rebuilds latest scalar vital fields in `db.metrics` strictly from remaining
    `db.vitalReadings` entries so missing/deleted values never stay stale or turn into 0.
    """
    cursor = db.vitalReadings.find({"user_email": user_email}).sort("recorded_at", -1).limit(50)
    readings = [doc async for doc in cursor]

    existing = await db.metrics.find_one({"user_email": user_email})
    base = _empty_metrics_payload()
    if existing:
        # Preserve existing non-vital aggregates (calories, sleep target, history)
        base.update({k: v for k, v in existing.items() if k not in ("_id", "user_email")})

    latest_hr = next((r["heart_rate"] for r in readings if r.get("heart_rate") is not None), None)
    latest_bp = next(((r["systolic"], r["diastolic"]) for r in readings if r.get("systolic") is not None and r.get("diastolic") is not None), None)
    latest_glu = next(((r["blood_glucose"], r.get("glucose_context")) for r in readings if r.get("blood_glucose") is not None), None)
    latest_spo2 = next((r["oxygen_saturation"] for r in readings if r.get("oxygen_saturation") is not None), None)
    latest_temp = next((r["temperature_f"] for r in readings if r.get("temperature_f") is not None), None)
    latest_wt = next((r["weight_kg"] for r in readings if r.get("weight_kg") is not None), None)
    latest_ht = next((r["height_cm"] for r in readings if r.get("height_cm") is not None), None)
    latest_sleep = next((r["sleep_hours"] for r in readings if r.get("sleep_hours") is not None), None)
    latest_steps = next((r["steps"] for r in readings if r.get("steps") is not None), None)
    latest_water = next((r["water_glasses"] for r in readings if r.get("water_glasses") is not None), None)

    bmi_info = compute_bmi(latest_wt, latest_ht)

    updates: Dict[str, Any] = {
        "heartRate": {
            "current": latest_hr,
            "min": 60,
            "max": 100,
            "unit": "bpm",
            "status": "warning" if (latest_hr is not None and (latest_hr < 60 or latest_hr > 100)) else ("normal" if latest_hr is not None else "not_recorded"),
        },
        "bloodPressure": {
            "systolic": latest_bp[0] if latest_bp else None,
            "diastolic": latest_bp[1] if latest_bp else None,
            "unit": "mmHg",
            "status": "warning" if (latest_bp and (latest_bp[0] >= 140 or latest_bp[1] >= 90 or latest_bp[0] < 90)) else ("normal" if latest_bp else "not_recorded"),
        },
        "bloodGlucose": {
            "value": latest_glu[0] if latest_glu else None,
            "context": latest_glu[1] if latest_glu else None,
            "unit": "mg/dL",
            "status": "warning" if (latest_glu and (latest_glu[0] < 70 or latest_glu[0] >= 140)) else ("normal" if latest_glu else "not_recorded"),
        },
        "oxygen": {
            "level": latest_spo2,
            "unit": "%",
            "status": "warning" if (latest_spo2 is not None and latest_spo2 < 95) else ("normal" if latest_spo2 is not None else "not_recorded"),
        },
        "temperature": {
            "value": latest_temp,
            "unit": "°F",
            "status": "warning" if (latest_temp is not None and (latest_temp >= 100.4 or latest_temp < 95)) else ("normal" if latest_temp is not None else "not_recorded"),
        },
        "weight": {
            "current": latest_wt,
            "previous": base.get("weight", {}).get("previous"),
            "unit": "kg",
        },
        "height": {"value": latest_ht, "unit": "cm"},
        "bmi": bmi_info or {"value": None, "category": "Not provided"},
        "sleep": {
            "hours": latest_sleep,
            "quality": ("Poor" if latest_sleep < 6 else ("Excellent" if latest_sleep >= 8 else "Good")) if latest_sleep is not None else "Not provided",
            "target": base.get("sleep", {}).get("target") or 8,
            "unit": "hrs",
        },
        "steps": {
            "count": latest_steps,
            "target": base.get("steps", {}).get("target") or 10000,
            "unit": "steps",
        },
        "water": {
            "intake": latest_water,
            "target": base.get("water", {}).get("target") or 8,
            "unit": "glasses",
        },
    }

    await db.metrics.update_one({"user_email": user_email}, {"$set": updates}, upsert=True)
    if latest_ht is not None or latest_wt is not None:
        profile_set: Dict[str, Any] = {}
        if latest_ht is not None:
            profile_set["height"] = f"{round(float(latest_ht), 1)} cm"
        if latest_wt is not None:
            profile_set["weight"] = f"{round(float(latest_wt), 1)} kg"
        await db.users.update_one({"email": user_email}, {"$set": profile_set})


async def create_vital_reading_controller(user_email: str, payload: VitalReadingCreate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    data = payload.model_dump()
    if data.get("temperature_unit") == "C" and data.get("temperature_f") is not None:
        # Allow callers passing Celsius inside temperature_f when temperature_unit='C'
        if data["temperature_f"] <= 45.0:
            data["temperature_f"] = round((data["temperature_f"] * 9.0 / 5.0) + 32.0, 1)

    bmi_info = compute_bmi(data.get("weight_kg"), data.get("height_cm"))
    now_iso = data.get("recorded_at") or datetime.datetime.now(datetime.timezone.utc).isoformat()

    doc: Dict[str, Any] = {
        "user_email": user_email,
        "heart_rate": data.get("heart_rate"),
        "systolic": data.get("systolic"),
        "diastolic": data.get("diastolic"),
        "blood_glucose": data.get("blood_glucose"),
        "glucose_context": data.get("glucose_context"),
        "oxygen_saturation": data.get("oxygen_saturation"),
        "temperature_f": data.get("temperature_f"),
        "weight_kg": data.get("weight_kg"),
        "height_cm": data.get("height_cm"),
        "bmi": bmi_info["value"] if bmi_info else None,
        "bmi_category": bmi_info["category"] if bmi_info else None,
        "sleep_hours": data.get("sleep_hours"),
        "steps": data.get("steps"),
        "water_glasses": data.get("water_glasses"),
        "source": data.get("source") or "manual",
        "recorded_at": now_iso,
        "notes": (data.get("notes") or "").strip() or None,
    }
    doc["alerts"] = evaluate_informational_alerts(doc)

    res = await db.vitalReadings.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _sync_metrics_snapshot_from_readings(db, user_email)
    return _serialize_reading(doc)


async def list_vital_readings_controller(user_email: str, days: int = 30) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    days = max(1, min(days, 365))
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).isoformat()
    cursor = db.vitalReadings.find({"user_email": user_email, "recorded_at": {"$gte": cutoff}}).sort("recorded_at", -1).limit(200)
    return [_serialize_reading(doc) async for doc in cursor]


async def update_vital_reading_controller(user_email: str, reading_id: str, payload: VitalReadingUpdate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(reading_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid vital reading ID format")

    existing = await db.vitalReadings.find_one({"_id": oid, "user_email": user_email})
    if not existing:
        raise HTTPException(status_code=404, detail="Vital reading not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    merged = {**existing, **updates}
    bmi_info = compute_bmi(merged.get("weight_kg"), merged.get("height_cm"))
    if bmi_info:
        updates["bmi"] = bmi_info["value"]
        updates["bmi_category"] = bmi_info["category"]
        merged["bmi"] = bmi_info["value"]
    updates["alerts"] = evaluate_informational_alerts(merged)
    updates["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    await db.vitalReadings.update_one({"_id": oid, "user_email": user_email}, {"$set": updates})
    await _sync_metrics_snapshot_from_readings(db, user_email)
    updated = await db.vitalReadings.find_one({"_id": oid, "user_email": user_email})
    return _serialize_reading(updated)


async def delete_vital_reading_controller(user_email: str, reading_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(reading_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid vital reading ID format")

    res = await db.vitalReadings.delete_one({"_id": oid, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vital reading not found")
    await _sync_metrics_snapshot_from_readings(db, user_email)
    return {"success": True}


async def get_vitals_summary_controller(user_email: str, range_key: str = "week") -> Dict[str, Any]:
    days_map = {"day": 1, "week": 7, "month": 30}
    days = days_map.get((range_key or "week").lower(), 7)
    readings = await list_vital_readings_controller(user_email, days=days)
    db = get_database()
    metrics_doc = (await db.metrics.find_one({"user_email": user_email})) if db is not None else None
    metrics_doc = metrics_doc or _empty_metrics_payload()

    def _avg(field: str) -> Optional[float]:
        vals = [float(r[field]) for r in readings if r.get(field) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    latest = readings[0] if readings else None
    return {
        "range": range_key,
        "days": days,
        "total_readings": len(readings),
        "latest": {
            "heart_rate": next((r["heart_rate"] for r in readings if r.get("heart_rate") is not None), metrics_doc.get("heartRate", {}).get("current")),
            "systolic": next((r["systolic"] for r in readings if r.get("systolic") is not None), metrics_doc.get("bloodPressure", {}).get("systolic")),
            "diastolic": next((r["diastolic"] for r in readings if r.get("diastolic") is not None), metrics_doc.get("bloodPressure", {}).get("diastolic")),
            "blood_glucose": next((r["blood_glucose"] for r in readings if r.get("blood_glucose") is not None), metrics_doc.get("bloodGlucose", {}).get("value")),
            "oxygen_saturation": next((r["oxygen_saturation"] for r in readings if r.get("oxygen_saturation") is not None), metrics_doc.get("oxygen", {}).get("level")),
            "temperature_f": next((r["temperature_f"] for r in readings if r.get("temperature_f") is not None), metrics_doc.get("temperature", {}).get("value")),
            "weight_kg": next((r["weight_kg"] for r in readings if r.get("weight_kg") is not None), metrics_doc.get("weight", {}).get("current")),
            "height_cm": next((r["height_cm"] for r in readings if r.get("height_cm") is not None), metrics_doc.get("height", {}).get("value")),
            "bmi": (latest or {}).get("bmi") or metrics_doc.get("bmi", {}).get("value"),
            "bmi_category": (latest or {}).get("bmi_category") or metrics_doc.get("bmi", {}).get("category"),
            "sleep_hours": next((r["sleep_hours"] for r in readings if r.get("sleep_hours") is not None), metrics_doc.get("sleep", {}).get("hours")),
            "steps": next((r["steps"] for r in readings if r.get("steps") is not None), metrics_doc.get("steps", {}).get("count")),
            "water_glasses": next((r["water_glasses"] for r in readings if r.get("water_glasses") is not None), metrics_doc.get("water", {}).get("intake")),
            "recorded_at": (latest or {}).get("recorded_at"),
            "source": (latest or {}).get("source"),
        },
        "averages": {
            "heart_rate": _avg("heart_rate"),
            "systolic": _avg("systolic"),
            "diastolic": _avg("diastolic"),
            "blood_glucose": _avg("blood_glucose"),
            "oxygen_saturation": _avg("oxygen_saturation"),
            "temperature_f": _avg("temperature_f"),
            "weight_kg": _avg("weight_kg"),
            "sleep_hours": _avg("sleep_hours"),
            "steps": _avg("steps"),
            "water_glasses": _avg("water_glasses"),
        },
        "active_alerts": (latest or {}).get("alerts", []),
        "readings": readings,
    }


async def export_vitals_summary_controller(user_email: str, fmt: str = "json", days: int = 30) -> Dict[str, Any]:
    summary = await get_vitals_summary_controller(user_email, range_key="month" if days >= 30 else "week")
    readings = summary["readings"]
    if (fmt or "json").lower() == "csv":
        buf = io.StringIO()
        fieldnames = [
            "recorded_at",
            "source",
            "heart_rate",
            "systolic",
            "diastolic",
            "blood_glucose",
            "oxygen_saturation",
            "temperature_f",
            "weight_kg",
            "height_cm",
            "bmi",
            "sleep_hours",
            "steps",
            "water_glasses",
            "notes",
        ]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
        writer.writeheader()
        for row in readings:
            writer.writerow({k: row.get(k, "") if row.get(k) is not None else "" for k in fieldnames})
        return {"content_type": "text/csv", "filename": "healthpoint_vitals_summary.csv", "data": buf.getvalue()}
    return {
        "content_type": "application/json",
        "filename": "healthpoint_vitals_summary.json",
        "data": {
            "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "disclaimer": "Personal health summary for informational reference; not a clinical diagnosis.",
            **summary,
        },
    }


async def get_platforms_controller(user_email: str) -> List[Dict[str, Any]]:
    db = get_database()
    return await list_platform_integrations(db, user_email)


async def sync_platform_controller(user_email: str, platform_id: str) -> Dict[str, Any]:
    db = get_database()
    res = await sync_platform_vitals(db, user_email, platform_id)
    if not res.get("ok"):
        raise HTTPException(status_code=res.get("status_code", 400), detail=res.get("detail", "Platform sync unavailable"))
    return res
