from fastapi import HTTPException, status
from database.mongodb import get_database
from services.osm_service import search_nearby_osm_facilities


async def get_doctors_controller(lat: float = None, lng: float = None):
    """
    Retrieve real healthcare facilities when coordinates are supplied, or stored MongoDB
    platform directory entries. Never invents synthetic names, fees, or ratings.
    """
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    if lat is not None and lng is not None:
        osm_res = await search_nearby_osm_facilities(lat=lat, lng=lng, specialty="All", radius=8000, limit=15)
        if osm_res.get("ok") and osm_res.get("results"):
            return osm_res["results"]

    doctors_list = []
    doctors_cursor = db.doctors.find({})
    async for doc in doctors_cursor:
        doc["id"] = doc.get("id") or str(doc["_id"])
        doc.pop("_id", None)
        doctors_list.append(doc)

    return doctors_list
