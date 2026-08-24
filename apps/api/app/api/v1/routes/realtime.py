import json
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.api.v1.permissions import require_roles
from app.models.patrol_route import PatrolRoute
from app.models.shift import Shift
from app.models.user import User
from app.models.user_location import UserLocation
from app.realtime import manager
from app.schemas.realtime import (
    Heartbeat,
    LocationPublish,
    PatrolRouteCreate,
    ShiftCreate,
    ShiftUpdate,
)

router = APIRouter()


# ─────────────────────────────────────────────
# POSICIONES EN TIEMPO REAL
# ─────────────────────────────────────────────
@router.post("/locations")
def publish_location(
    payload: LocationPublish,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El sentinela publica su posición actual. Se guarda y se notifica en vivo."""
    loc = db.query(UserLocation).filter(UserLocation.user_id == current_user.id).first()
    if loc:
        loc.latitude = payload.latitude
        loc.longitude = payload.longitude
        loc.updated_at = datetime.utcnow()
    else:
        loc = UserLocation(
            user_id=current_user.id,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
        db.add(loc)
    db.commit()
    return {"ok": True, "user_id": current_user.id}


@router.post("/heartbeat")
def heartbeat(
    payload: Heartbeat | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El usuario con sesión activa manda un latido (heartbeat).
    Actualiza last_seen (para marcar 'en línea') y, si envía coordenadas,
    publica su posición para que aparezca en el mapa en vivo.
    """
    current_user.last_seen = datetime.utcnow()
    if payload is not None and payload.latitude is not None and payload.longitude is not None:
        loc = db.query(UserLocation).filter(UserLocation.user_id == current_user.id).first()
        if loc:
            loc.latitude = payload.latitude
            loc.longitude = payload.longitude
            loc.updated_at = datetime.utcnow()
        else:
            loc = UserLocation(
                user_id=current_user.id,
                latitude=payload.latitude,
                longitude=payload.longitude,
            )
            db.add(loc)
    db.commit()
    return {"ok": True, "user_id": current_user.id}


@router.get("/locations")
def list_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve la última posición de los usuarios en línea (mapa en vivo).
    Solo aparecen los que están conectados: con heartbeat activo (last_seen
    reciente) o que publicaron su ubicación hace menos de ONLINE_WINDOW seg.
    Así el pin desaparece del mapa cuando el usuario se desconecta,
    igual que desaparece de la tabla de usuarios en verde.
    """
    from datetime import datetime, timedelta, timezone

    ONLINE_WINDOW = timedelta(seconds=90)
    cutoff = datetime.now(timezone.utc) - ONLINE_WINDOW
    rows = db.query(UserLocation).all()
    extra = {}
    for loc in rows:
        extra[loc.user_id] = {
            "name": loc.user.full_name,
            "role": loc.user.role.name,
            "code": loc.user.code,
        }
    # El superadmin no debe aparecer en el mapa de otros usuarios: solo se ve
    # a sí mismo cuando es el superadmin quien consulta.
    is_superadmin_viewer = current_user.role.name == "superadmin"
    result = []
    for loc in rows:
        # Saltar al superadmin (rol 28) salvo que el consultante sea superadmin.
        if not is_superadmin_viewer and loc.user and loc.user.role_id == 28:
            continue
        # En línea si envió heartbeat reciente (last_seen) o si su ubicación
        # se actualizó recientemente.
        last_seen = loc.user.last_seen if loc.user else None
        loc_ts = loc.updated_at
        online = (last_seen is not None and last_seen >= cutoff) or (
            loc_ts is not None and loc_ts >= cutoff
        )
        if not online:
            continue
        result.append(
            {
                "user_id": loc.user_id,
                "full_name": extra.get(loc.user_id, {}).get("name"),
                "role": extra.get(loc.user_id, {}).get("role"),
                "code": extra.get(loc.user_id, {}).get("code"),
                "latitude": float(loc.latitude),
                "longitude": float(loc.longitude),
                "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
            }
        )
    return result


# ─────────────────────────────────────────────
# TURNOS / HORARIOS DE VIGILANCIA
# ─────────────────────────────────────────────
@router.post("/shifts")
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})
    target = db.get(User, payload.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    shift = Shift(
        user_id=payload.user_id,
        name=payload.name,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return {"id": shift.id, "user_id": shift.user_id}


@router.get("/shifts")
def list_shifts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})
    now_time = datetime.now().time()
    rows = db.query(Shift).all()
    result = []
    for s in rows:
        result.append(
            {
                "id": s.id,
                "user_id": s.user_id,
                "user_name": s.user.full_name if s.user else None,
                "name": s.name,
                "start_time": s.start_time.strftime("%H:%M"),
                "end_time": s.end_time.strftime("%H:%M"),
                "active": s.active,
                "in_shift_now": _in_shift(s.start_time, s.end_time, now_time),
            }
        )
    return result


@router.patch("/shifts/{shift_id}")
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(shift, key, value)
    db.commit()
    return {"id": shift.id}


@router.delete("/shifts/{shift_id}")
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    db.delete(shift)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# RUTAS DE PATRULLA
# ─────────────────────────────────────────────
@router.post("/patrol-routes")
def create_route(
    payload: PatrolRouteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(payload.points) < 2:
        raise HTTPException(status_code=400, detail="La ruta necesita al menos 2 puntos")
    route = PatrolRoute(
        user_id=current_user.id,
        name=payload.name or "Ruta sin nombre",
        points=json.dumps(payload.points),
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return {"id": route.id, "user_id": route.user_id}


@router.get("/patrol-routes")
def list_routes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(PatrolRoute).all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "user_name": r.user.full_name if r.user else None,
            "name": r.name,
            "points": json.loads(r.points),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/patrol-routes/{route_id}")
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = db.get(PatrolRoute, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    if route.user_id != current_user.id and current_user.role.name not in ("superadmin", "leader"):
        raise HTTPException(status_code=403, detail="No autorizado")
    db.delete(route)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# WEBSOCKET — canal en vivo
# ─────────────────────────────────────────────
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # El cliente puede enviar mensajes (ej: ping de posición). Los broadcast.
            data = await websocket.receive_text()
            await manager.broadcast({"type": "update", "data": data})
    except Exception:
        pass
    finally:
        manager.disconnect(websocket)


def _in_shift(start: time, end: time, now: time) -> bool:
    if start <= end:
        return start <= now <= end
    # cruza medianoche
    return now >= start or now <= end
