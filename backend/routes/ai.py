from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from backend.auth.jwt_handler import get_current_user
from backend.controllers.ai_controller import (
    chat_ai_controller,
    get_chat_history_controller,
    analyze_report_controller,
    generate_diet_controller,
    generate_fitness_controller,
    explain_medicine_controller
)

router = APIRouter(prefix="/ai", tags=["AI Health Services"])

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ReportRequest(BaseModel):
    title: str
    category: str
    url: Optional[str] = None

class DietRequest(BaseModel):
    age: int
    weight: str
    height: str
    goal: str
    restrictions: Optional[str] = None

class FitnessRequest(BaseModel):
    age: int
    weight: str
    height: str
    fitness_level: str
    goals: str

class MedicineExplainRequest(BaseModel):
    medicine_name: str
    generic_name: Optional[str] = None

@router.post("/chat")
async def chat_ai(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    return await chat_ai_controller(current_user["email"], req.message, req.session_id)

@router.get("/chat/history")
async def get_chat_history(current_user: dict = Depends(get_current_user)):
    return await get_chat_history_controller(current_user["email"])

@router.post("/analyze-report")
async def analyze_report(req: ReportRequest, current_user: dict = Depends(get_current_user)):
    return await analyze_report_controller(req.title, req.category, req.url)

@router.post("/diet")
async def generate_diet(req: DietRequest, current_user: dict = Depends(get_current_user)):
    return await generate_diet_controller(req.age, req.weight, req.height, req.goal, req.restrictions)

@router.post("/fitness")
async def generate_fitness(req: FitnessRequest, current_user: dict = Depends(get_current_user)):
    return await generate_fitness_controller(req.age, req.weight, req.height, req.fitness_level, req.goals)

@router.post("/medicine-explain")
async def medicine_explain(req: MedicineExplainRequest, current_user: dict = Depends(get_current_user)):
    return await explain_medicine_controller(current_user["email"], req.medicine_name, req.generic_name)
