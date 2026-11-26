from pydantic import BaseModel
from typing import List, Optional


class HealthScoreBreakdown(BaseModel):
    totalScore: Optional[int] = None
    sleepScore: Optional[int] = None
    activityScore: Optional[int] = None
    heartScore: Optional[int] = None
    bpScore: Optional[int] = None
    bmiScore: Optional[int] = None
    grade: str
    dataAvailable: bool = False
    missingFields: List[str] = []


class RiskPredictionCard(BaseModel):
    name: str
    probability: Optional[float] = None
    level: str
    color: str
    factors: List[str]
    recommendations: List[str]


class WeeklyReportResponse(BaseModel):
    summary: str
    sleepAvg: Optional[float] = None
    sleepDiff: Optional[float] = None
    stepsAvg: Optional[float] = None
    stepsDiff: Optional[float] = None
    caloriesAvg: Optional[float] = None
    caloriesDiff: Optional[float] = None
    hrAvg: Optional[float] = None
    hrDiff: Optional[float] = None


class AnalyticsDashboardResponse(BaseModel):
    scoreBreakdown: HealthScoreBreakdown
    riskPredictions: List[RiskPredictionCard]
    weeklyReport: WeeklyReportResponse
