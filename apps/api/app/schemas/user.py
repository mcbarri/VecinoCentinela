from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role_id: int
    neighborhood_id: int | None = None


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int
    is_active: bool
    is_blocked: bool


class UserUpdate(BaseModel):
    full_name: str | None = None
    role_id: int | None = None
    neighborhood_id: int | None = None
    is_active: bool | None = None
    is_blocked: bool | None = None

