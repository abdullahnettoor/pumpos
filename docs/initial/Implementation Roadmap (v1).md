## Purpose

This document defines the implementation sequence for the Fuel Pump ERP platform.

Goals:

- Reduce risk
    
- Validate assumptions early
    
- Deliver usable milestones
    
- Avoid architectural rework
    

---

# Development Principles

## Principle 1: Operational Flow First

Build:

```text
Shift
↓
Sales
↓
Expenses
↓
DSSR
```

before:

```text
Reports
Accounting
Automation
```

---

## Principle 2: Desktop First

Primary platform:

```text
Tauri Desktop
```

must be fully operational before significant mobile development.

---

## Principle 3: Offline From Day One

Offline capability is not a future enhancement.

It is a core requirement.

Every milestone should consider:

```text
Online
Offline
Sync Recovery
```

---

# Phase 0 – Project Foundation

**Duration:** 1–2 Weeks

Goal:

Build the technical skeleton.

---

## Deliverables

### Repository Setup

```text
Monorepo

apps/
  desktop
  web
  api

packages/
  db
  shared
  ui
```

---

### Core Stack

```text
React
Vite
TypeScript
Tauri
Hono
Drizzle
Supabase
```

---

### Authentication

```text
Supabase Auth
```

Features:

```text
Login
Logout
Session Persistence
```

---

### Database

Implement:

```text
organizations
stations
users
roles
```

---

### Local SQLite

Implement:

```text
SQLite Connection

Migration System

Basic Repository Layer
```

---

### Sync Infrastructure

Implement:

```text
sync_events
```

Only:

```text
Create
Queue
Retry
```

No complex conflict resolution yet.

---

## Success Criteria

```text
User can login.

Desktop can access SQLite.

Desktop can sync simple records.

Multi-tenancy works.
```

---

# Phase 1 – Station Setup

**Duration:** 1 Week

Goal:

Allow station configuration.

---

## Deliverables

### Station Overview

```text
Station Settings
```

---

### Products

```text
Create Product
Edit Product
Archive Product
```

---

### Tanks

```text
CRUD
```

---

### Dispenser Units

```text
CRUD
```

---

### Nozzles

```text
CRUD
```

---

### Shift Templates

```text
CRUD
```

---

## Success Criteria

```text
Station can be configured from scratch.
```

---

# Phase 2 – Shift Operations (MVP Core)

**Duration:** 2–3 Weeks

Goal:

Run a complete shift.

---

## Deliverables

### Open Shift

```text
Opening Cash

Staff Assignment
```

---

### Active Shift

```text
Current Status

Assigned DUs
```

---

### Nozzle Readings

```text
Opening Reading

Closing Reading

Volume Sold
```

---

### Close Shift

```text
Validation

Reconciliation

Locking
```

---

### DSSR Generation

```text
Snapshot Creation
```

---

## Success Criteria

```text
A station can operate entirely through shifts.
```

---

# Phase 3 – Operational Transactions

**Duration:** 2 Weeks

Goal:

Capture daily activities.

---

## Deliverables

### Expenses

```text
Categories

Entry

Editing
```

---

### Purchases

```text
Entry

History
```

---

### Collections

```text
Entry

History
```

---

### Manual Sales

```text
Lubricants

Accessories

Non-fuel Sales
```

---

### Customer Credit Sales

```text
Credit Recording
```

---

## Success Criteria

```text
All daily transactions are recorded.
```

---

# Phase 4 – Customers & Suppliers

**Duration:** 1–2 Weeks

Goal:

Introduce CRM functionality.

---

## Deliverables

### Customers

```text
Profiles

Credit Limits

Statements
```

---

### Suppliers

```text
Profiles

Balances
```

---

### Customer Transactions

```text
Collections

Credit Sales
```

---

### Supplier Transactions

```text
Purchases

Payments
```

---

## Success Criteria

```text
Outstanding balances can be tracked.
```

---

# Phase 5 – Inventory & Variance

**Duration:** 2 Weeks

Goal:

Deliver one of the platform's strongest value propositions.

---

## Deliverables

### Stock Movements

```text
Purchase

Sale

Adjustment

Decantation
```

---

### Tank Stock

```text
Expected Stock

Actual Stock
```

---

### Variance Tracking

```text
Shortage

Evaporation
```

---

### Variance Reports

```text
Daily

Monthly
```

---

## Success Criteria

```text
Station can identify stock losses.
```

---

# Phase 6 – Reporting

**Duration:** 2 Weeks

Goal:

Operational visibility.

---

## Deliverables

### DSSR History

### Sales Reports

### Expense Reports

### Customer Reports

### Variance Reports

---

### Export Support

```text
Excel
PDF
```

Client-side generation initially.

---

## Success Criteria

```text
Owners can monitor operations.
```

---

# Phase 7 – Offline Hardening

**Duration:** 2 Weeks

Goal:

Production-grade resilience.

---

## Deliverables

### Sync Dashboard

```text
Pending Events

Failed Events

Last Sync Time
```

---

### Retry Engine

```text
Exponential Backoff
```

---

### Conflict Detection

```text
Version Checking
```

---

### Offline Warning System

```text
3 Days Warning

7 Days Critical
```

---

### Crash Recovery

```text
Unfinished Sync Recovery
```

---

## Success Criteria

```text
System survives network outages safely.
```

---

# Phase 8 – Mobile Monitoring

**Duration:** 1–2 Weeks

Goal:

Owner visibility.

---

## Deliverables

### Mobile Dashboard

### DSSR Viewer

### Reports

### Customer Outstanding

---

## Success Criteria

```text
Owners can monitor stations remotely.
```

---

# Phase 9 – Commercial Release (Core Plan)

Goal:

First paying customers.

---

## Included

```text
Shift Management

Expenses

Purchases

Customers

Collections

DSSR

Reports

Offline Sync
```

---

## Excluded

```text
Advanced Accounting

GST Exports

WhatsApp

Attendance

Budgets

Automation
```

---

# Phase 10 – Pro Features

Goal:

Upgrade incentives.

---

## Deliverables

### Variance Analytics

### Advanced Inventory

### Fleet Customers

### Audit Enhancements

### WhatsApp Reminders

### Credit Monitoring

---

# Phase 11 – Enterprise Features

Goal:

Large station operations.

---

## Deliverables

### Multi-Station Management

### Custom Roles

### Approval Workflows

### Backup Automation

### Integrations

```text
Attendance

POS

WhatsApp

Accounting
```

---

# Technical Debt Review Gates

Before moving between major phases:

```text
Phase 2 → 3

Phase 5 → 6

Phase 7 → Release
```

perform:

```text
Architecture Review

Performance Review

Sync Reliability Review
```

---

# Recommended First Build Order

If you were starting development tomorrow:

```text
Week 1
Foundation

Week 2
Authentication
Station Setup

Week 3-4
Shift Management

Week 5
Nozzle Readings
DSSR

Week 6
Expenses
Purchases
Collections

Week 7
Customers

Week 8
Reporting

Week 9
Offline Hardening

Week 10
Pilot Deployment
```

---
