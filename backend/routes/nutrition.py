from typing import Optional
from fastapi import APIRouter, Depends, Query
from auth.jwt_handler import get_current_user
from models.nutrition import (
    CustomFoodCreate,
    MealLogCreate,
    MealLogUpdate,
    NutritionGoalUpdate,
)
from controllers.nutrition_controller import (
    barcode_lookup_controller,
    create_custom_food_controller,
    create_meal_log_controller,
    delete_custom_food_controller,
    delete_meal_log_controller,
    get_custom_foods_controller,
    get_meals_by_date_controller,
    get_nutrition_goals_controller,
    get_nutrition_history_controller,
    search_foods_controller,
    update_meal_log_controller,
    update_nutrition_goals_controller,
)

router = APIRouter(prefix="/nutrition", tags=["Nutrition & Food Tracking"])


@router.get("/foods/search")
async def search_foods(
    q: str = Query("", description="Food name, brand, or barcode"),
    source: Optional[str] = Query("all", description="all | indian | usda | openfoodfacts | custom"),
    current_user: dict = Depends(get_current_user),
):
    return await search_foods_controller(current_user["email"], q, source or "all")


@router.get("/foods/barcode/{barcode}")
async def lookup_barcode(barcode: str, current_user: dict = Depends(get_current_user)):
    return await barcode_lookup_controller(barcode)


@router.get("/custom-foods")
async def list_custom_foods(current_user: dict = Depends(get_current_user)):
    return await get_custom_foods_controller(current_user["email"])


@router.post("/custom-foods")
async def add_custom_food(payload: CustomFoodCreate, current_user: dict = Depends(get_current_user)):
    return await create_custom_food_controller(current_user["email"], payload)


@router.delete("/custom-foods/{food_id}")
async def remove_custom_food(food_id: str, current_user: dict = Depends(get_current_user)):
    return await delete_custom_food_controller(current_user["email"], food_id)


@router.get("/meals")
async def list_meals(
    date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
):
    return await get_meals_by_date_controller(current_user["email"], date)


@router.post("/meals")
async def log_meal(payload: MealLogCreate, current_user: dict = Depends(get_current_user)):
    return await create_meal_log_controller(current_user["email"], payload)


@router.put("/meals/{meal_id}")
async def edit_meal(meal_id: str, payload: MealLogUpdate, current_user: dict = Depends(get_current_user)):
    return await update_meal_log_controller(current_user["email"], meal_id, payload)


@router.delete("/meals/{meal_id}")
async def remove_meal(meal_id: str, current_user: dict = Depends(get_current_user)):
    return await delete_meal_log_controller(current_user["email"], meal_id)


@router.get("/history")
async def meal_history(days: int = Query(7, ge=1, le=30), current_user: dict = Depends(get_current_user)):
    return await get_nutrition_history_controller(current_user["email"], days)


@router.get("/goals")
async def get_goals(current_user: dict = Depends(get_current_user)):
    return await get_nutrition_goals_controller(current_user["email"])


@router.put("/goals")
async def set_goals(payload: NutritionGoalUpdate, current_user: dict = Depends(get_current_user)):
    return await update_nutrition_goals_controller(current_user["email"], payload)
