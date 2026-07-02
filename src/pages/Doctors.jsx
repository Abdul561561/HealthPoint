import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Star, MapPin, Navigation, Clock,
  X, Calendar, ExternalLink, Stethoscope, RefreshCw,
  Activity, Map, List, SlidersHorizontal, Sparkles, Navigation2
} from 'lucide-react';
import api from '../services/api';
import { useDispatch } from 'react-redux';
import { bookAppointment } from '../redux/slices/healthSlice';
import { addToast } from '../redux/slices/uiSlice';
import { searchNearbyDoctors, searchAddress, getRoute } from '../services/openMapsApi';

const SPECIALTIES = [
  'All', 'General Physician', 'Cardiologist', 'Neurologist',
  'Dermatologist', 'Orthopedist', 'Pediatrician', 'Psychiatrist',
  'Gynecologist', 'Ophthalmologist', 'Dentist', 'ENT'
];

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];

// Skeleton Card
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

// Doctor Card Component
function DoctorCard({ doctor, isSelected, onSelect, onBook, onDirections, routeActive }) {
  const openStatus = doctor.open_now === true
    ? { label: 'Open Now', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    : doctor.open_now === false
      ? { label: 'Closed', cls: 'bg-rose-500/15 text-rose-500' }
      : { label: 'Hours N/A', cls: 'bg-slate-200/80 dark:bg-white/10 text-slate-500' };

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
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${openStatus.cls}`}>{openStatus.label}</span>
          </div>
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">{doctor.specialty}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />{doctor.address}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
        {doctor.rating > 0 && (
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">{doctor.rating.toFixed(1)}</span>
            {doctor.reviews > 0 && <span className="text-[10px] text-slate-400">({doctor.reviews})</span>}
          </div>
        )}
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Navigation className="w-3 h-3" />{doctor.distance_km} km
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={e => { e.stopPropagation(); onBook(doctor); }}
          className="flex-1 py-2 rounded-xl text-xs font-bold btn-primary flex items-center justify-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5" />Book
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDirections(doctor); }}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
            routeActive 
              ? 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600'
              : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
          }`}
        >
          <Navigation2 className="w-3.5 h-3.5" />
          {routeActive ? 'Active Route' : 'Show Route'}
        </button>
      </div>
    </motion.div>
  );
}

// Booking Modal
function BookingModal({ doctor, onClose, onConfirm, loading }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [type, setType] = useState('In-Person');
  const [notes, setNotes] = useState('');
  const today = new Date().toISOString().split('T')[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-card w-full max-w-md p-6 space-y-5"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Book Appointment</h3>
              <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{doctor?.name}</p>
              <p className="text-xs text-indigo-500 font-semibold">{doctor?.specialty}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={e => { e.preventDefault(); onConfirm({ doctor, date, time, type, notes }); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Date</label>
                <input type="date" required min={today} value={date} onChange={e => setDate(e.target.value)} className="input-field py-2.5 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Time</label>
                <input type="time" required value={time} onChange={e => setTime(e.target.value)} className="input-field py-2.5 text-sm w-full" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Visit Type</label>
              <div className="flex gap-2">
                {['In-Person', 'Video Call'].map(t => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${type === t ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'}`}
                  >{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for visit..." rows={2} className="input-field py-2.5 text-sm resize-none w-full" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 font-bold flex items-center justify-center gap-2">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              {loading ? 'Booking...' : 'Confirm Appointment'}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function Doctors() {
  const dispatch = useDispatch();

  const [coords, setCoords] = useState(null);
  const [locationError, setLocationError] = useState(false);
  
  // Search state
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('All');
  const [radius, setRadius] = useState(5000);
  const [minRating, setMinRating] = useState(0);
  const [openOnly, setOpenOnly] = useState(false);

  // Geocoding Search (Nominatim)
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Doctors data
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Navigation route data
  const [activeRoute, setActiveRoute] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [viewMode, setViewMode] = useState('split');

  // Map references
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const markersRef = useRef([]);
  const routePolylineRef = useRef(null);
  const suggestionTimerRef = useRef(null);

  // Geolocation detection
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          setLocationError(true);
          setCoords({ lat: 12.9716, lng: 77.5946 }); // Bengaluru fallback
        },
        { timeout: 8000 }
      );
    } else {
      setCoords({ lat: 12.9716, lng: 77.5946 });
    }
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!coords || !mapDivRef.current || viewMode === 'list') return;

    if (!mapInstanceRef.current) {
      // Create map
      mapInstanceRef.current = window.L.map(mapDivRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([coords.lat, coords.lng], 14);

      // Add dark tiles for dark mode, openstreetmap for light mode
      const isDarkMode = document.documentElement.classList.contains('dark');
      const tileUrl = isDarkMode 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      window.L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: isDarkMode ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap'
      }).addTo(mapInstanceRef.current);

      // Add zoom control at bottom right
      window.L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 14);
    }

    // Add User Location Marker
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
      iconAnchor: [12, 12]
    });

    userMarkerRef.current = window.L.marker([coords.lat, coords.lng], { icon: pulseIcon, zIndexOffset: 1000 })
      .addTo(mapInstanceRef.current)
      .bindPopup('<strong class="text-xs">Your Current Location</strong>');

  }, [coords, viewMode]);

  // Address search suggestions (Nominatim autocomplete debounce)
  const handleAddressInputChange = (e) => {
    const val = e.target.value;
    setAddressQuery(val);

    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);

    if (val.trim().length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestionTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchAddress(val);
        setAddressSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (err) {
        console.error('Nominatim search failed', err);
      }
    }, 400);
  };

  const handleSelectAddress = (suggestion) => {
    setCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setAddressQuery(suggestion.display_name);
    setShowSuggestions(false);
    
    // Clear route on location change
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
    setActiveRoute(null);
    setRouteInfo(null);
  };

  // Fetch nearby doctors using Overpass API
  const fetchDoctors = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    setError(null);
    setSelectedDoctor(null);

    try {
      const doctors = await searchNearbyDoctors(
        coords.lat,
        coords.lng,
        specialty,
        radius
      );
      setDoctors(doctors);
    } catch (e) {
      console.error(e);
      setError('Could not query OpenStreetMap for nearby healthcare locations.');
    } finally {
      setLoading(false);
    }
  }, [coords, specialty, radius]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Update map markers when doctors list changes
  useEffect(() => {
    if (!mapInstanceRef.current || viewMode === 'list') return;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    doctors.forEach(doc => {
      const isSelected = selectedDoctor?.place_id === doc.place_id;
      
      const docIcon = window.L.divIcon({
        html: `
          <div class="relative group cursor-pointer transition-all duration-300 transform ${
            isSelected ? 'scale-125 z-[1000]' : 'hover:scale-110'
          }">
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
        iconAnchor: [20, 40]
      });

      const marker = window.L.marker([doc.latitude, doc.longitude], { icon: docIcon })
        .addTo(mapInstanceRef.current);

      marker.on('click', () => {
        setSelectedDoctor(doc);
        mapInstanceRef.current.panTo([doc.latitude, doc.longitude]);
      });

      markersRef.current.push(marker);
    });

  }, [doctors, selectedDoctor, viewMode]);

  // Draw OSRM route line
  const handleDirections = async (doctor) => {
    if (!coords || !mapInstanceRef.current) return;
    
    // If route already active for this doctor, toggle off
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
      
      // Clear old route
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
      }

      // Draw polyline
      routePolylineRef.current = window.L.polyline(routeData.coordinates, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.85,
        dashArray: '10, 8'
      }).addTo(mapInstanceRef.current);

      setActiveRoute(doctor.place_id);
      setRouteInfo({
        distance: routeData.distance_km,
        duration: routeData.duration_min
      });

      // Fit map bounds to show route
      const bounds = window.L.latLngBounds([
        [coords.lat, coords.lng],
        [doctor.latitude, doctor.longitude]
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Route Error', message: 'Unable to calculate real-time directions.', type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const handleBookConfirm = async (bookingData) => {
    setBookingLoading(true);
    try {
      const payload = {
        doctorName: bookingData.doctor.name,
        specialty: bookingData.doctor.specialty,
        hospital: bookingData.doctor.hospital,
        date: bookingData.date,
        time: bookingData.time,
        notes: bookingData.notes
      };
      await dispatch(bookAppointment(payload)).unwrap();
      setBookingSuccess(true);
      setBookingDoctor(null);
      setTimeout(() => setBookingSuccess(false), 5000);
      dispatch(addToast({ title: 'Confirmed', message: 'Appointment booked successfully!', type: 'success' }));
    } catch (e) {
      dispatch(addToast({ title: 'Error', message: 'Booking failed. Try again.', type: 'error' }));
    } finally {
      setBookingLoading(false);
    }
  };

  // Filter local logic
  const filteredDoctors = doctors.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(search.toLowerCase()) || 
                          doc.hospital.toLowerCase().includes(search.toLowerCase()) ||
                          doc.address.toLowerCase().includes(search.toLowerCase());
    const matchesRating = doc.rating >= minRating;
    const matchesOpen = !openOnly || doc.open_now;
    return matchesSearch && matchesRating && matchesOpen;
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[88vh] flex flex-col">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            Find Nearby Doctors
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time clinics & hospitals query via OpenStreetMap & free routing engine
          </p>
        </div>

        {/* View Mode controls */}
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-xl p-1 gap-1 border border-slate-200/50 dark:border-white/5 h-10 items-center">
          <button onClick={() => setViewMode('split')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'split' ? 'bg-white dark:bg-white/10 text-indigo-500 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
            <Sparkles className="w-3.5 h-3.5" />Split
          </button>
          <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white dark:bg-white/10 text-indigo-500 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
            <List className="w-3.5 h-3.5" />List
          </button>
          <button onClick={() => setViewMode('map')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${viewMode === 'map' ? 'bg-white dark:bg-white/10 text-indigo-500 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
            <Map className="w-3.5 h-3.5" />Map
          </button>
        </div>
      </div>

      {/* Geocoding Location Search */}
      <div className="relative z-[1000] flex-shrink-0 flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
          <input
            type="text"
            value={addressQuery}
            onChange={handleAddressInputChange}
            placeholder="Type city, neighborhood, or area (e.g. Indiranagar, Bengaluru)..."
            className="input-field pl-10 pr-10 py-3 rounded-2xl w-full text-sm font-semibold"
            onFocus={() => setShowSuggestions(addressSuggestions.length > 0)}
          />
          {addressQuery && (
            <button
              onClick={() => { setAddressQuery(''); setAddressSuggestions([]); setShowSuggestions(false); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button onClick={fetchDoctors} disabled={loading} className="btn-primary py-3 px-5 rounded-2xl font-bold flex items-center gap-2 whitespace-nowrap text-sm shadow-md shadow-indigo-500/10">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        {/* Nominatim Suggestions Dropdown */}
        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl z-[9999] overflow-hidden max-h-60 overflow-y-auto"
            >
              {addressSuggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectAddress(s)}
                  className="w-full text-left px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 flex items-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="truncate">{s.display_name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search doctor or clinic name..." className="input-field pl-9 py-2 text-sm w-full" />
          {search && <button onClick={()=>setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-slate-400"/></button>}
        </div>
        <select value={radius} onChange={e=>setRadius(Number(e.target.value))} className="input-field py-2 text-sm">
          {RADIUS_OPTIONS.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={minRating} onChange={e=>setMinRating(Number(e.target.value))} className="input-field py-2 text-sm">
          <option value={0}>All Ratings</option>
          <option value={4.5}>⭐ 4.5+</option>
          <option value={4.0}>⭐ 4.0+</option>
          <option value={3.5}>⭐ 3.5+</option>
        </select>
        <button onClick={()=>setOpenOnly(!openOnly)} className={`px-4 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 transition-all ${openOnly?'bg-emerald-500 border-emerald-500 text-white':'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'}`}>
          <Clock className="w-3.5 h-3.5"/>Open Now
        </button>
      </div>

      {/* Specialty chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0 scrollbar-hide">
        {SPECIALTIES.map(s=>(
          <button key={s} onClick={()=>setSpecialty(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all ${specialty===s?'bg-indigo-500 border-indigo-500 text-white shadow-md':'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Success banner */}
      <AnimatePresence>
        {bookingSuccess && (
          <motion.div initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}}
            className="flex-shrink-0 bg-emerald-500 text-white px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4"/>✅ Appointment booked! Check Dashboard → Appointments.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Panel: cards + map */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {/* Doctor Cards */}
        {viewMode !== 'map' && (
          <div className={`${viewMode==='split'?'w-[42%]':'w-full'} flex flex-col overflow-hidden`}>
            <p className="text-xs text-slate-500 mb-3 flex-shrink-0">
              {loading ? 'Searching OpenStreetMap...' : `${filteredDoctors.length} doctors found`}
              {specialty !== 'All' && <span className="ml-1 text-indigo-500 font-semibold">· {specialty}</span>}
            </p>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {loading ? (
                Array.from({length:5}).map((_,i)=><DoctorCardSkeleton key={i}/>)
              ) : error ? (
                <div className="glass-card p-8 text-center">
                  <Stethoscope className="w-12 h-12 mx-auto text-slate-300 mb-3"/>
                  <p className="text-slate-500 font-semibold text-sm">{error}</p>
                  <button onClick={fetchDoctors} className="btn-primary px-6 py-2 mt-4 text-sm font-bold">Try Again</button>
                </div>
              ) : filteredDoctors.length === 0 ? (
                <div className="glass-card p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-indigo-400"/>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white">No doctors found</h3>
                  <p className="text-sm text-slate-500 mt-1">Try expanding the radius or changing specialty</p>
                  <button onClick={()=>{setSpecialty('All');setRadius(10000);}} className="btn-primary px-5 py-2 mt-4 text-sm font-bold">Expand Search</button>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredDoctors.map(doc=>(
                    <DoctorCard
                      key={doc.place_id}
                      doctor={doc}
                      isSelected={selectedDoctor?.place_id===doc.place_id}
                      onSelect={d=>{
                        setSelectedDoctor(d);
                        if(mapInstanceRef.current && d.latitude) {
                          mapInstanceRef.current.panTo([d.latitude, d.longitude]);
                        }
                      }}
                      onBook={setBookingDoctor}
                      onDirections={handleDirections}
                      routeActive={activeRoute === doc.place_id}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {/* Leaflet Map */}
        {viewMode !== 'list' && (
          <div className={`${viewMode==='split'?'flex-1':'w-full'} rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 relative min-h-0 bg-slate-950/20`}>
            <div ref={mapDivRef} className="w-full h-full z-10"/>

            {/* OSRM Route Info overlay */}
            <AnimatePresence>
              {routeInfo && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="absolute left-4 top-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 p-4 rounded-2xl flex items-center gap-4 text-white shadow-xl shadow-indigo-950/40"
                >
                  <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/25 rounded-xl flex items-center justify-center">
                    <Navigation className="w-5 h-5 text-indigo-400 rotate-45" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Directions Calculated</h4>
                    <p className="text-sm font-black mt-0.5">
                      {routeInfo.distance} km <span className="text-slate-400 font-semibold mx-1">·</span> {routeInfo.duration} mins
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading && (
              <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/75 backdrop-blur-sm flex items-center justify-center pointer-events-none z-[999]">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"/>
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-3">Updating OpenStreetMap...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {bookingDoctor && (
        <BookingModal doctor={bookingDoctor} onClose={()=>setBookingDoctor(null)} onConfirm={handleBookConfirm} loading={bookingLoading}/>
      )}
    </div>
  );
}
