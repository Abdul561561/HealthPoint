import React, { useState, useEffect, useRef } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Phone, Lock, Eye, EyeOff, Calendar,
  ChevronRight, ChevronLeft, Heart, FileText, ShieldCheck,
  Check, AlertCircle, UserCheck, CheckCircle2, KeyRound, RefreshCw
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import {
  registerUser,
  verifyUserEmail,
  resendVerificationOtp,
  clearError,
} from '../redux/slices/authSlice';

export default function Signup() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dateInputRef = useRef(null);

  const { error: reduxError } = useSelector(state => state.auth);
  const verifyQueryEmail = searchParams.get('verify');

  const [step, setStep] = useState(1);
  const [otpMode, setOtpMode] = useState(Boolean(verifyQueryEmail));
  const [pendingEmail, setPendingEmail] = useState(verifyQueryEmail || '');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(verifyQueryEmail ? 0 : 60);
  const [infoMessage, setInfoMessage] = useState(
    verifyQueryEmail
      ? 'Enter the 6-digit verification code sent to your email, or request a new code.'
      : ''
  );

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    gender: '',
    bloodGroup: '',
    height: '',
    weight: '',
    allergies: '',
    medicalConditions: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    role: 'Patient',
    agree: false,
  });

  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Creating profile...');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  useEffect(() => {
    if (reduxError) {
      setError(typeof reduxError === 'string' ? reduxError : 'Request failed');
    }
  }, [reduxError]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

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
    setLoadingText('Creating account & sending verification OTP...');
    setLoading(true);

    const resultAction = await dispatch(registerUser({
      name: form.name,
      email: form.email,
      phone: form.phone,
      password: form.password,
      dateOfBirth: form.dateOfBirth,
      gender: form.gender || null,
      bloodGroup: form.bloodGroup || null,
      height: form.height,
      weight: form.weight,
      allergies: form.allergies,
      medicalConditions: form.medicalConditions,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
    }));

    setLoading(false);
    if (registerUser.fulfilled.match(resultAction)) {
      const regEmail = resultAction.payload?.email || form.email;
      setPendingEmail(regEmail);
      setOtpMode(true);
      setCooldown(60);
      setInfoMessage(resultAction.payload?.message || 'Verification OTP sent to your email. Expires in 5 minutes.');
    } else {
      setError(resultAction.payload || 'Registration failed');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit numeric verification code.');
      return;
    }
    setError('');
    setInfoMessage('');
    setLoadingText('Verifying 6-digit OTP...');
    setLoading(true);

    const resultAction = await dispatch(verifyUserEmail({ email: pendingEmail, otp: otp.trim() }));
    setLoading(false);

    if (verifyUserEmail.fulfilled.match(resultAction)) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { state: { justVerified: true, verifiedEmail: pendingEmail } });
      }, 1500);
    } else {
      setError(resultAction.payload || 'Invalid or expired OTP');
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || !pendingEmail) return;
    setError('');
    setInfoMessage('');
    const resultAction = await dispatch(resendVerificationOtp({ email: pendingEmail }));
    if (resendVerificationOtp.fulfilled.match(resultAction)) {
      setCooldown(60);
      setInfoMessage(resultAction.payload?.message || 'A new 6-digit OTP has been sent to your email.');
    } else {
      setError(resultAction.payload || 'Failed to resend OTP.');
    }
  };

  return (
    <div className="relative w-full">
      <div className="w-full relative glass-card p-8 md:p-10 bg-slate-900/60 border-white/10 rounded-[2.5rem] shadow-glass overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Loading Overlay */}
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
                <p className="text-xs text-slate-400 font-medium">Securing account verification...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Overlay */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-[#060818] flex flex-col items-center justify-center p-8 space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-white tracking-wide">Email Verified</h3>
                <p className="text-sm text-slate-400">Redirecting you to Sign In...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OTP Verification Screen */}
        {otpMode ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Verify Your Email</h2>
                <p className="text-xs text-slate-400 mt-1">Enter the 6-digit OTP sent to {pendingEmail}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-cyan-400" />
              </div>
            </div>

            {infoMessage && (
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold">
                {infoMessage}
              </div>
            )}

            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Email Address</label>
                <input
                  type="email"
                  value={pendingEmail}
                  onChange={e => setPendingEmail(e.target.value)}
                  className="input-field py-3 bg-slate-950/40 border-white/5 text-sm rounded-xl text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  6-Digit Verification Code (Expires in 5 mins)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="input-field py-4 text-center text-2xl font-black tracking-[0.6em] bg-slate-950/40 border-white/10 rounded-xl focus:border-cyan-500 text-white"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={otp.length !== 6}
                className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                Verify Email & Continue
              </button>
            </form>

            <div className="flex items-center justify-between pt-4 border-t border-white/5 text-xs">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0}
                className={`flex items-center gap-1.5 font-bold ${
                  cooldown > 0 ? 'text-slate-500 cursor-not-allowed' : 'text-cyan-400 hover:text-cyan-300'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
              </button>

              <RouterLink to="/login" className="text-slate-400 hover:text-white font-semibold">
                Back to Sign In
              </RouterLink>
            </div>
          </div>
        ) : (
          /* Multi-Step Signup Form */
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div>
                <h2 className="text-3xl font-black text-white tracking-tight">Create Account</h2>
                <p className="text-xs text-slate-400 mt-1 font-medium">Email OTP verification required</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Step</span>
                <span className="text-2xl font-black text-cyan-400">{step}<span className="text-sm text-slate-500">/3</span></span>
              </div>
            </div>

            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: '33.3%' }}
                animate={{ width: `${(step / 3) * 100}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500"
              />
            </div>

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
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="Enter your full name"
                        className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        placeholder="you@example.com"
                        className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Mobile Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="tel"
                        required
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        placeholder="10-digit mobile number"
                        className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type={showPass ? 'text' : 'password'}
                          required
                          value={form.password}
                          onChange={e => setForm({ ...form, password: e.target.value })}
                          placeholder="Min. 6 chars"
                          className="input-field pl-11 pr-10 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
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
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type={showConfirmPass ? 'text' : 'password'}
                          required
                          value={form.confirmPassword}
                          onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                          placeholder="Repeat password"
                          className="input-field pl-11 pr-10 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
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

                  {form.password && (
                    <div className="space-y-2 bg-slate-950/20 p-4 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Password Strength</span>
                        <span className={`font-bold px-2 py-0.5 rounded-full ${passStrength.color} text-white text-[10px]`}>
                          {passStrength.label}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${passStrength.color}`} style={{ width: `${passStrength.percent}%` }} />
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

              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Date of Birth</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        <input
                          ref={dateInputRef}
                          type="date"
                          required
                          value={form.dateOfBirth}
                          onChange={e => setForm({ ...form, dateOfBirth: e.target.value })}
                          onClick={() => dateInputRef.current?.showPicker?.()}
                          className="input-field pl-11 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Gender</label>
                      <select
                        value={form.gender}
                        onChange={e => setForm({ ...form, gender: e.target.value })}
                        className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white cursor-pointer"
                      >
                        <option value="">Prefer not to say</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Blood Group (Optional)</label>
                    <select
                      value={form.bloodGroup}
                      onChange={e => setForm({ ...form, bloodGroup: e.target.value })}
                      className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white cursor-pointer"
                    >
                      <option value="">Not provided</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Height (e.g. 175 cm)</label>
                      <input
                        type="text"
                        required
                        value={form.height}
                        onChange={e => setForm({ ...form, height: e.target.value })}
                        placeholder="e.g. 175 cm"
                        className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Weight (e.g. 72 kg)</label>
                      <input
                        type="text"
                        required
                        value={form.weight}
                        onChange={e => setForm({ ...form, weight: e.target.value })}
                        placeholder="e.g. 72 kg"
                        className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-rose-500" />
                      Known Allergies <span className="text-[10px] text-slate-500 font-semibold normal-case">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.allergies}
                      onChange={e => setForm({ ...form, allergies: e.target.value })}
                      placeholder="e.g. Peanuts, Penicillin, None"
                      className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Existing Medical Conditions <span className="text-[10px] text-slate-500 font-semibold normal-case">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.medicalConditions}
                      onChange={e => setForm({ ...form, medicalConditions: e.target.value })}
                      placeholder="e.g. Hypertension, Diabetes, None"
                      className="input-field py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-cyan-500 text-white"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3.5">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
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
                          placeholder="Emergency contact name"
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
                          placeholder="10-digit phone number"
                          className="input-field py-3 bg-slate-950/40 border-white/5 text-xs rounded-xl text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, agree: !form.agree })}
                      className="flex-shrink-0 mt-0.5 focus:outline-none"
                    >
                      <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                        form.agree
                          ? 'bg-gradient-to-br from-cyan-500 to-indigo-500 border-transparent'
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}>
                        {form.agree && <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />}
                      </div>
                    </button>
                    <label className="text-xs text-slate-400 leading-relaxed select-none">
                      I authorize HealthPoint to store my health profile and verify my email via OTP.
                    </label>
                  </div>
                </motion.div>
              )}

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
                    <>Send Verification OTP <ShieldCheck className="w-4 h-4" /></>
                  ) : (
                    <>Continue <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </form>

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
