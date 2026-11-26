import io
import pytest
from starlette.datastructures import UploadFile, Headers
from httpx import AsyncClient, ASGITransport

from main import app
from database.mongodb import get_database
from auth.jwt_handler import create_access_token, hash_password
from controllers.record_controller import upload_record_file_controller, delete_record_controller
from controllers.pharmacy_controller import upload_prescription_cloudinary, delete_prescription_controller
from services.document_service import validate_file_metadata, resolve_safe_upload_path
from fastapi import HTTPException

pytestmark = pytest.mark.asyncio

OWNER_EMAIL = "doc_owner_a@healthpoint.app"
OTHER_EMAIL = "doc_other_b@healthpoint.app"

# Minimal valid 1x1 PNG bytes
VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x03\x01\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _ensure_verified_user(db, email: str, name: str):
    await db.users.delete_many({"email": email})
    await db.users.insert_one(
        {
            "name": name,
            "email": email,
            "password_hash": hash_password("SecurePass123!"),
            "role": "Patient",
            "is_verified": True,
        }
    )


async def test_document_upload_owner_download_and_cross_user_isolation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    await _ensure_verified_user(db, OWNER_EMAIL, "Owner A")
    await _ensure_verified_user(db, OTHER_EMAIL, "Other B")

    upload = UploadFile(
        file=io.BytesIO(VALID_PNG_BYTES),
        filename="lab_scan.png",
        headers=Headers({"content-type": "image/png"}),
    )

    created = await upload_record_file_controller(
        OWNER_EMAIL, upload, "Owner Blood Scan", "Blood Test", "2026-11-26"
    )
    rec_id = created["id"]
    assert created["url"] == f"/api/records/{rec_id}/download"
    assert "local_path" not in created
    assert "stored_filename" not in created

    owner_token = create_access_token({"sub": OWNER_EMAIL, "role": "Patient"})
    other_token = create_access_token({"sub": OTHER_EMAIL, "role": "Patient"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Unauthenticated download rejected
        unauth = await client.get(f"/api/records/{rec_id}/download")
        assert unauth.status_code in (401, 403)

        # Public /api/uploads static mount must NOT exist
        static_res = await client.get("/api/uploads/records/anything.png")
        assert static_res.status_code == 404

        # Other user cannot download owner's document
        other_res = await client.get(
            f"/api/records/{rec_id}/download",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert other_res.status_code == 403

        # Owner can download their own document
        owner_res = await client.get(
            f"/api/records/{rec_id}/download",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert owner_res.status_code == 200
        assert owner_res.content == VALID_PNG_BYTES

    await delete_record_controller(OWNER_EMAIL, rec_id)
    await db.users.delete_many({"email": {"$in": [OWNER_EMAIL, OTHER_EMAIL]}})


async def test_prescription_upload_and_cross_user_download_blocked():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    await _ensure_verified_user(db, OWNER_EMAIL, "Owner A")
    await _ensure_verified_user(db, OTHER_EMAIL, "Other B")

    upload = UploadFile(
        file=io.BytesIO(VALID_PNG_BYTES),
        filename="rx_scan.png",
        headers=Headers({"content-type": "image/png"}),
    )

    created = await upload_prescription_cloudinary(OWNER_EMAIL, upload)
    rx_id = created["id"]
    assert created["url"] == f"/api/pharmacy/prescriptions/{rx_id}/download"

    owner_token = create_access_token({"sub": OWNER_EMAIL, "role": "Patient"})
    other_token = create_access_token({"sub": OTHER_EMAIL, "role": "Patient"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        other_res = await client.get(
            f"/api/pharmacy/prescriptions/{rx_id}/download",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert other_res.status_code == 403

        owner_res = await client.get(
            f"/api/pharmacy/prescriptions/{rx_id}/download",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert owner_res.status_code == 200
        assert owner_res.content == VALID_PNG_BYTES

    await delete_prescription_controller(OWNER_EMAIL, rx_id)
    await db.users.delete_many({"email": {"$in": [OWNER_EMAIL, OTHER_EMAIL]}})


async def test_spoofed_magic_bytes_and_path_traversal_rejected():
    # Spoofed executable disguised as .png
    with pytest.raises(HTTPException) as exc1:
        validate_file_metadata("fake.png", "image/png", 100, content=b"MZ\x90\x00not_a_png")
    assert exc1.value.status_code == 400

    # Path traversal blocked
    with pytest.raises(HTTPException) as exc2:
        resolve_safe_upload_path("records", stored_filename="../../.env")
    assert exc2.value.status_code in (400, 403)
