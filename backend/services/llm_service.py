"""
HealthPoint Google Gemini AI LLM Service
========================================
Provides a resilient, production-grade backend interface to Google's official
`google-genai` SDK using the configured Gemini model (`GEMINI_MODEL`).

Features:
- Official `google-genai` async completions (`client.aio.models.generate_content`).
- Strict backend-only `GEMINI_API_KEY` handling (never exposed to browser/frontend).
- Multimodal image and PDF support via `types.Part.from_bytes`.
- Structured JSON output mode (`response_mime_type="application/json"`).
- Bounded timeout, exponential backoff retries on transient 429/5xx/timeouts, and fail-fast on invalid API keys or missing models.
- Sanitized logging: API keys, Authorization headers, and private patient data are never logged.
"""

import os
import random
import asyncio
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai import errors as genai_errors

logger = logging.getLogger("healthpoint.llm_service")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [GeminiService] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)
else:
    load_dotenv()

DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"

try:
    AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "30.0"))
except ValueError:
    AI_TIMEOUT = 30.0

try:
    AI_MAX_RETRIES = int(os.getenv("AI_MAX_RETRIES", "2"))
except ValueError:
    AI_MAX_RETRIES = 2


def get_api_key() -> str:
    """Retrieve the sanitized Google Gemini API key from backend environment variables."""
    return os.getenv("GEMINI_API_KEY", "").strip()


def get_configured_model() -> str:
    """Return the configured Gemini model identifier."""
    configured = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip()
    return configured or DEFAULT_GEMINI_MODEL


def mask_key(key: str) -> str:
    """Safely redact API key for logging and diagnostics."""
    if not key:
        return "<not-set>"
    if len(key) <= 8:
        return "***"
    return f"{key[:4]}...{key[-4:]}"


class LLMServiceException(Exception):
    """Custom exception raised when Gemini inference fails."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        error_category: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}
        self.error_category = error_category or "provider_error"


def _classify_genai_api_error(exc: genai_errors.APIError) -> tuple[int, str, bool]:
    """
    Map a `google.genai.errors.APIError` into (http_status, error_category, is_retryable).
    """
    code = getattr(exc, "code", None) or 500
    status_str = (getattr(exc, "status", "") or "").upper()
    msg_lower = (getattr(exc, "message", "") or "").lower()

    if code == 401 or status_str == "UNAUTHENTICATED" or (
        code == 400 and ("api key" in msg_lower or "api_key_invalid" in msg_lower)
    ):
        return 401, "invalid_api_key", False

    if code in (402, 403) or status_str == "PERMISSION_DENIED":
        return 403, "insufficient_credits_or_restricted", False

    if code == 404 or status_str == "NOT_FOUND":
        return 404, "model_unavailable", False

    if code == 429 or status_str == "RESOURCE_EXHAUSTED":
        return 429, "rate_limited", True

    if code == 408 or status_str == "DEADLINE_EXCEEDED":
        return 408, "network_timeout", True

    if code in (400, 422) or status_str == "INVALID_ARGUMENT":
        return 400, "malformed_request", False

    if code >= 500 or status_str in ("INTERNAL", "UNAVAILABLE", "UNKNOWN"):
        return code if code >= 500 else 503, "provider_outage", True

    return int(code), "provider_error", False


class LLMService:
    """Service handling all Google Gemini API interactions via `google-genai`."""

    def __init__(self):
        self.timeout = AI_TIMEOUT
        self.max_retries = max(1, AI_MAX_RETRIES)
        self._last_working_model: Optional[str] = None
        self._last_error: Optional[str] = None
        self._last_error_category: Optional[str] = None

    def _build_client(self, api_key: str) -> genai.Client:
        timeout_ms = int(max(self.timeout, 1.0) * 1000)
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=timeout_ms),
        )

    async def check_health(self) -> Dict[str, Any]:
        """Return safe runtime Gemini configuration and health status."""
        api_key = get_api_key()
        model = get_configured_model()
        return {
            "service": "Google Gemini Developer API",
            "sdk": "google-genai",
            "api_key_configured": bool(api_key),
            "api_key_masked": mask_key(api_key),
            "model": model,
            "last_working_model": self._last_working_model,
            "last_error": self._last_error,
            "last_error_category": self._last_error_category,
            "status": "healthy" if api_key else "missing_api_key",
        }

    def _build_contents(
        self,
        messages: List[Dict[str, Any]],
        image_bytes: Optional[bytes] = None,
        image_mime: Optional[str] = None,
    ) -> List[types.Content]:
        """Convert OpenAI-style/HealthPoint message history into `google-genai` Contents."""
        contents: List[types.Content] = []
        last_user_idx = -1

        for msg in messages:
            role = (msg.get("role") or "user").strip().lower()
            gemini_role = "model" if role in ("model", "assistant") else "user"
            raw_content = msg.get("content", "")
            parts: List[types.Part] = []

            if isinstance(raw_content, str):
                if raw_content.strip():
                    parts.append(types.Part.from_text(text=raw_content))
            elif isinstance(raw_content, list):
                for item in raw_content:
                    if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                        parts.append(types.Part.from_text(text=item["text"]))

            if parts:
                contents.append(types.Content(role=gemini_role, parts=parts))
                if gemini_role == "user":
                    last_user_idx = len(contents) - 1

        if image_bytes and image_mime:
            media_part = types.Part.from_bytes(data=image_bytes, mime_type=image_mime)
            if last_user_idx >= 0 and contents[last_user_idx].parts is not None:
                contents[last_user_idx].parts.append(media_part)
            else:
                contents.append(
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_text(text="Analyze the attached medical document or image."),
                            media_part,
                        ],
                    )
                )

        if not contents:
            contents.append(types.Content(role="user", parts=[types.Part.from_text(text="Hello")]))

        return contents

    async def generate_completion(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: Optional[str] = None,
        response_json: bool = False,
        temperature: float = 0.7,
        max_tokens: Optional[int] = 2048,
        image_bytes: Optional[bytes] = None,
        image_mime: Optional[str] = None,
        override_model: Optional[str] = None,
    ) -> str:
        """
        Execute a completion against the Google Gemini Developer API using `google-genai`,
        with bounded timeout, exponential backoff for transient errors, and sanitized logging.
        """
        api_key = get_api_key()
        if not api_key:
            self._last_error = "GEMINI_API_KEY environment variable is not configured on the backend."
            self._last_error_category = "unconfigured_api_key"
            logger.warning("Gemini error | http_status=401 | error_category=unconfigured_api_key | model_id=None")
            raise LLMServiceException(
                "Google Gemini API key is not configured. Please set GEMINI_API_KEY in the backend environment.",
                status_code=401,
                error_category="unconfigured_api_key",
            )

        model_name = (override_model or "").strip() or get_configured_model()
        contents = self._build_contents(messages, image_bytes=image_bytes, image_mime=image_mime)

        config_kwargs: Dict[str, Any] = {
            "temperature": temperature,
            "http_options": types.HttpOptions(timeout=int(max(self.timeout, 1.0) * 1000)),
        }
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        if max_tokens:
            config_kwargs["max_output_tokens"] = max_tokens
        if response_json:
            config_kwargs["response_mime_type"] = "application/json"

        config = types.GenerateContentConfig(**config_kwargs)
        client = self._build_client(api_key)

        last_exception: Optional[LLMServiceException] = None

        for attempt in range(self.max_retries):
            attempt_num = attempt + 1
            logger.info(
                "Gemini request start | model_id=%s | attempt=%d/%d | multimodal=%s",
                model_name,
                attempt_num,
                self.max_retries,
                bool(image_bytes),
            )
            try:
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=config,
                    ),
                    timeout=self.timeout,
                )

                reply_text = (getattr(response, "text", None) or "").strip()
                if not reply_text:
                    raise LLMServiceException(
                        f"Gemini returned an empty response for model {model_name}.",
                        status_code=502,
                        error_category="empty_response",
                    )

                usage = getattr(response, "usage_metadata", None)
                total_tokens = getattr(usage, "total_token_count", "N/A") if usage else "N/A"
                self._last_working_model = model_name
                self._last_error = None
                self._last_error_category = None
                logger.info(
                    "Gemini inference succeeded | model_id=%s | attempt=%d/%d | http_status=200 | tokens=%s",
                    model_name,
                    attempt_num,
                    self.max_retries,
                    total_tokens,
                )
                return reply_text

            except genai_errors.APIError as api_err:
                status_code, category, retryable = _classify_genai_api_error(api_err)
                safe_detail = (getattr(api_err, "message", "") or type(api_err).__name__)[:200]
                logger.warning(
                    "Gemini error | http_status=%d | error_category=%s | model_id=%s | attempt=%d/%d | detail=%s",
                    status_code,
                    category,
                    model_name,
                    attempt_num,
                    self.max_retries,
                    safe_detail,
                )
                err_obj = LLMServiceException(
                    f"Gemini error ({status_code} {category}) on {model_name}: {safe_detail}",
                    status_code=status_code,
                    error_category=category,
                )
                self._last_error = str(err_obj)
                self._last_error_category = category

                if not retryable or attempt >= self.max_retries - 1:
                    raise err_obj

                delay = min((1.5 * (2 ** attempt)) + random.uniform(0.1, 0.4), 5.0)
                await asyncio.sleep(delay)
                last_exception = err_obj

            except (asyncio.TimeoutError, TimeoutError):
                logger.warning(
                    "Gemini error | http_status=408 | error_category=network_timeout | model_id=%s | attempt=%d/%d | timeout=%.1fs",
                    model_name,
                    attempt_num,
                    self.max_retries,
                    self.timeout,
                )
                err_obj = LLMServiceException(
                    f"Gemini request timed out after {self.timeout}s for model {model_name}.",
                    status_code=408,
                    error_category="network_timeout",
                )
                last_exception = err_obj
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(1.0 + random.uniform(0.1, 0.4))
                    continue
                self._last_error = str(err_obj)
                self._last_error_category = "network_timeout"
                raise err_obj

            except LLMServiceException as le:
                logger.warning(
                    "Gemini error | http_status=%s | error_category=%s | model_id=%s | attempt=%d/%d",
                    le.status_code,
                    le.error_category,
                    model_name,
                    attempt_num,
                    self.max_retries,
                )
                last_exception = le
                if le.error_category == "empty_response" and attempt < self.max_retries - 1:
                    await asyncio.sleep(0.5)
                    continue
                self._last_error = str(le)
                self._last_error_category = le.error_category
                raise le

            except Exception as ex:
                logger.warning(
                    "Gemini error | http_status=503 | error_category=network_error | model_id=%s | attempt=%d/%d | exc=%s",
                    model_name,
                    attempt_num,
                    self.max_retries,
                    type(ex).__name__,
                )
                err_obj = LLMServiceException(
                    f"Unexpected Gemini transport error on {model_name}: {type(ex).__name__}",
                    status_code=503,
                    error_category="network_error",
                )
                last_exception = err_obj
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(1.0)
                    continue
                self._last_error = str(err_obj)
                self._last_error_category = "network_error"
                raise err_obj

        if last_exception is not None:
            self._last_error = str(last_exception)
            self._last_error_category = last_exception.error_category
            raise last_exception
        raise LLMServiceException("Gemini request failed.", status_code=503, error_category="provider_outage")


# Global singleton instance
_llm_instance = LLMService()


def get_llm_service() -> LLMService:
    """Return the global LLMService singleton instance."""
    return _llm_instance


async def call_gemini(
    system_instruction: str,
    prompt: str,
    image_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    response_json: bool = False,
) -> str:
    """Call Google Gemini completion for single-turn prompts or multimodal inputs."""
    messages = [{"role": "user", "content": prompt}]
    return await _llm_instance.generate_completion(
        messages=messages,
        system_instruction=system_instruction,
        response_json=response_json,
        image_bytes=image_bytes,
        image_mime=mime_type,
    )


async def call_gemini_chat(
    system_instruction: str,
    history: List[Dict[str, str]],
    new_message: str,
) -> str:
    """Call Google Gemini multi-turn conversation with bounded message history."""
    formatted = []
    for msg in history[-8:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        formatted.append({"role": role, "content": content})
    formatted.append({"role": "user", "content": new_message})

    return await _llm_instance.generate_completion(
        messages=formatted,
        system_instruction=system_instruction,
    )
