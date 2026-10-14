import type { IconName } from './registry.js';

/**
 * One icon per concept (#540, #523): a concept shows the same glyph wherever
 * it appears — sidebar, page tabs, the Reports sub-navigation and the command
 * palette. "Tanks" in Inventory and "Tanks" in Station are the same concept, so
 * they read the same entry here.
 *
 * Picked for review (no obvious glyph): branding → palette, rules → sliders,
 * report templates → layout.
 */
export const CONCEPT_ICON = {
  // Sidebar pages
  dashboard: 'dashboard',
  shifts: 'pump',
  inventory: 'package',
  pricing: 'tag',
  suppliers: 'truck',
  'expenses-page': 'arrow-up',
  'income-page': 'arrow-down',
  reports: 'file-text',
  insights: 'chart',
  station: 'settings',
  organization: 'organization',

  // Shifts
  'live-shift': 'pump',
  'business-days': 'calendar',
  history: 'clock',

  // Inventory
  tanks: 'tank',
  decantations: 'truck',
  density: 'gauge',
  'product-stock': 'package',
  movements: 'arrow-left-right',
  reconciliations: 'scale',

  // Pricing
  fuels: 'droplet',
  products: 'package',

  // Customers
  customers: 'users',
  'credit-sales': 'credit-card',
  collections: 'wallet',
  vehicles: 'car',

  // Sales (quick entry)
  'product-sales': 'shopping-bag',

  // Suppliers
  'supplier-list': 'building',
  purchases: 'cart',
  payments: 'wallet',

  // Accounts
  accounts: 'bank',
  'daily-cash-book': 'book-open',
  transfers: 'arrow-left-right',

  // Expenses / Income
  expenses: 'receipt',
  income: 'arrow-down',
  'by-category': 'pie',

  // Station
  general: 'info',
  branding: 'palette',
  dispensers: 'dispenser',
  'payment-terminals': 'card',
  'shift-templates': 'clock',
  rules: 'sliders',
  'report-templates': 'layout',

  // Organization
  stations: 'map-pin',
  team: 'team',
  activity: 'activity',
  profile: 'user',
  'desktop-app': 'monitor',

  // Reports
  dssr: 'file-text',
  'attendant-handovers': 'clipboard',
  'profit-loss': 'trending-up',
  ledgers: 'book-open',
  invoices: 'file',
  gst: 'percent',
  'expense-register': 'receipt',
} as const satisfies Record<string, IconName>;

export type Concept = keyof typeof CONCEPT_ICON;
