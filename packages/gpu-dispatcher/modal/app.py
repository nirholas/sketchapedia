"""
Sketchapedia Modal app — image, video, and vision model functions.

Each function is a GPU-backed HTTPS endpoint that the TypeScript dispatcher
(`packages/gpu-dispatcher/src/adapters/modal.ts`) calls over HTTP. The
per-function GPU SKU, keep-warm count, and container idle timeout are
configurable via environment variables so the same image can be tuned across
production / staging / CI without code changes.

Contract with the model servers (prompts 17/18/19):
- Each model server ships a `create_app()` returning an ASGI / FastAPI app
  exposing `/healthz` and `/invoke` (SSE stream of progress events ending
  with a `final` event carrying the artifact metadata).
- The dispatcher forwards `x-request-id` and `x-deadline-ms` headers which
  the model servers propagate into their spans + respect as inference
  deadlines.

Deploy:
    modal deploy packages/gpu-dispatcher/modal/app.py
"""

from __future__ import annotations

import os
from typing import Callable

import modal

# -----------------------------------------------------------------------------
# Configuration (env-driven)
# -----------------------------------------------------------------------------

APP_NAME = os.environ.get("SKETCHAPEDIA_MODAL_APP", "sketchapedia-dispatcher")

IMAGE_GPU = os.environ.get("SKETCHAPEDIA_IMAGE_GPU", "A10G")
VIDEO_GPU = os.environ.get("SKETCHAPEDIA_VIDEO_GPU", "L40S")
VISION_GPU = os.environ.get("SKETCHAPEDIA_VISION_GPU", "A10G")

IMAGE_KEEP_WARM = int(os.environ.get("SKETCHAPEDIA_IMAGE_KEEP_WARM", "2"))
VIDEO_KEEP_WARM = int(os.environ.get("SKETCHAPEDIA_VIDEO_KEEP_WARM", "1"))
VISION_KEEP_WARM = int(os.environ.get("SKETCHAPEDIA_VISION_KEEP_WARM", "2"))

CONTAINER_IDLE = int(os.environ.get("SKETCHAPEDIA_CONTAINER_IDLE", "300"))  # 5 minutes
TIMEOUT_S = int(os.environ.get("SKETCHAPEDIA_TIMEOUT_S", "600"))


def _gpu(sku: str) -> modal.gpu._GPUConfig:
    sku = sku.upper()
    if sku == "A10G":
        return modal.gpu.A10G()
    if sku == "L40S":
        return modal.gpu.L40S()
    if sku == "H100":
        return modal.gpu.H100()
    raise ValueError(f"unsupported GPU sku: {sku}")


# -----------------------------------------------------------------------------
# Shared base image
# -----------------------------------------------------------------------------

base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libgl1")
    .pip_install(
        "torch==2.4.1",
        "diffusers>=0.30.0",
        "transformers>=4.44",
        "accelerate>=0.33",
        "safetensors",
        "pillow",
        "fastapi[standard]",
        "uvicorn[standard]",
        "pydantic>=2",
        "opentelemetry-api",
        "opentelemetry-sdk",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

secrets = [
    modal.Secret.from_name("sketchapedia-hf"),
    modal.Secret.from_name("sketchapedia-otel"),
]

app = modal.App(APP_NAME)


def _wrap_server(create_app: Callable[[], "object"]) -> Callable[[], "object"]:
    """Curry a model-server `create_app` into a Modal `asgi_app` handler."""

    def _factory() -> "object":
        return create_app()

    return _factory


# -----------------------------------------------------------------------------
# Image function — FLUX.1-dev via packages/model-image/server
# -----------------------------------------------------------------------------


@app.function(
    image=base_image,
    gpu=_gpu(IMAGE_GPU),
    secrets=secrets,
    keep_warm=IMAGE_KEEP_WARM,
    container_idle_timeout=CONTAINER_IDLE,
    timeout=TIMEOUT_S,
    allow_concurrent_inputs=4,
)
@modal.asgi_app(label="image")
def image_fn():
    from model_image_server import create_app  # type: ignore[import-not-found]

    return create_app()


# -----------------------------------------------------------------------------
# Video function — LTX-Video via packages/model-video/server
# -----------------------------------------------------------------------------


@app.function(
    image=base_image,
    gpu=_gpu(VIDEO_GPU),
    secrets=secrets,
    keep_warm=VIDEO_KEEP_WARM,
    container_idle_timeout=CONTAINER_IDLE,
    timeout=TIMEOUT_S,
    allow_concurrent_inputs=2,
)
@modal.asgi_app(label="video")
def video_fn():
    from model_video_server import create_app  # type: ignore[import-not-found]

    return create_app()


# -----------------------------------------------------------------------------
# Vision function — hitmap correction via packages/model-vision/server
# -----------------------------------------------------------------------------


@app.function(
    image=base_image,
    gpu=_gpu(VISION_GPU),
    secrets=secrets,
    keep_warm=VISION_KEEP_WARM,
    container_idle_timeout=CONTAINER_IDLE,
    timeout=TIMEOUT_S,
    allow_concurrent_inputs=8,
)
@modal.asgi_app(label="vision")
def vision_fn():
    from model_vision_server import create_app  # type: ignore[import-not-found]

    return create_app()


# -----------------------------------------------------------------------------
# Cold-start probe — always deployed, minimal work. Ensures the stub reports
# `healthy` in Modal's UI even when all model containers are scaled to zero.
# -----------------------------------------------------------------------------


@app.function(image=base_image)
@modal.asgi_app(label="probe")
def probe_fn():
    from fastapi import FastAPI

    api = FastAPI()

    @api.get("/healthz")
    def _healthz() -> dict:
        return {"ok": True, "app": APP_NAME}

    @api.get("/version")
    def _version() -> dict:
        return {
            "image_gpu": IMAGE_GPU,
            "video_gpu": VIDEO_GPU,
            "vision_gpu": VISION_GPU,
            "keep_warm": {
                "image": IMAGE_KEEP_WARM,
                "video": VIDEO_KEEP_WARM,
                "vision": VISION_KEEP_WARM,
            },
            "container_idle_s": CONTAINER_IDLE,
        }

    return api
