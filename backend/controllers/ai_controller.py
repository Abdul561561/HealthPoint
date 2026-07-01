import os
from fastapi import HTTPException, status
from bson import ObjectId
from database.mongodb import get_database
from controllers.gemini_helper import call_gemini, call_gemini_chat

SYSTEM_DISCLAIMER = "\n\n> *Disclaimer: HealthPoint AI provides personalized health insights for educational purposes and does not replace professional medical advice, diagnosis, or treatment. Always consult a qualified doctor or healthcare professional for clinical decisions.*"

async def chat_ai_controller(user_email: str, message: str, session_id: str = None):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    # Retrieve user info, metrics, and records to build context for Gemini
    user = await db.users.find_one({"email": user_email})
    metrics = await db.metrics.find_one({"user_email": user_email})
    
    records = []
    try:
        cursor = db.records.find({"user_email": user_email})
        async for r in cursor:
            records.append(r)
    except Exception as e:
        print(f"Error fetching records: {e}")

    # Fetch appointments
    appointments = []
    try:
        appt_cursor = db.appointments.find({"user_email": user_email})
        async for appt in appt_cursor:
            appointments.append(appt)
    except Exception as e:
        print(f"Error fetching appointments: {e}")

    # Fetch workouts
    workouts = []
    try:
        w_cursor = db.workouts.find({"user_email": user_email})
        async for w in w_cursor:
            workouts.append(w)
    except Exception as e:
        print(f"Error fetching workouts: {e}")

    # Fetch pharmacy orders
    orders = []
    try:
        ord_cursor = db.orders.find({"user_email": user_email})
        async for o in ord_cursor:
            orders.append(o)
    except Exception as e:
        print(f"Error fetching orders: {e}")

    # Fetch meals
    meals = []
    try:
        meals_cursor = db.meals.find({"user_email": user_email})
        async for m in meals_cursor:
            meals.append(m)
    except Exception as e:
        print(f"Error fetching meals: {e}")

    # Fetch claims
    claims = []
    try:
        claims_cursor = db.claimRequests.find({"user_email": user_email})
        async for c in claims_cursor:
            claims.append(c)
    except Exception as e:
        print(f"Error fetching claims: {e}")

    # Fetch saved plans count
    saved_plans_count = 0
    try:
        saved_plans_count = await db.savedPlans.count_documents({"user_email": user_email})
    except Exception as e:
        print(f"Error counting saved plans: {e}")

    # Fetch favorite cashless hospitals count
    fav_hospitals_count = 0
    try:
        fav_hospitals_count = await db.favoriteHospitals.count_documents({"user_email": user_email})
    except Exception as e:
        print(f"Error counting favorite hospitals: {e}")

    # Compute Scikit-Learn risk predictions for AI context
    risk_summary = ""
    try:
        from controllers.analytics_controller import HealthClassifierManager
        import numpy as np
        ml_manager = HealthClassifierManager.get_instance()
        age = user.get("age", 28) if user else 28
        hr = metrics.get("heartRate", {}).get("current", 72) if metrics else 72
        bp_sys = metrics.get("bloodPressure", {}).get("systolic", 120) if metrics else 120
        bmi_val = metrics.get("bmi", {}).get("value", 22.8) if metrics else 22.8
        sleep_hrs = metrics.get("sleep", {}).get("hours", 7.5) if metrics else 7.5
        steps = metrics.get("steps", {}).get("count", 8420) if metrics else 8420
        cal_intake = metrics.get("calories", {}).get("intake", 2100) if metrics else 2100

        cardio_prob = float(ml_manager.cardio_model.predict_proba(np.array([[age, hr, bp_sys, bmi_val]]))[0][1] * 100)
        diab_prob = float(ml_manager.diabetes_model.predict_proba(np.array([[age, bmi_val, cal_intake, steps]]))[0][1] * 100)
        fatigue_prob = float(ml_manager.fatigue_model.predict_proba(np.array([[age, sleep_hrs, hr, bmi_val]]))[0][1] * 100)
        
        risk_summary = f"Scikit-Learn Classifier Risk Estimates:\n- Cardiovascular Health Risk: {cardio_prob:.1f}%\n- Type 2 Diabetes Risk: {diab_prob:.1f}%\n- Sleep Apnea & Chronic Fatigue Risk: {fatigue_prob:.1f}%\n"
    except Exception as e:
        print(f"Error computing risk estimates: {e}")
        
    # Format a concise but descriptive patient profile
    patient_info = f"Email: {user_email}\n"
    if user:
        patient_info += (
            f"Name: {user.get('name')}\n"
            f"Age: {user.get('age')}\n"
            f"Gender: {user.get('gender')}\n"
            f"Height: {user.get('height')} cm\n"
            f"Weight: {user.get('weight')} kg\n"
            f"Blood Group: {user.get('bloodGroup')}\n"
            f"Allergies: {user.get('allergies', 'None reported')}\n"
            f"Medical Conditions: {user.get('medicalConditions', 'None reported')}\n"
            f"Emergency Contact: {user.get('emergencyContactName', 'N/A')} ({user.get('emergencyContactPhone', 'N/A')})\n"
        )
    if metrics:
        bmi_val = metrics.get('bmi', {}).get('value')
        bmi_cat = metrics.get('bmi', {}).get('category')
        patient_info += f"Current BMI: {bmi_val} ({bmi_cat})\n"
        patient_info += f"Target Calories: {metrics.get('calories', {}).get('target')} kcal/day\n"
        patient_info += f"Target Daily Steps: {metrics.get('steps', {}).get('target')} steps\n"
        patient_info += f"Target Water Intake: {metrics.get('water', {}).get('target')} glasses/day\n"
        patient_info += f"Vitals: Heart Rate {metrics.get('heartRate', {}).get('current')} bpm, Blood Pressure {metrics.get('bloodPressure', {}).get('systolic')}/{metrics.get('bloodPressure', {}).get('diastolic')} mmHg\n"
        patient_info += f"Sleep History: {metrics.get('sleep', {}).get('hours')} hours (Quality: {metrics.get('sleep', {}).get('quality')})\n"
        patient_info += f"Water Intake: {metrics.get('water', {}).get('intake')} glasses\n"
        patient_info += f"Steps Today: {metrics.get('steps', {}).get('count')} steps\n"
        patient_info += f"Calories Intake Today: {metrics.get('calories', {}).get('intake')} kcal\n"
        patient_info += f"Oxygen Level: {metrics.get('oxygen', {}).get('level')}%\n"
        patient_info += f"Temperature: {metrics.get('temperature', {}).get('value')} °F\n"
        
    if meals:
        patient_info += "\nLogged Meals Today:\n"
        for m in meals[:5]:
            patient_info += f"- Meal: {m.get('name')} | Type: {m.get('type')} | Calories: {m.get('calories')} kcal | P/C/F: {m.get('protein')}g/{m.get('carbs')}g/{m.get('fat')}g\n"
            
    if records:
        patient_info += "\nUploaded Medical Records & Reports:\n"
        for idx, rec in enumerate(records, 1):
            patient_info += f"{idx}. Title: {rec.get('title')} | Category: {rec.get('category')} | Type: {rec.get('type')} | Date: {rec.get('date')} | Hospital/Doctor: {rec.get('hospital')} / {rec.get('doctor')} | Status: {rec.get('status')}\n"
    else:
        patient_info += "\nUploaded Medical Records: None uploaded yet.\n"

    if risk_summary:
        patient_info += f"\n{risk_summary}"
        
    if appointments:
        patient_info += "\nScheduled Appointments:\n"
        for appt in appointments:
            patient_info += f"- Doctor: {appt.get('doctor')} | Specialty: {appt.get('specialty')} | Date: {appt.get('date')} | Time: {appt.get('time')} | Status: {appt.get('status')}\n"
            
    if workouts:
        patient_info += "\nRecent Workout Logs:\n"
        for w in workouts[:5]:
            patient_info += f"- Workout: {w.get('name')} | Type: {w.get('type')} | Duration: {w.get('duration')} min | Calories: {w.get('calories')} kcal | Completed: {w.get('completed')}\n"

    if orders:
        patient_info += "\nPharmacy Purchase Orders History:\n"
        for o in orders[:5]:
            patient_info += f"- Order Date: {o.get('date')} | Total Price: ₹{o.get('totalPrice')} | Status: {o.get('status')} | Items: {', '.join([it.get('name') for it in o.get('items', [])])}\n"

    if claims:
        patient_info += "\nInsurance Claims History:\n"
        for c in claims[:5]:
            patient_info += f"- Claim Date: {c.get('date')} | Amount: ₹{c.get('amount')} | Status: {c.get('status')} | Description: {c.get('description')}\n"

    patient_info += f"\nInsurance Saved Plans Count: {saved_plans_count}\n"
    patient_info += f"Favorite cashless hospitals saved: {fav_hospitals_count}\n"

    # Get or create chat session
    session_query = {}
    if session_id:
        try:
            session_query["_id"] = ObjectId(session_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid session ID format")
    else:
        session_query["user_email"] = user_email
        session_query["status"] = "active"
        
    session = await db.chat_history.find_one(session_query)
    
    if not session:
        # Create a new session
        session_doc = {
            "user_email": user_email,
            "status": "active",
            "messages": [
                {
                    "role": "model",
                    "content": "Hello! I'm HealthPoint AI, your personal digital health companion. How can I help you today?"
                }
            ]
        }
        res = await db.chat_history.insert_one(session_doc)
        session = session_doc
        session["id"] = str(res.inserted_id)
    else:
        session["id"] = str(session["_id"])
        del session["_id"]
        
    # Format message history for Gemini API
    # Gemini history format: list of objects with parts: [str] and role: 'user' | 'model'
    formatted_history = []
    for msg in session["messages"]:
        formatted_history.append({
            "role": msg["role"],
            "parts": [msg["content"]]
        })
        
    # Initialize model with system persona
    system_instr = f"""You are "HealthPoint AI" — an intelligent, empathetic, healthcare-focused digital health companion integrated into the HealthPoint AI-Powered Digital Healthcare Ecosystem.
Your job is NOT to answer questions like ChatGPT. Your job is to provide personalized, structured, easy-to-understand, actionable healthcare guidance using the user's stored healthcare information.

Before answering ANY question, you MUST ALWAYS retrieve and analyze available user data from MongoDB:
{patient_info}

Never ignore available user context. The response must always be highly personalized to the user.

==========================================================
PERSONALITY & TONE
==========================================================
- Speak like a caring healthcare professional. Friendly. Professional. Encouraging. Calm. Positive.
- Never sound robotic, clinical, or cold. Never scare the user.
- Always use simple English. Do NOT overwhelm users with medical terminology.
- Never generate one long boring paragraph. Never give textbook answers. Use headings, bullet points, and tables.

==========================================================
EVERY RESPONSE MUST FOLLOW THIS FORMAT EXACTLY
==========================================================
🩺 Health Summary
Briefly explain what the situation is (1-2 sentences).

------------------------------------------------------

📊 Health Assessment
Show risk level (use exactly one of these labels with its indicator circle):
🟢 Healthy
🟡 Moderate
🟠 Needs Attention
🔴 High Risk
Explain why based on user metrics/data.

------------------------------------------------------

💡 Personalized Recommendations
Give actionable advice tailored to their profile (water intake, diet, exercise, sleep, stress, general medicine tips).

------------------------------------------------------

🥗 Diet Suggestions
Suggest specific meals:
- Breakfast
- Lunch
- Dinner
- Healthy Snacks
- Foods to avoid
Explain WHY each is recommended or why it should be avoided based on their height/weight/BMI/allergies/conditions.

------------------------------------------------------

🏃 Lifestyle Improvements
Recommend exercise, walking, meditation, weight management, or daily habits.

------------------------------------------------------

❤️ HealthPoint Insight
Generate exactly ONE highly personalized observation using the user's MongoDB history.
Example: "Your sleep has reduced over the past week while your blood pressure has increased slightly. Improving your sleep schedule may positively affect your blood pressure."
This section should NEVER be generic.

------------------------------------------------------

Would you like me to:
✅ Generate a meal plan
✅ Create a workout plan
✅ Explain your report
✅ Show nearby doctors
✅ Find nearby pharmacies
✅ Book an appointment
✅ Save this advice

==========================================================
SPECIAL INPUT TOPICS
==========================================================
- UPLOADED LAB REPORT: Explain in simple terms. Highlight normal/abnormal values, possible causes, lifestyle recommendations, and list 3 questions to ask their doctor.
- MEDICINES: Explain purpose, common uses, side effects, precautions, foods to avoid, and general dosage tips. Never prescribe or diagnose.
- DIET / FITNESS: If plans are requested, generate beautiful meal plans or workouts using clean markdown tables.
- INSURANCE: Explain coverage, claims, deductible, co-pay, waiting periods, cashless support, and documents required.
- SYMPTOMS: List possible causes, things to monitor, home care, when to visit a doctor, emergency warnings, and recommend nearby specialists or hospitals.
- MAPS: If nearby services are needed, advise the user to use the HealthPoint nearby finder map tools for pharmacies/doctors/hospitals.
"""
    reply = None
    try:
        print("Attempting Chat AI via gemini_helper...")
        raw_reply = await call_gemini_chat(system_instr, session["messages"], message)
        reply = raw_reply + SYSTEM_DISCLAIMER
        print("Successfully answered Chat AI!")
    except Exception as e:
        print(f"Chat AI failed: {e}")
            
    if reply is None:
        # Fallback if all API keys/models are blocked
        reply = "I apologize, but I am currently having trouble connecting to my cognitive networks. Please try again in a few moments." + SYSTEM_DISCLAIMER
        
    # Save user message and AI reply to database
    await db.chat_history.update_one(
        {"_id": ObjectId(session["id"])},
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
    
    # Retrieve updated messages
    updated_session = await db.chat_history.find_one({"_id": ObjectId(session["id"])})
    updated_session["id"] = str(updated_session["_id"])
    del updated_session["_id"]
    
    return {
        "session_id": updated_session["id"],
        "reply": reply,
        "history": updated_session["messages"]
    }

async def get_chat_history_controller(user_email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    session = await db.chat_history.find_one({"user_email": user_email, "status": "active"})
    if not session:
        # Seed default initial chat
        session_doc = {
            "user_email": user_email,
            "status": "active",
            "messages": [
                {
                    "role": "model",
                    "content": "Hello! I'm HealthAI, your personal health assistant. How can I help you today?"
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

async def analyze_report_controller(title: str, category: str, url: str = None):
    if category.lower() == "prescription":
        system_instr = """You are HealthAI, a premium digital prescription scanner and clinical pharmacist assistant. 
Your goal is to analyze the uploaded prescription details or attachment, extract all medicine names, dosages, and timings, explain the prescription simply in patient-friendly terms, and prompt next steps.

CRITICAL RESPONSE FORMAT:
- Speak in a warm, caring, conversational tone.
- Format the response using clean markdown headings:
  ### 📋 Prescribed Medicines
  * **[Medicine Name]** - Dosage: [Dosage], Timing: [Timing]
  
  ### 💡 Simple Explanation & Instructions
  [Plain English explanation of what this prescription is for and key usage tips]
  
  ### 📍 Next Steps & Nearby Pharmacies
  [Encouraging note to visit the Smart Pharmacy finder on HealthPoint to check stock and availability]
"""
    else:
        system_instr = """You are HealthAI, a premium medical laboratory report analyst. 
Review the lab test details or attachment. Explain what the test measures, why a doctor orders it, what abnormal values signify, and explain medical terms simply.
Use structured formatting with clean headings like:
### 📊 Test Overview
### 🔍 What It Measures
### ⚠️ Clinical Significance
"""
    prompt = f"Please explain the significance of the following medical test/record:\nTitle: {title}\nCategory: {category}"
    if url:
        prompt += f"\nUploaded Report Scan Document URL: {url}"
        
    # Try to fetch report image/document for visual analysis
    img_bytes = None
    img_mime = None
    if url and ("http://" in url or "https://" in url):
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                res = await client.get(url)
                if res.status_code == 200:
                    img_mime = "image/jpeg"
                    if ".png" in url.lower():
                        img_mime = "image/png"
                    elif ".pdf" in url.lower():
                        img_mime = "application/pdf"
                    img_bytes = res.content
        except Exception as e:
            print(f"Error fetching report attachment: {e}")

    try:
        print("Attempting Report Analysis via gemini_helper...")
        raw = await call_gemini(system_instr, prompt, image_bytes=img_bytes, mime_type=img_mime)
        analysis = raw + SYSTEM_DISCLAIMER
        print("Successfully generated Report Analysis!")
    except Exception as e:
        print(f"Report Analysis failed: {e}")
        analysis = f"Analysis of '{title}' is temporarily unavailable, but typically this test checks general indices related to {category}." + SYSTEM_DISCLAIMER
        
    return {"analysis": analysis}

async def generate_diet_controller(age: int, weight: str, height: str, goal: str, restrictions: str = None):
    system_instr = "You are HealthAI, a professional dietitian. Create a personalized daily calorie summary and a weekly structured meal plan based on the user's metrics and target goals. Use clean, short markdown tables. CRITICAL: Keep your response extremely short, simple, concise, and structured."
    prompt = f"Create a personalized diet plan for a user with these stats:\n- Age: {age}\n- Weight: {weight}\n- Height: {height}\n- Goal: {goal}\n- Dietary Restrictions: {restrictions or 'None'}"
    
    try:
        print("Attempting Diet Plan generation via gemini_helper...")
        raw = await call_gemini(system_instr, prompt)
        plan = raw + SYSTEM_DISCLAIMER
        print("Successfully generated Diet Plan!")
    except Exception as e:
        print(f"Diet Plan failed: {e}")
        plan = "Failed to generate AI Diet plan. Please verify network access." + SYSTEM_DISCLAIMER
        
    return {"plan": plan}

async def generate_fitness_controller(age: int, weight: str, height: str, fitness_level: str, goals: str):
    system_instr = "You are HealthAI, a certified personal fitness trainer. Design a structured weekly workout routine matching the user's experience level and physical vitals. Use clean, short markdown lists. CRITICAL: Keep your response extremely short, simple, concise, and structured."
    prompt = f"Design a personalized fitness program for a user with these stats:\n- Age: {age}\n- Weight: {weight}\n- Height: {height}\n- Fitness Level: {fitness_level}\n- Health Goals: {goals}"
    
    try:
        print("Attempting Fitness Plan generation via gemini_helper...")
        raw = await call_gemini(system_instr, prompt)
        plan = raw + SYSTEM_DISCLAIMER
        print("Successfully generated Fitness Plan!")
    except Exception as e:
        print(f"Fitness Plan failed: {e}")
        plan = "Failed to generate AI Workout plan. Please verify network access." + SYSTEM_DISCLAIMER
        
    return {"plan": plan}

async def explain_medicine_controller(user_email: str, medicine_name: str, generic_name: str = None):
    """Use Gemini to explain a medicine in simple terms for patients."""
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
Return ONLY valid JSON, no markdown."""

    try:
        print("Attempting Medicine Explain via gemini_helper...")
        import json
        system_instr_med = "You are a clinical pharmacist AI. Provide clear, patient-friendly explanations of medications. Always include a disclaimer that this is informational only and to consult a doctor."
        text = await call_gemini(system_instr_med, prompt, response_json=True)
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        result = json.loads(text)
        print("Successfully generated Medicine Explain!")
        db = get_database()
        if db is not None:
            await db.ai_chats.insert_one({
                "user_email": user_email,
                "type": "medicine_explain",
                "medicine": medicine_name,
                "timestamp": __import__('datetime').datetime.utcnow()
            })
        return {"medicine": medicine_name, "explanation": result}
    except Exception as e:
        print(f"Medicine explain Gemini API failed: {e}. Running high-fidelity local fallback explanation.")
        
        # Smart high-fidelity local dictionary fallback if Gemini API is disabled/fails
        med_lower = medicine_name.lower()
        gen_lower = generic_name.lower() if generic_name else ""
        fallback_data = None
        
        if "amoxicillin" in med_lower or "amoxicillin" in gen_lower or "amoxil" in med_lower:
            fallback_data = {
                "uses": "Amoxicillin is a penicillin-class antibiotic used to treat a wide variety of bacterial infections, such as middle ear infections, strep throat, pneumonia, skin infections, and urinary tract infections.",
                "how_it_works": "It works by stopping the growth of bacteria, specifically by preventing them from forming the cell walls they need to survive.",
                "common_side_effects": ["Nausea or vomiting", "Diarrhea", "Mild skin rash"],
                "precautions": ["Inform your doctor if you are allergic to penicillin or cephalosporin antibiotics.", "Take it with food if it causes stomach upset.", "Complete the full course even if symptoms disappear."],
                "alternatives": ["Azithromycin (Zithromax)", "Cephalexin (Keflex)"],
                "dosage_tip": "Typically taken every 8 or 12 hours depending on prescription strength.",
                "when_to_see_doctor": "Consult your doctor immediately if you experience a severe allergic reaction (hives, difficulty breathing, facial swelling) or severe watery diarrhea.",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
        elif "ibuprofen" in med_lower or "ibuprofen" in gen_lower or "advil" in med_lower or "motrin" in med_lower:
            fallback_data = {
                "uses": "Ibuprofen is a nonsteroidal anti-inflammatory drug (NSAID) commonly used to relieve mild-to-moderate pain, reduce inflammation and swelling, and lower fever.",
                "how_it_works": "It blocks the enzymes (COX-1 and COX-2) that produce prostaglandins, which are chemicals causing pain and inflammation in the body.",
                "common_side_effects": ["Stomach upset or heartburn", "Mild dizziness", "Bloating or gas"],
                "precautions": ["Always take with food, milk, or antacids to protect your stomach lining.", "Avoid if you have active stomach ulcers, severe kidney disease, or heart conditions.", "Limit alcohol intake while taking this medication."],
                "alternatives": ["Naproxen (Aleve)", "Acetaminophen (Tylenol)"],
                "dosage_tip": "Usually taken every 4 to 6 hours as needed with a full glass of water.",
                "when_to_see_doctor": "Seek medical attention if you notice black tarry stools, severe abdominal pain, or swelling/shortness of breath.",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
        elif "metformin" in med_lower or "metformin" in gen_lower or "glucophage" in med_lower:
            fallback_data = {
                "uses": "Metformin is an oral diabetes medicine that helps control blood sugar levels for people with type 2 diabetes.",
                "how_it_works": "It decreases glucose production by the liver, reduces glucose absorption in the intestines, and increases insulin sensitivity in body tissues.",
                "common_side_effects": ["Nausea or diarrhea", "Metallic taste in mouth", "Abdominal bloating"],
                "precautions": ["Take with meals to reduce stomach side effects.", "Monitor your kidney function regularly.", "Avoid excessive alcohol consumption to prevent lactic acidosis risk."],
                "alternatives": ["Glipizide (Glucotrol)", "Empagliflozin (Jardiance)"],
                "dosage_tip": "Typically taken once or twice daily with breakfast and dinner.",
                "when_to_see_doctor": "Consult your doctor if you experience extreme fatigue, muscle pain, difficulty breathing, or cold feeling in limbs (signs of lactic acidosis).",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
        elif "paracetamol" in med_lower or "acetaminophen" in med_lower or "tylenol" in med_lower:
            fallback_data = {
                "uses": "Paracetamol (Acetaminophen) is a widely used over-the-counter pain reliever and fever reducer for mild-to-moderate pain relief.",
                "how_it_works": "It acts primarily on the central nervous system to block pain signals and regulate body temperature via the hypothalamus.",
                "common_side_effects": ["Generally well tolerated at recommended doses", "Rarely, mild skin itchiness", "Liver enzyme elevation (with chronic use)"],
                "precautions": ["Do not exceed 4000mg (8 tablets of 500mg) per day to avoid severe liver damage.", "Check other cold/flu medications to ensure they do not also contain acetaminophen.", "Avoid alcohol to protect your liver."],
                "alternatives": ["Ibuprofen (Advil)", "Aspirin"],
                "dosage_tip": "Usually taken every 4 to 6 hours as needed; do not exceed daily limits.",
                "when_to_see_doctor": "Consult your doctor if pain lasts more than 10 days, fever lasts more than 3 days, or if you suspect an overdose.",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
        elif "atorvastatin" in med_lower or "atorvastatin" in gen_lower or "lipitor" in med_lower:
            fallback_data = {
                "uses": "Atorvastatin is a statin medication used to prevent cardiovascular disease in those at high risk and lower abnormal lipid/cholesterol levels.",
                "how_it_works": "It inhibits HMG-CoA reductase, an enzyme in the liver that plays a central role in the production of cholesterol.",
                "common_side_effects": ["Joint pain", "Mild headache", "Nasal congestion"],
                "precautions": ["Avoid consuming large quantities of grapefruit juice while taking this medication.", "Monitor liver enzymes as advised by your physician.", "Inform your doctor if you plan to become pregnant."],
                "alternatives": ["Rosuvastatin (Crestor)", "Simvastatin (Zocor)"],
                "dosage_tip": "Taken once daily at any time of day, with or without food, but consistently at the same time.",
                "when_to_see_doctor": "Contact your doctor immediately if you experience unexplained muscle pain, tenderness, or weakness (especially accompanied by fever).",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
        elif "cetirizine" in med_lower or "cetirizine" in gen_lower or "zyrtec" in med_lower:
            fallback_data = {
                "uses": "Cetirizine is a second-generation antihistamine used to treat hay fever, seasonal allergies, hives, and itchy skin.",
                "how_it_works": "It selectively blocks peripheral H1 histamine receptors in the body, preventing allergic responses without entering the brain extensively.",
                "common_side_effects": ["Mild drowsiness", "Dry mouth", "Fatigue"],
                "precautions": ["Be cautious when driving or operating machinery until you know how it affects you.", "Avoid combining with alcohol or sedatives.", "Adjust dose in patients with kidney impairment."],
                "alternatives": ["Loratadine (Claritin)", "Fexofenadine (Allegra)"],
                "dosage_tip": "Typically taken as one 10mg tablet once daily, preferably in the evening.",
                "when_to_see_doctor": "Consult your doctor if allergy symptoms do not improve after 3-5 days or if you experience difficulty breathing.",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
        else:
            # Generic fallback
            fallback_data = {
                "uses": f"{medicine_name.title()} is a therapeutic medication prescribed to treat or manage your current clinical symptoms and diagnosed health condition.",
                "how_it_works": "It acts on specific physiological receptors to target cellular structures or chemical pathways involved in the disease process.",
                "common_side_effects": ["Mild nausea or headache", "Dry mouth", "Dizziness"],
                "precautions": ["Take exactly as directed by your physician or pharmacist.", "Report any other medications or supplements you are taking.", "Do not stop taking without consulting your healthcare team."],
                "alternatives": ["Consult your physician for generic or therapeutic alternatives."],
                "dosage_tip": "Follow the specific dosage and instructions printed on the pharmacy label.",
                "when_to_see_doctor": "Seek immediate help if you experience signs of an allergic reaction (hives, severe rash, breathing trouble) or severe side effects.",
                "disclaimer": "This information is educational only and does not replace professional medical advice. Always consult your healthcare provider."
            }
            
        # Save to AI chats for analytics
        db = get_database()
        if db is not None:
            await db.ai_chats.insert_one({
                "user_email": user_email,
                "type": "medicine_explain_fallback",
                "medicine": medicine_name,
                "timestamp": __import__('datetime').datetime.utcnow()
            })
            
        return {"medicine": medicine_name, "explanation": fallback_data}
