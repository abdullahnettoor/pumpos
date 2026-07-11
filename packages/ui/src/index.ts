export * from './components/StatusBadge.js';
export * from './components/SyncIndicator.js';
export * from './components/AppShell.js';
export { QuickEntryHost } from './quick-entry/QuickEntryHost.js';
export { openQuickEntry, closeQuickEntry, useQuickEntry } from './quick-entry/store.js';
export type { QuickEntryType, QuickEntryState } from './quick-entry/store.js';
export * from './components/Drawer.js';
export { ErrorBoundary } from './components/ErrorBoundary.js';
export { Login } from './components/Auth/Login.js';
export { OnboardingWizard } from './components/StationSetup/OnboardingWizard.js';
export { clearStoredOnboardingDraft } from './components/StationSetup/onboardingDraft.js';
export { StationOverview } from './components/StationSetup/StationOverview.js';
export { OrganizationOverview } from './components/Organization/OrganizationOverview.js';export { FuelPricingPanel } from './components/StationSetup/FuelPricingPanel.js';
export { DashboardOverview } from './components/Dashboard/DashboardOverview.js';
export { ShiftsManagement } from './components/Shifts/ShiftsManagement.js';
export { ShiftSummaryView } from './components/Shifts/ShiftSummaryView.js';
export { ShiftTransactionsPanel } from './components/Shifts/ShiftTransactionsPanel.js';
export { ExpensesList } from './components/ExpensesList.js';
export { PurchasesList } from './components/PurchasesList.js';
export { CustomersList } from './components/CustomersList.js';
export { InventoryList } from './components/InventoryList.js';
export { AccountsPanel } from './components/finance/AccountsPanel.js';export { LoadingSpinner } from './components/LoadingSpinner.js';
export { ReportsOverview } from './components/ReportsOverview.js';
export { supabase } from './services/supabase.js';
export * from './services/cloud.js';
export { exportReportPdf, exportReactPdf, setPdfSaver } from './services/exportPdf.js';
export {
  DEFAULT_SHIFT_SUMMARY_CONFIG, DEFAULT_DSSR_CONFIG,
  SHIFT_SUMMARY_SECTION_LABELS, DSSR_SECTION_LABELS,
} from './services/reports/reportConfig.js';
export { letterheadFromStation } from './services/reports/letterhead.js';
export { LedgerView, computeLedgerRows } from './components/ledger/LedgerView.js';
export type { LedgerResolved, LedgerComputed, LedgerViewProps } from './components/ledger/LedgerView.js';
export { DesignSystem } from './components/DesignSystem.js';

// Data layer (TanStack Query) + shared primitives
export * from './query/queryClient.js';
export * from './query/hooks.js';
export { PageLayout } from './components/primitives/PageLayout.js';
export type { PageLayoutProps } from './components/primitives/PageLayout.js';
export { DataTable } from './components/primitives/DataTable.js';
export type { DataTableProps } from './components/primitives/DataTable.js';
export { Tabs } from './components/primitives/Tabs.js';
export type { TabsProps, TabItem } from './components/primitives/Tabs.js';
export { ConfirmProvider, useConfirm } from './components/primitives/ConfirmDialog.js';
export type { ConfirmOptions } from './components/primitives/ConfirmDialog.js';
export { ToastProvider, useToast } from './components/primitives/ToastProvider.js';
export type { ToastApi, ToastVariant, ToastOptions } from './components/primitives/ToastProvider.js';
export { Skeleton, SkeletonCard, SkeletonGrid } from './components/primitives/Skeleton.js';
export { Field, TextInput, NumberInput, MoneyInput, Textarea, Select, DateField } from './components/primitives/Field.js';
export type { FieldProps, TextInputProps, NumberInputProps, TextareaProps, SelectProps } from './components/primitives/Field.js';
export { DateRangeField, computeRange } from './components/primitives/DateRangeField.js';
export type { DateRangeFieldProps, DateRange, RangePreset, RangeClock } from './components/primitives/DateRangeField.js';
export { Checkbox, Switch } from './components/primitives/Toggle.js';
export type { CheckboxProps, SwitchProps } from './components/primitives/Toggle.js';
export { Tooltip } from './components/primitives/Tooltip.js';
export type { TooltipProps } from './components/primitives/Tooltip.js';
export { Menu, Popover } from './components/primitives/Menu.js';
export type { MenuProps, MenuItem, PopoverProps } from './components/primitives/Menu.js';
export { Segmented } from './components/primitives/Segmented.js';
export type { SegmentedProps, SegmentedOption } from './components/primitives/Segmented.js';
export { Combobox } from './components/primitives/Combobox.js';
export type { ComboboxProps, ComboboxOption } from './components/primitives/Combobox.js';
export { Banner } from './components/primitives/Banner.js';
export type { BannerProps, BannerSeverity } from './components/primitives/Banner.js';
export { useZodForm } from './forms/useZodForm.js';
export { formatMoney, inr, formatQty } from './utils/format.js';

