export * from './components/StatusBadge.js';
export * from './components/SyncIndicator.js';
export * from './components/AppShell.js';
export * from './components/Drawer.js';
export { ErrorBoundary } from './components/ErrorBoundary.js';
export { Login } from './components/Auth/Login.js';
export { OnboardingWizard } from './components/StationSetup/OnboardingWizard.js';
export { StationOverview } from './components/StationSetup/StationOverview.js';
export { FuelPricingPanel } from './components/StationSetup/FuelPricingPanel.js';
export { DashboardOverview } from './components/Dashboard/DashboardOverview.js';
export { ShiftsManagement } from './components/Shifts/ShiftsManagement.js';
export { ShiftSummaryView } from './components/Shifts/ShiftSummaryView.js';
export { ShiftTransactionsPanel } from './components/Shifts/ShiftTransactionsPanel.js';
export { ExpensesList } from './components/ExpensesList.js';
export { PurchasesList } from './components/PurchasesList.js';
export { CustomersList } from './components/CustomersList.js';
export { InventoryList } from './components/InventoryList.js';
export { LoadingSpinner } from './components/LoadingSpinner.js';
export { ReportsOverview } from './components/ReportsOverview.js';
export { supabase } from './services/supabase.js';
export * from './services/cloud.js';
export { exportReportPdf, exportReactPdf, setPdfSaver } from './services/exportPdf.js';
export {
  DEFAULT_SHIFT_SUMMARY_CONFIG, DEFAULT_DSSR_CONFIG,
  SHIFT_SUMMARY_SECTION_LABELS, DSSR_SECTION_LABELS,
} from './services/reports/reportConfig.js';
export { letterheadFromStation } from './services/reports/letterhead.js';
export { LedgerView } from './components/ledger/LedgerView.js';
export { DesignSystem } from './components/DesignSystem.js';

// Data layer (TanStack Query) + shared primitives
export * from './query/queryClient.js';
export * from './query/hooks.js';
export { PageLayout } from './components/primitives/PageLayout.js';
export type { PageLayoutProps } from './components/primitives/PageLayout.js';
export { KpiCard } from './components/primitives/KpiCard.js';
export type { KpiCardProps, KpiTone } from './components/primitives/KpiCard.js';
export { DataTable } from './components/primitives/DataTable.js';
export type { DataTableProps } from './components/primitives/DataTable.js';
export { Tabs } from './components/primitives/Tabs.js';
export type { TabsProps, TabItem } from './components/primitives/Tabs.js';
export { ConfirmProvider, useConfirm } from './components/primitives/ConfirmDialog.js';
export type { ConfirmOptions } from './components/primitives/ConfirmDialog.js';
export { ToastProvider, useToast } from './components/primitives/ToastProvider.js';
export type { ToastApi, ToastVariant, ToastOptions } from './components/primitives/ToastProvider.js';
export { Skeleton, SkeletonCard, SkeletonGrid } from './components/primitives/Skeleton.js';
export { Field, TextInput, NumberInput, MoneyInput, Textarea, Select } from './components/primitives/Field.js';
export type { FieldProps, TextInputProps, NumberInputProps, TextareaProps, SelectProps } from './components/primitives/Field.js';
export { formatMoney, inr, formatQty } from './utils/format.js';

