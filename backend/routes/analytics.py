from fastapi import APIRouter, Depends
from auth.jwt_handler import get_current_user
from controllers.analytics_controller import get_analytics_dashboard_controller
from models.analytics import (
    HealthScoreBreakdown,
    RiskPredictionCard,
    WeeklyReportResponse,
    AnalyticsDashboardResponse
)
from typing import List

router = APIRouter(prefix="/analytics", tags=["Health Analytics"])

@router.get("/dashboard", response_model=AnalyticsDashboardResponse)
async def get_analytics_dashboard(current_user: dict = Depends(get_current_user)):
    return await get_analytics_dashboard_controller(current_user["email"])

@router.get("/score", response_model=HealthScoreBreakdown)
async def get_health_score(current_user: dict = Depends(get_current_user)):
    data = await get_analytics_dashboard_controller(current_user["email"])
    return data.scoreBreakdown

@router.get("/predictions", response_model=List[RiskPredictionCard])
async def get_risk_predictions(current_user: dict = Depends(get_current_user)):
    data = await get_analytics_dashboard_controller(current_user["email"])
    return data.riskPredictions

@router.get("/weekly-report", response_model=WeeklyReportResponse)
async def get_weekly_report(current_user: dict = Depends(get_current_user)):
    data = await get_analytics_dashboard_controller(current_user["email"])
    return data.weeklyReport
