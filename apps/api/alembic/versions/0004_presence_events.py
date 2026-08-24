"""presence_events: log de telemetría redundante (GPS/red/offsync)

Crea la tabla `presence_events`, canal SEPARADO del sistema de Incidentes
de seguridad vecinal, para auditar qué le pasó a un centinela en cuanto a
su presencia/posición (GPS off, sin red, reconexión, cola diferida, fallback IP).

Revision ID: 0004_presence_events
Revises: 0003_presence
Create Date: 2026-08-24 03:50:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_presence_events"
down_revision = "0003_presence"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "presence_events",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(length=50), nullable=False, index=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("latitude", sa.String(length=32), nullable=True),
        sa.Column("longitude", sa.String(length=32), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=True),
        sa.Column("confidence", sa.String(length=20), nullable=True),
        sa.Column("queued_count", sa.Integer(), nullable=True),
        sa.Column("meta", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        keep_existing=True,
    )


def downgrade():
    op.drop_table("presence_events")
