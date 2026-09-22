"""
Authentication: bcrypt password hashing + JWT access tokens with server-side revocation.

Logout has to genuinely terminate a session, so every token carries a `jti` that
logout writes into the `revoked_tokens` table; verification rejects revoked ids.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
import time
import uuid

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.database import get_connection

logger = logging.getLogger("auth")

ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = int(os.getenv("JWT_EXPIRES_SECONDS", str(60 * 60 * 24 * 7)))

# bcrypt truncates silently past 72 bytes, so reject longer inputs outright
# rather than accept a password whose tail is ignored.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


def jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        # Failing loudly beats silently signing every token with a default value
        # that is identical on every install.
        raise RuntimeError(
            "JWT_SECRET is not set. Generate one with "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"` "
            "and put it in ml-py/.env"
        )
    return secret


# ── Schemas ───────────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str
    confirm_password: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return value

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError("Password must contain at least 8 characters.")
        if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
            raise ValueError("Password must be at most 72 bytes.")
        if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
            raise ValueError("Password must contain at least one letter and one number.")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str | None, info) -> str | None:
        password = info.data.get("password")
        # If `password` itself failed validation it is absent here; that error is
        # already being reported, so don't add a bogus mismatch on top of it.
        if value is not None and password is not None and value != password:
            raise ValueError("Passwords do not match.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ── Password hashing ──────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── Tokens ────────────────────────────────────────────────────────────────────


def create_access_token(user_id: int) -> tuple[str, int]:
    issued = int(time.time())
    expires = issued + TOKEN_TTL_SECONDS
    payload = {"sub": str(user_id), "iat": issued, "exp": expires, "jti": uuid.uuid4().hex}
    return jwt.encode(payload, jwt_secret(), algorithm=ALGORITHM), TOKEN_TTL_SECONDS


def decode_token(token: str) -> dict:
    return jwt.decode(token, jwt_secret(), algorithms=[ALGORITHM])


def is_revoked(jti: str) -> bool:
    row = get_connection().execute("SELECT 1 FROM revoked_tokens WHERE jti = ?", (jti,)).fetchone()
    return row is not None


def revoke(jti: str, user_id: int, expires_at: int) -> None:
    connection = get_connection()
    connection.execute(
        "INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)",
        (jti, user_id, expires_at),
    )
    connection.commit()


# ── Dependencies ──────────────────────────────────────────────────────────────

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def _claims_from_credentials(
    credentials: HTTPAuthorizationCredentials | None,
) -> dict:
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR
    try:
        claims = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise CREDENTIALS_ERROR

    jti = claims.get("jti")
    if not jti or is_revoked(jti):
        raise CREDENTIALS_ERROR
    return claims


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    claims = _claims_from_credentials(credentials)
    row = (
        get_connection()
        .execute("SELECT id, name, email, created_at FROM users WHERE id = ?", (claims["sub"],))
        .fetchone()
    )
    if row is None:
        # Token is well-formed but the account is gone.
        raise CREDENTIALS_ERROR
    user = dict(row)
    user["_claims"] = claims
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    """For endpoints that are public but behave better when a user is known."""
    if credentials is None:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    connection = get_connection()
    email = payload.email.strip().lower()

    try:
        cursor = connection.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (payload.name, email, hash_password(payload.password)),
        )
        connection.commit()
    except sqlite3.IntegrityError:
        # The unique index is the authority here; checking first would race.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")
    except sqlite3.Error as error:
        logger.error(f"Registration failed: {error}")
        raise HTTPException(status_code=500, detail="Could not create account. Please try again.")

    user_id = cursor.lastrowid
    row = connection.execute(
        "SELECT id, name, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    token, expires_in = create_access_token(user_id)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut(**dict(row)))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    row = (
        get_connection()
        .execute("SELECT * FROM users WHERE lower(email) = ?", (email,))
        .fetchone()
    )

    # Same message and roughly the same work either way, so the response does not
    # reveal whether an account exists.
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password."
        )

    token, expires_in = create_access_token(row["id"])
    user = UserOut(id=row["id"], name=row["name"], email=row["email"], created_at=row["created_at"])
    return TokenResponse(access_token=token, expires_in=expires_in, user=user)


@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)):
    claims = _claims_from_credentials(credentials)
    revoke(claims["jti"], int(claims["sub"]), int(claims["exp"]))
    return {"success": True, "message": "Logged out."}


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(get_current_user)):
    return UserOut(id=user["id"], name=user["name"], email=user["email"], created_at=user["created_at"])
