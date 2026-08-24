from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    hashed_refresh_token = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    neighborhood_id = Column(Integer, ForeignKey("neighborhoods.id"), nullable=True)
    phone = Column(String(50), nullable=True)
    avatar_url = Column(Text, nullable=True)
    photo_required = Column(Boolean, default=False, nullable=False)
    onboarding_complete = Column(Boolean, default=False, nullable=False)
    code = Column(String(10), nullable=True, unique=False)
    is_leader_mayor = Column(Boolean, default=False, nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    role = relationship("Role")
    neighborhood = relationship("Neighborhood", back_populates="users")
    sectors = relationship("Sector", secondary="user_sectors", back_populates="users")
