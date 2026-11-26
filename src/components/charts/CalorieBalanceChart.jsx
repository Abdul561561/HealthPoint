import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { useTheme } from '../../hooks/useTheme';
import { defaultChartOptions } from '../../utils/helpers';
import { useSelector } from 'react-redux';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function CalorieBalanceChart({ height = 240 }) {
  const { isDark } = useTheme();
  const { metrics } = useSelector((state) => state.health);

  const history = (metrics?.history?.calories || []).filter(
    e => (typeof e?.intake === 'number' && e.intake > 0) || (typeof e?.burned === 'number' && e.burned > 0)
  );
  const points = history.length > 0
    ? history
    : ((typeof metrics?.calories?.intake === 'number' && metrics.calories.intake > 0) ||
       (typeof metrics?.calories?.burned === 'number' && metrics.calories.burned > 0)
        ? [{ intake: metrics.calories.intake || 0, burned: metrics.calories.burned || 0, recordedAt: null }]
        : []);

  if (points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        No calorie intake/burn entries recorded yet
      </div>
    );
  }

  const labels = points.map((p, idx) =>
    p.recordedAt ? new Date(p.recordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Entry ${idx + 1}`
  );

  const data = {
    labels,
    datasets: [
      {
        label: 'Consumed',
        data: points.map(p => p.intake ?? null),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#6366f1',
        pointRadius: 4,
      },
      {
        label: 'Burned',
        data: points.map(p => p.burned ?? null),
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#06b6d4',
        pointRadius: 4,
      },
    ],
  };

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `${v} kcal` },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
