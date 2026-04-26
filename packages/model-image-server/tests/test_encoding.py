from __future__ import annotations

import io

import numpy as np
import pytest

from model_image_server import encoding


@pytest.fixture
def image() -> np.ndarray:
    rng = np.random.default_rng(7)
    return rng.integers(0, 256, size=(64, 64, 3), dtype=np.uint8)


def test_webp_lossless_is_byte_deterministic(image):
    a, ct_a = encoding.encode(image, "webp", webp_lossless=True)
    b, ct_b = encoding.encode(image, "webp", webp_lossless=True)
    assert a == b
    assert ct_a == ct_b == "image/webp"


def test_webp_lossless_roundtrip_is_exact(image):
    from PIL import Image

    data, _ = encoding.encode(image, "webp", webp_lossless=True)
    decoded = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
    assert np.array_equal(decoded, image)


def test_sha256_has_prefix():
    h = encoding.sha256(b"hello")
    assert h.startswith("sha256:")
    assert len(h) == len("sha256:") + 64


def test_rejects_non_uint8_image():
    with pytest.raises(ValueError):
        encoding.encode(np.zeros((4, 4, 3), dtype=np.float32), "webp")
