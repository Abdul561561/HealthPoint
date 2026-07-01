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
  
  const hr = metrics?.heartRate?.current || 72;

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Heart Rate',
        data: [hr - 4, hr, hr + 3, hr - 1, hr + 1, hr - 3, hr],
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        tension: 0.4,
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
        min: 55,
        max: 90,
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
