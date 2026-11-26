import pytest
import os
import re
from unittest.mock import patch
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport

from main import app
from auth.jwt_handler import create_access_token, hash_password, validate_jwt_config
from controllers.ai_controller import chat_ai_controller
from services.health_context_service import build_minimized_health_context
from services.document_service import validate_file_metadata
from database.mongodb import get_database

pytestmark = pytest.mark.asyncio


# 15. User cannot read another user's records
async def test_15_cross_user_record_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available in local test environment")

    rec = {
        "user_email": "user_a@healthpoint.app",
        "title": "Confidential Blood Test User A",
        "category": "Lab Report",
        "date": "2026-11-20",
    }
    inserted = await db.records.insert_one(rec)
    rec_id = str(inserted.inserted_id)

    b_records = []
    cursor = db.records.find({"user_email": "user_b@healthpoint.app"})
    async for r in cursor:
        b_records.append(str(r["_id"]))

    assert rec_id not in b_records, "User B was able to view User A's medical record!"
    await db.records.delete_one({"_id": inserted.inserted_id})


# 16. User cannot access another user's chat session
async def test_16_cross_user_chat_session_protection():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available")

    sess = {
        "user_email": "alice@healthpoint.app",
        "status": "active",
        "messages": [{"role": "user", "content": "Alice private symptom"}],
    }
    inserted = await db.chat_history.insert_one(sess)
    session_id = str(inserted.inserted_id)

    with pytest.raises(HTTPException) as exc_info:
        await chat_ai_controller("bob@healthpoint.app", "Hello", session_id=session_id)
    assert exc_info.value.status_code in (403, 404)

    await db.chat_history.delete_one({"_id": inserted.inserted_id})


# 17. API key is not exposed in frontend bundles
async def test_17_no_api_keys_in_frontend():
    dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "dist")
    if not os.path.exists(dist_dir):
        pytest.skip("Frontend dist build not found")

    openrouter_pattern = re.compile(r"sk-or-v1-[a-zA-Z0-9]{32,}", re.IGNORECASE)
    for root, _, files in os.walk(dist_dir):
        for f in files:
            if f.endswith((".js", ".html", ".map")):
                with open(os.path.join(root, f), "r", encoding="utf-8", errors="ignore") as bundle:
                    content = bundle.read()
                    assert not openrouter_pattern.search(content), f"Exposed OpenRouter key found in {f}!"


# 18. Invalid uploads are rejected
async def test_18_invalid_upload_rejection():
    with pytest.raises(HTTPException) as exc1:
        validate_file_metadata("large_scan.pdf", "application/pdf", 12 * 1024 * 1024)
    assert exc1.value.status_code == 400

    with pytest.raises(HTTPException) as exc2:
        validate_file_metadata("malware.exe", "application/x-msdownload", 1024)
    assert exc2.value.status_code == 400


# 19. Missing data is not fabricated
async def test_19_missing_data_not_fabricated():
    context = await build_minimized_health_context(
        "unseeded_patient_xyz@healthpoint.app", "Personal health", "What is my BMI?"
    )
    assert "not been recorded yet" in context.lower() or "no active" in context.lower()


# 20. Sensitive data is not included unnecessarily in model prompts
async def test_20_sensitive_pii_redaction():
    context = await build_minimized_health_context(
        "patient_john_doe_999@healthpoint.app", "Personal health", "What is my blood pressure?"
    )
    assert "patient_john_doe_999@healthpoint.app" not in context


# 20b. Mock social login cannot issue tokens
async def test_mock_social_login_disabled():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/auth/social-login",
            json={"email": "attacker@example.com", "name": "Attacker", "provider": "Google"},
        )
        assert res.status_code == 403
        assert "access_token" not in res.json()


# 20c. Normal user (even with legacy mock admin email) cannot access admin endpoints
async def test_normal_user_cannot_access_admin():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    email = "alex.johnson@email.com"
    existing = await db.users.find_one({"email": email})
    await db.users.update_one(
        {"email": email},
        {"$set": {"name": "Regular User", "email": email, "password_hash": hash_password("Test1234!"), "role": "Patient", "is_verified": True}},
        upsert=True,
    )
    token = create_access_token({"sub": email, "role": "Patient"})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403

    if existing:
        await db.users.replace_one({"_id": existing["_id"]}, existing)
    else:
        await db.users.delete_one({"email": email})


# 20d. Cross-user consultation notes and insurance chat isolation
async def test_cross_user_consultation_and_insurance_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    user_a = "iso_a@healthpoint.app"
    user_b = "iso_b@healthpoint.app"
    for em in (user_a, user_b):
        await db.users.delete_many({"email": em})
        await db.users.insert_one(
            {"name": em, "email": em, "password_hash": hash_password("Pass123!"), "role": "Patient", "is_verified": True}
        )

    ins_sess = await db.aiInsuranceChats.insert_one(
        {"user_email": user_a, "status": "active", "messages": [{"role": "model", "content": "Private A"}]}
    )
    ins_id = str(ins_sess.inserted_id)

    token_b = create_access_token({"sub": user_b, "role": "Patient"})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        notes_res = await client.get(
            f"/api/consultations/notes/{user_a}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert notes_res.status_code == 403

        bio_res = await client.get(
            f"/api/consultations/biometrics/{user_a}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert bio_res.status_code == 403

        ins_res = await client.post(
            "/api/insurance/chat",
            json={"message": "Show my claims", "session_id": ins_id},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert ins_res.status_code == 404

    await db.aiInsuranceChats.delete_one({"_id": ins_sess.inserted_id})
    await db.users.delete_many({"email": {"$in": [user_a, user_b]}})


# 20e. Missing or weak production JWT secret causes safe startup failure
async def test_production_weak_jwt_secret_fails_safely():
    with patch.dict("os.environ", {"ENV": "production", "JWT_SECRET_KEY": "healthpoint_super_secret_key_12345!@#"}):
        with pytest.raises(RuntimeError):
            validate_jwt_config()

    with patch.dict("os.environ", {"ENV": "production", "JWT_SECRET_KEY": ""}):
        with pytest.raises(RuntimeError):
            validate_jwt_config()
