import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const entrySchema = z.object({
  match: z.string().describe('Substring match against the Playwright test title path.'),
  reason: z.string(),
  owner: z.string(),
  // ISO date — hard stop; after this date the quarantine entry is considered
  // expired and the test runs again. Keeps the list from rotting.
  expires: z.string(),
});

const fileSchema = z.object({
  entries: z.array(entrySchema).default([]),
});

export type QuarantineEntry = z.infer<typeof entrySchema>;

function loadQuarantine(): QuarantineEntry[] {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const file = resolve(here, '..', 'quarantine.json');
    const parsed = fileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const today = new Date().toISOString().slice(0, 10);
    return parsed.entries.filter((e) => e.expires >= today);
  } catch {
    return [];
  }
}

const ENTRIES = loadQuarantine();

export function isQuarantined(titlePath: string): QuarantineEntry | null {
  return ENTRIES.find((e) => titlePath.includes(e.match)) ?? null;
}
