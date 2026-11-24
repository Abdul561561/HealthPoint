"""
Backward-compatibility adapter module forwarding to backend.services.llm_service.
All Google Gemini dependencies have been migrated to the OpenRouter AI LLM Provider.
"""

from services.llm_service import call_openrouter, call_openrouter_chat

async def call_gemini(
    system_instruction: str,
    prompt: str,
    image_bytes: bytes = None,
    mime_type: str = None,
    response_json: bool = False,
) -> str:
    """Forward legacy calls to OpenRouter LLM Service."""
    return await call_openrouter(
        system_instruction=system_instruction,
        prompt=prompt,
        image_bytes=image_bytes,
        mime_type=mime_type,
        response_json=response_json
    )

async def call_gemini_chat(
    system_instruction: str,
    history: list,
    new_message: str,
) -> str:
    """Forward legacy multi-turn chat calls to OpenRouter LLM Service."""
    return await call_openrouter_chat(
        system_instruction=system_instruction,
        history=history,
        new_message=new_message
    )
