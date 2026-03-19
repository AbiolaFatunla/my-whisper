/**
 * My Whisper - History Page
 * Displays past recordings and transcriptions
 * SYNC: Features must be kept in sync with app.js (desktop)
 */

// DOM Elements
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const recordingsList = document.getElementById('recordingsList');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');
const toast = document.getElementById('toast');
const recordingsSectionTitle = document.getElementById('recordingsSectionTitle');

// Auth UI Elements
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userMenu = document.getElementById('userMenu');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');

// Player Modal Elements
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const audioPlayer = document.getElementById('audioPlayer');
const modalTranscriptText = document.getElementById('modalTranscriptText');
const closePlayer = document.getElementById('closePlayer');
const saveModalTranscriptBtn = document.getElementById('saveModalTranscriptBtn');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const closeDelete = document.getElementById('closeDelete');
const cancelDelete = document.getElementById('cancelDelete');
const confirmDelete = document.getElementById('confirmDelete');

// State
let transcripts = [];
let folders = [];
let deleteTargetId = null;
let modalTranscriptId = null;
let currentRecordingsView = 'history';

// Folder management state
let renameFolderTargetId = null;
let deleteFolderTargetId = null;
let moveTargetId = null;
let seriesTargetId = null;

// Multi-select state
let selectMode = false;
let selectedIds = new Set();

/**
 * Initialize the page
 */
async function init() {
  initTheme();
  await initAuth();
  setupEventListeners();
  setupAuthEventListeners();
  setupFolderManagementListeners();
  await loadFolders();
  await loadTranscripts();
  console.log('History page initialized');
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

      // Reload transcripts when auth state changes
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        loadTranscripts();
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
    // Reset email display state
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
    signInBtn.addEventListener('click', async () => {
      try {
        await auth.signInWithGoogle();
      } catch (error) {
        console.error('Sign in failed:', error);
        showToast('Sign in failed', 'error');
      }
    });
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

  // Toggle email display on user info click
  if (userInfo) {
    userInfo.addEventListener('click', () => {
      userInfo.classList.toggle('show-email');
    });
  }
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
  if (saveModalTranscriptBtn) {
    saveModalTranscriptBtn.addEventListener('click', saveModalTranscript);
  }

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
      closeRenameFolderModal();
      closeDeleteFolderModal();
      closeEmptyDisposableModal();
      closeMoveFolderModal();
      closeSeriesModal();
      closeBulkDeleteModal();
    }
  });

  // View toggle buttons
  const viewHistoryBtn = document.getElementById('viewHistoryBtn');
  const viewFoldersBtn = document.getElementById('viewFoldersBtn');
  const viewDisposableBtn = document.getElementById('viewDisposableBtn');

  if (viewHistoryBtn) viewHistoryBtn.addEventListener('click', () => switchRecordingsView('history'));
  if (viewFoldersBtn) viewFoldersBtn.addEventListener('click', () => switchRecordingsView('folders'));
  if (viewDisposableBtn) viewDisposableBtn.addEventListener('click', () => switchRecordingsView('disposable'));

  // Folder filter change
  const folderFilterSelect = document.getElementById('folderFilterSelect');
  if (folderFilterSelect) {
    folderFilterSelect.addEventListener('change', () => {
      // Show/hide folder manage buttons
      const manageBtns = document.getElementById('folderManageBtns');
      if (manageBtns) {
        const isSpecificFolder = folderFilterSelect.value !== 'all' && folderFilterSelect.value !== 'all-files';
        manageBtns.style.display = isSpecificFolder ? 'flex' : 'none';
      }
      renderTranscripts();
    });
  }

  // Empty disposable button
  const emptyDisposableBtn = document.getElementById('emptyDisposableBtn');
  if (emptyDisposableBtn) {
    emptyDisposableBtn.addEventListener('click', openEmptyDisposableModal);
  }

  // Select mode
  const selectModeBtn = document.getElementById('selectModeBtn');
  if (selectModeBtn) selectModeBtn.addEventListener('click', toggleSelectMode);

  const bulkSelectAllBtn = document.getElementById('bulkSelectAll');
  if (bulkSelectAllBtn) bulkSelectAllBtn.addEventListener('click', bulkSelectAll);

  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', openBulkDeleteModal);

  const bulkCancelBtn = document.getElementById('bulkCancelBtn');
  if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', exitSelectMode);
}

// ============================================
// View Switching
// ============================================

function switchRecordingsView(view) {
  currentRecordingsView = view;

  // Update all toggle button states
  const allViewBtns = document.querySelectorAll('.view-toggle-btn');
  allViewBtns.forEach(btn => btn.classList.remove('active'));

  const activeBtn = document.querySelector(`[data-view="${view}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Hide all filter bars
  const folderFilterBar = document.getElementById('folderFilterBar');
  if (folderFilterBar) folderFilterBar.style.display = 'none';
  const disposableActionsBar = document.getElementById('disposableActionsBar');
  if (disposableActionsBar) disposableActionsBar.style.display = 'none';

  if (view === 'history') {
    if (recordingsSectionTitle) recordingsSectionTitle.textContent = 'Your Recordings';
    renderTranscripts();
  } else if (view === 'folders') {
    if (recordingsSectionTitle) recordingsSectionTitle.textContent = 'Folders';
    if (folderFilterBar) folderFilterBar.style.display = 'block';
    // Default to "All Folders" view when switching to this tab
    const folderFilterSelect = document.getElementById('folderFilterSelect');
    if (folderFilterSelect && !folderFilterSelect.value) folderFilterSelect.value = 'all';
    const manageBtns = document.getElementById('folderManageBtns');
    if (manageBtns) manageBtns.style.display = 'none';
    renderTranscripts();
  } else if (view === 'disposable') {
    if (recordingsSectionTitle) recordingsSectionTitle.textContent = 'Disposable Notes';
    if (disposableActionsBar) disposableActionsBar.style.display = 'flex';
    renderTranscripts();
  }
}

// ============================================
// Loading Transcripts
// ============================================

/**
 * Load transcripts from API
 */
async function loadTranscripts() {
  showLoading();

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts`);

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
 * Build a single recording card element (DOM-based, no innerHTML)
 * Note: This pattern matches app.js which uses innerHTML with escapeHtml()
 * for all user-controlled text. The escapeHtml function creates a text node
 * via textContent assignment, so XSS is prevented at the data level.
 */
function buildRecordingCard(transcript) {
  const item = document.createElement('div');
  item.className = 'recording-item' + (selectMode ? ' select-mode' : '') + (selectedIds.has(transcript.id) ? ' selected' : '');
  item.dataset.id = transcript.id;

  // Checkbox for select mode
  if (selectMode) {
    const label = document.createElement('label');
    label.className = 'select-checkbox';
    label.dataset.id = transcript.id;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedIds.has(transcript.id);
    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';
    label.appendChild(cb);
    label.appendChild(checkmark);
    item.appendChild(label);

    cb.addEventListener('change', () => {
      if (cb.checked) {
        selectedIds.add(transcript.id);
      } else {
        selectedIds.delete(transcript.id);
      }
      updateSelectUI();
    });
  }

  // Info group
  const infoGroup = document.createElement('div');
  infoGroup.className = 'recording-info-group';

  const nameDiv = document.createElement('div');
  nameDiv.className = 'recording-name';
  let displayTitle = transcript.title || 'Untitled Recording';
  if (transcript.series_order) {
    displayTitle += ' \u2014 Part ' + transcript.series_order;
  }
  nameDiv.textContent = displayTitle;
  infoGroup.appendChild(nameDiv);

  // Badges
  const folder = folders.find(f => f.id === transcript.folder_id);
  if (folder || transcript.series_order || transcript.is_disposable) {
    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'recording-badges';
    if (folder) {
      const folderBadge = document.createElement('span');
      folderBadge.className = 'recording-folder-badge';
      folderBadge.textContent = folder.name;
      badgesDiv.appendChild(folderBadge);
    }
    if (transcript.series_order) {
      const seriesBadge = document.createElement('span');
      seriesBadge.className = 'recording-series-badge';
      seriesBadge.textContent = 'Part ' + transcript.series_order;
      badgesDiv.appendChild(seriesBadge);
    }
    if (transcript.is_disposable) {
      const dispBadge = document.createElement('span');
      dispBadge.className = 'recording-disposable-badge';
      dispBadge.textContent = 'Quick Note';
      badgesDiv.appendChild(dispBadge);
    }
    infoGroup.appendChild(badgesDiv);
  }

  // Meta
  const metaDiv = document.createElement('div');
  metaDiv.className = 'recording-meta';
  const dateSpan = document.createElement('span');
  dateSpan.textContent = formatDate(transcript.created_at);
  const textSpan = document.createElement('span');
  textSpan.textContent = truncateText(transcript.final_text || transcript.personalized_text || transcript.raw_text, 50);
  metaDiv.appendChild(dateSpan);
  metaDiv.appendChild(textSpan);
  infoGroup.appendChild(metaDiv);

  item.appendChild(infoGroup);

  // Action buttons
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'recording-actions';

  const buttons = [
    { cls: 'play-btn', label: 'Play recording', svg: '<polygon points="5 3 19 12 5 21 5 3"></polygon>', fill: 'currentColor', handler: () => openPlayerModal(transcript.id) },
    { cls: 'copy-btn', label: 'Copy transcription', svg: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>', fill: 'none', handler: () => copyTranscript(transcript.id) },
    { cls: 'share-btn', label: 'Share recording', svg: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>', fill: 'none', handler: () => shareRecording(transcript.id) },
    { cls: 'series-btn', label: 'Link to series', svg: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>', fill: 'none', handler: () => openSeriesModal(transcript.id) },
    { cls: 'move-btn', label: 'Move to folder', svg: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><polyline points="9 14 12 11 15 14"></polyline>', fill: 'none', handler: () => openMoveFolderModal(transcript.id) },
    { cls: 'delete-btn', label: 'Delete recording', svg: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>', fill: 'none', handler: () => openDeleteModal(transcript.id) }
  ];

  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'icon-button ' + b.cls;
    btn.setAttribute('aria-label', b.label);
    // SVG icons are static markup, not user-controlled content
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${b.fill}" stroke="currentColor" stroke-width="2">${b.svg}</svg>`;
    btn.addEventListener('click', b.handler);
    actionsDiv.appendChild(btn);
  });

  item.appendChild(actionsDiv);

  // In select mode, clicking the card row toggles the checkbox
  if (selectMode) {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.select-checkbox')) return;
      if (e.target.closest('.icon-button')) return;
      if (selectedIds.has(transcript.id)) {
        selectedIds.delete(transcript.id);
      } else {
        selectedIds.add(transcript.id);
      }
      updateSelectUI();
      renderTranscripts();
    });
  }

  return item;
}

/**
 * Render transcripts list
 */
function renderTranscripts() {
  loadingState.style.display = 'none';
  emptyState.style.display = 'none';
  recordingsList.style.display = 'grid';

  // Filter based on current view
  let displayTranscripts = transcripts;
  if (currentRecordingsView === 'disposable') {
    displayTranscripts = transcripts.filter(t => t.is_disposable);
  } else if (currentRecordingsView === 'folders') {
    const selectedFolder = document.getElementById('folderFilterSelect')?.value;
    if (selectedFolder === 'all') {
      // "All Folders" - render folder cards instead of recordings
      renderFolderCards();
      return;
    } else if (selectedFolder && selectedFolder !== 'all-files') {
      displayTranscripts = transcripts.filter(t => t.folder_id === selectedFolder);
    } else {
      // "All Files" - show everything except disposable
      displayTranscripts = transcripts.filter(t => !t.is_disposable);
    }
  } else if (currentRecordingsView === 'history') {
    displayTranscripts = transcripts.filter(t => !t.is_disposable);
  }

  if (displayTranscripts.length === 0) {
    showEmpty();
    return;
  }

  recordingsList.replaceChildren();
  displayTranscripts.forEach(transcript => {
    recordingsList.appendChild(buildRecordingCard(transcript));
  });

  // Update disposable badge count
  updateDisposableBadge();
}

/**
 * Render folder cards in the main content area (for "All Folders" view)
 */
function renderFolderCards() {
  if (!recordingsList) return;

  loadingState.style.display = 'none';
  emptyState.style.display = 'none';

  if (folders.length === 0) {
    showEmpty();
    return;
  }

  recordingsList.style.display = 'grid';
  recordingsList.replaceChildren();

  folders.forEach(folder => {
    const count = transcripts.filter(t => t.folder_id === folder.id).length;
    const card = document.createElement('div');
    card.className = 'folder-card';
    card.dataset.id = folder.id;

    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '32');
    iconSvg.setAttribute('height', '32');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '2');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
    iconSvg.appendChild(pathEl);

    const iconDiv = document.createElement('div');
    iconDiv.className = 'folder-card-icon';
    iconDiv.appendChild(iconSvg);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'folder-card-name';
    nameDiv.textContent = folder.name;

    const countDiv = document.createElement('div');
    countDiv.className = 'folder-card-count';
    countDiv.textContent = count === 1 ? '1 recording' : count + ' recordings';

    card.appendChild(iconDiv);
    card.appendChild(nameDiv);
    card.appendChild(countDiv);

    card.addEventListener('click', () => {
      const folderFilterSelect = document.getElementById('folderFilterSelect');
      if (folderFilterSelect) {
        folderFilterSelect.value = folder.id;
        folderFilterSelect.dispatchEvent(new Event('change'));
      }
      renderTranscripts();
    });

    recordingsList.appendChild(card);
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

// ============================================
// Folders
// ============================================

async function loadFolders() {
  try {
    const response = await authFetch(`${config.apiUrl}/folders`);
    if (!response.ok) return;

    const data = await response.json();
    folders = data.folders || [];
    populateFolderSelects();
  } catch (error) {
    console.error('Error loading folders:', error);
  }
}

function populateFolderSelects() {
  // Folder filter in history view
  const folderFilterSelect = document.getElementById('folderFilterSelect');
  if (folderFilterSelect) {
    const currentFilter = folderFilterSelect.value;
    folderFilterSelect.replaceChildren();
    const allFilesOpt = document.createElement('option');
    allFilesOpt.value = 'all-files';
    allFilesOpt.textContent = 'All Files';
    folderFilterSelect.appendChild(allFilesOpt);
    const allFoldersOpt = document.createElement('option');
    allFoldersOpt.value = 'all';
    allFoldersOpt.textContent = 'All Folders';
    folderFilterSelect.appendChild(allFoldersOpt);
    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.name;
      folderFilterSelect.appendChild(option);
    });
    if (currentFilter) folderFilterSelect.value = currentFilter;
  }
}

// ============================================
// Disposable Notes
// ============================================

function updateDisposableBadge() {
  const badge = document.getElementById('disposableBadge');
  if (!badge) return;

  const count = transcripts.filter(t => t.is_disposable).length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  // Update disposable actions bar count
  const countEl = document.getElementById('disposableCount');
  if (countEl) {
    countEl.textContent = `${count} disposable note${count !== 1 ? 's' : ''}`;
  }
}

function openEmptyDisposableModal() {
  const count = transcripts.filter(t => t.is_disposable).length;
  if (count === 0) {
    showToast('No disposable notes to delete');
    return;
  }

  const msg = document.getElementById('emptyDisposableMessage');
  if (msg) msg.textContent = `This will permanently delete ${count} disposable note${count !== 1 ? 's' : ''}.`;

  const confirmInput = document.getElementById('emptyDisposableConfirmInput');
  const confirmBtn = document.getElementById('confirmEmptyDisposable');
  if (confirmInput) confirmInput.value = '';
  if (confirmBtn) confirmBtn.disabled = true;

  const modal = document.getElementById('emptyDisposableModal');
  if (modal) modal.style.display = 'flex';
}

function closeEmptyDisposableModal() {
  const modal = document.getElementById('emptyDisposableModal');
  if (modal) modal.style.display = 'none';
}

async function confirmEmptyDisposable() {
  const count = transcripts.filter(t => t.is_disposable).length;

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts/disposable`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete');

    closeEmptyDisposableModal();
    showToast(`Deleted ${count} disposable note${count !== 1 ? 's' : ''}`);
    loadTranscripts();
  } catch (error) {
    console.error('Error emptying disposable notes:', error);
    showToast('Failed to delete disposable notes', 'error');
  }
}

// ============================================
// Player Modal
// ============================================

function openPlayerModal(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript) return;

  modalTranscriptId = id;
  playerTitle.textContent = transcript.title || 'Untitled Recording';
  modalTranscriptText.value = transcript.final_text || transcript.personalized_text || transcript.raw_text || '';

  if (transcript.audio_url) {
    const audioUrl = `${config.apiUrl}/audio-proxy?url=${encodeURIComponent(transcript.audio_url)}`;
    audioPlayer.src = audioUrl;
  }

  playerModal.style.display = 'flex';
}

function closePlayerModal() {
  playerModal.style.display = 'none';
  audioPlayer.pause();
  audioPlayer.src = '';
  modalTranscriptId = null;
}

async function saveModalTranscript() {
  if (!modalTranscriptId) {
    showToast('No transcript to save', 'error');
    return;
  }

  const editedText = modalTranscriptText.value.trim();
  if (!editedText) {
    showToast('Cannot save empty transcript', 'error');
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
    await loadTranscripts();
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save', 'error');
  }
}

// ============================================
// Delete Modal
// ============================================

function openDeleteModal(id) {
  deleteTargetId = id;
  const confirmInput = document.getElementById('deleteConfirmInput');
  const confirmBtn = document.getElementById('confirmDelete');
  if (confirmInput) confirmInput.value = '';
  if (confirmBtn) confirmBtn.disabled = true;
  if (deleteModal) deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
  if (deleteModal) deleteModal.style.display = 'none';
  deleteTargetId = null;
}

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
    await loadTranscripts();
  } catch (error) {
    console.error('Error deleting transcript:', error);
    showToast('Failed to delete recording', 'error');
  }
}

// ============================================
// Copy & Share
// ============================================

async function copyTranscript(id) {
  const transcript = transcripts.find(t => t.id === id);
  const textToCopy = transcript?.final_text || transcript?.personalized_text || transcript?.raw_text;

  if (!textToCopy) {
    showToast('No text to copy', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast('Copied to clipboard');
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copied to clipboard');
  }
}

function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

async function shareRecording(id) {
  const transcript = transcripts.find(t => t.id === id);
  if (!transcript) {
    showToast('Recording not found', 'error');
    return;
  }

  const shareUrl = `${config.apiUrl}/share-page/${id}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: transcript.title || 'Voice Recording',
        url: shareUrl.toString()
      });
      showToast('Shared');
    } else {
      await navigator.clipboard.writeText(shareUrl.toString());
      showToast('Link copied');
    }
  } catch (error) {
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

// ============================================
// Move to Folder
// ============================================

function openMoveFolderModal(transcriptId) {
  moveTargetId = transcriptId;

  const select = document.getElementById('moveFolderSelect');
  if (select) {
    select.replaceChildren();
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'No Folder (Unfiled)';
    select.appendChild(defaultOpt);
    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.name;
      select.appendChild(option);
    });

    // Pre-select current folder
    const transcript = transcripts.find(t => t.id === transcriptId);
    if (transcript?.folder_id) {
      select.value = transcript.folder_id;
    }
  }

  const modal = document.getElementById('moveFolderModal');
  if (modal) modal.style.display = 'flex';
}

function closeMoveFolderModal() {
  const modal = document.getElementById('moveFolderModal');
  if (modal) modal.style.display = 'none';
  moveTargetId = null;
}

async function confirmMoveFolder() {
  if (!moveTargetId) return;

  const select = document.getElementById('moveFolderSelect');
  const folderId = select?.value || null;

  try {
    const response = await authFetch(`${config.apiUrl}/transcripts/${moveTargetId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId })
    });

    if (!response.ok) throw new Error('Failed to move recording');

    showToast(folderId ? 'Recording moved to folder' : 'Recording unfiled');
    closeMoveFolderModal();
    await loadTranscripts();
  } catch (error) {
    console.error('Error moving recording:', error);
    showToast('Failed to move recording', 'error');
  }
}

// ============================================
// Link to Series
// ============================================

function openSeriesModal(transcriptId) {
  seriesTargetId = transcriptId;
  const currentTranscript = transcripts.find(t => t.id === transcriptId);
  if (!currentTranscript) return;

  const list = document.getElementById('seriesPickerList');
  if (!list) return;

  // Build list of recordings the user can link to (exclude self)
  const candidates = transcripts.filter(t => t.id !== transcriptId && !t.is_disposable);

  list.replaceChildren();

  if (candidates.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'series-picker-empty';
    emptyMsg.textContent = 'No other recordings to link with.';
    list.appendChild(emptyMsg);
  } else {
    candidates.forEach(t => {
      const item = document.createElement('div');
      item.className = 'series-picker-item';
      if (currentTranscript.series_id && t.series_id === currentTranscript.series_id) {
        item.classList.add('same-series');
      }
      item.dataset.id = t.id;
      item.dataset.seriesId = t.series_id || '';

      const titleEl = document.createElement('div');
      titleEl.className = 'series-picker-title';
      let title = t.title || 'Untitled Recording';
      if (t.series_order) title += ' \u2014 Part ' + t.series_order;
      titleEl.textContent = title;

      const metaEl = document.createElement('div');
      metaEl.className = 'series-picker-meta';
      const parts = [];
      parts.push(formatDate(t.created_at));
      const folder = folders.find(f => f.id === t.folder_id);
      if (folder) parts.push(folder.name);
      if (t.series_id) parts.push('Series');
      metaEl.textContent = parts.join(' \u00b7 ');

      item.appendChild(titleEl);
      item.appendChild(metaEl);

      item.addEventListener('click', () => {
        list.querySelectorAll('.series-picker-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      });

      list.appendChild(item);
    });
  }

  // Update modal title context
  const titleEl = document.getElementById('seriesModalTitle');
  if (titleEl) titleEl.textContent = currentTranscript.title || 'Untitled Recording';

  const modal = document.getElementById('seriesModal');
  if (modal) modal.style.display = 'flex';
}

function closeSeriesModal() {
  const modal = document.getElementById('seriesModal');
  if (modal) modal.style.display = 'none';
  seriesTargetId = null;
}

async function confirmLinkSeries() {
  if (!seriesTargetId) return;

  const list = document.getElementById('seriesPickerList');
  const selected = list?.querySelector('.series-picker-item.selected');
  if (!selected) {
    showToast('Select a recording to link with');
    return;
  }

  const linkedId = selected.dataset.id;
  const existingSeriesId = selected.dataset.seriesId || null;

  try {
    let seriesId = existingSeriesId;

    if (!seriesId) {
      // Start a new series with the selected recording as Part 1
      const res1 = await authFetch(`${config.apiUrl}/transcripts/${linkedId}/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res1.ok) throw new Error('Failed to start series');
      const data1 = await res1.json();
      seriesId = data1.seriesId;
    }

    // Now add our recording to that series
    const res2 = await authFetch(`${config.apiUrl}/transcripts/${seriesTargetId}/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesId })
    });
    if (!res2.ok) throw new Error('Failed to link to series');

    showToast('Linked to series');
    closeSeriesModal();
    await loadTranscripts();
  } catch (error) {
    console.error('Error linking series:', error);
    showToast('Failed to link to series', 'error');
  }
}

// ============================================
// Folder Rename & Delete
// ============================================

function openRenameFolderModal() {
  const folderFilterSelect = document.getElementById('folderFilterSelect');
  const selectedId = folderFilterSelect?.value;
  if (!selectedId || selectedId === 'all' || selectedId === 'all-files') return;

  const folder = folders.find(f => f.id === selectedId);
  if (!folder) return;

  renameFolderTargetId = selectedId;
  const input = document.getElementById('renameFolderInput');
  if (input) input.value = folder.name;

  const modal = document.getElementById('renameFolderModal');
  if (modal) modal.style.display = 'flex';
  if (input) input.focus();
}

function closeRenameFolderModal() {
  const modal = document.getElementById('renameFolderModal');
  if (modal) modal.style.display = 'none';
  renameFolderTargetId = null;
}

async function confirmRenameFolder() {
  if (!renameFolderTargetId) return;

  const input = document.getElementById('renameFolderInput');
  const name = input?.value?.trim();
  if (!name) {
    showToast('Please enter a folder name');
    return;
  }

  try {
    const response = await authFetch(`${config.apiUrl}/folders/${renameFolderTargetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!response.ok) throw new Error('Failed to rename folder');

    showToast('Folder renamed');
    closeRenameFolderModal();
    await loadFolders();
    renderTranscripts();
  } catch (error) {
    console.error('Error renaming folder:', error);
    showToast('Failed to rename folder', 'error');
  }
}

function openDeleteFolderModal() {
  const folderFilterSelect = document.getElementById('folderFilterSelect');
  const selectedId = folderFilterSelect?.value;
  if (!selectedId || selectedId === 'all' || selectedId === 'all-files') return;

  deleteFolderTargetId = selectedId;
  const modal = document.getElementById('deleteFolderModal');
  const confirmInput = document.getElementById('deleteFolderConfirmInput');
  const confirmBtn = document.getElementById('confirmDeleteFolder');
  if (confirmInput) confirmInput.value = '';
  if (confirmBtn) confirmBtn.disabled = true;
  if (modal) modal.style.display = 'flex';
}

function closeDeleteFolderModal() {
  const modal = document.getElementById('deleteFolderModal');
  if (modal) modal.style.display = 'none';
  deleteFolderTargetId = null;
}

async function confirmDeleteFolder() {
  if (!deleteFolderTargetId) return;

  try {
    const response = await authFetch(`${config.apiUrl}/folders/${deleteFolderTargetId}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Failed to delete folder');

    showToast('Folder deleted');
    closeDeleteFolderModal();

    // Switch back to "All Folders"
    const folderFilterSelect = document.getElementById('folderFilterSelect');
    if (folderFilterSelect) folderFilterSelect.value = 'all';

    await loadFolders();
    await loadTranscripts();
  } catch (error) {
    console.error('Error deleting folder:', error);
    showToast('Failed to delete folder', 'error');
  }
}

// ============================================
// Multi-Select Mode
// ============================================

function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();

  const btn = document.getElementById('selectModeBtn');
  if (btn) btn.classList.toggle('active', selectMode);

  updateSelectUI();
  renderTranscripts();
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();

  const btn = document.getElementById('selectModeBtn');
  if (btn) btn.classList.remove('active');

  updateSelectUI();
  renderTranscripts();
}

function updateSelectUI() {
  const bar = document.getElementById('bulkActionsBar');
  const countEl = document.getElementById('bulkCount');

  if (bar) bar.style.display = selectMode ? 'flex' : 'none';
  if (countEl) countEl.textContent = `${selectedIds.size} selected`;

  // Update card selected state without full re-render
  document.querySelectorAll('.recording-item').forEach(item => {
    const id = item.dataset.id;
    const cb = item.querySelector('.select-checkbox input');
    if (selectedIds.has(id)) {
      item.classList.add('selected');
      if (cb) cb.checked = true;
    } else {
      item.classList.remove('selected');
      if (cb) cb.checked = false;
    }
  });
}

function bulkSelectAll() {
  if (!recordingsList) return;

  recordingsList.querySelectorAll('.recording-item').forEach(item => {
    selectedIds.add(item.dataset.id);
  });
  updateSelectUI();
}

function openBulkDeleteModal() {
  if (selectedIds.size === 0) {
    showToast('No recordings selected');
    return;
  }

  const msg = document.getElementById('bulkDeleteMessage');
  if (msg) msg.textContent = `This will permanently delete ${selectedIds.size} recording${selectedIds.size !== 1 ? 's' : ''}.`;

  const confirmInput = document.getElementById('bulkDeleteConfirmInput');
  const confirmBtn = document.getElementById('confirmBulkDelete');
  if (confirmInput) confirmInput.value = '';
  if (confirmBtn) confirmBtn.disabled = true;

  const modal = document.getElementById('bulkDeleteModal');
  if (modal) modal.style.display = 'flex';
}

function closeBulkDeleteModal() {
  const modal = document.getElementById('bulkDeleteModal');
  if (modal) modal.style.display = 'none';
}

async function confirmBulkDelete() {
  const ids = [...selectedIds];
  const count = ids.length;

  try {
    const results = await Promise.all(ids.map(id =>
      authFetch(`${config.apiUrl}/transcripts/${id}`, { method: 'DELETE' })
    ));

    const failed = results.filter(r => !r.ok).length;

    closeBulkDeleteModal();
    exitSelectMode();

    if (failed === 0) {
      showToast(`Deleted ${count} recording${count !== 1 ? 's' : ''}`);
    } else {
      showToast(`Deleted ${count - failed} of ${count} recordings`);
    }

    await loadTranscripts();
  } catch (error) {
    console.error('Error bulk deleting:', error);
    showToast('Failed to delete some recordings', 'error');
  }
}

// ============================================
// Folder Management Event Listeners
// ============================================

function setupFolderManagementListeners() {
  // Rename folder
  const renameFolderBtn = document.getElementById('renameFolderBtn');
  if (renameFolderBtn) renameFolderBtn.addEventListener('click', openRenameFolderModal);

  const closeRenameFolderBtn = document.getElementById('closeRenameFolder');
  if (closeRenameFolderBtn) closeRenameFolderBtn.addEventListener('click', closeRenameFolderModal);

  const cancelRenameFolderBtn = document.getElementById('cancelRenameFolder');
  if (cancelRenameFolderBtn) cancelRenameFolderBtn.addEventListener('click', closeRenameFolderModal);

  const confirmRenameFolderBtn = document.getElementById('confirmRenameFolder');
  if (confirmRenameFolderBtn) confirmRenameFolderBtn.addEventListener('click', confirmRenameFolder);

  // Allow Enter to confirm rename
  const renameFolderInput = document.getElementById('renameFolderInput');
  if (renameFolderInput) {
    renameFolderInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmRenameFolder();
    });
  }

  // Delete folder
  const deleteFolderBtn = document.getElementById('deleteFolderBtn');
  if (deleteFolderBtn) deleteFolderBtn.addEventListener('click', openDeleteFolderModal);

  const closeDeleteFolderBtn = document.getElementById('closeDeleteFolder');
  if (closeDeleteFolderBtn) closeDeleteFolderBtn.addEventListener('click', closeDeleteFolderModal);

  const cancelDeleteFolderBtn = document.getElementById('cancelDeleteFolder');
  if (cancelDeleteFolderBtn) cancelDeleteFolderBtn.addEventListener('click', closeDeleteFolderModal);

  const confirmDeleteFolderBtn = document.getElementById('confirmDeleteFolder');
  if (confirmDeleteFolderBtn) confirmDeleteFolderBtn.addEventListener('click', confirmDeleteFolder);

  // Delete folder confirm input
  const deleteFolderConfirmInput = document.getElementById('deleteFolderConfirmInput');
  if (deleteFolderConfirmInput) {
    deleteFolderConfirmInput.addEventListener('input', () => {
      const confirmBtn = document.getElementById('confirmDeleteFolder');
      if (confirmBtn) confirmBtn.disabled = deleteFolderConfirmInput.value !== 'DELETE';
    });
  }

  // Move to folder modal
  const closeMoveFolderBtn = document.getElementById('closeMoveFolder');
  if (closeMoveFolderBtn) closeMoveFolderBtn.addEventListener('click', closeMoveFolderModal);

  const cancelMoveFolderBtn = document.getElementById('cancelMoveFolder');
  if (cancelMoveFolderBtn) cancelMoveFolderBtn.addEventListener('click', closeMoveFolderModal);

  const confirmMoveFolderBtn = document.getElementById('confirmMoveFolder');
  if (confirmMoveFolderBtn) confirmMoveFolderBtn.addEventListener('click', confirmMoveFolder);

  // Series modal
  const closeSeriesModalBtn = document.getElementById('closeSeriesModal');
  if (closeSeriesModalBtn) closeSeriesModalBtn.addEventListener('click', closeSeriesModal);

  const cancelSeriesModalBtn = document.getElementById('cancelSeriesModal');
  if (cancelSeriesModalBtn) cancelSeriesModalBtn.addEventListener('click', closeSeriesModal);

  const confirmSeriesModalBtn = document.getElementById('confirmSeriesModal');
  if (confirmSeriesModalBtn) confirmSeriesModalBtn.addEventListener('click', confirmLinkSeries);

  // Delete recording confirm input
  const deleteConfirmInput = document.getElementById('deleteConfirmInput');
  if (deleteConfirmInput) {
    deleteConfirmInput.addEventListener('input', () => {
      const confirmBtn = document.getElementById('confirmDelete');
      if (confirmBtn) confirmBtn.disabled = deleteConfirmInput.value !== 'DELETE';
    });
  }

  // Empty disposable modal
  const closeEmptyDisposableBtn = document.getElementById('closeEmptyDisposable');
  if (closeEmptyDisposableBtn) closeEmptyDisposableBtn.addEventListener('click', closeEmptyDisposableModal);

  const cancelEmptyDisposableBtn = document.getElementById('cancelEmptyDisposable');
  if (cancelEmptyDisposableBtn) cancelEmptyDisposableBtn.addEventListener('click', closeEmptyDisposableModal);

  const confirmEmptyDisposableBtn = document.getElementById('confirmEmptyDisposable');
  if (confirmEmptyDisposableBtn) confirmEmptyDisposableBtn.addEventListener('click', confirmEmptyDisposable);

  const emptyDisposableConfirmInput = document.getElementById('emptyDisposableConfirmInput');
  if (emptyDisposableConfirmInput) {
    emptyDisposableConfirmInput.addEventListener('input', () => {
      const confirmBtn = document.getElementById('confirmEmptyDisposable');
      if (confirmBtn) confirmBtn.disabled = emptyDisposableConfirmInput.value !== 'DELETE';
    });
  }

  // Bulk delete modal
  const closeBulkDeleteBtn = document.getElementById('closeBulkDelete');
  if (closeBulkDeleteBtn) closeBulkDeleteBtn.addEventListener('click', closeBulkDeleteModal);

  const cancelBulkDeleteBtn = document.getElementById('cancelBulkDelete');
  if (cancelBulkDeleteBtn) cancelBulkDeleteBtn.addEventListener('click', closeBulkDeleteModal);

  const confirmBulkDeleteBtn = document.getElementById('confirmBulkDelete');
  if (confirmBulkDeleteBtn) confirmBulkDeleteBtn.addEventListener('click', confirmBulkDelete);

  const bulkDeleteConfirmInput = document.getElementById('bulkDeleteConfirmInput');
  if (bulkDeleteConfirmInput) {
    bulkDeleteConfirmInput.addEventListener('input', () => {
      const confirmBtn = document.getElementById('confirmBulkDelete');
      if (confirmBtn) confirmBtn.disabled = bulkDeleteConfirmInput.value !== 'DELETE';
    });
  }
}

// ============================================
// Utility Functions
// ============================================

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

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

function truncateText(text, maxLength) {
  if (!text) return 'No transcription';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

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
