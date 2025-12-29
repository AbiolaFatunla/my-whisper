/**
 * My Whisper API - AWS Lambda Handler
 * Native Lambda implementation for API Gateway HTTP API
 */

const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
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

// Temporary user ID for development (replaced with auth in Phase 5)
const TEMP_USER_ID = '00000000-0000-0000-0000-000000000000';

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

async function handleTranscribe(body) {
  const { fileUrl } = body;

  if (!fileUrl) {
    return errorResponse(400, 'File URL is required');
  }

  if (!openaiClient) {
    return errorResponse(500, 'OpenAI API key not configured');
  }

  // Download audio file
  const response = await fetch(fileUrl);
  if (!response.ok) {
    return errorResponse(500, 'Failed to download audio file');
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

  // Save to Supabase
  let savedTranscript = null;
  if (supabase) {
    try {
      const id = `tr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { data, error } = await supabase
        .from('transcripts')
        .insert({
          id,
          user_id: TEMP_USER_ID,
          raw_text: transcription?.text || '',
          personalized_text: transcription?.text || '',
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
    transcription: transcription?.text || '',
    language: 'en',
    title: generatedTitle,
    transcriptId: savedTranscript?.id || null,
    shareableUrl: fileUrl
  });
}

async function handleGetTranscripts(queryParams) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const limit = parseInt(queryParams?.limit) || 50;
  const offset = parseInt(queryParams?.offset) || 0;

  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('user_id', TEMP_USER_ID)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching transcripts:', error);
    return errorResponse(500, 'Failed to fetch transcripts');
  }

  return jsonResponse(200, { transcripts: data });
}

async function handleGetTranscript(id) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', id)
    .eq('user_id', TEMP_USER_ID)
    .single();

  if (error || !data) {
    return errorResponse(404, 'Transcript not found');
  }

  return jsonResponse(200, { transcript: data });
}

async function handleUpdateTranscript(id, body) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const { finalText } = body;

  const { data, error } = await supabase
    .from('transcripts')
    .update({
      final_text: finalText,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', TEMP_USER_ID)
    .select()
    .single();

  if (error) {
    console.error('Error updating transcript:', error);
    return errorResponse(500, 'Failed to update transcript');
  }

  return jsonResponse(200, { transcript: data });
}

async function handleDeleteTranscript(id) {
  if (!supabase) {
    return errorResponse(500, 'Database not configured');
  }

  const { error } = await supabase
    .from('transcripts')
    .delete()
    .eq('id', id)
    .eq('user_id', TEMP_USER_ID);

  if (error) {
    console.error('Error deleting transcript:', error);
    return errorResponse(500, 'Failed to delete transcript');
  }

  return jsonResponse(200, { success: true });
}

async function handleAudioProxy(queryParams) {
  const url = queryParams?.url;

  if (!url) {
    return errorResponse(400, 'URL parameter is required');
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return errorResponse(response.status, 'Failed to fetch audio');
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/webm',
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

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return jsonResponse(200, {});
  }

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
      return await handleTranscribe(body);
    }

    if (path === '/transcripts' && method === 'GET') {
      return await handleGetTranscripts(queryParams);
    }

    if (path === '/audio-proxy' && method === 'GET') {
      return await handleAudioProxy(queryParams);
    }

    // Match /transcripts/:id
    const transcriptMatch = path.match(/^\/transcripts\/([^\/]+)$/);
    if (transcriptMatch) {
      const id = transcriptMatch[1];

      if (method === 'GET') {
        return await handleGetTranscript(id);
      }
      if (method === 'PUT') {
        return await handleUpdateTranscript(id, body);
      }
      if (method === 'DELETE') {
        return await handleDeleteTranscript(id);
      }
    }

    return errorResponse(404, 'Not found');

  } catch (error) {
    console.error('Handler error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
};
