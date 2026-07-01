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
  
  const systolic = metrics?.bloodPressure?.systolic || 120;
  const diastolic = metrics?.bloodPressure?.diastolic || 80;

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Systolic',
        data: [systolic - 2, systolic + 1, systolic - 3, systolic + 2, systolic - 1, systolic + 1, systolic],
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Diastolic',
        data: [diastolic - 1, diastolic + 2, diastolic - 2, diastolic + 1, diastolic - 1, diastolic, diastolic],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        tension: 0.4,
        fill: true,
      }
    ]
  };

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        min: 60,
        max: 140,
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
