/**
 * My Whisper - Voice Dictation Server
 * Express server with AWS S3 storage, OpenAI Whisper transcription, and Supabase database
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const database = require('./services/database');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests, please try again later.'
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Anonymous-ID'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));
app.use(express.json());
app.use(limiter);

// Static files
app.use(express.static('public', {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

// AWS Configuration
let s3Client;
const BUCKET_NAME = process.env.AUDIO_BUCKET || process.env.S3_BUCKET_NAME || 'voice-recording-app';
const REGION = process.env.AWS_REGION || 'eu-west-2';

// OpenAI Configuration
const DEFAULT_TITLE_MODEL = process.env.OPENAI_TITLE_MODEL || 'gpt-4o-mini';
const AI_TITLE_ENABLED = process.env.ENABLE_AI_TITLES !== 'false';

let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('✓ OpenAI client initialized');
}

// Initialize Supabase
database.initSupabase();

/**
 * Load AWS credentials from environment or CSV file
 */
function loadAWSCredentials() {
  try {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      s3Client = new S3Client({
        region: REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      console.log('✓ AWS credentials loaded from environment');
      return true;
    }

    // Try CSV file fallback
    const csvPath = path.join(__dirname, 'voice-recording-api-user_accessKeys.csv');
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
      const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

      if (records.length > 0) {
        const creds = records[0];
        s3Client = new S3Client({
          region: REGION,
          credentials: {
            accessKeyId: creds['Access key ID'],
            secretAccessKey: creds['Secret access key']
          }
        });
        console.log('✓ AWS credentials loaded from CSV');
        return true;
      }
    }

    console.error('AWS credentials not found');
    return false;
  } catch (error) {
    console.error('Error loading AWS credentials:', error.message);
    return false;
  }
}

loadAWSCredentials();

/**
 * Utility functions
 */
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

// Temporary user ID for backwards compatibility during auth transition
const TEMP_USER_ID = '00000000-0000-0000-0000-000000000001';

// Anonymous user recording limit
const ANONYMOUS_RECORDING_LIMIT = 2;

/**
 * Check if request is from an authenticated user (has valid JWT)
 */
function isAuthenticatedUser(req) {
  const authHeader = req.headers['authorization'];
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

/**
 * Extract user ID from request headers
 * Priority: 1. JWT token (authenticated user) 2. Anonymous ID header
 */
function getUserIdFromHeaders(req) {
  // Check for Authorization header (JWT from Supabase Auth)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      // Decode JWT payload (base64) - we don't verify here since Supabase RLS does that
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
  const anonymousId = req.headers['x-anonymous-id'];
  if (anonymousId) {
    // Validate it looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(anonymousId)) {
      console.log('Using anonymous user ID:', anonymousId);
      return anonymousId;
    }
  }

  // Fall back to temp user ID (for backwards compatibility)
  console.log('No user ID found, using TEMP_USER_ID');
  return TEMP_USER_ID;
}

// ================================
// API ROUTES
// ================================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    bucket: BUCKET_NAME,
    region: REGION,
    features: {
      transcription: !!openaiClient,
      database: !!database.initSupabase()
    }
  });
});

/**
 * Get presigned URL for upload
 */
app.post('/api/get-upload-url', async (req, res) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (!isValidAudioFile(filename)) {
      return res.status(400).json({ error: 'Invalid file type. Only audio files are allowed.' });
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const key = `uploads/${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/webm'
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    res.json({
      uploadUrl,
      key,
      filename: sanitizedFilename
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

/**
 * Move file from uploads/ to shared/
 */
app.post('/api/move-to-shared', async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
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

    const shareableUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${destinationKey}`;

    res.json({
      success: true,
      shareableUrl,
      filename: sanitizedFilename
    });
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

/**
 * Transcribe audio and save to database
 */
app.post('/api/transcribe', async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const userId = getUserIdFromHeaders(req);

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required' });
    }

    // Check anonymous user limit
    if (!isAuthenticatedUser(req)) {
      try {
        const transcripts = await database.getTranscripts(userId, 100, 0);
        if (transcripts && transcripts.length >= ANONYMOUS_RECORDING_LIMIT) {
          return res.status(403).json({
            error: 'limit_reached',
            message: 'Trial limit reached. Sign in for unlimited access.'
          });
        }
      } catch (limitError) {
        console.error('Error checking limit:', limitError);
        // Continue if limit check fails (fail open)
      }
    }

    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Download audio file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download audio file');
    }

    const buffer = await response.arrayBuffer();
    const audioFile = Buffer.from(buffer);

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

    // Generate AI title if enabled
    let generatedTitle = null;
    if (AI_TITLE_ENABLED && transcription?.text) {
      try {
        const prompt = `Summarize the following transcript in 1 to 4 words. Return only the concise title.\n\nTranscript:\n${transcription.text}`;
        const titleResponse = await openaiClient.responses.create({
          model: DEFAULT_TITLE_MODEL,
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
    try {
      personalizedText = await database.personalizeText(userId, rawText);
    } catch (persError) {
      console.error('Personalization error:', persError);
      // Continue with raw text if personalization fails
    }

    // Save to Supabase database
    let savedTranscript = null;
    try {
      savedTranscript = await database.saveTranscript({
        userId: userId,
        rawText: rawText,
        personalizedText: personalizedText,
        audioUrl: fileUrl,
        durationSeconds: null,
        title: generatedTitle
      });
      console.log('✓ Transcript saved to database:', savedTranscript.id);
    } catch (dbError) {
      console.error('Database save error:', dbError);
      // Continue even if DB save fails - don't block the response
    }

    res.json({
      success: true,
      transcription: personalizedText,
      rawTranscription: rawText,
      language: 'en',
      title: generatedTitle,
      transcriptId: savedTranscript?.id || null,
      shareableUrl: fileUrl
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
  }
});

/**
 * Get transcript history
 */
app.get('/api/transcripts', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const transcripts = await database.getTranscripts(userId, limit, offset);
    res.json({ transcripts });
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    res.status(500).json({ error: 'Failed to fetch transcripts' });
  }
});

/**
 * Get single transcript
 */
app.get('/api/transcripts/:id', async (req, res) => {
  try {
    const transcript = await database.getTranscript(req.params.id);
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    res.json({ transcript });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

/**
 * Update transcript (save edits)
 */
app.put('/api/transcripts/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const { finalText } = req.body;
    const transcript = await database.updateTranscript(userId, req.params.id, { finalText });
    res.json({ transcript });
  } catch (error) {
    console.error('Error updating transcript:', error);
    res.status(500).json({ error: 'Failed to update transcript' });
  }
});

/**
 * Delete transcript
 */
app.delete('/api/transcripts/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    await database.deleteTranscript(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting transcript:', error);
    res.status(500).json({ error: 'Failed to delete transcript' });
  }
});

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
 */
app.get('/api/share-page/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).send('<html><body><h1>Error</h1><p>Recording ID is required</p></body></html>');
    }

    const transcript = await database.getTranscript(id);

    if (!transcript) {
      return res.status(404).send('<html><body><h1>Not Found</h1><p>This recording no longer exists.</p></body></html>');
    }

    // Use best available text: final > personalized > raw
    const text = transcript.final_text || transcript.personalized_text || transcript.raw_text || '';
    const title = transcript.title || 'Voice Recording';
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

    <!-- Redirect to the full share page -->
    <script>
        window.location.href = '/share.html?id=${escapeHtml(id)}';
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
        .loading { text-align: center; }
        a { color: white; }
    </style>
</head>
<body>
    <div class="loading">
        <h1>${escapeHtml(title)}</h1>
        <p>Loading recording...</p>
        <p><a href="/share.html?id=${escapeHtml(id)}">Click here if not redirected</a></p>
    </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error fetching share page:', error);
    res.status(404).send('<html><body><h1>Not Found</h1><p>This recording no longer exists.</p></body></html>');
  }
});

/**
 * Public share endpoint - returns transcript data for shared links
 * No auth required, read-only access to specific fields only
 */
app.get('/api/share/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Transcript ID is required' });
    }

    const transcript = await database.getTranscript(id);

    if (!transcript) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Use best available text: final > personalized > raw
    const text = transcript.final_text || transcript.personalized_text || transcript.raw_text;

    // Get owner info for "Add to Shared with Me" feature
    let owner = null;
    if (transcript.user_id) {
      const { data: ownerData } = await database.supabase
        .from('app_users')
        .select('user_id, name, email')
        .eq('user_id', transcript.user_id)
        .single();

      if (ownerData) {
        owner = {
          id: ownerData.user_id,
          name: ownerData.name || ownerData.email?.split('@')[0] || 'Unknown'
        };
      }
    }

    // Return only public fields
    res.json({
      id: transcript.id,
      title: transcript.title,
      text: text,
      audioUrl: transcript.audio_url,
      createdAt: transcript.created_at,
      owner: owner
    });
  } catch (error) {
    console.error('Error fetching shared transcript:', error);
    res.status(404).json({ error: 'Recording not found' });
  }
});

/**
 * Audio proxy for CORS
 */
app.get('/api/audio-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const range = req.headers.range;
    const fetchOptions = range ? { headers: { Range: range } } : {};
    const response = await fetch(url, fetchOptions);

    if (!response.ok && response.status !== 206) {
      return res.status(response.status).json({ error: 'Failed to fetch audio' });
    }

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', response.headers.get('content-type') || 'audio/webm');

    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');

    if (contentLength) res.set('Content-Length', contentLength);
    if (contentRange) {
      res.set('Content-Range', contentRange);
      res.status(206);
    }
    res.set('Accept-Ranges', 'bytes');

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy audio' });
  }
});

// ============================================
// BA (Business Analyst) Feature Routes
// ============================================

/**
 * Check if user is an admin (authenticated via Google OAuth)
 */
function isAdminUser(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const payloadBase64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      // Check if it's a real authenticated user (not anonymous)
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
 */
app.post('/api/ba/validate-code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Access code is required' });
    }

    const { data, error } = await database.supabase
      .from('ba_access_codes')
      .select('code, client_name, is_active, expires_at')
      .eq('code', code)
      .single();

    if (error || !data) {
      return res.json({ valid: false, message: 'Invalid access code' });
    }

    if (!data.is_active) {
      return res.json({ valid: false, message: 'This access code has been deactivated' });
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.json({ valid: false, message: 'This access code has expired' });
    }

    // Check for existing session
    const { data: existingSession } = await database.supabase
      .from('ba_sessions')
      .select('id, project_name, status, updated_at')
      .eq('access_code', code)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      valid: true,
      clientName: data.client_name,
      existingSession: existingSession || null
    });
  } catch (error) {
    console.error('Error validating BA code:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

/**
 * Get BA session for an access code
 */
app.get('/api/ba/session', async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).json({ error: 'Access code is required' });
    }

    const { data, error } = await database.supabase
      .from('ba_sessions')
      .select('*')
      .eq('access_code', code)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.json({ session: null });
    }

    res.json({ session: data });
  } catch (error) {
    console.error('Error fetching BA session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * Create or update BA session
 */
app.put('/api/ba/session', async (req, res) => {
  try {
    const { accessCode, sessionId, projectName, conversationHistory, coverageStatus, status } = req.body;

    if (!accessCode) {
      return res.status(400).json({ error: 'Access code is required' });
    }

    if (sessionId) {
      // Update existing session
      const updateData = { updated_at: new Date().toISOString() };
      if (projectName !== undefined) updateData.project_name = projectName;
      if (conversationHistory !== undefined) updateData.conversation_history = conversationHistory;
      if (coverageStatus !== undefined) updateData.coverage_status = coverageStatus;
      if (status !== undefined) updateData.status = status;

      const { data, error } = await database.supabase
        .from('ba_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        console.error('Error updating BA session:', error);
        return res.status(500).json({ error: 'Failed to update session' });
      }

      return res.json({ session: data });
    } else {
      // Create new session
      const { data, error } = await database.supabase
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
        return res.status(500).json({ error: 'Failed to create session' });
      }

      return res.json({ session: data });
    }
  } catch (error) {
    console.error('Error with BA session:', error);
    res.status(500).json({ error: 'Failed to process session' });
  }
});

/**
 * Transcribe audio for BA (Whisper only, no DB save)
 */
app.post('/api/ba/transcribe', async (req, res) => {
  try {
    const { fileUrl } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: 'File URL is required' });
    }

    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }

    // Download audio from URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download audio');
    }
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Determine file extension
    const urlPath = new URL(fileUrl).pathname;
    const ext = path.extname(urlPath) || '.webm';

    // Write to temp file
    const tempPath = path.join(__dirname, `temp_ba_audio_${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, audioBuffer);

    // Transcribe with Whisper
    const transcription = await openaiClient.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en'
    });

    // Clean up temp file
    fs.unlinkSync(tempPath);

    res.json({ transcription: transcription.text });

  } catch (error) {
    console.error('BA Transcription error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

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
 * Chat with AI Business Analyst
 */
app.post('/api/ba/chat', async (req, res) => {
  try {
    const { sessionId, message, conversationHistory = [] } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }

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

    res.json({
      response: cleanResponse,
      coverage: coverage
    });

  } catch (error) {
    console.error('BA Chat error:', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
});

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
 */
app.post('/api/ba/summarise-section', async (req, res) => {
  try {
    const { section, conversationHistory = [] } = req.body;

    if (!section) {
      return res.status(400).json({ error: 'Section is required' });
    }

    if (!SECTION_LABELS[section]) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }

    if (conversationHistory.length === 0) {
      return res.json({
        summary: 'No information captured yet. Start by describing your project.'
      });
    }

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

    res.json({
      summary: response.choices[0].message.content.trim()
    });

  } catch (error) {
    console.error('BA Summarise error:', error);
    res.status(500).json({ error: error.message || 'Summarise failed' });
  }
});

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
 * Generate documentation from conversation history
 */
app.post('/api/ba/generate', async (req, res) => {
  try {
    const { sessionId, conversationHistory = [] } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (conversationHistory.length === 0) {
      return res.status(400).json({ error: 'Conversation history is required' });
    }

    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI not configured' });
    }

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
    const { error } = await database.supabase
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

    res.json({
      documents: sections,
      status: 'complete'
    });

  } catch (error) {
    console.error('BA Generate error:', error);
    res.status(500).json({ error: error.message || 'Generation failed' });
  }
});

/**
 * List all access codes (admin only)
 */
app.get('/api/ba/admin/access-codes', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { data, error } = await database.supabase
      .from('ba_access_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching access codes:', error);
      return res.status(500).json({ error: 'Failed to fetch access codes' });
    }

    res.json({ accessCodes: data });
  } catch (error) {
    console.error('Error fetching access codes:', error);
    res.status(500).json({ error: 'Failed to fetch access codes' });
  }
});

/**
 * Create new access code (admin only)
 */
app.post('/api/ba/admin/access-codes', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { code, clientName, expiresAt } = req.body;

    if (!code || !clientName) {
      return res.status(400).json({ error: 'Code and client name are required' });
    }

    // Validate code format
    if (!/^[a-z0-9-]+$/.test(code)) {
      return res.status(400).json({ error: 'Code must be lowercase alphanumeric with hyphens only' });
    }

    const { data, error } = await database.supabase
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
        return res.status(409).json({ error: 'Access code already exists' });
      }
      console.error('Error creating access code:', error);
      return res.status(500).json({ error: 'Failed to create access code' });
    }

    res.status(201).json({ accessCode: data });
  } catch (error) {
    console.error('Error creating access code:', error);
    res.status(500).json({ error: 'Failed to create access code' });
  }
});

/**
 * Delete access code (admin only)
 */
app.delete('/api/ba/admin/access-codes/:code', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { error } = await database.supabase
      .from('ba_access_codes')
      .delete()
      .eq('code', req.params.code);

    if (error) {
      console.error('Error deleting access code:', error);
      return res.status(500).json({ error: 'Failed to delete access code' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting access code:', error);
    res.status(500).json({ error: 'Failed to delete access code' });
  }
});

/**
 * List all BA sessions (admin only)
 */
app.get('/api/ba/admin/sessions', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { data, error } = await database.supabase
      .from('ba_sessions')
      .select('id, access_code, project_name, status, created_at, updated_at, coverage_status')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching BA sessions:', error);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    res.json({ sessions: data });
  } catch (error) {
    console.error('Error fetching BA sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get single BA session by ID (admin only)
app.get('/api/ba/admin/sessions/:id', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { id } = req.params;

    const { data, error } = await database.supabase
      .from('ba_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching BA session:', error);
      return res.status(500).json({ error: 'Failed to fetch session' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session: data });
  } catch (error) {
    console.error('Error fetching BA session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ============================================
// Phase 7A: Seamless Access Endpoints
// ============================================

/**
 * List all authenticated users (admin only)
 */
app.get('/api/ba/admin/users', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    // Get users from the app_users view
    const { data: users, error: usersError } = await database.supabase
      .from('app_users')
      .select('*');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Get access codes to compute has_ba_access and active_sessions
    const { data: accessCodes } = await database.supabase
      .from('ba_access_codes')
      .select('user_id, code, is_active');

    const { data: sessions } = await database.supabase
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

    res.json({ users: enrichedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * Grant BA access to a user (admin only)
 */
app.post('/api/ba/admin/grant-access', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { userId, projectName } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Get user details for the code generation
    const { data: user, error: userError } = await database.supabase
      .from('app_users')
      .select('name, email')
      .eq('user_id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate access code: FIRSTNAME-YYYYMMDD-HHMM
    const firstName = (user.name || user.email.split('@')[0]).split(' ')[0].toUpperCase();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 16).replace(':', '');
    const code = `${firstName}-${dateStr}-${timeStr}`.toLowerCase();

    // Create access code linked to user
    const { data: accessCode, error: createError } = await database.supabase
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
      return res.status(500).json({ error: 'Failed to grant access' });
    }

    res.status(201).json({ accessCode });
  } catch (error) {
    console.error('Error granting access:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
});

/**
 * Update access code (admin only)
 */
app.put('/api/ba/admin/access-codes/:code', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { projectName } = req.body;

    const updateData = {};
    if (projectName !== undefined) updateData.project_name = projectName;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await database.supabase
      .from('ba_access_codes')
      .update(updateData)
      .eq('code', req.params.code)
      .select()
      .single();

    if (error) {
      console.error('Error updating access code:', error);
      return res.status(500).json({ error: 'Failed to update access code' });
    }

    res.json({ accessCode: data });
  } catch (error) {
    console.error('Error updating access code:', error);
    res.status(500).json({ error: 'Failed to update access code' });
  }
});

/**
 * Get current user's BA sessions
 */
app.get('/api/ba/user/sessions', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);

    if (!userId || userId === TEMP_USER_ID) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get access codes linked to this user
    const { data: accessCodes, error: codesError } = await database.supabase
      .from('ba_access_codes')
      .select('code, project_name, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (codesError) {
      console.error('Error fetching user access codes:', codesError);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    if (!accessCodes || accessCodes.length === 0) {
      return res.json({ sessions: [] });
    }

    // Get sessions for these access codes
    const codes = accessCodes.map(ac => ac.code);
    const { data: sessions, error: sessionsError } = await database.supabase
      .from('ba_sessions')
      .select('id, access_code, project_name, status, created_at, updated_at, coverage_status, generated_docs')
      .in('access_code', codes)
      .order('updated_at', { ascending: false });

    if (sessionsError) {
      console.error('Error fetching user sessions:', sessionsError);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
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

    res.json({ sessions: enrichedSessions });
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * Get BA session by ID (for user direct access)
 */
app.get('/api/ba/session/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const sessionId = req.params.id;

    // Get the session
    const { data: session, error } = await database.supabase
      .from('ba_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify user has access to this session via their access codes
    const { data: accessCode } = await database.supabase
      .from('ba_access_codes')
      .select('code')
      .eq('code', session.access_code)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!accessCode) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ session });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ============================================
// Phase 7C: Project Notes Endpoints
// ============================================

/**
 * Helper: Check if user has access to a session
 */
async function checkSessionAccess(sessionId, req) {
  const adminCheck = isAdminUser(req);
  const userId = getUserIdFromHeaders(req);

  // Admins have access to all sessions
  if (adminCheck.isAdmin) {
    return { allowed: true, isAdmin: true, authorName: 'Abiola (Admin)' };
  }

  // Get session and check user access
  const { data: session } = await database.supabase
    .from('ba_sessions')
    .select('access_code')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return { allowed: false, status: 404, message: 'Session not found' };
  }

  // Check if user has this access code
  const { data: accessCode } = await database.supabase
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

/**
 * Get notes for a session
 */
app.get('/api/ba/sessions/:id/notes', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = getUserIdFromHeaders(req);

    // Check access
    const hasAccess = await checkSessionAccess(sessionId, req);
    if (!hasAccess.allowed) {
      return res.status(hasAccess.status).json({ error: hasAccess.message });
    }

    const { data: notes, error } = await database.supabase
      .from('ba_notes')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching notes:', error);
      return res.status(500).json({ error: 'Failed to fetch notes' });
    }

    res.json({ notes: notes || [] });
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

/**
 * Add a note to a session
 */
app.post('/api/ba/sessions/:id/notes', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const userId = getUserIdFromHeaders(req);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check access
    const hasAccess = await checkSessionAccess(sessionId, req);
    if (!hasAccess.allowed) {
      return res.status(hasAccess.status).json({ error: hasAccess.message });
    }

    const { data: note, error } = await database.supabase
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
      return res.status(500).json({ error: 'Failed to add note' });
    }

    res.status(201).json({ note });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/**
 * Mark all notes in session as read
 */
app.put('/api/ba/sessions/:id/notes/read', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const adminCheck = isAdminUser(req);
    const field = adminCheck.isAdmin ? 'read_by_admin' : 'read_by_user';

    const { error } = await database.supabase
      .from('ba_notes')
      .update({ [field]: true })
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error marking notes as read:', error);
      return res.status(500).json({ error: 'Failed to mark notes as read' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notes as read:', error);
    res.status(500).json({ error: 'Failed to mark notes as read' });
  }
});

/**
 * Get unread notes count for admin
 */
app.get('/api/ba/admin/unread-notes', async (req, res) => {
  try {
    const adminCheck = isAdminUser(req);
    if (!adminCheck.isAdmin) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const { count, error } = await database.supabase
      .from('ba_notes')
      .select('*', { count: 'exact', head: true })
      .eq('read_by_admin', false)
      .eq('author_type', 'user');

    if (error) {
      console.error('Error fetching unread notes:', error);
      return res.status(500).json({ error: 'Failed to fetch unread notes' });
    }

    res.json({ unread: count || 0 });
  } catch (error) {
    console.error('Error fetching unread notes:', error);
    res.status(500).json({ error: 'Failed to fetch unread notes' });
  }
});

// ============================================
// SAVED SHARES (Shared with Me) Endpoints
// ============================================

/**
 * Get all saved shares for authenticated user
 */
app.get('/api/saved-shares', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);

    if (!userId || userId === TEMP_USER_ID) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await database.supabase
      .from('saved_shares')
      .select(`
        id,
        recording_id,
        owner_user_id,
        owner_name,
        saved_at,
        transcripts:recording_id (
          id,
          title,
          raw_text,
          personalized_text,
          final_text,
          audio_url,
          created_at
        )
      `)
      .eq('saved_by_user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('Error fetching saved shares:', error);
      return res.status(500).json({ error: 'Failed to fetch saved shares' });
    }

    // Filter out deleted recordings and flatten
    const validShares = (data || []).filter(share => share.transcripts);
    const shares = validShares.map(share => ({
      id: share.id,
      recording_id: share.recording_id,
      owner_user_id: share.owner_user_id,
      owner_name: share.owner_name,
      saved_at: share.saved_at,
      recording: share.transcripts
    }));

    res.json({ shares });
  } catch (error) {
    console.error('Error fetching saved shares:', error);
    res.status(500).json({ error: 'Failed to fetch saved shares' });
  }
});

/**
 * Get saved shares grouped by person
 */
app.get('/api/saved-shares/by-person', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);

    if (!userId || userId === TEMP_USER_ID) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await database.supabase
      .from('saved_shares')
      .select('owner_user_id, owner_name, saved_at')
      .eq('saved_by_user_id', userId);

    if (error) {
      console.error('Error fetching saved shares by person:', error);
      return res.status(500).json({ error: 'Failed to fetch saved shares' });
    }

    // Group by owner
    const peopleMap = new Map();
    for (const share of (data || [])) {
      const key = share.owner_user_id || 'unknown';
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          owner_user_id: share.owner_user_id,
          owner_name: share.owner_name || 'Unknown',
          share_count: 0,
          latest_saved_at: share.saved_at
        });
      }
      const person = peopleMap.get(key);
      person.share_count++;
      if (new Date(share.saved_at) > new Date(person.latest_saved_at)) {
        person.latest_saved_at = share.saved_at;
      }
    }

    // Sort by latest_saved_at descending
    const people = Array.from(peopleMap.values())
      .sort((a, b) => new Date(b.latest_saved_at) - new Date(a.latest_saved_at));

    res.json({ people });
  } catch (error) {
    console.error('Error fetching saved shares by person:', error);
    res.status(500).json({ error: 'Failed to fetch saved shares' });
  }
});

/**
 * Get all shares from a specific person
 */
app.get('/api/saved-shares/person/:ownerUserId', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const ownerUserId = req.params.ownerUserId;

    if (!userId || userId === TEMP_USER_ID) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data, error } = await database.supabase
      .from('saved_shares')
      .select(`
        id,
        recording_id,
        owner_user_id,
        owner_name,
        saved_at,
        transcripts:recording_id (
          id,
          title,
          raw_text,
          personalized_text,
          final_text,
          audio_url,
          created_at
        )
      `)
      .eq('saved_by_user_id', userId)
      .eq('owner_user_id', ownerUserId)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('Error fetching shares from person:', error);
      return res.status(500).json({ error: 'Failed to fetch shares' });
    }

    // Filter out deleted recordings and flatten
    const validShares = (data || []).filter(share => share.transcripts);
    const shares = validShares.map(share => ({
      id: share.id,
      recording_id: share.recording_id,
      owner_user_id: share.owner_user_id,
      owner_name: share.owner_name,
      saved_at: share.saved_at,
      recording: share.transcripts
    }));

    const ownerName = shares.length > 0 ? shares[0].owner_name : 'Unknown';

    res.json({ owner_name: ownerName, shares });
  } catch (error) {
    console.error('Error fetching shares from person:', error);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
});

/**
 * Check if a recording is already saved
 */
app.get('/api/saved-shares/check/:recordingId', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const recordingId = req.params.recordingId;

    if (!userId || userId === TEMP_USER_ID) {
      return res.json({ saved: false, shareId: null });
    }

    const { data, error } = await database.supabase
      .from('saved_shares')
      .select('id')
      .eq('recording_id', recordingId)
      .eq('saved_by_user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking saved share:', error);
      return res.status(500).json({ error: 'Failed to check saved status' });
    }

    res.json({
      saved: !!data,
      shareId: data?.id || null
    });
  } catch (error) {
    console.error('Error checking saved share:', error);
    res.status(500).json({ error: 'Failed to check saved status' });
  }
});

/**
 * Save a recording to user's Shared with Me
 */
app.post('/api/saved-shares', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const { recordingId } = req.body;

    if (!userId || userId === TEMP_USER_ID) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!recordingId) {
      return res.status(400).json({ error: 'Recording ID is required' });
    }

    // Fetch the recording to get owner info
    const transcript = await database.getTranscript(recordingId);

    if (!transcript) {
      return res.status(400).json({ error: 'Recording not found' });
    }

    // Check if trying to save own recording
    if (transcript.user_id === userId) {
      return res.status(400).json({
        error: 'own_recording',
        message: 'This is your own recording'
      });
    }

    // Get owner's name
    let ownerName = 'Unknown';
    if (transcript.user_id) {
      const { data: ownerData } = await database.supabase
        .from('app_users')
        .select('name, email')
        .eq('user_id', transcript.user_id)
        .single();

      if (ownerData) {
        ownerName = ownerData.name || ownerData.email?.split('@')[0] || 'Unknown';
      }
    }

    // Check if already saved
    const { data: existing } = await database.supabase
      .from('saved_shares')
      .select('id')
      .eq('recording_id', recordingId)
      .eq('saved_by_user_id', userId)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Recording already saved' });
    }

    // Create the saved share
    const { data, error } = await database.supabase
      .from('saved_shares')
      .insert({
        recording_id: recordingId,
        saved_by_user_id: userId,
        owner_user_id: transcript.user_id,
        owner_name: ownerName
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating saved share:', error);
      return res.status(500).json({ error: 'Failed to save recording' });
    }

    res.status(201).json({
      success: true,
      share: {
        id: data.id,
        owner_name: ownerName
      }
    });
  } catch (error) {
    console.error('Error creating saved share:', error);
    res.status(500).json({ error: 'Failed to save recording' });
  }
});

/**
 * Remove a saved share
 */
app.delete('/api/saved-shares/:id', async (req, res) => {
  try {
    const userId = getUserIdFromHeaders(req);
    const shareId = req.params.id;

    if (!userId || userId === TEMP_USER_ID) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { error } = await database.supabase
      .from('saved_shares')
      .delete()
      .eq('id', shareId)
      .eq('saved_by_user_id', userId);

    if (error) {
      console.error('Error deleting saved share:', error);
      return res.status(500).json({ error: 'Failed to remove saved recording' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting saved share:', error);
    res.status(500).json({ error: 'Failed to remove saved recording' });
  }
});

// Start server (only when running directly, not in Lambda)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, () => {
    console.log(`\n My Whisper Server`);
    console.log(`--------------------------------------------`);
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`S3 Bucket: ${BUCKET_NAME}`);
    console.log(`Region: ${REGION}`);
    console.log(`Ready to accept requests`);
    console.log(`--------------------------------------------\n`);
  });
}

module.exports = app;
