from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role_id: int
    neighborhood_id: int | None = None
    phone: str | None = None


class UserCreate(UserBase):
    password: str


class UserRead(UserBase):
    id: int
    is_active: bool
    is_blocked: bool
    avatar_url: str | None = None
    photo_required: bool = False
    onboarding_complete: bool = False


class UserUpdate(BaseModel):
    full_name: str | None = None
    role_id: int | None = None
    neighborhood_id: int | None = None
    is_active: bool | None = None
    is_blocked: bool | None = None
    phone: str | None = None
    avatar_url: str | None = None
    photo_required: bool | None = None
    onboarding_complete: bool | None = None


class UserListItem(UserRead):
    role_name: str
