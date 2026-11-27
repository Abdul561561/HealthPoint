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
from services.intent_service import detect_intent, IntentType, PERSONAL_CONTEXT_INTENTS
from services.health_context_service import (
    build_minimized_health_context,
    build_structured_health_context,
    get_user_health_context_snapshot,
)
from services.action_router_service import (
    looks_like_pure_location_reply,
    route_healthcare_actions,
)
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
    if category == "permission_denied" or status_code == 403:
        return (
            "HealthPoint AI was denied access by Google Gemini (API permission denied for this key or project). "
            "Please verify Gemini API permissions in Google AI Studio / Cloud."
        )
    if category == "quota_exhausted" or status_code == 402:
        return (
            "HealthPoint AI has exceeded the configured Google Gemini API quota. "
            "Please check quota/billing limits in Google AI Studio."
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
    if category in ("invalid_request_format", "malformed_request") or status_code in (400, 422):
        return (
            "HealthPoint AI could not process the request format with Google Gemini. "
            "Please try rephrasing your question."
        )
    if category in ("timeout", "network_timeout") or status_code == 408:
        return (
            "HealthPoint AI timed out while waiting for Google Gemini to respond. "
            "Please try again in a moment."
        )
    if category == "empty_response":
        return (
            "Google Gemini returned an empty response for your message. "
            "Please try asking again or rephrasing slightly."
        )
    return (
        "HealthPoint AI is temporarily unavailable right now because Google Gemini is experiencing high demand or an outage. "
        "Please try again in a moment."
    )


async def chat_ai_controller(
    user_email: str,
    message: str,
    session_id: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location_query: Optional[str] = None,
    location_denied: bool = False,
) -> Dict[str, Any]:
    """
    Main conversational endpoint:
    - Enforces rate limiting and chat-session ownership.
    - Classifies intent and preserves follow-up & location context.
    - Retrieves minimal de-identified health data & executes real Google Places / action routing when relevant.
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

    # Intent Detection with Follow-up and Location reply context preservation
    intent_data = detect_intent(message)
    intent = intent_data["intent"]

    prior_user_msgs = [m.get("content", "") for m in session.get("messages", []) if m.get("role") == "user"]
    if intent == IntentType.FOLLOW_UP and prior_user_msgs:
        prior_intent = detect_intent(prior_user_msgs[-1])
        if prior_intent.get("is_healthcare"):
            intent_data["is_healthcare"] = True
            intent_data["requires_health_context"] = prior_intent.get("requires_health_context", False)
            intent_data["requires_disclaimer"] = prior_intent.get("requires_disclaimer", False)
            intent = prior_intent["intent"]
    elif (
        intent == IntentType.UNKNOWN
        and looks_like_pure_location_reply(message)
        and (session.get("last_facility_mode") or (prior_user_msgs and detect_intent(prior_user_msgs[-1])["intent"] in (IntentType.DOCTOR_DISCOVERY, IntentType.HOSPITAL_DISCOVERY, IntentType.SYMPTOM_TRIAGE)))
    ):
        intent = IntentType.HOSPITAL_DISCOVERY if session.get("last_facility_mode") == "hospital" else IntentType.DOCTOR_DISCOVERY
        intent_data["is_healthcare"] = True
        intent_data["requires_disclaimer"] = False

    logger.info("User chat request classified as intent='%s'", intent)

    # Personalized Health Context (Selective, Validated & De-identified)
    health_ctx = await build_structured_health_context(user_email, intent, message)
    health_context = health_ctx.get("prompt_text", "")
    context_used = bool(health_ctx.get("used"))
    context_sources = health_ctx.get("sources", [])
    missing_metrics = health_ctx.get("missing_fields", [])

    # Real-time Doctor / Hospital Discovery & Actionable HealthPoint Routing
    router_res = await route_healthcare_actions(
        message=message,
        intent=intent,
        session=session,
        lat=lat,
        lng=lng,
        location_query=location_query,
        location_denied=bool(location_denied),
    )
    places = router_res.get("places", [])
    places_error = router_res.get("places_error")
    manual_maps_url = router_res.get("manual_maps_url")
    requires_location = bool(router_res.get("requires_location"))
    search_center = router_res.get("search_center")
    actions = router_res.get("actions", [])
    router_context = router_res.get("router_context", "")
    session_updates = router_res.get("session_updates") or {}

    # RAG Retrieval (For clinical/health queries)
    rag_context = ""
    if intent_data["is_healthcare"]:
        rag_hits = get_rag_service().retrieve_relevant_knowledge(message, user_email=user_email, top_k=2)
        if rag_hits:
            rag_lines = [f"- [{h['source']}] {h['title']}: {h['content']}" for h in rag_hits]
            rag_context = "\n[CLINICAL GUIDELINES & REFERENCE DATA]:\n" + "\n".join(rag_lines)

    system_instruction = _build_system_instruction(intent, health_context, rag_context, router_context)

    llm_service = get_llm_service()
    history_to_send = []
    for msg in session.get("messages", [])[-8:]:
        if msg.get("ai_error"):
            continue
        role = msg.get("role", "user")
        if role == "model":
            role = "assistant"
        history_to_send.append({"role": role, "content": msg.get("content", ""), "ai_error": bool(msg.get("ai_error"))})
    history_to_send.append({"role": "user", "content": message})

    ai_available = True
    error_reason = None
    error_category = None
    try:
        reply = await llm_service.generate_completion(
            messages=history_to_send,
            system_instruction=system_instruction,
            request_mode="conversation",
        )
    except LLMServiceException as llm_err:
        error_category = getattr(llm_err, "error_category", "provider_error")
        logger.warning(
            "Gemini completion failed (status=%s, category=%s, stage=%s)",
            llm_err.status_code,
            error_category,
            getattr(llm_err, "stage", "api_call"),
        )
        ai_available = False
        error_reason = str(llm_err)
        reply = _format_unavailable_message(llm_err, intent)
    except Exception as llm_err:
        error_category = "provider_outage"
        logger.warning("Unexpected Gemini failure: %s", type(llm_err).__name__)
        ai_available = False
        error_reason = "AI provider error"
        reply = _format_unavailable_message(llm_err, intent)

    if intent == IntentType.EMERGENCY and "EMERGENCY" not in reply:
        reply = "**URGENT MEDICAL EMERGENCY:** Call 112 (India) or 911 immediately.\n\n" + reply.strip()

    if ai_available and intent_data.get("requires_disclaimer") and SYSTEM_DISCLAIMER not in reply:
        reply = reply.strip() + SYSTEM_DISCLAIMER

    user_entry = {"role": "user", "content": message}
    model_entry: Dict[str, Any] = {
        "role": "model",
        "content": reply,
        "context_used": context_used if ai_available else False,
        "context_sources": context_sources if ai_available and context_used else [],
        "places": places,
        "places_error": places_error,
        "manual_maps_url": manual_maps_url,
        "requires_location": requires_location,
        "search_center": search_center,
        "actions": actions,
    }
    if not ai_available:
        user_entry["ai_error"] = True
        model_entry["ai_error"] = True

    if db is not None and session.get("id") != "ephemeral":
        update_doc: Dict[str, Any] = {
            "$push": {
                "messages": {
                    "$each": [
                        user_entry,
                        model_entry,
                    ]
                }
            }
        }
        if session_updates:
            update_doc["$set"] = session_updates
        await db.chat_history.update_one(
            {"_id": ObjectId(session["id"]), "user_email": user_email},
            update_doc,
        )
        updated_session = await db.chat_history.find_one({"_id": ObjectId(session["id"]), "user_email": user_email})
        history_out = updated_session["messages"] if updated_session else session.get("messages", [])
    else:
        if session_updates:
            session.update(session_updates)
        history_out = session.get("messages", []) + [
            user_entry,
            model_entry,
        ]

    return {
        "session_id": session["id"],
        "reply": reply,
        "intent": intent,
        "context_used": context_used,
        "context_sources": context_sources,
        "missing_metrics": missing_metrics,
        "places": places,
        "places_error": places_error,
        "manual_maps_url": manual_maps_url,
        "requires_location": requires_location,
        "search_center": search_center,
        "actions": actions,
        "ai_available": ai_available,
        "error_reason": error_reason,
        "error_category": error_category,
        "history": history_out,
    }


def _build_system_instruction(
    intent: str,
    health_context: str,
    rag_context: str,
    router_context: str = "",
) -> str:
    """Creates a strong, personalized HealthPoint AI system instruction tailored to intent."""
    base = (
        "You are HealthPoint AI, a helpful, knowledgeable personal healthcare information assistant "
        "working inside the HealthPoint platform. Answer casual or technical questions naturally without "
        "forcing medical disclaimers."
    )
    clinical_guardrails = (
        "STRICT SAFETY & HONESTY RULES:\n"
        "1. Use ONLY the verified user measurements, timestamps, profile details, and uploaded documents "
        "provided in the Authorized User Context below. NEVER invent or guess missing readings, lab values, "
        "conditions, or medications.\n"
        "2. Distinguish clearly between general medical knowledge and the user's recorded data.\n"
        "3. Cite measurement timestamps when provided, and clearly distinguish current values from historical trends.\n"
        "4. Compare historical readings ONLY when >=2 reliable past readings are provided.\n"
        "5. NEVER claim to continuously monitor the user or connect to live wearables.\n"
        "6. NEVER diagnose conditions, label someone simply 'healthy' or 'unhealthy' from a few vitals, "
        "or recommend changing prescribed medications without consulting a licensed clinician.\n"
        "7. Ask brief relevant follow-up questions or suggest consulting a doctor when appropriate."
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

    if intent == IntentType.HEALTH_OVERVIEW:
        return (
            f"{base}\n{clinical_guardrails}\n"
            "Format the response clearly in simple patient-friendly language using these exact sections:\n"
            "### Your Health Overview\n"
            "Summarize only the available recorded metrics and profile basics with their timestamps (or clearly state what has not been recorded).\n"
            "### What Your Metrics Mean\n"
            "Explain Heart Rate, Blood Pressure, Sleep, and BMI (plus any other recorded vitals) individually where available.\n"
            "### Positive Observations\n"
            "Note encouraging measurements or habits carefully without diagnosing or declaring someone completely 'healthy'.\n"
            "### Areas to Improve\n"
            "Identify practical areas for wellness improvement grounded in the recorded values.\n"
            "### Recommendations\n"
            "Give safe, practical lifestyle suggestions and ask 1-2 helpful follow-up questions (e.g., how they are feeling today).\n"
            "### Missing Information\n"
            "List the important measurements, lab panels, or medication details marked missing below so the user knows what to record next.\n"
            f"\n{health_context}"
            f"{rag_context}"
        )

    if intent in (IntentType.PERSONAL_HEALTH, IntentType.HEALTH_TREND, IntentType.MEDICATION_PERSONAL, IntentType.REPORT_ANALYSIS, IntentType.HEALTH_RECORDS, IntentType.PHARMACY, IntentType.INSURANCE):
        return (
            f"{base}\n{clinical_guardrails}\n"
            "Answer the user's personal question directly using the verified HealthPoint data below. "
            "If the specific requested metric, prescription, or report is not recorded, state that explicitly.\n"
            f"{health_context}"
            f"{rag_context}"
        )

    if intent == IntentType.DIET_NUTRITION:
        return (
            f"{base}\n{clinical_guardrails}\n"
            "Provide structured, evidence-based nutrition guidance using only verified parameters below:\n"
            f"{health_context}\nAvoid extreme or unsafe calorie deficits."
        )

    if intent == IntentType.FITNESS:
        return (
            f"{base}\n{clinical_guardrails}\n"
            "Provide structured, safe fitness guidance tailored to any verified parameters below:\n"
            f"{health_context}\nInclude warmup, sets/repetitions, cooldown, and safety precautions."
        )

    if intent in (IntentType.DOCTOR_DISCOVERY, IntentType.HOSPITAL_DISCOVERY):
        return (
            f"{base}\n{clinical_guardrails}\n"
            "You are assisting with real-time medical facility / specialist discovery.\n"
            "STRICT DISCOVERY RULES:\n"
            "- NEVER invent doctors, clinics, hospitals, phone numbers, addresses, or hours.\n"
            "- NEVER claim a facility is verified or has open appointment slots.\n"
            "- ONLY claim a place is open right now if explicit current opening status was returned.\n"
            "- If location is required, politely ask the user to allow browser location OR provide their city, area, or 6-digit PIN code.\n"
            "- If OpenStreetMap facilities are listed below, summarize the top closest options clearly with distance and available contact details.\n"
            "- If OpenStreetMap returned no listings or encountered an error, explain cleanly and provide the direct OpenStreetMap search link.\n"
            f"{router_context}\n{health_context}"
        )

    if intent == IntentType.SYMPTOM_TRIAGE:
        return (
            f"{base}\n{clinical_guardrails}\n"
            "You are guiding a user experiencing symptoms (such as fever, headache, cough, or discomfort).\n"
            "Structure your response helpfully:\n"
            "1. Ask 2-3 brief clarifying questions (onset, severity, other symptoms).\n"
            "2. Provide safe, general self-care guidance without diagnosing or writing formal prescriptions/dosages.\n"
            "3. Account for the user's age, allergies, and existing conditions ONLY if present in Authorized User Context below.\n"
            "4. Clearly highlight red-flag warning symptoms when urgent evaluation or emergency services (112/108 in India or 911) are needed.\n"
            "5. If nearby doctors/hospitals are included below (or if location is needed to search nearby doctors), integrate them clearly without fabricating any facilities.\n"
            f"{router_context}\n{health_context}\n{rag_context}"
        )

    instr = (
        f"{base} Provide clear, empathetic, patient-friendly general medical information. "
        "Explain clearly that AI output is informational and not a medical diagnosis."
    )
    if router_context:
        instr += f"\n{router_context}"
    if health_context:
        instr += f"\n{health_context}"
    if rag_context:
        instr += f"\n{rag_context}"
    return instr


async def get_health_context_controller(user_email: str) -> Dict[str, Any]:
    """Returns authenticated user's live HealthPoint metrics, missing fields, and module counts."""
    return await get_user_health_context_snapshot(user_email)


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
            request_mode="multimodal" if multimodal_bytes else "conversation",
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


async def generate_diet_controller(
    age: int,
    weight: str,
    height: str,
    goal: str,
    restrictions: Optional[str] = None,
    user_email: Optional[str] = None,
    question: Optional[str] = None,
    date_str: Optional[str] = None,
) -> Dict[str, Any]:
    logged_meals_summary = "No logged meals provided for today."
    target_summary = ""
    if user_email:
        try:
            from controllers.nutrition_controller import get_meals_by_date_controller, get_nutrition_goals_controller
            meals = await get_meals_by_date_controller(user_email, date_str=date_str)
            goals = await get_nutrition_goals_controller(user_email)
            total_kcal = sum(int(m.get("calories", 0) or 0) for m in meals)
            total_p = round(sum(float(m.get("protein", 0) or 0) for m in meals), 1)
            total_c = round(sum(float(m.get("carbs", 0) or 0) for m in meals), 1)
            total_f = round(sum(float(m.get("fat", 0) or 0) for m in meals), 1)
            target_kcal = int(goals.get("calories") or 2000)
            rem_kcal = target_kcal - total_kcal
            target_summary = (
                f"\nUser Daily Nutrition Targets: {target_kcal} kcal, Protein {goals.get('protein', 0)}g, "
                f"Carbs {goals.get('carbs', 0)}g, Fat {goals.get('fat', 0)}g, Fiber {goals.get('fiber', 0)}g.\n"
                f"Consumed So Far Today ({len(meals)} meal entries): {total_kcal} kcal "
                f"(P: {total_p}g, C: {total_c}g, F: {total_f}g).\n"
                f"Remaining Calorie Budget: {rem_kcal} kcal.\n"
            )
            if meals:
                lines = [
                    f"- {m.get('time', 'Meal')}: {m.get('name')} "
                    f"({m.get('quantity', 1)} {m.get('unit', 'serving')}, {m.get('calories', 0)} kcal, "
                    f"P:{m.get('protein', 0)}g C:{m.get('carbs', 0)}g F:{m.get('fat', 0)}g)"
                    for m in meals[:12]
                ]
                logged_meals_summary = "\n".join(lines)
        except Exception as e:
            logger.warning("Could not attach user meal logs to AI diet planner: %s", type(e).__name__)

    prompt = (
        f"Create personalized nutrition guidance for:\n"
        f"- Age: {age}\n- Weight: {weight}\n- Height: {height}\n- Goal: {goal}\n"
        f"- Restrictions: {restrictions or 'None'}\n"
        f"{target_summary}"
        f"\nLogged Foods Today:\n{logged_meals_summary}\n"
    )
    if question:
        prompt += f"\nSpecific User Request: {question.strip()}\n"

    system_instr = (
        "You are a clinical nutrition assistant. Use ONLY the user's real logged meals and calorie targets provided "
        "in the prompt; do NOT invent logged foods, lab values, or unverified packaged nutrition facts. "
        "Provide realistic, culturally adaptable meal suggestions (including practical Indian and everyday options when helpful) "
        "fitting the remaining calorie budget, formatted cleanly with markdown tables. Avoid unsafe crash diets. "
        "Remind the user this is informational only and not a medical prescription."
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
            request_mode="structured",
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
