/**
 * End-to-end timing validation on the DEPLOYED preview worker (post-Mumbai).
 * Full operational cycle: open shift -> status (full) x3 -> handover -> close.
 * Reports wall + Server-Timing per call. Leaves the station clean (shift closed).
 */
const api = 'https://api.pumpos.abdullahnettoor.com/api';
const station = 'c7361199-ffe8-432c-96bd-9f99f34511ea';

const auth = await fetch('https://gpfqiesflrpmndhkfvhg.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: 'sb_publishable_mMyWNusxZtScUxjTOD9fVA_ViTJ5Gvg', 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'agent-owner@test.in', password: 'Agent#Pump2026' }),
}).then((r) => r.json());
if (!auth.access_token) throw new Error('sign-in failed');
const H = { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };

async function call(label, path, init = {}) {
  const t0 = Date.now();
  const res = await fetch(api + path, { headers: H, ...init });
  const wall = Date.now() - t0;
  const st = res.headers.get('server-timing') ?? '';
  const body = await res.json().catch(() => ({}));
  console.log(`${label.padEnd(22)} ${res.status} wall=${String(wall).padStart(5)}ms  ${st}${body.success ? '' : '  ERR ' + JSON.stringify(body.error ?? {}).slice(0, 120)}`);
  return body;
}

// Reference data
const tmplRes = await call('GET templates', `/setup/shift-templates`);
const templates = tmplRes.data ?? [];
const day = templates.find((t) => t.name === 'Day Shift') ?? templates[0];
const dusRes = await call('GET dispensers', `/setup/dispensers?stationId=${station}`);
const usersRes = await call('GET users', `/setup/users`);
const dus = (dusRes.data ?? []).filter((d) => d.status === 'ACTIVE');
const attendants = (usersRes.data ?? []).filter((u) => u.role === 'Attendant');
// #261: every in-service dispenser needs an attendant
const staffAssignments = dus.map((d, i) => ({ duId: d.id, userId: attendants[i % attendants.length].id }));

// Open shift
const open = await call('POST shifts/open', '/shifts/open', {
  method: 'POST',
  body: JSON.stringify({ stationId: station, shiftTemplateId: day.id, openingCash: 5000, staffAssignments }),
});
const shift = open.data?.shift ?? open.data;
const shiftId = shift?.id;
if (!shiftId) throw new Error('open failed');

// Full status (the 11.88s route from the original capture)
let status;
for (let i = 1; i <= 3; i++) status = await call(`GET status full #${i}`, `/shifts/status?stationId=${station}`);

// Nozzle readings from the open status
const readings = (status.data?.activeShift?.nozzleReadings ?? []).map((r) => ({
  nozzleId: r.nozzleId,
  closingReading: Number(r.openingReading) + (r.productCode === 'MS' ? 150 : 220),
}));
if (readings.length === 0) console.log('WARN: no nozzle readings found on active shift');

// Close shift (the 16.52s route from the original capture)
await call('POST shifts/close', '/shifts/close', {
  method: 'POST',
  body: JSON.stringify({ shiftId, payload: { closingCash: 5000, nozzleReadings: readings } }),
});

// Post-close status (what the UI refetches before showing the success card)
await call('GET status post-close', `/shifts/status?stationId=${station}`);
await call('GET shift-summaries', `/shifts/shift-summaries?stationId=${station}&limit=50`);
