import { request } from 'undici';

import { environment } from './environment';
import type { TenantIdentity } from './tenant';

export type SeededScene = {
  sceneKey: string;
  appId: 'eiffel' | 'ice-water' | 'times-square' | 'dashboard';
  fixturePath: string;
};

/**
 * POST to the cache-server admin API to confirm the expected fixtures are warm.
 * Returns the server's inventory so individual tests can assert their preconditions
 * (and skip with a clear diagnostic if a fixture isn't seeded).
 */
export async function describeSeededCache(identity: TenantIdentity): Promise<{
  tenantId: string;
  scenes: Array<{ sceneKey: string; sizeBytes: number; hitCount: number }>;
}> {
  const res = await request(`${environment.cacheAdminUrl}/admin/cache/describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${identity.jwt}` },
    body: JSON.stringify({ tenantId: identity.tenantId }),
  });
  if (res.statusCode !== 200) {
    throw new Error(`cache describe failed: HTTP ${res.statusCode}`);
  }
  return (await res.body.json()) as {
    tenantId: string;
    scenes: Array<{ sceneKey: string; sizeBytes: number; hitCount: number }>;
  };
}

/**
 * Purge the tenant's cache on the server. Used by the cache-miss stress tests so
 * the next intent forces a real model round-trip. Nightly-only profile.
 */
export async function purgeServerCache(identity: TenantIdentity): Promise<void> {
  const res = await request(`${environment.cacheAdminUrl}/admin/cache/purge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${identity.jwt}` },
    body: JSON.stringify({ tenantId: identity.tenantId }),
  });
  if (res.statusCode !== 204 && res.statusCode !== 200) {
    throw new Error(`cache purge failed: HTTP ${res.statusCode}`);
  }
}
