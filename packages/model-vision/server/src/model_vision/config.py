"""Runtime configuration via environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MODEL_VISION_", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8019
    log_level: str = "INFO"
    florence_model: str = "microsoft/Florence-2-base-ft"
    grounding_dino_model: str = "IDEA-Research/grounding-dino-tiny"
    device: Literal["cuda", "cpu", "auto"] = "auto"
    dtype: Literal["float16", "bfloat16", "float32"] = "bfloat16"
    default_deadline_ms: int = 500
    grounding_max_items: int = 32
    fetch_timeout_ms: int = 2_000
    fetch_max_bytes: int = 8 * 1024 * 1024
    retain_draft_on_low_confidence: bool = True
    metrics_enabled: bool = True
    enable_torch_compile: bool = Field(default=False)


@lru_cache(maxsize=1)
def settings() -> Settings:
    return Settings()
