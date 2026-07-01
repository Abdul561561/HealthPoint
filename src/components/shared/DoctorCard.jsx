import React from 'react';
import { motion } from 'framer-motion';
import { Star, Clock, DollarSign, CheckCircle, Video, MapPin } from 'lucide-react';
import { getInitials } from '../../utils/helpers';

export default function DoctorCard({ doctor, onBook }) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="glass-card p-5 flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-lg">
            {getInitials(doctor.name)}
          </div>
          {doctor.available && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white dark:border-dark-200 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">{doctor.name}</h3>
            {doctor.verified && <CheckCircle className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />}
          </div>
          <p className="text-xs text-primary-500 dark:text-primary-400 font-semibold mt-0.5">{doctor.specialty}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{doctor.hospital}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-white/5">
          <div className="flex items-center justify-center gap-0.5 text-amber-500">
            <Star className="w-3 h-3 fill-current" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">{doctor.rating}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">{doctor.reviews} reviews</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-white/5">
          <div className="text-sm font-bold text-slate-900 dark:text-white">{doctor.experience}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Experience</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-white/5">
          <div className="text-sm font-bold text-slate-900 dark:text-white">₹{doctor.fee}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Consult</p>
        </div>
      </div>

      {/* Availability */}
      <div className="flex items-center gap-1.5 text-xs">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span className={doctor.available ? 'text-green-500 font-semibold' : 'text-slate-400'}>
          {doctor.nextAvailable}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onBook?.(doctor)}
          className="flex-1 btn-primary py-2 text-xs"
        >
          Book Appointment
        </button>
        <button className="w-10 h-9 flex items-center justify-center rounded-xl border-2 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-accent-500 hover:text-accent-500 transition-all">
          <Video className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
