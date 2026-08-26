from datetime import time

from pydantic import BaseModel


# --- Posiciones en tiempo real ---
class LocationPublish(BaseModel):
    latitude: float
    longitude: float


class Heartbeat(BaseModel):
    """Latido de presencia: coordenadas opcionales (para posicionarse en el mapa).

    Campos de telemetría redundante:
    - source: gps | ip | none (de dónde salió la posición)
    - confidence: high | low
    - flags: banderas de estado (gps_off, gps_denied, device_off)
    - queued_count: latidos acumulados en cola local sin enviar (>=1 => hubo offline)
    - ip_publica: IP cliente reportada (si GPS no dio coords)
    """
    latitude: float | None = None
    longitude: float | None = None
    source: str | None = None
    confidence: str | None = None
    accuracy_m: float | None = None
    ip_publica: str | None = None
    gps_off: bool | None = None
    gps_denied: bool | None = None
    device_off: bool | None = None
    queued_count: int | None = 0


class PresenceEventCreate(BaseModel):
    """Evento de telemetría de presencia (canal separado de Incidentes)."""
    kind: str                      # gps_off|gps_denied|gps_timeout|network_off|reconnect|offline_events|ip_fallback
    message: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    source: str | None = None       # gps | ip | none
    confidence: str | None = None   # high | low
    queued_count: int | None = 0
    ip_publica: str | None = None
    queued: list[dict] | None = None  # payloads diferidos reenviados (reconnect)


class LocationRead(BaseModel):
    user_id: int
    full_name: str | None = None
    role: str | None = None
    latitude: float
    longitude: float
    updated_at: str | None = None


# --- Turnos / horarios ---
class ShiftCreate(BaseModel):
    user_id: int
    name: str | None = None
    start_time: time
    end_time: time


class ShiftUpdate(BaseModel):
    name: str | None = None
    start_time: time | None = None
    end_time: time | None = None
    active: bool | None = None


class ShiftRead(BaseModel):
    id: int
    user_id: int
    user_name: str | None = None
    name: str | None = None
    start_time: str
    end_time: str
    active: bool
    in_shift_now: bool


# --- Rutas de patrulla ---
class PatrolRouteCreate(BaseModel):
    name: str | None = None
    points: list[list[float]]  # [[lat, lng], ...]


class RouteAssignmentCreate(BaseModel):
    assigned_user_id: int
    days_of_week: list[int]  # [0-6] 0=Lunes ... 6=Domingo
    start_time: time
    end_time: time


class RouteAssignmentRead(BaseModel):
    id: int
    route_id: int
    assigned_user_id: int
    assigned_user_name: str | None = None
    days_of_week: list[int]
    start_time: str
    end_time: str
    created_at: str | None = None


class PatrolRouteRead(BaseModel):
    id: int
    user_id: int
    user_name: str | None = None
    name: str | None = None
    points: list[list[float]]
    created_at: str | None = None
    assignments: list[RouteAssignmentRead] = []
