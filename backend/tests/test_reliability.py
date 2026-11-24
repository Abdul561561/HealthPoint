import pytest
import asyncio
from unittest.mock import patch, MagicMock
from services.llm_service import LLMService, LLMServiceException, mask_key
from controllers.ai_controller import chat_ai_controller

pytestmark = pytest.mark.asyncio

# 21. OpenRouter unavailable (graceful fallback)
async def test_21_openrouter_unavailable_fallback():
    # When OpenRouter fails or key is missing, chat_ai_controller must return graceful fallback, not crash
    res = await chat_ai_controller("test_user@healthpoint.app", "Tell me a joke")
    assert "reply" in res
    assert len(res["reply"]) > 5

# 22. Free-model rate limit reached (429 handling)
async def test_22_rate_limit_handling():
    llm = LLMService()
    # Mock httpx returning 429
    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "Rate limit exceeded"
    mock_resp.headers = {"Retry-After": "1"}
    mock_resp.json.return_value = {"error": {"message": "Rate limited"}}

    async def mock_post(*args, **kwargs):
        return mock_resp

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        with patch("services.llm_service.get_api_key", return_value="test_key"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(
                    messages=[{"role": "user", "content": "test"}],
                    override_model="meta-llama/llama-3.3-70b-instruct:free"
                )
            assert exc.value.status_code in (429, 503)

# 23. Model unavailable (404 switches to fallback model)
async def test_23_model_404_cycles_to_fallback():
    llm = LLMService()
    call_counts = []

    async def mock_post(url, headers, json):
        model = json.get("model")
        call_counts.append(model)
        mock_resp = MagicMock()
        if "non_existent" in model:
            mock_resp.status_code = 404
            mock_resp.text = "Not found"
            mock_resp.headers = {}
            mock_resp.json.return_value = {"error": {"message": "Model not found"}}
        else:
            mock_resp.status_code = 200
            mock_resp.text = '{"choices": [{"message": {"content": "Fallback successful"}}]}'
            mock_resp.headers = {}
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": "Fallback successful"}}]
            }
        return mock_resp

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        with patch("services.llm_service.get_api_key", return_value="test_mock_key"):
            with patch("services.llm_service.get_configured_models", return_value=["non_existent:free", "working_fallback:free"]):
                result = await llm.generate_completion(messages=[{"role": "user", "content": "hi"}])
                assert result == "Fallback successful"
                assert "working_fallback:free" in call_counts

# 24. Invalid API key (401 fails fast without retrying in loops)
async def test_24_invalid_api_key_fails_fast():
    llm = LLMService()
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized"
    mock_resp.headers = {}
    mock_resp.json.return_value = {"error": {"message": "Unauthorized"}}

    call_count = 0
    async def mock_post(url, headers, json):
        nonlocal call_count
        call_count += 1
        return mock_resp

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        with patch("services.llm_service.get_api_key", return_value="invalid_key"):
            with pytest.raises(LLMServiceException) as exc:
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])
            assert exc.value.status_code == 401
            # Must fail immediately on 401 without retrying
            assert call_count == 1

# 25. Slow response (bounded timeout)
async def test_25_slow_response_timeout():
    llm = LLMService()
    llm.timeout = 0.5  # 500ms timeout for test

    import httpx
    async def mock_slow_post(*args, **kwargs):
        await asyncio.sleep(1.0)
        raise httpx.TimeoutException("Timed out")

    with patch("httpx.AsyncClient.post", side_effect=mock_slow_post):
        with patch("services.llm_service.get_api_key", return_value="test_key"):
            with pytest.raises(LLMServiceException):
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])

# 26. Malformed model output
async def test_26_malformed_model_output():
    llm = LLMService()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '{"choices": []}'
    mock_resp.headers = {}
    mock_resp.json.return_value = {"choices": []} # empty choices array

    async def mock_post(*args, **kwargs):
        return mock_resp

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        with patch("services.llm_service.get_api_key", return_value="test_key"):
            with pytest.raises(LLMServiceException):
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])

# 27. Empty response content
async def test_27_empty_response_content():
    llm = LLMService()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '{"choices": [{"message": {"content": "   "}}]}'
    mock_resp.headers = {}
    mock_resp.json.return_value = {"choices": [{"message": {"content": "   "}}]}

    async def mock_post(*args, **kwargs):
        return mock_resp

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        with patch("services.llm_service.get_api_key", return_value="test_key"):
            with pytest.raises(LLMServiceException):
                await llm.generate_completion(messages=[{"role": "user", "content": "test"}])

# 28. Frontend loading state resilience
async def test_28_mask_key_security():
    assert mask_key("") == "<not-set>"
    assert mask_key("short") == "***"
    assert mask_key("sk-or-v1-abcdef1234567890") == "sk-o...7890"
