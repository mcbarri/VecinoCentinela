from sqlalchemy import Column, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

from app.core.database import Base


user_sectors = Table(
    "user_sectors",
    Base.metadata,
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("sector_id", ForeignKey("sectors.id"), primary_key=True),
)


class Sector(Base):
    __tablename__ = "sectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    neighborhood_id = Column(Integer, ForeignKey("neighborhoods.id"), nullable=False)

    neighborhood = relationship("Neighborhood", back_populates="sectors")
    users = relationship("User", secondary=user_sectors, back_populates="sectors")
