// ─── Format helpers ───────────────────────────────────────────────────────────

export const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export const formatNumber = (n) =>
  new Intl.NumberFormat('en-US').format(n);

export const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

export const truncate = (str, len = 40) =>
  str?.length > len ? str.slice(0, len) + '…' : str;

// ─── Health helpers ───────────────────────────────────────────────────────────

export const getBmiCategory = (bmi) => {
  if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-500' };
  if (bmi < 25) return { label: 'Normal', color: 'text-green-500' };
  if (bmi < 30) return { label: 'Overweight', color: 'text-amber-500' };
  return { label: 'Obese', color: 'text-rose-500' };
};

export const getStatusColor = (status) => {
  const map = {
    normal: 'success',
    abnormal: 'error',
    'follow-up': 'warning',
    confirmed: 'success',
    pending: 'warning',
    cancelled: 'error',
    approved: 'success',
    processing: 'info',
    rejected: 'error',
  };
  return map[status] || 'info';
};

// ─── Chart defaults ───────────────────────────────────────────────────────────

export const defaultChartOptions = (isDark = true) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: isDark ? '#94a3b8' : '#64748b',
        font: { family: 'Inter', size: 12 },
        boxWidth: 12,
        borderRadius: 4,
      },
    },
    tooltip: {
      backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
      titleColor: isDark ? '#f1f5f9' : '#0f172a',
      bodyColor: isDark ? '#94a3b8' : '#64748b',
      borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 12,
      titleFont: { family: 'Inter', weight: '600' },
      bodyFont: { family: 'Inter' },
    },
  },
  scales: {
    x: {
      grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      ticks: { color: isDark ? '#64748b' : '#94a3b8', font: { family: 'Inter', size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      ticks: { color: isDark ? '#64748b' : '#94a3b8', font: { family: 'Inter', size: 11 } },
      border: { display: false },
    },
  },
});

// ─── Misc ─────────────────────────────────────────────────────────────────────

export const getInitials = (name) =>
  name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

export const generateId = () =>
  Math.random().toString(36).substring(2, 9);

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const classNames = (...classes) => classes.filter(Boolean).join(' ');
