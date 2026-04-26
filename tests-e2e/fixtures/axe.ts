import AxeBuilder from '@axe-core/playwright';
import { type Page, expect } from '@playwright/test';

const CORE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

export type AxeOptions = {
  includeTags?: readonly string[];
  excludeSelectors?: readonly string[];
  disableRules?: readonly string[];
};

export async function expectNoAxeViolations(page: Page, opts: AxeOptions = {}): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags([...(opts.includeTags ?? CORE_TAGS)]);
  for (const selector of opts.excludeSelectors ?? []) builder.exclude(selector);
  if (opts.disableRules && opts.disableRules.length > 0)
    builder.disableRules([...opts.disableRules]);

  const { violations } = await builder.analyze();
  if (violations.length > 0) {
    const summary = violations
      .map((v) => {
        const nodes = v.nodes
          .map((n) => `\n    - ${n.target.join(' ')}: ${n.failureSummary ?? ''}`)
          .join('');
        return `  [${v.impact ?? 'unknown'}] ${v.id} — ${v.help}${nodes}`;
      })
      .join('\n');
    // Playwright pretty-prints this error in the trace.
    expect(violations, `axe-core violations:\n${summary}`).toEqual([]);
  }
}
