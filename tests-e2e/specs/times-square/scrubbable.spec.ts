import { expect, test } from '../../fixtures/index';

test.describe('Times Square — scrubbable era slider', () => {
  test('drag through full range; intermediate frames render and final state matches @light', async ({
    timesSquare,
    identity,
    page,
  }) => {
    await timesSquare.launch({ identity });

    const slider = page.getByRole('slider', { name: /era|decade/i });
    const min = Number(await slider.getAttribute('aria-valuemin'));
    const max = Number(await slider.getAttribute('aria-valuemax'));
    expect(Number.isFinite(min) && Number.isFinite(max) && max > min).toBe(true);

    // Sample frames at min, midpoint, and max — assert distinct frame indices each
    // time, proving the scrubbable primitive's state-driven render really fires.
    const samples: Array<{ value: number; frameIndex: number }> = [];
    for (const value of [min, Math.round((min + max) / 2), max]) {
      await slider.evaluate((el, v) => {
        const range = el as HTMLInputElement;
        range.value = String(v);
        range.dispatchEvent(new Event('input', { bubbles: true }));
        range.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      // The harness exposes the most recent frame index of the era region for tests.
      const frameIndex = await page.evaluate(() => {
        const w = window as unknown as { __SKETCHAPEDIA__?: { metrics: Record<string, unknown> } };
        const m = w.__SKETCHAPEDIA__?.metrics ?? {};
        return Number((m as Record<string, number>)['eraFrameIndex'] ?? -1);
      });
      samples.push({ value, frameIndex });
    }
    // Distinct frame indices for distinct values.
    const indices = new Set(samples.map((s) => s.frameIndex));
    expect(
      indices.size,
      `expected three distinct frame indices, got ${[...indices].join(',')}`,
    ).toBe(3);
    // Final state matches: re-read aria-valuenow.
    expect(await slider.getAttribute('aria-valuenow')).toBe(String(max));
  });

  test('rapid scrub maintains 60fps target without dropping more than 10% of frames @nightly', async ({
    timesSquare,
    identity,
    page,
  }) => {
    await timesSquare.launch({ identity });
    const slider = page.getByRole('slider', { name: /era|decade/i });
    const min = Number(await slider.getAttribute('aria-valuemin'));
    const max = Number(await slider.getAttribute('aria-valuemax'));

    // Drag the slider across the full range in 100ms (synthetic).
    await slider.evaluate(
      (el, { min, max }) => {
        const range = el as HTMLInputElement;
        const start = performance.now();
        let value = min;
        const step = (max - min) / 60;
        function tick() {
          value = Math.min(max, value + step);
          range.value = String(value);
          range.dispatchEvent(new Event('input', { bubbles: true }));
          if (value < max && performance.now() - start < 100) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { min, max },
    );
    await page.waitForTimeout(400);

    const fps = await page.evaluate(() => {
      const m = window.__SKETCHAPEDIA__?.metrics as Record<string, number> | undefined;
      return Number(m?.['scrubFps'] ?? 0);
    });
    expect(fps, 'sustained scrub fps').toBeGreaterThanOrEqual(54); // ≥90% of 60fps
  });
});
