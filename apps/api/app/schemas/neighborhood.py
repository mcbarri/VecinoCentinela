from pydantic import BaseModel


class NeighborhoodCreate(BaseModel):
    name: str
    description: str | None = None


class NeighborhoodRead(NeighborhoodCreate):
    id: int


class NeighborhoodUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
