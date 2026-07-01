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
  const { metrics } = useSelector((state) => state.health);
  
  const burned = metrics?.calories?.burned || 1840;

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Calories Burned',
        data: [burned - 90, burned + 80, burned, burned + 260, burned - 160, burned + 360, burned],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ]
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
