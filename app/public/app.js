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

    // Set up max duration callback (15 minutes)
    recorder.onMaxDurationReached = () => {
      showToast('Maximum recording time reached (15 minutes)');
      stopRecording();
    };

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

    const response = await fetch(`${config.apiUrl}/transcribe`, {
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
  transcriptionSection.classList.add('show');
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

  // Refresh history to show the new recording
  loadHistory();
}

/**
 * Hide transcription section
 */
function hideTranscription() {
  transcriptionSection.style.display = 'none';
  transcriptionSection.classList.remove('show');
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

// ============================================
// History Section (Desktop side-by-side view)
// ============================================

// History DOM Elements
const historyLoading = document.getElementById('historyLoading');
const historyEmpty = document.getElementById('historyEmpty');
const recordingsList = document.getElementById('recordingsList');
const refreshBtn = document.getElementById('refreshBtn');

// Player Modal Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const audioPlayer = document.getElementById('audioPlayer');
const closePlayer = document.getElementById('closePlayer');
const modalTranscriptText = document.getElementById('modalTranscriptText');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const closeDelete = document.getElementById('closeDelete');
const cancelDelete = document.getElementById('cancelDelete');
const confirmDelete = document.getElementById('confirmDelete');

// History State
let transcripts = [];
let deleteTargetId = null;

/**
 * Load transcripts from API
 */
async function loadHistory() {
  if (!recordingsList) return; // Not on a page with history

  showHistoryLoading();

  try {
    const response = await fetch(`${config.apiUrl}/transcripts`);

    if (!response.ok) {
      throw new Error('Failed to load transcripts');
    }

    const data = await response.json();
    transcripts = data.transcripts || [];

    if (transcripts.length === 0) {
      showHistoryEmpty();
    } else {
      renderHistory();
    }

    // Check for shared recording in URL after loading
    checkSharedRecordingUrl();
  } catch (error) {
    console.error('Error loading history:', error);
    showHistoryEmpty();
  }
}

/**
 * Check URL for shared recording parameter and auto-open
 */
function checkSharedRecordingUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const recordingId = urlParams.get('recording');

  if (recordingId) {
    // Find the transcript
    const transcript = transcripts.find(t => t.id === recordingId);

    if (transcript) {
      // Open the player modal for this recording
      openPlayerModal(recordingId);

      // Clean the URL without triggering a page reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }
}

/**
 * Render transcripts list
 */
function renderHistory() {
  if (!recordingsList) return;

  historyLoading.style.display = 'none';
  historyEmpty.style.display = 'none';
  recordingsList.style.display = 'grid';

  recordingsList.innerHTML = transcripts.map(transcript => `
    <div class="recording-item" data-id="${transcript.id}">
      <div class="recording-info-group">
        <div class="recording-name">${escapeHtml(transcript.title || 'Untitled Recording')}</div>
        <div class="recording-meta">
          <span>${formatDate(transcript.created_at)}</span>
          <span>${truncateText(transcript.raw_text, 50)}</span>
        </div>
      </div>
      <div class="recording-actions">
        <button class="icon-button play-btn" data-id="${transcript.id}" aria-label="Play recording">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="icon-button copy-btn" data-id="${transcript.id}" aria-label="Copy transcription">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="icon-button share-btn" data-id="${transcript.id}" aria-label="Share recording">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>
        <button class="icon-button delete-btn" data-id="${transcript.id}" aria-label="Delete recording">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Add event listeners to buttons
  recordingsList.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copyHistoryTranscript(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', () => shareRecording(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });
}

/**
 * Show history loading state
 */
function showHistoryLoading() {
  if (historyLoading) historyLoading.style.display = 'block';
  if (historyEmpty) historyEmpty.style.display = 'none';
  if (recordingsList) recordingsList.style.display = 'none';
}

/**
 * Show history empty state
 */
function showHistoryEmpty() {
  if (historyLoading) historyLoading.style.display = 'none';
  if (historyEmpty) historyEmpty.style.display = 'block';
  if (recordingsList) recordingsList.style.display = 'none';
}

/**
 * Open player modal
 */
function openPlayerModal(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript || !playerModal) return;

  playerTitle.textContent = transcript.title || 'Untitled Recording';

  // Set audio source using proxy for S3 URLs
  if (transcript.audio_url) {
    const audioUrl = `${config.apiUrl}/audio-proxy?url=${encodeURIComponent(transcript.audio_url)}`;
    audioPlayer.src = audioUrl;
  }

  // Set transcript text
  if (modalTranscriptText) {
    modalTranscriptText.textContent = transcript.raw_text || 'No transcription available';
  }

  playerModal.style.display = 'flex';
}

/**
 * Close player modal
 */
function closePlayerModal() {
  if (!playerModal) return;
  playerModal.style.display = 'none';
  audioPlayer.pause();
  audioPlayer.src = '';
}

/**
 * Copy transcript from history
 */
async function copyHistoryTranscript(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript || !transcript.raw_text) {
    showToast('No text to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(transcript.raw_text);
    showToast('Copied to clipboard');
  } catch (error) {
    showToast('Failed to copy');
  }
}

/**
 * Share recording - copy shareable link to clipboard
 * Uses transcript ID for clean URLs - share page fetches data from API
 */
async function shareRecording(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript) {
    showToast('Recording not found');
    return;
  }

  // Build clean shareable URL with just the transcript ID
  const shareUrl = new URL(window.location.origin + '/share.html');
  shareUrl.searchParams.set('id', id);

  try {
    // Try Web Share API first (mobile-friendly)
    // Note: Don't include 'text' - when users pick "Copy" from share menu,
    // some browsers/OS concatenate text+url, breaking the link
    if (navigator.share) {
      await navigator.share({
        title: transcript.title || 'Voice Recording',
        url: shareUrl.toString()
      });
      showToast('Shared');
    } else {
      // Fall back to clipboard copy
      await navigator.clipboard.writeText(shareUrl.toString());
      showToast('Link copied');
    }
  } catch (error) {
    // User cancelled share or clipboard failed - try clipboard as fallback
    if (error.name !== 'AbortError') {
      try {
        await navigator.clipboard.writeText(shareUrl.toString());
        showToast('Link copied');
      } catch (clipboardError) {
        showToast('Failed to share');
      }
    }
  }
}

/**
 * Open delete confirmation modal
 */
function openDeleteModal(id) {
  deleteTargetId = id;
  if (deleteModal) deleteModal.style.display = 'flex';
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
  if (deleteModal) deleteModal.style.display = 'none';
  deleteTargetId = null;
}

/**
 * Handle delete confirmation
 */
async function handleConfirmDelete() {
  if (!deleteTargetId) return;

  try {
    const response = await fetch(`${config.apiUrl}/transcripts/${deleteTargetId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete');
    }

    showToast('Recording deleted');
    closeDeleteModal();
    await loadHistory();
  } catch (error) {
    console.error('Error deleting transcript:', error);
    showToast('Failed to delete recording');
  }
}

/**
 * Set up history event listeners
 */
function setupHistoryEventListeners() {
  // Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadHistory);
  }

  // Player modal
  if (closePlayer) {
    closePlayer.addEventListener('click', closePlayerModal);
  }
  if (playerModal) {
    playerModal.addEventListener('click', (e) => {
      if (e.target === playerModal) closePlayerModal();
    });
  }

  // Delete modal
  if (closeDelete) {
    closeDelete.addEventListener('click', closeDeleteModal);
  }
  if (cancelDelete) {
    cancelDelete.addEventListener('click', closeDeleteModal);
  }
  if (confirmDelete) {
    confirmDelete.addEventListener('click', handleConfirmDelete);
  }
  if (deleteModal) {
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePlayerModal();
      closeDeleteModal();
    }
  });
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength) {
  if (!text) return 'No transcription';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupHistoryEventListeners();
    loadHistory();
  });
} else {
  init();
  setupHistoryEventListeners();
  loadHistory();
}
