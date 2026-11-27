import api from './api';

export const fetchEmergencyConfig = async () => {
  const response = await api.get('/emergency/config');
  return response.data;
};

export const fetchEmergencyContacts = async () => {
  const response = await api.get('/emergency/contacts');
  return response.data;
};

export const createEmergencyContact = async (payload) => {
  const response = await api.post('/emergency/contacts', payload);
  return response.data;
};

export const updateEmergencyContact = async (contactId, payload) => {
  const response = await api.put(`/emergency/contacts/${contactId}`, payload);
  return response.data;
};

export const deleteEmergencyContact = async (contactId) => {
  const response = await api.delete(`/emergency/contacts/${contactId}`);
  return response.data;
};

export const activateEmergencySos = async (payload) => {
  const response = await api.post('/emergency/sos', payload);
  return response.data;
};

export const fetchEmergencyHistory = async () => {
  const response = await api.get('/emergency/history');
  return response.data;
};

export const cancelEmergencySos = async (eventId, reason = 'Cancelled by user') => {
  const response = await api.post(`/emergency/sos/${eventId}/cancel`, { reason });
  return response.data;
};

export const stopSosLocationSharing = async (eventId) => {
  const response = await api.post(`/emergency/sos/${eventId}/stop-sharing`);
  return response.data;
};
