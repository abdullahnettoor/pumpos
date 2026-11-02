-- Custom SQL migration file, put your code below! ---- Head type (Direct / Indirect, #685): classify already-seeded default heads.
-- is_system = true means the lazy seeder created the row, so a custom head that
-- merely shares the name stays Indirect. Keep in step with DEFAULT_*_HEADS in
-- @pump/shared (utils/head-nature.ts).
UPDATE "expense_categories" SET "nature" = 'DIRECT' WHERE "is_system" = true AND "name" = 'Generator Diesel';
UPDATE "income_categories" SET "nature" = 'DIRECT' WHERE "is_system" = true AND "name" = 'Commission';
