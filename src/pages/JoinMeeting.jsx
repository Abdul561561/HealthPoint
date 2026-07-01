import React, { useState, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Video, VideoOff, Mic, MicOff, Camera, ArrowRight, ShieldCheck, Settings } from 'lucide-react';
import { setDirectRoomName } from '../redux/slices/consultationSlice';
import { useAuth } from '../hooks/useAuth';
import Badge from '../components/ui/Badge';

export default function JoinMeeting() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  const videoRef = useRef(null);

  // Initialize camera stream for pre-call check
  useEffect(() => {
    async function startCamera() {
      try {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        
        if (videoEnabled) {
          const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false // keep false in preview to prevent feedback loops
          });
          setStream(mediaStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
          setPermissionError(null);
        } else {
          setStream(null);
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
        }
      } catch (err) {
        console.error('Camera capture error:', err);
        setPermissionError('Camera access denied. Please verify browser permissions.');
        setVideoEnabled(false);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoEnabled]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    // Clean room code to prevent Jitsi formatting bugs
    const cleanedRoom = roomName.trim().replace(/[^a-zA-Z0-9-_]/g, '');

    dispatch(setDirectRoomName({
      roomName: `HealthPoint-${cleanedRoom}`,
      displayName: displayName || user?.name || 'Guest User',
      isDoctor: false
    }));

    // Redirect to patient consultations dashboard where it will automatically trigger the iframe Jitsi room
    navigate('/consultations');
  };

  const toggleVideo = () => {
    setVideoEnabled(!videoEnabled);
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-2">
          <Camera className="w-8 h-8 text-primary-500" />
          Pre-Call Setup & Joining
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-sm">
          Verify your hardware settings, enter your room code, and configure camera feeds prior to joining the medical call.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left: Device preview card */}
        <div className="glass-card p-6 flex flex-col justify-between gap-5 relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-900 dark:text-white">Hardware Preview</span>
              <Badge variant={permissionError ? 'danger' : 'success'} className="font-semibold text-[10px]">
                {permissionError ? 'Permission Alert' : 'Feed Active'}
              </Badge>
            </div>
            
            {/* Video preview bubble */}
            <div className="aspect-[4/3] rounded-2xl bg-slate-950 border border-slate-200 dark:border-white/5 overflow-hidden relative flex items-center justify-center shadow-inner">
              {videoEnabled && !permissionError ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="text-center p-4">
                  <VideoOff className="w-12 h-12 text-slate-650 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-400">
                    {permissionError || 'Camera is turned off'}
                  </p>
                </div>
              )}

              {/* Status indicators */}
              <div className="absolute bottom-3 left-3 flex gap-2">
                <span className={`p-1.5 rounded-lg text-white text-xs ${videoEnabled ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                  {videoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                </span>
                <span className={`p-1.5 rounded-lg text-white text-xs ${audioEnabled ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                  {audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </span>
              </div>
            </div>
          </div>

          {/* Toggle buttons */}
          <div className="flex justify-center gap-4 pt-2 border-t border-slate-100 dark:border-white/5">
            <button
              onClick={toggleVideo}
              className={`p-3.5 rounded-2xl flex items-center gap-2 font-bold text-sm shadow transition-all ${
                videoEnabled
                  ? 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-white'
                  : 'bg-rose-500 text-white shadow-glow-rose'
              }`}
            >
              {videoEnabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              {videoEnabled ? 'Mute Video' : 'Unmute Video'}
            </button>

            <button
              onClick={toggleAudio}
              className={`p-3.5 rounded-2xl flex items-center gap-2 font-bold text-sm shadow transition-all ${
                audioEnabled
                  ? 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-white'
                  : 'bg-rose-500 text-white shadow-glow-rose'
              }`}
            >
              {audioEnabled ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
            </button>
          </div>
        </div>

        {/* Right: Join Form */}
        <div className="glass-card p-6 flex flex-col justify-between gap-6 border border-slate-200/50 dark:border-white/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary-500">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Secure Connection Options</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              HealthPoint consult endpoints are end-to-end encrypted using Jitsi security parameters. Enter your designated room code below to synchronize.
            </p>

            <form onSubmit={handleJoin} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consultation Room Code</label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="e.g. Mitchell-Cardio-Checkup"
                  className="input-field py-3 rounded-2xl text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Johnson"
                  className="input-field py-3 rounded-2xl text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={!roomName.trim()}
                className="btn-primary w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-glow-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Join Consultation Room
                <ArrowRight className="w-4.5 h-4.5" />
              </button>
            </form>
          </div>

          <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-[11px] text-slate-400 font-semibold leading-relaxed">
            <Settings className="w-5 h-5 text-slate-400 flex-shrink-0" />
            Ensure your microphone and camera permissions are granted in your browser settings prior to hitting join.
          </div>
        </div>
      </div>
    </div>
  );
}
