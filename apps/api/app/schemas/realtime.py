from datetime import time

from pydantic import BaseModel


# --- Posiciones en tiempo real ---
class LocationPublish(BaseModel):
    latitude: float
    longitude: float


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


class PatrolRouteRead(BaseModel):
    id: int
    user_id: int
    user_name: str | None = None
    name: str | None = None
    points: list[list[float]]
    created_at: str | None = None
