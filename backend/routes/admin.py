from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from bson import ObjectId
from backend.database.mongodb import get_database
from backend.auth.jwt_handler import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin Dashboard"])

# ────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas for Admin CRUD operations
# ────────────────────────────────────────────────────────────────────────────

class UserAdminUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    bloodGroup: Optional[str] = None
    height: Optional[str] = None
    weight: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = "patient"

class DoctorCreateUpdate(BaseModel):
    id: Optional[int] = None # For compatibility with standard list
    name: str
    specialty: str
    hospital: str
    rating: float = 4.5
    reviews: int = 10
    experience: str
    fee: float
    available: bool = True
    nextAvailable: str = "Today, 5:00 PM"
    verified: bool = True
    languages: List[str] = ["English"]
    education: str

class MedicineCreateUpdate(BaseModel):
    id: Optional[str] = None
    name: str
    brand: str
    genericName: str
    category: str
    price: float
    inStock: bool = True
    rx: bool = False
    dosageForm: str = "Tablet"
    activeIngredient: str = ""
    genericAlternatives: List[str] = []

class AppointmentAdminUpdate(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    status: Optional[str] = None # confirmed, cancelled, pending
    type: Optional[str] = None # Video Call, In-Person
    doctor: Optional[str] = None

class ReportAdminUpdate(BaseModel):
    status: str # normal, follow-up, abnormal, approved, rejected, pending_verification

# ────────────────────────────────────────────────────────────────────────────
# Admin Role Authentication Guard
# ────────────────────────────────────────────────────────────────────────────

async def check_admin_user(current_user: dict = Depends(get_current_user)):
    # Support mock account alex.johnson@email.com, admin@healthpoint.com or users with "admin" role
    email = current_user.get("email", "").lower()
    role = current_user.get("role", "patient").lower()
    if role != "admin" and email not in ["alex.johnson@email.com", "admin@healthpoint.com", "admin@email.com"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin permissions required."
        )
    return current_user

# ────────────────────────────────────────────────────────────────────────────
# Seeding Helpers for Admin Collections
# ────────────────────────────────────────────────────────────────────────────

FALLBACK_MEDICINES = [
    {"name": "Paracetamol 500mg", "brand": "Calpol", "genericName": "Acetaminophen", "category": "Pain Relief", "price": 35.0, "inStock": True, "rx": False, "dosageForm": "Tablet", "activeIngredient": "Acetaminophen", "genericAlternatives": ["Tylenol", "Dolo"]},
    {"name": "Vitamin C 1000mg", "brand": "NOW Foods", "genericName": "Ascorbic Acid", "category": "Vitamins", "price": 120.0, "inStock": True, "rx": False, "dosageForm": "Tablet", "activeIngredient": "Vitamin C", "genericAlternatives": ["Limcee"]},
    {"name": "Amoxicillin 500mg", "brand": "Generic", "genericName": "Amoxicillin", "category": "Antibiotics", "price": 180.0, "inStock": True, "rx": True, "dosageForm": "Capsule", "activeIngredient": "Amoxicillin", "genericAlternatives": ["Amoxil", "Mox"]},
    {"name": "Ibuprofen 400mg", "brand": "Advil", "genericName": "Ibuprofen", "category": "Pain Relief", "price": 45.0, "inStock": False, "rx": False, "dosageForm": "Tablet", "activeIngredient": "Ibuprofen", "genericAlternatives": ["Brufen"]},
    {"name": "Melatonin 5mg", "brand": "Natrol", "genericName": "Melatonin", "category": "Sleep Aid", "price": 250.0, "inStock": True, "rx": False, "dosageForm": "Tablet", "activeIngredient": "Melatonin", "genericAlternatives": ["SleepWell"]}
]

async def ensure_collections_seeded(db):
    # Ensure medicines are seeded
    meds_count = await db.medicines.count_documents({})
    if meds_count == 0:
        await db.medicines.insert_many(FALLBACK_MEDICINES)
        
    # Ensure some appointments are seeded globally for the admin view
    appt_count = await db.appointments.count_documents({})
    if appt_count == 0:
        await db.appointments.insert_many([
            {"user_email": "alex.johnson@email.com", "doctor": "Dr. Sarah Mitchell", "specialty": "Cardiology", "date": "2026-06-08", "time": "2:30 PM", "type": "In-Person", "status": "confirmed", "hospital": "City Heart Center"},
            {"user_email": "patient@email.com", "doctor": "Dr. Priya Patel", "specialty": "Pediatrics", "date": "2026-06-10", "time": "11:00 AM", "type": "Video Call", "status": "pending", "hospital": "Children's Health Hub"}
        ])

    # Ensure some orders are seeded globally for revenue dashboard
    orders_count = await db.orders.count_documents({})
    if orders_count == 0:
        await db.orders.insert_many([
            {"user_email": "alex.johnson@email.com", "totalPrice": 450.0, "paymentMethod": "UPI", "status": "Delivered", "date": "2026-06-02 14:20", "items": [{"name": "Atorvastatin 10mg", "price": 450.0, "quantity": 1}]},
            {"user_email": "patient@email.com", "totalPrice": 180.0, "paymentMethod": "Card", "status": "Delivered", "date": "2026-06-05 10:15", "items": [{"name": "Amoxicillin 500mg", "price": 180.0, "quantity": 1}]},
            {"user_email": "alex.johnson@email.com", "totalPrice": 120.0, "paymentMethod": "UPI", "status": "Processing", "date": "2026-06-06 18:45", "items": [{"name": "Vitamin C 1000mg", "price": 120.0, "quantity": 1}]}
        ])

# ────────────────────────────────────────────────────────────────────────────
# Admin Dashboard Analytics API
# ────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard", dependencies=[Depends(check_admin_user)])
async def get_admin_dashboard_stats():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
        
    await ensure_collections_seeded(db)
    
    # Calculate counts
    total_users = await db.users.count_documents({})
    total_doctors = await db.doctors.count_documents({})
    total_medicines = await db.medicines.count_documents({})
    total_appointments = await db.appointments.count_documents({})
    
    # Calculate revenue
    total_revenue = 0.0
    cursor = db.orders.find({})
    async for order in cursor:
        total_revenue += float(order.get("totalPrice", 0))
        
    # Calculate AI Chat inquiries
    ai_queries = 0
    chat_cursor = db.chat_history.find({})
    async for session in chat_cursor:
        ai_queries += len(session.get("messages", []))
        
    # Build revenue monthly chart points (simulated trends based on DB)
    revenue_chart = [
        {"month": "Jan", "amount": int(total_revenue * 0.4)},
        {"month": "Feb", "amount": int(total_revenue * 0.5)},
        {"month": "Mar", "amount": int(total_revenue * 0.75)},
        {"month": "Apr", "amount": int(total_revenue * 0.9)},
        {"month": "May", "amount": int(total_revenue * 0.95)},
        {"month": "Jun", "amount": int(total_revenue)}
    ]
    
    # Recent activities listing
    recent_activities = []
    appts_cursor = db.appointments.find({}).limit(3)
    async for appt in appts_cursor:
        recent_activities.append({
            "type": "appointment",
            "desc": f"Appointment scheduled for {appt.get('user_email')} with {appt.get('doctor')}",
            "time": appt.get("date")
        })
    orders_cursor = db.orders.find({}).limit(2)
    async for ordr in orders_cursor:
        recent_activities.append({
            "type": "order",
            "desc": f"Order of {ordr.get('totalPrice')} placed by {ordr.get('user_email')}",
            "time": ordr.get("date", "").split(" ")[0]
        })
        
    return {
        "stats": {
            "totalUsers": total_users,
            "totalDoctors": total_doctors,
            "totalMedicines": total_medicines,
            "totalAppointments": total_appointments,
            "totalRevenue": total_revenue,
            "aiQueries": ai_queries
        },
        "revenueChart": revenue_chart,
        "recentActivities": recent_activities
    }

# ────────────────────────────────────────────────────────────────────────────
# Users Management
# ────────────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[Any], dependencies=[Depends(check_admin_user)])
async def list_admin_users():
    db = get_database()
    cursor = db.users.find({})
    users = []
    async for u in cursor:
        u["id"] = str(u["_id"])
        del u["_id"]
        if "password_hash" in u:
            del u["password_hash"]
        users.append(u)
    return users

@router.put("/users/{user_id}", dependencies=[Depends(check_admin_user)])
async def update_admin_user(user_id: str, data: UserAdminUpdate):
    db = get_database()
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
        
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_fields:
        await db.users.update_one({"_id": obj_id}, {"$set": update_fields})
        
    updated = await db.users.find_one({"_id": obj_id})
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
        
    updated["id"] = str(updated["_id"])
    del updated["_id"]
    if "password_hash" in updated:
        del updated["password_hash"]
    return updated

@router.delete("/users/{user_id}", dependencies=[Depends(check_admin_user)])
async def delete_admin_user(user_id: str):
    db = get_database()
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
        
    result = await db.users.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "message": "User deleted successfully"}

# ────────────────────────────────────────────────────────────────────────────
# Doctors Management
# ────────────────────────────────────────────────────────────────────────────

@router.get("/doctors", response_model=List[Any], dependencies=[Depends(check_admin_user)])
async def list_admin_doctors():
    db = get_database()
    cursor = db.doctors.find({})
    doctors = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        doctors.append(doc)
    return doctors

@router.post("/doctors", dependencies=[Depends(check_admin_user)])
async def create_admin_doctor(data: DoctorCreateUpdate):
    db = get_database()
    doc_dict = data.model_dump()
    if doc_dict.get("id") is None:
        doc_dict["id"] = int(ObjectId().binary[0]) # random unique integer ID for doctor schema
    res = await db.doctors.insert_one(doc_dict)
    doc_dict["id"] = str(res.inserted_id)
    if "_id" in doc_dict:
        del doc_dict["_id"]
    return doc_dict

@router.put("/doctors/{doctor_id}", dependencies=[Depends(check_admin_user)])
async def update_admin_doctor(doctor_id: str, data: DoctorCreateUpdate):
    db = get_database()
    try:
        obj_id = ObjectId(doctor_id)
    except Exception:
        # Fallback if standard ID is integer
        cursor = db.doctors.find({"id": int(doctor_id)})
        doctors = []
        async for d in cursor:
            doctors.append(d)
        if not doctors:
            raise HTTPException(status_code=404, detail="Doctor not found")
        obj_id = doctors[0]["_id"]

    update_fields = data.model_dump()
    if "id" in update_fields:
        del update_fields["id"]
        
    await db.doctors.update_one({"_id": obj_id}, {"$set": update_fields})
    updated = await db.doctors.find_one({"_id": obj_id})
    updated["id"] = str(updated["_id"])
    del updated["_id"]
    return updated

@router.delete("/doctors/{doctor_id}", dependencies=[Depends(check_admin_user)])
async def delete_admin_doctor(doctor_id: str):
    db = get_database()
    try:
        obj_id = ObjectId(doctor_id)
    except Exception:
        # Fallback if integer ID
        cursor = db.doctors.find({"id": int(doctor_id)})
        doctors = []
        async for d in cursor:
            doctors.append(d)
        if not doctors:
            raise HTTPException(status_code=404, detail="Doctor not found")
        obj_id = doctors[0]["_id"]

    result = await db.doctors.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return {"success": True, "message": "Doctor deleted successfully"}

# ────────────────────────────────────────────────────────────────────────────
# Medicines Catalog Management
# ────────────────────────────────────────────────────────────────────────────

@router.get("/medicines", response_model=List[Any], dependencies=[Depends(check_admin_user)])
async def list_admin_medicines():
    db = get_database()
    await ensure_collections_seeded(db)
    cursor = db.medicines.find({})
    medicines = []
    async for med in cursor:
        med["id"] = str(med["_id"])
        del med["_id"]
        medicines.append(med)
    return medicines

@router.post("/medicines", dependencies=[Depends(check_admin_user)])
async def create_admin_medicine(data: MedicineCreateUpdate):
    db = get_database()
    med_dict = data.model_dump()
    res = await db.medicines.insert_one(med_dict)
    med_dict["id"] = str(res.inserted_id)
    if "_id" in med_dict:
        del med_dict["_id"]
    return med_dict

@router.put("/medicines/{med_id}", dependencies=[Depends(check_admin_user)])
async def update_admin_medicine(med_id: str, data: MedicineCreateUpdate):
    db = get_database()
    try:
        obj_id = ObjectId(med_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid medicine ID format")
        
    update_fields = data.model_dump()
    if "id" in update_fields:
        del update_fields["id"]
        
    await db.medicines.update_one({"_id": obj_id}, {"$set": update_fields})
    updated = await db.medicines.find_one({"_id": obj_id})
    if not updated:
        raise HTTPException(status_code=404, detail="Medicine not found")
    updated["id"] = str(updated["_id"])
    del updated["_id"]
    return updated

@router.delete("/medicines/{med_id}", dependencies=[Depends(check_admin_user)])
async def delete_admin_medicine(med_id: str):
    db = get_database()
    try:
        obj_id = ObjectId(med_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid medicine ID format")
        
    result = await db.medicines.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return {"success": True, "message": "Medicine deleted successfully"}

# ────────────────────────────────────────────────────────────────────────────
# Appointments Control
# ────────────────────────────────────────────────────────────────────────────

@router.get("/appointments", response_model=List[Any], dependencies=[Depends(check_admin_user)])
async def list_admin_appointments():
    db = get_database()
    await ensure_collections_seeded(db)
    cursor = db.appointments.find({})
    appointments = []
    async for appt in cursor:
        appt["id"] = str(appt["_id"])
        del appt["_id"]
        appointments.append(appt)
    return appointments

@router.put("/appointments/{appt_id}", dependencies=[Depends(check_admin_user)])
async def update_admin_appointment(appt_id: str, data: AppointmentAdminUpdate):
    db = get_database()
    try:
        obj_id = ObjectId(appt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid appointment ID format")
        
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_fields:
        await db.appointments.update_one({"_id": obj_id}, {"$set": update_fields})
        
    updated = await db.appointments.find_one({"_id": obj_id})
    if not updated:
        raise HTTPException(status_code=404, detail="Appointment not found")
    updated["id"] = str(updated["_id"])
    del updated["_id"]
    return updated

@router.delete("/appointments/{appt_id}", dependencies=[Depends(check_admin_user)])
async def delete_admin_appointment(appt_id: str):
    db = get_database()
    try:
        obj_id = ObjectId(appt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid appointment ID format")
        
    result = await db.appointments.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"success": True, "message": "Appointment deleted successfully"}

# ────────────────────────────────────────────────────────────────────────────
# AI Chat Monitoring & Logs
# ────────────────────────────────────────────────────────────────────────────

@router.get("/ai-monitoring", response_model=List[Any], dependencies=[Depends(check_admin_user)])
async def list_admin_ai_chats():
    db = get_database()
    cursor = db.chat_history.find({})
    sessions = []
    async for session in cursor:
        session["id"] = str(session["_id"])
        del session["_id"]
        # Simplify list return for monitor view
        messages = session.get("messages", [])
        last_msg = messages[-1]["content"] if messages else "No conversation started"
        session["totalInteractions"] = len(messages)
        session["lastMessage"] = last_msg
        sessions.append(session)
    return sessions

# ────────────────────────────────────────────────────────────────────────────
# Reports and Record Management
# ────────────────────────────────────────────────────────────────────────────

@router.get("/reports", response_model=List[Any], dependencies=[Depends(check_admin_user)])
async def list_admin_reports_and_prescriptions():
    db = get_database()
    
    # 1. Fetch user health records
    records_cursor = db.records.find({})
    reports = []
    async for r in records_cursor:
        r["id"] = str(r["_id"])
        del r["_id"]
        r["reportType"] = "Medical Record"
        reports.append(r)
        
    # 2. Fetch user pharmacy prescription uploads
    pres_cursor = db.prescriptions.find({})
    async for p in pres_cursor:
        p["id"] = str(p["_id"])
        del p["_id"]
        p["reportType"] = "Prescription Upload"
        p["title"] = p.get("filename", "Prescription Image")
        p["category"] = "Pharmacy Shop"
        p["doctor"] = "Self Uploaded"
        p["hospital"] = "Cloudinary Verification"
        reports.append(p)
        
    return reports

@router.put("/reports/{report_id}", dependencies=[Depends(check_admin_user)])
async def update_admin_report_status(report_id: str, data: ReportAdminUpdate):
    db = get_database()
    try:
        obj_id = ObjectId(report_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid report ID format")
        
    # Check if it is in records
    record = await db.records.find_one({"_id": obj_id})
    if record:
        await db.records.update_one({"_id": obj_id}, {"$set": {"status": data.status}})
        updated = await db.records.find_one({"_id": obj_id})
        updated["id"] = str(updated["_id"])
        del updated["_id"]
        updated["reportType"] = "Medical Record"
        return updated
        
    # Check if it is in prescriptions
    pres = await db.prescriptions.find_one({"_id": obj_id})
    if pres:
        await db.prescriptions.update_one({"_id": obj_id}, {"$set": {"status": data.status}})
        updated = await db.prescriptions.find_one({"_id": obj_id})
        updated["id"] = str(updated["_id"])
        del updated["_id"]
        updated["reportType"] = "Prescription Upload"
        updated["title"] = updated.get("filename", "Prescription Image")
        updated["category"] = "Pharmacy Shop"
        return updated
        
    raise HTTPException(status_code=404, detail="Report or prescription upload not found")
