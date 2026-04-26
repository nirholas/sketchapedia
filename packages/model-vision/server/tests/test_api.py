"""FastAPI /ground route tests using injected in-memory adapters (no GPU)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from model_vision.app import create_app
from model_vision.config import Settings
from model_vision.geometry import XYXY
from model_vision.registry import Adapters, Registry

from conftest import FakeGrounder, FakeOpenVocab, FakeSegmenter


def _png_b64(w: int = 128, h: int = 96) -> str:
    img = Image.new("RGB", (w, h), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _client(adapters: Adapters) -> TestClient:
    reg = Registry()
    reg.set_for_test(adapters)
    app = create_app(settings_=Settings(metrics_enabled=True, log_level="ERROR"),
                     registry_=reg, load_models=False)
    return TestClient(app)


def _payload(b64: str, mode: str = "auto") -> dict:
    return {
        "keyframeB64": b64,
        "deadlineMs": 2000,
        "mode": mode,
        "hitmapDraft": {
            "items": [{"id": "btn", "region": {"kind": "bbox", "bbox": {"x": 10, "y": 10, "w": 50, "h": 40}},
                       "role": "button", "ariaLabel": "reserve button"}],
            "viewport": {"width": 128, "height": 96},
            "coordinateSpace": "keyframe",
        },
    }


def test_healthz_and_readyz() -> None:
    c = _client(Adapters(grounder=FakeGrounder(), open_vocab=FakeOpenVocab(), segmenter=FakeSegmenter()))
    assert c.get("/healthz").text == "ok"
    assert c.get("/readyz").status_code == 200


def test_ground_returns_corrected_hitmap() -> None:
    grounder = FakeGrounder(answers={"reserve button": XYXY(12, 11, 62, 51)})
    c = _client(Adapters(grounder=grounder, open_vocab=FakeOpenVocab(), segmenter=FakeSegmenter()))
    res = c.post("/ground", json=_payload(_png_b64()))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["hitmap"]["items"][0]["region"]["bbox"]["x"] == 12
    assert body["diagnostics"]["matchRate"] == 1.0
    assert body["diagnostics"]["keyframeHash"].startswith("sha256:")


def test_metrics_increments_on_request() -> None:
    from model_vision.telemetry import metrics
    before = metrics().requests_total
    c = _client(Adapters(grounder=FakeGrounder(), open_vocab=FakeOpenVocab(), segmenter=FakeSegmenter()))
    c.post("/ground", json=_payload(_png_b64()))
    res = c.get("/metrics")
    assert res.status_code == 200
    assert "model_vision_requests_total" in res.text
    assert metrics().requests_total == before + 1


def test_invalid_b64_returns_400() -> None:
    c = _client(Adapters(grounder=FakeGrounder(), open_vocab=FakeOpenVocab(), segmenter=FakeSegmenter()))
    payload = _payload(_png_b64())
    payload["keyframeB64"] = "!!!invalid!!!"
    assert c.post("/ground", json=payload).status_code == 400


def test_florence_mode_skips_escalation() -> None:
    open_vocab = FakeOpenVocab(answers={"reserve button": XYXY(11, 11, 60, 50)})
    c = _client(Adapters(grounder=FakeGrounder(answers={}), open_vocab=open_vocab, segmenter=FakeSegmenter()))
    res = c.post("/ground", json=_payload(_png_b64(), mode="florence"))
    assert res.status_code == 200
    assert open_vocab.calls == 0


def test_grounding_dino_mode_uses_open_vocab_only() -> None:
    grounder = FakeGrounder(answers={"reserve button": XYXY(12, 11, 62, 51)})
    open_vocab = FakeOpenVocab(answers={"reserve button": XYXY(12, 11, 62, 51)})
    c = _client(Adapters(grounder=grounder, open_vocab=open_vocab, segmenter=FakeSegmenter()))
    res = c.post("/ground", json=_payload(_png_b64(), mode="grounding-dino"))
    assert res.status_code == 200
    assert grounder.calls == 0
    assert open_vocab.calls == 1


def test_stream_emits_started_and_completed() -> None:
    grounder = FakeGrounder(answers={"reserve button": XYXY(12, 11, 62, 51)})
    c = _client(Adapters(grounder=grounder, open_vocab=FakeOpenVocab(), segmenter=FakeSegmenter()))
    with c.stream("POST", "/ground/stream", json=_payload(_png_b64())) as resp:
        events = [line.split(":", 1)[1].strip() for line in resp.iter_lines() if line.startswith("event:")]
    assert "started" in events and "completed" in events
