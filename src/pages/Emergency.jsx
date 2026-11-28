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
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Share2,
  ShieldAlert,
  StopCircle,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../hooks/useAuth';
import { addToast } from '../redux/slices/uiSlice';
import { loadNotifications } from '../redux/slices/notificationSlice';
import { searchAddress, searchNearbyHospitals } from '../services/openMapsApi';
import { extractMapsErrorMessage } from '../services/mapsApi';
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
  'Not Configured': 'bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-white/15',
};

const PENDING_SOS_STORAGE_KEY = 'hp-pending-sos-v1';

function readStoredPendingSos() {
  try {
    const raw = localStorage.getItem(PENDING_SOS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Emergency() {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const uploadedPrescription = useSelector((s) => s.pharmacy?.uploadedPrescription);

  const [config, setConfig] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // One-time SOS location state (explicit browser GPS or user-entered manual area — never hardcoded)
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
  const [gpsDeniedNotice, setGpsDeniedNotice] = useState(false);
  const [manualArea, setManualArea] = useState('');
  const [manualError, setManualError] = useState('');

  // Nearby hospitals (OpenStreetMap)
  const [hospitals, setHospitals] = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalsError, setHospitalsError] = useState('');
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const manualInputRef = useRef(null);

  // One-tap SOS activation state
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [sosStatusBanner, setSosStatusBanner] = useState('');
  const [activeEvent, setActiveEvent] = useState(null);
  const [pendingOfflineSos, setPendingOfflineSos] = useState(readStoredPendingSos);
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
        setGpsDeniedNotice(true);
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
            label: 'Current GPS Signal',
            capturedAt: new Date().toISOString(),
            sharingStopped: false,
          };
          setLocationInfo(next);
          setGpsDeniedNotice(false);
          setLocating(false);
          resolve(next);
        },
        () => {
          setGpsDeniedNotice(true);
          setLocationInfo((prev) => ({
            ...prev,
            source: prev.lat ? prev.source : 'unavailable',
          }));
          setLocating(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadEmergencyState();
      captureBrowserGps();
    }, 0);
    return () => clearTimeout(t);
  }, [loadEmergencyState, captureBrowserGps]);

  const handleManualLocationSearch = async (e) => {
    e.preventDefault();
    if (!manualArea.trim()) return;
    setLocating(true);
    setManualError('');
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
        setGpsDeniedNotice(false);
        dispatch(addToast({ title: 'Manual Location Set', message: `Using manually provided location: ${top.display_name}`, type: 'success' }));
      } else {
        setManualError('Could not resolve that city, street, or 6-digit PIN code via OpenStreetMap Nominatim.');
      }
    } catch (err) {
      setManualError(extractMapsErrorMessage(err, 'Unable to resolve manual location right now.'));
    } finally {
      setLocating(false);
    }
  };

  // Load nearby OSM hospitals when coordinates are active
  useEffect(() => {
    if (!locationInfo.lat || !locationInfo.lng || locationInfo.sharingStopped) return undefined;
    let active = true;
    const t = setTimeout(async () => {
      if (!active) return;
      setHospitalsLoading(true);
      setHospitalsError('');
      try {
        const list = await searchNearbyHospitals(locationInfo.lat, locationInfo.lng, 8000);
        if (active) setHospitals(list.slice(0, 6));
      } catch (err) {
        if (active) {
          setHospitals([]);
          setHospitalsError(extractMapsErrorMessage(err, 'Unable to load nearby hospitals from OpenStreetMap.'));
        }
      } finally {
        if (active) setHospitalsLoading(false);
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
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

  const dispatchSosPayload = useCallback(
    async (payload) => {
      const event = await activateEmergencySos(payload);
      try {
        localStorage.removeItem(PENDING_SOS_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      setPendingOfflineSos(null);
      setActiveEvent(event);
      setHistory((prev) => [event, ...prev.filter((ev) => ev.id !== event.id)]);
      setSosNotes('');
      dispatch(loadNotifications());
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
        try {
          new window.Notification('Emergency SOS Activated', {
            body: `Alert recorded for ${user?.name || 'your account'}. Review per-contact delivery status.`,
            tag: `sos_${event.id}`,
          });
        } catch {
          // Ignore browser notification failure
        }
      }
      return event;
    },
    [dispatch, user]
  );

  // Phase 5A: TRUE ONE-TAP SOS ACTIVATION — no confirmation modal blocking urgent help
  const handleOneTapActivateSos = async () => {
    if (sosSubmitting) return;
    setSosSubmitting(true);
    setSosStatusBanner('SOS activation started — capturing live GPS location and timestamp...');

    let latestLoc = locationInfo;
    if (locationInfo.source !== 'manual') {
      const fresh = await captureBrowserGps();
      if (fresh) {
        latestLoc = fresh;
      } else if (!latestLoc.lat) {
        setGpsDeniedNotice(true);
      }
    }

    const capturedIso = latestLoc.capturedAt || new Date().toISOString();
    const hasCoords = Boolean(latestLoc.lat && latestLoc.lng && !latestLoc.sharingStopped);
    const payload = {
      latitude: hasCoords ? latestLoc.lat : null,
      longitude: hasCoords ? latestLoc.lng : null,
      accuracy_meters: hasCoords ? latestLoc.accuracy : null,
      location_source: hasCoords ? latestLoc.source : 'unavailable',
      location_label: latestLoc.label || undefined,
      captured_at: capturedIso,
      idempotency_key: `sos_${Date.now()}`,
      send_email_fallback: sendEmailFallback,
      notes: sosNotes.trim() || undefined,
    };

    setSosStatusBanner(
      `SOS persisted check & notifying ${contacts.length} configured emergency contact(s)...`
    );

    try {
      const event = await dispatchSosPayload(payload);
      const sentAny = (event.delivery_results || []).some(
        (r) => r.sms_status === 'Sent' || r.sms_status === 'Delivered' || r.email_status === 'Sent'
      );
      dispatch(
        addToast({
          title: 'Emergency SOS Activated',
          message: sentAny
            ? 'SOS recorded and automated alerts dispatched. Check per-contact statuses below.'
            : 'SOS recorded. Review manual SMS / call / email options below.',
          type: sentAny ? 'success' : 'warning',
        })
      );
      if (!hasCoords) {
        setTimeout(() => manualInputRef.current?.focus(), 200);
      }
    } catch (err) {
      if (!err.response) {
        // Network unavailable — preserve locally honestly as Pending/Failed (NEVER fake Sent)
        const mapsLink = hasCoords
          ? `https://www.google.com/maps?q=${latestLoc.lat.toFixed(6)},${latestLoc.lng.toFixed(6)}`
          : null;
        const offlineRecord = {
          payload,
          saved_at: new Date().toISOString(),
          maps_url: mapsLink,
          delivery_state: 'Pending / Network Failed',
        };
        try {
          localStorage.setItem(PENDING_SOS_STORAGE_KEY, JSON.stringify(offlineRecord));
        } catch {
          // Ignore storage error
        }
        setPendingOfflineSos(offlineRecord);
        dispatch(
          addToast({
            title: 'Network Unavailable — SOS Saved Locally',
            message: 'Delivery failed offline. Use Call 112 or native SMS below, or retry once online.',
            type: 'error',
          })
        );
      } else {
        const msg = err.response?.data?.detail || 'Unable to activate SOS right now. Dial 112 directly.';
        dispatch(addToast({ title: 'SOS Error', message: String(msg), type: 'error' }));
      }
    } finally {
      setSosSubmitting(false);
      setSosStatusBanner('');
    }
  };

  const handleRetryOfflineSos = async () => {
    if (!pendingOfflineSos?.payload || sosSubmitting) return;
    setSosSubmitting(true);
    setSosStatusBanner('Retrying preserved SOS alert delivery...');
    try {
      await dispatchSosPayload({
        ...pendingOfflineSos.payload,
        idempotency_key: `sos_retry_${Date.now()}`,
      });
      dispatch(addToast({ title: 'SOS Delivered', message: 'Preserved offline SOS synced and dispatched.', type: 'success' }));
    } catch (err) {
      const msg = err.response?.data?.detail || 'Still unable to reach backend. Use Call 112 or mobile SMS.';
      dispatch(addToast({ title: 'Retry Failed', message: String(msg), type: 'error' }));
    } finally {
      setSosSubmitting(false);
      setSosStatusBanner('');
    }
  };

  const handleCancelActiveSos = async (eventId) => {
    try {
      const updated = await cancelEmergencySos(eventId, 'User confirmed safe / resolved');
      setActiveEvent(null);
      setHistory((prev) => prev.map((ev) => (ev.id === eventId ? updated : ev)));
      dispatch(loadNotifications());
      dispatch(addToast({ title: 'SOS Resolved & Cancelled', message: 'Emergency alert closed and active location sharing stopped.' }));
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
    dispatch(addToast({ title: 'Location Sharing Stopped', message: 'Location sharing has been stopped.' }));
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
    const mapsLink =
      activeEvent?.maps_url ||
      (locationInfo.lat && locationInfo.lng
        ? `https://www.google.com/maps?q=${locationInfo.lat.toFixed(6)},${locationInfo.lng.toFixed(6)}`
        : null);
    const text = `EMERGENCY LOCATION: ${user?.name || 'HealthPoint User'} — ${mapsLink || locationInfo.label || 'Location unavailable'}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HealthPoint Emergency Location', text, url: mapsLink || undefined });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      dispatch(addToast({ title: 'Location Copied', message: 'Emergency location link copied to clipboard.' }));
    } catch {
      dispatch(addToast({ title: 'Location Ready', message: text }));
    }
  };

  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0] || null;
  const activeMapsUrl =
    activeEvent?.maps_url ||
    (locationInfo.lat && locationInfo.lng && !locationInfo.sharingStopped
      ? `https://www.google.com/maps?q=${locationInfo.lat.toFixed(6)},${locationInfo.lng.toFixed(6)}`
      : null);

  // Determine honest automated delivery outcome for active SOS banner
  const activeDeliveries = activeEvent?.delivery_results || [];
  const automatedSuccessCount = activeDeliveries.filter(
    (r) => r.sms_status === 'Sent' || r.sms_status === 'Delivered' || r.email_status === 'Sent'
  ).length;
  const allAutomatedFailed =
    Boolean(activeEvent) && activeDeliveries.length > 0 && automatedSuccessCount === 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header + Explicit Emergency Call Actions */}
      <div className="glass-card p-5 border-2 border-rose-500/25 bg-rose-500/[0.03] dark:bg-rose-950/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4 !transform-none">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            Emergency SOS Command
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
            One-tap SOS alert immediately captures GPS, logs the emergency, notifies contacts via SMS/Email fallback, and prepares native SMS actions.
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
              className="btn-secondary px-4 py-3 text-sm font-bold border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300"
            >
              <Phone className="w-4 h-4" /> Call {primaryContact.name}
            </a>
          )}
        </div>
      </div>

      {/* Offline Preserved Event Banner */}
      {pendingOfflineSos && (
        <div className="glass-card p-4 border-2 border-rose-500/50 bg-rose-50/90 dark:bg-rose-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 !transform-none">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-black text-rose-700 dark:text-rose-300">
                Network Unavailable — SOS Event Preserved Locally ({pendingOfflineSos.delivery_state})
              </p>
              <p className="text-slate-700 dark:text-slate-200">
                Your emergency alert was NOT delivered automatically because the network is offline. Call 112 directly, use native SMS buttons below, or retry delivery once reconnected.
              </p>
              {pendingOfflineSos.maps_url && (
                <a
                  href={pendingOfflineSos.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Preserved Google Maps Link
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button type="button" onClick={handleRetryOfflineSos} disabled={sosSubmitting} className="btn-primary py-2 px-3.5 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${sosSubmitting ? 'animate-spin' : ''}`} /> Retry Delivery
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(PENDING_SOS_STORAGE_KEY);
                setPendingOfflineSos(null);
              }}
              className="btn-secondary py-2 px-3 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* One-Tap SOS Hero Card / Active SOS Alert Card */}
          <div className="glass-card p-6 text-center space-y-5 border border-rose-500/25 !transform-none">
            {!activeEvent ? (
              <div className="flex flex-col items-center space-y-4 py-2">
                {sosSubmitting && (
                  <div className="w-full p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-bold text-rose-700 dark:text-rose-200 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{sosStatusBanner || 'SOS activation in progress — capturing GPS & sending alerts...'}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={sosSubmitting}
                  onClick={handleOneTapActivateSos}
                  className="w-48 h-48 rounded-full bg-gradient-to-br from-rose-500 via-rose-600 to-red-700 text-white font-black text-xl shadow-2xl shadow-rose-500/40 hover:scale-[1.03] active:scale-95 transition-all border-4 border-rose-300/30 flex flex-col items-center justify-center gap-1.5 disabled:opacity-75"
                >
                  <ShieldAlert className={`w-11 h-11 ${sosSubmitting ? 'animate-pulse' : ''}`} />
                  <span>{sosSubmitting ? 'ACTIVATING...' : 'ACTIVATE SOS'}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-rose-100">
                    One-Tap Immediate Alert
                  </span>
                </button>

                <div className="w-full max-w-lg space-y-3 text-left bg-slate-50/90 dark:bg-white/5 p-4 rounded-2xl border border-slate-200/80 dark:border-white/10">
                  <p className="text-xs text-slate-600 dark:text-slate-300 text-center">
                    Tapping <strong>ACTIVATE SOS</strong> immediately captures GPS location, logs the emergency in MongoDB, and sends alerts to all{' '}
                    <strong>{contacts.length}</strong> configured contact(s).
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendEmailFallback}
                        onChange={(e) => setSendEmailFallback(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Send SMTP email alert automatically
                    </label>
                    {config && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        SMS: <strong>{config.sms_configured ? config.sms_provider.toUpperCase() : 'Mobile Composer'}</strong> · Email:{' '}
                        <strong>{config.email_fallback_configured ? 'SMTP Ready' : 'Not Configured'}</strong>
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={sosNotes}
                    onChange={(e) => setSosNotes(e.target.value)}
                    placeholder="Optional situation note included if time allows (e.g., Chest pain / Road incident)..."
                    className="input-field text-xs py-2"
                  />
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
                        SOS Activated — Alert #{activeEvent.id.slice(-6)}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Time: {activeEvent.date} · Location source: <strong className="uppercase">{activeEvent.location_source}</strong>
                        {activeEvent.accuracy_meters ? ` (±${Math.round(activeEvent.accuracy_meters)} m)` : ''}
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
                      <X className="w-3.5 h-3.5" /> Resolve / Cancel SOS (I Am Safe)
                    </button>
                  </div>
                </div>

                {/* Honest Delivery Outcome Warning when all automated alerts failed / unavailable */}
                {allAutomatedFailed && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">Automated Delivery Did Not Complete — Manual Action Required</p>
                      <p>
                        No SMS or email alert was confirmed sent by the backend. Tap <strong>Open SMS App</strong> or <strong>Call</strong> next to each contact below (opening the SMS app does not automatically confirm delivery), or dial <strong>112</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Alert Message & Copy / Google Maps Link */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-dark-100 border border-slate-200 dark:border-white/10 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">Prepared Emergency Message</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(activeEvent.alert_message);
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        }}
                        className="text-xs font-bold text-primary-600 dark:text-primary-400 flex items-center gap-1"
                      >
                        {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId ? 'Copied' : 'Copy Message'}
                      </button>
                      {activeMapsUrl && (
                        <a href={activeMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <ExternalLink className="w-3.5 h-3.5" /> Google Maps Link
                        </a>
                      )}
                    </div>
                  </div>
                  <pre className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed font-sans whitespace-pre-wrap">
                    {activeEvent.alert_message}
                  </pre>
                </div>

                {/* Per-Contact Delivery Statuses */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Per-Contact Alert Delivery Status ({activeDeliveries.length})
                  </h4>
                  {activeDeliveries.length === 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      No emergency contacts were saved on your account. Add contacts on the right and share manually or call 112.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {activeDeliveries.map((res, idx) => (
                        <div key={`${res.phone}_${idx}`} className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1 text-xs min-w-0">
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
                            <p className="text-[11px] text-slate-600 dark:text-slate-300">{res.sms_detail}</p>
                            {res.email_detail && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                <Mail className="w-3 h-3 flex-shrink-0" /> {res.email_detail}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {res.sms_composer_url && (
                              <a
                                href={res.sms_composer_url}
                                className="btn-primary py-1.5 px-3 text-xs whitespace-nowrap"
                                title="Opens your phone SMS composer — does not prove automatic backend send"
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> Open SMS App
                              </a>
                            )}
                            <a href={`tel:${res.phone}`} className="btn-secondary py-1.5 px-3 text-xs whitespace-nowrap">
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

          {/* Emergency Location Sharing + Manual Fallback + OpenStreetMap */}
          <div className="glass-card p-5 space-y-4 !transform-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500" /> Current Location & GPS Accuracy
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {locationInfo.sharingStopped
                    ? 'Location sharing stopped by user.'
                    : locationInfo.lat
                    ? `${locationInfo.source === 'manual' ? 'Manually Provided' : 'GPS Active'} · ${locationInfo.lat.toFixed(5)}, ${locationInfo.lng.toFixed(5)}${locationInfo.accuracy ? ` (±${locationInfo.accuracy} m)` : ''} · ${locationInfo.capturedAt ? new Date(locationInfo.capturedAt).toLocaleTimeString() : ''}`
                    : 'Live GPS location unavailable. Retry GPS or enter your area below.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={captureBrowserGps} disabled={locating} className="btn-secondary py-1.5 px-3 text-xs">
                  <LocateFixed className="w-3.5 h-3.5 text-rose-500" /> {locating ? 'Capturing GPS...' : 'Capture GPS'}
                </button>
                {locationInfo.lat && !locationInfo.sharingStopped && (
                  <>
                    <button type="button" onClick={handleShareLocationNative} className="btn-secondary py-1.5 px-3 text-xs">
                      <Share2 className="w-3.5 h-3.5" /> Share Location Link
                    </button>
                    <button type="button" onClick={handleStopSharing} className="btn-secondary py-1.5 px-3 text-xs text-amber-700 dark:text-amber-300">
                      <StopCircle className="w-3.5 h-3.5" /> Stop Sharing
                    </button>
                  </>
                )}
              </div>
            </div>

            {gpsDeniedNotice && !locationInfo.lat && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200">
                <strong>Browser GPS permission denied or unavailable:</strong> Enter your city, street, or 6-digit PIN code below. It will be clearly labeled as a manually provided location and never presented as live GPS.
              </div>
            )}

            <form onSubmit={handleManualLocationSearch} className="flex flex-col sm:flex-row gap-2">
              <input
                ref={manualInputRef}
                type="text"
                value={manualArea}
                onChange={(e) => setManualArea(e.target.value)}
                placeholder="Manual fallback: enter city, street, landmark, or 6-digit PIN code..."
                className="input-field py-2.5 text-xs flex-1"
              />
              <button type="submit" disabled={locating} className="btn-primary py-2.5 px-4 text-xs whitespace-nowrap">
                Set Manual Location
              </button>
            </form>

            {manualError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{manualError}</p>
            )}

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
                  {locationInfo.lat ? 'No nearby hospitals returned in OpenStreetMap for this radius.' : 'Capture GPS or set a manual location to see nearby hospitals.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {hospitals.map((h) => (
                    <div key={h.id || h.name} className="p-3 rounded-xl border border-slate-200 dark:border-white/10 space-y-1.5 text-xs bg-slate-50/60 dark:bg-white/[0.03]">
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
          <div className="glass-card p-5 space-y-3 !transform-none">
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
                      <div className="flex items-center gap-2.5">
                        {ev.maps_url && (
                          <a href={ev.maps_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Maps Link
                          </a>
                        )}
                        {ev.status === 'active' && (
                          <button type="button" onClick={() => handleCancelActiveSos(ev.id)} className="text-rose-600 dark:text-rose-400 font-bold hover:underline">
                            Cancel SOS
                          </button>
                        )}
                      </div>
                    </div>
                    {ev.delivery_results?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ev.delivery_results.map((dr, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_BADGE[dr.sms_status] || STATUS_BADGE.Pending}`}>
                            {dr.name}: SMS {dr.sms_status}{dr.email_status ? ` · Email ${dr.email_status}` : ''}
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

        {/* Right Col: Emergency Contacts Management + Medical Summary */}
        <div className="space-y-6">
          <div className="glass-card p-5 space-y-4 !transform-none">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Emergency Contacts</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Priority ordered · persisted in MongoDB</p>
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
                  Add family or trusted contacts so one-tap SOS can alert them immediately.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {contacts.map((ct) => (
                  <div key={ct.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/5 space-y-2">
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
                        <button type="button" onClick={() => openEditContact(ct)} className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:text-slate-300" title="Edit contact">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleRemoveContact(ct.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500" title="Delete contact">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={`tel:${ct.phone}`} className="btn-secondary flex-1 py-1.5 px-3 text-xs">
                        <Phone className="w-3.5 h-3.5" /> Call
                      </a>
                      <a
                        href={`sms:${ct.phone}?body=${encodeURIComponent(
                          `EMERGENCY ALERT! ${user?.name || 'HealthPoint User'} may need immediate assistance.${activeMapsUrl ? ` Current location: ${activeMapsUrl}` : ''}`
                        )}`}
                        className="btn-secondary flex-1 py-1.5 px-3 text-xs"
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
          <div className="glass-card p-5 space-y-3 !transform-none">
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

      {/* Add / Edit Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4 !transform-none">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingContactId ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
              </h3>
              <button type="button" onClick={() => setContactModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
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
              <input type="tel" required value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Phone with country code (e.g. +919876543210)" className="input-field text-xs" />
              <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Email (for automatic SMTP emergency alert)" className="input-field text-xs" />
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
