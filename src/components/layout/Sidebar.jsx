import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  LayoutDashboard, UserCheck, ShoppingBag, Bot, FileText,
  Dumbbell, Shield, Apple, AlertTriangle, Settings, User,
  ChevronLeft, ChevronRight, Activity, X, Video, TrendingUp, Clock
} from 'lucide-react';
import { toggleSidebarCollapse, setSidebarOpen } from '../../redux/slices/uiSlice';
import { useAuth } from '../../hooks/useAuth';
import { getInitials } from '../../utils/helpers';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/analytics', label: 'Analytics', icon: TrendingUp },
  { path: '/timeline', label: 'Timeline', icon: Clock },
  { path: '/doctors', label: 'Doctors', icon: UserCheck },
  { path: '/pharmacy', label: 'Pharmacy', icon: ShoppingBag },
  { path: '/ai-assistant', label: 'AI Assistant', icon: Bot },
  { path: '/records', label: 'Health Records', icon: FileText },
  { path: '/fitness', label: 'Fitness & Gym', icon: Dumbbell },
  { path: '/insurance', label: 'Insurance', icon: Shield },
  { path: '/nutrition', label: 'Nutrition', icon: Apple },
  { path: '/emergency', label: 'Emergency SOS', icon: AlertTriangle, danger: true },
];

const bottomItems = [
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/profile', label: 'Profile', icon: User },
];

export default function Sidebar() {
  const dispatch = useDispatch();
  const { sidebarOpen, sidebarCollapsed } = useSelector((s) => s.ui);
  const { user } = useAuth();

  const email = user?.email?.toLowerCase() || "";
  const role = user?.role?.toLowerCase() || "";
  const isAdmin = role === 'admin' || email === 'alex.johnson@email.com' || email.includes('admin') || email.includes('khader');

  const visibleNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(isAdmin ? [{ path: '/admin', label: 'Admin Command', icon: Shield }] : []),
    ...navItems.filter(item => item.path !== '/dashboard')
  ];

  const sidebarVariants = {
    open: { x: 0, opacity: 1 },
    closed: { x: '-100%', opacity: 0 },
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dispatch(setSidebarOpen(false))}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`
          fixed top-0 left-0 h-screen z-40 flex flex-col
          bg-white dark:bg-dark-200 border-r border-slate-200/80 dark:border-white/5
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-20' : 'w-64'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}
      >
        {/* Header */}
        <div className={`flex items-center h-16 px-4 border-b border-slate-200/80 dark:border-white/5 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-glow-primary">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                Health<span className="text-primary-500">Point</span>
              </span>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => dispatch(toggleSidebarCollapse())}
              className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              onClick={() => dispatch(setSidebarOpen(false))}
              className="flex lg:hidden items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleNavItems.map(({ path, label, icon: Icon, danger }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => window.innerWidth < 1024 && dispatch(setSidebarOpen(false))}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 group relative
                ${danger
                  ? isActive
                    ? 'bg-rose-500 text-white shadow-glow-rose'
                    : 'text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                  : isActive
                    ? 'bg-primary-600 text-white shadow-glow-primary'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                }
              `}
              title={sidebarCollapsed ? label : ''}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${danger ? '' : ''}`} />
              {!sidebarCollapsed && <span>{label}</span>}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="px-3 pb-4 space-y-1 border-t border-slate-200/80 dark:border-white/5 pt-3">
          {bottomItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => window.innerWidth < 1024 && dispatch(setSidebarOpen(false))}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 group relative
                ${isActive
                  ? 'bg-primary-600 text-white shadow-glow-primary'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                }
              `}
              title={sidebarCollapsed ? label : ''}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {label}
                </div>
              )}
            </NavLink>
          ))}

          {/* User mini profile */}
          {!sidebarCollapsed && (
            <div className="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {getInitials(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="mt-2 flex justify-center">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold">
                {getInitials(user?.name)}
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
