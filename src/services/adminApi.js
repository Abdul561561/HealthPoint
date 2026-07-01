import api from './api';

// Stats & Analytics Overview
export const fetchAdminDashboardStats = async () => {
  const response = await api.get('/admin/dashboard');
  return response.data; // returns { stats, revenueChart, recentActivities }
};

// Users Management
export const fetchAdminUsers = async () => {
  const response = await api.get('/admin/users');
  return response.data;
};

export const updateAdminUser = async (userId, data) => {
  const response = await api.put(`/admin/users/${userId}`, data);
  return response.data;
};

export const deleteAdminUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};

// Doctors Management
export const fetchAdminDoctors = async () => {
  const response = await api.get('/admin/doctors');
  return response.data;
};

export const createAdminDoctor = async (data) => {
  const response = await api.post('/admin/doctors', data);
  return response.data;
};

export const updateAdminDoctor = async (doctor_id, data) => {
  const response = await api.put(`/admin/doctors/${doctor_id}`, data);
  return response.data;
};

export const deleteAdminDoctor = async (doctor_id) => {
  const response = await api.delete(`/admin/doctors/${doctor_id}`);
  return response.data;
};

// Medicines Management
export const fetchAdminMedicines = async () => {
  const response = await api.get('/admin/medicines');
  return response.data;
};

export const createAdminMedicine = async (data) => {
  const response = await api.post('/admin/medicines', data);
  return response.data;
};

export const updateAdminMedicine = async (medId, data) => {
  const response = await api.put(`/admin/medicines/${medId}`, data);
  return response.data;
};

export const deleteAdminMedicine = async (medId) => {
  const response = await api.delete(`/admin/medicines/${medId}`);
  return response.data;
};

// Appointments Control
export const fetchAdminAppointments = async () => {
  const response = await api.get('/admin/appointments');
  return response.data;
};

export const updateAdminAppointment = async (apptId, data) => {
  const response = await api.put(`/admin/appointments/${apptId}`, data);
  return response.data;
};

export const deleteAdminAppointment = async (apptId) => {
  const response = await api.delete(`/admin/appointments/${apptId}`);
  return response.data;
};

// AI Logs Monitor
export const fetchAdminAIChats = async () => {
  const response = await api.get('/admin/ai-monitoring');
  return response.data;
};

// Reports and Scans Management
export const fetchAdminReports = async () => {
  const response = await api.get('/admin/reports');
  return response.data;
};

export const updateAdminReportStatus = async (reportId, status) => {
  const response = await api.put(`/admin/reports/${reportId}`, { status });
  return response.data;
};
