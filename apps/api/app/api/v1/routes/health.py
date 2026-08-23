from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/api/v1")
def api_root():
    return {"message": "Vecino Centinela API v1"}

