from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.api.v1.permissions import require_roles
from app.models.neighborhood import Neighborhood
from app.models.user import User
from app.schemas.neighborhood import NeighborhoodCreate, NeighborhoodRead, NeighborhoodUpdate

router = APIRouter()


@router.get("")
def list_neighborhoods(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Neighborhood)
    if current_user.role.name != "superadmin":
        require_roles(current_user, {"leader", "sentinel"})
        query = query.filter(Neighborhood.id == current_user.neighborhood_id)
    return [{"id": n.id, "name": n.name, "description": n.description} for n in query.all()]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_neighborhood(
    payload: NeighborhoodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin"})
    if db.query(Neighborhood).filter(Neighborhood.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Vecindario ya existe")
    neighborhood = Neighborhood(name=payload.name, description=payload.description)
    db.add(neighborhood)
    db.commit()
    db.refresh(neighborhood)
    return {"id": neighborhood.id, "name": neighborhood.name}


@router.patch("/{neighborhood_id}", response_model=dict)
def update_neighborhood(
    neighborhood_id: int,
    payload: NeighborhoodUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin"})
    neighborhood = db.get(Neighborhood, neighborhood_id)
    if not neighborhood:
        raise HTTPException(status_code=404, detail="Vecindario no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(neighborhood, key, value)
    db.commit()
    return {"id": neighborhood.id, "name": neighborhood.name}
