/**
 * My Whisper - Main Application
 * Handles recording, transcription, and UI interactions
 */

// Initialize modules
const recorder = new AudioRecorder();
const uploader = new S3Uploader();

console.log('My Whisper loaded');

// DOM Elements
const recordButton = document.getElementById('recordButton');
const recordingStatus = document.getElementById('recordingStatus');
const recordingTime = document.getElementById('recordingTime');
const visualizerCanvas = document.getElementById('visualizer');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const errorMessage = document.getElementById('errorMessage');
const themeToggle = document.getElementById('themeToggle');
const toast = document.getElementById('toast');

// Transcription Elements
const transcriptionSection = document.getElementById('transcriptionSection');
const transcriptionLoading = document.getElementById('transcriptionLoading');
const transcriptionText = document.getElementById('transcriptionText');
const transcriptionActions = document.getElementById('transcriptionActions');
const transcriptionTitle = document.getElementById('transcriptionTitle');
const transcriptionTitleText = transcriptionTitle ? transcriptionTitle.querySelector('.title-text') : null;
const transcriptionNote = document.getElementById('transcriptionNote');
const copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
const downloadTranscriptionBtn = document.getElementById('downloadTranscriptionBtn');

// State
let isRecording = false;
let recordingTimer = null;
let recordingStartTime = 0;
let currentTranscription = null;
let currentRecordingUrl = null;
let currentRecordingTitle = null;

/**
 * Initialize application
 */
async function init() {
  // Check browser support
  if (!AudioRecorder.isSupported()) {
    showError('Your browser does not support audio recording. Please use a modern browser.');
    recordButton.disabled = true;
    return;
  }

  // Initialize theme
  initTheme();

  // Set up event listeners
  setupEventListeners();

  console.log('App initialized');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Record button
  recordButton.addEventListener('click', toggleRecording);

  // Theme toggle
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Copy transcription
  if (copyTranscriptionBtn) {
    copyTranscriptionBtn.addEventListener('click', copyTranscription);
  }

  // Download transcription
  if (downloadTranscriptionBtn) {
    downloadTranscriptionBtn.addEventListener('click', downloadTranscription);
  }
}

/**
 * Toggle recording state
 */
async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

/**
 * Start recording
 */
async function startRecording() {
  try {
    hideError();
    hideTranscription();

    await recorder.startRecording();

    isRecording = true;
    recordingStartTime = Date.now();

    // Update UI
    recordButton.classList.add('recording');
    recordButton.querySelector('.mic-svg').style.display = 'none';
    recordButton.querySelector('.stop-svg').style.display = 'block';
    recordingStatus.textContent = 'Recording...';

    // Start timer
    recordingTimer = setInterval(updateRecordingTime, 1000);

    // Start visualization
    recorder.drawVisualization(visualizerCanvas);

  } catch (error) {
    console.error('Error starting recording:', error);
    showError(error.message);
  }
}

/**
 * Stop recording and upload
 */
async function stopRecording() {
  try {
    // Stop timer
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    // Update UI
    recordButton.classList.remove('recording');
    recordButton.querySelector('.mic-svg').style.display = 'block';
    recordButton.querySelector('.stop-svg').style.display = 'none';
    recordingStatus.textContent = 'Processing...';

    // Stop recording
    const result = await recorder.stopRecording();

    // Generate filename
    const extension = recorder.getFileExtension(result.mimeType);
    const filename = AudioRecorder.generateFilename(extension);

    // Show upload progress
    showUploadProgress();

    // Upload to S3
    const uploadResult = await uploader.uploadRecording(result.blob, filename, (progress) => {
      updateUploadProgress(progress);
    });

    // Transcribe
    await transcribeAudio(uploadResult.shareableUrl);

  } catch (error) {
    console.error('Error stopping recording:', error);
    showError(error.message);
    resetRecordingUI();
  }
}

/**
 * Transcribe audio file
 */
async function transcribeAudio(audioUrl) {
  try {
    hideUploadProgress();
    showTranscriptionLoading();

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl: audioUrl })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Transcription failed');
    }

    const data = await response.json();

    // Store current transcription
    currentTranscription = data.transcription;
    currentRecordingUrl = audioUrl;
    currentRecordingTitle = data.title;

    // Show transcription
    showTranscription(data.transcription, data.title, data.transcriptId);

  } catch (error) {
    console.error('Transcription error:', error);
    showError(error.message);
    hideTranscriptionLoading();
  } finally {
    resetRecordingUI();
  }
}

/**
 * Update recording time display
 */
function updateRecordingTime() {
  const elapsed = Date.now() - recordingStartTime;
  recordingTime.textContent = AudioRecorder.formatTime(elapsed);
}

/**
 * Show upload progress
 */
function showUploadProgress() {
  uploadProgress.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Uploading... 0%';
}

/**
 * Update upload progress
 */
function updateUploadProgress(percent) {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `Uploading... ${Math.round(percent)}%`;
}

/**
 * Hide upload progress
 */
function hideUploadProgress() {
  uploadProgress.style.display = 'none';
}

/**
 * Show transcription loading state
 */
function showTranscriptionLoading() {
  transcriptionSection.style.display = 'block';
  transcriptionLoading.style.display = 'flex';
  transcriptionText.style.display = 'none';
  transcriptionActions.style.display = 'none';
  if (transcriptionNote) transcriptionNote.style.display = 'none';
}

/**
 * Hide transcription loading
 */
function hideTranscriptionLoading() {
  transcriptionLoading.style.display = 'none';
}

/**
 * Show transcription result
 */
function showTranscription(text, title, transcriptId) {
  transcriptionLoading.style.display = 'none';
  transcriptionText.textContent = text || 'No transcription available';
  transcriptionText.style.display = 'block';
  transcriptionActions.style.display = 'flex';

  // Show title if available
  if (title && transcriptionTitle && transcriptionTitleText) {
    transcriptionTitleText.textContent = title;
    transcriptionTitle.style.display = 'block';
  }

  // Show saved note if we have a transcript ID
  if (transcriptId && transcriptionNote) {
    transcriptionNote.style.display = 'block';
  }
}

/**
 * Hide transcription section
 */
function hideTranscription() {
  transcriptionSection.style.display = 'none';
  if (transcriptionTitle) transcriptionTitle.style.display = 'none';
  if (transcriptionNote) transcriptionNote.style.display = 'none';
}

/**
 * Reset recording UI
 */
function resetRecordingUI() {
  recordingStatus.textContent = 'Ready to record';
  recordingTime.textContent = '00:00';
  isRecording = false;
}

/**
 * Copy transcription to clipboard
 */
async function copyTranscription() {
  if (!currentTranscription) return;

  try {
    const success = await S3Uploader.copyToClipboard(currentTranscription);
    if (success) {
      showToast('Copied to clipboard');
    } else {
      showToast('Failed to copy');
    }
  } catch (error) {
    console.error('Copy error:', error);
    showToast('Failed to copy');
  }
}

/**
 * Download transcription as text file
 */
function downloadTranscription() {
  if (!currentTranscription) return;

  const filename = currentRecordingTitle
    ? `${currentRecordingTitle.replace(/[^a-z0-9]/gi, '_')}.txt`
    : 'transcription.txt';

  const blob = new Blob([currentTranscription], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Downloaded');
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.style.display = 'none';
}

/**
 * Show toast notification
 */
function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 2000);
}

/**
 * Initialize theme from system preference or saved preference
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme) {
    document.body.setAttribute('data-theme', savedTheme);
  } else if (prefersDark) {
    document.body.setAttribute('data-theme', 'dark');
  }
}

/**
 * Toggle theme
 */
function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
