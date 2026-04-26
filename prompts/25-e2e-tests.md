# 25 — End-to-End Test Suite

## Project context

Sketchapedia's most impressive integration moments can only be validated in a real browser against a real backend: a user clicks a pixel, the server generates a scene, the client composits, the DOM overlay responds correctly, the screen reader announces. E2E tests catch the bugs no unit test can: misaligned hitmaps, stuck transitions, races between intent dispatch and scene commit, accessibility regressions. See `prompts/00-vision.md`.

## Your task

Implement `tests-e2e/` at the repo root — a **Playwright** suite that boots the full stack (gateway + orchestrator + cache + edge + model stubs against real local services) and exercises the four reference apps (prompts 29–32) from a user's perspective.

## Technical requirements

- **Playwright 1.50+** with Chromium, Firefox, WebKit projects.
- **Docker Compose** stack (`tests-e2e/stack/docker-compose.yaml`) starts: Redis, MinIO, cache-server, gateway, orchestrator, observability collector. Model services connect to real hosted Modal endpoints in a dedicated test workspace — **no mocks**; CI secrets provide API keys.
- **Fixtures**: test tenants with pre-seeded caches covering common reference-app scenes so most paths hit the cache (keeps CI cheap); a designated `slow` test profile exercises cache-miss paths against real models (run nightly).
- **Axe-core** on every reference-app page; `@axe-core/playwright` integrated.
- **Visual diffs**: Playwright screenshots on key frames; small perceptual tolerance; checked in.
- **Trace**: Playwright traces captured on failure and uploaded as CI artifacts.

## Test scope

For each reference app:

1. **Golden path**: load → initial scene renders → click through a canonical user journey → reach expected terminal scene → axe passes throughout.
2. **Keyboard-only**: complete the same journey without pointer events.
3. **Screen reader announcements**: subscribe to the live region; assert announcements fire on each scene commit with non-empty text.
4. **Resilience**: mid-journey, force a network blip (Chrome DevTools Protocol offline → online); assert router recovers.
5. **Cache-miss stress**: clear the client cache; repeat a journey; observe non-cache latency, assert still converges to the right scene.
6. **Scrubbable**: Times Square app — drag the slider; assert intermediate frames render; final state matches.
7. **Forms**: Eiffel reservation — type in fields with real autofill test profile; submit; assert intent emits correct payload.
8. **Error recovery**: simulate a server error mid-generation (test feature flag); assert UI displays recovery surface and resumes.

## Additional cross-cutting tests

- **Concurrency**: open two tabs from the same user; ensure isolated sessions; no interference.
- **Authentication**: invalid JWT rejected at gateway with clear UI state.
- **Memory**: long-running test (50 scene commits) with `performance.measureUserAgentSpecificMemory` asserting bounded growth.
- **Reduced motion**: `prefers-reduced-motion: reduce`; assert transitions are crossfades and effects are muted.
- **Forced colors**: `forced-colors: active`; assert high-contrast rendering requested.
- **Locale**: switch locale mid-session; next scene reflects the new language.

## Implementation mandates

- Tests read configuration from env; no hard-coded `localhost`.
- Fixtures defined via Playwright's `test.extend`; shared across suites.
- Parallelizable; `fullyParallel: true`.
- CI executes the light profile on every PR; nightly run executes the full profile + visual diffs + memory tests.
- Failing tests always upload the Playwright trace + dependency logs + collector export.
- No flaky tests tolerated: retries disabled except for known infra flakiness (rate-limited 429s) and flagged in a quarantine list with owner + expiry.

## Test plan

Meta — the tests are the deliverable — but the CI plan is:

- Light profile: Chromium + Firefox + WebKit, cache-warm paths, ~8 min.
- Nightly: Chromium only, full cache-miss + memory + visual, ~45 min.
- Weekend: WebKit full-profile (some features require Safari Technology Preview).

## Deliverables

- `tests-e2e/{playwright.config.ts, fixtures/*.ts, specs/{eiffel,ice-water,times-square,dashboard,cross-cutting}/*.spec.ts, stack/docker-compose.yaml, stack/seed-cache.ts}`.
- CI workflow `/.github/workflows/e2e.yml` orchestrating stack up → seed → run → teardown → upload.
- `tests-e2e/README.md` with local-run instructions.

## Acceptance criteria

- All tests green under light profile.
- Nightly full profile green on a healthy main branch.
- Zero axe violations on any reference app in any tested browser.
- A deliberately introduced bug (e.g. hitmap off by 20px) causes test failures in the relevant scenario.

## Non-goals

- Load testing (prompt 34).
- Mobile Safari specifics beyond what Playwright supports natively.
