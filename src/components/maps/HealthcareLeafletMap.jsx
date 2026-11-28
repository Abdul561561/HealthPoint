import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed, Navigation, X } from 'lucide-react';

/**
 * Shared OpenStreetMap Leaflet viewer with clean teardown on List/Split/Map mode switches,
 * markers synced strictly to visible filtered results, user origin marker, and OSRM route overlay.
 */
export default function HealthcareLeafletMap({
  coords,
  locationLabel,
  items = [],
  selectedItem = null,
  onSelectItem,
  routeCoordinates = null,
  routeInfo = null,
  onClearRoute,
  loading = false,
  accentColor = 'indigo',
  markerEmoji = '🏥',
  emptyLocationText = 'Grant browser location or enter a city, neighborhood, or 6-digit PIN code to load OpenStreetMap.',
}) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayerRef = useRef(null);

  const isEmerald = accentColor === 'emerald';
  const strokeHex = isEmerald ? '#10b981' : '#6366f1';
  const pulseBg = isEmerald ? 'bg-emerald-500' : 'bg-indigo-500';
  const pinBg = isEmerald ? 'bg-emerald-600' : 'bg-indigo-600';
  const selectedBorder = isEmerald ? 'border-emerald-500 bg-emerald-500' : 'border-indigo-500 bg-indigo-500';
  const idleBorder = isEmerald
    ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
    : 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400';

  // Initialize and cleanly tear down Leaflet instance when coords/mount changes
  useEffect(() => {
    const L = window.L;
    if (!coords || !mapDivRef.current || !L) return undefined;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapDivRef.current, { zoomControl: false }).setView([coords.lat, coords.lng], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const pulseIcon = L.divIcon({
      html: `
        <div class="relative w-6 h-6 flex items-center justify-center">
          <div class="absolute w-6 h-6 ${pulseBg} rounded-full opacity-40 animate-ping"></div>
          <div class="w-3.5 h-3.5 ${pinBg} rounded-full border-2 border-white shadow-md z-10"></div>
        </div>
      `,
      className: 'custom-user-location-pulse',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    userMarkerRef.current = L.marker([coords.lat, coords.lng], { icon: pulseIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`<strong class="text-xs">${(locationLabel || 'Selected Location').replace(/</g, '&lt;')}</strong>`);

    mapRef.current = map;
    const resizeTimer = setTimeout(() => mapRef.current?.invalidateSize(), 150);

    return () => {
      clearTimeout(resizeTimer);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [coords, locationLabel, pulseBg, pinBg]);

  // Sync visible result markers 1:1 with displayed filtered items
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!map || !L) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    items.forEach((item) => {
      if (item.latitude === undefined || item.longitude === undefined) return;
      const isSelected = selectedItem?.place_id === item.place_id;

      const icon = L.divIcon({
        html: `
          <div class="relative group cursor-pointer transition-all duration-200 transform ${isSelected ? 'scale-125 z-[1000]' : 'hover:scale-110'}">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center border-2 shadow-lg transition-all ${
              isSelected
                ? `${selectedBorder} border-white text-white scale-110`
                : `bg-white dark:bg-slate-900 ${idleBorder}`
            }">
              <span class="text-base">${markerEmoji}</span>
            </div>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
              isSelected ? `${selectedBorder} border-white` : `bg-white dark:bg-slate-900 ${idleBorder}`
            }"></div>
          </div>
        `,
        className: 'custom-facility-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      });

      const marker = L.marker([item.latitude, item.longitude], { icon }).addTo(map);
      const safeName = String(item.name || '').replace(/</g, '&lt;');
      const safeDist = item.distance_km !== undefined ? `${item.distance_km} km` : '';
      marker.bindPopup(`<div class="text-xs"><strong>${safeName}</strong>${safeDist ? `<br/>${safeDist}` : ''}</div>`);
      marker.on('click', () => {
        onSelectItem?.(item);
        map.panTo([item.latitude, item.longitude]);
      });
      markersRef.current.push(marker);
    });
  }, [items, selectedItem, onSelectItem, markerEmoji, selectedBorder, idleBorder]);

  // Center on newly selected item when triggered from card list
  useEffect(() => {
    if (mapRef.current && selectedItem?.latitude && selectedItem?.longitude && !routeCoordinates) {
      mapRef.current.panTo([selectedItem.latitude, selectedItem.longitude]);
    }
  }, [selectedItem, routeCoordinates]);

  // Draw or clear active OSRM route
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!map || !L) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (routeCoordinates?.length >= 2) {
      routeLayerRef.current = L.polyline(routeCoordinates, {
        color: strokeHex,
        weight: 5,
        opacity: 0.85,
        dashArray: '10, 8',
      }).addTo(map);
      const bounds = L.latLngBounds(routeCoordinates);
      map.fitBounds(bounds, { padding: [55, 55] });
    }
  }, [routeCoordinates, strokeHex]);

  return (
    <div className="w-full h-full min-h-[320px] rounded-2xl overflow-hidden border border-slate-200 dark:border-white/15 relative bg-slate-100 dark:bg-dark-200">
      {coords ? (
        <div ref={mapDivRef} className="w-full h-full min-h-[320px] z-10" />
      ) : (
        <div className="w-full h-full min-h-[320px] flex flex-col items-center justify-center p-6 text-center">
          <LocateFixed className={`w-10 h-10 mb-3 ${isEmerald ? 'text-emerald-500' : 'text-indigo-500'}`} />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 max-w-md">{emptyLocationText}</p>
        </div>
      )}

      <AnimatePresence>
        {routeInfo && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`absolute left-3 right-3 sm:right-auto sm:max-w-xs top-3 z-[999] bg-slate-900/95 backdrop-blur-md border ${
              isEmerald ? 'border-emerald-500/40' : 'border-indigo-500/40'
            } p-3 rounded-2xl flex items-center justify-between gap-3 text-white shadow-xl`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isEmerald ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'
                }`}
              >
                <Navigation className="w-4 h-4 rotate-45" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">OSRM Route Estimate</p>
                <p className="text-xs font-extrabold truncate">
                  {routeInfo.distance} km · ~{routeInfo.duration} mins
                </p>
              </div>
            </div>
            {onClearRoute && (
              <button
                type="button"
                onClick={onClearRoute}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
                title="Clear route"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && coords && (
        <div className="absolute inset-0 bg-white/65 dark:bg-slate-900/70 backdrop-blur-[2px] flex items-center justify-center pointer-events-none z-[998]">
          <div className="px-4 py-3 rounded-2xl bg-white dark:bg-dark-100 border border-slate-200 dark:border-white/15 shadow-xl flex items-center gap-3">
            <div
              className={`w-5 h-5 border-2 ${
                isEmerald ? 'border-emerald-500' : 'border-indigo-500'
              } border-t-transparent rounded-full animate-spin`}
            />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Searching OpenStreetMap...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
