import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { useTheme } from '../../hooks/useTheme';
import { useSelector } from 'react-redux';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function MacroChart({ height = 180 }) {
  const { isDark } = useTheme();
  
  // Calculate macros dynamically if meals are in Redux store
  const { meals } = useSelector((state) => state.health) || { meals: [] };

  let totalP = 0, totalC = 0, totalF = 0, totalFb = 0;
  if (meals && meals.length > 0) {
    meals.forEach(m => {
      totalP += m.protein || 0;
      totalC += m.carbs || 0;
      totalF += m.fat || 0;
      totalFb += m.fiber || 0;
    });
  }

  const sum = totalP + totalC + totalF + totalFb;
  const data = {
    labels: ['Protein', 'Carbs', 'Fats', 'Fiber'],
    datasets: [
      {
        data: sum > 0 
          ? [Math.round((totalP/sum)*100), Math.round((totalC/sum)*100), Math.round((totalF/sum)*100), Math.round((totalFb/sum)*100)]
          : [30, 45, 20, 5],
        backgroundColor: ['#6366f1', '#06b6d4', '#f43f5e', '#22c55e'],
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: { family: 'Inter', size: 11 },
          boxWidth: 10,
          padding: 12,
          borderRadius: 3,
        },
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
        titleColor: isDark ? '#f1f5f9' : '#0f172a',
        bodyColor: isDark ? '#94a3b8' : '#64748b',
        borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)',
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.raw}%`,
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Doughnut data={data} options={options} />
    </div>
  );
}
