#!/usr/bin/env node
/**
 * Production-like dashboard-load performance check (#149 / #113).
 *
 * Fires the authenticated request set a dashboard load produces against a
 * deployed API, several times (first pass exercises a cold-ish isolate, later
 * passes are warm), while `wrangler tail --format json` streams Worker events.
 * Asserts:
 *   1. every request completes with HTTP 200 and { success: true }
 *   2. no tail event reports outcome `exceededCpu` / `exceededMemory`
 *   3. per route, the BEST (warm) observed CPU stays under the budget
 *      (default 10 ms — the Workers Free per-invocation limit)
 *
 * Isolate placement and auth caches vary run to run, so the budget is asserted
 * on the per-route minimum across runs; the max is reported for visibility.
 *
 * Usage (token minted for you from credentials):
 *   PERF_EMAIL=owner@station.com PERF_PASSWORD=... \
 *   PERF_SUPABASE_URL=https://<ref>.supabase.co PERF_SUPABASE_ANON_KEY=<anon key> \
 *   node scripts/perf-check.mjs --base <apiBase> --station <stationId> \
 *     [--runs 3] [--budget-ms 10] \
 *     [--tail-cmd npx wrangler tail preview-pumpos-api --format json] [--no-tail]
 *
 * Or with a pre-minted user session JWT (NOT the anon/service key; expires ~1h):
 *   PERF_TOKEN=<supabase access token> node scripts/perf-check.mjs ...
 *
 * --tail-cmd consumes every following token up to the next --flag, so it needs
 * no quoting (npm run strips quotes). With --no-tail (or when wrangler cannot
 * attach) the script still asserts HTTP success and reports wall-clock
 * latency, but skips CPU assertions.
 */

import { spawn } from 'node:child_process';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

/**
 * Greedy variant: collect every argv token after --name until one of OUR OWN
 * flags (or the end). Flags belonging to the embedded command (e.g. wrangler's
 * --format json) are swallowed, so no shell quoting is needed — npm run strips
 * quotes anyway.
 */
function argMulti(name, fallback = undefined) {
  const OWN = new Set(['--base', '--station', '--runs', '--budget-ms', '--tail-cmd', '--no-tail']);
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const parts = [];
  for (let j = i + 1; j < process.argv.length && !OWN.has(process.argv[j]); j += 1) {
    parts.push(process.argv[j]);
  }
  return parts.length ? parts.join(' ') : fallback;
}

const base = arg('base');
const stationId = arg('station');
const runs = Number(arg('runs', '3'));
const budgetMs = Number(arg('budget-ms', '10'));
const noTail = process.argv.includes('--no-tail');
const tailCmd = argMulti('tail-cmd', 'npx wrangler tail pumpos-api-prod --format json');

if (!base || !stationId) {
  console.error(
    'Usage: PERF_TOKEN=<user access token> (or PERF_EMAIL/PERF_PASSWORD + PERF_SUPABASE_URL/PERF_SUPABASE_ANON_KEY)\n' +
      '  node scripts/perf-check.mjs --base <apiBase> --station <stationId> [--runs N] [--budget-ms N] [--tail-cmd ...] [--no-tail]',
  );
  process.exit(2);
}

/**
 * Resolve the bearer token: an explicit PERF_TOKEN wins; otherwise sign in
 * with PERF_EMAIL/PERF_PASSWORD against Supabase Auth (anon key only used to
 * reach the sign-in endpoint) and use the fresh session access token — this
 * sidesteps the ~1 h expiry of copy-pasted tokens.
 */
async function resolveToken() {
  if (process.env.PERF_TOKEN) return process.env.PERF_TOKEN;
  const { PERF_EMAIL, PERF_PASSWORD, PERF_SUPABASE_URL, PERF_SUPABASE_ANON_KEY } = process.env;
  if (PERF_EMAIL && PERF_PASSWORD && PERF_SUPABASE_URL && PERF_SUPABASE_ANON_KEY) {
    const res = await fetch(`${PERF_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: PERF_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PERF_EMAIL, password: PERF_PASSWORD }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      console.error(`Sign-in failed (${res.status}): ${body.error_description ?? body.msg ?? ''}`);
      process.exit(2);
    }
    console.log(`Signed in as ${PERF_EMAIL}; using a fresh access token.`);
    return body.access_token;
  }
  console.error(
    'No credentials: set PERF_TOKEN, or PERF_EMAIL + PERF_PASSWORD + PERF_SUPABASE_URL + PERF_SUPABASE_ANON_KEY.',
  );
  process.exit(2);
}

const token = await resolveToken();

/** The request set a dashboard load produces (post #144–#148). */
const ROUTES = [
  { label: 'session', path: `/api/session` },
  { label: 'dashboard-summary', path: `/api/shifts/dashboard-summary?stationId=${stationId}` },
  { label: 'shift-status (lite)', path: `/api/shifts/status?stationId=${stationId}&lite=true` },
  { label: 'business-day-status', path: `/api/shifts/business-days/status?stationId=${stationId}` },
  { label: 'inventory-status', path: `/api/transactions/inventory/status?stationId=${stationId}` },
  {
    label: 'shift-summaries (p1)',
    path: `/api/shifts/shift-summaries?stationId=${stationId}&limit=50`,
  },
];

// ---------------------------------------------------------------------------
// wrangler tail collector
// ---------------------------------------------------------------------------

function startTail() {
  if (noTail) return null;
  const [cmd, ...args] = tailCmd.split(/\s+/);
  console.log(`[tail] spawning: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', (err) => {
    console.error(`[tail] failed to start (${err.message}) — CPU capture will be empty.`);
  });
  const events = [];
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('{')) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        /* partial / non-event line */
      }
    }
  });
  child.stderr.on('data', (c) => {
    const s = c.toString();
    if (/error|unauthorized|not found/i.test(s)) console.error(`[tail] ${s.trim()}`);
  });
  return { child, events };
}

/** Extract { pathname, cpuMs, wallMs, outcome } from a tail event (raw or logpush shape). */
function parseTailEvent(evt) {
  const w = evt.$workers ?? evt;
  const req = w?.event?.request ?? evt?.event?.request;
  const url = req?.url;
  if (!url) return null;
  let pathname;
  try {
    pathname = new URL(url).pathname + (new URL(url).search ?? '');
  } catch {
    return null;
  }
  const cpuMs = w?.cpuTimeMs ?? (evt.cpuTime != null ? evt.cpuTime / 1000 : undefined);
  const wallMs = w?.wallTimeMs ?? (evt.wallTime != null ? evt.wallTime / 1000 : undefined);
  return { pathname, cpuMs, wallMs, outcome: w?.outcome ?? evt.outcome };
}

// ---------------------------------------------------------------------------
// request runner
// ---------------------------------------------------------------------------

async function hit(route) {
  const started = Date.now();
  const res = await fetch(`${base}${route.path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const wallMs = Date.now() - started;
  let ok;
  try {
    const body = await res.json();
    ok = res.ok && body?.success === true;
  } catch {
    ok = false;
  }
  return { ok, status: res.status, wallMs };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Fail fast on a bad token before attaching a tail or looping: a 401 here
  // means the bearer is expired (user access tokens live ~1 h) or is the
  // anon/service key instead of a user session JWT.
  const probe = await hit(ROUTES[0]);
  if (probe.status === 401) {
    console.error(
      'Auth probe returned 401. PERF_TOKEN must be a FRESH Supabase user session access token\n' +
        '(sign-in result, expires ~1h) — not the anon or service key. Tip: set PERF_EMAIL /\n' +
        'PERF_PASSWORD / PERF_SUPABASE_URL / PERF_SUPABASE_ANON_KEY and the script mints one itself.',
    );
    process.exit(2);
  }

  const tail = startTail();
  if (tail) {
    console.log('Attaching wrangler tail…');
    await sleep(5000); // let the tail session attach before traffic flows
  }

  const httpResults = new Map(); // label -> [{ok,status,wallMs}]
  let httpFailures = 0;

  for (let run = 1; run <= runs; run += 1) {
    console.log(`\nRun ${run}/${runs}${run === 1 ? ' (coldest)' : ' (warm)'}`);
    for (const route of ROUTES) {
      const r = await hit(route);
      (httpResults.get(route.label) ?? httpResults.set(route.label, []).get(route.label)).push(r);
      const mark = r.ok ? 'ok ' : 'FAIL';
      if (!r.ok) httpFailures += 1;
      console.log(`  ${mark} ${String(r.status).padEnd(3)} ${r.wallMs}ms  ${route.label}`);
    }
    await sleep(1500);
  }

  let cpuFailures = 0;
  if (tail) {
    console.log('\nWaiting for tail events to drain…');
    await sleep(8000);
    tail.child.kill('SIGINT');

    const perRoute = new Map(); // label -> { cpus: number[], outcomes: string[] }
    for (const evt of tail.events) {
      const parsed = parseTailEvent(evt);
      if (!parsed) continue;
      const route = ROUTES.find((r) => {
        const p = r.path.split('?')[0];
        return parsed.pathname.startsWith(p);
      });
      if (!route) continue;
      const agg = perRoute.get(route.label) ?? { cpus: [], outcomes: [] };
      if (typeof parsed.cpuMs === 'number') agg.cpus.push(parsed.cpuMs);
      if (parsed.outcome) agg.outcomes.push(parsed.outcome);
      perRoute.set(route.label, agg);
    }

    console.log(`\nCPU per route (budget ${budgetMs} ms, asserted on warm minimum):`);
    console.log('route'.padEnd(24), 'events', 'minCpu', 'maxCpu', 'outcomes');
    for (const route of ROUTES) {
      const agg = perRoute.get(route.label);
      if (!agg || agg.cpus.length === 0) {
        console.log(route.label.padEnd(24), '0      — no tail events captured (verify tail-cmd)');
        cpuFailures += 1;
        continue;
      }
      const min = Math.min(...agg.cpus);
      const max = Math.max(...agg.cpus);
      const badOutcome = agg.outcomes.some((o) => o !== 'ok');
      const overBudget = min > budgetMs;
      if (badOutcome || overBudget) cpuFailures += 1;
      console.log(
        route.label.padEnd(24),
        String(agg.cpus.length).padEnd(6),
        `${min.toFixed(1)}ms`.padEnd(7),
        `${max.toFixed(1)}ms`.padEnd(7),
        `${[...new Set(agg.outcomes)].join(',')}${overBudget ? '  ← OVER BUDGET' : ''}${badOutcome ? '  ← BAD OUTCOME' : ''}`,
      );
    }
  } else {
    console.log('\n(no tail attached — CPU assertions skipped)');
  }

  console.log(
    `\n${httpFailures === 0 ? 'All requests completed successfully.' : `${httpFailures} request(s) FAILED.`}` +
      (tail
        ? ` CPU check: ${cpuFailures === 0 ? 'within budget.' : `${cpuFailures} route(s) failed.`}`
        : ''),
  );
  process.exit(httpFailures > 0 || cpuFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
