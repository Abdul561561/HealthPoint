import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Navigation, Clock, Stethoscope, RefreshCw,
  Map, List, Columns, Navigation2, Phone, Globe, ExternalLink, AlertCircle, LocateFixed, Info
} from 'lucide-react';
import { useDispatch } from 'react-redux';
import { addToast } from '../redux/slices/uiSlice';
import { useOsmDiscoveryLocation } from '../hooks/useOsmDiscoveryLocation';
import HealthcareLeafletMap from '../components/maps/HealthcareLeafletMap';
import OsmLocationToolbar from '../components/maps/OsmLocationToolbar';
import { getRoute } from '../services/openMapsApi';
import { extractMapsErrorMessage, fetchNearbyDoctors } from '../services/mapsApi';

const SPECIALTIES = [
  'All',
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Pediatrician',
  'Neurologist',
  'Orthopedic Doctor',
  'ENT Specialist',
  'Gynecologist',
  'Dentist',
  'Ophthalmologist',
  'Hospital',
  'Clinic',
  'Emergency Care',
];

function DoctorCardSkeleton() {
  return (
    <div className="glass-card p-4 animate-pulse !transform-none">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-slate-200 dark:bg-white/10 rounded w-5/6" />
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={() => onSelect(doctor)}
      className={`glass-card p-4 cursor-pointer border-2 transition-all duration-200 hover:shadow-lg hover:border-indigo-400/50 ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/[0.04] dark:bg-indigo-500/10 shadow-indigo-500/10'
          : 'border-transparent'
      }`}
    >
      <div className="flex gap-3 items-start">
        <div className="w-11 h-11 rounded-2xl flex-shrink-0 bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-sm">
          <Stethoscope className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug line-clamp-1">
              {doctor.name}
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
              {doctor.category || 'Healthcare Facility'}
            </span>
          </div>
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 line-clamp-1">
            {doctor.specialty}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 flex items-start gap-1">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
            <span>{doctor.address}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-slate-200/70 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-300">
          <Navigation className="w-3 h-3" />
          {doctor.distance_km} km
        </span>
        <span className="inline-flex items-center gap-1 truncate text-slate-500 dark:text-slate-400 max-w-[200px]">
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{hoursLabel}</span>
        </span>
        {doctor.phone && (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
            <Phone className="w-3 h-3" />
            {doctor.phone}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {doctor.phone && (
          <a
            href={`tel:${doctor.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="btn-secondary py-2 px-3 rounded-xl text-xs font-bold"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Call
          </a>
        )}
        {doctor.website && (
          <a
            href={doctor.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="btn-secondary py-2 px-3 rounded-xl text-xs font-bold"
          >
            <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" /> Website
          </a>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDirections(doctor);
          }}
          className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            routeActive
              ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
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
            className="btn-secondary py-2 px-3 rounded-xl text-xs font-bold"
            title="OpenStreetMap Directions"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Directions
          </a>
        )}
      </div>
    </motion.div>
  );
}

export default function Doctors() {
  const dispatch = useDispatch();
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
  } = useOsmDiscoveryLocation({ gpsLabel: 'Your Current GPS Location' });

  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('All');
  const [radius, setRadius] = useState(5000);
  const [withPhoneOnly, setWithPhoneOnly] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // split | list | map

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [osmError, setOsmError] = useState(null);
  const [osmNotice, setOsmNotice] = useState(null);
  const [sourceInfo, setSourceInfo] = useState(null);
  const [manualOsmUrl, setManualOsmUrl] = useState(null);

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const clearRoute = useCallback(() => {
    setActiveRouteId(null);
    setRouteCoordinates(null);
    setRouteInfo(null);
  }, []);

  const loadDoctors = useCallback(async () => {
    if (!coords) return;
    setLoading(true);
    setOsmError(null);
    setOsmNotice(null);
    setManualOsmUrl(null);
    setSelectedDoctor(null);
    clearRoute();

    try {
      const res = await fetchNearbyDoctors({
        lat: coords.lat,
        lng: coords.lng,
        specialty: specialty === 'Clinic' ? 'General Physician' : specialty,
        radius,
        locationLabel,
      });

      if (res?.ok) {
        const rawList = res.results || [];
        const list =
          specialty === 'Clinic'
            ? rawList.filter((item) => (item.category || '').toLowerCase().includes('clinic'))
            : rawList;
        setDoctors(list);
        setOsmNotice(res.notice || null);
        setManualOsmUrl(res.manual_maps_url || null);
        setSourceInfo({
          source: res.source || 'openstreetmap',
          mirror: res.mirror_used || null,
          cached: Boolean(res.cached),
        });
      } else {
        setDoctors([]);
        setOsmError(res?.error || 'OpenStreetMap discovery query could not complete.');
        setManualOsmUrl(
          res?.manual_maps_url ||
            `https://www.openstreetmap.org/search?query=${encodeURIComponent(specialty === 'All' ? 'clinic hospital' : specialty)}#map=14/${coords.lat}/${coords.lng}`
        );
      }
    } catch (err) {
      console.error('Doctors discovery error:', err);
      setDoctors([]);
      setOsmError(extractMapsErrorMessage(err, 'Unable to reach HealthPoint OpenStreetMap discovery service.'));
      setManualOsmUrl(
        `https://www.openstreetmap.org/search?query=${encodeURIComponent(specialty === 'All' ? 'hospital clinic' : specialty)}#map=14/${coords.lat}/${coords.lng}`
      );
    } finally {
      setLoading(false);
    }
  }, [coords, specialty, radius, locationLabel, clearRoute]);

  useEffect(() => {
    if (!coords) return undefined;
    const t = setTimeout(() => {
      loadDoctors();
    }, 0);
    return () => clearTimeout(t);
  }, [coords, loadDoctors]);

  const handleDirections = async (doctor) => {
    if (!coords) return;
    if (viewMode === 'list') setViewMode('split');

    if (activeRouteId === doctor.place_id) {
      clearRoute();
      return;
    }

    try {
      setSelectedDoctor(doctor);
      setRouteLoading(true);
      const routeData = await getRoute(coords, { lat: doctor.latitude, lng: doctor.longitude });
      setRouteCoordinates(routeData.coordinates);
      setActiveRouteId(doctor.place_id);
      setRouteInfo({ distance: routeData.distance_km, duration: routeData.duration_min });
    } catch {
      dispatch(addToast({ title: 'Route Error', message: 'Unable to calculate OpenStreetMap OSRM route.', type: 'error' }));
    } finally {
      setRouteLoading(false);
    }
  };

  const filteredDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doctors.filter((doc) => {
      const matchesSearch =
        !q ||
        (doc.name || '').toLowerCase().includes(q) ||
        (doc.specialty || '').toLowerCase().includes(q) ||
        (doc.category || '').toLowerCase().includes(q) ||
        (doc.address || '').toLowerCase().includes(q);
      const matchesPhone = !withPhoneOnly || Boolean(doc.phone);
      return matchesSearch && matchesPhone;
    });
  }, [doctors, search, withPhoneOnly]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-4">
      {/* Header */}
      <div className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 !transform-none">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center shadow-md flex-shrink-0">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Find Nearby Doctors, Clinics & Hospitals
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real OpenStreetMap discovery via Overpass & Nominatim. Clinician credentials and live schedules are not independently verified.
            </p>
          </div>
        </div>

        <div className="inline-flex bg-slate-100 dark:bg-white/10 rounded-xl p-1 gap-1 border border-slate-200/80 dark:border-white/15 self-start sm:self-center flex-shrink-0">
          {[
            { id: 'split', label: 'Split', icon: Columns },
            { id: 'list', label: 'List', icon: List },
            { id: 'map', label: 'Map', icon: Map },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === m.id
                    ? 'bg-white dark:bg-dark-100 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explicit Location Consent Prompt when coords not yet available */}
      {!coords && (
        <div className="glass-card p-4 border-l-4 border-indigo-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 !transform-none">
          <div className="flex items-start gap-3">
            <LocateFixed className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {locationStatus === 'denied'
                  ? 'Browser Location Denied or Unavailable'
                  : 'Share Location or Search City / PIN Code'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                HealthPoint never assumes your city. Allow GPS permission or enter your city, area, or 6-digit PIN code below.
              </p>
            </div>
          </div>
          <button type="button" onClick={requestBrowserLocation} className="btn-primary py-2 px-4 text-xs whitespace-nowrap">
            <LocateFixed className="w-3.5 h-3.5" /> Allow Location
          </button>
        </div>
      )}

      {/* Search & Location Controls */}
      <OsmLocationToolbar
        accentColor="indigo"
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
        filterText={search}
        onFilterTextChange={setSearch}
        filterPlaceholder="Filter doctors, hospitals, or streets..."
        radius={radius}
        onRadiusChange={setRadius}
        loading={loading}
        hasCoords={Boolean(coords)}
        onRefresh={loadDoctors}
        extraControl={
          <button
            type="button"
            onClick={() => setWithPhoneOnly((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border flex items-center gap-1.5 transition-all ${
              withPhoneOnly
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:border-indigo-400'
            }`}
          >
            <Phone className="w-3.5 h-3.5" /> Phone Listed
          </button>
        }
      />

      {/* Specialty Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {SPECIALTIES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpecialty(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${
              specialty === s
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Results & Interactive Map Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {viewMode !== 'map' && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-5' : 'lg:col-span-12'} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {!coords
                  ? 'Waiting for location...'
                  : loading
                  ? 'Querying OpenStreetMap discovery service...'
                  : `${filteredDoctors.length} OpenStreetMap ${filteredDoctors.length === 1 ? 'facility' : 'facilities'} found`}
                {specialty !== 'All' && (
                  <span className="ml-1 text-indigo-600 dark:text-indigo-400 font-bold">· {specialty}</span>
                )}
              </p>
              {sourceInfo && !loading && coords && !osmError && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300">
                  {sourceInfo.cached ? 'Cached OSM' : sourceInfo.mirror || 'OpenStreetMap'}
                </span>
              )}
            </div>

            {osmNotice && !osmError && (
              <div className="rounded-xl border border-sky-200 dark:border-sky-500/25 bg-sky-50/80 dark:bg-sky-950/20 px-3.5 py-2.5 text-xs text-sky-800 dark:text-sky-200 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
                <span>{osmNotice}</span>
              </div>
            )}

            <div
              className={`space-y-3 ${
                viewMode === 'split' ? 'lg:max-h-[620px] lg:overflow-y-auto lg:pr-1 scrollbar-thin' : ''
              }`}
            >
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <DoctorCardSkeleton key={i} />)
              ) : osmError ? (
                <div className="glass-card p-6 space-y-3 border border-rose-300/60 dark:border-rose-500/30 !transform-none">
                  <div className="flex items-start gap-2.5 text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold">OpenStreetMap Search Interrupted</h4>
                      <p className="text-xs mt-1 leading-relaxed">{osmError}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={loadDoctors} className="btn-primary px-4 py-2 text-xs font-bold">
                      <RefreshCw className="w-3.5 h-3.5" /> Retry Search
                    </button>
                    {manualOsmUrl && (
                      <a
                        href={manualOsmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-4 py-2 text-xs font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Search on OpenStreetMap
                      </a>
                    )}
                  </div>
                </div>
              ) : !coords ? (
                <div className="glass-card p-8 text-center !transform-none">
                  <MapPin className="w-10 h-10 mx-auto text-indigo-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Location needed to display nearby doctors & hospitals
                  </p>
                </div>
              ) : filteredDoctors.length === 0 ? (
                <div className="glass-card p-7 text-center space-y-3 !transform-none">
                  <Stethoscope className="w-9 h-9 mx-auto text-slate-400" />
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    No matching OpenStreetMap facilities found
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-300 max-w-md mx-auto">
                    {osmNotice ||
                      'Community contributors may not tag every specialist separately on OpenStreetMap. Try expanding the radius or viewing all nearby clinics and hospitals.'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSpecialty('All');
                        setRadius(10000);
                        setWithPhoneOnly(false);
                        setSearch('');
                      }}
                      className="btn-primary px-4 py-2 text-xs font-bold"
                    >
                      Show All Nearby Facilities (10 km)
                    </button>
                    {manualOsmUrl && (
                      <a
                        href={manualOsmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-4 py-2 text-xs font-bold"
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
                      onSelect={(d) => setSelectedDoctor(d)}
                      onDirections={handleDirections}
                      routeActive={activeRouteId === doc.place_id}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {viewMode !== 'list' && (
          <div
            className={`${
              viewMode === 'split' ? 'lg:col-span-7 h-[380px] lg:h-[650px]' : 'lg:col-span-12 h-[480px] lg:h-[660px]'
            } w-full lg:sticky lg:top-20`}
          >
            <HealthcareLeafletMap
              coords={coords}
              locationLabel={locationLabel}
              items={filteredDoctors}
              selectedItem={selectedDoctor}
              onSelectItem={(d) => setSelectedDoctor(d)}
              routeCoordinates={routeCoordinates}
              routeInfo={routeInfo}
              onClearRoute={clearRoute}
              loading={loading || routeLoading}
              accentColor="indigo"
              markerEmoji="🏥"
              emptyLocationText="Grant location access or search a city / PIN code to view nearby healthcare facilities on OpenStreetMap."
            />
          </div>
        )}
      </div>
    </div>
  );
}
