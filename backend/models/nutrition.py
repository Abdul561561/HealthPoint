from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class ServingOption(BaseModel):
    unit: str
    label: str
    grams: float


class NutritionPer100g(BaseModel):
    calories: Optional[float] = Field(None, ge=0)
    protein: Optional[float] = Field(None, ge=0)
    carbs: Optional[float] = Field(None, ge=0)
    fat: Optional[float] = Field(None, ge=0)
    fiber: Optional[float] = Field(None, ge=0)
    sugar: Optional[float] = Field(None, ge=0)
    sodium: Optional[float] = Field(None, ge=0)


class MealLogCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=180)
    time: str = Field(..., pattern="^(Breakfast|Lunch|Dinner|Snack)$")
    date: Optional[str] = None
    quantity: float = Field(1.0, gt=0)
    unit: str = "serving"
    grams: float = Field(100.0, gt=0)
    calories: int = Field(..., ge=0)
    protein: float = Field(0.0, ge=0)
    carbs: float = Field(0.0, ge=0)
    fat: float = Field(0.0, ge=0)
    fiber: float = Field(0.0, ge=0)
    sugar: Optional[float] = Field(None, ge=0)
    sodium: Optional[float] = Field(None, ge=0)
    brand: Optional[str] = None
    source: Optional[str] = None
    food_id: Optional[str] = None
    per_100g: Optional[Dict[str, Any]] = None


class MealLogUpdate(BaseModel):
    time: Optional[str] = Field(None, pattern="^(Breakfast|Lunch|Dinner|Snack)$")
    quantity: Optional[float] = Field(None, gt=0)
    grams: Optional[float] = Field(None, gt=0)
    calories: Optional[int] = Field(None, ge=0)
    protein: Optional[float] = Field(None, ge=0)
    carbs: Optional[float] = Field(None, ge=0)
    fat: float | None = Field(None, ge=0)
    fiber: Optional[float] = Field(None, ge=0)
    sugar: Optional[float] = Field(None, ge=0)
    sodium: Optional[float] = Field(None, ge=0)


class CustomFoodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    brand: Optional[str] = "Custom Food"
    calories: float = Field(..., ge=0)
    protein: float = Field(0.0, ge=0)
    carbs: float = Field(0.0, ge=0)
    fat: float = Field(0.0, ge=0)
    fiber: float = Field(0.0, ge=0)
    sugar: Optional[float] = Field(None, ge=0)
    sodium: Optional[float] = Field(None, ge=0)
    serving_grams: float = Field(100.0, gt=0)
    serving_label: Optional[str] = "1 Serving"


class NutritionGoalUpdate(BaseModel):
    calories: Optional[int] = Field(None, ge=1000, le=8000)
    protein: Optional[int] = Field(None, ge=20, le=500)
    carbs: Optional[int] = Field(None, ge=20, le=1000)
    fat: Optional[int] = Field(None, ge=15, le=400)
    fiber: Optional[int] = Field(None, ge=5, le=150)
    activity_level: Optional[str] = Field("moderate", pattern="^(sedentary|light|moderate|active|very_active)$")
    goal: Optional[str] = Field("maintain", pattern="^(lose|maintain|gain)$")
    use_estimated: Optional[bool] = False
