"""create observation_summaries table

Revision ID: c2b3d4e5f6a7
Revises: b1a2c3d4e5f6
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "c2b3d4e5f6a7"
down_revision = "b1a2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "observation_summaries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("patient_profile_id", sa.String(length=36), nullable=False),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("generated_by", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["patient_profile_id"], ["patient_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_observation_summaries_patient_profile_id", "observation_summaries", ["patient_profile_id"])


def downgrade() -> None:
    op.drop_index("ix_observation_summaries_patient_profile_id", table_name="observation_summaries")
    op.drop_table("observation_summaries")
