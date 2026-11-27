import { useEffect, useMemo, useState } from 'react';
import {
  Apple,
  Barcode,
  Calendar,
  Droplets,
  Edit3,
  Flame,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import MacroChart from '../components/charts/MacroChart';
import StructuredResponse from '../components/StructuredResponse';
import { fetchHealthData, updateHydration } from '../redux/slices/healthSlice';
import { addToast } from '../redux/slices/uiSlice';
import { generateDietPlan } from '../services/aiApi';
import {
  createCustomFood,
  createMealLog,
  deleteCustomFood,
  deleteMealLog,
  fetchCustomFoods,
  fetchMealsByDate,
  fetchNutritionGoals,
  fetchNutritionHistory,
  lookupBarcodeFood,
  searchNutritionFoods,
  updateMealLog,
  updateNutritionGoals,
} from '../services/nutritionApi';

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const FOOD_SOURCES = [
  { id: 'all', label: 'All Sources' },
  { id: 'indian', label: 'Indian Foods' },
  { id: 'usda', label: 'USDA' },
  { id: 'openfoodfacts', label: 'Open Food Facts' },
  { id: 'custom', label: 'My Custom Foods' },
];

function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function scalePer100g(per100g = {}, grams = 100) {
  const factor = Math.max(Number(grams) || 0, 0) / 100;
  const scale = (key, integer = false) => {
    const val = per100g?.[key];
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val) * factor;
    return integer ? Math.round(num) : Math.round(num * 10) / 10;
  };
  return {
    calories: scale('calories', true) ?? 0,
    protein: scale('protein') ?? 0,
    carbs: scale('carbs') ?? 0,
    fat: scale('fat') ?? 0,
    fiber: scale('fiber') ?? 0,
    sugar: scale('sugar'),
    sodium: scale('sodium'),
  };
}

export default function Nutrition() {
  const dispatch = useDispatch();
  const { metrics } = useSelector((s) => s.health);
  const { user } = useSelector((s) => s.auth);

  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [selectedMealSlot, setSelectedMealSlot] = useState('Breakfast');
  const [slotFilter, setSlotFilter] = useState('All');

  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [goals, setGoals] = useState({
    calories: 2000,
    protein: 100,
    carbs: 225,
    fat: 65,
    fiber: 28,
    activity_level: 'moderate',
    goal: 'maintain',
    is_custom: false,
    estimated_from_profile: false,
    disclaimer: 'Estimated nutrition target only — not a medical prescription.',
  });

  // Search & Barcode state
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [searchWarnings, setSearchWarnings] = useState([]);
  const [searching, setSearching] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');

  // Serving calculator modal/panel state
  const [selectedFood, setSelectedFood] = useState(null);
  const [servingIndex, setServingIndex] = useState(0);
  const [servingQty, setServingQty] = useState(1);
  const [customGrams, setCustomGrams] = useState('');
  const [loggingFood, setLoggingFood] = useState(false);

  // Edit logged meal quantity
  const [editingMealId, setEditingMealId] = useState(null);
  const [editingQty, setEditingQty] = useState('');

  // Custom foods modal
  const [customFoods, setCustomFoods] = useState([]);
  const [showCustomFoodModal, setShowCustomFoodModal] = useState(false);
  const [cfName, setCfName] = useState('');
  const [cfBrand, setCfBrand] = useState('Custom Food');
  const [cfServingLabel, setCfServingLabel] = useState('1 serving (100 g)');
  const [cfServingGrams, setCfServingGrams] = useState('100');
  const [cfCalories, setCfCalories] = useState('');
  const [cfProtein, setCfProtein] = useState('0');
  const [cfCarbs, setCfCarbs] = useState('0');
  const [cfFat, setCfFat] = useState('0');
  const [cfFiber, setCfFiber] = useState('0');

  // Goal modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({
    calories: 2000,
    protein: 100,
    carbs: 225,
    fat: 65,
    fiber: 28,
    activity_level: 'moderate',
    goal: 'maintain',
  });

  // AI Diet Planner modal
  const [showAiPlan, setShowAiPlan] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiRestrictions, setAiRestrictions] = useState('');
  const [aiPlanText, setAiPlanText] = useState('');
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [historyDays, setHistoryDays] = useState(7);

  useEffect(() => {
    let active = true;
    dispatch(fetchHealthData());
    Promise.all([
      fetchNutritionGoals(),
      fetchNutritionHistory(7),
      fetchCustomFoods(),
      searchNutritionFoods('', 'indian'),
    ])
      .then(([gData, histData, cfData, initialSearch]) => {
        if (!active) return;
        if (gData) {
          setGoals(gData);
          setGoalForm({
            calories: gData.calories,
            protein: gData.protein,
            carbs: gData.carbs,
            fat: gData.fat,
            fiber: gData.fiber,
            activity_level: gData.activity_level || 'moderate',
            goal: gData.goal || 'maintain',
          });
        }
        setHistory(Array.isArray(histData) ? histData : []);
        setCustomFoods(Array.isArray(cfData) ? cfData : []);
        setSearchResults(initialSearch?.results || []);
      })
      .catch(() => {
        // Partial offline fallback already handled by individual loaders
      });
    return () => {
      active = false;
    };
  }, [dispatch]);

  useEffect(() => {
    let active = true;
    fetchMealsByDate(selectedDate)
      .then((list) => {
        if (active) setMeals(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (active) {
          dispatch(addToast({ title: 'Nutrition Load Error', message: 'Could not load meals for the selected date.' }));
        }
      })
      .finally(() => {
        if (active) setMealsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate, dispatch]);

  const handleFoodSearch = async (e) => {
    if (e) e.preventDefault();
    setSearching(true);
    setSearchWarnings([]);
    try {
      const res = await searchNutritionFoods(searchQuery.trim(), sourceFilter);
      setSearchResults(res?.results || []);
      setSearchWarnings(res?.warnings || []);
    } catch {
      setSearchWarnings(['Food search request failed. Curated Indian foods remain available offline.']);
    } finally {
      setSearching(false);
    }
  };

  const handleBarcodeSearch = async (e) => {
    e.preventDefault();
    const cleaned = barcodeInput.trim();
    if (!/^\d{8,14}$/.test(cleaned)) {
      dispatch(addToast({ title: 'Invalid Barcode', message: 'Enter an 8 to 14 digit product barcode.' }));
      return;
    }
    setSearching(true);
    setSearchWarnings([]);
    try {
      const res = await lookupBarcodeFood(cleaned);
      if (res?.found && res?.product) {
        setSearchResults([res.product]);
        openFoodCalculator(res.product);
      } else {
        setSearchResults([]);
        setSearchWarnings([res?.message || `No packaged product found for barcode ${cleaned}.`]);
      }
    } catch (err) {
      setSearchWarnings([err.response?.data?.detail || 'Open Food Facts barcode lookup failed.']);
    } finally {
      setSearching(false);
    }
  };

  const openFoodCalculator = (food) => {
    setSelectedFood(food);
    setServingIndex(0);
    setServingQty(1);
    const defaultGrams = food?.serving_options?.[0]?.grams || 100;
    setCustomGrams(String(defaultGrams));
  };

  const activeServingOption = useMemo(
    () =>
      selectedFood?.serving_options?.[servingIndex] || {
        unit: 'g',
        label: '100 g',
        grams: 100,
      },
    [selectedFood, servingIndex]
  );

  const calculatedGrams = useMemo(() => {
    if (!selectedFood) return 0;
    const rawCustom = Number(customGrams);
    if (activeServingOption.unit === 'g' || activeServingOption.unit === 'ml') {
      return Number.isFinite(rawCustom) && rawCustom > 0 ? rawCustom : 100;
    }
    return Math.round((Number(servingQty) || 0) * (activeServingOption.grams || 100) * 10) / 10;
  }, [selectedFood, activeServingOption, servingQty, customGrams]);

  const previewNutrients = useMemo(() => {
    if (!selectedFood) return null;
    return scalePer100g(selectedFood.per_100g, calculatedGrams);
  }, [selectedFood, calculatedGrams]);

  const handleConfirmLogFood = async () => {
    if (!selectedFood || !previewNutrients || calculatedGrams <= 0) return;
    setLoggingFood(true);
    try {
      const payload = {
        name: selectedFood.name,
        time: selectedMealSlot,
        date: selectedDate,
        quantity: activeServingOption.unit === 'g' || activeServingOption.unit === 'ml' ? calculatedGrams : Number(servingQty) || 1,
        unit: activeServingOption.unit || 'serving',
        grams: calculatedGrams,
        calories: previewNutrients.calories,
        protein: previewNutrients.protein,
        carbs: previewNutrients.carbs,
        fat: previewNutrients.fat,
        fiber: previewNutrients.fiber,
        sugar: previewNutrients.sugar,
        sodium: previewNutrients.sodium,
        brand: selectedFood.brand || null,
        source: selectedFood.source || 'Curated',
        food_id: selectedFood.food_id || null,
        per_100g: selectedFood.per_100g || null,
      };
      const saved = await createMealLog(payload);
      setMeals((prev) => [saved, ...prev]);
      setSelectedFood(null);
      dispatch(fetchHealthData());
      fetchNutritionHistory(7).then((h) => setHistory(Array.isArray(h) ? h : [])).catch(() => {});
      dispatch(addToast({ title: 'Meal Logged', message: `${saved.name} (${saved.calories} kcal) added to ${selectedMealSlot}.` }));
    } catch (err) {
      dispatch(addToast({ title: 'Log Failed', message: err.response?.data?.detail || 'Could not log meal.' }));
    } finally {
      setLoggingFood(false);
    }
  };

  const handleSaveEditQty = async (meal) => {
    const qtyNum = Number(editingQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return;
    try {
      const payload =
        meal.unit === 'g' || meal.unit === 'ml'
          ? { quantity: qtyNum, grams: qtyNum }
          : { quantity: qtyNum };
      const updated = await updateMealLog(meal.id, payload);
      setMeals((prev) => prev.map((m) => (m.id === meal.id ? updated : m)));
      setEditingMealId(null);
      dispatch(fetchHealthData());
      fetchNutritionHistory(7).then((h) => setHistory(Array.isArray(h) ? h : [])).catch(() => {});
    } catch {
      dispatch(addToast({ title: 'Update Failed', message: 'Could not update meal quantity.' }));
    }
  };

  const handleDeleteMeal = async (mealId) => {
    try {
      await deleteMealLog(mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
      dispatch(fetchHealthData());
      fetchNutritionHistory(7).then((h) => setHistory(Array.isArray(h) ? h : [])).catch(() => {});
    } catch {
      dispatch(addToast({ title: 'Delete Failed', message: 'Could not delete meal entry.' }));
    }
  };

  const handleCreateCustomFood = async (e) => {
    e.preventDefault();
    const grams = Math.max(Number(cfServingGrams) || 100, 1);
    try {
      const created = await createCustomFood({
        name: cfName.trim(),
        brand: cfBrand.trim() || 'Custom Food',
        serving_label: cfServingLabel.trim() || `1 serving (${grams} g)`,
        serving_grams: grams,
        calories: Number(cfCalories) || 0,
        protein: Number(cfProtein) || 0,
        carbs: Number(cfCarbs) || 0,
        fat: Number(cfFat) || 0,
        fiber: Number(cfFiber) || 0,
      });
      setCustomFoods((prev) => [created, ...prev]);
      setSearchResults((prev) => [created, ...prev]);
      setShowCustomFoodModal(false);
      setCfName('');
      setCfCalories('');
      dispatch(addToast({ title: 'Custom Food Saved', message: `${created.name} is ready to log.` }));
    } catch (err) {
      dispatch(addToast({ title: 'Save Failed', message: err.response?.data?.detail || 'Could not save custom food.' }));
    }
  };

  const handleDeleteCustomFood = async (id) => {
    try {
      await deleteCustomFood(id);
      setCustomFoods((prev) => prev.filter((f) => f.id !== id));
      setSearchResults((prev) => prev.filter((f) => f.id !== id));
    } catch {
      dispatch(addToast({ title: 'Delete Failed', message: 'Could not delete custom food.' }));
    }
  };

  const handleSaveGoals = async (useEstimated = false) => {
    try {
      const updated = await updateNutritionGoals(
        useEstimated
          ? { activity_level: goalForm.activity_level, goal: goalForm.goal, use_estimated: true }
          : {
              calories: Number(goalForm.calories),
              protein: Number(goalForm.protein),
              carbs: Number(goalForm.carbs),
              fat: Number(goalForm.fat),
              fiber: Number(goalForm.fiber),
              activity_level: goalForm.activity_level,
              goal: goalForm.goal,
              use_estimated: false,
            }
      );
      setGoals(updated);
      setGoalForm({
        calories: updated.calories,
        protein: updated.protein,
        carbs: updated.carbs,
        fat: updated.fat,
        fiber: updated.fiber,
        activity_level: updated.activity_level,
        goal: updated.goal,
      });
      dispatch(fetchHealthData());
      if (!useEstimated) setShowGoalModal(false);
      dispatch(addToast({ title: 'Nutrition Targets Updated', message: `Daily target set to ${updated.calories} kcal.` }));
    } catch (err) {
      dispatch(addToast({ title: 'Update Failed', message: err.response?.data?.detail || 'Could not update goals.' }));
    }
  };

  const handleGenerateAiPlan = async (customPrompt = null) => {
    setShowAiPlan(true);
    setAiPlanLoading(true);
    try {
      const restrictionVal = aiRestrictions.trim() || (user?.allergies && user.allergies !== 'Not provided' ? user.allergies : 'None supplied');
      const res = await generateDietPlan({
        age: user?.age || 30,
        weight: user?.weight || `${metrics?.weight?.current || 70} kg`,
        height: user?.height || '170 cm',
        goal: goals.goal || user?.goals || 'Balanced nutrition',
        restrictions: restrictionVal,
        question: customPrompt || aiQuestion || 'Suggest balanced meals for my remaining calories today using Indian and everyday foods.',
        date: selectedDate,
      });
      setAiPlanText(res.plan || '');
    } catch (err) {
      setAiPlanText(`Could not generate AI nutrition plan: ${err.response?.data?.detail || err.message}`);
    } finally {
      setAiPlanLoading(false);
    }
  };

  const handleChangeHistoryDays = async (daysVal) => {
    setHistoryDays(daysVal);
    try {
      const h = await fetchNutritionHistory(daysVal);
      setHistory(Array.isArray(h) ? h : []);
    } catch {
      dispatch(addToast({ title: 'History Load Failed', message: 'Unable to load nutrition history.' }));
    }
  };

  // Totals for selected date
  const totalCalories = meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
  const totalProtein = Math.round(meals.reduce((acc, m) => acc + (Number(m.protein) || 0), 0) * 10) / 10;
  const totalCarbs = Math.round(meals.reduce((acc, m) => acc + (Number(m.carbs) || 0), 0) * 10) / 10;
  const totalFat = Math.round(meals.reduce((acc, m) => acc + (Number(m.fat) || 0), 0) * 10) / 10;
  const totalFiber = Math.round(meals.reduce((acc, m) => acc + (Number(m.fiber) || 0), 0) * 10) / 10;
  const remainingCalories = (goals.calories || 2000) - totalCalories;

  const waterGlasses = metrics?.water?.intake || 0;
  const waterTarget = metrics?.water?.target || 8;

  const visibleMeals = slotFilter === 'All' ? meals : meals.filter((m) => m.time === slotFilter);

  return (
    <div className="space-y-6 pb-8">
      {/* Top Bar: Date + Actions */}
      <div className="glass-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <Calendar className="w-4 h-4 text-primary-500" />
            <span>Date:</span>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || todayIso())}
            className="input-field py-1.5 px-3 text-xs w-auto"
          />
          <button
            type="button"
            onClick={() => setSelectedDate(todayIso())}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Today
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Remaining budget:{' '}
            <strong className={remainingCalories >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
              {remainingCalories} kcal
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowGoalModal(true)} className="btn-secondary py-2 px-3 text-xs">
            <Scale className="w-3.5 h-3.5" /> Calorie & Macro Goals
          </button>
          <button onClick={() => setShowCustomFoodModal(true)} className="btn-secondary py-2 px-3 text-xs">
            <Plus className="w-3.5 h-3.5" /> Create Custom Food
          </button>
          <button onClick={() => handleGenerateAiPlan()} className="btn-primary py-2 px-3.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" /> AI Meal Planner
          </button>
        </div>
      </div>

      {/* Daily Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4 space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-500" /> Calories
          </span>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {totalCalories} <span className="text-xs font-normal text-slate-400">/ {goals.calories} kcal</span>
          </p>
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all"
              style={{ width: `${Math.min(100, Math.round((totalCalories / Math.max(goals.calories, 1)) * 100))}%` }}
            />
          </div>
        </div>
        {[
          { label: 'Protein', val: totalProtein, target: goals.protein, color: 'bg-indigo-500' },
          { label: 'Carbs', val: totalCarbs, target: goals.carbs, color: 'bg-cyan-500' },
          { label: 'Fat', val: totalFat, target: goals.fat, color: 'bg-rose-500' },
          { label: 'Fiber', val: totalFiber, target: goals.fiber, color: 'bg-emerald-500' },
        ].map((macro) => (
          <div key={macro.label} className="glass-card p-4 space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{macro.label}</span>
            <p className="text-xl font-bold text-slate-900 dark:text-white">
              {macro.val}g <span className="text-xs font-normal text-slate-400">/ {macro.target}g</span>
            </p>
            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full ${macro.color} transition-all`}
                style={{ width: `${Math.min(100, Math.round((macro.val / Math.max(macro.target, 1)) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Search + Meal Logs + Right Charts/Hydration */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left/Center 2 cols: Food Search + Selected Food Calculator + Logged Meals */}
        <div className="xl:col-span-2 space-y-6">
          {/* Multi-source Food Search */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Search Foods & Packaged Products</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Indian everyday meals, USDA FoodData Central, Open Food Facts (or barcode), and your custom foods.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {MEAL_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedMealSlot(slot)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      selectedMealSlot === slot
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FOOD_SOURCES.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSourceFilter(src.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    sourceFilter === src.id
                      ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300 border-primary-500/40'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <form onSubmit={handleFoodSearch} className="md:col-span-2 flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search masala dosa, idli, chapati, banana, oats, paneer..."
                    className="input-field pl-9 text-xs"
                  />
                </div>
                <button type="submit" disabled={searching} className="btn-primary py-2 px-4 text-xs">
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </form>

              <form onSubmit={handleBarcodeSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Barcode (8-14 digits)"
                    className="input-field pl-9 text-xs"
                  />
                </div>
                <button type="submit" disabled={searching} className="btn-secondary py-2 px-3 text-xs">
                  Scan
                </button>
              </form>
            </div>

            {searchWarnings.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200">
                {searchWarnings.join(' · ')}
              </div>
            )}

            {/* Selected Food Serving Calculator */}
            {selectedFood && previewNutrients && (
              <div className="p-4 rounded-xl border-2 border-primary-500/40 bg-primary-50/50 dark:bg-primary-950/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-primary-600 dark:text-primary-400">
                      {selectedFood.source} {selectedFood.brand ? `· ${selectedFood.brand}` : ''}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{selectedFood.name}</h4>
                  </div>
                  <button
                    onClick={() => setSelectedFood(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">Serving Option</label>
                    <select
                      value={servingIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setServingIndex(idx);
                        const opt = selectedFood.serving_options?.[idx];
                        if (opt) setCustomGrams(String(opt.grams));
                      }}
                      className="input-field py-1.5 text-xs"
                    >
                      {(selectedFood.serving_options || [{ unit: 'g', label: '100 g', grams: 100 }]).map((opt, idx) => (
                        <option key={`${opt.unit}_${idx}`} value={idx}>
                          {opt.label} ({opt.grams}g)
                        </option>
                      ))}
                    </select>
                  </div>

                  {activeServingOption.unit === 'g' || activeServingOption.unit === 'ml' ? (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                        Weight / Volume ({activeServingOption.unit})
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={customGrams}
                        onChange={(e) => setCustomGrams(e.target.value)}
                        className="input-field py-1.5 text-xs"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                        Quantity ({activeServingOption.unit})
                      </label>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={servingQty}
                        onChange={(e) => setServingQty(e.target.value)}
                        className="input-field py-1.5 text-xs"
                      />
                    </div>
                  )}

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleConfirmLogFood}
                      disabled={loggingFood || calculatedGrams <= 0}
                      className="btn-primary w-full py-2 text-xs"
                    >
                      {loggingFood ? 'Logging...' : `Add to ${selectedMealSlot} (${previewNutrients.calories} kcal)`}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-slate-700 dark:text-slate-200 pt-1">
                  <span>Weight: <strong>{calculatedGrams}g</strong></span>
                  <span>Cal: <strong>{previewNutrients.calories} kcal</strong></span>
                  <span>P: <strong>{previewNutrients.protein}g</strong></span>
                  <span>C: <strong>{previewNutrients.carbs}g</strong></span>
                  <span>F: <strong>{previewNutrients.fat}g</strong></span>
                  <span>Fiber: <strong>{previewNutrients.fiber}g</strong></span>
                  <span>Sugar: <strong>{previewNutrients.sugar !== null ? `${previewNutrients.sugar}g` : 'Not reported'}</strong></span>
                  <span>Sodium: <strong>{previewNutrients.sodium !== null ? `${previewNutrients.sodium}mg` : 'Not reported'}</strong></span>
                </div>
              </div>
            )}

            {/* Search Results */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200/60 dark:divide-white/10 scrollbar-thin">
              {searchResults.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  No matching foods found. Try another keyword, switch source tab, or create a custom food.
                </p>
              ) : (
                searchResults.map((food) => (
                  <div key={food.food_id || food.name} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">{food.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                          {food.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Per 100g: {food.per_100g?.calories ?? 0} kcal · P {food.per_100g?.protein ?? 0}g · C {food.per_100g?.carbs ?? 0}g · F {food.per_100g?.fat ?? 0}g
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openFoodCalculator(food)}
                      className="btn-secondary py-1.5 px-3 text-xs flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Select
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Logged Meals for Selected Date */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Logged Meals ({selectedDate})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {['All', ...MEAL_SLOTS].map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSlotFilter(slot)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      slotFilter === slot
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {mealsLoading ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">Loading meal logs...</p>
            ) : visibleMeals.length === 0 ? (
              <div className="py-8 text-center space-y-1">
                <Apple className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No meals logged for {selectedDate} ({slotFilter})</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                {visibleMeals.map((meal) => (
                  <div key={meal.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">{meal.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/10 text-primary-600 dark:text-primary-300">
                          {meal.time}
                        </span>
                        {meal.source && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300">
                            {meal.source}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {meal.quantity || 1} {meal.unit || 'serving'} {meal.grams ? `(${meal.grams}g)` : ''} ·{' '}
                        <strong className="text-slate-800 dark:text-slate-200">{meal.calories} kcal</strong> · P {meal.protein}g · C {meal.carbs}g · F {meal.fat}g · Fiber {meal.fiber || 0}g
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {editingMealId === meal.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={editingQty}
                            onChange={(e) => setEditingQty(e.target.value)}
                            className="input-field py-1 px-2 text-xs w-20"
                          />
                          <button
                            onClick={() => handleSaveEditQty(meal)}
                            className="btn-primary py-1 px-2.5 text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingMealId(null)}
                            className="btn-secondary py-1 px-2 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingMealId(meal.id);
                              setEditingQty(String(meal.quantity || 1));
                            }}
                            title="Edit quantity"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteMeal(meal.id)}
                            title="Delete meal"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Macro Breakdown + Hydration + 7-Day History + Custom Foods */}
        <div className="space-y-6">
          <div className="glass-card p-5">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">Macro Distribution ({selectedDate})</h3>
            <div className="h-48">
              <MacroChart height={180} meals={meals} />
            </div>
          </div>

          {/* Hydration Tracker */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-500" /> Hydration
              </h3>
              <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                {waterGlasses} / {waterTarget} glasses
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => dispatch(updateHydration(Math.max(0, waterGlasses - 1)))}
                className="btn-secondary flex-1 py-1.5 text-xs"
              >
                - 1 Glass
              </button>
              <button
                onClick={() => dispatch(updateHydration(waterGlasses + 1))}
                className="btn-primary flex-1 py-1.5 text-xs"
              >
                + 1 Glass
              </button>
            </div>
          </div>

          {/* Weekly / Monthly Calorie History */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {historyDays === 30 ? 'Monthly (30d)' : 'Weekly (7d)'} Trends
              </h3>
              <div className="flex gap-1">
                {[7, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleChangeHistoryDays(d)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                      historyDays === d
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-1">
              {history.map((day) => {
                const pct = Math.min(100, Math.round((day.calories / Math.max(goals.calories, 1)) * 100));
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className="w-full text-left space-y-1 hover:opacity-90"
                  >
                    <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{day.date}</span>
                      <span>{day.calories} kcal ({day.meals_count} meals)</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Foods List */}
          {customFoods.length > 0 && (
            <div className="glass-card p-5 space-y-2.5">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">My Custom Foods</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                {customFoods.map((cf) => (
                  <div key={cf.id} className="flex items-center justify-between text-xs gap-2">
                    <button
                      type="button"
                      onClick={() => openFoodCalculator(cf)}
                      className="text-left text-slate-700 dark:text-slate-200 hover:text-primary-500 truncate"
                    >
                      {cf.name} ({cf.per_100g?.calories ?? 0} kcal/100g)
                    </button>
                    <button
                      onClick={() => handleDeleteCustomFood(cf.id)}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Custom Food Modal */}
      {showCustomFoodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Add Custom Food</h3>
              <button onClick={() => setShowCustomFoodModal(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCustomFood} className="space-y-3">
              <input type="text" required value={cfName} onChange={(e) => setCfName(e.target.value)} placeholder="Food Name (e.g. Homemade Ragi Dosa)" className="input-field text-xs" />
              <input type="text" value={cfBrand} onChange={(e) => setCfBrand(e.target.value)} placeholder="Brand / Kitchen label" className="input-field text-xs" />
              <div className="grid grid-cols-2 gap-2.5">
                <input type="text" value={cfServingLabel} onChange={(e) => setCfServingLabel(e.target.value)} placeholder="Serving label (e.g. 1 dosa)" className="input-field text-xs" />
                <input type="number" min="1" required value={cfServingGrams} onChange={(e) => setCfServingGrams(e.target.value)} placeholder="Serving grams (e.g. 90)" className="input-field text-xs" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Nutrition values per that serving:</p>
              <div className="grid grid-cols-2 gap-2.5">
                <input type="number" min="0" required value={cfCalories} onChange={(e) => setCfCalories(e.target.value)} placeholder="Calories (kcal)" className="input-field text-xs" />
                <input type="number" min="0" step="0.1" value={cfProtein} onChange={(e) => setCfProtein(e.target.value)} placeholder="Protein (g)" className="input-field text-xs" />
                <input type="number" min="0" step="0.1" value={cfCarbs} onChange={(e) => setCfCarbs(e.target.value)} placeholder="Carbs (g)" className="input-field text-xs" />
                <input type="number" min="0" step="0.1" value={cfFat} onChange={(e) => setCfFat(e.target.value)} placeholder="Fat (g)" className="input-field text-xs" />
              </div>
              <input type="number" min="0" step="0.1" value={cfFiber} onChange={(e) => setCfFiber(e.target.value)} placeholder="Fiber (g)" className="input-field text-xs" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCustomFoodModal(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
                <button type="submit" className="btn-primary py-2 px-4 text-xs">Save Custom Food</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calorie & Macro Goals Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Daily Calorie & Macro Targets</h3>
              <button onClick={() => setShowGoalModal(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-500/30">
              {goals.disclaimer}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Activity Level</label>
                <select
                  value={goalForm.activity_level}
                  onChange={(e) => setGoalForm({ ...goalForm, activity_level: e.target.value })}
                  className="input-field text-xs mt-1"
                >
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                  <option value="very_active">Very Active</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Goal</label>
                <select
                  value={goalForm.goal}
                  onChange={(e) => setGoalForm({ ...goalForm, goal: e.target.value })}
                  className="input-field text-xs mt-1"
                >
                  <option value="lose">Fat Loss</option>
                  <option value="maintain">Maintain</option>
                  <option value="gain">Muscle / Weight Gain</option>
                </select>
              </div>
            </div>
            <button type="button" onClick={() => handleSaveGoals(true)} className="btn-secondary w-full py-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Estimate TDEE from Profile (Mifflin-St Jeor)
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400">Calories (kcal)</label>
                <input type="number" min="1200" max="6000" value={goalForm.calories} onChange={(e) => setGoalForm({ ...goalForm, calories: e.target.value })} className="input-field text-xs mt-1" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400">Protein (g)</label>
                <input type="number" min="20" value={goalForm.protein} onChange={(e) => setGoalForm({ ...goalForm, protein: e.target.value })} className="input-field text-xs mt-1" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400">Carbs (g)</label>
                <input type="number" min="20" value={goalForm.carbs} onChange={(e) => setGoalForm({ ...goalForm, carbs: e.target.value })} className="input-field text-xs mt-1" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-slate-400">Fat (g)</label>
                <input type="number" min="15" value={goalForm.fat} onChange={(e) => setGoalForm({ ...goalForm, fat: e.target.value })} className="input-field text-xs mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowGoalModal(false)} className="btn-secondary py-2 px-4 text-xs">Cancel</button>
              <button type="button" onClick={() => handleSaveGoals(false)} className="btn-primary py-2 px-4 text-xs">Save Custom Targets</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Meal Planner Modal */}
      {showAiPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary-500" /> AI Meal Planner
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Grounded in your {meals.length} logged meal(s) today and {remainingCalories} kcal remaining budget.
                </p>
              </div>
              <button onClick={() => setShowAiPlan(false)} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={aiRestrictions}
                onChange={(e) => setAiRestrictions(e.target.value)}
                placeholder="Dietary preferences or allergies (e.g. Vegetarian, lactose-free, nut allergy)"
                className="input-field text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Ask e.g. Suggest a 500 kcal high-protein Indian dinner..."
                  className="input-field text-xs flex-1"
                />
                <button onClick={() => handleGenerateAiPlan()} disabled={aiPlanLoading} className="btn-primary py-2 px-4 text-xs">
                  {aiPlanLoading ? 'Thinking...' : 'Ask Gemini'}
                </button>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                General AI wellness suggestions — not a substitute for personalized medical nutrition therapy from a registered dietitian or physician.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 rounded-xl bg-slate-50 dark:bg-dark-100 border border-slate-200 dark:border-white/10 text-sm">
              {aiPlanLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">
                  Analyzing your logged foods and calorie targets...
                </p>
              ) : (
                <StructuredResponse text={aiPlanText} type="chat" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
