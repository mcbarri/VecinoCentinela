from fastapi import HTTPException, status

from app.models.user import User


def require_roles(user: User, roles: set[str]) -> User:
    if user.role.name not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No autorizado")
    return user

