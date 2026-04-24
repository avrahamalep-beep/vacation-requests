-- =============================================================================
-- NEON: pega y ejecuta TODO este archivo en el SQL Editor (una sola vez, o
-- otra vez si añadimos columnas: es idempotente gracias a IF NOT EXISTS).
-- =============================================================================

-- Nuevas instalaciones: tablas completas
CREATE TABLE IF NOT EXISTS vacation_requests (
  id UUID PRIMARY KEY,
  operator_name TEXT NOT NULL,
  operator_email TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  conflict_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  roster_processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vacation_attachments (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES vacation_requests (id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  url_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacation_requests_created_at ON vacation_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_overlap ON vacation_requests (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_vacation_attachments_request ON vacation_attachments (request_id);

CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id UUID PRIMARY KEY,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  colleague_name TEXT NOT NULL,
  colleague_email TEXT NOT NULL,
  roster_date DATE NOT NULL,
  current_shift TEXT NOT NULL CHECK (current_shift IN ('morning', 'night')),
  requested_shift TEXT NOT NULL CHECK (requested_shift IN ('morning', 'night')),
  details TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  roster_processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shift_swap_attachments (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES shift_swap_requests (id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  url_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_created_at ON shift_swap_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_swap_attachments_request ON shift_swap_attachments (request_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_roster_date ON shift_swap_requests (roster_date);

CREATE TABLE IF NOT EXISTS roster_snapshots (
  id SERIAL PRIMARY KEY,
  original_name TEXT NOT NULL,
  rows_json JSONB NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roster_snapshots_uploaded_at ON roster_snapshots (uploaded_at DESC);

-- Bases creadas antes: añadir columnas que faltan (no falla si ya existen)
ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS conflict_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roster_processed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE shift_swap_requests
  ADD COLUMN IF NOT EXISTS roster_processed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT NOT NULL DEFAULT '';

-- Older vacation_requests without admin column
ALTER TABLE vacation_requests
  ADD COLUMN IF NOT EXISTS admin_notes TEXT NOT NULL DEFAULT '';
