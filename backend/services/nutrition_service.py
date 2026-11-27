"""
HealthPoint Multi-Source Food & Nutrition Service
=================================================
Combines:
1. Curated Indian & regional food nutrition dataset (per-100g & household servings).
2. USDA FoodData Central API (`USDA_API_KEY` or `DEMO_KEY` fallback).
3. Open Food Facts API (packaged/branded food search and barcode lookup).

Guarantees:
- Never invents missing nutritional values (returns `None` for unprovided fields).
- Exact proportional calculation based on user-selected serving unit & quantity.
- Bounded in-memory caching for external food searches.
"""

import logging
import os
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

logger = logging.getLogger("healthpoint.nutrition_service")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)

USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product"


def get_usda_api_key() -> str:
    return os.getenv("USDA_API_KEY", "").strip() or "DEMO_KEY"


def _food_item(
    food_id: str,
    name: str,
    calories: Optional[float],
    protein: Optional[float],
    carbs: Optional[float],
    fat: Optional[float],
    fiber: Optional[float] = None,
    sugar: Optional[float] = None,
    sodium: Optional[float] = None,
    servings: Optional[List[Dict[str, Any]]] = None,
    brand: str = "Curated Indian & Regional Dataset",
    category: str = "Indian Food",
) -> Dict[str, Any]:
    default_servings = [
        {"unit": "g", "label": "100 g", "grams": 100.0},
    ]
    if servings:
        default_servings = servings + default_servings
    return {
        "food_id": food_id,
        "name": name,
        "brand": brand,
        "category": category,
        "source": "Curated Indian Dataset",
        "per_100g": {
            "calories": calories,
            "protein": protein,
            "carbs": carbs,
            "fat": fat,
            "fiber": fiber,
            "sugar": sugar,
            "sodium": sodium,
        },
        "serving_options": default_servings,
    }


INDIAN_FOODS_DATASET: List[Dict[str, Any]] = [
    _food_item("ind_idli", "Idli (Steamed Rice & Lentil Cake)", 146, 4.9, 28.5, 0.7, 1.5, 0.4, 210, [
        {"unit": "piece", "label": "1 Piece (40 g)", "grams": 40},
        {"unit": "plate", "label": "2 Pieces (80 g)", "grams": 80},
    ], category="South Indian Breakfast"),
    _food_item("ind_dosa_plain", "Dosa (Plain)", 168, 3.9, 28.8, 3.7, 1.1, 0.5, 240, [
        {"unit": "piece", "label": "1 Plain Dosa (90 g)", "grams": 90},
    ], category="South Indian Breakfast"),
    _food_item("ind_masala_dosa", "Masala Dosa", 195, 4.2, 29.5, 6.8, 2.2, 1.1, 295, [
        {"unit": "piece", "label": "1 Masala Dosa (180 g)", "grams": 180},
    ], category="South Indian Breakfast"),
    _food_item("ind_plain_rice", "Plain Steamed White Rice (Cooked)", 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, [
        {"unit": "cup", "label": "1 Cup / Katori (150 g)", "grams": 150},
        {"unit": "bowl", "label": "1 Bowl (200 g)", "grams": 200},
    ], category="Grains & Rice"),
    _food_item("ind_brown_rice", "Brown Rice (Cooked)", 112, 2.6, 23.5, 0.9, 1.8, 0.4, 5, [
        {"unit": "cup", "label": "1 Cup (150 g)", "grams": 150},
    ], category="Grains & Rice"),
    _food_item("ind_veg_biryani", "Vegetable Biryani", 158, 3.8, 24.0, 5.2, 2.1, 1.4, 340, [
        {"unit": "bowl", "label": "1 Bowl (250 g)", "grams": 250},
    ], category="Rice Dishes"),
    _food_item("ind_chicken_biryani", "Chicken Biryani", 192, 10.4, 21.8, 7.1, 1.2, 1.0, 380, [
        {"unit": "bowl", "label": "1 Bowl (280 g)", "grams": 280},
    ], category="Rice Dishes"),
    _food_item("ind_chapati", "Chapati / Whole Wheat Roti", 240, 7.8, 46.0, 2.5, 6.2, 1.2, 190, [
        {"unit": "piece", "label": "1 Medium Roti (35 g)", "grams": 35},
    ], category="Indian Breads"),
    _food_item("ind_paratha", "Plain Whole Wheat Paratha", 306, 6.8, 44.0, 11.4, 4.9, 1.5, 250, [
        {"unit": "piece", "label": "1 Paratha (60 g)", "grams": 60},
    ], category="Indian Breads"),
    _food_item("ind_aloo_paratha", "Aloo Paratha", 265, 5.4, 37.0, 10.6, 4.1, 1.8, 290, [
        {"unit": "piece", "label": "1 Stuffed Paratha (120 g)", "grams": 120},
    ], category="Indian Breads"),
    _food_item("ind_dal_tadka", "Dal Tadka (Cooked Yellow Lentils)", 116, 6.1, 15.2, 3.5, 4.2, 0.9, 260, [
        {"unit": "katori", "label": "1 Katori (150 g)", "grams": 150},
    ], category="Lentils & Curries"),
    _food_item("ind_sambar", "Sambar (Lentil Vegetable Stew)", 68, 3.1, 10.5, 1.6, 2.4, 1.8, 280, [
        {"unit": "katori", "label": "1 Katori / Bowl (150 ml)", "grams": 150},
    ], category="Lentils & Curries"),
    _food_item("ind_rasam", "Rasam", 34, 1.0, 5.6, 0.8, 0.9, 1.1, 240, [
        {"unit": "katori", "label": "1 Katori (150 ml)", "grams": 150},
    ], category="Lentils & Curries"),
    _food_item("ind_curd", "Plain Curd / Dahi (Whole Milk Yogurt)", 61, 3.5, 4.7, 3.3, 0.0, 4.5, 46, [
        {"unit": "katori", "label": "1 Katori (120 g)", "grams": 120},
        {"unit": "cup", "label": "1 Cup (200 g)", "grams": 200},
    ], category="Dairy"),
    _food_item("ind_paneer", "Paneer (Fresh Indian Cottage Cheese)", 265, 18.3, 1.2, 20.8, 0.0, 1.0, 22, [
        {"unit": "piece", "label": "5 Cubes (50 g)", "grams": 50},
    ], category="Dairy & Protein"),
    _food_item("ind_paneer_curry", "Paneer Curry / Matar Paneer", 185, 8.2, 8.5, 13.4, 2.0, 2.4, 340, [
        {"unit": "katori", "label": "1 Katori (150 g)", "grams": 150},
    ], category="Lentils & Curries"),
    _food_item("ind_chicken_curry", "Chicken Curry (Home-Style)", 162, 16.5, 4.2, 8.8, 0.9, 1.3, 350, [
        {"unit": "katori", "label": "1 Bowl (180 g)", "grams": 180},
    ], category="Protein & Curries"),
    _food_item("ind_egg_curry", "Egg Curry", 148, 8.9, 5.5, 10.1, 0.8, 1.6, 320, [
        {"unit": "bowl", "label": "1 Bowl / 2 Eggs (180 g)", "grams": 180},
    ], category="Protein & Curries"),
    _food_item("ind_boiled_egg", "Boiled Egg (Whole)", 155, 12.6, 1.1, 10.6, 0.0, 1.1, 124, [
        {"unit": "piece", "label": "1 Large Egg (50 g)", "grams": 50},
    ], category="Protein"),
    _food_item("ind_fish_curry", "Fish Curry", 136, 14.8, 3.6, 6.8, 0.6, 1.1, 310, [
        {"unit": "bowl", "label": "1 Bowl (180 g)", "grams": 180},
    ], category="Protein & Curries"),
    _food_item("ind_upma", "Rava Upma (Semolina Breakfast)", 132, 3.4, 21.6, 3.5, 1.6, 1.0, 230, [
        {"unit": "bowl", "label": "1 Bowl (160 g)", "grams": 160},
    ], category="Indian Breakfast"),
    _food_item("ind_poha", "Kanda / Vegetable Poha", 130, 2.7, 23.8, 2.8, 1.5, 1.2, 220, [
        {"unit": "bowl", "label": "1 Bowl (150 g)", "grams": 150},
    ], category="Indian Breakfast"),
    _food_item("ind_pongal", "Ven Pongal", 156, 4.2, 22.8, 5.3, 1.4, 0.5, 250, [
        {"unit": "bowl", "label": "1 Bowl (180 g)", "grams": 180},
    ], category="South Indian Breakfast"),
    _food_item("ind_pulao", "Vegetable Pulao", 150, 3.2, 25.0, 4.1, 1.8, 1.2, 280, [
        {"unit": "bowl", "label": "1 Bowl (200 g)", "grams": 200},
    ], category="Grains & Rice"),
    _food_item("ind_puri", "Puri (Whole Wheat Fried Bread)", 335, 6.2, 42.0, 15.8, 3.8, 0.8, 210, [
        {"unit": "piece", "label": "1 Puri (28 g)", "grams": 28},
    ], category="Indian Breads"),
    _food_item("ind_vada", "Medu Vada", 275, 8.6, 31.2, 12.8, 3.9, 0.9, 310, [
        {"unit": "piece", "label": "1 Vada (45 g)", "grams": 45},
    ], category="South Indian Snacks"),
    _food_item("ind_samosa", "Vegetable Samosa", 262, 4.6, 31.5, 13.2, 2.9, 1.5, 360, [
        {"unit": "piece", "label": "1 Samosa (80 g)", "grams": 80},
    ], category="Snacks"),
    _food_item("ind_banana", "Banana (Fresh)", 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, [
        {"unit": "piece", "label": "1 Medium Banana (118 g)", "grams": 118},
    ], brand="Fresh Produce", category="Fruits"),
    _food_item("ind_apple", "Apple (Fresh)", 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, [
        {"unit": "piece", "label": "1 Medium Apple (180 g)", "grams": 180},
    ], brand="Fresh Produce", category="Fruits"),
    _food_item("ind_mixed_veg", "Mixed Cooked Vegetables (Sabzi)", 78, 2.4, 10.2, 3.1, 3.4, 2.8, 210, [
        {"unit": "katori", "label": "1 Katori (130 g)", "grams": 130},
    ], category="Vegetables"),
    _food_item("ind_milk_toned", "Toned Milk (Cow / Dairy)", 58, 3.1, 4.8, 3.0, 0.0, 4.8, 44, [
        {"unit": "ml", "label": "100 ml", "grams": 100},
        {"unit": "glass", "label": "1 Glass (250 ml)", "grams": 250},
    ], category="Beverages & Dairy"),
    _food_item("ind_almonds", "Almonds (Raw / Roasted)", 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, [
        {"unit": "piece", "label": "10 Almonds (12 g)", "grams": 12},
        {"unit": "tbsp", "label": "1 Handful / 28 g", "grams": 28},
    ], category="Nuts & Seeds"),
    _food_item("ind_peanuts", "Roasted Peanuts", 585, 24.4, 21.5, 49.7, 8.4, 4.2, 18, [
        {"unit": "tbsp", "label": "1 Handful / 30 g", "grams": 30},
    ], category="Nuts & Seeds"),
    _food_item("ind_chai", "Masala Chai (Milk Tea with Sugar)", 42, 1.4, 5.8, 1.5, 0.0, 5.2, 18, [
        {"unit": "cup", "label": "1 Cup (150 ml)", "grams": 150},
    ], category="Beverages"),
    _food_item("ind_filter_coffee", "South Indian Filter Coffee (Milk & Sugar)", 48, 1.6, 6.2, 1.8, 0.0, 5.8, 20, [
        {"unit": "cup", "label": "1 Cup (150 ml)", "grams": 150},
    ], category="Beverages"),
    _food_item("ind_oats", "Rolled Oats (Cooked in Water)", 71, 2.5, 12.0, 1.5, 1.7, 0.5, 49, [
        {"unit": "bowl", "label": "1 Bowl (200 g)", "grams": 200},
    ], brand="General Staples", category="Breakfast"),
    _food_item("ind_chicken_breast", "Grilled Chicken Breast (Skinless)", 165, 31.0, 0.0, 3.6, 0.0, 0.0, 74, [
        {"unit": "piece", "label": "1 Fillet (150 g)", "grams": 150},
    ], brand="General Staples", category="Protein"),
]

_FOOD_CACHE_TTL = 600
_FOOD_CACHE_MAX = 200
_food_cache: OrderedDict[Tuple[Any, ...], Tuple[float, Dict[str, Any]]] = OrderedDict()


def clear_food_cache() -> None:
    _food_cache.clear()


def _cache_get(key: Tuple[Any, ...]) -> Optional[Dict[str, Any]]:
    item = _food_cache.get(key)
    if not item:
        return None
    ts, val = item
    if time.monotonic() - ts > _FOOD_CACHE_TTL:
        _food_cache.pop(key, None)
        return None
    _food_cache.move_to_end(key)
    return val


def _cache_set(key: Tuple[Any, ...], val: Dict[str, Any]) -> None:
    _food_cache[key] = (time.monotonic(), val)
    _food_cache.move_to_end(key)
    while len(_food_cache) > _FOOD_CACHE_MAX:
        _food_cache.popitem(last=False)


def _safe_float(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return round(float(v), 2)
    except Exception:
        return None


def calculate_nutrients_for_grams(per_100g: Dict[str, Any], grams: float) -> Dict[str, Any]:
    """Scale nutritional values strictly proportionally from per-100g source data."""
    ratio = max(0.0, float(grams)) / 100.0
    out: Dict[str, Any] = {}
    for field in ("calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"):
        base = _safe_float((per_100g or {}).get(field))
        if base is None:
            out[field] = None
        elif field == "calories":
            out[field] = int(round(base * ratio))
        else:
            out[field] = round(base * ratio, 1)
    return out


def search_curated_indian_foods(query: str) -> List[Dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return INDIAN_FOODS_DATASET[:15]
    tokens = [t for t in q.split() if t]
    scored = []
    for item in INDIAN_FOODS_DATASET:
        hay = f"{item['name']} {item.get('category', '')}".lower()
        if all(t in hay for t in tokens):
            score = 2 if item["name"].lower().startswith(q) else 1
            scored.append((score, item))
    scored.sort(key=lambda x: -x[0])
    return [x[1] for x in scored]


async def search_usda_foods(query: str, limit: int = 8) -> Dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {"ok": True, "results": [], "source": "USDA FoodData Central"}
    cache_key = ("usda", q.lower(), limit)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    api_key = get_usda_api_key()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                USDA_SEARCH_URL,
                params={"query": q, "pageSize": limit, "api_key": api_key},
            )
        if res.status_code in (403, 429):
            return {
                "ok": False,
                "source": "USDA FoodData Central",
                "error": "USDA FoodData Central rate limit reached; set USDA_API_KEY in backend/.env for higher limits.",
                "results": [],
            }
        if res.status_code != 200:
            return {"ok": False, "source": "USDA FoodData Central", "error": f"USDA HTTP {res.status_code}", "results": []}

        foods = res.json().get("foods") or []
        results: List[Dict[str, Any]] = []
        for f in foods:
            nutrients = f.get("foodNutrients") or []
            nmap: Dict[str, float] = {}
            for n in nutrients:
                nid = str(n.get("nutrientId") or n.get("nutrientNumber") or "")
                nname = (n.get("nutrientName") or "").lower()
                val = _safe_float(n.get("value"))
                if val is None:
                    continue
                if nid in ("1008", "208") or "energy" in nname:
                    nmap.setdefault("calories", val)
                elif nid in ("1003", "203") or nname == "protein":
                    nmap.setdefault("protein", val)
                elif nid in ("1005", "205") or "carbohydrate" in nname:
                    nmap.setdefault("carbs", val)
                elif nid in ("1004", "204") or "total lipid" in nname:
                    nmap.setdefault("fat", val)
                elif nid in ("1079", "291") or "fiber" in nname:
                    nmap.setdefault("fiber", val)
                elif nid in ("2000", "269") or "sugars" in nname:
                    nmap.setdefault("sugar", val)
                elif nid in ("1093", "307") or "sodium" in nname:
                    nmap.setdefault("sodium", val)

            if nmap.get("calories") is None and nmap.get("protein") is None:
                continue

            servings = [{"unit": "g", "label": "100 g", "grams": 100.0}]
            if f.get("servingSize") and (f.get("servingSizeUnit") or "").lower() in ("g", "ml"):
                ss = float(f["servingSize"])
                unit_lbl = (f.get("householdServingFullText") or f"1 Serving ({int(ss)}{f.get('servingSizeUnit', 'g')})").strip()
                servings.insert(0, {"unit": "serving", "label": unit_lbl, "grams": ss})

            results.append({
                "food_id": f"usda_{f.get('fdcId')}",
                "name": (f.get("description") or "USDA Food Item").title(),
                "brand": f.get("brandOwner") or f.get("brandName") or "USDA Standard Reference",
                "category": f.get("foodCategory") or "USDA Database",
                "source": "USDA FoodData Central",
                "per_100g": {
                    "calories": nmap.get("calories"),
                    "protein": nmap.get("protein"),
                    "carbs": nmap.get("carbs"),
                    "fat": nmap.get("fat"),
                    "fiber": nmap.get("fiber"),
                    "sugar": nmap.get("sugar"),
                    "sodium": nmap.get("sodium"),
                },
                "serving_options": servings,
            })

        out = {"ok": True, "source": "USDA FoodData Central", "results": results}
        _cache_set(cache_key, out)
        return out
    except Exception as exc:
        logger.warning("USDA FoodData lookup error: %s", type(exc).__name__)
        return {"ok": False, "source": "USDA FoodData Central", "error": "USDA FoodData service unavailable.", "results": []}


def _parse_off_product(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    name = (p.get("product_name") or p.get("product_name_en") or "").strip()
    if not name:
        return None
    nutr = p.get("nutriments") or {}
    cal = _safe_float(nutr.get("energy-kcal_100g"))
    if cal is None and nutr.get("energy-kcal_value") is not None:
        cal = _safe_float(nutr.get("energy-kcal_value"))
    prot = _safe_float(nutr.get("proteins_100g"))
    carbs = _safe_float(nutr.get("carbohydrates_100g"))
    fat = _safe_float(nutr.get("fat_100g"))
    fiber = _safe_float(nutr.get("fiber_100g"))
    sugar = _safe_float(nutr.get("sugars_100g"))
    sodium_g = _safe_float(nutr.get("sodium_100g"))
    sodium_mg = round(sodium_g * 1000.0, 1) if sodium_g is not None else None

    if cal is None and prot is None and carbs is None:
        return None

    servings = [{"unit": "g", "label": "100 g", "grams": 100.0}]
    serv_qty = _safe_float(p.get("serving_quantity"))
    if serv_qty and serv_qty > 0:
        servings.insert(0, {"unit": "serving", "label": p.get("serving_size") or f"1 Serving ({serv_qty}g)", "grams": serv_qty})

    return {
        "food_id": f"off_{p.get('code') or name[:16]}",
        "barcode": str(p.get("code") or ""),
        "name": name,
        "brand": p.get("brands") or "Packaged Food",
        "category": "Open Food Facts",
        "source": "Open Food Facts",
        "per_100g": {
            "calories": cal,
            "protein": prot,
            "carbs": carbs,
            "fat": fat,
            "fiber": fiber,
            "sugar": sugar,
            "sodium": sodium_mg,
        },
        "serving_options": servings,
    }


async def search_openfoodfacts(query: str, limit: int = 8) -> Dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {"ok": True, "source": "Open Food Facts", "results": []}
    cache_key = ("off", q.lower(), limit)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    headers = {"User-Agent": "HealthPoint-Healthcare-Platform/2.0"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if q.isdigit() and 8 <= len(q) <= 14:
                res = await client.get(f"{OFF_PRODUCT_URL}/{q}.json", headers=headers)
                if res.status_code == 200:
                    prod = res.json().get("product")
                    parsed = _parse_off_product(prod) if prod else None
                    out = {"ok": True, "source": "Open Food Facts", "results": [parsed] if parsed else []}
                    _cache_set(cache_key, out)
                    return out
                return {"ok": True, "source": "Open Food Facts", "results": []}

            res = await client.get(
                OFF_SEARCH_URL,
                params={"search_terms": q, "search_simple": 1, "action": "process", "json": 1, "page_size": limit},
                headers=headers,
            )
        if res.status_code != 200:
            return {"ok": False, "source": "Open Food Facts", "error": f"Open Food Facts HTTP {res.status_code}", "results": []}

        products = res.json().get("products") or []
        results = []
        for p in products:
            parsed = _parse_off_product(p)
            if parsed:
                results.append(parsed)

        out = {"ok": True, "source": "Open Food Facts", "results": results}
        _cache_set(cache_key, out)
        return out
    except Exception as exc:
        logger.warning("Open Food Facts lookup error: %s", type(exc).__name__)
        return {"ok": False, "source": "Open Food Facts", "error": "Open Food Facts unavailable.", "results": []}


def estimate_daily_nutrition_targets(
    age: Optional[int],
    weight_kg: Optional[float],
    height_cm: Optional[float],
    gender: Optional[str],
    activity_level: str = "moderate",
    goal: str = "maintain",
) -> Dict[str, Any]:
    """
    Mifflin-St Jeor daily energy estimate. Explicit informational estimate — not a medical prescription.
    """
    act_mult = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }.get((activity_level or "moderate").lower(), 1.55)

    goal_delta = {
        "lose": -400,
        "maintain": 0,
        "gain": 300,
    }.get((goal or "maintain").lower(), 0)

    if weight_kg and height_cm and age:
        g_low = (gender or "").lower()
        s = 5 if g_low == "male" else (-161 if g_low == "female" else -78)
        bmr = 10.0 * float(weight_kg) + 6.25 * float(height_cm) - 5.0 * float(age) + s
        tdee = int(round(bmr * act_mult))
        target_cal = max(1200, tdee + goal_delta)
        estimated_from_profile = True
    else:
        target_cal = 2000
        estimated_from_profile = False

    protein_g = max(50, int(round((target_cal * 0.22) / 4.0)))
    fat_g = max(35, int(round((target_cal * 0.28) / 9.0)))
    carbs_g = max(100, int(round((target_cal * 0.50) / 4.0)))
    fiber_g = 30

    return {
        "calories": target_cal,
        "protein": protein_g,
        "carbs": carbs_g,
        "fat": fat_g,
        "fiber": fiber_g,
        "activity_level": activity_level,
        "goal": goal,
        "estimated_from_profile": estimated_from_profile,
        "disclaimer": "Estimated nutritional target using Mifflin-St Jeor equation; informational only and not a medical prescription.",
    }
