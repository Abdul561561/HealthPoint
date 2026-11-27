import api from './api';

const AI_REQUEST_CONFIG = { timeout: 60000 };

export const sendChatMessage = async (message, sessionId = null, locationContext = {}) => {
  const payload = {
    message,
    session_id: sessionId,
  };
  if (locationContext?.lat !== undefined && locationContext?.lat !== null) {
    payload.lat = locationContext.lat;
  }
  if (locationContext?.lng !== undefined && locationContext?.lng !== null) {
    payload.lng = locationContext.lng;
  }
  if (locationContext?.locationQuery) {
    payload.location_query = locationContext.locationQuery;
  }
  if (locationContext?.locationDenied) {
    payload.location_denied = true;
  }
  const response = await api.post('/ai/chat', payload, AI_REQUEST_CONFIG);
  return response.data;
};

export const fetchChatHistory = async () => {
  const response = await api.get('/ai/chat/history');
  return response.data;
};

export const resetChatSession = async () => {
  const response = await api.post('/ai/chat/reset');
  return response.data;
};

export const deleteChatSession = async (sessionId) => {
  const response = await api.delete(`/ai/chat/session/${sessionId}`);
  return response.data;
};

export const fetchAiHealth = async () => {
  const response = await api.get('/ai/health');
  return response.data;
};

export const fetchAiHealthContext = async () => {
  const response = await api.get('/ai/context');
  return response.data;
};

export const analyzeMedicalReport = async (title, category, url = null, recordId = null) => {
  const response = await api.post('/ai/analyze-report', {
    title,
    category,
    url,
    record_id: recordId
  }, AI_REQUEST_CONFIG);
  return response.data;
};

export const generateDietPlan = async (dietData) => {
  const response = await api.post('/ai/diet', dietData, AI_REQUEST_CONFIG);
  return response.data;
};

export const generateWorkoutPlan = async (fitnessData) => {
  const response = await api.post('/ai/fitness', fitnessData, AI_REQUEST_CONFIG);
  return response.data;
};

export const explainMedicine = async (medicineName, genericName = null) => {
  const response = await api.post('/ai/medicine-explain', {
    medicine_name: medicineName,
    generic_name: genericName,
  }, AI_REQUEST_CONFIG);
  return response.data;
};

export const executeAiTool = async (toolName, parameters = {}) => {
  const response = await api.post('/ai/tools/execute', {
    tool_name: toolName,
    parameters
  });
  return response.data;
};
