## Purpose

This document defines how the Fuel Pump ERP operates from a business and operational perspective.

It intentionally avoids implementation details and focuses on:

- Operational workflows
    
- Business rules
    
- Data ownership
    
- User responsibilities
    
- Product behavior
    

This document serves as the primary reference for product decisions.

---

# Product Vision

The platform is designed as an operational management system for fuel stations.

It is not intended to be a billing-first or POS-first solution.

The primary objective is to provide visibility and control over:

- Fuel sales
    
- Shift operations
    
- Stock movement
    
- Cash management
    
- Credit customers
    
- Expenses
    
- Station performance
    

---

# Organizational Structure

The system supports the following hierarchy:

```text
Organization
    ↓
Station
    ↓
Users
```

Example:

```text
ABC Fuels
 ├─ Station A
 ├─ Station B
 └─ Station C
```

Each station operates independently while remaining visible to organization-level users.

---

# User Roles

Initial system roles:

- Owner
    
- General Manager
    
- Manager
    
- Accountant
    
- Staff
    

Future versions may introduce:

- Auditor
    
- Regional Manager
    
- Multi-Station Supervisor
    

The permission model should remain flexible enough to support custom roles in the future.

---

# Core Operational Philosophy

## Shift-Based Operations

The system is centered around shifts.

Every business activity occurs within a shift.

Examples:

- Fuel sales
    
- Expenses
    
- Collections
    
- Credit sales
    
- Cash reconciliation
    

A shift represents the primary operational unit of the system.

---

# Fuel Sales Workflow

Fuel sales are derived from nozzle readings.

The operator records:

```text
Opening Reading
Closing Reading
```

The system calculates:

```text
Volume Sold
Sales Amount
Variance
```

Once the station has operating history, the opening reading is automatically populated using the previous shift's closing reading.

The operator typically only enters closing readings.

---

# Non-Fuel Sales

Products such as:

- Lubricants
    
- Engine Oil
    
- Coolants
    
- Accessories
    

are entered manually.

These sales remain separate from fuel sales while contributing to operational reports.

---

# Shift Lifecycle

## Shift Opening

At the beginning of a shift:

- Opening cash is recorded
    
- Previous readings are loaded
    
- Operational status begins
    

---

## During Shift

The station records:

- Expenses
    
- Credit sales
    
- Collections
    
- Product sales
    
- Operational notes
    

---

## Shift Closing

The operator records:

- Closing nozzle readings
    
- Closing cash balances
    

The system calculates:

- Fuel sales
    
- Shift totals
    
- Reconciliation values
    
- Variance reports
    

---

## Shift Locking

Once a shift is closed:

```text
It becomes locked.
```

Closed shifts cannot be edited directly.

This prevents unauthorized historical modifications.

---

# Historical Corrections

The system follows an adjustment-based model.

Historical records are not modified directly.

Example:

Instead of:

```text
₹10,000 Sale
Edited to
₹12,000 Sale
```

The system records:

```text
₹10,000 Sale
+
₹2,000 Adjustment
```

This preserves operational history and accountability.

---

# Network Resilience (Level 2 — graceful degradation)

PumpOS is used **mostly online**. The goal is that a temporary internet outage or
connectivity blip **does not block the operator** mid-session — work continues and
reconciles to the cloud when the network returns. This is resilience, **not**
cold-start offline-first.

During a connectivity drop, the desktop app should let users continue an
**in-progress** flow:

- Open shifts
    
- Close shifts
    
- Record sales
    
- Record expenses
    
- Record collections
    

These queue locally (durable write outbox) and sync when back online, rather than
being blocked on the network.

---

# Resilience Expectations

The primary mode is **online**. Short outages are tolerated transparently;
prolonged disconnection surfaces a clear sync warning (online / pending / failed).

> Multi-day standalone operation (e.g. "up to 7 days offline") is a **future
> Level 3** capability, not the current target. See
> `docs/roadmap/phase-O-offline-sync.md`.

---

# Mobile Application Philosophy

The mobile experience is primarily intended for:

- Monitoring
    
- Reporting
    
- Approvals
    
- Business oversight
    

The desktop application remains the primary operational workstation.

---

# Customer Management

The system supports:

- Credit customers
    
- Fleet customers
    
- Outstanding balances
    
- Collection tracking
    

These features are intended to help stations improve cash recovery and reduce receivable risk.

---

# Reporting Philosophy

The system prioritizes operational reporting.

Examples:

- DSSR
    
- Shift Reports
    
- Stock Reports
    
- Credit Reports
    
- Collection Reports
    

Future accounting features may expand reporting capabilities.

---

# Accounting Philosophy

Version 1 focuses on operational accounting.

The platform is not initially intended to replace dedicated accounting software.

Future versions may introduce:

- Journal Entries
    
- Ledgers
    
- Trial Balance
    
- Double Entry Accounting
    

if sufficient customer demand exists.

---

# Data Import Strategy

## Initial Onboarding

Stations may import:

- Opening Cash
    
- Opening Stock
    
- Debtors
    
- Creditors
    

---

## Structured Imports

Future imports may include:

- Products
    
- Customers
    
- Suppliers
    
- Employees
    

via spreadsheet templates.

---

# Enterprise Expansion

Future enterprise capabilities include:

- Multi-station management
    
- Consolidated reporting
    
- Regional manager oversight
    
- Approval workflows
    
- Advanced permissions
    

---

# Business Principles

1. Shifts are the core operational unit.
    
2. Fuel sales are derived from nozzle readings.
    
3. Historical financial records should not be overwritten.
    
4. Adjustments preserve accountability.
    
5. Desktop operation must continue during internet outages.
    
6. Mobile access is primarily for monitoring and oversight.
    
7. Operational reporting takes priority over advanced accounting.
    
8. Multi-station support must be possible without redesign.