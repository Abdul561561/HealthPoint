import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchHealthData, updateHealthMetric } from '../redux/slices/healthSlice';
import { fetchLatestPrescription } from '../redux/slices/pharmacySlice';
import {
  Heart, Activity, Moon, Flame, Footprints, Droplets,
  Calendar, FileText, Bot, Pill, AlertTriangle, Dumbbell,
  ArrowRight, Clock, TrendingUp, ChevronRight, Check, Award, FlameKindling, Info
} from 'lucide-react';
import { useHealthData } from '../hooks/useHealthData';
import { useAuth } from '../hooks/useAuth';
import HealthCard from '../components/shared/HealthCard';
import HeartRateChart from '../components/charts/HeartRateChart';
import SleepChart from '../components/charts/SleepChart';
import BloodPressureChart from '../components/charts/BloodPressureChart';
import CalorieChart from '../components/charts/CalorieChart';
import Badge from '../components/ui/Badge';
import { formatDate, getStatusColor, getInitials } from '../utils/helpers';

const quickActions = [
  { id: 1, label: 'Book Appointment', icon: Calendar, color: 'indigo', path: '/doctors' },
  { id: 2, label: 'Order Medicine', icon: Pill, color: 'cyan', path: '/pharmacy' },
  { id: 3, label: 'Medical Records', icon: FileText, color: 'violet', path: '/records' },
  { id: 4, label: 'Ask AI', icon: Bot, color: 'rose', path: '/ai-assistant' },
  { id: 5, label: 'Emergency SOS', icon: AlertTriangle, danger: true, path: '/emergency' },
  { id: 6, label: 'Fitness Tracker', icon: Dumbbell, color: 'green', path: '/fitness' }
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export default function Dashboard() {
  const { metrics, appointments, records, workouts } = useHealthData();
  const { user } = useAuth();
  const dispatch = useDispatch();
  const { loading } = useSelector((s) => s.health);
  const { uploadedPrescription } = useSelector((s) => s.pharmacy);

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [formVitals, setFormVitals] = useState({
    heartRate: '',
    bpSystolic: '',
    bpDiastolic: '',
    sleepHours: '',
    stepsCount: '',
    waterIntake: '',
    oxygenLevel: '',
    temperature: ''
  });

  // Checklist state for medication reminders
  const [checkedPills, setCheckedPills] = useState({});

  const [quote, setQuote] = useState({ text: "It is health that is real wealth and not pieces of gold and silver.", author: "Mahatma Gandhi" });
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  useEffect(() => {
    const HEALTH_QUOTES = [
      { text: "It is health that is real wealth and not pieces of gold and silver.", author: "Mahatma Gandhi" },
      { text: "To ensure good health: eat lightly, breathe deeply, live moderately, cultivate cheerfulness.", author: "William Londen" },
      { text: "He who has health has hope; and he who has hope has everything.", author: "Arabian Proverb" },
      { text: "A healthy outside starts from the inside.", author: "Robert Urich" },
      { text: "The groundwork of all happiness is health.", author: "James Leigh Hunt" },
      { text: "An ounce of prevention is worth a pound of cure.", author: "Benjamin Franklin" }
    ];
    setQuote(HEALTH_QUOTES[Math.floor(Math.random() * HEALTH_QUOTES.length)]);

    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    dispatch(fetchHealthData());
    dispatch(fetchLatestPrescription());
  }, [dispatch]);

  const handleOpenModal = () => {
    setFormVitals({
      heartRate: metrics?.heartRate?.current || '',
      bpSystolic: metrics?.bloodPressure?.systolic || '',
      bpDiastolic: metrics?.bloodPressure?.diastolic || '',
      sleepHours: metrics?.sleep?.hours || '',
      stepsCount: metrics?.steps?.count || '',
      waterIntake: metrics?.water?.intake || '',
      oxygenLevel: metrics?.oxygen?.level || '',
      temperature: metrics?.temperature?.value || ''
    });
    setIsLogModalOpen(true);
  };

  const handleQuickWaterLog = async () => {
    const currentWater = metrics?.water?.intake || 0;
    try {
      await dispatch(updateHealthMetric({
        key: 'water',
        value: { intake: currentWater + 1 }
      })).unwrap();
      dispatch(fetchHealthData());
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveVitals = async (e) => {
    e.preventDefault();
    try {
      const updates = [];
      
      if (formVitals.heartRate !== '') {
        const heartRateVal = parseInt(formVitals.heartRate);
        let status = 'normal';
        if (heartRateVal > 100 || heartRateVal < 60) status = 'warning';
        updates.push(dispatch(updateHealthMetric({
          key: 'heartRate',
          value: { current: heartRateVal, status }
        })));
      }
      
      if (formVitals.bpSystolic !== '' || formVitals.bpDiastolic !== '') {
        const sys = parseInt(formVitals.bpSystolic) || 120;
        const dia = parseInt(formVitals.bpDiastolic) || 80;
        let status = 'normal';
        if (sys > 140 || sys < 90 || dia > 90 || dia < 60) status = 'warning';
        updates.push(dispatch(updateHealthMetric({
          key: 'bloodPressure',
          value: { systolic: sys, diastolic: dia, status }
        })));
      }
      
      if (formVitals.sleepHours !== '') {
        const hours = parseFloat(formVitals.sleepHours);
        let quality = 'Good';
        if (hours < 6) quality = 'Poor';
        else if (hours > 9) quality = 'Excellent';
        updates.push(dispatch(updateHealthMetric({
          key: 'sleep',
          value: { hours, quality }
        })));
      }
      
      if (formVitals.stepsCount !== '') {
        updates.push(dispatch(updateHealthMetric({
          key: 'steps',
          value: { count: parseInt(formVitals.stepsCount) }
        })));
      }
      
      if (formVitals.waterIntake !== '') {
        updates.push(dispatch(updateHealthMetric({
          key: 'water',
          value: { intake: parseInt(formVitals.waterIntake) }
        })));
      }
      
      if (formVitals.oxygenLevel !== '') {
        const level = parseInt(formVitals.oxygenLevel);
        let status = 'normal';
        if (level < 95) status = 'warning';
        updates.push(dispatch(updateHealthMetric({
          key: 'oxygen',
          value: { level, status }
        })));
      }
      
      if (formVitals.temperature !== '') {
        const temp = parseFloat(formVitals.temperature);
        let status = 'normal';
        if (temp > 99.5 || temp < 97.0) status = 'warning';
        updates.push(dispatch(updateHealthMetric({
          key: 'temperature',
          value: { value: temp, status }
        })));
      }
      
      await Promise.all(updates);
      setIsLogModalOpen(false);
      dispatch(fetchHealthData());
    } catch (err) {
      console.error(err);
    }
  };

  const getRealTimeHealthScore = () => {
    if (!metrics) return 80;
    
    const hr = metrics.heartRate?.current ?? 0;
    const sys = metrics.bloodPressure?.systolic ?? 0;
    const dia = metrics.bloodPressure?.diastolic ?? 0;
    const sleep = metrics.sleep?.hours ?? 0;
    const steps = metrics.steps?.count ?? 0;
    const water = metrics.water?.intake ?? 0;
    
    if (hr === 0 && sys === 0 && dia === 0 && sleep === 0 && steps === 0 && water === 0) {
      return 80; // Baseline default
    }
    
    const hr_current = hr > 0 ? hr : 72;
    const bp_sys = sys > 0 ? sys : 120;
    const sleep_hrs = sleep > 0 ? sleep : 7.5;
    const steps_count = steps > 0 ? steps : 8420;
    const bmi_val = metrics.bmi?.value || 22.8;
    
    const sleep_score = Math.max(0, Math.min(100, 100 - (Math.abs(8.0 - sleep_hrs) * 15)));
    const activity_score = Math.min(100, (steps_count / 10000.0) * 100);
    const heart_score = Math.max(0, 100 - (Math.abs(70 - hr_current) * 2));
    const bp_score = Math.max(0, 100 - (Math.abs(120 - bp_sys) * 2));
    
    let bmi_score = 100;
    if (bmi_val > 0) {
      if (bmi_val >= 18.5 && bmi_val <= 25.0) {
        bmi_score = 100;
      } else if (bmi_val > 25.0) {
        bmi_score = Math.max(0, 100 - ((bmi_val - 25.0) * 5));
      } else {
        bmi_score = Math.max(0, 100 - ((18.5 - bmi_val) * 8));
      }
    }
    
    return Math.round((sleep_score + activity_score + heart_score + bp_score + bmi_score) / 5);
  };

  const healthScore = getRealTimeHealthScore();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const metricCards = [
    {
      title: 'Heart Rate',
      value: metrics?.heartRate?.current ?? 0,
      unit: 'bpm',
      icon: Heart,
      color: 'rose',
      trend: 'down',
      trendValue: '3%',
      subtitle: `Normal range: ${metrics?.heartRate?.min ?? 60}–${metrics?.heartRate?.max ?? 100} bpm`,
    },
    {
      title: 'Blood Pressure',
      value: metrics?.bloodPressure?.systolic ? `${metrics.bloodPressure.systolic}/${metrics.bloodPressure.diastolic}` : '0/0',
      unit: 'mmHg',
      icon: Activity,
      color: 'primary',
      trend: 'up',
      trendValue: '1.2%',
      subtitle: 'Optimal: 120/80 mmHg',
    },
    {
      title: 'Sleep',
      value: metrics?.sleep?.hours ?? 0,
      unit: 'hrs',
      icon: Moon,
      color: 'violet',
      trend: 'up',
      trendValue: '0.5h',
      subtitle: `Quality: ${metrics?.sleep?.quality ?? 'N/A'}`,
    },
    {
      title: 'Calories Burned',
      value: (metrics?.calories?.burned ?? 0).toLocaleString(),
      unit: 'kcal',
      icon: Flame,
      color: 'amber',
      trend: 'up',
      trendValue: '8%',
      subtitle: `Intake: ${metrics?.calories?.intake ?? 0} kcal`,
    },
    {
      title: 'Steps Today',
      value: (metrics?.steps?.count ?? 0).toLocaleString(),
      unit: 'steps',
      icon: Footprints,
      color: 'green',
      trend: 'up',
      trendValue: '12%',
      subtitle: `Goal: ${(metrics?.steps?.target ?? 10000).toLocaleString()}`,
    },
    {
      title: 'Water Intake',
      value: metrics?.water?.intake ?? 0,
      unit: 'glasses',
      icon: Droplets,
      color: 'accent',
      trend: 'down',
      trendValue: '2',
      subtitle: `Daily goal: ${metrics?.water?.target ?? 8} glasses`,
    },
  ];

  // Concentric circle attributes
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;

  // Skeleton Loader elements
  if (loading && (!metrics || metrics?.heartRate?.current === 0)) {
    return (
      <div className="space-y-6 animate-pulse p-4 lg:p-6">
        <div className="h-16 bg-slate-200 dark:bg-white/10 rounded-2xl w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="h-40 bg-slate-200 dark:bg-white/10 rounded-3xl col-span-2" />
          <div className="h-40 bg-slate-200 dark:bg-white/10 rounded-3xl col-span-1" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 dark:bg-white/10 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const missionItems = [
    { label: 'Drink 8 glasses of water', current: metrics?.water?.intake || 0, target: 8, done: (metrics?.water?.intake || 0) >= 8 },
    { label: 'Walk 5,000 steps', current: metrics?.steps?.count || 0, target: 5000, done: (metrics?.steps?.count || 0) >= 5000 },
    { label: 'Sleep 8 hours', current: metrics?.sleep?.hours || 0, target: 8, done: (metrics?.sleep?.hours || 0) >= 8 },
    { label: 'Check off medicines', done: Object.keys(checkedPills).length > 0 || (uploadedPrescription?.analysis?.medicines?.length === 0) },
    { label: 'Today\'s appointments check', done: appointments.length > 0 }
  ];
  const completedMissions = missionItems.filter(m => m.done).length;
  const missionProgress = Math.round((completedMissions / missionItems.length) * 100);

  return (
    <div className="space-y-6">
      {/* ── TOP SECTION: PREMIUM FITBIT-STYLE HEADER ──────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 border-2 border-primary-500/10"
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-base font-black shadow-glow-primary flex-shrink-0">
            {getInitials(user?.name)}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-none">
              {greeting}, {user?.name?.split(' ')[0]} 👋
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2 font-bold">
              <span>{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span>{currentTime}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="flex items-center gap-1">⛅ 26°C Bengaluru</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Health Score Ring & Ring Info */}
          <div className="flex items-center gap-2.5 bg-slate-100/60 dark:bg-white/5 p-2 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-sm">
            <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
              <svg className="w-10 h-10 -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="3" />
                <motion.circle 
                  cx="20" cy="20" r="16" fill="none" 
                  stroke="url(#headerIndigoCyanGrad)" strokeWidth="3" 
                  strokeDasharray={2 * Math.PI * 16} 
                  initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 16 - (healthScore / 100) * (2 * Math.PI * 16) }} 
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                  strokeLinecap="round" 
                />
                <defs>
                  <linearGradient id="headerIndigoCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute text-[9px] font-black text-slate-900 dark:text-white">{healthScore}</span>
            </div>
            <div className="pr-1">
              <span className="text-[8px] font-bold text-slate-400 uppercase block leading-none">Health Score</span>
              <span className="text-[11px] font-black text-slate-800 dark:text-white mt-1 block">Good</span>
            </div>
          </div>

          {/* Daily Streak */}
          <div className="flex items-center gap-1.5 bg-rose-500/10 px-3 py-2 rounded-2xl text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold shadow-sm">
            <span>🔥</span>
            <span>5 Days Streak</span>
          </div>

          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white rounded-2xl font-bold shadow-lg shadow-primary-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs cursor-pointer h-10"
          >
            <Activity className="w-4 h-4" />
            Log Vitals
          </button>
        </div>
      </motion.div>

      {/* ── MAIN DASHBOARD LAYOUT GRID ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (lg:col-span-2) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Today's Mission Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-5 border border-primary-500/10"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 dark:border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Today's Health Mission</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Focus Areas & Targets</p>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-450 block">Overall Completion</span>
                  <span className="text-xs font-black text-primary-500">{missionProgress}%</span>
                </div>
                <div className="w-16 h-2 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${missionProgress}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {missionItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      item.done 
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20' 
                        : 'bg-slate-100 dark:bg-white/5 text-slate-400 border border-slate-200/50 dark:border-white/10'
                    }`}>
                      {item.done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span className="text-[8px] font-bold">{idx+1}</span>}
                    </div>
                    <span className={`text-[11px] font-bold truncate ${item.done ? 'text-slate-550 line-through opacity-70' : 'text-slate-700 dark:text-slate-350'}`}>
                      {item.label}
                    </span>
                  </div>
                  {item.target && (
                    <span className="text-[9px] font-extrabold text-slate-400 flex-shrink-0">
                      {item.current}/{item.target}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Health Metric Cards Grid */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 gap-4"
          >
            {metricCards.map(card => (
              <motion.div key={card.title} variants={item} className="hover:scale-[1.03] transition-transform">
                <HealthCard {...card} />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Right Column (lg:col-span-1) */}
        <div className="space-y-6">
          
          {/* Today's Weather Widget */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-5 border border-primary-500/10 relative overflow-hidden"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Local Weather Conditions</span>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">Bengaluru, India</h3>
                <span className="text-xs font-bold text-primary-500 block mt-1">Light Shower Rain</span>
              </div>
              <div className="text-3xl">⛅</div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 mt-5 pt-4 border-t border-slate-150 dark:border-white/5 text-center">
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Temp</span>
                <strong className="text-sm font-black text-slate-800 dark:text-white mt-1 block">26°C</strong>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">Humidity</span>
                <strong className="text-sm font-black text-slate-800 dark:text-white mt-1 block">74%</strong>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 block uppercase">UV Index</span>
                <strong className="text-sm font-black text-rose-500 mt-1 block">3 Low</strong>
              </div>
            </div>

            <div className="mt-4 p-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 flex items-center justify-between text-[10px] font-bold text-slate-500">
              <span>Air Quality Index:</span>
              <span className="text-emerald-500 flex items-center gap-1">🟢 48 Good</span>
            </div>
          </motion.div>

          {/* Daily Motivation Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-5 border border-amber-500/10 bg-gradient-to-br from-amber-500/[0.03] to-transparent"
          >
            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest block">Daily Motivation</span>
            <p className="text-xs text-slate-705 dark:text-slate-300 italic font-semibold leading-relaxed mt-2.5">
              "{quote.text}"
            </p>
            <span className="text-[10px] text-slate-400 font-bold block text-right mt-2">— {quote.author}</span>
          </motion.div>

          {/* Water Intake & Sleep Logger Widget */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-5 border-2 border-accent-500/10 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-white/5 pb-2.5">
              <div>
                <span className="text-[10px] font-bold text-accent-500 uppercase tracking-widest block">Interactive Logs</span>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Hydration & Sleep</h3>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-600 dark:text-accent-400 font-bold">Today</span>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2 mt-2">
              <div className="flex flex-col gap-1 justify-center">
                <div className="text-xs font-semibold text-slate-705 dark:text-slate-350">
                  Water: {metrics?.water?.intake || 0}/{metrics?.water?.target || 8} glasses
                </div>
                <button
                  onClick={handleQuickWaterLog}
                  className="mt-1 px-3 py-1 bg-accent-500/10 hover:bg-accent-500/20 text-accent-600 dark:text-accent-400 border border-accent-500/15 font-bold rounded-lg text-[9px] flex items-center justify-center gap-1 transition-all"
                >
                  💧 Log 1 glass
                </button>
              </div>

              <div className="flex flex-col gap-1 justify-center border-l border-slate-150 dark:border-white/5 pl-4">
                <div className="text-xs font-semibold text-slate-705 dark:text-slate-350">
                  Sleep: {metrics?.sleep?.hours || 0} hrs
                </div>
                <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wide">
                  Target: {metrics?.sleep?.target || 8} hrs
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── QUICK ACTIONS PANEL ───────────────────────────────────────── */}
      <motion.div variants={container} initial="hidden" animate="show">
        <div className="flex items-center justify-between mb-3 pl-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Digital Healthcare Gateway</h3>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const colorClass = action.danger 
              ? 'from-rose-500 to-red-600 shadow-rose-500/15'
              : action.color === 'indigo'
              ? 'from-primary-500 to-primary-700 shadow-primary-500/15'
              : action.color === 'cyan'
              ? 'from-accent-500 to-accent-700 shadow-accent-500/15'
              : action.color === 'violet'
              ? 'from-violet-500 to-violet-700 shadow-violet-500/15'
              : action.color === 'rose'
              ? 'from-rose-400 to-rose-600 shadow-rose-500/15'
              : 'from-green-500 to-green-700 shadow-green-500/15';

            return (
              <motion.div key={action.id} variants={item} className="hover:scale-[1.04] transition-all">
                <Link
                  to={action.path}
                  className="glass-card p-4 flex flex-col items-center gap-2 text-center h-full border border-slate-150 dark:border-white/5"
                >
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${colorClass} flex items-center justify-center shadow-lg`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-tight block mt-0.5">{action.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ── CHARTS ROW ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Heart Rate Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-5 border border-slate-150 dark:border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Heart Rate Trend</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Biometric Pulse</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10">
              <Heart className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              <span className="text-[10px] font-bold text-rose-500">{metrics?.heartRate?.current ?? 0} bpm</span>
            </div>
          </div>
          <HeartRateChart height={180} />
        </motion.div>

        {/* Sleep Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-5 border border-slate-150 dark:border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Sleep Quality</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Circadian Rhythm</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/10">
              <Moon className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-500">{metrics?.sleep?.hours ?? 0}h avg</span>
            </div>
          </div>
          <SleepChart height={180} />
        </motion.div>

        {/* Blood Pressure */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-5 border border-slate-150 dark:border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Blood Pressure</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Vascular Resistance</p>
            </div>
            <Badge variant="success" dot>Normal</Badge>
          </div>
          <BloodPressureChart height={180} />
        </motion.div>

        {/* Calorie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5 border border-slate-150 dark:border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Active Calories</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Metabolic Burn</p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold text-amber-500">{metrics?.calories?.burned ?? 0} kcal</span>
            </div>
          </div>
          <CalorieChart height={180} />
        </motion.div>
      </div>

      {/* ── BOTTOM ROW: APPOINTMENTS + RECORDS + PILL REMINDERS ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* COLUMN 1: Upcoming Appointments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card p-5 flex flex-col justify-between border border-slate-150 dark:border-white/5"
        >
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-white/5 pb-2.5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Doctor Visits</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Appointments</p>
              </div>
              <Link to="/doctors" className="text-[10px] text-primary-500 hover:text-primary-400 font-bold flex items-center gap-0.5">
                Consult <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {appointments.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                  <p className="text-xs text-slate-500 font-semibold">No appointments scheduled</p>
                  <Link to="/doctors" className="mt-2 inline-block px-3 py-1.5 bg-primary-500/15 hover:bg-primary-500/25 text-primary-600 dark:text-primary-400 text-[10px] font-bold rounded-lg transition-all border border-primary-500/20">
                    Book a doctor
                  </Link>
                </div>
              ) : (
                appointments.slice(0, 3).map(appt => (
                  <div key={appt.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-4 h-4 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">{appt.doctor}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{appt.specialty}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] text-slate-500 font-medium">{formatDate(appt.date)} · {appt.time}</span>
                      </div>
                    </div>
                    <Badge variant={appt.status === 'confirmed' ? 'success' : 'warning'} dot>
                      {appt.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>

        {/* COLUMN 2: Recent Records */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-5 flex flex-col justify-between border border-slate-150 dark:border-white/5"
        >
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-white/5 pb-2.5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Medical Records</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Laboratory Reports</p>
              </div>
              <Link to="/records" className="text-[10px] text-primary-500 hover:text-primary-400 font-bold flex items-center gap-0.5">
                Upload <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {records.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                  <p className="text-xs text-slate-500 font-semibold">No medical reports scanned</p>
                  <Link to="/records" className="mt-2 inline-block px-3 py-1.5 bg-accent-500/15 hover:bg-accent-500/25 text-accent-600 dark:text-accent-400 text-[10px] font-bold rounded-lg transition-all border border-accent-500/20">
                    Upload Lab Test
                  </Link>
                </div>
              ) : (
                records.slice(0, 3).map(record => (
                  <div key={record.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5">
                    <div className="w-9 h-9 rounded-xl bg-accent-500/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-accent-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">{record.title}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{formatDate(record.date)}</p>
                    </div>
                    <Badge variant={getStatusColor(record.status)}>
                      {record.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>

        {/* COLUMN 3: Pill reminders checklist */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="glass-card p-5 border border-slate-150 dark:border-white/5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-white/5 pb-2.5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Pill Reminders</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Medicine Scheduler</p>
              </div>
              <Link to="/pharmacy" className="text-[10px] text-primary-500 hover:text-primary-400 font-bold flex items-center gap-0.5">
                Pharmacy <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {uploadedPrescription?.analysis?.medicines?.length > 0 ? (
                uploadedPrescription.analysis.medicines.map((pill, idx) => {
                  const isChecked = checkedPills[idx] === true;
                  const when = (pill.when_to_have || '').toLowerCase();
                  const isMorning = when.includes('morning') || when.includes('breakfast');
                  const isAfternoon = when.includes('afternoon') || when.includes('lunch');
                  const isNight = when.includes('night') || when.includes('dinner') || when.includes('bedtime');
                  
                  let timeLabel = 'Daily';
                  let timeColor = 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400';
                  if (isMorning) {
                    timeLabel = 'Morning';
                    timeColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
                  } else if (isAfternoon) {
                    timeLabel = 'Afternoon';
                    timeColor = 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
                  } else if (isNight) {
                    timeLabel = 'Night';
                    timeColor = 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400';
                  }

                  return (
                    <div
                      key={idx}
                      onClick={() => setCheckedPills({ ...checkedPills, [idx]: !isChecked })}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                        isChecked 
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-slate-500' 
                          : 'bg-slate-50 dark:bg-white/5 border-slate-150 dark:border-white/5 hover:border-violet-500/30'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isChecked 
                          ? 'bg-emerald-500 border-emerald-500 text-white' 
                          : 'border-slate-350 dark:border-white/20'
                      }`}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <strong className={`text-xs font-black truncate leading-tight ${isChecked ? 'line-through opacity-55' : 'text-slate-900 dark:text-white'}`}>
                            {pill.name}
                          </strong>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${timeColor}`}>
                            {timeLabel}
                          </span>
                        </div>
                        <p className={`text-[9px] mt-0.5 font-medium leading-none ${isChecked ? 'opacity-40' : 'text-slate-450'}`}>{pill.when_to_have}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                  <Pill className="w-8 h-8 text-slate-300 mx-auto mb-1.5 animate-pulse" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No active medications</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Upload a prescription in the Pharmacy center to build your checklist.</p>
                  <Link to="/pharmacy" className="mt-2 inline-block px-3 py-1.5 bg-primary-500/15 hover:bg-primary-500/25 text-primary-600 dark:text-primary-400 text-[10px] font-bold rounded-lg border border-primary-500/20 transition-all">
                    Go to Pharmacy
                  </Link>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── VITALS LOG MODAL ──────────────────────────────────────────── */}
      <AnimatePresence>
        {isLogModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl glass-card border border-white/10 shadow-2xl z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/40">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Log Your Daily Vitals</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Input your actual physiological measurements below.</p>
                </div>
                <button
                  onClick={() => setIsLogModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white/10 transition-colors"
                >
                  &times;
                </button>
              </div>
              
              {/* Form */}
              <form onSubmit={handleSaveVitals} className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  {/* Heart Rate */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Heart Rate (bpm)</label>
                    <input
                      type="number"
                      placeholder="e.g. 72"
                      value={formVitals.heartRate}
                      onChange={e => setFormVitals({ ...formVitals, heartRate: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Oxygen Level */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">SpO2 Oxygen (%)</label>
                    <input
                      type="number"
                      placeholder="e.g. 98"
                      value={formVitals.oxygenLevel}
                      onChange={e => setFormVitals({ ...formVitals, oxygenLevel: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Systolic BP */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">BP Systolic (mmHg)</label>
                    <input
                      type="number"
                      placeholder="e.g. 120"
                      value={formVitals.bpSystolic}
                      onChange={e => setFormVitals({ ...formVitals, bpSystolic: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Diastolic BP */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">BP Diastolic (mmHg)</label>
                    <input
                      type="number"
                      placeholder="e.g. 80"
                      value={formVitals.bpDiastolic}
                      onChange={e => setFormVitals({ ...formVitals, bpDiastolic: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Sleep Hours */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Sleep Duration (hrs)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 7.5"
                      value={formVitals.sleepHours}
                      onChange={e => setFormVitals({ ...formVitals, sleepHours: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Steps today */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Steps Count</label>
                    <input
                      type="number"
                      placeholder="e.g. 10000"
                      value={formVitals.stepsCount}
                      onChange={e => setFormVitals({ ...formVitals, stepsCount: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Water intake */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Water Intake (glasses)</label>
                    <input
                      type="number"
                      placeholder="e.g. 8"
                      value={formVitals.waterIntake}
                      onChange={e => setFormVitals({ ...formVitals, waterIntake: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                  
                  {/* Temperature */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Temperature (°F)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 98.6"
                      value={formVitals.temperature}
                      onChange={e => setFormVitals({ ...formVitals, temperature: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-semibold"
                    />
                  </div>
                </div>
                
                {/* Submit buttons */}
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/5 bg-slate-900/20">
                  <button
                    type="button"
                    onClick={() => setIsLogModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 text-sm font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform text-sm shadow-lg shadow-primary-500/20 cursor-pointer"
                  >
                    Save Vitals
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
