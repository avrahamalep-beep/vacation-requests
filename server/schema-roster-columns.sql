-- Run in Neon SQL Editor if tables already exist without roster columns.

ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS roster_processed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE shift_swap_requests
  ADD COLUMN IF NOT EXISTS roster_processed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
