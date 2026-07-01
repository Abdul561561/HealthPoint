import axios from 'axios';

const api = axios.create({
    baseURL: 'https://healthpoint-backend.onrender.com/api',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});
// Request interceptor — attach auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('hp-token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — print errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
