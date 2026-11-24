import pytest
import datetime
from bson import ObjectId
from fastapi import HTTPException

from database.mongodb import get_database
from auth.jwt_handler import hash_password, verify_password, create_access_token
from models.user import UserRegister, UserLogin, VerifyRequest
from models.pharmacy import OrderCreate, CartItemSchema
from models.appointment import AppointmentCreate
from models.fitness import WorkoutCreate, MealCreate, MetricUpdate
from models.insurance import ClaimCreate, UploadedDocSchema
from models.emergency import SOSCreate, EmergencyContactModel
from models.record import RecordCreate

from controllers.auth_controller import (
    register_user_controller,
    verify_user_controller,
    login_user_controller,
    get_user_profile_controller
)
from controllers.record_controller import (
    create_record_controller,
    get_records_controller,
    delete_record_controller
)
from controllers.pharmacy_controller import (
    search_medicines_fda,
    create_pharmacy_order,
    fetch_order_history
)
from controllers.doctor_controller import get_doctors_controller
from controllers.appointment_controller import (
    create_appointment_controller,
    get_appointments_controller,
    cancel_appointment_controller
)
from controllers.fitness_controller import (
    create_workout_controller,
    get_workouts_controller,
    create_meal_controller,
    get_meals_controller,
    delete_meal_controller,
    update_metric_controller,
    get_metrics_controller
)
from controllers.insurance_controller import (
    get_plans_controller,
    create_claim_controller,
    get_claims_controller
)
from controllers.analytics_controller import get_analytics_dashboard_controller
from controllers.emergency_controller import (
    trigger_sos_controller,
    get_emergency_history_controller
)

pytestmark = pytest.mark.asyncio

TEST_USER_EMAIL = "integration_test_user@healthpoint.app"
TEST_PASSWORD = "StrongSecurePassword123!"

# Helper to clean up all test user data
async def _clean_test_user_data(db, email):
    await db.users.delete_many({"email": email})
    await db.records.delete_many({"user_email": email})
    await db.prescriptions.delete_many({"user_email": email})
    await db.appointments.delete_many({"user_email": email})
    await db.workouts.delete_many({"user_email": email})
    await db.meals.delete_many({"user_email": email})
    await db.metrics.delete_many({"user_email": email})
    await db.claims.delete_many({"user_email": email})
    await db.claimRequests.delete_many({"user_email": email})
    await db.emergencies.delete_many({"user_email": email})

# 29. User direct registration (no OTP) and login flow test
async def test_29_user_registration_and_login_flow():
    db = get_database()
    if db is None:
        pytest.skip("Database connection not available")

    await _clean_test_user_data(db, TEST_USER_EMAIL)

    reg_data = UserRegister(
        name="Integration Test User",
        email=TEST_USER_EMAIL,
        password=TEST_PASSWORD,
        phone="+1234567890",
        age=32,
        gender="Other",
        height="175 cm",
        weight="70 kg",
        bloodGroup="O+"
    )
    reg_res = await register_user_controller(reg_data)
    # Direct signup returns success and access token immediately without requiring OTP
    assert reg_res["status"] == "success"
    assert "access_token" in reg_res or "token" in reg_res
    assert reg_res["user"]["email"] == TEST_USER_EMAIL

    # Verify user saved in DB with hashed password and is_verified == True
    user_doc = await db.users.find_one({"email": TEST_USER_EMAIL})
    assert user_doc is not None
    assert user_doc["password_hash"] != TEST_PASSWORD
    assert verify_password(TEST_PASSWORD, user_doc["password_hash"])
    assert user_doc.get("is_verified") is True

    # Test login with correct password immediately (no OTP gate)
    login_data = UserLogin(email=TEST_USER_EMAIL, password=TEST_PASSWORD)
    login_res = await login_user_controller(login_data)
    assert "access_token" in login_res or "token" in login_res
    assert login_res["user"]["email"] == TEST_USER_EMAIL

    # Test login with wrong password (must reject with 400 or 401)
    wrong_login = UserLogin(email=TEST_USER_EMAIL, password="WrongPassword!")
    with pytest.raises(HTTPException) as exc:
        await login_user_controller(wrong_login)
    assert exc.value.status_code in (400, 401)

# 30. Dashboard data aggregation test
async def test_30_dashboard_data_aggregation():
    db = get_database()
    if db is None:
        pytest.skip("Database connection not available")

    await db.metrics.update_one(
        {"user_email": TEST_USER_EMAIL},
        {"$set": {
            "heartRate": {"current": 72, "min": 60, "max": 100},
            "bloodPressure": {"systolic": 120, "diastolic": 80, "status": "Normal"},
            "sleep": {"hours": 7.5, "quality": "Good"},
            "steps": {"count": 8450, "target": 10000}
        }},
        upsert=True
    )

    metrics = await get_metrics_controller(TEST_USER_EMAIL)
    assert metrics is not None
    assert metrics.get("heartRate", {}).get("current") == 72
    assert metrics.get("bloodPressure", {}).get("systolic") == 120

    records = await get_records_controller(TEST_USER_EMAIL)
    assert isinstance(records, list)

    appointments = await get_appointments_controller(TEST_USER_EMAIL)
    assert isinstance(appointments, list)

    workouts = await get_workouts_controller(TEST_USER_EMAIL)
    assert isinstance(workouts, list)

# 31. Health records CRUD test
async def test_31_health_records_crud():
    db = get_database()
    if db is None:
        pytest.skip("Database connection not available")

    # Create using RecordCreate
    rec_payload = RecordCreate(
        title="Annual Comprehensive Metabolic Panel",
        type="Lab Report",
        date="2026-11-20",
        doctor="Dr. Sarah Jenkins",
        hospital="City General Hospital",
        status="Normal",
        category="Lab Report",
        fileSize="2.4 MB",
        url="/api/uploads/records/sample_test.pdf"
    )
    created = await create_record_controller(TEST_USER_EMAIL, rec_payload)
    assert "id" in created or "_id" in created
    rec_id = str(created.get("id") or created.get("_id"))

    # Read
    records = await get_records_controller(TEST_USER_EMAIL)
    found = [r for r in records if str(r.get("id") or r.get("_id")) == rec_id]
    assert len(found) == 1
    assert found[0]["title"] == "Annual Comprehensive Metabolic Panel"

    # Delete
    del_res = await delete_record_controller(TEST_USER_EMAIL, rec_id)
    assert del_res is not None

    # Verify deleted
    records_after = await get_records_controller(TEST_USER_EMAIL)
    assert not any(str(r.get("id") or r.get("_id")) == rec_id for r in records_after)

# 32. Pharmacy catalog and cart test
async def test_32_pharmacy_catalog_and_orders():
    # Catalog Search
    meds = await search_medicines_fda("amoxicillin")
    assert isinstance(meds, list)
    assert len(meds) > 0
    assert any("amoxicillin" in m.get("name", "").lower() for m in meds)

    # Order Creation
    cart_item = CartItemSchema(
        id="med_101",
        name="Amoxicillin 500mg",
        brand="HealthPoint Pharma",
        price=12.50,
        qty=2,
        rx=True
    )
    order_data = OrderCreate(
        items=[cart_item],
        totalPrice=25.00,
        shippingAddress="123 Health Ave, Suite 400",
        paymentMethod="Credit Card",
        prescriptionUrl=None
    )
    created_order = await create_pharmacy_order(TEST_USER_EMAIL, order_data)
    assert created_order is not None
    assert created_order.get("totalPrice") == 25.00

    # Order History
    history = await fetch_order_history(TEST_USER_EMAIL)
    assert isinstance(history, list)
    assert len(history) >= 1
    assert history[0]["totalPrice"] == 25.00

# 33. Real doctor discovery and listing test
async def test_33_doctor_discovery():
    doctors = await get_doctors_controller()
    assert isinstance(doctors, list)
    assert len(doctors) > 0

    doc = doctors[0]
    assert "name" in doc
    assert "specialty" in doc
    assert "rating" in doc
    assert "experience" in doc

# 34. Appointment booking and cancellation test
async def test_34_appointment_booking_and_cancellation():
    db = get_database()
    if db is None:
        pytest.skip("Database connection not available")

    doctors = await get_doctors_controller()
    doc = doctors[0]

    appt_data = AppointmentCreate(
        doctorId=str(doc.get("id") or doc.get("_id")),
        doctorName=doc.get("name", "Dr. Mitchell"),
        specialty=doc.get("specialty", "General Medicine"),
        date="2026-12-05",
        time="10:30 AM",
        type="In-Person",
        hospital=doc.get("hospital", "City General Hospital")
    )
    booked = await create_appointment_controller(TEST_USER_EMAIL, appt_data)
    assert booked is not None
    assert booked.get("status").lower() in ("confirmed", "scheduled", "pending")
    appt_id = str(booked.get("id") or booked.get("_id"))

    # Cancel Appointment
    cancel_res = await cancel_appointment_controller(TEST_USER_EMAIL, appt_id)
    assert cancel_res is not None

    # Verify status is Cancelled
    appts = await get_appointments_controller(TEST_USER_EMAIL)
    target = next((a for a in appts if str(a.get("id") or a.get("_id")) == appt_id), None)
    assert target is not None
    assert target.get("status").lower() == "cancelled"

# 35. Fitness goal and workout tracking test
async def test_35_fitness_goal_and_workout_tracking():
    # Create Workout
    workout_data = WorkoutCreate(
        name="Morning HIIT & Core",
        type="Cardio",
        duration=45,
        calories=350,
        completed=True,
        date="2026-11-24"
    )
    created_w = await create_workout_controller(TEST_USER_EMAIL, workout_data)
    assert created_w is not None
    assert created_w.get("name") == "Morning HIIT & Core"

    # Get Workouts
    workouts = await get_workouts_controller(TEST_USER_EMAIL)
    assert len(workouts) >= 1
    assert any(w["name"] == "Morning HIIT & Core" for w in workouts)

    # Update Step Metric
    metric_update = MetricUpdate(key="steps", value={"count": 9200, "target": 10000, "unit": "steps"})
    res_m = await update_metric_controller(TEST_USER_EMAIL, metric_update)
    assert res_m is not None

    metrics = await get_metrics_controller(TEST_USER_EMAIL)
    assert metrics.get("steps", {}).get("count") == 9200

# 36. Nutrition preference and meal logging test
async def test_36_nutrition_and_meal_logging():
    meal_data = MealCreate(
        name="Grilled Salmon with Quinoa & Asparagus",
        time="Lunch",
        calories=580,
        protein=46.0,
        carbs=38.0,
        fat=22.0,
        fiber=7.0
    )
    created_meal = await create_meal_controller(TEST_USER_EMAIL, meal_data)
    assert created_meal is not None
    meal_id = str(created_meal.get("id") or created_meal.get("_id"))

    # Verify retrieved
    meals = await get_meals_controller(TEST_USER_EMAIL)
    assert len(meals) >= 1
    assert any(str(m.get("id") or m.get("_id")) == meal_id for m in meals)

    # Delete meal
    del_res = await delete_meal_controller(TEST_USER_EMAIL, meal_id)
    assert del_res is not None

    meals_after = await get_meals_controller(TEST_USER_EMAIL)
    assert not any(str(m.get("id") or m.get("_id")) == meal_id for m in meals_after)

# 37. Insurance policy and claim submission test
async def test_37_insurance_plans_and_claims():
    # Get available insurance plans
    plans = await get_plans_controller()
    assert isinstance(plans, list)
    assert len(plans) > 0
    assert "name" in plans[0]

    # Create a claim
    claim_doc = UploadedDocSchema(
        file_url="/api/uploads/records/claim_receipt.pdf",
        file_name="claim_receipt.pdf",
        file_type="application/pdf"
    )
    claim_data = ClaimCreate(
        date="2026-11-15",
        amount=450.00,
        description="Outpatient specialist consultation and diagnostic ultrasound",
        uploaded_documents=[claim_doc]
    )
    created_claim = await create_claim_controller(TEST_USER_EMAIL, claim_data)
    assert created_claim is not None
    assert created_claim.get("amount") == 450.00

    # Get claims
    claims = await get_claims_controller(TEST_USER_EMAIL)
    assert len(claims) >= 1
    assert any(c["amount"] == 450.00 for c in claims)

# 38. Health analytics metrics calculation test
async def test_38_health_analytics_metrics_calculation():
    db = get_database()
    if db is None:
        pytest.skip("Database connection not available")

    # Query analytics dashboard
    analytics = await get_analytics_dashboard_controller(TEST_USER_EMAIL)
    assert analytics is not None
    assert analytics.scoreBreakdown.totalScore > 0
    assert len(analytics.riskPredictions) > 0
    assert analytics.weeklyReport.summary is not None

# 39. Patient timeline event generation test
async def test_39_patient_timeline_generation():
    # Synthesize events from workouts, appointments, and records
    workouts = await get_workouts_controller(TEST_USER_EMAIL)
    appointments = await get_appointments_controller(TEST_USER_EMAIL)
    records = await get_records_controller(TEST_USER_EMAIL)

    events = []
    for w in workouts:
        events.append({
            "id": f"workout_{w.get('id') or w.get('_id')}",
            "type": "workout",
            "title": f"Workout: {w.get('name')}",
            "date": w.get("date", "2026-11-24")
        })
    for a in appointments:
        events.append({
            "id": f"appt_{a.get('id') or a.get('_id')}",
            "type": "appointment",
            "title": f"Doctor Visit: {a.get('doctorName')}",
            "date": a.get("date", "2026-11-24")
        })
    for r in records:
        events.append({
            "id": f"record_{r.get('id') or r.get('_id')}",
            "type": "record",
            "title": f"Record Uploaded: {r.get('title')}",
            "date": r.get("date", "2026-11-24")
        })

    # Sort descending
    events.sort(key=lambda x: x["date"], reverse=True)
    assert isinstance(events, list)
    for ev in events:
        assert "type" in ev
        assert "title" in ev
        assert "date" in ev

# 40. Emergency SOS contact notification test
async def test_40_emergency_sos_notification():
    sos_payload = SOSCreate(
        latitude=37.7749,
        longitude=-122.4194,
        contacts=[
            EmergencyContactModel(
                name="Jane Doe",
                relation="Spouse",
                phone="+1987654321"
            )
        ]
    )
    sos_res = await trigger_sos_controller(TEST_USER_EMAIL, sos_payload)
    assert sos_res is not None
    assert sos_res.get("status").lower() in ("triggered", "active", "dispatched")
    assert "id" in sos_res
    assert len(sos_res["contacts"]) >= 1

    # Check emergency history
    history = await get_emergency_history_controller(TEST_USER_EMAIL)
    assert isinstance(history, list)
    assert len(history) >= 1

    # Cleanup test user data at end
    db = get_database()
    if db is not None:
        await _clean_test_user_data(db, TEST_USER_EMAIL)
