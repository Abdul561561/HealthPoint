import React from 'react';
import { motion } from 'framer-motion';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight,
  className = '',
  ...props
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-glow-primary',
    secondary: 'bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-800 dark:text-white',
    outline: 'border-2 border-primary-600 dark:border-primary-400 text-primary-600 dark:text-primary-400 hover:bg-primary-600 hover:text-white dark:hover:bg-primary-600 dark:hover:text-white',
    ghost: 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white',
    danger: 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg hover:shadow-glow-rose',
    success: 'bg-green-500 hover:bg-green-600 text-white',
    accent: 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg hover:shadow-glow-accent',
  };

  const sizes = {
    xs: 'px-3 py-1.5 text-xs',
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
    xl: 'px-8 py-4 text-lg',
    icon: 'w-9 h-9 p-0',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      {children}
      {!loading && iconRight && <iconRight className="w-4 h-4" />}
    </motion.button>
  );
}
