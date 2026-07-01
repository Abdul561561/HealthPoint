from pydantic import BaseModel
from typing import Optional

class WorkoutCreate(BaseModel):
    name: str
    type: str # "Cardio", "Strength", "Flexibility", etc.
    duration: int # minutes
    calories: int # kcal
    completed: bool = False
    date: str # YYYY-MM-DD

class WorkoutResponse(BaseModel):
    id: str
    name: str
    type: str
    duration: int
    calories: int
    completed: bool
    date: str

class WaterUpdate(BaseModel):
    glasses: int

class MetricUpdate(BaseModel):
    key: str # "heartRate", "bloodPressure", "sleep", "calories", "steps", "water", "weight", "bmi", "oxygen", "temperature"
    value: dict # object containing updated fields

class MealCreate(BaseModel):
    name: str
    time: str # "Breakfast", "Lunch", "Dinner", "Snack"
    calories: int
    protein: float
    carbs: float
    fat: float
    fiber: float

class MealResponse(BaseModel):
    id: str
    name: str
    time: str
    calories: int
    protein: float
    carbs: float
    fat: float
    fiber: float
