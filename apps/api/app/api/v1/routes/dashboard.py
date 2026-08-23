from fastapi import APIRouter

router = APIRouter()


@router.get("/summary")
def summary():
    return {
        "total_users": 0,
        "total_leaders": 0,
        "total_centinels": 0,
        "total_neighborhoods": 0,
        "open_incidents": 0,
        "critical_incidents": 0,
    }

