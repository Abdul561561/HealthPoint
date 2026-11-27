import datetime
from fastapi import HTTPException, status
from bson import ObjectId
from database.mongodb import get_database
from models.fitness import WorkoutCreate, WorkoutUpdate, WaterUpdate, MetricUpdate, MealCreate


def _empty_metrics_payload():
    return {
        "heartRate": {"current": None, "min": 60, "max": 100, "unit": "bpm", "status": "not_recorded"},
        "bloodPressure": {"systolic": None, "diastolic": None, "unit": "mmHg", "status": "not_recorded"},
        "sleep": {"hours": None, "quality": "Not provided", "target": 8, "unit": "hrs"},
        "calories": {"burned": None, "intake": None, "target": None, "unit": "kcal"},
        "steps": {"count": None, "target": None, "unit": "steps"},
        "water": {"intake": None, "target": None, "unit": "glasses"},
        "weight": {"current": None, "previous": None, "unit": "kg"},
        "bmi": {"value": None, "category": "Not provided"},
        "oxygen": {"level": None, "unit": "%", "status": "not_recorded"},
        "temperature": {"value": None, "unit": "°F", "status": "not_recorded"},
        "history": {},
    }


async def get_workouts_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    cursor = db.workouts.find({"user_email": user_email})
    workouts = []
    async for w in cursor:
        w["id"] = str(w["_id"])
        del w["_id"]
        workouts.append(w)

    return workouts


async def create_workout_controller(user_email: str, workout_data: WorkoutCreate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    workout_doc = {
        "user_email": user_email,
        "name": workout_data.name,
        "type": workout_data.type,
        "duration": workout_data.duration,
        "calories": workout_data.calories,
        "completed": workout_data.completed,
        "date": workout_data.date,
    }

    result = await db.workouts.insert_one(workout_doc)
    workout_doc["id"] = str(result.inserted_id)
    del workout_doc["_id"]
    if workout_doc.get("completed") and workout_doc.get("calories"):
        await _sync_workouts_burned(db, user_email)
    return workout_doc


async def _sync_workouts_burned(db, user_email: str):
    total_burned = 0
    cursor = db.workouts.find({"user_email": user_email, "completed": True})
    async for w in cursor:
        total_burned += int(w.get("calories", 0) or 0)
    await db.metrics.update_one(
        {"user_email": user_email},
        {"$set": {"calories.burned": total_burned}},
        upsert=True,
    )


async def _sync_meals_intake(db, user_email: str):
    total_intake = 0
    cursor = db.meals.find({"user_email": user_email})
    async for m in cursor:
        total_intake += int(m.get("calories", 0) or 0)
    await db.metrics.update_one(
        {"user_email": user_email},
        {"$set": {"calories.intake": total_intake}},
        upsert=True,
    )


async def update_workout_controller(user_email: str, workout_id: str, workout_data: WorkoutUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        obj_id = ObjectId(workout_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workout ID format")

    updates = {k: v for k, v in workout_data.model_dump().items() if v is not None}
    if updates:
        res = await db.workouts.update_one(
            {"_id": obj_id, "user_email": user_email},
            {"$set": updates},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Workout not found or unauthorized")

    updated = await db.workouts.find_one({"_id": obj_id, "user_email": user_email})
    if not updated:
        raise HTTPException(status_code=404, detail="Workout not found or unauthorized")
    updated["id"] = str(updated.pop("_id"))
    await _sync_workouts_burned(db, user_email)
    return updated


async def delete_workout_controller(user_email: str, workout_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    try:
        obj_id = ObjectId(workout_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workout ID format")

    res = await db.workouts.delete_one({"_id": obj_id, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found or unauthorized")
    await _sync_workouts_burned(db, user_email)
    return {"success": True}


async def get_metrics_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    metrics = await db.metrics.find_one({"user_email": user_email})
    if metrics:
        metrics["id"] = str(metrics["_id"])
        del metrics["_id"]
        metrics.pop("user_email", None)
        metrics.setdefault("history", {})
        return metrics

    return _empty_metrics_payload()


async def update_metric_controller(user_email: str, metric_data: MetricUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    allowed_keys = {
        "heartRate",
        "bloodPressure",
        "sleep",
        "calories",
        "steps",
        "water",
        "weight",
        "bmi",
        "oxygen",
        "temperature",
    }
    if metric_data.key not in allowed_keys:
        raise HTTPException(status_code=400, detail="Unsupported metric key")

    existing = await db.metrics.find_one({"user_email": user_email})
    if not existing:
        base_doc = _empty_metrics_payload()
        base_doc["user_email"] = user_email
        await db.metrics.insert_one(base_doc)
        existing = base_doc

    merged = dict(existing.get(metric_data.key, {}))
    merged.update(metric_data.value)

    history_entry = dict(merged)
    history_entry["recordedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    await db.metrics.update_one(
        {"user_email": user_email},
        {
            "$set": {metric_data.key: merged},
            "$push": {f"history.{metric_data.key}": {"$each": [history_entry], "$slice": -14}},
        },
        upsert=True,
    )

    return {"success": True, "message": f"Metric {metric_data.key} updated"}


async def update_water_controller(user_email: str, water_data: WaterUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    history_entry = {
        "intake": water_data.glasses,
        "recordedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    await db.metrics.update_one(
        {"user_email": user_email},
        {
            "$set": {"water.intake": water_data.glasses},
            "$push": {"history.water": {"$each": [history_entry], "$slice": -14}},
        },
        upsert=True,
    )

    return {"success": True, "glasses": water_data.glasses}


async def get_meals_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    cursor = db.meals.find({"user_email": user_email})
    meals = []
    async for m in cursor:
        m["id"] = str(m["_id"])
        del m["_id"]
        meals.append(m)
    return meals


async def create_meal_controller(user_email: str, meal_data: MealCreate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    meal_doc = {
        "user_email": user_email,
        "name": meal_data.name,
        "time": meal_data.time,
        "calories": meal_data.calories,
        "protein": meal_data.protein,
        "carbs": meal_data.carbs,
        "fat": meal_data.fat,
        "fiber": meal_data.fiber,
    }

    result = await db.meals.insert_one(meal_doc)
    meal_doc["id"] = str(result.inserted_id)
    del meal_doc["_id"]
    await _sync_meals_intake(db, user_email)
    return meal_doc


async def delete_meal_controller(user_email: str, meal_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        obj_id = ObjectId(meal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meal ID format")

    result = await db.meals.delete_one({"_id": obj_id, "user_email": user_email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meal not found")
    await _sync_meals_intake(db, user_email)
    return {"success": True}
