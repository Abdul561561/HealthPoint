"""
HealthPoint Emergency Notification Delivery Service
===================================================
Supports provider-based SMS delivery (Twilio REST API or custom backend SMS webhook),
optional Gmail SMTP email fallback, and explicit mobile SMS composer URI generation
when no paid backend SMS provider is configured.

Guarantees:
- Never exposes SMS credentials or webhooks to the frontend.
- Never claims an SMS was Delivered or Sent unless the provider confirms acceptance/delivery.
- Separates Pending, Sent, Delivered, Failed, and Manual Fallback Required states cleanly.
"""

import asyncio
import datetime
import html
import logging
import os
import urllib.parse
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv

from services.email_service import _send_smtp_sync, is_smtp_configured

logger = logging.getLogger("healthpoint.emergency_delivery")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)


def get_sms_provider_config() -> Dict[str, Any]:
    provider = os.getenv("SMS_PROVIDER", "none").strip().lower() or "none"
    timeout_s = float(os.getenv("SMS_TIMEOUT_SECONDS", "10") or "10")
    if provider == "twilio":
        sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        from_num = os.getenv("TWILIO_FROM_NUMBER", "").strip()
        configured = bool(sid and token and from_num)
        return {
            "provider": "twilio",
            "configured": configured,
            "sid": sid,
            "token": token,
            "from_number": from_num,
            "timeout": timeout_s,
        }
    if provider == "webhook":
        webhook_url = os.getenv("SMS_WEBHOOK_URL", "").strip()
        webhook_token = os.getenv("SMS_WEBHOOK_AUTH_TOKEN", "").strip()
        return {
            "provider": "webhook",
            "configured": bool(webhook_url),
            "webhook_url": webhook_url,
            "webhook_token": webhook_token,
            "timeout": timeout_s,
        }
    return {"provider": "none", "configured": False, "timeout": timeout_s}


def get_delivery_capabilities() -> Dict[str, Any]:
    sms_cfg = get_sms_provider_config()
    return {
        "sms_provider": sms_cfg["provider"] if sms_cfg["configured"] else "none",
        "sms_configured": bool(sms_cfg["configured"]),
        "email_fallback_configured": is_smtp_configured(),
        "manual_sms_composer_available": True,
        "india_emergency_number": "112",
    }


def build_google_maps_link(latitude: Optional[float], longitude: Optional[float]) -> Optional[str]:
    if latitude is None or longitude is None:
        return None
    if latitude == 0.0 and longitude == 0.0:
        return None
    return f"https://www.google.com/maps?q={latitude:.6f},{longitude:.6f}"


def build_osm_link(latitude: Optional[float], longitude: Optional[float]) -> Optional[str]:
    if latitude is None or longitude is None:
        return None
    if latitude == 0.0 and longitude == 0.0:
        return None
    return f"https://www.openstreetmap.org/?mlat={latitude:.6f}&mlon={longitude:.6f}#map=16/{latitude:.6f}/{longitude:.6f}"


def format_emergency_message(
    user_name: str,
    maps_url: Optional[str],
    alert_time_display: str,
    location_label: Optional[str] = None,
    location_source: str = "gps",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    accuracy_meters: Optional[float] = None,
) -> str:
    safe_name = (user_name or "A HealthPoint user").strip()
    lines = [
        f"EMERGENCY ALERT! {safe_name} may need immediate assistance.",
        "",
    ]

    if maps_url:
        src_note = "Manually provided" if location_source == "manual" else "GPS"
        lines.append(f"Current location ({src_note}): {maps_url}")
    elif location_label:
        lines.append(f"Location (Manually provided): {location_label}")
    else:
        lines.append("Location: Live GPS coordinates were unavailable at activation time.")

    if latitude is not None and longitude is not None and not (latitude == 0.0 and longitude == 0.0):
        coord_line = f"Coordinates: {latitude:.6f}, {longitude:.6f}"
        if accuracy_meters is not None and accuracy_meters > 0:
            coord_line += f" (GPS accuracy: ±{round(accuracy_meters)} m)"
        lines.append(coord_line)

    if location_label and maps_url:
        lines.append(f"Location note: {location_label}")

    lines.append(f"Time: {alert_time_display}")
    lines.append("")
    lines.append("Please contact them and provide assistance immediately.")
    return "\n".join(lines)


def build_mobile_sms_uri(phone: str, message_body: str) -> str:
    clean_phone = (phone or "").strip()
    return f"sms:{clean_phone}?body={urllib.parse.quote(message_body)}"


async def _send_single_sms(
    to_phone: str,
    message_body: str,
    sms_cfg: Dict[str, Any],
) -> Dict[str, Any]:
    if not sms_cfg.get("configured"):
        return {
            "status": "Manual Fallback Required",
            "provider": "none",
            "provider_message_id": None,
            "detail": "No backend SMS provider configured; use mobile SMS composer button to send manually.",
        }

    provider = sms_cfg["provider"]
    timeout_s = float(sms_cfg.get("timeout", 10.0))
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            if provider == "twilio":
                url = f"https://api.twilio.com/2010-04-01/Accounts/{sms_cfg['sid']}/Messages.json"
                res = await client.post(
                    url,
                    data={"From": sms_cfg["from_number"], "To": to_phone, "Body": message_body},
                    auth=(sms_cfg["sid"], sms_cfg["token"]),
                )
                if 200 <= res.status_code < 300:
                    body = res.json()
                    tw_status = str(body.get("status") or "").lower()
                    mapped = "Delivered" if tw_status == "delivered" else ("Sent" if tw_status in ("sent", "queued", "accepted") else "Pending")
                    return {
                        "status": mapped,
                        "provider": "twilio",
                        "provider_message_id": body.get("sid"),
                        "detail": f"Twilio accepted message (status: {tw_status or 'queued'}).",
                    }
                return {
                    "status": "Failed",
                    "provider": "twilio",
                    "provider_message_id": None,
                    "detail": f"Twilio rejected SMS (HTTP {res.status_code}).",
                }

            if provider == "webhook":
                headers = {"Content-Type": "application/json"}
                if sms_cfg.get("webhook_token"):
                    headers["Authorization"] = f"Bearer {sms_cfg['webhook_token']}"
                res = await client.post(
                    sms_cfg["webhook_url"],
                    json={"to": to_phone, "message": message_body},
                    headers=headers,
                )
                if 200 <= res.status_code < 300:
                    data = {}
                    try:
                        data = res.json()
                    except Exception:
                        data = {}
                    raw_status = str(data.get("status") or "Sent").capitalize()
                    mapped = raw_status if raw_status in ("Pending", "Sent", "Delivered", "Failed") else "Sent"
                    return {
                        "status": mapped,
                        "provider": "webhook",
                        "provider_message_id": data.get("message_id") or data.get("id"),
                        "detail": data.get("detail") or f"SMS webhook responded HTTP {res.status_code}.",
                    }
                return {
                    "status": "Failed",
                    "provider": "webhook",
                    "provider_message_id": None,
                    "detail": f"SMS webhook returned HTTP {res.status_code}.",
                }
    except httpx.TimeoutException:
        return {
            "status": "Failed",
            "provider": provider,
            "provider_message_id": None,
            "detail": f"SMS provider '{provider}' timed out after {timeout_s}s.",
        }
    except Exception as exc:
        logger.warning("SMS delivery error (%s): %s", provider, type(exc).__name__)
        return {
            "status": "Failed",
            "provider": provider,
            "provider_message_id": None,
            "detail": f"SMS provider error ({type(exc).__name__}).",
        }

    return {
        "status": "Manual Fallback Required",
        "provider": "none",
        "provider_message_id": None,
        "detail": "SMS provider not configured.",
    }


async def _send_email_fallback(to_email: str, user_name: str, message_body: str, maps_url: Optional[str]) -> Dict[str, Any]:
    if not to_email or not to_email.strip():
        return {"email_status": None, "email_detail": None}
    if not is_smtp_configured():
        return {"email_status": "Not Configured", "email_detail": "SMTP email credentials not configured on server."}

    safe_user = html.escape(user_name or "HealthPoint User")
    safe_lines_html = "<br/>".join(html.escape(line) for line in message_body.splitlines())
    map_html = (
        f'<p style="margin:16px 0;"><a href="{html.escape(maps_url)}" '
        f'style="display:inline-block;padding:10px 18px;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px;">'
        f'Open Location on Google Maps</a><br/><span style="font-size:12px;color:#334155;">{html.escape(maps_url)}</span></p>'
        if maps_url
        else ""
    )
    html_body = (
        f"<div style='font-family:Inter,Arial,sans-serif;padding:18px;border:2px solid #e11d48;border-radius:12px;background:#fff;'>"
        f"<h2 style='color:#e11d48;margin-top:0;'>EMERGENCY SOS ALERT — {safe_user}</h2>"
        f"<p style='font-size:15px;color:#0f172a;line-height:1.55;'>{safe_lines_html}</p>"
        f"{map_html}"
        f"<p style='font-size:12px;color:#475569;margin-top:16px;'>Sent via HealthPoint Emergency SOS. Please attempt immediate voice contact or call local emergency services (112 / 911).</p>"
        f"</div>"
    )
    try:
        await asyncio.to_thread(
            _send_smtp_sync,
            to_email.strip(),
            f"URGENT: Emergency SOS Alert for {user_name or 'HealthPoint User'}",
            message_body,
            html_body,
        )
        return {"email_status": "Sent", "email_detail": f"Emergency alert email sent to {to_email.strip()}."}
    except Exception as exc:
        return {"email_status": "Failed", "email_detail": f"Email delivery failed ({type(exc).__name__})."}


async def dispatch_emergency_notifications(
    contacts: List[Dict[str, Any]],
    user_name: str,
    message_body: str,
    maps_url: Optional[str],
    send_email_fallback: bool = True,
) -> List[Dict[str, Any]]:
    sms_cfg = get_sms_provider_config()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    results: List[Dict[str, Any]] = []

    for contact in contacts:
        phone = contact.get("phone", "")
        email = contact.get("email")
        sms_res = await _send_single_sms(phone, message_body, sms_cfg)
        email_res = (
            await _send_email_fallback(email, user_name, message_body, maps_url)
            if send_email_fallback and email
            else {"email_status": None, "email_detail": None}
        )
        results.append({
            "contact_id": contact.get("id"),
            "name": contact.get("name", ""),
            "relation": contact.get("relation", ""),
            "phone": phone,
            "email": email,
            "sms_status": sms_res["status"],
            "sms_provider": sms_res["provider"],
            "provider_message_id": sms_res.get("provider_message_id"),
            "sms_detail": sms_res["detail"],
            "sms_composer_url": build_mobile_sms_uri(phone, message_body),
            "email_status": email_res["email_status"],
            "email_detail": email_res["email_detail"],
            "updated_at": now_iso,
        })

    return results
