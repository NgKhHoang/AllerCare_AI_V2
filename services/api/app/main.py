"""Điểm vào FastAPI: CORS, health check, và đăng ký routers theo module."""
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings, get_settings_public

_public = get_settings_public()
_settings = get_settings()

app = FastAPI(
    title="AllerCare AI API",
    version="0.1.0",
    description="MVP demo - chi dung du lieu gia lap. Khong dung cho cham soc thuc te.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

api = APIRouter(prefix="/api/v1")

# System
from app.modules.auth.router import router as auth_router  # noqa: E402

# Core
from app.modules.patients.router import router as patients_router  # noqa: E402
from app.modules.patients.doctor_router import router as doctor_patients_router  # noqa: E402
from app.modules.safety.router import router as safety_router  # noqa: E402
from app.modules.safety.pharmacist_router import router as rules_router  # noqa: E402
from app.modules.ai.chat_router import router as chat_router  # noqa: E402
from app.modules.consultations.router import router as appointments_router  # noqa: E402
from app.modules.triage.router import router as triage_router  # noqa: E402
from app.modules.guides.router import router as guides_router  # noqa: E402
from app.modules.notifications.router import router as notifications_router  # noqa: E402
from app.modules.dashboard.router import router as dashboard_router, admin_router  # noqa: E402

api.include_router(auth_router)
api.include_router(doctor_patients_router)  # /patients/assigned ... (trước patients_router)
api.include_router(patients_router)
api.include_router(safety_router)
api.include_router(rules_router)
api.include_router(chat_router)
api.include_router(appointments_router)
api.include_router(triage_router)
api.include_router(guides_router)
api.include_router(notifications_router)
api.include_router(dashboard_router)
api.include_router(admin_router)


@api.get("/healthz", tags=["system"])
def healthz() -> dict:
    return {"status": "ok", "demo_mode": _public["demo_mode"]}


app.include_router(api)
