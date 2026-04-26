import { z } from 'zod';

const urlSchema = z.string().url();
const optionalUrl = urlSchema.optional();

const schema = z.object({
  gatewayHttpUrl: urlSchema.describe('HTTP base URL of the WS gateway, e.g. http://gateway:8080'),
  gatewayWsUrl: urlSchema.describe('WS endpoint used by the client, e.g. ws://gateway:8080/ws'),
  cacheAdminUrl: urlSchema.describe('HTTP base URL of the cache-server admin API'),
  collectorUrl: optionalUrl.describe('OTLP collector base URL (for log/metric assertions)'),
  minioUrl: optionalUrl,
  redisUrl: z.string().optional(),
  appUrls: z.object({
    eiffel: urlSchema,
    iceWater: urlSchema,
    timesSquare: urlSchema,
    dashboard: urlSchema,
  }),
  tenant: z.object({
    id: z.string().min(1),
    userId: z.string().min(1),
    roles: z.array(z.string()).default(['user']),
  }),
  jwt: z.object({
    // One of these must be present. If token is provided, signing keys are optional.
    token: z.string().optional(),
    privateKeyPem: z.string().optional(),
    publicKeyPem: z.string().optional(),
    issuer: z.string().default('sketchapedia-test'),
    audience: z.string().default('sketchapedia-gateway'),
  }),
  profile: z.enum(['light', 'nightly', 'weekend']).default('light'),
  includeQuarantined: z.boolean().default(false),
});

export type E2eEnvironment = z.infer<typeof schema>;

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function required(name: string, fallback?: string): string {
  const v = env(name, fallback);
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export function loadEnvironment(): E2eEnvironment {
  return schema.parse({
    gatewayHttpUrl: required('E2E_GATEWAY_HTTP_URL', 'http://localhost:8080'),
    gatewayWsUrl: required('E2E_GATEWAY_WS_URL', 'ws://localhost:8080/ws'),
    cacheAdminUrl: required('E2E_CACHE_ADMIN_URL', 'http://localhost:8090'),
    collectorUrl: env('E2E_COLLECTOR_URL'),
    minioUrl: env('E2E_MINIO_URL'),
    redisUrl: env('E2E_REDIS_URL'),
    appUrls: {
      eiffel: required('E2E_EIFFEL_URL', 'http://localhost:3001'),
      iceWater: required('E2E_ICE_WATER_URL', 'http://localhost:3002'),
      timesSquare: required('E2E_TIMES_SQUARE_URL', 'http://localhost:3003'),
      dashboard: required('E2E_DASHBOARD_URL', 'http://localhost:3004'),
    },
    tenant: {
      id: required('E2E_TENANT_ID', 'tenant-e2e'),
      userId: required('E2E_USER_ID', 'user-e2e'),
      roles: (env('E2E_USER_ROLES') ?? 'user')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    jwt: {
      token: env('E2E_JWT'),
      privateKeyPem: env('E2E_JWT_PRIVATE_KEY_PEM'),
      publicKeyPem: env('E2E_JWT_PUBLIC_KEY_PEM'),
      issuer: env('E2E_JWT_ISSUER', 'sketchapedia-test'),
      audience: env('E2E_JWT_AUDIENCE', 'sketchapedia-gateway'),
    },
    profile: (env('E2E_PROFILE', 'light') as E2eEnvironment['profile']) ?? 'light',
    includeQuarantined: env('E2E_INCLUDE_QUARANTINED') === '1',
  });
}

export const environment = loadEnvironment();
