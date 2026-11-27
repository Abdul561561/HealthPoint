import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Send, RefreshCw, Sparkles, Heart, Activity, Moon, Pill,
  MapPin, LocateFixed, ArrowRight, ExternalLink,
  Mic, MicOff, Volume2, VolumeX, Pause, Play, Square
} from 'lucide-react';
import { fetchChatHistory, sendChatMessage, resetChatSession, fetchAiHealthContext } from '../services/aiApi';
import { geocodeLocationQuery } from '../services/mapsApi';
import { useSelector, useDispatch } from 'react-redux';
import { fetchHealthData } from '../redux/slices/healthSlice';
import StructuredResponse from '../components/StructuredResponse';
import FacilityDiscoveryPanel from '../components/ai/FacilityDiscoveryPanel';

const suggestedPrompts = [
  'How is my health today?',
  'I am feeling feverish. Which nearby doctor can I visit?',
  'Find a cardiologist near me.',
  'Explain my blood pressure',
  'How was my sleep?',
  'What medicines am I taking?',
];

export default function AIAssistant() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [healthContext, setHealthContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);

  // Explicit user location state (never guessed)
  const [locationState, setLocationState] = useState({
    lat: null,
    lng: null,
    label: '',
    denied: false,
  });
  const [pinInput, setPinInput] = useState('');
  const [locating, setLocating] = useState(false);

  // Voice Input & Output state (Web Speech API + SpeechSynthesis)
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [ttsSupported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window
  );
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState('');
  const [speechRate, setSpeechRate] = useState(1);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [speechPaused, setSpeechPaused] = useState(false);

  const { metrics } = useSelector((s) => s.health);
  const { user } = useSelector((s) => s.auth);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceBaseInputRef = useRef('');

  const stripMarkdownForSpeech = (raw = '') =>
    String(raw)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\|/g, ' ')
      .replace(/[#*_`~>-]+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
    setSpeechPaused(false);
  };

  const speakMessageText = (msgId, rawText) => {
    if (!ttsSupported) {
      setVoiceError('Text-to-speech is not supported in this browser.');
      return;
    }
    const clean = stripMarkdownForSpeech(rawText);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = speechRate;
    const matchVoice = voices.find((v) => v.voiceURI === selectedVoiceUri);
    if (matchVoice) utterance.voice = matchVoice;
    utterance.onend = () => {
      setSpeakingMsgId(null);
      setSpeechPaused(false);
    };
    utterance.onerror = () => {
      setSpeakingMsgId(null);
      setSpeechPaused(false);
    };
    setSpeakingMsgId(msgId);
    setSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const togglePauseSpeech = () => {
    if (!ttsSupported) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setSpeechPaused(false);
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setSpeechPaused(true);
    }
  };

  useEffect(() => {
    if (!ttsSupported) return undefined;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available?.length) {
        setVoices(available);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
    };
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup error
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    setVoiceError('');
    if (!speechSupported) {
      setVoiceError('Voice dictation is not supported in this browser. Chrome or Edge is recommended.');
      return;
    }
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      setIsListening(false);
      return;
    }
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    voiceBaseInputRef.current = input.trim();

    rec.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      const prefix = voiceBaseInputRef.current ? `${voiceBaseInputRef.current} ` : '';
      setInput(`${prefix}${transcript.trimStart()}`);
    };
    rec.onerror = (event) => {
      const code = event?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setVoiceError('Microphone permission denied. Please enable mic access in browser site settings.');
      } else if (code === 'audio-capture') {
        setVoiceError('No microphone device detected.');
      } else if (code !== 'aborted') {
        setVoiceError(`Voice input stopped (${code || 'error'}). You can type your question directly.`);
      }
      setIsListening(false);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
    } catch {
      setVoiceError('Could not start microphone dictation.');
      setIsListening(false);
    }
  };

  const mapServerMessages = (list = []) =>
    list.map((m, idx) => ({
      id: `msg_${idx}_${(m.content || '').slice(0, 12)}`,
      role: m.role === 'model' ? 'assistant' : 'user',
      message: m.content,
      contextUsed: Boolean(m.context_used),
      contextSources: m.context_sources || [],
      places: m.places || [],
      placesError: m.places_error || null,
      manualMapsUrl: m.manual_maps_url || null,
      requiresLocation: Boolean(m.requires_location),
      searchCenter: m.search_center || null,
      actions: m.actions || [],
      timestamp: '',
    }));

  useEffect(() => {
    dispatch(fetchHealthData());
    const loadContext = async () => {
      try {
        setContextLoading(true);
        const ctx = await fetchAiHealthContext();
        setHealthContext(ctx);
      } catch (err) {
        console.error('Failed to load AI health context:', err);
      } finally {
        setContextLoading(false);
      }
    };
    const loadHistory = async () => {
      try {
        setIsTyping(true);
        const data = await fetchChatHistory();
        setSessionId(data.id);
        setMessages(mapServerMessages(data.messages || []));
        if (data.last_location?.lat && data.last_location?.lng) {
          setLocationState({
            lat: data.last_location.lat,
            lng: data.last_location.lng,
            label: data.last_location.label || 'Saved Session Location',
            denied: false,
          });
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      } finally {
        setIsTyping(false);
      }
    };
    loadContext();
    loadHistory();
  }, [dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async (text, overrideLoc = null) => {
    const userMsg = (text !== undefined ? text : input).trim();
    if (!userMsg) return;
    setInput('');

    const activeLoc = overrideLoc || locationState;
    const optimisticMsg = {
      id: `temp_${messages.length}_${userMsg.slice(0, 8)}`,
      role: 'user',
      message: userMsg,
      timestamp: '',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setIsTyping(true);

    try {
      const response = await sendChatMessage(userMsg, sessionId, {
        lat: activeLoc.lat,
        lng: activeLoc.lng,
        locationQuery: activeLoc.query || undefined,
        locationDenied: activeLoc.denied,
      });
      setSessionId(response.session_id);
      const mapped = mapServerMessages(response.history || []);
      setMessages(mapped);
      if (autoSpeak && ttsSupported && mapped.length > 0) {
        const lastMsg = mapped[mapped.length - 1];
        const plain = stripMarkdownForSpeech(lastMsg?.message || '');
        if (lastMsg?.role === 'assistant' && plain && plain.length <= 500) {
          speakMessageText(lastMsg.id, lastMsg.message);
        }
      }
      if (response.search_center?.lat && response.search_center?.lng) {
        setLocationState({
          lat: response.search_center.lat,
          lng: response.search_center.lng,
          label: response.search_center.label || 'Resolved Location',
          denied: false,
        });
      }
      if (response.context_used) {
        fetchAiHealthContext().then(setHealthContext).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to get AI response:', err);
      const serverDetail = err?.response?.data?.detail;
      const fallbackMsg =
        typeof serverDetail === 'string' && serverDetail.trim()
          ? serverDetail
          : 'I am currently having trouble connecting to AI services. Please try again in a moment.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${prev.length}`,
          role: 'assistant',
          message: fallbackMsg,
          failed: true,
          retryText: userMsg,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleRequestBrowserLocation = (autoPromptMessage = null) => {
    if (!navigator.geolocation) {
      setLocationState((prev) => ({ ...prev, denied: true }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'GPS Location Active',
          denied: false,
        };
        setLocationState(nextLoc);
        setLocating(false);
        if (autoPromptMessage) {
          sendMessage(autoPromptMessage, nextLoc);
        }
      },
      () => {
        setLocationState((prev) => ({ ...prev, denied: true }));
        setLocating(false);
      },
      { timeout: 10000 }
    );
  };

  const handleManualLocationSubmit = async (e, autoPromptMessage = null) => {
    e.preventDefault();
    const q = pinInput.trim();
    if (!q) return;
    setLocating(true);
    try {
      const geo = await geocodeLocationQuery(q);
      if (geo?.ok && geo.results?.length) {
        const top = geo.results[0];
        const nextLoc = {
          lat: top.lat,
          lng: top.lng,
          label: top.display_name,
          denied: false,
        };
        setLocationState(nextLoc);
        setPinInput('');
        if (autoPromptMessage) {
          await sendMessage(autoPromptMessage, nextLoc);
        }
      } else {
        await sendMessage(autoPromptMessage || q, { ...locationState, query: q });
        setPinInput('');
      }
    } catch {
      await sendMessage(q);
    } finally {
      setLocating(false);
    }
  };

  const handleResetChat = async () => {
    stopSpeech();
    try {
      setIsTyping(true);
      const data = await resetChatSession();
      if (data && data.session_id) {
        setSessionId(data.session_id);
      }
      setMessages(mapServerMessages(data?.history || []));
    } catch (err) {
      console.error('Failed to reset chat:', err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleActionTrigger = (act) => {
    if (act.type === 'route' && act.path) {
      navigate(act.path);
    } else if (act.type === 'external' && act.url) {
      window.open(act.url, '_blank', 'noopener,noreferrer');
    } else if (act.type === 'request_location') {
      const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.message;
      handleRequestBrowserLocation(lastUserText || null);
    }
  };

  const liveVitals = healthContext?.vitals || {};
  const hrVal = liveVitals.heartRate?.value ?? metrics?.heartRate?.current;
  const bpSys = liveVitals.bloodPressure?.systolic ?? metrics?.bloodPressure?.systolic;
  const bpDia = liveVitals.bloodPressure?.diastolic ?? metrics?.bloodPressure?.diastolic;
  const sleepVal = liveVitals.sleep?.hours ?? metrics?.sleep?.hours;
  const bmiVal = liveVitals.bmi?.value ?? metrics?.bmi?.value;
  const bmiCat = liveVitals.bmi?.category ?? metrics?.bmi?.category;
  const stepsVal = liveVitals.steps?.count ?? metrics?.steps?.count;

  const healthStats = [
    { label: 'Heart Rate', value: hrVal ? `${hrVal} bpm` : 'Not recorded', icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Blood Pressure', value: bpSys && bpDia ? `${bpSys}/${bpDia} mmHg` : 'Not recorded', icon: Activity, color: 'text-primary-500', bg: 'bg-primary-500/10' },
    { label: 'Sleep', value: sleepVal ? `${sleepVal} hrs` : 'Not recorded', icon: Moon, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'BMI', value: bmiVal ? `${bmiVal} (${bmiCat || 'Calculated'})` : 'Not recorded', icon: Pill, color: 'text-accent-500', bg: 'bg-accent-500/10' },
  ];

  const lastUserMsgText = [...messages].reverse().find((m) => m.role === 'user')?.message || null;

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-120px)]">
      {/* Left Sidebar: Health Context + Location + Suggested Prompts */}
      <div className="lg:w-76 xl:w-80 space-y-4 flex-shrink-0 overflow-y-auto pr-0.5 scrollbar-thin">
        {/* Location Control Card */}
        <div className="glass-card p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" />
              <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">Location Access</h4>
            </div>
            <button
              type="button"
              onClick={() => handleRequestBrowserLocation(null)}
              disabled={locating}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-300 hover:bg-primary-500/20 flex items-center gap-1"
            >
              <LocateFixed className="w-3 h-3" />
              {locating ? 'Locating...' : locationState.lat ? 'Refresh GPS' : 'Use GPS'}
            </button>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
            {locationState.lat
              ? `Active: ${locationState.label}`
              : locationState.denied
                ? 'GPS denied — enter city or PIN code:'
                : 'Not shared yet (required only for nearby clinics/hospitals)'}
          </p>
          <form onSubmit={(e) => handleManualLocationSubmit(e, null)} className="flex gap-1.5">
            <input
              type="text"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="City, area, or PIN code..."
              className="input-field py-1.5 px-2.5 text-xs flex-1"
            />
            <button type="submit" disabled={!pinInput.trim() || locating} className="btn-primary py-1.5 px-3 text-xs rounded-lg disabled:opacity-50">
              Set
            </button>
          </form>
        </div>

        {/* Live Health Context */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary-500" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Your Health Context</h4>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-300">
              {contextLoading ? 'Syncing' : 'Live'}
            </span>
          </div>
          <div className="space-y-2.5">
            {healthStats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{stat.value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
            <div>Steps: <span className="font-semibold text-slate-800 dark:text-white">{stepsVal ? `${stepsVal.toLocaleString()}` : 'Not recorded'}</span></div>
            {healthContext && (
              <div>
                Records: <span className="font-semibold text-slate-800 dark:text-white">{healthContext.records_count || 0}</span>
                {' · '}Rx: <span className="font-semibold text-slate-800 dark:text-white">{healthContext.prescriptions_count || 0}</span>
                {' · '}Workouts: <span className="font-semibold text-slate-800 dark:text-white">{healthContext.workouts_count || 0}</span>
              </div>
            )}
          </div>
        </div>

        {/* Suggested prompts */}
        <div className="glass-card p-4">
          <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm mb-3">Suggested Questions</h4>
          <div className="space-y-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="w-full text-left text-xs p-2.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-300 transition-all"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 glass-card flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white block leading-tight">HealthAI Assistant</span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Gemini AI + Personalized Context + Nearby Places + Voice</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ttsSupported && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (autoSpeak) stopSpeech();
                    setAutoSpeak((v) => !v);
                  }}
                  title="Auto-speak short assistant replies (<= 500 chars)"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    autoSpeak
                      ? 'bg-primary-500/10 text-primary-600 dark:text-primary-300 border-primary-500/30'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  {autoSpeak ? 'Voice On' : 'Voice Off'}
                </button>
                <select
                  aria-label="Speech speed"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(Number(e.target.value))}
                  className="input-field py-1 px-2 text-xs w-auto"
                >
                  <option value={0.85}>0.85x</option>
                  <option value={1}>1.0x</option>
                  <option value={1.2}>1.2x</option>
                  <option value={1.4}>1.4x</option>
                </select>
                {voices.length > 0 && (
                  <select
                    aria-label="Speech voice"
                    value={selectedVoiceUri}
                    onChange={(e) => setSelectedVoiceUri(e.target.value)}
                    className="input-field py-1 px-2 text-xs max-w-[140px]"
                  >
                    <option value="">Default Voice</option>
                    {voices.slice(0, 15).map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            <button
              onClick={handleResetChat}
              className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white px-2 py-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
                  {msg.role === 'assistant' && msg.contextUsed && msg.contextSources?.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/10 text-primary-600 dark:text-primary-300 border border-primary-500/20">
                      <Sparkles className="w-2.5 h-2.5" />
                      Using your data: {msg.contextSources.join(', ')}
                    </span>
                  )}

                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-md whitespace-pre-line'
                        : 'bg-slate-100 dark:bg-dark-100 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-white/10 rounded-bl-md whitespace-normal'
                    }`}
                  >
                    {msg.role === 'user' ? msg.message : <StructuredResponse text={msg.message} type="chat" />}
                  </div>

                  {msg.role === 'assistant' && ttsSupported && msg.message && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {speakingMsgId === msg.id ? (
                        <>
                          <button
                            type="button"
                            onClick={togglePauseSpeech}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-300 font-semibold"
                          >
                            {speechPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                            {speechPaused ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            onClick={stopSpeech}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300 font-semibold"
                          >
                            <Square className="w-3 h-3" /> Stop
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => speakMessageText(msg.id, msg.message)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-300 hover:bg-slate-100 dark:hover:bg-white/5 font-semibold"
                        >
                          <Volume2 className="w-3 h-3" /> Listen
                        </button>
                      )}
                      {autoSpeak && stripMarkdownForSpeech(msg.message).length > 500 && speakingMsgId !== msg.id && (
                        <span className="text-[10px] text-slate-400">Long response skipped auto-read — click Listen</span>
                      )}
                    </div>
                  )}

                  {/* Location Prompt Inline when needed */}
                  {msg.role === 'assistant' && msg.requiresLocation && (
                    <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 w-full space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRequestBrowserLocation(lastUserMsgText)}
                          disabled={locating}
                          className="btn-primary py-1.5 px-3 text-xs rounded-lg"
                        >
                          <LocateFixed className="w-3.5 h-3.5" />
                          {locating ? 'Requesting GPS...' : 'Allow Browser Location'}
                        </button>
                      </div>
                      <form onSubmit={(e) => handleManualLocationSubmit(e, lastUserMsgText)} className="flex gap-2">
                        <input
                          type="text"
                          value={pinInput}
                          onChange={(e) => setPinInput(e.target.value)}
                          placeholder="Or enter city, area, or 6-digit PIN code..."
                          className="input-field py-1.5 px-3 text-xs flex-1"
                        />
                        <button type="submit" disabled={!pinInput.trim() || locating} className="btn-primary py-1.5 px-3 text-xs rounded-lg">
                          Search Area
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Real Google Places Results + Map */}
                  {msg.role === 'assistant' && (msg.places?.length > 0 || msg.placesError) && (
                    <FacilityDiscoveryPanel
                      places={msg.places}
                      placesError={msg.placesError}
                      manualMapsUrl={msg.manualMapsUrl}
                      searchCenter={msg.searchCenter}
                    />
                  )}

                  {/* Actionable HealthPoint Module Buttons */}
                  {msg.role === 'assistant' && msg.actions?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {msg.actions.map((act) => (
                        <button
                          key={act.label}
                          type="button"
                          onClick={() => handleActionTrigger(act)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-dark-100 border border-slate-200 dark:border-white/15 text-slate-700 dark:text-slate-100 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-300 transition-all shadow-sm"
                        >
                          {act.type === 'external' ? <ExternalLink className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.failed && msg.retryText && (
                    <button
                      onClick={() => sendMessage(msg.retryText)}
                      className="text-[11px] text-primary-600 dark:text-primary-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center flex-shrink-0 mt-1 text-white text-xs font-bold shadow-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isTyping && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-slate-100 dark:bg-dark-100 flex items-center gap-2 shadow-sm border border-slate-200/60 dark:border-white/10">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-semibold animate-pulse">HealthAI is thinking</span>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      className="w-1.5 h-1.5 rounded-full bg-primary-500 block"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-slate-200/70 dark:border-white/10 space-y-2">
          {voiceError && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
              <span>{voiceError}</span>
              <button type="button" onClick={() => setVoiceError('')} className="text-[11px] font-bold underline">Dismiss</button>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleVoiceInput}
              title={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
              className={`w-11 h-11 p-0 flex-shrink-0 rounded-xl flex items-center justify-center border transition-all ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:border-primary-500'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={isListening ? 'Listening... speak clearly (you can edit before sending)' : 'Ask about your health, symptoms, medications, reports, or nearby doctors...'}
              className="input-field flex-1"
            />
            <button
              onClick={() => {
                if (isListening) toggleVoiceInput();
                sendMessage();
              }}
              disabled={!input.trim() || isTyping}
              className="btn-primary w-11 h-11 p-0 flex-shrink-0 rounded-xl disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            HealthAI provides informational guidance only. In an emergency, call 112 (India) or 911 immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
