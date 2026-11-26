import axios from 'axios';

const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:8000/api'
  : 'https://healthpoint-backend.onrender.com/api';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
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

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

/**
 * Fetch a protected backend file (e.g. /api/records/:id/download) using JWT auth
 * and return a temporary Blob URL for safe preview or download.
 */
export async function fetchProtectedFileBlobUrl(urlPath) {
  if (!urlPath) throw new Error('No file URL provided');
  if (urlPath.startsWith('https://')) {
    return { url: urlPath, revoke: false };
  }
  const normalized = urlPath.startsWith('/api/') ? urlPath.slice(4) : urlPath;
  const response = await api.get(normalized, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(response.data);
  return { url: blobUrl, revoke: true };
}

export default api;
