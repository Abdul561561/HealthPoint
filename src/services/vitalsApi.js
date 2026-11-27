import api from './api';

export const fetchVitalsReadings = async (days = 30) => {
  const response = await api.get('/vitals/readings', { params: { days } });
  return response.data;
};

export const createVitalReading = async (payload) => {
  const response = await api.post('/vitals/readings', payload);
  return response.data;
};

export const updateVitalReading = async (readingId, payload) => {
  const response = await api.put(`/vitals/readings/${readingId}`, payload);
  return response.data;
};

export const deleteVitalReading = async (readingId) => {
  const response = await api.delete(`/vitals/readings/${readingId}`);
  return response.data;
};

export const fetchVitalsSummary = async (range = 'week') => {
  const response = await api.get('/vitals/summary', { params: { range } });
  return response.data;
};

export const downloadVitalsExport = async (format = 'csv', days = 30) => {
  const response = await api.get('/vitals/export', {
    params: { format, days },
    responseType: format === 'csv' ? 'blob' : 'json',
  });
  return response.data;
};

export const fetchHealthPlatforms = async () => {
  const response = await api.get('/vitals/platforms');
  return response.data;
};

export const syncHealthPlatform = async (platformId) => {
  const response = await api.post(`/vitals/platforms/${platformId}/sync`);
  return response.data;
};
