import api from './api';
export const getLatestPrescription = async () => {
  const response = await api.get('/pharmacy/prescription');
  return response.data;
};
export const uploadPrescription = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/pharmacy/prescription', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000, // 60s timeout for live multimodal Gemini AI processing
  });
  return response.data;
};

export const fetchPrescriptionHistory = async () => {
  const response = await api.get('/pharmacy/prescriptions');
  return response.data;
};

export const placeOrder = async (orderData) => {
  const response = await api.post('/pharmacy/order', orderData);
  return response.data;
};

export const fetchOrderHistory = async () => {
  const response = await api.get('/pharmacy/orders');
  return response.data;
};

export const fetchNearbyStores = async (lat, lng) => {
  const url = lat !== undefined && lng !== undefined ? `/pharmacy/stores?lat=${lat}&lng=${lng}` : '/pharmacy/stores';
  const response = await api.get(url);
  return response.data;
};

export const deletePrescription = async (prescriptionId) => {
  const response = await api.delete(`/pharmacy/prescriptions/${prescriptionId}`);
  return response.data;
};


