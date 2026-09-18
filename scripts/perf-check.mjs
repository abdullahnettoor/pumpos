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
 * Usage:
 *   PERF_TOKEN=<supabase access token> \
 *   node scripts/perf-check.mjs \
 *     --base https://api.pumpos.abdullahnettoor.com \
 *     --station <stationId> \
 *     [--runs 3] [--budget-ms 10] [--tail-cmd "npx wrangler tail preview-pumpos-api --format json"] \
 *     [--no-tail]
 *
 * With --no-tail (or when wrangler cannot attach) the script still asserts
 * HTTP success and reports wall-clock latency, but skips CPU assertions.
 */

import { spawn } from 'node:child_process';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const base = arg('base');
const stationId = arg('station');
const runs = Number(arg('runs', '3'));
const budgetMs = Number(arg('budget-ms', '10'));
const noTail = process.argv.includes('--no-tail');
const tailCmd = arg('tail-cmd', 'npx wrangler tail pumpos-api-prod --format json');
const token = process.env.PERF_TOKEN;

if (!base || !stationId || !token) {
  console.error(
    'Usage: PERF_TOKEN=<token> node scripts/perf-check.mjs --base <apiBase> --station <stationId> [--runs N] [--budget-ms N] [--tail-cmd "..."] [--no-tail]',
  );
  process.exit(2);
}

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
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
  let ok = false;
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
