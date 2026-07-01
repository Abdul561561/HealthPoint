from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from backend.auth.jwt_handler import get_current_user
from backend.models.insurance import (
    ClaimCreate, ClaimResponse, ChatRequest, PlanResponse, FavoriteHospitalRequest
)
from backend.controllers.insurance_controller import (
    get_claims_controller,
    create_claim_controller,
    analyze_claim_controller,
    get_plans_controller,
    save_plan_controller,
    unsave_plan_controller,
    get_saved_plans_controller,
    toggle_favorite_hospital_controller,
    get_favorite_hospitals_controller,
    chat_insurance_assistant_controller
)

router = APIRouter(prefix="/insurance", tags=["Insurance Coverage"])

# --- CLAIMS ---

@router.get("/claims", response_model=List[ClaimResponse])
async def get_claims(current_user: dict = Depends(get_current_user)):
    return await get_claims_controller(current_user["email"])

@router.post("/claims", response_model=ClaimResponse)
async def create_claim(claim_data: ClaimCreate, current_user: dict = Depends(get_current_user)):
    return await create_claim_controller(current_user["email"], claim_data)

@router.post("/claims/{claim_id}/analyze", response_model=ClaimResponse)
async def analyze_claim(claim_id: str, current_user: dict = Depends(get_current_user)):
    return await analyze_claim_controller(current_user["email"], claim_id)

# --- PLANS ---

@router.get("/plans", response_model=List[PlanResponse])
async def get_plans(
    demographic: Optional[str] = Query(None, description="Plan type filter (e.g. individual, family, senior citizen)"),
    budget_max: Optional[float] = Query(None, description="Maximum monthly premium threshold"),
    cashless: Optional[bool] = Query(None, description="Filter for cashless support availability"),
    current_user: dict = Depends(get_current_user)
):
    return await get_plans_controller(demographic, budget_max, cashless)

@router.get("/plans/saved", response_model=List[PlanResponse])
async def get_saved_plans(current_user: dict = Depends(get_current_user)):
    return await get_saved_plans_controller(current_user["email"])

@router.post("/plans/{plan_id}/save")
async def save_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    return await save_plan_controller(current_user["email"], plan_id)

@router.delete("/plans/{plan_id}/save")
async def unsave_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    return await unsave_plan_controller(current_user["email"], plan_id)

# --- HOSPITALS ---

@router.get("/hospitals/favorites")
async def get_favorite_hospitals(current_user: dict = Depends(get_current_user)):
    return await get_favorite_hospitals_controller(current_user["email"])

@router.post("/hospitals/favorites")
async def toggle_favorite_hospital(hosp_data: FavoriteHospitalRequest, current_user: dict = Depends(get_current_user)):
    return await toggle_favorite_hospital_controller(current_user["email"], hosp_data)

# --- CHATBOT ---

@router.post("/chat")
async def chat_insurance(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    return await chat_insurance_assistant_controller(current_user["email"], req.message, req.session_id)

