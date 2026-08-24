from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Shift(Base):
    """Turno/horario de vigilancia asignado a un centinela."""
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(120), nullable=True)  # ej: "Turno noche"
    start_time = Column(Time, nullable=False)  # ej: 20:00
    end_time = Column(Time, nullable=False)    # ej: 23:00
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")

    def is_in_shift(self, now_time) -> bool:
        """True si now_time está dentro del turno (maneja turnos que cruzan medianoche)."""
        if self.start_time <= self.end_time:
            return self.start_time <= now_time <= self.end_time
        # turno que cruza medianoche (ej: 22:00 -> 02:00)
        return now_time >= self.start_time or now_time <= self.end_time
