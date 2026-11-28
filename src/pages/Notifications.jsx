import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  Droplets,
  Dumbbell,
  Edit3,
  ExternalLink,
  FileText,
  Moon,
  Pill,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  addReminder,
  clearAllNotif,
  clearReadNotif,
  editReminder,
  loadNotifications,
  loadReminders,
  markAllNotifRead,
  markNotifRead,
  markNotifUnread,
  removeNotif,
  removeReminder,
  triggerReminderEvaluation,
} from '../redux/slices/notificationSlice';
import { addToast } from '../redux/slices/uiSlice';

const CATEGORY_META = {
  medicine: { label: 'Medicine', icon: Pill, badge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20' },
  water: { label: 'Water', icon: Droplets, badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20' },
  vitals: { label: 'Daily Vitals', icon: Activity, badge: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20' },
  activity: { label: 'Activity', icon: Activity, badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
  workout: { label: 'Workout', icon: Dumbbell, badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20' },
  sleep: { label: 'Sleep', icon: Moon, badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20' },
  records: { label: 'Records', icon: FileText, badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
  account: { label: 'Account', icon: UserCheck, badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' },
  emergency: { label: 'Emergency', icon: ShieldAlert, badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' },
  custom: { label: 'Custom', icon: Bell, badge: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function detectBrowserPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

export default function Notifications() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items: notifications, reminders, loading, remindersLoading } = useSelector((s) => s.notifications);

  const [activeTab, setActiveTab] = useState('inbox');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [browserPerm, setBrowserPerm] = useState(detectBrowserPermission);
  const [swStatus, setSwStatus] = useState('');

  // Reminder modal/form state
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const [showReminderForm, setShowReminderForm] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formCategory, setFormCategory] = useState('medicine');
  const [formTime, setFormTime] = useState('08:30');
  const [formDays, setFormDays] = useState([...WEEKDAYS]);
  const [formTimezone, setFormTimezone] = useState(detectedTz);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    dispatch(loadNotifications());
    dispatch(loadReminders());
  }, [dispatch]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
      if (unreadOnly && n.read) return false;
      return true;
    });
  }, [notifications, categoryFilter, unreadOnly]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPerm('unsupported');
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setBrowserPerm(result);
      if (result === 'granted' && 'serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw-notifications.js');
          setSwStatus('Active-tab browser notifications enabled.');
        } catch {
          setSwStatus('Browser permission granted (Service Worker unavailable in this context).');
        }
      }
      dispatch(
        addToast({
          title: 'Browser Notifications',
          message:
            result === 'granted'
              ? 'Permission granted! Active HealthPoint tabs will display alerts.'
              : `Notification permission is ${result}. In-app alerts remain active.`,
        })
      );
    } catch {
      dispatch(addToast({ title: 'Notification Permission', message: 'Could not request browser permission.' }));
    }
  };

  const handleSendTestBrowserAlert = () => {
    if (browserPerm !== 'granted') return;
    try {
      const notif = new window.Notification('HealthPoint Reminder Alert', {
        body: 'Browser alerts are working for your active HealthPoint session.',
        tag: 'healthpoint-test-alert',
      });
      notif.onclick = () => {
        window.focus();
        navigate('/notifications');
      };
    } catch {
      dispatch(addToast({ title: 'Browser Alert', message: 'Unable to display native notification in this browser.' }));
    }
  };

  const openCreateReminder = () => {
    setEditingReminderId(null);
    setFormTitle('');
    setFormMessage('');
    setFormCategory('medicine');
    setFormTime('08:30');
    setFormDays([...WEEKDAYS]);
    setFormTimezone(detectedTz);
    setFormEnabled(true);
    setShowReminderForm(true);
  };

  const openEditReminder = (rem) => {
    setEditingReminderId(rem.id);
    setFormTitle(rem.title || '');
    setFormMessage(rem.message || '');
    setFormCategory(rem.category || 'medicine');
    setFormTime(rem.time_of_day || '08:30');
    setFormDays(rem.days?.length ? rem.days : [...WEEKDAYS]);
    setFormTimezone(rem.timezone || detectedTz);
    setFormEnabled(Boolean(rem.enabled));
    setShowReminderForm(true);
  };

  const toggleDay = (day) => {
    setFormDays((prev) =>
      prev.includes(day) ? (prev.length > 1 ? prev.filter((d) => d !== day) : prev) : [...prev, day]
    );
  };

  const handleSaveReminder = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || formDays.length === 0) return;
    setFormSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        message: formMessage.trim() || undefined,
        category: formCategory,
        time_of_day: formTime,
        days: formDays,
        timezone: formTimezone.trim() || 'UTC',
        enabled: formEnabled,
      };
      if (editingReminderId) {
        await dispatch(editReminder({ id: editingReminderId, updates: payload })).unwrap();
        dispatch(addToast({ title: 'Reminder Updated', message: `"${payload.title}" saved.` }));
      } else {
        await dispatch(addReminder(payload)).unwrap();
        dispatch(addToast({ title: 'Reminder Scheduled', message: `"${payload.title}" at ${payload.time_of_day}.` }));
      }
      setShowReminderForm(false);
    } catch (err) {
      dispatch(addToast({ title: 'Save Failed', message: String(err) }));
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleReminderEnabled = async (rem) => {
    try {
      await dispatch(editReminder({ id: rem.id, updates: { enabled: !rem.enabled } })).unwrap();
    } catch (err) {
      dispatch(addToast({ title: 'Update Failed', message: String(err) }));
    }
  };

  const handleOpenNotification = async (notif) => {
    if (!notif.read) {
      await dispatch(markNotifRead(notif.id));
    }
    if (notif.route) {
      navigate(notif.route);
    }
  };

  const handleEvaluateDue = async () => {
    try {
      const res = await dispatch(triggerReminderEvaluation()).unwrap();
      dispatch(
        addToast({
          title: 'Scheduler Check Complete',
          message: `Checked ${res.evaluated || 0} active reminder(s); triggered ${res.triggered || 0}.`,
        })
      );
    } catch (err) {
      dispatch(addToast({ title: 'Scheduler Check Failed', message: String(err) }));
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header & Browser Notification Permission Card */}
      <div className="glass-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Notification Centre & Health Reminders</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage medicine, hydration, activity, workout, sleep, records, and safety reminders.
              </p>
            </div>
          </div>
          {swStatus && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{swStatus}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
            {browserPerm === 'granted' ? (
              <BellRing className="w-3.5 h-3.5 text-emerald-500" />
            ) : browserPerm === 'denied' || browserPerm === 'unsupported' ? (
              <BellOff className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Bell className="w-3.5 h-3.5 text-primary-500" />
            )}
            <span>
              Browser Alerts:{' '}
              <strong className="uppercase">{browserPerm}</strong>
            </span>
          </div>

          {browserPerm === 'default' && (
            <button onClick={handleRequestBrowserPermission} className="btn-primary py-2 px-3.5 text-xs">
              Enable Browser Alerts
            </button>
          )}
          {browserPerm === 'granted' && (
            <button
              onClick={handleSendTestBrowserAlert}
              className="btn-secondary py-2 px-3.5 text-xs"
            >
              Test Browser Alert
            </button>
          )}
          <button
            onClick={() => {
              setActiveTab('reminders');
              openCreateReminder();
            }}
            className="btn-primary py-2 px-3.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Reminder
          </button>
        </div>
      </div>

      {/* Honest permission / Web Push note */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-dark-100/70 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Delivery scope:</strong> Scheduled reminders are persisted in MongoDB and evaluated every minute while
          the HealthPoint server is running without duplicate alerts. Browser notifications appear when permission is
          granted and HealthPoint is open; background push while the browser is completely closed requires dedicated
          server VAPID Web Push keys, so in-app alerts remain the reliable fallback here.
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'inbox'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white dark:bg-dark-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10'
            }`}
          >
            Inbox ({unreadCount} unread)
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'reminders'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white dark:bg-dark-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10'
            }`}
          >
            Reminder Schedules ({reminders.length})
          </button>
        </div>

        {activeTab === 'inbox' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleEvaluateDue}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Check Due Reminders
            </button>
            <button
              onClick={() => dispatch(markAllNotifRead())}
              disabled={unreadCount === 0}
              className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
            <button
              onClick={() => dispatch(clearReadNotif())}
              disabled={notifications.filter((n) => n.read).length === 0}
              className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-50"
            >
              Clear read
            </button>
            <button
              onClick={() => dispatch(clearAllNotif())}
              disabled={notifications.length === 0}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50"
            >
              Clear all
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Preferences
            </button>
          </div>
        ) : (
          <button onClick={openCreateReminder} className="btn-primary py-1.5 px-3.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Schedule
          </button>
        )}
      </div>

      {/* Inbox Tab */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {['all', ...ALL_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    categoryFilter === cat
                      ? 'bg-primary-500 text-white'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/20"
              />
              Unread only
            </label>
          </div>

          <div className="glass-card divide-y divide-slate-200/70 dark:divide-white/10">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading notifications...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Bell className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No notifications to display</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Create a reminder schedule or adjust your filters to see health alerts.
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const meta = CATEGORY_META[notif.category] || CATEGORY_META.account;
                const Icon = meta.icon;
                return (
                  <div
                    key={notif.id}
                    className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                      !notif.read ? 'bg-primary-50/40 dark:bg-primary-900/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenNotification(notif)}
                      className="flex items-start gap-3.5 text-left flex-1 min-w-0 group"
                    >
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${meta.badge}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {notif.title}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase ${meta.badge}`}>
                            {meta.label}
                          </span>
                          {!notif.read && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-600 text-white">
                              New
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{notif.message}</p>
                        {notif.metadata?.delivery_summary?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {notif.metadata.delivery_summary.map((ds, dIdx) => (
                              <span
                                key={`${ds.name}_${dIdx}`}
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/15"
                              >
                                {ds.name}: SMS {ds.sms_status}{ds.email_status ? ` · Email ${ds.email_status}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                          <span>{notif.created_at ? new Date(notif.created_at).toLocaleString() : 'Recent'} · Open {notif.route || '/dashboard'}</span>
                          {notif.metadata?.maps_url && (
                            <a
                              href={notif.metadata.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" /> Google Maps Link
                            </a>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!notif.read ? (
                        <button
                          onClick={() => dispatch(markNotifRead(notif.id))}
                          title="Mark as read"
                          className="p-2 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => dispatch(markNotifUnread(notif.id))}
                          title="Mark as unread"
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          Unread
                        </button>
                      )}
                      <button
                        onClick={() => dispatch(removeNotif(notif.id))}
                        title="Delete notification"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Reminders Tab */}
      {activeTab === 'reminders' && (
        <div className="space-y-4">
          {remindersLoading && reminders.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading reminder schedules...</div>
          ) : reminders.length === 0 ? (
            <div className="glass-card p-10 text-center space-y-3">
              <Clock className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 dark:text-white">No health reminders scheduled yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Schedule medicine doses, hydration checks, workouts, sleep wind-down, or lab follow-ups.
              </p>
              <button onClick={openCreateReminder} className="btn-primary py-2 px-4 text-xs mx-auto">
                <Plus className="w-3.5 h-3.5" /> Create First Reminder
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reminders.map((rem) => {
                const meta = CATEGORY_META[rem.category] || CATEGORY_META.medicine;
                const Icon = meta.icon;
                return (
                  <div key={rem.id} className="glass-card p-4 space-y-3 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${meta.badge}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{rem.title}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{rem.message}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleReminderEnabled(rem)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                          rem.enabled
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-200/70 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/10'
                        }`}
                      >
                        {rem.enabled ? 'Enabled' : 'Paused'}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-white/10 text-xs">
                      <div className="text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-slate-900 dark:text-white">{rem.time_of_day}</span>
                        {' · '}
                        <span>{rem.timezone}</span>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {(rem.days || []).join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditReminder(rem)}
                          className="p-2 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                          title="Edit reminder"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => dispatch(removeReminder(rem.id))}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          title="Delete reminder"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Reminder Modal */}
      {showReminderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingReminderId ? 'Edit Reminder Schedule' : 'Create Health Reminder'}
              </h3>
              <button
                onClick={() => setShowReminderForm(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReminder} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Morning Vitamin D3 / Evening Walk"
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="input-field"
                  >
                    {ALL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">Time (24h)</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">Days of Week</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const active = formDays.includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          active
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">Timezone (IANA)</label>
                <input
                  type="text"
                  required
                  value={formTimezone}
                  onChange={(e) => setFormTimezone(e.target.value)}
                  placeholder="e.g. Asia/Kolkata or UTC"
                  className="input-field"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block mb-1">Note / Instructions (optional)</label>
                <input
                  type="text"
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  placeholder="Take after breakfast with a glass of water"
                  className="input-field"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                />
                Active schedule
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowReminderForm(false)} className="btn-secondary py-2 px-4 text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={formSaving} className="btn-primary py-2 px-4 text-xs">
                  {formSaving ? 'Saving...' : editingReminderId ? 'Save Changes' : 'Create Reminder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
