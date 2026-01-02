/**
 * My Whisper API - AWS Lambda Handler
 * Native Lambda implementation for API Gateway HTTP API
 */

const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Environment variables (set via Terraform)
const BUCKET_NAME = process.env.AUDIO_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-west-2';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Clients (initialized once, reused across invocations)
let s3Client;
let openaiClient;
let supabase;

function initClients() {
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  if (!openaiClient && OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  if (!supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

// Response helpers
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Anonymous-ID',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

/**
 * Extract user ID from request headers
 * Priority: 1. JWT token (authenticated user) 2. Anonymous ID header
 */
function getUserIdFromHeaders(headers) {
  // Normalize header keys to lowercase
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Check for Authorization header (JWT from Supabase Auth)
  const authHeader = normalizedHeaders['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // Decode JWT payload (base64) - we don't verify here since Supabase RLS does that
      // For Lambda with service role, we just need the user ID
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      if (payload.sub) {
        console.log('Using authenticated user ID:', payload.sub);
        return payload.sub;
      }
    } catch (e) {
      console.error('Failed to decode JWT:', e.message);
    }
  }

  // Fall back to anonymous ID header
  const anonymousId = normalizedHeaders['x-anonymous-id'];
  if (anonymousId) {
    // Validate it looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(anonymousId)) {
      console.log('Using anonymous user ID:', anonymousId);
      return anonymousId;
    }
  }

  // Fall back to temp user ID (for backwards compatibility during transition)
  console.log('No user ID found, using TEMP_USER_ID');
  return TEMP_USER_ID;
}

function errorResponse(statusCode, message) {
  return jsonResponse(statusCode, { error: message });
}

// Utility functions
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255);
}

function isValidAudioFile(filename) {
  const validExtensions = ['.webm', '.mp3', '.wav', '.ogg', '.m4a'];
  return validExtensions.includes(path.extname(filename).toLowerCase());
}

function cleanGeneratedTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/["'`""'']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');
}

/**
 * Parse S3 URL and extract bucket and key
 * Supports formats:
 * - https://bucket.s3.region.amazonaws.com/key
 * - https://bucket.s3.amazonaws.com/key
 * - s3://bucket/key
 */
function parseS3Url(url) {
  try {
    // Handle s3:// protocol
    if (url.startsWith('s3://')) {
      const parts = url.replace('s3://', '').split('/');
      const bucket = parts.shift();
      const key = parts.join('/');
      return { bucket, key };
    }

    // Handle https:// S3 URLs
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Format: bucket.s3.region.amazonaws.com or bucket.s3.amazonaws.com
    if (hostname.includes('.s3.') && hostname.endsWith('.amazonaws.com')) {
      const bucket = hostname.split('.s3.')[0];
      const key = urlObj.pathname.substring(1); // Remove leading /
      return { bucket, key };
    }

    return null;
  } catch (error) {
    console.error('Error parsing S3 URL:', error);
    return null;
  }
}

/**
 * Download file from S3 using SDK (works with private buckets)
 */
async function downloadFromS3(fileUrl) {
  const s3Info = parseS3Url(fileUrl);

  if (s3Info) {
    // Use S3 SDK for S3 URLs (required for private buckets)
    const command = new GetObjectCommand({
      Bucket: s3Info.bucket,
      Key: s3Info.key
    });

    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // Fallback to fetch for non-S3 URLs
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error('Failed to download audio file');
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// Temporary user ID for backwards compatibility during auth transition
// Will be removed once all users have anonymous IDs
const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

// Anonymous user recording limit
const ANONYMOUS_RECORDING_LIMIT = 2;

/**
 * Check if request has a valid JWT (authenticated user)
 */
function isAuthenticatedUser(headers) {
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  const authHeader = normalizedHeaders['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      return !!payload.sub;
    } catch (e) {
      return false;
    }
  }
  return false;
}

// ================================
// PERSONALIZATION FUNCTIONS
// ================================

/**
 * Tokenize text into words
 */
function tokenize(text) {
  if (!text) return [];
  return text.trim().split(/\s+/).filter(w => w.length > 0);
}

/**
 * Normalize text for comparison
 */
function normalize(word) {
  return word.toLowerCase().replace(/[.,!?;:'"]/g, '');
}

/**
 * Find longest common subsequence between two word arrays
 */
function findLCS(words1, words2) {
  const m = words1.length;
  const n = words2.length;

  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalize(words1[i - 1]) === normalize(words2[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matches = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (normalize(words1[i - 1]) === normalize(words2[j - 1])) {
      matches.unshift({ i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

/**
 * Strip punctuation from word for matching
 */
function stripPunctuation(word) {
  return word.replace(/^[.,!?;:'"]+|[.,!?;:'"]+$/g, '');
}

/**
 * Decompose a phrase correction into word-level corrections
 * Only works when original and corrected have equal word counts
 */
function decomposePhraseToWords(originalWords, correctedWords) {
  const wordCorrections = [];

  for (let i = 0; i < originalWords.length; i++) {
    const original = originalWords[i];
    const corrected = correctedWords[i];

    // Compare without punctuation
    const originalClean = stripPunctuation(original);
    const correctedClean = stripPunctuation(corrected);

    // Only add if actually different (case-insensitive comparison)
    if (originalClean.toLowerCase() !== correctedClean.toLowerCase()) {
      wordCorrections.push({
        original: originalClean,
        corrected: correctedClean
      });
    }
  }

  return wordCorrections;
}

/**
 * Extract corrections by comparing raw text with edited text
 * Uses LCS for alignment, then decomposes equal-length phrases into word-level corrections
 */
function extractCorrections(rawText, finalText) {
  if (!rawText || !finalText) return [];
  if (rawText.trim() === finalText.trim()) return [];

  const rawWords = tokenize(rawText);
  const finalWords = tokenize(finalText);
  const matches = findLCS(rawWords, finalWords);
  const corrections = [];

  const extendedMatches = [
    { i: -1, j: -1 },
    ...matches,
    { i: rawWords.length, j: finalWords.length }
  ];

  for (let k = 0; k < extendedMatches.length - 1; k++) {
    const curr = extendedMatches[k];
    const next = extendedMatches[k + 1];

    // Words between current match and next match are differences
    const rawStart = curr.i + 1;
    const rawEnd = next.i;
    const finalStart = curr.j + 1;
    const finalEnd = next.j;

    // Extract the differing word arrays
    const originalWordArray = rawWords.slice(rawStart, rawEnd);
    const correctedWordArray = finalWords.slice(finalStart, finalEnd);

    // Skip if either side is empty (pure insertion or deletion)
    if (originalWordArray.length === 0 || correctedWordArray.length === 0) {
      continue;
    }

    // Check if word counts are equal - if so, decompose into word pairs
    if (originalWordArray.length === correctedWordArray.length) {
      // Decompose into word-level corrections
      const wordCorrections = decomposePhraseToWords(originalWordArray, correctedWordArray);
      corrections.push(...wordCorrections);
    } else {
      // Unequal word counts - keep as phrase correction
      const originalPhrase = originalWordArray.join(' ');
      const correctedPhrase = correctedWordArray.join(' ');

      const normalizedOriginal = normalize(originalPhrase);
      const normalizedCorrected = normalize(correctedPhrase);

      if (normalizedOriginal !== normalizedCorrected) {
        corrections.push({
          original: originalPhrase,
          corrected: correctedPhrase
        });
      }
    }
  }

  return corrections;
}

/**
 * Apply learned corrections to text
 */
function applyCorrections(text, corrections, minCount = 2) {
  if (!text || !corrections || corrections.length === 0) return text;

  let result = text;

  const sortedCorrections = [...corrections]
    .filter(c => c.count >= minCount)
    .sort((a, b) => b.original_token.length - a.original_token.length);

  for (const correction of sortedCorrections) {
    const original = correction.original_token;
    const corrected = correction.corrected_token;

    const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedOriginal}\\b`, 'gi');

    result = result.replace(regex, corrected);
  }

  return result;
}

/**
 * Get corrections from database
 */
async function getCorrections(userId, minCount = 2) {
  const { data, error } = await supabase
    .from('corrections')
    .select('*')
    .eq('user_id', userId)
    .eq('disabled', false)
    .gte('count', minCount)
    .order('count', { ascending: false });

  if (error) {
    console.error('Error fetching corrections:', error);
    return [];
  }

  return data || [];
}

/**
 * Save or update a correction
 */
async function saveCorrection(userId, originalToken, correctedToken) {
  // Check if correction already exists
  const { data: existing } = await supabase
    .from('corrections')
    .select('*')
    .eq('user_id', userId)
    .eq('original_token', originalToken)
    .eq('corrected_token', correctedToken)
    .single();

  if (existing) {
    // Increment count
    const { data, error } = await supabase
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
    const id = `cor_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const { data, error } = await supabase
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

// Route handlers
async function handleHealth() {
  return jsonResponse(200, {
    status: 'ok',
    bucket: BUCKET_NAME,
    region: REGION,
    features: {
      transcription: !!openaiClient,
      database: !!supabase
    }
  });
}

async function handleGetUploadUrl(body) {
  const { filename, contentType } = body;

  if (!filename) {
    return errorResponse(400, 'Filename is required');
  }

  if (!isValidAudioFile(filename)) {
    return errorResponse(400, 'Invalid file type. Only audio files are allowed.');
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const key = `uploads/${sanitizedFilename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType || 'audio/webm'
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

  return jsonResponse(200, {
    uploadUrl,
    key,
    filename: sanitizedFilename
  });
}

async function handleMoveToShared(body) {
  const { filename } = body;

  if (!filename) {
    return errorResponse(400, 'Filename is required');
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const sourceKey = `uploads/${sanitizedFilename}`;
  const destinationKey = `shared/${sanitizedFilename}`;

  await s3Client.send(new CopyObjectCommand({
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${sourceKey}`,
    Key: destinationKey
  }));

  await s3Client.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: sourceKey
  }));

  const shareableUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${destinationKey}`;

  return jsonResponse(200, {
    success: true,
    shareableUrl,
    filename: sanitizedFilename
  });
}

async function handleTranscribe(body, userId, headers) {
  const { fileUrl } = body;

  if (!fileUrl) {
    return errorResponse(400, 'File URL is required');
  }

  // Check anonymous user limit
  if (!isAuthenticatedUser(headers)) {
    try {
      const { data: transcripts } = await supabase
        .from('transcripts')
        .select('id')
        .eq('user_id', userId);

      if (transcripts && transcripts.length >= ANONYMOUS_RECORDING_LIMIT) {
        return errorResponse(403, 'Trial limit reached. Sign in for unlimited access.');
      }
    } catch (limitError) {
      console.error('Error checking limit:', limitError);
      // Continue if limit check fails (fail open)
    }
  }

  if (!openaiClient) {
    return errorResponse(500, 'OpenAI API key not configured');
  }

  // Download audio file using S3 SDK (required for private buckets)
  let audioFile;
  try {
    audioFile = await downloadFromS3(fileUrl);
  } catch (downloadError) {
    console.error('Failed to download audio:', downloadError);
    return errorResponse(500, 'Failed to download audio file');
  }

  // Create temp file for Whisper
  const urlObject = new URL(fileUrl);
  const originalFilename = path.basename(urlObject.pathname);
  const tempFilePath = path.join('/tmp', originalFilename);
  fs.writeFileSync(tempFilePath, audioFile);

  let transcription;
  try {
    transcription = await openaiClient.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: 'whisper-1',
      language: 'en'
    });
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }

  // Generate AI title
  let generatedTitle = null;
  if (transcription?.text) {
    try {
      const prompt = `Summarize the following transcript in 1 to 4 words. Return only the concise title.\n\nTranscript:\n${transcription.text}`;
      const titleResponse = await openaiClient.responses.create({
        model: 'gpt-4o-mini',
        input: prompt,
        max_output_tokens: 20,
        temperature: 0.2
      });
      const rawTitle = titleResponse.output_text || titleResponse.outputText || null;
      generatedTitle = cleanGeneratedTitle(rawTitle);
    } catch (titleError) {
      console.error('Title generation error:', titleError);
    }
  }

  // Apply personalization (learned corrections) to the raw transcription
  const rawText = transcription?.text || '';
  let personalizedText = rawText;

  if (supabase) {
    try {
      const corrections = await getCorrections(userId, 2);
      if (corrections.length > 0) {
        personalizedText = applyCorrections(rawText, corrections, 2);
        console.log(`Applied ${corrections.length} correction(s) to transcription`);
      }
    } catch (persError) {
      console.error('Personalization error:', persError);
      // Continue with raw text if personalization fails
    }
  }

  // Save to Supabase
  let savedTranscript = null;
  if (supabase) {
    try {
      const id = `tr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const { data, error } = await supabase
        .from('transcripts')
        .insert({
          id,
          user_id: userId,
          raw_text: rawText,
          personalized_text: personalizedText,
          audio_url: fileUrl,
          title: generatedTitle
        })
        .select()
        .single();

      if (error) throw error;
      savedTranscript = data;
      console.log('Transcript saved:', savedTranscript.id);
    } catch (dbError) {
      console.error('Database save error:', dbError);
    }
  }

  return jsonResponse(200, {
    success: true,
    transcription: personalizedText,
    rawTranscription: rawText,
    language: 'en',
    title: generatedTitle,
    transcriptId: savedTranscript?.id || null,
    shareableUrl: fileUrl
  });
}

async function handleGetTranscripts(queryParams, userId) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const limit = parseInt(queryParams?.limit) || 50;
  const offset = parseInt(queryParams?.offset) || 0;

  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching transcripts:', error);
    return errorResponse(500, 'Failed to fetch transcripts');
  }

  return jsonResponse(200, { transcripts: data });
}

async function handleGetTranscript(id, userId) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return errorResponse(404, 'Transcript not found');
  }

  return jsonResponse(200, { transcript: data });
}

async function handleUpdateTranscript(id, body, userId) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const { finalText } = body;

  // First, fetch the current transcript to get raw_text for correction extraction
  const { data: existing, error: fetchError } = await supabase
    .from('transcripts')
    .select('raw_text')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    console.error('Error fetching transcript:', fetchError);
    return errorResponse(500, 'Failed to fetch transcript');
  }

  // Extract corrections from the diff
  if (existing?.raw_text && finalText) {
    const corrections = extractCorrections(existing.raw_text, finalText);

    // Save each correction
    for (const correction of corrections) {
      try {
        await saveCorrection(userId, correction.original, correction.corrected);
        console.log('Correction saved:', correction.original, '->', correction.corrected);
      } catch (corrError) {
        console.error('Error saving correction:', corrError);
        // Continue saving other corrections even if one fails
      }
    }

    if (corrections.length > 0) {
      console.log(`Extracted ${corrections.length} correction(s) from edit`);
    }
  }

  // Update the transcript
  const { data, error } = await supabase
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
    return errorResponse(500, 'Failed to update transcript');
  }

  return jsonResponse(200, { transcript: data });
}

async function handleDeleteTranscript(id, userId) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const { error } = await supabase
    .from('transcripts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting transcript:', error);
    return errorResponse(500, 'Failed to delete transcript');
  }

  return jsonResponse(200, { success: true });
}

/**
 * Public share endpoint - returns transcript data for shared links
 * No auth required, read-only access to specific fields only
 * Note: This endpoint is intentionally public - anyone with the ID can view
 */
async function handlePublicShare(id) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  if (!id) {
    return errorResponse(400, 'Transcript ID is required');
  }

  // Fetch transcript - no user_id filter since this is a public share
  // Security: Only expose limited fields, not the full transcript record
  const { data, error } = await supabase
    .from('transcripts')
    .select('id, title, raw_text, final_text, personalized_text, audio_url, created_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return errorResponse(404, 'Recording not found');
  }

  // Use best available text: final > personalized > raw
  const text = data.final_text || data.personalized_text || data.raw_text;

  return jsonResponse(200, {
    id: data.id,
    title: data.title,
    text: text,
    audioUrl: data.audio_url,
    createdAt: data.created_at
  });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Share page endpoint - returns HTML with dynamic OG tags for social media previews
 * This allows WhatsApp, Twitter, etc. to show the actual recording title
 */
async function handleSharePage(id) {
  if (!supabase) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body><h1>Error</h1><p>Database not configured</p></body></html>'
    };
  }

  if (!id) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body><h1>Error</h1><p>Recording ID is required</p></body></html>'
    };
  }

  // Fetch transcript
  const { data, error } = await supabase
    .from('transcripts')
    .select('id, title, raw_text, final_text, personalized_text, audio_url, created_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body><h1>Not Found</h1><p>This recording no longer exists.</p></body></html>'
    };
  }

  // Use best available text: final > personalized > raw
  const text = data.final_text || data.personalized_text || data.raw_text || '';
  const title = data.title || 'Voice Recording';
  const description = text.substring(0, 150) + (text.length > 150 ? '...' : '');

  // Build the HTML page with dynamic OG tags
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} - My Whisper</title>

    <!-- Dynamic Open Graph tags for social media previews -->
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="audio">
    <meta property="og:site_name" content="My Whisper">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">

    <meta name="description" content="${escapeHtml(description)}">

    <!-- Redirect to the full share page on Vercel -->
    <script>
        // Pass the transcript ID to the Vercel-hosted share page
        window.location.href = 'https://my-whisper.vercel.app/share.html?id=${escapeHtml(id)}';
    </script>

    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            color: white;
        }
        .loading {
            text-align: center;
        }
        a {
            color: white;
        }
    </style>
</head>
<body>
    <div class="loading">
        <h1>${escapeHtml(title)}</h1>
        <p>Loading recording...</p>
        <p><a href="https://my-whisper.vercel.app/share.html?id=${escapeHtml(id)}">Click here if not redirected</a></p>
    </div>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    },
    body: html
  };
}

async function handleAudioProxy(queryParams) {
  const url = queryParams?.url;

  if (!url) {
    return errorResponse(400, 'URL parameter is required');
  }

  try {
    // Use S3 SDK for private bucket access (same as transcribe)
    const audioBuffer = await downloadFromS3(url);

    // Determine content type from file extension
    const ext = path.extname(url).toLowerCase();
    const contentTypes = {
      '.webm': 'audio/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4'
    };
    const contentType = contentTypes[ext] || 'audio/webm';

    const base64 = audioBuffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      },
      body: base64,
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('Audio proxy error:', error);
    return errorResponse(500, 'Failed to proxy audio');
  }
}

// Main handler
exports.handler = async (event) => {
  // Initialize clients on cold start
  initClients();

  const method = event.requestContext?.http?.method || event.httpMethod;
  const rawPath = event.rawPath || event.path || '';
  const headers = event.headers || {};

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  // Extract user ID from headers (JWT or anonymous ID)
  const userId = getUserIdFromHeaders(headers);

  // Parse body if present
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString()
        : event.body);
    } catch (e) {
      // Body might not be JSON
    }
  }

  // Query parameters
  const queryParams = event.queryStringParameters || {};

  // Route matching
  try {
    // Extract path without /api prefix for cleaner matching
    const path = rawPath.replace(/^\/api/, '');

    if (path === '/health' && method === 'GET') {
      return await handleHealth();
    }

    if (path === '/get-upload-url' && method === 'POST') {
      return await handleGetUploadUrl(body);
    }

    if (path === '/move-to-shared' && method === 'POST') {
      return await handleMoveToShared(body);
    }

    if (path === '/transcribe' && method === 'POST') {
      return await handleTranscribe(body, userId, headers);
    }

    if (path === '/transcripts' && method === 'GET') {
      return await handleGetTranscripts(queryParams, userId);
    }

    if (path === '/audio-proxy' && method === 'GET') {
      return await handleAudioProxy(queryParams);
    }

    // Match /share-page/:id (HTML page with OG tags for social media previews)
    const sharePageMatch = path.match(/^\/share-page\/([^\/]+)$/);
    if (sharePageMatch && method === 'GET') {
      return await handleSharePage(sharePageMatch[1]);
    }

    // Match /share/:id (JSON endpoint for shared links data)
    const shareMatch = path.match(/^\/share\/([^\/]+)$/);
    if (shareMatch && method === 'GET') {
      return await handlePublicShare(shareMatch[1]);
    }

    // Match /transcripts/:id
    const transcriptMatch = path.match(/^\/transcripts\/([^\/]+)$/);
    if (transcriptMatch) {
      const id = transcriptMatch[1];

      if (method === 'GET') {
        return await handleGetTranscript(id, userId);
      }
      if (method === 'PUT') {
        return await handleUpdateTranscript(id, body, userId);
      }
      if (method === 'DELETE') {
        return await handleDeleteTranscript(id, userId);
      }
    }

    return errorResponse(404, 'Not found');

  } catch (error) {
    console.error('Handler error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
};
