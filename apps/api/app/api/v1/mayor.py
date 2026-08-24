"""Lógica del cargo de Líder Mayor (VecinoCentinela).

El primer líder creado de un vecindario es el LIDER MAYOR. Solo él (o el
superadmin) puede crear nuevos vecindarios. Cuando un Líder Mayor se da de baja,
el cargo pasa automáticamente al siguiente líder activo del vecindario (el de
menor código, típicamente L02); si no queda ningún líder activo, pasa al primer
centinela activo del vecindario (menor nº de código C).
"""
from sqlalchemy.orm import Session

from app.models.user import User


def is_first_leader(db: Session, neighborhood_id: int) -> bool:
    """True si aún no hay ningún líder activo en el vecindario (el primero será Mayor)."""
    if not neighborhood_id:
        return False
    return not db.query(User).filter(
        User.neighborhood_id == neighborhood_id,
        User.role_id == 29,  # leader
        User.is_active == True,
        User.is_blocked == False,
    ).first()


def promote_leader_mayor(db: Session, neighborhood_id: int) -> User | None:
    """Promueve al siguiente Líder Mayor de un vecindario tras dar de baja al actual.

    Prioridad: líder activo de menor código (L02…); si no hay líder activo, el
    primer centinela activo del vecindario (menor nº de código C).
    Devuelve el nuevo Mayor o None si no hay candidato.
    """
    if not neighborhood_id:
        return None
    # Persistir cambios pendientes (p. ej. el is_active=False del usuario recién
    # dado de baja) para que la consulta de candidatos no lo cuente como activo.
    db.flush()
    leaders = db.query(User).filter(
        User.neighborhood_id == neighborhood_id,
        User.role_id == 29,  # leader
        User.is_active == True,
        User.is_blocked == False,
        User.code.isnot(None),
    ).order_by(User.code).all()
    candidates = None
    if leaders:
        candidates = [u.id for u in leaders]
    else:
        # No hay líder activo → usar el primer centinela del vecindario (menor nº de código C)
        centis = db.query(User).filter(
            User.neighborhood_id == neighborhood_id,
            User.role_id == 30,  # sentinel
            User.is_active == True,
            User.is_blocked == False,
            User.code.isnot(None),
        ).order_by(User.code).all()
        if centis:
            candidates = [c.id for c in centis]
    if not candidates:
        return None
    # Limpiar otros mayores activos del vecindario y promover al primero
    others = db.query(User).filter(
        User.neighborhood_id == neighborhood_id,
        User.is_leader_mayor == True,
        User.is_active == True,
    ).all()
    for o in others:
        o.is_leader_mayor = False
    new_mayor = db.get(User, candidates[0])
    if new_mayor:
        new_mayor.is_leader_mayor = True
    db.commit()
    return new_mayor
