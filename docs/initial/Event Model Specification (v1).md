## Purpose

This document defines all business events within the Fuel Pump ERP platform.

Events represent meaningful business actions that occur within the system.

This specification serves as the foundation for:

- Offline synchronization
    
- Audit trails
    
- Reporting
    
- Notifications
    
- Future accounting capabilities
    

This document is independent of database implementation details.

---

# Event Philosophy

## What Is A Business Event?

A business event represents something meaningful that happened within station operations.

Examples:

```text
Shift Opened
Expense Recorded
Purchase Recorded
Collection Received
DSSR Generated
```

Events represent facts.

Events should never be ambiguous.

---

# Event Categories

The system contains two types of events.

---

## Type 1: Business Events

Business events affect operations.

Examples:

```text
SHIFT_OPENED
EXPENSE_RECORDED
PURCHASE_RECORDED
```

Business events:

- Affect reports
    
- Affect calculations
    
- Affect DSSR
    
- Participate in synchronization
    

---

## Type 2: Audit Events

Audit events track modifications.

Examples:

```text
EXPENSE_UPDATED
CUSTOMER_UPDATED
PRODUCT_UPDATED
```

Audit events:

- Preserve accountability
    
- Do not affect calculations directly
    
- Do not participate in reporting
    

---

# Universal Event Structure

Every business event contains:

```text
event_id
event_type
organization_id
station_id
user_id
occurred_at
entity_type
entity_id
payload
```

---

# Shift Event Group

## SHIFT_OPENED

Triggered when a shift begins.

### Purpose

Creates the operational context for all activities.

### Payload

```text
shift_id
shift_name
opened_by
opening_cash
started_at
```

---

## SHIFT_CLOSED

Triggered when a shift ends.

### Purpose

Locks operational records.

Generates DSSR.

### Payload

```text
shift_id
closed_by
closing_cash
closed_at
```

---


## SHIFT_REOPENED

Triggered when an authorized user reopens a recently closed shift.

### Constraints

Allowed only when:

```text
Current Time
<
Shift Locked Time
```

and within the configured grace period.

Authorized Roles:

```text
Owner
Manager
```

### Payload

```text
shift_id
reason
reopened_by
```

---
## SHIFT_LOCKED

Triggered when grace period expires.

### Result

Shift becomes permanently immutable.

---

# Nozzle Event Group

## NOZZLE_READING_RECORDED

Triggered when closing reading is entered.

### Payload

```text
shift_id
nozzle_id
opening_reading
closing_reading
volume_sold
```

---

## NOZZLE_READING_ADJUSTED

Triggered when reading changes before shift lock.

### Type

Audit Event

---

# DU Assignment Event Group

## STAFF_ASSIGNED_TO_DU

Triggered when staff is assigned to a dispenser unit.

### Payload

```text
shift_id
staff_id
du_id
assigned_by
```

---

## STAFF_UNASSIGNED_FROM_DU

Triggered when assignment changes.

---

# Customer Event Group

## CUSTOMER_CREATED

Triggered when a customer account is created.

### Payload

```text
customer_id
customer_type
name
```

---

## CUSTOMER_UPDATED

Audit Event

Tracks:

```text
Name Changes
Contact Changes
Credit Limit Changes
```

---

# Credit Event Group

## CREDIT_SALE_RECORDED

Triggered when fuel or products are sold on credit.

### Payload

```text
shift_id
customer_id
amount
product_breakdown
```

---

## COLLECTION_RECEIVED

Triggered when customer payment is received.

### Payload

```text
shift_id
customer_id
amount
payment_method
```

---

# Sales Event Group

## SALE_RECORDED

Triggered when a sale is completed.

### Payload

```text
shift_id
sale_id
sale_type
customer_id
total_amount
```

---

## SALE_ITEM_RECORDED

Triggered for each line item within a sale.

### Payload

```text
sale_id
product_id
quantity
unit_price
amount
```

---

## SALE_UPDATED

Audit Event

Only allowed while the shift remains editable.

---

## SALE_ADJUSTMENT_CREATED

Business Event

Used after shift lock.

### Payload

```text
sale_id
adjustment_amount
reason
```

---
# Expense Event Group

## EXPENSE_RECORDED

Triggered when expense is entered.

### Payload

```text
shift_id
expense_category
amount
description
```

---

## EXPENSE_UPDATED

Audit Event

Only allowed before shift lock.

---

## EXPENSE_ADJUSTMENT_CREATED

Business Event

Used after shift lock.

### Payload

```text
original_expense_id
adjustment_amount
reason
```

---

# Purchase Event Group

## PURCHASE_RECORDED

Triggered when inventory is purchased.

### Payload

```text
shift_id
supplier_id
product_id
quantity
amount
```

---

## PURCHASE_UPDATED

Audit Event

Allowed only before shift lock.

---

## PURCHASE_ADJUSTMENT_CREATED

Business Event

Used after shift lock.

---

# Stock Event Group

## STOCK_RECEIVED

Triggered when inventory enters station.

### Examples

```text
Fuel Delivery
Lubricant Delivery
```

---

## STOCK_ADJUSTED

Triggered when stock correction occurs.

### Examples

```text
Manual Correction
Damaged Stock
```

---

## DECANTATION_RECORDED

Triggered when fuel is transferred into tanks.

### Payload

```text
tank_id
quantity
```

---

# Variance Event Group

## VARIANCE_RECORDED

Triggered when stock reconciliation identifies a variance.

### Payload

```text
shift_id
product_id

expected_quantity
actual_quantity

variance_quantity

reason
```

### Notes

Variances are informational records in MVP.

No approval workflow exists.

Future Enterprise versions may introduce:

```text
VARIANCE_APPROVED
VARIANCE_REJECTED
VARIANCE_ESCALATED
```

# Product Event Group

## PRODUCT_CREATED

Business Event

---

## PRODUCT_UPDATED

Audit Event

Examples:

```text
GST Changes
Price Changes
Category Changes
```

---

# Supplier Event Group

## SUPPLIER_CREATED

Business Event

---

## SUPPLIER_UPDATED

Audit Event

---

## SUPPLIER_TRANSACTION_RECORDED

Triggered when a supplier-related financial transaction occurs.

### Payload

```text
shift_id
supplier_id
transaction_type
amount
```

### Examples

```text
Purchase
Payment
Adjustment
```

---

# DSSR Event Group

## DSSR_GENERATED

Triggered automatically during shift closure.

### Payload

```text
shift_id
sales_total
expenses_total
collections_total
variance_total
```

### Notes

DSSR is automatically generated when a shift is closed.

No approval workflow exists in MVP.

Future versions may introduce:

```text
DSSR_APPROVED
DSSR_REJECTED
```
# Financial Record Lifecycle

## Stage 1: Editable

While shift remains open:

```text
Expense
Purchase
Collection
Credit Sale
```

may be modified.

Changes generate audit events.

---

## Stage 2: Shift Closed

Records become locked.

Direct modifications prohibited.

---

## Stage 3: Adjustment Mode

Corrections occur through adjustment events.

Examples:

```text
EXPENSE_ADJUSTMENT_CREATED
PURCHASE_ADJUSTMENT_CREATED
SALE_ADJUSTMENT_CREATED
COLLECTION_ADJUSTMENT_CREATED
```

Historical records remain preserved.

No direct modification of locked records is permitted.

---
# Synchronization Rules

Every business event:

```text
Must Sync
```

Every audit event:

```text
Should Sync
```

for accountability.

---

# Event Idempotency

Every event contains:

```text
event_id
```

Events may be safely retried.

Duplicate processing must be ignored.

---

# Event Ownership Rules

Every event must contain:

```text
organization_id
station_id
user_id
```

This guarantees:

- Multi-tenancy
    
- Traceability
    
- Auditing
    

---

# Event Ordering Rules

Within a shift:

```text
SHIFT_OPENED
        ↓
Operational Events
        ↓
NOZZLE_READING_RECORDED
        ↓
DSSR_GENERATED
        ↓
SHIFT_CLOSED
        ↓
SHIFT_LOCKED
```

This sequence must always be preserved.

---

# Future Event Expansion

Future modules may introduce:

### Attendance

```text
ATTENDANCE_MARKED
LEAVE_APPROVED
```

### Accounting

```text
JOURNAL_ENTRY_CREATED
LEDGER_POSTED
```

### Integrations

```text
WHATSAPP_SENT
SMS_SENT
DEVICE_SYNCED
```

without changing the core event architecture.

---

# Event Model Principles

1. Every operational transaction belongs to a shift.
    
2. Business events represent facts.
    
3. Audit events represent modifications.
    
4. Closed shifts are immutable.
    
5. Post-lock corrections use adjustment events.
    
6. DSSR is generated from shift events.
    
7. Events are the foundation of synchronization.
    
8. Events are idempotent.
    
9. Every event is attributable to a user.
    
10. Future modules must extend the event model rather than bypass it.