import asyncio
import base64
import hashlib
import logging
import os
import secrets
import time
import uvicorn

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, Optional

import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field


UTC = timezone.utc


def utcnow() -> datetime:
	return datetime.now(tz=UTC)


def sha256(data: bytes) -> bytes:
	return hashlib.sha256(data).digest()


def constant_time_compare(a: bytes, b: bytes) -> bool:
	"""Timing-safe equality check.

	No early returns based on content; runs in O(n).
	"""
	if not isinstance(a, (bytes, bytearray)) or not isinstance(b, (bytes, bytearray)):
		return False
	max_len = max(len(a), len(b))
	diff = len(a) ^ len(b)
	for i in range(max_len):
		x = a[i] if i < len(a) else 0
		y = b[i] if i < len(b) else 0
		diff |= x ^ y
	return diff == 0


def b64url_encode(raw: bytes) -> str:
	return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64url_decode(token: str) -> Optional[bytes]:
	if not isinstance(token, str):
		return None
	token = token.strip()
	if not token:
		return None
	# Pad to a multiple of 4.
	padding = "=" * ((4 - (len(token) % 4)) % 4)
	try:
		return base64.urlsafe_b64decode(token + padding)
	except Exception:
		return None


def normalize_email(email: str) -> str:
	return (email or "").strip().lower()


def password_meets_policy(password: str) -> bool:
	if not isinstance(password, str):
		return False
	if len(password) < 12:
		return False
	has_upper = any(c.isupper() for c in password)
	has_lower = any(c.islower() for c in password)
	has_digit = any(c.isdigit() for c in password)
	has_special = any(not c.isalnum() for c in password)
	return has_upper and has_lower and has_digit and has_special


async def sleep_to_min_duration(start_monotonic: float, min_duration_s: float) -> None:
	elapsed = time.monotonic() - start_monotonic
	remaining = min_duration_s - elapsed
	if remaining > 0:
		await asyncio.sleep(remaining)


async def perform_dummy_work(rounds: int = 4) -> None:
	"""Dummy work to help reduce account enumeration via timing."""
	buf = secrets.token_bytes(32)
	for _ in range(max(1, rounds)):
		buf = sha256(buf)
	await asyncio.sleep(0)


@dataclass
class User:
	user_id: str
	email: str
	password_hash: bytes
	session_version: int = 0


@dataclass
class ResetTokenRecord:
	user_id: str
	token_hash: bytes
	created_at: datetime
	expires_at: datetime
	used: bool = False
	lock: asyncio.Lock = field(default_factory=asyncio.Lock)


@dataclass
class EmailMessage:
	to_email: str
	subject: str
	html_body: str
	created_at: datetime


class EmailSender:
	"""Async email simulation.

	Simulates SMTP asynchronously.

	Security notes:
	- Does not persist plaintext emails or tokens after "send".
	- Logs do not include recipient addresses (avoids account-validity signals).
	"""

	def __init__(self) -> None:
		self._queue: asyncio.Queue[EmailMessage] = asyncio.Queue()
		self.delivered_count: int = 0
		self._task: Optional[asyncio.Task] = None
		self._debug_email = os.getenv("DEBUG_EMAIL", "0") == "1"

	async def start(self) -> None:
		if self._task is None or self._task.done():
			self._task = asyncio.create_task(self._worker())

	async def _worker(self) -> None:
		while True:
			msg = await self._queue.get()
			try:
				# Simulate send (do not log token or recipient).
				self.delivered_count += 1
				logging.info("email_delivery_simulated at=%s", msg.created_at.isoformat())

				# DEV-ONLY: print the email HTML (contains the reset link + token).
				# Keep disabled by default to meet the "no sensitive logs" requirement.
				if self._debug_email:
					print("\n--- DEBUG_EMAIL: simulated email begin ---")
					print(f"timestamp: {msg.created_at.isoformat()}")
					print(f"subject: {msg.subject}")
					print(msg.html_body)
					print("--- DEBUG_EMAIL: simulated email end ---\n")
			finally:
				self._queue.task_done()

	async def enqueue(self, message: EmailMessage) -> None:
		await self._queue.put(message)


class PasswordResetService:
	TOKEN_TTL = timedelta(minutes=15)
	RATE_WINDOW = timedelta(minutes=15)
	RATE_MAX = 3

	def __init__(self, *, app_base_url: str, email_sender: EmailSender) -> None:
		self._users_by_email: Dict[str, User] = {}
		self._tokens: Dict[bytes, ResetTokenRecord] = {}
		self._rate: Dict[str, Deque[datetime]] = defaultdict(deque)
		self._lock = asyncio.Lock()
		self._email_sender = email_sender
		self._app_base_url = app_base_url.rstrip("/")

	def seed_demo_user(self) -> None:
		# Demo account for local testing. This does not get returned anywhere.
		email = "user@example.com"
		hashed = bcrypt.hashpw(b"CorrectHorseBatteryStaple!1", bcrypt.gensalt())
		self._users_by_email[email] = User(user_id="user_1", email=email, password_hash=hashed)

	async def _rate_limit_allowed(self, email: str, now: datetime) -> bool:
		# Sliding window: keep timestamps within RATE_WINDOW.
		window_start = now - self.RATE_WINDOW
		dq = self._rate[email]
		while dq and dq[0] < window_start:
			dq.popleft()
		if len(dq) >= self.RATE_MAX:
			return False
		dq.append(now)
		return True

	async def request_password_reset(self, email: str) -> None:
		now = utcnow()
		email_norm = normalize_email(email)

		# Always do some work to reduce timing differences.
		await perform_dummy_work(rounds=2)

		async with self._lock:
			allowed = await self._rate_limit_allowed(email_norm, now)
			user = self._users_by_email.get(email_norm)

			if allowed and user is not None:
				token_raw = secrets.token_bytes(32)  # 256-bit entropy
				token = b64url_encode(token_raw)
				token_hash = sha256(token_raw)

				record = ResetTokenRecord(
					user_id=user.user_id,
					token_hash=token_hash,
					created_at=now,
					expires_at=now + self.TOKEN_TTL,
					used=False,
				)
				self._tokens[token_hash] = record

				reset_link = f"{self._app_base_url}/reset-password?token={token}"
				subject = "Password Reset Request"
				html = (
					"<div style=\"font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4\">"
					"<h2 style=\"margin:0 0 12px 0\">Password Reset Request</h2>"
					"<p style=\"margin:0 0 12px 0\">We received a request to reset your password.</p>"
					f"<p style=\"margin:0 0 12px 0\"><a href=\"{reset_link}\">Reset your password</a></p>"
					"<p style=\"margin:0 0 12px 0\">This link expires in 15 minutes.</p>"
					"<p style=\"margin:0\"><strong>Security notice:</strong> If you didn't request this, ignore this email.</p>"
					"</div>"
				)

				await self._email_sender.enqueue(
					EmailMessage(
						to_email=email_norm,
						subject=subject,
						html_body=html,
						created_at=now,
					)
				)
			else:
				# Non-existent account or rate-limited: do dummy work to keep timing similar.
				# No email is sent.
				pass

		if user is None or not allowed:
			await perform_dummy_work(rounds=4)

	async def confirm_password_reset(self, token: str, new_password: str) -> bool:
		now = utcnow()

		# Decode token to bytes; if invalid, still proceed through generic path.
		token_raw = b64url_decode(token)
		token_hash = sha256(token_raw) if token_raw is not None else sha256(b"")

		pw_ok = password_meets_policy(new_password)

		# Always perform a bcrypt hash in a thread to reduce timing differences between
		# valid and invalid/expired/used tokens.
		new_pw_bytes = (new_password or "").encode("utf-8")
		new_pw_hash = await asyncio.to_thread(bcrypt.hashpw, new_pw_bytes, bcrypt.gensalt())

		# Find a candidate token record using constant-time comparisons.
		candidate: Optional[ResetTokenRecord] = None
		async with self._lock:
			# Ensure we do at least one comparison even if there are no tokens.
			if not self._tokens:
				_ = constant_time_compare(token_hash, sha256(b"dummy"))

			for key_hash, record in self._tokens.items():
				if constant_time_compare(key_hash, token_hash):
					candidate = record

		if candidate is None:
			await perform_dummy_work(rounds=3)
			return False

		# Atomic single-use token consumption.
		async with candidate.lock:
			# Re-check under lock.
			if candidate.used:
				await perform_dummy_work(rounds=2)
				return False
			if candidate.expires_at < now:
				await perform_dummy_work(rounds=2)
				return False
			if not pw_ok:
				# Do not consume the token on weak password, but keep external behavior identical.
				await perform_dummy_work(rounds=2)
				return False

			# Mark used first, then mutate user data.
			candidate.used = True

			async with self._lock:
				user = next((u for u in self._users_by_email.values() if u.user_id == candidate.user_id), None)
				if user is None:
					return False

				user.password_hash = new_pw_hash
				user.session_version += 1

		return True


class PasswordResetRequest(BaseModel):
	email: EmailStr


class PasswordResetConfirm(BaseModel):
	token: str = Field(min_length=1, max_length=2048)
	new_password: str = Field(min_length=1, max_length=1024)


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Password Reset System")
app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
	allow_credentials=False,
	allow_methods=["POST", "OPTIONS"],
	allow_headers=["*"]
)

email_sender = EmailSender()
service = PasswordResetService(app_base_url="http://localhost:5173", email_sender=email_sender)
service.seed_demo_user()


@app.on_event("startup")
async def _startup() -> None:
	await email_sender.start()


@app.post("/api/password-reset/request")
async def password_reset_request(payload: PasswordResetRequest) -> Dict[str, str]:
	start = time.monotonic()

	# Perform the request. Any internal failures must not change the external response.
	try:
		await service.request_password_reset(str(payload.email))
	except Exception:
		# Do not log request details; avoid leaking account validity.
		logging.error("password_reset_request_failed")
		await perform_dummy_work(rounds=6)

	# Normalize observable timing: always take at least N milliseconds.
	await sleep_to_min_duration(start, min_duration_s=0.20)
	return {"message": "If an account exists, you will receive an email with reset instructions."}


@app.post("/api/password-reset/confirm")
async def password_reset_confirm(payload: PasswordResetConfirm) -> Dict[str, object]:
	start = time.monotonic()
	try:
		ok = await service.confirm_password_reset(payload.token, payload.new_password)
	except Exception:
		logging.error("password_reset_confirm_failed")
		await perform_dummy_work(rounds=3)
		ok = False

	# Normalize observable timing: ensure a minimum duration.
	await sleep_to_min_duration(start, min_duration_s=0.35)
	# Same response shape for all failures; success is distinct but does not reveal failure reason.
	if ok:
		return {"ok": True, "message": "Password updated."}
	return {"ok": False, "message": "Unable to reset password."}

if __name__ == "__main__":
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)