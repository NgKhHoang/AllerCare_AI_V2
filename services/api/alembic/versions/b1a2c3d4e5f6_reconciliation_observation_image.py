"""observation image_url + reconciliation demo fields

Revision ID: b1a2c3d4e5f6
Revises: d823fdd70eb0
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b1a2c3d4e5f6"
down_revision = "d823fdd70eb0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clinical_observations", sa.Column("image_url", sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column("clinical_observations", "image_url")
