from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.api.v1.permissions import require_roles
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserListItem, UserRead, UserUpdate

router = APIRouter()


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.name != "superadmin":
        require_roles(current_user, {"leader", "sentinel"})
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
        }
        for user in users
    ]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin"})
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        neighborhood_id=payload.neighborhood_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email}


@router.patch("/{user_id}", response_model=dict)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin"})
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    return {"id": user.id, "email": user.email}
