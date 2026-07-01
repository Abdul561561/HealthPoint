import api from './api';

export const fetchVideoAppointments = async () => {
  const response = await api.get('/consultations/appointments');
  return response.data;
};

export const fetchJitsiRoomConfig = async (apptId) => {
  const response = await api.get(`/consultations/room/${apptId}`);
  return response.data;
};

export const saveClinicalNote = async (noteData) => {
  const response = await api.post('/consultations/notes', noteData);
  return response.data;
};

export const fetchPatientNotes = async (patientEmail) => {
  const response = await api.get(`/consultations/notes/${patientEmail}`);
  return response.data;
};

export const fetchPatientBiometrics = async (patientEmail) => {
  const response = await api.get(`/consultations/biometrics/${patientEmail}`);
  return response.data;
};
