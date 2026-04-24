-- Only if you created vacation_requests before conflict_warnings existed:
ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS conflict_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;
