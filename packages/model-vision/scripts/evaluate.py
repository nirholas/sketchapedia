"""Evaluate the vision-correction service against the labeled fixture set.

Reports mean IoU between the corrected hitmap and the ground-truth hitmap,
plus baseline (uncorrected draft) IoU as a control. Acceptance criterion
from prompt 19: **mean IoU ≥ 0.75** with corrections.

Two modes:
  --mode local   load Florence-2 + Grounding DINO in-process (needs GPU)
  --mode remote  hit a running model-vision server at $MODEL_VISION_URL

Usage:
    python3 evaluate.py --mode remote --url http://localhost:8019
    python3 evaluate.py --mode local
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "fixtures"
SERVER_SRC = ROOT / "server" / "src"
if str(SERVER_SRC) not in sys.path:
    sys.path.insert(0, str(SERVER_SRC))

from model_vision.geometry import XYXY, bbox_iou  # noqa: E402

ACCEPT_MEAN_IOU = 0.75


@dataclass
class FixtureResult:
    name: str
    items: int
    baseline_iou: float
    corrected_iou: float
    latency_ms: float
    deadline_hit: bool


def _hitmap_index(items: list[dict]) -> dict[str, XYXY]:
    out: dict[str, XYXY] = {}
    for it in items:
        r = it["region"]
        if r["kind"] == "bbox":
            b = r["bbox"]
            out[it["id"]] = XYXY.from_xywh(b["x"], b["y"], b["w"], b["h"])
        else:
            xs = [p[0] for p in r["polygon"]]
            ys = [p[1] for p in r["polygon"]]
            out[it["id"]] = XYXY(min(xs), min(ys), max(xs), max(ys))
    return out


def _mean_iou(predicted: dict[str, XYXY], truth: dict[str, XYXY]) -> float:
    if not truth:
        return 0.0
    ious = [bbox_iou(predicted.get(k, XYXY(0, 0, 1, 1)), v) for k, v in truth.items()]
    return statistics.mean(ious)


def _png_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


async def _ground_remote(client: httpx.AsyncClient, url: str, draft: dict, kf_b64: str) -> dict:
    resp = await client.post(
        f"{url.rstrip('/')}/ground",
        json={"keyframeB64": kf_b64, "hitmapDraft": draft, "deadlineMs": 2000, "mode": "auto"},
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()


def _ground_local(image_path: Path, draft: dict) -> dict:
    """In-process correction — loads Florence + DINO. Requires GPU."""
    from PIL import Image

    from model_vision.config import settings
    from model_vision.correction import correct_hitmap
    from model_vision.deadline import Deadline
    from model_vision.florence import Florence2
    from model_vision.grounding_dino import GroundingDINO
    from model_vision.schemas import Hitmap

    s = settings()
    florence = Florence2(s)
    dino = GroundingDINO(s)
    image = Image.open(image_path).convert("RGB")
    draft_hm = Hitmap.model_validate(draft)
    result = correct_hitmap(
        image=image, draft=draft_hm,
        grounder=florence, open_vocab=dino, segmenter=florence,
        deadline=Deadline.starting_now(2000),
    )
    return {
        "hitmap": result.hitmap.model_dump(by_alias=True),
        "diagnostics": result.diagnostics.model_dump(by_alias=True),
    }


async def evaluate(*, mode: str, url: str | None) -> list[FixtureResult]:
    manifest = json.loads((FIX / "manifest.json").read_text())
    results: list[FixtureResult] = []

    async with httpx.AsyncClient() as http:
        for entry in manifest:
            name = entry["name"]
            kf_path = FIX / entry["keyframe"]
            draft = json.loads((FIX / entry["draft"]).read_text())
            truth = json.loads((FIX / entry["ground_truth"]).read_text())
            truth_idx = _hitmap_index(truth["items"])
            draft_idx = _hitmap_index(draft["items"])
            baseline = _mean_iou(draft_idx, truth_idx)

            t0 = time.perf_counter()
            if mode == "remote":
                if url is None:
                    raise SystemExit("--url required in remote mode")
                corrected = await _ground_remote(http, url, draft, _png_b64(kf_path))
            else:
                corrected = await asyncio.to_thread(_ground_local, kf_path, draft)
            latency_ms = (time.perf_counter() - t0) * 1000.0

            corrected_idx = _hitmap_index(corrected["hitmap"]["items"])
            corrected_iou = _mean_iou(corrected_idx, truth_idx)
            results.append(FixtureResult(
                name=name,
                items=len(truth_idx),
                baseline_iou=baseline,
                corrected_iou=corrected_iou,
                latency_ms=latency_ms,
                deadline_hit=corrected["diagnostics"].get("deadlineHit", False),
            ))
            print(f"  {name:30s} items={len(truth_idx):3d} "
                  f"baseline={baseline:.3f}  corrected={corrected_iou:.3f}  "
                  f"latency={latency_ms:6.1f}ms")

    return results


def report(results: list[FixtureResult]) -> int:
    print()
    mean_baseline = statistics.mean(r.baseline_iou for r in results)
    mean_corrected = statistics.mean(r.corrected_iou for r in results)
    p95_latency = statistics.quantiles(
        [r.latency_ms for r in results], n=20
    )[-1] if len(results) >= 20 else max(r.latency_ms for r in results)
    deadline_hits = sum(1 for r in results if r.deadline_hit)

    print(f"fixtures           : {len(results)}")
    print(f"mean IoU (baseline): {mean_baseline:.3f}")
    print(f"mean IoU (vision)  : {mean_corrected:.3f}  (target ≥ {ACCEPT_MEAN_IOU})")
    print(f"latency p95        : {p95_latency:.1f} ms")
    print(f"deadline hits      : {deadline_hits}")
    improved = sum(1 for r in results if r.corrected_iou > r.baseline_iou)
    print(f"fixtures improved  : {improved}/{len(results)}")

    if mean_corrected < ACCEPT_MEAN_IOU:
        print(f"\nFAIL: mean IoU {mean_corrected:.3f} < {ACCEPT_MEAN_IOU}")
        return 1
    if mean_corrected <= mean_baseline:
        print(f"\nFAIL: corrections did not improve over baseline")
        return 1
    print("\nPASS")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["remote", "local"], default="remote")
    ap.add_argument("--url", default="http://localhost:8019",
                    help="vision service base URL (remote mode)")
    args = ap.parse_args()

    results = asyncio.run(evaluate(mode=args.mode, url=args.url))
    sys.exit(report(results))


if __name__ == "__main__":
    main()
