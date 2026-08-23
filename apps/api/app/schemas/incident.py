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

