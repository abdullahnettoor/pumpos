import { useState } from 'react';
import { Banner, Button, Drawer, Field, Select, TextInput } from '@pump/ui';
import { commands, useInvalidatePlatform } from '../api/queries.js';
import type { ApiTarget } from '../api/targets.js';
import type { DemoCreateResult } from '../api/types.js';

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
          <Button onClick={onClose}>Done</Button>
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
            {!prospectEmail.trim() && (
              <>
                <dt>Demo owner</dt>
                <dd>Use the login credentials above for the demo owner.</dd>
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
              <a
                href="https://dev-pumpos-console.abdullahnettoor.workers.dev"
                target="_blank"
                rel="noreferrer"
              >
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
