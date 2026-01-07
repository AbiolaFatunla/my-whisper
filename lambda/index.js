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

// ============================================
// BA (Business Analyst) Feature Handlers
// ============================================

/**
 * Check if user is an admin (authenticated via Google OAuth)
 * For now, any authenticated user is considered admin
 * In production, you could check against a list of admin user IDs
 */
function isAdminUser(headers) {
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  const authHeader = normalizedHeaders['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      // Check if it's a real authenticated user (not anonymous)
      // Supabase JWT contains email for OAuth users
      if (payload.sub && payload.email) {
        console.log('Admin user verified:', payload.email);
        return { isAdmin: true, userId: payload.sub, email: payload.email };
      }
    } catch (e) {
      console.error('Failed to verify admin:', e.message);
    }
  }
  return { isAdmin: false };
}

/**
 * Validate BA access code
 * POST /ba/validate-code
 */
async function handleBAValidateCode(body) {
  const { code } = body;

  if (!code) {
    return errorResponse(400, 'Access code is required');
  }

  const { data, error } = await supabase
    .from('ba_access_codes')
    .select('code, client_name, is_active, expires_at')
    .eq('code', code)
    .single();

  if (error || !data) {
    return jsonResponse(200, { valid: false, message: 'Invalid access code' });
  }

  if (!data.is_active) {
    return jsonResponse(200, { valid: false, message: 'This access code has been deactivated' });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return jsonResponse(200, { valid: false, message: 'This access code has expired' });
  }

  // Check if there's an existing session for this code
  const { data: existingSession } = await supabase
    .from('ba_sessions')
    .select('id, project_name, status, updated_at')
    .eq('access_code', code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return jsonResponse(200, {
    valid: true,
    clientName: data.client_name,
    existingSession: existingSession || null
  });
}

/**
 * Get BA session for an access code
 * GET /ba/session?code=xxx
 */
async function handleBAGetSession(queryParams) {
  const code = queryParams?.code;

  if (!code) {
    return errorResponse(400, 'Access code is required');
  }

  const { data, error } = await supabase
    .from('ba_sessions')
    .select('*')
    .eq('access_code', code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return jsonResponse(200, { session: null });
  }

  return jsonResponse(200, { session: data });
}

/**
 * Create or update BA session
 * PUT /ba/session
 */
async function handleBAUpdateSession(body) {
  const { accessCode, sessionId, projectName, conversationHistory, coverageStatus, status } = body;

  if (!accessCode) {
    return errorResponse(400, 'Access code is required');
  }

  if (sessionId) {
    // Update existing session
    const updateData = { updated_at: new Date().toISOString() };
    if (projectName !== undefined) updateData.project_name = projectName;
    if (conversationHistory !== undefined) updateData.conversation_history = conversationHistory;
    if (coverageStatus !== undefined) updateData.coverage_status = coverageStatus;
    if (status !== undefined) updateData.status = status;

    const { data, error } = await supabase
      .from('ba_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating BA session:', error);
      return errorResponse(500, 'Failed to update session');
    }

    return jsonResponse(200, { session: data });
  } else {
    // Create new session
    const { data, error } = await supabase
      .from('ba_sessions')
      .insert({
        access_code: accessCode,
        project_name: projectName || null,
        conversation_history: conversationHistory || [],
        status: 'started'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating BA session:', error);
      return errorResponse(500, 'Failed to create session');
    }

    return jsonResponse(200, { session: data });
  }
}

/**
 * List all access codes (admin only)
 * GET /ba/admin/access-codes
 */
async function handleBAGetAccessCodes(headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { data, error } = await supabase
    .from('ba_access_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching access codes:', error);
    return errorResponse(500, 'Failed to fetch access codes');
  }

  return jsonResponse(200, { accessCodes: data });
}

/**
 * Create new access code (admin only)
 * POST /ba/admin/access-codes
 */
async function handleBACreateAccessCode(body, headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { code, clientName, expiresAt } = body;

  if (!code || !clientName) {
    return errorResponse(400, 'Code and client name are required');
  }

  // Validate code format (lowercase, alphanumeric, hyphens)
  if (!/^[a-z0-9-]+$/.test(code)) {
    return errorResponse(400, 'Code must be lowercase alphanumeric with hyphens only');
  }

  const { data, error } = await supabase
    .from('ba_access_codes')
    .insert({
      code,
      client_name: clientName,
      expires_at: expiresAt || null,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return errorResponse(409, 'Access code already exists');
    }
    console.error('Error creating access code:', error);
    return errorResponse(500, 'Failed to create access code');
  }

  return jsonResponse(201, { accessCode: data });
}

/**
 * Delete access code (admin only)
 * DELETE /ba/admin/access-codes/:code
 */
async function handleBADeleteAccessCode(code, headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { error } = await supabase
    .from('ba_access_codes')
    .delete()
    .eq('code', code);

  if (error) {
    console.error('Error deleting access code:', error);
    return errorResponse(500, 'Failed to delete access code');
  }

  return jsonResponse(200, { success: true });
}

/**
 * List all BA sessions (admin only)
 * GET /ba/admin/sessions
 */
async function handleBAGetSessions(headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { data, error } = await supabase
    .from('ba_sessions')
    .select('id, access_code, project_name, status, created_at, updated_at, coverage_status')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching BA sessions:', error);
    return errorResponse(500, 'Failed to fetch sessions');
  }

  return jsonResponse(200, { sessions: data });
}

/**
 * Get single BA session by ID (admin only)
 * GET /ba/admin/sessions/:id
 */
async function handleBAGetSessionById(sessionId, headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { data, error } = await supabase
    .from('ba_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('Error fetching BA session:', error);
    return errorResponse(500, 'Failed to fetch session');
  }

  if (!data) {
    return errorResponse(404, 'Session not found');
  }

  return jsonResponse(200, { session: data });
}

/**
 * List all authenticated users (admin only)
 * GET /ba/admin/users
 */
async function handleBAGetUsers(headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  // Get users from the app_users view
  const { data: users, error: usersError } = await supabase
    .from('app_users')
    .select('*');

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return errorResponse(500, 'Failed to fetch users');
  }

  // Get access codes to compute has_ba_access and active_sessions
  const { data: accessCodes } = await supabase
    .from('ba_access_codes')
    .select('user_id, code, is_active');

  const { data: sessions } = await supabase
    .from('ba_sessions')
    .select('access_code, status');

  // Enrich user data
  const enrichedUsers = (users || []).map(user => {
    const userCodes = (accessCodes || []).filter(ac => ac.user_id === user.user_id && ac.is_active);
    const userCodeSet = new Set(userCodes.map(ac => ac.code));
    const userSessions = (sessions || []).filter(s => userCodeSet.has(s.access_code));

    return {
      ...user,
      has_ba_access: userCodes.length > 0,
      active_sessions: userSessions.length
    };
  });

  return jsonResponse(200, { users: enrichedUsers });
}

/**
 * Grant BA access to a user (admin only)
 * POST /ba/admin/grant-access
 */
async function handleBAGrantAccess(body, headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { userId, projectName } = body;

  if (!userId) {
    return errorResponse(400, 'User ID is required');
  }

  if (!projectName) {
    return errorResponse(400, 'Project name is required');
  }

  // Get user details for the code generation
  const { data: user, error: userError } = await supabase
    .from('app_users')
    .select('name, email')
    .eq('user_id', userId)
    .single();

  if (userError || !user) {
    return errorResponse(404, 'User not found');
  }

  // Generate access code: FIRSTNAME-YYYYMMDD-HHMM
  const firstName = (user.name || user.email.split('@')[0]).split(' ')[0].toUpperCase();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toISOString().slice(11, 16).replace(':', '');
  const code = `${firstName}-${dateStr}-${timeStr}`.toLowerCase();

  // Create access code linked to user
  const { data: accessCode, error: createError } = await supabase
    .from('ba_access_codes')
    .insert({
      code,
      client_name: user.name || user.email.split('@')[0],
      project_name: projectName,
      user_id: userId,
      is_active: true
    })
    .select()
    .single();

  if (createError) {
    console.error('Error creating access code:', createError);
    return errorResponse(500, 'Failed to grant access');
  }

  return jsonResponse(201, { accessCode });
}

/**
 * Update access code (admin only)
 * PUT /ba/admin/access-codes/:code
 */
async function handleBAUpdateAccessCode(code, body, headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { projectName } = body;

  const updateData = {};
  if (projectName !== undefined) updateData.project_name = projectName;

  if (Object.keys(updateData).length === 0) {
    return errorResponse(400, 'No fields to update');
  }

  const { data, error } = await supabase
    .from('ba_access_codes')
    .update(updateData)
    .eq('code', code)
    .select()
    .single();

  if (error) {
    console.error('Error updating access code:', error);
    return errorResponse(500, 'Failed to update access code');
  }

  return jsonResponse(200, { accessCode: data });
}

/**
 * Get current user's BA sessions
 * GET /ba/user/sessions
 */
async function handleBAGetUserSessions(userId) {
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  // Get access codes linked to this user
  const { data: accessCodes, error: codesError } = await supabase
    .from('ba_access_codes')
    .select('code, project_name, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (codesError) {
    console.error('Error fetching user access codes:', codesError);
    return errorResponse(500, 'Failed to fetch sessions');
  }

  if (!accessCodes || accessCodes.length === 0) {
    return jsonResponse(200, { sessions: [] });
  }

  // Get sessions for these access codes
  const codes = accessCodes.map(ac => ac.code);
  const { data: sessions, error: sessionsError } = await supabase
    .from('ba_sessions')
    .select('id, access_code, project_name, status, created_at, updated_at, coverage_status, generated_docs')
    .in('access_code', codes)
    .order('updated_at', { ascending: false });

  if (sessionsError) {
    console.error('Error fetching user sessions:', sessionsError);
    return errorResponse(500, 'Failed to fetch sessions');
  }

  // Enrich sessions with project_name from access_code if not set
  const codeToProject = {};
  for (const ac of accessCodes) {
    codeToProject[ac.code] = ac.project_name;
  }

  const enrichedSessions = (sessions || []).map(session => ({
    id: session.id,
    access_code: session.access_code,
    project_name: session.project_name || codeToProject[session.access_code] || 'Untitled Project',
    status: session.status,
    coverage_status: session.coverage_status,
    has_docs: !!session.generated_docs,
    created_at: session.created_at,
    updated_at: session.updated_at,
    unread_notes: 0 // Will be populated in Phase 7C
  }));

  return jsonResponse(200, { sessions: enrichedSessions });
}

/**
 * Get BA session by ID (for user direct access)
 * GET /ba/session/:id
 */
async function handleBAGetSessionByIdForUser(sessionId, userId) {
  // Get the session
  const { data: session, error } = await supabase
    .from('ba_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    return errorResponse(404, 'Session not found');
  }

  // Verify user has access to this session via their access codes
  const { data: accessCode } = await supabase
    .from('ba_access_codes')
    .select('code')
    .eq('code', session.access_code)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!accessCode) {
    return errorResponse(403, 'Access denied');
  }

  return jsonResponse(200, { session });
}

// ===== PROJECT NOTES HANDLERS =====

/**
 * Get notes for a session
 * GET /ba/sessions/:id/notes
 */
async function handleBAGetNotes(sessionId, userId, headers) {
  // Check if user has access to this session
  const hasAccess = await checkSessionAccess(sessionId, userId, headers);
  if (!hasAccess.allowed) {
    return errorResponse(hasAccess.status, hasAccess.message);
  }

  const { data: notes, error } = await supabase
    .from('ba_notes')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching notes:', error);
    return errorResponse(500, 'Failed to fetch notes');
  }

  return jsonResponse(200, { notes: notes || [] });
}

/**
 * Add a note to a session
 * POST /ba/sessions/:id/notes
 */
async function handleBAAddNote(sessionId, body, userId, headers) {
  const { content } = body;

  if (!content || !content.trim()) {
    return errorResponse(400, 'Content is required');
  }

  // Check if user has access to this session
  const hasAccess = await checkSessionAccess(sessionId, userId, headers);
  if (!hasAccess.allowed) {
    return errorResponse(hasAccess.status, hasAccess.message);
  }

  const { data: note, error } = await supabase
    .from('ba_notes')
    .insert({
      session_id: sessionId,
      author_type: hasAccess.isAdmin ? 'admin' : 'user',
      author_id: userId,
      author_name: hasAccess.authorName,
      content: content.trim(),
      read_by_admin: hasAccess.isAdmin,
      read_by_user: !hasAccess.isAdmin
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding note:', error);
    return errorResponse(500, 'Failed to add note');
  }

  return jsonResponse(201, { note });
}

/**
 * Mark all notes in session as read
 * PUT /ba/sessions/:id/notes/read
 */
async function handleBAMarkNotesRead(sessionId, userId, headers) {
  const adminCheck = isAdminUser(headers);
  const field = adminCheck.isAdmin ? 'read_by_admin' : 'read_by_user';

  const { error } = await supabase
    .from('ba_notes')
    .update({ [field]: true })
    .eq('session_id', sessionId);

  if (error) {
    console.error('Error marking notes as read:', error);
    return errorResponse(500, 'Failed to mark notes as read');
  }

  return jsonResponse(200, { success: true });
}

/**
 * Get unread notes count for admin
 * GET /ba/admin/unread-notes
 */
async function handleBAGetUnreadNotes(headers) {
  const adminCheck = isAdminUser(headers);
  if (!adminCheck.isAdmin) {
    return errorResponse(401, 'Admin authentication required');
  }

  const { count, error } = await supabase
    .from('ba_notes')
    .select('*', { count: 'exact', head: true })
    .eq('read_by_admin', false)
    .eq('author_type', 'user');

  if (error) {
    console.error('Error fetching unread notes:', error);
    return errorResponse(500, 'Failed to fetch unread notes');
  }

  return jsonResponse(200, { unread: count || 0 });
}

/**
 * Helper: Check if user has access to a session
 */
async function checkSessionAccess(sessionId, userId, headers) {
  const adminCheck = isAdminUser(headers);

  // Admins have access to all sessions
  if (adminCheck.isAdmin) {
    return { allowed: true, isAdmin: true, authorName: 'Abiola (Admin)' };
  }

  // Get session and check user access
  const { data: session } = await supabase
    .from('ba_sessions')
    .select('access_code')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return { allowed: false, status: 404, message: 'Session not found' };
  }

  // Check if user has this access code
  const { data: accessCode } = await supabase
    .from('ba_access_codes')
    .select('code, client_name')
    .eq('code', session.access_code)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (!accessCode) {
    return { allowed: false, status: 403, message: 'Access denied' };
  }

  return { allowed: true, isAdmin: false, authorName: accessCode.client_name };
}

// BA System prompt for the AI Business Analyst
const BA_SYSTEM_PROMPT = `You are an expert Business Analyst embedded in My Whisper, helping users document their project vision so it can be built. You speak in a warm, direct, and substantive way. No corporate stiffness, no jargon. You're like a knowledgeable friend who happens to be really good at extracting requirements.

You adapt to what they're building: software, AI agents, workflows, automations, integrations. The questions shift based on the type of project, but the goal is always the same: get enough detail that a developer can build it without needing to come back with endless clarification questions.

Voice & Tone:
- Confident but not arrogant
- Direct but not blunt
- Warm but not performatively friendly
- Helpful but not patronising
- British English spellings always (colour, realise, analyse, behaviour)
- No em-dashes. Use commas or full stops instead.
- Build context before making points when things are complex
- Be punchy when things are simple

Natural phrases to use: "So basically...", "The thing is...", "Walk me through...", "What happens if...", "Got it. So..."

Never say: "Please describe the primary user personas", "What are the business rules and constraints", "Could you elaborate on the functional requirements"

Conversation approach:
1. Let them talk freely first. Don't interrupt their initial dump.
2. After they share, acknowledge what you heard: "Got it. So basically you're building [X] for [Y] so they can [Z]..."
3. Identify what's missing or vague. Ask only what's needed, not a full checklist.
4. Ask ONE question (or small cluster) at a time. Wait for response before moving on.
5. Use options over open questions when something is ambiguous: "When you say 'admin', do you mean: (a) just yourself, (b) a few staff members, or (c) a whole team with different permission levels?"
6. Tag priority in the moment: "You mentioned notifications. Is that essential for launch or something for later?"
7. If they don't know something: "That's fine. I'll flag this as a decision for later. Let's keep going."

Project type detection - adapt your questions:
- Software/App: Focus on users, screens, data, workflows, permissions
- AI Agent: Focus on triggers, decisions, tools, responses, edge cases
- Workflow/Automation: Focus on trigger, steps, conditions, connections, errors
- Integration: Focus on systems, data movement, triggers, sync logic

Smart probing triggers:
- Different types of users → "What can each type do that others can't?"
- Approvals/reviews → "What happens if it's rejected?"
- Money/payments → "Who pays whom, when, and for what?"
- Time/scheduling → "What happens if someone misses a deadline or cancels?"
- Vague feature → "What specifically does it track? Give me an example."

For common patterns, offer defaults: "Most booking systems need: calendar view, availability management, reminders, and cancellation rules. Do you want all of these, or should we adjust?"

Keep responses concise - aim for 2-4 sentences per response. Don't overwhelm them.

CRITICAL REQUIREMENT - You MUST end every single response with a coverage JSON on its own line. Format exactly like this:

[Your conversational response here]

COVERAGE:{"vision":false,"users":false,"features":false,"rules":false,"data":false,"priority":false}

Update each section to true ONLY when you have enough info:
- vision=true: They explained what they're building and the problem
- users=true: You know who uses it and their roles
- features=true: You know the main functionality needed
- rules=true: Business rules and constraints are captured
- data=true: You know what data entities exist
- priority=true: You know what's essential vs nice-to-have

Example response:
"Got it. So you're building a booking system for salons. Walk me through what happens when someone wants to book an appointment.

COVERAGE:{"vision":true,"users":false,"features":false,"rules":false,"data":false,"priority":false}"

Never skip the COVERAGE line. Always include it.`;

/**
 * Send a message and get AI response
 * POST /ba/chat
 */
async function handleBAChat(body) {
  const { sessionId, message, conversationHistory = [] } = body;

  if (!sessionId) {
    return errorResponse(400, 'Session ID is required');
  }

  if (!message) {
    return errorResponse(400, 'Message is required');
  }

  if (!openaiClient) {
    return errorResponse(500, 'OpenAI not configured');
  }

  try {
    // Build messages for GPT
    const messages = [
      { role: 'system', content: BA_SYSTEM_PROMPT }
    ];

    // Add conversation history (excluding coverage markers)
    for (const msg of conversationHistory) {
      if (msg.role && msg.content) {
        // Strip any coverage markers from assistant messages
        let content = msg.content;
        if (msg.role === 'assistant') {
          content = content.replace(/\nCOVERAGE:\{[^}]+\}/g, '').trim();
        }
        messages.push({
          role: msg.role,
          content: content
        });
      }
    }

    // Add the new user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call GPT-4o-mini
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const responseText = completion.choices[0].message.content;

    // Parse coverage from response (match anywhere, with or without newline)
    let coverage = null;
    let cleanResponse = responseText;

    const coverageMatch = responseText.match(/COVERAGE:(\{[^}]+\})/);
    if (coverageMatch) {
      try {
        coverage = JSON.parse(coverageMatch[1]);
        // Remove the coverage line from the response
        cleanResponse = responseText.replace(/\n?COVERAGE:\{[^}]+\}/, '').trim();
      } catch (e) {
        console.error('Failed to parse coverage:', e);
      }
    }

    return jsonResponse(200, {
      response: cleanResponse,
      coverage: coverage
    });

  } catch (error) {
    console.error('BA Chat error:', error);
    return errorResponse(500, error.message || 'Chat failed');
  }
}

// Section labels for summaries
const SECTION_LABELS = {
  vision: 'Vision & Problem',
  users: 'Users & Personas',
  features: 'Features & Workflows',
  rules: 'Business Rules',
  data: 'Data & Entities',
  priority: 'Priority & Scope'
};

/**
 * Summarise what's been captured for a specific section
 * POST /ba/summarise-section
 */
async function handleBASummariseSection(body) {
  const { section, conversationHistory = [] } = body;

  if (!section) {
    return errorResponse(400, 'Section is required');
  }

  if (!SECTION_LABELS[section]) {
    return errorResponse(400, 'Invalid section');
  }

  if (!openaiClient) {
    return errorResponse(500, 'OpenAI not configured');
  }

  if (conversationHistory.length === 0) {
    return jsonResponse(200, {
      summary: 'No information captured yet. Start by describing your project.'
    });
  }

  try {
    // Build conversation text
    const conversationText = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'BA'}: ${msg.content}`)
      .join('\n\n');

    const sectionPrompts = {
      vision: 'What is the product/service being built and what problem does it solve? Who is it for?',
      users: 'Who are the different types of users? What are their roles, needs, and goals?',
      features: 'What are the main features and workflows? What should users be able to do?',
      rules: 'What are the business rules, constraints, and policies? What happens in edge cases?',
      data: 'What data entities exist? What information is tracked and stored?',
      priority: 'What is essential for launch vs nice-to-have? What is the scope?'
    };

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are summarising information from a business requirements conversation. Extract ONLY information relevant to: ${sectionPrompts[section]}

If there's relevant information, summarise it in 2-4 bullet points. Use British English. Be concise and specific.

If there's no relevant information for this section in the conversation, respond with exactly: "Not captured yet."`
        },
        {
          role: 'user',
          content: `Conversation:\n${conversationText}\n\nSummarise what's been captured for "${SECTION_LABELS[section]}".`
        }
      ],
      temperature: 0.3,
      max_tokens: 300
    });

    return jsonResponse(200, {
      summary: response.choices[0].message.content.trim()
    });

  } catch (error) {
    console.error('BA Summarise error:', error);
    return errorResponse(500, error.message || 'Summarise failed');
  }
}

/**
 * Generate documentation from conversation history
 * POST /ba/generate
 */
async function handleBAGenerate(body) {
  const { sessionId, conversationHistory = [] } = body;

  if (!sessionId) {
    return errorResponse(400, 'Session ID is required');
  }

  if (conversationHistory.length === 0) {
    return errorResponse(400, 'Conversation history is required');
  }

  if (!openaiClient) {
    return errorResponse(500, 'OpenAI not configured');
  }

  try {
    // Build conversation text (strip coverage markers)
    const conversationText = conversationHistory
      .map(msg => {
        let content = msg.content;
        if (msg.role === 'assistant') {
          content = content.replace(/\nCOVERAGE:\{[^}]+\}/g, '').trim();
        }
        return `${msg.role === 'user' ? 'CLIENT' : 'BA'}: ${content}`;
      })
      .join('\n\n');

    // Generate documentation using GPT-4o-mini
    const generatePrompt = `You are a Business Analyst generating structured requirements documentation from a conversation.

Based on the following conversation between a Business Analyst (BA) and a client, generate comprehensive documentation in markdown format.

CONVERSATION:
${conversationText}

---

Generate documentation with the following sections. Use British English. Be specific and actionable. Use information from the conversation - don't make things up.

# [Project Name] - Requirements Documentation

## Vision Statement
A single paragraph capturing what this is, who it's for, and why it matters.

## User Personas
For each user type mentioned:
### [Persona Name]
**Who they are:** Brief description
**What they're trying to do:** Goals (bullet list)
**Pain points today:** Current frustrations (bullet list)
**What success looks like:** Outcome

## User Stories
For the main features, use this format:
### [Story Title]
As a [persona], I want to [action], so that [benefit].

**Acceptance criteria:**
- Criterion 1
- Criterion 2
- Criterion 3

## Functional Requirements
Group by feature area:
### [Feature Area]
- Requirement 1
- Requirement 2

## Business Rules
### BR-001: [Rule Name]
**Rule:** What must be true
**Applies to:** Where this applies
**Example:** Concrete example

## Data Entities
### [Entity Name]
**What it is:** Description
**Key information tracked:**
- Field: Purpose

## Priority Matrix
### Must Have (Version 1)
- Feature: Rationale

### Should Have
- Feature: Rationale

### Could Have (Later)
- Feature: Rationale

## Open Questions
List any unclear items or decisions needed:
- Question 1
- Question 2

---

If a section has no relevant information from the conversation, write "Not discussed yet." for that section.
Output only the markdown documentation, nothing else.`;

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: generatePrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const fullDocument = completion.choices[0].message.content.trim();

    // Parse sections from the document
    const sections = {
      all: fullDocument,
      vision: extractSection(fullDocument, 'Vision Statement'),
      users: extractSection(fullDocument, 'User Personas'),
      features: extractSection(fullDocument, 'User Stories') + '\n\n' + extractSection(fullDocument, 'Functional Requirements'),
      rules: extractSection(fullDocument, 'Business Rules'),
      data: extractSection(fullDocument, 'Data Entities'),
      priority: extractSection(fullDocument, 'Priority Matrix') + '\n\n' + extractSection(fullDocument, 'Open Questions')
    };

    // Save to session
    if (supabase) {
      const { error } = await supabase
        .from('ba_sessions')
        .update({
          generated_docs: sections,
          status: 'complete',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) {
        console.error('Error saving generated docs:', error);
      }
    }

    return jsonResponse(200, {
      documents: sections,
      status: 'complete'
    });

  } catch (error) {
    console.error('BA Generate error:', error);
    return errorResponse(500, error.message || 'Generation failed');
  }
}

/**
 * Extract a section from markdown by heading
 */
function extractSection(markdown, headingName) {
  const lines = markdown.split('\n');
  let inSection = false;
  let sectionLines = [];
  const headingPattern = new RegExp(`^##\\s+${headingName}`, 'i');

  for (const line of lines) {
    if (headingPattern.test(line)) {
      inSection = true;
      sectionLines.push(line);
      continue;
    }

    if (inSection) {
      // Check if we hit another h2 heading
      if (/^##\s+/.test(line) && !headingPattern.test(line)) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').trim() || 'Not discussed yet.';
}

/**
 * Transcribe audio for BA (Whisper only, no DB save)
 * POST /ba/transcribe
 */
async function handleBATranscribe(body) {
  const { fileUrl } = body;

  if (!fileUrl) {
    return errorResponse(400, 'File URL is required');
  }

  if (!openaiClient) {
    return errorResponse(500, 'OpenAI not configured');
  }

  try {
    // Download audio from S3
    const audioBuffer = await downloadFromS3(fileUrl);

    // Determine file extension from URL
    const urlPath = new URL(fileUrl).pathname;
    const ext = urlPath.substring(urlPath.lastIndexOf('.')) || '.webm';

    // Write to temp file for OpenAI
    const tempPath = `/tmp/ba_audio_${Date.now()}${ext}`;
    fs.writeFileSync(tempPath, audioBuffer);

    // Transcribe with Whisper
    const transcription = await openaiClient.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en'
    });

    // Clean up temp file
    fs.unlinkSync(tempPath);

    return jsonResponse(200, {
      transcription: transcription.text
    });

  } catch (error) {
    console.error('BA Transcription error:', error);
    return errorResponse(500, error.message || 'Transcription failed');
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

    // ============================================
    // BA (Business Analyst) Routes
    // ============================================

    // Client routes
    if (path === '/ba/validate-code' && method === 'POST') {
      return await handleBAValidateCode(body);
    }

    if (path === '/ba/session' && method === 'GET') {
      return await handleBAGetSession(queryParams);
    }

    if (path === '/ba/session' && method === 'PUT') {
      return await handleBAUpdateSession(body);
    }

    if (path === '/ba/transcribe' && method === 'POST') {
      return await handleBATranscribe(body);
    }

    if (path === '/ba/chat' && method === 'POST') {
      return await handleBAChat(body);
    }

    if (path === '/ba/summarise-section' && method === 'POST') {
      return await handleBASummariseSection(body);
    }

    if (path === '/ba/generate' && method === 'POST') {
      return await handleBAGenerate(body);
    }

    // Admin routes
    if (path === '/ba/admin/access-codes' && method === 'GET') {
      return await handleBAGetAccessCodes(headers);
    }

    if (path === '/ba/admin/access-codes' && method === 'POST') {
      return await handleBACreateAccessCode(body, headers);
    }

    // Match /ba/admin/access-codes/:code
    const baAccessCodeMatch = path.match(/^\/ba\/admin\/access-codes\/([^\/]+)$/);
    if (baAccessCodeMatch && method === 'DELETE') {
      return await handleBADeleteAccessCode(baAccessCodeMatch[1], headers);
    }

    if (path === '/ba/admin/sessions' && method === 'GET') {
      return await handleBAGetSessions(headers);
    }

    // Match /ba/admin/sessions/:id
    const baSessionIdMatch = path.match(/^\/ba\/admin\/sessions\/([^\/]+)$/);
    if (baSessionIdMatch && method === 'GET') {
      return await handleBAGetSessionById(baSessionIdMatch[1], headers);
    }

    // New Phase 7A routes
    if (path === '/ba/admin/users' && method === 'GET') {
      return await handleBAGetUsers(headers);
    }

    if (path === '/ba/admin/grant-access' && method === 'POST') {
      return await handleBAGrantAccess(body, headers);
    }

    // Match /ba/admin/access-codes/:code for PUT
    if (baAccessCodeMatch && method === 'PUT') {
      return await handleBAUpdateAccessCode(baAccessCodeMatch[1], body, headers);
    }

    if (path === '/ba/user/sessions' && method === 'GET') {
      return await handleBAGetUserSessions(userId);
    }

    // Match /ba/session/:id for user direct access
    const baSessionDirectMatch = path.match(/^\/ba\/session\/([^\/]+)$/);
    if (baSessionDirectMatch && method === 'GET') {
      return await handleBAGetSessionByIdForUser(baSessionDirectMatch[1], userId);
    }

    // Project Notes routes
    // GET /ba/sessions/:id/notes
    const baNotesMatch = path.match(/^\/ba\/sessions\/([^\/]+)\/notes$/);
    if (baNotesMatch && method === 'GET') {
      return await handleBAGetNotes(baNotesMatch[1], userId, headers);
    }
    if (baNotesMatch && method === 'POST') {
      return await handleBAAddNote(baNotesMatch[1], body, userId, headers);
    }

    // PUT /ba/sessions/:id/notes/read
    const baNotesReadMatch = path.match(/^\/ba\/sessions\/([^\/]+)\/notes\/read$/);
    if (baNotesReadMatch && method === 'PUT') {
      return await handleBAMarkNotesRead(baNotesReadMatch[1], userId, headers);
    }

    // GET /ba/admin/unread-notes
    if (path === '/ba/admin/unread-notes' && method === 'GET') {
      return await handleBAGetUnreadNotes(headers);
    }

    return errorResponse(404, 'Not found');

  } catch (error) {
    console.error('Handler error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
};
