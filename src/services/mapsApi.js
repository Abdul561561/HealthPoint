import api from './api';

/**
 * Wait for Google Maps JavaScript API to be loaded.
 * Returns a Promise that resolves when window.google.maps is ready.
 */
export function waitForGoogleMaps(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (window.__googleMapsLoaded && window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    window.__googleMapsCallbacks = window.__googleMapsCallbacks || [];
    window.__googleMapsCallbacks.push(() => resolve(window.google.maps));

    setTimeout(() => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps API failed to load within timeout.'));
      }
    }, timeoutMs);
  });
}

/**
 * Fetch nearby doctors from the backend (which calls Google Places API).
 */
export async function searchNearbyDoctors(lat, lng, specialty = 'All', radius = 5000) {
  const res = await api.get('/maps/nearby-doctors', {
    params: { lat, lng, specialty, radius }
  });
  return res.data;
}

/**
 * Fetch nearby pharmacies from the backend (which calls Google Places API).
 */
export async function searchNearbyPharmacies(lat, lng, filterType = 'all', radius = 5000) {
  const res = await api.get('/maps/nearby-pharmacies', {
    params: { lat, lng, filter_type: filterType, radius }
  });
  return res.data;
}

/**
 * Get detailed information about a specific Google Place.
 */
export async function getPlaceDetails(placeId) {
  const res = await api.get('/maps/place-details', {
    params: { place_id: placeId }
  });
  return res.data;
}

/**
 * Get Google Maps API key from backend (for security — key never hardcoded in JS bundles).
 */
export async function getMapsConfig() {
  const res = await api.get('/maps/config');
  return res.data;
}

/**
 * Build a Google Maps directions URL for a destination.
 */
export function buildDirectionsUrl(destLat, destLng, placeId = null) {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const dest = `&destination=${destLat},${destLng}`;
  const pid = placeId ? `&destination_place_id=${placeId}` : '';
  return `${base}${dest}${pid}`;
}
