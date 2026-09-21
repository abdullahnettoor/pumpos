import { readFileSync } from 'node:fs';
const token = readFileSync('/tmp/pumpos-perf-token', 'utf8').trim();
const base = 'https://api.pumpos.abdullahnettoor.com';
const station = 'c7361199-ffe8-432c-96bd-9f99f34511ea';
const routes = [
  ['lite   ', `/api/shifts/status?stationId=${station}&lite=true`],
  ['full   ', `/api/shifts/status?stationId=${station}`],
  ['bd-stat', `/api/shifts/business-days/status?stationId=${station}`],
  ['dash   ', `/api/shifts/dashboard-summary?stationId=${station}`],
];
for (let run = 1; run <= 4; run++) {
  console.log(`-- run ${run}`);
  for (const [label, path] of routes) {
    const t0 = Date.now();
    const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    const wall = Date.now() - t0;
    const st = res.headers.get('server-timing') ?? '';
    let ok = false; try { ok = (await res.json())?.success === true; } catch {}
    console.log(`${label} ${res.status}${ok ? '' : ' FAIL'}  wall=${String(wall).padStart(6)}ms  ${st}`);
  }
}
