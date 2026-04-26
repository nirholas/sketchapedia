# Vision Grounding Fixtures

20 hand-labeled keyframe fixtures used by `scripts/evaluate.py` to assert the
**mean IoU ≥ 0.75** acceptance bar.

## Layout

```
fixtures/
├── generate_fixtures.py     # Synthesizes deterministic test images + GT hitmaps
├── manifest.json            # Index of all 20 fixtures
├── keyframes/               # PNG renders (the rendered "keyframe" per scene)
├── ground_truth/            # Hand-labeled hitmaps (correct coords)
└── drafts/                  # LLM-style noisy hitmaps (offset 5–25px)
```

Each fixture name maps to one of the six reference scenes from `prompts/00-vision.md`
(Paris, Ice/Water, Hydrogen, Times Square, Project Dashboard, Codebase) plus
held-out variants for robustness.

## Regenerating

```bash
cd packages/model-vision/fixtures
python3 generate_fixtures.py
```

The synthesizer is fully deterministic — same script, same files. The drafts
are produced with a fixed PRNG seed per fixture so the evaluation is
reproducible. To replace synthesized images with screenshots from real
prompt-17 runs, drop a `keyframes/<name>.png` and a matching
`ground_truth/<name>.json`; the evaluator picks them up via `manifest.json`.
