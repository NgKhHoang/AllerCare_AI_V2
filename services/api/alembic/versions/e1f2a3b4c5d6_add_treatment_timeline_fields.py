"""add treatment timeline fields to patient_profiles

Revision ID: e1f2a3b4c5d6
Revises: c2b3d4e5f6a7
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e1f2a3b4c5d6"
down_revision = "c2b3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS treatment_status VARCHAR(30) DEFAULT 'active'")
    op.execute("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS treatment_start_date VARCHAR(20)")
    op.execute("ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS followup_date VARCHAR(20)")


def downgrade() -> None:
    op.execute("ALTER TABLE patient_profiles DROP COLUMN IF EXISTS followup_date")
    op.execute("ALTER TABLE patient_profiles DROP COLUMN IF EXISTS treatment_start_date")
    op.execute("ALTER TABLE patient_profiles DROP COLUMN IF EXISTS treatment_status")
