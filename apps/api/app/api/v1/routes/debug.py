"""Captura de errores de runtime del cliente (frontend web).
Recibe reportes de excepciones no capturadas del navegador y los guarda en log
para diagnosticar errores intermitentes sin necesidad de reproducirlos.
"""
import logging
import time
from fastapi import APIRouter

logger = logging.getLogger("client_errors")

router = APIRouter()


@router.post("/crash")
async def report_client_crash(payload: dict):
    try:
        message = str(payload.get("message", ""))[:800]
        source = str(payload.get("source", ""))[:300]
        lineno = payload.get("lineno")
        colno = payload.get("colno")
        error_obj = str(payload.get("error", ""))[:800]
        stack = str(payload.get("stack", ""))[:2000]
        url = str(payload.get("url", ""))[:300]
        if message:
            logger.error(
                "CLIENT_CRASH ts=%s message=%s source=%s:%s:%s url=%s error=%s stack=%s",
                int(time.time()), message, source, lineno, colno, url, error_obj, stack,
            )
        # evolución: guardar en BD si se necesita persistencia
    except Exception:  # pragma: no cover
        pass
    return {"ok": True}
