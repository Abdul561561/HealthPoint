import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Activity, 
  X, 
  Shield, 
  Check, 
  AlertCircle, 
  Sparkles, 
  RefreshCw, 
  Globe, 
  LockKeyhole,
  CheckCircle2
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  loginUser, 
  loginSocialUser, 
  verifyUserEmail, 
  clearError, 
  setVerificationRequired 
} from '../redux/slices/authSlice';

// Inline Google Logo SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);

// Inline Apple Logo SVG
const AppleIcon = () => (
  <svg className="w-5 h-5 mr-2 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.15.67-2.87 1.51-.62.71-1.16 1.85-1.01 2.96 1.1.09 2.21-.57 2.89-1.41z" />
  </svg>
);

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const { verificationRequired, unverifiedEmail, error: reduxError } = useSelector(state => state.auth);

  // Prefill email if remember me was ticked
  const savedEmail = localStorage.getItem('hp-remember-email');
  
  const [form, setForm] = useState({ 
    email: savedEmail || 'alex@healthpoint.com', 
    password: 'demo1234' 
  });
  
  const [rememberMe, setRememberMe] = useState(!!savedEmail);
  const [otp, setOtp] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Checking database records...');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [otpResendSeconds, setOtpResendSeconds] = useState(0);

  // Social authentication states
  const [socialModal, setSocialModal] = useState(null); // 'Google' or 'Apple'
  const [socialForm, setSocialForm] = useState({ email: '', name: '' });
  const [socialLoading, setSocialLoading] = useState(false);

  // Clear any persistent Redux auth errors on mount
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  // Sync Redux error state with local component error state
  useEffect(() => {
    if (reduxError) {
      if (typeof reduxError === 'object' && reduxError.error === 'verification_required') {
        setError(reduxError.message);
      } else {
        setError(reduxError);
      }
    }
  }, [reduxError]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpResendSeconds > 0) {
      const timer = setTimeout(() => setOtpResendSeconds(otpResendSeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpResendSeconds]);

  // Sync OTP digits to central OTP string
  useEffect(() => {
    setOtp(otpDigits.join(''));
  }, [otpDigits]);

  // Rotate loading texts to keep user engaged during auth
  useEffect(() => {
    if (!loading) return;
    const messages = [
      'Validating security credentials...',
      'Connecting to authentication node...',
      'Retrieving user profiles...',
      'Verifying JWT session integrity...',
      'Signing authorization token...',
      'Redirecting securely...'
    ];
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingText(messages[index]);
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

  // Calculate Password Strength Details
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
  
  // Real-time validators
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(form.email);
  const isPasswordValid = form.password.length >= 6;

  // Handle standard submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEmailValid) {
      setError('Please provide a valid email format.');
      return;
    }
    setError('');
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem('hp-remember-email', form.email);
    } else {
      localStorage.removeItem('hp-remember-email');
    }

    const resultAction = await dispatch(loginUser(form));
    if (loginUser.fulfilled.match(resultAction)) {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1800);
    } else {
      setLoading(false);
    }
  };

  // Handle OTP digit paste
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

  // Handle OTP submit
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
    if (verifyUserEmail.fulfilled.match(resultAction)) {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        navigate('/dashboard');
      }, 1800);
    } else {
      setLoading(false);
      setError(resultAction.payload || 'Verification code is invalid or has expired.');
    }
  };

  // Trigger mock resend countdown
  const handleResendOtp = () => {
    setOtpResendSeconds(60);
    // Simulate generation feedback in backend console
    console.log(`[TEST MODE] Re-generated verification OTP code for: ${unverifiedEmail}`);
  };

  // Set social data and open modal
  const handleSocialClick = (provider) => {
    let parsedName = 'Guest User';
    let inputEmail = form.email || '';
    if (inputEmail.includes('@')) {
      const prefix = inputEmail.split('@')[0];
      parsedName = prefix
        .split(/[._-]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    
    setSocialForm({
      email: inputEmail || 'guest@gmail.com',
      name: parsedName
    });
    setSocialModal(provider);
  };

  // Handle social modal confirmation
  const handleSocialSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSocialLoading(true);
    
    // Simulate minor visual authentication buffer in modal
    setTimeout(async () => {
      setSocialModal(null);
      setSocialLoading(false);
      setLoading(true);
      
      const resultAction = await dispatch(loginSocialUser({
        email: socialForm.email,
        name: socialForm.name || 'Social User',
        provider: socialModal
      }));
      
      if (loginSocialUser.fulfilled.match(resultAction)) {
        setSuccess(true);
        setLoading(false);
        setTimeout(() => {
          navigate('/dashboard');
        }, 1800);
      } else {
        setLoading(false);
        setError(resultAction.payload || 'Social Login failed');
      }
    }, 1500);
  };

  return (
    <div className="relative w-full overflow-hidden">
      
      {/* ── Outer Card Wrapper ── */}
      <div className="w-full relative glass-card p-8 md:p-10 bg-slate-900/60 border-white/10 rounded-[2.5rem] shadow-glass overflow-hidden">
        
        {/* Dynamic Glowing Accents inside Card */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

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
                {/* Circular pulse rings */}
                <span className="absolute inline-flex h-20 w-20 rounded-full bg-indigo-500/20 animate-ping" />
                <div className="w-16 h-16 rounded-full border-4 border-indigo-500/10 border-t-indigo-400 animate-spin" />
                <Activity className="absolute w-6 h-6 text-indigo-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1 px-6">
                <p className="text-white font-bold tracking-wide text-base">{loadingText}</p>
                <p className="text-xs text-slate-400">Verifying secure endpoints...</p>
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
                  <motion.svg
                    className="w-10 h-10 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  >
                    <motion.path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.2, duration: 0.4 }}
                    />
                  </motion.svg>
                </motion.div>
              </div>

              <div className="text-center space-y-2">
                <motion.h3
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-black text-white tracking-wide"
                >
                  Authentication Passed
                </motion.h3>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-sm text-slate-400"
                >
                  Access granted to your secure health panel.
                </motion.p>
              </div>

              <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.5, ease: 'easeInOut' }}
                  className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400"
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
                <h2 className="text-3xl font-black text-white flex items-center gap-2">
                  Verify Your Account
                </h2>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  For your security, a one-time verification code has been printed directly in the{' '}
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
                
                {/* Segmented OTP Boxes */}
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
                        
                        // Auto-focus next field
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
                      className="otp-input w-11 h-14 md:w-14 md:h-16 text-center text-xl md:text-2xl font-black text-white bg-slate-950/60 border border-white/10 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all duration-200"
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Didn't receive the code?</span>
                <button
                  type="button"
                  disabled={otpResendSeconds > 0}
                  onClick={handleResendOtp}
                  className={`font-bold transition-all focus:outline-none flex items-center gap-1 ${
                    otpResendSeconds > 0 
                      ? 'text-slate-500 cursor-not-allowed' 
                      : 'text-indigo-400 hover:text-indigo-300'
                  }`}
                >
                  {otpResendSeconds > 0 ? (
                    <>Resend in {otpResendSeconds}s</>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Request New Code
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-3 pt-2">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={otp.length < 6}
                  className={`btn-primary w-full py-4 text-sm font-bold flex items-center justify-center gap-2 rounded-2xl ${
                    otp.length < 6 ? 'opacity-60 cursor-not-allowed' : 'shadow-glow-primary'
                  }`}
                >
                  Verify Verification Code <ArrowRight className="w-4 h-4" />
                </motion.button>

                <button
                  type="button"
                  onClick={() => {
                    // Reset verification requirement state in Redux slices cleanly
                    dispatch(setVerificationRequired({ required: false, email: null }));
                    setError('');
                    setOtpDigits(['', '', '', '', '', '']);
                  }}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-350 transition-colors font-medium hover:underline py-2"
                >
                  Go back to Sign In
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ── FLOW 2: Normal Login Flow ── */
          <div className="space-y-8">
            
            {/* Header branding on mobile */}
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Activity className="w-4 h-4 text-white" />
              </div>
              <span className="font-extrabold text-lg text-white">
                Health<span className="text-indigo-400">Point</span>
              </span>
            </div>

            {/* Form Headers */}
            <div className="space-y-1">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                Access Hub
              </h2>
              <p className="text-slate-400 text-sm md:text-base">
                Sign in to your HealthPoint accounts or client space
              </p>
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

            {/* Login Inputs */}
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Email Address */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Email Address</label>
                  {form.email && (
                    <span className={`text-[10px] font-semibold transition-all ${
                      isEmailValid ? 'text-emerald-400' : 'text-slate-500'
                    }`}>
                      {isEmailValid ? 'Email format verified' : 'Invalid email format'}
                    </span>
                  )}
                </div>
                <div className="relative group">
                  <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
                    isEmailValid ? 'text-indigo-400' : 'text-slate-500'
                  }`} />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="name@organization.com"
                    className="input-field pl-11 pr-10 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-500"
                    required
                  />
                  {isEmailValid && (
                    <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                  )}
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Security Key</label>
                  <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors">
                    Forgot password?
                  </a>
                </div>
                <div className="relative group">
                  <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
                    form.password ? 'text-indigo-400' : 'text-slate-500'
                  }`} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Enter security key"
                    className="input-field pl-11 pr-12 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Section */}
                {form.password.length > 0 && (
                  <div className="space-y-2.5 pt-1.5">
                    {/* Strength bars */}
                    <div className="flex justify-between items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complexity Status</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        passStrength.score <= 1 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' :
                        passStrength.score === 2 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/10' :
                        passStrength.score === 3 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' :
                        passStrength.score === 4 ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10' :
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                      }`}>
                        {passStrength.label}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            idx <= passStrength.score ? passStrength.color : 'bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Complexity Checklist checklist */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400 pt-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                          form.password.length >= 8 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span>8+ Characters</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                          /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span>Upper & Lower Case</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                          /\d/.test(form.password) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span>At least 1 Number</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                          /[!@#$%^&*(),.?":{}|<>]/.test(form.password) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span>Special Symbol</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Remember Me and Terms check */}
              <div className="flex items-center justify-between py-1">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-3 cursor-pointer group focus:outline-none"
                >
                  <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                    rememberMe 
                      ? 'bg-gradient-to-br from-indigo-500 to-cyan-500 border-transparent shadow-md shadow-indigo-500/20' 
                      : 'border-white/10 group-hover:border-white/20 bg-white/5'
                  }`}>
                    {rememberMe && <Check className="w-3.5 h-3.5 text-white stroke-[3.5]" />}
                  </div>
                  <span className="text-sm text-slate-400 group-hover:text-slate-350 select-none transition-colors">
                    Remember email on this machine
                  </span>
                </button>
              </div>

              {/* Submit button */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={!isEmailValid || !isPasswordValid}
                className={`btn-primary w-full py-4 text-sm font-bold flex items-center justify-center gap-2 rounded-2xl transition-all duration-300 ${
                  (!isEmailValid || !isPasswordValid) 
                    ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500 hover:shadow-none' 
                    : 'shadow-glow-primary bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Access Dashboard <ArrowRight className="w-4 h-4 animate-pulse" />
              </motion.button>

              {/* Custom Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 text-slate-500 bg-slate-900/60 font-semibold tracking-wider uppercase">
                    or authenticate with
                  </span>
                </div>
              </div>

              {/* Social Login Button Grid */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleSocialClick('Google')}
                  className="flex items-center justify-center gap-2.5 py-3 rounded-2xl border border-white/10 bg-slate-950/30 text-slate-200 hover:border-white/20 hover:bg-white/5 transition-all text-sm font-semibold shadow-sm"
                >
                  <GoogleIcon /> Google
                </button>
                <button
                  type="button"
                  onClick={() => handleSocialClick('Apple')}
                  className="flex items-center justify-center gap-2.5 py-3 rounded-2xl border border-white/10 bg-slate-950/30 text-slate-200 hover:border-white/20 hover:bg-white/5 transition-all text-sm font-semibold shadow-sm"
                >
                  <AppleIcon /> Apple
                </button>
              </div>
            </form>

            {/* Signup Route Navigation Link */}
            <p className="text-center text-sm text-slate-400 pt-2">
              New to HealthPoint?{' '}
              <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors">
                Initialize an Account
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* ── FLOW 3: Social OAuth Mock Modal Backdrop Overlay ── */}
      <AnimatePresence>
        {socialModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            
            {/* Modal Card wrapper */}
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="bg-[#0b0f24] border border-white/10 w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl relative"
            >
              
              {/* Mock Address Bar */}
              <div className="bg-slate-950/60 px-5 py-3 border-b border-white/5 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
                </div>
                <div className="flex-1 bg-slate-900/90 text-[10px] text-slate-400 px-3 py-1 rounded-lg border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <LockKeyhole className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <span className="truncate">
                      {socialModal === 'Google' 
                        ? 'accounts.google.com/oauth/v2/auth' 
                        : 'appleid.apple.com/auth/authorize'}
                    </span>
                  </div>
                  <Globe className="w-3 h-3 text-slate-500 flex-shrink-0" />
                </div>
              </div>

              {/* Modal Core Contents */}
              <div className="p-6 md:p-8 space-y-6 relative">
                
                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setSocialModal(null)}
                  className="absolute top-4 right-4 text-slate-500 hover:text-slate-350 transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Simulated Provider Header */}
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/5 border border-white/10 shadow-inner">
                    {socialModal === 'Google' ? <GoogleIcon /> : <AppleIcon />}
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Sign in via {socialModal} Authorization
                  </h3>
                  <p className="text-xs text-slate-400 max-w-[280px] mx-auto leading-relaxed">
                    Confirm authentication scopes to establish session on <span className="text-indigo-400 font-semibold">HealthPoint</span>.
                  </p>
                </div>

                {/* Social Login Form */}
                <form onSubmit={handleSocialSubmit} className="space-y-4">
                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                    <input
                      type="email"
                      required
                      value={socialForm.email}
                      onChange={e => setSocialForm({ ...socialForm, email: e.target.value })}
                      className="input-field py-2.5 text-xs bg-slate-950/40 border-white/5 text-white"
                      placeholder="OAuth user email"
                    />
                  </div>

                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Display Name</label>
                    <input
                      type="text"
                      required
                      value={socialForm.name}
                      onChange={e => setSocialForm({ ...socialForm, name: e.target.value })}
                      className="input-field py-2.5 text-xs bg-slate-950/40 border-white/5 text-white"
                      placeholder="OAuth user full name"
                    />
                  </div>

                  {/* Authorize Button */}
                  <button
                    type="submit"
                    disabled={socialLoading}
                    className="btn-primary w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-glow-primary bg-indigo-600 hover:bg-indigo-700"
                  >
                    {socialLoading ? (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying OAuth claims...</span>
                      </div>
                    ) : (
                      <>
                        <Shield className="w-3.5 h-3.5" />
                        Authorize & Continue
                      </>
                    )}
                  </button>
                </form>

                {/* Suggestions Section */}
                <div className="space-y-2.5 pt-4 border-t border-white/5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block text-center">
                    Quick Selection Profiles
                  </span>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { email: 'alex.johnson@email.com', name: 'Alex Johnson' },
                      { email: 'abdulkhander10561@gmail.com', name: 'Abdul Khader' }
                    ].map(acc => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => setSocialForm({ email: acc.email, name: acc.name })}
                        className="flex justify-between items-center px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-xs text-slate-200 border border-white/5 hover:border-white/10 transition-all font-semibold"
                      >
                        <span className="truncate">{acc.name}</span>
                        <span className="text-[10px] text-indigo-400 font-mono truncate">{acc.email}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visual Security Notice */}
                <p className="text-[9px] text-slate-500 text-center leading-relaxed">
                  By authorizing, you grant permissions to read profile identity and email details. No password configuration required.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
