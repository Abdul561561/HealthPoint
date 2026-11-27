"""
HealthPoint Extensible Connected Health Platforms Service
=========================================================
Provides honest platform integration status, OAuth/entitlement documentation,
and secure backend normalization interfaces for:
  - Android Health Connect
  - Apple HealthKit
  - Fitbit Web API
  - Garmin Connect

Guarantees:
- Never claims a device/platform is "Connected" unless real OAuth tokens or verified
  native companion sync credentials exist in backend state.
- Never fabricates synced steps, heart rate, or sleep measurements.
"""

import os
from typing import Any, Dict, List


PLATFORM_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "android_health_connect": {
        "id": "android_health_connect",
        "name": "Android Health Connect",
        "transport": "Native Android Companion SDK (cannot run directly inside a browser)",
        "env_keys": [],
        "required_permissions": [
            "android.permission.health.READ_HEART_RATE",
            "android.permission.health.READ_BLOOD_PRESSURE",
            "android.permission.health.READ_OXYGEN_SATURATION",
            "android.permission.health.READ_SLEEP",
            "android.permission.health.READ_STEPS",
            "android.permission.health.READ_WEIGHT",
        ],
        "approval_notes": "Requires an Android companion app signed with Health Connect Play Store declarations submitting authorized readings over HTTPS JWT to /api/vitals/readings.",
    },
    "apple_healthkit": {
        "id": "apple_healthkit",
        "name": "Apple HealthKit",
        "transport": "Native iOS/watchOS Companion App (unavailable to standard web apps)",
        "env_keys": [],
        "required_permissions": [
            "HKQuantityTypeIdentifierHeartRate",
            "HKQuantityTypeIdentifierBloodPressureSystolic",
            "HKQuantityTypeIdentifierBloodPressureDiastolic",
            "HKQuantityTypeIdentifierOxygenSaturation",
            "HKCategoryTypeIdentifierSleepAnalysis",
            "HKQuantityTypeIdentifierStepCount",
        ],
        "approval_notes": "Requires an iOS Swift companion app with Apple HealthKit entitlements syncing authorized HKStatistics payloads to the backend.",
    },
    "fitbit": {
        "id": "fitbit",
        "name": "Fitbit Web API",
        "transport": "OAuth 2.0 Authorization Code + PKCE via backend callback",
        "env_keys": ["FITBIT_CLIENT_ID", "FITBIT_CLIENT_SECRET"],
        "required_permissions": ["heartrate", "sleep", "activity", "weight", "oxygen_saturation"],
        "approval_notes": "Requires registering a Fitbit Developer app and setting FITBIT_CLIENT_ID + FITBIT_CLIENT_SECRET on the backend.",
    },
    "garmin": {
        "id": "garmin",
        "name": "Garmin Connect Health API",
        "transport": "OAuth 1.0a/2.0 Partner Webhook & Backfill API",
        "env_keys": ["GARMIN_CONSUMER_KEY", "GARMIN_CONSUMER_SECRET"],
        "required_permissions": ["Health API Partner Program Approval", "dailies", "sleeps", "epochs"],
        "approval_notes": "Requires Garmin Connect Developer Program commercial/health partner approval and backend credentials.",
    },
}


async def list_platform_integrations(db, user_email: str) -> List[Dict[str, Any]]:
    stored_map: Dict[str, Dict[str, Any]] = {}
    if db is not None:
        async for doc in db.platformConnections.find({"user_email": user_email}):
            stored_map[doc.get("platform")] = doc

    items: List[Dict[str, Any]] = []
    for pid, spec in PLATFORM_DEFINITIONS.items():
        env_configured = all(bool(os.getenv(k, "").strip()) for k in spec["env_keys"]) if spec["env_keys"] else False
        conn = stored_map.get(pid)
        has_valid_token = bool(conn and conn.get("access_token") and conn.get("authorized"))
        is_connected = has_valid_token and (env_configured or pid in ("android_health_connect", "apple_healthkit"))

        if is_connected:
            status_label = "connected"
            status_reason = "Authorized sync credentials active."
        elif pid in ("android_health_connect", "apple_healthkit"):
            status_label = "requires_native_app"
            status_reason = f"Requires native companion app integration ({spec['transport']})."
        elif not env_configured:
            status_label = "not_configured"
            status_reason = f"Backend credentials ({', '.join(spec['env_keys'])}) are not configured."
        else:
            status_label = "authorization_required"
            status_reason = "OAuth credentials present on server; user has not authorized access yet."

        items.append({
            "id": spec["id"],
            "name": spec["name"],
            "connected": is_connected,
            "status": status_label,
            "status_reason": status_reason,
            "transport": spec["transport"],
            "required_permissions": spec["required_permissions"],
            "approval_notes": spec["approval_notes"],
            "last_synced_at": conn.get("last_synced_at") if conn else None,
        })
    return items


async def sync_platform_vitals(db, user_email: str, platform_id: str) -> Dict[str, Any]:
    if platform_id not in PLATFORM_DEFINITIONS:
        return {"ok": False, "status_code": 404, "detail": f"Unsupported health platform '{platform_id}'."}

    platforms = await list_platform_integrations(db, user_email)
    target = next((p for p in platforms if p["id"] == platform_id), None)
    if not target or not target["connected"]:
        return {
            "ok": False,
            "status_code": 400,
            "detail": (
                f"{PLATFORM_DEFINITIONS[platform_id]['name']} cannot sync yet: "
                f"{target['status_reason'] if target else 'Not configured.'}"
            ),
        }

    # Extensible hook for live OAuth pull when tokens are present
    return {
        "ok": False,
        "status_code": 501,
        "detail": f"Live OAuth pull adapter for {PLATFORM_DEFINITIONS[platform_id]['name']} awaits external provider callback verification.",
    }
