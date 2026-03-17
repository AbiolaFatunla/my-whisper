-- Migration: Add folders, series, and disposable notes support
-- Run this in your Supabase SQL Editor

-- 1. Create folders table
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add new columns to transcripts table
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS series_id UUID;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS series_order INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS is_disposable BOOLEAN DEFAULT FALSE;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_folder_id ON transcripts(folder_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_series_id ON transcripts(series_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_is_disposable ON transcripts(is_disposable);

-- 4. Enable RLS on folders table
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for folders (matches transcripts/corrections pattern)
-- Policy 1: Anon role gets full access (server uses anon key for all operations)
CREATE POLICY "Allow anon access for Lambda"
  ON folders FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Policy 2: Authenticated users can access own folders (for direct client-side access)
CREATE POLICY "Users can access own folders"
  ON folders FOR ALL
  USING (auth.uid() = user_id);
