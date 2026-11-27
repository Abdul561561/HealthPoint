import api from './api';

export const fetchNotifications = async ({ category, unreadOnly } = {}) => {
  const params = {};
  if (category && category !== 'all') params.category = category;
  if (unreadOnly) params.unread_only = true;
  const response = await api.get('/notifications/', { params });
  return response.data;
};

export const createNotificationApi = async (payload) => {
  const response = await api.post('/notifications/', payload);
  return response.data;
};

export const markNotificationReadApi = async (id) => {
  const response = await api.post(`/notifications/${id}/read`);
  return response.data;
};

export const markNotificationUnreadApi = async (id) => {
  const response = await api.post(`/notifications/${id}/unread`);
  return response.data;
};

export const markAllNotificationsReadApi = async () => {
  const response = await api.post('/notifications/read-all');
  return response.data;
};

export const deleteNotificationApi = async (id) => {
  const response = await api.delete(`/notifications/${id}`);
  return response.data;
};

export const clearReadNotificationsApi = async () => {
  const response = await api.delete('/notifications/clear-read');
  return response.data;
};

export const clearAllNotificationsApi = async () => {
  const response = await api.delete('/notifications/clear-all');
  return response.data;
};

export const fetchReminders = async () => {
  const response = await api.get('/notifications/reminders');
  return response.data;
};

export const createReminderApi = async (payload) => {
  const response = await api.post('/notifications/reminders', payload);
  return response.data;
};

export const updateReminderApi = async (id, payload) => {
  const response = await api.put(`/notifications/reminders/${id}`, payload);
  return response.data;
};

export const deleteReminderApi = async (id) => {
  const response = await api.delete(`/notifications/reminders/${id}`);
  return response.data;
};

export const evaluateRemindersApi = async () => {
  const response = await api.post('/notifications/reminders/evaluate');
  return response.data;
};
