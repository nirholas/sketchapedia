import { defineConfig, devices } from '@playwright/test';

import { environment } from './fixtures/environment';

const isCi = Boolean(process.env['CI']);
const profile = (process.env['E2E_PROFILE'] ?? 'light') as 'light' | 'nightly' | 'weekend';

const baseUse = {
  baseURL: environment.appUrls.eiffel,
  trace: 'retain-on-failure',
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
  actionTimeout: 10_000,
  navigationTimeout: 30_000,
} as const;

const chromium = devices['Desktop Chrome'];
const firefox = devices['Desktop Firefox'];
const webkit = devices['Desktop Safari'];

const projects: NonNullable<Parameters<typeof defineConfig>[0]['projects']> = [
  { name: 'chromium', use: { ...chromium, ...baseUse } },
  { name: 'firefox', use: { ...firefox, ...baseUse } },
  { name: 'webkit', use: { ...webkit, ...baseUse } },
  {
    name: 'chromium-reduced-motion',
    use: { ...chromium, ...baseUse, reducedMotion: 'reduce' },
    grep: /@reduced-motion/,
  },
  {
    name: 'chromium-forced-colors',
    use: { ...chromium, ...baseUse, forcedColors: 'active', colorScheme: 'dark' },
    grep: /@forced-colors/,
  },
];

const profileGrep: Record<string, RegExp | undefined> = {
  light: /@light/,
  nightly: /@nightly|@memory|@visual/,
  weekend: /@light|@nightly|@webkit-full/,
};

export default defineConfig({
  testDir: './specs',
  testMatch: /.*\.spec\.ts$/,
  // A single scene commit can take several seconds on cache-miss paths; tests touch
  // multiple commits and often the network.
  timeout: profile === 'nightly' ? 120_000 : 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: isCi,
  // Retries are disabled except for specific quarantined network-flake cases.
  // A test flagged with @retry-on-429 opts in via test.describe.configure in its spec.
  retries: 0,
  workers: isCi ? 4 : undefined,
  reporter: isCi
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'playwright-report/junit.xml' }],
        ['github'],
      ]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  grep: profileGrep[profile],
  use: baseUse,
  projects:
    profile === 'nightly' ? projects.filter((p) => p.name.startsWith('chromium')) : projects,
});
