import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Calendar, Clock, ArrowRight, VideoOff, History, UserCheck, Bot, FileText } from 'lucide-react';
import { fetchConsultationAppointments, fetchJitsiRoom, clearCurrentRoom, fetchPatientNotesHistory } from '../redux/slices/consultationSlice';
import JitsiMeeting from '../components/consultation/JitsiMeeting';
import Badge from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';

export default function VideoConsultation() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const { appointments, currentRoom, notes, loading } = useSelector((s) => s.consultation);

  useEffect(() => {
    dispatch(fetchConsultationAppointments());
    if (user?.email) {
      dispatch(fetchPatientNotesHistory(user.email));
    }
  }, [dispatch, user]);

  const handleJoinCall = (apptId) => {
    dispatch(fetchJitsiRoom(apptId));
  };

  const handleCallEnd = () => {
    dispatch(clearCurrentRoom());
    dispatch(fetchConsultationAppointments()); // refresh status
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Video className="w-8 h-8 text-primary-500" />
            Telehealth Consultations
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Access secure encrypted video calls with your doctors and view digital health prescriptions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Demo toggle switch to Doctor Panel */}
          <button
            onClick={() => navigate('/consultations/doctor')}
            className="px-4 py-2.5 rounded-xl border border-primary-500/30 bg-primary-500/10 text-primary-600 dark:text-primary-400 text-xs font-bold hover:bg-primary-500/20 transition-all flex items-center gap-1.5"
            title="Toggle to Doctor Panel simulation"
          >
            <UserCheck className="w-4 h-4" />
            Switch to Doctor View (Demo)
          </button>

          <button
            onClick={() => navigate('/consultations/join')}
            className="btn-primary py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-glow-primary"
          >
            Direct Room Join
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Call View Frame */}
      <AnimatePresence mode="wait">
        {currentRoom ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="glass-card p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <div>
                <span className="text-xs text-primary-500 font-bold uppercase tracking-wider block">Live Consultation</span>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">{currentRoom.subject}</h3>
              </div>
              <button
                onClick={handleCallEnd}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-glow-rose"
              >
                Disconnect Call
              </button>
            </div>
            
            <div className="h-[600px] w-full">
              <JitsiMeeting
                roomName={currentRoom.roomName}
                displayName={currentRoom.displayName}
                subject={currentRoom.subject}
                onCallEnd={handleCallEnd}
              />
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Center Columns: Upcoming Video Calls queue */}
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                  <Calendar className="w-5.5 h-5.5 text-primary-500" />
                  Upcoming Video Appointments
                </h3>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-slate-400 mt-3 font-semibold">Updating call registry...</p>
                  </div>
                ) : appointments.filter(a => a.status === 'confirmed').length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/5 rounded-2xl bg-slate-50/50 dark:bg-white/5">
                    <VideoOff className="w-12 h-12 mx-auto text-slate-350 dark:text-slate-650 mb-3" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white">No Upcoming Video Calls</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto px-4">
                      Book a video consultation under the doctors dashboard to schedule a secure call session.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointments.filter(a => a.status === 'confirmed').map((appt) => (
                      <div
                        key={appt.id}
                        className="p-4 rounded-2xl border border-slate-150 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 hover:border-primary-500/30 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="w-11 h-11 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
                            <Video className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary-500 transition-colors">
                              Consultation with {appt.doctor}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">{appt.specialty} • {appt.hospital}</p>
                            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500 dark:text-slate-450 font-bold">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {appt.date}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {appt.time}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleJoinCall(appt.id)}
                          className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow shadow-glow-primary sm:self-center"
                        >
                          Join Call
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Consultation notes / electronic prescriptions history */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                  <History className="w-5.5 h-5.5 text-primary-500" />
                  Prescriptions & Consultation History
                </h3>

                {notes.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 dark:border-white/5 rounded-2xl bg-slate-50/50">
                    <FileText className="w-10 h-10 mx-auto text-slate-350 mb-2" />
                    <p className="text-xs text-slate-400 font-semibold">No historical consultation notes found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-5 rounded-2xl border border-slate-150 dark:border-white/5 bg-slate-50/30 dark:bg-white/5 space-y-3 hover:border-slate-300 dark:hover:border-white/10 transition-all"
                      >
                        <div className="flex justify-between items-start pb-2.5 border-b border-slate-100 dark:border-white/5">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{note.doctorName}</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{note.date} • {note.time}</p>
                          </div>
                          <Badge variant="info" className="font-bold text-[10px] uppercase tracking-wider">
                            Rx Active
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Symptoms & Diagnosis</span>
                            <p className="text-slate-800 dark:text-slate-300 font-semibold leading-relaxed">
                              Symptoms: {note.symptoms}
                            </p>
                            <p className="text-slate-800 dark:text-slate-300 font-semibold mt-1">
                              Diagnosis: {note.diagnosis}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Prescription & Notes</span>
                            <div className="p-2.5 rounded-xl bg-primary-500/5 border border-primary-500/10 text-primary-600 dark:text-primary-400 font-bold leading-relaxed">
                              {note.prescription}
                            </div>
                            {note.notes && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-450 italic mt-1.5">
                                Note: {note.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Pre-call quick test */}
            <div className="lg:col-span-1 space-y-6">
              <div className="glass-card p-6 space-y-5 h-fit">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Quick Hardware Test</h3>
                <p className="text-xs text-slate-500 dark:text-slate-450 leading-relaxed font-semibold">
                  Test your video stream permissions, configure name values, and check your browser hardware compatibility before your doctor joins.
                </p>

                <div className="p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 flex flex-col gap-3.5 items-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-500 flex items-center justify-center">
                    <Bot className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Pre-Call Device Check</h4>
                    <p className="text-[11px] text-slate-450 mt-1 max-w-[200px]">Check camera and microphone feeds beforehand.</p>
                  </div>
                  <button
                    onClick={() => navigate('/consultations/join')}
                    className="w-full py-2.5 rounded-xl bg-slate-200 hover:bg-slate-350 dark:bg-white/10 dark:hover:bg-white/15 text-xs font-bold text-slate-700 dark:text-white transition-all"
                  >
                    Run Test Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
