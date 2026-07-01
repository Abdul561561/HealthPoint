from fastapi import HTTPException, status
from bson import ObjectId
from database.mongodb import get_database
from models.fitness import WorkoutCreate, WaterUpdate, MetricUpdate

async def get_workouts_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
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
            detail="Database connection unavailable"
        )
        
    workout_doc = {
        "user_email": user_email,
        "name": workout_data.name,
        "type": workout_data.type,
        "duration": workout_data.duration,
        "calories": workout_data.calories,
        "completed": workout_data.completed,
        "date": workout_data.date
    }
    
    result = await db.workouts.insert_one(workout_doc)
    workout_doc["id"] = str(result.inserted_id)
    del workout_doc["_id"]
    return workout_doc

async def get_metrics_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    metrics = await db.metrics.find_one({"user_email": user_email})
    if metrics:
        metrics["id"] = str(metrics["_id"])
        del metrics["_id"]
        del metrics["user_email"]
        return metrics
        
    # Fallback to default if not initialized yet
    return {
        "heartRate": { "current": 0, "min": 60, "max": 100, "unit": "bpm", "status": "normal" },
        "bloodPressure": { "systolic": 0, "diastolic": 0, "unit": "mmHg", "status": "normal" },
        "sleep": { "hours": 0.0, "quality": "N/A", "target": 8, "unit": "hrs" },
        "calories": { "burned": 0, "intake": 0, "target": 2000, "unit": "kcal" },
        "steps": { "count": 0, "target": 10000, "unit": "steps" },
        "water": { "intake": 0, "target": 8, "unit": "glasses" },
        "weight": { "current": 0.0, "previous": 0.0, "unit": "kg" },
        "bmi": { "value": 0.0, "category": "Normal" },
        "oxygen": { "level": 0, "unit": "%", "status": "normal" },
        "temperature": { "value": 0.0, "unit": "°F", "status": "normal" },
    }

async def update_metric_controller(user_email: str, metric_data: MetricUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    # Update nested object fields
    # e.g., if metric_data.key is "water" and metric_data.value is {"intake": 7},
    # we update "water" object directly.
    result = await db.metrics.update_one(
        {"user_email": user_email},
        {"$set": {metric_data.key: metric_data.value}}
    )
    
    return {"success": True, "message": f"Metric {metric_data.key} updated"}

from models.fitness import WorkoutCreate, WaterUpdate, MetricUpdate, MealCreate

async def update_water_controller(user_email: str, water_data: WaterUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )
        
    result = await db.metrics.update_one(
        {"user_email": user_email},
        {"$set": {"water.intake": water_data.glasses}}
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
        "fiber": meal_data.fiber
    }
    
    result = await db.meals.insert_one(meal_doc)
    meal_doc["id"] = str(result.inserted_id)
    del meal_doc["_id"]
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
    return {"success": True}
