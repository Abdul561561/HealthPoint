import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, TrendingUp, Heart, Moon, Flame, ShieldAlert,
  CheckCircle, ChevronDown, ChevronUp, RefreshCw, Sparkles,
  ArrowUpRight, ArrowDownRight, Info, AlertTriangle, Footprints
} from 'lucide-react';
import { getAnalyticsDashboard } from '../redux/slices/analyticsSlice';
import SleepChart from '../components/charts/SleepChart';
import CalorieBalanceChart from '../components/charts/CalorieBalanceChart';
import BMITrendChart from '../components/charts/BMITrendChart';

export default function Analytics() {
  const dispatch = useDispatch();
  const { scoreBreakdown, riskPredictions, weeklyReport, loading, error } = useSelector(
    (state) => state.analytics
  );
  const [expandedCard, setExpandedCard] = useState(null);

  useEffect(() => {
    dispatch(getAnalyticsDashboard());
  }, [dispatch]);

  const handleRefresh = () => {
    dispatch(getAnalyticsDashboard());
  };

  // Health Score Gradient / Color mapping
  const getScoreColor = (score) => {
    if (score >= 85) return { stroke: '#22c55e', text: 'text-green-500 bg-green-500/10 border-green-500/20' };
    if (score >= 70) return { stroke: '#eab308', text: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' };
    if (score >= 50) return { stroke: '#f97316', text: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
    return { stroke: '#ef4444', text: 'text-red-500 bg-red-500/10 border-red-500/20' };
  };

  if (loading && !scoreBreakdown) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-4">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 dark:text-slate-400 font-semibold animate-pulse">
          Running Scikit-Learn clinical classifications & calculations...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Analytics Loading Failed</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            {error || 'Unable to communicate with the FastAPI machine learning service.'}
          </p>
        </div>
        <button onClick={handleRefresh} className="btn-primary py-2 px-5 text-sm">
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  // Safety fallback if backend is offline/metrics not ready
  const score = scoreBreakdown?.totalScore || 75;
  const grade = scoreBreakdown?.grade || 'Good';
  const colors = getScoreColor(score);
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="space-y-6 pb-10">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary-500" />
            Advanced Health Analytics
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Biometric analysis compiled on-the-fly via Scikit-Learn prediction models
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 py-2 px-4 text-sm font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Recalculating...' : 'Recalculate Score'}
        </button>
      </div>

      {/* Main Score Gauge and Sub-Scores Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score gauge */}
        <div className="glass-card p-6 flex flex-col items-center justify-center text-center relative overflow-hidden lg:col-span-1">
          <h3 className="section-title text-base mb-6 font-bold w-full text-left">Daily Health Rings</h3>
          
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* SVG Concentric Circles Gauge */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 192 192">
              {/* Outer Ring: Activity (Steps) */}
              <circle
                cx="96"
                cy="96"
                r="80"
                className="stroke-slate-100/50 dark:stroke-slate-800/30"
                strokeWidth="10"
                fill="transparent"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="80"
                stroke="#22c55e"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 80}
                initial={{ strokeDashoffset: 2 * Math.PI * 80 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 80 - ((scoreBreakdown?.activityScore || 70) / 100) * (2 * Math.PI * 80) }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                strokeLinecap="round"
              />

              {/* Middle Ring: Cardiac (Heart Rate) */}
              <circle
                cx="96"
                cy="96"
                r="64"
                className="stroke-slate-100/50 dark:stroke-slate-800/30"
                strokeWidth="10"
                fill="transparent"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="64"
                stroke="#f43f5e"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 64}
                initial={{ strokeDashoffset: 2 * Math.PI * 64 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 64 - ((scoreBreakdown?.heartScore || 80) / 100) * (2 * Math.PI * 64) }}
                transition={{ duration: 1.2, delay: 0.15, ease: 'easeOut' }}
                strokeLinecap="round"
              />

              {/* Inner Ring: Sleep Duration */}
              <circle
                cx="96"
                cy="96"
                r="48"
                className="stroke-slate-100/50 dark:stroke-slate-800/30"
                strokeWidth="10"
                fill="transparent"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="48"
                stroke="#6366f1"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 48}
                initial={{ strokeDashoffset: 2 * Math.PI * 48 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 48 - ((scoreBreakdown?.sleepScore || 75) / 100) * (2 * Math.PI * 48) }}
                transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
                strokeLinecap="round"
              />
            </svg>

            {/* Overall Score Index in center */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-900 dark:text-white leading-none">{score}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Index Score</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <span className={`px-4 py-1.5 rounded-full border text-xs font-bold shadow-sm ${colors.text}`}>
              {grade} Grade
            </span>
            <div className="flex gap-4 mt-4 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] inline-block" /> Steps</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] inline-block" /> Cardiac</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#6366f1] inline-block" /> Sleep</span>
            </div>
          </div>
        </div>

        {/* Sub-scores metrics cards */}
        <div className="glass-card p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="section-title text-base mb-2 font-bold">Health Score Parameters</h3>
            <p className="section-subtitle mb-6">Individual contributing sub-score modules</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Sleep Sub Score */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Sleep Score</span>
                <span className="text-sm font-extrabold text-violet-500">{scoreBreakdown?.sleepScore || 0}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scoreBreakdown?.sleepScore || 0}%` }}
                  transition={{ duration: 1, delay: 0.1 }}
                  className="h-full bg-violet-500 rounded-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Target: 8 hrs optimal rest</p>
            </div>

            {/* Steps Sub Score */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Activity Score</span>
                <span className="text-sm font-extrabold text-green-500">{scoreBreakdown?.activityScore || 0}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scoreBreakdown?.activityScore || 0}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="h-full bg-green-500 rounded-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Target: 10,000 steps daily</p>
            </div>

            {/* Heart Sub Score */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Cardiac Stability</span>
                <span className="text-sm font-extrabold text-rose-500">{scoreBreakdown?.heartScore || 0}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scoreBreakdown?.heartScore || 0}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-full bg-rose-500 rounded-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Target: 60-80 bpm resting pulse</p>
            </div>

            {/* BP Sub Score */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">BP Stability</span>
                <span className="text-sm font-extrabold text-cyan-500">{scoreBreakdown?.bpScore || 0}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scoreBreakdown?.bpScore || 0}%` }}
                  transition={{ duration: 1, delay: 0.4 }}
                  className="h-full bg-cyan-500 rounded-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Target: 120/80 mmHg baseline</p>
            </div>

            {/* BMI Sub Score */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">BMI Index</span>
                <span className="text-sm font-extrabold text-amber-500">{scoreBreakdown?.bmiScore || 0}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scoreBreakdown?.bmiScore || 0}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full bg-amber-500 rounded-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Target: 18.5 - 25.0 Normal BMI</p>
            </div>
            
            {/* Quick Summary Tip */}
            <div className="p-4 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center gap-3">
              <Info className="w-6 h-6 text-primary-500 flex-shrink-0" />
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-normal">
                Optimize your score by sleeping consistently and keeping active walking sessions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ML Clinical Risk Predictions Grid */}
      <div className="space-y-3">
        <h3 className="section-title text-base font-bold">AI Health Risk Predictions</h3>
        <p className="section-subtitle">Real-time classification based on Logistic Regression models</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {riskPredictions?.map((card, i) => {
            const isExpanded = expandedCard === i;
            const levelColor =
              card.color === 'red'
                ? 'text-red-500 bg-red-500/10 border-red-500/20'
                : card.color === 'yellow'
                ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                : 'text-green-500 bg-green-500/10 border-green-500/20';

            return (
              <motion.div
                key={card.name}
                layout
                className="glass-card overflow-hidden hover:shadow-xl transition-all border border-slate-100 dark:border-white/5"
              >
                <div
                  className="p-5 cursor-pointer flex flex-col justify-between"
                  onClick={() => setExpandedCard(isExpanded ? null : i)}
                >
                  <div className="flex items-start justify-between w-full">
                    <h4 className="font-bold text-slate-900 dark:text-white text-base truncate max-w-[70%]">
                      {card.name}
                    </h4>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${levelColor}`}>
                      {card.level} Risk
                    </span>
                  </div>

                  <div className="my-5 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">
                      {card.probability}%
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">Probability</span>
                  </div>

                  {/* Indicator bar */}
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-4">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${card.probability}%` }}
                      transition={{ duration: 1, delay: i * 0.15 }}
                      className={`h-full rounded-full ${
                        card.color === 'red' ? 'bg-red-500' : card.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-primary-500">
                    <span>{isExpanded ? 'Hide Details' : 'View Contributing Factors & Recs'}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5"
                    >
                      <div className="p-5 space-y-4 text-sm">
                        {/* Risk Factors */}
                        <div>
                          <h5 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 mb-2 uppercase tracking-wide">
                            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                            Biometric Risk Factors
                          </h5>
                          <ul className="space-y-1.5">
                            {card.factors.map((fact, idx) => (
                              <li key={idx} className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
                                <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-600" />
                                {fact}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Recommendations */}
                        <div>
                          <h5 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5 mb-2 uppercase tracking-wide">
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            Clinical Recommendations
                          </h5>
                          <ul className="space-y-1.5">
                            {card.recommendations.map((rec, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-slate-600 dark:text-slate-400 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1 flex-shrink-0" />
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Interactive Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sleep Chart Card */}
        <div className="glass-card p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title text-base font-bold">Sleep Quality</h3>
              <p className="section-subtitle">Weekly depth breakdown</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500">
              <Moon className="w-4 h-4" />
            </div>
          </div>
          <SleepChart height={220} />
        </div>

        {/* Calorie Balance Card */}
        <div className="glass-card p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title text-base font-bold">Calorie Balance</h3>
              <p className="section-subtitle">Intake vs. Burned metrics</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <CalorieBalanceChart height={220} />
        </div>

        {/* BMI Weight tracking Card */}
        <div className="glass-card p-5 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="section-title text-base font-bold">Weight & BMI Tracker</h3>
              <p className="section-subtitle">Weekly progress vs. optimal threshold</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <BMITrendChart height={220} />
        </div>
      </div>

      {/* Weekly Report comparative analytics */}
      {weeklyReport && (
        <div className="glass-card p-6">
          <h3 className="section-title text-base mb-2 font-bold">Weekly Performance Report</h3>
          <p className="section-subtitle mb-5">Comparing current biometric performance with previous baseline</p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            {/* Sleep avg */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-between border border-slate-100 dark:border-white/10">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Average Sleep</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {weeklyReport.sleepAvg} hrs
                </span>
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg ${
                weeklyReport.sleepDiff >= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'
              }`}>
                {weeklyReport.sleepDiff >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {Math.abs(weeklyReport.sleepDiff)}%
              </div>
            </div>

            {/* Steps avg */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-between border border-slate-100 dark:border-white/10">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Average Daily Steps</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {weeklyReport.stepsAvg.toLocaleString()}
                </span>
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg ${
                weeklyReport.stepsDiff >= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'
              }`}>
                {weeklyReport.stepsDiff >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {Math.abs(weeklyReport.stepsDiff)}%
              </div>
            </div>

            {/* Calorie avg */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-between border border-slate-100 dark:border-white/10">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Avg Calorie Intake</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {weeklyReport.caloriesAvg.toLocaleString()} kcal
                </span>
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg ${
                weeklyReport.caloriesDiff <= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'
              }`}>
                {weeklyReport.caloriesDiff >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {Math.abs(weeklyReport.caloriesDiff)}%
              </div>
            </div>

            {/* HR avg */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-between border border-slate-100 dark:border-white/10">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Avg Heart Rate</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {weeklyReport.hrAvg} bpm
                </span>
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg ${
                weeklyReport.hrDiff <= 0 ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'
              }`}>
                {weeklyReport.hrDiff >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {Math.abs(weeklyReport.hrDiff)}%
              </div>
            </div>
          </div>

          {/* Report summary card block */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent border border-primary-500/15 flex items-start gap-4">
            <Sparkles className="w-6 h-6 text-primary-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1.5">AI Clinical Health Summary</h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {weeklyReport.summary}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
