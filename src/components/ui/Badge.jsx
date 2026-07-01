import React from 'react';

export default function Badge({ children, variant = 'primary', dot = false }) {
  const variants = {
    primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    accent: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
    ghost: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400',
  };

  const dotColors = {
    primary: 'bg-primary-500', success: 'bg-green-500', warning: 'bg-amber-500',
    error: 'bg-rose-500', info: 'bg-blue-500', accent: 'bg-accent-500', ghost: 'bg-slate-400',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
