# 32 — Reference App: Project Dashboard & Codebase Architecture

## Project context

This reference app reproduces **Videos 5 & 6** from the user's vision: a complex software-engineering dashboard rendered as a comic-book-style schematic. The user interacts with a "To-Do List Application" schema; clicking "Denormalize Schema" in the action items produces a Before/After diagram visually explaining the database change. Proves Sketchapedia can handle structured UIs (abstract software state represented as intuitive visual metaphors). See `prompts/00-vision.md`.

## Your task

Build `apps/examples-dashboard/` — a Next.js 15 app backed by a real small-scale project management API (Hono service included in-repo). Exercises state-rich scenes with checkbox toggles, status transitions, and complex layouts.

## Technical requirements

- Next.js 15 app + a local Hono service under `apps/examples-dashboard/api/` providing:
  - Projects, tasks, schema diagrams, migrations.
  - SQLite persistence (`better-sqlite3` via Bun).
- Scene corpus designed around a "comic-book schematic" render mode with bold linework, paneling, and labeled arrows — defined as a `renderMode` hint to the LLM + image model.
- Real user accounts via `lucia-auth` or `better-auth`.
- Live-updating via scene state deltas pushed from the server when another user changes a task.

## Canonical user journey

1. Landing: dashboard with three projects as comic-book panels; each panel shows task counts.
2. Click a project → scene transitions to a detailed view with task list (checkboxes), schema preview, migration history.
3. Toggle a task checkbox → state delta sent to server → other tabs receive update via server push → scene re-commits with new state (intent-free update through the same pipeline).
4. Click "Schema" → scene presenting the current schema as a labeled diagram.
5. Click "Action Items" → list including "Denormalize Schema".
6. Click "Denormalize Schema" checkbox → scene transitions to a Before / After schema diagram with arrows showing the change and a "Run migration" button.
7. Click "Run migration" → the server runs a real SQLite migration; the dashboard scene updates to reflect the new schema.

## Implementation mandates

- The SQLite schema is real; the migration genuinely denormalizes a table. The "Before" diagram and "After" diagram reflect true schema states captured programmatically and attached to the scene as `stateSchema`.
- All state changes flow through the protocol's `StateDelta` pipeline.
- Multi-tab sync verified in tests.
- Dashboard is keyboard-operable end to end.

## Test plan

- Playwright E2E:
  - Create project; add task; toggle complete; refresh; state persists.
  - Run "Denormalize Schema" migration; Before/After diagram renders; query schema via API; matches.
  - Two-tab sync: change in tab A visible in tab B within 1s.
  - Auth: logout invalidates session; protected scene inaccessible.
  - Axe-core clean.

## Deliverables

- `apps/examples-dashboard/src/*`.
- `apps/examples-dashboard/api/*` with Hono routes.
- Migrations, fixtures, seeded data.
- `apps/examples-dashboard/README.md`.

## Acceptance criteria

- Full journey works with real persistence and real auth.
- Migration round-trip verified.
- Multi-tab sync works.
- Accessibility perfect.

## Non-goals

- Not a real competitor to Jira/Linear; minimal feature set.
- No billing.
