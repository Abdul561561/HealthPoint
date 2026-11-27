import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Phone, Globe, ExternalLink, Map, AlertCircle } from 'lucide-react';

function FacilityMiniMap({ center, places }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapDivRef.current || !window.L || !places?.length) return;
    const cLat = center?.lat ?? places[0].latitude;
    const cLng = center?.lng ?? places[0].longitude;
    if (cLat === undefined || cLng === undefined) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = window.L.map(mapDivRef.current, { zoomControl: true }).setView([cLat, cLng], 13);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const bounds = [];
    if (center?.lat !== undefined && center?.lng !== undefined) {
      bounds.push([center.lat, center.lng]);
      window.L.circleMarker([center.lat, center.lng], {
        radius: 7,
        fillColor: '#6366f1',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map).bindPopup(`<strong>${center.label || 'Your Location'}</strong>`);
    }

    places.forEach((p) => {
      if (p.latitude === undefined || p.longitude === undefined) return;
      bounds.push([p.latitude, p.longitude]);
      window.L.marker([p.latitude, p.longitude])
        .addTo(map)
        .bindPopup(`<strong>${p.name}</strong><br/><span style="font-size:11px">${p.distance_km} km away</span>`);
    });

    if (bounds.length > 1) {
      map.fitBounds(window.L.latLngBounds(bounds), { padding: [30, 30] });
    }
    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, places]);

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-white/15 h-48 bg-slate-100 dark:bg-dark-300">
      <div ref={mapDivRef} className="w-full h-full z-10" />
    </div>
  );
}

export default function FacilityDiscoveryPanel({ places = [], placesError = null, manualMapsUrl = null, searchCenter = null }) {
  const [showMap, setShowMap] = useState(false);

  if (!places.length && !placesError) return null;

  return (
    <div className="mt-2.5 w-full space-y-2.5">
      {placesError && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <span>{placesError}</span>
          </div>
          {manualMapsUrl && (
            <a
              href={manualMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Search on OpenStreetMap
            </a>
          )}
        </div>
      )}

      {places.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Nearby Healthcare Facilities ({places.length})
              {searchCenter?.label ? ` · ${searchCenter.label}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary-500/10 text-primary-600 dark:text-primary-300 hover:bg-primary-500/20 transition-colors"
            >
              <Map className="w-3 h-3" />
              {showMap ? 'Hide Map' : 'View on Map'}
            </button>
          </div>

          {showMap && <FacilityMiniMap center={searchCenter} places={places} />}

          <div className="grid sm:grid-cols-2 gap-2.5">
            {places.slice(0, 6).map((p, idx) => (
              <div
                key={p.place_id || idx}
                className="p-3 rounded-xl bg-white dark:bg-dark-200/90 border border-slate-200 dark:border-white/15 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{p.name}</h5>
                    <p className="text-[11px] font-semibold text-primary-600 dark:text-primary-400">
                      {p.specialty || p.category}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {p.category}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1 line-clamp-2">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
                  <span>{p.address}</span>
                </p>

                <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-primary-500" />
                    {p.distance_km} km
                  </span>
                  {p.opening_hours?.[0] && (
                    <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{p.opening_hours[0]}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 dark:border-white/10">
                  {p.phone && (
                    <a
                      href={`tel:${p.phone}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/15"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                  )}
                  {(p.directions_url || p.maps_url) && (
                    <a
                      href={p.directions_url || p.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary-600 hover:bg-primary-700 text-white"
                    >
                      <Navigation className="w-3 h-3" /> Directions
                    </a>
                  )}
                  {p.website && (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/15"
                    >
                      <Globe className="w-3 h-3" /> Website
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Data via OpenStreetMap contributors. OpenStreetMap listings do not verify clinician qualifications or appointment availability.
          </p>
        </div>
      )}
    </div>
  );
}
