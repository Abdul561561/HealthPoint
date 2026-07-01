import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings as SettingsIcon, Bell, Lock, Shield, Sun, Moon,
  HelpCircle, Check, Loader2
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

const DEFAULT_NOTIFICATIONS = {
  appointmentReminders: true,
  medicationAlerts: true,
  healthTips: false,
  emergencyAlerts: true,
  weeklyReport: true,
  marketingEmails: false,
};

export default function Settings() {
  const { mode, toggle, isDark } = useTheme();
  const { user } = useAuth();

  const [activeSection, setActiveSection] = useState('general');
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [twoFactor, setTwoFactor] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  // Load settings from MongoDB on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get('/settings/');
        if (res.data) {
          if (res.data.notifications) setNotifications(res.data.notifications);
          if (typeof res.data.twoFactor === 'boolean') setTwoFactor(res.data.twoFactor);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  // Save notification preferences to MongoDB
  const handleToggleNotification = async (key) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    try {
      await api.put('/settings/', { notifications: updated });
      showToast('Notification preference saved!');
    } catch (err) {
      console.error('Failed to save notification pref:', err);
      setNotifications(notifications); // revert
      showToast('Failed to save preference.', 'error');
    }
  };

  // Save 2FA toggle to MongoDB
  const handleToggle2FA = async () => {
    const newVal = !twoFactor;
    setTwoFactor(newVal);
    try {
      await api.put('/settings/', { twoFactor: newVal });
      showToast('2FA setting updated!');
    } catch (err) {
      console.error('Failed to save 2FA setting:', err);
      setTwoFactor(!newVal);
      showToast('Failed to save 2FA setting.', 'error');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/settings/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed successfully!');
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Failed to change password.';
      showToast(detail, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast */}
      {toast.visible && (
        <div className={`fixed bottom-6 right-6 z-55 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 font-semibold text-sm animate-float text-white ${
          toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
        }`}>
          <Check className="w-4 h-4" />
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-primary-500" />
          Settings
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure your account security, notification alerts, and theme preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Tabs */}
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'general', label: 'General Prefs', icon: SettingsIcon },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'security', label: 'Security & Login', icon: Lock }
          ].map((sec) => {
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeSection === sec.id
                    ? 'bg-primary-600 text-white shadow-glow-primary'
                    : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/50 dark:border-white/5'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings Body */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6">

            {/* General Preferences */}
            {activeSection === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-250/50 dark:border-white/5">General Preferences</h3>
                  <p className="text-xs text-slate-450 mt-1">Customize your theme interface settings.</p>
                </div>

                {/* Theme toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Display Theme</h4>
                    <p className="text-xs text-slate-400">Switch between light and dark display mode.</p>
                  </div>
                  <button
                    onClick={toggle}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-semibold flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white transition-all"
                  >
                    {isDark ? (
                      <><Sun className="w-4 h-4 text-amber-500" /><span>Light Mode</span></>
                    ) : (
                      <><Moon className="w-4 h-4 text-primary-500" /><span>Dark Mode</span></>
                    )}
                  </button>
                </div>

                {/* Account info */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 space-y-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Account</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Logged in as <span className="font-semibold text-primary-500">{user?.email || 'N/A'}</span></p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Member since <span className="font-semibold">{user?.memberSince || 'N/A'}</span></p>
                </div>

                {/* Help section */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-primary-500/5 border border-primary-500/10">
                  <div className="w-8 h-8 rounded-lg bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
                    <HelpCircle className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Need help?</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">If you're having issues with account verification or sync delay on health tracking devices, consult our online Help Center or contact support.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Notification Preferences */}
            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-250/50 dark:border-white/5">Notification Preferences</h3>
                  <p className="text-xs text-slate-450 mt-1">All changes are saved automatically to your account.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'appointmentReminders', label: 'Appointment Reminders', desc: 'Get notified 24 hours prior to booking slot.' },
                    { key: 'medicationAlerts', label: 'Medication Alerts', desc: 'Get daily reminders for scheduled prescriptions.' },
                    { key: 'emergencyAlerts', label: 'SOS & Emergency Alerts', desc: 'Broadcast notifications during active alarm distress.' },
                    { key: 'healthTips', label: 'Health & Wellness Tips', desc: 'Receive AI generated diet recommendations.' },
                    { key: 'weeklyReport', label: 'Weekly Summary Report', desc: 'Summary of heart rate, steps, and sleep statistics.' },
                    { key: 'marketingEmails', label: 'Promotional Offers', desc: 'Discount coupon codes on pharmacy checkouts.' }
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5">
                      <div className="space-y-0.5 min-w-0 pr-4">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.label}</h4>
                        <p className="text-xs text-slate-400 truncate">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => handleToggleNotification(item.key)}
                        className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 outline-none ${
                          notifications[item.key] ? 'bg-primary-600' : 'bg-slate-300 dark:bg-white/10'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                          notifications[item.key] ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Security Settings */}
            {activeSection === 'security' && (
              <form onSubmit={handleChangePassword} className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-250/50 dark:border-white/5">Security & Password</h3>
                  <p className="text-xs text-slate-450 mt-1">Update passwords and secure credentials. All changes are saved to your account.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Account Email Address</label>
                    <input
                      type="email"
                      readOnly
                      value={user?.email || ''}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent dark:text-white opacity-70 cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Current Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-400">New Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-400">Confirm New Password</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                      />
                    </div>
                  </div>

                  {/* 2FA switch */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 mt-4">
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        Two-Factor Authentication (2FA)
                      </h4>
                      <p className="text-xs text-slate-400">Sign in with a verification code sent to your phone.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggle2FA}
                      className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 outline-none ${
                        twoFactor ? 'bg-primary-600' : 'bg-slate-300 dark:bg-white/10'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                        twoFactor ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || !currentPassword || !newPassword}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white text-sm font-semibold shadow-glow-primary hover:opacity-95 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
