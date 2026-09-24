"""Import toàn bộ models để Base.metadata đầy đủ (dùng cho Alembic)."""
from app.modules.audit.models import AuditEvent  # noqa: F401
from app.modules.consultations.models import (  # noqa: F401
    Appointment,
    ChatMessage,
    ChatSession,
    ConsultationRoom,
)
from app.modules.medications.models import Drug, DrugIngredient, Ingredient  # noqa: F401
from app.modules.patients.models import (  # noqa: F401
    AllergyRecord,
    CareAssignment,
    CaregiverLink,
    ClinicalObservation,
    MedicationRecord,
    PatientProfile,
    User,
)
from app.modules.safety.check_models import Alert, Review, SafetyCheck  # noqa: F401
from app.modules.safety.knowledge_models import KnowledgeSource, SafetyRule  # noqa: F401
from app.modules.triage.models import (  # noqa: F401
    MedicationGuide,
    Notification,
    ObservationSummary,
    SuspectRanking,
    TriageAssessment,
)
