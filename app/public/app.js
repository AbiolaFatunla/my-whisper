/**
 * My Whisper - Main Application
 * Handles recording, transcription, and UI interactions
 */

// Initialize modules
const recorder = new AudioRecorder();
const uploader = new S3Uploader();

console.log('My Whisper loaded');

// Auth UI Elements
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userMenu = document.getElementById('userMenu');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const adminBtn = document.getElementById('adminBtn');
const baSessionsBtn = document.getElementById('baSessionsBtn');
const baSessionsBadge = document.getElementById('baSessionsBadge');

// Admin email
const ADMIN_EMAIL = 'ftnlabiola@gmail.com';

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
const saveTranscriptionBtn = document.getElementById('saveTranscriptionBtn');
const copyTranscriptionBtn = document.getElementById('copyTranscriptionBtn');
const downloadTranscriptionBtn = document.getElementById('downloadTranscriptionBtn');

// State
let isRecording = false;
let recordingTimer = null;
let recordingStartTime = 0;
let currentTranscription = null;
let currentRecordingUrl = null;
let currentRecordingTitle = null;
let currentTranscriptId = null;

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

  // Initialize auth
  await initAuth();

  // Set up event listeners
  setupEventListeners();
  setupAuthEventListeners();

  // Check for sign-in redirect request (from share.html deferred save flow)
  checkSignInRedirect();

  console.log('App initialized');
}

/**
 * Check for signIn=true parameter and handle redirect flow
 * Used by share.html deferred save - redirects back after sign-in
 */
function checkSignInRedirect() {
  const urlParams = new URLSearchParams(window.location.search);
  const signInRequested = urlParams.get('signIn');
  const returnTo = urlParams.get('returnTo');

  if (signInRequested === 'true' && returnTo) {
    // Clean URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    // If already signed in, redirect immediately
    if (auth.getUser()) {
      window.location.href = decodeURIComponent(returnTo);
      return;
    }

    // Not signed in - trigger sign-in with returnTo as redirect
    auth.signInWithGoogle(decodeURIComponent(returnTo));
  }
}

/**
 * Initialize authentication
 */
async function initAuth() {
  try {
    await auth.init();
    updateAuthUI();

    // Listen for auth state changes
    auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      updateAuthUI();

      // Reload history when auth state changes
      // SIGNED_IN: user just signed in
      // SIGNED_OUT: user signed out
      // Note: INITIAL_SESSION is handled by bootstrap() awaiting init() before loadHistory()
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        loadHistory();
      }
    });
  } catch (error) {
    console.error('Auth init error:', error);
    // Continue without auth - anonymous mode
    updateAuthUI();
  }
}

/**
 * Update auth UI based on current state
 */
function updateAuthUI() {
  const user = auth.getUser();

  if (user) {
    // User is signed in
    if (signInBtn) signInBtn.style.display = 'none';
    if (userMenu) userMenu.style.display = 'flex';
    if (userAvatar) {
      userAvatar.src = user.user_metadata?.avatar_url || '';
      userAvatar.style.display = user.user_metadata?.avatar_url ? 'block' : 'none';
    }
    if (userName) {
      userName.textContent = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    }
    if (userEmail) {
      userEmail.textContent = user.email || '';
    }
    // Reset email display state
    if (userInfo) {
      userInfo.classList.remove('show-email');
    }
    // Show admin button for admin email only
    if (adminBtn) {
      adminBtn.style.display = user.email === ADMIN_EMAIL ? 'flex' : 'none';
    }
    // Check for BA access and show BA Sessions button
    checkBAAccess();
  } else {
    // User is not signed in (anonymous mode)
    if (signInBtn) signInBtn.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
    if (baSessionsBtn) baSessionsBtn.style.display = 'none';
  }
}

/**
 * Check if user has BA access and update the BA Sessions button
 */
async function checkBAAccess() {
  if (!baSessionsBtn) return;

  try {
    const response = await authFetch(`${config.apiUrl}/ba/user/sessions`);

    if (response.ok) {
      const data = await response.json();
      const sessions = data.sessions || [];

      if (sessions.length > 0) {
        // User has BA access, show the button
        baSessionsBtn.style.display = 'flex';

        // Update badge with unread notes count (will be populated in Phase 7C)
        const totalUnread = sessions.reduce((sum, s) => sum + (s.unread_notes || 0), 0);
        if (baSessionsBadge) {
          if (totalUnread > 0) {
            baSessionsBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            baSessionsBadge.style.display = 'flex';
          } else {
            baSessionsBadge.style.display = 'none';
          }
        }
      } else {
        // No BA access
        baSessionsBtn.style.display = 'none';
      }
    } else {
      // Error or unauthorized - hide the button
      baSessionsBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking BA access:', error);
    baSessionsBtn.style.display = 'none';
  }
}

/**
 * Set up auth event listeners
 */
function setupAuthEventListeners() {
  if (signInBtn) {
    signInBtn.addEventListener('click', handleSignIn);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', handleSignOut);
  }

  // Toggle email display on user info click
  if (userInfo) {
    userInfo.addEventListener('click', () => {
      userInfo.classList.toggle('show-email');
    });
  }
}

/**
 * Handle sign in button click
 */
async function handleSignIn() {
  try {
    await auth.signInWithGoogle();
  } catch (error) {
    console.error('Sign in failed:', error);
    showToast('Sign in failed');
  }
}

/**
 * Handle sign out button click
 */
async function handleSignOut() {
  try {
    await auth.signOut();
    showToast('Signed out');
  } catch (error) {
    console.error('Sign out failed:', error);
    showToast('Sign out failed');
  }
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

  // Save transcription
  if (saveTranscriptionBtn) {
    saveTranscriptionBtn.addEventListener('click', saveTranscription);
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

// Anonymous user trial limit
const ANONYMOUS_RECORDING_LIMIT = 2;

/**
 * Check if anonymous user has reached recording limit
 * Returns true if they can record, false if limit reached
 */
async function checkAnonymousLimit() {
  // Authenticated users have no limit
  if (auth.isAuthenticated()) {
    return true;
  }

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts`);
    if (!response.ok) {
      // If we can't check, allow recording (fail open)
      return true;
    }

    const data = await response.json();
    const count = (data.transcripts || []).length;

    if (count >= ANONYMOUS_RECORDING_LIMIT) {
      showTrialLimitModal();
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking limit:', error);
    // Fail open - allow recording if check fails
    return true;
  }
}

/**
 * Show trial limit modal
 */
function showTrialLimitModal() {
  const modal = document.getElementById('trialLimitModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * Close trial limit modal
 */
function closeTrialLimitModal() {
  const modal = document.getElementById('trialLimitModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Start recording
 */
async function startRecording() {
  try {
    hideError();
    hideTranscription();

    // Check anonymous user limit
    const canRecord = await checkAnonymousLimit();
    if (!canRecord) {
      return;
    }

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

    const response = await authFetch(`${config.apiUrl}/transcribe`, {
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
  transcriptionText.value = text || '';
  transcriptionText.style.display = 'block';
  transcriptionActions.style.display = 'flex';

  // Store transcript ID for saving edits
  currentTranscriptId = transcriptId;

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
 * Save transcription edits
 */
async function saveTranscription() {
  if (!currentTranscriptId) {
    showToast('No transcript to save');
    return;
  }

  const editedText = transcriptionText.value.trim();
  if (!editedText) {
    showToast('Cannot save empty transcript');
    return;
  }

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts/${currentTranscriptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalText: editedText })
    });

    if (!response.ok) {
      throw new Error('Failed to save');
    }

    // Update current transcription state
    currentTranscription = editedText;

    showToast('Saved');

    // Refresh history to show updated text
    loadHistory();
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save');
  }
}

/**
 * Copy transcription to clipboard
 */
async function copyTranscription() {
  const text = transcriptionText.value || currentTranscription;
  if (!text) return;

  try {
    const success = await S3Uploader.copyToClipboard(text);
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
  const text = transcriptionText.value || currentTranscription;
  if (!text) return;

  const filename = currentRecordingTitle
    ? `${currentRecordingTitle.replace(/[^a-z0-9]/gi, '_')}.txt`
    : 'transcription.txt';

  const blob = new Blob([text], { type: 'text/plain' });
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

// View Toggle Elements (Desktop)
const recordingsSectionTitle = document.getElementById('recordingsSectionTitle');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const viewSharedBtn = document.getElementById('viewSharedBtn');
const sharedEmpty = document.getElementById('sharedEmpty');
const sharedSignInPrompt = document.getElementById('sharedSignInPrompt');

// Shared Filter Bar Elements (Desktop)
const sharedFilterBar = document.getElementById('sharedFilterBar');
const sharedViewSelect = document.getElementById('sharedViewSelect');
const sharedSortSelect = document.getElementById('sharedSortSelect');

// Player Modal Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const audioPlayer = document.getElementById('audioPlayer');
const closePlayer = document.getElementById('closePlayer');
const modalTranscriptText = document.getElementById('modalTranscriptText');
const saveModalTranscriptBtn = document.getElementById('saveModalTranscriptBtn');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const closeDelete = document.getElementById('closeDelete');
const cancelDelete = document.getElementById('cancelDelete');
const confirmDelete = document.getElementById('confirmDelete');

// History State
let transcripts = [];
let deleteTargetId = null;
let modalTranscriptId = null;

// View Toggle State (Desktop)
let currentRecordingsView = 'history'; // 'history' or 'shared'
let sharedRecordings = [];
let sharedPeople = [];
let currentSharedViewMode = 'all'; // 'all' or 'by-person'

/**
 * Load transcripts from API
 */
async function loadHistory() {
  if (!recordingsList) return; // Not on a page with history

  showHistoryLoading();

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts`);

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
          <span>${truncateText(transcript.final_text || transcript.personalized_text || transcript.raw_text, 50)}</span>
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
  if (sharedEmpty) sharedEmpty.style.display = 'none';
  if (sharedSignInPrompt) sharedSignInPrompt.style.display = 'none';
  if (recordingsList) recordingsList.style.display = 'none';
}

/**
 * Show history empty state
 */
function showHistoryEmpty() {
  if (historyLoading) historyLoading.style.display = 'none';
  if (historyEmpty) historyEmpty.style.display = 'block';
  if (sharedEmpty) sharedEmpty.style.display = 'none';
  if (sharedSignInPrompt) sharedSignInPrompt.style.display = 'none';
  if (recordingsList) recordingsList.style.display = 'none';
}

// ============================================
// Shared Recordings (Desktop view toggle)
// ============================================

/**
 * Switch between history and shared views
 */
function switchRecordingsView(view) {
  if (!viewHistoryBtn || !viewSharedBtn) return;

  currentRecordingsView = view;

  // Update toggle button states
  if (view === 'history') {
    viewHistoryBtn.classList.add('active');
    viewSharedBtn.classList.remove('active');
    if (recordingsSectionTitle) recordingsSectionTitle.textContent = 'Your Recordings';
    if (sharedFilterBar) sharedFilterBar.style.display = 'none';
    loadHistory();
  } else {
    viewHistoryBtn.classList.remove('active');
    viewSharedBtn.classList.add('active');
    if (recordingsSectionTitle) recordingsSectionTitle.textContent = 'Shared with Me';
    loadSharedRecordings();
  }
}

/**
 * Load shared recordings from API
 */
async function loadSharedRecordings() {
  if (!recordingsList) return;

  // Check if user is authenticated
  const user = auth.getUser();
  if (!user) {
    showSharedSignInPrompt();
    return;
  }

  showHistoryLoading();

  try {
    const session = await auth.getSession();
    const response = await fetch(`${config.apiUrl}/saved-shares`, {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load shared recordings');
    }

    const data = await response.json();
    sharedRecordings = data.shares || [];

    if (sharedRecordings.length === 0) {
      showSharedEmpty();
    } else {
      renderSharedRecordings();
    }
  } catch (error) {
    console.error('Error loading shared recordings:', error);
    showSharedEmpty();
  }
}

/**
 * Render shared recordings list
 */
function renderSharedRecordings() {
  if (!recordingsList) return;

  historyLoading.style.display = 'none';
  historyEmpty.style.display = 'none';
  if (sharedEmpty) sharedEmpty.style.display = 'none';
  if (sharedSignInPrompt) sharedSignInPrompt.style.display = 'none';
  recordingsList.style.display = 'grid';

  // Show filter bar and update sort options
  if (sharedFilterBar) {
    sharedFilterBar.style.display = 'flex';
    updateSharedSortOptions();
  }

  // Get current view mode
  const viewMode = sharedViewSelect?.value || 'all';

  if (viewMode === 'by-person') {
    renderSharedByPerson();
    return;
  }

  // Sort recordings
  const sortedShares = sortSharedRecordings([...sharedRecordings]);

  recordingsList.innerHTML = sortedShares.map(share => `
    <div class="recording-item" data-id="${share.id}" data-recording-id="${share.recording_id}">
      <div class="recording-info-group">
        <div class="recording-from" style="font-size: 0.75rem; color: var(--primary); font-weight: 600; margin-bottom: 4px;">From ${escapeHtml(share.owner_name || 'Unknown')}</div>
        <div class="recording-name">${escapeHtml(share.recording?.title || 'Untitled Recording')}</div>
        <div class="recording-meta">
          <span>${formatDate(share.saved_at)}</span>
          <span>${truncateText(share.recording?.final_text || share.recording?.personalized_text || share.recording?.raw_text, 50)}</span>
        </div>
      </div>
      <div class="recording-actions">
        <button class="icon-button play-btn" data-id="${share.id}" aria-label="Play recording">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <button class="icon-button copy-btn" data-id="${share.id}" aria-label="Copy transcription">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="icon-button remove-btn" data-id="${share.id}" aria-label="Remove from saved">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  attachSharedRecordingsListeners();
}

/**
 * Update sort options based on view mode
 */
function updateSharedSortOptions() {
  if (!sharedSortSelect) return;

  const viewMode = sharedViewSelect?.value || 'all';
  const currentValue = sharedSortSelect.value;

  if (viewMode === 'by-person') {
    const validOptions = ['recent', 'count', 'name'];
    sharedSortSelect.innerHTML = `
      <option value="recent">Most Recent</option>
      <option value="count">Most Recordings</option>
      <option value="name">A-Z</option>
    `;
    sharedSortSelect.value = validOptions.includes(currentValue) ? currentValue : 'recent';
  } else {
    const validOptions = ['newest', 'oldest', 'recorded', 'name'];
    sharedSortSelect.innerHTML = `
      <option value="newest">Newest Saved</option>
      <option value="oldest">Oldest Saved</option>
      <option value="recorded">Recording Date</option>
      <option value="name">A-Z (Sharer)</option>
    `;
    sharedSortSelect.value = validOptions.includes(currentValue) ? currentValue : 'newest';
  }
}

/**
 * Sort shared recordings
 */
function sortSharedRecordings(sharesArray) {
  const sortBy = sharedSortSelect?.value || 'newest';

  switch (sortBy) {
    case 'newest':
      return sharesArray.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
    case 'oldest':
      return sharesArray.sort((a, b) => new Date(a.saved_at) - new Date(b.saved_at));
    case 'recorded':
      return sharesArray.sort((a, b) => new Date(b.recording?.created_at || 0) - new Date(a.recording?.created_at || 0));
    case 'name':
      return sharesArray.sort((a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''));
    default:
      return sharesArray;
  }
}

/**
 * Render shared recordings grouped by person
 */
function renderSharedByPerson() {
  // Group recordings by owner
  const peopleMap = new Map();
  sharedRecordings.forEach(share => {
    const ownerId = share.owner_user_id || 'unknown';
    if (!peopleMap.has(ownerId)) {
      peopleMap.set(ownerId, {
        owner_user_id: ownerId,
        owner_name: share.owner_name || 'Unknown',
        share_count: 0,
        latest_saved_at: share.saved_at
      });
    }
    const person = peopleMap.get(ownerId);
    person.share_count++;
    if (new Date(share.saved_at) > new Date(person.latest_saved_at)) {
      person.latest_saved_at = share.saved_at;
    }
  });

  sharedPeople = Array.from(peopleMap.values());

  // Sort people
  const sortBy = sharedSortSelect?.value || 'recent';
  switch (sortBy) {
    case 'recent':
      sharedPeople.sort((a, b) => new Date(b.latest_saved_at) - new Date(a.latest_saved_at));
      break;
    case 'count':
      sharedPeople.sort((a, b) => b.share_count - a.share_count);
      break;
    case 'name':
      sharedPeople.sort((a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''));
      break;
  }

  recordingsList.innerHTML = sharedPeople.map(person => `
    <div class="recording-item person-card" data-person-id="${person.owner_user_id}">
      <div class="recording-info-group">
        <div class="recording-name">${escapeHtml(person.owner_name)}</div>
        <div class="recording-meta">
          <span>${person.share_count} recording${person.share_count !== 1 ? 's' : ''}</span>
          <span>Last shared ${formatDate(person.latest_saved_at)}</span>
        </div>
      </div>
      <div class="recording-actions">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-secondary);">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>
  `).join('');

  // Note: Person drill-down not implemented in desktop view - users can use mobile shared.html for full functionality
}

/**
 * Attach event listeners to shared recording items
 */
function attachSharedRecordingsListeners() {
  recordingsList.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => openSharedPlayerModal(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copySharedTranscript(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeSharedRecording(btn.dataset.id));
  });
}

/**
 * Open player modal for shared recording
 */
function openSharedPlayerModal(shareId) {
  const share = sharedRecordings.find(s => s.id === shareId);
  if (!share || !share.recording || !playerModal) return;

  modalTranscriptId = null; // Can't edit shared recordings

  playerTitle.textContent = share.recording.title || 'Recording';

  const text = share.recording.final_text || share.recording.personalized_text || share.recording.raw_text || '';
  modalTranscriptText.value = text;
  modalTranscriptText.readOnly = true; // Can't edit shared recordings
  if (saveModalTranscriptBtn) saveModalTranscriptBtn.style.display = 'none';

  if (share.recording.audio_url) {
    const audioUrl = `${config.apiUrl}/audio-proxy?url=${encodeURIComponent(share.recording.audio_url)}`;
    audioPlayer.src = audioUrl;
  }

  playerModal.style.display = 'flex';
}

/**
 * Copy transcript from shared recording
 */
async function copySharedTranscript(shareId) {
  const share = sharedRecordings.find(s => s.id === shareId);
  if (!share || !share.recording) return;

  const text = share.recording.final_text || share.recording.personalized_text || share.recording.raw_text || '';

  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch (e) {
    showToast('Failed to copy', 'error');
  }
}

/**
 * Remove shared recording from saved
 */
async function removeSharedRecording(shareId) {
  if (!confirm('Remove this recording from your Shared with Me list?')) return;

  try {
    const session = await auth.getSession();
    const response = await fetch(`${config.apiUrl}/saved-shares/${shareId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to remove');
    }

    sharedRecordings = sharedRecordings.filter(s => s.id !== shareId);
    showToast('Removed from Shared with Me');

    if (sharedRecordings.length === 0) {
      showSharedEmpty();
    } else {
      renderSharedRecordings();
    }
  } catch (error) {
    console.error('Failed to remove shared recording:', error);
    showToast('Failed to remove', 'error');
  }
}

/**
 * Show shared empty state
 */
function showSharedEmpty() {
  if (historyLoading) historyLoading.style.display = 'none';
  if (historyEmpty) historyEmpty.style.display = 'none';
  if (sharedEmpty) sharedEmpty.style.display = 'block';
  if (sharedSignInPrompt) sharedSignInPrompt.style.display = 'none';
  if (recordingsList) recordingsList.style.display = 'none';
  if (sharedFilterBar) sharedFilterBar.style.display = 'none';
}

/**
 * Show sign-in prompt for shared view
 */
function showSharedSignInPrompt() {
  if (historyLoading) historyLoading.style.display = 'none';
  if (historyEmpty) historyEmpty.style.display = 'none';
  if (sharedEmpty) sharedEmpty.style.display = 'none';
  if (sharedSignInPrompt) sharedSignInPrompt.style.display = 'block';
  if (recordingsList) recordingsList.style.display = 'none';
  if (sharedFilterBar) sharedFilterBar.style.display = 'none';
}

/**
 * Open player modal
 */
function openPlayerModal(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript || !playerModal) return;

  // Store transcript ID for saving edits
  modalTranscriptId = id;

  playerTitle.textContent = transcript.title || 'Untitled Recording';

  // Set audio source using proxy for S3 URLs
  if (transcript.audio_url) {
    const audioUrl = `${config.apiUrl}/audio-proxy?url=${encodeURIComponent(transcript.audio_url)}`;
    audioPlayer.src = audioUrl;
  }

  // Set transcript text - use final_text if available, then personalized_text, then raw_text
  if (modalTranscriptText) {
    modalTranscriptText.value = transcript.final_text || transcript.personalized_text || transcript.raw_text || '';
    modalTranscriptText.readOnly = false; // Editable for own recordings
  }
  if (saveModalTranscriptBtn) saveModalTranscriptBtn.style.display = 'block';

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
  modalTranscriptId = null;
}

/**
 * Save transcript edits from modal
 */
async function saveModalTranscript() {
  if (!modalTranscriptId) {
    showToast('No transcript to save');
    return;
  }

  const editedText = modalTranscriptText.value.trim();
  if (!editedText) {
    showToast('Cannot save empty transcript');
    return;
  }

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts/${modalTranscriptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalText: editedText })
    });

    if (!response.ok) {
      throw new Error('Failed to save');
    }

    showToast('Saved');

    // Refresh history to show updated text
    await loadHistory();
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save');
  }
}

/**
 * Copy transcript from history
 */
async function copyHistoryTranscript(id) {
  const transcript = transcripts.find(t => t.id === id);
  const textToCopy = transcript?.final_text || transcript?.personalized_text || transcript?.raw_text;

  if (!textToCopy) {
    showToast('No text to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast('Copied to clipboard');
  } catch (error) {
    showToast('Failed to copy');
  }
}

/**
 * Convert title to URL-safe slug
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, '-')       // Replace spaces with hyphens
    .replace(/-+/g, '-')        // Replace multiple hyphens with single
    .substring(0, 50);          // Limit length
}

/**
 * Share recording - copy shareable link to clipboard
 * Uses API endpoint for dynamic OG tags (WhatsApp/social media previews)
 */
async function shareRecording(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript) {
    showToast('Recording not found');
    return;
  }

  // Use API share-page endpoint for dynamic OG tags
  // This allows WhatsApp etc. to show the actual recording title
  const shareUrl = `${config.apiUrl}/share-page/${id}`;

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
    const response = await authFetch(`${config.apiUrl}/transcripts/${deleteTargetId}`, {
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
  // View toggle buttons (Desktop)
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', () => switchRecordingsView('history'));
  }
  if (viewSharedBtn) {
    viewSharedBtn.addEventListener('click', () => switchRecordingsView('shared'));
  }

  // Refresh button - refreshes current view
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (currentRecordingsView === 'shared') {
        loadSharedRecordings();
      } else {
        loadHistory();
      }
    });
  }

  // Shared filter dropdowns (Desktop)
  if (sharedViewSelect) {
    sharedViewSelect.addEventListener('change', () => {
      currentSharedViewMode = sharedViewSelect.value;
      updateSharedSortOptions();
      if (currentSharedViewMode === 'by-person') {
        renderSharedByPerson();
      } else {
        renderSharedRecordings();
      }
    });
  }
  if (sharedSortSelect) {
    sharedSortSelect.addEventListener('change', () => {
      if (currentSharedViewMode === 'by-person') {
        renderSharedByPerson();
      } else {
        renderSharedRecordings();
      }
    });
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
  if (saveModalTranscriptBtn) {
    saveModalTranscriptBtn.addEventListener('click', saveModalTranscript);
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
      closeTrialLimitModal();
    }
  });

  // Trial limit modal
  const trialLimitModal = document.getElementById('trialLimitModal');
  const closeTrialLimit = document.getElementById('closeTrialLimit');
  const trialSignInBtn = document.getElementById('trialSignInBtn');
  const trialDismissBtn = document.getElementById('trialDismissBtn');

  if (closeTrialLimit) {
    closeTrialLimit.addEventListener('click', closeTrialLimitModal);
  }
  if (trialDismissBtn) {
    trialDismissBtn.addEventListener('click', closeTrialLimitModal);
  }
  if (trialSignInBtn) {
    trialSignInBtn.addEventListener('click', async () => {
      closeTrialLimitModal();
      await handleSignIn();
    });
  }
  if (trialLimitModal) {
    trialLimitModal.addEventListener('click', (e) => {
      if (e.target === trialLimitModal) closeTrialLimitModal();
    });
  }
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
async function bootstrap() {
  await init();
  setupHistoryEventListeners();
  await loadHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
