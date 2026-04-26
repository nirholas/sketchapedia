# @sketchapedia/model-image-server

Python inference server that renders Sketchapedia keyframes.

Runs [FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev) with
IP-Adapter style-reference conditioning and ControlNet-Union regional
prompting. Exposes an HTTP + SSE API consumed by the orchestrator via
[`@sketchapedia/model-image`](../model-image)'s TypeScript runtime.

Canonical build spec: [`prompts/17-image-model-runtime.md`](../../prompts/17-image-model-runtime.md).

## HTTP API

### `POST /generate`

```jsonc
{
  "prompt": "...",
  "style_reference_url": "https://cache.internal/kf/abc.webp",
  "regions": [
    { "bbox": [x, y, w, h], "prompt": "...", "role": "button", "aria_label": "Reserve" }
  ],
  "render_mode": "illustration",
  "size": { "width": 1920, "height": 1080 },
  "seed": 12345,
  "steps": 30,
  "guidance_scale": 3.5,
  "lora": [ { "name": "tenant-style-v3", "weight": 0.7 } ],
  "model_family": "flux"
}
```

- `Accept: text/event-stream` → streamed `progress` / `result` / `error` events.
- `Accept: application/json` → blocks until the result fires and returns only that payload.

### Auxiliary endpoints

- `GET /healthz` — liveness (no GPU touch).
- `GET /readyz` — returns 200 once the pipeline is warm and LoRA cache is seeded.
- `POST /admin/lora/reload` — hot-swap a LoRA without a full restart.
- `GET /metrics` — Prometheus scrape; OTel OTLP exporter also supported.

## Deploy guide

```bash
docker build -t sketchapedia/model-image:dev packages/model-image-server

docker run --gpus all \
  -e HF_HOME=/models -v $HOME/.cache/huggingface:/models \
  -e SKETCH_MODEL_ID=black-forest-labs/FLUX.1-dev \
  -e SKETCH_CACHE_UPLOAD_URL=https://cache.internal/upload \
  -p 8088:8088 sketchapedia/model-image:dev
```

Warm boot (pipeline + IP-Adapter + default ControlNet loaded into VRAM) takes
about 60 s. The [GPU dispatcher](../../prompts/22-gpu-dispatcher.md) keeps a
warm pool across the fleet so tenant requests see hot pipelines.

### GPU sizing

| GPU        | VRAM  | Offload mode                                         | 1920×1080 / 30 steps | Concurrency |
| ---------- | ----- | ---------------------------------------------------- | -------------------- | ----------- |
| L40S       | 48 GB | none                                                 | ~2.8 s               | 2           |
| A10G       | 24 GB | `enable_model_cpu_offload`                           | ~6.5 s               | 1           |
| T4 / A4000 | 16 GB | `enable_sequential_cpu_offload` + bitsandbytes 8-bit | ~22 s                | 1 (degraded) |
| H100       | 80 GB | none, `torch.compile` hot                            | ~1.4 s               | 4           |

Below 16 GB VRAM is unsupported — warm-start fails and `/readyz` stays 503.

### Model binary storage

`HF_HOME` should point at a fast local SSD shared-read across replicas
(NVMe, ≥ 2 GB/s). The default LoRA hot-cache (last 16) lives at
`$HF_HOME/loras/`; LoRAs hot-swap via `POST /admin/lora/reload` without
restarting the server.

## Environment variables

| Variable                   | Default                            | Purpose                                            |
| -------------------------- | ---------------------------------- | -------------------------------------------------- |
| `SKETCH_MODEL_ID`          | `black-forest-labs/FLUX.1-dev`     | HF repo id for FLUX                                |
| `SKETCH_SDXL_MODEL_ID`     | `stabilityai/stable-diffusion-xl-base-1.0` | HF repo id for SDXL fallback               |
| `SKETCH_PRECISION`         | `bf16`                             | `bf16` / `fp16` / `fp8`                            |
| `SKETCH_TORCH_COMPILE`     | `true`                             | Enable `torch.compile(reduce-overhead)`            |
| `SKETCH_STEPS_DEFAULT`     | `30`                               | Sampler steps (quality)                            |
| `SKETCH_STEPS_FAST`        | `20`                               | Sampler steps (speed)                              |
| `SKETCH_GUIDANCE`          | `3.5`                              | Classifier-free guidance scale                     |
| `SKETCH_ENCODER`           | `webp`                             | `webp` or `avif`                                   |
| `SKETCH_LORA_CACHE`        | `16`                               | LRU capacity                                       |
| `SKETCH_LORA_DIR`          | `/models/loras`                    | Hot cache dir for LoRAs                            |
| `SKETCH_LICENSE_MODE`      | `noncommercial`                    | `noncommercial` \| `commercial` (gates FLUX.1-dev) |
| `SKETCH_NSFW_ALLOWLIST`    | ``                                 | Comma-separated tenant ids allowed to bypass safety|
| `SKETCH_VRAM_SHED`         | `0.90`                             | Shed fraction — reject new work above this         |
| `SKETCH_CACHE_UPLOAD_URL`  | (unset)                            | Cache server endpoint (prompt 20)                  |
| `SKETCH_OTEL_ENDPOINT`     | (unset)                            | OTel OTLP exporter                                 |

## Testing

```bash
pytest packages/model-image-server/tests         # CPU-only unit tests
pytest -m gpu packages/model-image-server/tests  # gated; real GPU
```
