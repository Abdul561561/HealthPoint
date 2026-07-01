import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Shield, Heart, HeartPulse, Sparkles, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const isLogin = location.pathname.includes('/login');

  return (
    <div className="min-h-screen flex bg-[#060818] text-white relative overflow-hidden">
      
      {/* ── Background Glows ── */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* ── Left Side: Interactive Illustration & Motivation ── */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-16 relative overflow-hidden border-r border-white/5">
        <div className="absolute inset-0 bg-[#080d24]/40" />
        
        {/* Header Branding */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-extrabold text-2xl tracking-tight">
            Health<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Point</span>
          </span>
        </div>

        {/* Dynamic Center Illustration */}
        <div className="relative z-10 my-auto space-y-12">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login-left"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="space-y-6"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Your Care, Automated
                </div>
                <h2 className="text-5xl font-black leading-tight tracking-tight">
                  Welcome Back to<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-400">
                    Smarter Health
                  </span>
                </h2>
                <p className="text-slate-400 text-lg max-w-md leading-relaxed">
                  Sign in to monitor your vitals, view AI risk predictions, book appointments, and check pharmacy deliveries.
                </p>

                {/* Animated Health Monitor Card */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/5 border border-white/10 rounded-3xl p-6 max-w-sm shadow-2xl relative"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">ECG Vital Monitor</span>
                    <HeartPulse className="w-5 h-5 text-rose-500 animate-pulse" />
                  </div>
                  {/* Fake Pulse Wave SVG */}
                  <svg className="w-full h-16 stroke-rose-500 stroke-2 fill-none mb-3" viewBox="0 0 100 30">
                    <motion.path
                      d="M0,15 L20,15 L25,5 L30,25 L35,15 L50,15 L55,0 L60,30 L65,15 L80,15 L85,10 L90,20 L100,15"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    />
                  </svg>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Pulse: <strong className="text-white">72 bpm</strong></span>
                    <span>Status: <strong className="text-emerald-400">Optimal</strong></span>
                  </div>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="signup-left"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="space-y-6"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-xs font-semibold uppercase tracking-wider">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  Secure Signup
                </div>
                <h2 className="text-5xl font-black leading-tight tracking-tight">
                  Join India's Modern<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400">
                    Health Hub
                  </span>
                </h2>
                <p className="text-slate-400 text-lg max-w-md leading-relaxed">
                  Start your 30-day premium health journey. Get instant AI insights, verify emergency setups, and secure medical coverage.
                </p>

                {/* Features Checklist */}
                <div className="space-y-3.5">
                  {[
                    'Instant Gemini AI Health Assistant',
                    'Verified Local Doctors & Pharmacies',
                    'Frictionless Digital Insurance Claims',
                    'Secure HIPAA-Compliant Lockbox'
                  ].map((text, i) => (
                    <motion.div
                      key={text}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * i }}
                      className="flex items-center gap-3 text-slate-350 text-sm font-medium"
                    >
                      <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      <span>{text}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-slate-650 text-xs font-semibold">
          © 2026 HealthPoint Technologies Pvt. Ltd. All rights reserved.
        </p>
      </div>

      {/* ── Right Side: Card Form Container ── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16 overflow-y-auto max-h-screen">
        <div className="w-full max-w-xl">
          <Outlet />
        </div>
      </div>

    </div>
  );
}
