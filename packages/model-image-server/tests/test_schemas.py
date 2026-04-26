from __future__ import annotations

import pytest
from pydantic import ValidationError

from model_image_server.schemas import GenerateRequest


def _minimal(**overrides):
    base = {"prompt": "hello"}
    base.update(overrides)
    return base


def test_minimal_request_fills_defaults():
    req = GenerateRequest(**_minimal())
    assert req.size.width == 1920
    assert req.size.height == 1080
    assert req.model_family == "flux"
    assert req.seed == 0
    assert req.steps is None
    assert req.regions == []


def test_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        GenerateRequest(**_minimal(sneaky="bad"))


def test_rejects_non_multiple_of_8_size():
    with pytest.raises(ValidationError):
        GenerateRequest(**_minimal(size={"width": 1921, "height": 1080}))


def test_rejects_negative_bbox():
    with pytest.raises(ValidationError):
        GenerateRequest(
            **_minimal(
                regions=[{"bbox": [-1, 0, 10, 10], "prompt": "x", "role": "button"}]
            )
        )


def test_rejects_zero_width_bbox():
    with pytest.raises(ValidationError):
        GenerateRequest(
            **_minimal(
                regions=[{"bbox": [0, 0, 0, 10], "prompt": "x", "role": "button"}]
            )
        )


def test_seed_bounds():
    GenerateRequest(**_minimal(seed=0))
    GenerateRequest(**_minimal(seed=2**31 - 1))
    with pytest.raises(ValidationError):
        GenerateRequest(**_minimal(seed=-1))
    with pytest.raises(ValidationError):
        GenerateRequest(**_minimal(seed=2**31))
