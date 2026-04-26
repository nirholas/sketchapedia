import type { Page } from '@playwright/test';

import type { Announcement } from './test-hooks';

/**
 * Subscribe to the a11y orchestrator's live-region announcements. Captures any
 * events fired while `fn` runs. Returns the accumulated announcements.
 *
 * This is a belt-and-braces check on top of the live DOM — the harness's own
 * `announcements` array is the authoritative buffer, but we also listen on the
 * polite/assertive live-region text content mutations to catch cases where the
 * harness accidentally stops pushing.
 */
export async function captureAnnouncements<T>(
  page: Page,
  fn: () => Promise<T>,
): Promise<{ result: T; announcements: Announcement[] }> {
  await page.evaluate(() => {
    const w = window as unknown as { __e2e_announcementSink?: Announcement[] };
    w.__e2e_announcementSink = [];
    const polite = document.querySelector('[data-sketchapedia-live="polite"]');
    const assertive = document.querySelector('[data-sketchapedia-live="assertive"]');
    const record = (level: 'polite' | 'assertive') => (text: string) => {
      if (!text) return;
      w.__e2e_announcementSink?.push({ text, level, at: performance.now() });
    };
    if (polite) {
      const obs = new MutationObserver(() => record('polite')(polite.textContent ?? ''));
      obs.observe(polite, { childList: true, characterData: true, subtree: true });
    }
    if (assertive) {
      const obs = new MutationObserver(() => record('assertive')(assertive.textContent ?? ''));
      obs.observe(assertive, { childList: true, characterData: true, subtree: true });
    }
  });

  const result = await fn();

  const domAnnouncements = await page.evaluate(
    () =>
      (window as unknown as { __e2e_announcementSink?: Announcement[] }).__e2e_announcementSink ??
      [],
  );
  const harnessAnnouncements = await page.evaluate(() =>
    Array.from(window.__SKETCHAPEDIA__?.announcements ?? []),
  );
  // Merge and dedupe by (text, level) within a 500ms window to avoid screen-reader
  // spam artifacts — see a11y orchestrator's 300ms dedupe rule.
  const merged: Announcement[] = [];
  for (const a of [...harnessAnnouncements, ...domAnnouncements]) {
    const dup = merged.find(
      (m) => m.text === a.text && m.level === a.level && Math.abs(m.at - a.at) < 500,
    );
    if (!dup) merged.push(a);
  }
  return { result, announcements: merged };
}
