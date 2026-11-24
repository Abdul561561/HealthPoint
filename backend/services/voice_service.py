"""
HealthPoint Voice & Multilingual Architecture Readiness Service
===============================================================
Defines standard modular schemas and readiness contracts for future
Speech-to-Text (STT), Text-to-Speech (TTS), audio permissions, and Indian
multilingual localization (Hindi, Kannada, Tamil, Telugu).

Notice: As per project rules, voice execution is reported in readiness status
unless native audio stream drivers are active.
"""

from typing import Dict, Any, List

SUPPORTED_LANGUAGES = [
    {"code": "en", "name": "English", "status": "active"},
    {"code": "hi", "name": "Hindi (हिंदी)", "status": "ready"},
    {"code": "kn", "name": "Kannada (ಕನ್ನಡ)", "status": "ready"},
    {"code": "ta", "name": "Tamil (தமிழ்)", "status": "ready"},
    {"code": "te", "name": "Telugu (తెలుగు)", "status": "ready"}
]

class VoiceServiceState:
    """Manages audio conversation session state and readiness."""
    
    @staticmethod
    def get_capabilities() -> Dict[str, Any]:
        return {
            "voice_ai_status": "architecture_ready",
            "speech_to_text": {
                "engine": "WebSpeechAPI / Whisper Fallback Interface",
                "sample_rate_hz": 16000,
                "audio_format": "audio/webm;codecs=opus",
                "ready": True
            },
            "text_to_speech": {
                "engine": "Browser SpeechSynthesis / Modular TTS",
                "supported_voices": ["en-US-Standard", "hi-IN-Standard"],
                "ready": True
            },
            "microphone_permissions_checklist": [
                "HTTPS origin enforcement",
                "Browser navigator.mediaDevices.getUserMedia permission prompt",
                "Noise suppression and echo cancellation constraints"
            ],
            "multilingual_readiness": SUPPORTED_LANGUAGES
        }
