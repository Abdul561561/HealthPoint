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

export default function BMITrendChart({ height = 240 }) {
  const { isDark } = useTheme();
  const { user } = useSelector((state) => state.auth);
  const { metrics } = useSelector((state) => state.health);

  const currentWeight = metrics?.weight?.current || 72.0;

  // Height parsing helper to meters
  const parseHeightToMeters = (hStr) => {
    if (!hStr) return 1.75;
    const clean = hStr.toLowerCase().trim();
    if (clean.includes('cm')) {
      const cms = parseFloat(clean);
      return cms / 100;
    }
    const match = clean.match(/(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);
    if (match) {
      const feet = parseInt(match[1]);
      const inches = match[2] ? parseInt(match[2]) : 0;
      const totalInches = feet * 12 + inches;
      return (totalInches * 2.54) / 100;
    }
    const val = parseFloat(clean);
    if (val > 3) return val / 100;
    return val;
  };

  const heightMeters = parseHeightToMeters(user?.height);
  const healthyMin = parseFloat((18.5 * (heightMeters * heightMeters)).toFixed(1)) || 56.6;
  const healthyMax = parseFloat((24.9 * (heightMeters * heightMeters)).toFixed(1)) || 76.2;

  const data = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'My Weight',
        data: [currentWeight + 0.8, currentWeight + 0.5, currentWeight + 0.4, currentWeight + 0.1, currentWeight + 0.2, currentWeight, currentWeight],
        borderColor: '#22c55e', // Green
        backgroundColor: 'transparent',
        tension: 0.3,
        pointBackgroundColor: '#22c55e',
        pointRadius: 5,
        borderWidth: 3,
        zIndex: 2,
      },
      {
        label: 'Healthy Zone Upper Limit',
        data: [healthyMax, healthyMax, healthyMax, healthyMax, healthyMax, healthyMax, healthyMax],
        borderColor: 'rgba(239, 68, 68, 0.25)', // Soft red
        borderDash: [5, 5],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
        labelOffset: 10,
      },
      {
        label: 'Healthy Zone Lower Limit',
        data: [healthyMin, healthyMin, healthyMin, healthyMin, healthyMin, healthyMin, healthyMin],
        borderColor: 'rgba(59, 130, 246, 0.25)', // Soft blue
        borderDash: [5, 5],
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0,
      }
    ]
  };

  const options = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        min: 50,
        max: 90,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `${v} kg` },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
