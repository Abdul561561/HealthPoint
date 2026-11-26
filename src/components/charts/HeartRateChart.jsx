import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { useTheme } from '../../hooks/useTheme';
import { defaultChartOptions } from '../../utils/helpers';
import { useSelector } from 'react-redux';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function HeartRateChart({ height = 200 }) {
  const { isDark } = useTheme();
  const { metrics } = useSelector((state) => state.health);

  const history = (metrics?.history?.heartRate || []).filter(e => typeof e?.current === 'number' && e.current > 0);
  const points = history.length > 0
    ? history
    : (typeof metrics?.heartRate?.current === 'number' && metrics.heartRate.current > 0
        ? [{ current: metrics.heartRate.current, recordedAt: null }]
        : []);

  if (points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        No heart rate measurements recorded yet
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
        label: 'Heart Rate',
        data: points.map(p => p.current),
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#f43f5e',
        pointRadius: 4,
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
        suggestedMin: 50,
        suggestedMax: 110,
        ticks: {
          ...defaultChartOptions(isDark).scales.y.ticks,
          callback: (v) => `${v} bpm`,
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
