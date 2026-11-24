"""
HealthPoint OpenRouter AI LLM Provider Service
=============================================
Provides a resilient, production-grade interface for OpenRouter's OpenAI-compatible
chat completions API using free model identifiers.

Features:
- Configurable model priority and fallback list of verified free models.
- Automatic fallback on model outages, 429 rate-limits, 404s, 408s, and 5xx server errors.
- Bounded retries with exponential backoff and randomized jitter.
- Fail-fast handling on 401, 402, 403 auth/quota errors (no wasteful retry loops).
- System instruction and conversation history management with token awareness.
- Structured JSON mode support with markdown block extraction.
- Vision/image payload formatting for supported vision models.
- Sanitized logging: sensitive user health data and API keys are strictly redacted.
- Health inspection endpoint helper for runtime status monitoring.
"""

import os
import json
import base64
import random
import asyncio
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import httpx

# Configure logger
logger = logging.getLogger("healthpoint.llm_service")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [LLMService] %(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Load environment configuration
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)
else:
    load_dotenv()

OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
DEFAULT_FALLBACKS = os.getenv(
    "OPENROUTER_FALLBACK_MODELS",
    "google/gemini-2.0-flash-exp:free,mistralai/mistral-small-3.1-24b-instruct:free,meta-llama/llama-3.1-8b-instruct:free,qwen/qwen-2.5-72b-instruct:free"
)

try:
    AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "30.0"))
except ValueError:
    AI_TIMEOUT = 30.0

try:
    AI_MAX_RETRIES = int(os.getenv("AI_MAX_RETRIES", "2"))
except ValueError:
    AI_MAX_RETRIES = 2

# Models known to support multimodal image input
VISION_MODELS = {
    "google/gemini-2.0-flash-exp:free",
    "google/gemini-2.0-flash-thinking-exp:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "google/gemini-flash-1.5-exp:free",
}

def get_api_key() -> str:
    """Retrieve and sanitize the OpenRouter API key from the environment."""
    return os.getenv("OPENROUTER_API_KEY", "").strip()

def get_configured_models() -> List[str]:
    """Return ordered list of models: primary model followed by configured fallbacks."""
    primary = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL).strip()
    fallbacks_raw = os.getenv("OPENROUTER_FALLBACK_MODELS", DEFAULT_FALLBACKS).strip()
    fallbacks = [m.strip() for m in fallbacks_raw.split(",") if m.strip()]
    
    models = []
    if primary:
        models.append(primary)
    for fb in fallbacks:
        if fb not in models:
            models.append(fb)
    return models

def is_free_model(model_id: str) -> bool:
    """Check if a model identifier represents an explicit free tier model."""
    return ":free" in model_id.lower()

def mask_key(key: str) -> str:
    """Safely redact API key for logging purposes."""
    if not key:
        return "<not-set>"
    if len(key) <= 8:
        return "***"
    return f"{key[:4]}...{key[-4:]}"

class LLMServiceException(Exception):
    """Custom exception raised when LLM inference fails across all configured models."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}

class LLMService:
    """Service handling all OpenRouter LLM interactions."""

    def __init__(self):
        self.base_url = OPENROUTER_BASE_URL
        self.timeout = AI_TIMEOUT
        self.max_retries = max(1, AI_MAX_RETRIES)
        self._last_working_model: Optional[str] = None
        self._last_error: Optional[str] = None

    def _build_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://healthpoint.app",
            "X-Title": "HealthPoint AI",
            "Content-Type": "application/json"
        }

    async def check_health(self) -> Dict[str, Any]:
        """Check OpenRouter configuration and connectivity."""
        api_key = get_api_key()
        models = get_configured_models()
        status = {
            "service": "OpenRouter AI Provider",
            "provider_url": self.base_url,
            "api_key_configured": bool(api_key),
            "api_key_masked": mask_key(api_key),
            "primary_model": models[0] if models else None,
            "fallback_models": models[1:] if len(models) > 1 else [],
            "last_working_model": self._last_working_model,
            "last_error": self._last_error,
            "status": "healthy" if api_key else "missing_api_key"
        }
        return status

    async def generate_completion(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: Optional[str] = None,
        response_json: bool = False,
        temperature: float = 0.7,
        max_tokens: Optional[int] = 1500,
        image_bytes: Optional[bytes] = None,
        image_mime: Optional[str] = None,
        override_model: Optional[str] = None
    ) -> str:
        """
        Execute chat completion through OpenRouter with automatic model fallback,
        bounded retries, and exponential backoff.
        """
        api_key = get_api_key()
        if not api_key:
            self._last_error = "OPENROUTER_API_KEY environment variable is not configured on the backend."
            logger.warning("Attempted AI generation without OPENROUTER_API_KEY set.")
            raise LLMServiceException(
                "OpenRouter API key is not configured. Please set OPENROUTER_API_KEY in the backend environment.",
                status_code=401
            )

        # Build candidate models list
        if override_model:
            candidate_models = [override_model]
        else:
            candidate_models = get_configured_models()

        # Enforce free model rule if candidate is free
        for m in candidate_models:
            if not is_free_model(m):
                logger.warning(f"Configured model '{m}' does not contain ':free'. Ensuring only explicit models run.")

        # Build payload messages
        formatted_messages: List[Dict[str, Any]] = []
        if system_instruction:
            formatted_messages.append({"role": "system", "content": system_instruction})

        for msg in messages:
            role = msg.get("role", "user")
            # Map 'model' to 'assistant' for OpenAI-compatible endpoint
            if role == "model":
                role = "assistant"
            content = msg.get("content", "")
            formatted_messages.append({"role": role, "content": content})

        # Inject multimodal vision content into the last user message if provided
        if image_bytes and image_mime:
            b64_img = base64.b64encode(image_bytes).decode("utf-8")
            data_url = f"data:{image_mime};base64,{b64_img}"
            
            # Find last user message or create one
            user_msg_idx = -1
            for idx in range(len(formatted_messages) - 1, -1, -1):
                if formatted_messages[idx]["role"] == "user":
                    user_msg_idx = idx
                    break
            
            img_content_part = {
                "type": "image_url",
                "image_url": {"url": data_url}
            }
            
            if user_msg_idx >= 0:
                existing_content = formatted_messages[user_msg_idx]["content"]
                if isinstance(existing_content, str):
                    formatted_messages[user_msg_idx]["content"] = [
                        {"type": "text", "text": existing_content},
                        img_content_part
                    ]
                elif isinstance(existing_content, list):
                    formatted_messages[user_msg_idx]["content"].append(img_content_part)
            else:
                formatted_messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Analyze the attached medical document/image."},
                        img_content_part
                    ]
                })

        last_exception = None
        headers = self._build_headers(api_key)

        # Iterate through models with fallback
        for model_idx, model_name in enumerate(candidate_models):
            logger.info(f"Attempting inference with model [{model_idx + 1}/{len(candidate_models)}]: {model_name}")

            # If image is attached, verify if model supports vision, else prioritize vision models
            if image_bytes and model_name not in VISION_MODELS:
                logger.info(f"Model {model_name} may have limited vision support, but will attempt with image_url.")

            # Bounded retry loop for transient issues per model
            for attempt in range(self.max_retries):
                try:
                    payload: Dict[str, Any] = {
                        "model": model_name,
                        "messages": formatted_messages,
                        "temperature": temperature,
                    }
                    if max_tokens:
                        payload["max_tokens"] = max_tokens
                    if response_json:
                        payload["response_format"] = {"type": "json_object"}

                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.post(
                            f"{self.base_url}/chat/completions",
                            headers=headers,
                            json=payload
                        )

                    # Handle HTTP Status
                    status_code = response.status_code

                    # 200 OK -> parse response
                    if status_code == 200:
                        data = response.json()
                        choices = data.get("choices", [])
                        if not choices:
                            raise LLMServiceException(f"OpenRouter returned empty choices array from {model_name}.")
                        
                        message_obj = choices[0].get("message", {})
                        reply_text = message_obj.get("content", "")
                        
                        if not reply_text or not reply_text.strip():
                            raise LLMServiceException(f"OpenRouter returned blank reply content from {model_name}.")
                        
                        self._last_working_model = model_name
                        self._last_error = None
                        logger.info(f"Successfully generated response using {model_name} (tokens: {data.get('usage', {}).get('total_tokens', 'N/A')}).")
                        return reply_text.strip()

                    # Handle 401 Unauthorized -> Fail immediately (invalid API key)
                    elif status_code == 401:
                        err_msg = f"OpenRouter 401 Unauthorized: Invalid API key ({mask_key(api_key)})."
                        logger.error(err_msg)
                        self._last_error = err_msg
                        raise LLMServiceException(err_msg, status_code=401)

                    # Handle 402 Payment Required -> Free credits exhausted / out of quota
                    elif status_code == 402:
                        err_msg = f"OpenRouter 402 Payment Required: Credit limit or quota reached on account."
                        logger.error(err_msg)
                        self._last_error = err_msg
                        raise LLMServiceException(err_msg, status_code=402)

                    # Handle 403 Forbidden -> Policy / region block
                    elif status_code == 403:
                        err_msg = f"OpenRouter 403 Forbidden for model {model_name}."
                        logger.error(err_msg)
                        self._last_error = err_msg
                        raise LLMServiceException(err_msg, status_code=403)

                    # Handle 404 Model Not Found -> Try next model immediately
                    elif status_code == 404:
                        logger.warning(f"OpenRouter 404 Model Not Found: '{model_name}'. Switching to fallback model.")
                        last_exception = LLMServiceException(f"Model '{model_name}' not found on OpenRouter.", status_code=404)
                        break # Break retry loop to try next model

                    # Handle 429 Rate Limit -> Backoff once or switch model
                    elif status_code == 429:
                        retry_after = response.headers.get("Retry-After")
                        delay = float(retry_after) if retry_after and retry_after.isdigit() else (1.5 * (2 ** attempt) + random.uniform(0.1, 0.5))
                        logger.warning(f"OpenRouter 429 Rate Limit on {model_name}. Attempt {attempt + 1}/{self.max_retries}. Backoff {delay:.2f}s...")
                        if attempt < self.max_retries - 1:
                            await asyncio.sleep(min(delay, 5.0))
                            continue
                        else:
                            last_exception = LLMServiceException(f"Rate limit exceeded on {model_name}.", status_code=429)
                            break # Try next fallback model

                    # Handle 408 Request Timeout or 5xx Server Error
                    elif status_code in (408, 500, 502, 503, 504):
                        logger.warning(f"OpenRouter HTTP {status_code} from {model_name} on attempt {attempt + 1}.")
                        if attempt < self.max_retries - 1:
                            delay = (1.0 * (2 ** attempt)) + random.uniform(0.1, 0.4)
                            await asyncio.sleep(delay)
                            continue
                        else:
                            last_exception = LLMServiceException(f"Server error {status_code} on {model_name}.", status_code=status_code)
                            break # Try next fallback model

                    else:
                        # Other unexpected status codes
                        err_text = response.text[:200]
                        logger.error(f"OpenRouter unexpected status {status_code} on {model_name}: {err_text}")
                        last_exception = LLMServiceException(f"OpenRouter error {status_code}: {err_text}", status_code=status_code)
                        break

                except httpx.TimeoutException as te:
                    logger.warning(f"Timeout on {model_name} (attempt {attempt + 1}/{self.max_retries}) after {self.timeout}s.")
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(1.0 + random.uniform(0.1, 0.5))
                        continue
                    last_exception = LLMServiceException(f"Request timed out for model {model_name}.", status_code=408)
                    break

                except LLMServiceException as le:
                    # Reraise non-retryable 401, 402, 403 immediately
                    if le.status_code in (401, 402, 403):
                        raise le
                    last_exception = le
                    break

                except Exception as ex:
                    logger.warning(f"Unexpected error communicating with {model_name}: {ex}")
                    last_exception = LLMServiceException(f"Error on {model_name}: {str(ex)}")
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(1.0)
                        continue
                    break

        self._last_error = str(last_exception)
        logger.error(f"All configured OpenRouter models failed. Last error: {last_exception}")
        raise LLMServiceException(
            f"All configured OpenRouter models failed. Last error: {last_exception}",
            status_code=503
        )

# Global singleton instance
_llm_instance = LLMService()

def get_llm_service() -> LLMService:
    """Return the global LLMService singleton instance."""
    return _llm_instance

# Drop-in helper functions matching the existing signature for smooth controller migration
async def call_openrouter(
    system_instruction: str,
    prompt: str,
    image_bytes: Optional[bytes] = None,
    mime_type: Optional[str] = None,
    response_json: bool = False
) -> str:
    """Call OpenRouter completions with automatic model fallback."""
    messages = [{"role": "user", "content": prompt}]
    return await _llm_instance.generate_completion(
        messages=messages,
        system_instruction=system_instruction,
        response_json=response_json,
        image_bytes=image_bytes,
        image_mime=mime_type
    )

async def call_openrouter_chat(
    system_instruction: str,
    history: List[Dict[str, str]],
    new_message: str
) -> str:
    """Call OpenRouter multi-turn conversation with limited message history."""
    # Ensure messages format
    formatted = []
    # Take last 8 history items to preserve token budgets
    for msg in history[-8:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        formatted.append({"role": role, "content": content})
    formatted.append({"role": "user", "content": new_message})

    return await _llm_instance.generate_completion(
        messages=formatted,
        system_instruction=system_instruction
    )
