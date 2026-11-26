import os
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.jwt_handler import validate_jwt_config
from services.email_service import get_smtp_diagnostic
from database.mongodb import connect_to_mongo, close_mongo_connection
from routes.auth import router as auth_router
from routes.doctors import router as doctors_router
from routes.appointments import router as appointments_router
from routes.records import router as records_router
from routes.fitness import router as fitness_router
from routes.ai import router as ai_router
from routes.pharmacy import router as pharmacy_router
from routes.consultations import router as consultations_router
from routes.analytics import router as analytics_router
from routes.admin import router as admin_router
from routes.insurance import router as insurance_router
from routes.emergency import router as emergency_router
from routes.maps import router as maps_router
from routes.notifications import router as notifications_router
from routes.settings import router as settings_router
from controllers.analytics_controller import HealthClassifierManager

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "https://health-point-tau.vercel.app",
]


def get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return DEFAULT_CORS_ORIGINS
    origins = [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]
    return origins or DEFAULT_CORS_ORIGINS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast in production if JWT_SECRET_KEY is missing or weak
    validate_jwt_config()
    smtp_diag = get_smtp_diagnostic()
    print(
        f"SMTP Readiness: configured={smtp_diag['configured']}, "
        f"host={smtp_diag['host']}, port={smtp_diag['port']}"
    )
    await connect_to_mongo()
    HealthClassifierManager.get_instance()
    yield
    await close_mongo_connection()


app = FastAPI(
    title="HealthPoint API",
    description="AI-Powered Digital Healthcare Ecosystem — FastAPI + MongoDB + OpenRouter",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Core routes
app.include_router(auth_router, prefix="/api")
app.include_router(doctors_router, prefix="/api")
app.include_router(appointments_router, prefix="/api")
app.include_router(records_router, prefix="/api")
app.include_router(fitness_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(pharmacy_router, prefix="/api")
app.include_router(consultations_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(insurance_router, prefix="/api")
app.include_router(emergency_router, prefix="/api")
app.include_router(maps_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(settings_router, prefix="/api")

# Ensure upload storage directory exists (never mounted publicly; served only via authenticated endpoints)
uploads_path = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_path, exist_ok=True)


@app.get("/")
def read_root():
    smtp_diag = get_smtp_diagnostic()
    return {
        "name": "HealthPoint Backend API v2",
        "status": "online",
        "smtp_configured": smtp_diag["configured"],
        "features": ["MongoDB", "Email OTP Auth", "OpenRouter Free AI"],
        "docs_url": "/docs",
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
