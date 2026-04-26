/**
 * Contract for the in-page test harness the client-react runtime exposes when
 * launched with `?e2e=1` or with `SKETCHAPEDIA_E2E=1`. See prompts 07 (router),
 * 08 (client cache), 13 (a11y), 10 (react bindings), 06 (overlay).
 *
 * This is evaluated in the browser context via page.evaluate; types live here.
 */

export type SceneCommitRecord = {
  sceneId: string;
  sceneKey: string;
  ariaSummary: string;
  cacheHit: boolean;
  committedAt: number;
  durationMs: number;
  locale: string;
};

export type Announcement = {
  text: string;
  level: 'polite' | 'assertive';
  at: number;
};

export type IntentRecord = {
  type: string;
  payload: unknown;
  sentAt: number;
  sceneIdAtDispatch: string;
};

export type HitmapProbe = {
  itemId: string | null;
  role: string | null;
  label: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
};

export type HarnessMetrics = {
  scenesCommitted: number;
  lastCacheHit: boolean;
  lastCommitDurationMs: number;
  // V8/Chromium only. undefined on WebKit/Firefox.
  jsHeapUsedBytes?: number;
};

export type SketchapediaHarness = {
  readonly version: string;
  readonly sessionId: string;
  readonly currentScene: SceneCommitRecord | null;
  readonly committedScenes: readonly SceneCommitRecord[];
  readonly announcements: readonly Announcement[];
  readonly intents: readonly IntentRecord[];
  readonly metrics: HarnessMetrics;

  /** Resolves on the next scene commit matching `predicate` (or any if omitted). */
  waitForSceneCommit(
    predicate?: (s: SceneCommitRecord) => boolean,
    timeoutMs?: number,
  ): Promise<SceneCommitRecord>;
  /** Hitmap probe at viewport-relative coordinates. */
  hitmapAt(x: number, y: number): HitmapProbe;
  /** Clear the IndexedDB-backed client cache. */
  clearClientCache(): Promise<void>;
  /** Force a locale switch; the next intent carries the new locale. */
  setLocale(locale: string): void;
  /** Produce an error on the next scene commit for the error-recovery test. */
  injectServerErrorOnce(): void;
  /** Snapshot of the overlay's accessible tree (see a11y orchestrator). */
  getAccessibleTree(): unknown;
};

declare global {
  interface Window {
    __SKETCHAPEDIA__?: SketchapediaHarness;
  }
}
