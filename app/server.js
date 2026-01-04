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

    // Return only public fields
    res.json({
      id: transcript.id,
      title: transcript.title,
      text: text,
      audioUrl: transcript.audio_url,
      createdAt: transcript.created_at
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
