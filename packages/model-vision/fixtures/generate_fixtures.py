"""Generate 20 deterministic keyframe + draft + ground-truth fixtures.

Each fixture is a synthesized 1280×720 PNG with axis-aligned colored regions
plus a JSON ground-truth hitmap (exact pixel coords) and a draft hitmap
(coords perturbed 5-25px to simulate LLM drift).

Usage:
    python3 generate_fixtures.py
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
KEYFRAMES = ROOT / "keyframes"
DRAFTS = ROOT / "drafts"
GT = ROOT / "ground_truth"
W, H = 1280, 720


@dataclass(frozen=True)
class Region:
    id: str
    x: int
    y: int
    w: int
    h: int
    color: tuple[int, int, int]
    label: str
    role: str = "button"


@dataclass(frozen=True)
class Scene:
    name: str
    background: tuple[int, int, int]
    regions: tuple[Region, ...]


SCENES: tuple[Scene, ...] = (
    # Paris reservation interface (prompt 00 reference #1)
    Scene("paris-reservation", (245, 240, 230), (
        Region("res-btn", 480, 540, 320, 80, (180, 60, 60), "blue reserve button"),
        Region("date-pkr", 200, 380, 380, 60, (240, 220, 180), "date picker"),
        Region("party-size", 620, 380, 200, 60, (240, 220, 180), "party size selector"),
        Region("menu-img", 880, 100, 320, 240, (200, 180, 140), "menu cover image"),
        Region("title-bar", 60, 60, 1160, 40, (50, 50, 50), "restaurant title bar"),
    )),
    # Ice/water molecular diagram (#2)
    Scene("ice-water-diagram", (220, 235, 245), (
        Region("liq-panel", 80, 120, 540, 480, (170, 200, 230), "liquid water diagram panel"),
        Region("solid-panel", 660, 120, 540, 480, (200, 220, 240), "solid ice diagram panel"),
        Region("zoom-btn", 540, 640, 200, 60, (90, 130, 200), "zoom into molecule button"),
        Region("legend", 80, 640, 380, 60, (250, 250, 250), "legend strip"),
    )),
    # Hydrogen bond geometry (#3)
    Scene("hydrogen-bond", (235, 245, 240), (
        Region("h-bond", 320, 200, 640, 320, (210, 230, 220), "hydrogen bond geometry diagram"),
        Region("explain-tb", 100, 540, 1080, 80, (255, 255, 240), "expansion explanation textbox"),
        Region("next-btn", 1100, 60, 130, 50, (60, 140, 80), "next chart button"),
    )),
    # Times Square scrubber (#4)
    Scene("times-square", (40, 50, 80), (
        Region("city-view", 60, 60, 1160, 480, (90, 100, 130), "isometric cityscape view"),
        Region("scrubber", 100, 600, 1080, 50, (200, 200, 220), "year scrubber slider"),
        Region("year-label", 580, 660, 120, 40, (255, 255, 255), "year label"),
    )),
    # Project dashboard (#5)
    Scene("project-dashboard", (250, 250, 248), (
        Region("todo-list", 60, 100, 380, 540, (240, 240, 250), "todo list panel"),
        Region("schema-diag", 480, 100, 520, 380, (250, 245, 230), "denormalize schema diagram"),
        Region("denorm-btn", 480, 520, 240, 50, (220, 130, 60), "denormalize schema button"),
        Region("dep-graph", 1020, 100, 200, 540, (235, 245, 235), "dependency graph"),
    )),
    # Codebase architecture (#6)
    Scene("codebase-arch", (245, 248, 252), (
        Region("module-1", 80, 80, 360, 280, (220, 230, 240), "auth module box"),
        Region("module-2", 480, 80, 360, 280, (240, 220, 220), "api module box"),
        Region("module-3", 880, 80, 320, 280, (220, 240, 220), "db module box"),
        Region("legend-bar", 80, 620, 1120, 60, (250, 250, 250), "module legend bar"),
    )),
    # Variants for robustness
    Scene("paris-reservation-v2", (250, 245, 235), (
        Region("res-btn", 500, 560, 280, 70, (200, 60, 60), "reserve table button"),
        Region("date-pkr", 220, 400, 360, 50, (235, 215, 175), "date picker"),
        Region("menu-img", 860, 120, 340, 220, (210, 190, 150), "menu cover image"),
    )),
    Scene("ice-water-v2", (215, 230, 240), (
        Region("liq-panel", 100, 140, 520, 440, (175, 205, 235), "liquid water panel"),
        Region("solid-panel", 660, 140, 520, 440, (205, 225, 245), "solid ice panel"),
        Region("zoom-btn", 540, 620, 200, 60, (95, 135, 205), "zoom button"),
    )),
    Scene("dashboard-v2", (248, 248, 245), (
        Region("todo-list", 80, 120, 360, 520, (242, 242, 250), "todo list panel"),
        Region("schema-diag", 460, 120, 540, 360, (250, 245, 232), "schema diagram"),
        Region("denorm-btn", 460, 500, 260, 50, (220, 135, 65), "denormalize button"),
    )),
    Scene("codebase-v2", (248, 250, 252), (
        Region("module-1", 100, 100, 340, 260, (222, 232, 242), "auth module"),
        Region("module-2", 480, 100, 340, 260, (242, 222, 222), "api module"),
        Region("module-3", 860, 100, 320, 260, (222, 240, 222), "db module"),
    )),
    Scene("hydrogen-v2", (232, 242, 238), (
        Region("h-bond", 340, 220, 600, 300, (212, 232, 222), "hydrogen geometry"),
        Region("explain-tb", 120, 560, 1040, 70, (255, 255, 245), "explanation textbox"),
    )),
    Scene("times-square-v2", (45, 55, 85), (
        Region("city-view", 80, 80, 1120, 460, (95, 105, 135), "isometric cityscape"),
        Region("scrubber", 120, 600, 1040, 48, (205, 205, 222), "year scrubber"),
    )),
    # Dense layouts for overlap/edge testing
    Scene("dense-grid", (250, 250, 250), tuple(
        Region(f"cell-{r}-{c}", 60 + c * 240, 60 + r * 200, 220, 180,
               (200 + (r * 7 + c * 11) % 50, 180, 200), f"grid cell {r} {c}", "tab")
        for r in range(3) for c in range(5)
    )[:12]),  # 12 dense cells
    Scene("toolbar-strip", (245, 248, 252), tuple(
        Region(f"tool-{i}", 60 + i * 100, 60, 80, 80,
               (180, 200, 230), f"toolbar item {i}", "menuitem")
        for i in range(10)
    )),
    # Asymmetric layouts
    Scene("media-player", (30, 30, 35), (
        Region("video", 80, 80, 1120, 500, (60, 60, 80), "video stage"),
        Region("play-btn", 600, 600, 80, 80, (220, 220, 220), "play pause button"),
        Region("prog-bar", 80, 700, 1120, 12, (200, 200, 220), "progress bar"),
    )),
    Scene("doc-reader", (250, 248, 240), (
        Region("nav-rail", 60, 80, 220, 580, (235, 230, 220), "chapter navigation rail"),
        Region("page", 320, 80, 760, 580, (252, 250, 245), "document page"),
        Region("toc-toggle", 60, 30, 80, 30, (200, 180, 140), "toc toggle"),
        Region("search", 320, 30, 360, 30, (220, 220, 220), "search bar"),
    )),
    Scene("calculator", (240, 240, 250), (
        Region("display", 80, 60, 1120, 120, (40, 40, 60), "calculator display"),
        Region("clear", 80, 220, 260, 100, (220, 100, 100), "clear button"),
        Region("equals", 940, 220, 260, 100, (100, 180, 220), "equals button"),
        Region("digits-pad", 80, 360, 1120, 320, (220, 220, 230), "digit keypad"),
    )),
    Scene("map-explorer", (200, 220, 200), (
        Region("map-canvas", 60, 60, 900, 600, (170, 200, 170), "map canvas"),
        Region("legend-pn", 1000, 60, 220, 280, (245, 245, 235), "legend panel"),
        Region("filters-pn", 1000, 380, 220, 280, (235, 245, 245), "filters panel"),
    )),
    Scene("login-form", (240, 240, 245), (
        Region("title", 540, 120, 200, 40, (40, 40, 60), "login title"),
        Region("email", 440, 220, 400, 50, (255, 255, 255), "email field", "textbox"),
        Region("password", 440, 300, 400, 50, (255, 255, 255), "password field", "textbox"),
        Region("submit", 540, 400, 200, 60, (80, 130, 200), "sign in button"),
    )),
    Scene("chart-page", (252, 252, 252), (
        Region("title", 80, 60, 800, 50, (40, 40, 50), "chart title"),
        Region("bar-chart", 80, 140, 540, 460, (220, 230, 240), "bar chart"),
        Region("line-chart", 660, 140, 540, 460, (240, 220, 230), "line chart"),
    )),
)


def render_keyframe(scene: Scene) -> Image.Image:
    img = Image.new("RGB", (W, H), scene.background)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    for r in scene.regions:
        draw.rectangle([r.x, r.y, r.x + r.w, r.y + r.h], fill=r.color, outline=(40, 40, 40), width=2)
        # Label centered, clipped to box.
        try:
            tx, ty = r.x + 8, r.y + 8
            draw.text((tx, ty), r.label[:32], fill=(20, 20, 20), font=font)
        except Exception:
            pass
    return img


def gt_hitmap(scene: Scene) -> dict:
    return {
        "items": [
            {"id": r.id,
             "region": {"kind": "bbox", "bbox": {"x": r.x, "y": r.y, "w": r.w, "h": r.h}},
             "role": r.role, "ariaLabel": r.label}
            for r in scene.regions
        ],
        "viewport": {"width": W, "height": H},
        "coordinateSpace": "keyframe",
    }


def draft_hitmap(scene: Scene, seed: int) -> dict:
    rng = random.Random(seed)
    items = []
    for r in scene.regions:
        # Drift each side independently by 5-25px in either direction; the
        # vision pass should recover the truth.
        dx = rng.randint(-25, 25)
        dy = rng.randint(-25, 25)
        dw = rng.randint(-15, 15)
        dh = rng.randint(-15, 15)
        x = max(0, min(W - 10, r.x + dx))
        y = max(0, min(H - 10, r.y + dy))
        w = max(20, min(W - x, r.w + dw))
        h = max(20, min(H - y, r.h + dh))
        items.append({
            "id": r.id,
            "region": {"kind": "bbox", "bbox": {"x": x, "y": y, "w": w, "h": h}},
            "role": r.role,
            "ariaLabel": r.label,
        })
    return {
        "items": items,
        "viewport": {"width": W, "height": H},
        "coordinateSpace": "keyframe",
    }


def main() -> None:
    KEYFRAMES.mkdir(parents=True, exist_ok=True)
    DRAFTS.mkdir(parents=True, exist_ok=True)
    GT.mkdir(parents=True, exist_ok=True)
    if len(SCENES) < 20:
        raise SystemExit(f"need ≥ 20 scenes, have {len(SCENES)}")

    manifest: list[dict] = []
    for i, scene in enumerate(SCENES[:20]):
        kf_path = KEYFRAMES / f"{scene.name}.png"
        gt_path = GT / f"{scene.name}.json"
        draft_path = DRAFTS / f"{scene.name}.json"
        render_keyframe(scene).save(kf_path, format="PNG", optimize=True)
        gt_path.write_text(json.dumps(gt_hitmap(scene), indent=2))
        draft_path.write_text(json.dumps(draft_hitmap(scene, seed=1000 + i), indent=2))
        manifest.append({
            "name": scene.name,
            "keyframe": str(kf_path.relative_to(ROOT)),
            "draft": str(draft_path.relative_to(ROOT)),
            "ground_truth": str(gt_path.relative_to(ROOT)),
        })

    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"wrote {len(manifest)} fixtures to {ROOT}")


if __name__ == "__main__":
    main()
