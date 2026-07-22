## Purpose

This document defines the technical architecture required to implement the business architecture of the Fuel Pump ERP platform.

It serves as the reference for:

- Engineering decisions
    
- Infrastructure planning
    
- Security architecture
    
- Scalability planning
    
- Future system expansion
    

---

# Architectural Principles

## Principle 1

Cloud PostgreSQL is the authoritative source of truth.

---

## Principle 2

A local store provides **resilience** (a durable write outbox + warm read cache),
not a full offline database. Target is Level 2 (graceful degradation), not
cold-start offline-first — see `docs/roadmap/phase-O-offline-sync.md`.

---

## Principle 3

Synchronization is event-driven.

---

## Principle 4

Financial records favor append-only operations over destructive updates.

---

## Principle 5

The platform must scale to at least 100 stations without redesign.

---

# Technology Stack

## Frontend

- React
    
- TypeScript
    
- Vite
    
- TanStack Query
    
- React Hook Form
    
- Zod
    

---

## Desktop

- Tauri
    
- SQLite
    

Responsibilities:

- Offline storage
    
- Local cache
    
- Event queue
    
- Sync management
    

---

## Backend

- Cloudflare Workers
    
- Hono
    
- Drizzle ORM
    

Responsibilities:

- Authentication validation
    
- Authorization
    
- API endpoints
    
- Event processing
    
- Business rule enforcement
    

---

## Database

- Supabase PostgreSQL
    

Responsibilities:

- Persistent storage
    
- Multi-tenancy
    
- Reporting data
    
- Audit records
    

---

## Authentication

- Supabase Auth
    

---

## Storage

- Cloudflare R2
    

Used for:

- Attachments
    
- Reports
    
- Backups
    

---

## Monitoring

- Sentry
    

Used for:

- Frontend exceptions
    
- Backend exceptions
    
- Sync failures

## Metadata Strategy

The platform uses JSONB fields for low-frequency and extensible data.

Examples:

```text
Tax Configuration
HSN Codes
GST Rules
Integration Settings
Fleet Metadata
Vendor Metadata
Station Configuration
```

### Guidelines

Use dedicated columns when:

- Frequently filtered
    
- Frequently sorted
    
- Frequently joined
    
- Used in calculations
    

Use JSONB when:

- Optional
    
- Regulatory
    
- Configuration-based
    
- Integration-specific
    

This approach minimizes schema churn while preserving future flexibility.

---

# High-Level Architecture

```text
Desktop (Tauri)
        ↓
Local SQLite
        ↓
Sync Engine
        ↓
Cloudflare Workers (Hono)
        ↓
Supabase PostgreSQL

Mobile / PWA
        ↓
Cloudflare Workers (Hono)
        ↓
Supabase PostgreSQL
```

---

# Multi-Tenancy

Every business table must contain:

```sql
organization_id
station_id
```

Tenant isolation is enforced through:

- PostgreSQL Row-Level Security
    
- Application-level authorization
    

---

# Authentication Flow

```text
User Login
        ↓
Supabase Auth
        ↓
JWT Issued
        ↓
API Requests
        ↓
JWT Validation
```

The Worker extracts tenant context from the authenticated session.

---

# Offline Architecture

## Local SQLite Storage

Stores:

- Shifts
    
- Sales
    
- Expenses
    
- Stock records
    
- Customer records
    
- Pending sync events
    

---

## Offline Capacity

Designed for:

```text
30 Days
```

Recommended operational usage:

```text
3–7 Days
```

---

# Synchronization Architecture

## Event Queue

Local table:

```sql
sync_events
```

Contains:

```sql
event_id
event_type
entity_type
entity_id
payload
created_at
sync_status
```

---

## Event States

```text
PENDING
PROCESSING
SYNCED
FAILED
```

---

## Retry Strategy

Failed events retry automatically using exponential backoff.

---

## Idempotency

Every event receives a globally unique identifier.

Duplicate processing is ignored.

---

# Conflict Resolution

## Operational Data

Uses optimistic versioning.

Example:

```text
Customer
Supplier
Employee
```

---

## Financial Data

Uses adjustment-based corrections.

Historical records are preserved.

---

## Closed Shifts

Immutable.

Only adjustment records are permitted.

---

# Domain Model

Primary entities:

```text
Organization
Station
User
Shift
Nozzle
Nozzle Reading
Product
Purchase
Customer
Expense
Audit Record
```

---

# Reporting Architecture

## Transaction Layer

Stores operational data.

Examples:

```text
Sales
Expenses
Collections
Purchases
```

---

## Aggregation Layer

Stores precomputed summaries.

Examples:

```text
Daily Totals
Monthly Totals
Stock Variance
Profit Summaries
```

Used for fast dashboards.

---

# Audit Architecture

Critical actions generate audit records.

Example fields:

```text
User
Action
Timestamp
Entity
Before
After
```

Audit data remains immutable.

---

# Backup Strategy

## Cloud

Managed through database backups.

---

## Desktop

Manual encrypted exports.

---

## Enterprise

Automated backup exports.

---

# Import Architecture

## Phase 1

Opening balance imports.

---

## Phase 2

Spreadsheet imports.

---

## Phase 3

Custom migration tooling.

---

# Extension Architecture

Future integrations:

- WhatsApp Providers
    
- SMS Providers
    
- Attendance Devices
    
- Fuel Dispenser Controllers
    
- POS Systems
    
- Weighbridge Systems
    

Integrations should be implemented through adapter interfaces.

---

# Scalability Targets

Initial Design:

```text
50–100 Stations
```

Expected Capacity:

```text
500+ Stations
```

without major architectural changes.

---

# Final Technical Decisions

1. Supabase PostgreSQL is the authoritative data source.
    
2. Tauri SQLite provides offline resilience.
    
3. Synchronization is event-based.
    
4. Supabase Auth handles authentication.
    
5. PostgreSQL RLS enforces tenant isolation.
    
6. Cloudflare Workers host the API layer.
    
7. Reporting is primarily generated client-side.
    
8. Closed financial periods are immutable.
    
9. Sync operations must be idempotent.
    
10. Architecture prioritizes reliability and auditability over complexity.