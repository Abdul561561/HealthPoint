import datetime
import os
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import HTTPException, status

from database.mongodb import get_database
from models.emergency import (
    EmergencyContactCreate,
    EmergencyContactUpdate,
    SMSWebhookPayload,
    SOSCancelRequest,
    SOSCreate,
    normalize_and_validate_phone,
)
from services.emergency_notification_service import (
    build_google_maps_link,
    build_osm_link,
    dispatch_emergency_notifications,
    format_emergency_message,
    get_delivery_capabilities,
)
from services.rate_limit_service import rate_limiter


def _serialize_contact(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "relation": doc.get("relation", "Emergency Contact"),
        "phone": doc.get("phone", ""),
        "email": doc.get("email"),
        "priority": int(doc.get("priority", 1) or 1),
        "is_primary": bool(doc.get("is_primary", False)),
    }


def _serialize_sos_event(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    out.setdefault("location_source", "gps")
    out.setdefault("location_sharing_active", out.get("status") == "active")
    out.setdefault("created_at", out.get("date", ""))
    out.setdefault("alert_message", "")
    out.setdefault("delivery_results", [])
    return out


async def _log_audit(db, user_email: str, action: str, event_id: Optional[str] = None, details: Optional[Dict[str, Any]] = None) -> None:
    if db is None:
        return
    await db.emergencyAuditLogs.insert_one({
        "user_email": user_email,
        "action": action,
        "event_id": event_id,
        "details": details or {},
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })


async def _sync_primary_contact_to_user(db, user_email: str) -> None:
    """Keep user profile's legacy `emergencyContact` fields aligned with highest-priority contact."""
    cursor = db.emergencyContacts.find({"user_email": user_email}).sort([("is_primary", -1), ("priority", 1), ("_id", 1)]).limit(1)
    docs = [d async for d in cursor]
    if docs:
        top = docs[0]
        await db.users.update_one(
            {"email": user_email},
            {"$set": {
                "emergencyContactName": top["name"],
                "emergencyContactPhone": top["phone"],
                "emergencyContact": f"{top['name']} — {top['phone']}",
            }},
        )
    else:
        await db.users.update_one(
            {"email": user_email},
            {"$set": {"emergencyContactName": "", "emergencyContactPhone": "", "emergencyContact": ""}},
        )


async def get_emergency_contacts_controller(user_email: str) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    cursor = db.emergencyContacts.find({"user_email": user_email}).sort([("is_primary", -1), ("priority", 1), ("_id", 1)])
    contacts = [_serialize_contact(doc) async for doc in cursor]

    # Non-destructive bootstrap from existing signup/profile emergencyContact fields on first load
    if not contacts:
        user = await db.users.find_one({"email": user_email})
        if user:
            raw_name = (user.get("emergencyContactName") or "").strip()
            raw_phone = (user.get("emergencyContactPhone") or "").strip()
            if (not raw_name or not raw_phone) and user.get("emergencyContact"):
                parts = str(user["emergencyContact"]).split("—")
                if len(parts) >= 2:
                    raw_name = raw_name or parts[0].strip()
                    raw_phone = raw_phone or parts[1].strip()
            if raw_name and raw_phone:
                try:
                    norm_phone = normalize_and_validate_phone(raw_phone)
                    doc = {
                        "user_email": user_email,
                        "name": raw_name,
                        "relation": "Primary Emergency Contact",
                        "phone": norm_phone,
                        "email": None,
                        "priority": 1,
                        "is_primary": True,
                        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    }
                    res = await db.emergencyContacts.insert_one(doc)
                    doc["_id"] = res.inserted_id
                    contacts.append(_serialize_contact(doc))
                except ValueError:
                    pass

    return contacts


async def create_emergency_contact_controller(user_email: str, payload: EmergencyContactCreate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    existing_count = await db.emergencyContacts.count_documents({"user_email": user_email})
    make_primary = payload.is_primary or existing_count == 0
    if make_primary:
        await db.emergencyContacts.update_many({"user_email": user_email}, {"$set": {"is_primary": False}})

    doc = {
        "user_email": user_email,
        "name": payload.name.strip(),
        "relation": payload.relation.strip(),
        "phone": payload.phone,
        "email": payload.email.strip() if payload.email else None,
        "priority": payload.priority,
        "is_primary": make_primary,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    res = await db.emergencyContacts.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _sync_primary_contact_to_user(db, user_email)
    await _log_audit(db, user_email, "contact_created", details={"contact_id": str(res.inserted_id)})
    return _serialize_contact(doc)


async def update_emergency_contact_controller(user_email: str, contact_id: str, payload: EmergencyContactUpdate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(contact_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contact ID format")

    existing = await db.emergencyContacts.find_one({"_id": oid, "user_email": user_email})
    if not existing:
        raise HTTPException(status_code=404, detail="Emergency contact not found")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates.get("is_primary"):
        await db.emergencyContacts.update_many({"user_email": user_email}, {"$set": {"is_primary": False}})
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if "relation" in updates:
        updates["relation"] = updates["relation"].strip()

    if updates:
        await db.emergencyContacts.update_one({"_id": oid, "user_email": user_email}, {"$set": updates})
    await _sync_primary_contact_to_user(db, user_email)
    updated = await db.emergencyContacts.find_one({"_id": oid, "user_email": user_email})
    return _serialize_contact(updated)


async def delete_emergency_contact_controller(user_email: str, contact_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(contact_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contact ID format")

    res = await db.emergencyContacts.delete_one({"_id": oid, "user_email": user_email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    await _sync_primary_contact_to_user(db, user_email)
    await _log_audit(db, user_email, "contact_deleted", details={"contact_id": contact_id})
    return {"success": True}


async def trigger_sos_controller(user_email: str, sos_data: SOSCreate) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    rate_limiter.check("emergency_sos", user_email, max_requests=6, window_seconds=120)

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now_utc.isoformat()
    display_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Duplicate SOS protection (identical idempotency_key OR another active SOS within 30 seconds)
    if sos_data.idempotency_key:
        dup_idem = await db.emergencies.find_one({"user_email": user_email, "idempotency_key": sos_data.idempotency_key})
        if dup_idem:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate SOS request blocked (already recorded as event {dup_idem['_id']}).",
            )

    recent_cutoff = (now_utc - datetime.timedelta(seconds=30)).isoformat()
    recent_active = await db.emergencies.find_one({
        "user_email": user_email,
        "status": "active",
        "created_at": {"$gte": recent_cutoff},
    })
    if recent_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active SOS alert ({recent_active['_id']}) was already triggered moments ago.",
        )

    user_doc = await db.users.find_one({"email": user_email}) or {}
    user_name = (user_doc.get("name") or user_email.split("@")[0]).strip()

    # Load saved contacts if caller did not explicitly pass a custom list
    contact_dicts = [c.model_dump() for c in sos_data.contacts] if sos_data.contacts else []
    if not contact_dicts:
        contact_dicts = await get_emergency_contacts_controller(user_email)

    lat = sos_data.latitude
    lng = sos_data.longitude
    maps_url = build_google_maps_link(lat, lng)
    osm_url = build_osm_link(lat, lng)

    # Sort contacts cleanly: primary first, then ascending priority
    contact_dicts.sort(key=lambda c: (not bool(c.get("is_primary", False)), int(c.get("priority", 1) or 1)))

    alert_message = format_emergency_message(
        user_name=user_name,
        maps_url=maps_url,
        alert_time_display=display_time,
        location_label=sos_data.location_label,
        location_source=sos_data.location_source,
        latitude=lat,
        longitude=lng,
        accuracy_meters=sos_data.accuracy_meters,
    )

    delivery_results = await dispatch_emergency_notifications(
        contacts=contact_dicts,
        user_name=user_name,
        message_body=alert_message,
        maps_url=maps_url,
        send_email_fallback=sos_data.send_email_fallback,
    )

    sos_doc: Dict[str, Any] = {
        "user_email": user_email,
        "user_name": user_name,
        "latitude": lat,
        "longitude": lng,
        "accuracy_meters": sos_data.accuracy_meters,
        "location_source": sos_data.location_source,
        "location_label": sos_data.location_label,
        "location_sharing_active": True if (lat is not None and lng is not None) else False,
        "captured_at": sos_data.captured_at or now_iso,
        "maps_url": maps_url,
        "osm_url": osm_url,
        "alert_message": alert_message,
        "contacts": contact_dicts,
        "delivery_results": delivery_results,
        "idempotency_key": sos_data.idempotency_key,
        "notes": sos_data.notes,
        "date": display_time,
        "created_at": now_iso,
        "status": "active",
    }

    result = await db.emergencies.insert_one(sos_doc)
    event_id = str(result.inserted_id)
    sos_doc["id"] = event_id
    del sos_doc["_id"]

    # Honest summary of real contact delivery (never claim SMS sent unless provider confirmed)
    sms_sent_count = sum(1 for r in delivery_results if r.get("sms_status") in ("Sent", "Delivered"))
    sms_failed_count = sum(1 for r in delivery_results if r.get("sms_status") == "Failed")
    email_sent_count = sum(1 for r in delivery_results if r.get("email_status") == "Sent")
    email_failed_count = sum(1 for r in delivery_results if r.get("email_status") == "Failed")
    manual_count = sum(1 for r in delivery_results if r.get("sms_status") == "Manual Fallback Required")

    delivery_note = (
        f"SMS sent via provider: {sms_sent_count}/{len(delivery_results)}; "
        f"Email sent: {email_sent_count}; "
        f"Manual SMS composer fallback: {manual_count}."
    )
    loc_summary = f" Location link: {maps_url}" if maps_url else (f" Reported location: {sos_data.location_label}" if sos_data.location_label else " Location unavailable.")

    notif_meta = {
        "event_id": event_id,
        "maps_url": maps_url,
        "osm_url": osm_url,
        "timestamp": display_time,
        "location_source": sos_data.location_source,
        "delivery_summary": [
            {
                "name": r.get("name"),
                "phone": r.get("phone"),
                "sms_status": r.get("sms_status"),
                "email_status": r.get("email_status"),
            }
            for r in delivery_results
        ],
    }

    notifications_to_insert: List[Dict[str, Any]] = [
        {
            "user_email": user_email,
            "title": "Emergency SOS Activated",
            "message": (
                f"SOS alert activated at {display_time} ({sos_data.location_source})."
                f"{loc_summary} Dial 112 (India) directly for official emergency services."
            ),
            "category": "emergency",
            "type": "emergency",
            "route": "/emergency",
            "date": display_time,
            "created_at": now_iso,
            "read": False,
            "source": "sos_activated",
            "metadata": notif_meta,
        }
    ]

    if len(delivery_results) > 0:
        any_automated_success = sms_sent_count > 0 or email_sent_count > 0
        any_automated_failure = sms_failed_count > 0 or email_failed_count > 0

        if any_automated_success:
            delivered_names = [
                r["name"]
                for r in delivery_results
                if r.get("sms_status") in ("Sent", "Delivered") or r.get("email_status") == "Sent"
            ]
            notifications_to_insert.append({
                "user_email": user_email,
                "title": "SOS Location Alert Sent",
                "message": (
                    f"Emergency alert dispatched at {display_time} to {', '.join(delivered_names)}. "
                    f"{delivery_note}{loc_summary}"
                ),
                "category": "emergency",
                "type": "emergency",
                "route": "/emergency",
                "date": display_time,
                "created_at": now_iso,
                "read": False,
                "source": "sos_alert_sent",
                "metadata": notif_meta,
            })

        if any_automated_failure or (not any_automated_success and manual_count == 0):
            failed_names = [
                r["name"]
                for r in delivery_results
                if r.get("sms_status") == "Failed" or r.get("email_status") == "Failed"
            ]
            notifications_to_insert.append({
                "user_email": user_email,
                "title": "SOS Alert Delivery Failed",
                "message": (
                    f"Automated alert delivery failed at {display_time}"
                    + (f" for {', '.join(failed_names)}" if failed_names else "")
                    + ". Open Emergency SOS to send SMS manually or dial 112."
                    + loc_summary
                ),
                "category": "emergency",
                "type": "emergency",
                "route": "/emergency",
                "date": display_time,
                "created_at": now_iso,
                "read": False,
                "source": "sos_alert_failed",
                "metadata": notif_meta,
            })
        elif not any_automated_success and manual_count > 0:
            notifications_to_insert.append({
                "user_email": user_email,
                "title": "SOS Alert Failed / Manual SMS Needed",
                "message": (
                    f"No automated SMS or email was delivered at {display_time} (SMS provider unconfigured / no email sent). "
                    f"Use the mobile SMS buttons on Emergency SOS or call contacts directly.{loc_summary}"
                ),
                "category": "emergency",
                "type": "emergency",
                "route": "/emergency",
                "date": display_time,
                "created_at": now_iso,
                "read": False,
                "source": "sos_alert_failed",
                "metadata": notif_meta,
            })
    else:
        notifications_to_insert.append({
            "user_email": user_email,
            "title": "SOS Alert Failed — No Contacts Configured",
            "message": (
                f"SOS activated at {display_time}, but no emergency contacts are saved on your account. "
                f"Add contacts or dial 112 directly.{loc_summary}"
            ),
            "category": "emergency",
            "type": "emergency",
            "route": "/emergency",
            "date": display_time,
            "created_at": now_iso,
            "read": False,
            "source": "sos_alert_failed",
            "metadata": notif_meta,
        })

    await db.notifications.insert_many(notifications_to_insert)
    await _log_audit(db, user_email, "sos_activated", event_id=event_id, details={"delivery_note": delivery_note})

    return sos_doc


async def get_emergency_history_controller(user_email: str) -> List[Dict[str, Any]]:
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable",
        )

    cursor = db.emergencies.find({"user_email": user_email}).sort("created_at", -1).limit(50)
    history = [_serialize_sos_event(doc) async for doc in cursor]
    history.sort(key=lambda x: x.get("created_at") or x.get("date", ""), reverse=True)
    return history


async def get_sos_event_controller(user_email: str, event_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SOS event ID format")

    doc = await db.emergencies.find_one({"_id": oid, "user_email": user_email})
    if not doc:
        raise HTTPException(status_code=404, detail="Emergency event not found")
    return _serialize_sos_event(doc)


async def get_sos_location_controller(user_email: str, event_id: str) -> Dict[str, Any]:
    event = await get_sos_event_controller(user_email, event_id)
    return {
        "event_id": event["id"],
        "latitude": event.get("latitude"),
        "longitude": event.get("longitude"),
        "accuracy_meters": event.get("accuracy_meters"),
        "location_source": event.get("location_source"),
        "location_label": event.get("location_label"),
        "location_sharing_active": event.get("location_sharing_active", False),
        "captured_at": event.get("captured_at"),
        "maps_url": event.get("maps_url"),
        "osm_url": event.get("osm_url"),
    }


async def stop_location_sharing_controller(user_email: str, event_id: str) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SOS event ID format")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    res = await db.emergencies.update_one(
        {"_id": oid, "user_email": user_email},
        {"$set": {"location_sharing_active": False, "sharing_stopped_at": now_iso}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Emergency event not found")
    await _log_audit(db, user_email, "location_sharing_stopped", event_id=event_id)
    updated = await db.emergencies.find_one({"_id": oid, "user_email": user_email})
    return _serialize_sos_event(updated)


async def cancel_sos_controller(user_email: str, event_id: str, cancel_data: Optional[SOSCancelRequest] = None) -> Dict[str, Any]:
    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    try:
        oid = ObjectId(event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SOS event ID format")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    reason = (cancel_data.reason.strip() if cancel_data and cancel_data.reason else None) or "Cancelled by user"
    res = await db.emergencies.update_one(
        {"_id": oid, "user_email": user_email},
        {
            "$set": {
                "status": "cancelled",
                "location_sharing_active": False,
                "cancelled_at": now_iso,
                "cancel_reason": reason,
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Emergency event not found")

    await db.notifications.insert_one({
        "user_email": user_email,
        "title": "Emergency SOS Cancelled",
        "message": f"SOS alert {event_id} marked as cancelled ({reason}) and active location sharing stopped.",
        "category": "emergency",
        "type": "emergency",
        "route": "/emergency",
        "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "created_at": now_iso,
        "read": False,
        "source": "sos",
    })
    await _log_audit(db, user_email, "sos_cancelled", event_id=event_id, details={"reason": reason})
    updated = await db.emergencies.find_one({"_id": oid, "user_email": user_email})
    return _serialize_sos_event(updated)


async def handle_sms_webhook_controller(payload: SMSWebhookPayload, provided_secret: Optional[str] = None) -> Dict[str, Any]:
    expected_secret = os.getenv("SMS_WEBHOOK_SECRET", "").strip()
    if not expected_secret:
        raise HTTPException(status_code=503, detail="SMS webhook verification secret not configured.")
    if not provided_secret or provided_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook signature or secret.")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        oid = ObjectId(payload.event_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SOS event ID")

    doc = await db.emergencies.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Emergency event not found")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    results = list(doc.get("delivery_results") or [])
    matched = False
    for entry in results:
        if (payload.provider_message_id and entry.get("provider_message_id") == payload.provider_message_id) or (
            payload.contact_phone and entry.get("phone") == payload.contact_phone
        ):
            entry["sms_status"] = payload.status
            if payload.detail:
                entry["sms_detail"] = payload.detail
            entry["updated_at"] = now_iso
            matched = True

    if not matched:
        raise HTTPException(status_code=404, detail="Matching contact delivery record not found on event")

    await db.emergencies.update_one({"_id": oid}, {"$set": {"delivery_results": results}})
    return {"success": True, "event_id": payload.event_id, "updated_status": payload.status}


async def get_emergency_config_controller() -> Dict[str, Any]:
    return get_delivery_capabilities()
