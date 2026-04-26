import { SignJWT, importPKCS8 } from 'jose';

import { environment } from './environment';

export type TenantIdentity = {
  tenantId: string;
  userId: string;
  roles: readonly string[];
  jwt: string;
};

export type MintOverrides = Partial<{
  tenantId: string;
  userId: string;
  roles: readonly string[];
  // Seconds-from-now at which the token should expire. Defaults to 1 hour.
  expiresIn: number;
  // Deliberate corruption for the authentication spec.
  invalid: 'expired' | 'unsigned' | 'garbage';
}>;

async function signRs256(claims: Record<string, unknown>, expiresIn: number): Promise<string> {
  const pem = environment.jwt.privateKeyPem;
  if (!pem) {
    throw new Error(
      'Cannot mint JWTs: E2E_JWT_PRIVATE_KEY_PEM not set. Either set it or pass E2E_JWT (precomputed).',
    );
  }
  const key = await importPKCS8(pem, 'RS256');
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .setIssuer(environment.jwt.issuer)
    .setAudience(environment.jwt.audience)
    .sign(key);
}

export async function mintIdentity(overrides: MintOverrides = {}): Promise<TenantIdentity> {
  const tenantId = overrides.tenantId ?? environment.tenant.id;
  const userId = overrides.userId ?? environment.tenant.userId;
  const roles = overrides.roles ?? environment.tenant.roles;
  const expiresIn = overrides.expiresIn ?? 3600;

  if (overrides.invalid === 'garbage') {
    return { tenantId, userId, roles, jwt: 'this-is-not-a-jwt.at-all.xyz' };
  }
  if (overrides.invalid === 'unsigned') {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: userId, tid: tenantId })).toString(
      'base64url',
    );
    return { tenantId, userId, roles, jwt: `${header}.${payload}.` };
  }

  if (environment.jwt.token && !overrides.invalid) {
    return { tenantId, userId, roles, jwt: environment.jwt.token };
  }

  const effectiveExp = overrides.invalid === 'expired' ? -60 : expiresIn;
  const jwt = await signRs256(
    {
      sub: userId,
      tid: tenantId,
      roles,
      quotas: { intentsPerMinute: 600 },
    },
    effectiveExp,
  );
  return { tenantId, userId, roles, jwt };
}
