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

export default function SleepChart({ height = 200 }) {
  const { isDark } = useTheme();
  const { metrics } = useSelector((state) => state.health);

  const history = (metrics?.history?.sleep || []).filter(e => typeof e?.hours === 'number' && e.hours > 0);
  const points = history.length > 0
    ? history
    : (typeof metrics?.sleep?.hours === 'number' && metrics.sleep.hours > 0
        ? [{ hours: metrics.sleep.hours, recordedAt: null }]
        : []);

  if (points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        No sleep logs recorded yet
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
        label: 'Sleep Duration',
        data: points.map(p => p.hours),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.35)',
        borderRadius: 6,
      },
    ],
  };

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        suggestedMin: 0,
        suggestedMax: 10,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `${v}h` },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}
