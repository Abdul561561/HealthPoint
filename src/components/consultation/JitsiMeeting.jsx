import React, { useEffect, useRef, useState } from 'react';

export default function JitsiMeeting({ roomName, displayName, subject, onCallEnd }) {
  const containerRef = useRef(null);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);
  const jitsiApiRef = useRef(null);

  useEffect(() => {
    const scriptId = 'jitsi-external-api-script';
    let script = document.getElementById(scriptId);

    const handleScriptLoad = () => {
      setJitsiLoaded(true);
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = handleScriptLoad;
      document.body.appendChild(script);
    } else {
      if (window.JitsiMeetExternalAPI) {
        setJitsiLoaded(true);
      } else {
        script.addEventListener('load', handleScriptLoad);
      }
    }

    return () => {
      if (script) {
        script.removeEventListener('load', handleScriptLoad);
      }
    };
  }, []);

  useEffect(() => {
    if (!jitsiLoaded || !containerRef.current) return;

    const domain = 'meet.jit.si';
    const options = {
      roomName: roomName,
      parentNode: containerRef.current,
      width: '100%',
      height: '100%',
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false, 
        disableDeepLinking: true, 
        enableWelcomePage: false,
        toolbarButtons: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
          'settings', 'raisehand', 'videoquality', 'filmstrip', 'tileview',
          'security'
        ]
      },
      interfaceConfigOverwrite: {
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_BACKGROUND: '#0f172a'
      },
      userInfo: {
        displayName: displayName,
      },
    };

    try {
      const jitsiApi = new window.JitsiMeetExternalAPI(domain, options);
      jitsiApiRef.current = jitsiApi;

      if (subject) {
        jitsiApi.executeCommand('subject', subject);
      }

      jitsiApi.addEventListener('readyToClose', () => {
        if (onCallEnd) onCallEnd();
      });

      jitsiApi.addEventListener('videoConferenceLeft', () => {
        if (onCallEnd) onCallEnd();
      });
    } catch (e) {
      console.error('Error creating Jitsi Meet instance:', e);
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [jitsiLoaded, roomName, displayName, subject, onCallEnd]);

  return (
    <div className="w-full h-full min-h-[500px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/50 dark:border-white/5 relative flex items-center justify-center shadow-lg">
      {!jitsiLoaded && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-400">Opening secure video connection...</p>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" style={{ display: jitsiLoaded ? 'block' : 'none' }} />
    </div>
  );
}
