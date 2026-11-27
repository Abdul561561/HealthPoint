import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Heart,
  LocateFixed,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  Trash2,
  X,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../hooks/useAuth';
import { addToast } from '../redux/slices/uiSlice';
import { loadNotifications } from '../redux/slices/notificationSlice';
import { searchAddress, searchNearbyHospitals } from '../services/openMapsApi';
import {
  activateEmergencySos,
  cancelEmergencySos,
  createEmergencyContact,
  deleteEmergencyContact,
  fetchEmergencyConfig,
  fetchEmergencyContacts,
  fetchEmergencyHistory,
  stopSosLocationSharing,
  updateEmergencyContact,
} from '../services/emergencyApi';

const STATUS_BADGE = {
  Delivered: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Sent: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  Pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Failed: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  'Manual Fallback Required': 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
};

export default function Emergency() {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const uploadedPrescription = useSelector((s) => s.pharmacy?.uploadedPrescription);

  const [config, setConfig] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Location state (explicit permission or manual entry — never hardcoded)
  const [locationInfo, setLocationInfo] = useState({
    lat: null,
    lng: null,
    accuracy: null,
    source: 'unavailable', // gps | manual | unavailable
    label: '',
    capturedAt: null,
    sharingStopped: false,
  });
  const [locating, setLocating] = useState(false);
  const [manualArea, setManualArea] = useState('');

  // Nearby hospitals (OSM)
  const [hospitals, setHospitals] = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalsError, setHospitalsError] = useState('');
  const mapRef = useRef(null);
  const leafletMap = useRef(null);

  // SOS confirmation & active event state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const [sendEmailFallback, setSendEmailFallback] = useState(true);
  const [sosNotes, setSosNotes] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  const [cName, setCName] = useState('');
  const [cRelation, setCRelation] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPriority, setCPriority] = useState(1);
  const [cPrimary, setCPrimary] = useState(false);
  const [contactError, setContactError] = useState('');

  const loadEmergencyState = useCallback(async () => {
    try {
      const [cfg, cts, hist] = await Promise.all([
        fetchEmergencyConfig(),
        fetchEmergencyContacts(),
        fetchEmergencyHistory(),
      ]);
      setConfig(cfg);
      setContacts(Array.isArray(cts) ? cts : []);
      const histList = Array.isArray(hist) ? hist : [];
      setHistory(histList);
      const currentActive = histList.find((ev) => ev.status === 'active');
      if (currentActive) setActiveEvent(currentActive);
    } catch {
      dispatch(addToast({ title: 'Emergency Data Error', message: 'Failed to load emergency contacts or history.', type: 'error' }));
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const captureBrowserGps = useCallback(() => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocationInfo((prev) => ({ ...prev, source: prev.lat ? prev.source : 'unavailable' }));
        resolve(null);
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
            source: 'gps',
            label: 'Browser GPS Signal',
            capturedAt: new Date().toISOString(),
            sharingStopped: false,
          };
          setLocationInfo(next);
          setLocating(false);
          resolve(next);
        },
        () => {
          setLocationInfo((prev) => ({
            ...prev,
            source: prev.lat ? prev.source : 'unavailable',
          }));
          setLocating(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 9000 }
      );
    });
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadEmergencyState();
      captureBrowserGps();
    });
  }, [loadEmergencyState, captureBrowserGps]);

  const handleManualLocationSearch = async (e) => {
    e.preventDefault();
    if (!manualArea.trim()) return;
    setLocating(true);
    setHospitalsError('');
    try {
      const results = await searchAddress(manualArea.trim());
      if (results?.length) {
        const top = results[0];
        setLocationInfo({
          lat: top.lat,
          lng: top.lng,
          accuracy: null,
          source: 'manual',
          label: `Manually Provided: ${top.display_name}`,
          capturedAt: new Date().toISOString(),
          sharingStopped: false,
        });
      } else {
        setHospitalsError('Could not locate that city, locality, or PIN code via OpenStreetMap Nominatim.');
      }
    } catch {
      setHospitalsError('Unable to resolve manual location right now.');
    } finally {
      setLocating(false);
    }
  };

  // Load nearby OSM hospitals when coordinates are active
  useEffect(() => {
    if (!locationInfo.lat || !locationInfo.lng || locationInfo.sharingStopped) return undefined;
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setHospitalsLoading(true);
      setHospitalsError('');
      try {
        const list = await searchNearbyHospitals(locationInfo.lat, locationInfo.lng, 8000);
        if (active) setHospitals(list.slice(0, 6));
      } catch (err) {
        if (active) {
          setHospitals([]);
          setHospitalsError(err.message || 'Unable to load nearby hospitals from OpenStreetMap.');
        }
      } finally {
        if (active) setHospitalsLoading(false);
      }
    });
    return () => { active = false; };
  }, [locationInfo.lat, locationInfo.lng, locationInfo.sharingStopped]);

  // Render Leaflet OpenStreetMap view
  useEffect(() => {
    const L = window.L;
    if (!locationInfo.lat || !locationInfo.lng || locationInfo.sharingStopped || !mapRef.current || !L) return;

    if (leafletMap.current) {
      leafletMap.current.remove();
    }
    leafletMap.current = L.map(mapRef.current).setView([locationInfo.lat, locationInfo.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(leafletMap.current);

    const originIcon = L.divIcon({
      html: `<div class="relative w-6 h-6 flex items-center justify-center"><div class="absolute w-4 h-4 bg-rose-500 rounded-full border-2 border-white shadow-lg animate-ping"></div><div class="w-3.5 h-3.5 bg-rose-600 rounded-full border-2 border-white shadow-md"></div></div>`,
      className: 'custom-sos-pin',
    });
    L.marker([locationInfo.lat, locationInfo.lng], { icon: originIcon })
      .addTo(leafletMap.current)
      .bindPopup(
        `<b>${locationInfo.source === 'manual' ? 'Manually Provided Location' : 'Current GPS Location'}</b><br/><span class="text-xs">${locationInfo.lat.toFixed(5)}, ${locationInfo.lng.toFixed(5)}</span>`
      )
      .openPopup();

    hospitals.forEach((hosp) => {
      if (hosp.latitude && hosp.longitude) {
        L.marker([hosp.latitude, hosp.longitude])
          .addTo(leafletMap.current)
          .bindPopup(`<strong>${hosp.name}</strong><br/><span class="text-xs">${hosp.distance}</span>`);
      }
    });

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, [locationInfo, hospitals]);

  const handleConfirmSos = async () => {
    setSosSubmitting(true);
    try {
      // Refresh GPS right before activation if browser supports it and user has not entered manual location
      let latestLoc = locationInfo;
      if (locationInfo.source !== 'manual') {
        const fresh = await captureBrowserGps();
        if (fresh) latestLoc = fresh;
      }

      const payload = {
        latitude: latestLoc.sharingStopped ? null : latestLoc.lat,
        longitude: latestLoc.sharingStopped ? null : latestLoc.lng,
        accuracy_meters: latestLoc.accuracy,
        location_source: latestLoc.lat && !latestLoc.sharingStopped ? latestLoc.source : 'unavailable',
        location_label: latestLoc.label || undefined,
        captured_at: latestLoc.capturedAt || new Date().toISOString(),
        idempotency_key: `sos_${Date.now()}`,
        send_email_fallback: sendEmailFallback,
        notes: sosNotes.trim() || undefined,
      };
      const event = await activateEmergencySos(payload);
      setActiveEvent(event);
      setHistory((prev) => [event, ...prev]);
      setConfirmOpen(false);
      setSosNotes('');
      dispatch(loadNotifications());
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
        try {
          new window.Notification('Emergency SOS Activated', {
            body: `Alert recorded for ${user?.name || 'your account'}. Review contact delivery status.`,
            tag: `sos_${event.id}`,
          });
        } catch {
          // Non-fatal browser notification error
        }
      }
      dispatch(addToast({ title: 'SOS Activated', message: 'Emergency event logged. Review delivery statuses below.', type: 'success' }));
    } catch (err) {
      const msg = err.response?.data?.detail || 'Unable to activate SOS right now. Dial 112 directly.';
      dispatch(addToast({ title: 'SOS Error', message: String(msg), type: 'error' }));
      setConfirmOpen(false);
    } finally {
      setSosSubmitting(false);
    }
  };

  const handleCancelActiveSos = async (eventId) => {
    try {
      const updated = await cancelEmergencySos(eventId, 'User confirmed safe / cancelled');
      setActiveEvent(null);
      setHistory((prev) => prev.map((ev) => (ev.id === eventId ? updated : ev)));
      dispatch(loadNotifications());
      dispatch(addToast({ title: 'SOS Cancelled', message: 'Emergency alert marked cancelled and location sharing stopped.' }));
    } catch {
      dispatch(addToast({ title: 'Cancel Failed', message: 'Could not cancel emergency alert.', type: 'error' }));
    }
  };

  const handleStopSharing = async () => {
    setLocationInfo((prev) => ({ ...prev, sharingStopped: true }));
    if (activeEvent?.id && activeEvent.location_sharing_active) {
      try {
        const updated = await stopSosLocationSharing(activeEvent.id);
        setActiveEvent(updated);
        setHistory((prev) => prev.map((ev) => (ev.id === updated.id ? updated : ev)));
      } catch {
        // Local sharing already stopped
      }
    }
    dispatch(addToast({ title: 'Location Sharing Stopped', message: 'Live location display paused.' }));
  };

  const openAddContact = () => {
    setEditingContactId(null);
    setCName('');
    setCRelation('');
    setCPhone('');
    setCEmail('');
    setCPriority(contacts.length + 1);
    setCPrimary(contacts.length === 0);
    setContactError('');
    setContactModalOpen(true);
  };

  const openEditContact = (ct) => {
    setEditingContactId(ct.id);
    setCName(ct.name);
    setCRelation(ct.relation);
    setCPhone(ct.phone);
    setCEmail(ct.email || '');
    setCPriority(ct.priority || 1);
    setCPrimary(Boolean(ct.is_primary));
    setContactError('');
    setContactModalOpen(true);
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    setContactError('');
    const payload = {
      name: cName.trim(),
      relation: cRelation.trim(),
      phone: cPhone.trim(),
      email: cEmail.trim() || undefined,
      priority: Number(cPriority) || 1,
      is_primary: cPrimary,
    };
    try {
      if (editingContactId) {
        await updateEmergencyContact(editingContactId, payload);
      } else {
        await createEmergencyContact(payload);
      }
      setContactModalOpen(false);
      await loadEmergencyState();
      dispatch(addToast({ title: 'Contact Saved', message: `${payload.name} updated in your emergency list.` }));
    } catch (err) {
      const detail = err.response?.data?.detail;
      setContactError(Array.isArray(detail) ? detail.map((d) => d.msg).join('; ') : detail || 'Invalid contact details.');
    }
  };

  const handleRemoveContact = async (id) => {
    try {
      await deleteEmergencyContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      dispatch(addToast({ title: 'Contact Removed', message: 'Emergency contact deleted.' }));
    } catch {
      dispatch(addToast({ title: 'Delete Failed', message: 'Could not delete contact.', type: 'error' }));
    }
  };

  const handleShareLocationNative = async () => {
    const mapsLink = locationInfo.lat && locationInfo.lng
      ? `https://www.google.com/maps?q=${locationInfo.lat.toFixed(6)},${locationInfo.lng.toFixed(6)}`
      : null;
    const text = `EMERGENCY LOCATION: ${user?.name || 'HealthPoint User'} — ${mapsLink || locationInfo.label || 'Location unavailable'}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HealthPoint Emergency Location', text, url: mapsLink || undefined });
        return;
      } catch {
        // Fallback to copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      dispatch(addToast({ title: 'Location Copied', message: 'Emergency location text copied to clipboard.' }));
    } catch {
      dispatch(addToast({ title: 'Copy Unavailable', message: text }));
    }
  };

  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0] || null;
  const activeMapsUrl = activeEvent?.maps_url || (locationInfo.lat && locationInfo.lng ? `https://www.google.com/maps?q=${locationInfo.lat.toFixed(6)},${locationInfo.lng.toFixed(6)}` : null);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header + Immediate Direct Call Bar (112 India + Primary Contact) */}
      <div className="glass-card p-5 border-2 border-rose-500/25 bg-rose-500/[0.03] dark:bg-rose-950/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            Emergency SOS Command
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            Immediate 112 calling, confirmed SOS alert broadcast, real contact delivery status, and OpenStreetMap location sharing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <a
            href="tel:112"
            className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-rose-500/30 active:scale-95 transition-all"
          >
            <PhoneCall className="w-4 h-4" /> Call 112 (India)
          </a>
          <a
            href="tel:108"
            className="px-4 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm flex items-center gap-2 active:scale-95 transition-all"
          >
            <Phone className="w-4 h-4" /> Ambulance 108
          </a>
          {primaryContact && (
            <a
              href={`tel:${primaryContact.phone}`}
              className="px-4 py-3 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-white dark:bg-dark-100 text-rose-700 dark:text-rose-300 font-bold text-sm flex items-center gap-2"
            >
              <Phone className="w-4 h-4" /> Call {primaryContact.name}
            </a>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: SOS Trigger / Active Alert + Delivery Statuses + Location & OSM Map */}
        <div className="lg:col-span-2 space-y-6">
          {/* SOS Trigger / Active SOS Box */}
          <div className="glass-card p-6 text-center space-y-5 border border-rose-500/25">
            {!activeEvent ? (
              <div className="flex flex-col items-center space-y-4 py-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="w-48 h-48 rounded-full bg-gradient-to-br from-rose-500 via-rose-600 to-red-700 text-white font-black text-xl shadow-2xl shadow-rose-500/40 hover:scale-[1.03] active:scale-95 transition-all border-4 border-rose-300/30 flex flex-col items-center justify-center gap-1.5"
                >
                  <ShieldAlert className="w-11 h-11" />
                  <span>ACTIVATE SOS</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-rose-100">Confirmation Required</span>
                </button>
                <div className="max-w-md space-y-1.5">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Pressing Activate SOS asks for explicit confirmation, captures your current GPS coordinates, records the emergency event, and prepares/sends alerts to your {contacts.length} configured contact(s).
                  </p>
                  {config && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Backend SMS Provider:{' '}
                      <strong>{config.sms_configured ? config.sms_provider.toUpperCase() : 'Not configured (Mobile SMS fallback ready)'}</strong>
                      {' · '}Email Fallback:{' '}
                      <strong>{config.email_fallback_configured ? 'Available' : 'Not configured'}</strong>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-left space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rose-200 dark:border-rose-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-base text-rose-600 dark:text-rose-400">
                        Active Emergency Alert #{activeEvent.id.slice(-6)}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Activated: {activeEvent.date} · Location source: {activeEvent.location_source}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeEvent.location_sharing_active && (
                      <button
                        type="button"
                        onClick={handleStopSharing}
                        className="btn-secondary py-1.5 px-3 text-xs text-amber-700 dark:text-amber-300"
                      >
                        <StopCircle className="w-3.5 h-3.5" /> Stop Sharing
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCancelActiveSos(activeEvent.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel SOS (I Am Safe)
                    </button>
                  </div>
                </div>

                {/* Alert Message & Copy / Google Maps Link */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-dark-100 border border-slate-200 dark:border-white/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Emergency Message</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(activeEvent.alert_message);
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        }}
                        className="text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1"
                      >
                        {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId ? 'Copied' : 'Copy Text'}
                      </button>
                      {activeMapsUrl && (
                        <a href={activeMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <ExternalLink className="w-3.5 h-3.5" /> Google Maps Link
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed font-medium">
                    {activeEvent.alert_message}
                  </p>
                </div>

                {/* Honest Per-Contact Delivery Statuses */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Contact Delivery Status
                  </h4>
                  {(activeEvent.delivery_results || []).length === 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      No emergency contacts were configured. Add contacts on the right and share manually or dial 112.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeEvent.delivery_results.map((res, idx) => (
                        <div key={`${res.phone}_${idx}`} className="p-3 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="space-y-0.5 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">{res.name}</span>
                              <span className="text-slate-500 dark:text-slate-400">({res.phone})</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGE[res.sms_status] || STATUS_BADGE.Pending}`}>
                                SMS: {res.sms_status}
                              </span>
                              {res.email_status && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGE[res.email_status] || STATUS_BADGE.Pending}`}>
                                  Email: {res.email_status}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{res.sms_detail}</p>
                            {res.email_detail && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{res.email_detail}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {res.sms_composer_url && (
                              <a
                                href={res.sms_composer_url}
                                className="btn-primary py-1.5 px-3 text-xs"
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> Send SMS
                              </a>
                            )}
                            <a href={`tel:${res.phone}`} className="btn-secondary py-1.5 px-2.5 text-xs">
                              <Phone className="w-3.5 h-3.5" /> Call
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Emergency Location Sharing + OpenStreetMap */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500" /> Emergency Location Sharing
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {locationInfo.sharingStopped
                    ? 'Location sharing paused by user.'
                    : locationInfo.lat
                    ? `${locationInfo.source === 'manual' ? 'Manually Provided' : 'GPS Active'} · ${locationInfo.lat.toFixed(5)}, ${locationInfo.lng.toFixed(5)}${locationInfo.accuracy ? ` (±${locationInfo.accuracy} m)` : ''} · ${locationInfo.capturedAt ? new Date(locationInfo.capturedAt).toLocaleTimeString() : ''}`
                    : 'GPS location not yet available. Enable GPS or enter your area below.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={captureBrowserGps} disabled={locating} className="btn-secondary py-1.5 px-3 text-xs">
                  <LocateFixed className="w-3.5 h-3.5" /> {locating ? 'Locating...' : 'Refresh GPS'}
                </button>
                {locationInfo.lat && !locationInfo.sharingStopped && (
                  <>
                    <button type="button" onClick={handleShareLocationNative} className="btn-secondary py-1.5 px-3 text-xs">
                      <Share2 className="w-3.5 h-3.5" /> Share Link
                    </button>
                    <button type="button" onClick={handleStopSharing} className="btn-secondary py-1.5 px-3 text-xs text-amber-600 dark:text-amber-300">
                      <StopCircle className="w-3.5 h-3.5" /> Stop Sharing
                    </button>
                  </>
                )}
              </div>
            </div>

            <form onSubmit={handleManualLocationSearch} className="flex gap-2">
              <input
                type="text"
                value={manualArea}
                onChange={(e) => setManualArea(e.target.value)}
                placeholder="GPS denied? Enter city, street, or PIN code (tagged as Manually Provided)..."
                className="input-field py-2 text-xs flex-1"
              />
              <button type="submit" disabled={locating} className="btn-primary py-2 px-3.5 text-xs">
                Set Location
              </button>
            </form>

            {locationInfo.lat && !locationInfo.sharingStopped && (
              <div className="h-64 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
                <div ref={mapRef} className="w-full h-full z-10" />
              </div>
            )}

            {/* Nearest OSM Hospitals */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Nearby Hospitals (OpenStreetMap)
              </h4>
              {hospitalsLoading ? (
                <p className="text-xs text-slate-500">Searching OpenStreetMap hospitals...</p>
              ) : hospitalsError ? (
                <p className="text-xs text-amber-600 dark:text-amber-300">{hospitalsError}</p>
              ) : hospitals.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {locationInfo.lat ? 'No nearby hospitals returned in OpenStreetMap for this radius.' : 'Grant GPS or set a manual location to find nearby hospitals.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {hospitals.map((h) => (
                    <div key={h.id || h.name} className="p-3 rounded-xl border border-slate-200 dark:border-white/10 space-y-1.5 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white line-clamp-1">{h.name}</span>
                        <span className="text-rose-600 dark:text-rose-400 font-bold flex-shrink-0">{h.distance}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{h.address}</p>
                      <div className="flex gap-2 pt-1">
                        {h.phone && (
                          <a href={`tel:${h.phone}`} className="btn-secondary py-1 px-2.5 text-[11px]">
                            <Phone className="w-3 h-3" /> Call
                          </a>
                        )}
                        {h.directions_url && (
                          <a href={h.directions_url} target="_blank" rel="noopener noreferrer" className="btn-secondary py-1 px-2.5 text-[11px]">
                            <Navigation className="w-3 h-3" /> Directions
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Emergency Event History */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-500" /> Emergency Event History
              </h3>
              <button type="button" onClick={loadEmergencyState} className="text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
            {loading ? (
              <p className="text-xs text-slate-500">Loading emergency history...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No SOS activations recorded for your account.</p>
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-white/10">
                {history.slice(0, 10).map((ev) => (
                  <div key={ev.id} className="py-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{ev.date}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          ev.status === 'active'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {ev.status}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Source: {ev.location_source}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ev.maps_url && (
                          <a href={ev.maps_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
                            Map Link
                          </a>
                        )}
                        {ev.status === 'active' && (
                          <button type="button" onClick={() => handleCancelActiveSos(ev.id)} className="text-rose-600 dark:text-rose-400 font-bold hover:underline">
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    {ev.delivery_results?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ev.delivery_results.map((dr, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_BADGE[dr.sms_status] || STATUS_BADGE.Pending}`}>
                            {dr.name}: {dr.sms_status}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Emergency Contacts Management + Medical Profile Summary */}
        <div className="space-y-6">
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Emergency Contacts</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Persisted per user in MongoDB</p>
              </div>
              <button type="button" onClick={openAddContact} className="btn-primary py-1.5 px-3 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-white/15 space-y-2">
                <Phone className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">No emergency contacts yet</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Add family or trusted contacts so SOS can alert them immediately.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {contacts.map((ct) => (
                  <div key={ct.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">{ct.name}</span>
                          {ct.is_primary && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-300">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ct.relation} · Priority #{ct.priority}
                        </p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{ct.phone}</p>
                        {ct.email && <p className="text-[11px] text-slate-500 dark:text-slate-400">{ct.email}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditContact(ct)} className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:text-slate-300" title="Edit contact">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleRemoveContact(ct.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500" title="Delete contact">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={`tel:${ct.phone}`} className="btn-secondary flex-1 py-1.5 text-xs">
                        <Phone className="w-3.5 h-3.5" /> Call
                      </a>
                      <a
                        href={`sms:${ct.phone}?body=${encodeURIComponent(
                          `EMERGENCY ALERT from ${user?.name || 'HealthPoint User'}: Need urgent help.${activeMapsUrl ? ` Location: ${activeMapsUrl}` : ''}`
                        )}`}
                        className="btn-secondary flex-1 py-1.5 text-xs"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> SMS
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clinical Emergency Card */}
          <div className="glass-card p-5 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500" /> Medical Responder Summary
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Patient Name</span>
                <strong className="text-slate-900 dark:text-white">{user?.name || 'Not set'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Blood Group</span>
                <strong className="text-rose-600 dark:text-rose-400">{user?.bloodGroup || 'Not recorded'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Allergies</span>
                <strong className="text-slate-900 dark:text-white">{user?.allergies || 'None reported'}</strong>
              </div>
              {uploadedPrescription?.analysis?.medicines?.length > 0 && (
                <div className="pt-2 border-t border-slate-200/70 dark:border-white/10">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Active Prescription Medicines</span>
                  <div className="flex flex-wrap gap-1">
                    {uploadedPrescription.analysis.medicines.slice(0, 6).map((m, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[11px] text-slate-700 dark:text-slate-200">
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Explicit SOS Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4 border-2 border-rose-500/40">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">Confirm Emergency SOS</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Preventing accidental activation — review details before sending.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 text-xs space-y-1 text-slate-700 dark:text-slate-200">
              <div>
                <strong>Location:</strong>{' '}
                {locationInfo.lat ? `${locationInfo.lat.toFixed(5)}, ${locationInfo.lng.toFixed(5)} (${locationInfo.source})` : 'Will request GPS on confirm (or mark unavailable)'}
              </div>
              <div>
                <strong>Contacts to alert:</strong> {contacts.length} configured contact(s)
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={sendEmailFallback}
                onChange={(e) => setSendEmailFallback(e.target.checked)}
              />
              Also send email fallback to contacts with email addresses
            </label>

            <input
              type="text"
              value={sosNotes}
              onChange={(e) => setSosNotes(e.target.value)}
              placeholder="Optional situation note (e.g. Chest tightness / Accident)..."
              className="input-field text-xs"
            />

            <div className="flex gap-2.5 pt-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="btn-secondary flex-1 py-2.5 text-xs">
                Cancel
              </button>
              <button
                type="button"
                disabled={sosSubmitting}
                onClick={handleConfirmSos}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                {sosSubmitting ? 'Activating SOS...' : 'Confirm & Activate SOS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingContactId ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
              </h3>
              <button onClick={() => setContactModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {contactError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {contactError}
              </div>
            )}
            <form onSubmit={handleSaveContact} className="space-y-3">
              <input type="text" required value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Contact Name" className="input-field text-xs" />
              <div className="grid grid-cols-2 gap-2.5">
                <input type="text" required value={cRelation} onChange={(e) => setCRelation(e.target.value)} placeholder="Relationship (e.g. Parent)" className="input-field text-xs" />
                <input type="number" min="1" max="20" value={cPriority} onChange={(e) => setCPriority(e.target.value)} placeholder="Priority (1=top)" className="input-field text-xs" />
              </div>
              <input type="tel" required value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Phone (e.g. 9876543210 or +919876543210)" className="input-field text-xs" />
              <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Email (optional fallback alert)" className="input-field text-xs" />
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={cPrimary} onChange={(e) => setCPrimary(e.target.checked)} />
                Set as Primary Emergency Contact
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setContactModalOpen(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
                <button type="submit" className="btn-primary py-2 px-4 text-xs">Save Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
