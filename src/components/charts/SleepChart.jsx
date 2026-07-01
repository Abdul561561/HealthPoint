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
  
  const sleepHrs = metrics?.sleep?.hours || 7.5;

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Sleep Quality',
        data: [sleepHrs, sleepHrs + 0.5, sleepHrs - 1.0, sleepHrs - 0.5, sleepHrs + 0.3, sleepHrs + 0.7, sleepHrs + 0.1],
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ]
  };

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      x: { ...defaultChartOptions(isDark).scales.x, stacked: true },
      y: {
        ...defaultChartOptions(isDark).scales.y,
        stacked: true,
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
