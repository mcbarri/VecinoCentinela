from sqlalchemy import Boolean, Column, Integer, String

from app.core.database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    is_system = Column(Boolean, default=False, nullable=False)
    can_manage_global = Column(Boolean, default=False, nullable=False)
