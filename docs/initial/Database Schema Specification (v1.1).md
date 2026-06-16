## Purpose

This document defines the logical database architecture for the Fuel Pump ERP platform.

It serves as the foundation for:

- PostgreSQL schema design
    
- Drizzle ORM implementation
    
- Multi-tenant architecture
    
- Offline synchronization
    
- Reporting
    
- Future expansion
    

This specification intentionally focuses on business entities and relationships rather than API implementation details.

---

# Database Design Principles

## Principle 1: Cloud Database Is Authoritative

Supabase PostgreSQL is the system of record.

Local SQLite exists only for:

- Offline operation
    
- Event buffering
    
- Local caching
    
- Temporary reporting
    

---

## Principle 2: Shift-Centric Operations

All operational transactions belong to a shift.

Examples:

```text
Expenses
Purchases
Collections
Credit Sales
Nozzle Readings
Variance Records
```

must reference:

```text
shift_id
```

---

## Principle 3: Immutable Historical Reporting

Historical reports are stored as snapshots.

Examples:

```text
DSSR
Shift Summaries
```

must never be recalculated after finalization.

---

## Principle 4: Soft Delete Strategy

Business records are archived rather than deleted.

Common fields:

```text
is_active
archived_at
```

---

## Principle 5: Standard Metadata

Most tables contain:

```text
id

organization_id
station_id

created_at
updated_at

created_by
updated_by

version
```

Used for:

- Auditability
    
- Synchronization
    
- Conflict detection
    

---

# Domain Structure

```text
Core
Infrastructure
Products
Operations
CRM
Inventory
Finance
Reporting
Audit
Synchronization
```

---

# CORE DOMAIN

## organizations

Represents the business owner.

### Fields

```text
id
name

subscription_plan
subscription_status

created_at
updated_at
```

---

## stations

Represents physical fuel stations.

### Fields

```text
id
organization_id

name
code

address
phone

settings

is_active

created_at
updated_at
```

### Settings (JSONB)

Station-level configuration.

Example:

```json
{
  "shift_grace_minutes": 15,
  "offline_warning_days": 3,
  "offline_critical_days": 7
}
```

---


## document_sequences

Maintains organization-specific numbering sequences.

### Fields

```text
id

organization_id

document_type

current_number

created_at
updated_at
```

### Examples

```text
SALE -> 1023
PURCHASE -> 432
COLLECTION -> 876
```

### Purpose

Generates human-readable references.

Examples:

```text
SAL-001024
PUR-000433
COL-000877
```

Document numbers are presentation identifiers only.

All internal references use UUIDs.

## users

Authenticated users.

### Fields

```text
id
organization_id

auth_user_id

full_name
email
phone

status

created_at
updated_at
```

---

## roles

### Examples

```text
Owner
Manager
Accountant
Staff
```

---

## user_roles

Maps users to roles.

---

## user_station_assignments

Supports:

```text
One User
↓
Multiple Stations
```

Used for:

```text
Regional Managers
Owners
Supervisors
```

---

# INFRASTRUCTURE DOMAIN

## tanks

Fuel storage tanks.

### Fields

```text
id
organization_id
station_id

name

product_id

capacity

created_at
updated_at
```

### Notes

Current stock is NOT stored directly.

Stock is derived from:

```text
stock_movements
```

---

## dispenser_units

Represents fuel dispensing machines.

### Fields

```text
id
organization_id
station_id

name
code

status

created_at
updated_at
```

---

## nozzles

Represents individual dispensing points.

### Fields

```text
id
organization_id
station_id

du_id
tank_id
product_id

name

current_reading

created_at
updated_at
```

---

# PRODUCT DOMAIN

## products

Single product catalog.

Supports:

```text
Fuel
Lubricants
Accessories
Services
```

### Fields

```text
id
organization_id

name
code

product_type

stock_tracked

is_taxable

unit

tax_config

is_active

created_at
updated_at
```

### Tax Configuration (JSONB)

The tax_config field stores infrequently used tax and regulatory information.

Example:

```json
{
  "gst_rate": 18,
  "hsn_code": "27101980"
}
```

### Notes

Fields that influence application behavior or are commonly used in filtering should remain top-level columns.

Examples:

```text
product_type
stock_tracked
is_taxable
unit
```

This allows efficient queries such as:

```text
Fuel Products
GST Products
Taxable Products
Non-Taxable Products
```

Fuel products can typically be represented as:

```text
product_type = FUEL
is_taxable = false
```

while lubricant and accessory products may use:

```text
product_type = LUBRICANT
is_taxable = true
```

This keeps common reporting and filtering fast while still allowing tax-specific details to remain flexible within JSONB.

### Notes

Fields that are frequently queried remain top-level columns.

Examples:

```text
product_type
stock_tracked
unit
```

Rarely queried information should be stored in metadata.

Examples:

```text
HSN Codes
GST Configuration
Future Tax Rules
External Product Mappings
```


---

# SHIFT DOMAIN

## shift_templates

Defines reusable shift structures.

### Fields

```text
id
organization_id

name

start_time
end_time

is_active
```

### Examples

```text
Morning Shift
Evening Shift
Night Shift
```

---

## shifts

Primary operational entity.

### Fields

```text
id
organization_id
station_id

shift_template_id

status

opened_by
opened_at

closed_by
closed_at

locked_at

opening_cash
closing_cash

created_at
updated_at
```

### Status

```text
OPEN
CLOSED
LOCKED
```

---

## shift_staff_assignments

Tracks workers assigned to shifts and DUs.

### Fields

```text
id

shift_id

user_id

du_id

assigned_at
```

### Future Uses

```text
Attendance
Salary Calculations
Performance Tracking
```

---

## nozzle_readings

Stores readings per shift.

### Fields

```text
id

shift_id

nozzle_id

opening_reading
closing_reading

volume_sold

created_at
```

---

# CRM DOMAIN

## customers

Single customer entity.

### Fields

```text
id
organization_id
station_id

customer_type

name
phone

credit_limit

fleet_code

metadata

is_active

created_at
updated_at
```

### Notes

Fields that are commonly used for filtering, searching, reporting, or business logic should remain as dedicated columns.

Examples:

```text
customer_type
credit_limit
fleet_code
```

This allows efficient indexing and querying without relying on JSONB extraction.

### Metadata (JSONB)

Used for optional or infrequently accessed customer information.

Example:

```json
{
  "fleet": {
    "vehicle_count": 15,
    "contact_person": "John Doe"
  },
  "credit": {
    "credit_days": 30
  }
}
```

### Guidelines

Use dedicated columns when data is:

- Frequently filtered
    
- Frequently searched
    
- Frequently reported
    
- Used in business rules
    

Use JSONB when data is:

- Optional
    
- Rarely queried
    
- Customer-specific
    
- Future extensibility data
    

For fuel station ERP systems, fleet identification fields such as `fleet_code` should remain top-level columns because fleet customer filtering and reporting are expected to be common operations.

### Types

```text
Regular
Credit
Fleet
```

---

## customer_transactions

Tracks customer financial activity.

### Fields

```text
id

shift_id

customer_id

transaction_type

amount

reference_type
reference_id

notes

created_at
```

### Types

```text
Credit Sale
Collection
Adjustment
```

---

## suppliers

Supplier master records.

### Fields

```text
id
organization_id
station_id

name
phone

metadata

is_active

created_at
updated_at
```

### Metadata (JSONB)

Used for supplier-specific information.

Example:

```json
{
  "gst_number": "32ABCDE1234F1Z5",
  "vendor_code": "IOC-001"
}
```

---

## supplier_transactions

Tracks supplier balances.

### Fields

```text
id

shift_id

supplier_id

transaction_type

amount

reference_type
reference_id

notes

created_at
```

### Types

```text
Purchase
Payment
Adjustment
```

---
# SALES DOMAIN

## sales

Represents completed commercial transactions.
### Fields

```text
id

document_number

shift_id

sale_type

customer_id

subtotal_amount
tax_amount
total_amount

notes

created_at
updated_at
```

### Notes

document_number is the human-readable reference.

Examples:

```text
SAL-000001
SAL-000002
SAL-000003
```

The primary key remains a UUID.

document_number must never be used as the technical identifier.

### Sale Types

```text
Fuel
Product
Mixed
Credit
```

---

## sale_items

Represents line items within a sale.

### Fields

```text
id

sale_id

product_id

quantity

unit_price

tax_amount

line_total

created_at
```

### Notes

Supports:

- Product sales
    
- GST reporting
    
- Inventory deduction
    
- Invoice generation
    
- Future e-invoicing support

---
# INVENTORY DOMAIN

## stock_movements

Authoritative inventory ledger.

### Fields

```text
id

shift_id

product_id

movement_type

quantity

reference_type
reference_id

notes

created_at
```

### Types

```text
Purchase
Sale
Adjustment
Decantation
Variance
```

### Notes

Current stock is derived from this table.

This is the source of truth for inventory.

---

## stock_variances

Stores reconciliation discrepancies.

### Fields

```text
id

shift_id

product_id

expected_quantity
actual_quantity

variance_quantity

reason

approved_by

created_at
```

---

# FINANCE DOMAIN

## expense_categories

### Fields

```text
id
organization_id

name

is_system
```

### Supports

```text
System Categories
Custom Categories
```

---

## expenses

Station expenses.

### Fields

```text
id

shift_id

category_id

amount

description

parent_expense_id

adjustment_reason

status

created_at
updated_at
```

### Status

```text
ACTIVE
ADJUSTMENT
VOIDED
```

### Notes

Adjustments remain in the same table.

Dedicated adjustment tables are unnecessary.

---

## collections

Customer collections.

### Fields

```text
id

document_number

shift_id

customer_id

amount

payment_method

notes

created_at
```

### Notes

Examples:

```text
COL-000001
COL-000002
```

Used for:

- Receipts
    
- Statements
    
- Audit references

---

## purchases

Supplier purchases.

### Fields

```text
id

document_number

shift_id

supplier_id

invoice_number

amount

notes

created_at
```

### Notes

document_number is generated internally.

Example:

```text
PUR-000001
PUR-000002
```

Supplier invoice numbers remain separate from system-generated document numbers.

---

# REPORTING DOMAIN

## dssr_snapshots

Immutable DSSR records.

### Fields

```text
id

shift_id

snapshot_data

generated_at
```

### Notes

Stores the entire DSSR output.

Never modified after generation.

---

# AUDIT DOMAIN

## audit_logs

Tracks modifications.

### Fields

```text
id

organization_id
station_id

entity_type
entity_id

action

before_data
after_data

performed_by

performed_at
```

---

## business_events

Stores operational business events.

### Fields

```text
id

event_id

event_type

organization_id
station_id

entity_type
entity_id

payload

occurred_at
```

---

# SYNCHRONIZATION DOMAIN

## sync_events

Used primarily by SQLite.

### Fields

```text
event_id

event_type

entity_type
entity_id

payload

status

retry_count

created_at
synced_at
```

### Status

```text
PENDING
PROCESSING
SYNCED
FAILED
```

---

# Row Level Security (RLS)

## Organization Isolation

All business queries filtered by:

```text
organization_id
```

Users must never access another organization's records.

---

## Station Isolation

Optional filtering by:

```text
station_id
```

Used for:

```text
Managers
Staff
Accountants
```

---

## Owner Access

Owners may access:

```text
All Stations
Within Their Organization
```

---

# SQLite Offline Scope

The desktop application stores:

```text
Master Data
Active Shifts
Pending Sync Events
Recent Reports
```

Recommended retention:

```text
30 Days
```

---

# Final Database Decisions

1. PostgreSQL is the authoritative source of truth.
    
2. SQLite acts as an offline operational cache.
    
3. All operational transactions belong to shifts.
    
4. Stock movements are the inventory source of truth.
    
5. Current stock is derived, not stored.
    
6. DSSR is stored as immutable snapshots.
    
7. Closed shifts become immutable.
    
8. Financial corrections use adjustment records within the same tables.
    
9. HSN and GST information are stored directly on products.
    
10. Shift templates support configurable station operations.
    
11. RLS enforces tenant isolation.
    
12. Event records and business tables coexist.
    
13. Soft deletes are preferred over physical deletes.
    
14. Future accounting modules can be added without redesigning the core schema.