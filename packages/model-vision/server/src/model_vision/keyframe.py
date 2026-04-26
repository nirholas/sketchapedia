"""Keyframe fetch + decode. Never logs raw bytes."""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from io import BytesIO

import httpx
from PIL import Image
from PIL.Image import Image as PILImage

from .config import Settings


class KeyframeError(Exception):
    pass


@dataclass
class LoadedKeyframe:
    image: PILImage
    digest: str
    byte_size: int


async def load_keyframe(*, url: str | None, b64: str | None,
                        settings: Settings, client: httpx.AsyncClient | None = None) -> LoadedKeyframe:
    data = _decode_b64(b64, settings.fetch_max_bytes) if b64 else await _fetch(url or "", settings, client=client)
    digest = "sha256:" + hashlib.sha256(data).hexdigest()
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except Exception as exc:
        raise KeyframeError(f"failed to decode keyframe: {exc}") from exc
    return LoadedKeyframe(image=img.convert("RGB") if img.mode != "RGB" else img,
                         digest=digest, byte_size=len(data))


def _decode_b64(payload: str, max_bytes: int) -> bytes:
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    try:
        data = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise KeyframeError(f"invalid base64 keyframe: {exc}") from exc
    if len(data) > max_bytes:
        raise KeyframeError(f"keyframe exceeds {max_bytes} bytes")
    return data


async def _fetch(url: str, settings: Settings, *, client: httpx.AsyncClient | None) -> bytes:
    if not url.startswith(("http://", "https://")):
        raise KeyframeError(f"unsupported scheme in {url!r}")
    owns = client is None
    if owns:
        client = httpx.AsyncClient(timeout=httpx.Timeout(settings.fetch_timeout_ms / 1000.0), follow_redirects=True)
    assert client is not None
    try:
        resp = await client.get(url)
        if resp.status_code >= 400:
            raise KeyframeError(f"keyframe fetch {resp.status_code}")
        data = resp.content
        if len(data) > settings.fetch_max_bytes:
            raise KeyframeError(f"keyframe too large ({len(data)} bytes)")
        return data
    except httpx.HTTPError as exc:
        raise KeyframeError(f"keyframe fetch failed: {exc}") from exc
    finally:
        if owns:
            await client.aclose()
