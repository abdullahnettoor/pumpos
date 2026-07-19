-- Per-nozzle testing (calibration) volume so the shift can deduct it from net
-- fuel sold (testing returns to the tank; it is not a sale and not stock loss).
ALTER TABLE "nozzle_readings" ADD COLUMN IF NOT EXISTS "testing_volume" numeric(12,3) DEFAULT '0' NOT NULL;
