"""Pure geometry: IoU, clipping, overlap resolution, polygon helpers."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

Point = tuple[float, float]


@dataclass(frozen=True)
class XYXY:
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return max(0.0, self.width) * max(0.0, self.height)

    @classmethod
    def from_xywh(cls, x: float, y: float, w: float, h: float) -> "XYXY":
        return cls(x, y, x + w, y + h)

    def as_xywh(self) -> tuple[float, float, float, float]:
        return (self.x1, self.y1, max(0.0, self.width), max(0.0, self.height))

    def clip_to(self, width: int, height: int) -> "XYXY":
        x1 = max(0.0, min(float(width), self.x1))
        y1 = max(0.0, min(float(height), self.y1))
        x2 = max(0.0, min(float(width), self.x2))
        y2 = max(0.0, min(float(height), self.y2))
        # Guarantee positive area: if collapsed by clipping, nudge inward.
        if x2 <= x1:
            if x1 + 1.0 <= float(width):
                x2 = x1 + 1.0
            else:
                x1 = max(0.0, float(width) - 1.0)
                x2 = float(width)
        if y2 <= y1:
            if y1 + 1.0 <= float(height):
                y2 = y1 + 1.0
            else:
                y1 = max(0.0, float(height) - 1.0)
                y2 = float(height)
        return XYXY(x1, y1, x2, y2)

    def round_int(self) -> "XYXY":
        return XYXY(round(self.x1), round(self.y1), round(self.x2), round(self.y2))


def bbox_iou(a: XYXY, b: XYXY) -> float:
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


def overlap_ratio(a: XYXY, b: XYXY) -> float:
    """Intersection area divided by the smaller box's area."""
    ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
    ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    smaller = min(a.area, b.area)
    return inter / smaller if smaller > 0 else 0.0


def polygon_bbox(points: Sequence[Point]) -> XYXY:
    if not points:
        raise ValueError("polygon has no points")
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return XYXY(min(xs), min(ys), max(xs), max(ys))


def clip_polygon(points: Sequence[Point], width: int, height: int) -> list[Point]:
    """Sutherland-Hodgman clip to [0, width] × [0, height]."""

    def inside(p: Point, edge: str, limit: float) -> bool:
        x, y = p
        return {"left": x >= 0.0, "right": x <= limit, "top": y >= 0.0, "bottom": y <= limit}[edge]

    def intersect(p1: Point, p2: Point, edge: str, limit: float) -> Point:
        x1, y1 = p1
        x2, y2 = p2
        if edge in ("left", "right"):
            xe = 0.0 if edge == "left" else limit
            t = (xe - x1) / (x2 - x1) if x2 != x1 else 0.0
            return (xe, y1 + t * (y2 - y1))
        ye = 0.0 if edge == "top" else limit
        t = (ye - y1) / (y2 - y1) if y2 != y1 else 0.0
        return (x1 + t * (x2 - x1), ye)

    poly = list(points)
    for edge, limit in (("left", 0.0), ("right", float(width)), ("top", 0.0), ("bottom", float(height))):
        if not poly:
            break
        out: list[Point] = []
        prev = poly[-1]
        for curr in poly:
            pi, ci = inside(prev, edge, limit), inside(curr, edge, limit)
            if ci:
                if not pi:
                    out.append(intersect(prev, curr, edge, limit))
                out.append(curr)
            elif pi:
                out.append(intersect(prev, curr, edge, limit))
            prev = curr
        poly = out

    if len(poly) < 3:
        bb = polygon_bbox(points).clip_to(width, height).round_int()
        return [(bb.x1, bb.y1), (bb.x2, bb.y1), (bb.x2, bb.y2), (bb.x1, bb.y2)]
    return [(round(x), round(y)) for x, y in poly]


def resolve_overlaps(
    items: Sequence[tuple[str, XYXY, float]],
    *,
    max_overlap: float = 0.10,
) -> list[tuple[str, XYXY, float]]:
    """Shrink lower-confidence boxes so pairwise overlap ≤ max_overlap."""
    order = sorted(range(len(items)), key=lambda i: items[i][2], reverse=True)
    boxes: dict[int, XYXY] = {i: items[i][1] for i in range(len(items))}
    originals = dict(boxes)

    for rank, idx in enumerate(order):
        for higher in order[:rank]:
            if overlap_ratio(boxes[higher], boxes[idx]) <= max_overlap:
                continue
            shrunk = _shrink_to_fit(boxes[idx], boxes[higher], max_overlap)
            if shrunk is None:
                continue
            boxes[idx] = originals[idx] if shrunk.area < 0.04 * originals[idx].area else shrunk

    return [(items[i][0], boxes[i], items[i][2]) for i in range(len(items))]


def _shrink_to_fit(b: XYXY, a: XYXY, max_overlap: float) -> XYXY | None:
    candidates = [
        c for c in [
            XYXY(b.x1, b.y1, a.x1, b.y2) if b.x2 > a.x1 > b.x1 else None,
            XYXY(a.x2, b.y1, b.x2, b.y2) if b.x1 < a.x2 < b.x2 else None,
            XYXY(b.x1, b.y1, b.x2, a.y1) if b.y2 > a.y1 > b.y1 else None,
            XYXY(b.x1, a.y2, b.x2, b.y2) if b.y1 < a.y2 < b.y2 else None,
        ]
        if c is not None and c.area > 0 and overlap_ratio(a, c) <= max_overlap
    ]
    return max(candidates, key=lambda c: c.area) if candidates else None


def coerce_box(box: Iterable[float]) -> XYXY:
    vals = [float(v) for v in box]
    if len(vals) != 4:
        raise ValueError(f"expected 4 numbers, got {len(vals)}")
    x1, y1, c, d = vals
    return XYXY(x1, y1, c, d) if (c > x1 and d > y1) else XYXY.from_xywh(x1, y1, c, d)
