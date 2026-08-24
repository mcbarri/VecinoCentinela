"""presence: last_seen en users para detectar sesión activa (en línea)

Revision ID: 0003_presence
Revises: 0002_user_profile
Create Date: 2026-08-24 02:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_presence"
down_revision = "0002_user_profile"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "last_seen")
