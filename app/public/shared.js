/**
 * My Whisper - Shared with Me Page
 * Displays recordings shared with the user
 */

// DOM Elements
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const signInPrompt = document.getElementById('signInPrompt');
const recordingsList = document.getElementById('recordingsList');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');
const toast = document.getElementById('toast');
const filterBar = document.getElementById('filterBar');
const viewSelect = document.getElementById('viewSelect');
const sortSelect = document.getElementById('sortSelect');
const backBtn = document.getElementById('backBtn');
const personHeader = document.getElementById('personHeader');
const personName = document.getElementById('personName');
const personCount = document.getElementById('personCount');
const sectionTitle = document.getElementById('sectionTitle');

// Auth UI Elements
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userMenu = document.getElementById('userMenu');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const promptSignInBtn = document.getElementById('promptSignInBtn');

// Player Modal Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const audioPlayer = document.getElementById('audioPlayer');
const modalTranscriptText = document.getElementById('modalTranscriptText');
const closePlayer = document.getElementById('closePlayer');

// Remove Modal Elements
const removeModal = document.getElementById('removeModal');
const closeRemove = document.getElementById('closeRemove');
const cancelRemove = document.getElementById('cancelRemove');
const confirmRemove = document.getElementById('confirmRemove');

// State
let shares = [];
let people = [];
let currentView = 'all'; // 'all', 'by-person', 'person-detail'
let currentPersonId = null;
let currentPersonName = null;
let removeTargetId = null;

/**
 * Initialize the page
 */
async function init() {
  initTheme();
  await initAuth();
  setupEventListeners();
  setupAuthEventListeners();

  // Only load data if authenticated
  if (auth.getUser()) {
    await loadShares();
  } else {
    showSignInPrompt();
  }

  console.log('Shared page initialized');
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

      if (event === 'SIGNED_IN') {
        loadShares();
      } else if (event === 'SIGNED_OUT') {
        shares = [];
        people = [];
        showSignInPrompt();
      }
    });
  } catch (error) {
    console.error('Auth init error:', error);
    updateAuthUI();
  }
}

/**
 * Update auth UI based on current state
 */
function updateAuthUI() {
  const user = auth.getUser();

  if (user) {
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
    if (userInfo) {
      userInfo.classList.remove('show-email');
    }
  } else {
    if (signInBtn) signInBtn.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
  }
}

/**
 * Set up auth event listeners
 */
function setupAuthEventListeners() {
  if (signInBtn) {
    signInBtn.addEventListener('click', handleSignIn);
  }

  if (promptSignInBtn) {
    promptSignInBtn.addEventListener('click', handleSignIn);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await auth.signOut();
        showToast('Signed out');
      } catch (error) {
        console.error('Sign out failed:', error);
        showToast('Sign out failed', 'error');
      }
    });
  }

  if (userInfo) {
    userInfo.addEventListener('click', () => {
      userInfo.classList.toggle('show-email');
    });
  }
}

async function handleSignIn() {
  try {
    await auth.signInWithGoogle();
  } catch (error) {
    console.error('Sign in failed:', error);
    showToast('Sign in failed', 'error');
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Refresh button
  refreshBtn.addEventListener('click', () => {
    if (currentView === 'person-detail') {
      loadPersonShares(currentPersonId);
    } else {
      loadShares();
    }
  });

  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // View select
  viewSelect.addEventListener('change', () => {
    const value = viewSelect.value;
    if (value === 'all') {
      currentView = 'all';
      renderAllShares();
    } else if (value === 'by-person') {
      currentView = 'by-person';
      loadPeopleView();
    }
  });

  // Sort select
  sortSelect.addEventListener('change', () => {
    if (currentView === 'all') {
      renderAllShares();
    } else if (currentView === 'person-detail') {
      renderPersonShares();
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    currentView = 'by-person';
    currentPersonId = null;
    currentPersonName = null;
    viewSelect.value = 'by-person';
    renderPeopleView();
  });

  // Player modal
  closePlayer.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  // Remove modal
  closeRemove.addEventListener('click', closeRemoveModal);
  cancelRemove.addEventListener('click', closeRemoveModal);
  confirmRemove.addEventListener('click', confirmRemoveShare);
  removeModal.addEventListener('click', (e) => {
    if (e.target === removeModal) closeRemoveModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (playerModal.style.display !== 'none') closePlayerModal();
      if (removeModal.style.display !== 'none') closeRemoveModal();
    }
  });
}

/**
 * Load all shares
 */
async function loadShares() {
  showLoading();

  try {
    const session = await auth.getSession();
    const response = await fetch(`${config.apiUrl}/saved-shares`, {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load shares');
    }

    const data = await response.json();
    shares = data.shares || [];

    if (shares.length === 0) {
      showEmpty();
    } else {
      filterBar.style.display = 'flex';
      if (currentView === 'by-person') {
        loadPeopleView();
      } else {
        renderAllShares();
      }
    }
  } catch (error) {
    console.error('Failed to load shares:', error);
    showToast('Failed to load shares', 'error');
    showEmpty();
  }
}

/**
 * Load people view (grouped)
 */
async function loadPeopleView() {
  showLoading();

  try {
    const session = await auth.getSession();
    const response = await fetch(`${config.apiUrl}/saved-shares/by-person`, {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load people');
    }

    const data = await response.json();
    people = data.people || [];

    renderPeopleView();
  } catch (error) {
    console.error('Failed to load people:', error);
    showToast('Failed to load', 'error');
    currentView = 'all';
    viewSelect.value = 'all';
    renderAllShares();
  }
}

/**
 * Load shares from a specific person
 */
async function loadPersonShares(personId) {
  showLoading();

  try {
    const session = await auth.getSession();
    const response = await fetch(`${config.apiUrl}/saved-shares/person/${personId}`, {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load shares');
    }

    const data = await response.json();
    shares = data.shares || [];
    currentPersonName = data.owner_name;
    currentPersonId = personId;
    currentView = 'person-detail';

    renderPersonShares();
  } catch (error) {
    console.error('Failed to load person shares:', error);
    showToast('Failed to load', 'error');
  }
}

/**
 * Render all shares (flat view)
 */
function renderAllShares() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
  signInPrompt.style.display = 'none';
  recordingsList.style.display = 'grid';
  filterBar.style.display = 'flex';
  backBtn.style.display = 'none';
  personHeader.style.display = 'none';
  sectionTitle.textContent = 'Shared with Me';

  // Update sort options for all view
  updateSortOptions('all');

  // Sort shares
  const sortedShares = sortShares([...shares]);

  recordingsList.innerHTML = sortedShares.map(share => `
    <div class="recording-item" data-id="${share.id}">
      <div class="recording-info-group">
        <div class="recording-from">From ${escapeHtml(share.owner_name || 'Unknown')}</div>
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

  attachRecordingListeners();
}

/**
 * Render people view (grouped)
 */
function renderPeopleView() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
  signInPrompt.style.display = 'none';
  recordingsList.style.display = 'grid';
  filterBar.style.display = 'flex';
  backBtn.style.display = 'none';
  personHeader.style.display = 'none';
  sectionTitle.textContent = 'Shared with Me';

  // Update sort options for people view
  updateSortOptions('people');

  // Sort people
  const sortedPeople = sortPeople([...people]);

  recordingsList.innerHTML = sortedPeople.map(person => `
    <div class="person-item" data-person-id="${person.owner_user_id}">
      <div class="person-info">
        <div class="person-name">${escapeHtml(person.owner_name || 'Unknown')}</div>
        <div class="person-meta">
          ${person.share_count} recording${person.share_count !== 1 ? 's' : ''} · Last shared ${formatDate(person.latest_saved_at)}
        </div>
      </div>
      <div class="person-arrow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>
  `).join('');

  // Add click listeners for person items
  recordingsList.querySelectorAll('.person-item').forEach(item => {
    item.addEventListener('click', () => {
      const personId = item.dataset.personId;
      loadPersonShares(personId);
    });
  });
}

/**
 * Render person's shares (drilldown view)
 */
function renderPersonShares() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
  signInPrompt.style.display = 'none';
  recordingsList.style.display = 'grid';
  filterBar.style.display = 'flex';
  backBtn.style.display = 'flex';
  personHeader.style.display = 'block';
  sectionTitle.textContent = 'Shared with Me';

  // Update person header
  personName.textContent = `From ${currentPersonName}`;
  personCount.textContent = `${shares.length} recording${shares.length !== 1 ? 's' : ''} shared with you`;

  // Update sort options
  updateSortOptions('all');

  // Sort shares
  const sortedShares = sortShares([...shares]);

  recordingsList.innerHTML = sortedShares.map(share => `
    <div class="recording-item" data-id="${share.id}">
      <div class="recording-info-group">
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

  attachRecordingListeners();
}

/**
 * Attach event listeners to recording items
 */
function attachRecordingListeners() {
  recordingsList.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => openPlayerModal(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copyTranscript(btn.dataset.id));
  });

  recordingsList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => openRemoveModal(btn.dataset.id));
  });
}

/**
 * Update sort options based on view
 */
function updateSortOptions(view) {
  const currentValue = sortSelect.value;

  if (view === 'people') {
    sortSelect.innerHTML = `
      <option value="recent">Most Recent</option>
      <option value="count">Most Recordings</option>
      <option value="name">A-Z (Name)</option>
    `;
    if (!['recent', 'count', 'name'].includes(currentValue)) {
      sortSelect.value = 'recent';
    }
  } else {
    sortSelect.innerHTML = `
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="name">A-Z (Name)</option>
    `;
    if (!['newest', 'oldest', 'name'].includes(currentValue)) {
      sortSelect.value = 'newest';
    }
  }
}

/**
 * Sort shares based on current sort selection
 */
function sortShares(sharesArray) {
  const sortBy = sortSelect.value;

  switch (sortBy) {
    case 'newest':
      return sharesArray.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
    case 'oldest':
      return sharesArray.sort((a, b) => new Date(a.saved_at) - new Date(b.saved_at));
    case 'name':
      return sharesArray.sort((a, b) =>
        (a.owner_name || '').localeCompare(b.owner_name || '')
      );
    default:
      return sharesArray;
  }
}

/**
 * Sort people based on current sort selection
 */
function sortPeople(peopleArray) {
  const sortBy = sortSelect.value;

  switch (sortBy) {
    case 'recent':
      return peopleArray.sort((a, b) => new Date(b.latest_saved_at) - new Date(a.latest_saved_at));
    case 'count':
      return peopleArray.sort((a, b) => b.share_count - a.share_count);
    case 'name':
      return peopleArray.sort((a, b) =>
        (a.owner_name || '').localeCompare(b.owner_name || '')
      );
    default:
      return peopleArray;
  }
}

/**
 * Show states
 */
function showLoading() {
  loadingState.style.display = 'block';
  emptyState.style.display = 'none';
  signInPrompt.style.display = 'none';
  recordingsList.style.display = 'none';
  filterBar.style.display = 'none';
  backBtn.style.display = 'none';
  personHeader.style.display = 'none';
}

function showEmpty() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'block';
  signInPrompt.style.display = 'none';
  recordingsList.style.display = 'none';
  filterBar.style.display = 'none';
  backBtn.style.display = 'none';
  personHeader.style.display = 'none';
}

function showSignInPrompt() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
  signInPrompt.style.display = 'block';
  recordingsList.style.display = 'none';
  filterBar.style.display = 'none';
  backBtn.style.display = 'none';
  personHeader.style.display = 'none';
}

/**
 * Open player modal
 */
function openPlayerModal(shareId) {
  const share = shares.find(s => s.id === shareId);
  if (!share || !share.recording) return;

  playerTitle.textContent = share.recording.title || 'Recording';

  const text = share.recording.final_text || share.recording.personalized_text || share.recording.raw_text || '';
  modalTranscriptText.textContent = text;

  const audioUrl = share.recording.audio_url;
  if (audioUrl) {
    const proxiedUrl = `${config.apiUrl}/audio-proxy?url=${encodeURIComponent(audioUrl)}`;
    audioPlayer.src = proxiedUrl;
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
 * Copy transcript
 */
async function copyTranscript(shareId) {
  const share = shares.find(s => s.id === shareId);
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
 * Open remove modal
 */
function openRemoveModal(shareId) {
  removeTargetId = shareId;
  removeModal.style.display = 'flex';
}

/**
 * Close remove modal
 */
function closeRemoveModal() {
  removeModal.style.display = 'none';
  removeTargetId = null;
}

/**
 * Confirm remove share
 */
async function confirmRemoveShare() {
  if (!removeTargetId) return;

  try {
    const session = await auth.getSession();
    const response = await fetch(`${config.apiUrl}/saved-shares/${removeTargetId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to remove');
    }

    // Remove from local state
    shares = shares.filter(s => s.id !== removeTargetId);

    closeRemoveModal();
    showToast('Removed from Shared with Me');

    // Re-render
    if (shares.length === 0) {
      if (currentView === 'person-detail') {
        // Go back to people view
        currentView = 'by-person';
        viewSelect.value = 'by-person';
        loadPeopleView();
      } else {
        showEmpty();
      }
    } else {
      if (currentView === 'all') {
        renderAllShares();
      } else if (currentView === 'person-detail') {
        renderPersonShares();
      }
    }
  } catch (error) {
    console.error('Failed to remove share:', error);
    showToast('Failed to remove', 'error');
    closeRemoveModal();
  }
}

/**
 * Theme handling
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

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

/**
 * Utility functions
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncateText(text, maxLength) {
  if (!text) return 'No transcription';
  if (text.length <= maxLength) return escapeHtml(text);
  return escapeHtml(text.substring(0, maxLength)) + '...';
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
