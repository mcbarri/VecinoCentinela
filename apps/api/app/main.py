from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.api.v1.routes.health import router as health_router
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app import models  # noqa: F401
from app.db.init_db import seed_defaults

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Vecino Centinela API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(health_router)
app.include_router(v1_router, prefix="/api/v1")


@app.on_event("startup")
def startup_seed() -> None:
    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()
