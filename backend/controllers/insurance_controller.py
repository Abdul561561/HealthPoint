import os
import json
import datetime
from fastapi import HTTPException, status
from bson import ObjectId
from backend.database.mongodb import get_database
from backend.models.insurance import ClaimCreate, FavoriteHospitalRequest
from backend.controllers.gemini_helper import call_gemini, call_gemini_chat

SYSTEM_DISCLAIMER = "\n\n> *Disclaimer: I am your AI Insurance Assistant. This guidance is for educational and informational purposes to help you navigate your healthcare policy. Always refer to your official policy handbook and consult with our billing desk or your insurance representative for official authorization.*"

async def call_gemini_with_fallback(system_instruction: str, prompt: str) -> str:
    """Invokes Gemini using the shared helper with automatic model fallback."""
    try:
        return await call_gemini(system_instruction, prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service unavailable: {e}")

# --- CLAIMS SYSTEM ---

async def get_claims_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    cursor = db.claimRequests.find({"user_email": user_email})
    claims = []
    async for c in cursor:
        c["id"] = str(c["_id"])
        del c["_id"]
        claims.append(c)
    return claims

async def create_claim_controller(user_email: str, claim_data: ClaimCreate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    uploaded_docs = [doc.dict() for doc in claim_data.uploaded_documents] if claim_data.uploaded_documents else []
    
    claim_doc = {
        "user_email": user_email,
        "date": claim_data.date,
        "amount": claim_data.amount,
        "description": claim_data.description,
        "status": "Submitted",
        "uploaded_documents": uploaded_docs,
        "ai_analysis": None,
        "timeline": [
            {
                "status": "Submitted",
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "note": "Claim submitted successfully. Awaiting document verification."
            }
        ]
    }
    
    result = await db.claimRequests.insert_one(claim_doc)
    claim_doc["id"] = str(result.inserted_id)
    del claim_doc["_id"]
    return claim_doc

async def analyze_claim_controller(user_email: str, claim_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    try:
        obj_id = ObjectId(claim_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid claim ID format")
        
    claim = await db.claimRequests.find_one({"_id": obj_id, "user_email": user_email})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
        
    user = await db.users.find_one({"email": user_email})
    user_name = user.get("name", "User") if user else "User"
    
    docs_list = claim.get("uploaded_documents", [])
    filenames = [d["file_name"] for d in docs_list]
    
    # AI Prompt to verify documents
    system_instruction = (
        "You are an insurance claims auditor AI. Your job is to audit uploaded claims files, "
        "verify that the patient name matches the policyholder's name, extract billing amounts, "
        "and determine if all required documents are present based on the claim type."
    )
    
    prompt = f"""
    Policyholder (User Name): {user_name}
    Claim Description: {claim.get('description')}
    Claim Amount: ₹{claim.get('amount')}
    Uploaded Files: {json.dumps(filenames)}
    
    Analyze the uploaded files. For audit simulation:
    - If the user's name is in any filename, or if files look like valid medical bills (e.g. prescription, pharmacy, report, discharge), perform checking.
    - Check for missing files:
      - Hospitalization / Surgery claims require: "Discharge Summary", "Hospital Bill", and "Doctor Prescription".
      - OPD / Consultation / Medicine claims require: "Doctor Prescription" and "Pharmacy Bill".
    - Check name mismatch: Look at the user's name "{user_name}". If filenames imply a different person, flag a mismatch.
    - Generate a JSON checklist showing which requirements are present and which are missing.
    
    Return ONLY a JSON response in this exact format:
    {{
      "verification_status": "Passed" (or "Action Required"),
      "detected_name": "Name from files",
      "name_mismatch": false (or true),
      "detected_amount": float_value,
      "missing_documents": ["document 1", "document 2"],
      "checklist": [
         {{"item": "Doctor Prescription", "present": true}},
         {{"item": "Hospital Bill", "present": false}}
      ],
      "status_update": "Documents Verified" (or "Action Required"),
      "reason": "Clear explanation of audit results (2 sentences)"
    }}
    Do not wrap in markdown or add notes outside the JSON.
    """
    
    try:
        raw_reply = await call_gemini_with_fallback(system_instruction, prompt)
        text = raw_reply.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        
        analysis_result = json.loads(text)
        
        # Update claim requests with audit result
        status_update = analysis_result.get("status_update", "Submitted")
        
        new_event = {
            "status": status_update,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "note": analysis_result.get("reason", "AI Document verification completed.")
        }
        
        # Update DB document
        await db.claimRequests.update_one(
            {"_id": obj_id},
            {
                "$set": {
                    "status": status_update,
                    "ai_analysis": analysis_result
                },
                "$push": {
                    "timeline": new_event
                }
            }
        )
        
        updated_claim = await db.claimRequests.find_one({"_id": obj_id})
        updated_claim["id"] = str(updated_claim["_id"])
        del updated_claim["_id"]
        return updated_claim
        
    except Exception as e:
        print(f"Claim analysis controller failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to audit claim: {str(e)}")

# --- PLANS EXPLORER ---

async def get_plans_controller(demographic: str = None, budget_max: float = None, cashless: bool = None):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    query = {}
    if demographic and demographic.lower() != "all":
        query["type"] = demographic.lower()
    if cashless is not None:
        query["cashless_support"] = cashless
        
    cursor = db.insurancePlans.find(query)
    plans = []
    async for p in cursor:
        p["id"] = str(p["_id"])
        del p["_id"]
        
        # Handle budget range filtering manually
        if budget_max is not None:
            try:
                # Range is typically like "800 - 1200", extract first part
                low_premium = float(p["premium_range"].split("-")[0].strip())
                if low_premium > budget_max:
                    continue
            except Exception:
                pass
                
        plans.append(p)
    return plans

async def save_plan_controller(user_email: str, plan_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    # Verify plan exists
    try:
        obj_id = ObjectId(plan_id)
        plan = await db.insurancePlans.find_one({"_id": obj_id})
    except Exception:
        # Fallback to string id match if stored as string
        plan = await db.insurancePlans.find_one({"id": plan_id})
        
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Check if already saved
    existing = await db.savedPlans.find_one({"user_email": user_email, "plan_id": plan_id})
    if not existing:
        await db.savedPlans.insert_one({
            "user_email": user_email,
            "plan_id": plan_id,
            "saved_at": datetime.datetime.utcnow().isoformat() + "Z"
        })
    return {"success": True, "message": "Plan saved to dashboard"}

async def unsave_plan_controller(user_email: str, plan_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    await db.savedPlans.delete_one({"user_email": user_email, "plan_id": plan_id})
    return {"success": True, "message": "Plan unsaved"}

async def get_saved_plans_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    cursor = db.savedPlans.find({"user_email": user_email})
    saved_list = []
    async for s in cursor:
        pid = s["plan_id"]
        # Fetch actual plan details
        try:
            plan = await db.insurancePlans.find_one({"_id": ObjectId(pid)})
        except Exception:
            plan = await db.insurancePlans.find_one({"id": pid})
            
        if plan:
            plan["id"] = str(plan["_id"])
            del plan["_id"]
            saved_list.append(plan)
    return saved_list

# --- FAVORITE HOSPITALS ---

async def toggle_favorite_hospital_controller(user_email: str, hosp: FavoriteHospitalRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    existing = await db.favoriteHospitals.find_one({"user_email": user_email, "hospital_id": hosp.hospital_id})
    if existing:
        await db.favoriteHospitals.delete_one({"user_email": user_email, "hospital_id": hosp.hospital_id})
        return {"favorited": False, "message": "Removed from favorites"}
    else:
        await db.favoriteHospitals.insert_one({
            "user_email": user_email,
            "hospital_id": hosp.hospital_id,
            "name": hosp.name,
            "address": hosp.address,
            "rating": hosp.rating,
            "distance": hosp.distance,
            "phone": hosp.phone,
            "ambulancePhone": hosp.ambulancePhone,
            "latitude": hosp.latitude,
            "longitude": hosp.longitude,
            "saved_at": datetime.datetime.utcnow().isoformat() + "Z"
        })
        return {"favorited": True, "message": "Added to favorites"}

async def get_favorite_hospitals_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    cursor = db.favoriteHospitals.find({"user_email": user_email})
    favs = []
    async for f in cursor:
        f["id"] = str(f["_id"])
        del f["_id"]
        favs.append(f)
    return favs

# --- AI CHATBOT ASSISTANT ---

async def chat_insurance_assistant_controller(user_email: str, message: str, session_id: str = None):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    user = await db.users.find_one({"email": user_email})
    user_name = user.get("name", "Member") if user else "Member"
    user_age = user.get("age", 30) if user else 30
    
    # Retrieve user claims
    claims_cursor = db.claimRequests.find({"user_email": user_email})
    claims_list = []
    async for c in claims_cursor:
        claims_list.append({
            "description": c.get("description"),
            "amount": c.get("amount"),
            "status": c.get("status")
        })
        
    # Retrieve seeded plans
    plans_cursor = db.insurancePlans.find({})
    plans_list = []
    async for p in plans_cursor:
        plans_list.append({
            "name": p.get("name"),
            "provider": p.get("provider"),
            "type": p.get("type"),
            "coverage_amount": p.get("coverage_amount"),
            "premium_range": p.get("premium_range"),
            "benefits": p.get("benefits"),
            "exclusions": p.get("exclusions")
        })
        
    system_instruction = f"""
    You are the AI Insurance Assistant for our premium healthcare SaaS. 
    Your name is InsureAI. 
    You help users navigate healthcare finance, explain policies simply, outline exclusions, co-pays, deductibles, waiting periods, and guide claim processes.
    
    Member Profile:
    - Name: {user_name}
    - Age: {user_age}
    
    Curated Insurance Policies Database:
    {json.dumps(plans_list, indent=2)}
    
    Member's Claim Requests:
    {json.dumps(claims_list, indent=2)}
    
    YOUR PERSONALITY & TONE:
    - Be empathetic, smart, clear, and reassuring.
    - Speak in patient-friendly terms. Translate dry legal/insurance jargon into plain English.
    - Reference specific plans from the database above when recommending coverage (e.g. recommend the Maternity plan if pregnancy is mentioned, or Senior Care for users aged 60+).
    - Give actionable advice before filing claims (e.g. keep receipts, get doctor prescriptions).
    - Never construct imaginary companies or pretend to link directly to actual provider servers. Refer strictly to our database of 5 curated policies.
    """
    
    # Handle session history retrieval
    session_query = {}
    if session_id:
        try:
            session_query["_id"] = ObjectId(session_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid session ID format")
    else:
        session_query["user_email"] = user_email
        session_query["status"] = "active"
        
    session = await db.aiInsuranceChats.find_one(session_query)
    
    if not session:
        session_doc = {
            "user_email": user_email,
            "status": "active",
            "messages": [
                {
                    "role": "model",
                    "content": f"Hi {user_name}! I'm InsureAI, your insurance guide. Ask me about deductibles, check a claim, or find plans."
                }
            ]
        }
        res = await db.aiInsuranceChats.insert_one(session_doc)
        session = session_doc
        session["id"] = str(res.inserted_id)
    else:
        session["id"] = str(session["_id"])
        del session["_id"]
        
    # Append user message
    await db.aiInsuranceChats.update_one(
        {"_id": ObjectId(session["id"])},
        {"$push": {"messages": {"role": "user", "content": message}}}
    )
    
    # Format message history
    history_prompt = ""
    for msg in session["messages"][-6:]: # last 6 messages
        history_prompt += f"{msg['role'].upper()}: {msg['content']}\n"
    history_prompt += f"USER: {message}\nMODEL:"
    
    reply_text = await call_gemini_with_fallback(system_instruction, history_prompt)
    reply_with_disclaimer = reply_text.strip() + SYSTEM_DISCLAIMER
    
    # Append model reply
    await db.aiInsuranceChats.update_one(
        {"_id": ObjectId(session["id"])},
        {"$push": {"messages": {"role": "model", "content": reply_with_disclaimer}}}
    )
    
    return {
        "reply": reply_with_disclaimer,
        "session_id": session["id"]
    }
