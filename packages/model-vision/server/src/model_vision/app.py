"""FastAPI application: /ground, /ground/stream, /metrics, /healthz, /readyz."""

from __future__ import annotations

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sse_starlette.sse import EventSourceResponse

from .config import Settings, settings
from .correction import CorrectionConfig, CorrectionResult, correct_hitmap
from .deadline import Deadline
from .keyframe import KeyframeError, load_keyframe
from .registry import Registry, registry
from .schemas import GroundRequest, GroundResponse
from .telemetry import configure_logging, get_logger, metrics


def create_app(*, settings_: Settings | None = None, registry_: Registry | None = None,
               load_models: bool = True) -> FastAPI:
    s = settings_ or settings()
    reg = registry_ or registry()
    configure_logging(s.log_level)
    log = get_logger("model_vision.app")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if load_models:
            log.info("startup.load_models.begin")
            await reg.ensure_loaded(s)
            log.info("startup.load_models.done")
        yield
        await reg.shutdown()

    app = FastAPI(title="Sketchapedia Model-Vision", version="0.0.0", lifespan=lifespan)

    @app.get("/healthz", response_class=PlainTextResponse)
    async def healthz() -> str:
        return "ok"

    @app.get("/readyz", response_class=PlainTextResponse)
    async def readyz() -> PlainTextResponse:
        return PlainTextResponse("ready") if reg.current() else PlainTextResponse("loading", status_code=503)

    @app.get("/metrics", response_class=PlainTextResponse)
    async def prom() -> PlainTextResponse:
        if not s.metrics_enabled:
            return PlainTextResponse("", status_code=404)
        return PlainTextResponse(metrics().render_prometheus(), media_type="text/plain; version=0.0.4")

    @app.post("/ground", response_model=GroundResponse)
    async def ground(req: GroundRequest) -> GroundResponse:
        rid = req.request_id or str(uuid.uuid4())
        bound = log.bind(request_id=rid, mode=req.mode, items=len(req.hitmap_draft.items))
        try:
            result = await _run(req, s, reg, bound)
        except KeyframeError as exc:
            metrics().record_error()
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            metrics().record_error()
            bound.exception("ground.error", error=str(exc))
            raise HTTPException(status_code=500, detail="grounding failed") from exc
        metrics().record_request(latency_ms=result.diagnostics.latency_ms,
                                 mean_iou=result.diagnostics.mean_iou,
                                 deadline_hit=result.diagnostics.deadline_hit)
        bound.info("ground.done", mean_iou=result.diagnostics.mean_iou,
                   latency_ms=result.diagnostics.latency_ms)
        return GroundResponse(hitmap=result.hitmap, diagnostics=result.diagnostics)

    @app.post("/ground/stream")
    async def ground_stream(req: GroundRequest, request: Request) -> EventSourceResponse:
        rid = req.request_id or str(uuid.uuid4())
        bound = log.bind(request_id=rid, stream=True)

        async def gen() -> AsyncIterator[dict]:
            q: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()

            async def emit(stage: str, payload: dict) -> None:
                await q.put((stage, payload))

            await emit("started", {"request_id": rid})
            task = asyncio.create_task(_run_streaming(req, s, reg, emit, bound))
            while True:
                if await request.is_disconnected():
                    task.cancel()
                    break
                try:
                    stage, payload = await asyncio.wait_for(q.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    if task.done():
                        break
                    continue
                yield {"event": stage, "data": json.dumps(payload)}
                if stage in ("completed", "error"):
                    break
            if not task.done():
                await task

        return EventSourceResponse(gen())

    @app.exception_handler(ValueError)
    async def _ve(_: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    return app


async def _run(req: GroundRequest, s: Settings, reg: Registry, log_) -> CorrectionResult:
    deadline = Deadline.starting_now(req.deadline_ms)
    adapters = await reg.ensure_loaded(s)
    loaded = await load_keyframe(url=req.keyframe_url, b64=req.keyframe_b64, settings=s)
    log_.info("keyframe.loaded", bytes=loaded.byte_size, digest=loaded.digest[:22])
    grounder = None if req.mode == "grounding-dino" else adapters.grounder
    open_vocab = adapters.open_vocab if req.mode in ("auto", "grounding-dino") else None
    config = CorrectionConfig(escalate_on_miss=req.mode != "florence")

    def _sync() -> CorrectionResult:
        return correct_hitmap(image=loaded.image, draft=req.hitmap_draft, grounder=grounder,
                              open_vocab=open_vocab, segmenter=adapters.segmenter,
                              config=config, deadline=deadline, keyframe_hash=loaded.digest)

    return await asyncio.to_thread(_sync)


async def _run_streaming(req: GroundRequest, s: Settings, reg: Registry, emit, log_) -> None:
    try:
        await emit("loading", {})
        result = await _run(req, s, reg, log_)
        await emit("completed", {"hitmap": result.hitmap.model_dump(by_alias=True),
                                 "diagnostics": result.diagnostics.model_dump(by_alias=True)})
    except Exception as exc:
        await emit("error", {"error": str(exc)})
