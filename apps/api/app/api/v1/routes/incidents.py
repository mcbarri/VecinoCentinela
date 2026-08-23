from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.api.v1.permissions import require_roles
from app.models.incident import Incident
from app.models.user import User
from app.schemas.incident import IncidentCreate, IncidentRead, IncidentUpdate

router = APIRouter()


@router.get("")
def list_incidents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Incident)
    if current_user.role.name != "superadmin":
        query = query.filter(Incident.neighborhood_id == current_user.neighborhood_id)
    incidents = query.all()
    return [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "category": i.category,
            "severity": i.severity,
            "status": i.status,
            "neighborhood_id": i.neighborhood_id,
        }
        for i in incidents
    ]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.name not in {"superadmin", "leader", "sentinel"}:
        raise HTTPException(status_code=403, detail="No autorizado")
    if current_user.role.name != "superadmin" and current_user.neighborhood_id != payload.neighborhood_id:
        raise HTTPException(status_code=403, detail="No puede crear incidencias fuera de su vecindario")
    incident = Incident(
        title=payload.title,
        description=payload.description,
        category=payload.category,
        severity=payload.severity,
        neighborhood_id=payload.neighborhood_id,
        reporter_id=current_user.id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        status="abierta",
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return {"id": incident.id, "title": incident.title}


@router.patch("/{incident_id}", response_model=dict)
def update_incident(
    incident_id: int,
    payload: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    if current_user.role.name != "superadmin" and incident.neighborhood_id != current_user.neighborhood_id:
        raise HTTPException(status_code=403, detail="No autorizado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(incident, key, value)
    db.commit()
    return {"id": incident.id, "status": incident.status}
