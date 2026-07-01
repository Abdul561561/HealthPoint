from fastapi import APIRouter, Depends
from typing import List
from backend.models.fitness import WorkoutCreate, WorkoutResponse, WaterUpdate, MetricUpdate, MealCreate, MealResponse
from backend.auth.jwt_handler import get_current_user
from backend.controllers.fitness_controller import (
    get_workouts_controller,
    create_workout_controller,
    get_metrics_controller,
    update_metric_controller,
    update_water_controller,
    get_meals_controller,
    create_meal_controller,
    delete_meal_controller
)

router = APIRouter(prefix="/fitness", tags=["Fitness & Health Vitals"])

@router.get("/workouts", response_model=List[WorkoutResponse])
async def get_workouts(current_user: dict = Depends(get_current_user)):
    return await get_workouts_controller(current_user["email"])

@router.post("/workouts", response_model=WorkoutResponse)
async def create_workout(workout_data: WorkoutCreate, current_user: dict = Depends(get_current_user)):
    return await create_workout_controller(current_user["email"], workout_data)

@router.get("/metrics")
async def get_metrics(current_user: dict = Depends(get_current_user)):
    return await get_metrics_controller(current_user["email"])

@router.post("/metrics")
async def update_metric(metric_data: MetricUpdate, current_user: dict = Depends(get_current_user)):
    return await update_metric_controller(current_user["email"], metric_data)

@router.post("/water")
async def update_water(water_data: WaterUpdate, current_user: dict = Depends(get_current_user)):
    return await update_water_controller(current_user["email"], water_data)

@router.get("/meals", response_model=List[MealResponse])
async def get_meals(current_user: dict = Depends(get_current_user)):
    return await get_meals_controller(current_user["email"])

@router.post("/meals", response_model=MealResponse)
async def create_meal(meal_data: MealCreate, current_user: dict = Depends(get_current_user)):
    return await create_meal_controller(current_user["email"], meal_data)

@router.delete("/meals/{meal_id}")
async def delete_meal(meal_id: str, current_user: dict = Depends(get_current_user)):
    return await delete_meal_controller(current_user["email"], meal_id)
