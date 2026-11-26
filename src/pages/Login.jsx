import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Activity,
  Check,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, clearError } from '../redux/slices/authSlice';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { error: reduxError, verificationRequired, unverifiedEmail } = useSelector(state => state.auth);

  const savedEmail = localStorage.getItem('hp-remember-email') || '';
  const prefilledFromVerify = location.state?.verifiedEmail || '';

  const [form, setForm] = useState({
    email: prefilledFromVerify || savedEmail,
    password: '',
  });

  const [rememberMe, setRememberMe] = useState(!!savedEmail);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Validating security credentials...');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [verifiedBanner, setVerifiedBanner] = useState(location.state?.justVerified || false);

  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  useEffect(() => {
    if (reduxError) {
      if (typeof reduxError === 'object' && reduxError.message) {
        setError(reduxError.message);
      } else if (typeof reduxError === 'string') {
        setError(reduxError);
      } else {
        setError('Login failed. Please check your credentials.');
      }
    }
  }, [reduxError]);

  useEffect(() => {
    if (!loading) return;
    const messages = [
      'Validating security credentials...',
      'Checking email verification status...',
      'Verifying JWT session integrity...',
      'Signing authorization token...',
    ];
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingText(messages[index]);
    }, 1200);
    return () => clearInterval(interval);
  }, [loading]);

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
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(form.email);
  const isPasswordValid = form.password.length >= 6;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEmailValid) {
      setError('Please provide a valid email format.');
      return;
    }
    setError('');
    setVerifiedBanner(false);
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
      }, 1200);
    } else {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full overflow-hidden">
      <div className="w-full relative glass-card p-8 md:p-10 bg-slate-900/60 border-white/10 rounded-[2.5rem] shadow-glass overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

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

        {/* Success Screen */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-[#060818] flex flex-col items-center justify-center p-8 space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Check className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-white tracking-wide">Authentication Passed</h3>
                <p className="text-sm text-slate-400">Access granted to your secure health panel.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-lg text-white">
              Health<span className="text-indigo-400">Point</span>
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">Access Hub</h2>
            <p className="text-slate-400 text-sm md:text-base">
              Sign in with your verified HealthPoint email and password
            </p>
          </div>

          {verifiedBanner && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-start gap-2.5"
            >
              <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
              <span>Email verified successfully. Sign in with your email and password to continue.</span>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold space-y-2"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
              {verificationRequired && unverifiedEmail && (
                <button
                  type="button"
                  onClick={() => navigate(`/signup?verify=${encodeURIComponent(unverifiedEmail)}`)}
                  className="text-cyan-400 hover:text-cyan-300 underline font-bold block pl-6"
                >
                  Verify your email with OTP now →
                </button>
              )}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Email Address</label>
                {form.email && (
                  <span className={`text-[10px] font-semibold transition-all ${
                    isEmailValid ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    {isEmailValid ? 'Email format valid' : 'Invalid email format'}
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
                  placeholder="name@example.com"
                  className="input-field pl-11 pr-10 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-500"
                  required
                />
                {isEmailValid && (
                  <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Password</label>
              </div>
              <div className="relative group">
                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
                  form.password ? 'text-indigo-400' : 'text-slate-500'
                }`} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter your password"
                  className="input-field pl-11 pr-12 py-3.5 bg-slate-950/40 border-white/5 text-sm rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-white placeholder-slate-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {form.password.length > 0 && (
                <div className="space-y-2 pt-1.5">
                  <div className="flex justify-between items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password Strength</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-slate-300">
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
                </div>
              )}
            </div>

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
                <span className="text-sm text-slate-400 group-hover:text-slate-300 select-none transition-colors">
                  Remember email on this device
                </span>
              </button>
            </div>

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
              Access Dashboard <ArrowRight className="w-4 h-4" />
            </motion.button>
          </form>

          <p className="text-center text-sm text-slate-400 pt-2">
            New to HealthPoint?{' '}
            <Link to="/signup" className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors">
              Create & Verify Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
