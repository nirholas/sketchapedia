# 29 — Reference App: Essential Guide to Paris (Eiffel + Le Jules Verne)

## Project context

This reference app reproduces **Video 1** from the user's vision: a stylized hand-drawn map of Paris that zooms into an Eiffel Tower cross-section acting as a visitor guide, and ultimately becomes a working reservation interface for the Le Jules Verne restaurant with a booking timeline, menu, and data-entry fields. The point of this app is to prove that Sketchapedia can move through dramatic stylistic transitions (map → technical cross-section → UI chrome) while maintaining interactive fidelity (text input, date picker, submit). See `prompts/00-vision.md`.

## Your task

Build `apps/examples-eiffel/` — a complete, deployable Next.js 15 app using `@sketchapedia/client-react`. Configure its scene corpus so the canonical user journey runs entirely from a pre-seeded server cache (keeping demo costs low), while still allowing cache-miss paths for novel intents.

## Technical requirements

- Next.js 15 app-router with a single top-level page hosting `<Sketchapedia>`.
- Scene corpus authored in a TS module: `apps/examples-eiffel/scenes/*.ts` using a `defineScene()` helper that calls into the real orchestrator with `--dry-run` to produce the LayoutPlan, then caches artifacts via the CLI's `scene pin` command. Running `pnpm --filter examples-eiffel seed` regenerates the cache for the app.
- Style: hand-drawn illustrative Paris map with warm palette; cross-section with technical-diagram rendering; reservation UI with modern editorial style. Style references pinned in `apps/examples-eiffel/styles/` for IP-Adapter.
- Data: a fake reservation backend `apps/examples-eiffel/api/reservations.ts` that validates submissions and returns confirmation numbers. Real HTTP; not a mock.
- Localized to English + French (proves the locale pipeline).

## Canonical user journey

1. **Landing**: stylized Paris map fills the screen. Interactive regions: Eiffel Tower, Louvre, Montmartre, Seine, Le Jules Verne pin.
2. **Zoom to Eiffel**: click the Eiffel pin → transition clip zooms into a detailed cross-section of the tower with labeled observation decks, the elevator shaft, and the restaurant floor.
3. **Select restaurant**: click "Le Jules Verne" label → transition to a reservation UI with a date picker (`<input type="date">`), party size (`<input type="number">`), seating preference (`<select>`), and occasion (`<textarea>`).
4. **Fill form**: type into the textarea — renders natively thanks to the DOM overlay (prompt 06); date picker opens OS-native.
5. **Submit**: click "Reserve" → intent fires; server confirms; UI transitions to a confirmation scene with booking details and a generative illustration of the table.
6. **Locale switch**: a flag toggle in the corner switches to French; next scene is generated in French (exercises the locale path in prompt 16).

## Implementation mandates

- No dummy content — menu items, prices, timeslots are real (pulled from a static dataset in `apps/examples-eiffel/data/`).
- All form fields have real `autocomplete`, `inputMode`, `pattern` attributes via the DOM overlay.
- Reservation submit validates client-side + server-side; server returns real errors (past date, zero party size, etc.).
- Each scene declares an `ariaSummary` written carefully; screen-reader-only users can complete the flow.
- Every transition < 2s perceived. Cache-miss paths clearly labeled in dev mode.

## Test plan

- Playwright E2E under prompt 25's tests-e2e suite:
  - Golden journey with keyboard only.
  - Journey with pointer.
  - Locale switch mid-journey.
  - Form validation errors displayed correctly.
  - Axe-core clean on every scene.
  - Past date rejected; confirmation number displayed on success.

## Deliverables

- `apps/examples-eiffel/src/*`.
- `apps/examples-eiffel/scenes/*.ts`.
- `apps/examples-eiffel/api/reservations.ts`.
- `apps/examples-eiffel/data/*.json` (menus, timeslots, pricing).
- `apps/examples-eiffel/README.md` with a screenshot series and deploy instructions.

## Acceptance criteria

- Runs against the local dev stack and deployed demo backend.
- Full journey completes in both locales.
- E2E tests green across browsers.
- Lighthouse accessibility score 100 on the landing page and reservation scene.

## Non-goals

- No payment integration.
- No real restaurant partnership; fictitious data.
