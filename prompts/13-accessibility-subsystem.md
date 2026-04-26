# 13 — Accessibility Subsystem

## Project context

Sketchapedia's UI is generated imagery. Screen readers, voice-control software, keyboard users, magnifiers, and switch-access devices cannot parse a canvas. The only way Sketchapedia is shippable to the public is by making the DOM overlay (prompt 06) a **truly first-class accessibility surface** — not an afterthought. This subsystem orchestrates ARIA semantics across scenes, manages live announcements, coordinates focus across scene transitions, and provides developer escape hatches for complex widgets. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/a11y/` — the accessibility orchestrator. It consumes scene metadata, augments the DOM overlay's ARIA markup, manages a live-region announcement queue, builds an accessible tree for screen-reader validation, and provides hooks for high-contrast + forced-colors modes.

## Technical requirements

- **Scene summaries**: every committed scene has an `ariaSummary` (from protocol). On commit, this is announced via a `polite` live region. Rapid consecutive commits coalesce into one announcement.
- **Focus transitions**: on scene commit, focus policy is:
  1. If incoming scene declares `autofocusId` → focus that element.
  2. Else if previous focused item's `id` exists in the new hitmap → preserve focus.
  3. Else → focus the scene container with `aria-label` set to `ariaSummary` so the user knows the UI changed.
- **Modal scenes**: scenes can declare `modal: true`, which establishes a focus trap (Tab/Shift+Tab cycle within scene items) and sets `inert` on all surrounding page content.
- **Landmark regions**: hitmap items with `role: "navigation" | "main" | "complementary" | "contentinfo"` are converted to HTML5 landmark elements in the overlay rather than `<div role="...">`.
- **Form semantics**: groups of form fields with `groupId` become `<fieldset>` with `<legend>` (the group's `ariaLabel`).
- **Error messaging**: per-field errors rendered as `aria-describedby` referencing a visually-hidden `<span>` populated from scene state.
- **Forced colors**: detect `prefers-contrast: more` and `forced-colors: active`; emit a CSS class on the host; scene generator is informed via a client hint so it can request a high-contrast rendering on the next intent.
- **Reduced motion**: `prefers-reduced-motion: reduce` detected; transitions degrade to instant crossfades; effects layer told to reduce amplitude.
- **Reader-only text**: decorative-only scene elements annotated with `aria-hidden="true"`; informative-only regions with no visible decoration get a visually-hidden `<span>` rendering the label as text.

## Public API

```ts
interface A11yOrchestrator {
  mount(overlay: DomOverlay, router: SceneRouter): Disposable;
  announce(message: string, level?: "polite" | "assertive"): void;
  trapFocusWithin(regionId: string | null): void; // null releases
  setForcedColorsMode(enabled: boolean): void;
  getAccessibleTree(): AccessibleNode;            // used by prompt 23 devtools
}

type AccessibleNode = {
  role: string;
  name: string;
  description?: string;
  children: AccessibleNode[];
  states: Record<string, string | boolean | number>;
};
```

## Implementation mandates

- The live region is a single `<div>` pair (`polite` + `assertive`) added at document body; multiple instances are idempotent.
- Announcements de-duplicate within 300ms (screen readers spam if fed identical text rapidly).
- Focus trap uses the standard tabbable-elements query (`focusable-selectors`) plus a listener on `focusin` to force focus back inside when it escapes.
- Scene commits issue a single `aria-busy="true"` on the root during generation, cleared on commit — screen readers respect this to avoid reading incomplete UIs.
- `getAccessibleTree` walks the overlay and reports role, accessible name, state — matches closely what Chromium's accessibility inspector shows.
- All `aria-*` attributes are typed via a branded enum set — no stringly-typed ARIA.

## Test plan

- `axe-core` integration in every Playwright test for reference apps; zero violations allowed.
- Screen reader output parity:
  - Use **assistive-webdriver** or a headless NVDA driver (available on Windows CI) to record announcements.
  - For macOS, use VoiceOver driven via AppleScript in CI (optional; critical cases covered at a minimum).
- Keyboard-only flow for each reference app: navigate, interact, submit, tab cycle — all achievable without a pointer.
- Focus-trap test: modal scene; Tab cycles within trapped region; Esc fires the declared `dismissIntent`.
- Live region: announce "Scene changed to X"; screen reader announcement matches within 1s.

## Deliverables

- `packages/client-core/src/a11y/{orchestrator.ts, announcer.ts, focus-trap.ts, tree.ts, preferences.ts, types.ts}`.
- Tests (including CI integration with `@axe-core/playwright`).
- `packages/client-core/README-a11y.md` — developer guide: how to write a scene that screen-reader users can comfortably consume.

## Acceptance criteria

- `axe-core` reports zero violations on every reference app.
- All reference apps can be completed keyboard-only.
- NVDA (or VoiceOver) announces scene changes within 1s of commit.
- Focus traps correctly in modal scenes.

## Non-goals

- No AI-generated alternative descriptions (future; scene generator provides `ariaSummary` and per-item labels).
- No voice-control-specific grammars — using standard ARIA is sufficient.
