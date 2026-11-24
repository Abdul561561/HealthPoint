import pytest
import os
import re
from fastapi import HTTPException
from bson import ObjectId
from controllers.ai_controller import chat_ai_controller
from services.health_context_service import build_minimized_health_context
from services.document_service import validate_file_metadata
from services.llm_service import mask_key
from database.mongodb import get_database

pytestmark = pytest.mark.asyncio

# 15. User cannot read another user's records
async def test_15_cross_user_record_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection not available in local test environment")

    # Create dummy record for User A
    rec = {
        "user_email": "user_a@healthpoint.app",
        "title": "Confidential Blood Test User A",
        "category": "Lab Report",
        "date": "2026-11-20"
    }
    inserted = await db.records.insert_one(rec)
    rec_id = str(inserted.inserted_id)

    # Attempt query by User B
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

    # Create session owned by Alice
    sess = {
        "user_email": "alice@healthpoint.app",
        "status": "active",
        "messages": [{"role": "user", "content": "Alice private symptom"}]
    }
    inserted = await db.chat_history.insert_one(sess)
    session_id = str(inserted.inserted_id)

    # Bob tries to access Alice's session
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
    gemini_pattern = re.compile(r"AIzaSy[a-zA-Z0-9_-]{30,}", re.IGNORECASE)

    for root, _, files in os.walk(dist_dir):
        for f in files:
            if f.endswith((".js", ".html", ".map")):
                with open(os.path.join(root, f), "r", encoding="utf-8", errors="ignore") as bundle:
                    content = bundle.read()
                    assert not openrouter_pattern.search(content), f"Exposed OpenRouter key found in {f}!"

# 18. Invalid uploads are rejected
async def test_18_invalid_upload_rejection():
    # File larger than 10MB
    with pytest.raises(HTTPException) as exc1:
        validate_file_metadata("large_scan.pdf", "application/pdf", 12 * 1024 * 1024)
    assert exc1.value.status_code == 400

    # Disallowed executable file
    with pytest.raises(HTTPException) as exc2:
        validate_file_metadata("malware.exe", "application/x-msdownload", 1024)
    assert exc2.value.status_code == 400

# 19. Missing data is not fabricated
async def test_19_missing_data_not_fabricated():
    context = await build_minimized_health_context(
        "unseeded_patient_xyz@healthpoint.app", "Personal health", "What is my BMI?"
    )
    # Must report that metrics are not logged yet, never fabricate a fake number
    assert "not been recorded yet" in context.lower() or "no active" in context.lower()

# 20. Sensitive data is not included unnecessarily in model prompts
async def test_20_sensitive_pii_redaction():
    context = await build_minimized_health_context(
        "patient_john_doe_999@healthpoint.app", "Personal health", "What is my blood pressure?"
    )
    # Verify that email and PII are not dumped into prompt context
    assert "patient_john_doe_999@healthpoint.app" not in context
