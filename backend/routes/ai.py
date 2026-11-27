from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from auth.jwt_handler import get_current_user
from services.llm_service import get_llm_service
from services.voice_service import VoiceServiceState
from services.ai_tools_service import (
    tool_read_health_metrics,
    tool_list_user_records,
    tool_save_diet_plan,
    tool_save_workout_plan,
    tool_find_doctors,
    tool_find_pharmacies
)
from controllers.ai_controller import (
    chat_ai_controller,
    get_chat_history_controller,
    reset_chat_controller,
    delete_chat_session_controller,
    analyze_report_controller,
    generate_diet_controller,
    generate_fitness_controller,
    explain_medicine_controller,
    get_health_context_controller,
)

router = APIRouter(prefix="/ai", tags=["AI Health Services"])

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    location_query: Optional[str] = None
    location_denied: Optional[bool] = False

class ReportRequest(BaseModel):
    title: str
    category: str
    url: Optional[str] = None
    record_id: Optional[str] = None

class DietRequest(BaseModel):
    age: int
    weight: str
    height: str
    goal: str
    restrictions: Optional[str] = None
    question: Optional[str] = None
    date: Optional[str] = None

class FitnessRequest(BaseModel):
    age: int
    weight: str
    height: str
    fitness_level: str
    goals: str

class MedicineExplainRequest(BaseModel):
    medicine_name: str
    generic_name: Optional[str] = None

class ToolExecuteRequest(BaseModel):
    tool_name: str
    parameters: Optional[Dict[str, Any]] = None

@router.get("/health")
async def get_ai_health():
    """Returns runtime Google Gemini provider health and configured model identifier."""
    llm = get_llm_service()
    return await llm.check_health()

@router.get("/context")
async def get_ai_context(current_user: dict = Depends(get_current_user)):
    """Returns the authenticated user's live de-identified HealthPoint context summary."""
    return await get_health_context_controller(current_user["email"])

@router.post("/chat")
async def chat_ai(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    return await chat_ai_controller(
        current_user["email"],
        req.message,
        req.session_id,
        lat=req.lat,
        lng=req.lng,
        location_query=req.location_query,
        location_denied=bool(req.location_denied),
    )

@router.get("/chat/history")
async def get_chat_history(current_user: dict = Depends(get_current_user)):
    return await get_chat_history_controller(current_user["email"])

@router.post("/chat/reset")
async def reset_chat(current_user: dict = Depends(get_current_user)):
    return await reset_chat_controller(current_user["email"])

@router.delete("/chat/session/{session_id}")
async def delete_chat_session(session_id: str, current_user: dict = Depends(get_current_user)):
    return await delete_chat_session_controller(current_user["email"], session_id)

@router.post("/analyze-report")
async def analyze_report(req: ReportRequest, current_user: dict = Depends(get_current_user)):
    return await analyze_report_controller(current_user["email"], req.title, req.category, req.url, req.record_id)

@router.post("/diet")
async def generate_diet(req: DietRequest, current_user: dict = Depends(get_current_user)):
    return await generate_diet_controller(
        req.age,
        req.weight,
        req.height,
        req.goal,
        req.restrictions,
        user_email=current_user["email"],
        question=req.question,
        date_str=req.date,
    )

@router.post("/fitness")
async def generate_fitness(req: FitnessRequest, current_user: dict = Depends(get_current_user)):
    return await generate_fitness_controller(req.age, req.weight, req.height, req.fitness_level, req.goals)

@router.post("/medicine-explain")
async def medicine_explain(req: MedicineExplainRequest, current_user: dict = Depends(get_current_user)):
    return await explain_medicine_controller(current_user["email"], req.medicine_name, req.generic_name)

@router.get("/voice/capabilities")
async def get_voice_capabilities():
    """Returns modular readiness contracts for Speech-to-Text and multilingual support."""
    return VoiceServiceState.get_capabilities()

@router.get("/tools")
async def list_approved_tools():
    """List approved AI tool definitions with required permissions."""
    return {
        "tools": [
            {"name": "read_health_metrics", "description": "Reads current vitals for authenticated user", "auth_required": True},
            {"name": "list_user_records", "description": "Lists authorized medical records", "auth_required": True},
            {"name": "save_diet_plan", "description": "Saves generated diet plan to user profile", "auth_required": True},
            {"name": "save_workout_plan", "description": "Saves generated workout routine", "auth_required": True},
            {"name": "find_doctors", "description": "Queries platform verified doctors", "auth_required": False},
            {"name": "find_pharmacies", "description": "Queries platform verified pharmacies", "auth_required": False}
        ]
    }

@router.post("/tools/execute")
async def execute_approved_tool(req: ToolExecuteRequest, current_user: dict = Depends(get_current_user)):
    """Executes approved tools with server-side authentication and authorization."""
    email = current_user["email"]
    name = req.tool_name
    params = req.parameters or {}

    if name == "read_health_metrics":
        return await tool_read_health_metrics(email)
    elif name == "list_user_records":
        return await tool_list_user_records(email, limit=params.get("limit", 5))
    elif name == "save_diet_plan":
        return await tool_save_diet_plan(email, params.get("title", ""), params.get("plan_text", ""))
    elif name == "save_workout_plan":
        return await tool_save_workout_plan(email, params.get("title", ""), params.get("routine_text", ""))
    elif name == "find_doctors":
        return await tool_find_doctors(specialty=params.get("specialty"))
    elif name == "find_pharmacies":
        return await tool_find_pharmacies(query=params.get("query"))
    else:
        raise HTTPException(status_code=400, detail=f"Unrecognized tool '{name}'")
