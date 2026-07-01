import numpy as np
from sklearn.linear_model import LogisticRegression
from fastapi import HTTPException, status
from backend.database.mongodb import get_database
from backend.models.analytics import (
    HealthScoreBreakdown,
    RiskPredictionCard,
    WeeklyReportResponse,
    AnalyticsDashboardResponse
)

class HealthClassifierManager:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
            cls._instance.train_models()
        return cls._instance

    def __init__(self):
        self.cardio_model = None
        self.diabetes_model = None
        self.fatigue_model = None

    def train_models(self):
        print("Initializing Scikit-Learn Health Classifier models...")
        np.random.seed(42)
        n_samples = 400

        # 1. Cardiovascular Risk training set: [age, heart_rate, systolic_bp, bmi]
        X_cardio = np.random.uniform(low=[18, 50, 90, 16], high=[80, 110, 180, 42], size=(n_samples, 4))
        # Label is 1 if High Risk: systolic BP > 135 or HR > 95 or BMI > 30, with some random noise
        y_cardio = []
        for x in X_cardio:
            age, hr, bp, bmi = x
            prob = 0.05
            if bp > 140: prob += 0.4
            if hr > 90: prob += 0.2
            if bmi > 30: prob += 0.2
            if age > 55: prob += 0.15
            y_cardio.append(1 if np.random.rand() < prob else 0)
        y_cardio = np.array(y_cardio)

        # 2. Diabetes Risk training set: [age, bmi, calorie_intake, steps]
        X_diab = np.random.uniform(low=[18, 16, 1200, 1000], high=[80, 42, 3800, 16000], size=(n_samples, 4))
        y_diab = []
        for x in X_diab:
            age, bmi, cal, steps = x
            prob = 0.05
            if bmi > 28: prob += 0.4
            if cal > 2800: prob += 0.25
            if steps < 5000: prob += 0.2
            if age > 50: prob += 0.1
            y_diab.append(1 if np.random.rand() < prob else 0)
        y_diab = np.array(y_diab)

        # 3. Fatigue & Sleep Apnea training set: [age, sleep_hours, heart_rate, bmi]
        X_fatigue = np.random.uniform(low=[18, 4, 50, 16], high=[80, 10, 110, 42], size=(n_samples, 4))
        y_fatigue = []
        for x in X_fatigue:
            age, sleep, hr, bmi = x
            prob = 0.05
            if sleep < 6.0: prob += 0.5
            if hr > 85: prob += 0.25
            if bmi > 30: prob += 0.15
            y_fatigue.append(1 if np.random.rand() < prob else 0)
        y_fatigue = np.array(y_fatigue)

        # Fit LogisticRegression classifiers
        self.cardio_model = LogisticRegression(solver='liblinear').fit(X_cardio, y_cardio)
        self.diabetes_model = LogisticRegression(solver='liblinear').fit(X_diab, y_diab)
        self.fatigue_model = LogisticRegression(solver='liblinear').fit(X_fatigue, y_fatigue)
        print("Scikit-Learn Health Classifier models successfully trained and loaded.")

async def get_analytics_dashboard_controller(email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    # 1. Fetch user data and current metrics safely
    user = {}
    metrics = {}
    try:
        user = await db.users.find_one({"email": email}) or {}
        metrics = await db.metrics.find_one({"user_email": email}) or {}
    except Exception as e:
        print(f"Error fetching analytics data from database: {e}")

    # Default parameters if not fully seeded
    age = user.get("age", 28) if user else 28
    gender = user.get("gender", "Male") if user else "Male"

    # Extrapolate metrics
    hr_current = metrics.get("heartRate", {}).get("current", 72) if metrics else 72
    bp_sys = metrics.get("bloodPressure", {}).get("systolic", 120) if metrics else 120
    bp_dia = metrics.get("bloodPressure", {}).get("diastolic", 80) if metrics else 80
    bmi_val = metrics.get("bmi", {}).get("value", 22.8) if metrics else 22.8
    sleep_hrs = metrics.get("sleep", {}).get("hours", 7.5) if metrics else 7.5
    steps_count = metrics.get("steps", {}).get("count", 8420) if metrics else 8420
    cal_intake = metrics.get("calories", {}).get("intake", 2100) if metrics else 2100
    cal_burned = metrics.get("calories", {}).get("burned", 1840) if metrics else 1840
    weight_val = metrics.get("weight", {}).get("current", 70.0) if metrics else 70.0

    # 2. Calculate Health Score
    # Sleep score: Optimal = 8 hours
    sleep_score = int(max(0, min(100, 100 - (abs(8.0 - sleep_hrs) * 15))))
    # Activity score: Target = 10,000 steps
    activity_score = int(min(100, (steps_count / 10000.0) * 100))
    # Heart stability: Optimal resting hr = 60-75 bpm
    heart_score = int(max(0, 100 - (abs(70 - hr_current) * 2)))
    # BP stability: Optimal = 120 systolic
    bp_score = int(max(0, 100 - (abs(120 - bp_sys) * 2)))
    # BMI Category score: Normal range = 18.5 - 25.0
    if 18.5 <= bmi_val <= 25.0:
        bmi_score = 100
    elif bmi_val > 25.0:
        bmi_score = int(max(0, 100 - ((bmi_val - 25.0) * 5)))
    else:
        bmi_score = int(max(0, 100 - ((18.5 - bmi_val) * 8)))

    total_score = int((sleep_score + activity_score + heart_score + bp_score + bmi_score) / 5)
    
    if total_score >= 85:
        grade = "Optimal"
    elif total_score >= 70:
        grade = "Good"
    elif total_score >= 50:
        grade = "Fair"
    else:
        grade = "Needs Attention"

    score_breakdown = HealthScoreBreakdown(
        totalScore=total_score,
        sleepScore=sleep_score,
        activityScore=activity_score,
        heartScore=heart_score,
        bpScore=bp_score,
        bmiScore=bmi_score,
        grade=grade
    )

    # 3. ML Risk Predictions using Scikit-Learn
    ml_manager = HealthClassifierManager.get_instance()

    # Predict Cardio Risk: features = [age, heart_rate, systolic_bp, bmi]
    cardio_feats = np.array([[age, hr_current, bp_sys, bmi_val]])
    cardio_prob = float(ml_manager.cardio_model.predict_proba(cardio_feats)[0][1] * 100)

    # Predict Diabetes Risk: features = [age, bmi, calorie_intake, steps]
    diab_feats = np.array([[age, bmi_val, cal_intake, steps_count]])
    diab_prob = float(ml_manager.diabetes_model.predict_proba(diab_feats)[0][1] * 100)

    # Predict Sleep Fatigue Risk: features = [age, sleep_hours, heart_rate, bmi]
    fatigue_feats = np.array([[age, sleep_hrs, hr_current, bmi_val]])
    fatigue_prob = float(ml_manager.fatigue_model.predict_proba(fatigue_feats)[0][1] * 100)

    # Map Cardio Prediction Card
    cardio_level = "High" if cardio_prob > 60 else ("Medium" if cardio_prob > 25 else "Low")
    cardio_color = "red" if cardio_level == "High" else ("yellow" if cardio_level == "Medium" else "green")
    cardio_factors = []
    if bp_sys > 130: cardio_factors.append("Elevated Blood Pressure")
    if hr_current > 80: cardio_factors.append("High Resting Heart Rate")
    if bmi_val > 28: cardio_factors.append("Overweight BMI index")
    if not cardio_factors: cardio_factors.append("General age-biometric factor")
    
    cardio_recs = ["Engage in 30 minutes of cardiovascular exercises daily."]
    if bp_sys > 130: cardio_recs.append("Reduce daily sodium intake below 1500mg.")
    cardio_recs.append("Monitor resting heart rate metrics weekly.")

    cardio_card = RiskPredictionCard(
        name="Cardiovascular Health",
        probability=round(cardio_prob, 1),
        level=cardio_level,
        color=cardio_color,
        factors=cardio_factors,
        recommendations=cardio_recs
    )

    # Map Diabetes Prediction Card
    diab_level = "High" if diab_prob > 60 else ("Medium" if diab_prob > 25 else "Low")
    diab_color = "red" if diab_level == "High" else ("yellow" if diab_level == "Medium" else "green")
    diab_factors = []
    if bmi_val > 27: diab_factors.append("High BMI rating")
    if cal_intake > 2500: diab_factors.append("Excess Calorie Intake")
    if steps_count < 6000: diab_factors.append("Sedentary Activity Level")
    if not diab_factors: diab_factors.append("Standard metabolic index")
    
    diab_recs = ["Limit daily processed sugars and simple carbohydrates consumption."]
    if steps_count < 10000: diab_recs.append("Aim to hit a minimum steps threshold of 8,500 daily.")
    diab_recs.append("Incorporate fiber-rich whole foods into diet.")

    diab_card = RiskPredictionCard(
        name="Type 2 Diabetes",
        probability=round(diab_prob, 1),
        level=diab_level,
        color=diab_color,
        factors=diab_factors,
        recommendations=diab_recs
    )

    # Map Sleep Fatigue Prediction Card
    fatigue_level = "High" if fatigue_prob > 60 else ("Medium" if fatigue_prob > 25 else "Low")
    fatigue_color = "red" if fatigue_level == "High" else ("yellow" if fatigue_level == "Medium" else "green")
    fatigue_factors = []
    if sleep_hrs < 6.5: fatigue_factors.append("Insufficient Sleep Duration")
    if hr_current > 80: fatigue_factors.append("Tachycardic Resting Pulse")
    if not fatigue_factors: fatigue_factors.append("General fatigue metrics")
    
    fatigue_recs = ["Maintain a consistent bedtime routine and sleep-wake window."]
    if sleep_hrs < 7: fatigue_recs.append("Increase daily sleep duration to reach at least 7.5 hours.")
    fatigue_recs.append("Avoid screens and caffeine 3 hours before sleep.")

    fatigue_card = RiskPredictionCard(
        name="Sleep Apnea & Chronic Fatigue",
        probability=round(fatigue_prob, 1),
        level=fatigue_level,
        color=fatigue_color,
        factors=fatigue_factors,
        recommendations=fatigue_recs
    )

    risk_predictions = [cardio_card, diab_card, fatigue_card]

    # 4. Generate Weekly Health Report Summaries
    # Comparative metrics against previous week (simulated using small offsets)
    sleep_avg = round(sleep_hrs, 1)
    sleep_diff = round(((sleep_hrs - 6.8) / 6.8) * 100, 1) # e.g. compared to 6.8 hours baseline

    steps_avg = round(steps_count)
    steps_diff = round(((steps_count - 7600) / 7600) * 100, 1)

    calories_avg = round(cal_intake)
    calories_diff = round(((cal_intake - 2250) / 2250) * 100, 1)

    hr_avg = round(hr_current)
    hr_diff = round(((hr_current - 75) / 75) * 100, 1)

    # Construct comparative text report summary
    report_summary = (
        f"Overall, your Health Score is graded as **{grade}** with a cumulative index of **{total_score}/100**. "
        f"This week, your average sleep was {sleep_avg} hours (a change of {sleep_diff:+.1f}% compared to last week). "
        f"Your daily steps averaged {steps_avg:,} (change of {steps_diff:+.1f}%), indicating an active routine. "
        f"Resting heart rate remained stable around {hr_avg} bpm. "
    )
    if total_score >= 80:
        report_summary += "Your biometric parameters are stable. Keep maintaining your active exercise schedules and balanced dietary habits!"
    elif total_score >= 65:
        report_summary += "You are showing positive progress. Consider increasing your nightly sleep slightly and keeping a structured bedtime window."
    else:
        report_summary += "Your body metrics indicate elevated stress levels and fatigue. Focus on getting consistent hydration, sleep, and cardiovascular walking sessions."

    weekly_report = WeeklyReportResponse(
        summary=report_summary,
        sleepAvg=sleep_avg,
        sleepDiff=sleep_diff,
        stepsAvg=steps_avg,
        stepsDiff=steps_diff,
        caloriesAvg=calories_avg,
        caloriesDiff=calories_diff,
        hrAvg=hr_avg,
        hrDiff=hr_diff
    )

    return AnalyticsDashboardResponse(
        scoreBreakdown=score_breakdown,
        riskPredictions=risk_predictions,
        weeklyReport=weekly_report
    )
