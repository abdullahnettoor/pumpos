## Purpose

This document defines the core business entities, relationships, ownership rules, and operational boundaries of the Fuel Pump ERP system.

The domain model serves as the foundation for:

- Database design
    
- API design
    
- User interface design
    
- Event architecture
    
- Reporting architecture
    

This document is technology-agnostic and focuses solely on business concepts.

---

# Domain Overview

The system is designed around the operation of fuel stations.

Core operational flow:

```text
Organization
      ↓
Station
      ↓
Shift
      ↓
Sales / Stock / Cash / Credit
      ↓
DSSR
```

The Shift is the primary operational unit.

---

# Organizational Context

## Organization

Represents the legal or business owner.

Examples:

```text
ABC Fuels
XYZ Petroleum
```

### Responsibilities

- Owns stations
    
- Owns users
    
- Owns business data
    
- Owns subscriptions
    

### Relationships

```text
Organization
 ├─ Stations
 ├─ Users
 ├─ Customers
 └─ Suppliers
```

---

# Station Context

## Station

Represents a physical fuel station.

### Responsibilities

- Operates shifts
    
- Manages stock
    
- Records sales
    
- Tracks expenses
    

### Relationships

```text
Station
 ├─ Tanks
 ├─ Dispenser Units
 ├─ Shifts
 ├─ Products
 ├─ Customers
 └─ Suppliers
```

---

# Staff Context

## User

Represents a system user.

### Examples

```text
Owner
Manager
Accountant
Staff
```

### Responsibilities

- Perform operational actions
    
- Approve actions
    
- Access reports
    

### Future Support

Users may belong to multiple stations.

Example:

```text
Regional Manager
```

assigned to:

```text
Station A
Station B
Station C
```

---

# Shift Context

## Shift

Represents an operational working period.

### Examples

```text
Morning Shift
Evening Shift
Night Shift
```

Shift definitions are configurable.

---

### States

```text
OPEN
CLOSED
```

---

### Responsibilities

- Capture operational activity
    
- Record readings
    
- Record expenses
    
- Record collections
    
- Generate DSSR
    

---

### Rules

- Only one active shift per station
    
- Closed shifts are immutable
    
- Corrections require adjustments
    

---

# Fuel Infrastructure Context

## Tank

Represents a physical storage tank.

### Examples

```text
Petrol Tank
Diesel Tank
```

### Responsibilities

- Store fuel inventory
    
- Support stock calculations
    
- Support variance calculations
    
- Support decantation tracking
    

---

### Relationships

```text
Tank
 └─ Product
```

---

## Dispenser Unit (DU)

Represents a fuel dispensing machine.

### Examples

```text
DU-01
DU-02
```

### Responsibilities

- Deliver fuel
    
- Group nozzles
    
- Support staff assignments
    

---

### Relationships

```text
DU
 ├─ Tank
 └─ Nozzles
```

---

### Operational Importance

Staff may be assigned to DUs during shifts.

---

## Nozzle

Represents an individual dispensing point.

### Examples

```text
Petrol Nozzle 1
Petrol Nozzle 2
Diesel Nozzle 1
```

---

### Responsibilities

- Record readings
    
- Calculate fuel sales
    

---

### Relationships

```text
Nozzle
 ├─ Product
 └─ DU
```

---

## Nozzle Reading

Represents fuel meter readings.

### Data Captured

```text
Opening Reading
Closing Reading
Volume Sold
```

---

### Operational Model

Opening reading is automatically derived from:

```text
Previous Closing Reading
```

Operators typically enter only:

```text
Closing Reading
```

---

# Product Context

## Product

Represents anything sold or purchased.

### Examples

```text
Petrol
Diesel
Engine Oil
Coolant
Grease
```

---

### Product Types

Examples:

```text
Fuel
Lubricant
Accessory
```

---

### Product Flags

Examples:

```text
GST Applicable
Non-GST
Stock Tracked
```

Flags may expand over time.

---

# Sales Context

## Sale

Represents a completed commercial transaction.

Sales may originate from:

- Fuel Sales
    
- Lubricant Sales
    
- Accessory Sales
    
- Mixed Sales
    

A Sale represents the financial transaction itself, while fuel quantities continue to be derived from nozzle readings.

### Responsibilities

- Record monetary value of sales
    
- Support customer invoicing
    
- Support GST reporting
    
- Support product-wise reporting
    
- Support fleet customer billing
    

### Sale Types

Examples:

```text
Fuel
Product
Mixed
Credit
```

### Relationships

```text
Sale
 ├─ Shift
 ├─ Customer (Optional)
 └─ Sale Items
```

---

## Sale Item

Represents an individual line item within a sale.

### Examples

```text
Engine Oil
Coolant
Grease
Accessory
```

### Responsibilities

- Product-wise reporting
    
- GST calculations
    
- Inventory reduction
    
- Invoice generation
    

### Relationships

```text
Sale Item
 ├─ Sale
 └─ Product
```

---

### Notes

Fuel sales continue to be derived from nozzle readings.

The Sale entity exists primarily for:

- Non-fuel products
    
- Mixed transactions
    
- Customer billing
    
- Future invoice generation
    
- Future GST reporting

---
# Customer Context

## Customer

Represents a customer account.

### Examples

```text
Individual Customer
Fleet Customer
Corporate Customer
```

---

### Customer Types

Examples:

```text
Regular
Fleet
Credit
```

---

### Responsibilities

- Credit tracking
    
- Collection tracking
    
- Statement generation
    

---

# Supplier Context

## Supplier

Represents vendors providing products or services.

### Examples

```text
Indian Oil
Lubricant Distributor
Maintenance Vendor
```

---

### Responsibilities

- Purchase tracking
    
- Outstanding balances
    
- Payment tracking
    

---

### Note

Suppliers and creditors are separate concepts.

A creditor balance is derived from supplier transactions.

---

# Financial Context

## Expense

Represents money spent by the station.

---

### Categories

System Categories:

```text
Salary
Electricity
Maintenance
Cleaning
Transportation
Miscellaneous
```

---

### Custom Categories

Users may create additional categories.

---

## Collection

Represents money received from customers.

### Examples

```text
Fleet Payment
Outstanding Recovery
```

---

## Purchase

Represents inventory or service purchases.

### Examples

```text
Fuel Purchase
Lubricant Purchase
Equipment Purchase
```

---

# Stock Context

## Stock Movement

Represents inventory movement.

### Examples

```text
Purchase
Sale
Adjustment
Decantation
```

---

## Variance

Represents stock discrepancies.

### Data Captured

```text
Expected Stock
Actual Stock
Variance
Reason
Approved By
```

---

### Importance

Variance is a first-class business concept.

It directly supports:

- Shortage tracking
    
- Evaporation tracking
    
- Audit processes
    

---

# Reporting Context

## DSSR Snapshot

Represents a permanent shift summary.

### Generated When

```text
Shift Closed
```

---

### Contains

```text
Sales
Expenses
Collections
Stock Information
Cash Information
Variance Information
```

---

### Rules

DSSR snapshots are immutable.

Historical reports are generated from stored snapshots rather than recalculated dynamically.

---

# Future Domain Expansion

Potential future contexts:

### Attendance

```text
Attendance
Leave
Biometric
```

---

### Accounting

```text
Journal
Ledger
Trial Balance
```

---

### Integrations

```text
WhatsApp
SMS
Fuel Controllers
Attendance Devices
```

---

# Domain Principles

1. Shift is the primary operational unit.
    
2. Fuel sales are derived from nozzle readings.
    
3. Tanks, DUs, and Nozzles are independent entities.
    
4. Closed shifts are immutable.
    
5. DSSR snapshots are permanent records.
    
6. Variance is a first-class business concept.
    
7. Customers and suppliers are separate domains.
    
8. Product behavior is controlled through product types and flags.
    
9. Staff may belong to multiple stations.
    
10. Future accounting and integration features must extend the domain without requiring redesign.