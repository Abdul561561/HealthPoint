"""
HealthPoint Google Gemini AI LLM Service
========================================
Provides a resilient, production-grade backend interface to Google's official
`google-genai` SDK using the configured Gemini model (`GEMINI_MODEL`).

Features:
- Separate request configurations for conversation, structured JSON extraction, and multimodal image/PDF analysis.
- Full compatibility with Gemini 3.x/4.x API rules (omits deprecated `temperature`/`top_p`/`top_k` sampling params and uses `ThinkingConfig`).
- Strict `contents` normalization (no leading or trailing prefilled `model` turns; clean role alternation).
- Verified Gemini Flash fallback (`GEMINI_FALLBACK_MODEL`) on transient `503`/`429` overload or `404` model unavailability.
- Sanitized logging (`exception_type`, `error_category`, `http_status`, `model_id`, `stage`) with zero secret or PII leaks.
"""

import os
import random
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
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
DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite"

_ERROR_HISTORY_PREFIXES = (
    "healthpoint ai is temporarily unavailable",
    "healthpoint ai is currently unavailable",
    "healthpoint ai could not authenticate",
    "healthpoint ai could not process",
    "healthpoint ai timed out",
    "healthpoint ai is temporarily rate-limited",
)

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
    """Return the configured primary Gemini model identifier."""
    configured = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip()
    return configured or DEFAULT_GEMINI_MODEL


def get_fallback_model() -> str:
    """Return the configured Gemini Flash fallback model identifier (if enabled)."""
    configured = os.getenv("GEMINI_FALLBACK_MODEL", DEFAULT_GEMINI_FALLBACK_MODEL).strip()
    return configured


def _is_gemini_3_or_newer(model_name: str) -> bool:
    cleaned = (model_name or "").strip().lower()
    return any(prefix in cleaned for prefix in ("gemini-3", "gemini-4"))


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
        stage: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}
        self.error_category = error_category or "provider_error"
        self.stage = stage or "api_call"


def _classify_genai_api_error(exc: genai_errors.APIError) -> Tuple[int, str, bool]:
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

    if code == 403 or status_str == "PERMISSION_DENIED":
        return 403, "permission_denied", False

    if code == 402 or (
        code in (429, 403) and any(tok in msg_lower for tok in ("billing", "insufficient quota", "current quota", "payment"))
    ):
        return 429 if code == 429 else 403, "quota_exhausted", False

    if code == 404 or status_str == "NOT_FOUND":
        return 404, "model_unavailable", False

    if code == 429 or status_str == "RESOURCE_EXHAUSTED":
        if "quota" in msg_lower and "per minute" not in msg_lower and "rate" not in msg_lower:
            return 429, "quota_exhausted", False
        return 429, "rate_limited", True

    if code == 408 or status_str == "DEADLINE_EXCEEDED":
        return 408, "timeout", True

    if code in (400, 422) or status_str == "INVALID_ARGUMENT":
        return 400, "invalid_request_format", False

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
        fallback = get_fallback_model()
        return {
            "service": "Google Gemini Developer API",
            "sdk": "google-genai",
            "api_key_configured": bool(api_key),
            "api_key_masked": mask_key(api_key),
            "model": model,
            "fallback_model": fallback or None,
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
        """
        Convert message history into valid Gemini Developer API `Contents`.
        Guarantees:
        - Synthetic fallback error notices are excluded.
        - Leading `model` turns (like initial UI greetings) are omitted so `contents` starts with `user`.
        - Consecutive turns with the same role are merged so `user`/`model` strictly alternate.
        - Trailing `model` turns are never sent (Gemini 3.x disallows prefilled model turns).
        """
        normalized: List[Tuple[str, str]] = []

        for msg in messages:
            if msg.get("ai_error"):
                continue
            role = (msg.get("role") or "user").strip().lower()
            gemini_role = "model" if role in ("model", "assistant") else "user"
            raw_content = msg.get("content", "")

            text_chunks: List[str] = []
            if isinstance(raw_content, str):
                if raw_content.strip():
                    text_chunks.append(raw_content.strip())
            elif isinstance(raw_content, list):
                for item in raw_content:
                    if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                        text_chunks.append(str(item["text"]).strip())

            combined = "\n".join(c for c in text_chunks if c)
            if not combined:
                continue

            lower_combined = combined.lower()
            if gemini_role == "model" and any(lower_combined.startswith(p) for p in _ERROR_HISTORY_PREFIXES):
                # Also drop the immediately preceding failed user turn if present cleanly
                if normalized and normalized[-1][0] == "user":
                    normalized.pop()
                continue

            # Skip leading model turns (e.g., initial welcome greeting)
            if not normalized and gemini_role == "model":
                continue

            if normalized and normalized[-1][0] == gemini_role:
                prev_role, prev_text = normalized[-1]
                normalized[-1] = (prev_role, f"{prev_text}\n\n{combined}")
            else:
                normalized.append((gemini_role, combined))

        # Gemini 3.x disallows prefilled model turns at the end of contents
        while normalized and normalized[-1][0] == "model":
            normalized.pop()

        contents: List[types.Content] = [
            types.Content(role=r, parts=[types.Part.from_text(text=txt)])
            for r, txt in normalized
        ]

        if not contents:
            contents.append(types.Content(role="user", parts=[types.Part.from_text(text="Hello")]))

        if image_bytes and image_mime:
            media_part = types.Part.from_bytes(data=image_bytes, mime_type=image_mime)
            contents[-1].parts.append(media_part)

        return contents

    def _build_generation_config(
        self,
        model_name: str,
        request_mode: str = "conversation",
        system_instruction: Optional[str] = None,
        response_json: bool = False,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> types.GenerateContentConfig:
        """
        Build separate GenerateContentConfig objects for:
        1. `conversation`: natural text output (never sets `response_mime_type`).
        2. `structured`: strict JSON extraction (`response_mime_type="application/json"`).
        3. `multimodal`: larger output budget for OCR/image/PDF analysis.
        """
        mode = (request_mode or "conversation").strip().lower()
        if response_json and mode == "conversation":
            mode = "structured"

        default_tokens = 4096 if mode == "multimodal" else 2048
        resolved_max_tokens = max_tokens or default_tokens

        config_kwargs: Dict[str, Any] = {
            "max_output_tokens": resolved_max_tokens,
        }
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        # Only enforce JSON mime type in explicit structured mode or JSON-requested multimodal scans
        if mode == "structured" or (mode == "multimodal" and response_json):
            config_kwargs["response_mime_type"] = "application/json"

        # Gemini 3.x / 4.x models deprecate/reject `temperature`, `top_p`, `top_k`
        # and support `ThinkingConfig(thinking_level=LOW)` for fast, low-overhead generation.
        if _is_gemini_3_or_newer(model_name):
            config_kwargs["thinking_config"] = types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW
            )
        else:
            config_kwargs["temperature"] = temperature

        return types.GenerateContentConfig(**config_kwargs)

    async def generate_completion(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: Optional[str] = None,
        response_json: bool = False,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        image_bytes: Optional[bytes] = None,
        image_mime: Optional[str] = None,
        override_model: Optional[str] = None,
        request_mode: Optional[str] = None,
    ) -> str:
        """
        Execute a completion against the Google Gemini Developer API using `google-genai`.
        """
        api_key = get_api_key()
        if not api_key:
            self._last_error = "GEMINI_API_KEY environment variable is not configured on the backend."
            self._last_error_category = "unconfigured_api_key"
            logger.warning(
                "Gemini error | exception_type=MissingKey | http_status=401 | error_category=unconfigured_api_key | model_id=None | stage=config"
            )
            raise LLMServiceException(
                "Google Gemini API key is not configured. Please set GEMINI_API_KEY in the backend environment.",
                status_code=401,
                error_category="unconfigured_api_key",
                stage="config",
            )

        mode = request_mode or (
            "multimodal" if (image_bytes and image_mime) else ("structured" if response_json else "conversation")
        )

        primary_model = (override_model or "").strip() or get_configured_model()
        candidate_models = [primary_model]
        if not override_model:
            fallback_model = get_fallback_model()
            if fallback_model and fallback_model not in candidate_models:
                candidate_models.append(fallback_model)

        try:
            contents = self._build_contents(messages, image_bytes=image_bytes, image_mime=image_mime)
        except Exception as build_exc:
            logger.error(
                "Gemini error | exception_type=%s | http_status=400 | error_category=invalid_request_format | model_id=%s | stage=request_build",
                type(build_exc).__name__,
                primary_model,
            )
            raise LLMServiceException(
                f"Failed to construct valid Gemini request contents: {type(build_exc).__name__}",
                status_code=400,
                error_category="invalid_request_format",
                stage="request_build",
            )

        client = self._build_client(api_key)
        last_exception: Optional[LLMServiceException] = None

        for model_idx, model_name in enumerate(candidate_models):
            is_fallback = model_idx > 0
            try:
                config = self._build_generation_config(
                    model_name=model_name,
                    request_mode=mode,
                    system_instruction=system_instruction,
                    response_json=response_json,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            except Exception as cfg_exc:
                logger.error(
                    "Gemini error | exception_type=%s | http_status=400 | error_category=invalid_request_format | model_id=%s | stage=config_build",
                    type(cfg_exc).__name__,
                    model_name,
                )
                raise LLMServiceException(
                    f"Failed to construct valid Gemini GenerateContentConfig: {type(cfg_exc).__name__}",
                    status_code=400,
                    error_category="invalid_request_format",
                    stage="config_build",
                )

            for attempt in range(self.max_retries):
                attempt_num = attempt + 1
                logger.info(
                    "Gemini request start | model_id=%s | mode=%s | attempt=%d/%d | fallback=%s | stage=api_call",
                    model_name,
                    mode,
                    attempt_num,
                    self.max_retries,
                    is_fallback,
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
                            stage="response_parse",
                        )

                    usage = getattr(response, "usage_metadata", None)
                    total_tokens = getattr(usage, "total_token_count", "N/A") if usage else "N/A"
                    self._last_working_model = model_name
                    self._last_error = None
                    self._last_error_category = None
                    logger.info(
                        "Gemini inference succeeded | model_id=%s | mode=%s | attempt=%d/%d | http_status=200 | fallback_used=%s | tokens=%s",
                        model_name,
                        mode,
                        attempt_num,
                        self.max_retries,
                        is_fallback,
                        total_tokens,
                    )
                    return reply_text

                except genai_errors.APIError as api_err:
                    status_code, category, retryable = _classify_genai_api_error(api_err)
                    safe_detail = (getattr(api_err, "message", "") or type(api_err).__name__)[:200]
                    logger.warning(
                        "Gemini error | exception_type=%s | http_status=%d | error_category=%s | model_id=%s | stage=api_call | attempt=%d/%d | detail=%s",
                        type(api_err).__name__,
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
                        stage="api_call",
                    )
                    self._last_error = str(err_obj)
                    self._last_error_category = category
                    last_exception = err_obj

                    # Immediately fail on auth, permissions, quota exhaustion, or invalid request format
                    if category in ("invalid_api_key", "permission_denied", "quota_exhausted", "invalid_request_format"):
                        raise err_obj

                    if retryable and attempt < self.max_retries - 1:
                        delay = min((1.5 * (2 ** attempt)) + random.uniform(0.1, 0.4), 5.0)
                        await asyncio.sleep(delay)
                        continue
                    # Move to fallback Flash model if available (for 503 overload, 429 rate limit, 404 model unavailable)
                    break

                except (asyncio.TimeoutError, TimeoutError) as te:
                    logger.warning(
                        "Gemini error | exception_type=%s | http_status=408 | error_category=timeout | model_id=%s | stage=api_call | attempt=%d/%d | timeout=%.1fs",
                        type(te).__name__,
                        model_name,
                        attempt_num,
                        self.max_retries,
                        self.timeout,
                    )
                    err_obj = LLMServiceException(
                        f"Gemini request timed out after {self.timeout}s for model {model_name}.",
                        status_code=408,
                        error_category="timeout",
                        stage="api_call",
                    )
                    self._last_error = str(err_obj)
                    self._last_error_category = "timeout"
                    last_exception = err_obj
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(1.0 + random.uniform(0.1, 0.4))
                        continue
                    break

                except LLMServiceException as le:
                    logger.warning(
                        "Gemini error | exception_type=LLMServiceException | http_status=%s | error_category=%s | model_id=%s | stage=%s | attempt=%d/%d",
                        le.status_code,
                        le.error_category,
                        model_name,
                        le.stage,
                        attempt_num,
                        self.max_retries,
                    )
                    self._last_error = str(le)
                    self._last_error_category = le.error_category
                    last_exception = le
                    if le.error_category == "empty_response" and attempt < self.max_retries - 1:
                        await asyncio.sleep(0.5)
                        continue
                    break

                except Exception as ex:
                    logger.warning(
                        "Gemini error | exception_type=%s | http_status=503 | error_category=provider_outage | model_id=%s | stage=api_call | attempt=%d/%d",
                        type(ex).__name__,
                        model_name,
                        attempt_num,
                        self.max_retries,
                    )
                    err_obj = LLMServiceException(
                        f"Unexpected Gemini transport error on {model_name}: {type(ex).__name__}",
                        status_code=503,
                        error_category="provider_outage",
                        stage="api_call",
                    )
                    self._last_error = str(err_obj)
                    self._last_error_category = "provider_outage"
                    last_exception = err_obj
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(1.0)
                        continue
                    break

        if last_exception is not None:
            raise last_exception
        raise LLMServiceException(
            "Gemini request failed across all configured models.",
            status_code=503,
            error_category="provider_outage",
            stage="api_call",
        )


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
    mode = "multimodal" if (image_bytes and mime_type) else ("structured" if response_json else "conversation")
    return await _llm_instance.generate_completion(
        messages=messages,
        system_instruction=system_instruction,
        response_json=response_json,
        image_bytes=image_bytes,
        image_mime=mime_type,
        request_mode=mode,
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
        request_mode="conversation",
    )
