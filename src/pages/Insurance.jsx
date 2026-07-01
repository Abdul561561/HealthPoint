import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, Calendar, FileText, CheckCircle, Clock, AlertTriangle, 
  ChevronRight, ArrowUpRight, DollarSign, Download, Plus, Search, Filter,
  MessageSquare, MapPin, Phone, Activity, Star, Navigation, Send,
  Bookmark, Info, HelpCircle, Loader2, Sparkles, Check, AlertCircle, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { useDispatch } from 'react-redux';
import { addToast } from '../redux/slices/uiSlice';
import { searchNearbyHospitals, searchAddress, getRoute } from '../services/openMapsApi';

export default function Insurance() {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Dashboard & Profile states
  const [activePolicy, setActivePolicy] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [favoriteHospitals, setFavoriteHospitals] = useState([]);
  const [userClaims, setUserClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  // Plan Explorer states
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [demoFilter, setDemoFilter] = useState('all');
  const [budgetFilter, setBudgetFilter] = useState(3000);
  const [cashlessFilter, setCashlessFilter] = useState(false);

  // Claim Submission & AI Auditor states
  const [showSubmitClaimModal, setShowSubmitClaimModal] = useState(false);
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDescription, setClaimDescription] = useState('');
  const [claimDate, setClaimDate] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analyzingClaimId, setAnalyzingClaimId] = useState(null);
  const [claimAuditorResult, setClaimAuditorResult] = useState(null);
  const [expandedClaimId, setExpandedClaimId] = useState(null);

  // AI Assistant Chatbot states
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'model',
      content: "Hi there! I'm InsureAI, your personal healthcare policy guide. Ask me about your deductibles, claim steps, waiting periods, or get plan recommendations!"
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatSessionId, setChatSessionId] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Map & Network Hospital states
  const [coords, setCoords] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [hospSearchQuery, setHospSearchQuery] = useState('');
  const [hospTypeFilter, setHospTypeFilter] = useState('All');

  // Leaflet references
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const markersRef = useRef([]);
  const routePolylineRef = useRef(null);

  // Education Center states
  const [eduQuery, setEduQuery] = useState('');
  const [faqExpanded, setFaqExpanded] = useState({});

  // ----------------------------------------------------
  // INITIALIZATIONS
  // ----------------------------------------------------

  // Geolocation detection
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          setCoords({ lat: 12.9716, lng: 77.5946 }); // Bengaluru default
          dispatch(addToast({ 
            title: 'Location Service', 
            message: 'Defaulting map coordinates to Bengaluru center.', 
            type: 'info' 
          }));
        },
        { timeout: 8000 }
      );
    } else {
      setCoords({ lat: 12.9716, lng: 77.5946 });
    }
  }, [dispatch]);

  // Fetch initial profile & dashboard details
  const fetchDashboardData = useCallback(async () => {
    try {
      setClaimsLoading(true);
      // Fetch user profile
      const profRes = await api.get('/auth/profile');
      setUserProfile(profRes.data);

      // Fetch saved plans
      const savedPlansRes = await api.get('/insurance/plans/saved');
      setSavedPlans(savedPlansRes.data);

      // Fetch favorite hospitals
      const favsRes = await api.get('/insurance/hospitals/favorites');
      setFavoriteHospitals(favsRes.data);

      // Fetch claims
      const claimsRes = await api.get('/insurance/claims');
      setUserClaims(claimsRes.data);

      // Fetch plans list
      const plansRes = await api.get('/insurance/plans');
      setPlans(plansRes.data);

      // Default active plan to HealthShield Individual Prime
      if (plansRes.data && plansRes.data.length > 0) {
        setActivePolicy(plansRes.data[0]);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Scroll chat window to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ----------------------------------------------------
  // MAP INITIALIZATION & UPDATE
  // ----------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'map' || !coords || !mapDivRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = window.L.map(mapDivRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([coords.lat, coords.lng], 13);

      const isDarkMode = document.documentElement.classList.contains('dark');
      const tileUrl = isDarkMode 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      window.L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: isDarkMode ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap'
      }).addTo(mapInstanceRef.current);

      window.L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
    } else {
      mapInstanceRef.current.setView([coords.lat, coords.lng], 13);
    }

    // Add User Pulse Location Marker
    if (userMarkerRef.current) userMarkerRef.current.remove();
    
    const pulseIcon = window.L.divIcon({
      html: `
        <div class="relative w-6 h-6 flex items-center justify-center">
          <div class="absolute w-6 h-6 bg-indigo-500 rounded-full opacity-40 animate-ping"></div>
          <div class="w-3.5 h-3.5 bg-indigo-600 rounded-full border-2 border-white shadow-md z-10"></div>
        </div>
      `,
      className: 'custom-user-location-pulse',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    userMarkerRef.current = window.L.marker([coords.lat, coords.lng], { icon: pulseIcon, zIndexOffset: 1000 })
      .addTo(mapInstanceRef.current)
      .bindPopup('<strong class="text-xs">Your Current Location</strong>');

  }, [coords, activeTab]);

  // Fetch OSM network hospitals based on map coordinates
  const fetchHospitals = useCallback(async () => {
    if (!coords) return;
    setMapLoading(true);
    try {
      const results = await searchNearbyHospitals(coords.lat, coords.lng, 8000);
      setHospitals(results);
    } catch (err) {
      console.error(err);
      dispatch(addToast({ 
        title: 'Network Hospital Finder', 
        message: 'Could not fetch hospitals from Overpass API. Displaying metropolitan defaults.', 
        type: 'error' 
      }));
    } finally {
      setMapLoading(false);
    }
  }, [coords, dispatch]);

  useEffect(() => {
    if (activeTab === 'map') {
      fetchHospitals();
    }
  }, [activeTab, fetchHospitals]);

  // Sync map pins when hospitals change
  useEffect(() => {
    if (!mapInstanceRef.current || activeTab !== 'map') return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    hospitals.forEach(hosp => {
      const isSelected = selectedHospital?.id === hosp.id;
      
      const hospIcon = window.L.divIcon({
        html: `
          <div class="relative cursor-pointer transition-all duration-300 transform ${
            isSelected ? 'scale-125 z-[1000]' : 'hover:scale-110'
          }">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center border-2 shadow-lg transition-all ${
              isSelected 
                ? 'bg-primary-500 border-white text-white shadow-primary-500/50 scale-110' 
                : 'bg-white border-primary-500 text-primary-500 dark:bg-slate-900 dark:border-primary-400 dark:text-primary-400'
            }">
              <span class="text-lg">🏥</span>
            </div>
            <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
              isSelected ? 'bg-primary-500 border-white' : 'bg-white border-primary-500 dark:bg-slate-900 dark:border-primary-400'
            }"></div>
          </div>
        `,
        className: 'custom-hosp-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 40]
      });

      const marker = window.L.marker([hosp.latitude, hosp.longitude], { icon: hospIcon })
        .addTo(mapInstanceRef.current);

      marker.on('click', () => {
        setSelectedHospital(hosp);
        mapInstanceRef.current.panTo([hosp.latitude, hosp.longitude]);
      });

      markersRef.current.push(marker);
    });

  }, [hospitals, selectedHospital, activeTab]);

  // Route drawing logic
  const drawRoute = async (hosp) => {
    if (!coords || !mapInstanceRef.current) return;

    if (activeRouteId === hosp.id) {
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
        routePolylineRef.current = null;
      }
      setActiveRouteId(null);
      setRouteInfo(null);
      mapInstanceRef.current.setView([coords.lat, coords.lng], 13);
      return;
    }

    try {
      setMapLoading(true);
      setSelectedHospital(hosp);
      const routeData = await getRoute(coords, { lat: hosp.latitude, lng: hosp.longitude });

      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
      }

      routePolylineRef.current = window.L.polyline(routeData.coordinates, {
        color: '#6366f1',
        weight: 5,
        opacity: 0.8,
        dashArray: '10, 8'
      }).addTo(mapInstanceRef.current);

      setActiveRouteId(hosp.id);
      setRouteInfo({
        distance: routeData.distance_km,
        duration: routeData.duration_min
      });

      const bounds = window.L.latLngBounds([
        [coords.lat, coords.lng],
        [hosp.latitude, hosp.longitude]
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80] });
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Route Finder', message: 'Unable to draw route path.', type: 'error' }));
    } finally {
      setMapLoading(false);
    }
  };

  // Toggle favorite hospitals
  const toggleFavoriteHospital = async (hosp) => {
    try {
      const res = await api.post('/insurance/hospitals/favorites', {
        hospital_id: hosp.id || hosp.hospital_id,
        name: hosp.name,
        address: hosp.address,
        rating: hosp.rating || 4.5,
        distance: hosp.distance || '0 km',
        phone: hosp.phone || '',
        ambulancePhone: hosp.ambulancePhone || '',
        latitude: hosp.latitude,
        longitude: hosp.longitude
      });
      dispatch(addToast({ 
        title: 'Hospital Saved', 
        message: res.data.message, 
        type: 'success' 
      }));
      // Reload favorites
      const favsRes = await api.get('/insurance/hospitals/favorites');
      setFavoriteHospitals(favsRes.data);
    } catch (err) {
      console.error("Failed to toggle favorite hospital:", err);
    }
  };

  // ----------------------------------------------------
  // PLANS ACTIONS
  // ----------------------------------------------------
  
  // Fetch plans with filters
  const fetchFilteredPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await api.get('/insurance/plans', {
        params: {
          demographic: demoFilter,
          budget_max: budgetFilter,
          cashless: cashlessFilter ? true : undefined
        }
      });
      setPlans(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => {
    fetchFilteredPlans();
  }, [demoFilter, budgetFilter, cashlessFilter]);

  // Save plan to dashboard
  const savePlan = async (planId) => {
    try {
      const isSaved = savedPlans.some(p => p.id === planId);
      if (isSaved) {
        await api.delete(`/insurance/plans/${planId}/save`);
        dispatch(addToast({ title: 'Plan Removed', message: 'Plan unsaved from your dashboard.', type: 'info' }));
      } else {
        await api.post(`/insurance/plans/${planId}/save`);
        dispatch(addToast({ title: 'Plan Bookmarked', message: 'Plan saved to your dashboard.', type: 'success' }));
      }
      // Reload saved
      const savedPlansRes = await api.get('/insurance/plans/saved');
      setSavedPlans(savedPlansRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Change Active Plan
  const selectActivePlan = (plan) => {
    setActivePolicy(plan);
    dispatch(addToast({ 
      title: 'Active Coverage Updated', 
      message: `Successfully set ${plan.name} as your primary insurance plan.`, 
      type: 'success' 
    }));
  };

  // ----------------------------------------------------
  // CLAIMS SUBMISSION & AI AUDITOR ACTIONS
  // ----------------------------------------------------

  // Handle local file selection simulation
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const mapped = files.map(f => ({
      file_url: `/uploads/${f.name}`,
      file_name: f.name,
      file_type: f.type || 'application/pdf'
    }));
    setSelectedFiles([...selectedFiles, ...mapped]);
  };

  // Predefined claim attachments for visual demo
  const selectQuickFile = (name, type) => {
    setSelectedFiles([...selectedFiles, {
      file_url: `/uploads/${name}`,
      file_name: name,
      file_type: type
    }]);
  };

  // File submit handler
  const handleFileClaim = async (e) => {
    e.preventDefault();
    if (!claimAmount || !claimDescription || !claimDate) return;

    try {
      const response = await api.post('/insurance/claims', {
        date: claimDate,
        amount: parseFloat(claimAmount),
        description: claimDescription,
        uploaded_documents: selectedFiles
      });

      setUserClaims([response.data, ...userClaims]);
      dispatch(addToast({ 
        title: 'Claim Submitted', 
        message: 'Your claim request has been registered in the workflow system.', 
        type: 'success' 
      }));

      // Clean up modal states
      setClaimAmount('');
      setClaimDescription('');
      setClaimDate('');
      setSelectedFiles([]);
      setShowSubmitClaimModal(false);
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Submission Error', message: 'Failed to file claim request.', type: 'error' }));
    }
  };

  // Trigger Gemini audit parsing
  const runAiClaimAudit = async (claimId) => {
    setAnalyzingClaimId(claimId);
    try {
      const res = await api.post(`/insurance/claims/${claimId}/analyze`);
      setClaimAuditorResult(res.data.ai_analysis);
      
      // Update local claims list to show modified status
      setUserClaims(prev => prev.map(c => c.id === claimId ? res.data : c));
      
      dispatch(addToast({ 
        title: 'AI Audit Complete', 
        message: res.data.ai_analysis.reason || 'Checklist updated successfully.', 
        type: 'success' 
      }));
    } catch (err) {
      console.error(err);
      dispatch(addToast({ title: 'Audit Failure', message: 'AI models failed to analyze documents.', type: 'error' }));
    } finally {
      setAnalyzingClaimId(null);
    }
  };

  // ----------------------------------------------------
  // CHATBOT ACTIONS
  // ----------------------------------------------------

  const sendChatMessage = async (msgText) => {
    const textToSend = msgText || chatInput;
    if (!textToSend.trim() || chatLoading) return;

    const userMsg = { role: 'user', content: textToSend };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await api.post('/insurance/chat', {
        message: textToSend,
        session_id: chatSessionId
      });

      setChatSessionId(res.data.session_id);
      setChatMessages(prev => [...prev, { role: 'model', content: res.data.reply }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { 
        role: 'model', 
        content: "I apologize, but I am having trouble connecting to my cognitive center. Please try again shortly." 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Trigger education center terms explained by AI
  const askAiToExplainTerm = (term) => {
    setActiveTab('chat');
    sendChatMessage(`Explain the insurance term: "${term}" in simple patient-friendly words.`);
  };

  // ----------------------------------------------------
  // STYLING HELPERS
  // ----------------------------------------------------
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
      case 'Documents Verified':
        return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-500/20';
      case 'Submitted':
        return 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 border border-blue-500/20';
      case 'Under Review':
        return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-500/20';
      case 'Action Required':
        return 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-500/20';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  // Curated hospital filters
  const filteredHospitals = hospitals.filter(hosp => {
    const matchesSearch = hosp.name.toLowerCase().includes(hospSearchQuery.toLowerCase()) ||
                          hosp.address.toLowerCase().includes(hospSearchQuery.toLowerCase());
    const matchesType = hospTypeFilter === 'All' || hosp.type === hospTypeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto min-h-screen pb-12">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary-500/10 text-primary-500 dark:text-primary-400 border border-primary-500/20">
              <Shield className="w-5 h-5 animate-pulse" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Policy Assistance Hub</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
            AI Insurance Ecosystem
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage policies, audit clinical claims, locate network partners, and consult InsureAI.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSubmitClaimModal(true)}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-primary-500 to-indigo-600 text-white text-sm font-bold flex items-center gap-2 shadow-glow-primary hover:opacity-95 hover:scale-[1.01] transition-all"
          >
            <Plus className="w-4.5 h-4.5" />
            Submit New Claim
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-white/5 pb-px no-scrollbar gap-2">
        {[
          { id: 'dashboard', label: 'Coverage Dashboard', icon: Shield },
          { id: 'plans', label: 'Plan Explorer', icon: Search },
          { id: 'claims', label: 'Claim Auditor', icon: FileText },
          { id: 'chat', label: 'Ask InsureAI', icon: MessageSquare },
          { id: 'map', label: 'Hospital Finder', icon: MapPin },
          { id: 'education', label: 'Education Hub', icon: HelpCircle }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-all -mb-px ${
                isActive 
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-primary-500' : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TABS CONTAINER */}
      <AnimatePresence mode="wait">
        
        {/* TAB 1: COVERAGE DASHBOARD */}
        {activeTab === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left Col - Current Active Policy details */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Active Policy summary */}
              {activePolicy ? (
                <div className="glass-card p-6 relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-transparent to-accent-500/5 border border-indigo-500/20">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 border border-primary-500/20">
                        Primary Policy
                      </span>
                      <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-3">{activePolicy.name}</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                        {activePolicy.provider} • {activePolicy.type.toUpperCase()} PLAN
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-primary-500/15 flex items-center justify-center text-primary-500 border border-primary-500/20">
                      <Shield className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-slate-200/80 dark:border-white/5">
                    <div>
                      <span className="text-xs text-slate-400 font-semibold uppercase">Premium Range</span>
                      <p className="text-md font-extrabold text-slate-900 dark:text-white mt-1">₹{activePolicy.premium_range}/mo</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 font-semibold uppercase">Waiting Period</span>
                      <p className="text-md font-extrabold text-slate-900 dark:text-white mt-1">{activePolicy.waiting_period}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 font-semibold uppercase">Coverage Limit</span>
                      <p className="text-md font-extrabold text-slate-900 dark:text-white mt-1">₹{activePolicy.coverage_amount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-8 text-center">
                  <Activity className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-slate-400 mt-2 font-medium">No active policy configured. Explore plans to configure coverage.</p>
                </div>
              )}

              {/* Deductibles and Progress bar */}
              <div className="glass-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Annual Co-insurance Progress</h3>
                  <Sparkles className="w-4 h-4 text-primary-500" />
                </div>
                
                {/* Deductible Met */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400 font-bold">Annual Deductible Met</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">₹8,500 / ₹10,000 (85%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-indigo-600 rounded-full" style={{ width: '85%' }} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    You have ₹1,500 remaining on your co-pay threshold before 100% cashless support unlocks.
                  </p>
                </div>

                {/* Out of pocket max */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400 font-bold">Out-of-Pocket Maximum</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">₹14,200 / ₹40,000 (35%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-accent-500 rounded-full" style={{ width: '35%' }} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cap limit for family liability. HealthPoint covers 100% of excess items.
                  </p>
                </div>
              </div>

              {/* Claims progress timeline dashboard widget */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Active Claim Progress</h3>
                
                {userClaims.length > 0 && userClaims[0].status !== 'Approved' ? (
                  <div className="p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">{userClaims[0].description}</h4>
                        <span className="text-xs text-slate-400 mt-1 block">ID: #{userClaims[0].id.slice(-8).toUpperCase()}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusBadge(userClaims[0].status)}`}>
                        {userClaims[0].status}
                      </span>
                    </div>

                    {/* Timeline stepper */}
                    <div className="flex items-center gap-1.5 pt-2">
                      {['Submitted', 'Documents Verified', 'Under Review', 'Approved'].map((step, idx) => {
                        const statuses = ['Submitted', 'Documents Verified', 'Under Review', 'Approved'];
                        const currentIdx = statuses.indexOf(userClaims[0].status);
                        const isDone = idx <= currentIdx;
                        return (
                          <React.Fragment key={step}>
                            {idx > 0 && (
                              <div className={`flex-1 h-1 rounded ${isDone ? 'bg-primary-500' : 'bg-slate-200 dark:bg-white/10'}`} />
                            )}
                            <div className="flex flex-col items-center relative">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                isDone 
                                  ? 'bg-primary-500 text-white' 
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-white/5'
                              }`}>
                                {isDone ? '✓' : idx + 1}
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 absolute top-7 whitespace-nowrap">{step}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <div className="pt-6 text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Last update: {userClaims[0].timeline[userClaims[0].timeline.length - 1]?.note}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    No active/pending claims under review.
                  </div>
                )}
              </div>

            </div>

            {/* Right Col - Quick Stats, Saved Plans, Favorite Hospitals */}
            <div className="space-y-6">
              
              {/* Claims Snapshot */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Claims History</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-center">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Total Claims Filed</span>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                      ₹{userClaims.reduce((acc, curr) => acc + curr.amount, 0).toFixed(0)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-center">
                    <span className="text-xs text-slate-400 font-semibold uppercase">Approved Claims</span>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                      ₹{userClaims.filter(c => c.status === 'Approved').reduce((acc, curr) => acc + curr.amount, 0).toFixed(0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bookmarked Saved Plans */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Saved Policies</h3>
                
                {savedPlans.length > 0 ? (
                  <div className="space-y-3">
                    {savedPlans.map((plan) => (
                      <div 
                        key={plan.id} 
                        className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 hover:border-primary-500/30 transition-all cursor-pointer"
                        onClick={() => selectActivePlan(plan)}
                      >
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{plan.name}</h4>
                          <span className="text-xs text-slate-400 mt-1 block">₹{plan.premium_range}/mo • Cashless: {plan.cashless_support ? 'Yes' : 'No'}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs text-center py-4">No bookmarked plans saved yet.</p>
                )}
              </div>

              {/* Favorite Hospitals */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Favorite Network Partners</h3>
                
                {favoriteHospitals.length > 0 ? (
                  <div className="space-y-3">
                    {favoriteHospitals.map((hosp) => (
                      <div key={hosp.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{hosp.name}</h4>
                            <span className="text-[11px] text-slate-400 mt-0.5 block">{hosp.address}</span>
                          </div>
                          <span className="text-[10px] font-bold text-indigo-500">{hosp.distance}</span>
                        </div>
                        <div className="flex gap-2 justify-between pt-1 border-t border-slate-200/50 dark:border-white/5">
                          <a href={`tel:${hosp.phone}`} className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-primary-500">
                            <Phone className="w-3.5 h-3.5" /> Call
                          </a>
                          <a href={`tel:${hosp.ambulancePhone}`} className="flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:text-rose-600">
                            <Activity className="w-3.5 h-3.5" /> Ambulance
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs text-center py-4">No network hospitals added to favorites.</p>
                )}
              </div>

            </div>
          </motion.div>
        )}

        {/* TAB 2: PLAN EXPLORER */}
        {activeTab === 'plans' && (
          <motion.div
            key="plans"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-4 gap-6"
          >
            {/* Sidebar Filters */}
            <div className="lg:col-span-1 glass-card p-6 space-y-6 h-fit border border-white/5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/5">
                <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2 text-md">
                  <Filter className="w-4.5 h-4.5 text-primary-500" /> Plan Filters
                </h3>
              </div>

              {/* Demographic type selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Policy Type</label>
                <div className="flex flex-col gap-1.5 mt-1">
                  {[
                    { id: 'all', label: 'All Plans' },
                    { id: 'individual', label: 'Individual' },
                    { id: 'family', label: 'Family Cover' },
                    { id: 'senior citizen', label: 'Senior Citizen' },
                    { id: 'maternity', label: 'Maternity Care' },
                    { id: 'critical illness', label: 'Critical Illness' }
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setDemoFilter(type.id)}
                      className={`px-3 py-2 text-xs text-left rounded-xl font-bold border transition-all ${
                        demoFilter === type.id
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-slate-100 hover:bg-slate-200 border-transparent text-slate-600 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-300'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Premium budget slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-400 uppercase">
                  <span>Premium Threshold</span>
                  <span className="text-primary-500 font-extrabold">₹{budgetFilter}/mo</span>
                </div>
                <input
                  type="range"
                  min="800"
                  max="3000"
                  step="100"
                  value={budgetFilter}
                  onChange={(e) => setBudgetFilter(parseInt(e.target.value))}
                  className="w-full accent-primary-500 h-1.5 bg-slate-200 dark:bg-white/10 rounded"
                />
              </div>

              {/* Cashless support toggle */}
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-400 uppercase">Direct Cashless</span>
                  <p className="text-[10px] text-slate-500">Only show network cashless-supported plans</p>
                </div>
                <button
                  onClick={() => setCashlessFilter(!cashlessFilter)}
                  className={`w-11 h-6 rounded-full p-1 transition-all ${
                    cashlessFilter ? 'bg-primary-500' : 'bg-slate-200 dark:bg-white/10'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-all transform ${
                    cashlessFilter ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

            </div>

            {/* Plan cards grid */}
            <div className="lg:col-span-3 space-y-6">
              {plansLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                  <span className="mt-2 text-sm font-semibold">Updating database filters...</span>
                </div>
              ) : plans.length === 0 ? (
                <div className="glass-card p-12 text-center text-slate-400">
                  <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="mt-2 text-sm font-semibold">No curated plans match your budget or filter parameters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {plans.map((plan) => {
                    const isSaved = savedPlans.some(p => p.id === plan.id);
                    const isActive = activePolicy?.id === plan.id;
                    return (
                      <div 
                        key={plan.id}
                        className={`glass-card p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 border-2 ${
                          isActive 
                            ? 'border-primary-500 ring-4 ring-primary-500/10 scale-[1.01]' 
                            : 'border-transparent hover:border-slate-200 dark:hover:border-white/15'
                        }`}
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[9px] font-black tracking-widest text-primary-500 uppercase">{plan.provider}</span>
                              <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1 leading-tight">{plan.name}</h3>
                              <span className="text-xs capitalize font-bold text-slate-400 mt-0.5 block">{plan.type} Coverage</span>
                            </div>
                            <button 
                              onClick={() => savePlan(plan.id)}
                              className={`p-2 rounded-xl border hover:scale-105 transition-all ${
                                isSaved 
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                                  : 'border-slate-200 dark:border-white/5 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Bookmark className="w-4 h-4 fill-current" />
                            </button>
                          </div>

                          <div className="flex items-baseline gap-1 pt-2">
                            <span className="text-3xl font-black text-slate-950 dark:text-white">₹{plan.premium_range.split("-")[0].trim()}</span>
                            <span className="text-xs text-slate-400">/ mo premium</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 pb-2 border-t border-b border-slate-100 dark:border-white/5 text-[11px] text-slate-400">
                            <div>
                              <span className="font-semibold block text-[10px] uppercase">Coverage Sum</span>
                              <span className="font-black text-slate-800 dark:text-slate-200 mt-0.5 block">₹{plan.coverage_amount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="font-semibold block text-[10px] uppercase">Waiting Period</span>
                              <span className="font-black text-slate-800 dark:text-slate-200 mt-0.5 block">{plan.waiting_period}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="font-semibold block text-[10px] uppercase">Cashless Support</span>
                              <span className="font-black text-slate-800 dark:text-slate-200 mt-0.5 block">
                                {plan.cashless_support ? '✓ Supported in 800+ network hospitals' : 'Reimbursement only'}
                              </span>
                            </div>
                          </div>

                          {/* Benefits */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-slate-400">Benefits:</span>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-350">
                              {plan.benefits.map((b, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                  <span>{b}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Exclusions */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-black uppercase text-slate-400">Key Exclusions:</span>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-350">
                              {plan.exclusions.map((exc, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                                  <span>{exc}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex gap-2">
                          <button
                            onClick={() => selectActivePlan(plan)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                              isActive 
                                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 cursor-default'
                                : 'bg-primary-500 text-white shadow-glow-primary hover:opacity-95'
                            }`}
                          >
                            {isActive ? 'Current Primary Plan' : 'Select Plan & Set Active'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 3: CLAIM ASSISTANCE & AI AUDITOR */}
        {activeTab === 'claims' && (
          <motion.div
            key="claims"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Filter / Search & Header */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-between glass-card p-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Claims Audit & Timeline Tracker</h3>
                <p className="text-xs text-slate-400 mt-0.5">Submit hospital documents for instant AI checklist validation & audit checks.</p>
              </div>
              <button 
                onClick={() => setShowSubmitClaimModal(true)}
                className="px-4 py-2.5 rounded-xl bg-primary-500 text-white text-xs font-bold flex items-center gap-2 hover:opacity-90"
              >
                <Plus className="w-4 h-4" /> File New Claim
              </button>
            </div>

            {/* Claims list */}
            {claimsLoading ? (
              <div className="flex flex-col items-center py-20 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                <span className="mt-2 text-sm font-semibold">Fetching claims registry...</span>
              </div>
            ) : userClaims.length === 0 ? (
              <div className="glass-card p-12 text-center text-slate-400">
                <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="mt-2 text-sm font-semibold">No claims registered yet. File a claim to simulate document audit workflows.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {userClaims.map((claim) => {
                  const isExpanded = expandedClaimId === claim.id;
                  const hasAnalysis = !!claim.ai_analysis;
                  return (
                    <div 
                      key={claim.id}
                      className="glass-card p-6 space-y-4 border border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="cursor-pointer" onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}>
                          <div className="flex items-center gap-3">
                            <h4 className="font-black text-slate-950 dark:text-white text-base">{claim.description}</h4>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(claim.status)}`}>
                              {claim.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                            <span>ID: #{claim.id.slice(-8).toUpperCase()}</span>
                            <span>•</span>
                            <span>Service Date: {claim.date}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span className="text-lg font-black text-slate-900 dark:text-white">₹{claim.amount.toFixed(2)}</span>
                          
                          {/* Analyze AI Button */}
                          {!hasAnalysis && (
                            <button
                              onClick={() => runAiClaimAudit(claim.id)}
                              disabled={analyzingClaimId === claim.id}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-primary-500 to-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-glow-primary disabled:opacity-50"
                            >
                              {analyzingClaimId === claim.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Auditing...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Audit with AI
                                </>
                              )}
                            </button>
                          )}
                          
                          <button 
                            onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}
                            className="text-xs font-bold text-primary-500 hover:underline"
                          >
                            {isExpanded ? 'Hide Details' : 'Expand Details'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Section containing Audit and Stepper */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-4 border-t border-slate-200/80 dark:border-white/5 space-y-6 overflow-hidden"
                        >
                          {/* Audit Result Panel */}
                          {hasAnalysis ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                              <div className="space-y-3">
                                <h5 className="text-xs font-black text-indigo-500 uppercase flex items-center gap-1">
                                  <Sparkles className="w-3.5 h-3.5" /> Document Verification Report
                                </h5>
                                
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Verification Verdict:</span>
                                    <span className={`font-bold ${claim.ai_analysis.verification_status === 'Passed' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                      {claim.ai_analysis.verification_status}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Detected Patient Name:</span>
                                    <span className="text-slate-800 dark:text-slate-200 font-bold">{claim.ai_analysis.detected_name}</span>
                                  </div>
                                  {claim.ai_analysis.name_mismatch && (
                                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-500 flex items-center gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>Warning: Patient name in bill doesn't align with policyholder!</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Audited Bill Amount:</span>
                                    <span className="text-slate-800 dark:text-slate-200 font-bold">₹{claim.ai_analysis.detected_amount}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-200 dark:border-white/5 mt-2">
                                  {claim.ai_analysis.reason}
                                </p>
                              </div>

                              <div className="space-y-3">
                                <h5 className="text-xs font-black text-indigo-500 uppercase">Audit Checklist</h5>
                                <div className="space-y-2">
                                  {claim.ai_analysis.checklist?.map((chk, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">{chk.item}</span>
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                        chk.present 
                                          ? 'bg-emerald-500/10 text-emerald-500' 
                                          : 'bg-rose-500/10 text-rose-500'
                                      }`}>
                                        {chk.present ? 'Verified' : 'Missing'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-center text-xs text-slate-400 flex items-center justify-between">
                              <span>Upload file metadata in claim form and click "Audit with AI" to check alignment.</span>
                              <button
                                onClick={() => runAiClaimAudit(claim.id)}
                                className="px-3 py-1.5 rounded-xl bg-primary-500 text-white font-bold"
                              >
                                Audit Now
                              </button>
                            </div>
                          )}

                          {/* Stepper Timeline */}
                          <div className="space-y-4 pt-2">
                            <h5 className="text-xs font-black text-slate-400 uppercase">Claim History Timeline</h5>
                            <div className="space-y-4 relative pl-4 border-l border-slate-200 dark:border-white/5 ml-2">
                              {claim.timeline?.map((evt, idx) => (
                                <div key={idx} className="space-y-1 relative">
                                  <div className="absolute -left-6.5 top-1 w-3.5 h-3.5 rounded-full bg-primary-500 border-2 border-white dark:border-slate-900 shadow-sm" />
                                  <div className="flex justify-between items-start text-xs">
                                    <span className="font-black text-slate-900 dark:text-white">{evt.status}</span>
                                    <span className="text-[10px] text-slate-400">{new Date(evt.timestamp).toLocaleString()}</span>
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{evt.note}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Document downloads */}
                          {claim.uploaded_documents?.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-xs font-black text-slate-400 uppercase">Attached Documents</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {claim.uploaded_documents.map((doc, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                      <span className="text-xs text-slate-800 dark:text-slate-200 truncate">{doc.file_name}</span>
                                    </div>
                                    <a 
                                      href={doc.file_url} 
                                      download 
                                      className="p-1 rounded bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-white"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 4: ASK INSUREAI */}
        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="glass-card p-6 h-[600px] flex flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-500/5 via-slate-900/10 to-accent-500/5 border border-white/5 relative"
          >
            <div className="absolute top-0 left-0 right-0 p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur z-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center font-black">
                  🤖
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">InsureAI Assistant</h3>
                  <span className="text-[10px] text-emerald-500 font-bold block flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" /> Online & Policy Context Aware
                  </span>
                </div>
              </div>
              <HelpCircle className="w-5 h-5 text-slate-400" />
            </div>

            {/* Messages box */}
            <div className="flex-1 overflow-y-auto pt-16 pb-4 space-y-4 pr-2 no-scrollbar">
              {chatMessages.map((msg, idx) => {
                const isModel = msg.role === 'model';
                return (
                  <div 
                    key={idx} 
                    className={`flex ${isModel ? 'justify-start' : 'justify-end'} items-end gap-2`}
                  >
                    {isModel && (
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center text-xs flex-shrink-0 mb-1 font-bold">
                        AI
                      </div>
                    )}
                    <div className={`max-w-[80%] p-3.5 rounded-2xl border text-sm ${
                      isModel 
                        ? 'bg-slate-100 text-slate-950 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-white/5 rounded-bl-none'
                        : 'bg-gradient-to-r from-primary-500 to-indigo-600 text-white border-transparent rounded-br-none shadow-glow-primary'
                    }`}>
                      {/* Formatted markdown-friendly lines */}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                );
              })}

              {/* Chat loading indicator */}
              {chatLoading && (
                <div className="flex justify-start items-end gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center text-xs flex-shrink-0 mb-1">
                    AI
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-white/5 rounded-bl-none flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Suggestions */}
            <div className="pb-3 pt-2 flex overflow-x-auto gap-2 no-scrollbar border-t border-slate-200 dark:border-white/5">
              {[
                "Which plan covers maternity?",
                "What is cashless claim?",
                "Do you support pre-existing diseases?",
                "What does deductible mean?"
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendChatMessage(chip)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-500 bg-slate-50 dark:bg-white/5 dark:border-white/5 dark:hover:border-indigo-500/40 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-300 whitespace-nowrap transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Message input */}
            <form 
              onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
              className="flex items-center gap-2 border-t border-slate-200 dark:border-white/5 pt-3"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about co-pays, waiting periods, claims..."
                className="flex-1 px-4 py-3 bg-slate-100 dark:bg-white/5 border border-transparent focus:ring-1 focus:ring-primary-500 text-sm outline-none rounded-2xl dark:text-white"
              />
              <button 
                type="submit" 
                className="p-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl shadow-glow-primary transition-all flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}

        {/* TAB 5: NETWORK HOSPITAL FINDER */}
        {activeTab === 'map' && (
          <motion.div
            key="map"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Map sidebar search and list */}
            <div className="lg:col-span-1 glass-card p-6 flex flex-col h-[550px] border border-white/5">
              <div className="space-y-4 flex-1 flex flex-col justify-between overflow-hidden">
                <div className="space-y-3">
                  <h3 className="font-black text-slate-900 dark:text-white">Network Hospitals</h3>
                  
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search hospitals..."
                      value={hospSearchQuery}
                      onChange={(e) => setHospSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs outline-none border border-transparent focus:ring-1 focus:ring-primary-500 dark:text-white"
                    />
                  </div>

                  {/* Filter chips */}
                  <div className="flex overflow-x-auto gap-1.5 pb-1 no-scrollbar">
                    {['All', 'General Hospital', 'Cardiac Care Hospital', 'Maternity Hospital'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setHospTypeFilter(cat)}
                        className={`px-3 py-1 rounded-xl text-[10px] font-black whitespace-nowrap border transition-all ${
                          hospTypeFilter === cat
                            ? 'bg-primary-500 text-white border-primary-500'
                            : 'bg-slate-100 hover:bg-slate-200 border-transparent text-slate-500 dark:bg-white/5 dark:text-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List container */}
                <div className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1 no-scrollbar">
                  {mapLoading ? (
                    <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                      <span className="text-[11px] font-semibold mt-2">Connecting Overpass API...</span>
                    </div>
                  ) : filteredHospitals.length === 0 ? (
                    <p className="text-slate-400 text-xs text-center py-10">No network hospitals matching query.</p>
                  ) : (
                    filteredHospitals.map((hosp) => {
                      const isSelected = selectedHospital?.id === hosp.id;
                      const isFavorite = favoriteHospitals.some(fh => fh.hospital_id === hosp.id);
                      return (
                        <div
                          key={hosp.id}
                          onClick={() => {
                            setSelectedHospital(hosp);
                            mapInstanceRef.current?.panTo([hosp.latitude, hosp.longitude]);
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                            isSelected 
                              ? 'bg-primary-500/5 border-primary-500' 
                              : 'bg-slate-50 border-transparent hover:border-slate-200 dark:bg-white/5 dark:hover:bg-white/10'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight">{hosp.name}</h4>
                              <span className="text-[10px] text-primary-500 font-bold block mt-0.5">{hosp.type}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFavoriteHospital(hosp); }}
                              className={`p-1.5 rounded-lg border ${
                                isFavorite 
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                                  : 'border-slate-200 dark:border-white/5 text-slate-400 hover:text-white'
                              }`}
                            >
                              <Bookmark className="w-3.5 h-3.5 fill-current" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{hosp.address}</span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                            <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-amber-400 fill-current" /> {hosp.rating}</span>
                            <span className="font-black text-primary-500">{hosp.distance}</span>
                          </div>

                          <div className="flex gap-2 justify-between pt-2 border-t border-slate-200/50 dark:border-white/5">
                            <button 
                              onClick={(e) => { e.stopPropagation(); drawRoute(hosp); }}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black flex items-center justify-center gap-1 border ${
                                activeRouteId === hosp.id
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-transparent'
                              }`}
                            >
                              <Navigation className="w-3 h-3" />
                              {activeRouteId === hosp.id ? 'Clear Path' : 'Directions'}
                            </button>
                            
                            <a 
                              href={`tel:${hosp.phone}`} 
                              onClick={e => e.stopPropagation()}
                              className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-350 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg flex items-center justify-center"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Directions Info Panel */}
                {routeInfo && (
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-[11px] text-slate-300 space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-400">Driving Distance:</span>
                      <span className="font-black text-white">{routeInfo.distance} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-400">Est. Travel Time:</span>
                      <span className="font-black text-white">{routeInfo.duration} mins</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Map Frame */}
            <div className="lg:col-span-2 glass-card p-2 h-[550px] relative overflow-hidden border border-white/5">
              <div ref={mapDivRef} className="w-full h-full rounded-2xl z-0" />
            </div>

          </motion.div>
        )}

        {/* TAB 6: EDUCATION CENTER */}
        {activeTab === 'education' && (
          <motion.div
            key="education"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            <div className="text-center max-w-xl mx-auto space-y-3">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Insurance Glossary & FAQs</h2>
              <p className="text-xs text-slate-500">Demystify premium calculations, out-of-pocket costs, and waiting clauses in plain language.</p>
              
              {/* Redirect explain input */}
              <form 
                onSubmit={(e) => { e.preventDefault(); askAiToExplainTerm(eduQuery); }}
                className="flex items-center gap-2 max-w-md mx-auto pt-2"
              >
                <input
                  type="text"
                  placeholder="Ask AI to explain: Co-insurance, Exclusions..."
                  value={eduQuery}
                  onChange={(e) => setEduQuery(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-xs outline-none border border-transparent focus:ring-1 focus:ring-primary-500 rounded-xl dark:text-white"
                />
                <button type="submit" className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-glow-primary">
                  Ask AI
                </button>
              </form>
            </div>

            {/* Terminology Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              {[
                { term: 'Deductible', def: 'The total amount you must pay out-of-pocket for medical treatments before your health insurance starts covering eligible bills.' },
                { term: 'Co-payment (Co-pay)', def: 'A fixed amount (e.g. ₹250 or ₹500) you pay at the hospital counter each time you visit a doctor, with the policy covering the rest.' },
                { term: 'Cashless Claims', def: 'An arrangement where the hospital bills the insurance provider directly, meaning you do not have to pay and claim reimbursement.' },
                { term: 'Waiting Period', def: 'The specific timeframe (e.g., 1 or 2 years) after policy purchase during which claims for pre-existing illnesses are not covered.' },
                { term: 'Exclusions', def: 'Conditions, services, or procedures (like elective cosmetic surgeries) that are explicitly not covered by the health policy.' },
                { term: 'Out-of-Pocket Max', def: 'The absolute maximum limit on co-pay or deductibles you are liable to pay annually, after which the policy pays 100%.' }
              ].map((item, idx) => (
                <div key={idx} className="glass-card p-5 space-y-3 border border-white/5 hover:border-indigo-500/20 transition-all flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <h4 className="font-black text-slate-900 dark:text-white text-sm">{item.term}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.def}</p>
                  </div>
                  <button 
                    onClick={() => askAiToExplainTerm(item.term)}
                    className="text-[11px] font-black text-primary-500 hover:underline flex items-center gap-1.5 self-start pt-2"
                  >
                    Ask AI to expand <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* FAQ Expandable Accordions */}
            <div className="glass-card p-6 space-y-4 mt-6">
              <h3 className="font-black text-slate-900 dark:text-white text-lg">Frequently Asked Questions</h3>
              <div className="divide-y divide-slate-200/50 dark:divide-white/5 space-y-2">
                {[
                  { q: 'How long does a cashless claim approval usually take?', a: 'Cashless pre-authorization typically takes 2 to 4 hours from hospital admission, during which the claims auditor verifies documents and eligibility parameters.' },
                  { q: 'Can I claim tax benefits on my health insurance premium?', a: 'Yes. Under Section 80D of the Income Tax Act, health insurance premiums paid for self, spouse, children, and parents qualify for substantial tax deductions.' },
                  { q: 'What is the grace period for policy renewal?', a: 'Most insurance providers offer a grace period of 15 to 30 days after the policy expiry date to renew without losing continuity benefits (like waiting period credits).' }
                ].map((faq, idx) => {
                  const isExp = faqExpanded[idx];
                  return (
                    <div key={idx} className="pt-3 pb-3">
                      <button
                        onClick={() => setFaqExpanded({ ...faqExpanded, [idx]: !isExp })}
                        className="w-full flex justify-between items-center text-xs font-black text-left text-slate-800 dark:text-slate-200"
                      >
                        <span>{faq.q}</span>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transform transition-transform ${isExp ? 'rotate-90' : ''}`} />
                      </button>
                      {isExp && (
                        <p className="text-xs text-slate-400 mt-2 pl-2 border-l border-primary-500 leading-relaxed animate-fade-in">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </motion.div>
        )}

      </AnimatePresence>

      {/* MODAL: SUBMIT CLAIM */}
      <AnimatePresence>
        {showSubmitClaimModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubmitClaimModal(false)}
            />
            
            <motion.div 
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/5 mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Submit Reimbursement Claim</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Fill in claim parameters and attach receipt documents.</p>
                </div>
                <button 
                  onClick={() => setShowSubmitClaimModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-white transition-all text-lg font-black"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleFileClaim} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Treatment Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Inpatient Orthopedic Surgery, Pediatric OPD consultation"
                    value={claimDescription}
                    onChange={(e) => setClaimDescription(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs outline-none border border-transparent focus:ring-1 focus:ring-primary-500 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Date of Service</label>
                    <input
                      type="date"
                      required
                      value={claimDate}
                      onChange={(e) => setClaimDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs outline-none border border-transparent focus:ring-1 focus:ring-primary-500 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Billing Amount (₹)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      placeholder="e.g. 25000.00"
                      value={claimAmount}
                      onChange={(e) => setClaimAmount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs outline-none border border-transparent focus:ring-1 focus:ring-primary-500 dark:text-white"
                    />
                  </div>
                </div>

                {/* Upload attachments zone */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Scan Documents / Medical Bills</label>
                  <div className="border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl p-6 text-center hover:border-indigo-500/50 transition-all cursor-pointer relative bg-slate-50 dark:bg-white/5">
                    <input 
                      type="file" 
                      multiple 
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                    />
                    <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-400 mt-2 font-semibold">Drag & drop bills, prescriptions, reports here</p>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Or browse files from your computer</span>
                  </div>

                  {/* Predefined Mock Files helper for faster testing */}
                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Quick Attach Mock Files:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <button 
                        type="button" 
                        onClick={() => selectQuickFile(`${userProfile?.name || 'Patient'}_discharge_summary.pdf`, 'application/pdf')}
                        className="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-[10px] font-bold text-indigo-500 border border-indigo-500/10"
                      >
                        + Discharge Summary
                      </button>
                      <button 
                        type="button" 
                        onClick={() => selectQuickFile('doctor_prescription.jpg', 'image/jpeg')}
                        className="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-[10px] font-bold text-indigo-500 border border-indigo-500/10"
                      >
                        + Doctor Prescription
                      </button>
                      <button 
                        type="button" 
                        onClick={() => selectQuickFile('pharmacy_bill.png', 'image/png')}
                        className="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-[10px] font-bold text-indigo-500 border border-indigo-500/10"
                      >
                        + Pharmacy Bill
                      </button>
                    </div>
                  </div>

                  {/* Selected files listing */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-1.5 pt-2 max-h-32 overflow-y-auto no-scrollbar">
                      {selectedFiles.map((doc, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl">
                          <span className="truncate max-w-[80%] font-semibold">{doc.file_name}</span>
                          <button 
                            type="button"
                            onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== idx))}
                            className="p-1 hover:bg-rose-500/10 text-rose-500 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSubmitClaimModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-indigo-600 text-white text-xs font-bold shadow-glow-primary hover:opacity-95 transition-all"
                  >
                    Submit Claim
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
