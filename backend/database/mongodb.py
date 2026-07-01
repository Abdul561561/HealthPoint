import os
import urllib.parse
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load .env from backend/ directory using absolute path — works regardless of working directory
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)
else:
    load_dotenv()

def sanitize_mongodb_uri(uri: str) -> str:
    if not uri:
        return uri
    if uri.startswith("mongodb+srv://") or uri.startswith("mongodb://"):
        prefix = "mongodb+srv://" if uri.startswith("mongodb+srv://") else "mongodb://"
        rest = uri[len(prefix):]
        if "@" in rest:
            parts = rest.split("@")
            host_part = parts[-1]
            cred_part = "@".join(parts[:-1])
            if ":" in cred_part:
                user, pwd = cred_part.split(":", 1)
                pwd_unescaped = urllib.parse.unquote(pwd)
                pwd_escaped = urllib.parse.quote_plus(pwd_unescaped)
                return f"{prefix}{user}:{pwd_escaped}@{host_part}"
    return uri

# MongoDB URI Configuration
RAW_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_URI = sanitize_mongodb_uri(RAW_URI)
DB_NAME = os.getenv("DB_NAME", "healthpoint")

client = None
db = None

async def connect_to_mongo():
    global client, db
    print(f"Connecting to MongoDB at: {MONGODB_URI.split('@')[-1]}")
    try:
        # Try with certifi first (proper TLS verification)
        import certifi
        client = AsyncIOMotorClient(MONGODB_URI, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=5000)
        db = client[DB_NAME]
        await client.admin.command('ping')
        print("Successfully connected to MongoDB (certifi TLS).")
    except Exception as e1:
        print(f"certifi TLS attempt failed. Trying tlsAllowInvalidCertificates fallback...")
        try:
            # Fallback: allow any certificate (confirmed working with Atlas on this cluster)
            client = AsyncIOMotorClient(MONGODB_URI, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=5000)
            db = client[DB_NAME]
            await client.admin.command('ping')
            print("Successfully connected to MongoDB (tlsAllowInvalidCertificates).")
        except Exception as e2:
            print("\n" + "!"*60)
            print("  CRITICAL DATABASE ERROR: Failed to connect to MongoDB.")
            print(f"  Error details: {e2}")
            print("  Please check that your database URI is valid and that")
            print("  your IP address is whitelisted in MongoDB Atlas.")
            print("!"*60 + "\n")
            db = None
    
    if db is not None:
        # Create indexes for fast queries
        await create_indexes()
        # Seed initial data
        await seed_doctors()
        await seed_insurance_plans()

async def create_indexes():
    """Create MongoDB indexes for all major collections."""
    global db
    if db is None:
        return
    try:
        collections_to_index = [
            'users', 'metrics', 'appointments', 'records',
            'workouts', 'meals', 'notifications', 'settings',
            'claims', 'savedPlans', 'aiChatHistory'
        ]
        for col in collections_to_index:
            await db[col].create_index('user_email')
        # Special compound index for notifications
        await db['notifications'].create_index([('user_email', 1), ('read', 1)])
        await db['appointments'].create_index([('user_email', 1), ('date', -1)])
        await db['records'].create_index([('user_email', 1), ('date', -1)])
        print("MongoDB indexes created/verified.")
    except Exception as e:
        print(f"Index creation warning (non-fatal): {e}")


async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("Closed MongoDB connection.")

def get_database():
    global db
    return db

async def seed_doctors():
    global db
    if db is None:
        return
        
    doctors_count = await db.doctors.count_documents({})
    if doctors_count == 0:
        print("Seeding default doctors into MongoDB...")
        default_doctors = [
            {
                "id": 1,
                "name": "Dr. Sarah Mitchell",
                "specialty": "Cardiologist",
                "hospital": "City Heart Center",
                "rating": 4.9,
                "reviews": 284,
                "experience": "12 yrs",
                "fee": 1200,
                "available": True,
                "nextAvailable": "Today, 2:30 PM",
                "verified": True,
                "languages": ["English", "Spanish"],
                "education": "Harvard Medical School"
            },
            {
                "id": 2,
                "name": "Dr. James Chen",
                "specialty": "Neurologist",
                "hospital": "NeuroHealth Institute",
                "rating": 4.8,
                "reviews": 196,
                "experience": "15 yrs",
                "fee": 1500,
                "available": True,
                "nextAvailable": "Tomorrow, 10:00 AM",
                "verified": True,
                "languages": ["English", "Mandarin"],
                "education": "Johns Hopkins University"
            },
            {
                "id": 3,
                "name": "Dr. Emily Rodriguez",
                "specialty": "Dermatologist",
                "hospital": "SkinCare Clinic",
                "rating": 4.7,
                "reviews": 312,
                "experience": "8 yrs",
                "fee": 1000,
                "available": False,
                "nextAvailable": "Wed, 3:00 PM",
                "verified": True,
                "languages": ["English", "Portuguese"],
                "education": "Stanford Medical School"
            },
            {
                "id": 4,
                "name": "Dr. Michael Thompson",
                "specialty": "Orthopedist",
                "hospital": "BoneJoint Hospital",
                "rating": 4.9,
                "reviews": 421,
                "experience": "20 yrs",
                "fee": 2000,
                "available": True,
                "nextAvailable": "Today, 5:00 PM",
                "verified": True,
                "languages": ["English"],
                "education": "Mayo Clinic School of Medicine"
            },
            {
                "id": 5,
                "name": "Dr. Priya Patel",
                "specialty": "Pediatrician",
                "hospital": "Children's Health Hub",
                "rating": 4.8,
                "reviews": 567,
                "experience": "10 yrs",
                "fee": 800,
                "available": True,
                "nextAvailable": "Today, 11:00 AM",
                "verified": True,
                "languages": ["English", "Hindi"],
                "education": "UCSF School of Medicine"
            },
            {
                "id": 6,
                "name": "Dr. Robert Kim",
                "specialty": "Psychiatrist",
                "hospital": "MindWell Center",
                "rating": 4.6,
                "reviews": 150,
                "experience": "11 yrs",
                "fee": 1500,
                "available": False,
                "nextAvailable": "Thu, 2:00 PM",
                "verified": True,
                "languages": ["English", "Korean"],
                "education": "Columbia Medical School"
            }
        ]
        await db.doctors.insert_many(default_doctors)
        print("Seeded default doctors.")

async def seed_insurance_plans():
    global db
    if db is None:
        return
        
    plans_count = await db.insurancePlans.count_documents({})
    if plans_count == 0:
        print("Seeding default insurance plans into MongoDB...")
        default_plans = [
            {
                "id": "1",
                "name": "HealthShield Individual Prime",
                "provider": "CareGuard Life",
                "type": "individual",
                "coverage_amount": 500000.0,
                "premium_range": "800 - 1200",
                "waiting_period": "1 year",
                "cashless_support": True,
                "benefits": [
                  "No sub-limits on room rent",
                  "OPD consultation coverage up to ₹5,000/year",
                  "Free annual comprehensive health checkups"
                ],
                "exclusions": [
                  "Cosmetic surgery unless due to accident",
                  "Pre-existing diseases covered only after 12 months"
                ]
            },
            {
                "id": "2",
                "name": "Family Health Care Elite",
                "provider": "StarCare General",
                "type": "family",
                "coverage_amount": 1000000.0,
                "premium_range": "1800 - 2400",
                "waiting_period": "2 years",
                "cashless_support": True,
                "benefits": [
                  "Covers up to 4 family members (2 Adults + 2 Kids)",
                  "Maternity benefits covered after 24 months up to ₹75,000",
                  "Air ambulance cover up to ₹2,00,000"
                ],
                "exclusions": [
                  "Dental treatments unless due to injury",
                  "Self-inflicted injuries or alternative therapies"
                ]
            },
            {
                "id": "3",
                "name": "Senior Citizen Vitality Shield",
                "provider": "StarCare General",
                "type": "senior citizen",
                "coverage_amount": 500000.0,
                "premium_range": "2200 - 2800",
                "waiting_period": "1 year",
                "cashless_support": True,
                "benefits": [
                  "Specifically tailored for ages 60+",
                  "Direct cashless admission for chronic heart & diabetes ailments",
                  "Home hospitalization cover up to 100% of sum insured"
                ],
                "exclusions": [
                  "20% co-payment mandatory on all claims",
                  "Spectacles, contact lenses, and hearing aid costs"
                ]
            },
            {
                "id": "4",
                "name": "Maternity & Newborn Care Plus",
                "provider": "CareGuard Life",
                "type": "maternity",
                "coverage_amount": 300000.0,
                "premium_range": "1200 - 1600",
                "waiting_period": "9 months",
                "cashless_support": False,
                "benefits": [
                  "No waiting period if signed up pre-conception",
                  "Newborn cover from Day 1 up to ₹50,000",
                  "Vaccination costs covered for the first year"
                ],
                "exclusions": [
                  "Infertility treatments and surrogate pregnancy fees",
                  "Pre-existing conditions other than pregnancy complications"
                ]
            },
            {
                "id": "5",
                "name": "Critical Illness Safeguard",
                "provider": "Alliance Health",
                "type": "critical illness",
                "coverage_amount": 1500000.0,
                "premium_range": "900 - 1400",
                "waiting_period": "90 days",
                "cashless_support": True,
                "benefits": [
                  "Lump sum payout of ₹15,00,000 upon diagnosis of 36 critical illnesses",
                  "Income benefit support during recovery phase",
                  "Second medical opinion from international doctors covered"
                ],
                "exclusions": [
                  "Any diagnosis within 90 days of policy start date",
                  "Conditions arising due to genetic disorders or drug abuse"
                ]
            }
        ]
        await db.insurancePlans.insert_many(default_plans)
        print("Seeded default insurance plans.")

