import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJwtKeyCache, verifySupabaseJwt } from './supabase-jwt.js';

const TRUSTED_URL = 'https://project.supabase.co';
const TRUSTED_ISSUER = `${TRUSTED_URL}/auth/v1`;
const env = { SUPABASE_URL: TRUSTED_URL };
const REQ_URL = 'https://api.pumpos.app/api/session';

type TestJwk = JsonWebKey & { kid: string; alg: string; use: string };
type Keys = { privateKey: CryptoKey; jwk: TestJwk };

async function generateKeys(kid: string): Promise<Keys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  return { privateKey: pair.privateKey, jwk: { ...jwk, kid, alg: 'ES256', use: 'sig' } };
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeToken(keys: Keys, kid: string, claims: Record<string, unknown>): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify({ sub: 'auth-user-1', exp: Math.floor(Date.now() / 1000) + 300, ...claims }));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keys.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

function stubJwks(map: Record<string, TestJwk[]>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const u = String(url);
    const keys = map[u];
    if (!keys) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ keys }), { status: 200 });
  }));
}

describe('verifySupabaseJwt', () => {
  beforeEach(() => {
    clearJwtKeyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a token whose issuer points at an attacker-hosted JWKS', async () => {
    const attacker = await generateKeys('evil-kid');
    // Attacker hosts a valid JWKS at their own issuer; token is correctly
    // signed by the attacker's key and claims the attacker issuer.
    stubJwks({
      'https://evil.example.com/auth/v1/.well-known/jwks.json': [attacker.jwk],
      [`${TRUSTED_ISSUER}/.well-known/jwks.json`]: [],
    });
    const token = await makeToken(attacker, 'evil-kid', {
      iss: 'https://evil.example.com/auth/v1',
      aud: 'authenticated',
    });

    await expect(verifySupabaseJwt(token, env, REQ_URL)).rejects.toThrow();
    // The attacker's JWKS URL must never be fetched.
    const fetched = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(fetched.every((u: string) => u.startsWith(TRUSTED_ISSUER))).toBe(true);
  });

  it('rejects a foreign-issuer token even when the kid exists in the trusted JWKS', async () => {
    const keys = await generateKeys('kid-1');
    stubJwks({ [`${TRUSTED_ISSUER}/.well-known/jwks.json`]: [keys.jwk] });
    const token = await makeToken(keys, 'kid-1', {
      iss: 'https://evil.example.com/auth/v1',
      aud: 'authenticated',
    });
    await expect(verifySupabaseJwt(token, env, REQ_URL)).rejects.toThrow(/issuer/i);
  });

  it('rejects a wrong audience', async () => {
    const keys = await generateKeys('kid-1');
    stubJwks({ [`${TRUSTED_ISSUER}/.well-known/jwks.json`]: [keys.jwk] });
    const token = await makeToken(keys, 'kid-1', { iss: TRUSTED_ISSUER, aud: 'anon' });
    await expect(verifySupabaseJwt(token, env, REQ_URL)).rejects.toThrow(/audience/i);
  });

  it('accepts a valid token from the trusted issuer', async () => {
    const keys = await generateKeys('kid-1');
    stubJwks({ [`${TRUSTED_ISSUER}/.well-known/jwks.json`]: [keys.jwk] });
    const token = await makeToken(keys, 'kid-1', { iss: TRUSTED_ISSUER, aud: 'authenticated' });
    const payload = await verifySupabaseJwt(token, env, REQ_URL);
    expect(payload.sub).toBe('auth-user-1');
  });

  it('accepts an array audience containing authenticated', async () => {
    const keys = await generateKeys('kid-1');
    stubJwks({ [`${TRUSTED_ISSUER}/.well-known/jwks.json`]: [keys.jwk] });
    const token = await makeToken(keys, 'kid-1', { iss: TRUSTED_ISSUER, aud: ['authenticated'] });
    const payload = await verifySupabaseJwt(token, env, REQ_URL);
    expect(payload.sub).toBe('auth-user-1');
  });

  it('fails when SUPABASE_URL is not configured', async () => {
    const keys = await generateKeys('kid-1');
    const token = await makeToken(keys, 'kid-1', { iss: TRUSTED_ISSUER, aud: 'authenticated' });
    await expect(verifySupabaseJwt(token, {}, REQ_URL)).rejects.toThrow(/SUPABASE_URL/);
  });

  it('does not apply the dev fallback outside local requests', async () => {
    const keys = await generateKeys('kid-1');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const token = await makeToken(keys, 'kid-1', { iss: TRUSTED_ISSUER, aud: 'authenticated' });
    await expect(
      verifySupabaseJwt(token, { ...env, ENVIRONMENT: 'development' }, REQ_URL)
    ).rejects.toThrow();
  });
});
