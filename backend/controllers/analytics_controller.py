import numpy as np
from sklearn.linear_model import LogisticRegression
from fastapi import HTTPException, status
from database.mongodb import get_database
from models.analytics import (
    HealthScoreBreakdown,
    RiskPredictionCard,
    WeeklyReportResponse,
    AnalyticsDashboardResponse,
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

        X_cardio = np.random.uniform(low=[18, 50, 90, 16], high=[80, 110, 180, 42], size=(n_samples, 4))
        y_cardio = []
        for x in X_cardio:
            age, hr, bp, bmi = x
            prob = 0.05
            if bp > 140:
                prob += 0.4
            if hr > 90:
                prob += 0.2
            if bmi > 30:
                prob += 0.2
            if age > 55:
                prob += 0.15
            y_cardio.append(1 if np.random.rand() < prob else 0)
        y_cardio = np.array(y_cardio)

        X_diab = np.random.uniform(low=[18, 16, 1200, 1000], high=[80, 42, 3800, 16000], size=(n_samples, 4))
        y_diab = []
        for x in X_diab:
            age, bmi, cal, steps = x
            prob = 0.05
            if bmi > 28:
                prob += 0.4
            if cal > 2800:
                prob += 0.25
            if steps < 5000:
                prob += 0.2
            if age > 50:
                prob += 0.1
            y_diab.append(1 if np.random.rand() < prob else 0)
        y_diab = np.array(y_diab)

        X_fatigue = np.random.uniform(low=[18, 4, 50, 16], high=[80, 10, 110, 42], size=(n_samples, 4))
        y_fatigue = []
        for x in X_fatigue:
            age, sleep, hr, bmi = x
            prob = 0.05
            if sleep < 6.0:
                prob += 0.5
            if hr > 85:
                prob += 0.25
            if bmi > 30:
                prob += 0.15
            y_fatigue.append(1 if np.random.rand() < prob else 0)
        y_fatigue = np.array(y_fatigue)

        self.cardio_model = LogisticRegression(solver="liblinear").fit(X_cardio, y_cardio)
        self.diabetes_model = LogisticRegression(solver="liblinear").fit(X_diab, y_diab)
        self.fatigue_model = LogisticRegression(solver="liblinear").fit(X_fatigue, y_fatigue)
        print("Scikit-Learn Health Classifier models successfully trained and loaded.")


def _valid_pos(val) -> bool:
    return isinstance(val, (int, float)) and val > 0


def _compute_history_avg_and_diff(history_list: list, field: str, current_val):
    """Compute average and percentage delta strictly from real stored history entries."""
    vals = []
    for entry in (history_list or []):
        v = entry.get(field) if isinstance(entry, dict) else None
        if isinstance(v, (int, float)) and v > 0:
            vals.append(float(v))
    if not vals and _valid_pos(current_val):
        return round(float(current_val), 1), None
    if not vals:
        return None, None
    avg_val = round(sum(vals) / len(vals), 1)
    diff_val = None
    if len(vals) >= 2 and vals[-2] > 0:
        diff_val = round(((vals[-1] - vals[-2]) / vals[-2]) * 100.0, 1)
    return avg_val, diff_val


async def get_analytics_dashboard_controller(email: str):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    user = await db.users.find_one({"email": email}) or {}
    metrics = await db.metrics.find_one({"user_email": email}) or {}
    history = metrics.get("history", {}) if isinstance(metrics.get("history"), dict) else {}

    age = user.get("age") if isinstance(user.get("age"), (int, float)) and user.get("age") > 0 else None

    hr_current = metrics.get("heartRate", {}).get("current")
    bp_sys = metrics.get("bloodPressure", {}).get("systolic")
    bp_dia = metrics.get("bloodPressure", {}).get("diastolic")
    bmi_val = metrics.get("bmi", {}).get("value")
    sleep_hrs = metrics.get("sleep", {}).get("hours")
    steps_count = metrics.get("steps", {}).get("count")
    cal_intake = metrics.get("calories", {}).get("intake")

    missing_fields = []
    sub_scores = []

    sleep_score = None
    if _valid_pos(sleep_hrs):
        sleep_score = int(max(0, min(100, 100 - (abs(8.0 - float(sleep_hrs)) * 15))))
        sub_scores.append(sleep_score)
    else:
        missing_fields.append("Sleep duration")

    activity_score = None
    if isinstance(steps_count, (int, float)) and steps_count > 0:
        activity_score = int(min(100, (float(steps_count) / 10000.0) * 100))
        sub_scores.append(activity_score)
    else:
        missing_fields.append("Daily steps")

    heart_score = None
    if _valid_pos(hr_current):
        heart_score = int(max(0, 100 - (abs(70 - float(hr_current)) * 2)))
        sub_scores.append(heart_score)
    else:
        missing_fields.append("Heart rate")

    bp_score = None
    if _valid_pos(bp_sys) and _valid_pos(bp_dia):
        bp_score = int(max(0, 100 - (abs(120 - float(bp_sys)) * 2)))
        sub_scores.append(bp_score)
    else:
        missing_fields.append("Blood pressure")

    bmi_score = None
    if _valid_pos(bmi_val):
        b = float(bmi_val)
        if 18.5 <= b <= 25.0:
            bmi_score = 100
        elif b > 25.0:
            bmi_score = int(max(0, 100 - ((b - 25.0) * 5)))
        else:
            bmi_score = int(max(0, 100 - ((18.5 - b) * 8)))
        sub_scores.append(bmi_score)
    else:
        missing_fields.append("Height & weight (BMI)")

    if sub_scores:
        total_score = int(round(sum(sub_scores) / len(sub_scores)))
        if total_score >= 85:
            grade = "Optimal"
        elif total_score >= 70:
            grade = "Good"
        elif total_score >= 50:
            grade = "Fair"
        else:
            grade = "Needs Attention"
        data_available = True
    else:
        total_score = None
        grade = "No data available"
        data_available = False

    score_breakdown = HealthScoreBreakdown(
        totalScore=total_score,
        sleepScore=sleep_score,
        activityScore=activity_score,
        heartScore=heart_score,
        bpScore=bp_score,
        bmiScore=bmi_score,
        grade=grade,
        dataAvailable=data_available,
        missingFields=missing_fields,
    )

    ml_manager = HealthClassifierManager.get_instance()

    # Cardio Risk: requires [age, heart_rate, systolic_bp, bmi]
    cardio_missing = []
    if age is None:
        cardio_missing.append("Age")
    if not _valid_pos(hr_current):
        cardio_missing.append("Heart rate")
    if not _valid_pos(bp_sys):
        cardio_missing.append("Systolic blood pressure")
    if not _valid_pos(bmi_val):
        cardio_missing.append("BMI")

    if not cardio_missing:
        cardio_prob = float(ml_manager.cardio_model.predict_proba(np.array([[age, hr_current, bp_sys, bmi_val]]))[0][1] * 100)
        cardio_level = "High" if cardio_prob > 60 else ("Medium" if cardio_prob > 25 else "Low")
        cardio_color = "red" if cardio_level == "High" else ("yellow" if cardio_level == "Medium" else "green")
        cardio_factors = []
        if bp_sys > 130:
            cardio_factors.append("Elevated Blood Pressure")
        if hr_current > 80:
            cardio_factors.append("Elevated Resting Heart Rate")
        if bmi_val > 28:
            cardio_factors.append("Elevated BMI")
        if not cardio_factors:
            cardio_factors.append("Recorded vitals within baseline range")
        cardio_recs = ["Discuss cardiovascular screening targets with your physician."]
        if bp_sys > 130:
            cardio_recs.append("Monitor blood pressure regularly and limit excess sodium.")
        cardio_card = RiskPredictionCard(
            name="Cardiovascular Health",
            probability=round(cardio_prob, 1),
            level=cardio_level,
            color=cardio_color,
            factors=cardio_factors,
            recommendations=cardio_recs,
        )
    else:
        cardio_card = RiskPredictionCard(
            name="Cardiovascular Health",
            probability=None,
            level="Insufficient Data",
            color="slate",
            factors=[f"Missing recorded measurements: {', '.join(cardio_missing)}"],
            recommendations=["Provide your profile age/height/weight and log heart rate & blood pressure on the Dashboard."],
        )

    # Diabetes Risk: requires [age, bmi, calorie_intake, steps]
    diab_missing = []
    if age is None:
        diab_missing.append("Age")
    if not _valid_pos(bmi_val):
        diab_missing.append("BMI")
    if not _valid_pos(cal_intake):
        diab_missing.append("Calorie intake")
    if not _valid_pos(steps_count):
        diab_missing.append("Steps")

    if not diab_missing:
        diab_prob = float(ml_manager.diabetes_model.predict_proba(np.array([[age, bmi_val, cal_intake, steps_count]]))[0][1] * 100)
        diab_level = "High" if diab_prob > 60 else ("Medium" if diab_prob > 25 else "Low")
        diab_color = "red" if diab_level == "High" else ("yellow" if diab_level == "Medium" else "green")
        diab_factors = []
        if bmi_val > 27:
            diab_factors.append("Elevated BMI")
        if cal_intake > 2500:
            diab_factors.append("High Calorie Intake")
        if steps_count < 6000:
            diab_factors.append("Low Step Count")
        if not diab_factors:
            diab_factors.append("Recorded metabolic inputs within baseline range")
        diab_card = RiskPredictionCard(
            name="Type 2 Diabetes",
            probability=round(diab_prob, 1),
            level=diab_level,
            color=diab_color,
            factors=diab_factors,
            recommendations=["Maintain balanced nutrition and regular physical activity."],
        )
    else:
        diab_card = RiskPredictionCard(
            name="Type 2 Diabetes",
            probability=None,
            level="Insufficient Data",
            color="slate",
            factors=[f"Missing recorded measurements: {', '.join(diab_missing)}"],
            recommendations=["Log meals/calorie intake, daily steps, and height/weight to enable this estimate."],
        )

    # Fatigue Risk: requires [age, sleep_hours, heart_rate, bmi]
    fatigue_missing = []
    if age is None:
        fatigue_missing.append("Age")
    if not _valid_pos(sleep_hrs):
        fatigue_missing.append("Sleep duration")
    if not _valid_pos(hr_current):
        fatigue_missing.append("Heart rate")
    if not _valid_pos(bmi_val):
        fatigue_missing.append("BMI")

    if not fatigue_missing:
        fatigue_prob = float(ml_manager.fatigue_model.predict_proba(np.array([[age, sleep_hrs, hr_current, bmi_val]]))[0][1] * 100)
        fatigue_level = "High" if fatigue_prob > 60 else ("Medium" if fatigue_prob > 25 else "Low")
        fatigue_color = "red" if fatigue_level == "High" else ("yellow" if fatigue_level == "Medium" else "green")
        fatigue_factors = []
        if sleep_hrs < 6.5:
            fatigue_factors.append("Short Sleep Duration")
        if hr_current > 80:
            fatigue_factors.append("Elevated Resting Pulse")
        if not fatigue_factors:
            fatigue_factors.append("Recorded sleep and pulse within baseline range")
        fatigue_card = RiskPredictionCard(
            name="Sleep Apnea & Chronic Fatigue",
            probability=round(fatigue_prob, 1),
            level=fatigue_level,
            color=fatigue_color,
            factors=fatigue_factors,
            recommendations=["Maintain a consistent sleep schedule of 7–9 hours nightly."],
        )
    else:
        fatigue_card = RiskPredictionCard(
            name="Sleep Apnea & Chronic Fatigue",
            probability=None,
            level="Insufficient Data",
            color="slate",
            factors=[f"Missing recorded measurements: {', '.join(fatigue_missing)}"],
            recommendations=["Log your sleep duration, heart rate, and profile metrics to enable this estimate."],
        )

    sleep_avg, sleep_diff = _compute_history_avg_and_diff(history.get("sleep"), "hours", sleep_hrs)
    steps_avg, steps_diff = _compute_history_avg_and_diff(history.get("steps"), "count", steps_count)
    calories_avg, calories_diff = _compute_history_avg_and_diff(history.get("calories"), "intake", cal_intake)
    hr_avg, hr_diff = _compute_history_avg_and_diff(history.get("heartRate"), "current", hr_current)

    if not data_available:
        report_summary = (
            "No physiological vitals have been recorded yet. "
            "Log your heart rate, blood pressure, sleep, steps, and profile height/weight to generate an accurate health summary."
        )
    else:
        parts = [f"Your current Health Score based on recorded vitals is **{total_score}/100 ({grade})**."]
        if sleep_avg is not None:
            parts.append(f"Recorded sleep averages {sleep_avg} hours.")
        if steps_avg is not None:
            parts.append(f"Recorded daily steps average {int(steps_avg):,}.")
        if hr_avg is not None:
            parts.append(f"Recorded resting heart rate averages {int(hr_avg)} bpm.")
        if missing_fields:
            parts.append(f"Still unrecorded: {', '.join(missing_fields)}.")
        report_summary = " ".join(parts)

    weekly_report = WeeklyReportResponse(
        summary=report_summary,
        sleepAvg=sleep_avg,
        sleepDiff=sleep_diff,
        stepsAvg=steps_avg,
        stepsDiff=steps_diff,
        caloriesAvg=calories_avg,
        caloriesDiff=calories_diff,
        hrAvg=hr_avg,
        hrDiff=hr_diff,
    )

    return AnalyticsDashboardResponse(
        scoreBreakdown=score_breakdown,
        riskPredictions=[cardio_card, diab_card, fatigue_card],
        weeklyReport=weekly_report,
    )
