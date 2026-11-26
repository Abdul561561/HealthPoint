"""
HealthPoint Email Delivery Service (Gmail SMTP)
===============================================
Sends transactional security emails (such as registration OTP verification codes)
via Gmail SMTP over STARTTLS without blocking the async event loop.
"""

import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

logger = logging.getLogger("healthpoint.email_service")

_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
if os.path.exists(_env_path):
    load_dotenv(_env_path, override=True)
else:
    load_dotenv()


class EmailDeliveryError(Exception):
    """Raised when SMTP is unconfigured or fails to deliver an email."""
    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


def get_smtp_config() -> dict:
    """Return sanitized SMTP configuration from environment variables."""
    return {
        "email": os.getenv("SMTP_EMAIL", "").strip(),
        "password": os.getenv("SMTP_APP_PASSWORD", "").strip(),
        "host": os.getenv("SMTP_HOST", "smtp.gmail.com").strip() or "smtp.gmail.com",
        "port": int(os.getenv("SMTP_PORT", "587").strip() or "587"),
    }


def is_smtp_configured() -> bool:
    """Return True only when required SMTP credentials are present."""
    cfg = get_smtp_config()
    return bool(cfg["email"] and cfg["password"] and cfg["host"] and cfg["port"])


def get_smtp_diagnostic() -> dict:
    """
    Return safe SMTP readiness diagnostics without exposing any credentials
    (never returns SMTP_EMAIL or SMTP_APP_PASSWORD).
    """
    cfg = get_smtp_config()
    return {
        "configured": is_smtp_configured(),
        "host": cfg["host"],
        "port": cfg["port"],
        "tls": True,
    }


def _send_smtp_sync(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    """Blocking SMTP send helper executed inside a worker thread."""
    cfg = get_smtp_config()
    if not cfg["email"] or not cfg["password"]:
        raise EmailDeliveryError(
            "Email verification service is not configured. Please set SMTP_EMAIL and SMTP_APP_PASSWORD in backend environment variables.",
            status_code=503,
        )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"HealthPoint Security <{cfg['email']}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(cfg["email"], cfg["password"])
        server.send_message(msg)


async def send_otp_email(to_email: str, recipient_name: str, otp_code: str) -> None:
    """
    Deliver a 6-digit verification OTP to the user's email address via Gmail SMTP.
    Never logs the OTP code or SMTP credentials.
    """
    if not is_smtp_configured():
        logger.error("SMTP credentials missing; cannot send OTP verification email.")
        raise EmailDeliveryError(
            "Email verification is unavailable because SMTP_EMAIL and SMTP_APP_PASSWORD are not configured on the backend.",
            status_code=503,
        )

    safe_name = (recipient_name or "User").strip()
    subject = "HealthPoint — Verify Your Email Address"
    text_body = (
        f"Hello {safe_name},\n\n"
        f"Your HealthPoint email verification code is: {otp_code}\n\n"
        f"This code expires in 5 minutes. For your security, never share this code with anyone.\n"
        f"If you did not request this verification, you can safely ignore this email.\n\n"
        f"— HealthPoint Security Team"
    )
    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0b1120; color: #e2e8f0; border-radius: 16px; border: 1px solid #1e293b;">
      <h2 style="margin: 0 0 12px; color: #38bdf8;">HealthPoint Email Verification</h2>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">Hello <strong>{safe_name}</strong>,</p>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6;">Use the 6-digit verification code below to verify your HealthPoint account:</p>
      <div style="margin: 20px 0; padding: 16px; text-align: center; background: #0f172a; border: 1px solid #334155; border-radius: 12px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffffff;">
        {otp_code}
      </div>
      <p style="margin: 0 0 8px; font-size: 13px; color: #94a3b8;">This code expires in <strong>5 minutes</strong> and allows a maximum of 5 attempts.</p>
      <p style="margin: 0; font-size: 12px; color: #64748b;">If you did not create a HealthPoint account, please ignore this message.</p>
    </div>
    """

    try:
        await asyncio.to_thread(_send_smtp_sync, to_email, subject, text_body, html_body)
        logger.info("Verification OTP email dispatched successfully.")
    except EmailDeliveryError:
        raise
    except smtplib.SMTPAuthenticationError:
        logger.error("SMTP authentication failed. Check SMTP_EMAIL and SMTP_APP_PASSWORD.")
        raise EmailDeliveryError(
            "Gmail SMTP authentication failed. Please verify SMTP_EMAIL and SMTP_APP_PASSWORD.",
            status_code=503,
        )
    except Exception as exc:
        logger.error(f"Failed to send verification email via SMTP: {type(exc).__name__}")
        raise EmailDeliveryError(
            "Unable to send verification email right now. Please check SMTP configuration and try again.",
            status_code=503,
        )
