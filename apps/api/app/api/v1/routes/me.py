from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.models.user import User

router = APIRouter()


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    onboarding_complete: bool | None = None


@router.get("")
def read_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.name,
        "phone": current_user.phone,
        "avatar_url": current_user.avatar_url,
        "photo_required": current_user.photo_required,
        "onboarding_complete": current_user.onboarding_complete,
        "neighborhood_id": current_user.neighborhood_id,
        "neighborhood_name": current_user.neighborhood.name if current_user.neighborhood else None,
    }


@router.patch("")
def update_me(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "avatar_url": current_user.avatar_url,
        "onboarding_complete": current_user.onboarding_complete,
    }


@router.delete("")
def deactivate_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El usuario se da de baja: desactiva su cuenta y cierra sesión."""
    # La cuenta maestra superadmin no se elimina a sí misma
    if current_user.role.name == "superadmin":
        raise HTTPException(status_code=403, detail="El administrador no puede darse de baja")
    current_user.is_active = False
    current_user.is_blocked = True
    db.commit()
    return {"ok": True}
