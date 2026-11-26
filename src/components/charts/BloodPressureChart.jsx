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

export default function BloodPressureChart({ height = 200 }) {
  const { isDark } = useTheme();
  const { metrics } = useSelector((state) => state.health);

  const history = (metrics?.history?.bloodPressure || []).filter(
    e => typeof e?.systolic === 'number' && e.systolic > 0 && typeof e?.diastolic === 'number' && e.diastolic > 0
  );
  const points = history.length > 0
    ? history
    : (typeof metrics?.bloodPressure?.systolic === 'number' && metrics.bloodPressure.systolic > 0
        ? [{ systolic: metrics.bloodPressure.systolic, diastolic: metrics.bloodPressure.diastolic, recordedAt: null }]
        : []);

  if (points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        No blood pressure readings recorded yet
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
        label: 'Systolic',
        data: points.map(p => p.systolic),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        tension: 0.35,
        fill: true,
      },
      {
        label: 'Diastolic',
        data: points.map(p => p.diastolic),
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        suggestedMin: 55,
        suggestedMax: 150,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `${v}` },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
