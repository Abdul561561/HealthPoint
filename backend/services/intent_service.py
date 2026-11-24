"""
HealthPoint Intent Detection and AI Routing Service
===================================================
Provides low-latency rule-based classification and confidence evaluation
for incoming conversational requests to avoid unnecessary LLM calls.

Supported Intents:
- Greeting
- Casual conversation
- General knowledge
- Education
- Programming
- Health information
- Personal health
- Medical report analysis
- Diet and nutrition
- Fitness and exercise
- Medicine information
- Appointment assistance
- Doctor discovery
- Pharmacy assistance
- Health records
- Insurance assistance
- Emergency guidance
- Follow-up questions
"""

import re
from typing import Dict, Any, Optional

class IntentType:
    GREETING = "Greeting"
    CASUAL = "Casual conversation"
    GENERAL_KNOWLEDGE = "General knowledge"
    EDUCATION = "Education"
    PROGRAMMING = "Programming"
    HEALTH_INFO = "Health information"
    PERSONAL_HEALTH = "Personal health"
    REPORT_ANALYSIS = "Medical report analysis"
    DIET_NUTRITION = "Diet and nutrition"
    FITNESS = "Fitness and exercise"
    MEDICINE_INFO = "Medicine information"
    APPOINTMENT = "Appointment assistance"
    DOCTOR_DISCOVERY = "Doctor discovery"
    PHARMACY = "Pharmacy assistance"
    HEALTH_RECORDS = "Health records"
    INSURANCE = "Insurance assistance"
    EMERGENCY = "Emergency guidance"
    FOLLOW_UP = "Follow-up questions"
    UNKNOWN = "General conversation"

# Regex and keyword fast patterns
_PATTERNS = [
    # Emergency (Highest Priority)
    (
        IntentType.EMERGENCY,
        re.compile(
            r"\b(emergency|call (911|112|108|ambulance)|severe chest pain|cannot breathe|can't breathe|"
            r"suicidal|unconscious|heavy bleeding|poisoning|anaphylaxis|heart attack symptoms|stroke symptoms)\b",
            re.IGNORECASE
        ),
        0.98
    ),
    
    # Simple Greetings
    (
        IntentType.GREETING,
        re.compile(
            r"^(hi|hello|hey|hey there|howdy|good (morning|afternoon|evening|day)|namaste|hola|sup|greetings)[!.\s]*$",
            re.IGNORECASE
        ),
        0.99
    ),

    # Casual conversation / Social
    (
        IntentType.CASUAL,
        re.compile(
            r"^(tell me a joke|make me laugh|how are you|who are you|what can you do|what is your name|"
            r"thank you|thanks|thanks a lot|bye|goodbye|see you|cool|awesome)[!.\s]*$",
            re.IGNORECASE
        ),
        0.95
    ),

    # Programming & Code
    (
        IntentType.PROGRAMMING,
        re.compile(
            r"\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|php|sql|regex|html|css|react|fastapi|"
            r"inheritance|polymorphism|async await|pointer|recursion|algorithm|data structure|binary tree|"
            r"write a function|debug (this|my) code|code example|syntax error|git commit)\b",
            re.IGNORECASE
        ),
        0.92
    ),

    # Personal Health / Vitals
    (
        IntentType.PERSONAL_HEALTH,
        re.compile(
            r"\b(what is my bmi|my bmi|my blood pressure|my bp|my heart rate|my pulse|my sleep|"
            r"my vitals|my weight|my height|how many steps did i take|my calories today|my health score|"
            r"my water intake|my oxygen level)\b",
            re.IGNORECASE
        ),
        0.95
    ),

    # Medical Report Analysis
    (
        IntentType.REPORT_ANALYSIS,
        re.compile(
            r"\b(explain my (blood|lab|cbc|lipid|urine|thyroid|mri|x-ray|ultrasound)?\s*report|"
            r"analyze my (blood|lab|test|report)|what do my test results mean|hemoglobin level in my report|"
            r"is my report normal|uploaded report|lab report findings)\b",
            re.IGNORECASE
        ),
        0.93
    ),

    # Diet and Nutrition
    (
        IntentType.DIET_NUTRITION,
        re.compile(
            r"\b(diet plan|meal plan|create a diet|suggest a diet|calorie intake|calorie deficit|"
            r"macros|protein intake|what should i eat|breakfast suggestions|healthy dinner|keto diet|"
            r"intermittent fasting|nutrition plan|food to avoid|vitamins to take)\b",
            re.IGNORECASE
        ),
        0.93
    ),

    # Fitness and Exercise
    (
        IntentType.FITNESS,
        re.compile(
            r"\b(workout plan|gym routine|exercise routine|create a workout|weight loss exercise|"
            r"muscle building|strength training|cardio routine|push pull legs|stretching exercises|"
            r"bench press|squats|warmup|cooldown)\b",
            re.IGNORECASE
        ),
        0.93
    ),

    # Medicine Information
    (
        IntentType.MEDICINE_INFO,
        re.compile(
            r"\b(what is (paracetamol|ibuprofen|amoxicillin|metformin|atorvastatin|cetirizine|aspirin|tylenol|advil|antibiotic)|"
            r"side effects of|uses of medicine|dosage for|drug interaction|tablet used for|pill used for)\b",
            re.IGNORECASE
        ),
        0.93
    ),

    # Appointment Assistance
    (
        IntentType.APPOINTMENT,
        re.compile(
            r"\b(book an appointment|schedule appointment|reschedule appointment|cancel appointment|"
            r"my appointments|upcoming appointment|doctor visit)\b",
            re.IGNORECASE
        ),
        0.92
    ),

    # Doctor Discovery
    (
        IntentType.DOCTOR_DISCOVERY,
        re.compile(
            r"\b(find a doctor|doctor near me|cardiologist near me|dermatologist near me|"
            r"best pediatrician|hospital near me|clinic near me|recommend a specialist)\b",
            re.IGNORECASE
        ),
        0.92
    ),

    # Pharmacy Assistance
    (
        IntentType.PHARMACY,
        re.compile(
            r"\b(find (a )?pharmacy|chemist near me|medical shop|order medicine|buy medicine|"
            r"upload prescription|prescription medicine|check medicine stock)\b",
            re.IGNORECASE
        ),
        0.92
    ),

    # Health Records
    (
        IntentType.HEALTH_RECORDS,
        re.compile(
            r"\b(show my records|my medical records|view my reports|list my records|"
            r"upload medical record|saved prescriptions|my prescriptions history)\b",
            re.IGNORECASE
        ),
        0.91
    ),

    # Insurance Assistance
    (
        IntentType.INSURANCE,
        re.compile(
            r"\b(health insurance|insurance claim|cashless hospital|claim status|deductible|co-pay|"
            r"policy coverage|reimbursement claim|insurance pre-auth)\b",
            re.IGNORECASE
        ),
        0.92
    ),

    # Follow-up Questions
    (
        IntentType.FOLLOW_UP,
        re.compile(
            r"^(tell me more|why\??|why is that\??|what else\??|and then\??|can you elaborate(\s+on\s+that)?\??|"
            r"elaborate\s+on\s+that\??|what about the (first|second|third|last) one\??|more details please|continue|go on)[.?!]?$",
            re.IGNORECASE
        ),
        0.90
    ),

    # Education / Academic
    (
        IntentType.EDUCATION,
        re.compile(
            r"\b(explain (photosynthesis|calculus|thermodynamics|mitosis|evolution|gravity|newton's law|"
            r"world war|french revolution)|teach me (algebra|geometry|physics|chemistry|history))\b",
            re.IGNORECASE
        ),
        0.88
    ),

    # General Knowledge
    (
        IntentType.GENERAL_KNOWLEDGE,
        re.compile(
            r"\b(what is the capital of|who wrote|who invented|why is the sky blue|distance to the moon|"
            r"tallest building|deepest ocean|how old is earth)\b",
            re.IGNORECASE
        ),
        0.88
    ),

    # General Health Information (Symptoms, health concepts)
    (
        IntentType.HEALTH_INFO,
        re.compile(
            r"\b(symptoms of|causes of|why do i have a headache|fever remedies|hypertension causes|"
            r"how to lower cholesterol|benefits of water|how to sleep better|home remedies for)\b",
            re.IGNORECASE
        ),
        0.87
    )
]

def detect_intent(message: str) -> Dict[str, Any]:
    """
    Classifies the user message into one of the recognized intents using fast pattern matching.
    Returns a dict with 'intent', 'confidence', and 'is_healthcare'.
    """
    trimmed = message.strip()
    if not trimmed:
        return {
            "intent": IntentType.GREETING,
            "confidence": 1.0,
            "is_healthcare": False,
            "requires_health_context": False,
            "requires_disclaimer": False
        }

    for intent, pattern, confidence in _PATTERNS:
        if pattern.search(trimmed):
            is_health = intent in (
                IntentType.HEALTH_INFO,
                IntentType.PERSONAL_HEALTH,
                IntentType.REPORT_ANALYSIS,
                IntentType.DIET_NUTRITION,
                IntentType.FITNESS,
                IntentType.MEDICINE_INFO,
                IntentType.EMERGENCY,
                IntentType.HEALTH_RECORDS
            )
            requires_context = intent in (
                IntentType.PERSONAL_HEALTH,
                IntentType.REPORT_ANALYSIS,
                IntentType.DIET_NUTRITION,
                IntentType.FITNESS,
                IntentType.HEALTH_RECORDS
            )
            requires_disclaimer = intent in (
                IntentType.HEALTH_INFO,
                IntentType.REPORT_ANALYSIS,
                IntentType.MEDICINE_INFO
            )
            return {
                "intent": intent,
                "confidence": confidence,
                "is_healthcare": is_health,
                "requires_health_context": requires_context,
                "requires_disclaimer": requires_disclaimer
            }

    # Default fallback
    return {
        "intent": IntentType.UNKNOWN,
        "confidence": 0.50,
        "is_healthcare": False,
        "requires_health_context": False,
        "requires_disclaimer": False
    }
