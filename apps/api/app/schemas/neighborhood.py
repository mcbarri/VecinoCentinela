from pydantic import BaseModel


class NeighborhoodCreate(BaseModel):
    name: str
    description: str | None = None


class NeighborhoodRead(NeighborhoodCreate):
    id: int

