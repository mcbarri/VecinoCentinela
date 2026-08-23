from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="abierta")
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    neighborhood_id = Column(Integer, ForeignKey("neighborhoods.id"), nullable=False)
    handled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    neighborhood = relationship("Neighborhood", back_populates="incidents")
    reporter = relationship("User", foreign_keys=[reporter_id])
    handled_by = relationship("User", foreign_keys=[handled_by_id])
    updates = relationship("IncidentUpdate", back_populates="incident", cascade="all, delete-orphan")

