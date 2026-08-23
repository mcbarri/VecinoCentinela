from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_db
from app.models.user import User
from app.schemas.auth import Token
from app.schemas.user import UserCreate
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter()


@router.post("/register", response_model=dict)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        neighborhood_id=payload.neighborhood_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email}


@router.post("/login", response_model=Token)
def login(payload: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.get("email")).first()
    if not user or not verify_password(payload.get("password", ""), user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)

