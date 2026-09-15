## Purpose

This document defines role-based access control (RBAC) for the Fuel Pump ERP platform.

It serves as the foundation for:

- Backend authorization

- Frontend access control

- Screen visibility

- API permissions

- Row-Level Security (RLS)

- Future Enterprise permission customization

This document reflects the MVP authorization model and intentionally prioritizes simplicity over complexity.

---

# Authorization Principles

## Principle 1: Simplicity First

The MVP uses fixed system roles.

Roles:

```text
Owner
Manager
Accountant
Staff
```

Custom roles are deferred to Enterprise plans.

---

## Principle 2: Visibility Over Restriction

Operational transparency is preferred wherever possible.

Most users can view operational data relevant to their station.

This improves accountability and discourages malpractice.

---

## Principle 3: Shift Ownership

All operational actions occur within active shifts.

Permissions are primarily evaluated against:

```text
Organization
Station
Role
Shift State
```

---

## Principle 4: Locked Data Cannot Be Modified

Once a shift becomes locked:

```text
No Direct Editing
```

Only adjustment entries may be created.

Authorization rules cannot bypass this business rule.

---

# Role Definitions

## Owner

Highest authority within an organization.

Responsibilities:

- Manage stations

- Manage users

- View all reports

- Configure system settings

- Access audit logs

Access Scope:

```text
All Stations
Within Organization
```

---

## Manager

Operational administrator.

Responsibilities:

- Manage day-to-day operations

- Manage shifts

- Manage products

- Manage customers

- Manage suppliers

Access Scope:

```text
Assigned Stations
```

---

## Accountant

Financial operator.

Responsibilities:

- Record expenses

- Record purchases

- Record collections

- View financial reports

Access Scope:

```text
Assigned Stations
```

---

## Staff

Operational user.

Responsibilities:

- Open shifts

- Close shifts

- Record operational transactions

Access Scope:

```text
Assigned Stations
```

---

# Shift Permissions

| Action                      | Owner | Manager | Accountant | Staff |
| --------------------------- | ----- | ------- | ---------- | ----- |
| View Shift                  | ✅    | ✅      | ✅         | ✅    |
| Open Shift                  | ✅    | ✅      | ❌         | ✅    |
| Close Shift                 | ✅    | ✅      | ❌         | ✅    |
| Reopen Shift (Grace Period) | ✅    | ✅      | ❌         | ❌    |
| View DSSR                   | ✅    | ✅      | ✅         | ✅    |

---

# Expense Permissions

| Action                    | Owner | Manager | Accountant | Staff |
| ------------------------- | ----- | ------- | ---------- | ----- |
| View Expenses             | ✅    | ✅      | ✅         | ✅    |
| Create Expense            | ✅    | ✅      | ✅         | ✅    |
| Edit Expense (Open Shift) | ✅    | ✅      | ✅         | ✅    |
| Create Expense Adjustment | ✅    | ✅      | ✅         | ❌    |
| Void Expense              | ✅    | ✅      | ❌         | ❌    |

---

# Purchase Permissions

| Action                     | Owner | Manager | Accountant | Staff |
| -------------------------- | ----- | ------- | ---------- | ----- |
| View Purchases             | ✅    | ✅      | ✅         | ✅    |
| Create Purchase            | ✅    | ✅      | ✅         | ❌    |
| Edit Purchase (Open Shift) | ✅    | ✅      | ✅         | ❌    |
| Create Purchase Adjustment | ✅    | ✅      | ✅         | ❌    |

---

# Customer Permissions

| Action              | Owner | Manager | Accountant | Staff |
| ------------------- | ----- | ------- | ---------- | ----- |
| View Customers      | ✅    | ✅      | ✅         | ✅    |
| Create Customer     | ✅    | ✅      | ✅         | ❌    |
| Edit Customer       | ✅    | ✅      | ✅         | ❌    |
| Change Credit Limit | ✅    | ✅      | ❌         | ❌    |
| Archive Customer    | ✅    | ✅      | ❌         | ❌    |

---

# Supplier Permissions

| Action           | Owner | Manager | Accountant | Staff |
| ---------------- | ----- | ------- | ---------- | ----- |
| View Suppliers   | ✅    | ✅      | ✅         | ✅    |
| Create Supplier  | ✅    | ✅      | ✅         | ❌    |
| Edit Supplier    | ✅    | ✅      | ✅         | ❌    |
| Archive Supplier | ✅    | ✅      | ❌         | ❌    |

---

# Collection Permissions

| Action                       | Owner | Manager | Accountant | Staff |
| ---------------------------- | ----- | ------- | ---------- | ----- |
| View Collections             | ✅    | ✅      | ✅         | ✅    |
| Record Collection            | ✅    | ✅      | ✅         | ✅    |
| Edit Collection (Open Shift) | ✅    | ✅      | ✅         | ✅    |
| Create Collection Adjustment | ✅    | ✅      | ✅         | ❌    |

---

# Product Permissions

| Action          | Owner | Manager | Accountant | Staff |
| --------------- | ----- | ------- | ---------- | ----- |
| View Products   | ✅    | ✅      | ✅         | ✅    |
| Create Product  | ✅    | ✅      | ❌         | ❌    |
| Edit Product    | ✅    | ✅      | ❌         | ❌    |
| Archive Product | ✅    | ✅      | ❌         | ❌    |

---

# Infrastructure Permissions

## Tanks

| Action      | Owner | Manager | Accountant | Staff |
| ----------- | ----- | ------- | ---------- | ----- |
| View Tanks  | ✅    | ✅      | ✅         | ✅    |
| Create Tank | ✅    | ✅      | ❌         | ❌    |
| Edit Tank   | ✅    | ✅      | ❌         | ❌    |

---

## Dispenser Units (DU)

| Action    | Owner | Manager | Accountant | Staff |
| --------- | ----- | ------- | ---------- | ----- |
| View DU   | ✅    | ✅      | ✅         | ✅    |
| Create DU | ✅    | ✅      | ❌         | ❌    |
| Edit DU   | ✅    | ✅      | ❌         | ❌    |

---

## Nozzles

| Action        | Owner | Manager | Accountant | Staff |
| ------------- | ----- | ------- | ---------- | ----- |
| View Nozzles  | ✅    | ✅      | ✅         | ✅    |
| Create Nozzle | ✅    | ✅      | ❌         | ❌    |
| Edit Nozzle   | ✅    | ✅      | ❌         | ❌    |

---

# Variance Permissions

| Action          | Owner | Manager | Accountant | Staff |
| --------------- | ----- | ------- | ---------- | ----- |
| View Variance   | ✅    | ✅      | ✅         | ✅    |
| Record Variance | ✅    | ✅      | ✅         | ✅    |

### Notes

MVP does not implement variance approval workflows.

Future versions may introduce:

```text
Variance Approval
Variance Investigation
Variance Escalation
```

---

# User Management Permissions

| Action         | Owner | Manager | Accountant | Staff |
| -------------- | ----- | ------- | ---------- | ----- |
| Create User    | ✅    | ❌      | ❌         | ❌    |
| Disable User   | ✅    | ❌      | ❌         | ❌    |
| Reset Password | ✅    | ❌      | ❌         | ❌    |
| Assign Roles   | ✅    | ❌      | ❌         | ❌    |

---

# Audit Permissions

| Action          | Owner | Manager | Accountant | Staff |
| --------------- | ----- | ------- | ---------- | ----- |
| View Audit Logs | ✅    | ✅      | ✅         | ✅    |

### Notes

Audit visibility is intentionally broad.

Operational transparency is considered a deterrent against malpractice and unauthorized modifications.

---

# Reporting Permissions

| Action                | Owner | Manager | Accountant | Staff |
| --------------------- | ----- | ------- | ---------- | ----- |
| View Dashboard        | ✅    | ✅      | ✅         | ✅    |
| View DSSR             | ✅    | ✅      | ✅         | ✅    |
| View Sales Reports    | ✅    | ✅      | ✅         | ✅    |
| View Customer Reports | ✅    | ✅      | ✅         | ✅    |
| Export Reports        | ✅    | ✅      | ✅         | ❌    |

---

# Mobile Access Policy

## MVP Philosophy

Mobile applications are intended primarily for:

```text
Monitoring
Reporting
Business Oversight
```

Desktop applications remain the primary operational workstation.

---

## Mobile Permissions

| Feature             | Owner | Manager | Accountant | Staff |
| ------------------- | ----- | ------- | ---------- | ----- |
| View Dashboard      | ✅    | ✅      | ✅         | ✅    |
| View Reports        | ✅    | ✅      | ✅         | ✅    |
| View DSSR           | ✅    | ✅      | ✅         | ✅    |
| Record Transactions | ❌    | ❌      | ❌         | ❌    |
| Edit Transactions   | ❌    | ❌      | ❌         | ❌    |

---

# Enterprise Extensions

Enterprise plans may introduce:

## Custom Roles

Examples:

```text
Regional Manager
Auditor
Operations Supervisor
```

---

## Custom Permissions

Examples:

```text
Can Reopen Shifts
Can Approve Variances
Can Export Reports
Can Manage Credit Limits
```

---

## Approval Workflows

Examples:

```text
Expense Approval
Purchase Approval
Variance Approval
Credit Limit Approval
```

---

# Authorization Principles Summary

1. MVP uses fixed system roles.

2. Owners manage users and system configuration.

3. Managers operate stations.

4. Accountants manage financial operations.

5. Staff manage operational transactions.

6. Closed shifts cannot be modified directly.

7. Mobile is monitoring-first.

8. Audit logs are visible to all station users.

9. Enterprise introduces custom roles and permissions.

10. Authorization must never bypass business rules.
