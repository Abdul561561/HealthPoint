import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Apple, Flame, Droplets, Plus, Trash2, Search, Sparkles, PlusCircle,
  TrendingUp, Check, ChevronRight, Scale
} from 'lucide-react';
import MacroChart from '../components/charts/MacroChart';
import { generateDietPlan } from '../services/aiApi';
import { useDispatch, useSelector } from 'react-redux';
import api from '../services/api';
import { fetchHealthData, updateHydration } from '../redux/slices/healthSlice';
import StructuredResponse from '../components/StructuredResponse';

const foodDatabase = [
  { name: 'Apple (Medium)', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4 },
  { name: 'Boiled Egg (Large)', calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fiber: 0 },
  { name: 'Avocado Toast (1 slice)', calories: 195, protein: 4.5, carbs: 22, fat: 11, fiber: 6.5 },
  { name: 'Grilled Chicken Breast (100g)', calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
  { name: 'Brown Rice (1 cup cooked)', calories: 215, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5 },
  { name: 'Greek Yogurt (Plain, 150g)', calories: 100, protein: 17, carbs: 6, fat: 0.8, fiber: 0 },
  { name: 'Almonds (1 oz / 28g)', calories: 164, protein: 6, carbs: 6, fat: 14, fiber: 3.5 },
  { name: 'Salmon Fillet (100g cooked)', calories: 206, protein: 22, carbs: 0, fat: 12, fiber: 0 },
  { name: 'Protein Shake (1 scoop whey)', calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 1 },
];

export default function Nutrition() {
  const dispatch = useDispatch();
  const { metrics } = useSelector(state => state.health);
  const { user } = useSelector(state => state.auth);

  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMealTime, setSelectedMealTime] = useState('Breakfast');
  
  // Custom meal modal/form states
  const [showAddCustomMeal, setShowAddCustomMeal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customFiber, setCustomFiber] = useState('');

  // AI Diet plan states
  const [showAiPlan, setShowAiPlan] = useState(false);
  const [aiPlanText, setAiPlanText] = useState('');
  const [aiPlanLoading, setAiPlanLoading] = useState(false);

  // Fetch meals on mount & sync water vitals
  useEffect(() => {
    const loadMeals = async () => {
      try {
        const response = await api.get('/fitness/meals');
        setMeals(response.data);
      } catch (err) {
        console.error("Failed to load meals from MongoDB:", err);
      } finally {
        setMealsLoading(false);
      }
    };
    loadMeals();
    dispatch(fetchHealthData());
  }, [dispatch]);

  // Read water intake and target from Redux (MongoDB persisted)
  const waterGlasses = metrics?.water?.intake || 0;
  const waterTarget = metrics?.water?.target || 8;

  // Daily totals
  const totalCalories = meals.reduce((acc, m) => acc + m.calories, 0);
  const totalProtein = meals.reduce((acc, m) => acc + m.protein, 0);
  const totalCarbs = meals.reduce((acc, m) => acc + m.carbs, 0);
  const totalFat = meals.reduce((acc, m) => acc + m.fat, 0);
  const totalFiber = meals.reduce((acc, m) => acc + m.fiber, 0);

  // Dynamic clinical targets based on real user body parameters
  const targets = {
    calories: metrics?.calories?.target || 2000,
    protein: metrics?.weight?.current ? Math.round(metrics.weight.current * 1.8) : 130, // 1.8g per kg bodyweight
    carbs: metrics?.calories?.target ? Math.round(metrics.calories.target * 0.45 / 4) : 220, // 45% of daily calories
    fat: metrics?.calories?.target ? Math.round(metrics.calories.target * 0.30 / 9) : 65,  // 30% of daily calories
    fiber: 30
  };

  const handleAddMealFromDb = async (food) => {
    const mealPayload = {
      name: food.name,
      time: selectedMealTime,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber
    };
    try {
      const response = await api.post('/fitness/meals', mealPayload);
      setMeals([...meals, response.data]);
      setSearchQuery('');
    } catch (err) {
      console.error("Failed to log meal:", err);
    }
  };

  const handleAddCustomMeal = async (e) => {
    e.preventDefault();
    if (!customName || !customCalories) return;

    const mealPayload = {
      name: customName,
      time: selectedMealTime,
      calories: parseInt(customCalories) || 0,
      protein: parseFloat(customProtein) || 0,
      carbs: parseFloat(customCarbs) || 0,
      fat: parseFloat(customFat) || 0,
      fiber: parseFloat(customFiber) || 0
    };

    try {
      const response = await api.post('/fitness/meals', mealPayload);
      setMeals([...meals, response.data]);
      setCustomName('');
      setCustomCalories('');
      setCustomProtein('');
      setCustomCarbs('');
      setCustomFat('');
      setCustomFiber('');
      setShowAddCustomMeal(false);
    } catch (err) {
      console.error("Failed to log custom meal:", err);
    }
  };

  const handleDeleteMeal = async (id) => {
    try {
      await api.delete(`/fitness/meals/${id}`);
      setMeals(meals.filter(m => m.id !== id));
    } catch (err) {
      console.error("Failed to delete meal:", err);
    }
  };

  const handleGenerateDiet = async () => {
    setShowAiPlan(true);
    setAiPlanLoading(true);
    setAiPlanText('');
    try {
      const data = await generateDietPlan({
        age: user?.age || 28,
        weight: user?.weight || "72 kg",
        height: user?.height || "5'10\"",
        goal: "Keep energetic, control calorie budget and maintain lean mass",
        restrictions: "None"
      });
      setAiPlanText(data.plan);
    } catch (err) {
      console.error(err);
      setAiPlanText("I apologize, but I am unable to connect to the AI Diet Plan Generator right now. Please try again later.");
    } finally {
      setAiPlanLoading(false);
    }
  };

  const filteredFoods = foodDatabase.filter(food =>
    food.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Nutrition & Diet Tracker</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track macros, log daily meals, search foods, and monitor water intake.</p>
        </div>
        <button
          onClick={handleGenerateDiet}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-550 to-accent-550 bg-primary-600 hover:bg-primary-750 text-white text-sm font-semibold flex items-center gap-2 shadow-glow-primary hover:opacity-95 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          AI Meal Planner
        </button>
      </div>

      {/* Overview Dashboard Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Calorie Progress */}
        <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-orange-500/10 via-transparent to-primary-500/5">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">Calorie Budget</span>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {totalCalories} <span className="text-sm font-medium text-slate-400">/ {targets.calories} kcal</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Flame className="w-5 h-5" />
            </div>
          </div>
          
          <div className="mt-6 space-y-2">
            <div className="w-full h-3 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-primary-500 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min((totalCalories / targets.calories) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{Math.max(targets.calories - totalCalories, 0)} kcal remaining</span>
              <span>{Math.round((totalCalories / targets.calories) * 100)}% met</span>
            </div>
          </div>
        </div>

        {/* Water Intake Tracker */}
        <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/5">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-cyan-500 uppercase tracking-wider">Hydration</span>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {waterGlasses} <span className="text-sm font-medium text-slate-400">/ {waterTarget} glasses</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-500">
              <Droplets className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2.5 overflow-x-auto py-1">
            {Array.from({ length: waterTarget }).map((_, i) => (
              <button
                key={i}
                onClick={() => dispatch(updateHydration(Math.max(i + 1, waterGlasses === i + 1 ? i : i + 1)))}
                className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                  i < waterGlasses
                    ? 'bg-cyan-500 border-cyan-500 text-white shadow-glow-accent'
                    : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-400 hover:border-cyan-500'
                }`}
              >
                <Droplets className="w-4 h-4" />
              </button>
            ))}
          </div>

          <div className="mt-4 flex justify-between items-center text-xs">
            <span className="text-slate-400">{Math.max(waterTarget - waterGlasses, 0)} glasses remaining</span>
            <button 
              onClick={() => dispatch(updateHydration(Math.min(waterGlasses + 1, 12)))}
              className="text-cyan-600 dark:text-cyan-400 font-bold hover:underline"
            >
              + Add Glass
            </button>
          </div>
        </div>

        {/* Macro Distribution Summary */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Macro Distribution</h3>
          <MacroChart height={110} />
        </div>
      </div>

      {/* Main Grid: Meal Log & Add Meals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Meal Log (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/5 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Apple className="w-5 h-5 text-primary-500" />
                Daily Meal Log
              </h3>
              <div className="flex gap-2">
                {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedMealTime(category)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedMealTime === category
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-350'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* List of logged meals */}
            <div className="space-y-3.5">
              {meals.filter(m => m.time === selectedMealTime).length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <p className="text-sm font-medium">No meals logged for {selectedMealTime} yet.</p>
                  <p className="text-xs">Use the panel on the right to log meals from the database or add custom items.</p>
                </div>
              ) : (
                meals.filter(m => m.time === selectedMealTime).map((meal) => (
                  <div 
                    key={meal.id} 
                    className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/5 border border-slate-150 dark:border-white/5 transition-all group"
                  >
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900 dark:text-white">{meal.name}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-orange-500">{meal.calories} kcal</span>
                        <span>P: {meal.protein}g</span>
                        <span>C: {meal.carbs}g</span>
                        <span>F: {meal.fat}g</span>
                        {meal.fiber > 0 && <span>Fiber: {meal.fiber}g</span>}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteMeal(meal.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Daily Totals Footer */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-white/5">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-xs text-slate-400">Calories</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{totalCalories} / {targets.calories}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-xs text-slate-400">Protein</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{totalProtein}g / {targets.protein}g</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-xs text-slate-400">Carbs</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{totalCarbs}g / {targets.carbs}g</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-xs text-slate-400">Fats</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{totalFat}g / {targets.fat}g</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-xs text-slate-400">Fiber</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{totalFiber}g / {targets.fiber}g</p>
              </div>
            </div>
          </div>
        </div>

        {/* Food Search & Custom Logger (Right Column) */}
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Quick Log Food</h3>
              <button 
                onClick={() => setShowAddCustomMeal(true)}
                className="text-xs font-bold text-primary-500 hover:text-primary-600 flex items-center gap-1"
              >
                <PlusCircle className="w-4.5 h-4.5" />
                Custom
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search food database..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {filteredFoods.map((food, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/5 border border-slate-150 dark:border-white/5 transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white truncate">{food.name}</p>
                    <p className="text-xs text-slate-450 mt-0.5">{food.calories} kcal • P: {food.protein}g, C: {food.carbs}g</p>
                  </div>
                  <button 
                    onClick={() => handleAddMealFromDb(food)}
                    className="p-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 dark:bg-white/5 dark:hover:bg-white/10 text-primary-650 dark:text-primary-400 transition-all"
                    title={`Log as ${selectedMealTime}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Custom Meal Modal */}
      <AnimatePresence>
        {showAddCustomMeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCustomMeal(false)}
            />
            <motion.div 
              className="relative w-full max-w-md bg-white dark:bg-dark-200 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-6 overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/5 mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Log Custom Meal</h3>
                <button 
                  onClick={() => setShowAddCustomMeal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-slate-350 transition-all"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleAddCustomMeal} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400">Meal Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Oatmeal with chia seeds"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Calories (kcal)</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 350"
                      value={customCalories}
                      onChange={(e) => setCustomCalories(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Protein (g)</label>
                    <input
                      type="number"
                      placeholder="e.g. 15"
                      value={customProtein}
                      onChange={(e) => setCustomProtein(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Carbs (g)</label>
                    <input
                      type="number"
                      placeholder="e.g. 40"
                      value={customCarbs}
                      onChange={(e) => setCustomCarbs(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Fats (g)</label>
                    <input
                      type="number"
                      placeholder="e.g. 8"
                      value={customFat}
                      onChange={(e) => setCustomFat(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-400">Fiber (g)</label>
                    <input
                      type="number"
                      placeholder="e.g. 5"
                      value={customFiber}
                      onChange={(e) => setCustomFiber(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomMeal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-sm font-semibold text-slate-600 dark:text-slate-350 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white text-sm font-semibold shadow-glow-primary hover:opacity-95 transition-all"
                  >
                    Log Meal
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Diet Plan Modal */}
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
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your AI Nutrition & Meal Plan</h3>
                </div>
                <button 
                  onClick={() => setShowAiPlan(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-450 dark:text-slate-300 transition-all"
                >
                  &times;
                </button>
              </div>

              {aiPlanLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Consulting HealthAI dietitian...</p>
                </div>
              ) : (
                <div className="max-w-none text-sm leading-relaxed">
                  <StructuredResponse text={aiPlanText} type="nutrition" />
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
