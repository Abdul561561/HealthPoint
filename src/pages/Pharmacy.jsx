import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Phone, Clock,
  Pill, FileText, RefreshCw, Trash2,
  AlertCircle, Check, Upload, Eye, ExternalLink,
  Sparkles, Activity, Heart, Map, List,
  Columns, SlidersHorizontal, Navigation2, AlertTriangle, LocateFixed, Globe, Info
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
import { fetchProtectedFileBlobUrl } from '../services/api';
import { useOsmDiscoveryLocation } from '../hooks/useOsmDiscoveryLocation';
import HealthcareLeafletMap from '../components/maps/HealthcareLeafletMap';
import OsmLocationToolbar from '../components/maps/OsmLocationToolbar';
import { getRoute } from '../services/openMapsApi';
import { extractMapsErrorMessage, fetchNearbyPharmacies } from '../services/mapsApi';

const TABS = [
  { id: 'pharmacies', label: 'Nearby Pharmacies', icon: MapPin },
  { id: 'prescriptions', label: 'Prescriptions', icon: FileText },
  { id: 'history', label: 'Prescription History', icon: Clock },
];

// Skeleton loaders
function PharmacyCardSkeleton() {
  return (
    <div className="glass-card p-4 animate-pulse !transform-none">
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-full" />
          <div className="flex gap-2">
            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-14" />
            <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-20" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-9 bg-slate-200 dark:bg-white/10 rounded-xl flex-1" />
        <div className="h-9 bg-slate-200 dark:bg-white/10 rounded-xl flex-1" />
      </div>
    </div>
  );
}

// Pharmacy card component
function PharmacyCard({ pharmacy, isSelected, onSelect, onDirections, routeActive }) {
  const openStatus = pharmacy.open_now === true
    ? { label: 'Open 24/7', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' }
    : pharmacy.opening_hours?.length > 0
    ? { label: pharmacy.opening_hours[0], cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25' }
    : { label: 'Hours N/A in OSM', cls: 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10' };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={() => onSelect(pharmacy)}
      className={`glass-card p-4 cursor-pointer transition-all duration-200 border-2 hover:border-emerald-400/50 hover:shadow-lg ${
        isSelected
          ? 'border-emerald-500 bg-emerald-500/[0.04] dark:bg-emerald-500/10 shadow-emerald-500/10'
          : 'border-transparent'
      }`}
    >
      <div className="flex gap-3 items-start">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Pill className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug line-clamp-1">
              {pharmacy.name}
            </h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 max-w-[140px] truncate border ${openStatus.cls}`}>
              {openStatus.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 flex items-start gap-1">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
            <span>{pharmacy.address}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-slate-200/70 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
          <Navigation className="w-3 h-3" />
          {pharmacy.distance_km} km
        </span>
        {pharmacy.phone && (
          <a
            href={`tel:${pharmacy.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 font-medium hover:text-emerald-600 dark:hover:text-emerald-300"
          >
            <Phone className="w-3 h-3" />
            {pharmacy.phone}
          </a>
        )}
        <span className="text-[10px] text-slate-400 ml-auto">OSM</span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {pharmacy.phone && (
          <a
            href={`tel:${pharmacy.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="btn-secondary py-2 px-3 rounded-xl text-xs font-bold"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Call
          </a>
        )}
        {pharmacy.website && (
          <a
            href={pharmacy.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="btn-secondary py-2 px-3 rounded-xl text-xs font-bold"
          >
            <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Site
          </a>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDirections(pharmacy);
          }}
          className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            routeActive
              ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700'
              : 'bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white border border-emerald-500/25'
          }`}
        >
          <Navigation2 className="w-3.5 h-3.5" />
          {routeActive ? 'Hide Route' : 'Show Route'}
        </button>
        <a
          href={pharmacy.directions_url || pharmacy.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="btn-secondary py-2 px-3 rounded-xl text-xs font-bold"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Directions
        </a>
      </div>
    </motion.div>
  );
}

export default function Pharmacy() {
  const dispatch = useDispatch();
  const { uploadedPrescription, prescriptionHistory = [], prescriptionLoading } = useSelector((s) => s.pharmacy);

  const [activeTab, setActiveTab] = useState('pharmacies');

  // Shared OSM location & Nominatim search state
  const {
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
  } = useOsmDiscoveryLocation({ gpsLabel: 'Current GPS Location', timeoutMs: 8500 });

  // Pharmacy map state
  const [pharmacies, setPharmacies] = useState([]);
  const [pharmacyLoading, setPharmacyLoading] = useState(false);
  const [pharmacyError, setPharmacyError] = useState('');
  const [pharmacyNotice, setPharmacyNotice] = useState('');
  const [pharmacySourceInfo, setPharmacySourceInfo] = useState(null);
  const [manualOsmUrl, setManualOsmUrl] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // split | list | map
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [pharmacyRadius, setPharmacyRadius] = useState(3000);
  const [pharmacySearch, setPharmacySearch] = useState('');

  // Directions
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  // Prescriptions state
  const [prescriptionFile, setPrescriptionFile] = useState(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState(null);

  const clearRoute = useCallback(() => {
    setActiveRouteId(null);
    setRouteCoordinates(null);
    setRouteInfo(null);
  }, []);

  // Load initial prescription data
  useEffect(() => {
    dispatch(fetchPrescriptionHistory());
    dispatch(fetchLatestPrescription());
  }, [dispatch]);

  const [protectedRxUrl, setProtectedRxUrl] = useState(null);

  useEffect(() => {
    let active = true;
    let revokeUrl = null;
    const loadPreview = async () => {
      if (!uploadedPrescription?.url) {
        setProtectedRxUrl(null);
        return;
      }
      try {
        const { url, revoke } = await fetchProtectedFileBlobUrl(uploadedPrescription.url);
        if (!active) {
          if (revoke) URL.revokeObjectURL(url);
          return;
        }
        if (revoke) revokeUrl = url;
        setProtectedRxUrl(url);
      } catch {
        if (active) setProtectedRxUrl(null);
      }
    };
    loadPreview();
    return () => {
      active = false;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [uploadedPrescription?.url]);

  const handleViewOriginalRx = async (rx) => {
    if (!rx?.url) return;
    try {
      const { url, revoke } = await fetchProtectedFileBlobUrl(rx.url);
      window.open(url, '_blank', 'noopener,noreferrer');
      if (revoke) setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      dispatch(addToast({ title: 'Access Error', message: 'Unable to open protected prescription file.', type: 'error' }));
    }
  };

  // Fetch pharmacies using backend OpenStreetMap discovery proxy
  const fetchPharmacies = useCallback(async () => {
    if (!coords) return;
    setPharmacyLoading(true);
    setPharmacyError('');
    setPharmacyNotice('');
    setManualOsmUrl('');
    setSelectedPharmacy(null);
    clearRoute();

    try {
      const res = await fetchNearbyPharmacies({
        lat: coords.lat,
        lng: coords.lng,
        filterType: openOnly ? 'open_now' : 'all',
        radius: pharmacyRadius,
        locationLabel,
      });

      if (res?.ok) {
        setPharmacies(res.results || []);
        setPharmacyNotice(res.notice || '');
        setManualOsmUrl(res.manual_maps_url || '');
        setPharmacySourceInfo({
          source: res.source || 'openstreetmap',
          mirror: res.mirror_used || null,
          cached: Boolean(res.cached),
        });
      } else {
        setPharmacies([]);
        setPharmacyError(res?.error || 'OpenStreetMap pharmacy search failed.');
        setManualOsmUrl(
          res?.manual_maps_url ||
            `https://www.openstreetmap.org/search?query=pharmacy#map=14/${coords.lat}/${coords.lng}`
        );
      }
    } catch (e) {
      console.error('Failed to fetch pharmacies:', e);
      setPharmacies([]);
      setPharmacyError(extractMapsErrorMessage(e, 'Unable to load nearby pharmacies from OpenStreetMap right now.'));
      setManualOsmUrl(`https://www.openstreetmap.org/search?query=pharmacy#map=14/${coords.lat}/${coords.lng}`);
    } finally {
      setPharmacyLoading(false);
    }
  }, [coords, openOnly, pharmacyRadius, locationLabel, clearRoute]);

  useEffect(() => {
    if (activeTab !== 'pharmacies' || !coords) return undefined;
    const t = setTimeout(() => {
      fetchPharmacies();
    }, 0);
    return () => clearTimeout(t);
  }, [activeTab, fetchPharmacies, coords]);

  // Draw OSRM route line
  const handleDirections = async (pharmacy) => {
    if (!coords) return;
    if (viewMode === 'list') setViewMode('split');

    if (activeRouteId === pharmacy.place_id) {
      clearRoute();
      return;
    }

    try {
      setSelectedPharmacy(pharmacy);
      setRouteLoading(true);
      const routeData = await getRoute(coords, { lat: pharmacy.latitude, lng: pharmacy.longitude });
      setRouteCoordinates(routeData.coordinates);
      setActiveRouteId(pharmacy.place_id);
      setRouteInfo({
        distance: routeData.distance_km,
        duration: routeData.duration_min,
      });
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Route Error', message: 'Unable to calculate directions.', type: 'error' }));
    } finally {
      setRouteLoading(false);
    }
  };

  // Prescription file handlers
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
    if (window.confirm('Are you sure you want to delete this prescription from history?')) {
      const result = await dispatch(deletePrescriptionFile(prescriptionId));
      if (deletePrescriptionFile.fulfilled.match(result)) {
        dispatch(addToast({ title: 'Success', message: 'Prescription deleted successfully', type: 'success' }));
      } else {
        dispatch(addToast({ title: 'Error', message: 'Failed to delete prescription', type: 'error' }));
      }
    }
  };

  const filteredPharmacies = useMemo(() => {
    const q = pharmacySearch.trim().toLowerCase();
    return pharmacies.filter(
      (p) =>
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q)
    );
  }, [pharmacies, pharmacySearch]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-4">
      {/* Header */}
      <div className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 !transform-none">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Pill className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Smart Pharmacy Assistant
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Nearby OpenStreetMap pharmacies, route guidance, and AI prescription analysis. Confirm live medicine stock directly by calling the pharmacy.
            </p>
          </div>
        </div>

        {activeTab === 'pharmacies' && (
          <div className="inline-flex bg-slate-100 dark:bg-white/10 rounded-xl p-1 gap-1 border border-slate-200/80 dark:border-white/15 self-start sm:self-center flex-shrink-0">
            {[
              { id: 'split', label: 'Split', icon: Columns },
              { id: 'list', label: 'List', icon: List },
              { id: 'map', label: 'Map', icon: Map },
            ].map((m) => {
              const VIcon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === m.id
                      ? 'bg-white dark:bg-dark-100 text-emerald-600 dark:text-emerald-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <VIcon className="w-3.5 h-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-slate-200/70 dark:border-white/10">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all whitespace-nowrap border-b-2 flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
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
        <div className="space-y-4">
          {/* Consent Prompt if Location Unavailable */}
          {!coords && (
            <div className="glass-card p-4 border-l-4 border-emerald-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 !transform-none">
              <div className="flex items-start gap-3">
                <LocateFixed className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {locationStatus === 'denied'
                      ? 'Location Access Denied or Unavailable'
                      : 'Location Needed to Find Nearby Pharmacies'}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    Allow browser GPS or search any city, neighborhood, or 6-digit PIN code below. HealthPoint never assumes a default city.
                  </p>
                </div>
              </div>
              <button type="button" onClick={requestBrowserLocation} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap">
                <LocateFixed className="w-3.5 h-3.5" /> Allow Location
              </button>
            </div>
          )}

          <OsmLocationToolbar
            accentColor="emerald"
            addressQuery={addressQuery}
            addressSuggestions={addressSuggestions}
            showSuggestions={showSuggestions}
            setShowSuggestions={setShowSuggestions}
            onAddressChange={handleAddressChange}
            onAddressSubmit={submitAddress}
            onSelectSuggestion={selectSuggestion}
            onClearAddress={clearAddressInput}
            onRequestGps={requestBrowserLocation}
            locationStatus={locationStatus}
            locationLabel={locationLabel}
            geocodeLoading={geocodeLoading}
            geocodeError={geocodeError}
            filterText={pharmacySearch}
            onFilterTextChange={setPharmacySearch}
            filterPlaceholder="Search by pharmacy name or street..."
            radius={pharmacyRadius}
            onRadiusChange={setPharmacyRadius}
            loading={pharmacyLoading}
            hasCoords={Boolean(coords)}
            onRefresh={fetchPharmacies}
            extraControl={
              <button
                type="button"
                onClick={() => setOpenOnly((prev) => !prev)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex items-center gap-1.5 ${
                  openOnly
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:border-emerald-400'
                }`}
                title="Only show pharmacies tagged opening_hours=24/7 in OpenStreetMap"
              >
                <Clock className="w-3.5 h-3.5" />
                24/7 Only
              </button>
            }
          />

          <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3.5 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>
              Listings come directly from OpenStreetMap. Live medicine stock, pricing, and unverified opening hours are not provided by OSM — contact the pharmacy directly before visiting.
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* LEFT: Pharmacy cards */}
            {viewMode !== 'map' && (
              <div className={`${viewMode === 'split' ? 'lg:col-span-5' : 'lg:col-span-12'} flex flex-col gap-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {!coords
                      ? 'Waiting for location...'
                      : pharmacyLoading
                      ? 'Querying OpenStreetMap pharmacies...'
                      : `${filteredPharmacies.length} ${filteredPharmacies.length === 1 ? 'pharmacy' : 'pharmacies'} found`}
                    {openOnly && <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-bold">· 24/7 tagged</span>}
                  </p>
                  {pharmacySourceInfo && !pharmacyLoading && coords && !pharmacyError && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300">
                      {pharmacySourceInfo.cached ? 'Cached OSM' : pharmacySourceInfo.mirror || 'OpenStreetMap'}
                    </span>
                  )}
                </div>

                {pharmacyNotice && !pharmacyError && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/80 dark:bg-amber-950/20 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <span>{pharmacyNotice}</span>
                  </div>
                )}

                <div
                  className={`space-y-3 ${
                    viewMode === 'split' ? 'lg:max-h-[620px] lg:overflow-y-auto lg:pr-1 scrollbar-thin' : ''
                  }`}
                >
                  {pharmacyLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <PharmacyCardSkeleton key={i} />)
                  ) : pharmacyError ? (
                    <div className="glass-card p-6 space-y-3 border border-rose-300/60 dark:border-rose-500/30 !transform-none">
                      <div className="flex items-start gap-2.5 text-rose-700 dark:text-rose-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-bold">OpenStreetMap Pharmacy Search Failed</h4>
                          <p className="text-xs mt-1 leading-relaxed">{pharmacyError}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button type="button" onClick={fetchPharmacies} className="btn-primary py-2 px-4 text-xs font-bold">
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Search
                        </button>
                        {manualOsmUrl && (
                          <a
                            href={manualOsmUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary py-2 px-4 text-xs font-bold"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> OpenStreetMap Search
                          </a>
                        )}
                      </div>
                    </div>
                  ) : !coords ? (
                    <div className="glass-card p-8 text-center !transform-none">
                      <MapPin className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Location required to search nearby pharmacies
                      </p>
                    </div>
                  ) : filteredPharmacies.length === 0 ? (
                    <div className="glass-card p-7 text-center space-y-3 !transform-none">
                      <Pill className="w-9 h-9 text-slate-400 mx-auto" />
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">No matching pharmacies found</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-300 max-w-md mx-auto">
                        {pharmacyNotice || 'Try increasing the search radius, turning off the 24/7 filter, or clearing the name filter.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenOnly(false);
                            setPharmacySearch('');
                            setPharmacyRadius(10000);
                          }}
                          className="btn-primary py-2 px-4 text-xs font-bold"
                        >
                          Show All Nearby Pharmacies (10 km)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {filteredPharmacies.map((p) => (
                        <PharmacyCard
                          key={p.place_id}
                          pharmacy={p}
                          isSelected={selectedPharmacy?.place_id === p.place_id}
                          onSelect={(ph) => setSelectedPharmacy(ph)}
                          onDirections={handleDirections}
                          routeActive={activeRouteId === p.place_id}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            )}

            {/* RIGHT: Leaflet Map */}
            {viewMode !== 'list' && (
              <div
                className={`${
                  viewMode === 'split' ? 'lg:col-span-7 h-[380px] lg:h-[650px]' : 'lg:col-span-12 h-[480px] lg:h-[660px]'
                } w-full lg:sticky lg:top-20`}
              >
                <HealthcareLeafletMap
                  coords={coords}
                  locationLabel={locationLabel}
                  items={filteredPharmacies}
                  selectedItem={selectedPharmacy}
                  onSelectItem={(ph) => setSelectedPharmacy(ph)}
                  routeCoordinates={routeCoordinates}
                  routeInfo={routeInfo}
                  onClearRoute={clearRoute}
                  loading={pharmacyLoading || routeLoading}
                  accentColor="emerald"
                  markerEmoji="💊"
                  emptyLocationText="Grant location access or enter a city / PIN code to view nearby pharmacies on OpenStreetMap."
                />
              </div>
            )}
          </div>
        </div>
      )}



      {/* ── PRESCRIPTIONS TAB ────────────────────────────────────────── */}
      {activeTab === 'prescriptions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto flex-1 pr-1 relative">
          
          {prescriptionLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/75 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none z-[999] rounded-2xl">
              <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-bold text-violet-600 dark:text-violet-400">HealthPoint AI is analyzing your prescription...</p>
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
                <div className="p-2 rounded-xl border border-slate-200 dark:border-white/5 space-y-3">
                  <div className="aspect-video rounded-lg bg-slate-200 dark:bg-white/5 overflow-hidden flex items-center justify-center">
                    {protectedRxUrl ? (
                      <img src={protectedRxUrl} alt="Uploaded Rx" className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-8 h-8 text-slate-400" />
                    )}
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
                        HealthPoint AI Prescription Analysis
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
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
                          <div className="grid grid-cols-3 gap-2 py-1 bg-white/40 dark:bg-dark-300/40 p-2 rounded-xl border border-slate-200 dark:border-white/5">
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
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold leading-relaxed">
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
                    <button
                      type="button"
                      onClick={() => handleViewOriginalRx(rx)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-center transition-all"
                      title="View Original File"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
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
