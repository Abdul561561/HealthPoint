import asyncio
import datetime
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import HTTPException, status

from database.mongodb import get_database
from controllers.auth_controller import parse_height_to_cm, parse_weight_to_kg
from models.nutrition import (
    CustomFoodCreate,
    MealLogCreate,
    MealLogUpdate,
    NutritionGoalUpdate,
)
from services.nutrition_service import (
    calculate_nutrients_for_grams,
    estimate_daily_nutrition_targets,
    search_curated_indian_foods,
    search_openfoodfacts,
    search_usda_foods,
)


def _today_str() -> str:
    return datetime.date.today().isoformat()


async def _sync_today_calories_intake(db, user_email: str) -> None:
    today = _today_str()
    total = 0
    cursor = db.meals.find({"user_email": user_email, "$or": [{"date": today}, {"date": {"$exists": False}}]})
    async for m in cursor:
        total += int(m.get("calories", 0) or 0)
    await db.metrics.update_one(
        {"user_email": user_email},
        {"$set": {"calories.intake": total}},
        upsert=True,
    )


async def search_foods_controller(user_email: str, query: str, source: str = "all") -> Dict[str, Any]:
    db = get_database()
    q = (query or "").strip()
    src = (source or "all").lower()

    results: List[Dict[str, Any]] = []
    warnings: List[str] = []

    # 1. User's custom foods matching query
    if db is not None and src in ("all", "custom"):
        cf_filter: Dict[str, Any] = {"user_email": user_email}
        if q:
            cf_filter["name"] = {"$regex": q, "$options": "i"}
        async for cf in db.customFoods.find(cf_filter).limit(10):
            results.append({
                "food_id": f"custom_{cf['_id']}",
                "id": str(cf["_id"]),
                "name": cf["name"],
                "brand": cf.get("brand", "Custom Food"),
                "category": "My Custom Food",
                "source": "My Custom Foods",
                "per_100g": cf.get("per_100g", {}),
                "serving_options": cf.get("serving_options", [{"unit": "g", "label": "100 g", "grams": 100.0}]),
            })

    # 2. Curated Indian & regional foods dataset
    if src in ("all", "indian"):
        results.extend(search_curated_indian_foods(q))

    # 3. External databases (USDA FoodData Central & Open Food Facts) when user searches >= 2 chars
    if len(q) >= 2:
        tasks = []
        if src in ("all", "usda"):
            tasks.append(search_usda_foods(q, limit=8))
        if src in ("all", "openfoodfacts"):
            tasks.append(search_openfoodfacts(q, limit=8))
        if tasks:
            ext_results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in ext_results:
                if isinstance(res, dict):
                    if res.get("ok"):
                        results.extend(res.get("results") or [])
                    elif res.get("error"):
                        warnings.append(res["error"])

    return {
        "query": q,
        "count": len(results),
        "results": results[:40],
        "warnings": warnings,
    }


async def barcode_lookup_controller(barcode: str) -> Dict[str, Any]:
    cleaned = (barcode or "").strip()
    if not cleaned.isdigit() or not (8 <= len(cleaned) <= 14):
        raise HTTPException(status_code=400, detail="Barcode must be 8 to 14 digits.")
    res = await search_openfoodfacts(cleaned, limit=1)
    if not res.get("ok"):
        raise HTTPException(status_code=503, detail=res.get("error", "Open Food Facts unavailable"))
    items = res.get("results") or []
    if not items:
        return {"found": False, "product": None, "message": f"No packaged food found for barcode {cleaned}."}
    return {"found": True, "product": items[0]}


async def get_custom_foods_controller(user_email: str) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    items = []
    async for doc in db.customFoods.find({"user_email": user_email}).sort("_id", -1):
        items.append({
            "food_id": f"custom_{doc['_id']}",
            "id": str(doc["_id"]),
            "name": doc["name"],
            "brand": doc.get("brand", "Custom Food"),
            "source": "My Custom Foods",
            "per_100g": doc.get("per_100g", {}),
            "serving_options": doc.get("serving_options", []),
        })
    return items


async def create_custom_food_controller(user_email: str, payload: CustomFoodCreate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    factor = 100.0 / float(payload.serving_grams)
    per_100g = {
        "calories": round(payload.calories * factor, 1),
        "protein": round(payload.protein * factor, 1),
        "carbs": round(payload.carbs * factor, 1),
        "fat": round(payload.fat * factor, 1),
        "fiber": round(payload.fiber * factor, 1),
        "sugar": round(payload.sugar * factor, 1) if payload.sugar is not None else None,
        "sodium": round(payload.sodium * factor, 1) if payload.sodium is not None else None,
    }
    servings = [
        {"unit": "serving", "label": f"{payload.serving_label or '1 Serving'} ({int(payload.serving_grams)} g)", "grams": payload.serving_grams},
        {"unit": "g", "label": "100 g", "grams": 100.0},
    ]
    doc = {
        "user_email": user_email,
        "name": payload.name.strip(),
        "brand": (payload.brand or "Custom Food").strip(),
        "per_100g": per_100g,
        "serving_options": servings,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    res = await db.customFoods.insert_one(doc)
    return {
        "food_id": f"custom_{res.inserted_id}",
        "id": str(res.inserted_id),
        "name": doc["name"],
        "brand": doc["brand"],
        "source": "My Custom Foods",
        "per_100g": per_100g,
        "serving_options": servings,
    }


async def delete_custom_food_controller(user_email: str, food_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(food_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid custom food ID")
    res = await db.customFoods.delete_one({"_id": oid, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Custom food not found")
    return {"success": True}


async def get_meals_by_date_controller(user_email: str, date_str: Optional[str] = None) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    target_date = (date_str or "").strip() or _today_str()
    query: Dict[str, Any] = {"user_email": user_email}
    if target_date == _today_str():
        query["$or"] = [{"date": target_date}, {"date": {"$exists": False}}]
    else:
        query["date"] = target_date

    meals = []
    async for m in db.meals.find(query).sort("_id", -1):
        m["id"] = str(m.pop("_id"))
        m.setdefault("date", target_date)
        meals.append(m)
    return meals


async def create_meal_log_controller(user_email: str, payload: MealLogCreate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    meal_date = (payload.date or "").strip() or _today_str()
    doc = {
        "user_email": user_email,
        "name": payload.name.strip(),
        "time": payload.time,
        "date": meal_date,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "grams": payload.grams,
        "calories": payload.calories,
        "protein": payload.protein,
        "carbs": payload.carbs,
        "fat": payload.fat,
        "fiber": payload.fiber,
        "sugar": payload.sugar,
        "sodium": payload.sodium,
        "brand": payload.brand,
        "source": payload.source,
        "food_id": payload.food_id,
        "per_100g": payload.per_100g,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    res = await db.meals.insert_one(doc)
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    await _sync_today_calories_intake(db, user_email)
    return doc


async def update_meal_log_controller(user_email: str, meal_id: str, payload: MealLogUpdate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(meal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meal ID format")

    existing = await db.meals.find_one({"_id": oid, "user_email": user_email})
    if not existing:
        raise HTTPException(status_code=404, detail="Meal entry not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Recalculate proportionally when grams or quantity changes and per_100g/original grams exist
    if "grams" in updates and existing.get("per_100g"):
        scaled = calculate_nutrients_for_grams(existing["per_100g"], updates["grams"])
        for field in ("calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"):
            if scaled.get(field) is not None:
                updates[field] = scaled[field]
    elif "quantity" in updates and existing.get("quantity") and float(existing["quantity"]) > 0:
        ratio = float(updates["quantity"]) / float(existing["quantity"])
        if existing.get("grams"):
            updates["grams"] = round(float(existing["grams"]) * ratio, 1)
        if existing.get("calories") is not None:
            updates["calories"] = int(round(float(existing["calories"]) * ratio))
        for field in ("protein", "carbs", "fat", "fiber", "sugar", "sodium"):
            if existing.get(field) is not None:
                updates[field] = round(float(existing[field]) * ratio, 1)

    if updates:
        await db.meals.update_one({"_id": oid, "user_email": user_email}, {"$set": updates})
    updated = await db.meals.find_one({"_id": oid, "user_email": user_email})
    updated["id"] = str(updated.pop("_id"))
    await _sync_today_calories_intake(db, user_email)
    return updated


async def delete_meal_log_controller(user_email: str, meal_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(meal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meal ID format")
    res = await db.meals.delete_one({"_id": oid, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meal entry not found")
    await _sync_today_calories_intake(db, user_email)
    return {"success": True}


async def get_nutrition_history_controller(user_email: str, days: int = 7) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    days = max(1, min(days, 30))
    today = datetime.date.today()
    start_date = (today - datetime.timedelta(days=days - 1)).isoformat()

    by_date: Dict[str, Dict[str, Any]] = {}
    for offset in range(days):
        d_str = (today - datetime.timedelta(days=days - 1 - offset)).isoformat()
        by_date[d_str] = {"date": d_str, "calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "fiber": 0.0, "meals_count": 0}

    async for m in db.meals.find({"user_email": user_email}):
        d_str = m.get("date") or today.isoformat()
        if d_str >= start_date and d_str in by_date:
            bucket = by_date[d_str]
            bucket["calories"] += int(m.get("calories", 0) or 0)
            bucket["protein"] = round(bucket["protein"] + float(m.get("protein", 0) or 0), 1)
            bucket["carbs"] = round(bucket["carbs"] + float(m.get("carbs", 0) or 0), 1)
            bucket["fat"] = round(bucket["fat"] + float(m.get("fat", 0) or 0), 1)
            bucket["fiber"] = round(bucket["fiber"] + float(m.get("fiber", 0) or 0), 1)
            bucket["meals_count"] += 1

    return list(by_date.values())


async def get_nutrition_goals_controller(user_email: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    user = await db.users.find_one({"email": user_email}) or {}
    saved = await db.nutritionGoals.find_one({"user_email": user_email})
    estimated = estimate_daily_nutrition_targets(
        age=user.get("age"),
        weight_kg=parse_weight_to_kg(user.get("weight")),
        height_cm=parse_height_to_cm(user.get("height")),
        gender=user.get("gender"),
        activity_level=(saved or {}).get("activity_level", "moderate"),
        goal=(saved or {}).get("goal", "maintain"),
    )
    if saved:
        return {
            "calories": saved.get("calories") or estimated["calories"],
            "protein": saved.get("protein") or estimated["protein"],
            "carbs": saved.get("carbs") or estimated["carbs"],
            "fat": saved.get("fat") or estimated["fat"],
            "fiber": saved.get("fiber") or estimated["fiber"],
            "activity_level": saved.get("activity_level", "moderate"),
            "goal": saved.get("goal", "maintain"),
            "is_custom": bool(saved.get("is_custom", True)),
            "estimated_from_profile": estimated["estimated_from_profile"],
            "disclaimer": estimated["disclaimer"],
        }
    estimated["is_custom"] = False
    return estimated


async def update_nutrition_goals_controller(user_email: str, payload: NutritionGoalUpdate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    user = await db.users.find_one({"email": user_email}) or {}
    estimated = estimate_daily_nutrition_targets(
        age=user.get("age"),
        weight_kg=parse_weight_to_kg(user.get("weight")),
        height_cm=parse_height_to_cm(user.get("height")),
        gender=user.get("gender"),
        activity_level=payload.activity_level or "moderate",
        goal=payload.goal or "maintain",
    )
    if payload.use_estimated:
        goal_doc = {
            "user_email": user_email,
            "calories": estimated["calories"],
            "protein": estimated["protein"],
            "carbs": estimated["carbs"],
            "fat": estimated["fat"],
            "fiber": estimated["fiber"],
            "activity_level": estimated["activity_level"],
            "goal": estimated["goal"],
            "is_custom": False,
        }
    else:
        existing = await db.nutritionGoals.find_one({"user_email": user_email}) or estimated
        goal_doc = {
            "user_email": user_email,
            "calories": payload.calories or existing.get("calories") or estimated["calories"],
            "protein": payload.protein or existing.get("protein") or estimated["protein"],
            "carbs": payload.carbs or existing.get("carbs") or estimated["carbs"],
            "fat": payload.fat or existing.get("fat") or estimated["fat"],
            "fiber": payload.fiber or existing.get("fiber") or estimated["fiber"],
            "activity_level": payload.activity_level or existing.get("activity_level", "moderate"),
            "goal": payload.goal or existing.get("goal", "maintain"),
            "is_custom": True,
        }
    await db.nutritionGoals.update_one({"user_email": user_email}, {"$set": goal_doc}, upsert=True)
    await db.metrics.update_one({"user_email": user_email}, {"$set": {"calories.target": goal_doc["calories"]}}, upsert=True)
    return {**goal_doc, "estimated_from_profile": estimated["estimated_from_profile"], "disclaimer": estimated["disclaimer"]}
