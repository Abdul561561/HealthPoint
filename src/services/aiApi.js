import api from './api';
import axios from 'axios';

// Create a separate Axios instance for AI calls with longer timeout
const api = axios.create({
    baseURL: 'https://healthpoint-backend.onrender.com/api',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});

aiApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('hp-token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

export const sendChatMessage = async (message, sessionId = null) => {
  const response = await aiApi.post('/ai/chat', { message, session_id: sessionId });
  return response.data;
};

export const fetchChatHistory = async () => {
  const response = await aiApi.get('/ai/chat/history');
  return response.data;
};

export const analyzeMedicalReport = async (title, category, url = null) => {
  const response = await aiApi.post('/ai/analyze-report', { title, category, url });
  return response.data;
};

export const generateDietPlan = async (dietData) => {
  const response = await aiApi.post('/ai/diet', dietData);
  return response.data;
};

export const generateWorkoutPlan = async (fitnessData) => {
  const response = await aiApi.post('/ai/fitness', fitnessData);
  return response.data;
};

export const explainMedicine = async (medicineName, genericName = null) => {
  const response = await aiApi.post('/ai/medicine-explain', {
    medicine_name: medicineName,
    generic_name: genericName,
  });
  return response.data;
};
