#!/usr/bin/env tsx
/**
 * Seeds the cache-server with fixture scenes for each reference app so the
 * light-profile CI runs hit the cache instead of paying for a real model
 * round-trip. The fixtures are JSON bundles committed under
 * `tests-e2e/stack/fixtures/<app>/*.json`. Each bundle is a pre-rendered
 * LayoutPlan + artifact references with deterministic sceneKeys.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { request } from 'undici';
import { z } from 'zod';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = resolve(HERE, 'fixtures');

const bundleSchema = z.object({
  sceneKey: z.string(),
  tenantId: z.string(),
  appId: z.enum(['eiffel', 'ice-water', 'times-square', 'dashboard']),
  layoutPlan: z.unknown(),
  artifacts: z
    .array(z.object({ contentHash: z.string(), mime: z.string(), url: z.string() }))
    .default([]),
});

type Bundle = z.infer<typeof bundleSchema>;

function listFixtureFiles(root: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(root)) {
      const p = join(root, entry);
      if (statSync(p).isDirectory()) out.push(...listFixtureFiles(p));
      else if (entry.endsWith('.json')) out.push(p);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return out;
}

async function postBundle(adminUrl: string, adminToken: string, bundle: Bundle): Promise<void> {
  const res = await request(`${adminUrl}/admin/cache/seed`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(bundle),
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`seed ${bundle.sceneKey} failed: HTTP ${res.statusCode} — ${body}`);
  }
}

async function main(): Promise<void> {
  const adminUrl = process.env['E2E_CACHE_ADMIN_URL'] ?? 'http://localhost:8090';
  const adminToken = process.env['E2E_CACHE_ADMIN_TOKEN'] ?? 'e2e-admin';

  const files = listFixtureFiles(FIXTURES_ROOT);
  if (files.length === 0) {
    console.warn(`No fixture bundles found under ${FIXTURES_ROOT}. Nothing to seed.`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const file of files) {
    let bundle: Bundle;
    try {
      bundle = bundleSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    } catch (err) {
      console.error(`[seed] skipping invalid bundle ${file}: ${(err as Error).message}`);
      failed += 1;
      continue;
    }
    try {
      await postBundle(adminUrl, adminToken, bundle);
      ok += 1;
      console.log(`[seed] ok ${bundle.appId}/${bundle.sceneKey}`);
    } catch (err) {
      failed += 1;
      console.error(`[seed] ${(err as Error).message}`);
    }
  }
  console.log(`[seed] done — ${ok} ok, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
