# HealthPoint Connected Health Platforms Architecture

A standard browser-based React application cannot directly access native mobile health stores (Android Health Connect, Apple HealthKit) or protected wearable APIs (Fitbit OAuth2, Garmin Connect) without native companion SDKs or backend OAuth credentials.

## Supported Integration Targets (Backend Adapter Architecture)

| Platform | Transport | Required Scopes / Permissions | Approval / Credential Needs |
| :--- | :--- | :--- | :--- |
| **Android Health Connect** | Native Android Kotlin companion app posting authenticated readings to `POST /api/vitals/readings` with `source="android_health_connect"` | `READ_HEART_RATE`, `READ_BLOOD_PRESSURE`, `READ_OXYGEN_SATURATION`, `READ_SLEEP`, `READ_STEPS`, `READ_WEIGHT` | Google Play Console Health Connect declaration + signed Android APK |
| **Apple HealthKit** | Native iOS/watchOS Swift companion app syncing authorized `HKQuantitySample` records to backend | `HKQuantityTypeIdentifierHeartRate`, `BloodPressureSystolic/Diastolic`, `OxygenSaturation`, `SleepAnalysis`, `StepCount` | Apple Developer HealthKit capability + App Store review |
| **Fitbit Web API** | Backend OAuth 2.0 Authorization Code + PKCE callback storing user tokens in `db.platformConnections` | `heartrate`, `sleep`, `activity`, `weight`, `oxygen_saturation` | `FITBIT_CLIENT_ID` and `FITBIT_CLIENT_SECRET` configured on backend |
| **Garmin Connect** | Backend OAuth partner webhook & backfill ingestion into `db.vitalReadings` (`source="garmin"`) | Health API `dailies`, `sleeps`, `epochs` | Garmin Connect Developer Health API partner approval + `GARMIN_CONSUMER_KEY` / `GARMIN_CONSUMER_SECRET` |

## Integrity Rules Enforced
- Missing metrics stay `null` and are **never** fabricated or defaulted to zero.
- `GET /api/vitals/platforms` reports `connected: false` honestly whenever OAuth tokens or native companion credentials are absent.
- `POST /api/vitals/platforms/{platform_id}/sync` returns an explicit HTTP `400`/`501` explaining the missing authorization rather than returning fake device readings.
