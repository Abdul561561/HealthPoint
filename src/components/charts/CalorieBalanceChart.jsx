import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import { useTheme } from '../../hooks/useTheme';
import { defaultChartOptions } from '../../utils/helpers';

import { useSelector } from 'react-redux';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function CalorieBalanceChart({ height = 240 }) {
  const { isDark } = useTheme();
  const { metrics } = useSelector((state) => state.health);

  const consumed = metrics?.calories?.intake || 2100;
  const burned = metrics?.calories?.burned || 1840;

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Consumed',
        data: [consumed - 150, consumed + 150, consumed - 50, consumed + 300, consumed + 50, consumed + 200, consumed],
        borderColor: '#6366f1', // Indigo
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#6366f1',
        pointRadius: 4,
      },
      {
        label: 'Burned',
        data: [burned - 100, burned + 260, burned + 60, burned + 460, burned - 90, burned + 360, burned],
        borderColor: '#06b6d4', // Cyan
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#06b6d4',
        pointRadius: 4,
      }
    ]
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
