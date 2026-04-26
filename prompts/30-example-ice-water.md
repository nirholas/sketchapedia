# 30 — Reference App: Why Does Ice Float? (Phase Transition + Hydrogen Bonds)

## Project context

This reference app reproduces **Videos 2 and 3** from the user's vision: an educational diagram of liquid water vs. solid ice at the molecular level. User interaction morphs the stylized 2D infographic into photorealistic cinematic forest/water footage; clicking a specific explanatory box causes the page to fluidly redesign itself to explain "Expansion Upon Freezing" with new charts and beakers. See `prompts/00-vision.md`.

## Your task

Build `apps/examples-ice-water/` — a Next.js 15 educational experience using `@sketchapedia/client-react`. Demonstrates the dramatic stylistic transition (diagram ↔ photorealistic) that is uniquely Sketchapedia's.

## Technical requirements

- Next.js 15 app-router.
- Scene corpus authored in `apps/examples-ice-water/scenes/*.ts`.
- **Three rendering modes used across scenes** (from the `LayoutPlan.imageStyle.renderMode` enum):
  - `technical-diagram` for molecular views.
  - `cinematic` / `photoreal` for forest and water footage.
  - `illustration` for transitional explanatory cards.
- **Scrubbable primitive** (prompt 12) optional for a slider that morphs temperature from liquid to ice state — demonstrates the tech within an educational UX.

## Canonical user journey

1. **Landing**: "Why Does Ice Float?" title over a diagram of H₂O molecules in liquid form, slowly vibrating.
2. **Reveal ice structure**: click "Show frozen state" → transition to a hexagonal lattice diagram; the new layout uses increased whitespace to emphasize the structure.
3. **Photorealistic context**: click "See it in nature" → the diagram dissolves into a cinematic shot of a lake surface with floating ice — same content, radically different rendering mode.
4. **Return to explanation**: click "Explain the physics" → transitions back to illustrated mode with a "Fetching information..." tooltip (per Video 3) showing generation progress; resolves into an "Expansion Upon Freezing" page with new charts (two beakers showing water volume before/after freezing, with labeled arrows).
5. **Hydrogen bond geometry**: click a region labeled "hexagonal crystal symmetry" → a new layout focused on bond angles with interactive highlighting.
6. **Temperature scrubber**: drag a slider from 20°C to -10°C; molecular arrangement updates in real time (pre-generated frame sequence via prompt 12).

## Implementation mandates

- Educational content is accurate — sourced from referenced materials; a `REFERENCES.md` lists sources for every claim.
- Each scene's `ariaSummary` is a full textual description sufficient for a blind student to learn the same content.
- The temperature scrubber has a real `<input type="range">` with fine keyboard control (arrow = 1°C, shift+arrow = 5°C).
- Generative imagery pre-generated and pinned in the server cache; cache-miss paths exist for custom queries.
- Prefers-reduced-motion: disables the scrubber's flow-warp animation and uses static frames at fixed stops.

## Test plan

- Playwright E2E:
  - Complete journey via pointer.
  - Complete journey via keyboard only.
  - Scrubber: move through 5 temperature stops; assert state updates and molecular imagery changes.
  - Screen reader: assert each scene's `ariaSummary` is announced and contains expected keywords.
  - Axe-core clean.

## Deliverables

- `apps/examples-ice-water/src/*`.
- Scene corpus + cached artifacts.
- `apps/examples-ice-water/REFERENCES.md`.
- Temperature scrubber frame sequence pre-generated.

## Acceptance criteria

- Journey completes in < 25s with warm cache.
- All transitions perceptually smooth.
- Accessibility Lighthouse score 100.
- Scrubbable temperature renders 60fps.

## Non-goals

- Not a full physics simulator; use pre-computed imagery.
- No quiz / assessment features.
