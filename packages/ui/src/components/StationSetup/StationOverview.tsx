import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudStationService } from '../../services/cloud.js';
import { queryKeys, useProducts, useStations } from '../../query/hooks.js';
import {
  canManageTankLevels,
  DECANTATION_REFERENCE_TEMPERATURE_C,
  decantationSettingsSchema,
  resolveDecantationSettings,
  resolveTankLevelSettings,
  TANK_LEVEL_SETTINGS_KEY,
  canManageReportTemplates,
  Station,
  type TankLevelSettings,
} from '@pump/shared';
import { ProductsCatalog } from './ProductsCatalog.js';
import { TanksGrid } from './TanksGrid.js';
import { DispensersList } from './DispensersList.js';
import { ShiftTemplates } from './ShiftTemplates.js';
import { Tabs, tabPanelProps, type TabItem } from '../../pump-ds/tabs/index.js';
import { PageFrame } from '../page-frame/index.js';
import { ROUTES } from '../../nav-intent/routes.js';
import { Field, TextInput, Select } from '../primitives/Field.js';
import { useToast } from '../primitives/ToastProvider.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { Panel, Button, EmptyState, Chip, Form } from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { PaymentTerminalsPanel } from './PaymentTerminalsPanel.js';
import { TankLevelSettingsPanel } from './TankLevelSettingsPanel.js';
import { useRunTask } from '../../utils/runTask.js';
import { ReportTemplatesPanel } from '../reports/templates/ReportTemplatesPanel.js';

const stationService = new CloudStationService();

export interface StationOverviewProps {
  onStationSelected: (station: Station | null) => void;
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
}

/**
 * Keyed on the station so the form below is rebuilt from props when the
 * operator switches station, rather than synced field-by-field in an effect.
 * The station's saved values are the form's *initial* values; an effect made
 * them a reaction, which also discarded unsaved edits whenever an unrelated
 * refresh landed a new station object.
 */
export const StationOverview: React.FC<StationOverviewProps> = (props) => (
  <StationOverviewBody key={props.selectedStation?.id ?? 'none'} {...props} />
);

const StationOverviewBody: React.FC<StationOverviewProps> = ({
  onStationSelected,
  selectedStation,
  userRole,
}) => {
  // Read through the shared static-tier hook rather than fetching into local
  // state from an effect declared above its loader.
  const stationsQ = useStations();
  const productsQ = useProducts();
  const stationsList = useMemo<Station[]>(() => stationsQ.data ?? [], [stationsQ.data]);
  const loading = stationsQ.isLoading;
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  const [editing, setEditing] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | 'general'
    | 'business'
    | 'rules'
    | 'products'
    | 'tanks'
    | 'dispensers'
    | 'terminals'
    | 'shifts'
    | 'report-templates'
  >('general');

  // General tab form states
  const [name, setName] = useState(selectedStation?.name ?? '');
  const [code, setCode] = useState(selectedStation?.code ?? '');
  const [address, setAddress] = useState(selectedStation?.address || '');
  const [phone, setPhone] = useState(selectedStation?.phone || '');
  const [graceMinutes, setGraceMinutes] = useState(
    selectedStation?.settings?.shift_grace_minutes || 15,
  );
  const [timezone, setTimezone] = useState(selectedStation?.settings?.timezone || 'Asia/Kolkata');
  const [businessDayStartsAt, setBusinessDayStartsAt] = useState(
    selectedStation?.settings?.business_day_starts_at || '06:00',
  );
  // Legal / branding (letterhead for reports & invoices)
  const [legalName, setLegalName] = useState(selectedStation?.settings?.legal?.legalName || '');
  const [gstin, setGstin] = useState(selectedStation?.settings?.legal?.gstin || '');
  const [stateCode, setStateCode] = useState(selectedStation?.settings?.legal?.stateCode || '');
  const [legalAddress, setLegalAddress] = useState(
    selectedStation?.settings?.legal?.addressLine || '',
  );
  const [pincode, setPincode] = useState(selectedStation?.settings?.legal?.pincode || '');
  const [roCode, setRoCode] = useState(selectedStation?.settings?.legal?.roCode || '');
  const [fuelBrand, setFuelBrand] = useState(selectedStation?.settings?.fuel_brand || '');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(
    selectedStation?.settings?.logo_data_url || null,
  );
  const [onboardingStatus, setOnboardingStatus] = useState<string>(
    selectedStation?.onboardingStatus || 'NOT_STARTED',
  );
  const storedDecantationSettings = resolveDecantationSettings(selectedStation?.settings);
  const [decantationDraft, setDecantationDraft] = useState<{
    stationId: string;
    values: typeof storedDecantationSettings;
  } | null>(null);
  const decantationSettings =
    decantationDraft && decantationDraft.stationId === selectedStation?.id
      ? decantationDraft.values
      : storedDecantationSettings;
  const updateDecantationSettings = (
    update: (current: typeof storedDecantationSettings) => typeof storedDecantationSettings,
  ) => {
    if (!selectedStation) return;
    setDecantationDraft({
      stationId: selectedStation.id,
      values: update(decantationSettings),
    });
  };

  /** Sets one edge of a product's density band; an empty band is dropped. */
  const setDensityBand = (productId: string, edge: 'minKgM3' | 'maxKgM3', raw: string) => {
    const value = raw === '' ? undefined : Number(raw);
    updateDecantationSettings((current) => {
      const bands = { ...current.densitySpecBands };
      const band = { ...bands[productId], [edge]: value };
      if (band.minKgM3 === undefined && band.maxKgM3 === undefined) delete bands[productId];
      else
        bands[productId] = {
          ...(band.minKgM3 === undefined ? {} : { minKgM3: band.minKgM3 }),
          ...(band.maxKgM3 === undefined ? {} : { maxKgM3: band.maxKgM3 }),
        };
      return { ...current, densitySpecBands: bands };
    });
  };

  // Selecting a default station is a genuine side effect on the parent, not
  // local state being synced, so it stays an effect — but it is now honest
  // about what it depends on.
  useEffect(() => {
    if (!selectedStation && stationsList.length > 0) onStationSelected(stationsList[0]);
  }, [selectedStation, stationsList, onStationSelected]);

  /** Force a refetch of the station list after a save. */
  const loadStations = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.stations() });
  }, [qc]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;

    try {
      const updated = await stationService.updateStation(selectedStation.id, {
        name,
        code: code.toUpperCase(),
        address,
        phone,
        settings: {
          ...(selectedStation.settings || {}),
          shift_grace_minutes: graceMinutes,
          timezone,
          business_day_starts_at: businessDayStartsAt,
          shift_lock_grace_days: selectedStation.settings?.shift_lock_grace_days || 3,
          offline_warning_days: selectedStation.settings?.offline_warning_days || 3,
          offline_critical_days: selectedStation.settings?.offline_critical_days || 7,
        },
        onboardingStatus,
      });
      onStationSelected(updated);
      setEditing(false);
      runTask(loadStations(), 'Saved, but the station list could not be refreshed.');
      toast.success('Station details saved.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;

    try {
      const updated = await stationService.updateStation(selectedStation.id, {
        settings: {
          ...(selectedStation.settings || {}),
          legal: {
            legalName: legalName || null,
            gstin: gstin || null,
            stateCode: stateCode || null,
            addressLine: legalAddress || null,
            pincode: pincode || null,
            roCode: roCode || null,
          },
          fuel_brand: fuelBrand || null,
          logo_data_url: logoDataUrl || null,
        },
      });
      onStationSelected(updated);
      setEditingBusiness(false);
      runTask(loadStations(), 'Saved, but the station list could not be refreshed.');
      toast.success('Business details saved.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveDecantation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStation) return;
    const parsed = decantationSettingsSchema.safeParse(decantationSettings);
    if (!parsed.success) {
      toast.error('Check the Decantation settings and try again.');
      return;
    }
    try {
      const updated = await stationService.updateStation(selectedStation.id, {
        settings: {
          ...(selectedStation.settings || {}),
          ...parsed.data,
        },
      });
      onStationSelected(updated);
      runTask(loadStations(), 'Saved, but the station list could not be refreshed.');
      toast.success('Decantation settings saved.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /**
   * Tank levels colour every tank on every screen (#520). The server refuses
   * anyone but an Owner or Manager; the station list is invalidated (not
   * awaited) so the Dashboard, alerts and Inventory pick the change up.
   */
  const handleSaveTankLevels = async (tankLevels: TankLevelSettings) => {
    if (!selectedStation) return;
    try {
      const updated = await stationService.updateStation(selectedStation.id, {
        settings: { ...(selectedStation.settings || {}), [TANK_LEVEL_SETTINGS_KEY]: tankLevels },
      });
      onStationSelected(updated);
      runTask(loadStations(), 'Saved, but the station list could not be refreshed.');
      toast.success('Tank levels saved.');
    } catch (err: any) {
      toast.error(err.message);
      throw err;
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading station overview..." />;
  }

  return (
    <PageFrame
      route={ROUTES.station}
      subtitle="Review and modify station components, products, tanks, nozzles, and settings."
      tabs={
        selectedStation ? (
          <Tabs
            id="station-setup"
            aria-label="Station setup"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as any)}
            tabs={[
              { id: 'general', label: 'General', concept: 'general' },
              { id: 'business', label: 'Branding', concept: 'branding' },
              { id: 'products', label: 'Products', concept: 'products' },
              { id: 'tanks', label: 'Tanks', concept: 'tanks' },
              {
                id: 'dispensers',
                label: 'Dispensers',
                concept: 'dispensers',
              },
              {
                id: 'terminals',
                label: 'Payment terminals',
                concept: 'payment-terminals',
              },
              {
                id: 'shifts',
                label: 'Shift templates',
                concept: 'shift-templates',
              },
              ...(userRole === 'Owner' || userRole === 'Manager'
                ? [{ id: 'rules', label: 'Rules', concept: 'rules' } satisfies TabItem]
                : []),
              ...(canManageReportTemplates(userRole)
                ? [
                    {
                      id: 'report-templates',
                      label: 'Report templates',
                      concept: 'report-templates',
                    } satisfies TabItem,
                  ]
                : []),
            ]}
          />
        ) : undefined
      }
    >
      {selectedStation ? (
        <div
          {...tabPanelProps('station-setup', activeTab)}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {/* Report templates carry their own panels (moved from Reports, #540). */}
          {activeTab === 'report-templates' && canManageReportTemplates(userRole) && (
            <ReportTemplatesPanel selectedStation={selectedStation} />
          )}

          {/* Tab Content Panels */}
          {activeTab !== 'report-templates' && (
            <Panel style={{ minHeight: '350px' }}>
              {activeTab === 'general' && (
                <div>
                  {editing ? (
                    <Form
                      onSubmit={handleSaveGeneral}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        maxWidth: '600px',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Field label="Station Name" required>
                          <TextInput
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Station Code" required>
                          <TextInput
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            required
                          />
                        </Field>
                      </div>

                      <Field label="Physical Address">
                        <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
                      </Field>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Field label="Contact Phone">
                          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </Field>
                        <Field label="Shift Grace Period (Minutes)">
                          <TextInput
                            type="number"
                            min="0"
                            className="mono-num"
                            value={graceMinutes}
                            onChange={(e) => setGraceMinutes(parseInt(e.target.value))}
                          />
                        </Field>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Field
                          label="Timezone"
                          hint="Used to decide which calendar day operations belong to."
                        >
                          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                            <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                            <option value="Asia/Colombo">Asia/Colombo</option>
                            <option value="Asia/Kathmandu">Asia/Kathmandu</option>
                            <option value="Asia/Dhaka">Asia/Dhaka</option>
                            <option value="UTC">UTC</option>
                          </Select>
                        </Field>
                        <Field
                          label="Business Day Starts At"
                          hint="A fuel day commonly runs 06:00 → 06:00. Activity before this rolls to the previous day."
                        >
                          <TextInput
                            type="time"
                            className="mono-num"
                            value={businessDayStartsAt}
                            onChange={(e) => setBusinessDayStartsAt(e.target.value)}
                          />
                        </Field>
                      </div>

                      <Field label="Onboarding Readiness Status" style={{ maxWidth: '300px' }}>
                        <Select
                          value={onboardingStatus}
                          onChange={(e) => setOnboardingStatus(e.target.value)}
                        >
                          <option value="NOT_STARTED">NOT STARTED</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="READY_FOR_OPERATIONS">READY FOR OPERATIONS</option>
                        </Select>
                      </Field>

                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'flex-end',
                          marginTop: '12px',
                          borderTop: '1px solid var(--border-soft)',
                          paddingTop: '12px',
                        }}
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" variant="primary" size="sm">
                          Save Configuration
                        </Button>
                      </div>
                    </Form>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <h3
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: 'var(--text-strong)',
                            }}
                          >
                            {selectedStation.name}
                          </h3>
                          <p
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginTop: '4px',
                            }}
                          >
                            Status:
                            <Chip
                              tone={
                                onboardingStatus === 'READY_FOR_OPERATIONS' ? 'success' : 'warning'
                              }
                              size="sm"
                            >
                              {onboardingStatus.replace(/_/g, ' ')}
                            </Chip>
                          </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                          Edit General Parameters
                        </Button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '16px',
                          borderTop: '1px solid var(--border-soft)',
                          paddingTop: '16px',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Location Code
                          </span>
                          <p
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              marginTop: '4px',
                              color: 'var(--text-strong)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {selectedStation.code}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Contact
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                            }}
                          >
                            {selectedStation.phone || '—'}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Grace Period
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {selectedStation.settings?.shift_grace_minutes || 15} min
                          </p>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Address
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                            }}
                          >
                            {selectedStation.address || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'business' && (
                <div>
                  {editingBusiness ? (
                    <Form
                      onSubmit={handleSaveBusiness}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        maxWidth: '600px',
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-strong)',
                            marginBottom: '10px',
                          }}
                        >
                          Legal &amp; Tax (Report Letterhead)
                        </h3>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
                        >
                          <Field label="Legal / Trade Name">
                            <TextInput
                              value={legalName}
                              onChange={(e) => setLegalName(e.target.value)}
                              placeholder="e.g. Sri Lakshmi Fuels"
                            />
                          </Field>
                          <Field label="GSTIN">
                            <TextInput
                              className="mono-num"
                              value={gstin}
                              onChange={(e) => setGstin(e.target.value.toUpperCase())}
                              placeholder="29ABCDE1234F1Z5"
                              maxLength={15}
                            />
                          </Field>
                          <Field label="State Code (place of supply)">
                            <TextInput
                              className="mono-num"
                              value={stateCode}
                              onChange={(e) => setStateCode(e.target.value)}
                              placeholder="e.g. 29 (Karnataka)"
                              maxLength={2}
                            />
                          </Field>
                          <Field label="Retail Outlet / Dealer Code">
                            <TextInput
                              value={roCode}
                              onChange={(e) => setRoCode(e.target.value)}
                              placeholder="RO / dealership code"
                            />
                          </Field>
                          <Field label="Address Line">
                            <TextInput
                              value={legalAddress}
                              onChange={(e) => setLegalAddress(e.target.value)}
                              placeholder="Street, area, city"
                            />
                          </Field>
                          <Field label="Pincode">
                            <TextInput
                              className="mono-num"
                              value={pincode}
                              onChange={(e) => setPincode(e.target.value)}
                              placeholder="560001"
                              maxLength={6}
                            />
                          </Field>
                        </div>
                      </div>

                      <div
                        style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}
                      >
                        <h3
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-strong)',
                            marginBottom: '10px',
                          }}
                        >
                          Branding
                        </h3>
                        <div
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
                        >
                          <Field label="Fuel Company / Brand">
                            <Select
                              value={fuelBrand}
                              onChange={(e) => setFuelBrand(e.target.value)}
                            >
                              <option value="">— Select —</option>
                              <option value="Indian Oil">Indian Oil (IOCL)</option>
                              <option value="Bharat Petroleum">Bharat Petroleum (BPCL)</option>
                              <option value="Hindustan Petroleum">
                                Hindustan Petroleum (HPCL)
                              </option>
                              <option value="Nayara Energy">Nayara Energy</option>
                              <option value="Jio-bp">Jio-bp (Reliance)</option>
                              <option value="Shell">Shell</option>
                              <option value="Other">Other</option>
                            </Select>
                          </Field>
                          <Field
                            label="Logo (optional, your own)"
                            hint="Upload your outlet's own logo. Used on report letterheads."
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {logoDataUrl && (
                                <img
                                  src={logoDataUrl}
                                  alt="logo"
                                  style={{
                                    width: 36,
                                    height: 36,
                                    objectFit: 'contain',
                                    border: '1px solid var(--border-soft)',
                                    borderRadius: 4,
                                  }}
                                />
                              )}
                              <input
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () =>
                                    setLogoDataUrl(
                                      typeof reader.result === 'string' ? reader.result : null,
                                    );
                                  reader.readAsDataURL(file);
                                }}
                                style={{ fontSize: '12px' }}
                              />
                              {logoDataUrl && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => setLogoDataUrl(null)}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          </Field>
                        </div>
                      </div>

                      <div
                        style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}
                      >
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Report paper size and which sections print on each report are set in{' '}
                          <strong>Station → Report templates</strong>.
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'flex-end',
                          marginTop: '12px',
                          borderTop: '1px solid var(--border-soft)',
                          paddingTop: '12px',
                        }}
                      >
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingBusiness(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" variant="primary" size="sm">
                          Save Configuration
                        </Button>
                      </div>
                    </Form>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <h3
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: 'var(--text-strong)',
                            }}
                          >
                            Business, Tax &amp; Branding
                          </h3>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Legal identity and letterhead used across reports and invoices.
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingBusiness(true)}
                        >
                          Edit Business Details
                        </Button>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '16px',
                          borderTop: '1px solid var(--border-soft)',
                          paddingTop: '16px',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Legal Name
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                            }}
                          >
                            {legalName || '—'}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            GSTIN
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {gstin || '—'}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            State Code
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {stateCode || '—'}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Fuel Brand
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                            }}
                          >
                            {fuelBrand || '—'}
                          </p>
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Logo
                          </span>
                          <p
                            style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              marginTop: '4px',
                              color: 'var(--text-default)',
                            }}
                          >
                            {logoDataUrl ? 'Uploaded' : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'rules' && (userRole === 'Owner' || userRole === 'Manager') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Tank levels sit above the decantation tolerances (Station › Rules, #520). */}
                  <TankLevelSettingsPanel
                    key={selectedStation.id}
                    value={resolveTankLevelSettings(selectedStation.settings)}
                    canEdit={canManageTankLevels(userRole)}
                    onSave={handleSaveTankLevels}
                  />
                  <div style={{ borderTop: '1px solid var(--border-soft)' }} />
                  <Form
                    onSubmit={handleSaveDecantation}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      maxWidth: '760px',
                    }}
                  >
                    <div>
                      <h3
                        style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}
                      >
                        Decantation guidance
                      </h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        These station values help flag readings for review. They never prevent an
                        operation.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <Field
                        label="Density method"
                        hint="Used to convert observed density to 15 °C."
                      >
                        <Select
                          value={decantationSettings.densityMethod}
                          onChange={(e) =>
                            updateDecantationSettings((current) => ({
                              ...current,
                              densityMethod: e.target.value as typeof current.densityMethod,
                            }))
                          }
                        >
                          <option value="API_MPMS_11_1_ADJUNCT">API MPMS 11.1 Adjunct</option>
                          <option value="OMC_TABLE_53B">OMC Table 53B</option>
                        </Select>
                      </Field>
                      <Field
                        label="Default density entry"
                        hint="Pre-selected method when recording a density reading."
                      >
                        <Select
                          value={decantationSettings.densityEntryMethod}
                          onChange={(e) =>
                            updateDecantationSettings((current) => ({
                              ...current,
                              densityEntryMethod: e.target
                                .value as typeof current.densityEntryMethod,
                            }))
                          }
                        >
                          <option value="HYDROMETER">Hydrometer + temperature</option>
                          <option value="DIRECT_15">Direct 15 °C</option>
                        </Select>
                      </Field>
                      <Field label="Reference temperature">
                        <TextInput value={`${DECANTATION_REFERENCE_TEMPERATURE_C} °C`} disabled />
                      </Field>
                      <Field
                        label="Density tolerance (kg/m³)"
                        hint="Warn when RO density differs from invoice density by more than this value."
                      >
                        <TextInput
                          type="number"
                          min="0.1"
                          max="100"
                          step="0.1"
                          className="mono-num"
                          value={decantationSettings.densityToleranceKgM3}
                          onChange={(e) =>
                            updateDecantationSettings((current) => ({
                              ...current,
                              densityToleranceKgM3: Number(e.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field
                        label="Quantity tolerance (%)"
                        hint="Percent of invoice quantity; 0.2 means 0.2%."
                      >
                        <TextInput
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="mono-num"
                          value={decantationSettings.quantityTolerance}
                          onChange={(e) =>
                            updateDecantationSettings((current) => ({
                              ...current,
                              quantityTolerance: Number(e.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field
                        label="Settling time (minutes)"
                        hint="Early post-unloading dips are flagged for review."
                      >
                        <TextInput
                          type="number"
                          min="0"
                          max="1440"
                          step="1"
                          className="mono-num"
                          value={decantationSettings.settlingTimeMinutes}
                          onChange={(e) =>
                            updateDecantationSettings((current) => ({
                              ...current,
                              settlingTimeMinutes: Number(e.target.value),
                            }))
                          }
                        />
                      </Field>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '12px' }}>
                      <h4
                        style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}
                      >
                        Product density bands at 15 °C
                      </h4>
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                          marginBottom: '10px',
                        }}
                      >
                        Optional product-specific bounds in kg/m³. Leave both fields blank for no
                        band.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(productsQ.data ?? [])
                          .filter((product) => product.productType === 'FUEL')
                          .map((product) => {
                            const band = decantationSettings.densitySpecBands[product.id] ?? {};
                            return (
                              <div
                                key={product.id}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'minmax(180px, 1fr) 1fr 1fr',
                                  gap: '12px',
                                  alignItems: 'end',
                                }}
                              >
                                <span style={{ fontSize: '13px', color: 'var(--text-default)' }}>
                                  {product.name}
                                </span>
                                <Field label={`Minimum (kg/m³)`}>
                                  <TextInput
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    className="mono-num"
                                    aria-label={`${product.name} minimum density`}
                                    value={band.minKgM3 ?? ''}
                                    onChange={(e) =>
                                      setDensityBand(product.id, 'minKgM3', e.target.value)
                                    }
                                  />
                                </Field>
                                <Field label="Maximum (kg/m³)">
                                  <TextInput
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    className="mono-num"
                                    aria-label={`${product.name} maximum density`}
                                    value={band.maxKgM3 ?? ''}
                                    onChange={(e) =>
                                      setDensityBand(product.id, 'maxKgM3', e.target.value)
                                    }
                                  />
                                </Field>
                              </div>
                            );
                          })}
                        {!productsQ.isLoading &&
                          !(productsQ.data ?? []).some(
                            (product) => product.productType === 'FUEL',
                          ) && (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              No fuel products are set up for this station.
                            </p>
                          )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        borderTop: '1px solid var(--border-soft)',
                        paddingTop: '12px',
                      }}
                    >
                      <Button type="submit" variant="primary" size="sm">
                        Save Decantation Settings
                      </Button>
                    </div>
                  </Form>
                </div>
              )}

              {activeTab === 'products' && <ProductsCatalog selectedStation={selectedStation} />}
              {activeTab === 'tanks' && <TanksGrid stationId={selectedStation.id} />}
              {activeTab === 'dispensers' && <DispensersList stationId={selectedStation.id} />}
              {activeTab === 'terminals' && (
                <PaymentTerminalsPanel stationId={selectedStation.id} />
              )}
              {activeTab === 'shifts' && <ShiftTemplates />}
            </Panel>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<ConceptIcon concept="stations" />}
          title="No station selected"
          description="Please select or initialize a station location first."
        />
      )}
    </PageFrame>
  );
};
