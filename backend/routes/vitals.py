from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from auth.jwt_handler import get_current_user
from controllers.vitals_controller import (
    create_vital_reading_controller,
    delete_vital_reading_controller,
    export_vitals_summary_controller,
    get_platforms_controller,
    get_vitals_summary_controller,
    list_vital_readings_controller,
    sync_platform_controller,
    update_vital_reading_controller,
)
from models.vitals import VitalReadingCreate, VitalReadingUpdate

router = APIRouter(prefix="/vitals", tags=["Daily Vitals & Connected Health"])


@router.get("/readings")
async def list_vital_readings(
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
):
    return await list_vital_readings_controller(current_user["email"], days=days)


@router.post("/readings")
async def create_vital_reading(
    payload: VitalReadingCreate,
    current_user: dict = Depends(get_current_user),
):
    return await create_vital_reading_controller(current_user["email"], payload)


@router.put("/readings/{reading_id}")
async def update_vital_reading(
    reading_id: str,
    payload: VitalReadingUpdate,
    current_user: dict = Depends(get_current_user),
):
    return await update_vital_reading_controller(current_user["email"], reading_id, payload)


@router.delete("/readings/{reading_id}")
async def delete_vital_reading(
    reading_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await delete_vital_reading_controller(current_user["email"], reading_id)


@router.get("/summary")
async def get_vitals_summary(
    range_key: str = Query("week", alias="range", pattern="^(day|week|month)$"),
    current_user: dict = Depends(get_current_user),
):
    return await get_vitals_summary_controller(current_user["email"], range_key=range_key)


@router.get("/export")
async def export_vitals_summary(
    fmt: str = Query("json", alias="format", pattern="^(json|csv)$"),
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
):
    exported = await export_vitals_summary_controller(current_user["email"], fmt=fmt, days=days)
    if fmt == "csv":
        return Response(
            content=exported["data"],
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{exported["filename"]}"'},
        )
    return exported["data"]


@router.get("/platforms")
async def get_connected_platforms(current_user: dict = Depends(get_current_user)):
    return await get_platforms_controller(current_user["email"])


@router.post("/platforms/{platform_id}/sync")
async def sync_platform(platform_id: str, current_user: dict = Depends(get_current_user)):
    return await sync_platform_controller(current_user["email"], platform_id)
