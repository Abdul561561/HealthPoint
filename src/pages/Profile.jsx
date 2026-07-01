import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, Mail, Phone, MapPin, Calendar, Heart, Award, Save, Edit, 
  Camera, FileText, Check, Shield
} from 'lucide-react';
import { getInitials } from '../utils/helpers';
import { useAuth } from '../hooks/useAuth';
import { useHealthData } from '../hooks/useHealthData';
import { useDispatch } from 'react-redux';
import { updateUserProfile } from '../redux/slices/authSlice';
import { fetchHealthData } from '../redux/slices/healthSlice';

export default function Profile() {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const { metrics } = useHealthData();
  const [isEditing, setIsEditing] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Edit form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');

  // Sync state when user details load
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setAddress(user.address || '123 Health Ave, San Francisco, CA 94105');
      setAge(user.age || '');
      setHeight(user.height || '');
      setWeight(user.weight || '');
      setBloodGroup(user.bloodGroup || 'O+');
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const resultAction = await dispatch(updateUserProfile({
      name,
      email,
      phone,
      address,
      age: parseInt(age) || (user ? user.age : 25),
      height,
      weight,
      bloodGroup
    }));
    if (updateUserProfile.fulfilled.match(resultAction)) {
      setIsEditing(false);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
      dispatch(fetchHealthData()); // refresh health metrics
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast */}
      {showSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 font-semibold text-sm animate-float">
          <Check className="w-4 h-4" />
          Profile updated successfully!
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">My Profile</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage personal metrics, contact detail forms, and review biological vitals.</p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-sm font-semibold flex items-center gap-2 text-slate-700 dark:text-white transition-all w-fit"
        >
          {isEditing ? 'Cancel Editing' : (
            <>
              <Edit className="w-4 h-4" />
              Edit Profile
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Profile Card & Vitals Summary (Left Column) */}
        <div className="space-y-6">
          
          {/* Avatar / Identity Card */}
          <div className="glass-card p-6 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-r from-primary-500/20 to-accent-500/20 pointer-events-none" />
            
            {/* Avatar upload representation */}
            <div className="relative mt-6 group">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-dark-200 shadow-glow-primary">
                {getInitials(user?.name || '')}
              </div>
              <button 
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 border border-slate-200/50 dark:border-white/15 flex items-center justify-center text-white dark:text-slate-900 transition-all cursor-pointer shadow-md"
                title="Upload Photo"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user?.name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{user?.email}</p>
            </div>

            {/* Profile Completion percentage */}
            <div className="w-full mt-4 space-y-1.5 px-1 text-left">
              <div className="flex justify-between text-[9px] font-bold text-slate-400">
                <span>PROFILE COMPLETION</span>
                <span>85%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200/20 dark:border-white/5">
                <div className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full" style={{ width: '85%' }} />
              </div>
            </div>

            <div className="flex gap-2.5 mt-5 pt-5 border-t border-slate-150 dark:border-white/5 w-full justify-center">
              <div className="text-center px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-xl flex-1 border border-slate-100 dark:border-white/5">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Age</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{user?.age} yrs</p>
              </div>
              <div className="text-center px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-xl flex-1 border border-slate-100 dark:border-white/5">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Blood Group</span>
                <p className="text-sm font-bold text-rose-500 mt-0.5">{user?.bloodGroup || 'O+'}</p>
              </div>
            </div>

            <div className="w-full text-left mt-6 space-y-3.5 text-sm pt-4 border-t border-slate-150 dark:border-white/5">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-350">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{user?.phone || 'No phone added'}</span>
              </div>
              <div className="flex items-start gap-3 text-slate-600 dark:text-slate-355">
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{user?.address || '123 Health Ave, San Francisco, CA 94105'}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-350">
                <Shield className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{user?.insurance || 'BlueCross BlueShield'} policyholder</span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-350">
                <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>Joined {user?.memberSince || '2026-06-06'}</span>
              </div>
            </div>
          </div>

          {/* Biological Vitals Summary Card */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="w-4.5 h-4.5 text-rose-500" />
              Biometrics & Vitals
            </h3>
            
            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 rounded-xl">
                <span className="text-xs text-slate-400 font-semibold">Height</span>
                <p className="text-base font-bold text-slate-955 dark:text-white mt-1">{user?.height || 'N/A'}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 rounded-xl">
                <span className="text-xs text-slate-400 font-semibold">Weight</span>
                <p className="text-base font-bold text-slate-955 dark:text-white mt-1">{user?.weight || 'N/A'}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 rounded-xl">
                <span className="text-xs text-slate-400 font-semibold">Body Mass Index (BMI)</span>
                <p className="text-base font-bold text-slate-955 dark:text-white mt-1">{metrics?.bmi?.value || 'N/A'}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400 mt-1 inline-block font-bold">
                  {metrics?.bmi?.category || 'Normal'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 rounded-xl">
                <span className="text-xs text-slate-400 font-semibold">Oxygen Level</span>
                <p className="text-base font-bold text-slate-955 dark:text-white mt-1">{metrics?.oxygen?.level || 98}%</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400 mt-1 inline-block font-bold">
                  Healthy
                </span>
              </div>
            </div>
          </div>

          {/* Health Achievements Card */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-150 dark:border-white/5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4.5 h-4.5 text-amber-500" />
                Health Achievements
              </h3>
              <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15 font-bold px-2 py-0.5 rounded-full">Level 3</span>
            </div>

            {/* XP progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>XP PROGRESS</span>
                <span>2,050 / 3,000 XP</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200/50 dark:border-white/10">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: '68%' }} />
              </div>
            </div>

            {/* Badges Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { title: 'Hydration Hero', unlocked: true, icon: '💧', desc: 'Log 8 glasses for 5 consecutive days' },
                { title: 'Heart Healthy', unlocked: true, icon: '❤️', desc: 'Maintain normal resting heart rate' },
                { title: 'Sleep Champion', unlocked: true, icon: '🌙', desc: 'Sleep 8+ hours 4 days in a week' },
                { title: 'Workout Streak', unlocked: false, icon: '🏃', desc: 'Complete 3 workouts in a week' },
                { title: 'Medicine Master', unlocked: true, icon: '💊', desc: '100% adherence to scanned meds' },
                { title: 'Perfect Week', unlocked: false, icon: '🏆', desc: 'Meet all daily health targets' },
              ].map((badge, idx) => (
                <div key={idx} className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center transition-all relative group cursor-pointer ${
                  badge.unlocked
                    ? 'bg-amber-500/[0.03] border-amber-500/20 text-slate-800 dark:text-slate-200 hover:scale-[1.03]'
                    : 'bg-slate-55 dark:bg-white/[0.02] border-slate-200/50 dark:border-white/5 text-slate-400 opacity-60'
                }`} title={badge.desc}>
                  <span className="text-xl mb-1">{badge.icon}</span>
                  <span className="text-[9px] font-black leading-tight truncate w-full">{badge.title}</span>
                  {!badge.unlocked && <span className="absolute top-1 right-1 text-[8px]">🔒</span>}
                  
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block w-40 bg-slate-900 text-white text-[9px] font-medium p-2 rounded-lg shadow-xl z-20 pointer-events-none">
                    {badge.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Profile Edit / Display Form (Right 2 Columns) */}
        <div className="lg:col-span-2">
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-white/5 mb-6">
              {isEditing ? 'Modify Personal Records' : 'Personal & Contact Information'}
            </h3>

            {isEditing ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-450">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-450">Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-455">Age</label>
                    <input
                      type="number"
                      required
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-455">Blood Group</label>
                    <select
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-455">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-455">Height (e.g. 5ft 10in or 175 cm)</label>
                    <input
                      type="text"
                      required
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-455">Weight (e.g. 72 kg or 158 lbs)</label>
                    <input
                      type="text"
                      required
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-455">Home Address</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm outline-none border border-transparent focus:ring-1 focus:ring-primary-500 focus:border-transparent dark:text-white"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-sm font-semibold text-slate-600 dark:text-slate-350 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white text-sm font-semibold shadow-glow-primary hover:opacity-95 transition-all flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    Save Profile
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                {[
                  { label: 'Full Name', value: user?.name },
                  { label: 'Email Address', value: user?.email },
                  { label: 'Mobile Number', value: user?.phone || 'No phone added' },
                  { label: 'Emergency Contact', value: user?.emergencyContact || 'Sarah Johnson — +1 (555) 987-6543' },
                  { label: 'Residential Address', value: user?.address || '123 Health Ave, San Francisco, CA 94105' }
                ].map((item, idx) => (
                  <div key={idx} className="pb-4 border-b border-slate-100 dark:border-white/2 flex justify-between items-start text-sm">
                    <span className="font-semibold text-slate-400 pr-4">{item.label}</span>
                    <span className="font-bold text-slate-900 dark:text-white text-right max-w-sm">{item.value}</span>
                  </div>
                ))}
                
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 flex items-start gap-3 mt-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Award className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Active Premium Insurance</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Your coverage policy is active with {user?.insurance || 'BlueCross BlueShield'}. Claims can be submitted instantly on the Insurance page.</p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
