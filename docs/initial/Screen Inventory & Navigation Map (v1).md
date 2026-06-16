
## Purpose

This document defines:

- Available screens
    
- User workflows
    
- Navigation structure
    
- Desktop experience
    
- Mobile experience
    
- MVP boundaries
    

This serves as the foundation for:

- Wireframes
    
- UI Design
    
- Frontend Routing
    
- Permission Enforcement
    

---

# Design Principles

## Principle 1: Shift-First Experience

The application revolves around:

```text
Shift
 ↓
Operations
 ↓
DSSR
```

The active shift is the center of daily operations.

---

## Principle 2: Operational Simplicity

Users should never have to wonder:

```text
Where do I enter expenses?
Where do I enter purchases?
Where do I close a shift?
```

Each workflow has a dedicated location.

---

## Principle 3: Desktop First

Primary workstation:

```text
Counter PC
```

Primary platform:

```text
Tauri Desktop
```

---

## Principle 4: Mobile is Monitoring First

Mobile users focus on:

```text
Dashboard
Reports
DSSR
Customer Status
```

Operational entry remains desktop-centric.

---

# Navigation Structure

Depending on the station onboarding lifecycle state, the primary navigation adapts:

### 1. Pre-Setup State (Onboarding)
For stations in `NOT_STARTED` or `IN_PROGRESS` status, primary operational navigation is blocked. Eligible users (Owners/Managers) are routed into the onboarding flow, and operators are shown an onboarding progress screen.

```text
Onboarding Setup (Wizard Flow)
├─ 1. Station Basics
├─ 2. Products Catalog
├─ 3. Storage Tanks
├─ 4. Dispenser Units
├─ 5. Nozzles Mapping
└─ 6. Shift Setup (Optional)
```

### 2. Post-Setup State (Operations)
Once onboarding is marked complete (`READY_FOR_OPERATIONS`), the full operational dashboard is active, and Administration setup items are collapsed into a single, unified Station Overview.

```text
Dashboard

Operations
├─ Shift Management
├─ Expenses
├─ Purchases

CRM
├─ Customers

Reports
├─ DSSR
├─ Reports Summary

Administration
└─ Station Overview (Consolidated setup tabs for General, Products, Tanks, Dispensers, Nozzles, Shifts)
```

---

# Authentication Module

## Login

Purpose:

```text
Authenticate User
```

Actions:

```text
Login
Session Recovery
```

Roles:

```text
All Users
```

---

# Dashboard Module

## Dashboard

Purpose:

Provide operational snapshot.

Widgets:

```text
Active Shift

Today's Sales

Cash Position

Credit Outstanding

Recent Variances

Pending Sync Status

System Alerts
```

Roles:

```text
All Users
```

---

# Shift Management Module

## Shift Management

Purpose:

Central shift workflow.

Actions:

```text
Open Shift

View Active Shift

Close Shift

View Shift History

Reopen Shift
```

Roles:

```text
Owner
Manager
Staff
```

---

## Open Shift Screen

Inputs:

```text
Shift Template

Opening Cash

Assigned Staff
```

Output:

```text
Active Shift
```

---

## Active Shift Screen

Displays:

```text
Current Shift

Assigned Staff

Assigned DUs

Shift Transactions
```

---

## Close Shift Screen

Displays:

```text
Nozzle Readings

Cash Summary

Collections

Expenses

Variance

DSSR Preview
```

Action:

```text
Close Shift
```

---

# Nozzle Readings Module

## Nozzle Readings

Purpose:

Capture fuel sales.

Layout:

```text
DU
 ├─ Nozzle 1
 ├─ Nozzle 2
 └─ Nozzle 3
```

Grouped by:

```text
Dispenser Unit (DU)
```

---

### Actions

```text
Enter Closing Reading

Review Reading

View History
```

---

# Sales Module

## Sales

Purpose:

Record manual sales.

Examples:

```text
Engine Oil
Coolant
Grease
Accessories
```

Fuel sales continue to be derived from nozzle readings.

---

### Actions

```text
Create Sale

Edit Sale

View Sale History
```

---

## Sale Detail

Displays:

```text
Products

Quantities

Taxes

Customer

Document Number
```

---

# Collections Module

## Collections

Purpose:

Record customer payments.

---

### Actions

```text
Record Collection

View Collection History

Print Receipt
```

---

# Expense Module

## Expenses

Purpose:

Manage station expenses.

---

### Actions

```text
Create Expense

Edit Expense

View Expense History
```

---

## Expense Categories

Purpose:

Manage categories.

Examples:

```text
Salary
Electricity
Maintenance
Custom Categories
```

---

# Purchases Module

## Purchases

Purpose:

Manage inventory purchases.

---

### Actions

```text
Create Purchase

Edit Purchase

View History
```

---

# Inventory Module

## Stock Overview

Purpose:

Inventory visibility.

Displays:

```text
Products

Available Stock

Recent Movements
```

---

## Variance Screen

Purpose:

Variance monitoring.

Displays:

```text
Expected Stock

Actual Stock

Variance

Reason
```

---

## Tank Management

Displays:

```text
Tank Capacity

Product

Stock Movements
```

---

# CRM Module

## Customers

Purpose:

Manage customer accounts.

---

### Actions

```text
Create Customer

Edit Customer

View Statement

Record Credit Sale
```

---

## Customer Profile

Displays:

```text
Customer Details

Outstanding Balance

Credit Limit

Transaction History
```

---

## Suppliers

Purpose:

Manage supplier records.

---

### Actions

```text
Create Supplier

Edit Supplier

View Supplier History
```

---

# Reports Module

## DSSR

Purpose:

View DSSR snapshots.

Displays:

```text
Sales

Expenses

Collections

Variance

Cash Summary
```

---

## Sales Reports

Displays:

```text
Sales by Day

Sales by Product

Sales by Customer
```

---

## Expense Reports

Displays:

```text
Expenses by Category

Expenses by Period
```

---

## Customer Reports

Displays:

```text
Outstanding Balances

Collections

Credit Exposure
```

---

## Variance Reports

Displays:

```text
Variance Trends

Stock Shortages

Evaporation Analysis
```

---

# Administration Module

## Station Overview

Purpose:

A consolidated, tabbed administration panel replacing all separate configuration screens. Used for rare setup reviews and adjustments post-onboarding.

Tabs / Panels:

- **General Info**: Edit station name, code, address, phone, grace period settings, and onboarding status.
- **Products Catalog**: Add, edit, or archive products (both fuel and dry-stock items like lubricants/coolants).
- **Storage Tanks**: Configure capacity and link tanks to fuel products.
- **Dispenser Units**: Configure ACTIVE/MAINTENANCE dispensers.
- **Nozzles Mapping**: Map nozzles to dispensers and tanks, and set starting readings.
- **Shift Templates**: Manage shifts definitions and timing boundaries.

---

# Audit Module

## Audit Logs

Purpose:

Visibility and accountability.

Displays:

```text
Entity

Action

User

Timestamp
```

Accessible to:

```text
All Users
```

---

## Event History

Purpose:

Operational event tracing.

Displays:

```text
Business Events

Sync Events

Adjustments
```

---

# Mobile MVP

## Available Screens

```text
Dashboard

DSSR

Reports
```

---

## Not Available

```text
Open Shift

Close Shift

Nozzle Readings

Expenses

Purchases

Collections

Sales Entry
```

---

# MVP Screen Count

## Core Operational

```text
Dashboard
Shift Management
Nozzle Readings
Sales
Collections
Expenses
Purchases
```

---

## Supporting

```text
Customers
Suppliers
Inventory
Reports
```

---

## Administration

```text
Users
Products
Station Overview
Shift Templates
```

---

# Navigation Principles Summary

1. Shift Management is a dedicated module.
    
2. Nozzle entry is grouped by DU.
    
3. Expenses, Purchases, Collections, and Sales remain separate modules.
    
4. Station Overview acts as the operational configuration hub.
    
5. Desktop is the primary operational platform.
    
6. Mobile is monitoring-focused for MVP.
    
7. Every operational workflow has a dedicated screen.
    
8. Navigation follows real fuel-station operations rather than generic ERP structures.
    

---
