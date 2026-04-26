# syntax=docker/dockerfile:1.7
# Sketchapedia model-vision: Florence-2 + Grounding DINO on CUDA 12.1.
# Weights are NOT baked in — fetched to $HF_HOME at first use.

ARG CUDA_VERSION=12.1.1
FROM nvidia/cuda:${CUDA_VERSION}-cudnn8-runtime-ubuntu22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.11 python3.11-venv python3-pip \
      libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
      ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/* \
 && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 10 \
 && python -m pip install --upgrade pip==24.3.1 setuptools==75.6.0 wheel==0.45.1

WORKDIR /opt/model-vision

FROM base AS deps
RUN pip install --index-url https://download.pytorch.org/whl/cu121 \
      torch==2.4.1 torchvision==0.19.1
RUN pip install \
      fastapi==0.115.6 "uvicorn[standard]==0.32.1" sse-starlette==2.1.3 \
      pydantic==2.10.3 pydantic-settings==2.7.0 httpx==0.28.1 \
      pillow==11.0.0 numpy==2.1.3 scipy==1.14.1 rapidfuzz==3.10.1 \
      structlog==24.4.0 transformers==4.46.3 accelerate==1.1.1 \
      timm==1.0.11 einops==0.8.0 safetensors==0.4.5 \
      opencv-python-headless==4.10.0.84

FROM deps AS app
COPY src /opt/model-vision/src
ENV PYTHONPATH=/opt/model-vision/src \
    HF_HOME=/var/cache/huggingface \
    MODEL_VISION_HOST=0.0.0.0 \
    MODEL_VISION_PORT=8019

RUN mkdir -p /var/cache/huggingface \
 && useradd --system --uid 10001 --home /opt/model-vision vision \
 && chown -R vision:vision /opt/model-vision /var/cache/huggingface

USER vision
EXPOSE 8019

HEALTHCHECK --interval=10s --timeout=3s --start-period=120s --retries=3 \
  CMD curl --fail --silent http://localhost:8019/readyz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "uvicorn", "model_vision.main:app", \
     "--host", "0.0.0.0", "--port", "8019", "--workers", "1"]
