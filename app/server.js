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
