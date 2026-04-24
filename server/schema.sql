-- Run this in the Neon SQL Editor (https://console.neon.tech) after creating a project.

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
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_roster_date ON shift_swap_requests (roster_date);
CREATE INDEX IF NOT EXISTS idx_shift_swap_attachments_request ON shift_swap_attachments (request_id);
