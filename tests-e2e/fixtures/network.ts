import type { BrowserContext, CDPSession, Page } from '@playwright/test';

/**
 * Chromium-only network conditions helpers via the Chrome DevTools Protocol.
 * Firefox / WebKit fall back to route-level blocking (good enough for resilience
 * tests — we can't set real latency but we can deny all network).
 */

async function openCdp(context: BrowserContext, page: Page): Promise<CDPSession | null> {
  try {
    return await context.newCDPSession(page);
  } catch {
    return null;
  }
}

export async function setOffline(page: Page): Promise<() => Promise<void>> {
  const context = page.context();
  const cdp = await openCdp(context, page);

  if (cdp) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    return async () => {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp.detach();
    };
  }

  // Fallback: route-level abort. Restores on disposal.
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  return async () => {
    await context.unroute('**/*');
  };
}

/** Throttle network to simulate a mobile/3G link. Chromium only; no-op elsewhere. */
export async function setThrottled(
  page: Page,
  opts: { latencyMs: number; downKbps: number; upKbps: number },
): Promise<() => Promise<void>> {
  const cdp = await openCdp(page.context(), page);
  if (!cdp) return async () => {};
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: opts.latencyMs,
    downloadThroughput: (opts.downKbps * 1024) / 8,
    uploadThroughput: (opts.upKbps * 1024) / 8,
  });
  return async () => {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await cdp.detach();
  };
}
