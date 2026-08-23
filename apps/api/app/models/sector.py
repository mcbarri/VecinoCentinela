from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class Sector(Base):
    __tablename__ = "sectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    neighborhood_id = Column(Integer, ForeignKey("neighborhoods.id"), nullable=False)

    neighborhood = relationship("Neighborhood", back_populates="sectors")

