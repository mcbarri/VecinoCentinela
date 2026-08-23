from pydantic import BaseModel


class IncidentCreate(BaseModel):
    title: str
    description: str
    category: str
    severity: str
    neighborhood_id: int
    latitude: float | None = None
    longitude: float | None = None


class IncidentRead(IncidentCreate):
    id: int
    status: str


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    severity: str | None = None
    status: str | None = None
    handled_by_id: int | None = None
