"""
Backend test suite for OceanMind AI.

Covers authentication (registration validation, login, token revocation,
per-user isolation) and the identification pipeline (upload validation, the
fish/non-fish gate, open-set rejection).

Run:
    cd ml-py && python test_api.py
Exits non-zero if anything fails.
"""
import io
import os
import sys
import tempfile
import uuid
from pathlib import Path

from PIL import Image

# Use a throwaway database and a known secret so the suite never touches the
# real one and never depends on a developer's .env.
_TEMP_DB = Path(tempfile.gettempdir()) / f"oceanmind_test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_PATH"] = str(_TEMP_DB)
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-in-production-" + uuid.uuid4().hex)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(name)
        print(f"PASS  {name}" + (f"  — {detail}" if detail else ""))
    else:
        FAILED.append(name)
        print(f"FAIL  {name}" + (f"  — {detail}" if detail else ""))


def make_image(size=(400, 300), color=(40, 90, 140)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="JPEG")
    return buffer.getvalue()


def unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:10]}@example.com"


def main() -> int:
    with TestClient(app) as client:
        # ── Health ────────────────────────────────────────────────────────────
        response = client.get("/health")
        check("GET /health is public and healthy", response.status_code == 200,
              str(response.json().get("status")))

        # ── Registration validation ───────────────────────────────────────────
        email = unique_email()
        response = client.post("/auth/register", json={
            "name": "Test User", "email": email,
            "password": "Ocean1234", "confirm_password": "Ocean1234",
        })
        check("Register succeeds with valid input", response.status_code == 201)
        token = response.json().get("access_token", "")
        check("Register returns an access token", bool(token))

        response = client.post("/auth/register", json={
            "name": "Other", "email": email.upper(),
            "password": "Ocean1234", "confirm_password": "Ocean1234",
        })
        check("Duplicate email rejected (case-insensitive)", response.status_code == 409,
              str(response.json().get("detail")))

        response = client.post("/auth/register", json={
            "name": "Short", "email": unique_email(),
            "password": "abc", "confirm_password": "abc",
        })
        check("Short password rejected", response.status_code == 422)

        response = client.post("/auth/register", json={
            "name": "NoDigit", "email": unique_email(),
            "password": "abcdefghij", "confirm_password": "abcdefghij",
        })
        check("Password without a digit rejected", response.status_code == 422)

        response = client.post("/auth/register", json={
            "name": "Mismatch", "email": unique_email(),
            "password": "Ocean1234", "confirm_password": "Ocean9999",
        })
        check("Password mismatch rejected", response.status_code == 422)

        response = client.post("/auth/register", json={
            "name": "BadEmail", "email": "not-an-email",
            "password": "Ocean1234", "confirm_password": "Ocean1234",
        })
        check("Malformed email rejected", response.status_code == 422)

        # ── Password storage ──────────────────────────────────────────────────
        from app.database import get_connection

        row = get_connection().execute(
            "SELECT password_hash FROM users WHERE lower(email) = ?", (email.lower(),)
        ).fetchone()
        check("Password is bcrypt-hashed, never stored as plaintext",
              row is not None and row["password_hash"].startswith("$2") and "Ocean1234" not in row["password_hash"])

        # ── Login ─────────────────────────────────────────────────────────────
        response = client.post("/auth/login", json={"email": email, "password": "Ocean1234"})
        check("Login succeeds with correct credentials", response.status_code == 200)
        token = response.json()["access_token"]

        response = client.post("/auth/login", json={"email": email, "password": "WrongPass1"})
        check("Login rejects a wrong password", response.status_code == 401)

        response = client.post("/auth/login", json={"email": unique_email(), "password": "Ocean1234"})
        check("Login rejects an unknown email with the same message",
              response.status_code == 401 and response.json()["detail"] == "Invalid email or password.")

        # ── Protected endpoints ───────────────────────────────────────────────
        auth = {"Authorization": f"Bearer {token}"}

        response = client.get("/auth/me", headers=auth)
        check("GET /auth/me returns the current user", response.status_code == 200
              and response.json()["email"] == email.lower())

        check("GET /auth/me without a token is 401", client.get("/auth/me").status_code == 401)
        check("GET /auth/me with a garbage token is 401",
              client.get("/auth/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401)
        check("GET /fish/history without a token is 401",
              client.get("/fish/history").status_code == 401)

        # ── Logout actually revokes ───────────────────────────────────────────
        check("Logout succeeds", client.post("/auth/logout", headers=auth).status_code == 200)
        check("Token is rejected after logout (real revocation)",
              client.get("/auth/me", headers=auth).status_code == 401)

        # ── Per-user history isolation ────────────────────────────────────────
        def new_user() -> str:
            response = client.post("/auth/register", json={
                "name": "History User", "email": unique_email(),
                "password": "Ocean1234", "confirm_password": "Ocean1234",
            })
            return response.json()["access_token"]

        token_a, token_b = new_user(), new_user()
        image = make_image()
        client.post("/predict-full", files={"image": ("fish.jpg", image, "image/jpeg")},
                    headers={"Authorization": f"Bearer {token_a}"})

        history_a = client.get("/fish/history", headers={"Authorization": f"Bearer {token_a}"}).json()
        history_b = client.get("/fish/history", headers={"Authorization": f"Bearer {token_b}"}).json()
        check("A user's identification is recorded for them", history_a["count"] >= 1)
        check("A user cannot see another user's history", history_b["count"] == 0)

        # ── Upload validation ─────────────────────────────────────────────────
        response = client.post("/predict", files={"image": ("x.gif", image, "image/gif")})
        check("Unsupported extension rejected with 400", response.status_code == 400)

        response = client.post("/predict", files={"image": ("empty.jpg", b"", "image/jpeg")})
        check("Empty upload rejected with 400", response.status_code == 400)

        response = client.post("/predict", files={"image": ("bad.jpg", b"not an image", "image/jpeg")})
        check("Unreadable image rejected with 400", response.status_code == 400)

        # ── Prediction contract ───────────────────────────────────────────────
        response = client.post("/predict-full", files={"image": ("fish.jpg", image, "image/jpeg")})
        body = response.json()
        check("predict-full returns 200 and a known status",
              response.status_code == 200 and body.get("status") in {"identified", "unknown", "not_fish"},
              str(body.get("status")))
        check("An unidentified result carries no fabricated species data",
              body.get("status") == "identified" or not body.get("taxonomy") and not body.get("details"))

        # A flat grey image is not a fish; the gate (or open-set rejection) must
        # refuse to name a species.
        check("A non-fish image is never reported as identified",
              body.get("status") != "identified", str(body.get("status")))

        # ── Stats ─────────────────────────────────────────────────────────────
        response = client.get("/stats")
        check("GET /stats reports real class count",
              response.status_code == 200 and isinstance(response.json().get("supported_species"), int))

    print("\n" + "=" * 60)
    print(f"{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        for name in FAILED:
            print(f"  FAILED: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    finally:
        for suffix in ("", "-wal", "-shm"):
            Path(str(_TEMP_DB) + suffix).unlink(missing_ok=True)
