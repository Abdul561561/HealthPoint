"""
Shared Gemini AI helper module using the new google.genai SDK.
Provides a unified interface for all controllers to call Gemini with
automatic model fallback, system instructions, and chat history support.
"""
import os
from dotenv import load_dotenv

# Load .env
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)
else:
    load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Try new SDK first, fall back to old
try:
    from google import genai
    from google.genai import types as genai_types
    _USE_NEW_SDK = True
    _client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
    print("Using new google.genai SDK.")
except ImportError:
    import google.generativeai as genai_old
    genai_old.configure(api_key=GEMINI_API_KEY)
    _USE_NEW_SDK = False
    _client = None
    print("Using legacy google-generativeai SDK (fallback).")

# Model priority list — only models confirmed to work with v1beta generateContent
MODELS_TO_TRY = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
    "gemini-pro",
]



async def call_gemini(
    system_instruction: str,
    prompt: str,
    image_bytes: bytes = None,
    mime_type: str = None,
    response_json: bool = False,
) -> str:
    """
    Call Gemini AI with automatic model fallback.
    Returns the response text.
    Raises Exception if all models fail.
    """
    last_error = None

    if _USE_NEW_SDK and _client:
        for model_name in MODELS_TO_TRY:
            try:
                print(f"[GeminiHelper] Trying model: {model_name} ...")
                contents = []

                if image_bytes and mime_type:
                    contents.append(
                        genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
                    )
                contents.append(prompt)

                config_kwargs = {
                    "system_instruction": system_instruction,
                }
                if response_json:
                    config_kwargs["response_mime_type"] = "application/json"

                response = _client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(**config_kwargs),
                )
                print(f"[GeminiHelper] Success with model: {model_name}")
                return response.text
            except Exception as e:
                print(f"[GeminiHelper] Model {model_name} failed: {e}")
                last_error = e
    else:
        # Legacy SDK fallback
        import google.generativeai as genai_legacy
        genai_legacy.configure(api_key=GEMINI_API_KEY)

        for model_name in MODELS_TO_TRY:
            try:
                print(f"[GeminiHelper-Legacy] Trying model: {model_name} ...")
                gen_config = {}
                if response_json:
                    gen_config["response_mime_type"] = "application/json"

                model = genai_legacy.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_instruction,
                    generation_config=gen_config if gen_config else None,
                )

                parts = []
                if image_bytes and mime_type:
                    parts.append({"mime_type": mime_type, "data": image_bytes})
                parts.append(prompt)

                response = model.generate_content(parts)
                print(f"[GeminiHelper-Legacy] Success with model: {model_name}")
                return response.text
            except Exception as e:
                print(f"[GeminiHelper-Legacy] Model {model_name} failed: {e}")
                last_error = e

    raise Exception(f"All Gemini models failed. Last error: {last_error}")


async def call_gemini_chat(
    system_instruction: str,
    history: list,
    new_message: str,
) -> str:
    """
    Call Gemini in chat/conversational mode with history.
    history: list of {"role": "user"|"model", "content": "..."}
    Returns the reply text.
    """
    # Build a single prompt from history + new message for new SDK
    # (the new SDK supports multi-turn via contents list)
    history_text = ""
    for msg in history[-8:]:  # last 8 messages
        role = msg.get("role", "user").upper()
        content = msg.get("content", "")
        history_text += f"{role}: {content}\n"
    history_text += f"USER: {new_message}\nMODEL:"

    return await call_gemini(system_instruction, history_text)
