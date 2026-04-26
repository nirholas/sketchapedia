import { test as base } from '@playwright/test';

import { isQuarantined } from '../utils/quarantine';
import { AppHarness, type ReferenceAppId } from './app';
import { environment } from './environment';
import { type TenantIdentity, mintIdentity } from './tenant';

type AppFactory = (appId: ReferenceAppId) => AppHarness;

type Fixtures = {
  identity: TenantIdentity;
  app: AppFactory;
  eiffel: AppHarness;
  iceWater: AppHarness;
  timesSquare: AppHarness;
  dashboard: AppHarness;
};

export const test = base.extend<Fixtures>({
  // Each test gets its own identity so parallel runs do not cross tenants.
  identity: async ({}, use, testInfo) => {
    const identity = await mintIdentity({
      userId: `${environment.tenant.userId}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`,
    });
    await use(identity);
  },

  app: async ({ context, page }, use) => {
    const factory: AppFactory = (appId) => new AppHarness(page, context, appId);
    await use(factory);
  },

  // Convenience fixtures that scope a harness to a particular reference app.
  eiffel: async ({ app }, use) => {
    await use(app('eiffel'));
  },
  iceWater: async ({ app }, use) => {
    await use(app('ice-water'));
  },
  timesSquare: async ({ app }, use) => {
    await use(app('times-square'));
  },
  dashboard: async ({ app }, use) => {
    await use(app('dashboard'));
  },

  // Respect the quarantine list: a test whose title matches a quarantined entry
  // is skipped unless E2E_INCLUDE_QUARANTINED=1. Deterministic, no retries.
  page: async ({ page }, use, testInfo) => {
    const q = isQuarantined(testInfo.titlePath.join(' > '));
    if (q && !environment.includeQuarantined) {
      testInfo.skip(true, `quarantined: ${q.reason} (owner=${q.owner}, expires=${q.expires})`);
    }
    await use(page);
  },
});

export { expect } from '@playwright/test';
export { environment } from './environment';
export type { TenantIdentity } from './tenant';
export type { ReferenceAppId } from './app';
