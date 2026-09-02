-- ============================================================
-- BINTRACKER - Supabase Database Setup
-- Run this entire script in the Supabase SQL Editor
-- Project: https://supabase.com → SQL Editor → New Query
-- ============================================================

-- 1. LOCATIONS
--    Represents a physical room or area (e.g., Storage Closet, Garage)
CREATE TABLE IF NOT EXISTS locations (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  prefix      TEXT        NOT NULL DEFAULT '',  -- used for bin IDs, e.g. "SC", "GAR"
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BINS
--    A physical storage bin/box within a location
CREATE TABLE IF NOT EXISTS bins (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id  TEXT        NOT NULL UNIQUE,      -- e.g., SC-001, GAR-003
  location_id UUID        REFERENCES locations(id) ON DELETE SET NULL,
  label       TEXT        NOT NULL DEFAULT '',  -- short description, e.g. "Holiday Decor"
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ITEMS
--    Individual items stored inside a bin
CREATE TABLE IF NOT EXISTS items (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  bin_id      UUID        NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  quantity    TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. BIN IMAGES
--    Photos of bin contents, stored in Supabase Storage
CREATE TABLE IF NOT EXISTS bin_images (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  bin_id       UUID        NOT NULL REFERENCES bins(id) ON DELETE CASCADE,
  storage_path TEXT        NOT NULL,
  public_url   TEXT        NOT NULL,
  caption      TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
-- Open policies for personal/family use.
-- If you want to restrict access, add Supabase Auth later.

ALTER TABLE locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bin_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON locations  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON bins       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON items      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON bin_images FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── STORAGE BUCKET ──────────────────────────────────────────
-- Create this manually in Supabase Dashboard:
--   Storage → New Bucket → Name: "bin-images" → Public: ON
--
-- Then add a storage policy:
--   Storage → Policies → bin-images → New Policy → "Give users full access"
--   or run:
INSERT INTO storage.buckets (id, name, public)
VALUES ('bin-images', 'bin-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public storage access"
  ON storage.objects FOR ALL TO anon
  USING (bucket_id = 'bin-images')
  WITH CHECK (bucket_id = 'bin-images');

-- ─── DONE ────────────────────────────────────────────────────
-- After running this script, go back to config.js and fill in:
--   SUPABASE_URL  →  Settings → API → Project URL
--   SUPABASE_ANON_KEY  →  Settings → API → anon public key
