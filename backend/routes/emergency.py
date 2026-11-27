from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, Depends, Header

from auth.jwt_handler import get_current_user
from controllers.emergency_controller import (
    cancel_sos_controller,
    create_emergency_contact_controller,
    delete_emergency_contact_controller,
    get_emergency_config_controller,
    get_emergency_contacts_controller,
    get_emergency_history_controller,
    get_sos_event_controller,
    get_sos_location_controller,
    handle_sms_webhook_controller,
    stop_location_sharing_controller,
    trigger_sos_controller,
    update_emergency_contact_controller,
)
from models.emergency import (
    EmergencyContactCreate,
    EmergencyContactUpdate,
    SMSWebhookPayload,
    SOSCancelRequest,
    SOSCreate,
    SOSResponse,
)

router = APIRouter(prefix="/emergency", tags=["Emergency SOS Operations"])


@router.get("/config")
async def get_emergency_config(current_user: dict = Depends(get_current_user)):
    return await get_emergency_config_controller()


@router.get("/contacts")
async def list_emergency_contacts(current_user: dict = Depends(get_current_user)):
    return await get_emergency_contacts_controller(current_user["email"])


@router.post("/contacts")
async def create_emergency_contact(
    payload: EmergencyContactCreate,
    current_user: dict = Depends(get_current_user),
):
    return await create_emergency_contact_controller(current_user["email"], payload)


@router.put("/contacts/{contact_id}")
async def update_emergency_contact(
    contact_id: str,
    payload: EmergencyContactUpdate,
    current_user: dict = Depends(get_current_user),
):
    return await update_emergency_contact_controller(current_user["email"], contact_id, payload)


@router.delete("/contacts/{contact_id}")
async def delete_emergency_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user),
):
    return await delete_emergency_contact_controller(current_user["email"], contact_id)


@router.post("/sos", response_model=SOSResponse)
async def trigger_sos(sos_data: SOSCreate, current_user: dict = Depends(get_current_user)):
    return await trigger_sos_controller(current_user["email"], sos_data)


@router.get("/history", response_model=List[SOSResponse])
async def get_emergency_history(current_user: dict = Depends(get_current_user)):
    return await get_emergency_history_controller(current_user["email"])


@router.get("/sos/{event_id}", response_model=SOSResponse)
async def get_sos_event(event_id: str, current_user: dict = Depends(get_current_user)):
    return await get_sos_event_controller(current_user["email"], event_id)


@router.get("/sos/{event_id}/location")
async def get_sos_location(event_id: str, current_user: dict = Depends(get_current_user)):
    return await get_sos_location_controller(current_user["email"], event_id)


@router.post("/sos/{event_id}/stop-sharing", response_model=SOSResponse)
async def stop_location_sharing(event_id: str, current_user: dict = Depends(get_current_user)):
    return await stop_location_sharing_controller(current_user["email"], event_id)


@router.post("/sos/{event_id}/cancel", response_model=SOSResponse)
async def cancel_sos(
    event_id: str,
    payload: Optional[SOSCancelRequest] = Body(default=None),
    current_user: dict = Depends(get_current_user),
):
    return await cancel_sos_controller(current_user["email"], event_id, payload)


@router.post("/webhook/sms")
async def sms_status_webhook(
    payload: SMSWebhookPayload,
    x_healthpoint_webhook_secret: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    return await handle_sms_webhook_controller(payload, provided_secret=x_healthpoint_webhook_secret)
