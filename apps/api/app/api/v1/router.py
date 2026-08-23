from fastapi import APIRouter

from app.api.v1.routes import auth, dashboard, incidents, me, neighborhoods, users

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(neighborhoods.router, prefix="/neighborhoods", tags=["neighborhoods"])
router.include_router(incidents.router, prefix="/incidents", tags=["incidents"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
router.include_router(me.router, prefix="/me", tags=["me"])
