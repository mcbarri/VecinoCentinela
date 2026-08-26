import json
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_db
from app.api.v1.permissions import require_roles
from app.models.patrol_route import PatrolRoute
from app.models.patrol_route_assignment import PatrolRouteAssignment
from app.models.presence_event import PresenceEvent
from app.models.shift import Shift
from app.models.user import User
from app.models.user_location import UserLocation
from app.realtime import manager
from app.schemas.realtime import (
    Heartbeat,
    LocationPublish,
    PatrolRouteCreate,
    PresenceEventCreate,
    RouteAssignmentCreate,
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

    Soporta el pipeline redundante: si el payload trae banderas de estado
    (gps_off, gps_denied) o cola diferida (queued_count>0), se registra un
    PresenceEvent en el canal de telemetría separado para auditoría.
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

    # ── Canal de telemetría redundante ──
    # Bandera GPS desactivado o sin permiso: registrar evento de tipo gps_off/gps_denied.
    if payload is not None:
        meta = json.dumps(
            {
                "ip_publica": payload.ip_publica,
                "accuracy_m": payload.accuracy_m,
                "flags": {
                    "gps_off": payload.gps_off,
                    "gps_denied": payload.gps_denied,
                    "device_off": payload.device_off,
                },
            },
            default=str,
        )
        is_pos = payload.latitude is not None and payload.longitude is not None
        # Q2 la posición vino por IP (fallback sin GPS): etiquetar baja precisión.
        if is_pos and payload.source == "ip":
            _add_presence_event(
                db, current_user.id, "ip_fallback",
                message="Posición por fallback IP (sin GPS)",
                latitude=payload.latitude, longitude=payload.longitude,
                source="ip", confidence="low", meta=meta,
            )
        # GPS desactivado explícitamente.
        if payload.gps_off:
            _add_presence_event(
                db, current_user.id, "gps_off",
                message="GPS desactivado: se mantiene presencia vía heartbeat",
                source=payload.source or "none", confidence="low", meta=meta,
            )
        # Permiso de ubicación denegado.
        if payload.gps_denied:
            _add_presence_event(
                db, current_user.id, "gps_denied",
                message="Permiso de ubicación denegado por el usuario",
                source="none", confidence="low", meta=meta,
            )
        # Hubo cola diferida (latidos acumulados sin enviar por offline):
        # el reintento llega ahora con queued_count>0 => se registra desconexión+reconexión.
        if (payload.queued_count or 0) > 0:
            _add_presence_event(
                db, current_user.id, "reconnect",
                message=f"Reconexión: se enviaron {payload.queued_count} latidos acumulados en cola local",
                latitude=payload.latitude if is_pos else None,
                longitude=payload.longitude if is_pos else None,
                source=payload.source or "none", confidence=payload.confidence or "low",
                queued_count=payload.queued_count, meta=meta,
            )

    db.commit()
    return {"ok": True, "user_id": current_user.id}


@router.post("/presence-events")
def create_presence_event(
    payload: PresenceEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registra un evento de telemetría de presencia (canal separado de Incidentes).
    Se usa para reportar desconexión de red (network_off), apagado de dispositivo
    (device_off), o para el reenvío completo de la cola diferida tras reconectar.
    """
    meta = json.dumps(
        {"ip_publica": payload.ip_publica, "queued": payload.queued or []},
        default=str,
    )
    ev = PresenceEvent(
        user_id=current_user.id,
        kind=payload.kind,
        message=payload.message,
        latitude=str(payload.latitude) if payload.latitude is not None else None,
        longitude=str(payload.longitude) if payload.longitude is not None else None,
        source=payload.source,
        confidence=payload.confidence,
        queued_count=payload.queued_count,
        meta=meta,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return {"ok": True, "event_id": ev.id}


def _add_presence_event(db, user_id, kind, message=None, latitude=None, longitude=None,
                        source=None, confidence=None, queued_count=0, meta=None):
    db.add(
        PresenceEvent(
            user_id=user_id,
            kind=kind,
            message=message,
            latitude=str(latitude) if latitude is not None else None,
            longitude=str(longitude) if longitude is not None else None,
            source=source,
            confidence=confidence,
            queued_count=queued_count or 0,
            meta=meta,
        )
    )


@router.get("/locations")
def list_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve la ULTIMA posición conocida de TODOS los usuarios del vecindario
    del consultante (mapa en vivo).

    Incluye un campo `online` (bool): el pin se pinta a color si está en línea
    (heartbeat activo last_seen reciente o ubicación publicada hace menos de
    ONLINE_WINDOW seg) y en gris si NO está en línea, mostrando siempre su
    última posición registrada. Así los detectores ven en el mapa dónde estuvo
    la última vez que se conectó cada quien (por si algo les pasa).

    Reglas:
    - Solo usuarios del MISMO vecindario del consultante.
    - El superadmin (rol 28) NO aparece para otros roles: solo se ve a sí mismo
      cuando es el superadmin quien consulta.
    - Se incluyen tanto usuarios con ubicación registrada como los que no tienen
      (con lat/long None) para que la tabla los muestre igualmente.
    """
    from datetime import datetime, timedelta, timezone

    ONLINE_WINDOW = timedelta(seconds=90)
    cutoff = datetime.now(timezone.utc) - ONLINE_WINDOW

    # Base de usuarios del vecindario del consultante (mismo criterio que list_users)
    query = db.query(User)
    if current_user.role.name != "superadmin":
        query = query.filter(User.role_id != 28)
        if current_user.neighborhood_id:
            query = query.filter(User.neighborhood_id == current_user.neighborhood_id)
    users = query.all()

    # Mapa de la última ubicación conocida por user_id
    locations = {loc.user_id: loc for loc in db.query(UserLocation).all()}

    result = []
    for u in users:
        if u.role_id == 28 and current_user.role.name != "superadmin":
            continue
        # Última posición conocida
        loc = locations.get(u.id)
        last_seen = u.last_seen
        loc_ts = loc.updated_at if loc else None
        # En línea si envió heartbeat reciente (last_seen) o si su ubicación se
        # actualizó recientemente.
        online = bool(
            u.is_active
            and not u.is_blocked
            and (
                (last_seen is not None and last_seen >= cutoff)
                or (loc_ts is not None and loc_ts >= cutoff)
            )
        )
        result.append(
            {
                "user_id": u.id,
                "full_name": u.full_name,
                "role": u.role.name if u.role else None,
                "code": u.code,
                "latitude": float(loc.latitude) if loc and loc.latitude is not None else None,
                "longitude": float(loc.longitude) if loc and loc.longitude is not None else None,
                "updated_at": loc.updated_at.isoformat() if loc and loc.updated_at else None,
                "online": online,
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
    # Solo líderes (y superadmin) pueden crear rutas de patrulla
    require_roles(current_user, {"superadmin", "leader"})
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
    rows = db.query(PatrolRoute).order_by(PatrolRoute.id.desc()).all()
    result = []
    for r in rows:
        assignments = []
        for a in r.assignments:
            assignments.append(_assignment_to_dict(a))
        result.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_name": r.user.full_name if r.user else None,
                "name": r.name,
                "points": json.loads(r.points),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "assignments": assignments,
            }
        )
    return result


@router.delete("/patrol-routes/{route_id}")
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})
    route = db.get(PatrolRoute, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    if route.user_id != current_user.id and current_user.role.name != "superadmin":
        raise HTTPException(status_code=403, detail="No autorizado para eliminar esta ruta")
    db.delete(route)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# ASIGNACIÓN DE RUTAS (v2 — McBarri 26 Ago 2026)
# ─────────────────────────────────────────────


def _assignment_to_dict(a: PatrolRouteAssignment) -> dict:
    return {
        "id": a.id,
        "route_id": a.route_id,
        "assigned_user_id": a.assigned_user_id,
        "assigned_user_name": a.assigned_user.full_name if a.assigned_user else None,
        "days_of_week": json.loads(a.days_of_week) if a.days_of_week else [],
        "start_time": a.start_time.strftime("%H:%M") if a.start_time else None,
        "end_time": a.end_time.strftime("%H:%M") if a.end_time else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


_DIA_NOMBRE = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _times_overlap(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    """True si dos rangos horarios se solapan (contemplando cruce de medianoche).

    Convierte a minutos desde 00:00. Si un rango cruza medianoche (end <= start),
    su end se desplaza +24h. Compara B tanto en su día base como desplazado +24h
    para cubrir solapes con rangos que cruzan medianoche.
    """
    def norm(s: time, e: time):
        sm = s.hour * 60 + s.minute
        em = e.hour * 60 + e.minute
        if em <= sm:
            em += 1440
        return sm, em

    ax, ay = norm(a_start, a_end)
    bx, by = norm(b_start, b_end)
    # El rango A puede extenderse hasta +48h (si cruza medianoche).
    # Probamos B anclado: en su día base y desplazado +24h.
    for shift in (0, 1440):
        bs2, be2 = bx + shift, by + shift
        if ax < be2 and bs2 < ay:
            return True
    return False


def _day_names(days: list[int]) -> str:
    if not days:
        return "sin días"
    if len(days) == 7:
        return "todos los días"
    return ", ".join(_DIA_NOMBRE[d] for d in sorted(days) if 0 <= d <= 6)


@router.post("/patrol-routes/{route_id}/assign")
def assign_route(
    route_id: int,
    payload: RouteAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})

    route = db.get(PatrolRoute, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")

    assigned = db.get(User, payload.assigned_user_id)
    if not assigned:
        raise HTTPException(status_code=404, detail="Usuario asignado no encontrado")
    # Solo se asigna a líderes o centinelas
    role_name = assigned.role.name if assigned.role else None
    if role_name not in ("leader", "sentinel"):
        raise HTTPException(status_code=400, detail="La ruta solo puede asignarse a un Líder o Centinela")

    # Validar días
    if not payload.days_of_week:
        raise HTTPException(status_code=400, detail="Indica al menos un día de la semana para la ruta")
    invalid = [d for d in payload.days_of_week if d < 0 or d > 6]
    if invalid:
        raise HTTPException(status_code=400, detail="Días de la semana inválidos (usa 0-6, 0=Lunes)")

    # Validar solapamiento horario para el mismo usuario (cualquier OTRA ruta)
    new_days = set(payload.days_of_week)
    existing = db.query(PatrolRouteAssignment).filter(
        PatrolRouteAssignment.assigned_user_id == payload.assigned_user_id,
    ).all()
    # Excluir asignaciones de esta misma ruta (para no auto-chocar al reasignar)
    existing = [a for a in existing if a.route_id != route_id]

    for a in existing:
        a_days = set(json.loads(a.days_of_week) if a.days_of_week else [])
        share_day = a_days & new_days
        if share_day:
            overlap = _times_overlap(payload.start_time, payload.end_time, a.start_time, a.end_time)
            if overlap:
                dia = _DIA_NOMBRE[sorted(share_day)[0]]
                otra_ruta = db.get(PatrolRoute, a.route_id)
                otra_nombre = otra_ruta.name if otra_ruta else "otra ruta"
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Conflicto de horario: {assigned.full_name or ('el usuario ' + str(assigned.id))} "
                        f"ya tiene asignada la ruta '{otra_nombre}' los {_day_names(sorted(a_days))} "
                        f"de {a.start_time.strftime('%H:%M')} a {a.end_time.strftime('%H:%M')}. "
                        f"Elige otro horario o días que no choquen."
                    ),
                )

    assignment = PatrolRouteAssignment(
        route_id=route_id,
        assigned_user_id=payload.assigned_user_id,
        days_of_week=json.dumps(sorted(set(payload.days_of_week))),
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _assignment_to_dict(assignment)


@router.get("/patrol-routes/{route_id}/assignments")
def list_route_assignments(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = db.get(PatrolRoute, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return [_assignment_to_dict(a) for a in db.query(PatrolRouteAssignment)
            .filter(PatrolRouteAssignment.route_id == route_id).all()]


@router.delete("/patrol-routes/assignments/{assignment_id}")
def delete_route_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_roles(current_user, {"superadmin", "leader"})
    assignment = db.get(PatrolRouteAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    db.delete(assignment)
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
            # El cliente envía mensajes ya formateados (posiciones, audio del walkie,
            # presencia, comandos). Se reenvían TAL CUAL a los demás para que cada
            # receptor maneje su own `type` (p.ej. "audio"). Si viene JSON, lo
            # parseamos para que el broadcast no reciba un string anidado.
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except Exception:
                message = {"type": "update", "data": data}
            await manager.broadcast(message)
    except Exception:
        pass
    finally:
        manager.disconnect(websocket)


def _in_shift(start: time, end: time, now: time) -> bool:
    if start <= end:
        return start <= now <= end
    # cruza medianoche
    return now >= start or now <= end
