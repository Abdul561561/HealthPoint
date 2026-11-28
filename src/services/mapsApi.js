import api from './api';

export function extractMapsErrorMessage(err, fallback = 'OpenStreetMap discovery request failed.') {
  if (!err) return fallback;
  if (err.code === 'ECONNABORTED' || String(err.message || '').toLowerCase().includes('timeout')) {
    return 'OpenStreetMap search timed out while waiting for public Overpass servers. Please retry or try a smaller radius.';
  }
  if (!err.response && (err.code === 'ERR_NETWORK' || String(err.message || '').toLowerCase().includes('network'))) {
    return 'Network connection interrupted while contacting HealthPoint discovery API. Check your internet connection and retry.';
  }
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => d.msg || String(d)).join('; ');
  }
  return err.message || fallback;
}

export const fetchMapsConfig = async () => {
  const response = await api.get('/maps/config', { timeout: 12000 });
  return response.data;
};

export const geocodeLocationQuery = async (query) => {
  const response = await api.get('/maps/geocode', {
    params: { q: query },
    timeout: 15000,
  });
  return response.data;
};

export const fetchNearbyDoctors = async ({
  lat,
  lng,
  specialty = 'All',
  radius = 5000,
  locationLabel = null,
}) => {
  const response = await api.get('/maps/nearby-doctors', {
    params: {
      lat,
      lng,
      specialty,
      radius,
      location_label: locationLabel || undefined,
    },
    timeout: 25000,
  });
  return response.data;
};

export const fetchNearbyHospitals = async ({
  lat,
  lng,
  radius = 8000,
  locationLabel = null,
}) => {
  const response = await api.get('/maps/nearby-hospitals', {
    params: {
      lat,
      lng,
      radius,
      location_label: locationLabel || undefined,
    },
    timeout: 25000,
  });
  return response.data;
};

export const fetchNearbyPharmacies = async ({
  lat,
  lng,
  filterType = 'all',
  radius = 5000,
  locationLabel = null,
}) => {
  const response = await api.get('/maps/nearby-pharmacies', {
    params: {
      lat,
      lng,
      filter_type: filterType,
      radius,
      location_label: locationLabel || undefined,
    },
    timeout: 25000,
  });
  return response.data;
};
