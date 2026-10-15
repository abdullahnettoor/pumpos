import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudStationService } from '../../services/cloud.js';
import { queryKeys, useProducts, useStations } from '../../query/hooks.js';
import {
  canManageInfrastructure,
  canManageProduct,
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
import {
  Panel,
  Button,
  EmptyState,
  DataSection,
  Form,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SectionHeader,
  UnsavedChangesBar,
} from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { PaymentTerminalsPanel } from './PaymentTerminalsPanel.js';
import { TankLevelSettingsPanel } from './TankLevelSettingsPanel.js';
import { useRunTask } from '../../utils/runTask.js';
import { ReportTemplatesPanel } from '../reports/templates/ReportTemplatesPanel.js';
import {
  officeSubmitKeys,
  sendKeyed,
  type SubmitKeySession,
} from '../../office-records/submitKeys.js';
import {
  brandingDraftOf,
  draftDiffers,
  generalDraftOf,
  type BrandingDraft,
  type GeneralDraft,
} from './stationDrafts.js';

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
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  const [activeTab, setActiveTab] = useState<StationTab>('general');
  const logoInputRef = useRef<HTMLInputElement>(null);
  // The Add ▾ menu picks a tab and asks it to open its add drawer (#537 review).
  const [addRequest, setAddRequest] = useState<{ kind: AddKind; at: number } | null>(null);
  const requestAdd = (kind: AddKind) => {
    setActiveTab(ADD_TAB[kind]);
    setAddRequest({ kind, at: Date.now() });
  };
  const requestFor = (kind: AddKind) => ({
    createRequest: addRequest?.kind === kind ? addRequest.at : undefined,
    onCreateHandled: () => setAddRequest(null),
  });
  /**
   * Every station save sends one Idempotency-Key per logical submit (#537),
   * through the shared store. A session renews its key after each decided
   * save; Discard opens a new session (#604), so an edit started over never
   * inherits the key of one left unsettled.
   */
  const sessions = useRef(new Map<string, SubmitKeySession>());
  const openSession = (form: string) => {
    const s = officeSubmitKeys.session(`setup:stations:${selectedStation?.id ?? 'none'}:${form}`);
    sessions.current.set(form, s);
    return s;
  };
  const updateStation = (form: string, id: string, body: unknown) =>
    sendKeyed(sessions.current.get(form) ?? openSession(form), body, (idempotencyKey) =>
      stationService.updateStation(id, body, { idempotencyKey }),
    );

  // In-page forms (#604): each edits a draft of the saved station and shows
  // the unsaved-changes bar while the draft differs from it. Their Panels are
  // `overflow-visible` so the bar can stick (a clipping Panel would hold it).
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingDecantation, setSavingDecantation] = useState(false);
  const [general, setGeneral] = useState(() => generalDraftOf(selectedStation));
  const setGeneralField = <K extends keyof GeneralDraft>(key: K, value: GeneralDraft[K]) =>
    setGeneral((d) => ({ ...d, [key]: value }));
  const generalDirty = draftDiffers(general, generalDraftOf(selectedStation));
  const discardGeneral = () => {
    openSession('general');
    setGeneral(generalDraftOf(selectedStation));
  };
  // Legal / branding (letterhead for reports & invoices)
  const [branding, setBranding] = useState(() => brandingDraftOf(selectedStation));
  const setBrandingField = <K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) =>
    setBranding((d) => ({ ...d, [key]: value }));
  const brandingDirty = draftDiffers(branding, brandingDraftOf(selectedStation));
  const discardBranding = () => {
    openSession('branding');
    setBranding(brandingDraftOf(selectedStation));
  };
  const { name, code, address, phone, graceMinutes, timezone, businessDayStartsAt } = general;
  const { onboardingStatus } = general;
  const { legalName, gstin, stateCode, legalAddress, pincode, roCode, fuelBrand, logoDataUrl } =
    branding;
  const storedDecantationSettings = resolveDecantationSettings(selectedStation?.settings);
  const [decantationDraft, setDecantationDraft] = useState<{
    stationId: string;
    values: typeof storedDecantationSettings;
  } | null>(null);
  const decantationSettings =
    decantationDraft && decantationDraft.stationId === selectedStation?.id
      ? decantationDraft.values
      : storedDecantationSettings;
  const decantationDirty = draftDiffers(decantationSettings, storedDecantationSettings);
  const discardDecantation = () => {
    openSession('decantation');
    setDecantationDraft(null);
  };
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
      const updated = await updateStation('general', selectedStation.id, {
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
      // The saved station is the new baseline (the code comes back upper-case).
      setGeneral(generalDraftOf(updated));
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
      const updated = await updateStation('branding', selectedStation.id, {
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
      setBranding(brandingDraftOf(updated));
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
      const updated = await updateStation('decantation', selectedStation.id, {
        settings: {
          ...(selectedStation.settings || {}),
          ...parsed.data,
        },
      });
      onStationSelected(updated);
      setDecantationDraft(null);
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
      const updated = await updateStation('tank-levels', selectedStation.id, {
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

  const canRules = userRole === 'Owner' || userRole === 'Manager';
  const fuelProducts = (productsQ.data ?? []).filter((product) => product.productType === 'FUEL');
  const canAddInfrastructure = canManageInfrastructure(userRole);
  const canAddProduct = canManageProduct(userRole);
  // The one page primary, the same on every tab (#537 review): Add ▾.
  const actions =
    selectedStation && (canAddInfrastructure || canAddProduct) ? (
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Icon name="plus" size="sm" />}
            rightIcon={<Icon name="chevron-down" size="sm" />}
          >
            Add
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          {canAddInfrastructure && (
            <>
              <MenuItem icon={<ConceptIcon concept="tanks" />} onSelect={() => requestAdd('tank')}>
                Tank
              </MenuItem>
              <MenuItem
                icon={<ConceptIcon concept="dispensers" />}
                onSelect={() => requestAdd('dispenser')}
              >
                Dispenser
              </MenuItem>
            </>
          )}
          {canAddProduct && (
            <MenuItem
              icon={<ConceptIcon concept="products" />}
              onSelect={() => requestAdd('product')}
            >
              Product
            </MenuItem>
          )}
          {canAddInfrastructure && (
            <>
              <MenuItem
                icon={<ConceptIcon concept="payment-terminals" />}
                onSelect={() => requestAdd('terminal')}
              >
                Payment terminal
              </MenuItem>
              <MenuItem
                icon={<ConceptIcon concept="shift-templates" />}
                onSelect={() => requestAdd('shift')}
              >
                Shift template
              </MenuItem>
            </>
          )}
          {canAddProduct && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<Icon name="upload" size="sm" />}
                onSelect={() => requestAdd('import')}
              >
                Import products (CSV)
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    ) : undefined;

  return (
    <PageFrame
      route={ROUTES.station}
      subtitle={SUBTITLE}
      actions={actions}
      tabs={
        selectedStation ? (
          <Tabs
            id="station-setup"
            aria-label="Station setup"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as StationTab)}
            tabs={[
              { id: 'general', label: 'General', concept: 'general' },
              { id: 'business', label: 'Branding', concept: 'branding' },
              { id: 'products', label: 'Products', concept: 'products' },
              { id: 'tanks', label: 'Tanks', concept: 'tanks' },
              { id: 'dispensers', label: 'Dispensers', concept: 'dispensers' },
              { id: 'terminals', label: 'Payment terminals', concept: 'payment-terminals' },
              { id: 'shifts', label: 'Shift templates', concept: 'shift-templates' },
              ...(canRules
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
        <div {...tabPanelProps('station-setup', activeTab)}>
          {/* The station list drives the default station: its failure shows Retry here. */}
          <DataSection
            title="station"
            query={stationsQ}
            placeholderHeight={240}
            shape="cards"
            className="flex flex-col gap-6"
          >
            {/* Report templates carry their own panels (moved from Reports, #540). */}
            {activeTab === 'report-templates' && canManageReportTemplates(userRole) && (
              <ReportTemplatesPanel selectedStation={selectedStation} />
            )}

            {activeTab === 'general' && (
              <section className="flex flex-col gap-2">
                <SectionHeader title="Station details" />
                <Panel className="overflow-visible">
                  <Form
                    onSubmit={handleSaveGeneral}
                    onSubmittingChange={setSavingGeneral}
                    aria-label="Station details"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex max-w-[600px] flex-col gap-1">
                      <div className="grid grid-cols-2 gap-x-4">
                        <Field label="Station name" required>
                          <TextInput
                            value={name}
                            onChange={(e) => setGeneralField('name', e.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Station code" required>
                          <TextInput
                            value={code}
                            onChange={(e) => setGeneralField('code', e.target.value)}
                            required
                          />
                        </Field>
                      </div>
                      <Field label="Address">
                        <TextInput
                          value={address}
                          onChange={(e) => setGeneralField('address', e.target.value)}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-x-4">
                        <Field label="Contact phone">
                          <TextInput
                            value={phone}
                            onChange={(e) => setGeneralField('phone', e.target.value)}
                          />
                        </Field>
                        <Field label="Shift grace period (minutes)">
                          <TextInput
                            type="number"
                            min="0"
                            className="font-mono"
                            value={graceMinutes}
                            onChange={(e) =>
                              setGeneralField('graceMinutes', parseInt(e.target.value))
                            }
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4">
                        <Field
                          label="Timezone"
                          hint="Used to decide which calendar day operations belong to."
                        >
                          <Select
                            value={timezone}
                            onChange={(e) => setGeneralField('timezone', e.target.value)}
                          >
                            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                            <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                            <option value="Asia/Colombo">Asia/Colombo</option>
                            <option value="Asia/Kathmandu">Asia/Kathmandu</option>
                            <option value="Asia/Dhaka">Asia/Dhaka</option>
                            <option value="UTC">UTC</option>
                          </Select>
                        </Field>
                        <Field
                          label="Business day starts at"
                          hint="A fuel day commonly runs 06:00 → 06:00. Activity before this rolls to the previous day."
                        >
                          <TextInput
                            type="time"
                            className="font-mono"
                            value={businessDayStartsAt}
                            onChange={(e) => setGeneralField('businessDayStartsAt', e.target.value)}
                          />
                        </Field>
                      </div>
                      <Field label="Onboarding status" className="max-w-[300px]">
                        <Select
                          value={onboardingStatus}
                          onChange={(e) => setGeneralField('onboardingStatus', e.target.value)}
                        >
                          <option value="NOT_STARTED">Not started</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="READY_FOR_OPERATIONS">Ready for operations</option>
                        </Select>
                      </Field>
                    </div>
                    <UnsavedChangesBar
                      dirty={generalDirty}
                      saving={savingGeneral}
                      onDiscard={discardGeneral}
                    />
                  </Form>
                </Panel>
              </section>
            )}

            {activeTab === 'business' && (
              <section className="flex flex-col gap-2">
                <SectionHeader
                  title="Business, tax and branding"
                  subtitle="The letterhead on reports and invoices"
                />
                <Panel className="overflow-visible">
                  <Form
                    onSubmit={handleSaveBusiness}
                    onSubmittingChange={setSavingBranding}
                    aria-label="Business, tax and branding"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex max-w-[600px] flex-col gap-3">
                      <h3 className="text-[12px] font-semibold text-ink-strong">
                        Legal and tax (report letterhead)
                      </h3>
                      <div className="grid grid-cols-2 gap-x-4">
                        <Field label="Legal / trade name">
                          <TextInput
                            value={legalName}
                            onChange={(e) => setBrandingField('legalName', e.target.value)}
                            placeholder="e.g. Sri Lakshmi Fuels"
                          />
                        </Field>
                        <Field label="GSTIN">
                          <TextInput
                            className="font-mono"
                            value={gstin}
                            onChange={(e) =>
                              setBrandingField('gstin', e.target.value.toUpperCase())
                            }
                            placeholder="29ABCDE1234F1Z5"
                            maxLength={15}
                          />
                        </Field>
                        <Field label="State code (place of supply)">
                          <TextInput
                            className="font-mono"
                            value={stateCode}
                            onChange={(e) => setBrandingField('stateCode', e.target.value)}
                            placeholder="e.g. 29 (Karnataka)"
                            maxLength={2}
                          />
                        </Field>
                        <Field label="Retail outlet / dealer code">
                          <TextInput
                            value={roCode}
                            onChange={(e) => setBrandingField('roCode', e.target.value)}
                            placeholder="RO / dealership code"
                          />
                        </Field>
                        <Field label="Address line">
                          <TextInput
                            value={legalAddress}
                            onChange={(e) => setBrandingField('legalAddress', e.target.value)}
                            placeholder="Street, area, city"
                          />
                        </Field>
                        <Field label="Pincode">
                          <TextInput
                            className="font-mono"
                            value={pincode}
                            onChange={(e) => setBrandingField('pincode', e.target.value)}
                            placeholder="560001"
                            maxLength={6}
                          />
                        </Field>
                      </div>

                      <h3 className="border-t border-border-soft pt-3 text-[12px] font-semibold text-ink-strong">
                        Branding
                      </h3>
                      <div className="grid grid-cols-2 gap-x-4">
                        <Field label="Fuel company / brand">
                          <Select
                            value={fuelBrand}
                            onChange={(e) => setBrandingField('fuelBrand', e.target.value)}
                          >
                            <option value="">— Select —</option>
                            <option value="Indian Oil">Indian Oil (IOCL)</option>
                            <option value="Bharat Petroleum">Bharat Petroleum (BPCL)</option>
                            <option value="Hindustan Petroleum">Hindustan Petroleum (HPCL)</option>
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
                          <div className="flex items-center gap-2.5">
                            {logoDataUrl && (
                              <img
                                src={logoDataUrl}
                                alt="logo"
                                className="size-9 rounded border border-border-soft object-contain"
                              />
                            )}
                            <input
                              type="file"
                              aria-label="Logo file"
                              accept="image/png,image/jpeg"
                              className="sr-only"
                              ref={logoInputRef}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () =>
                                  setBrandingField(
                                    'logoDataUrl',
                                    typeof reader.result === 'string' ? reader.result : null,
                                  );
                                reader.readAsDataURL(file);
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => logoInputRef.current?.click()}
                            >
                              {logoDataUrl ? 'Replace' : 'Upload logo'}
                            </Button>
                            {logoDataUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => setBrandingField('logoDataUrl', null)}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </Field>
                      </div>
                      <p className="text-[12px] text-ink-muted">
                        Report paper size and which sections print on each report are set in Station
                        › Report templates.
                      </p>
                    </div>
                    <UnsavedChangesBar
                      dirty={brandingDirty}
                      saving={savingBranding}
                      onDiscard={discardBranding}
                    />
                  </Form>
                </Panel>
              </section>
            )}

            {activeTab === 'rules' && canRules && (
              <>
                {/* Tank levels sit above the decantation tolerances (Station › Rules, #520). */}
                <TankLevelSettingsPanel
                  key={selectedStation.id}
                  value={resolveTankLevelSettings(selectedStation.settings)}
                  canEdit={canManageTankLevels(userRole)}
                  onSave={handleSaveTankLevels}
                />
                <section className="flex flex-col gap-2">
                  <SectionHeader
                    title="Decantation guidance"
                    subtitle="Flags readings for review; never blocks an operation"
                  />
                  <Panel className="overflow-visible">
                    <Form
                      onSubmit={handleSaveDecantation}
                      onSubmittingChange={setSavingDecantation}
                      aria-label="Decantation guidance"
                      className="flex max-w-[760px] flex-col gap-3"
                    >
                      <div className="grid grid-cols-2 gap-x-4">
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
                            className="font-mono"
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
                            className="font-mono"
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
                            className="font-mono"
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

                      <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
                        <h3 className="text-[12px] font-semibold text-ink-strong">
                          Product density bands at 15 °C
                        </h3>
                        <p className="text-[12px] text-ink-muted">
                          Optional product-specific bounds in kg/m³. Leave both fields blank for no
                          band.
                        </p>
                        <DataSection
                          title="fuel products"
                          query={productsQ}
                          placeholderHeight={80}
                          shape="bare"
                          isEmpty={fuelProducts.length === 0}
                          empty={
                            <p className="text-[12px] text-ink-muted">
                              No fuel products are set up for this station.
                            </p>
                          }
                        >
                          {fuelProducts.map((product) => {
                            const band = decantationSettings.densitySpecBands[product.id] ?? {};
                            return (
                              <div
                                key={product.id}
                                className="grid grid-cols-[minmax(180px,1fr)_1fr_1fr] items-end gap-3"
                              >
                                <span className="pb-6 text-[13px] text-ink">{product.name}</span>
                                <Field label="Minimum (kg/m³)">
                                  <TextInput
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    className="font-mono"
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
                                    className="font-mono"
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
                        </DataSection>
                      </div>

                      <UnsavedChangesBar
                        dirty={decantationDirty}
                        saving={savingDecantation}
                        onDiscard={discardDecantation}
                      />
                    </Form>
                  </Panel>
                </section>
              </>
            )}

            {activeTab === 'products' && (
              <ProductsCatalog
                selectedStation={selectedStation}
                {...requestFor('product')}
                importRequest={addRequest?.kind === 'import' ? addRequest.at : undefined}
                onImportHandled={() => setAddRequest(null)}
              />
            )}
            {activeTab === 'tanks' && (
              <TanksGrid stationId={selectedStation.id} {...requestFor('tank')} />
            )}
            {activeTab === 'dispensers' && (
              <DispensersList stationId={selectedStation.id} {...requestFor('dispenser')} />
            )}
            {activeTab === 'terminals' && (
              <PaymentTerminalsPanel stationId={selectedStation.id} {...requestFor('terminal')} />
            )}
            {activeTab === 'shifts' && <ShiftTemplates {...requestFor('shift')} />}
          </DataSection>
        </div>
      ) : (
        <DataSection title="stations" query={stationsQ} placeholderHeight={240}>
          <EmptyState
            icon={<ConceptIcon concept="stations" />}
            title="No station selected"
            description="Please select or initialize a station location first."
          />
        </DataSection>
      )}
    </PageFrame>
  );
};

const SUBTITLE = 'Products, tanks, dispensers, terminals, shifts and station rules.';

type AddKind = 'tank' | 'dispenser' | 'product' | 'terminal' | 'shift' | 'import';

/** The tab each Add ▾ pick opens. */
const ADD_TAB: Record<AddKind, StationTab> = {
  tank: 'tanks',
  dispenser: 'dispensers',
  product: 'products',
  terminal: 'terminals',
  shift: 'shifts',
  import: 'products',
};

type StationTab =
  | 'general'
  | 'business'
  | 'rules'
  | 'products'
  | 'tanks'
  | 'dispensers'
  | 'terminals'
  | 'shifts'
  | 'report-templates';
