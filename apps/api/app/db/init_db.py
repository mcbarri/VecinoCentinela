from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.security import hash_password
from app.models.neighborhood import Neighborhood
from app.models.role import Role
from app.models.sector import Sector
from app.models.user import User
from app.models.incident import Incident


def seed(db: Session, superadmin_email: str, superadmin_password: str) -> None:
    roles = ["superadmin", "leader", "sentinel"]
    role_map = {}
    for role_name in roles:
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            role = Role(
                name=role_name,
                is_system=True,
                can_manage_global=role_name == "superadmin",
            )
            db.add(role)
            db.flush()
        role_map[role_name] = role

    neighborhood = db.query(Neighborhood).filter(Neighborhood.name == "Vecindario Demo").first()
    if not neighborhood:
        neighborhood = Neighborhood(name="Vecindario Demo", description="Vecindario de prueba")
        db.add(neighborhood)
        db.flush()

    sector = db.query(Sector).filter(Sector.name == "Sector A", Sector.neighborhood_id == neighborhood.id).first()
    if not sector:
        sector = Sector(name="Sector A", neighborhood_id=neighborhood.id)
        db.add(sector)
        db.flush()

    leader = db.query(User).filter(User.email == "lider.demo@vecinocentinela.local").first()
    if not leader:
        leader = User(
            email="lider.demo@vecinocentinela.local",
            full_name="Líder Demo",
            hashed_password=hash_password("LiderDemo+2026!"),
            role_id=role_map["leader"].id,
            neighborhood_id=neighborhood.id,
        )
        db.add(leader)
        db.flush()

    sentinels = []
    for email, name in [
        ("centinela1.demo@vecinocentinela.local", "Centinela Demo 1"),
        ("centinela2.demo@vecinocentinela.local", "Centinela Demo 2"),
    ]:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                full_name=name,
                hashed_password=hash_password("CentinelaDemo+2026!"),
                role_id=role_map["sentinel"].id,
                neighborhood_id=neighborhood.id,
            )
            db.add(user)
            db.flush()
        sentinels.append(user)

    if sector not in leader.sectors:
        leader.sectors.append(sector)
    for user in sentinels:
        if sector not in user.sectors:
            user.sectors.append(sector)

    if not db.query(Incident).filter(Incident.title == "Robo en parque").first():
        db.add(
            Incident(
                title="Robo en parque",
                description="Reporte de prueba sobre un robo ocurrido en el parque principal.",
                category="Robo",
                severity="alta",
                status="abierta",
                reporter_id=sentinels[0].id,
                neighborhood_id=neighborhood.id,
            )
        )
    if not db.query(Incident).filter(Incident.title == "Alumbrado apagado").first():
        db.add(
            Incident(
                title="Alumbrado apagado",
                description="Luminaria apagada en la calle principal.",
                category="Alumbrado público",
                severity="media",
                status="en revisión",
                reporter_id=sentinels[1].id,
                neighborhood_id=neighborhood.id,
            )
        )

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


def ensure_profile_columns(db: Session) -> None:
    """Añade columnas de perfil de forma idempotente (PostgreSQL)."""
    additions = [
        ("phone", "VARCHAR(50)"),
        ("avatar_url", "TEXT"),
        ("photo_required", "BOOLEAN DEFAULT FALSE NOT NULL"),
        ("onboarding_complete", "BOOLEAN DEFAULT FALSE NOT NULL"),
        ("code", "VARCHAR(10)"),
        ("is_leader_mayor", "BOOLEAN DEFAULT FALSE NOT NULL"),
    ]
    for col, ddl in additions:
        db.execute(
            text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {ddl}")
        )
    db.commit()


def seed_defaults(db: Session) -> None:
    ensure_profile_columns(db)
    seed(db, settings.superadmin_email, settings.superadmin_password)
