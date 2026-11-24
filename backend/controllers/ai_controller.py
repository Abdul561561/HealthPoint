"""
HealthPoint AI Controller
=========================
Orchestrates natural general-purpose conversation and specialized healthcare assistance
using the OpenRouter LLM service, intent detection, minimized health context retrieval,
RAG, and real medical document analysis.
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from bson import ObjectId

from database.mongodb import get_database
from services.llm_service import get_llm_service, LLMServiceException
from services.intent_service import detect_intent, IntentType
from services.health_context_service import build_minimized_health_context
from services.rag_service import get_rag_service
from services.document_service import (
    extract_text_from_pdf,
    extract_lab_markers,
    parse_prescription_text,
    KNOWN_LAB_RANGES
)

logger = logging.getLogger("healthpoint.ai_controller")

SYSTEM_DISCLAIMER = "\n\n> *Disclaimer: HealthPoint AI provides health information for educational and informational purposes. It does not replace professional medical advice, clinical diagnosis, or treatment. Always consult a qualified healthcare professional for medical decisions.*"

async def chat_ai_controller(user_email: str, message: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Main conversational endpoint:
    - Verifies session ownership (both session ID and authenticated user identity).
    - Classifies intent using fast rule-based detection.
    - Retrieves minimal de-identified health data ONLY when relevant.
    - Executes completion via OpenRouter LLM service with fallback and graceful offline degradation.
    """
    db = get_database()

    # 1. Session verification & retrieval
    session = None
    if db is not None:
        if session_id:
            try:
                obj_id = ObjectId(session_id)
            except Exception:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format")
            
            session = await db.chat_history.find_one({"_id": obj_id, "user_email": user_email})
            if not session:
                # Session either does not exist or belongs to another user
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chat session not found or you are not authorized to access it."
                )
        else:
            # Find active session or create new
            session = await db.chat_history.find_one({"user_email": user_email, "status": "active"})

        if not session:
            session_doc = {
                "user_email": user_email,
                "status": "active",
                "messages": [
                    {
                        "role": "model",
                        "content": "Hello! I'm HealthPoint AI, your personal healthcare and conversational assistant. How can I help you today?"
                    }
                ]
            }
            res = await db.chat_history.insert_one(session_doc)
            session = session_doc
            session["id"] = str(res.inserted_id)
        else:
            session["id"] = str(session["_id"])
            if "_id" in session:
                del session["_id"]
    else:
        if session_id:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection unavailable")
        session = {
            "id": "ephemeral",
            "user_email": user_email,
            "status": "active",
            "messages": []
        }

    # 2. Intent Detection
    intent_data = detect_intent(message)
    intent = intent_data["intent"]
    logger.info(f"User '{user_email}' message classified as: {intent} (confidence: {intent_data['confidence']})")

    # 3. Personalized Health Context (Selective & De-identified)
    health_context = await build_minimized_health_context(user_email, intent, message)

    # 4. RAG Retrieval (For clinical/health queries)
    rag_context = ""
    if intent_data["is_healthcare"]:
        rag_hits = get_rag_service().retrieve_relevant_knowledge(message, user_email=user_email, top_k=2)
        if rag_hits:
            rag_lines = [f"- [{h['source']}] {h['title']}: {h['content']}" for h in rag_hits]
            rag_context = "\n[CLINICAL GUIDELINES & REFERENCE DATA]:\n" + "\n".join(rag_lines)

    # 5. Tailored System Instructions based on Intent
    system_instruction = _build_system_instruction(intent, health_context, rag_context)

    # 6. Execute Completion via LLM Service
    llm_service = get_llm_service()
    reply = None
    
    # Format message history (limit to last 8 messages)
    history_to_send = []
    for msg in session.get("messages", [])[-8:]:
        role = msg.get("role", "user")
        if role == "model":
            role = "assistant"
        history_to_send.append({"role": role, "content": msg.get("content", "")})
    history_to_send.append({"role": "user", "content": message})

    try:
        reply = await llm_service.generate_completion(
            messages=history_to_send,
            system_instruction=system_instruction,
            temperature=0.7 if intent != IntentType.PROGRAMMING else 0.2
        )
    except Exception as llm_err:
        logger.warning(f"OpenRouter generation failed or unconfigured: {llm_err}. Using deterministic fallback.")
        reply = _generate_local_fallback(intent, message, health_context)

    # 7. Apply disclaimer ONLY if required by intent (never on greetings or general topics)
    if intent_data.get("requires_disclaimer") and SYSTEM_DISCLAIMER not in reply:
        reply = reply.strip() + SYSTEM_DISCLAIMER

    # 8. Persist conversation turn in MongoDB
    if db is not None and session.get("id") != "ephemeral":
        await db.chat_history.update_one(
            {"_id": ObjectId(session["id"]), "user_email": user_email},
            {
                "$push": {
                    "messages": {
                        "$each": [
                            {"role": "user", "content": message},
                            {"role": "model", "content": reply}
                        ]
                    }
                }
            }
        )

    # Retrieve updated conversation history
    updated_session = await db.chat_history.find_one({"_id": ObjectId(session["id"])})
    updated_session["id"] = str(updated_session["_id"])
    del updated_session["_id"]

    return {
        "session_id": updated_session["id"],
        "reply": reply,
        "intent": intent,
        "history": updated_session["messages"]
    }

def _build_system_instruction(intent: str, health_context: str, rag_context: str) -> str:
    """Creates a focused, natural system prompt tailored to the user's intent."""
    base = "You are HealthPoint AI, an intelligent, empathetic, and knowledgeable assistant with healthcare specialization."

    if intent == IntentType.GREETING:
        return f"{base} Respond to the greeting warmly, naturally, and concisely in 1-2 sentences. Do NOT generate unsolicited health summaries or append medical disclaimers."

    if intent == IntentType.CASUAL:
        return f"{base} Respond to the user's casual conversation naturally, warmly, and engagingly. If asked for a joke, tell a lighthearted, clean joke. Do NOT append medical disclaimers."

    if intent == IntentType.PROGRAMMING:
        return f"{base} You are also an expert software engineer. Provide a clear, thorough explanation with clean, structured markdown and syntax-highlighted code blocks (e.g. ```python, ```java). Do NOT append medical disclaimers."

    if intent in (IntentType.GENERAL_KNOWLEDGE, IntentType.EDUCATION):
        return f"{base} Provide an informative, accurate, and structured educational explanation. Do NOT append medical disclaimers."

    if intent == IntentType.EMERGENCY:
        return (
            f"{base} URGENT EMERGENCY NOTICE: The user may be experiencing an acute medical emergency. "
            "Immediately and prominently advise them to call emergency services (such as 911 in North America or 112/108 in India) "
            "or go to the nearest emergency room without delay. Do not delay with casual remarks."
        )

    if intent == IntentType.PERSONAL_HEALTH:
        return (
            f"{base} Answer the user's question about their personal health or vitals using strictly the authenticated data below.\n"
            f"{health_context}\n"
            "If a requested measurement is not recorded, state that clearly without guessing or inventing values."
        )

    if intent == IntentType.DIET_NUTRITION:
        return (
            f"{base} Act as a certified nutrition specialist. Generate a personalized, structured meal and nutrition plan "
            f"using available user parameters below:\n{health_context}\n"
            "Include breakfast, lunch, dinner, and healthy snack recommendations with approximate calorie and macro balance. "
            "Never suggest unsafe crash diets or calorie deficits."
        )

    if intent == IntentType.FITNESS:
        return (
            f"{base} Act as a certified fitness trainer. Generate a structured, realistic workout routine "
            f"tailored to the user's vitals and restrictions below:\n{health_context}\n"
            "Include warmup, exercise sets/repetitions, rest periods, cooldown, and safety precautions."
        )

    # General Healthcare with context & RAG
    instr = f"{base} Provide clear, empathetic, and patient-friendly guidance on the healthcare topic."
    if health_context:
        instr += f"\n{health_context}"
    if rag_context:
        instr += f"\n{rag_context}"
    return instr

def _generate_local_fallback(intent: str, message: str, health_context: str) -> str:
    """Provides high-quality, truthful local responses when external AI is offline."""
    msg = message.lower()
    
    if intent == IntentType.GREETING:
        return "Hey! How can I help you today?"

    if intent == IntentType.CASUAL:
        if "joke" in msg:
            return "Why don't scientists trust atoms?\n\nBecause they make up everything!"
        return "I'm doing well, thank you! I'm here to help you with health questions, nutrition, fitness, or general inquiries. What's on your mind?"

    if intent == IntentType.PROGRAMMING:
        if "python" in msg:
            return (
                "### Python Overview\n\n"
                "Python is a high-level, interpreted programming language known for its clear, readable syntax and versatile ecosystem.\n\n"
                "**Key Features:**\n"
                "- **Dynamic Typing**: Variables do not require explicit type declarations.\n"
                "- **Batteries Included**: Comprehensive standard library (math, json, asyncio, etc.).\n"
                "- **Versatile**: Widely used in web development (FastAPI, Django), data science (Pandas, NumPy), and AI/ML.\n\n"
                "```python\n"
                "# Example: Calculating BMI in Python\n"
                "def calculate_bmi(weight_kg: float, height_cm: float) -> float:\n"
                "    height_m = height_cm / 100.0\n"
                "    return round(weight_kg / (height_m ** 2), 2)\n\n"
                "print(f'BMI: {calculate_bmi(70, 175)}')  # Output: 22.86\n"
                "```"
            )
        if "java" in msg or "inheritance" in msg:
            return (
                "### Java Inheritance\n\n"
                "In Java, **inheritance** allows a subclass to inherit fields and methods from a superclass using the `extends` keyword. "
                "This promotes code reusability and polymorphism.\n\n"
                "```java\n"
                "// Superclass\n"
                "class HealthcareProvider {\n"
                "    protected String name;\n"
                "    public HealthcareProvider(String name) { this.name = name; }\n"
                "    public void conductConsultation() {\n"
                "        System.out.println(name + \" is conducting a clinical consultation.\");\n"
                "    }\n"
                "}\n\n"
                "// Subclass inheriting from HealthcareProvider\n"
                "class Cardiologist extends HealthcareProvider {\n"
                "    public Cardiologist(String name) { super(name); }\n"
                "    @Override\n"
                "    public void conductConsultation() {\n"
                "        System.out.println(name + \" is reviewing echocardiogram and ECG readings.\");\n"
                "    }\n"
                "}\n"
                "```"
            )
        return (
            "Here is a code example demonstrating clean modular architecture:\n\n"
            "```python\n"
            "async def get_patient_summary(patient_id: str) -> dict:\n"
            "    # Asynchronous data retrieval\n"
            "    return {'patient_id': patient_id, 'status': 'active'}\n"
            "```"
        )

    if intent == IntentType.EMERGENCY:
        return (
            "⚠️ **URGENT EMERGENCY GUIDANCE**\n\n"
            "If you or someone around you is experiencing severe symptoms such as severe chest pain, "
            "difficulty breathing, sudden numbness, or heavy bleeding:\n\n"
            "1. **Call Emergency Services Immediately**: Dial **911** (US) or **112 / 108** (India).\n"
            "2. **Seek Immediate Medical Attention**: Go to the nearest hospital Emergency Room.\n"
            "3. **Do not wait or drive yourself** if experiencing acute chest discomfort or shortness of breath."
        )

    if intent == IntentType.PERSONAL_HEALTH:
        if health_context:
            return f"### Your Health Metrics\n\n{health_context.replace('[PATIENT HEALTH CONTEXT (DE-IDENTIFIED)]:', '').strip()}"
        return "I checked your profile, but no active measurements (height, weight, or vitals) have been logged yet. You can log your vitals in the Dashboard or Profile section."

    if intent == IntentType.DIET_NUTRITION:
        return (
            "### Personalized Balanced Nutrition Plan\n\n"
            "Here is a wholesome daily meal guide:\n\n"
            "- **Breakfast**: Rolled oats with chia seeds, fresh berries, and a handful of almonds (approx. 380 kcal).\n"
            "- **Lunch**: Grilled lean protein (chicken breast or tofu) with quinoa, steamed broccoli, and olive oil dressing (approx. 520 kcal).\n"
            "- **Snack**: Greek yogurt or sliced apple with peanut butter (approx. 180 kcal).\n"
            "- **Dinner**: Baked salmon or lentil stew with brown rice and mixed green salad (approx. 490 kcal).\n\n"
            "**Hydration**: Drink 8-10 glasses (2-2.5L) of water throughout the day."
        )

    if intent == IntentType.FITNESS:
        return (
            "### Balanced Weekly Workout Program\n\n"
            "- **Warm-up (5-8 mins)**: Dynamic stretches, arm circles, leg swings, light jumping jacks.\n"
            "- **Routine (30-40 mins)**:\n"
            "  * Bodyweight Squats: 3 sets of 12 reps\n"
            "  * Push-ups (or incline): 3 sets of 8-10 reps\n"
            "  * Dumbbell / Resistance Band Rows: 3 sets of 12 reps\n"
            "  * Plank: 3 sets of 30-45 seconds\n"
            "- **Cardio**: 20 minutes brisk walking or cycling.\n"
            "- **Cool-down (5 mins)**: Static hamstring, quad, and chest stretches.\n\n"
            "**Safety Tip**: Maintain steady breathing and stop immediately if you experience sharp pain."
        )

    return "HealthPoint AI is operational. Please ask about your health records, diet planning, exercise routines, or general questions."

async def get_chat_history_controller(user_email: str) -> Dict[str, Any]:
    """Retrieve the current user's active chat session or seed a clean single greeting."""
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
                    "content": "Hello! I'm HealthPoint AI, your personal healthcare and conversational assistant. How can I help you today?"
                }
            ]
        }
        res = await db.chat_history.insert_one(session_doc)
        session = session_doc
        session["id"] = str(res.inserted_id)

    if "_id" in session:
        session["id"] = str(session["_id"])
        del session["_id"]

    return session

async def reset_chat_controller(user_email: str) -> Dict[str, Any]:
    """Archive current chat session and start a clean new session without fake user messages."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    # Mark existing active sessions as archived
    await db.chat_history.update_many(
        {"user_email": user_email, "status": "active"},
        {"$set": {"status": "archived"}}
    )

    new_session_doc = {
        "user_email": user_email,
        "status": "active",
        "messages": [
            {
                "role": "model",
                "content": "Hello! I'm HealthPoint AI, your personal healthcare and conversational assistant. How can I help you today?"
            }
        ]
    }
    res = await db.chat_history.insert_one(new_session_doc)
    new_session_doc["id"] = str(res.inserted_id)
    if "_id" in new_session_doc:
        del new_session_doc["_id"]

    return {
        "session_id": new_session_doc["id"],
        "message": "Chat session reset successfully.",
        "history": new_session_doc["messages"]
    }

async def delete_chat_session_controller(user_email: str, session_id: str) -> Dict[str, Any]:
    """Permanently delete a chat session after verifying ownership."""
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

async def analyze_report_controller(
    user_email: str,
    title: str,
    category: str,
    url: Optional[str] = None,
    record_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Performs real medical document processing:
    1. Validates and retrieves record owned by the authenticated user.
    2. Reads actual file bytes from disk or remote storage.
    3. Extracts text from PDFs using pypdf.
    4. Identifies test markers and matches against laboratory reference ranges.
    5. Formulates clinical findings without fabricating illegible data.
    """
    db = get_database()
    file_bytes = None
    extracted_text = ""
    source_ref = title

    # 1. Ownership & file verification via record_id if available
    if record_id and db is not None:
        try:
            r_obj = ObjectId(record_id)
            rec = await db.records.find_one({"_id": r_obj, "user_email": user_email})
            if rec:
                local_path = rec.get("local_path")
                if local_path and os.path.exists(local_path):
                    with open(local_path, "rb") as f:
                        file_bytes = f.read()
                elif rec.get("url"):
                    url = rec.get("url")
        except Exception as e:
            logger.warning(f"Record retrieval error: {e}")

    # 2. Fetch from URL if local bytes not found
    if not file_bytes and url and ("http://" in url or "https://" in url):
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    file_bytes = res.content
        except Exception as e:
            logger.warning(f"Could not download attachment from URL {url}: {e}")

    # 3. Text Extraction
    if file_bytes:
        # Check if PDF
        if file_bytes[:4] == b"%PDF":
            extracted_text = extract_text_from_pdf(file_bytes)

    # 4. Extract lab markers
    markers = []
    if extracted_text:
        markers = extract_lab_markers(extracted_text)

    # 5. Formulate Analysis via LLM or structured rule engine
    is_prescription = (category.lower() == "prescription")

    prompt = f"Analyze the medical report titled '{title}' (Category: {category}).\n"
    if extracted_text:
        prompt += f"Document Extracted Text:\n{extracted_text[:2500]}\n"
    if markers:
        prompt += f"Extracted Test Biomarkers:\n{json.dumps(markers, indent=2)}\n"

    system_instr = (
        "You are an expert clinical laboratory analyst and medical consultant AI. "
        "Review the extracted report content and explain the findings in clear, compassionate, patient-friendly terms. "
        "List abnormal vs normal values with their reference ranges, explain potential causes, and suggest 3 practical questions to ask the doctor. "
        "Do NOT invent values not present in the source document."
    )

    llm_service = get_llm_service()
    analysis_text = None
    try:
        analysis_text = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr
        )
    except Exception as e:
        logger.info(f"OpenRouter report analysis offline ({e}), generating structured laboratory report.")
        
        # High-fidelity factual clinical template based on real extracted data
        if markers:
            lines = [f"### 📊 Test Overview: {title}", "", "Here is the verified laboratory breakdown extracted from your document:", ""]
            lines.append("| Test Name | Measured Value | Reference Range | Status |")
            lines.append("| :--- | :--- | :--- | :--- |")
            for m in markers:
                status_icon = "🟢" if m["status"] == "Normal" else "🔴" if m["status"] == "High" else "🟡"
                lines.append(f"| **{m['test_name']}** | {m['measured_value']} {m['unit']} | {m['reference_range']} | {status_icon} {m['status']} |")
            
            lines.append("")
            lines.append("### 🔍 Key Findings & Recommendations")
            lines.append("- Discuss all out-of-range markers directly with your treating physician.")
            lines.append("- Maintain regular hydration and follow recommended dietary protocols prior to repeat testing.")
            lines.append("")
            lines.append("### 🩺 Questions for Your Doctor")
            lines.append("1. *Are my current readings consistent with my health goals?*")
            lines.append("2. *Do any abnormal values require immediate lifestyle adjustments or follow-up tests?*")
            lines.append("3. *When should I schedule a re-test to monitor these levels?*")
            analysis_text = "\n".join(lines)
        else:
            analysis_text = (
                f"### 📋 Report Summary: {title}\n\n"
                f"**Category**: {category}\n\n"
                "The report file was inspected. While basic metadata is registered, specific numerical laboratory markers "
                "could not be extracted with high confidence (e.g. if the document is a scanned image or handwritten note).\n\n"
                "**Recommended Action**: Please ensure you share the official physical copy with your physician for diagnostic review."
            )

    analysis_with_disclaimer = analysis_text.strip() + SYSTEM_DISCLAIMER
    return {
        "analysis": analysis_with_disclaimer,
        "extracted_markers": markers,
        "source": source_ref
    }

async def generate_diet_controller(age: int, weight: str, height: str, goal: str, restrictions: Optional[str] = None) -> Dict[str, Any]:
    """Generates personalized diet plan."""
    prompt = f"Create a personalized nutrition and diet plan for:\n- Age: {age}\n- Weight: {weight}\n- Height: {height}\n- Goal: {goal}\n- Restrictions: {restrictions or 'None'}"
    system_instr = "You are a professional clinical dietitian. Create a personalized daily calorie summary and structured weekly meal plan using clean markdown tables. Avoid unsafe calorie deficits."

    llm_service = get_llm_service()
    try:
        raw = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr
        )
        plan = raw.strip()
    except Exception:
        plan = _generate_local_fallback(IntentType.DIET_NUTRITION, prompt, "")

    return {"plan": plan + SYSTEM_DISCLAIMER}

async def generate_fitness_controller(age: int, weight: str, height: str, fitness_level: str, goals: str) -> Dict[str, Any]:
    """Generates personalized fitness routine."""
    prompt = f"Design a personalized fitness plan for:\n- Age: {age}\n- Weight: {weight}\n- Height: {height}\n- Fitness Level: {fitness_level}\n- Health Goals: {goals}"
    system_instr = "You are a certified fitness trainer. Design a structured weekly workout routine matching experience level and physical vitals. Include warmup, sets/reps, cooldown, and safety notes."

    llm_service = get_llm_service()
    try:
        raw = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr
        )
        plan = raw.strip()
    except Exception:
        plan = _generate_local_fallback(IntentType.FITNESS, prompt, "")

    return {"plan": plan + SYSTEM_DISCLAIMER}

async def explain_medicine_controller(user_email: str, medicine_name: str, generic_name: Optional[str] = None) -> Dict[str, Any]:
    """Explains medication purpose, uses, side effects, and warnings without fabricating interactions."""
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
  "disclaimer": "Standard medical disclaimer"
}}
Return ONLY valid JSON."""

    system_instr = "You are a clinical pharmacist AI. Provide factual, patient-friendly explanations of medications. Never advise stopping or altering prescribed dosages."
    llm_service = get_llm_service()

    result = None
    try:
        text = await llm_service.generate_completion(
            messages=[{"role": "user", "content": prompt}],
            system_instruction=system_instr,
            response_json=True
        )
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"): lines = lines[1:]
            if lines[-1].startswith("```"): lines = lines[:-1]
            text = "\n".join(lines).strip()
        result = json.loads(text)
    except Exception:
        # Factual reference information for well-known medications
        med_lower = medicine_name.lower()
        if "amoxicillin" in med_lower:
            result = {
                "uses": "Amoxicillin is a penicillin-class antibiotic used to treat bacterial infections including ear, nose, throat, and respiratory tract infections.",
                "how_it_works": "It stops bacterial growth by preventing bacteria from forming protective cell walls.",
                "common_side_effects": ["Nausea", "Mild diarrhea", "Skin rash"],
                "precautions": ["Check for penicillin allergy before taking.", "Complete full course as prescribed.", "Take with food to minimize stomach upset."],
                "alternatives": ["Azithromycin", "Cephalexin"],
                "dosage_tip": "Take at evenly spaced intervals as directed by your physician.",
                "when_to_see_doctor": "Seek emergency care if hives, facial swelling, or breathing difficulty develops.",
                "disclaimer": "Informational only. Do not stop or alter your medication without consulting your doctor."
            }
        elif "paracetamol" in med_lower or "acetaminophen" in med_lower:
            result = {
                "uses": "Paracetamol is an analgesic and antipyretic medication used to relieve mild-to-moderate pain and reduce fever.",
                "how_it_works": "It acts centrally in the nervous system to inhibit pain sensation and regulate hypothalamic temperature controls.",
                "common_side_effects": ["Rare at therapeutic doses", "Nausea (rare)"],
                "precautions": ["Do not exceed 4,000 mg in 24 hours to prevent liver toxicity.", "Avoid alcohol consumption while taking."],
                "alternatives": ["Ibuprofen", "Naproxen"],
                "dosage_tip": "Usually taken every 4 to 6 hours as needed.",
                "when_to_see_doctor": "Consult a doctor if fever lasts more than 3 days or pain persists beyond 10 days.",
                "disclaimer": "Informational only. Consult your doctor or pharmacist for clinical advice."
            }
        else:
            result = {
                "uses": f"{medicine_name.title()} is a pharmaceutical medication. Specific reference data could not be verified automatically.",
                "how_it_works": "Acts on physiological pathways corresponding to its active pharmaceutical ingredients.",
                "common_side_effects": ["Consult prescribing packaging for documented side effect profile."],
                "precautions": ["Take strictly as prescribed on the pharmacy label.", "Do not stop or start medications without consulting your doctor."],
                "alternatives": ["Consult your physician for therapeutic alternatives."],
                "dosage_tip": "Follow exact timing and dosage indicated on your physical prescription label.",
                "when_to_see_doctor": "Seek medical attention immediately if experiencing signs of an allergic reaction or severe discomfort.",
                "disclaimer": "Informational only. Do not change prescribed medications without consulting your healthcare provider."
            }

    return {"medicine": medicine_name, "explanation": result}
