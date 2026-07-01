import api from './api';

export const fetchAnalyticsDashboard = async () => {
  const response = await api.get('/analytics/dashboard');
  return response.data; // returns { scoreBreakdown, riskPredictions, weeklyReport }
};

export const fetchHealthScore = async () => {
  const response = await api.get('/analytics/score');
  return response.data; // returns HealthScoreBreakdown
};

export const fetchRiskPredictions = async () => {
  const response = await api.get('/analytics/predictions');
  return response.data; // returns list of RiskPredictionCard
};

export const fetchWeeklyReport = async () => {
  const response = await api.get('/analytics/weekly-report');
  return response.data; // returns WeeklyReportResponse
};
