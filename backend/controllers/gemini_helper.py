"""
Backward-compatibility adapter module forwarding to Google Gemini in `services.llm_service`.
"""

from services.llm_service import call_gemini, call_gemini_chat

__all__ = ["call_gemini", "call_gemini_chat"]
