import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import {
  Calendar, FileText, Dumbbell, Activity, Heart, Clock,
  ArrowRight, Sparkles, Filter, CheckCircle2, ChevronRight
} from 'lucide-react';
import { fetchHealthData } from '../redux/slices/healthSlice';
import { formatDate } from '../utils/helpers';
import Badge from '../components/ui/Badge';

export default function Timeline() {
  const dispatch = useDispatch();
  const { workouts = [], appointments = [], records = [], metrics, loading } = useSelector((s) => s.health);
  const [filterType, setFilterType] = useState('All');

  useEffect(() => {
    dispatch(fetchHealthData());
  }, [dispatch]);

  // Combine and sort events
  const getTimelineEvents = () => {
    const events = [];

    // Add Workouts
    workouts.forEach(w => {
      events.push({
        id: `workout_${w.id || w._id || Math.random()}`,
        type: 'workout',
        title: `Workout Completed: ${w.name}`,
        date: new Date(w.date),
        rawDate: w.date,
        icon: Dumbbell,
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        borderColor: 'border-amber-500/30',
        details: `${w.duration} mins active · Burned ${w.calories} kcal`,
        category: w.type,
      });
    });

    // Add Appointments
    appointments.forEach(a => {
      events.push({
        id: `appt_${a.id || a._id || Math.random()}`,
        type: 'appointment',
        title: `Doctor Visit: ${a.doctor}`,
        date: new Date(a.date),
        rawDate: a.date,
        icon: Calendar,
        color: 'text-primary-500 bg-primary-500/10 border-primary-500/20',
        borderColor: 'border-primary-500/30',
        details: `${a.specialty} consultation scheduled at ${a.time}`,
        status: a.status,
      });
    });

    // Add Medical Records
    records.forEach(r => {
      events.push({
        id: `record_${r.id || r._id || Math.random()}`,
        type: 'record',
        title: `Lab Test Uploaded: ${r.title}`,
        date: new Date(r.date),
        rawDate: r.date,
        icon: FileText,
        color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
        borderColor: 'border-cyan-500/30',
        details: `Category: ${r.category} · Doctor: ${r.doctor || 'Dr. Mitchell'}`,
        status: r.status,
      });
    });

    // Add Vitals Logs from metrics history if available
    if (metrics?.heartRate?.current) {
      events.push({
        id: `vitals_today`,
        type: 'vitals',
        title: `Daily Vitals Registered`,
        date: new Date(), // Today
        rawDate: new Date().toISOString().split('T')[0],
        icon: Activity,
        color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        borderColor: 'border-rose-500/30',
        details: `Heart Rate: ${metrics.heartRate.current} bpm · Blood Pressure: ${metrics.bloodPressure?.systolic || 120}/${metrics.bloodPressure?.diastolic || 80} mmHg`,
      });
    }

    // Sort: newest first
    return events.sort((a, b) => b.date - a.date);
  };

  const allEvents = getTimelineEvents();
  const filteredEvents = allEvents.filter(e => filterType === 'All' || e.type === filterType.toLowerCase());

  const filterTabs = [
    { label: 'All', type: 'All' },
    { label: 'Workouts', type: 'workout' },
    { label: 'Appointments', type: 'appointment' },
    { label: 'Records', type: 'record' },
    { label: 'Vitals', type: 'vitals' },
  ];

  if (loading && allEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold animate-pulse">Loading Chronological Timeline...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
          <Clock className="w-6 h-6 text-primary-500" />
          Health Timeline
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-semibold">
          Your complete chronological healthcare feed including vitals logged, scans uploaded, and workouts.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1.5 border-b border-slate-200 dark:border-white/10">
        {filterTabs.map(tab => (
          <button
            key={tab.label}
            onClick={() => setFilterType(tab.type)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              (filterType === tab.type || (tab.type !== 'All' && filterType.toLowerCase() === tab.type))
                ? 'bg-primary-600 text-white shadow-glow-primary'
                : 'glass-card text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      {filteredEvents.length === 0 ? (
        <div className="glass-card p-12 text-center border-2 border-dashed border-slate-200 dark:border-white/10">
          <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3 animate-pulse" />
          <h4 className="font-bold text-slate-800 dark:text-white text-base">No timeline events found</h4>
          <p className="text-xs text-slate-500 mt-1">Try selecting a different filter or log a daily vital to build the feed.</p>
        </div>
      ) : (
        <div className="relative space-y-6 pl-6 lg:pl-10">
          {/* Vertical axis line */}
          <div className="absolute left-[13px] lg:left-[17px] top-3 bottom-3 w-0.5 bg-slate-200 dark:bg-white/10" />

          {filteredEvents.map((event, index) => {
            const Icon = event.icon;
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className="relative flex gap-4 lg:gap-6 items-start"
              >
                {/* Node icon */}
                <div className={`w-7 h-7 lg:w-9 lg:h-9 rounded-xl border flex items-center justify-center flex-shrink-0 z-10 relative shadow-sm ${event.color}`}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Timeline Event Card */}
                <div className={`flex-1 glass-card p-4 hover:scale-[1.01] hover:shadow-md transition-all duration-300 border ${event.borderColor}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <h3 className="font-black text-xs lg:text-sm text-slate-900 dark:text-white">
                      {event.title}
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(event.rawDate)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-350 font-semibold mb-2 pl-0.5">
                    {event.details}
                  </p>

                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-2.5 mt-2.5">
                    <div className="flex gap-2">
                      {event.category && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-[9px] font-bold text-slate-500 rounded uppercase">
                          {event.category}
                        </span>
                      )}
                      {event.status && (
                        <Badge variant={event.status === 'confirmed' || event.status === 'normal' ? 'success' : 'warning'} dot>
                          {event.status}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-primary-500 font-bold">
                      <span>Clinical Insight available</span>
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
