import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { useTheme } from '../../hooks/useTheme';
import { defaultChartOptions } from '../../utils/helpers';
import { useSelector } from 'react-redux';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function CalorieChart({ height = 200 }) {
  const { isDark } = useTheme();
  const { metrics, workouts = [] } = useSelector((state) => state.health);

  const workoutPoints = workouts.filter(w => typeof w?.calories === 'number' && w.calories > 0);
  const history = (metrics?.history?.calories || []).filter(e => typeof e?.burned === 'number' && e.burned > 0);

  let labels = [];
  let values = [];
  if (workoutPoints.length > 0) {
    labels = workoutPoints.slice(0, 7).reverse().map(w => w.date || w.name);
    values = workoutPoints.slice(0, 7).reverse().map(w => w.calories);
  } else if (history.length > 0) {
    labels = history.map((h, idx) =>
      h.recordedAt ? new Date(h.recordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Entry ${idx + 1}`
    );
    values = history.map(h => h.burned);
  } else if (typeof metrics?.calories?.burned === 'number' && metrics.calories.burned > 0) {
    labels = ['Recorded'];
    values = [metrics.calories.burned];
  }

  if (values.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        No calorie burn data recorded yet
      </div>
    );
  }

  const data = {
    labels,
    datasets: [
      {
        label: 'Calories Burned',
        data: values,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.35)',
        borderRadius: 6,
      },
    ],
  };

  const options = {
    ...defaultChartOptions(isDark),
    plugins: {
      ...defaultChartOptions(isDark).plugins,
      legend: { display: false },
    },
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `${v} cal` },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}
