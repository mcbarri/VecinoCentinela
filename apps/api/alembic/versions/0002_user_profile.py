"""user profile: phone, avatar, photo_required, onboarding_complete

Revision ID: 0002_user_profile
Revises: 0001_initial
Create Date: 2026-08-23 23:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_user_profile"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("phone", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("photo_required", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users",
        sa.Column("onboarding_complete", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("users", "onboarding_complete")
    op.drop_column("users", "photo_required")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "phone")
