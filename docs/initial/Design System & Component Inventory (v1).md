## Purpose

This document defines:

- Visual design language
    
- Reusable UI components
    
- Layout standards
    
- Interaction patterns
    

Goals:

- Consistency
    
- Reusability
    
- Fast development
    
- Minimal cognitive load
    

---

# Design Philosophy

Inspired by:

```text
Notion
Linear
Atlassian
Stripe Dashboard
```

Avoid:

```text
Traditional ERP UI
Tally-style screens
SAP-style complexity
```

---

# Core Design Principles

## Principle 1: Information First

Show:

```text
Status
Numbers
Actions
```

before decorative visuals.

---

## Principle 2: One Primary Action

Every screen should answer:

```text
What is the main thing I should do here?
```

---

## Principle 3: Progressive Disclosure

Show:

```text
Essential
↓
Advanced
```

Not everything at once.

---

## Principle 4: Side Drawers Over Modals

Prefer:

```text
List
↓
Click
↓
Drawer Opens
```

instead of:

```text
Popup
Popup
Popup
```

---

# Design Tokens

## Typography

```text
Font: Inter

Heading XL
32

Heading L
24

Heading M
20

Body
14

Caption
12
```

---

## Border Radius

```text
Cards
12px

Inputs
10px

Buttons
10px
```

---

## Spacing

Use:

```text
8px Grid System
```

Examples:

```text
8
16
24
32
48
64
```

---

# Color Philosophy

Mostly neutral.

Semantic colors only.

---

## Success

```text
Green
```

Examples:

```text
Shift Open
Synced
Paid
```

---

## Warning

```text
Amber
```

Examples:

```text
Variance
Offline
```

---

## Danger

```text
Red
```

Examples:

```text
Failed Sync
Critical Variance
```

---

# Layout System

## App Shell

Reusable across all screens.

```text
Top Bar

Left Navigation

Content Area
```

Component:

```text
AppShell
```

---

## Page Layout

Reusable wrapper.

Component:

```text
PageLayout
```

Contains:

```text
Title
Actions
Content
```

---

# Component Inventory

---

# Navigation Components

## Sidebar

Component:

```text
Sidebar
```

Features:

```text
Collapsible

Sections

Role Aware
```

---

## SidebarSection

Example:

```text
Operations

Inventory

Reports
```

---

## NavigationItem

Example:

```text
Expenses
Customers
DSSR
```

---

# Header Components

## TopBar

Contains:

```text
Search

Notifications

Profile

Sync Status
```

---

## PageHeader

Contains:

```text
Title

Subtitle

Actions
```

Example:

```text
Expenses

+ New Expense
```

---

# Status Components

These will be used everywhere.

---

## StatusBadge

Examples:

```text
Open
Closed
Locked

Paid
Pending

Online
Offline
```

---

## SyncIndicator

Examples:

```text
Synced

Pending

Failed

Offline
```

Critical for Tauri.

---

# Data Display Components

---

## KPI Card

Component:

```text
KpiCard
```

Examples:

```text
Sales

Cash

Credit

Variance
```

---

## Metric Group

Multiple KPI cards.

Example:

```text
Dashboard
DSSR
```

---

## Summary Card

Displays:

```text
Title

Value

Trend
```

---

# Table Components

---

## DataTable

Based on:

```text
TanStack Table
```

Reusable everywhere.

Examples:

```text
Customers

Purchases

Expenses
```

---

## TableToolbar

Contains:

```text
Search

Filters

Export
```

---

## EmptyState

Examples:

```text
No Expenses

No Customers
```

---

# Form Components

---

## FormShell

Reusable form layout.

Contains:

```text
Header

Body

Footer
```

---

## FormSection

Groups fields.

Example:

```text
Customer Details

Credit Settings
```

---

## FormField

Wrapper for:

```text
Input

Select

Date

Number
```

---

## CurrencyInput

Reusable.

Used in:

```text
Expenses

Purchases

Collections
```

---

## QuantityInput

Used in:

```text
Sales

Inventory
```

---

## ProductSelector

Reusable lookup.

---

## CustomerSelector

Reusable lookup.

---

## SupplierSelector

Reusable lookup.

---

# Overlay Components

---

## Drawer

Primary editing pattern.

Examples:

```text
Edit Customer

Edit Expense

Edit Product
```

---

## ConfirmDialog

Only for destructive actions.

Examples:

```text
Archive Customer

Delete Draft
```

---

# Shift Components

Most important domain components.

---

## ShiftCard

Displays:

```text
Shift Name

Status

Duration
```

---

## ShiftSummary

Displays:

```text
Sales

Cash

Expenses

Collections
```

---

## ShiftTimeline

Displays:

```text
Open

Transactions

Close
```

---

# Nozzle Components

---

## DU Card

Displays:

```text
DU Name

Assigned Staff
```

---

## NozzleReadingCard

Displays:

```text
Opening

Closing

Volume Sold
```

---

## ReadingEntryGrid

Grouped by DU.

---

# Financial Components

---

## ExpenseCard

---

## PurchaseCard

---

## CollectionCard

---

## TransactionHistory

Shared across:

```text
Customers
Suppliers
```

---

# CRM Components

---

## CustomerCard

---

## CustomerSummary

Displays:

```text
Outstanding

Credit Limit

Last Payment
```

---

## SupplierCard

---

## StatementViewer

Shared component.

---

# Inventory Components

---

## StockCard

Displays:

```text
Product

Available Stock
```

---

## TankCard

Displays:

```text
Tank

Capacity

Current Stock
```

---

## VarianceCard

Displays:

```text
Expected

Actual

Variance
```

---

# Reporting Components

---

## DSSRSummary

Hero component.

Displays:

```text
Sales

Expenses

Collections

Variance
```

---

## ReportFilters

Reusable.

Examples:

```text
Date Range

Product

Customer
```

---

## ExportActions

Reusable.

Supports:

```text
Excel

PDF
```

---

# Audit Components

---

## AuditTimeline

Displays:

```text
Who

What

When
```

---

## EventViewer

Displays:

```text
Business Events

Sync Events
```

---

# Mobile Components

Keep minimal.

---

## MobileDashboard

---

## MobileDSSR

---

## MobileReports

---

# State Management Strategy

Use:

```text
TanStack Query
```

For:

```text
Server State
```

---

Use:

```text
Zustand
```

For:

```text
UI State

Sidebar

Filters

Preferences
```

---

Use:

```text
React Hook Form
```

For:

```text
Forms
```

---

# Recommended UI Stack

```text
React
TypeScript

shadcn/ui

Tailwind CSS

TanStack Query
TanStack Table

React Hook Form
Zod

Zustand

Lucide Icons
```

---

# UI Architecture Principles

1. Every screen uses AppShell.
    
2. Every CRUD screen uses DataTable + Drawer.
    
3. Every form uses FormShell.
    
4. Side drawers are preferred over modals.
    
5. KPI cards are used for summaries.
    
6. Tables are used only where comparison matters.
    
7. Cards are preferred for operational workflows.
    
8. Sync status is always visible.
    
9. Mobile remains monitoring-focused.
    
10. New features must be built from existing components before introducing new UI patterns.
    

---
