import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudStationService } from '../../services/cloud.js';
import { queryKeys, useProducts, useStations } from '../../query/hooks.js';
import {
  canManageInfrastructure,
  canManageProduct,
  canManageTankLevels,
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
import { useToast } from '../primitives/ToastProvider.js';
import {
  Button,
  EmptyState,
  DataSection,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  UnsavedSectionsBar,
  UnsavedSectionsProvider,
  guardLeave,
  useHasUnsavedChanges,
} from '../../pump-ds/index.js';
import { ConceptIcon } from '../../pump-ds/icon/ConceptIcon.js';
import { PaymentTerminalsPanel } from './PaymentTerminalsPanel.js';
import { TankLevelSettingsPanel } from './TankLevelSettingsPanel.js';
import { StationDetailsForm } from './StationDetailsForm.js';
import { StationBrandingForm } from './StationBrandingForm.js';
import { DecantationGuidanceForm } from './DecantationGuidanceForm.js';
import { useRunTask } from '../../utils/runTask.js';
import { ReportTemplatesPanel } from '../reports/templates/ReportTemplatesPanel.js';
import { newerStation } from './stationForms.js';
import {
  officeSubmitKeys,
  sendKeyed,
  type SubmitKeySession,
} from '../../office-records/submitKeys.js';

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
  // The Add ▾ menu picks a tab and asks it to open its add drawer (#537 review).
  const [addRequest, setAddRequest] = useState<{ kind: AddKind; at: number } | null>(null);
  const requestAdd = (kind: AddKind) =>
    guardLeave(() => {
      setActiveTab(ADD_TAB[kind]);
      setAddRequest({ kind, at: Date.now() });
    });
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

  /**
   * One in-page form's save (#604): its body under the form's key, the parent
   * told of the saved station, and the station list refreshed in the
   * background. A failure rejects, so the form's section shows it and stays
   * changed.
   */
  // The last station the server returned: every section's body is built on it,
  // so saving several sections in a row never sends stale settings back.
  const latestStation = useRef(selectedStation);
  useEffect(() => {
    // A prop older than what a save just returned (the station list not yet
    // refetched) must not replace it.
    latestStation.current = newerStation(latestStation.current, selectedStation);
  }, [selectedStation]);
  const saveForm = async (
    form: string,
    build: (saved: Station) => unknown,
    saved: string,
  ): Promise<Station> => {
    const base = latestStation.current;
    if (!base) throw new Error('Select a station first.');
    const updated = await updateStation(form, base.id, build(base));
    // The next section in the same Save builds on this one (#604 review).
    latestStation.current = updated;
    onStationSelected(updated);
    runTask(loadStations(), 'Saved, but the station list could not be refreshed.');
    toast.success(saved);
    return updated;
  };

  /**
   * Tank levels colour every tank on every screen (#520). The server refuses
   * anyone but an Owner or Manager; the station list is invalidated (not
   * awaited) so the Dashboard, alerts and Inventory pick the change up.
   */
  const handleSaveTankLevels = async (tankLevels: TankLevelSettings) => {
    await saveForm(
      'tank-levels',
      (saved) => ({
        settings: { ...(saved.settings || {}), [TANK_LEVEL_SETTINGS_KEY]: tankLevels },
      }),
      'Tank levels saved.',
    );
  };

  // Leaving a tab with unsaved changes asks first (#604).
  const changeTab = (tab: StationTab) => guardLeave(() => setActiveTab(tab));
  // While a form is changed, its bar's Save is the page's one primary.
  const formChanged = useHasUnsavedChanges();

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
            variant={formChanged ? 'secondary' : 'primary'}
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
    <UnsavedSectionsProvider>
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
              onChange={(id) => changeTab(id as StationTab)}
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
                <>
                  <StationDetailsForm
                    station={selectedStation}
                    onSave={(build) => saveForm('general', build, 'Station details saved.')}
                    onDiscard={() => openSession('general')}
                  />
                  <UnsavedSectionsBar />
                </>
              )}

              {activeTab === 'business' && (
                <>
                  <StationBrandingForm
                    station={selectedStation}
                    onSave={(build) => saveForm('branding', build, 'Business details saved.')}
                    onDiscard={() => openSession('branding')}
                  />
                  <UnsavedSectionsBar />
                </>
              )}

              {activeTab === 'rules' && canRules && (
                <>
                  {/* Tank levels sit above the decantation tolerances (Station › Rules, #520).
                    One bar for both: "2 sections changed" (#604). */}
                  <TankLevelSettingsPanel
                    key={selectedStation.id}
                    value={resolveTankLevelSettings(selectedStation.settings)}
                    canEdit={canManageTankLevels(userRole)}
                    onSave={handleSaveTankLevels}
                    onDiscard={() => openSession('tank-levels')}
                  />
                  <DecantationGuidanceForm
                    station={selectedStation}
                    fuelProducts={fuelProducts}
                    productsQuery={productsQ}
                    onSave={(build) =>
                      saveForm('decantation', build, 'Decantation settings saved.')
                    }
                    onDiscard={() => openSession('decantation')}
                  />
                  <UnsavedSectionsBar />
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
    </UnsavedSectionsProvider>
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
