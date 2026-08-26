"""patrol_route_assignments: asignar rutas a líderes/centinelas con horario

Módulo de rutas de patrulla v2 (McBarri, 26 Ago 2026):
- Una ruta (geometría/puntos) puede asignarse a VARIOS usuarios.
- Validación de solapamiento de horario por usuario (no dos rutas al mismo tiempo).
- days_of_week: JSON [0-6] (0=Lunes ... 6=Domingo) · start/end_time (puede cruzar medianoche).

Revision ID: 0005_route_assignments
Revises: 0004_presence_events
Create Date: 2026-08-26 19:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_route_assignments"
down_revision = "0004_presence_events"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "patrol_route_assignments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("route_id", sa.Integer(), sa.ForeignKey("patrol_routes.id"), nullable=False, index=True),
        sa.Column("assigned_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("days_of_week", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("route_id", "assigned_user_id", name="uq_route_assignment_user"),
        keep_existing=True,
    )


def downgrade():
    op.drop_table("patrol_route_assignments")
