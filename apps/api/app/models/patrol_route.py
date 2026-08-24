from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class PatrolRoute(Base):
    """Ruta de vigilancia trazada por un centinela en el mapa."""
    __tablename__ = "patrol_routes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(120), nullable=True)  # ej: "Ruta sector A"
    points = Column(Text, nullable=False)      # JSON: [[lat, lng], ...]
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
