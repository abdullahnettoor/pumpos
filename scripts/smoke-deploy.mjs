#!/usr/bin/env node
/**
 * Post-deploy smoke checks.
 *
 * A deploy currently reports success when the *upload* succeeds. A Worker that
 * builds, uploads, and then throws on every request is indistinguishable from a
 * healthy one, so today the first signal of a broken release is an operator
 * hitting it at 9pm. This asserts each surface actually answers.
 *
 * Usage:
 *   node scripts/smoke-deploy.mjs api https://api.pumpos.app
 *   node scripts/smoke-deploy.mjs console https://console.pumpos.app
 *
 * Exits non-zero on the first failed check, emits GitHub Actions error
 * annotations, and appends a table to the run summary.
 */

const [, , surface, baseUrl] = process.argv;

if (!surface || !baseUrl) {
  console.error('usage: smoke-deploy.mjs <api|console|marketing|mobile> <base-url>');
  process.exit(2);
}

/** A freshly-deployed Worker can take a few seconds to serve the new version. */
const ATTEMPTS = 5;
const BACKOFF_MS = [0, 1000, 2000, 4000, 8000];
const TIMEOUT_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one check, retrying transient failures. `assert` returns a string on
 * failure (the reason) or null on success.
 */
async function check(name, path, assert) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  let lastReason = 'never ran';
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);
    try {
      const response = await fetchWithTimeout(url);
      const reason = await assert(response);
      if (!reason) return { name, url, ok: true };
      lastReason = reason;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
  }
  return { name, url, ok: false, reason: lastReason };
}

const expectStatus = (expected) => (response) =>
  response.status === expected ? null : `expected HTTP ${expected}, got ${response.status}`;

/** The page must be the app shell, not Cloudflare's error page or an empty 200. */
async function expectHtmlApp(response) {
  const status = expectStatus(200)(response);
  if (status) return status;
  const body = await response.text();
  if (!/<div id="root"|<body/i.test(body)) return 'response is not an HTML document';
  if (!/<script/i.test(body)) return 'HTML carries no script tag — the bundle did not ship';
  return null;
}

const CHECKS = {
  api: [
    // Cheap liveness: the Worker booted and routing works at all.
    [
      'health',
      '/health',
      async (response) => {
        const status = expectStatus(200)(response);
        if (status) return status;
        const body = await response.json().catch(() => null);
        return body?.status === 'healthy'
          ? null
          : `unexpected health body: ${JSON.stringify(body)}`;
      },
    ],
    // A REAL endpoint, per the ticket: this goes through the router and the auth
    // middleware rather than a static handler, so it catches a Worker that
    // booted but throws once any actual route is exercised. Unauthenticated on
    // purpose — it needs no credentials but still proves the stack answers in
    // the documented envelope.
    [
      'authenticated route rejects anonymous',
      '/api/shifts/status',
      async (response) => {
        if (response.status !== 401) return `expected HTTP 401, got ${response.status}`;
        const body = await response.json().catch(() => null);
        if (body?.success !== false)
          return `expected { success: false }, got ${JSON.stringify(body)}`;
        if (body?.error?.code !== 'UNAUTHORIZED') {
          return `expected error.code UNAUTHORIZED, got ${JSON.stringify(body?.error)}`;
        }
        return null;
      },
    ],
  ],
  console: [['app shell', '/', expectHtmlApp]],
  mobile: [['app shell', '/', expectHtmlApp]],
  marketing: [
    ['home page', '/', expectHtmlApp],
    // Generated at build time, so a 200 here proves the build output shipped
    // rather than a stale or empty upload.
    ['sitemap', '/sitemap-index.xml', expectStatus(200)],
  ],
};

const checks = CHECKS[surface];
if (!checks) {
  console.error(`unknown surface "${surface}" — expected one of ${Object.keys(CHECKS).join(', ')}`);
  process.exit(2);
}

const results = [];
for (const [name, path, assert] of checks) {
  const result = await check(name, path, assert);
  results.push(result);
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${surface}: ${name}  (${result.url})`);
  if (!result.ok) console.log(`      ${result.reason}`);
}

const failed = results.filter((r) => !r.ok);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  const rows = results
    .map((r) => `| ${surface} | ${r.name} | ${r.ok ? 'pass' : 'FAIL'} | ${r.ok ? '' : r.reason} |`)
    .join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Smoke: ${surface}\n\n| surface | check | result | detail |\n| --- | --- | --- | --- |\n${rows}\n\n`,
  );
}

for (const failure of failed) {
  console.log(`::error title=Smoke check failed (${surface})::${failure.name} — ${failure.reason}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length}/${results.length} smoke checks failed for ${surface}.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} smoke checks passed for ${surface}.`);
