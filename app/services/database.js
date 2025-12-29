/**
 * Database Service - Supabase Integration
 * Handles all database operations for transcripts and corrections
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

let supabase = null;

/**
 * Initialize Supabase client
 */
function initSupabase() {
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✓ Supabase client initialized');
  return supabase;
}

/**
 * Generate a unique ID for transcripts
 */
function generateId() {
  return uuidv4();
}

/**
 * Save a new transcript to the database
 * Note: For Phase 1, we use a temporary user_id since auth isn't implemented yet
 */
async function saveTranscript({ rawText, personalizedText, audioUrl, durationSeconds, title }) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const id = generateId();
  // Temporary user_id for Phase 1 (before auth is implemented)
  // This will be replaced with actual auth.uid() in Phase 5
  const tempUserId = process.env.TEMP_USER_ID || '00000000-0000-0000-0000-000000000000';

  const { data, error } = await client
    .from('transcripts')
    .insert({
      id,
      user_id: tempUserId,
      raw_text: rawText,
      personalized_text: personalizedText || rawText,
      final_text: null,
      audio_url: audioUrl,
      duration_seconds: durationSeconds,
      title: title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving transcript:', error);
    throw error;
  }

  console.log('✓ Transcript saved:', id);
  return data;
}

/**
 * Get a transcript by ID
 */
async function getTranscript(id) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const { data, error } = await client
    .from('transcripts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }

  return data;
}

/**
 * Get all transcripts for the current user
 * Sorted by created_at descending (newest first)
 */
async function getTranscripts(limit = 50, offset = 0) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const tempUserId = process.env.TEMP_USER_ID || '00000000-0000-0000-0000-000000000000';

  const { data, error } = await client
    .from('transcripts')
    .select('*')
    .eq('user_id', tempUserId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching transcripts:', error);
    throw error;
  }

  return data || [];
}

/**
 * Update a transcript (for editing)
 */
async function updateTranscript(id, { finalText }) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const { data, error } = await client
    .from('transcripts')
    .update({
      final_text: finalText,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating transcript:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a transcript
 */
async function deleteTranscript(id) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const { error } = await client
    .from('transcripts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting transcript:', error);
    throw error;
  }

  return true;
}

/**
 * Get all corrections for the current user
 */
async function getCorrections(minCount = 2) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const tempUserId = process.env.TEMP_USER_ID || '00000000-0000-0000-0000-000000000000';

  const { data, error } = await client
    .from('corrections')
    .select('*')
    .eq('user_id', tempUserId)
    .eq('disabled', false)
    .gte('count', minCount)
    .order('count', { ascending: false });

  if (error) {
    console.error('Error fetching corrections:', error);
    throw error;
  }

  return data || [];
}

/**
 * Save or update a correction
 */
async function saveCorrection({ originalToken, correctedToken }) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const tempUserId = process.env.TEMP_USER_ID || '00000000-0000-0000-0000-000000000000';

  // Check if correction already exists
  const { data: existing } = await client
    .from('corrections')
    .select('*')
    .eq('user_id', tempUserId)
    .eq('original_token', originalToken)
    .eq('corrected_token', correctedToken)
    .single();

  if (existing) {
    // Increment count
    const { data, error } = await client
      .from('corrections')
      .update({
        count: existing.count + 1,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Create new correction
    const id = generateId();
    const { data, error } = await client
      .from('corrections')
      .insert({
        id,
        user_id: tempUserId,
        original_token: originalToken,
        corrected_token: correctedToken,
        count: 1,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        disabled: false
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = {
  initSupabase,
  generateId,
  saveTranscript,
  getTranscript,
  getTranscripts,
  updateTranscript,
  deleteTranscript,
  getCorrections,
  saveCorrection
};
