from sqlalchemy.orm import Session

from app.models.neighborhood import Neighborhood
from app.models.role import Role
from app.models.user import User
from app.services.security import hash_password


def seed(db: Session, superadmin_email: str, superadmin_password: str) -> None:
    roles = ["superadmin", "leader", "sentinel"]
    role_map = {}
    for role_name in roles:
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            role = Role(name=role_name, is_system=True)
            db.add(role)
            db.flush()
        role_map[role_name] = role

    if not db.query(Neighborhood).filter(Neighborhood.name == "Vecindario Demo").first():
        neighborhood = Neighborhood(name="Vecindario Demo", description="Vecindario de prueba")
        db.add(neighborhood)
        db.flush()

    if not db.query(User).filter(User.email == superadmin_email).first():
        db.add(
            User(
                email=superadmin_email,
                full_name="Dennis Barrios",
                hashed_password=hash_password(superadmin_password),
                role_id=role_map["superadmin"].id,
            )
        )
    db.commit()

