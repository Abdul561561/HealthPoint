import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Navigation, Phone, Clock, Star,
  Pill, Bell, FileText, RefreshCw, X, Plus, Trash2,
  AlertCircle, Check, Upload, Eye, ExternalLink,
  ChevronRight, Sparkles, Activity, Heart, Map, List,
  Filter, SlidersHorizontal, Package, Navigation2, AlertTriangle
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import {
  uploadPrescriptionFile,
  fetchLatestPrescription,
  fetchPrescriptionHistory,
  clearUploadedPrescription,
  setUploadedPrescription,
  deletePrescriptionFile
} from '../redux/slices/pharmacySlice';
import { addToast } from '../redux/slices/uiSlice';
import api from '../services/api';
import { searchNearbyPharmacies, searchAddress, getRoute } from '../services/openMapsApi';

const TABS = [
  { id: 'pharmacies', label: 'Nearby Pharmacies', icon: MapPin },
  { id: 'prescriptions', label: 'Prescriptions', icon: FileText },
  { id: 'history', label: 'Prescription History', icon: Clock },
];

// Skeleton loaders
function PharmacyCardSkeleton() {
  return (
    <div className="glass-card p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-full" />
          <div className="flex gap-2">
            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-12" />
            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-12" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded-xl flex-1" />
        <div className="h-8 bg-slate-200 dark:bg-white/10 rounded-xl flex-1" />
      </div>
    </div>
  );
}

// Pharmacy card component
function PharmacyCard({ pharmacy, isSelected, onSelect, onDirections, routeActive }) {
  const openStatus = pharmacy.open_now === true
    ? { label: 'Open Now', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    : pharmacy.open_now === false
    ? { label: 'Closed', cls: 'bg-rose-500/15 text-rose-500' }
    : { label: 'Hours N/A', cls: 'bg-slate-200 dark:bg-white/10 text-slate-500' };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(pharmacy)}
      className={`glass-card p-4 cursor-pointer transition-all duration-200 border-2 hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10 ${
        isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-transparent'
      }`}
    >
      <div className="flex gap-3 items-start">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-md text-xl">
          💊
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-1">{pharmacy.name}</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${openStatus.cls}`}>
              {openStatus.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {pharmacy.address}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{pharmacy.rating?.toFixed(1) || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Navigation className="w-3 h-3" />
              {pharmacy.distance_km} km
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={(e) => { e.stopPropagation(); onDirections(pharmacy); }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            routeActive
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
          }`}
        >
          <Navigation2 className="w-3.5 h-3.5" />
          {routeActive ? 'Active Route' : 'Show Route'}
        </button>
        <a
          href={pharmacy.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View
        </a>
      </div>
    </motion.div>
  );
}

export default function Pharmacy() {
  const dispatch = useDispatch();
  const { uploadedPrescription, prescriptionHistory = [], loading, prescriptionLoading, error } = useSelector(s => s.pharmacy);

  const [activeTab, setActiveTab] = useState('pharmacies');

  // Pharmacy map state
  const [coords, setCoords] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyLoading, setPharmacyLoading] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [pharmacyRadius, setPharmacyRadius] = useState(3000);
  const [pharmacySearch, setPharmacySearch] = useState('');

  // Nominatim Address Search
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Directions
  const [activeRoute, setActiveRoute] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  // Prescriptions state
  const [prescriptionFile, setPrescriptionFile] = useState(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState(null);

  // Map references
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const suggestionTimerRef = useRef(null);

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords({ lat: 12.9716, lng: 77.5946 }),
        { timeout: 8000 }
      );
    } else {
      setCoords({ lat: 12.9716, lng: 77.5946 });
    }
  }, []);

  // Load initial data
  useEffect(() => {
    dispatch(fetchPrescriptionHistory());
    dispatch(fetchLatestPrescription());
  }, [dispatch]);

  // Fetch pharmacies using Overpass API
  const fetchPharmacies = useCallback(async () => {
    if (!coords) return;
    setPharmacyLoading(true);
    try {
     const pharmacies = await searchNearbyPharmacies(
    latitude,
    longitude
);
      setPharmacies(pharmacies);
    } catch (e) {
      console.error('Failed to fetch pharmacies:', e);
      setPharmacies([]);
    } finally {
      setPharmacyLoading(false);
    }
  }, [coords, openOnly, pharmacyRadius]);

  useEffect(() => {
    if (activeTab === 'pharmacies' && coords) fetchPharmacies();
  }, [activeTab, fetchPharmacies, coords]);

  // Init Leaflet Map
  useEffect(() => {
    if (activeTab !== 'pharmacies' || !coords || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = window.L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([coords.lat, coords.lng], 14);

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(mapInstanceRef.current);

      window.L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 14);
    }

    // Add User marker
    if (userMarkerRef.current) userMarkerRef.current.remove();

    const pulseIcon = window.L.divIcon({
      html: `
        <div class="relative w-6 h-6 flex items-center justify-center">
          <div class="absolute w-6 h-6 bg-emerald-500 rounded-full opacity-40 animate-ping"></div>
          <div class="w-3.5 h-3.5 bg-emerald-600 rounded-full border-2 border-white shadow-md z-10"></div>
        </div>
      `,
      className: 'custom-user-location-pulse',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    userMarkerRef.current = window.L.marker([coords.lat, coords.lng], { icon: pulseIcon, zIndexOffset: 1000 })
      .addTo(mapInstanceRef.current)
      .bindPopup('<strong class="text-xs">Your Location</strong>');

  }, [activeTab, coords]);

  // Update pharmacy markers on map
  useEffect(() => {
    if (!mapInstanceRef.current || activeTab !== 'pharmacies') return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    pharmacies.forEach(pharmacy => {
      if (!pharmacy.latitude || !pharmacy.longitude) return;

      const isSelected = selectedPharmacy?.place_id === pharmacy.place_id;

      const pIcon = window.L.divIcon({
        html: `
          <div class="relative group cursor-pointer transition-all duration-300 transform ${
            isSelected ? 'scale-125 z-[1000]' : 'hover:scale-110'
          }">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center border-2 shadow-lg transition-all ${
              isSelected 
                ? 'bg-emerald-500 border-white text-white shadow-emerald-500/50 scale-110' 
                : 'bg-white border-emerald-500 text-emerald-500 dark:bg-slate-900 dark:border-emerald-400 dark:text-emerald-400'
            }">
              <span class="text-lg">💊</span>
            </div>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
              isSelected ? 'bg-emerald-500 border-white' : 'bg-white border-emerald-500 dark:bg-slate-900 dark:border-emerald-400'
            }"></div>
          </div>
        `,
        className: 'custom-pharmacy-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40]
      });

      const marker = window.L.marker([pharmacy.latitude, pharmacy.longitude], { icon: pIcon })
        .addTo(mapInstanceRef.current);

      marker.on('click', () => {
        setSelectedPharmacy(pharmacy);
        mapInstanceRef.current.panTo([pharmacy.latitude, pharmacy.longitude]);
      });

      markersRef.current.push(marker);
    });

  }, [pharmacies, activeTab, selectedPharmacy]);

  // Nominatim autocomplete
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
        console.error(err);
      }
    }, 400);
  };

  const handleSelectAddress = (suggestion) => {
    setCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setAddressQuery(suggestion.display_name);
    setShowSuggestions(false);

    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
    setActiveRoute(null);
    setRouteInfo(null);
  };

  // Draw OSRM route line
  const handleDirections = async (pharmacy) => {
    if (!coords || !mapInstanceRef.current) return;

    if (activeRoute === pharmacy.place_id) {
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
      setSelectedPharmacy(pharmacy);
      setPharmacyLoading(true);

      const routeData = await getRoute(coords, { lat: pharmacy.latitude, lng: pharmacy.longitude });

      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
      }

      routePolylineRef.current = window.L.polyline(routeData.coordinates, {
        color: '#10b981',
        weight: 5,
        opacity: 0.85,
        dashArray: '10, 8'
      }).addTo(mapInstanceRef.current);

      setActiveRoute(pharmacy.place_id);
      setRouteInfo({
        distance: routeData.distance_km,
        duration: routeData.duration_min
      });

      const bounds = window.L.latLngBounds([
        [coords.lat, coords.lng],
        [pharmacy.latitude, pharmacy.longitude]
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Route Error', message: 'Unable to calculate directions.', type: 'error' }));
    } finally {
      setPharmacyLoading(false);
    }
  };

  // Prescription file
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPrescriptionFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPrescriptionPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPrescription = async () => {
    if (!prescriptionFile) return;
    const result = await dispatch(uploadPrescriptionFile(prescriptionFile));
    if (uploadPrescriptionFile.fulfilled.match(result)) {
      dispatch(addToast({ title: 'Success', message: 'Prescription uploaded successfully', type: 'success' }));
      setPrescriptionFile(null);
      setPrescriptionPreview(null);
    } else {
      dispatch(addToast({ title: 'Error', message: 'Upload failed', type: 'error' }));
    }
  };

  const handleDeletePrescription = async (prescriptionId) => {
    if (window.confirm("Are you sure you want to delete this prescription from history?")) {
      const result = await dispatch(deletePrescriptionFile(prescriptionId));
      if (deletePrescriptionFile.fulfilled.match(result)) {
        dispatch(addToast({ title: 'Success', message: 'Prescription deleted successfully', type: 'success' }));
      } else {
        dispatch(addToast({ title: 'Error', message: 'Failed to delete prescription', type: 'error' }));
      }
    }
  };

  const filteredPharmacies = pharmacies.filter(p =>
    !pharmacySearch || p.name.toLowerCase().includes(pharmacySearch.toLowerCase()) || p.address.toLowerCase().includes(pharmacySearch.toLowerCase())
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto h-[88vh] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
              <Pill className="w-5 h-5 text-white" />
            </div>
            Smart Pharmacy Assistant
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Nearby pharmacies, prescriptions, and order history</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200/50 dark:border-white/5 flex-shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all whitespace-nowrap border-b-2 flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>



      {/* ── NEARBY PHARMACIES TAB ─────────────────────────────────────── */}
      {activeTab === 'pharmacies' && (
        <div className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
          {/* Pharmacy search + geocoding location search */}
          <div className="flex flex-wrap gap-2 flex-shrink-0 relative z-[1000]">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={pharmacySearch}
                onChange={e => setPharmacySearch(e.target.value)}
                placeholder="Search pharmacy name..."
                className="input-field pl-9 py-2 text-sm w-full"
              />
            </div>
            
            <div className="relative flex-1 min-w-[220px]">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              <input
                type="text"
                value={addressQuery}
                onChange={handleAddressInputChange}
                placeholder="Type location to change search area..."
                className="input-field pl-9 py-2 text-sm w-full"
                onFocus={() => setShowSuggestions(addressSuggestions.length > 0)}
              />
              {addressQuery && (
                <button onClick={() => { setAddressQuery(''); setAddressSuggestions([]); setShowSuggestions(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Suggestions list */}
              <AnimatePresence>
                {showSuggestions && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                  >
                    {addressSuggestions.map((s, idx) => (
                      <button key={idx} onClick={() => handleSelectAddress(s)} className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="truncate">{s.display_name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <select
              value={pharmacyRadius}
              onChange={e => setPharmacyRadius(Number(e.target.value))}
              className="input-field py-2 text-sm"
            >
              <option value={1000}>1 km</option>
              <option value={3000}>3 km</option>
              <option value={5000}>5 km</option>
              <option value={10000}>10 km</option>
            </select>
            <button
              onClick={() => { setOpenOnly(!openOnly); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2 ${
                openOnly ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Open Now
            </button>
            <button onClick={fetchPharmacies} disabled={pharmacyLoading} className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2 font-semibold">
              <RefreshCw className={`w-4 h-4 ${pharmacyLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Split view: cards + map */}
          <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
            {/* LEFT: Pharmacy cards */}
            <div className="w-[42%] flex flex-col overflow-hidden">
              <p className="text-xs text-slate-500 mb-3 flex-shrink-0">
                {pharmacyLoading ? 'Searching OpenStreetMap...' : `${filteredPharmacies.length} pharmacies found`}
              </p>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                {pharmacyLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <PharmacyCardSkeleton key={i} />)
                ) : filteredPharmacies.length === 0 ? (
                  <div className="glass-card p-10 text-center">
                    <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">No pharmacies found</h3>
                    <p className="text-xs text-slate-500 mt-1">Try increasing the search radius or setting another location.</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {filteredPharmacies.map(p => (
                      <PharmacyCard
                        key={p.place_id}
                        pharmacy={p}
                        isSelected={selectedPharmacy?.place_id === p.place_id}
                        onSelect={(ph) => {
                          setSelectedPharmacy(ph);
                          if (mapInstanceRef.current && ph.latitude) {
                            mapInstanceRef.current.panTo([ph.latitude, ph.longitude]);
                          }
                        }}
                        onDirections={handleDirections}
                        routeActive={activeRoute === p.place_id}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>

            {/* RIGHT: Leaflet Map */}
            <div className="flex-1 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 relative bg-slate-950/20">
              <div ref={mapRef} className="w-full h-full z-10" />

              {/* OSRM Route Info overlay */}
              <AnimatePresence>
                {routeInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="absolute left-4 top-4 z-[999] bg-slate-900/90 backdrop-blur-md border border-emerald-500/30 p-4 rounded-2xl flex items-center gap-4 text-white shadow-xl"
                  >
                    <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center justify-center">
                      <Navigation className="w-5 h-5 text-emerald-400 rotate-45" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Route Directions</h4>
                      <p className="text-sm font-black mt-0.5">
                        {routeInfo.distance} km <span className="text-slate-400 font-semibold mx-1">·</span> {routeInfo.duration} mins
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {pharmacyLoading && (
                <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/75 backdrop-blur-sm flex items-center justify-center pointer-events-none z-[999]">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-3">Updating OpenStreetMap...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* ── PRESCRIPTIONS TAB ────────────────────────────────────────── */}
      {activeTab === 'prescriptions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto flex-1 pr-1 relative">
          
          {prescriptionLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/75 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-[999] rounded-2xl">
              <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-bold text-violet-600 dark:text-violet-400">Gemini is analyzing your prescription...</p>
              <p className="text-xs text-slate-400 mt-1">Extracting medicine instructions & recovery guidance</p>
            </div>
          )}

          {!uploadedPrescription ? (
            <>
              {/* UPLOAD FORM (Left 2 Columns) */}
              <div className="lg:col-span-2 glass-card p-6 space-y-5 flex flex-col justify-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Upload Prescription</h3>
                  <p className="text-xs text-slate-500 mt-1">Upload a doctor's prescription (PNG, JPG, PDF)</p>
                </div>
                <label className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-violet-500/50 transition-all relative block">
                  <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                  {prescriptionPreview ? (
                    <div className="space-y-3">
                      <img src={prescriptionPreview} alt="Preview" className="max-h-48 rounded-xl object-contain border border-slate-100 dark:border-white/5 shadow-md mx-auto" />
                      <p className="text-xs text-slate-500 font-semibold">{prescriptionFile?.name}</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-slate-400 mb-3 animate-bounce" />
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Drag & drop prescription</p>
                      <p className="text-xs text-slate-400 mt-1">or click to browse files</p>
                    </>
                  )}
                </label>
                {prescriptionFile && (
                  <button onClick={handleUploadPrescription} disabled={prescriptionLoading} className="btn-primary w-full py-3 font-bold text-xs flex items-center justify-center gap-2">
                    {prescriptionLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />Analyzing...</> : <><Upload className="w-4 h-4" />Upload Prescription</>}
                  </button>
                )}
              </div>

              {/* EMPTY STATE (Right 1 Column) */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-emerald-500" />
                  Active Prescription
                </h3>
                <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                  <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500 font-medium leading-relaxed px-4">No prescription uploaded yet</p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* IMAGE PREVIEW & METADATA (Left 1 Column) */}
              <div className="glass-card p-5 space-y-4 h-fit">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                  <FileText className="w-5 h-5 text-violet-500" />
                  Active Prescription
                </h3>
                <div className="p-2 rounded-xl border border-slate-150 dark:border-white/5 space-y-3">
                  <div className="aspect-video rounded-lg bg-slate-150 dark:bg-white/5 overflow-hidden">
                    <img src={uploadedPrescription.url} alt="Uploaded Rx" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{uploadedPrescription.filename}</p>
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">✓ Verified</span>
                  <button onClick={() => dispatch(clearUploadedPrescription())} className="w-full py-2 text-xs text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl font-semibold transition-all">
                    Remove Prescription
                  </button>
                </div>
              </div>

              {/* AI PRESCRIPTION ANALYSIS (Right 2 Columns) */}
              <div className="lg:col-span-2 glass-card p-0 overflow-hidden flex flex-col">
                <div className="p-4 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border-b border-violet-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
                      <Sparkles className="w-4.5 h-4.5 text-white animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        Gemini AI Prescription Analysis
                      </h4>
                      <p className="text-[10px] text-violet-500 dark:text-violet-400 font-semibold uppercase tracking-wider">Clinical Pharmacist AI v2.5</p>
                    </div>
                  </div>
                  
                  {uploadedPrescription.id && (
                    <button
                      onClick={() => handleDeletePrescription(uploadedPrescription.id)}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/25 text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/40 flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm"
                      title="Delete Prescription from history"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh] scrollbar-thin">
                  {/* General Summary */}
                  {uploadedPrescription.analysis?.summary && (
                    <div className="p-3.5 rounded-xl bg-violet-500/5 border border-violet-500/15 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                      {uploadedPrescription.analysis.summary}
                    </div>
                  )}

                  {/* Patient & Doctor Meta Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl border border-slate-150 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                    <div className="text-xs">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Patient Name</span>
                      <strong className="text-slate-800 dark:text-white font-black">{uploadedPrescription.analysis?.patient_name || 'Unknown'}</strong>
                    </div>
                    <div className="text-xs">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Doctor / Clinic</span>
                      <strong className="text-slate-800 dark:text-white font-black">{uploadedPrescription.analysis?.doctor_name || 'Unknown'}</strong>
                    </div>
                    <div className="text-xs">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Scan Date</span>
                      <strong className="text-slate-800 dark:text-white font-black">{uploadedPrescription.analysis?.date || uploadedPrescription.date || 'Unknown'}</strong>
                    </div>
                  </div>

                  {/* Vitals & Symptoms */}
                  {(uploadedPrescription.analysis?.vitals || uploadedPrescription.analysis?.symptoms?.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Vitals */}
                      {uploadedPrescription.analysis?.vitals && (
                        <div className="space-y-2">
                          <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scanned Vitals</h6>
                          <div className="flex flex-wrap gap-2">
                            {uploadedPrescription.analysis.vitals.blood_pressure && uploadedPrescription.analysis.vitals.blood_pressure !== 'N/A' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold border border-rose-500/15">
                                <Activity className="w-3.5 h-3.5" /> BP: {uploadedPrescription.analysis.vitals.blood_pressure}
                              </span>
                            )}
                            {uploadedPrescription.analysis.vitals.pulse && uploadedPrescription.analysis.vitals.pulse !== 'N/A' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/15">
                                <Heart className="w-3.5 h-3.5" /> Pulse: {uploadedPrescription.analysis.vitals.pulse}
                              </span>
                            )}
                            {uploadedPrescription.analysis.vitals.weight && uploadedPrescription.analysis.vitals.weight !== 'N/A' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold border border-sky-500/15">
                                <SlidersHorizontal className="w-3.5 h-3.5" /> Wt: {uploadedPrescription.analysis.vitals.weight}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Symptoms */}
                      {uploadedPrescription.analysis?.symptoms?.length > 0 && (
                        <div className="space-y-2">
                          <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complaints / Symptoms</h6>
                          <div className="flex flex-wrap gap-1.5">
                            {uploadedPrescription.analysis.symptoms.map((symptom, idx) => (
                              <span key={idx} className="px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-bold border border-violet-500/15">
                                {symptom}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Medicines List */}
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Pill className="w-3.5 h-3.5" />
                      Prescribed Medication & Pill Guide
                    </h5>
                    
                    {uploadedPrescription.analysis?.medicines?.map((med, index) => {
                      // Dynamically parse timing markers
                      const when = med.when_to_have.toLowerCase();
                      const isMorning = when.includes('morning') || when.includes('breakfast') || when.includes('am') || when.includes('once daily') || when.includes('twice') || when.includes('three');
                      const isAfternoon = when.includes('afternoon') || when.includes('lunch') || when.includes('three');
                      const isNight = when.includes('night') || when.includes('dinner') || when.includes('evening') || when.includes('bedtime') || when.includes('twice') || when.includes('three');
                      const isBeforeFood = when.includes('before') || when.includes('empty stomach');
                      const isAfterFood = !isBeforeFood;

                      // Parse duration
                      const durationMatch = when.match(/for\s+(\d+\s+days?|\d+\s+weeks?)/i);
                      const duration = durationMatch ? durationMatch[1] : 'As prescribed';

                      // Common side effects/precautions mapping helper
                      let sideEffects = ['Mild drowsiness', 'Dry mouth'];
                      let precautions = ['Take with a glass of water', 'Do not crush or chew'];
                      let alternatives = ['Generic alternative available'];

                      const nameLower = med.name.toLowerCase();
                      if (nameLower.includes('fexoden') || nameLower.includes('fexofenadine') || nameLower.includes('zyrtec')) {
                        sideEffects = ['Drowsiness (low risk)', 'Headache', 'Dry mouth'];
                        precautions = ['Avoid alcohol while taking', 'Check for kidney warning guidelines'];
                        alternatives = ['Allegra 120mg', 'Fexo 120', 'Histafree'];
                      } else if (nameLower.includes('vituss') || nameLower.includes('cough')) {
                        sideEffects = ['Mild sedation', 'Dizziness', 'Stomach discomfort'];
                        precautions = ['Avoid driving if feeling drowsy', 'Shake well before use'];
                        alternatives = ['Benadryl DR', 'Ascoril D', 'Grilinctus'];
                      } else if (nameLower.includes('ciprofloxacin') || nameLower.includes('ciplox')) {
                        sideEffects = ['Nausea', 'Diarrhea', 'Photosensitivity (sun sensitivity)'];
                        precautions = ['Drink plenty of water', 'Do not take with milk or yogurt'];
                        alternatives = ['Cipro 500', 'Ciplox 500', 'Zoxan 500'];
                      } else if (nameLower.includes('calpol') || nameLower.includes('paracetamol')) {
                        sideEffects = ['Minimal (rare liver toxicity if exceeded limit)'];
                        precautions = ['Do not exceed 4g (4000mg) in 24 hours', 'Avoid double-dosing'];
                        alternatives = ['Dolo 650', 'Crocin 650', 'Pacimol 650'];
                      } else if (nameLower.includes('pantosec') || nameLower.includes('pantoprazole')) {
                        sideEffects = ['Headache', 'Mild diarrhea', 'Flatulence'];
                        precautions = ['Best taken 30 minutes before breakfast', 'Swallow whole'];
                        alternatives = ['Pan 40', 'Pantocid 40', 'Pantodac 40'];
                      } else if (nameLower.includes('metformin') || nameLower.includes('glucophage')) {
                        sideEffects = ['Nausea/vomiting', 'Metallic taste', 'Abdominal bloating/diarrhea'];
                        precautions = ['Take with meals to avoid stomach upset', 'Monitor blood sugar levels'];
                        alternatives = ['Glycomet 500', 'Metformin 500', 'Exermet'];
                      }

                      // Card border color accents based on type
                      const cardColors = [
                        'border-violet-500/20 hover:border-violet-500/40 bg-gradient-to-br from-violet-500/5 to-transparent',
                        'border-emerald-500/20 hover:border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-transparent',
                        'border-cyan-500/20 hover:border-cyan-500/40 bg-gradient-to-br from-cyan-500/5 to-transparent',
                        'border-rose-500/20 hover:border-rose-500/40 bg-gradient-to-br from-rose-500/5 to-transparent',
                      ];
                      const cardStyle = cardColors[index % cardColors.length];

                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.08 }}
                          className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col gap-3.5 relative overflow-hidden group ${cardStyle}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-xl flex-shrink-0">
                                💊
                              </div>
                              <div>
                                <h6 className="text-xs font-black text-slate-900 dark:text-white group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors">
                                  {med.name}
                                </h6>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Duration: {duration}</p>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${isBeforeFood ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15'}`}>
                              {isBeforeFood ? 'Before Food' : 'After Food'}
                            </span>
                          </div>

                          {/* Timings Visual Badges */}
                          <div className="grid grid-cols-3 gap-2 py-1 bg-white/40 dark:bg-dark-300/40 p-2 rounded-xl border border-slate-150 dark:border-white/5">
                            {[
                              { label: 'Morning', active: isMorning, time: '8:00 AM' },
                              { label: 'Afternoon', active: isAfternoon, time: '2:00 PM' },
                              { label: 'Night', active: isNight, time: '9:00 PM' }
                            ].map(t => (
                              <div key={t.label} className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all ${
                                t.active 
                                  ? 'bg-primary-500/10 border-primary-500/25 text-primary-600 dark:text-primary-400 font-bold' 
                                  : 'bg-transparent border-transparent text-slate-400 dark:text-slate-600 font-medium'
                              }`}>
                                <span className="text-[10px] leading-none">{t.label}</span>
                                <span className="text-[8px] mt-0.5 opacity-60 leading-none">{t.time}</span>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-1.5 pl-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Clinical Action</span>
                            <p className="text-xs text-slate-700 dark:text-slate-350 font-semibold leading-relaxed">
                              {med.how_it_helps}
                            </p>
                          </div>

                          {/* Accordion list for Side-effects & Alternatives */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1 border-t border-slate-100 dark:border-white/5 pt-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <div>
                              <span className="font-bold text-slate-600 dark:text-slate-300 block mb-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-500" /> Precautions & Side Effects:
                              </span>
                              <ul className="list-disc pl-3 space-y-0.5 font-medium">
                                <li>{precautions[0]}</li>
                                <li>{sideEffects[0]}</li>
                              </ul>
                            </div>
                            <div>
                              <span className="font-bold text-slate-600 dark:text-slate-300 block mb-0.5 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-violet-500" /> Generic Substitutes:
                              </span>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {alternatives.map(alt => (
                                  <span key={alt} className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 font-bold text-[9px] border border-violet-500/10">
                                    {alt}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Diet & Advice */}
                  {uploadedPrescription.analysis?.diet_advice?.length > 0 && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-amber-500/5 space-y-2">
                      <h5 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" /> Diet & Lifestyle Advice
                      </h5>
                      <ul className="space-y-1.5 pl-2">
                        {uploadedPrescription.analysis.diet_advice.map((adv, idx) => (
                          <li key={idx} className="text-xs text-slate-700 dark:text-slate-300 font-medium flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span>{adv}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PRESCRIPTION HISTORY TAB ─────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="glass-card p-6 space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Prescription Scan History</h3>
            <button onClick={() => dispatch(fetchPrescriptionHistory())} className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 font-bold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          {prescriptionHistory.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium text-sm">No prescriptions scanned yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {prescriptionHistory.map(rx => (
                <div key={rx.id} className="glass-card p-4 hover:border-violet-500/30 transition-all flex flex-col justify-between gap-4 border border-slate-200 dark:border-white/5">
                  <div className="flex gap-3 items-start">
                    <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center flex-shrink-0 text-xl">
                      📄
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-slate-900 dark:text-white text-xs truncate">{rx.filename}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">✓ Scanned</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {rx.date}
                      </p>
                      {rx.analysis?.patient_name && rx.analysis.patient_name !== 'Unknown' && (
                        <p className="text-[11px] text-slate-500 mt-1.5 font-semibold">
                          Patient: <span className="text-slate-700 dark:text-slate-300 font-bold">{rx.analysis.patient_name}</span>
                        </p>
                      )}
                      {rx.analysis?.doctor_name && rx.analysis.doctor_name !== 'Unknown' && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium line-clamp-1">
                          Dr/Clinic: {rx.analysis.doctor_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-100 dark:border-white/5 pt-3">
                    <button
                      onClick={() => {
                        dispatch(setUploadedPrescription(rx));
                        setActiveTab('prescriptions');
                      }}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-violet-500 hover:bg-violet-600 text-white flex items-center justify-center gap-1.5 transition-all shadow-md shadow-violet-500/10"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> View Analysis Report
                    </button>
                    <a
                      href={rx.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-center transition-all"
                      title="View Original Image"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeletePrescription(rx.id)}
                      className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-500/25 text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/40 flex items-center justify-center transition-all"
                      title="Delete Prescription"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
