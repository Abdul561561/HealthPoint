import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Navigation, Clock, X, Stethoscope, RefreshCw,
  Map, List, Sparkles, Navigation2, Phone, Globe, ExternalLink, AlertCircle, LocateFixed
} from 'lucide-react';
import { useDispatch } from 'react-redux';
import { addToast } from '../redux/slices/uiSlice';
import { getRoute } from '../services/openMapsApi';
import {
  fetchNearbyDoctors,
  geocodeLocationQuery,
} from '../services/mapsApi';

const SPECIALTIES = [
  'All', 'General Physician', 'Cardiologist', 'Dermatologist', 'Pediatrician',
  'Neurologist', 'Orthopedic Doctor', 'ENT Specialist', 'Gynecologist',
  'Dentist', 'Ophthalmologist', 'Psychiatrist', 'Hospital', 'Emergency Care',
];

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];

function DoctorCardSkeleton() {
  return (
    <div className="glass-card p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-14 h-14 rounded-2xl bg-slate-200 dark:bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-2/3" />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <div className="h-9 bg-slate-200 dark:bg-white/10 rounded-xl flex-1" />
        <div className="h-9 bg-slate-200 dark:bg-white/10 rounded-xl flex-1" />
      </div>
    </div>
  );
}

function DoctorCard({ doctor, isSelected, onSelect, onDirections, routeActive }) {
  const hoursLabel = doctor.opening_hours?.[0] || 'Hours not listed in OSM';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => onSelect(doctor)}
      className={`glass-card p-4 cursor-pointer border-2 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10 hover:border-indigo-400/45 ${
        isSelected ? 'border-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10 shadow-indigo-500/10' : 'border-transparent'
      }`}
    >
      <div className="flex gap-3">
        <div className="w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
          <Stethoscope className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-1 flex-1">{doctor.name}</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
              {doctor.category || 'Facility'}
            </span>
          </div>
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">{doctor.specialty}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5 line-clamp-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />{doctor.address}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200/70 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Navigation className="w-3 h-3 text-indigo-500" />{doctor.distance_km} km
        </span>
        <span className="inline-flex items-center gap-1 truncate text-slate-500 dark:text-slate-400">
          <Clock className="w-3 h-3 flex-shrink-0" />{hoursLabel}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">OSM</span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {doctor.phone && (
          <a
            href={`tel:${doctor.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-[90px] py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all"
          >
            <Phone className="w-3.5 h-3.5" />Call
          </a>
        )}
        {doctor.website && (
          <a
            href={doctor.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="py-2 px-3 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-center gap-1.5 transition-all"
          >
            <Globe className="w-3.5 h-3.5" />Site
          </a>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDirections(doctor); }}
          className={`flex-1 min-w-[110px] py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
            routeActive
              ? 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600'
              : 'btn-primary'
          }`}
        >
          <Navigation2 className="w-3.5 h-3.5" />
          {routeActive ? 'Hide Route' : 'Show Route'}
        </button>
        {(doctor.directions_url || doctor.maps_url) && (
          <a
            href={doctor.directions_url || doctor.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/20 flex items-center justify-center gap-1 transition-all"
            title="OpenStreetMap Directions"
          >
            <ExternalLink className="w-3.5 h-3.5" />OSM
          </a>
        )}
      </div>
    </motion.div>
  );
}

export default function Doctors() {
  const dispatch = useDispatch();

  const [coords, setCoords] = useState(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [locationStatus, setLocationStatus] = useState('prompting');

  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('All');
  const [radius, setRadius] = useState(5000);
  const [withPhoneOnly, setWithPhoneOnly] = useState(false);

  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [osmError, setOsmError] = useState(null);
  const [osmNotice, setOsmNotice] = useState(null);
  const [manualOsmUrl, setManualOsmUrl] = useState(null);

  const [activeRoute, setActiveRoute] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [viewMode, setViewMode] = useState('split');

  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const markersRef = useRef([]);
  const routePolylineRef = useRef(null);
  const suggestionTimerRef = useRef(null);

  const requestBrowserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    setLocationStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel('Your Current Location');
        setLocationStatus('granted');
      },
      () => {
        setLocationStatus('denied');
      },
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      Promise.resolve().then(() => setLocationStatus('denied'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel('Your Current Location');
        setLocationStatus('granted');
      },
      () => {
        setLocationStatus('denied');
      },
      { timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!coords || !mapDivRef.current || viewMode === 'list' || !window.L) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = window.L.map(mapDivRef.current, {
        zoomControl: false,
      }).setView([coords.lat, coords.lng], 14);
      window.L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 14);
    }

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }
    tileLayerRef.current = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapInstanceRef.current);

    if (userMarkerRef.current) userMarkerRef.current.remove();
    const pulseIcon = window.L.divIcon({
      html: `
        <div class="relative w-6 h-6 flex items-center justify-center">
          <div class="absolute w-6 h-6 bg-indigo-500 rounded-full opacity-40 animate-ping"></div>
          <div class="w-3.5 h-3.5 bg-indigo-600 rounded-full border-2 border-white shadow-md z-10"></div>
        </div>
      `,
      className: 'custom-user-location-pulse',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    userMarkerRef.current = window.L.marker([coords.lat, coords.lng], { icon: pulseIcon, zIndexOffset: 1000 })
      .addTo(mapInstanceRef.current)
      .bindPopup(`<strong class="text-xs">${locationLabel || 'Selected Location'}</strong>`);
  }, [coords, viewMode, locationLabel]);

  const handleAddressInputChange = (e) => {
    const val = e.target.value;
    setAddressQuery(val);
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);

    if (val.trim().length < 2) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestionTimerRef.current = setTimeout(async () => {
      try {
        const geo = await geocodeLocationQuery(val.trim());
        const list = geo?.results || [];
        setAddressSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch (err) {
        console.error('Nominatim suggestions failed:', err);
      }
    }, 350);
  };

  const handleManualAddressSubmit = async (e) => {
    e.preventDefault();
    if (!addressQuery.trim()) return;
    try {
      const geo = await geocodeLocationQuery(addressQuery.trim());
      if (geo?.ok && geo.results?.length) {
        handleSelectAddress(geo.results[0]);
      } else {
        dispatch(addToast({ type: 'error', message: geo?.error || 'Location or PIN code not found.' }));
      }
    } catch {
      dispatch(addToast({ type: 'error', message: 'Failed to resolve location via OpenStreetMap Nominatim.' }));
    }
  };

  const handleSelectAddress = (suggestion) => {
    setCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setLocationLabel(suggestion.display_name);
    setLocationStatus('manual');
    setAddressQuery(suggestion.display_name);
    setShowSuggestions(false);

    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
    setActiveRoute(null);
    setRouteInfo(null);
  };

  const fetchDoctors = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    setOsmError(null);
    setOsmNotice(null);
    setManualOsmUrl(null);
    setSelectedDoctor(null);

    try {
      const res = await fetchNearbyDoctors({
        lat: coords.lat,
        lng: coords.lng,
        specialty,
        radius,
        locationLabel,
      });
      if (res?.ok) {
        setDoctors(res.results || []);
        setOsmNotice(res.notice || null);
        setManualOsmUrl(res.manual_maps_url || null);
      } else {
        setDoctors([]);
        setOsmError(res?.error || 'OpenStreetMap Overpass query could not complete.');
        setManualOsmUrl(
          res?.manual_maps_url ||
            `https://www.openstreetmap.org/search?query=${encodeURIComponent(specialty === 'All' ? 'clinic hospital' : specialty)}#map=14/${coords.lat}/${coords.lng}`
        );
      }
    } catch (e) {
      console.error(e);
      setDoctors([]);
      setOsmError('Unable to reach HealthPoint OpenStreetMap discovery service.');
      setManualOsmUrl(`https://www.openstreetmap.org/search?query=hospital#map=14/${coords.lat}/${coords.lng}`);
    } finally {
      setLoading(false);
    }
  }, [coords, specialty, radius, locationLabel]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active && coords) {
        fetchDoctors();
      }
    });
    return () => {
      active = false;
    };
  }, [coords, fetchDoctors]);

  useEffect(() => {
    if (!mapInstanceRef.current || viewMode === 'list' || !window.L) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    doctors.forEach((doc) => {
      if (doc.latitude === undefined || doc.longitude === undefined) return;
      const isSelected = selectedDoctor?.place_id === doc.place_id;
      const docIcon = window.L.divIcon({
        html: `
          <div class="relative group cursor-pointer transition-all duration-300 transform ${isSelected ? 'scale-125 z-[1000]' : 'hover:scale-110'}">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center border-2 shadow-lg transition-all ${
              isSelected
                ? 'bg-indigo-500 border-white text-white shadow-indigo-500/50 scale-110'
                : 'bg-white border-indigo-500 text-indigo-500 dark:bg-slate-900 dark:border-indigo-400 dark:text-indigo-400'
            }">
              <span class="text-lg">🏥</span>
            </div>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
              isSelected ? 'bg-indigo-500 border-white' : 'bg-white border-indigo-500 dark:bg-slate-900 dark:border-indigo-400'
            }"></div>
          </div>
        `,
        className: 'custom-doctor-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      });

      const marker = window.L.marker([doc.latitude, doc.longitude], { icon: docIcon }).addTo(mapInstanceRef.current);
      marker.on('click', () => {
        setSelectedDoctor(doc);
        mapInstanceRef.current.panTo([doc.latitude, doc.longitude]);
      });
      markersRef.current.push(marker);
    });
  }, [doctors, selectedDoctor, viewMode]);

  const handleDirections = async (doctor) => {
    if (!coords || !mapInstanceRef.current || !window.L) return;

    if (activeRoute === doctor.place_id) {
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
        routePolylineRef.current = null;
      }
      setActiveRoute(null);
      setRouteInfo(null);
      mapInstanceRef.current.setView([coords.lat, coords.lng], 14);
      return;
    }

    try {
      setSelectedDoctor(doctor);
      setLoading(true);
      const routeData = await getRoute(coords, { lat: doctor.latitude, lng: doctor.longitude });

      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
      }
      routePolylineRef.current = window.L.polyline(routeData.coordinates, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.85,
        dashArray: '10, 8',
      }).addTo(mapInstanceRef.current);

      setActiveRoute(doctor.place_id);
      setRouteInfo({ distance: routeData.distance_km, duration: routeData.duration_min });

      const bounds = window.L.latLngBounds([
        [coords.lat, coords.lng],
        [doctor.latitude, doctor.longitude],
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Route Error', message: 'Unable to calculate OSRM route.', type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const filteredDoctors = doctors.filter((doc) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (doc.name || '').toLowerCase().includes(q) ||
      (doc.specialty || '').toLowerCase().includes(q) ||
      (doc.address || '').toLowerCase().includes(q);
    const matchesPhone = !withPhoneOnly || Boolean(doc.phone);
    return matchesSearch && matchesPhone;
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[88vh] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            Find Nearby Doctors & Hospitals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Powered by OpenStreetMap (Overpass & Nominatim). Listings do not independently verify clinician credentials or appointment availability.
          </p>
        </div>

        <div className="flex bg-slate-100 dark:bg-white/10 rounded-xl p-1 gap-1 border border-slate-200/70 dark:border-white/15 h-10 items-center">
          <button onClick={() => setViewMode('split')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'split' ? 'bg-white dark:bg-dark-200 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
            <Sparkles className="w-3.5 h-3.5" />Split
          </button>
          <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white dark:bg-dark-200 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
            <List className="w-3.5 h-3.5" />List
          </button>
          <button onClick={() => setViewMode('map')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'map' ? 'bg-white dark:bg-dark-200 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
            <Map className="w-3.5 h-3.5" />Map
          </button>
        </div>
      </div>

      {/* Explicit Location Consent Banner */}
      {!coords && (
        <div className="glass-card p-4 border-l-4 border-indigo-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-start gap-3">
            <LocateFixed className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {locationStatus === 'denied' ? 'Location Permission Denied' : 'Share Your Location to Search OpenStreetMap'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                HealthPoint never assumes your location. Allow browser location or enter your city, locality, or 6-digit PIN code below.
              </p>
            </div>
          </div>
          <button type="button" onClick={requestBrowserLocation} className="btn-primary py-2 px-4 text-xs whitespace-nowrap">
            <LocateFixed className="w-3.5 h-3.5" /> Allow Location
          </button>
        </div>
      )}

      {/* Manual City / Area / PIN Code Search */}
      <form onSubmit={handleManualAddressSubmit} className="relative z-[1000] flex-shrink-0 flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
          <input
            type="text"
            value={addressQuery}
            onChange={handleAddressInputChange}
            placeholder="Enter city, neighborhood, or 6-digit PIN code (e.g. 560038 or Connaught Place, Delhi)..."
            className="input-field pl-10 pr-10 py-3 rounded-2xl w-full text-sm font-semibold"
            onFocus={() => setShowSuggestions(addressSuggestions.length > 0)}
          />
          {addressQuery && (
            <button
              type="button"
              onClick={() => { setAddressQuery(''); setAddressSuggestions([]); setShowSuggestions(false); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button type="submit" className="btn-primary py-3 px-4 rounded-2xl font-bold text-sm whitespace-nowrap">
          Set Location
        </button>
        <button type="button" onClick={fetchDoctors} disabled={loading || !coords} className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-dark-200 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-2 whitespace-nowrap text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-dark-200 border border-slate-200 dark:border-white/15 rounded-2xl shadow-xl z-[9999] overflow-hidden max-h-60 overflow-y-auto"
            >
              {addressSuggestions.map((s, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleSelectAddress(s)}
                  className="w-full text-left px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 border-b border-slate-100 dark:border-white/10 flex items-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="truncate">{s.display_name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter returned results by name or address..." className="input-field pl-9 py-2 text-sm w-full" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-400" /></button>}
        </div>
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="input-field py-2 text-sm w-auto">
          {RADIUS_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button onClick={() => setWithPhoneOnly(!withPhoneOnly)} className={`px-4 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 transition-all ${withPhoneOnly ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200'}`}>
          <Phone className="w-3.5 h-3.5" />Phone Listed
        </button>
      </div>

      {/* Specialty chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0 scrollbar-hide">
        {SPECIALTIES.map((s) => (
          <button
            key={s}
            onClick={() => setSpecialty(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${
              specialty === s
                ? 'bg-indigo-500 border-indigo-500 text-white shadow-md'
                : 'border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Main Results & Leaflet Map */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {viewMode !== 'map' && (
          <div className={`${viewMode === 'split' ? 'w-full lg:w-[44%]' : 'w-full'} flex flex-col overflow-hidden`}>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex-shrink-0">
              {!coords ? 'Waiting for location...' : loading ? 'Querying OpenStreetMap Overpass API...' : `${filteredDoctors.length} OpenStreetMap facilities found`}
              {specialty !== 'All' && <span className="ml-1 text-indigo-500 dark:text-indigo-400 font-semibold">· {specialty}</span>}
              {locationLabel && coords && <span className="ml-1 text-slate-500 dark:text-slate-400">· Near {locationLabel}</span>}
            </p>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <DoctorCardSkeleton key={i} />)
              ) : osmError ? (
                <div className="glass-card p-6 space-y-3 border border-amber-400/30">
                  <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold">{osmError}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={fetchDoctors} className="btn-primary px-4 py-2 text-xs font-bold">Retry Search</button>
                    {manualOsmUrl && (
                      <a
                        href={manualOsmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Search on OpenStreetMap
                      </a>
                    )}
                  </div>
                </div>
              ) : !coords ? (
                <div className="glass-card p-8 text-center">
                  <MapPin className="w-10 h-10 mx-auto text-indigo-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Location needed to display nearby facilities</p>
                </div>
              ) : filteredDoctors.length === 0 ? (
                <div className="glass-card p-8 text-center space-y-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">No OpenStreetMap facilities found</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    {osmNotice || 'Try selecting "All" facilities, expanding the search radius, or checking another area.'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <button onClick={() => { setSpecialty('All'); setRadius(10000); setWithPhoneOnly(false); }} className="btn-primary px-5 py-2 text-xs font-bold">Show All Nearby Facilities</button>
                    {manualOsmUrl && (
                      <a
                        href={manualOsmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/15 text-xs font-bold text-slate-700 dark:text-slate-200"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> OpenStreetMap Search
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredDoctors.map((doc) => (
                    <DoctorCard
                      key={doc.place_id}
                      doctor={doc}
                      isSelected={selectedDoctor?.place_id === doc.place_id}
                      onSelect={(d) => {
                        setSelectedDoctor(d);
                        if (mapInstanceRef.current && d.latitude) {
                          mapInstanceRef.current.panTo([d.latitude, d.longitude]);
                        }
                      }}
                      onDirections={handleDirections}
                      routeActive={activeRoute === doc.place_id}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {viewMode !== 'list' && (
          <div className={`${viewMode === 'split' ? 'hidden lg:block flex-1' : 'w-full'} rounded-2xl overflow-hidden border border-slate-200 dark:border-white/15 relative min-h-0 bg-slate-100 dark:bg-dark-300`}>
            {coords ? (
              <div ref={mapDivRef} className="w-full h-full z-10" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                <LocateFixed className="w-10 h-10 text-indigo-400 mb-3" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Grant location permission or enter a PIN code to load the OpenStreetMap view</p>
              </div>
            )}

            <AnimatePresence>
              {routeInfo && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="absolute left-4 top-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 p-4 rounded-2xl flex items-center gap-4 text-white shadow-xl"
                >
                  <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center">
                    <Navigation className="w-5 h-5 text-indigo-400 rotate-45" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Estimated OSRM Route</h4>
                    <p className="text-sm font-black mt-0.5">{routeInfo.distance} km · {routeInfo.duration} mins</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
