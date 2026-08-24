from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class PresenceEvent(Base):
    """Log de TELEMETRÍA de presencia/posicionamiento (pipeline redundante).

    Registra eventos de resiliencia para auditoría: GPS desactivado o sin
    permiso, pérdida de conexión de red, reconexión con cola diferida,
    posicionamiento por IP (fallback), latidos acumulados sin enviar, etc.

    Es UN CANAL SEPARADO del sistema de Incidentes de seguridad vecinal
    (tabla `incidents`), que es para reportes de hechos del vecindario.
    Esta tabla documenta QUÉ le pasó técnicamente a un centinela en cuanto a
    su presencia/posición, aunque pierda GPS o red.
    """
    __tablename__ = "presence_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Tipo de evento: gps_off | gps_denied | gps_timeout | network_off |
    #                reconnect | offline_events | ip_fallback | heartbeat
    kind = Column(String(50), nullable=False, index=True)
    message = Column(Text, nullable=True)
    # Coordenadas conocidas en el momento del evento (fila sin posición si None)
    latitude = Column(String(32), nullable=True)
    longitude = Column(String(32), nullable=True)
    # Fuente/confianza de la posición (gps | ip | none)
    source = Column(String(20), nullable=True)
    confidence = Column(String(20), nullable=True)
    # Cantidad de latidos acumulados en cola (evento offline_events/reconnect)
    queued_count = Column(Integer, nullable=True)
    # Metadatos extra (JSON string: ip_publica, banderas, etc.)
    meta = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
