import api from './api';

export const sendChatMessage = async (message, sessionId = null) => {
  const response = await api.post('/ai/chat', {
    message,
    session_id: sessionId
  });
  return response.data;
};

export const fetchChatHistory = async () => {
  const response = await api.get('/ai/chat/history');
  return response.data;
};

export const analyzeMedicalReport = async (title, category, url = null) => {
  const response = await api.post('/ai/analyze-report', {
    title,
    category,
    url
  });
  return response.data;
};

export const generateDietPlan = async (dietData) => {
  const response = await api.post('/ai/diet', dietData);
  return response.data;
};

export const generateWorkoutPlan = async (fitnessData) => {
  const response = await api.post('/ai/fitness', fitnessData);
  return response.data;
};

export const explainMedicine = async (medicineName, genericName = null) => {
  const response = await api.post('/ai/medicine-explain', {
    medicine_name: medicineName,
    generic_name: genericName,
  });
  return response.data;
};