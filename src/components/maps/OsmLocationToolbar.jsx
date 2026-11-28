import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed, MapPin, RefreshCw, Search, X } from 'lucide-react';

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];

/**
 * Shared OpenStreetMap location search + GPS trigger + local filter + radius toolbar
 * used by Doctors and Pharmacy discovery views.
 */
export default function OsmLocationToolbar({
  accentColor = 'indigo',
  addressQuery,
  addressSuggestions = [],
  showSuggestions = false,
  setShowSuggestions,
  onAddressChange,
  onAddressSubmit,
  onSelectSuggestion,
  onClearAddress,
  onRequestGps,
  locationStatus,
  locationLabel,
  geocodeLoading = false,
  geocodeError = '',
  filterText,
  onFilterTextChange,
  filterPlaceholder = 'Filter by name or address...',
  radius,
  onRadiusChange,
  extraControl = null,
  loading = false,
  hasCoords = false,
  onRefresh,
}) {
  const isEmerald = accentColor === 'emerald';
  const pinIconColor = isEmerald ? 'text-emerald-500' : 'text-indigo-500';
  const focusRing = isEmerald ? 'focus:border-emerald-500' : 'focus:border-indigo-500';
  const goBtnClass = isEmerald
    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
    : 'bg-indigo-600 hover:bg-indigo-700 text-white';

  return (
    <div className="glass-card p-3.5 sm:p-4 space-y-3 relative z-[900] !transform-none">
      {/* Top row: Location lookup (Nominatim) + GPS + Refresh */}
      <div className="flex flex-col lg:flex-row gap-2.5">
        <form onSubmit={onAddressSubmit} className="relative flex-1 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <MapPin className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${pinIconColor}`} />
            <input
              type="text"
              value={addressQuery}
              onChange={(e) => onAddressChange(e.target.value)}
              onFocus={() => setShowSuggestions?.(addressSuggestions.length > 0)}
              placeholder="Search city, neighborhood, or 6-digit PIN code (e.g. 560038)..."
              className={`input-field pl-10 pr-9 py-2.5 rounded-xl w-full text-sm ${focusRing}`}
            />
            {addressQuery && (
              <button
                type="button"
                onClick={onClearAddress}
                aria-label="Clear location search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <AnimatePresence>
              {showSuggestions && addressSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-dark-100 border border-slate-200 dark:border-white/15 rounded-xl shadow-2xl z-[1100] overflow-hidden max-h-60 overflow-y-auto"
                >
                  {addressSuggestions.map((s, idx) => (
                    <button
                      type="button"
                      key={`${s.lat}_${s.lng}_${idx}`}
                      onClick={() => onSelectSuggestion(s)}
                      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 border-b last:border-b-0 border-slate-100 dark:border-white/10 flex items-center gap-2"
                    >
                      <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${pinIconColor}`} />
                      <span className="truncate">{s.display_name}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={geocodeLoading}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60 ${goBtnClass}`}
            >
              {geocodeLoading ? 'Finding...' : 'Set Location'}
            </button>
            <button
              type="button"
              onClick={onRequestGps}
              className="btn-secondary px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap"
              title="Use browser GPS location"
            >
              <LocateFixed className={`w-4 h-4 ${pinIconColor}`} />
              <span>{locationStatus === 'prompting' ? 'Locating...' : 'Use GPS'}</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || !hasCoords}
              className="btn-secondary px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap disabled:opacity-50"
              title="Refresh OpenStreetMap results"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </form>
      </div>

      {geocodeError && (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400 px-1">{geocodeError}</p>
      )}

      {/* Second row: Result filter + Radius + Extra toggle + Active location chip */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => onFilterTextChange(e.target.value)}
            placeholder={filterPlaceholder}
            className={`input-field pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl w-full ${focusRing}`}
          />
          {filterText && (
            <button
              type="button"
              onClick={() => onFilterTextChange('')}
              aria-label="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          aria-label="Search radius"
          value={radius}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="input-field py-2 px-3 text-xs sm:text-sm rounded-xl w-auto font-semibold"
        >
          {RADIUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Radius: {opt.label}
            </option>
          ))}
        </select>

        {extraControl}

        {hasCoords && locationLabel && (
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-[11px] font-semibold text-slate-600 dark:text-slate-300 max-w-[260px]">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isEmerald ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
            <span className="truncate">{locationLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
