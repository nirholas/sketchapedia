"""Pydantic schemas for the /ground HTTP API.

Wire names are camelCase; Python names are snake_case via alias_generator.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(p.title() for p in tail)


class _Wire(BaseModel):
    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


class BBox(_Wire):
    x: float
    y: float
    w: float
    h: float

    @field_validator("w", "h")
    @classmethod
    def _positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("bbox width/height must be positive")
        return v


class RegionBBox(_Wire):
    kind: Literal["bbox"] = "bbox"
    bbox: BBox


Point = tuple[float, float]


class RegionPolygon(_Wire):
    kind: Literal["polygon"] = "polygon"
    polygon: list[Point]

    @field_validator("polygon")
    @classmethod
    def _min_points(cls, v: list[Point]) -> list[Point]:
        if len(v) < 3:
            raise ValueError("polygon must have at least 3 vertices")
        return v


Region = Annotated[RegionBBox | RegionPolygon, Field(discriminator="kind")]


class AriaRole(str, Enum):
    button = "button"
    link = "link"
    textbox = "textbox"
    checkbox = "checkbox"
    radio = "radio"
    switch = "switch"
    slider = "slider"
    combobox = "combobox"
    listbox = "listbox"
    option = "option"
    tab = "tab"
    tablist = "tablist"
    tabpanel = "tabpanel"
    menuitem = "menuitem"
    progressbar = "progressbar"
    status = "status"
    dialog = "dialog"
    region = "region"


class HitmapItem(_Wire):
    id: str
    region: Region
    role: AriaRole = AriaRole.region
    aria_label: str = ""
    aria_summary: str | None = None
    intent: dict | None = None
    input: dict | None = None
    tab_index: int | None = None
    disabled: bool | None = None
    autofocus: bool | None = None
    confidence: float | None = None
    low_confidence: bool | None = None


class Viewport(_Wire):
    width: int
    height: int

    @field_validator("width", "height")
    @classmethod
    def _positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("viewport dims must be positive")
        return v


class Hitmap(_Wire):
    items: list[HitmapItem]
    viewport: Viewport
    coordinate_space: Literal["viewport", "keyframe"] = "keyframe"
    aria_summary: str | None = None
    form: dict | None = None
    modal: bool | None = None


GroundingMode = Literal["auto", "florence", "grounding-dino"]


class GroundRequest(_Wire):
    keyframe_url: str | None = None
    keyframe_b64: str | None = None
    hitmap_draft: Hitmap
    mode: GroundingMode = "auto"
    deadline_ms: int = Field(default=500, ge=50, le=10_000)
    request_id: str | None = None

    @model_validator(mode="after")
    def _one_source(self) -> "GroundRequest":
        if not self.keyframe_url and not self.keyframe_b64:
            raise ValueError("keyframe_url or keyframe_b64 is required")
        if self.keyframe_url and self.keyframe_b64:
            raise ValueError("provide exactly one of keyframe_url / keyframe_b64")
        return self


class CorrectionDiagnostic(_Wire):
    id: str
    iou: float
    confidence: float
    accepted: bool
    escalated: bool
    matched_phrase: str | None = None


class Diagnostics(_Wire):
    mean_confidence: float
    mean_iou: float
    match_rate: float
    escalation_rate: float
    deadline_hit: bool
    latency_ms: float
    corrections: list[CorrectionDiagnostic]
    keyframe_hash: str


class GroundResponse(_Wire):
    hitmap: Hitmap
    diagnostics: Diagnostics
