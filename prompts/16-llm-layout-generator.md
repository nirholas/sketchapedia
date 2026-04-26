# 16 — LLM Layout Generator

## Project context

The LLM is Sketchapedia's "art director + information architect." Given a user intent + previous scene context, it emits a structured plan: a layout spec with bounding boxes, semantic labels, an accessibility summary, the image prompt for the image model, and optionally a video-morph prompt. Its output is schema-constrained so downstream steps (prompts 17, 18, 19) can consume it deterministically. See `prompts/00-vision.md`.

## Your task

Implement `packages/model-llm/` — a service that wraps a frontier LLM (Anthropic Claude as primary; pluggable) with tool-use / structured-output to emit a validated `LayoutPlan`. Handles prompt templating, output schema enforcement, retry with repair, and per-tenant content policy.

## Technical requirements

- Primary model: **Anthropic Claude** (`claude-opus-4-7` as default; configurable). Use the Anthropic SDK (`@anthropic-ai/sdk`) with **prompt caching** (ephemeral cache_control on the system prompt + examples) for cost efficiency.
- Secondary/pluggable adapters: OpenAI (`gpt-4.1`), Google (`gemini-2.5-pro`) — gated behind a `LlmProvider` interface with full feature parity where possible.
- **Structured output**: Anthropic tool use with a `emit_layout_plan` tool whose input schema is the full `LayoutPlan` Zod schema. OpenAI adapter uses its structured outputs; Google uses its schema mode.
- **Prompt caching**: system prompt + few-shot examples placed in a cache-control block; 90 %+ cache hit rate expected under steady workload.
- **Thinking** (Claude extended thinking): enabled for non-trivial intents, budget ~1024 tokens; disabled for simple state updates.
- **Streaming**: progress events emitted while the LLM streams; final validated plan returned on completion.
- **Locale**: plan output respects the user's locale declared in the request.

## LayoutPlan schema (additions/refinements to protocol)

```ts
const LayoutPlan = z.object({
  sceneId: z.string().optional(), // filled by orchestrator after derivation
  keyframeSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  imagePrompt: z.string().min(10).max(2000),
  imageStyle: z.object({
    reference: z.string().optional(),          // URL of reference image for style continuity
    paletteHints: z.array(z.string()).max(10),
    renderMode: z.enum(["illustration", "photoreal", "comic", "isometric", "technical-diagram", "cinematic"])
  }),
  hitmapDraft: z.object({
    items: z.array(HitmapItemSchema).max(50),
    coordinateSpace: z.literal("keyframe")
  }),
  stateSchema: z.custom<JsonSchema>(),
  ariaSummary: z.string().min(5).max(280),
  transition: z.object({
    prompt: z.string().max(500).optional(),
    semanticHint: z.enum(["zoom-in", "zoom-out", "crossfade", "morph", "redraw"]).optional()
  }).optional(),
  generativeAudio: z.object({
    prompt: z.string().max(300).optional()
  }).optional()
});
```

## Public API

```ts
interface LlmService {
  generatePlan(input: LlmInput): AsyncIterable<LlmEvent>;
  explainPlan(plan: LayoutPlan): Promise<string>; // for debugging / inspector
}

type LlmInput = {
  intent: { name: string; payload: JsonValue };
  previousSceneSummary: string;           // plain-text summary of current scene
  previousKeyframeDescription: string;    // caption of current keyframe (produced by a small captioner)
  stateDelta: JsonPatchOp[];
  viewport: { width: number; height: number };
  locale: string;
  tenantContext: { styleGuide?: string; contentPolicy: ContentPolicy };
};

type LlmEvent =
  | { type: "progress"; message: string; percent: number }
  | { type: "thinking"; preview: string }
  | { type: "partial"; json: unknown }
  | { type: "done"; plan: LayoutPlan; usage: UsageMetadata }
  | { type: "error"; error: LlmError };
```

## Prompt architecture

- **System prompt** (cached): describes the SDK, the `LayoutPlan` schema, layout principles (readability, ARIA correctness, hitmap-pixel alignment tips), content policy.
- **Few-shot examples** (cached): 4-6 high-quality input→plan pairs covering illustration, diagram, form, dashboard, scrubbable.
- **Developer message** (cached per tenant): tenant style guide.
- **User message**: current intent + state context.

## Implementation mandates

- Schema-validated output; on validation failure, retry once with a "repair" message containing Zod issues; fail with `LlmError { code: INVALID_OUTPUT }` on second failure.
- Token budget per call logged; cost estimated per tenant and reported to observability.
- Content policy applied pre-call (reject disallowed intents) and post-call (scan `imagePrompt` for policy violations).
- No user text ever passed raw into the prompt without being wrapped in a quoted, role-tagged block to reduce injection surface.
- Structured logging of every call with request id, cache-hit rate, thinking budget consumed, output usage.
- Adapters isolate SDK differences behind `LlmProvider`; swap providers via config.

## Test plan

- Real Anthropic API in CI behind a secret; deterministic seed not guaranteed but plans must validate. Multiple runs per fixture prove convergence.
- Golden input fixtures: 20 intents spanning every `renderMode`. Verify:
  - Output validates against schema.
  - `hitmapDraft.items` are within keyframe bounds.
  - `ariaSummary` length within bounds.
  - No disallowed content keywords.
- Repair retry: feed a forced-invalid first response (via SDK test hook) and assert the repair pass succeeds.
- Prompt injection red-team: a suite of adversarial user payloads (role override, exfiltration attempts, prompt extraction); all must be refused or neutralized per policy.
- Cost regression: total token usage per fixture tracked over time to detect prompt bloat.

## Deliverables

- `packages/model-llm/src/{service.ts, providers/{anthropic,openai,google}.ts, prompts/*.ts, schema.ts, policy.ts, types.ts}`.
- Fixtures + tests.
- `packages/model-llm/README.md` with prompt engineering notes + cost dashboard link.

## Acceptance criteria

- All 20 golden fixtures produce valid plans on first call ≥ 80% of the time; repair pass covers the remaining 20%.
- Red-team suite: all adversarial inputs refused.
- Cache-hit rate on system prompt ≥ 90% under steady workload.
- Adapter swap (Anthropic → OpenAI) passes the same fixtures with equivalent schema validity.

## Non-goals

- No image generation (prompt 17).
- No video generation (prompt 18).
- No persistence (prompt 20).
