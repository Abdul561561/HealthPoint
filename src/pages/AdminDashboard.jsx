import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserCheck, ShoppingBag, Bot, FileText, Calendar,
  Settings, DollarSign, Search, RefreshCw, Trash2, Edit, Plus,
  X, Check, Eye, AlertTriangle, Activity, Heart, Thermometer,
  Shield, CheckCircle, ArrowRight, ShieldAlert, ShoppingCart
} from 'lucide-react';
import {
  getAdminStats, getAdminUsers, editAdminUser, removeAdminUser,
  getAdminDoctors, addAdminDoctor, editAdminDoctor, removeAdminDoctor,
  getAdminMedicines, addAdminMedicine, editAdminMedicine, removeAdminMedicine,
  getAdminAppointments, editAdminAppointment, removeAdminAppointment,
  getAdminAIChats, getAdminReports, editAdminReportStatus
} from '../redux/slices/adminSlice';
import { formatCurrency } from '../utils/helpers';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import { useTheme } from '../hooks/useTheme';
import { defaultChartOptions } from '../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function AdminDashboard() {
  const dispatch = useDispatch();
  const { isDark } = useTheme();
  const {
    dashboard, users, doctors, medicines, appointments, aiChats, reports, loading, error
  } = useSelector((state) => state.admin);

  // Active Tab State
  const [activeTab, setActiveTab] = useState('overview');

  // Search & Filter States
  const [userSearch, setUserSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [medSearch, setMedSearch] = useState('');
  const [apptSearch, setApptSearch] = useState('');
  const [reportFilter, setReportFilter] = useState('all');

  // Modal States
  const [userModal, setUserModal] = useState({ open: false, data: null });
  const [docModal, setDocModal] = useState({ open: false, mode: 'create', data: null });
  const [medModal, setMedModal] = useState({ open: false, mode: 'create', data: null });
  const [chatModal, setChatModal] = useState({ open: false, messages: [], email: '' });
  const [reportModal, setReportModal] = useState({ open: false, data: null });

  useEffect(() => {
    dispatch(getAdminStats());
    dispatch(getAdminUsers());
    dispatch(getAdminDoctors());
    dispatch(getAdminMedicines());
    dispatch(getAdminAppointments());
    dispatch(getAdminAIChats());
    dispatch(getAdminReports());
  }, [dispatch]);

  const handleRefresh = () => {
    dispatch(getAdminStats());
    dispatch(getAdminUsers());
    dispatch(getAdminDoctors());
    dispatch(getAdminMedicines());
    dispatch(getAdminAppointments());
    dispatch(getAdminAIChats());
    dispatch(getAdminReports());
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Chart Configuration
  // ────────────────────────────────────────────────────────────────────────────
  const chartLabels = dashboard?.revenueChart?.map(pt => pt.month) || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const chartValues = dashboard?.revenueChart?.map(pt => pt.amount) || [24000, 35000, 48000, 52000, 68000, 75000];

  const revenueChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Monthly Revenue',
        data: chartValues,
        borderColor: '#06b6d4', // Cyan
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#06b6d4',
        pointRadius: 4,
      }
    ]
  };

  const revenueChartOptions = {
    ...defaultChartOptions(isDark),
    scales: {
      ...defaultChartOptions(isDark).scales,
      y: {
        ...defaultChartOptions(isDark).scales.y,
        ticks: { ...defaultChartOptions(isDark).scales.y.ticks, callback: (v) => `₹${v.toLocaleString()}` },
      },
    },
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Operations & Handlers
  // ────────────────────────────────────────────────────────────────────────────

  // User Actions
  const handleSaveUser = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name'),
      age: parseInt(fd.get('age')),
      gender: fd.get('gender'),
      bloodGroup: fd.get('bloodGroup'),
      height: fd.get('height'),
      weight: fd.get('weight'),
      phone: fd.get('phone'),
      role: fd.get('role'),
    };
    dispatch(editAdminUser({ userId: userModal.data.id, data })).then(() => {
      setUserModal({ open: false, data: null });
      dispatch(getAdminStats());
    });
  };

  const handleDeleteUser = (id) => {
    if (window.confirm("Are you sure you want to delete this user profile?")) {
      dispatch(removeAdminUser(id)).then(() => dispatch(getAdminStats()));
    }
  };

  // Doctor Actions
  const handleSaveDoctor = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name'),
      specialty: fd.get('specialty'),
      hospital: fd.get('hospital'),
      experience: fd.get('experience'),
      fee: parseFloat(fd.get('fee')),
      education: fd.get('education'),
      available: fd.get('available') === 'true',
    };
    if (docModal.mode === 'create') {
      dispatch(addAdminDoctor(data)).then(() => {
        setDocModal({ open: false, mode: 'create', data: null });
        dispatch(getAdminStats());
      });
    } else {
      dispatch(editAdminDoctor({ doctorId: docModal.data.id, data })).then(() => {
        setDocModal({ open: false, mode: 'create', data: null });
        dispatch(getAdminStats());
      });
    }
  };

  const handleDeleteDoctor = (id) => {
    if (window.confirm("Are you sure you want to delete this doctor?")) {
      dispatch(removeAdminDoctor(id)).then(() => dispatch(getAdminStats()));
    }
  };

  // Medicine Actions
  const handleSaveMedicine = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name'),
      brand: fd.get('brand'),
      genericName: fd.get('genericName'),
      category: fd.get('category'),
      price: parseFloat(fd.get('price')),
      inStock: fd.get('inStock') === 'true',
      rx: fd.get('rx') === 'true',
      dosageForm: fd.get('dosageForm'),
      activeIngredient: fd.get('activeIngredient'),
    };
    if (medModal.mode === 'create') {
      dispatch(addAdminMedicine(data)).then(() => {
        setMedModal({ open: false, mode: 'create', data: null });
        dispatch(getAdminStats());
      });
    } else {
      dispatch(editAdminMedicine({ medId: medModal.data.id, data })).then(() => {
        setMedModal({ open: false, mode: 'create', data: null });
        dispatch(getAdminStats());
      });
    }
  };

  const handleDeleteMedicine = (id) => {
    if (window.confirm("Are you sure you want to remove this medicine?")) {
      dispatch(removeAdminMedicine(id)).then(() => dispatch(getAdminStats()));
    }
  };

  // Appointment Actions
  const handleUpdateApptStatus = (apptId, status) => {
    dispatch(editAdminAppointment({ apptId, data: { status } })).then(() => dispatch(getAdminStats()));
  };

  const handleDeleteAppt = (id) => {
    if (window.confirm("Delete this appointment slot?")) {
      dispatch(removeAdminAppointment(id)).then(() => dispatch(getAdminStats()));
    }
  };

  // Report & Prescriptions verification status
  const handleVerifyReport = (id, status) => {
    dispatch(editAdminReportStatus({ reportId: id, status })).then(() => {
      setReportModal({ open: false, data: null });
    });
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Filter Lists
  // ────────────────────────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredDoctors = doctors.filter(d =>
    d.name?.toLowerCase().includes(docSearch.toLowerCase()) ||
    d.specialty?.toLowerCase().includes(docSearch.toLowerCase())
  );

  const filteredMeds = medicines.filter(m =>
    m.name?.toLowerCase().includes(medSearch.toLowerCase()) ||
    m.brand?.toLowerCase().includes(medSearch.toLowerCase()) ||
    m.genericName?.toLowerCase().includes(medSearch.toLowerCase())
  );

  const filteredAppts = appointments.filter(a =>
    a.user_email?.toLowerCase().includes(apptSearch.toLowerCase()) ||
    a.doctor?.toLowerCase().includes(apptSearch.toLowerCase())
  );

  const filteredReports = reports.filter(r => {
    if (reportFilter === 'all') return true;
    if (reportFilter === 'records') return r.reportType === 'Medical Record';
    if (reportFilter === 'prescriptions') return r.reportType === 'Prescription Upload';
    return r.status === reportFilter;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-10">
      
      {/* Admin Tab Sidebar */}
      <div className="w-full lg:w-64 flex-shrink-0 flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1.5 p-2 rounded-2xl glass-card lg:h-fit sticky top-20 z-10 scrollbar-none">
        <div className="hidden lg:block p-4 border-b border-slate-100 dark:border-white/5 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Management Panel</span>
        </div>
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'users', label: 'Manage Patients', icon: Users },
          { id: 'doctors', label: 'Manage Doctors', icon: UserCheck },
          { id: 'medicines', label: 'Medicine Catalog', icon: ShoppingBag },
          { id: 'appointments', label: 'Appointments Control', icon: Calendar },
          { id: 'aiLogs', label: 'AI Monitoring', icon: Bot },
          { id: 'reports', label: 'Reports Verification', icon: FileText }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all w-full text-left ${
                isActive
                  ? 'bg-primary-600 text-white shadow-glow-primary'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Work Area */}
      <div className="flex-1 space-y-6">
        
        {/* Header toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary-500" />
              Administrative Command Center
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              Manage clinical operations, track revenues, check AI chats, and approve uploads
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-slate-600 dark:text-slate-400"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* ────────────────────────────────────────────────────────────────────
            TAB 1: Overview
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats widgets */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {[
                { title: 'Cumulative Revenue', value: formatCurrency(dashboard?.stats?.totalRevenue || 0), icon: DollarSign, color: 'text-green-500 bg-green-500/10' },
                { title: 'Registered Patients', value: dashboard?.stats?.totalUsers || 0, icon: Users, color: 'text-primary-500 bg-primary-500/10' },
                { title: 'Doctors on Duty', value: dashboard?.stats?.totalDoctors || 0, icon: UserCheck, color: 'text-rose-500 bg-rose-500/10' },
                { title: 'Medicines Inventory', value: dashboard?.stats?.totalMedicines || 0, icon: ShoppingBag, color: 'text-cyan-500 bg-cyan-500/10' },
                { title: 'AI Chat Queries', value: dashboard?.stats?.aiQueries || 0, icon: Bot, color: 'text-violet-500 bg-violet-500/10' }
              ].map(stat => (
                <div key={stat.title} className="glass-card p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide leading-tight">{stat.title}</span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.color}`}>
                      <stat.icon className="w-4.5 h-4.5" />
                    </div>
                  </div>
                  <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Revenue Trend chart & Activities */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="glass-card p-6 xl:col-span-2">
                <h3 className="section-title text-base font-bold mb-4">Revenue Growth Trend</h3>
                <div className="h-64">
                  <Line data={revenueChartData} options={revenueChartOptions} />
                </div>
              </div>

              {/* Recent actions timeline */}
              <div className="glass-card p-6 flex flex-col justify-between">
                <div>
                  <h3 className="section-title text-base font-bold mb-4">Live Activities Feed</h3>
                  <div className="space-y-4">
                    {dashboard?.recentActivities?.map((act, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          act.type === 'appointment' ? 'bg-primary-500/10 text-primary-500' : 'bg-green-500/10 text-green-500'
                        }`}>
                          {act.type === 'appointment' ? <Calendar className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-normal">{act.desc}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">{act.time}</span>
                        </div>
                      </div>
                    ))}
                    {(!dashboard?.recentActivities || dashboard.recentActivities.length === 0) && (
                      <p className="text-sm text-slate-400 italic">No recent activities logged.</p>
                    )}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-primary-500/10 border border-primary-500/20 text-xs font-medium text-slate-700 dark:text-slate-300 mt-4 leading-normal flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary-500 flex-shrink-0" />
                  <span>Admin operations are synchronized across patient databases in real-time.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 2: Manage Patients (Users)
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="section-title text-base font-bold">Registered Patient Profiles</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-slate-400 font-bold border-b border-slate-100 dark:border-white/5">
                    <th className="p-4">Name</th>
                    <th className="p-4">Demographics</th>
                    <th className="p-4">Vitals Summary</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td className="p-4">
                        <p className="font-bold text-slate-900 dark:text-white">{u.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                      </td>
                      <td className="p-4 text-xs">
                        <p><span className="text-slate-400">Age/Gender:</span> {u.age} · {u.gender}</p>
                        <p className="mt-0.5"><span className="text-slate-400">Contact:</span> {u.phone || 'None'}</p>
                      </td>
                      <td className="p-4 text-xs">
                        <p><span className="text-slate-400">Height:</span> {u.height} | <span className="text-slate-400">Weight:</span> {u.weight}</p>
                        <p className="mt-0.5"><span className="text-slate-400">Blood Group:</span> {u.bloodGroup}</p>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          u.role === 'admin'
                            ? 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20'
                            : 'text-slate-500 bg-slate-150 border-slate-200 dark:text-slate-400'
                        }`}>
                          {u.role || 'patient'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setUserModal({ open: true, data: u })}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="p-10 text-center text-slate-400 italic">No patient accounts found matching filters.</div>
              )}
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 3: Manage Doctors
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'doctors' && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="section-title text-base font-bold">Medical Staff Directory</h3>
                <p className="section-subtitle">Manage doctor profiles and availability statuses</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDocModal({ open: true, mode: 'create', data: null })}
                  className="btn-primary flex items-center gap-2 py-2 px-4 text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add Doctor
                </button>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by specialty..."
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    className="w-48 pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-slate-400 font-bold border-b border-slate-100 dark:border-white/5">
                    <th className="p-4">Doctor Details</th>
                    <th className="p-4">Specialty & Institution</th>
                    <th className="p-4">Rating / Reviews</th>
                    <th className="p-4">Fee / Availability</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredDoctors.map(d => (
                    <tr key={d.id}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center font-bold text-xs text-slate-500">
                            {d.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{d.name}</p>
                            <p className="text-xs text-slate-400">{d.education}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{d.specialty}</p>
                        <p className="text-slate-400 mt-0.5">{d.hospital}</p>
                      </td>
                      <td className="p-4 text-xs">
                        <p className="font-semibold">⭐ {d.rating}</p>
                        <p className="text-slate-400 mt-0.5">{d.reviews} reviews</p>
                      </td>
                      <td className="p-4 text-xs">
                        <p className="font-semibold">₹{d.fee}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 inline-block border ${
                          d.available
                            ? 'text-green-500 bg-green-500/10 border-green-500/20'
                            : 'text-red-500 bg-red-500/10 border-red-500/20'
                        }`}>
                          {d.available ? 'Available' : 'Unavailable'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDocModal({ open: true, mode: 'edit', data: d })}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDoctor(d.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 4: Medicine Catalog
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'medicines' && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="section-title text-base font-bold">Pharmacy Catalog Inventory</h3>
                <p className="section-subtitle">Manage medication stock levels, pricing, and prescriptions</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMedModal({ open: true, mode: 'create', data: null })}
                  className="btn-primary flex items-center gap-2 py-2 px-4 text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add Medicine
                </button>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search medicines..."
                    value={medSearch}
                    onChange={(e) => setMedSearch(e.target.value)}
                    className="w-48 pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-slate-400 font-bold border-b border-slate-100 dark:border-white/5">
                    <th className="p-4">Medication Name</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Price</th>
                    <th className="p-4">Stock Status</th>
                    <th className="p-4">Prescription (Rx)</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredMeds.map(m => (
                    <tr key={m.id}>
                      <td className="p-4">
                        <p className="font-bold text-slate-900 dark:text-white">{m.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{m.brand} · Generic: {m.genericName}</p>
                      </td>
                      <td className="p-4 text-slate-650 dark:text-slate-350">{m.category}</td>
                      <td className="p-4 font-bold text-slate-850 dark:text-slate-150">₹{m.price}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          m.inStock
                            ? 'text-green-500 bg-green-500/10 border-green-500/20'
                            : 'text-red-500 bg-red-500/10 border-red-500/20'
                        }`}>
                          {m.inStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          m.rx
                            ? 'text-rose-500 bg-rose-500/10 border-rose-500/20'
                            : 'text-slate-400 bg-slate-50 border-slate-200 dark:text-slate-400'
                        }`}>
                          {m.rx ? 'Rx Required' : 'Over the Counter'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setMedModal({ open: true, mode: 'edit', data: m })}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteMedicine(m.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 5: Appointments Control
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'appointments' && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="section-title text-base font-bold">Scheduled Appointments Master List</h3>
                <p className="section-subtitle">Confirm, cancel, or delete appointments across HealthPoint</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by email or doctor..."
                  value={apptSearch}
                  onChange={(e) => setApptSearch(e.target.value)}
                  className="w-56 pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-slate-400 font-bold border-b border-slate-100 dark:border-white/5">
                    <th className="p-4">Patient Email</th>
                    <th className="p-4">Doctor & Specialty</th>
                    <th className="p-4">Schedule</th>
                    <th className="p-4">Status / Type</th>
                    <th className="p-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredAppts.map(a => (
                    <tr key={a.id}>
                      <td className="p-4 font-semibold text-slate-900 dark:text-white">{a.user_email}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-800 dark:text-slate-200">{a.doctor}</p>
                        <p className="text-xs text-slate-400">{a.specialty} · {a.hospital}</p>
                      </td>
                      <td className="p-4 text-xs text-slate-600 dark:text-slate-400">
                        <p>{a.date}</p>
                        <p className="mt-0.5">{a.time}</p>
                      </td>
                      <td className="p-4 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-bold border inline-block ${
                          a.status === 'confirmed'
                            ? 'text-green-500 bg-green-500/10 border-green-500/20'
                            : a.status === 'pending'
                            ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                            : 'text-red-500 bg-red-500/10 border-red-500/20'
                        }`}>
                          {a.status}
                        </span>
                        <p className="text-slate-400 mt-1">{a.type}</p>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {a.status !== 'confirmed' && (
                            <button
                              onClick={() => handleUpdateApptStatus(a.id, 'confirmed')}
                              className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-600 border border-green-500/20"
                              title="Confirm Appointment"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {a.status !== 'cancelled' && (
                            <button
                              onClick={() => handleUpdateApptStatus(a.id, 'cancelled')}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-650 border border-red-500/20"
                              title="Cancel Slot"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteAppt(a.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 6: AI Monitor
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'aiLogs' && (
          <div className="glass-card p-6 space-y-4">
            <h3 className="section-title text-base font-bold">AI Assistance Inquiries & Usage</h3>
            <p className="section-subtitle">Monitor patient questions and interactions logged by HealthAI</p>

            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-slate-400 font-bold border-b border-slate-100 dark:border-white/5">
                    <th className="p-4">Patient Email</th>
                    <th className="p-4">Interactions Exchanged</th>
                    <th className="p-4">Last Prompt Snip</th>
                    <th className="p-4 text-right">Inspect Conversations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {aiChats.map(session => (
                    <tr key={session.id}>
                      <td className="p-4 font-bold text-slate-900 dark:text-white">{session.user_email}</td>
                      <td className="p-4 text-slate-700 dark:text-slate-300 font-semibold">{session.totalInteractions} messages</td>
                      <td className="p-4 text-xs text-slate-400 truncate max-w-xs">{session.lastMessage}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setChatModal({ open: true, messages: session.messages, email: session.user_email })}
                          className="btn-secondary py-1 px-3 text-xs inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect Logs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {aiChats.length === 0 && (
                <div className="p-10 text-center text-slate-400 italic">No AI conversation histories logged in database.</div>
              )}
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────
            TAB 7: Reports verification
            ──────────────────────────────────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="section-title text-base font-bold">Medical Documents & Scan Verifications</h3>
                <p className="section-subtitle">Approve prescriptions or audit medical scans uploaded by patients</p>
              </div>
              <div className="flex gap-2">
                {['all', 'pending_verification', 'normal', 'follow-up', 'approved', 'rejected'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setReportFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      reportFilter === filter
                        ? 'bg-primary-600 text-white border-primary-650'
                        : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50'
                    }`}
                  >
                    {filter.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReports.map(report => (
                <div key={report.id} className="p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 flex flex-col justify-between space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border block w-fit mb-2 ${
                        report.reportType === 'Prescription Upload'
                          ? 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20'
                          : 'text-violet-500 bg-violet-500/10 border-violet-500/20'
                      }`}>
                        {report.reportType}
                      </span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-snug">{report.title}</h4>
                      <p className="text-xs text-slate-400 mt-1">Patient: {report.user_email}</p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                      report.status === 'approved' || report.status === 'normal'
                        ? 'text-green-500 bg-green-500/10 border-green-500/20'
                        : report.status === 'pending_verification' || report.status === 'pending'
                        ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                        : 'text-red-500 bg-red-500/10 border-red-500/20'
                    }`}>
                      {report.status?.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-150 dark:border-white/5">
                    <span className="text-slate-400">Date: {report.date}</span>
                    <button
                      onClick={() => setReportModal({ open: true, data: report })}
                      className="btn-secondary py-1 px-3 text-xs inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Review Document
                    </button>
                  </div>
                </div>
              ))}
              {filteredReports.length === 0 && (
                <div className="p-10 text-center text-slate-400 italic md:col-span-2">No documents found matching filters.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          MODAL 1: User Edit Profile
          ──────────────────────────────────────────────────────────────────── */}
      {userModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md glass-card p-6 relative"
          >
            <button
              onClick={() => setUserModal({ open: false, data: null })}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Edit Patient Profile</h3>
            
            <form onSubmit={handleSaveUser} className="space-y-4 text-sm">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                <input
                  name="name"
                  defaultValue={userModal.data.name}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Age</label>
                  <input
                    name="age"
                    type="number"
                    defaultValue={userModal.data.age}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gender</label>
                  <select
                    name="gender"
                    defaultValue={userModal.data.gender}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Blood</label>
                  <input
                    name="bloodGroup"
                    defaultValue={userModal.data.bloodGroup}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Height</label>
                  <input
                    name="height"
                    defaultValue={userModal.data.height}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Weight</label>
                  <input
                    name="weight"
                    defaultValue={userModal.data.weight}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone Number</label>
                <input
                  name="phone"
                  defaultValue={userModal.data.phone}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Security Role</label>
                <select
                  name="role"
                  defaultValue={userModal.data.role || 'patient'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white font-bold"
                >
                  <option value="patient">Patient</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full py-2.5 text-sm font-semibold">
                Save Changes
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MODAL 2: Add/Edit Doctor Profile
          ──────────────────────────────────────────────────────────────────── */}
      {docModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md glass-card p-6 relative"
          >
            <button
              onClick={() => setDocModal({ open: false, mode: 'create', data: null })}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {docModal.mode === 'create' ? 'Add New Doctor Profile' : 'Edit Doctor Details'}
            </h3>
            
            <form onSubmit={handleSaveDoctor} className="space-y-4 text-sm">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                <input
                  name="name"
                  defaultValue={docModal.data?.name || 'Dr. '}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Specialty</label>
                  <input
                    name="specialty"
                    defaultValue={docModal.data?.specialty || ''}
                    placeholder="e.g. Cardiologist"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Consultation Fee (INR)</label>
                  <input
                    name="fee"
                    type="number"
                    defaultValue={docModal.data?.fee || ''}
                    placeholder="e.g. 1200"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Hospital / Clinic Affiliation</label>
                <input
                  name="hospital"
                  defaultValue={docModal.data?.hospital || ''}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Experience</label>
                  <input
                    name="experience"
                    defaultValue={docModal.data?.experience || ''}
                    placeholder="e.g. 10 yrs"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Education Degree</label>
                  <input
                    name="education"
                    defaultValue={docModal.data?.education || ''}
                    placeholder="e.g. Stanford Medical"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Availability Status</label>
                <select
                  name="available"
                  defaultValue={docModal.data?.available !== undefined ? String(docModal.data.available) : 'true'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white font-bold"
                >
                  <option value="true">Active & Available</option>
                  <option value="false">Unavailable</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full py-2.5 text-sm font-semibold">
                {docModal.mode === 'create' ? 'Register Doctor' : 'Save Details'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MODAL 3: Add/Edit Medicine Profile
          ──────────────────────────────────────────────────────────────────── */}
      {medModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md glass-card p-6 relative"
          >
            <button
              onClick={() => setMedModal({ open: false, mode: 'create', data: null })}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {medModal.mode === 'create' ? 'Add New Medicine Product' : 'Edit Medicine Details'}
            </h3>
            
            <form onSubmit={handleSaveMedicine} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Brand Name</label>
                  <input
                    name="name"
                    defaultValue={medModal.data?.name || ''}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Generic Name</label>
                  <input
                    name="genericName"
                    defaultValue={medModal.data?.genericName || ''}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Manufacturer Brand</label>
                  <input
                    name="brand"
                    defaultValue={medModal.data?.brand || ''}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <input
                    name="category"
                    defaultValue={medModal.data?.category || ''}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Price (INR)</label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    defaultValue={medModal.data?.price || ''}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Dosage Form</label>
                  <input
                    name="dosageForm"
                    defaultValue={medModal.data?.dosageForm || 'Tablet'}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Active Ingredient</label>
                <input
                  name="activeIngredient"
                  defaultValue={medModal.data?.activeIngredient || ''}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Stock Status</label>
                  <select
                    name="inStock"
                    defaultValue={medModal.data?.inStock !== undefined ? String(medModal.data.inStock) : 'true'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white font-bold"
                  >
                    <option value="true">In Stock</option>
                    <option value="false">Out of Stock</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Requires Prescription?</label>
                  <select
                    name="rx"
                    defaultValue={medModal.data?.rx !== undefined ? String(medModal.data.rx) : 'false'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none dark:bg-white/5 dark:border-white/10 dark:text-white font-bold"
                  >
                    <option value="false">No (OTC)</option>
                    <option value="true">Yes (Rx Required)</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full py-2.5 text-sm font-semibold">
                {medModal.mode === 'create' ? 'Add Product' : 'Save Details'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MODAL 4: AI Chats Interaction Logs Inspector
          ──────────────────────────────────────────────────────────────────── */}
      {chatModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg glass-card p-6 relative flex flex-col max-h-[80vh]"
          >
            <button
              onClick={() => setChatModal({ open: false, messages: [], email: '' })}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">AI Conversational Audit Log</h3>
            <p className="text-xs text-slate-400 mb-4">Inspection account: {chatModal.email}</p>
            
            <div className="flex-1 overflow-y-auto space-y-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-150 dark:border-white/5 max-h-[450px]">
              {chatModal.messages.map((msg, idx) => {
                const isAI = msg.role === 'model' || msg.role === 'assistant';
                return (
                  <div key={idx} className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}>
                    <span className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wide">
                      {isAI ? 'HealthAI' : 'Patient'}
                    </span>
                    <div className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed ${
                      isAI
                        ? 'bg-slate-200 text-slate-900 dark:bg-white/10 dark:text-white rounded-tl-sm'
                        : 'bg-primary-600 text-white rounded-tr-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MODAL 5: Reports Verification Reviewer
          ──────────────────────────────────────────────────────────────────── */}
      {reportModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg glass-card p-6 relative"
          >
            <button
              onClick={() => setReportModal({ open: false, data: null })}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Verify Clinical Document</h3>
            <p className="text-xs text-slate-400 mb-4">{reportModal.data.reportType} · Patient: {reportModal.data.user_email}</p>
            
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 dark:bg-white/5 dark:border-white/10">
                <p><span className="text-slate-400 text-xs">Title:</span> <span className="font-bold text-slate-900 dark:text-white">{reportModal.data.title}</span></p>
                <p className="mt-1.5"><span className="text-slate-400 text-xs">Category:</span> {reportModal.data.category}</p>
                <p className="mt-1.5"><span className="text-slate-400 text-xs">Assigned Doctor/Clinic:</span> {reportModal.data.doctor || 'Self'} / {reportModal.data.hospital}</p>
              </div>

              {/* Prescription Image Preview */}
              {reportModal.data.url && (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 block font-bold">Uploaded Image Attachment:</span>
                  <div className="w-full h-44 rounded-xl border border-slate-150 overflow-hidden bg-slate-100 flex items-center justify-center">
                    <img
                      src={reportModal.data.url}
                      alt="Uploaded Prescription"
                      className="h-full w-auto object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = '<span class="text-xs text-slate-400 font-semibold">Mock Image URL Preview</span>';
                      }}
                    />
                  </div>
                </div>
              )}

              <div>
                <span className="text-xs text-slate-400 block font-bold mb-2">Change Verification Audit Status:</span>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => handleVerifyReport(reportModal.data.id, 'approved')}
                    className="py-2.5 px-3 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-650 font-bold border border-green-500/20 text-xs text-center"
                  >
                    Approve / Normal
                  </button>
                  <button
                    onClick={() => handleVerifyReport(reportModal.data.id, 'follow-up')}
                    className="py-2.5 px-3 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-650 font-bold border border-yellow-500/20 text-xs text-center"
                  >
                    Flag Follow-up
                  </button>
                  <button
                    onClick={() => handleVerifyReport(reportModal.data.id, 'rejected')}
                    className="py-2.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-650 font-bold border border-red-500/20 text-xs text-center"
                  >
                    Reject Scan
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
