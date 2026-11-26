import asyncio
import pytest
from unittest.mock import patch, MagicMock
from google.genai import errors as genai_errors
from services.llm_service import LLMService, LLMServiceException, mask_key
from controllers.ai_controller import chat_ai_controller, _format_unavailable_message

pytestmark = pytest.mark.asyncio


def _make_mock_client(async_generate_fn):
    client = MagicMock()
    client.aio.models.generate_content = async_generate_fn
    return client


# 21. Gemini unavailable (graceful fallback)
async def test_21_gemini_unavailable_fallback():
    res = await chat_ai_controller("test_user@healthpoint.app", "Tell me a joke")
    assert "reply" in res
    assert len(res["reply"]) > 5


# 22. Rate limit reached (429 retries bounded times and raises rate_limited)
async def test_22_rate_limit_handling():
    llm = LLMService()
    llm.max_retries = 2

    async def mock_generate(*args, **kwargs):
        raise genai_errors.APIError(
            429,
            {"error": {"code": 429, "message": "Resource exhausted", "status": "RESOURCE_EXHAUSTED"}},
        )

    with patch.object(LLMService, "_build_client", return_value=_make_mock_client(mock_generate)):
        with patch("services.llm_service.get_api_key", return_value="AIzaTestMockKey12345"):
            with patch("asyncio.sleep", return_value=None):
                with pytest.raises(LLMServiceException) as exc:
                    await llm.generate_completion(messages=[{"role": "user", "content": "test"}])
                assert exc.value.status_code == 429
                assert exc.value.error_category == "rate_limited"


# 23. Model unavailable (404 fails fast with model_unavailable)
async def test_23_model_unavailable_fails_fast():
    llm = LLMService()
    llm.max_retries = 2
    call_count = 0

    async def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise genai_errors.APIError(
            404,
            {"error": {"code": 404, "message": "models/nonexistent is not found", "status": "NOT_FOUND"}},
        )

    with patch.object(LLMService, "_build_client", return_value=_make_mock_client(mock_generate)):
        with patch("services.llm_service.get_api_key", return_value="AIzaTestMockKey12345"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(
                    messages=[{"role": "user", "content": "hi"}],
                    override_model="nonexistent-gemini-model",
                )
            assert exc.value.status_code == 404
            assert exc.value.error_category == "model_unavailable"
            assert call_count == 1


# 24. Invalid API key fails fast without retrying in loops
async def test_24_invalid_api_key_fails_fast():
    llm = LLMService()
    llm.max_retries = 3
    call_count = 0

    async def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise genai_errors.APIError(
            400,
            {"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}},
        )

    with patch.object(LLMService, "_build_client", return_value=_make_mock_client(mock_generate)):
        with patch("services.llm_service.get_api_key", return_value="invalid_key"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])
            assert exc.value.status_code == 401
            assert exc.value.error_category == "invalid_api_key"
            assert call_count == 1


# 25. Slow response (bounded timeout)
async def test_25_slow_response_timeout():
    llm = LLMService()
    llm.timeout = 0.2
    llm.max_retries = 1

    async def mock_slow_generate(*args, **kwargs):
        await asyncio.sleep(1.0)
        resp = MagicMock()
        resp.text = "late"
        return resp

    with patch.object(LLMService, "_build_client", return_value=_make_mock_client(mock_slow_generate)):
        with patch("services.llm_service.get_api_key", return_value="AIzaTestMockKey12345"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])
            assert exc.value.status_code == 408
            assert exc.value.error_category == "network_timeout"


# 26. Malformed / None model output
async def test_26_malformed_model_output():
    llm = LLMService()
    llm.max_retries = 1

    async def mock_generate(*args, **kwargs):
        resp = MagicMock()
        resp.text = None
        return resp

    with patch.object(LLMService, "_build_client", return_value=_make_mock_client(mock_generate)):
        with patch("services.llm_service.get_api_key", return_value="AIzaTestMockKey12345"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])
            assert exc.value.error_category == "empty_response"


# 27. Empty response content
async def test_27_empty_response_content():
    llm = LLMService()
    llm.max_retries = 1

    async def mock_generate(*args, **kwargs):
        resp = MagicMock()
        resp.text = "   "
        return resp

    with patch.object(LLMService, "_build_client", return_value=_make_mock_client(mock_generate)):
        with patch("services.llm_service.get_api_key", return_value="AIzaTestMockKey12345"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])
            assert exc.value.error_category == "empty_response"


# 28. Key masking security
async def test_28_mask_key_security():
    assert mask_key("") == "<not-set>"
    assert mask_key("short") == "***"
    assert mask_key("AIzaSyDummyKey1234567890ABCD") == "AIza...ABCD"


# 29. Error categorization returns safe user-facing messages
async def test_29_provider_error_categorization_and_user_messages():
    cases = [
        (401, "unconfigured_api_key", "gemini_api_key"),
        (401, "invalid_api_key", "invalid api key"),
        (403, "insufficient_credits_or_restricted", "quota limits"),
        (429, "rate_limited", "rate-limited"),
        (404, "model_unavailable", "gemini_model"),
        (400, "malformed_request", "request format"),
        (408, "network_timeout", "timed out"),
        (503, "provider_outage", "temporarily unavailable"),
    ]
    for code, cat, expected_substr in cases:
        exc = LLMServiceException("raw err", status_code=code, error_category=cat)
        msg = _format_unavailable_message(exc, "Health information")
        assert expected_substr in msg.lower()
        assert "aiza" not in msg.lower()
        assert "sk-or-" not in msg.lower()
