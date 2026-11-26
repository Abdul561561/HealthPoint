"""
HealthPoint AI Controller
=========================
Orchestrates natural general-purpose conversation and specialized healthcare assistance
using Google Gemini (`google-genai`), intent detection, minimized health context
retrieval, RAG, and multimodal medical document analysis.
"""

import json
import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from bson import ObjectId

from database.mongodb import get_database
from services.llm_service import get_llm_service, LLMServiceException
from services.intent_service import detect_intent, IntentType
from services.health_context_service import build_minimized_health_context
from services.rag_service import get_rag_service
from services.rate_limit_service import rate_limiter
from services.document_service import (
    extract_text_from_pdf,
    extract_lab_markers,
    resolve_safe_upload_path,
)

logger = logging.getLogger("healthpoint.ai_controller")

SYSTEM_DISCLAIMER = (
    "\n\n> *Disclaimer: HealthPoint AI provides informational guidance only and is not a "
    "medical diagnosis, clinical advice, or substitute for a qualified healthcare professional.*"
)


def _format_unavailable_message(llm_err: Exception, intent: str) -> str:
    """Return an honest, user-friendly explanation tailored to the Gemini failure category."""
    if intent == IntentType.EMERGENCY:
        return (
            "URGENT EMERGENCY NOTICE: If you or someone nearby is experiencing severe chest pain, "
            "difficulty breathing, sudden numbness, or heavy bleeding, call emergency services immediately "
            "(911 in the US or 112 / 108 in India) or go to the nearest Emergency Room.\n\n"
            "(Automated safety notice — live AI assistant is temporarily unavailable.)"
        )

    status_code = getattr(llm_err, "status_code", None)
    category = getattr(llm_err, "error_category", "") or ""

    if category == "unconfigured_api_key" or (status_code == 401 and "not configured" in str(llm_err).lower()):
        return (
            "HealthPoint AI is currently unavailable because `GEMINI_API_KEY` is not configured "
            "on the backend server. Please ask the administrator to configure a Google Gemini API key."
        )
    if category == "invalid_api_key" or status_code == 401:
        return (
            "HealthPoint AI could not authenticate with Google Gemini (invalid API key). "
            "Please check the backend `GEMINI_API_KEY` configuration."
        )
    if category == "insufficient_credits_or_restricted" or status_code in (402, 403):
        return (
            "HealthPoint AI is currently unavailable due to Gemini API quota limits or access restrictions "
            "for the configured model."
        )
    if category == "rate_limited" or status_code == 429:
        return (
            "HealthPoint AI is temporarily rate-limited by the Google Gemini API. "
            "Please wait a moment and try again."
        )
    if category == "model_unavailable" or status_code in (404, 410):
        return (
            "HealthPoint AI is temporarily unavailable because the configured Gemini model "
            "is not supported or could not be found. Please check `GEMINI_MODEL`."
        )
    if category == "malformed_request" or status_code in (400, 422):
        return (
            "HealthPoint AI could not process the request format with Google Gemini. "
            "Please try rephrasing your question."
        )
    if category in ("network_timeout", "network_error") or status_code == 408:
        return (
            "HealthPoint AI timed out while waiting for Google Gemini to respond. "
            "Please try again in a moment."
        )
    return (
        "HealthPoint AI is temporarily unavailable right now because Google Gemini "
        "could not be reached. Please try again in a moment."
    )


async def chat_ai_controller(user_email: str, message: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Main conversational endpoint:
    - Enforces rate limiting and chat-session ownership.
    - Classifies intent and preserves follow-up context.
    - Retrieves minimal de-identified health data ONLY when relevant.
    - Executes completion via Google Gemini (`google-genai`) with transparent fallback messages.
    """
    rate_limiter.check("ai_chat", user_email, max_requests=30, window_seconds=300)
    db = get_database()

    session = None
    if db is not None:
        if session_id:
            try:
                obj_id = ObjectId(session_id)
            except Exception:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format")

            session = await db.chat_history.find_one({"_id": obj_id, "user_email": user_email})
            if not session:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chat session not found or you are not authorized to access it.",
                )
        else:
            session = await db.chat_history.find_one({"user_email": user_email, "status": "active"})

        if not session:
            session_doc = {
                "user_email": user_email,
                "status": "active",
                "messages": [
                    {
                        "role": "model",
                        "content": "Hello! I'm HealthPoint AI, your personal assistant. How can I help you today?",
                    }
                ],
            }
            res = await db.chat_history.insert_one(session_doc)
            session = session_doc
            session["id"] = str(res.inserted_id)
        else:
            session["id"] = str(session["_id"])
            session.pop("_id", None)
    else:
        if session_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable")
        session = {
            "id": "ephemeral",
            "user_email": user_email,
            "status": "active",
            "messages": [],
        }

    # Intent Detection with Follow-up context preservation
    intent_data = detect_intent(message)
    intent = intent_data["intent"]

    if intent == IntentType.FOLLOW_UP and session.get("messages"):
        prior_user_msgs = [m.get("content", "") for m in session["messages"] if m.get("role") == "user"]
        if prior_user_msgs:
            prior_intent = detect_intent(prior_user_msgs[-1])
            if prior_intent.get("is_healthcare"):
                intent_data["is_healthcare"] = True
                intent_data["requires_health_context"] = prior_intent.get("requires_health_context", False)
                intent_data["requires_disclaimer"] = prior_intent.get("requires_disclaimer", False)
                intent = prior_intent["intent"]

    logger.info("User chat request classified as intent='%s'", intent)

    # Personalized Health Context (Selective & De-identified)
    health_context = await build_minimized_health_context(user_email, intent, message)

    # RAG Retrieval (For clinical/health queries)
    rag_context = ""
    if intent_data["is_healthcare"]:
        rag_hits = get_rag_service().retrieve_relevant_knowledge(message, user_email=user_email, top_k=2)
        if rag_hits:
            rag_lines = [f"- [{h['source']}] {h['title']}: {h['content']}" for h in rag_hits]
            rag_context = "\n[CLINICAL GUIDELINES & REFERENCE DATA]:\n" + "\n".join(rag_lines)

    system_instruction = _build_system_instruction(intent, health_context, rag_context)

    llm_service = get_llm_service()
    history_to_send = []
    for msg in session.get("messages", [])[-8:]:
        role = msg.get("role", "user")
        if role == "model":
            role = "assistant"
        history_to_send.append({"role": role, "content": msg.get("content", "")})
    history_to_send.append({"role": "user", "content": message})

    ai_available = True
    error_reason = None
    try:
        reply = await llm_service.generate_completion(
            messages=history_to_send,
            system_instruction=system_instruction,
            temperature=0.7 if intent != IntentType.PROGRAMMING else 0.2,
        )
    except LLMServiceException as llm_err:
        logger.warning(
            "Gemini completion failed (status=%s, category=%s)",
            llm_err.status_code,
            getattr(llm_err, "error_category", "provider_error"),
        )
        ai_available = False
        error_reason = str(llm_err)
        reply = _format_unavailable_message(llm_err, intent)
    except Exception as llm_err:
        logger.warning("Unexpected Gemini failure: %s", type(llm_err).__name__)
        ai_available = False
        error_reason = "AI provider error"
        reply = _format_unavailable_message(llm_err, intent)

    if ai_available and intent_data.get("requires_disclaimer") and SYSTEM_DISCLAIMER not in reply:
        reply = reply.strip() + SYSTEM_DISCLAIMER

    if db is not None and session.get("id") != "ephemeral":
        await db.chat_history.update_one(
            {"_id": ObjectId(session["id"]), "user_email": user_email},
            {
                "$push": {
                    "messages": {
                        "$each": [
                            {"role": "user", "content": message},
                            {"role": "model", "content": reply},
                        ]
                    }
                }
            },
        )
        updated_session = await db.chat_history.find_one({"_id": ObjectId(session["id"]), "user_email": user_email})
        history_out = updated_session["messages"] if updated_session else session.get("messages", [])
    else:
        history_out = session.get("messages", []) + [
            {"role": "user", "content": message},
            {"role": "model", "content": reply},
        ]

    return {
        "session_id": session["id"],
        "reply": reply,
        "intent": intent,
        "ai_available": ai_available,
        "error_reason": error_reason,
        "history": history_out,
    }


def _build_system_instruction(intent: str, health_context: str, rag_context: str) -> str:
    """Creates a focused, natural system prompt tailored to the user's intent."""
    base = (
        "You are HealthPoint AI, a helpful, natural, and knowledgeable assistant with healthcare "
        "expertise. Do not force non-medical conversations into medical topics."
    )

    if intent == IntentType.GREETING:
        return (
            f"{base} Respond to the greeting warmly, naturally, and concisely in 1-2 sentences. "
            "Do NOT generate unsolicited health summaries or append medical disclaimers."
        )

    if intent == IntentType.CASUAL:
        return (
            f"{base} Respond to the user's casual conversation naturally and concisely. "
            "Do NOT append medical disclaimers."
        )

    if intent == IntentType.PROGRAMMING:
        return (
            f"{base} Answer the programming or software engineering question directly with clear "
            "explanations and clean code blocks. Do NOT append medical disclaimers."
        )

    if intent in (IntentType.GENERAL_KNOWLEDGE, IntentType.EDUCATION):
        return f"{base} Provide an accurate, clear educational explanation. Do NOT append medical disclaimers."

    if intent == IntentType.EMERGENCY:
        return (
            f"{base} URGENT EMERGENCY NOTICE: The user may be experiencing an acute medical emergency. "
            "Immediately and prominently advise them to call emergency services (911 in North America or 112/108 in India) "
            "or go to the nearest emergency room without delay."
        )

    if intent == IntentType.PERSONAL_HEALTH:
        return (
            f"{base} Answer the user's question about their personal health or vitals using strictly the verified data below.\n"
            f"{health_context}\n"
            "If a requested measurement is not recorded, state that clearly without guessing or inventing values. "
            "State clearly that your guidance is informational and not a medical diagnosis."
        )

    if intent == IntentType.DIET_NUTRITION:
        return (
            f"{base} Provide structured, evidence-based nutrition guidance using only verified parameters below:\n"
            f"{health_context}\nAvoid extreme or unsafe calorie deficits."
        )

    if intent == IntentType.FITNESS:
        return (
            f"{base} Provide structured, safe fitness guidance tailored to any verified parameters below:\n"
            f"{health_context}\nInclude warmup, sets/repetitions, cooldown, and safety precautions."
        )

    instr = (
        f"{base} Provide clear, empathetic, patient-friendly guidance on the healthcare topic. "
        "Explain clearly that AI output is informational and not a medical diagnosis."
    )
    if health_context:
        instr += f"\n{health_context}"
    if rag_context:
        instr += f"\n{rag_context}"
    return instr


async def get_chat_history_controller(user_email: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    session = await db.chat_history.find_one({"user_email": user_email, "status": "active"})
    if not session:
        session_doc = {
            "user_email": user_email,
            "status": "active",
            "messages": [
                {
                    "role": "model",
                    "content": "Hello! I'm HealthPoint AI, your personal assistant. How can I help you today?",
                }
            ],
        }
        res = await db.chat_history.insert_one(session_doc)
        session = session_doc
        session["id"] = str(res.inserted_id)

    if "_id" in session:
        session["id"] = str(session["_id"])
        del session["_id"]

    return session


async def reset_chat_controller(user_email: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    await db.chat_history.update_many(
        {"user_email": user_email, "status": "active"},
        {"$set": {"status": "archived"}},
    )

    new_session_doc = {
        "user_email": user_email,
        "status": "active",
        "messages": [
            {
                "role": "model",
                "content": "Hello! I'm HealthPoint AI, your personal assistant. How can I help you today?",
            }
        ],
    }
    res = await db.chat_history.insert_one(new_session_doc)
    new_session_doc["id"] = str(res.inserted_id)
    new_session_doc.pop("_id", None)

    return {
        "session_id": new_session_doc["id"],
        "message": "Chat session reset successfully.",
        "history": new_session_doc["messages"],
    }


async def delete_chat_session_controller(user_email: str, session_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        obj_id = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    result = await db.chat_history.delete_one({"_id": obj_id, "user_email": user_email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat session not found or unauthorized.")

    return {"success": True, "message": "Session deleted successfully"}


def _detect_mime_from_bytes(content: bytes) -> Optional[str]:
    if not content:
        return None
    if content[:4] == b"%PDF":
        return "application/pdf"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


async def analyze_report_controller(
    user_email: str,
    title: str,
    category: str,
    url: Optional[str] = None,
    record_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Performs medical document analysis with strict record ownership verification.
    Supports text-based PDFs and Gemini multimodal vision/OCR for medical images and scanned PDFs.
    Does not fabricate illegible values or pretend local parsing is AI output.
    """
    db = get_database()
    file_bytes = None
    extracted_text = ""

    if record_id:
        if db is None:
            raise HTTPException(status_code=503, detail="Database connection unavailable")
        try:
            r_obj = ObjectId(record_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid record ID format")

        rec = await db.records.find_one({"_id": r_obj, "user_email": user_email})
        if not rec:
            raise HTTPException(status_code=404, detail="Medical record not found or unauthorized")

        if rec.get("stored_filename") or rec.get("local_path"):
            try:
                safe_path = resolve_safe_upload_path(
                    "records",
                    stored_filename=rec.get("stored_filename"),
                    local_path=rec.get("local_path"),
                )
                with open(safe_path, "rb") as f:
                    file_bytes = f.read()
            except HTTPException:
                file_bytes = None
        elif rec.get("extracted_text"):
            extracted_text = rec.get("extracted_text", "")
        elif (rec.get("url") or "").startswith("https://"):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(rec["url"])
                    if res.status_code == 200:
                        file_bytes = res.content
            except Exception as e:
                logger.warning("Could not download external attachment: %s", type(e).__name__)

    detected_mime = _detect_mime_from_bytes(file_bytes) if file_bytes else None
    if file_bytes and detected_mime == "application/pdf":
        extracted_text = extract_text_from_pdf(file_bytes)

    markers = extract_lab_markers(extracted_text) if extracted_text else []

    # Attach multimodal bytes for images or scanned PDFs where text extraction yielded nothing
    multimodal_bytes: Optional[bytes] = None
    multimodal_mime: Optional[str] = None
    if file_bytes and detected_mime:
        if detected_mime.startswith("image/") or (detected_mime == "application/pdf" and not extracted_text.strip()):
            multimodal_bytes = file_bytes
            multimodal_mime = detected_mime

    prompt = f"Analyze the medical report titled '{title}' (Category: {category}).\n"
    if extracted_text:
        prompt += f"Document Extracted Text:\n{extracted_text[:2500]}\n"
    if markers:
        prompt += f"Extracted Test Biomarkers:\n{json.dumps(markers, indent=2)}\n"
    if not extracted_text and not markers and not multimodal_bytes:
        prompt += (
            "No machine-readable text or image attachment is available for this report. "
            "Explain clearly that automated value extraction was not possible and do NOT invent any numbers.\n"
        )
    elif multimodal_bytes:
        prompt += (
            "Inspect the attached medical document or scan carefully. Extract only clearly legible "
            "values and mark anything unreadable as unclear — NEVER invent numbers.\n"
        )

    system_instr = (
        "You are a clinical laboratory information assistant. Review only the extracted report content "
        "or attached medical document provided. Explain findings in clear, patient-friendly terms, "
        "suggest questions to ask a doctor, and NEVER invent values not present in the source document. "
        "Clearly state this is informational and not a medical diagnosis."
    )

    llm_service = get_llm_service()
    ai_available = True
    try:
        analysis_text = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr,
            image_bytes=multimodal_bytes,
            image_mime=multimodal_mime,
        )
    except LLMServiceException as e:
        ai_available = False
        if markers:
            lines = [
                f"### Document Extraction: {title}",
                "",
                "*(AI narrative explanation is currently unavailable; showing only verified laboratory values extracted directly from the PDF text.)*",
                "",
                "| Test Name | Measured Value | Reference Range | Status |",
                "| :--- | :--- | :--- | :--- |",
            ]
            for m in markers:
                lines.append(
                    f"| **{m['test_name']}** | {m['measured_value']} {m['unit']} | {m['reference_range']} | {m['status']} |"
                )
            analysis_text = "\n".join(lines)
        else:
            analysis_text = (
                f"### Report Inspection: {title}\n\n"
                "Automated AI explanation is currently unavailable (Google Gemini is unconfigured or unreachable), "
                "and no machine-readable laboratory markers were found in this document."
            )

    return {
        "analysis": analysis_text.strip() + SYSTEM_DISCLAIMER,
        "extracted_markers": markers,
        "source": title,
        "ai_available": ai_available,
    }


async def generate_diet_controller(age: int, weight: str, height: str, goal: str, restrictions: Optional[str] = None) -> Dict[str, Any]:
    prompt = (
        f"Create a personalized nutrition and diet plan for:\n"
        f"- Age: {age}\n- Weight: {weight}\n- Height: {height}\n- Goal: {goal}\n"
        f"- Restrictions: {restrictions or 'None'}"
    )
    system_instr = (
        "You are a clinical nutrition assistant. Create a balanced daily calorie summary and structured meal plan "
        "using clean markdown tables. Avoid unsafe crash diets. Remind the user this is informational only."
    )

    llm_service = get_llm_service()
    try:
        raw = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr,
        )
        return {"plan": raw.strip() + SYSTEM_DISCLAIMER}
    except LLMServiceException as exc:
        raise HTTPException(status_code=exc.status_code or 503, detail=str(exc))


async def generate_fitness_controller(age: int, weight: str, height: str, fitness_level: str, goals: str) -> Dict[str, Any]:
    prompt = (
        f"Design a personalized fitness plan for:\n"
        f"- Age: {age}\n- Weight: {weight}\n- Height: {height}\n"
        f"- Fitness Level: {fitness_level}\n- Health Goals: {goals}"
    )
    system_instr = (
        "You are a certified fitness guidance assistant. Design a structured weekly workout routine matching "
        "experience level and physical vitals. Include warmup, sets/reps, cooldown, and safety notes."
    )

    llm_service = get_llm_service()
    try:
        raw = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr,
        )
        return {"plan": raw.strip() + SYSTEM_DISCLAIMER}
    except LLMServiceException as exc:
        raise HTTPException(status_code=exc.status_code or 503, detail=str(exc))


async def explain_medicine_controller(user_email: str, medicine_name: str, generic_name: Optional[str] = None) -> Dict[str, Any]:
    full_name = medicine_name
    if generic_name and generic_name.lower() != medicine_name.lower():
        full_name = f"{medicine_name} ({generic_name})"

    prompt = f"""Explain the medication '{full_name}' in simple terms for a patient.
Provide a JSON response with exactly these fields:
{{
  "uses": "What this medicine is used to treat (2-3 sentences)",
  "how_it_works": "Simple explanation of mechanism (1-2 sentences)",
  "common_side_effects": ["side effect 1", "side effect 2", "side effect 3"],
  "precautions": ["precaution 1", "precaution 2", "precaution 3"],
  "alternatives": ["alternative medicine 1", "alternative medicine 2"],
  "dosage_tip": "General dosage guidance (1 sentence)",
  "when_to_see_doctor": "When to consult a doctor (1-2 sentences)",
  "disclaimer": "Informational only. Not a medical diagnosis or prescription replacement."
}}
Return ONLY valid JSON."""

    system_instr = (
        "You are a clinical pharmacist information assistant. Provide factual, patient-friendly explanations "
        "of medications. Never advise stopping or altering prescribed dosages."
    )
    llm_service = get_llm_service()

    try:
        text = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr,
            response_json=True,
        )
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        result = json.loads(text)
        return {"medicine": medicine_name, "explanation": result}
    except LLMServiceException as exc:
        raise HTTPException(status_code=exc.status_code or 503, detail=str(exc))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google Gemini returned malformed JSON for medicine explanation. Please try again.",
        )
