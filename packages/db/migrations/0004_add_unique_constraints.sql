-- Clean up expense_categories duplicates
DELETE FROM "expense_categories" a USING "expense_categories" b 
WHERE a.id > b.id AND a.name = b.name AND a.organization_id = b.organization_id;

-- Clean up supplier duplicates
DELETE FROM "suppliers" a USING "suppliers" b 
WHERE a.id > b.id AND a.name = b.name AND a.organization_id = b.organization_id;

-- Add unique indexes/constraints
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_org_name_idx ON "expense_categories" ("organization_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_name_idx ON "suppliers" ("organization_id", "name");
