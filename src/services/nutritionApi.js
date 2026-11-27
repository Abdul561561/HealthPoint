import api from './api';

export const searchNutritionFoods = async (query, source = 'all') => {
  const response = await api.get('/nutrition/foods/search', {
    params: { q: query, source },
    timeout: 15000,
  });
  return response.data;
};

export const lookupBarcodeFood = async (barcode) => {
  const response = await api.get(`/nutrition/foods/barcode/${encodeURIComponent(barcode)}`, {
    timeout: 15000,
  });
  return response.data;
};

export const fetchMealsByDate = async (date) => {
  const response = await api.get('/nutrition/meals', {
    params: date ? { date } : {},
  });
  return response.data;
};

export const createMealLog = async (payload) => {
  const response = await api.post('/nutrition/meals', payload);
  return response.data;
};

export const updateMealLog = async (mealId, payload) => {
  const response = await api.put(`/nutrition/meals/${mealId}`, payload);
  return response.data;
};

export const deleteMealLog = async (mealId) => {
  const response = await api.delete(`/nutrition/meals/${mealId}`);
  return response.data;
};

export const fetchCustomFoods = async () => {
  const response = await api.get('/nutrition/custom-foods');
  return response.data;
};

export const createCustomFood = async (payload) => {
  const response = await api.post('/nutrition/custom-foods', payload);
  return response.data;
};

export const deleteCustomFood = async (foodId) => {
  const response = await api.delete(`/nutrition/custom-foods/${foodId}`);
  return response.data;
};

export const fetchNutritionHistory = async (days = 7) => {
  const response = await api.get('/nutrition/history', { params: { days } });
  return response.data;
};

export const fetchNutritionGoals = async () => {
  const response = await api.get('/nutrition/goals');
  return response.data;
};

export const updateNutritionGoals = async (payload) => {
  const response = await api.put('/nutrition/goals', payload);
  return response.data;
};
