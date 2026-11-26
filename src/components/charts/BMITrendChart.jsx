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

export default function BMITrendChart({ height = 240 }) {
  const { isDark } = useTheme();
  const { user } = useSelector((state) => state.auth);
  const { metrics } = useSelector((state) => state.health);

  const parseHeightToMeters = (hStr) => {
    if (!hStr) return null;
    const clean = String(hStr).toLowerCase().trim();
    const match = clean.match(/(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);
    if (match) {
      const feet = parseInt(match[1], 10);
      const inches = match[2] ? parseInt(match[2], 10) : 0;
      return ((feet * 12 + inches) * 2.54) / 100;
    }
    const val = parseFloat(clean);
    if (!val || Number.isNaN(val)) return null;
    return val > 3 ? val / 100 : val;
  };

  const history = (metrics?.history?.weight || []).filter(e => typeof e?.current === 'number' && e.current > 0);
  const points = history.length > 0
    ? history
    : (typeof metrics?.weight?.current === 'number' && metrics.weight.current > 0
        ? [{ current: metrics.weight.current, recordedAt: null }]
        : []);

  if (points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
        No weight measurements recorded yet
      </div>
    );
  }

  const heightMeters = parseHeightToMeters(user?.height);
  const healthyMin = heightMeters ? parseFloat((18.5 * heightMeters * heightMeters).toFixed(1)) : null;
  const healthyMax = heightMeters ? parseFloat((24.9 * heightMeters * heightMeters).toFixed(1)) : null;

  const labels = points.map((p) =>
    p.recordedAt ? new Date(p.recordedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recorded'
  );

  const datasets = [
    {
      label: 'My Weight',
      data: points.map(p => p.current),
      borderColor: '#22c55e',
      backgroundColor: 'transparent',
      tension: 0.3,
      pointBackgroundColor: '#22c55e',
      pointRadius: 5,
      borderWidth: 3,
    },
  ];

  if (healthyMax !== null && healthyMin !== null) {
    datasets.push(
      {
        label: 'Healthy Zone Upper Limit',
        data: labels.map(() => healthyMax),
        borderColor: 'rgba(239, 68, 68, 0.25)',
        borderDash: [5, 5],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
      },
      {
        label: 'Healthy Zone Lower Limit',
        data: labels.map(() => healthyMin),
        borderColor: 'rgba(59, 130, 246, 0.25)',
        borderDash: [5, 5],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
      }
    );
  }

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `${v} kg` },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={{ labels, datasets }} options={options} />
    </div>
  );
}
