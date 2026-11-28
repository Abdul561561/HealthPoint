import { useCallback, useEffect, useRef, useState } from 'react';
import { geocodeLocationQuery, extractMapsErrorMessage } from '../services/mapsApi';

/**
 * Shared GPS consent + manual city/neighborhood/PIN code Nominatim lookup state
 * for Doctors & Pharmacy discovery views. Never hardcodes a default city.
 */
export function useOsmDiscoveryLocation({ gpsLabel = 'Current GPS Location', timeoutMs = 10000 } = {}) {
  const [coords, setCoords] = useState(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [locationStatus, setLocationStatus] = useState('prompting'); // prompting | granted | denied | manual
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');

  const suggestionTimerRef = useRef(null);

  const requestBrowserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    setLocationStatus('prompting');
    setGeocodeError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel(gpsLabel);
        setLocationStatus('granted');
        setAddressSuggestions([]);
        setShowSuggestions(false);
      },
      () => {
        setLocationStatus((prev) => (prev === 'manual' ? 'manual' : 'denied'));
      },
      { enableHighAccuracy: true, timeout: timeoutMs }
    );
  }, [gpsLabel, timeoutMs]);

  useEffect(() => {
    const t = setTimeout(() => {
      requestBrowserLocation();
    }, 0);
    return () => {
      clearTimeout(t);
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, [requestBrowserLocation]);

  const selectSuggestion = useCallback((suggestion) => {
    if (!suggestion) return;
    setCoords({ lat: Number(suggestion.lat), lng: Number(suggestion.lng) });
    setLocationLabel(suggestion.display_name);
    setLocationStatus('manual');
    setAddressQuery(suggestion.display_name);
    setShowSuggestions(false);
    setGeocodeError('');
  }, []);

  const handleAddressChange = useCallback((val) => {
    setAddressQuery(val);
    setGeocodeError('');
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);

    if (val.trim().length < 2) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestionTimerRef.current = setTimeout(async () => {
      try {
        const geo = await geocodeLocationQuery(val.trim());
        const list = geo?.ok ? geo.results || [] : [];
        setAddressSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        // Ignore transient keystroke suggestions errors; explicit submit surfaces full error
      }
    }, 350);
  }, []);

  const submitAddress = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      const cleaned = addressQuery.trim();
      if (cleaned.length < 2) {
        setGeocodeError('Enter at least 2 characters (city, neighborhood, or 6-digit PIN code).');
        return null;
      }
      setGeocodeLoading(true);
      setGeocodeError('');
      try {
        const geo = await geocodeLocationQuery(cleaned);
        if (geo?.ok && geo.results?.length) {
          selectSuggestion(geo.results[0]);
          return geo.results[0];
        }
        setGeocodeError(geo?.error || `No OpenStreetMap location matched "${cleaned}".`);
        return null;
      } catch (err) {
        setGeocodeError(extractMapsErrorMessage(err, 'Failed to resolve location via OpenStreetMap Nominatim.'));
        return null;
      } finally {
        setGeocodeLoading(false);
      }
    },
    [addressQuery, selectSuggestion]
  );

  const clearAddressInput = useCallback(() => {
    setAddressQuery('');
    setAddressSuggestions([]);
    setShowSuggestions(false);
    setGeocodeError('');
  }, []);

  return {
    coords,
    locationLabel,
    locationStatus,
    addressQuery,
    addressSuggestions,
    showSuggestions,
    setShowSuggestions,
    geocodeLoading,
    geocodeError,
    requestBrowserLocation,
    handleAddressChange,
    submitAddress,
    selectSuggestion,
    clearAddressInput,
  };
}
