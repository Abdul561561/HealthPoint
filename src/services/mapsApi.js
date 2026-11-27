import api from './api';

export const fetchMapsConfig = async () => {
  const response = await api.get('/maps/config');
  return response.data;
};

export const geocodeLocationQuery = async (query) => {
  const response = await api.get('/maps/geocode', {
    params: { q: query },
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
  });
  return response.data;
};
