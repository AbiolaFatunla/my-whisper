/**
 * Database Service - Supabase Integration
 * Handles all database operations for transcripts and corrections
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { extractCorrections, applyCorrections } = require('./personalization');

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
 */
async function saveTranscript({ userId, rawText, personalizedText, audioUrl, durationSeconds, title }) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const id = generateId();

  const { data, error } = await client
    .from('transcripts')
    .insert({
      id,
      user_id: userId,
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
 * Get all transcripts for a user
 * Sorted by created_at descending (newest first)
 */
async function getTranscripts(userId, limit = 50, offset = 0) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const { data, error } = await client
    .from('transcripts')
    .select('*')
    .eq('user_id', userId)
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
 * Also extracts corrections by comparing raw_text with finalText
 */
async function updateTranscript(userId, id, { finalText }) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  // First, fetch the current transcript to get raw_text
  const { data: existing, error: fetchError } = await client
    .from('transcripts')
    .select('raw_text')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    console.error('Error fetching transcript for correction extraction:', fetchError);
    throw fetchError;
  }

  // Extract corrections from the diff
  if (existing?.raw_text && finalText) {
    const corrections = extractCorrections(existing.raw_text, finalText);

    // Save each correction
    for (const correction of corrections) {
      try {
        await saveCorrection(userId, {
          originalToken: correction.original,
          correctedToken: correction.corrected
        });
        console.log('✓ Correction saved:', correction.original, '->', correction.corrected);
      } catch (corrError) {
        console.error('Error saving correction:', corrError);
        // Continue saving other corrections even if one fails
      }
    }

    if (corrections.length > 0) {
      console.log(`✓ Extracted ${corrections.length} correction(s) from edit`);
    }
  }

  // Update the transcript
  const { data, error } = await client
    .from('transcripts')
    .update({
      final_text: finalText,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', userId)
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
async function deleteTranscript(userId, id) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const { error } = await client
    .from('transcripts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting transcript:', error);
    throw error;
  }

  return true;
}

/**
 * Get all corrections for a user
 */
async function getCorrections(userId, minCount = 2) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  const { data, error } = await client
    .from('corrections')
    .select('*')
    .eq('user_id', userId)
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
async function saveCorrection(userId, { originalToken, correctedToken }) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Database not initialized');
  }

  // Check if correction already exists
  const { data: existing } = await client
    .from('corrections')
    .select('*')
    .eq('user_id', userId)
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
        user_id: userId,
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

/**
 * Apply personalization to text using learned corrections
 * Fetches corrections from DB and applies those with count >= minCount
 */
async function personalizeText(userId, text, minCount = 2) {
  if (!text) return text;

  try {
    const corrections = await getCorrections(userId, minCount);

    if (corrections.length === 0) {
      return text;
    }

    const personalized = applyCorrections(text, corrections, minCount);
    console.log(`✓ Applied ${corrections.length} correction(s) to transcription`);
    return personalized;
  } catch (error) {
    console.error('Error applying personalization:', error);
    // Return original text if personalization fails
    return text;
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
  saveCorrection,
  personalizeText
};
