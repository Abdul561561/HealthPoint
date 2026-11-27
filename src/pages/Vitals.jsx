import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Download,
  Droplets,
  Edit3,
  Footprints,
  Heart,
  Info,
  Moon,
  Plus,
  RefreshCw,
  Scale,
  Smartphone,
  Thermometer,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { useDispatch } from 'react-redux';
import { fetchHealthData } from '../redux/slices/healthSlice';
import { addToast } from '../redux/slices/uiSlice';
import { useTheme } from '../hooks/useTheme';
import {
  createVitalReading,
  deleteVitalReading,
  downloadVitalsExport,
  fetchHealthPlatforms,
  fetchVitalsSummary,
  syncHealthPlatform,
  updateVitalReading,
} from '../services/vitalsApi';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const EMPTY_FORM = {
  heart_rate: '',
  systolic: '',
  diastolic: '',
  blood_glucose: '',
  glucose_context: 'random',
  oxygen_saturation: '',
  temperature_f: '',
  temperature_unit: 'F',
  weight_kg: '',
  height_cm: '',
  sleep_hours: '',
  steps: '',
  water_glasses: '',
  notes: '',
};

const RANGE_OPTIONS = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly (7d)' },
  { id: 'month', label: 'Monthly (30d)' },
];

function numOrUndefined(val, isInt = false) {
  if (val === '' || val === null || val === undefined) return undefined;
  const parsed = isInt ? parseInt(val, 10) : parseFloat(val);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function Vitals() {
  const dispatch = useDispatch();
  const { isDark } = useTheme();

  const [range, setRange] = useState('week');
  const [summary, setSummary] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const loadAll = useCallback(async (selectedRange = range) => {
    setLoading(true);
    try {
      const [sumData, platData] = await Promise.all([
        fetchVitalsSummary(selectedRange),
        fetchHealthPlatforms(),
      ]);
      setSummary(sumData);
      setPlatforms(Array.isArray(platData) ? platData : []);
    } catch {
      dispatch(addToast({ title: 'Vitals Load Error', message: 'Could not load health readings from MongoDB.', type: 'error' }));
    } finally {
      setLoading(false);
    }
  }, [dispatch, range]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchVitalsSummary(range), fetchHealthPlatforms()])
      .then(([sumData, platData]) => {
        if (!active) return;
        setSummary(sumData);
        setPlatforms(Array.isArray(platData) ? platData : []);
      })
      .catch(() => {
        if (active) dispatch(addToast({ title: 'Vitals Load Error', message: 'Could not load health readings.', type: 'error' }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [range, dispatch]);

  const openNewReading = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const openEditReading = (row) => {
    setEditingId(row.id);
    setForm({
      heart_rate: row.heart_rate ?? '',
      systolic: row.systolic ?? '',
      diastolic: row.diastolic ?? '',
      blood_glucose: row.blood_glucose ?? '',
      glucose_context: row.glucose_context || 'random',
      oxygen_saturation: row.oxygen_saturation ?? '',
      temperature_f: row.temperature_f ?? '',
      temperature_unit: 'F',
      weight_kg: row.weight_kg ?? '',
      height_cm: row.height_cm ?? '',
      sleep_hours: row.sleep_hours ?? '',
      steps: row.steps ?? '',
      water_glasses: row.water_glasses ?? '',
      notes: row.notes || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');

    const payload = {
      heart_rate: numOrUndefined(form.heart_rate, true),
      systolic: numOrUndefined(form.systolic, true),
      diastolic: numOrUndefined(form.diastolic, true),
      blood_glucose: numOrUndefined(form.blood_glucose),
      glucose_context: numOrUndefined(form.blood_glucose) !== undefined ? form.glucose_context : undefined,
      oxygen_saturation: numOrUndefined(form.oxygen_saturation),
      temperature_f: numOrUndefined(form.temperature_f),
      temperature_unit: form.temperature_unit,
      weight_kg: numOrUndefined(form.weight_kg),
      height_cm: numOrUndefined(form.height_cm),
      sleep_hours: numOrUndefined(form.sleep_hours),
      steps: numOrUndefined(form.steps, true),
      water_glasses: numOrUndefined(form.water_glasses, true),
      notes: form.notes.trim() || undefined,
    };

    if (payload.temperature_unit === 'C' && payload.temperature_f !== undefined) {
      if (payload.temperature_f < 32 || payload.temperature_f > 43.5) {
        setFormError('Temperature in Celsius should be between 32°C and 43.5°C.');
        return;
      }
      payload.temperature_f = Math.round((payload.temperature_f * 9 / 5 + 32) * 10) / 10;
      payload.temperature_unit = 'F';
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateVitalReading(editingId, payload);
        dispatch(addToast({ title: 'Reading Updated', message: 'Your health reading has been updated.' }));
      } else {
        await createVitalReading({ ...payload, source: 'manual' });
        dispatch(addToast({ title: 'Vitals Recorded', message: 'Daily health reading saved to MongoDB.' }));
      }
      setShowModal(false);
      await loadAll(range);
      dispatch(fetchHealthData());
    } catch (err) {
      const detail = err.response?.data?.detail;
      setFormError(Array.isArray(detail) ? detail.map((d) => d.msg).join('; ') : detail || 'Failed to save vital reading.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteVitalReading(id);
      dispatch(addToast({ title: 'Reading Deleted', message: 'Measurement removed and latest snapshot recalculated.' }));
      await loadAll(range);
      dispatch(fetchHealthData());
    } catch {
      dispatch(addToast({ title: 'Delete Failed', message: 'Could not delete reading.', type: 'error' }));
    }
  };

  const handleExport = async (fmt) => {
    try {
      const data = await downloadVitalsExport(fmt, range === 'month' ? 30 : 7);
      const blob = fmt === 'csv'
        ? data
        : new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fmt === 'csv' ? 'healthpoint_vitals_summary.csv' : 'healthpoint_vitals_summary.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      dispatch(addToast({ title: 'Export Error', message: 'Unable to export health summary.', type: 'error' }));
    }
  };

  const handleSyncPlatform = async (pid) => {
    try {
      await syncHealthPlatform(pid);
    } catch (err) {
      dispatch(addToast({
        title: 'Sync Not Authorized',
        message: err.response?.data?.detail || 'Connect required native app or OAuth credentials on the backend first.',
        type: 'info',
      }));
    }
  };

  const latest = summary?.latest || {};
  const averages = summary?.averages || {};
  const readings = useMemo(() => summary?.readings || [], [summary]);
  const alerts = summary?.active_alerts || [];

  const cards = [
    { label: 'Heart Rate', val: latest.heart_rate, unit: 'bpm', avg: averages.heart_rate, icon: Heart, color: 'text-rose-500 bg-rose-500/10' },
    { label: 'Blood Pressure', val: latest.systolic && latest.diastolic ? `${latest.systolic}/${latest.diastolic}` : null, unit: 'mmHg', avg: averages.systolic ? `${averages.systolic}/${averages.diastolic}` : null, icon: Activity, color: 'text-indigo-500 bg-indigo-500/10' },
    { label: 'Blood Glucose', val: latest.blood_glucose, unit: 'mg/dL', avg: averages.blood_glucose, icon: Droplets, color: 'text-amber-500 bg-amber-500/10' },
    { label: 'SpO2 (Oxygen)', val: latest.oxygen_saturation, unit: '%', avg: averages.oxygen_saturation, icon: Wind, color: 'text-cyan-500 bg-cyan-500/10' },
    { label: 'Body Temperature', val: latest.temperature_f, unit: '°F', avg: averages.temperature_f, icon: Thermometer, color: 'text-orange-500 bg-orange-500/10' },
    { label: 'Weight', val: latest.weight_kg, unit: 'kg', avg: averages.weight_kg, icon: Scale, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Height', val: latest.height_cm, unit: 'cm', avg: null, icon: Scale, color: 'text-teal-500 bg-teal-500/10' },
    { label: 'BMI', val: latest.bmi ? `${latest.bmi} (${latest.bmi_category || 'Computed'})` : null, unit: '', avg: null, icon: Activity, color: 'text-violet-500 bg-violet-500/10' },
    { label: 'Sleep Duration', val: latest.sleep_hours, unit: 'hrs', avg: averages.sleep_hours, icon: Moon, color: 'text-purple-500 bg-purple-500/10' },
    { label: 'Daily Steps', val: latest.steps !== null && latest.steps !== undefined ? Number(latest.steps).toLocaleString() : null, unit: 'steps', avg: averages.steps, icon: Footprints, color: 'text-green-500 bg-green-500/10' },
    { label: 'Water Intake', val: latest.water_glasses, unit: 'glasses', avg: averages.water_glasses, icon: Droplets, color: 'text-sky-500 bg-sky-500/10' },
  ];

  const chartData = useMemo(() => {
    const chrono = [...readings].reverse().slice(-20);
    return {
      labels: chrono.map((r) => (r.recorded_at ? new Date(r.recorded_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '')),
      datasets: [
        {
          label: 'Heart Rate (bpm)',
          data: chrono.map((r) => r.heart_rate ?? null),
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244,63,94,0.15)',
          spanGaps: true,
          tension: 0.35,
        },
        {
          label: 'Systolic BP (mmHg)',
          data: chrono.map((r) => r.systolic ?? null),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.15)',
          spanGaps: true,
          tension: 0.35,
        },
        {
          label: 'SpO2 (%)',
          data: chrono.map((r) => r.oxygen_saturation ?? null),
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.15)',
          spanGaps: true,
          tension: 0.35,
        },
      ],
    };
  }, [readings]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: isDark ? '#cbd5e1' : '#475569', font: { size: 11 } } },
    },
    scales: {
      x: { ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 10 } }, grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' } },
      y: { ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 10 } }, grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' } },
    },
  }), [isDark]);

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="glass-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-500" />
            Daily Vitals & Health Measurements
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track physiological readings manually with validation, timestamps, trend history, export, and connected platform readiness.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 dark:border-white/15 overflow-hidden">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  range === opt.id ? 'bg-primary-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={() => handleExport('csv')} className="btn-secondary py-2 px-3 text-xs">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={() => handleExport('json')} className="btn-secondary py-2 px-3 text-xs">
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
          <button onClick={openNewReading} className="btn-primary py-2 px-3.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Log Vitals
          </button>
        </div>
      </div>

      {/* Informational Alerts (Non-Diagnostic) */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((al, i) => (
            <div
              key={i}
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                al.level === 'urgent'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{al.metric} Note (Informational Only):</strong> {al.message}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Latest Measurement Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {cards.map((c) => {
          const Icon = c.icon;
          const hasVal = c.val !== null && c.val !== undefined && c.val !== '';
          return (
            <div key={c.label} className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{c.label}</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {hasVal ? `${c.val}${c.unit ? ` ${c.unit}` : ''}` : <span className="text-xs font-medium text-slate-400">Not recorded</span>}
              </p>
              {c.avg !== null && c.avg !== undefined && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Period avg: {c.avg}{c.unit ? ` ${c.unit}` : ''}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Trends Chart & Connected Health Platforms */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Vitals Trend Chart</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{readings.length} reading(s) in range</span>
          </div>
          {readings.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center space-y-2">
              <Info className="w-7 h-7 text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">No readings recorded in this period. Click "Log Vitals" to record real measurements.</p>
            </div>
          ) : (
            <div className="h-60">
              <Line data={chartData} options={chartOptions} />
            </div>
          )}
        </div>

        <div className="glass-card p-5 space-y-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary-500" /> Connected Health Platforms
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Requires authorized native companion apps or OAuth credentials on the backend. Unconfigured services never show a fake Connected state.
            </p>
          </div>
          <div className="space-y-2.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
            {platforms.map((plat) => (
              <div key={plat.id} className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-slate-900 dark:text-white">{plat.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    plat.connected
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                  }`}>
                    {plat.connected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{plat.status_reason}</p>
                <button
                  type="button"
                  onClick={() => handleSyncPlatform(plat.id)}
                  className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Check Sync Status
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Historical Readings Table */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Historical Readings Log</h3>
        {loading ? (
          <p className="text-xs text-slate-500 py-4 text-center">Loading readings...</p>
        ) : readings.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">No readings logged yet.</p>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-white/10">
            {readings.map((row) => (
              <div key={row.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {row.recorded_at ? new Date(row.recorded_at).toLocaleString() : 'Unknown time'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/10 text-primary-600 dark:text-primary-300 uppercase">
                      {row.source || 'manual'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-slate-600 dark:text-slate-300">
                    {row.heart_rate != null && <span>HR: <strong>{row.heart_rate}</strong> bpm</span>}
                    {row.systolic != null && row.diastolic != null && <span>BP: <strong>{row.systolic}/{row.diastolic}</strong> mmHg</span>}
                    {row.blood_glucose != null && <span>Glucose: <strong>{row.blood_glucose}</strong> mg/dL</span>}
                    {row.oxygen_saturation != null && <span>SpO2: <strong>{row.oxygen_saturation}</strong>%</span>}
                    {row.temperature_f != null && <span>Temp: <strong>{row.temperature_f}</strong> °F</span>}
                    {row.weight_kg != null && <span>Weight: <strong>{row.weight_kg}</strong> kg</span>}
                    {row.sleep_hours != null && <span>Sleep: <strong>{row.sleep_hours}</strong> hrs</span>}
                    {row.steps != null && <span>Steps: <strong>{row.steps}</strong></span>}
                    {row.water_glasses != null && <span>Water: <strong>{row.water_glasses}</strong> glasses</span>}
                  </div>
                  {row.notes && <p className="text-[11px] text-slate-500 dark:text-slate-400">Note: {row.notes}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openEditReading(row)} className="p-2 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" title="Edit reading">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(row.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" title="Delete reading">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log / Edit Reading Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingId ? 'Edit Vital Reading' : 'Log Manual Daily Vitals'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Leave any unmeasured field blank — missing readings remain unrecorded and are never treated as zero.
            </p>
            {formError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {formError}
              </div>
            )}
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Heart Rate (bpm)</label>
                  <input type="number" min="25" max="250" value={form.heart_rate} onChange={(e) => setForm({ ...form, heart_rate: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 72" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">BP Systolic (mmHg)</label>
                  <input type="number" min="50" max="260" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 120" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">BP Diastolic (mmHg)</label>
                  <input type="number" min="30" max="180" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 80" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Blood Glucose (mg/dL)</label>
                  <input type="number" min="20" max="700" step="0.1" value={form.blood_glucose} onChange={(e) => setForm({ ...form, blood_glucose: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 96" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Glucose Context</label>
                  <select value={form.glucose_context} onChange={(e) => setForm({ ...form, glucose_context: e.target.value })} className="input-field text-xs mt-1">
                    <option value="random">Random</option>
                    <option value="fasting">Fasting</option>
                    <option value="post_meal">Post-meal</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">SpO2 (%)</label>
                  <input type="number" min="50" max="100" step="0.1" value={form.oxygen_saturation} onChange={(e) => setForm({ ...form, oxygen_saturation: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 98" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Body Temp</label>
                  <div className="flex gap-1.5 mt-1">
                    <input type="number" step="0.1" value={form.temperature_f} onChange={(e) => setForm({ ...form, temperature_f: e.target.value })} className="input-field text-xs flex-1" placeholder="e.g. 98.4" />
                    <select value={form.temperature_unit} onChange={(e) => setForm({ ...form, temperature_unit: e.target.value })} className="input-field text-xs w-16">
                      <option value="F">°F</option>
                      <option value="C">°C</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Weight (kg)</label>
                  <input type="number" min="10" max="400" step="0.1" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 70.5" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Height (cm)</label>
                  <input type="number" min="40" max="260" step="0.1" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 175" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Sleep (hours)</label>
                  <input type="number" min="0" max="24" step="0.5" value={form.sleep_hours} onChange={(e) => setForm({ ...form, sleep_hours: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 7.5" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Daily Steps</label>
                  <input type="number" min="0" max="200000" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 8500" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Water (glasses)</label>
                  <input type="number" min="0" max="50" value={form.water_glasses} onChange={(e) => setForm({ ...form, water_glasses: e.target.value })} className="input-field text-xs mt-1" placeholder="e.g. 8" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Notes (optional)</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field text-xs mt-1" placeholder="Post-walk reading, morning fasting..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary py-2 px-4 text-xs">
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Vitals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
