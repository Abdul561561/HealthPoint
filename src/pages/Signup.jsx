import React, { useState, useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Mail, Phone, Lock, Eye, EyeOff, Calendar, 
  ChevronRight, ChevronLeft, ShieldAlert, Heart, 
  FileText, ShieldCheck, Check, AlertCircle, Sparkles,
  UserCheck, Shield, CheckCircle2, ArrowRight
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser, verifyUserEmail, clearError } from '../redux/slices/authSlice';

export default function Signup() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dateInputRef = useRef(null);

  const { verificationRequired, unverifiedEmail, error: reduxError } = useSelector(state => state.auth);

  // Form step manager
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    // Step 1: Personal Details
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    // Step 2: Healthcare Profile
    dateOfBirth: '',
    gender: 'Male',
    bloodGroup: 'O+',
    height: '',
    weight: '',
    // Step 3: Optional Medical & Emergency
    allergies: '',
    medicalConditions: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    role: 'Patient',
    agree: false
  });

  const [otp, setOtp] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Creating profile...');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Clear errors on mount
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  // Sync Redux error state with local component error state
  useEffect(() => {
    if (reduxError) {
      setError(reduxError);
    }
  }, [reduxError]);

  // Sync OTP digits to central OTP string
  useEffect(() => {
    setOtp(otpDigits.join(''));
  }, [otpDigits]);

  // Rotate loading texts to keep user engaged during register
  useEffect(() => {
    if (!loading) return;
    const messages = [
      'Creating user account...',
      'Initializing health database...',
      'Setting default notification preferences...',
      'Calculating target metabolic metrics...',
      'Generating email verification code...',
      'Printing security OTP to backend...'
    ];
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingText(messages[index]);
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

  // Real-time validations
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(form.email);
  const isPhoneValid = form.phone.trim().length >= 10;
  const isPasswordValid = form.password.length >= 6;
  const isConfirmPasswordValid = form.password === form.confirmPassword;
  const isStep1Valid = form.name.trim().length >= 2 && isEmailValid && isPhoneValid && isPasswordValid && isConfirmPasswordValid;

  const isStep2Valid = form.dateOfBirth !== '' && form.height.trim() !== '' && form.weight.trim() !== '';

  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: 'None', color: 'bg-slate-700/50', percent: 0 };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pass)) score++;
    if (pass.length >= 12) score++;

    const config = {
      0: { score: 0, label: 'Too Short', color: 'bg-rose-500', percent: 20 },
      1: { score: 1, label: 'Weak', color: 'bg-rose-500', percent: 20 },
      2: { score: 2, label: 'Fair', color: 'bg-orange-500', percent: 40 },
      3: { score: 3, label: 'Good', color: 'bg-amber-500', percent: 60 },
      4: { score: 4, label: 'Strong', color: 'bg-indigo-500', percent: 80 },
      5: { score: 5, label: 'Excellent', color: 'bg-emerald-500', percent: 100 },
    };
    return config[score];
  };

  const passStrength = getPasswordStrength(form.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    if (!form.agree) {
      setError('Please read and accept the terms of service.');
      return;
    }
    setError('');
    setLoading(true);

    const resultAction = await dispatch(registerUser({
      name: form.name,
      email: form.email,
      phone: form.phone,
      password: form.password,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      bloodGroup: form.bloodGroup,
      height: form.height,
      weight: form.weight,
      allergies: form.allergies,
      medicalConditions: form.medicalConditions,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      role: form.role
    }));

    setLoading(false);
    if (registerUser.fulfilled.match(resultAction)) {
      if (resultAction.payload?.status === 'verification_required') {
        setError('');
      } else {
        setSuccess(true);
        setTimeout(() => navigate('/dashboard'), 1800);
      }
    } else {
      setError(resultAction.payload || 'Registration failed');
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }
    setError('');
    setLoading(true);
    const resultAction = await dispatch(verifyUserEmail({
      email: unverifiedEmail,
      otp: otp
    }));
    setLoading(false);
    if (verifyUserEmail.fulfilled.match(resultAction)) {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1800);
    } else {
      setError(resultAction.payload || 'Verification code is invalid or has expired.');
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain').slice(0, 6);
    if (/^\d+$/.test(pastedText)) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < pastedText.length; i++) {
        newDigits[i] = pastedText[i];
      }
      setOtpDigits(newDigits);
      const focusIndex = Math.min(pastedText.length, 5);
      const el = document.getElementById(`otp-${focusIndex}`);
      el?.focus();
    }
  };

  return (
    <div className="relative w-full">
      <div className="w-full relative glass-card p-8 md:p-10 bg-slate-900/60 border-white/10 rounded-[2.5rem] shadow-glass overflow-hidden">
        
        {/* Glowing background highlights inside form card */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* ── Loading Overlay State ── */}
        <AnimatePresence>
          {loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-[#060818]/85 backdrop-blur-md flex flex-col items-center justify-center space-y-6"
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute inline-flex h-20 w-20 rounded-full bg-cyan-500/20 animate-ping" />
                <div className="w-16 h-16 rounded-full border-4 border-cyan-500/10 border-t-cyan-400 animate-spin" />
                <UserCheck className="absolute w-6 h-6 text-cyan-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1 px-6">
                <p className="text-white font-bold tracking-wide text-base">{loadingText}</p>
                <p className="text-xs text-slate-400 font-medium">Securing database profile...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Success Animation Screen ── */}
        <AnimatePresence>
          {success && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-[#060818] flex flex-col items-center justify-center p-8 space-y-6"
            >
              <div className="relative">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [1, 1.25, 1], opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </motion.div>
              </div>

              <div className="text-center space-y-2">
                <motion.h3
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-black text-white tracking-wide"
                >
                  Registration Completed
                </motion.h3>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-sm text-slate-400"
                >
                  Vitals, default preferences, and secure lockboxes created.
                </motion.p>
              </div>

              <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.5, ease: 'easeInOut' }}
                  className="h-full bg-gradient-to-r from-cyan-500 via-blue-400 to-indigo-400"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FLOW 1: Verification Flow (OTP Code Form) ── */}
        {verificationRequired ? (
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white">Verify Your Account</h2>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  We have generated a 6-digit OTP code and printed it in the{' '}
                  <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                    backend terminal console
                  </span>{' '}
                  for:
                </p>
                <div className="inline-flex items-center gap-2 mt-2 bg-slate-800/80 px-3.5 py-1.5 rounded-xl border border-white/5 text-sm text-slate-200 font-medium">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  {unverifiedEmail}
                </div>
              </div>
            </div>

            <form onSubmit={handleVerifySubmit} className="space-y-6">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{error}</span>
                </motion.div>
              )}

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  6-Digit OTP Security Code
                </label>
                <div className="flex justify-between gap-2.5" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-${idx}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!/^\d*$/.test(val)) return;
                        const newDigits = [...otpDigits];
                        newDigits[idx] = val.slice(-1);
                        setOtpDigits(newDigits);
                        if (val && idx < 5) {
                          const next = document.getElementById(`otp-${idx + 1}`);
                          next?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace') {
                          if (!otpDigits[idx] && idx > 0) {
                            const newDigits = [...otpDigits];
                            newDigits[idx - 1] = '';
                            setOtpDigits(newDigits);
                            const prev = document.getElementById(`otp-${idx - 1}`);
                            prev?.focus();
                          } else {
                            const newDigits = [...otpDigits];
                            newDigits[idx] = '';
                            setOtpDigits(newDigits);
                          }
                        }
                      }}
                      className="otp-input w-11 h-14 md:w-14 md:h-16 text-center text-xl md:text-2xl font-black text-white bg-slate-950/60 border border-white/10 rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 outline-none transition-all duration-200"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={otp.length < 6}
                  className={`btn-primary w-full py-4 text-sm font-bold flex items-center justify-center gap-2 rounded-2xl ${
                    otp.length < 6 ? 'opacity-60 cursor-not-allowed' : 'shadow-glow-primary bg-cyan-600 hover:bg-cyan-700'
                  }`}
                >
                  Verify Registration <ArrowRight className="w-4 h-4" />
                </motion.button>

                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-350 transition-colors font-medium hover:underline py-2"
                >
                  Go Back & Restart Registration
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ── FLOW 2: Multi-Step Signup Form ── */
          <div className="space-y-6">
            
            {/* Headers */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">Create Account</h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">Suitable for Indian healthcare users</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Step</span>
                <span className="text-2xl font-black text-cyan-400">{step}<span className="text-sm text-slate-500">/3</span></span>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: '33.3%' }}
                animate={{ width: `${(step / 3) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500"
              />
            </div>

            {/* Error Message Box */}
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* ── STEP 1: Personal Details ── */}
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Rajesh Kumar"
                        className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        placeholder="e.g. rajesh@email.in"
                        className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Mobile Number (WhatsApp compatible)</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        placeholder="e.g. 9876543210"
                        className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type={showPass ? 'text' : 'password'}
                          required
                          value={form.password}
                          onChange={e => setForm({ ...form, password: e.target.value })}
                          placeholder="Min. 6 chars"
                          className="input-field pl-11 pr-10 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type={showConfirmPass ? 'text' : 'password'}
                          required
                          value={form.confirmPassword}
                          onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                          placeholder="Repeat password"
                          className="input-field pl-11 pr-10 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPass(!showConfirmPass)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Password strength indicators */}
                  {form.password && (
                    <div className="space-y-2 bg-slate-950/20 p-4 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Complexity index</span>
                        <span className={`font-bold px-2 py-0.5 rounded-full ${passStrength.color} text-white text-[10px]`}>
                          {passStrength.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${passStrength.percent}%` }}
                          className={`h-full ${passStrength.color}`}
                        />
                      </div>
                      {!isConfirmPasswordValid && form.confirmPassword && (
                        <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match yet.
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── STEP 2: Healthcare Profile ── */}
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Date of Birth</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input
                          ref={dateInputRef}
                          type="date"
                          required
                          value={form.dateOfBirth}
                          onChange={e => setForm({ ...form, dateOfBirth: e.target.value })}
                          onClick={() => dateInputRef.current?.showPicker?.()}
                          className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Gender</label>
                      <select
                        value={form.gender}
                        onChange={e => setForm({ ...form, gender: e.target.value })}
                        className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white cursor-pointer"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Blood Group</label>
                    <select
                      value={form.bloodGroup}
                      onChange={e => setForm({ ...form, bloodGroup: e.target.value })}
                      className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white cursor-pointer"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg} (Rh Factor)</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Height (e.g. 175 cm or 5ft 10in)</label>
                      <input
                        type="text"
                        required
                        value={form.height}
                        onChange={e => setForm({ ...form, height: e.target.value })}
                        placeholder="e.g. 175 cm"
                        className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block">Weight (e.g. 72 kg or 158 lbs)</label>
                      <input
                        type="text"
                        required
                        value={form.weight}
                        onChange={e => setForm({ ...form, weight: e.target.value })}
                        placeholder="e.g. 72 kg"
                        className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Optional Medical & Emergency Contact ── */}
              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-rose-500" />
                      Known Allergies <span className="text-[10px] text-slate-500 font-semibold normal-case">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.allergies}
                      onChange={e => setForm({ ...form, allergies: e.target.value })}
                      placeholder="e.g. Peanuts, Penicillin, None"
                      className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-350 uppercase tracking-wider block flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Existing Medical Conditions <span className="text-[10px] text-slate-500 font-semibold normal-case">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.medicalConditions}
                      onChange={e => setForm({ ...form, medicalConditions: e.target.value })}
                      placeholder="e.g. Hypertension, Diabetes, Thyroid, None"
                      className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 text-white"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-white/3 border border-white/5 space-y-3.5">
                    <span className="text-xs font-bold text-slate-350 uppercase tracking-wider block">
                      SOS Emergency Contact
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact Name</label>
                        <input
                          type="text"
                          required
                          value={form.emergencyContactName}
                          onChange={e => setForm({ ...form, emergencyContactName: e.target.value })}
                          placeholder="e.g. Vikram Kumar (Father)"
                          className="input-field py-3 bg-slate-950/40 border-white/5 text-xs rounded-xl text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact Phone</label>
                        <input
                          type="tel"
                          required
                          value={form.emergencyContactPhone}
                          onChange={e => setForm({ ...form, emergencyContactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                          placeholder="e.g. 9876543211"
                          className="input-field py-3 bg-slate-950/40 border-white/5 text-xs rounded-xl text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Policy Agreement checks */}
                  <div className="flex items-start gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, agree: !form.agree })}
                      className="flex-shrink-0 mt-0.5 focus:outline-none"
                    >
                      <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                        form.agree 
                          ? 'bg-gradient-to-br from-cyan-500 to-indigo-500 border-transparent shadow-md shadow-cyan-500/20' 
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}>
                        {form.agree && <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />}
                      </div>
                    </button>
                    <label className="text-xs text-slate-400 leading-relaxed select-none">
                      I authorize HealthPoint to initialize my metrics profile, and I accept the{' '}
                      <a href="#" className="text-cyan-400 hover:text-cyan-300 font-semibold hover:underline">Terms of Service</a>
                      {' '}and{' '}
                      <a href="#" className="text-cyan-400 hover:text-cyan-300 font-semibold hover:underline">Privacy Policy</a>.
                    </label>
                  </div>
                </motion.div>
              )}

              {/* Navigation Action Panel */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="flex items-center gap-1.5 px-5 py-3.5 rounded-xl border border-white/10 hover:border-white/20 bg-slate-950/30 text-slate-300 hover:text-white transition-all text-sm font-semibold"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                )}
                
                <button
                  type="submit"
                  disabled={
                    (step === 1 && !isStep1Valid) ||
                    (step === 2 && !isStep2Valid) ||
                    (step === 3 && (!form.agree || form.emergencyContactName.trim() === '' || form.emergencyContactPhone.trim() === ''))
                  }
                  className={`flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all duration-300 ${
                    ((step === 1 && !isStep1Valid) ||
                     (step === 2 && !isStep2Valid) ||
                     (step === 3 && (!form.agree || form.emergencyContactName.trim() === '' || form.emergencyContactPhone.trim() === '')))
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-glow-accent'
                  }`}
                >
                  {step === 3 ? (
                    <>Verify Email & Sign Up <ShieldCheck className="w-4 h-4" /></>
                  ) : (
                    <>Continue <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>

            </form>

            {/* Login Navigation Route Link */}
            <p className="text-center text-sm text-slate-400 pt-2">
              Already have an account?{' '}
              <RouterLink to="/login" className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors">
                Sign In
              </RouterLink>
            </p>

          </div>
        )}

      </div>
    </div>
  );
}
