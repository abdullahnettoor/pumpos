import { useState } from 'react';
import { Banner, Button, Drawer, Field, Select, TextInput } from '@pump/ui';
import { commands, useInvalidatePlatform } from '../api/queries.js';
import type { ApiTarget } from '../api/targets.js';
import type { DemoCreateResult } from '../api/types.js';

// Demos are created only on non-production targets, so prospects use the preview apps.
const DEMO_CONSOLE_URL = 'https://console.pumpos.abdullahnettoor.com';
const DEMO_MOBILE_URL = 'https://m.pumpos.abdullahnettoor.com';

function demoShareMessage(stationName: string, created: DemoCreateResult): string {
  const hasAttendant = Boolean(created.attendantEmail);
  const lines = [
    `*Welcome to PumpOS: ${stationName} demo*`,
    '',
    '*1. Owner console (phone, laptop or desktop)*',
    `🔗 ${DEMO_CONSOLE_URL}`,
    `- Email: ${created.ownerEmail}`,
    `- Password: ${created.password}`,
    ...(hasAttendant
      ? [
          '',
          '*2. Attendant app (phone)*',
          `🔗 ${DEMO_MOBILE_URL}`,
          `- Email: ${created.attendantEmail}`,
          `- Password: ${created.password}`,
        ]
      : []),
    '',
    '*How to try it*',
    '1. Open the console link on your phone or computer and sign in with the Owner login. This is where you manage the station: setup, shifts, sales, stock, expenses and reports.',
    ...(hasAttendant
      ? [
          "2. Open the attendant link in your phone's browser and sign in with the Attendant login. There's nothing to install.",
          '3. In the console, open a shift and assign the attendant to a pump.',
          '4. In the attendant app, enter nozzle readings and cash drops, then do the handover at the end of the shift.',
          '5. Back in the console, close the shift and then the day to see the Shift Summary and the Daily Sales Report (DSR).',
        ]
      : [
          '2. Open a shift, enter nozzle readings, then close the shift and the day to see the Shift Summary and the Daily Sales Report (DSR).',
        ]),
    '',
    '*Notes*',
    '- This is a demo account, so you can try anything without worry.',
    '- Use Chrome or Safari for the best experience.',
    '- If you need help, just reply to this message.',
  ];
  return lines.join('\n');
}

export function CreateDemoDrawer({ target, onClose }: { target: ApiTarget; onClose: () => void }) {
  const invalidate = useInvalidatePlatform(target);
  const [stationName, setStationName] = useState('Sample Fuels');
  const [town, setTown] = useState('Thrissur');
  const [tanks, setTanks] = useState('2');
  const [nozzles, setNozzles] = useState('6');
  const [attendants, setAttendants] = useState('3');
  const [prospectEmail, setProspectEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<'2' | '7' | '30'>('2');
  const [result, setResult] = useState<DemoCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCredentials = async (created: DemoCreateResult) => {
    try {
      await navigator.clipboard.writeText(demoShareMessage(stationName, created));
      setCopied(true);
    } catch {
      setError('Copy failed. Select the credentials and copy them by hand.');
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await commands.createDemo(target, {
        stationName,
        town,
        tanks: Number(tanks),
        nozzles: Number(nozzles),
        attendants: Number(attendants),
        prospectEmail: prospectEmail.trim() || undefined,
        expiresInDays: Number(expiresInDays) as 2 | 7 | 30,
      });
      setResult(created);
      invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create demo station.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={result ? 'Demo station created' : 'Create demo station'}
      footer={
        result ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button onClick={onClose}>Done</Button>
            {result.password && (
              <Button variant="ghost" onClick={() => void copyCredentials(result)}>
                {copied ? 'Copied' : 'Copy credentials'}
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button disabled={saving || target.production} onClick={submit}>
              {saving ? 'Creating…' : 'Create demo'}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Banner severity="success" title="Ready to open in the console">
            The demo organization and station are ready on {target.label}.
          </Banner>
          {error && <Banner severity="danger">{error}</Banner>}
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 'var(--space-2)',
              fontSize: '13px',
            }}
          >
            <dt>Owner login</dt>
            <dd>{result.ownerEmail ?? 'Invite sent to prospect'}</dd>
            {result.password && (
              <>
                <dt>Password</dt>
                <dd>
                  <code>{result.password}</code>
                </dd>
              </>
            )}
            {result.attendantEmail && (
              <>
                <dt>Attendant login</dt>
                <dd>
                  {result.attendantEmail}
                  {result.attendantName && ` (${result.attendantName}, on duty, same password)`}
                </dd>
              </>
            )}
            <dt>Organization</dt>
            <dd>
              <code>{result.organizationId}</code>
            </dd>
            <dt>Expires</dt>
            <dd>{new Date(result.demoExpiresAt).toLocaleString()}</dd>
            <dt>Console</dt>
            <dd>
              <a href={DEMO_CONSOLE_URL} target="_blank" rel="noreferrer">
                Open demo console
              </a>
            </dd>
          </dl>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {target.production && (
            <Banner severity="danger">Demo actions are unavailable on Production.</Banner>
          )}
          <Field label="Station name" required>
            <TextInput
              value={stationName}
              onChange={(event) => setStationName(event.target.value)}
            />
          </Field>
          <Field label="Town" required>
            <TextInput value={town} onChange={(event) => setTown(event.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Field label="Tanks">
              <TextInput
                type="number"
                min="1"
                value={tanks}
                onChange={(event) => setTanks(event.target.value)}
              />
            </Field>
            <Field label="Nozzles">
              <TextInput
                type="number"
                min="1"
                value={nozzles}
                onChange={(event) => setNozzles(event.target.value)}
              />
            </Field>
            <Field label="Attendants">
              <TextInput
                type="number"
                min="1"
                value={attendants}
                onChange={(event) => setAttendants(event.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Prospect email"
            hint="Optional. Leave blank to provision a demo owner login."
          >
            <TextInput
              type="email"
              value={prospectEmail}
              onChange={(event) => setProspectEmail(event.target.value)}
            />
          </Field>
          <Field label="Access expires in">
            <Select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value as '2' | '7' | '30')}
            >
              <option value="2">2 days</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </Select>
          </Field>
          {error && <Banner severity="danger">{error}</Banner>}
        </div>
      )}
    </Drawer>
  );
}
