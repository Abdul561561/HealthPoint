import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Activity, Heart, Shield, Bot, UserCheck, Pill,
  ArrowRight, Star, ChevronDown, Dumbbell,
  Apple, Zap, CheckCircle, Lock, TrendingUp,
  MapPin, FileText, Ambulance, BarChart3,
  Phone, Mail,
  Menu, X, Sparkles, Award, Globe, Clock,
} from 'lucide-react';

const Twitter = Globe;
const Linkedin = Shield;
const Instagram = Heart;

/* ─────────────── DATA ─────────────── */
const features = [
  {
    icon: Bot,
    title: 'AI Health Assistant',
    desc: 'Get 24/7 instant medical guidance, symptom analysis, and personalized health recommendations powered by Gemini AI.',
    color: 'indigo',
    gradient: 'from-indigo-500 to-violet-600',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/20',
  },
  {
    icon: UserCheck,
    title: 'Find Nearby Doctors',
    desc: 'Discover verified specialists near you, check real-time availability, and book appointments in under 2 minutes.',
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-600',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
  {
    icon: Pill,
    title: 'Smart Pharmacy',
    desc: 'Order medicines online, set medication reminders, and get genuine products delivered at your doorstep.',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  {
    icon: Ambulance,
    title: 'Emergency SOS',
    desc: 'One-tap emergency alert system that notifies your contacts, shares your location, and connects you to nearby hospitals instantly.',
    color: 'rose',
    gradient: 'from-rose-500 to-red-600',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
  },
  {
    icon: FileText,
    title: 'Medical Records',
    desc: 'Store, manage, and share all your health documents securely. Access your complete medical history anytime.',
    color: 'amber',
    gradient: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  {
    icon: Shield,
    title: 'AI Insurance Assistant',
    desc: 'Compare health plans, file claims, and get AI-powered guidance to maximize your insurance coverage effortlessly.',
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/20',
  },
  {
    icon: BarChart3,
    title: 'Health Analytics',
    desc: 'Advanced ML-powered dashboards showing cardiovascular risk, sleep quality trends, and actionable wellness insights.',
    color: 'blue',
    gradient: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  {
    icon: Dumbbell,
    title: 'Fitness & Nutrition',
    desc: 'AI workout planner, calorie tracker, macro goals, and personalized meal plans tailored to your health profile.',
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/20',
  },
];

const testimonials = [
  {
    name: 'Priya Sharma',
    role: 'Software Engineer, Bangalore',
    avatar: 'PS',
    text: 'HealthPoint detected my iron deficiency from symptom patterns before I even visited a doctor. The AI assistant is genuinely impressive. I recommend it to everyone in my family.',
    rating: 5,
    color: 'from-rose-500 to-pink-600',
  },
  {
    name: 'Dr. Rajesh Nair',
    role: 'Cardiologist, Mumbai',
    avatar: 'RN',
    text: 'As a doctor, I recommend HealthPoint to all my patients. The health analytics section gives them real insights. The appointment management system has streamlined my practice significantly.',
    rating: 5,
    color: 'from-blue-500 to-indigo-600',
  },
  {
    name: 'Anita Gupta',
    role: 'Homemaker, Delhi',
    avatar: 'AG',
    text: 'Managing medical records for my entire family of five used to be a nightmare. Now everything is in one place. The insurance claim assistance saved us hours of paperwork during my husband\'s surgery.',
    rating: 5,
    color: 'from-emerald-500 to-teal-600',
  },
  {
    name: 'Arjun Mehta',
    role: 'Startup Founder, Hyderabad',
    avatar: 'AM',
    text: 'The Emergency SOS feature gave me peace of mind during my mother\'s health scare. One tap and help was on its way. This app literally saved her life.',
    rating: 5,
    color: 'from-amber-500 to-orange-600',
  },
];

const faqs = [
  {
    q: 'Is HealthPoint suitable for Indian healthcare users?',
    a: 'Absolutely. HealthPoint is built specifically for Indian users with support for Indian insurance providers, nearby hospital networks, Indian dietary recommendations, and local doctor discovery across 500+ cities.',
  },
  {
    q: 'How does the AI Health Assistant work?',
    a: 'Our AI assistant is powered by Google Gemini and is trained on medical knowledge bases. It analyzes your symptoms, health history, and vitals to provide personalized recommendations. It is not a replacement for professional medical advice but a powerful first-line tool.',
  },
  {
    q: 'Is my health data secure?',
    a: 'We use bank-level AES-256 encryption for all stored data, JWT-secured authentication, and follow strict data privacy standards. Your health data is never shared without your explicit consent.',
  },
  {
    q: 'Can I book doctor appointments through HealthPoint?',
    a: 'Yes. You can browse verified doctors by specialty, location, and availability, and book in-person or online consultations directly through the platform.',
  },
  {
    q: 'Is HealthPoint free to use?',
    a: 'HealthPoint offers a full-featured free tier. Premium features such as advanced AI analytics, unlimited records storage, and priority doctor appointments are available on our paid plans.',
  },
  {
    q: 'How does the Emergency SOS feature work?',
    a: 'When you trigger the SOS, the app immediately notifies your emergency contacts with your GPS location, dials emergency services, and displays the nearest hospitals on a map.',
  },
];

const statsData = [
  { value: 2000000, display: '2M+', label: 'Registered Users', icon: Globe, suffix: '' },
  { value: 50000, display: '50K+', label: 'Verified Doctors', icon: UserCheck, suffix: '' },
  { value: 5000000, display: '50L+', label: 'Reports Managed', icon: FileText, suffix: '' },
  { value: 1200000, display: '12L+', label: 'Appointments Booked', icon: Clock, suffix: '' },
];

/* ─────────────── COUNTER ─────────────── */
function AnimatedCounter({ target, display, duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, duration]);

  return (
    <span ref={ref}>
      {count >= target ? display : count.toLocaleString('en-IN')}
    </span>
  );
}

/* ─────────────── FAQ ITEM ─────────────── */
function FaqItem({ q, a, index }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className="border border-white/10 rounded-2xl overflow-hidden bg-white/3 backdrop-blur-sm"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left gap-4 hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <span className="font-semibold text-white text-sm sm:text-base leading-snug">{q}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"
        >
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-4">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────────── MAIN COMPONENT ─────────────── */
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navLinks = ['Features', 'About', 'Contact'];

  return (
    <div className="min-h-screen bg-[#060818] text-white overflow-x-hidden">

      {/* ── Ambient Background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] max-w-[900px] max-h-[900px] bg-indigo-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-cyan-600/10 rounded-full blur-[100px]" />
        <div className="absolute top-[40%] left-[40%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-violet-600/8 rounded-full blur-[80px]" />
        {/* Subtle grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#060818]/90 backdrop-blur-xl border-b border-white/8 shadow-2xl' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group" aria-label="HealthPoint Home">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:shadow-indigo-500/40 transition-all">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-lg tracking-tight">
              Health<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Point</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(item => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-sm text-slate-400 hover:text-white transition-colors font-medium"
              >
                {item}
              </a>
            ))}
            <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors font-medium">Features</a>
          </div>

          {/* CTA buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-white/5"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all"
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-[#0a0f1e]/95 backdrop-blur-xl border-b border-white/10 overflow-hidden"
            >
              <div className="px-6 py-4 space-y-3">
                {[...navLinks, 'Features'].map(item => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase()}`}
                    onClick={() => setMenuOpen(false)}
                    className="block text-slate-400 hover:text-white py-2 font-medium text-sm transition-colors"
                  >
                    {item}
                  </a>
                ))}
                <div className="flex gap-3 pt-2 border-t border-white/10">
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2.5 rounded-xl border border-white/15 text-sm text-slate-300 hover:bg-white/5 transition-colors font-medium">
                    Sign In
                  </Link>
                  <Link to="/signup" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-sm text-white font-semibold transition-all">
                    Get Started
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section id="home" className="relative min-h-screen flex items-center pt-16">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left — Copy */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-sm font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  India's #1 AI-Powered Healthcare Platform
                </span>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight"
              >
                Your Complete
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-400">
                  Health Partner
                </span>
                <br />
                <span className="text-slate-300">Powered by AI</span>
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-lg text-slate-400 max-w-xl leading-relaxed"
              >
                Monitor vitals, consult top doctors, manage prescriptions, track fitness, handle insurance claims — all in one intelligent, secure platform built for India.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap items-center gap-4"
              >
                <Link
                  to="/signup"
                  className="group flex items-center gap-2 px-7 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-base shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all"
                >
                  Start for Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-7 py-4 rounded-2xl border border-white/15 text-slate-300 hover:text-white hover:border-white/30 hover:bg-white/5 font-semibold text-base transition-all"
                >
                  Sign In
                </Link>
              </motion.div>

              {/* Trust badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex flex-wrap items-center gap-6 pt-2"
              >
                {[
                  { icon: CheckCircle, text: 'Free to use' },
                  { icon: Lock, text: 'Encrypted & Secure' },
                  { icon: Award, text: 'DISHA Compliant' },
                ].map(item => (
                  <div key={item.text} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <item.icon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    {item.text}
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right — Dashboard Mockup */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="relative hidden lg:block"
            >
              {/* Main health card */}
              <div className="relative">
                <div className="bg-white/5 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 shadow-2xl">
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold">Today's Health Score</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-5xl font-black text-white">87</span>
                        <span className="text-xl text-indigo-400 font-bold">/100</span>
                      </div>
                      <p className="text-emerald-400 text-xs font-semibold mt-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> +5 from yesterday
                      </p>
                    </div>
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
                      <Activity className="w-10 h-10 text-white" />
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Heart Rate', value: '72 bpm', color: 'text-rose-400', icon: Heart },
                      { label: 'Blood Pressure', value: '120/80', color: 'text-indigo-400', icon: Activity },
                      { label: 'Sleep', value: '7.5 hrs', color: 'text-cyan-400', icon: Clock },
                    ].map(m => (
                      <div key={m.label} className="bg-white/5 rounded-2xl p-3 text-center">
                        <m.icon className={`w-4 h-4 ${m.color} mx-auto mb-1.5`} />
                        <div className={`font-bold text-sm ${m.color}`}>{m.value}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Steps progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-medium">Daily Steps</span>
                      <span className="text-white font-bold">8,420 / 10,000</span>
                    </div>
                    <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '84.2%' }}
                        transition={{ delay: 1, duration: 1.5, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Floating card 1 - Heart rate */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-10 -right-8 bg-white/8 backdrop-blur-2xl border border-white/15 rounded-2xl px-4 py-3 shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center">
                      <Heart className="w-4.5 h-4.5 text-rose-400" />
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm">72 bpm</div>
                      <div className="text-[10px] text-emerald-400 font-semibold">Normal ✓</div>
                    </div>
                  </div>
                </motion.div>

                {/* Floating card 2 - AI */}
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="absolute -bottom-8 -left-8 bg-white/8 backdrop-blur-2xl border border-white/15 rounded-2xl px-4 py-3 shadow-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                      <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm">AI Analysis</div>
                      <div className="text-[10px] text-cyan-400 font-semibold">Health Optimal ✓</div>
                    </div>
                  </div>
                </motion.div>

                {/* Floating card 3 - Appointment */}
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                  className="absolute top-1/2 -right-12 bg-white/8 backdrop-blur-2xl border border-white/15 rounded-2xl px-4 py-3 shadow-xl"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                      <div className="text-white font-bold text-xs">Dr. Priya Nair</div>
                      <div className="text-[10px] text-slate-400">Today, 4:30 PM</div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        >
          <span className="text-xs text-slate-600 font-medium">Scroll to explore</span>
          <ChevronDown className="w-5 h-5 text-slate-600" />
        </motion.div>
      </section>

      {/* ═══════════ STATS ═══════════ */}
      <section className="py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/5 via-transparent to-cyan-600/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {statsData.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center p-6 rounded-2xl bg-white/3 border border-white/8 backdrop-blur-sm hover:bg-white/5 hover:border-white/15 transition-all group"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <stat.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white mb-1">
                  <AnimatedCounter target={stat.value} display={stat.display} />
                </div>
                <div className="text-slate-500 text-sm font-medium">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-4">
              <Zap className="w-3 h-3" />
              Everything You Need
            </span>
            <h2 className="text-4xl sm:text-5xl font-black mb-4">
              Healthcare,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                Reinvented
              </span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
              8 powerful modules working together to give you complete control over your health — from daily monitoring to emergency response.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ y: -6, scale: 1.02 }}
                className={`group relative p-6 rounded-2xl bg-white/3 border ${f.border} backdrop-blur-sm hover:bg-white/6 transition-all cursor-default overflow-hidden`}
              >
                {/* Gradient glow on hover */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-5`} />
                
                <div className={`relative w-12 h-12 rounded-2xl ${f.bg} border ${f.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <f.icon className={`w-6 h-6 ${f.text}`} />
                </div>
                <h3 className="relative font-bold text-white mb-2 text-sm leading-snug">{f.title}</h3>
                <p className="relative text-slate-500 text-xs leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="about" className="py-24 px-4 sm:px-6 lg:px-8 bg-white/2">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold uppercase tracking-widest mb-4">
              Simple & Fast
            </span>
            <h2 className="text-4xl sm:text-5xl font-black mb-4">How HealthPoint Works</h2>
            <p className="text-slate-400 max-w-xl mx-auto">Get started in 3 simple steps and take control of your health today.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-indigo-500/30 via-cyan-500/30 to-emerald-500/30" />

            {[
              { step: '01', title: 'Create Your Profile', desc: 'Sign up and fill in your health profile — vitals, medical history, blood group, and emergency contacts.', icon: UserCheck, gradient: 'from-indigo-500 to-violet-600' },
              { step: '02', title: 'Connect Your Health Data', desc: 'Log your daily vitals, book doctor appointments, order medicines, and upload medical records securely.', icon: Activity, gradient: 'from-cyan-500 to-blue-600' },
              { step: '03', title: 'Get AI-Powered Insights', desc: 'Our AI analyzes your data, predicts health risks, and gives you personalized recommendations to stay healthy.', icon: Sparkles, gradient: 'from-emerald-500 to-teal-600' },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative text-center p-8 rounded-2xl bg-white/3 border border-white/8 hover:border-white/15 transition-all"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mx-auto mb-5 shadow-xl`}>
                  <item.icon className="w-8 h-8 text-white" />
                </div>
                <div className="absolute top-6 right-6 text-5xl font-black text-white/5">{item.step}</div>
                <h3 className="font-bold text-white text-lg mb-3">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ TESTIMONIALS ═══════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-4xl sm:text-5xl font-black mb-3">
              Loved by{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-400">
                Millions
              </span>{' '}
              of Indians
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">Real stories from real patients who transformed their health with HealthPoint.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className="p-6 rounded-2xl bg-white/3 border border-white/8 hover:border-white/15 backdrop-blur-sm transition-all"
              >
                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                    {t.avatar}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section id="contact" className="py-24 px-4 sm:px-6 lg:px-8 bg-white/2">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl sm:text-5xl font-black mb-3">
              Frequently Asked{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                Questions
              </span>
            </h2>
            <p className="text-slate-400">Everything you need to know about HealthPoint.</p>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FaqItem key={i} q={faq.q} a={faq.a} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA BANNER ═══════════ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden p-12 text-center"
          >
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-blue-600/20 to-cyan-600/20 border border-indigo-500/25 rounded-3xl backdrop-blur-sm" />
            <div className="absolute inset-0 bg-[#060818]/40" />

            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/30">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-4xl sm:text-5xl font-black mb-4">
                Start Your Health Journey{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                  Today
                </span>
              </h2>
              <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
                Join 2 million+ Indians who've taken control of their health with HealthPoint. Free to get started, no credit card required.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link
                  to="/signup"
                  className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-base shadow-xl shadow-indigo-500/30 hover:-translate-y-0.5 transition-all"
                >
                  Create Free Account
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/20 text-slate-300 hover:text-white hover:border-white/35 hover:bg-white/5 font-semibold text-base transition-all"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="border-t border-white/8 py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <span className="font-extrabold text-lg">
                  Health<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Point</span>
                </span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
                India's AI-powered healthcare ecosystem. Bringing quality healthcare to every Indian.
              </p>
              <div className="flex gap-3">
                {[Twitter, Linkedin, Instagram].map((Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Links */}
            {[
              {
                title: 'Product',
                links: ['Features', 'Health Analytics', 'AI Assistant', 'Doctors', 'Pharmacy'],
              },
              {
                title: 'Company',
                links: ['About Us', 'Blog', 'Careers', 'Press', 'Partners'],
              },
              {
                title: 'Legal',
                links: ['Privacy Policy', 'Terms of Service', 'HIPAA Compliance', 'Cookie Policy', 'Contact'],
              },
            ].map(col => (
              <div key={col.title}>
                <h4 className="font-bold text-white text-sm mb-4">{col.title}</h4>
                <ul className="space-y-2.5">
                  {col.links.map(link => (
                    <li key={link}>
                      <a href="#" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-600 text-sm">© 2026 HealthPoint Technologies Pvt. Ltd. All rights reserved.</p>
            <div className="flex items-center gap-2 text-slate-600 text-xs">
              <Phone className="w-3.5 h-3.5" />
              <span>1800-XXX-XXXX</span>
              <span className="mx-2">•</span>
              <Mail className="w-3.5 h-3.5" />
              <span>support@healthpoint.in</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
