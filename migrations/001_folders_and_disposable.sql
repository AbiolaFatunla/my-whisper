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

-- 5. RLS policies for folders (users can only access their own folders)
CREATE POLICY "Users can view their own folders"
  ON folders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own folders"
  ON folders FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own folders"
  ON folders FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own folders"
  ON folders FOR DELETE
  USING (user_id = auth.uid());

-- 6. Service role bypass policy (for API server using service key)
-- If your API uses the anon key with user JWT, the above policies are sufficient.
-- If using a service role key, you may need:
-- CREATE POLICY "Service role full access" ON folders FOR ALL USING (true);
