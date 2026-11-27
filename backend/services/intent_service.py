"""
HealthPoint Intent Detection and AI Routing Service
===================================================
Provides low-latency rule-based classification and routing metadata so personal
health questions retrieve relevant authenticated HealthPoint context while
casual chat, programming, and general knowledge remain natural and private.

Supported Intents:
- Greeting
- Casual conversation
- General knowledge
- Education
- Programming
- Personal health overview
- Personal health trend
- Personal health
- Personal medication review
- Health information
- Medical report analysis
- Diet and nutrition
- Fitness and exercise
- Medicine information
- Doctor discovery
- Pharmacy assistance
- Health records
- Insurance assistance
- Emergency guidance
- Follow-up questions
"""

import re
from typing import Dict, Any


class IntentType:
    GREETING = "Greeting"
    CASUAL = "Casual conversation"
    GENERAL_KNOWLEDGE = "General knowledge"
    EDUCATION = "Education"
    PROGRAMMING = "Programming"
    HEALTH_OVERVIEW = "Personal health overview"
    HEALTH_TREND = "Personal health trend"
    PERSONAL_HEALTH = "Personal health"
    MEDICATION_PERSONAL = "Personal medication review"
    HEALTH_INFO = "Health information"
    REPORT_ANALYSIS = "Medical report analysis"
    DIET_NUTRITION = "Diet and nutrition"
    FITNESS = "Fitness and exercise"
    MEDICINE_INFO = "Medicine information"
    DOCTOR_DISCOVERY = "Doctor discovery"
    HOSPITAL_DISCOVERY = "Hospital discovery"
    SYMPTOM_TRIAGE = "Symptom guidance"
    PHARMACY = "Pharmacy assistance"
    HEALTH_RECORDS = "Health records"
    INSURANCE = "Insurance assistance"
    EMERGENCY = "Emergency guidance"
    FOLLOW_UP = "Follow-up questions"
    UNKNOWN = "General conversation"


# Ordered carefully: emergency -> greetings/casual -> personal health & records ->
# general programming/education/knowledge -> general medical info.
_PATTERNS = [
    # 1. Emergency (Highest Priority)
    (
        IntentType.EMERGENCY,
        re.compile(
            r"\b(emergency|call (911|112|108|ambulance)|severe chest pain|cannot breathe|can't breathe|"
            r"suicidal|unconscious|heavy bleeding|poisoning|anaphylaxis|heart attack symptoms|stroke symptoms)\b",
            re.IGNORECASE,
        ),
        0.98,
    ),
    # 2. Simple Greetings
    (
        IntentType.GREETING,
        re.compile(
            r"^(hi|hello|hey|hey there|howdy|good (morning|afternoon|evening|day)|namaste|hola|sup|greetings)[!.\s]*$",
            re.IGNORECASE,
        ),
        0.99,
    ),
    # 3. Casual Conversation / Social
    (
        IntentType.CASUAL,
        re.compile(
            r"^(tell me a joke|make me laugh|how are you( doing)?\??|who are you\??|what can you do\??|"
            r"what is your name\??|thank you|thanks|thanks a lot|bye|goodbye|see you|cool|awesome)[!.\s]*$",
            re.IGNORECASE,
        ),
        0.95,
    ),
    # 4. Personal Health Overview ("How is my health today?", "What should I improve in my health?")
    (
        IntentType.HEALTH_OVERVIEW,
        re.compile(
            r"\b(how is my health( today)?|how('s| is) my overall health|my health today|"
            r"my health overview|my health summary|summarize my health|check my health status|"
            r"review my health( data| profile)?|what should i improve( in my health| overall)?|"
            r"how am i doing health[- ]?wise|am i healthy|give me my health report)\b",
            re.IGNORECASE,
        ),
        0.97,
    ),
    # 5. Historical Trend & Improvement Questions ("Am I improving?", "How was my sleep this week?")
    (
        IntentType.HEALTH_TREND,
        re.compile(
            r"\b(am i improving|are my vitals improving|my health trend|health progress|"
            r"progress this week|compare my (vitals|metrics|readings|history)|"
            r"how was my sleep this week|my sleep trend|my heart rate trend|my bp trend|"
            r"my blood pressure trend|my weight trend|past readings|historical (vitals|metrics|data))\b",
            re.IGNORECASE,
        ),
        0.96,
    ),
    # 6. Personal Medication Review ("What medicines am I taking?")
    (
        IntentType.MEDICATION_PERSONAL,
        re.compile(
            r"\b(what (medicines|medications|pills|tablets|drugs) am i taking|"
            r"my (current )?(medicines|medications|prescriptions|tablets)|"
            r"list my prescriptions|what was i prescribed|active prescriptions|my pharmacy orders)\b",
            re.IGNORECASE,
        ),
        0.96,
    ),
    # 7. Medical Report Analysis (Personal uploaded records)
    (
        IntentType.REPORT_ANALYSIS,
        re.compile(
            r"\b((explain|analyze|review|check|summarize) my (latest |recent |last |uploaded )?"
            r"(blood|lab|cbc|lipid|urine|thyroid|mri|x-ray|ultrasound|medical|diagnostic|test)?\s*(report|results|labs)|"
            r"what do my (lab |blood )?test results mean|hemoglobin level in my report|"
            r"is my report normal|uploaded report|lab report findings)\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    # 8. Personal Health Vitals & Activity (Single or multi-metric queries)
    (
        IntentType.PERSONAL_HEALTH,
        re.compile(
            r"\b(what is my bmi|what does my bmi mean|is my bmi normal|my bmi|"
            r"my blood pressure|my bp|is my blood pressure normal|explain my blood pressure|"
            r"what does my blood pressure mean|should i be worried about my blood pressure|"
            r"my heart rate|my pulse|is my heart rate normal|explain my heart rate|"
            r"how is my sleep|how was my sleep|my sleep|my vitals|my weight|my height|"
            r"how many steps did i (take|complete|walk)|my steps|my step count|"
            r"my calories( today)?|my health score|my water intake|how much water did i drink|"
            r"my oxygen( level)?|my spo2|my temperature|my body temp|"
            r"my blood glucose|my blood sugar|is my glucose|missing measurements|what metrics am i missing|"
            r"my (recorded |latest |current )?(health )?(metrics|vitals|readings|stats)|"
            r"analyze my (recorded |latest |current )?(health )?(metrics|vitals|readings|data))\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    # 9. Programming & Software Engineering
    (
        IntentType.PROGRAMMING,
        re.compile(
            r"\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|php|sql|regex|html|css|react|fastapi|"
            r"inheritance|polymorphism|async await|pointer|recursion|algorithm|data structure|binary tree|"
            r"write a (python|java|javascript|c\+\+|sql|code) program|write a function|debug (this|my) code|"
            r"code example|syntax error|git commit)\b",
            re.IGNORECASE,
        ),
        0.93,
    ),
    # 10. Diet and Nutrition
    (
        IntentType.DIET_NUTRITION,
        re.compile(
            r"\b(diet plan|meal plan|create a diet|suggest a diet|my (daily )?(calorie|macro)s?|calorie deficit|"
            r"macros|protein intake|what should i eat|breakfast suggestions|healthy dinner|keto diet|"
            r"intermittent fasting|nutrition plan|food to avoid|foods boost energy|vitamins (to|should i) take|"
            r"my logged meals|how many calories did i eat)\b",
            re.IGNORECASE,
        ),
        0.93,
    ),
    # 11. Fitness and Exercise
    (
        IntentType.FITNESS,
        re.compile(
            r"\b(workout plan|gym routine|exercise routine|create a workout|weight loss exercise|"
            r"muscle building|strength training|cardio routine|push pull legs|stretching exercises|"
            r"bench press|squats|warmup|cooldown|my workouts|how many steps should i walk|"
            r"improve (my )?fitness|fitness (routine|plan|advice|goals?)|suggest (an? )?(workout|exercise))\b",
            re.IGNORECASE,
        ),
        0.93,
    ),
    # 12. Medicine Information (General pharmacology)
    (
        IntentType.MEDICINE_INFO,
        re.compile(
            r"\b(what is (paracetamol|ibuprofen|amoxicillin|metformin|atorvastatin|cetirizine|aspirin|tylenol|advil|antibiotic)|"
            r"side effects of|uses of medicine|dosage for|drug interaction|tablet used for|pill used for)\b",
            re.IGNORECASE,
        ),
        0.93,
    ),
    # 13. Emergency / Hospital Discovery
    (
        IntentType.HOSPITAL_DISCOVERY,
        re.compile(
            r"\b(hospital(s)? near me|nearby hospital(s)?|find (a )?hospital(s)?|"
            r"show hospitals instead|nearest hospital|urgent care near me|emergency hospital)\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    # 14. Doctor & Specialist Discovery ("Which nearby doctor can I visit?", "Find a cardiologist near me", "Only show dermatologists")
    (
        IntentType.DOCTOR_DISCOVERY,
        re.compile(
            r"\b(find (a )?(nearby )?(doctor|physician|cardiologist|dermatologist|pediatrician|neurologist|"
            r"orthopedic|orthopedist|ent|gynecologist|dentist|ophthalmologist|psychiatrist|specialist)|"
            r"which nearby doctor|nearby doctor(s)?|doctor(s)? near me|clinic(s)? near me|"
            r"(only show|show|filter|switch to) (cardiologists?|dermatologists?|pediatricians?|neurologists?|"
            r"orthopedists?|orthopedic doctors?|ent specialists?|gynecologists?|dentists?|general physicians?)|"
            r"(cardiologist|dermatologist|pediatrician|neurologist|orthopedic doctor|orthopedist|"
            r"ent specialist|gynecologist|dentist|general physician) near|recommend a (specialist|doctor))\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    # 15. Symptom Guidance & Medical Triage ("I have a fever", "I am feeling feverish", "I need medicine for a headache")
    (
        IntentType.SYMPTOM_TRIAGE,
        re.compile(
            r"\b(i have (a )?(fever|headache|migraine|cough|cold|sore throat|stomach pain|chest tightness|dizziness|rash|nausea)|"
            r"feeling (feverish|unwell|sick|dizzy|nauseous)|running a fever|"
            r"(need|suggest|what) medicine for (a |my )?(fever|headache|cough|cold|pain|acidity|allergy))\b",
            re.IGNORECASE,
        ),
        0.94,
    ),
    # 16. Pharmacy Assistance
    (
        IntentType.PHARMACY,
        re.compile(
            r"\b(find (a )?pharmacy|chemist near me|medical shop|order medicine|buy medicine|"
            r"upload prescription|prescription medicine|check medicine stock)\b",
            re.IGNORECASE,
        ),
        0.92,
    ),
    # 15. Health Records
    (
        IntentType.HEALTH_RECORDS,
        re.compile(
            r"\b(show my records|my medical records|view my reports|list my records|"
            r"upload medical record|saved prescriptions|my prescriptions history)\b",
            re.IGNORECASE,
        ),
        0.91,
    ),
    # 16. Insurance Assistance
    (
        IntentType.INSURANCE,
        re.compile(
            r"\b(health insurance|insurance claim|my claims?|cashless hospital|claim status|deductible|co-pay|"
            r"policy coverage|reimbursement claim|insurance pre-auth)\b",
            re.IGNORECASE,
        ),
        0.92,
    ),
    # 18. Follow-up Questions (including location follow-ups and place comparison follow-ups)
    (
        IntentType.FOLLOW_UP,
        re.compile(
            r"^(tell me more|why\??|why is that\??|what else\??|and then\??|can you elaborate(\s+on\s+that)?\??|"
            r"elaborate\s+on\s+that\??|what about the (first|second|third|last) one\??|more details please|"
            r"continue|go on|what should i do next\??|"
            r"which one is closest\??|give me directions\??|directions please|how do i get there\??|"
            r"what should i tell the doctor\??|what questions should i ask\??)[.?!]?$",
            re.IGNORECASE,
        ),
        0.91,
    ),
    # 18. Education / Computing / Technical Concepts
    (
        IntentType.EDUCATION,
        re.compile(
            r"\b(explain (photosynthesis|calculus|thermodynamics|mitosis|evolution|gravity|newton's law|"
            r"world war|french revolution|ocr|artificial intelligence|machine learning)|"
            r"what is (ocr|optical character recognition|machine learning|artificial intelligence|deep learning)|"
            r"teach me (algebra|geometry|physics|chemistry|history))\b",
            re.IGNORECASE,
        ),
        0.89,
    ),
    # 19. General Knowledge
    (
        IntentType.GENERAL_KNOWLEDGE,
        re.compile(
            r"\b(what is the capital of|who wrote|who invented|why is the sky blue|distance to the moon|"
            r"tallest building|deepest ocean|how old is earth)\b",
            re.IGNORECASE,
        ),
        0.88,
    ),
    # 20. General Health Information (Non-personalized medical knowledge)
    (
        IntentType.HEALTH_INFO,
        re.compile(
            r"\b(symptoms of|causes of|what causes|why do i have a headache|fever remedies|"
            r"what is (diabetes|hypertension|blood pressure|cholesterol|asthma|anemia)|"
            r"normal blood pressure|normal heart rate|hypertension|high blood pressure|"
            r"how to lower cholesterol|benefits of water|how to sleep better|"
            r"sleep cycle|sleep quality|improve.*sleep|insomnia|diabetes|heart disease|home remedies for)\b",
            re.IGNORECASE,
        ),
        0.87,
    ),
]


PERSONAL_CONTEXT_INTENTS = {
    IntentType.HEALTH_OVERVIEW,
    IntentType.HEALTH_TREND,
    IntentType.PERSONAL_HEALTH,
    IntentType.MEDICATION_PERSONAL,
    IntentType.REPORT_ANALYSIS,
    IntentType.DIET_NUTRITION,
    IntentType.FITNESS,
    IntentType.HEALTH_RECORDS,
    IntentType.PHARMACY,
    IntentType.INSURANCE,
    IntentType.SYMPTOM_TRIAGE,
}

HEALTHCARE_INTENTS = PERSONAL_CONTEXT_INTENTS | {
    IntentType.HEALTH_INFO,
    IntentType.MEDICINE_INFO,
    IntentType.EMERGENCY,
    IntentType.DOCTOR_DISCOVERY,
    IntentType.HOSPITAL_DISCOVERY,
}

DISCLAIMER_INTENTS = {
    IntentType.HEALTH_INFO,
    IntentType.HEALTH_OVERVIEW,
    IntentType.HEALTH_TREND,
    IntentType.PERSONAL_HEALTH,
    IntentType.MEDICATION_PERSONAL,
    IntentType.REPORT_ANALYSIS,
    IntentType.MEDICINE_INFO,
    IntentType.SYMPTOM_TRIAGE,
}


def detect_intent(message: str) -> Dict[str, Any]:
    """
    Classifies the user message into one of the recognized intents using fast pattern matching.
    Returns intent routing flags indicating healthcare relevance, personal data requirement, and disclaimers.
    """
    trimmed = message.strip()
    if not trimmed:
        return {
            "intent": IntentType.GREETING,
            "confidence": 1.0,
            "is_healthcare": False,
            "requires_health_context": False,
            "requires_disclaimer": False,
        }

    for intent, pattern, confidence in _PATTERNS:
        if pattern.search(trimmed):
            return {
                "intent": intent,
                "confidence": confidence,
                "is_healthcare": intent in HEALTHCARE_INTENTS,
                "requires_health_context": intent in PERSONAL_CONTEXT_INTENTS,
                "requires_disclaimer": intent in DISCLAIMER_INTENTS,
            }

    return {
        "intent": IntentType.UNKNOWN,
        "confidence": 0.50,
        "is_healthcare": False,
        "requires_health_context": False,
        "requires_disclaimer": False,
    }
