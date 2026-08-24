from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.models.incident import Incident
from app.models.neighborhood import Neighborhood
from app.models.user import User

router = APIRouter()


@router.get("/summary")
def summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_query = db.query(User)
    neighborhood_query = db.query(Neighborhood)
    incident_query = db.query(Incident)
    if current_user.role.name != "superadmin" and current_user.neighborhood_id:
        user_query = user_query.filter(User.neighborhood_id == current_user.neighborhood_id)
        neighborhood_query = neighborhood_query.filter(Neighborhood.id == current_user.neighborhood_id)
        incident_query = incident_query.filter(Incident.neighborhood_id == current_user.neighborhood_id)
    users = user_query.all()
    incidents = incident_query.all()
    return {
        "total_users": len(users),
        "total_leaders": sum(user.role.name == "leader" for user in users),
        "total_centinels": sum(user.role.name == "sentinel" for user in users),
        "total_neighborhoods": neighborhood_query.count(),
        "open_incidents": sum(incident.status in {"abierta", "en revisión"} for incident in incidents),
        "critical_incidents": sum(incident.severity == "crítica" for incident in incidents),
    }
