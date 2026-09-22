"""
FastAPI service for the OceanMind AI platform.

Public endpoints:
    GET  /            service banner
    GET  /health      model + database health (never requires auth)
    POST /predict     raw ML prediction
    POST /predict-full  prediction + authoritative species data

Authenticated endpoints:
    POST /auth/register, /auth/login, /auth/logout
    GET  /auth/me
    GET  /fish/history, DELETE /fish/history
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.ai_service import log_configuration_state, router as ai_router
from app.auth import get_current_user, get_optional_user, router as auth_router
from app.database import get_connection, init_database, purge_expired_tokens
from app.predictor import _is_placeholder_label, get_predictor
from app.species_service import fetch_species_data

# Load ml-py/.env before anything reads os.getenv (JWT_SECRET in particular).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("fish_ml_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    purged = purge_expired_tokens()
    if purged:
        logger.info(f"Purged {purged} expired token revocations.")

    logger.info("Initializing Fish ML Service…")
    try:
        # Warm the model once at boot so the first upload is not slow and every
        # later request reuses the same in-memory weights.
        predictor = get_predictor()
        logger.info(f"Model loaded: {predictor.num_classes} classes on {predictor.device}.")
    except Exception as error:
        logger.error(f"Model load failed: {error}")

    # Log whether the AI provider is configured — the value is never logged.
    log_configuration_state()

    try:
        from app.fish_gate import get_fish_gate

        if get_fish_gate() is not None:
            logger.info("Fish/non-fish gate ready.")
    except Exception as error:
        logger.error(f"Fish gate load failed: {error}")

    yield


app = FastAPI(
    title="OceanMind AI — Marine Intelligence API",
    description="EfficientNet-B0 fish species identification + GBIF/WoRMS species data",
    version="3.0.0",
    lifespan=lifespan,
)

# The browser never calls this service directly — the TanStack server functions
# proxy to it — but keeping an explicit allowlist avoids a wide-open CORS policy.
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(ai_router)

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc: RequestValidationError):
    """Turn pydantic's 422 payload into one readable sentence for the UI, without
    leaking field paths or internal types."""
    messages = []
    for error in exc.errors():
        message = error.get("msg", "Invalid value.")
        messages.append(message.removeprefix("Value error, "))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"success": False, "detail": messages[0] if messages else "Invalid request.",
                 "errors": messages},
    )


def _validate_upload(image: UploadFile, image_bytes: bytes) -> JSONResponse | None:
    if not image or not image.filename:
        return JSONResponse(status_code=400, content={"success": False, "error": "No image file uploaded"})
    if Path(image.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        return JSONResponse(status_code=400, content={"success": False, "error": "Unsupported format. Use PNG, JPG, JPEG or WEBP"})
    if len(image_bytes) == 0:
        return JSONResponse(status_code=400, content={"success": False, "error": "Uploaded file is empty"})
    if len(image_bytes) > MAX_FILE_SIZE:
        return JSONResponse(status_code=413, content={"success": False, "error": "File exceeds 10 MB limit"})
    return None


def _format_confidence(value: float) -> float:
    return round(value * 100.0 if value <= 1.0 else value, 2)


def _pretty(label: str) -> str:
    return label.replace("_", " ")


def _record_identification(user: dict | None, result: dict) -> None:
    if not user:
        return
    prediction = result.get("prediction") or {}
    try:
        connection = get_connection()
        connection.execute(
            "INSERT INTO identifications (user_id, status, scientific_name, common_name, confidence)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                user["id"],
                result.get("status", "unknown"),
                prediction.get("scientific_name"),
                prediction.get("common_name"),
                prediction.get("confidence"),
            ),
        )
        connection.commit()
    except Exception as error:
        # History is a convenience; never fail an identification because of it.
        logger.warning(f"Could not record identification: {error}")


# ── Public ────────────────────────────────────────────────────────────────────


@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {"service": "OceanMind AI ML Backend", "status": "online", "docs": "/docs"}


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    """Intentionally unauthenticated so orchestrators can probe it."""
    try:
        predictor = get_predictor()
        get_connection().execute("SELECT 1").fetchone()
        return {
            "status": "ok",
            "model_loaded": predictor.model is not None,
            "num_classes": predictor.num_classes,
            "device": str(predictor.device),
            "database": "ok",
        }
    except Exception as error:
        return JSONResponse(status_code=503, content={"status": "error", "error": str(error)})


@app.get("/stats", tags=["Platform"])
def platform_stats():
    """Real, verifiable platform numbers for the marketing page.

    Accuracy is read from the evaluation report produced by
    training/evaluate.py; it is omitted entirely when no evaluation has been
    run, rather than substituted with a flattering guess.
    """
    stats: dict = {"success": True}

    try:
        predictor = get_predictor()
        stats["supported_species"] = sum(
            1
            for index in range(predictor.num_classes)
            if not _is_placeholder_label(predictor.classes_map[str(index)])
        )
    except Exception:
        stats["supported_species"] = None

    report_path = Path(os.getenv("MODELS_DIR", str(Path(__file__).resolve().parent.parent / "models"))) / "evaluation_report.json"
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
            stats["top1_accuracy"] = report.get("top_1_accuracy")
            stats["top5_accuracy"] = report.get("top_5_accuracy")
            stats["macro_f1"] = report.get("macro_f1")
            stats["evaluated_on_images"] = report.get("test_images")
        except Exception:
            pass

    try:
        stats["identifications_recorded"] = get_connection().execute(
            "SELECT COUNT(*) FROM identifications"
        ).fetchone()[0]
    except Exception:
        stats["identifications_recorded"] = None

    return stats


@app.post("/predict", tags=["Prediction"])
async def predict_raw(image: UploadFile = File(...)):
    """Raw ML prediction — species name and confidence only, no external lookups."""
    image_bytes = await image.read()
    error_response = _validate_upload(image, image_bytes)
    if error_response:
        return error_response

    try:
        result = get_predictor().predict(image_bytes)
    except Exception as error:
        logger.error(f"Inference error: {error}")
        return JSONResponse(status_code=500, content={"success": False, "error": "Model inference failed"})

    if not result.get("success"):
        return JSONResponse(status_code=400, content=result)

    status_value = result.get("status", "unknown")

    if status_value == "not_fish":
        return {"success": True, "identified": False, "status": "not_fish",
                "prediction": None, "message": result["message"]}

    if status_value == "identified":
        prediction = result["prediction"]
        return {
            "success": True,
            "identified": True,
            "status": "identified",
            "prediction": {"name": _pretty(prediction["name"]),
                           "confidence": _format_confidence(prediction["confidence"])},
            "alternatives": [
                {"name": _pretty(a["name"]), "confidence": _format_confidence(a["confidence"])}
                for a in result.get("alternatives", [])
            ],
        }

    top = result.get("top_candidate") or {}
    return {
        "success": True,
        "identified": False,
        "status": "unknown",
        "prediction": None,
        "message": result.get("message", "Unable to confidently identify this fish."),
        "rejection_reasons": result.get("rejection_reasons", []),
        "top_candidate": (
            {"name": _pretty(top.get("name", "")), "confidence": _format_confidence(top.get("confidence", 0))}
            if top else None
        ),
        "alternatives": [
            {"name": _pretty(a["name"]), "confidence": _format_confidence(a["confidence"])}
            for a in result.get("alternatives", [])
        ],
    }


@app.post("/predict-full", tags=["Prediction"])
async def predict_full(
    image: UploadFile = File(...),
    user: dict | None = Depends(get_optional_user),
):
    """Full pipeline: validation → fish gate → classification → GBIF/WoRMS lookup.

    Public, but records history when a valid token is supplied.
    """
    started = time.time()
    image_bytes = await image.read()
    error_response = _validate_upload(image, image_bytes)
    if error_response:
        return error_response

    try:
        ml_result = get_predictor().predict(image_bytes)
    except Exception as error:
        logger.error(f"Inference error: {error}")
        return JSONResponse(status_code=500, content={"success": False, "error": "Model inference failed"})

    if not ml_result.get("success"):
        return JSONResponse(status_code=400, content=ml_result)

    inference_time = round(time.time() - started, 3)
    status_value = ml_result.get("status", "unknown")

    # Step 2a — not a fish at all.
    if status_value == "not_fish":
        logger.info(f"Not fish [{inference_time}s] gate={ml_result.get('gate')}")
        response = {
            "success": True,
            "identified": False,
            "status": "not_fish",
            "prediction": None,
            "message": ml_result["message"],
            "inference_time_seconds": inference_time,
        }
        _record_identification(user, response)
        return response

    # Step 2b — a fish, but not confidently nameable.
    if status_value != "identified":
        top = ml_result.get("top_candidate") or {}
        candidates = []
        if top:
            candidates.append({
                "scientific_name": _pretty(top.get("name", "")),
                "confidence": _format_confidence(top.get("confidence", 0)),
            })
            candidates += [
                {"scientific_name": _pretty(a["name"]), "confidence": _format_confidence(a["confidence"])}
                for a in ml_result.get("alternatives", [])[:3]
            ]
        logger.info(
            f"Unknown [{inference_time}s] reasons={ml_result.get('rejection_reasons')} "
            f"top={candidates[0] if candidates else None}"
        )
        response = {
            "success": True,
            "identified": False,
            "status": "unknown",
            "prediction": None,
            "message": ml_result.get("message", "Unable to confidently identify this fish."),
            "rejection_reasons": ml_result.get("rejection_reasons", []),
            "top_candidates": candidates,
            "inference_time_seconds": inference_time,
        }
        _record_identification(user, response)
        return response

    # Step 3 — identified: fetch authoritative species data.
    prediction = ml_result["prediction"]
    raw_name = prediction["name"]
    confidence = _format_confidence(prediction["confidence"])
    logger.info(f"Identified [{inference_time}s]: {raw_name} {confidence}%")

    species_data = await fetch_species_data(raw_name)

    scientific_name = species_data.get("scientific_name") or _pretty(raw_name)
    common_name = species_data.get("common_name") or _pretty(raw_name)

    details = {
        key: value
        for key, value in (species_data.get("details") or {}).items()
        if value and value != "Data unavailable"
    }
    taxonomy = species_data.get("taxonomy") or {}
    conservation = species_data.get("conservation") or {}
    sources = species_data.get("sources") or []

    response = {
        "success": True,
        "identified": True,
        "status": "identified",
        "prediction": {
            "scientific_name": scientific_name,
            "common_name": common_name,
            "confidence": confidence,
        },
        "inference_time_seconds": inference_time,
        "alternatives": [
            {"scientific_name": _pretty(a["name"]), "confidence": _format_confidence(a["confidence"])}
            for a in ml_result.get("alternatives", [])[:4]
        ],
    }
    if taxonomy:
        response["taxonomy"] = taxonomy
    if details:
        response["details"] = details
    if conservation:
        response["conservation"] = conservation
    if sources:
        response["sources"] = sources

    alternative_common_names = [
        name for name in species_data.get("common_name_alternatives", []) if name != common_name
    ]
    if alternative_common_names:
        response["common_name_alternatives"] = alternative_common_names[:5]

    response["species_data_available"] = species_data.get("found", False)
    if not species_data.get("found"):
        response["species_data_message"] = (
            "External species data temporarily unavailable. Identification is still valid."
        )

    _record_identification(user, response)
    return response


# ── Authenticated ─────────────────────────────────────────────────────────────


@app.post("/gradcam", tags=["Prediction"])
async def gradcam(image: UploadFile = File(...)):
    """Real Grad-CAM heatmap for the predicted class, as a PNG."""
    image_bytes = await image.read()
    error_response = _validate_upload(image, image_bytes)
    if error_response:
        return error_response

    try:
        from app.gradcam import generate_gradcam

        png = generate_gradcam(get_predictor(), image_bytes)
    except Exception as error:
        logger.error(f"Grad-CAM failed: {error}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Could not generate the attention map."},
        )

    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "no-store"})


@app.get("/fish/history", tags=["History"])
def fish_history(
    user: dict = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
):
    """A user only ever sees their own rows — the user id comes from the verified
    token, never from a client-supplied parameter."""
    rows = get_connection().execute(
        "SELECT id, status, scientific_name, common_name, confidence, created_at"
        " FROM identifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        (user["id"], limit),
    ).fetchall()
    return {"success": True, "count": len(rows), "history": [dict(row) for row in rows]}


@app.delete("/fish/history", tags=["History"])
def clear_history(user: dict = Depends(get_current_user)):
    connection = get_connection()
    cursor = connection.execute("DELETE FROM identifications WHERE user_id = ?", (user["id"],))
    connection.commit()
    return {"success": True, "deleted": cursor.rowcount}
