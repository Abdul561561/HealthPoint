/**
 * HealthPoint OpenStreetMap Client Helpers
 * Delegates Nominatim geocoding and Overpass discovery through authenticated HealthPoint backend APIs.
 * Never fabricates coordinates, doctors, pharmacies, phone numbers, or ratings.
 */

import axios from 'axios';
import {
  extractMapsErrorMessage,
  fetchNearbyDoctors,
  fetchNearbyHospitals,
  fetchNearbyPharmacies,
  geocodeLocationQuery,
} from './mapsApi';

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

export async function searchNearbyDoctors(lat, lng, specialty = 'All', radius = 5000) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    throw new Error('Location coordinates are required to search nearby doctors.');
  }
  try {
    const res = await fetchNearbyDoctors({ lat: Number(lat), lng: Number(lng), specialty, radius });
    if (!res?.ok) {
      throw new Error(res?.error || 'OpenStreetMap doctor search failed.');
    }
    return res.results || [];
  } catch (err) {
    throw new Error(extractMapsErrorMessage(err, 'OpenStreetMap doctor search failed.'), { cause: err });
  }
}

export async function searchNearbyPharmacies(lat, lng, radius = 3000, openOnly = false) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    throw new Error('Location coordinates are required to search nearby pharmacies.');
  }
  try {
    const res = await fetchNearbyPharmacies({
      lat: Number(lat),
      lng: Number(lng),
      filterType: openOnly ? 'open_now' : 'all',
      radius,
    });
    if (!res?.ok) {
      throw new Error(res?.error || 'OpenStreetMap pharmacy search failed.');
    }
    return res.results || [];
  } catch (err) {
    throw new Error(extractMapsErrorMessage(err, 'OpenStreetMap pharmacy search failed.'), { cause: err });
  }
}

export async function searchNearbyHospitals(lat, lng, radius = 8000) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    throw new Error('Location coordinates are required to search nearby hospitals.');
  }
  try {
    const res = await fetchNearbyHospitals({ lat: Number(lat), lng: Number(lng), radius });
    if (!res?.ok) {
      throw new Error(res?.error || 'OpenStreetMap hospital search failed.');
    }
    return (res.results || []).map((item) => ({
      ...item,
      id: item.place_id,
      type: item.category || 'Hospital',
      distance: `${item.distance_km} km`,
    }));
  } catch (err) {
    throw new Error(extractMapsErrorMessage(err, 'OpenStreetMap hospital search failed.'), { cause: err });
  }
}

export async function searchAddress(query) {
  const cleaned = (query || '').trim();
  if (cleaned.length < 2) return [];
  const res = await geocodeLocationQuery(cleaned);
  return res?.ok ? res.results || [] : [];
}

export async function getRoute(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  try {
    const res = await axios.get(url, { timeout: 8000 });
    if (res.data?.routes?.length > 0) {
      const route = res.data.routes[0];
      const coordinates = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      return {
        coordinates,
        distance_km: parseFloat((route.distance / 1000).toFixed(2)),
        duration_min: Math.round(route.duration / 60),
      };
    }
  } catch (err) {
    console.warn('OSRM routing fallback to straight-line estimate:', err.message);
  }
  const dist = haversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
  return {
    coordinates: [
      [origin.lat, origin.lng],
      [dest.lat, dest.lng],
    ],
    distance_km: dist,
    duration_min: Math.max(1, Math.round(dist * 2.5)),
  };
}
