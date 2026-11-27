import { useState } from 'react';
import { Download, RefreshCw, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

export default function PWABanner() {
  const {
    canInstall,
    isIOS,
    isOffline,
    updateAvailable,
    promptInstall,
    applyUpdate,
  } = usePWA();
  const [dismissedInstall, setDismissedInstall] = useState(false);

  return (
    <div className="space-y-2 mb-3">
      {isOffline && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>
              <strong>Offline mode:</strong> Changes to records, vitals, nutrition, or SOS cannot be saved until internet reconnects.
            </span>
          </div>
          <a href="tel:112" className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs">
            Call 112
          </a>
        </div>
      )}

      {updateAvailable && (
        <div className="rounded-xl border border-primary-300 dark:border-primary-500/40 bg-primary-50 dark:bg-primary-950/40 px-4 py-2.5 text-xs text-primary-900 dark:text-primary-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary-500 flex-shrink-0" />
            <span>A new version of HealthPoint is ready.</span>
          </div>
          <button
            type="button"
            onClick={applyUpdate}
            className="btn-primary py-1.5 px-3 text-xs"
          >
            Update & Reload
          </button>
        </div>
      )}

      {canInstall && !dismissedInstall && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/90 dark:bg-sky-950/30 px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
            <span>
              <strong>Install HealthPoint App:</strong> Add to your Android or desktop home screen for standalone access & quick Emergency SOS.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={promptInstall} className="btn-primary py-1.5 px-3 text-xs">
              <Download className="w-3.5 h-3.5" /> Install App
            </button>
            <button
              type="button"
              onClick={() => setDismissedInstall(true)}
              aria-label="Dismiss install banner"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isIOS && !dismissedInstall && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
          <span>
            <strong>iOS Install:</strong> Tap Safari's Share icon and choose <em>Add to Home Screen</em>.
          </span>
          <button type="button" onClick={() => setDismissedInstall(true)} className="p-1 text-slate-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
