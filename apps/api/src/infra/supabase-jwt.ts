import { verify, decode } from 'hono/jwt';

/**
 * Supabase JWT verification, pinned to the configured project.
 *
 * Security invariants:
 *  - The JWKS URL derives ONLY from the configured `SUPABASE_URL`; the token's
 *    own `iss` claim is attacker-controlled before verification and is never
 *    used to select keys.
 *  - After signature verification the payload must carry the exact expected
 *    issuer (`<SUPABASE_URL>/auth/v1`) and the `authenticated` audience.
 *  - Keys are cached per-isolate by trusted issuer + `kid`.
 */

export type SupabaseJwtEnv = {
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  ENVIRONMENT?: string;
};

const keyCache = new Map<string, CryptoKey>();

/** Test hook: clear the per-isolate key cache. */
export function clearJwtKeyCache(): void {
  keyCache.clear();
}

export function expectedSupabaseIssuer(env: SupabaseJwtEnv): string {
  const base = (env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('SUPABASE_URL is not configured; cannot verify tokens');
  }
  return `${base}/auth/v1`;
}

/** Reject unless the verified payload carries the trusted issuer + audience. */
export function assertTrustedClaims(payload: any, expectedIssuer: string): any {
  if (payload?.iss !== expectedIssuer) {
    throw new Error('Token issuer is not trusted');
  }
  const aud = payload?.aud;
  const audOk = Array.isArray(aud) ? aud.includes('authenticated') : aud === 'authenticated';
  if (!audOk) {
    throw new Error('Token audience is not accepted');
  }
  return payload;
}

function isLocalRequest(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Verify a Supabase-issued JWT and return its payload. Supports asymmetric
 * ES256 (verified via the trusted project's JWKS, cached per-isolate) with an
 * optional legacy HS256 fallback. In local/dev only, a JWKS-fetch failure falls
 * back to the decoded claims (still issuer-checked). Shared by the tenant auth
 * middleware and the platform-admin middleware so JWT verification has a single
 * source of truth.
 */
export async function verifySupabaseJwt(token: string, env: SupabaseJwtEnv, reqUrl: string): Promise<any> {
  const { header, payload: decodedPayload } = decode(token);
  const expectedIssuer = expectedSupabaseIssuer(env);

  if (header.alg === 'HS256') {
    const secret = env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new Error('Received legacy HS256 token but SUPABASE_JWT_SECRET is not configured. Enable asymmetric JWTs or set the legacy secret.');
    }
    return assertTrustedClaims(await verify(token, secret, 'HS256'), expectedIssuer);
  }

  if (header.alg === 'ES256') {
    const kid = header.kid;
    if (!kid) {
      throw new Error('Missing key ID (kid) in token header');
    }
    try {
      const cacheKey = `${expectedIssuer}#${kid}`;
      let publicKey = keyCache.get(cacheKey);
      if (!publicKey) {
        const jwksUrl = `${expectedIssuer}/.well-known/jwks.json`;
        const response = await fetch(jwksUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch JWKS from trusted issuer: ${response.statusText}`);
        }
        const jwks = await response.json() as { keys: any[] };
        const jwk = jwks.keys.find((k: any) => k.kid === kid);
        if (!jwk) {
          throw new Error(`Key with ID ${kid} not found in trusted JWKS`);
        }
        publicKey = await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );
        keyCache.set(cacheKey, publicKey);
      }
      return assertTrustedClaims(await verify(token, publicKey, 'ES256'), expectedIssuer);
    } catch (jwksError: any) {
      // Local-only fallback for workerd TLS trust chain issues when fetching JWKS.
      // Keep production strict by only permitting this in development/local environments
      // AND for localhost requests. The decoded claims must still name the
      // trusted issuer.
      const isDevelopment = env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'local';
      if (isDevelopment && isLocalRequest(reqUrl) && decodedPayload?.sub && decodedPayload?.iss === expectedIssuer) {
        console.warn('[JWT DEV FALLBACK] JWKS fetch/verify failed locally; using decoded token claims only.', {
          reason: jwksError?.message || String(jwksError),
        });
        return decodedPayload;
      }
      throw jwksError;
    }
  }

  throw new Error(`Unsupported algorithm: ${header.alg}`);
}
