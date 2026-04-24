-- Run once in Neon if you already have tables from an older install.
-- Idempotent: safe to re-run.

ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS admin_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE shift_swap_requests
  ADD COLUMN IF NOT EXISTS admin_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS shift_swap_attachments (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES shift_swap_requests (id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  url_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_swap_attachments_request ON shift_swap_attachments (request_id);
