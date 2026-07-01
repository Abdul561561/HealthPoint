import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, User, Heart, Activity, FileText, CheckCircle, 
  ArrowLeft, Users, AlertCircle, Sparkles, Send, Stethoscope 
} from 'lucide-react';
import { 
  fetchConsultationAppointments, 
  fetchJitsiRoom, 
  clearCurrentRoom, 
  fetchPatientHealthMetrics, 
  saveDoctorClinicalNote 
} from '../redux/slices/consultationSlice';
import { addToast } from '../redux/slices/uiSlice';
import JitsiMeeting from '../components/consultation/JitsiMeeting';
import Badge from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';

export default function DoctorConsultation() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { appointments, currentRoom, patientBiometrics, loading } = useSelector((s) => s.consultation);

  const [selectedAppt, setSelectedAppt] = useState(null);
  
  // Note Form states
  const [form, setForm] = useState({
    symptoms: '',
    diagnosis: '',
    prescription: '',
    notes: ''
  });

  useEffect(() => {
    dispatch(fetchConsultationAppointments());
  }, [dispatch]);

  // Load patient biometrics when a patient is selected
  useEffect(() => {
    if (selectedAppt?.user_email) {
      dispatch(fetchPatientHealthMetrics(selectedAppt.user_email));
    }
  }, [dispatch, selectedAppt]);

  const handleSelectPatient = (appt) => {
    setSelectedAppt(appt);
    dispatch(fetchJitsiRoom(appt.id));
    setForm({ symptoms: '', diagnosis: '', prescription: '', notes: '' }); // reset form
  };

  const handleDisconnect = () => {
    dispatch(clearCurrentRoom());
    setSelectedAppt(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAppt || !form.symptoms || !form.diagnosis || !form.prescription) {
      dispatch(addToast({
        title: 'Error',
        message: 'Please fill out Symptoms, Diagnosis, and Prescription fields.',
        type: 'error'
      }));
      return;
    }

    const notePayload = {
      appointmentId: selectedAppt.id,
      patientEmail: selectedAppt.user_email,
      patientName: selectedAppt.patientName || 'Patient',
      doctorName: selectedAppt.doctor || user?.name || 'Dr. Mitchell',
      symptoms: form.symptoms,
      diagnosis: form.diagnosis,
      prescription: form.prescription,
      notes: form.notes
    };

    const result = await dispatch(saveDoctorClinicalNote(notePayload));
    if (saveDoctorClinicalNote.fulfilled.match(result)) {
      dispatch(addToast({
        title: 'Report Saved',
        message: 'Clinical summary and digital prescription saved and synced to patient records!',
        type: 'success'
      }));
      handleDisconnect();
    } else {
      dispatch(addToast({
        title: 'Error',
        message: 'Failed to upload clinical prescription report.',
        type: 'error'
      }));
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/consultations')}
            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/5 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Stethoscope className="w-7 h-7 text-primary-500" />
              Doctor Consultation Console
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live patient video consultation screen with integrated biometric records and E-Prescription drafting.
            </p>
          </div>
        </div>

        <Badge variant="info" className="font-extrabold text-xs py-1 px-3">
          Doctor Role: {user?.name || 'Practitioner'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Left Column (2 cols width when call is active, else 1 col) */}
        <div className={`lg:col-span-2 space-y-6 flex flex-col justify-between`}>
          
          {/* Active meeting session */}
          <AnimatePresence mode="wait">
            {currentRoom && selectedAppt ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="glass-card p-4 flex-1 flex flex-col gap-4 min-h-[580px]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0 animate-pulse">
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Connected to {selectedAppt.patientName || 'Patient'}
                      </h4>
                      <p className="text-xs text-slate-450 mt-0.5">Room ID: {currentRoom.roomName}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-glow-rose"
                  >
                    Disconnect
                  </button>
                </div>

                <div className="flex-1 w-full h-[500px]">
                  <JitsiMeeting
                    roomName={currentRoom.roomName}
                    displayName={currentRoom.displayName}
                    subject={currentRoom.subject}
                    onCallEnd={handleDisconnect}
                  />
                </div>
              </motion.div>
            ) : (
              /* If no active call, show Patients Call Queue */
              <div className="glass-card p-6 space-y-4 min-h-[580px]">
                <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                  <Users className="w-5.5 h-5.5 text-primary-500" />
                  Your Consultation Call Queue
                </h3>

                {appointments.filter(a => a.status === 'confirmed').length === 0 ? (
                  <div className="text-center py-24 border border-dashed border-slate-200 dark:border-white/5 rounded-2xl">
                    <Users className="w-12 h-12 text-slate-350 dark:text-slate-650 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Queue is Empty</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      There are no video appointments currently queued for your account.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointments.filter(a => a.status === 'confirmed').map((appt) => (
                      <div
                        key={appt.id}
                        className="p-4 rounded-2xl border border-slate-150 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 hover:border-primary-500/30 transition-all flex justify-between items-center gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              Patient Room: #{appt.id.slice(-6).toUpperCase()}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">{appt.specialty} Consult • Date: {appt.date} • {appt.time}</p>
                            <p className="text-[10px] text-primary-500 font-bold mt-1">Patient email: {appt.user_email}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSelectPatient(appt)}
                          className="btn-primary py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-glow-primary"
                        >
                          Start Call
                          <Video className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Biometrics & Prescription Pad */}
        <div className="lg:col-span-1 space-y-6">
          <AnimatePresence mode="wait">
            {selectedAppt && currentRoom ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Diagnostics Panel */}
                <div className="glass-card p-6 space-y-4">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                    <Activity className="w-5 h-5 text-primary-500" />
                    Patient Biometrics Diagnostics
                  </h3>

                  {patientBiometrics ? (
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center flex-shrink-0">
                          <Heart className="w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Heart Rate</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {patientBiometrics.heartRate?.current || 72} {patientBiometrics.heartRate?.unit || 'bpm'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Blood Pressure</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {patientBiometrics.bloodPressure?.systolic || 120}/{patientBiometrics.bloodPressure?.diastolic || 80} {patientBiometrics.bloodPressure?.unit || 'mmHg'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Oxygen Sat</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {patientBiometrics.oxygen?.level || 98}%
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">BMI Value</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {patientBiometrics.bmi?.value || 22.8} ({patientBiometrics.bmi?.category || 'Normal'})
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-12 bg-slate-100 animate-pulse rounded-2xl" />
                  )}
                </div>

                {/* E-Prescription & Notes Pad */}
                <div className="glass-card p-6 space-y-4">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                    <FileText className="w-5 h-5 text-primary-500" />
                    Clinical Prescription Pad
                  </h3>

                  <form onSubmit={handleFormSubmit} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Symptoms Reported</label>
                      <input
                        type="text"
                        required
                        value={form.symptoms}
                        onChange={e => setForm({ ...form, symptoms: e.target.value })}
                        placeholder="e.g. Mild fever, dry cough"
                        className="input-field py-2 text-xs rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinical Diagnosis</label>
                      <input
                        type="text"
                        required
                        value={form.diagnosis}
                        onChange={e => setForm({ ...form, diagnosis: e.target.value })}
                        placeholder="e.g. Viral upper respiratory tract infection"
                        className="input-field py-2 text-xs rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prescribed Medications (Rx)</label>
                      <textarea
                        required
                        rows={3}
                        value={form.prescription}
                        onChange={e => setForm({ ...form, prescription: e.target.value })}
                        placeholder="e.g. Paracetamol 500mg (1-0-1) 5 days, Vitamin C 1000mg (0-1-0) 10 days"
                        className="input-field py-2 text-xs rounded-xl resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consultation Notes / Instructions</label>
                      <textarea
                        rows={2}
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        placeholder="e.g. Rest for 2 days, stay hydrated. Follow up if fever persists."
                        className="input-field py-2 text-xs rounded-xl resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-glow-primary"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Save Consultation & Submit Rx
                    </button>
                  </form>
                </div>
              </motion.div>
            ) : (
              /* Sidebar instructions when no call is active */
              <div className="glass-card p-6 flex flex-col items-center justify-center text-center py-20 border border-slate-200 dark:border-white/5 h-full min-h-[580px]">
                <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Waiting for patient connection</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                  Select a patient from your active queue and click "Start Call" to open biometrics and write prescriptions.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
