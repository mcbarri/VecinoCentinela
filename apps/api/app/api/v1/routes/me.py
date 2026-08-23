from fastapi import APIRouter, Depends

from app.api.v1.auth import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("")
def read_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.name,
    }
