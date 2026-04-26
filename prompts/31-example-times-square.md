# 31 — Reference App: The Evolution of Times Square

## Project context

This reference app reproduces **Video 4** from the user's vision: an interactive architectural timeline. The user drags a scrubber at the bottom and the isometric illustration of Times Square morphs through eras (1904, 1928, 1950, 1984, 2005, 2024) — buildings, signage, technology changing in real time. This is the showcase application for the **scrubbable media primitive** (prompt 12). See `prompts/00-vision.md`.

## Your task

Build `apps/examples-times-square/` — a Next.js 15 page with a single dominant scene holding a scrubbable region bound to a year scalar. All interaction state lives locally in the scene; no per-scrub server round-trip.

## Technical requirements

- Pre-generated frame sequence: for each of ~30 year stops spanning 1904–2024, a content-addressed keyframe rendered via prompt 17 and cached in prompt 20's server cache; fetched once on scene load.
- **Optical flow fields** (prompt 18 optional output) pre-computed between adjacent keyframes to enable `interpolation: "flow"` smooth transitions between years.
- Scrubber: `<input type="range">` invisibly overlaid per prompt 06; visible styling drawn in pixels.
- Info card updates as the year changes: buildings list, notable events, population stats — driven by a real dataset under `apps/examples-times-square/data/timeline.json`.
- Playable "timelapse" mode: auto-advances the year at 2 years/sec with a pause button.

## Canonical user journey

1. Landing scene with Times Square 2024 in isometric illustration.
2. Drag scrubber back to 1904 — imagery morphs decade by decade; info card updates.
3. Hover a building label: tooltip explaining that building's history in the current era.
4. Click a building in a specific era: deep-dive scene focused on that building (optional; cache-miss path for non-canonical buildings).
5. Play timelapse; pause; resume; snap to a specific year from the info card.

## Implementation mandates

- Scrubber feel: latency from pointer move to pixel update < 16ms (60fps target).
- Fallback: if flow interpolation unavailable (e.g. codec unsupported), `linear` crossfade between keyframes.
- Real dataset with citations for every fact.
- Hover tooltips are real DOM with ARIA for screen readers; description announced via live region.
- Timelapse honors `prefers-reduced-motion` by moving at 1 year every 2s instead of 2 years/sec.

## Test plan

- Playwright E2E:
  - Scrub full range; assert visual state at 5 known year positions.
  - Timelapse playback; pause; resume; final year correct.
  - Hover building label; tooltip content correct.
  - Keyboard-only: arrow-key scrub and tab to info card.
  - Reduced motion: slower timelapse + disabled flow warp.
  - Axe-core clean.
- Performance: sustained 60fps during a 5-second full-range drag.

## Deliverables

- `apps/examples-times-square/src/*`.
- `apps/examples-times-square/data/timeline.json` with citations.
- Pre-generated frame sequence + flow artifacts.
- `apps/examples-times-square/README.md`.

## Acceptance criteria

- 60fps scrub.
- All 30 year stops render correct eras with plausible detail.
- Accessibility perfect.

## Non-goals

- Not a historically complete archive; curated set.
- No user-contributed era submissions.
