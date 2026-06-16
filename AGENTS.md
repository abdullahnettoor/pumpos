# Fuel Pump ERP

This document defines the architectural, business, and engineering rules that all AI agents and contributors must follow when working on this repository.

---

# Project Overview

Fuel Pump ERP is a multi-tenant fuel station management platform designed primarily for Indian fuel stations.

Primary goals:

* Operational simplicity
* Offline resilience
* Strong auditability
* Multi-tenant isolation
* Fast desktop experience
* Future extensibility

This is NOT a POS system.

This is NOT a traditional accounting package.

This is an operational ERP focused on fuel station management.

---

# Core Architecture Principles

## Shift-Centric System

The entire platform revolves around shifts.

Operational flow:

```text
Shift
 ↓
Operations
 ↓
DSSR
 ↓
Reports
```

All operational transactions MUST belong to a shift.

Examples:

* Expenses
* Purchases
* Collections
* Credit Sales
* Manual Sales
* Nozzle Readings
* Variance Records

Never create operational transactions that exist outside a shift.

---

## Cloud Authoritative Architecture

Source of truth:

```text
Supabase PostgreSQL
```

Offline cache:

```text
SQLite
```

Rules:

* PostgreSQL is authoritative.
* SQLite is an operational cache.
* SQLite is never the final source of truth.
* Sync eventually reconciles local events to cloud.

---

## Event Driven Architecture

Every meaningful business action should generate a business event.

Examples:

```text
SHIFT_OPENED
SHIFT_CLOSED
EXPENSE_RECORDED
PURCHASE_RECORDED
SALE_RECORDED
DSSR_GENERATED
```

Business events:

* Drive synchronization
* Drive auditing
* Drive reporting

Do not bypass event creation.

---

# Domain Rules

## Fuel Sales

Fuel sales are derived from:

```text
Nozzle Readings
```

NOT from manual sales entries.

Formula:

```text
Volume Sold =
Closing Reading
-
Opening Reading
```

Opening readings should default from previous closing readings.

---

## Manual Sales

Manual sales are used for:

```text
Engine Oil
Coolant
Grease
Accessories
```

Manual sales are separate from fuel sales.

---

## DSSR

DSSR is a snapshot.

Rules:

* Generated during shift close.
* Stored permanently.
* Never recalculated historically.
* Never modified after generation.

---

## Variance

Variance is a first-class business concept.

Track:

```text
Expected Stock
Actual Stock
Variance
Reason
```

Never hide variance calculations inside reports.

---

# Data Modeling Rules

## IDs

Use UUIDs everywhere.

Never use document numbers as identifiers.

Example:

```text
id = UUID

document_number = SAL-000123
```

---

## Soft Deletes

Prefer:

```text
is_active
archived_at
```

Avoid physical deletion.

Historical data is important.

---

## Metadata Strategy

Frequently queried fields:

Use explicit columns.

Examples:

```text
product_type
customer_type
amount
quantity
```

Rarely queried fields:

Use JSONB.

Examples:

```text
Tax Configuration
HSN Codes
GST Metadata
Integration Settings
```

Do not create columns for every future tax requirement.

---

# Multi-Tenancy Rules

Every business table must include:

```text
organization_id
```

Most operational tables should also include:

```text
station_id
```

Never write queries that can leak tenant data.

Assume Row-Level Security (RLS) is mandatory.

---

# Authorization Rules

Current MVP Roles:

```text
Owner
Manager
Accountant
Staff
```

Do not introduce additional roles unless explicitly requested.

Enterprise features may introduce:

```text
Custom Roles
Custom Permissions
```

---

# UI Design Principles

Inspiration:

* Notion
* Linear
* Atlassian
* Stripe Dashboard

Avoid:

* Traditional ERP layouts
* SAP-style interfaces
* Tally-style interfaces

---

## UI Philosophy

Prefer:

```text
Clean
Compact
Information Dense
Fast
```

Avoid:

```text
Cluttered
Modal-heavy
Deeply Nested
```

---

## Layout

Use:

```text
Sidebar
Top Bar
Content Area
```

Do not introduce multiple navigation systems.

---

## Forms

Use:

```text
React Hook Form
Zod
```

Do not introduce alternative form libraries without discussion.

---

## Editing Pattern

Preferred:

```text
List
 ↓
Drawer
 ↓
Edit
```

Avoid modal-heavy workflows.

---

# Frontend Stack

Use:

```text
React
TypeScript
Vite
Tauri
Tailwind
shadcn/ui
TanStack Query
TanStack Table
React Hook Form
Zod
Zustand
```

Do not introduce additional state libraries unless justified.

---

# Backend Stack

Use:

```text
Hono
Drizzle
Supabase PostgreSQL
```

Prefer:

* Type-safe APIs
* Shared schemas
* Shared validation

---

# Database Rules

Never optimize prematurely.

Avoid:

```text
Summary Tables
Materialized Tables
Denormalization
```

unless performance proves necessary.

Current source of truth:

```text
stock_movements
```

for inventory.

---

# Offline Rules

Desktop supports offline mode.

Mobile does not.

Offline workflow:

```text
Create Event
 ↓
Store Locally
 ↓
Retry Sync
 ↓
Cloud Confirmation
```

Every sync operation must be idempotent.

---

# Sync Rules

Every business event must contain:

```text
event_id
event_type

organization_id
station_id

entity_type
entity_id
```

Duplicate events must be safe to replay.

---

# Code Quality Standards

## Prefer

Small functions.

Single responsibility.

Strong typing.

Reusable components.

Composition over inheritance.

---

## Avoid

Massive files.

Business logic inside React components.

Duplicated validation.

Direct database access from UI.

---

# Component Reuse Rules

Before creating a new component:

Check whether an existing component can be reused.

Examples:

```text
PageLayout
FormShell
Drawer
DataTable
StatusBadge
KpiCard
```

Prefer extending existing patterns.

---

# Reporting Rules

Reports should be generated from:

```text
Snapshots
Events
Operational Records
```

Never build reports using hardcoded calculations inside UI components.

---

# Future Expansion Principles

Future modules should extend the architecture.

Examples:

```text
Attendance
WhatsApp
GST Exports
Advanced Accounting
POS Integrations
Hardware Integrations
```

Do not redesign core entities when adding new modules.

Extend existing domain concepts.

---

# Contributor Rule

When implementing a feature:

1. Check Domain Model.
2. Check Event Model.
3. Check Database Schema.
4. Check Permissions Matrix.
5. Check Design System.

If a proposed implementation violates any of those documents, stop and revisit the architecture before coding.

Architecture decisions take precedence over implementation convenience.
