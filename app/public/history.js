/**
 * My Whisper - History Page
 * Displays past recordings and transcriptions
 */

// DOM Elements
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const recordingsList = document.getElementById('recordingsList');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');
const toast = document.getElementById('toast');

// Player Modal Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const audioPlayer = document.getElementById('audioPlayer');
const modalTranscriptText = document.getElementById('modalTranscriptText');
const closePlayer = document.getElementById('closePlayer');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const closeDelete = document.getElementById('closeDelete');
const cancelDelete = document.getElementById('cancelDelete');
const confirmDelete = document.getElementById('confirmDelete');

// State
let transcripts = [];
let deleteTargetId = null;

/**
 * Initialize the page
 */
async function init() {
  initTheme();
  setupEventListeners();
  await loadTranscripts();
  console.log('History page initialized');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Refresh button
  refreshBtn.addEventListener('click', loadTranscripts);

  // Theme toggle
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Player modal
  closePlayer.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  // Delete modal
  closeDelete.addEventListener('click', closeDeleteModal);
  cancelDelete.addEventListener('click', closeDeleteModal);
  confirmDelete.addEventListener('click', handleConfirmDelete);
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePlayerModal();
      closeDeleteModal();
    }
  });
}

/**
 * Load transcripts from API
 */
async function loadTranscripts() {
  showLoading();

  try {
    const response = await fetch(`${config.apiUrl}/transcripts`);

    if (!response.ok) {
      throw new Error('Failed to load transcripts');
    }

    const data = await response.json();
    transcripts = data.transcripts || [];

    if (transcripts.length === 0) {
      showEmpty();
    } else {
      renderTranscripts();
    }
  } catch (error) {
    console.error('Error loading transcripts:', error);
    showToast('Failed to load recordings', 'error');
    showEmpty();
  }
}

/**
 * Render transcripts list
 */
function renderTranscripts() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
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
    btn.addEventListener('click', () => copyTranscript(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', () => shareRecording(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });
}

/**
 * Show loading state
 */
function showLoading() {
  loadingState.style.display = 'block';
  emptyState.style.display = 'none';
  recordingsList.style.display = 'none';
}

/**
 * Show empty state
 */
function showEmpty() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'block';
  recordingsList.style.display = 'none';
}

/**
 * Open player modal
 */
function openPlayerModal(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript) return;

  playerTitle.textContent = transcript.title || 'Untitled Recording';
  modalTranscriptText.textContent = transcript.raw_text || 'No transcription available';

  // Set audio source - use proxy for S3 URLs
  if (transcript.audio_url) {
    const audioUrl = `${config.apiUrl}/audio-proxy?url=${encodeURIComponent(transcript.audio_url)}`;
    audioPlayer.src = audioUrl;
  }

  playerModal.style.display = 'flex';
}

/**
 * Close player modal
 */
function closePlayerModal() {
  playerModal.style.display = 'none';
  audioPlayer.pause();
  audioPlayer.src = '';
}

/**
 * Copy transcript to clipboard
 */
async function copyTranscript(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript || !transcript.raw_text) {
    showToast('No text to copy', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(transcript.raw_text);
    showToast('Copied to clipboard');
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = transcript.raw_text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copied to clipboard');
  }
}

/**
 * Share recording - copy shareable link to clipboard
 * Uses transcript ID for clean URLs - share page fetches data from API
 */
async function shareRecording(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript) {
    showToast('Recording not found', 'error');
    return;
  }

  // Build clean shareable URL with just the transcript ID
  const shareUrl = new URL(window.location.origin + '/share.html');
  shareUrl.searchParams.set('id', id);

  try {
    // Try Web Share API first (mobile-friendly)
    if (navigator.share) {
      await navigator.share({
        title: transcript.title || 'Voice Recording',
        text: transcript.raw_text ? transcript.raw_text.substring(0, 100) + '...' : 'Listen to this recording',
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
        showToast('Failed to share', 'error');
      }
    }
  }
}

/**
 * Open delete confirmation modal
 */
function openDeleteModal(id) {
  deleteTargetId = id;
  deleteModal.style.display = 'flex';
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
  deleteModal.style.display = 'none';
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
    await loadTranscripts();
  } catch (error) {
    console.error('Error deleting transcript:', error);
    showToast('Failed to delete recording', 'error');
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

/**
 * Initialize theme from saved preference
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

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
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
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
