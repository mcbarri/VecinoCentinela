from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role
from app.schemas.user import UserCreate, UserListItem, UserRead, UserUpdate

router = APIRouter()

# Jerarquía de roles → qué roles puede asignar cada uno
# role name -> set de role_ids que puede crear/asignar
ROLE_HIERARCHY: dict[str, set[int]] = {
    "superadmin": {28, 29, 30},
    "leader": {29, 30},
    "sentinel": {30},
}

_ROLE_VALID = {28, 29, 30}

# Prefijo del código de identificación por rol
# Líder → L01, L02… · Centinela → C01, C02…
_CODE_PREFIX = {
    "leader": "L",
    "sentinel": "C",
}


def _role_name_by_id(db: Session, role_id: int) -> str:
    """Devuelve el nombre del rol (leader/sentinel/superadmin) para un role_id."""
    r = db.query(Role).filter(Role.id == role_id).first()
    return r.name if r else ""


def _next_code(db: Session, role_name: str) -> str:
    """Calcula el menor código libre para el rol, reutilizando huecos.
    Solo considera usuarios activos (no dados de baja).
    Ej: líder → L01, L02, L03… · centinela → C01, C02…
    """
    prefix = _CODE_PREFIX.get(role_name)
    if not prefix:
        return None
    used = set()
    for u in db.query(User).filter(User.code.isnot(None)).all():
        if u.code and u.code.startswith(prefix):
            try:
                used.add(int(u.code[len(prefix):]))
            except ValueError:
                pass
    n = 1
    while n in used:
        n += 1
    return f"{prefix}{n:02d}"


def _assert_can_assign(actor: User, role_id: int) -> None:
    """Valida que el actor pueda asignar el role_id según su jerarquía."""
    if role_id not in _ROLE_VALID:
        raise HTTPException(status_code=400, detail="Rol inválido")
    allowed = ROLE_HIERARCHY.get(actor.role.name, set())
    if role_id not in allowed:
        raise HTTPException(
            status_code=403, detail="No autorizado: tu rol no puede asignar ese nivel"
        )


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.name not in {"superadmin", "leader", "sentinel"}:
        raise HTTPException(status_code=403, detail="No autorizado")
    query = db.query(User)
    if current_user.role.name != "superadmin" and current_user.neighborhood_id:
        query = query.filter(User.neighborhood_id == current_user.neighborhood_id)
    users = query.all()
    return [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role_id": user.role_id,
            "role_name": user.role.name,
            "neighborhood_id": user.neighborhood_id,
            "is_active": user.is_active,
            "is_blocked": user.is_blocked,
            "code": user.code,
            "phone": user.phone,
            "avatar_url": user.avatar_url,
            "photo_required": user.photo_required,
            "onboarding_complete": user.onboarding_complete,
        }
        for user in users
    ]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # superadmin y leader pueden crear; sentinel no
    if current_user.role.name not in {"superadmin", "leader"}:
        raise HTTPException(status_code=403, detail="No autorizado")
    _assert_can_assign(current_user, payload.role_id)

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    neighborhood_id = payload.neighborhood_id
    # Un líder solo puede asignar a su propio vecindario
    if current_user.role.name == "leader" and current_user.neighborhood_id:
        neighborhood_id = current_user.neighborhood_id
        if payload.neighborhood_id and payload.neighborhood_id != current_user.neighborhood_id:
            raise HTTPException(status_code=403, detail="No autorizado: solo puedes asignar tu vecindario")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        neighborhood_id=neighborhood_id,
        phone=payload.phone,
    )
    # Asignar código de identificación automático (fijo, no editable):
    # usa el menor hueco libre de su rol (L para líder, C para centinela).
    user.code = _next_code(db, _role_name_by_id(db, payload.role_id))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "code": user.code}


@router.patch("/{user_id}", response_model=dict)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    data = payload.model_dump(exclude_unset=True)

    # Permisos: superadmin edita a cualquiera;
    # leader edita a sentinelas y líderes DE SU vecindario (no a superadmin, no a otros vecindarios)
    is_superadmin = current_user.role.name == "superadmin"
    is_leader = current_user.role.name == "leader"
    if not (is_superadmin or is_leader):
        raise HTTPException(status_code=403, detail="No autorizado")
    if is_leader:
        # Un líder jamás puede tocar al superadmin (cuenta maestra)
        if user.role.name == "superadmin":
            raise HTTPException(status_code=403, detail="No autorizado")
        # El líder solo puede gestionar usuarios de SU vecindario
        if user.neighborhood_id and current_user.neighborhood_id and user.neighborhood_id != current_user.neighborhood_id:
            raise HTTPException(status_code=403, detail="No autorizado: usuario fuera de tu vecindario")
        # Si el líder intenta cambiar de vecindario a alguien, debe ser hacia SU vecindario
        new_nb = data.get("neighborhood_id")
        if new_nb and current_user.neighborhood_id and new_nb != current_user.neighborhood_id:
            raise HTTPException(status_code=403, detail="No autorizado: no puedes asignar otro vecindario")

    if "role_id" in data:
        _assert_can_assign(current_user, data["role_id"])
    # El código de identificación es FIJO: nunca se puede cambiar ni reasignar.
    data.pop("code", None)
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    return {"id": user.id, "email": user.email}


@router.delete("/{user_id}", response_model=dict)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # Nadie puede eliminar a un superadmin (cuenta maestra)
    if user.role.name == "superadmin":
        raise HTTPException(status_code=403, detail="No se puede eliminar a un administrador")
    if current_user.role.name == "leader":
        if current_user.neighborhood_id and user.neighborhood_id != current_user.neighborhood_id:
            raise HTTPException(status_code=403, detail="No autorizado")
    user.is_active = False
    user.is_blocked = True
    db.commit()
    return {"ok": True}
