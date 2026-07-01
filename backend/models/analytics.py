from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class HealthScoreBreakdown(BaseModel):
    totalScore: int
    sleepScore: int
    activityScore: int
    heartScore: int
    bpScore: int
    bmiScore: int
    grade: str # e.g. "Optimal", "Good", "Needs Attention"

class RiskPredictionCard(BaseModel):
    name: str # e.g. "Cardiovascular Health", "Type 2 Diabetes", "Sleep Fatigue"
    probability: float # percentage e.g. 12.5
    level: str # "Low", "Medium", "High"
    color: str # "green", "yellow", "red"
    factors: List[str] # contributing parameters
    recommendations: List[str] # preventive clinical advice

class WeeklyReportResponse(BaseModel):
    summary: str
    sleepAvg: float
    sleepDiff: float # percentage change e.g. +12.4
    stepsAvg: float
    stepsDiff: float
    caloriesAvg: float
    caloriesDiff: float
    hrAvg: float
    hrDiff: float

class AnalyticsDashboardResponse(BaseModel):
    scoreBreakdown: HealthScoreBreakdown
    riskPredictions: List[RiskPredictionCard]
    weeklyReport: WeeklyReportResponse
