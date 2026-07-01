import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Flame, Clock, Play, CheckCircle, Plus, TrendingUp, Timer, Sparkles } from 'lucide-react';
import { FITNESS_TYPES } from '../utils/constants';

const exercises = [
  { id: 1, name: 'Push-ups', sets: 3, reps: 15, category: 'Chest', muscle: 'Pectorals' },
  { id: 2, name: 'Squats', sets: 4, reps: 12, category: 'Legs', muscle: 'Quadriceps' },
  { id: 3, name: 'Plank', sets: 3, duration: '60s', category: 'Core', muscle: 'Abdominals' },
  { id: 4, name: 'Running', sets: 1, duration: '30m', category: 'Cardio', muscle: 'Full Body' },
  { id: 5, name: 'Bicep Curls', sets: 3, reps: 12, category: 'Arms', muscle: 'Biceps' }
];
import Badge from '../components/ui/Badge';
import CalorieChart from '../components/charts/CalorieChart';
import { generateWorkoutPlan } from '../services/aiApi';
import { useDispatch, useSelector } from 'react-redux';
import { fetchHealthData, logFitnessWorkout } from '../redux/slices/healthSlice';
import StructuredResponse from '../components/StructuredResponse';

function ProgressRing({ value, max, color, size = 80, label, sublabel }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / max) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={color} strokeWidth={6}
            strokeDasharray={`${circumference} ${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - progress }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black text-slate-900 dark:text-white">{Math.round((value / max) * 100)}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-slate-900 dark:text-white">{label}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{sublabel}</div>
      </div>
    </div>
  );
}

export default function Fitness() {
  const dispatch = useDispatch();
  const [filter, setFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('workouts');

  // AI Workout plan states
  const [showAiPlan, setShowAiPlan] = useState(false);
  const [aiPlanText, setAiPlanText] = useState('');
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  
  // Log Workout Modal States
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [workoutForm, setWorkoutForm] = useState({
    name: '',
    type: 'Cardio',
    duration: '',
    calories: '',
    completed: true,
    date: new Date().toISOString().split('T')[0]
  });

  const { user } = useSelector(s => s.auth);
  const { workouts = [], metrics } = useSelector(s => s.health);

  // Real metrics from MongoDB
  const stepsCount = metrics?.steps?.count || 0;
  const stepsTarget = metrics?.steps?.target || 10000;

  useEffect(() => {
    dispatch(fetchHealthData());
  }, [dispatch]);

  const filteredWorkouts = workouts.filter(w => filter === 'All' || w.type === filter);
  const totalCalories = workouts.reduce((s, w) => s + (w.completed ? w.calories : 0), 0);
  const totalMinutes = workouts.reduce((s, w) => s + (w.completed ? w.duration : 0), 0);

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    if (!workoutForm.name || !workoutForm.duration || !workoutForm.calories) return;

    try {
      await dispatch(logFitnessWorkout({
        name: workoutForm.name,
        type: workoutForm.type,
        duration: parseInt(workoutForm.duration) || 0,
        calories: parseInt(workoutForm.calories) || 0,
        completed: workoutForm.completed,
        date: workoutForm.date
      })).unwrap();

      setWorkoutForm({
        name: '',
        type: 'Cardio',
        duration: '',
        calories: '',
        completed: true,
        date: new Date().toISOString().split('T')[0]
      });
      setLogModalOpen(false);
    } catch (err) {
      console.error("Failed to log workout:", err);
    }
  };

  const handleGenerateWorkout = async () => {
    setShowAiPlan(true);
    setAiPlanLoading(true);
    setAiPlanText('');
    try {
      const data = await generateWorkoutPlan({
        age: user?.age || 28,
        weight: user?.weight || "72 kg",
        height: user?.height || "5'10\"",
        fitness_level: "Intermediate",
        goals: "Build lean muscle, increase cardiovascular endurance, and dynamic flexibility"
      });
      setAiPlanText(data.plan);
    } catch (err) {
      console.error(err);
      setAiPlanText("I apologize, but I am unable to connect to the AI Workout Routine Generator right now. Please try again later.");
    } finally {
      setAiPlanLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">Fitness & Gym</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Track workouts and monitor your progress</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={handleGenerateWorkout}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-550 to-accent-550 bg-primary-600 hover:bg-primary-750 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-glow-primary hover:opacity-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            AI Workout Planner
          </button>
          <button 
            onClick={() => setLogModalOpen(true)}
            className="btn-primary py-2.5 px-5 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Log Workout
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Cal Burned', value: totalCalories, icon: Flame, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'Minutes Active', value: totalMinutes, icon: Clock, color: 'text-primary-500', bg: 'bg-primary-500/10' },
          { label: 'Workouts Done', value: workouts.filter(w => w.completed).length, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
          { label: 'Streak', value: '5 days', icon: TrendingUp, color: 'text-rose-500', bg: 'bg-rose-500/10' },
        ].map(stat => (
          <div key={stat.label} className="glass-card p-4">
            <div className={`w-10 h-10 rounded-2xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white">{stat.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Progress Rings + Chart */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-card p-6">
          <h3 className="section-title mb-6 text-base">Weekly Goals</h3>
          <div className="flex items-center justify-around">
            <ProgressRing value={stepsCount} max={stepsTarget} color="#6366f1" size={90} label="Steps" sublabel={`${stepsCount.toLocaleString()} / ${stepsTarget.toLocaleString()}`} />
            <ProgressRing value={totalCalories} max={2000} color="#f59e0b" size={90} label="Calories" sublabel={`${totalCalories} / 2000`} />
            <ProgressRing value={totalMinutes} max={300} color="#22c55e" size={90} label="Active Min" sublabel={`${totalMinutes} / 300`} />
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="section-title mb-4 text-base">Calories Burned — This Week</h3>
          <CalorieChart height={150} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 pb-0">
        {['workouts', 'exercises'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all capitalize ${activeTab === tab ? 'border-primary-600 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'workouts' ? (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto">
            {FITNESS_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${filter === type ? 'bg-primary-600 text-white' : 'glass-card text-slate-600 dark:text-slate-400'}`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filteredWorkouts.map((workout, i) => (
              <motion.div
                key={workout.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                className="glass-card p-4 flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${workout.completed ? 'bg-green-500/20' : 'bg-slate-100 dark:bg-white/5'}`}>
                  <Dumbbell className={`w-5 h-5 ${workout.completed ? 'text-green-500' : 'text-slate-400'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">{workout.name}</h3>
                    <Badge variant={workout.type === 'Cardio' ? 'accent' : workout.type === 'Strength' ? 'primary' : 'ghost'}>
                      {workout.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Timer className="w-3 h-3" />{workout.duration} min</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Flame className="w-3 h-3" />{workout.calories} cal</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {workout.completed ? (
                    <Badge variant="success" dot>Done</Badge>
                  ) : (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold">
                      <Play className="w-3 h-3" /> Start
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exercises.map((ex, i) => (
            <motion.div
              key={ex.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="glass-card p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-500/10 flex items-center justify-center">
                  <Dumbbell className="w-5 h-5 text-primary-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">{ex.name}</h3>
                  <Badge variant="ghost">{ex.category}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-2">
                  <div className="font-bold text-slate-900 dark:text-white text-sm">{ex.sets}</div>
                  <div className="text-[10px] text-slate-400">Sets</div>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-2">
                  <div className="font-bold text-slate-900 dark:text-white text-sm">{ex.reps || ex.duration}</div>
                  <div className="text-[10px] text-slate-400">{ex.reps ? 'Reps' : 'Duration'}</div>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Targets: {ex.muscle}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Log Workout Modal */}
      <AnimatePresence>
        {logModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLogModalOpen(false)}
            />
            <motion.div 
              className="relative w-full max-w-md bg-white dark:bg-dark-200 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-6"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/5 mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Dumbbell className="w-5 h-5 text-primary-500" />
                  Log Daily Workout
                </h3>
                <button 
                  onClick={() => setLogModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-slate-350 transition-all font-bold text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleLogSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Workout Name</label>
                  <input
                    type="text"
                    value={workoutForm.name}
                    onChange={e => setWorkoutForm({ ...workoutForm, name: e.target.value })}
                    placeholder="e.g. Evening Jog, Bench Press"
                    className="input-field"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Workout Type</label>
                    <select
                      value={workoutForm.type}
                      onChange={e => setWorkoutForm({ ...workoutForm, type: e.target.value })}
                      className="input-field"
                      required
                    >
                      <option value="Cardio">Cardio</option>
                      <option value="Strength">Strength</option>
                      <option value="Flexibility">Flexibility</option>
                      <option value="Sport">Sport</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
                    <input
                      type="date"
                      value={workoutForm.date}
                      onChange={e => setWorkoutForm({ ...workoutForm, date: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration (mins)</label>
                    <input
                      type="number"
                      value={workoutForm.duration}
                      onChange={e => setWorkoutForm({ ...workoutForm, duration: e.target.value })}
                      placeholder="30"
                      className="input-field"
                      min={1}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Est. Calories (kcal)</label>
                    <input
                      type="number"
                      value={workoutForm.calories}
                      onChange={e => setWorkoutForm({ ...workoutForm, calories: e.target.value })}
                      placeholder="250"
                      className="input-field"
                      min={1}
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setLogModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 font-semibold text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-750 text-white font-semibold text-sm transition-all"
                  >
                    Save Workout
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Workout Plan Modal */}
      <AnimatePresence>
        {showAiPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAiPlan(false)}
            />
            <motion.div 
              className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-dark-200 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-6 overflow-y-auto"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/5 mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary-500 animate-pulse" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your AI Gym & Exercise Routine</h3>
                </div>
                <button 
                  onClick={() => setShowAiPlan(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-slate-350 transition-all font-bold text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              {aiPlanLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Consulting HealthAI personal trainer...</p>
                </div>
              ) : (
                <div className="max-w-none text-sm leading-relaxed">
                  <StructuredResponse text={aiPlanText} type="fitness" />
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-white/5 mt-6 flex justify-end">
                <button
                  onClick={() => setShowAiPlan(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black font-semibold text-sm transition-all"
                >
                  Close Plan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
