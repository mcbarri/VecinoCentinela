from sqlalchemy import Column, DateTime, ForeignKey, Integer, Time, Text, func, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class PatrolRouteAssignment(Base):
    """Asignación de una ruta de patrulla a un líder/centinela con su horario.

    Una ruta (geometría/puntos) puede asignarse a VARIOS usuarios, siempre que
    no existan solapamientos de horario para el mismo usuario.
    - days_of_week: JSON string con lista de días [0-6] (0=Lunes ... 6=Domingo)
    - start_time / end_time: hora de inicio y fin (end_time puede cruzar medianoche)
    """
    __tablename__ = "patrol_route_assignments"
    __table_args__ = (
        UniqueConstraint("route_id", "assigned_user_id", name="uq_route_assignment_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(Integer, ForeignKey("patrol_routes.id"), nullable=False, index=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    days_of_week = Column(Text, nullable=False, default="[]")  # JSON: [0,2,4]
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    route = relationship("PatrolRoute", back_populates="assignments")
    assigned_user = relationship("User")
