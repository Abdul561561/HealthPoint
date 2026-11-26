import datetime
from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport

from main import app
from database.mongodb import get_database
from auth.jwt_handler import verify_password, create_access_token
from models.user import UserRegister, UserLogin, VerifyRequest
from controllers.auth_controller import (
    register_user_controller,
    verify_user_controller,
    resend_otp_controller,
    login_user_controller,
    MAX_OTP_ATTEMPTS,
)

pytestmark = pytest.mark.asyncio

OTP_TEST_EMAIL = "otp_test_user@healthpoint.app"
OTP_TEST_PASSWORD = "StrongSecurePassword123!"


async def _cleanup_otp_user(db, email: str):
    await db.users.delete_many({"email": email})
    await db.metrics.delete_many({"user_email": email})
    await db.settings.delete_many({"user_email": email})


async def test_otp_registration_email_delivery_and_verification_flow():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    await _cleanup_otp_user(db, OTP_TEST_EMAIL)
    sent_otps = []

    async def fake_send_otp(to_email: str, name: str, otp_code: str):
        sent_otps.append((to_email, otp_code))

    with patch("controllers.auth_controller.send_otp_email", side_effect=fake_send_otp):
        reg_res = await register_user_controller(
            UserRegister(
                name="OTP Tester",
                email=OTP_TEST_EMAIL,
                password=OTP_TEST_PASSWORD,
                height="175 cm",
                weight="70 kg",
            )
        )

    assert reg_res["status"] == "verification_required"
    assert "access_token" not in reg_res
    assert len(sent_otps) == 1
    otp_code = sent_otps[0][1]
    assert len(otp_code) == 6 and otp_code.isdigit()

    # Check DB stores hashed OTP only (never plain-text) and user is unverified
    user_doc = await db.users.find_one({"email": OTP_TEST_EMAIL})
    assert user_doc is not None
    assert user_doc["is_verified"] is False
    assert user_doc["password_hash"] != OTP_TEST_PASSWORD
    assert verify_password(OTP_TEST_PASSWORD, user_doc["password_hash"])
    assert user_doc.get("otp_hash") and otp_code not in user_doc["otp_hash"]
    assert "verification_otp" not in user_doc

    # Unverified login must be rejected (403)
    with pytest.raises(HTTPException) as unverified_exc:
        await login_user_controller(UserLogin(email=OTP_TEST_EMAIL, password=OTP_TEST_PASSWORD))
    assert unverified_exc.value.status_code == 403

    # Verify with valid OTP
    verify_res = await verify_user_controller(VerifyRequest(email=OTP_TEST_EMAIL, otp=otp_code))
    assert verify_res["status"] == "verified"
    assert "access_token" not in verify_res

    verified_doc = await db.users.find_one({"email": OTP_TEST_EMAIL})
    assert verified_doc["is_verified"] is True
    assert "otp_hash" not in verified_doc

    # Old OTP cannot be reused after verification
    with pytest.raises(HTTPException) as reuse_exc:
        await verify_user_controller(VerifyRequest(email=OTP_TEST_EMAIL, otp=otp_code))
    assert reuse_exc.value.status_code == 400

    # Verified login succeeds and returns JWT
    login_res = await login_user_controller(UserLogin(email=OTP_TEST_EMAIL, password=OTP_TEST_PASSWORD))
    assert "access_token" in login_res
    token = login_res["access_token"]

    # JWT-protected endpoint works with verified account token
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        prof_res = await client.get("/api/auth/profile", headers={"Authorization": f"Bearer {token}"})
        assert prof_res.status_code == 200
        assert prof_res.json()["email"] == OTP_TEST_EMAIL

    await _cleanup_otp_user(db, OTP_TEST_EMAIL)


async def test_smtp_mock_email_send_and_missing_config_error():
    from services.email_service import send_otp_email, EmailDeliveryError

    mock_smtp_instance = MagicMock()
    mock_smtp_ctx = MagicMock()
    mock_smtp_ctx.__enter__.return_value = mock_smtp_instance
    mock_smtp_ctx.__exit__.return_value = False

    with patch.dict("os.environ", {
        "SMTP_EMAIL": "sender@gmail.com",
        "SMTP_APP_PASSWORD": "test_app_password",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "587",
    }):
        with patch("smtplib.SMTP", return_value=mock_smtp_ctx) as smtp_cls:
            await send_otp_email("recipient@example.com", "Alice", "123456")
            smtp_cls.assert_called_once_with("smtp.gmail.com", 587, timeout=15)
            mock_smtp_instance.starttls.assert_called_once()
            mock_smtp_instance.login.assert_called_once_with("sender@gmail.com", "test_app_password")
            mock_smtp_instance.send_message.assert_called_once()

    # Missing SMTP credentials must fail clearly (never pretend delivery succeeded)
    with patch.dict("os.environ", {"SMTP_EMAIL": "", "SMTP_APP_PASSWORD": ""}):
        with pytest.raises(EmailDeliveryError) as exc:
            await send_otp_email("recipient@example.com", "Alice", "123456")
        assert exc.value.status_code == 503


async def test_otp_incorrect_attempts_expiry_resend_cooldown_and_old_otp_invalidation():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    await _cleanup_otp_user(db, OTP_TEST_EMAIL)
    sent_otps = []

    async def fake_send_otp(to_email: str, name: str, otp_code: str):
        sent_otps.append(otp_code)

    with patch("controllers.auth_controller.send_otp_email", side_effect=fake_send_otp):
        await register_user_controller(
            UserRegister(name="OTP Security", email=OTP_TEST_EMAIL, password=OTP_TEST_PASSWORD)
        )
        first_otp = sent_otps[-1]

        # Resend cooldown blocks immediate resend (< 60s)
        with pytest.raises(HTTPException) as cooldown_exc:
            await resend_otp_controller(OTP_TEST_EMAIL)
        assert cooldown_exc.value.status_code == 429

        # Simulate 65s elapsed so resend succeeds and invalidates first OTP
        await db.users.update_one(
            {"email": OTP_TEST_EMAIL},
            {"$set": {"otp_last_sent_at": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=65)}},
        )
        await resend_otp_controller(OTP_TEST_EMAIL)
        second_otp = sent_otps[-1]

    # Old OTP must fail if different from new OTP
    if first_otp != second_otp:
        with pytest.raises(HTTPException) as old_exc:
            await verify_user_controller(VerifyRequest(email=OTP_TEST_EMAIL, otp=first_otp))
        assert old_exc.value.status_code == 400

    # Incorrect OTP fails and increments attempt counter until max 5 attempts locks out
    wrong_otp = "000000" if second_otp != "000000" else "999999"
    # Reset attempts to 0 to test full 5 attempts cleanly
    await db.users.update_one({"email": OTP_TEST_EMAIL}, {"$set": {"otp_attempts": 0}})
    for idx in range(MAX_OTP_ATTEMPTS):
        with pytest.raises(HTTPException) as bad_exc:
            await verify_user_controller(VerifyRequest(email=OTP_TEST_EMAIL, otp=wrong_otp))
        if idx < MAX_OTP_ATTEMPTS - 1:
            assert bad_exc.value.status_code == 400
        else:
            assert bad_exc.value.status_code == 429

    # Subsequent attempt even with correct OTP is rejected due to max attempts
    with pytest.raises(HTTPException) as locked_exc:
        await verify_user_controller(VerifyRequest(email=OTP_TEST_EMAIL, otp=second_otp))
    assert locked_exc.value.status_code == 429

    # Expired OTP fails
    await db.users.update_one(
        {"email": OTP_TEST_EMAIL},
        {
            "$set": {
                "otp_attempts": 0,
                "otp_expires_at": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1),
            }
        },
    )
    with pytest.raises(HTTPException) as exp_exc:
        await verify_user_controller(VerifyRequest(email=OTP_TEST_EMAIL, otp=second_otp))
    assert exp_exc.value.status_code == 400

    await _cleanup_otp_user(db, OTP_TEST_EMAIL)


async def test_protected_endpoint_rejects_unverified_jwt():
    db = get_database()
    if db is None:
        pytest.skip("MongoDB connection unavailable")

    await _cleanup_otp_user(db, OTP_TEST_EMAIL)
    with patch("controllers.auth_controller.send_otp_email", return_value=None):
        await register_user_controller(
            UserRegister(name="Unverified", email=OTP_TEST_EMAIL, password=OTP_TEST_PASSWORD)
        )

    forged_token = create_access_token({"sub": OTP_TEST_EMAIL, "role": "Patient"})
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/records", headers={"Authorization": f"Bearer {forged_token}"})
        assert res.status_code == 403

    await _cleanup_otp_user(db, OTP_TEST_EMAIL)


async def test_keyed_hmac_otp_hashing_and_constant_time_verification():
    import hashlib
    from controllers.auth_controller import _hash_otp, _verify_otp_hash

    email = "hmac_test@healthpoint.app"
    otp = "482913"

    with patch.dict("os.environ", {"OTP_HMAC_SECRET": "a_very_strong_test_hmac_secret_key_123456"}):
        stored = _hash_otp(email, otp)
        assert "$" in stored
        salt, digest = stored.split("$", 1)

        # Keyed HMAC must NOT match plain salted SHA-256
        plain_sha256 = hashlib.sha256(f"{salt}:{email}:{otp}".encode("utf-8")).hexdigest()
        assert digest != plain_sha256

        assert _verify_otp_hash(email, otp, stored) is True
        assert _verify_otp_hash(email, "000000", stored) is False
        assert _verify_otp_hash("other@healthpoint.app", otp, stored) is False

    # Verification with a different server HMAC secret must fail
    with patch.dict("os.environ", {"OTP_HMAC_SECRET": "different_strong_test_hmac_secret_key_999"}):
        assert _verify_otp_hash(email, otp, stored) is False


async def test_smtp_diagnostic_endpoint_hides_credentials():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch.dict("os.environ", {
            "SMTP_EMAIL": "secret_sender@gmail.com",
            "SMTP_APP_PASSWORD": "super_secret_app_password",
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "587",
        }):
            res = await client.get("/api/auth/smtp-status")
            assert res.status_code == 200
            data = res.json()
            assert data["configured"] is True
            assert data["host"] == "smtp.gmail.com"
            assert data["port"] == 587
            raw = res.text
            assert "secret_sender@gmail.com" not in raw
            assert "super_secret_app_password" not in raw

        with patch.dict("os.environ", {"SMTP_EMAIL": "", "SMTP_APP_PASSWORD": ""}):
            res2 = await client.get("/api/auth/smtp-status")
            assert res2.status_code == 200
            assert res2.json()["configured"] is False
