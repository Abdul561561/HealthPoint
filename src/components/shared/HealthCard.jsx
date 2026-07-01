import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function HealthCard({
  title,
  value,
  unit,
  icon: Icon,
  color = 'primary',
  trend,
  trendValue,
  subtitle,
  onClick,
}) {
  const colorMap = {
    primary: {
      bg: 'from-primary-500/20 to-primary-600/10',
      icon: 'text-primary-500',
      iconBg: 'bg-primary-500/10 dark:bg-primary-500/20',
      glow: 'hover:shadow-glow-primary',
    },
    accent: {
      bg: 'from-accent-500/20 to-accent-600/10',
      icon: 'text-accent-500',
      iconBg: 'bg-accent-500/10 dark:bg-accent-500/20',
      glow: 'hover:shadow-glow-accent',
    },
    rose: {
      bg: 'from-rose-500/20 to-rose-600/10',
      icon: 'text-rose-500',
      iconBg: 'bg-rose-500/10 dark:bg-rose-500/20',
      glow: 'hover:shadow-glow-rose',
    },
    green: {
      bg: 'from-green-500/20 to-green-600/10',
      icon: 'text-green-500',
      iconBg: 'bg-green-500/10 dark:bg-green-500/20',
      glow: '',
    },
    amber: {
      bg: 'from-amber-500/20 to-amber-600/10',
      icon: 'text-amber-500',
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',
      glow: '',
    },
    violet: {
      bg: 'from-violet-500/20 to-violet-600/10',
      icon: 'text-violet-500',
      iconBg: 'bg-violet-500/10 dark:bg-violet-500/20',
      glow: '',
    },
  };

  const c = colorMap[color] || colorMap.primary;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-400';

  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      onClick={onClick}
      className={`glass-card p-5 ${c.glow} transition-all duration-300 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-2xl ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            {trendValue}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{value}</span>
          {unit && <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{unit}</span>}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </motion.div>
  );
}
