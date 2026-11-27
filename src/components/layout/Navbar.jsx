import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import {
  Menu, Bell, Search, Sun, Moon, ChevronDown,
  Settings, LogOut, User, X, Check, AlertTriangle, Pill, Activity,
  Droplets, Dumbbell, FileText, Trash2
} from 'lucide-react';
import { toggleSidebar } from '../../redux/slices/uiSlice';
import { toggleTheme } from '../../redux/slices/themeSlice';
import {
  clearAllNotif,
  loadNotifications,
  markAllNotifRead,
  markNotifRead,
  removeNotif,
} from '../../redux/slices/notificationSlice';
import { logout } from '../../redux/slices/authSlice';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { getInitials } from '../../utils/helpers';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/analytics': 'Health Analytics',
  '/timeline': 'Health Timeline',
  '/doctors': 'Find Doctors',
  '/pharmacy': 'Pharmacy',
  '/ai-assistant': 'AI Health Assistant',
  '/records': 'Health Records',
  '/fitness': 'Fitness & Gym',
  '/insurance': 'Insurance',
  '/nutrition': 'Nutrition',
  '/vitals': 'Daily Vitals',
  '/notifications': 'Notifications',
  '/emergency': 'Emergency SOS',
  '/settings': 'Settings',
  '/profile': 'My Profile',
  '/admin': 'Admin Control Panel',
};

function getDateGroupLabel(isoStr) {
  if (!isoStr) return 'Earlier';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return 'Earlier';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dtStart = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((todayStart - dtStart) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

export default function Navbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const notifications = useSelector((s) => s.notifications?.items || []);
  const unread = notifications.filter((n) => !n.read).length;

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef(null);
  const alertedIdsRef = useRef(new Set());
  const initialPollDoneRef = useRef(false);

  const title = PAGE_TITLES[location.pathname] || 'HealthPoint';

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    dispatch(loadNotifications());
    const timer = setInterval(() => {
      dispatch(loadNotifications());
    }, 60000);
    return () => clearInterval(timer);
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    if (!notifications.length) return;
    if (!initialPollDoneRef.current) {
      notifications.forEach((n) => alertedIdsRef.current.add(n.id));
      initialPollDoneRef.current = true;
      return;
    }
    const canBrowserNotify =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted';

    notifications.forEach((n) => {
      if (!n.read && !alertedIdsRef.current.has(n.id)) {
        alertedIdsRef.current.add(n.id);
        if (canBrowserNotify) {
          try {
            const sysNotif = new window.Notification(n.title, {
              body: n.message,
              tag: `hp_${n.id}`,
            });
            sysNotif.onclick = () => {
              window.focus();
              if (n.route) navigate(n.route);
            };
          } catch {
            // Ignore browser notification failure in restricted tabs
          }
        }
      }
    });
  }, [notifications, navigate]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-auto z-20 h-16 bg-white/80 dark:bg-dark-200/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 transition-all duration-300"
      style={{ marginLeft: 'var(--sidebar-width, 0)' }}>
      <div className="flex items-center justify-between h-full px-4 lg:px-6 gap-4">
        {/* Left: menu + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-none">{title}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <AnimatePresence>
              {searchOpen ? (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 220, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="flex items-center gap-2 bg-slate-100 dark:bg-white/10 rounded-xl px-3 py-2 overflow-hidden"
                >
                  <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    ref={searchRef}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400 w-full"
                    onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
                  />
                  <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
                    <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                  </button>
                </motion.div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
            </AnimatePresence>
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => dispatch(toggleTheme())}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <div>
            <button
              onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-all relative"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {unread}
                </span>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setNotifOpen(false)}
                    className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-black/40 backdrop-blur-xs"
                  />

                  {/* Drawer Panel */}
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                    className="fixed right-0 top-0 bottom-0 h-screen w-80 lg:w-96 bg-white/95 dark:bg-dark-200/95 backdrop-blur-xl border-l border-slate-200 dark:border-white/10 shadow-2xl z-50 flex flex-col"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Notification Hub</h3>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase mt-0.5">{unread} Unread</p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => dispatch(markAllNotifRead())}
                          disabled={unread === 0}
                          className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline font-bold flex items-center gap-1 disabled:opacity-40"
                        >
                          <Check className="w-3.5 h-3.5" /> Mark all
                        </button>
                        {notifications.length > 0 && (
                          <button
                            onClick={() => dispatch(clearAllNotif())}
                            className="text-[10px] text-rose-500 hover:underline font-bold"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          onClick={() => setNotifOpen(false)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Scrollable list grouped by Date */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 scrollbar-thin">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center space-y-2">
                          <Bell className="w-7 h-7 text-slate-400 mx-auto" />
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">You are all caught up</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Schedule medicine, hydration, workout, or sleep reminders anytime.
                          </p>
                        </div>
                      ) : (
                        ['Today', 'Yesterday', 'Earlier'].map((group) => {
                          const items = notifications.filter((n) => getDateGroupLabel(n.created_at) === group);
                          if (!items.length) return null;

                          return (
                            <div key={group} className="py-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block px-5 mb-1.5">
                                {group}
                              </span>
                              {items.map((n) => {
                                let Icon = Activity;
                                let iconBg = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/15';
                                if (n.category === 'emergency') {
                                  Icon = AlertTriangle;
                                  iconBg = 'bg-rose-500/10 text-rose-500 border-rose-500/15';
                                } else if (n.category === 'medicine') {
                                  Icon = Pill;
                                  iconBg = 'bg-cyan-500/10 text-cyan-500 border-cyan-500/15';
                                } else if (n.category === 'water') {
                                  Icon = Droplets;
                                  iconBg = 'bg-sky-500/10 text-sky-500 border-sky-500/15';
                                } else if (n.category === 'workout') {
                                  Icon = Dumbbell;
                                  iconBg = 'bg-indigo-500/10 text-indigo-500 border-indigo-500/15';
                                } else if (n.category === 'records') {
                                  Icon = FileText;
                                  iconBg = 'bg-amber-500/10 text-amber-500 border-amber-500/15';
                                }

                                return (
                                  <div
                                    key={n.id}
                                    className={`px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors relative group ${
                                      !n.read ? 'bg-primary-500/[0.04] dark:bg-primary-500/[0.05]' : ''
                                    }`}
                                  >
                                    {!n.read && (
                                      <span className="absolute left-2 top-5 w-1.5 h-1.5 rounded-full bg-primary-500" />
                                    )}
                                    <div className="flex gap-3 items-start">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          if (!n.read) await dispatch(markNotifRead(n.id));
                                          setNotifOpen(false);
                                          if (n.route) navigate(n.route);
                                        }}
                                        className="flex gap-3 flex-1 min-w-0 text-left"
                                      >
                                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                                          <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight truncate">
                                            {n.title}
                                          </h4>
                                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-2">
                                            {n.message}
                                          </p>
                                          <span className="text-[10px] text-slate-400 font-medium block mt-1">
                                            {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                                          </span>
                                        </div>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => dispatch(removeNotif(n.id))}
                                        title="Delete notification"
                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Footer: Manage Reminders */}
                    <div className="p-3 border-t border-slate-200 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          navigate('/notifications');
                        }}
                        className="btn-primary w-full py-2 text-xs"
                      >
                        Manage Reminders & Notification Centre
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-xs font-bold">
                {getInitials(user?.name)}
              </div>
              <span className="hidden md:block text-sm font-semibold text-slate-700 dark:text-slate-200 max-w-[100px] truncate">{user?.name?.split(' ')[0]}</span>
              <ChevronDown className="hidden md:block w-4 h-4 text-slate-400" />
            </button>

            <AnimatePresence>
              {userOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 w-52 glass-card p-1.5 z-50"
                >
                  <div className="px-3 py-2 mb-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                  </div>
                  <hr className="border-slate-200 dark:border-white/10 mb-1" />
                  {[
                    { label: 'Profile', icon: User, path: '/profile' },
                    { label: 'Settings', icon: Settings, path: '/settings' },
                  ].map(item => (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setUserOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  ))}
                  <hr className="border-slate-200 dark:border-white/10 my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
