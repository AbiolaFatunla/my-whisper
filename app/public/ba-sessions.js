/**
 * BA Sessions Page - User's session list
 */

// DOM Elements
const loadingState = document.getElementById('loadingState');
const authRequiredState = document.getElementById('authRequiredState');
const emptyState = document.getElementById('emptyState');
const sessionsGrid = document.getElementById('sessionsGrid');
const themeToggle = document.getElementById('themeToggle');
const userMenu = document.getElementById('userMenu');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const signOutBtn = document.getElementById('signOutBtn');
const toast = document.getElementById('toast');

/**
 * Initialize page
 */
async function init() {
  initTheme();

  try {
    await auth.init();

    const user = auth.getUser();
    if (!user) {
      showAuthRequired();
      return;
    }

    updateUserUI(user);
    await loadSessions();

    auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        window.location.href = 'index.html';
      }
    });
  } catch (error) {
    console.error('Init error:', error);
    showAuthRequired();
  }

  setupEventListeners();
}

/**
 * Initialize theme
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
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
 * Update user UI
 */
function updateUserUI(user) {
  if (userMenu) userMenu.style.display = 'flex';
  if (userAvatar) {
    userAvatar.src = user.user_metadata?.avatar_url || '';
    userAvatar.style.display = user.user_metadata?.avatar_url ? 'block' : 'none';
  }
  if (userName) {
    userName.textContent = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', handleSignOut);
  }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Sign out failed:', error);
    showToast('Sign out failed');
  }
}

/**
 * Load user's BA sessions
 */
async function loadSessions() {
  showLoading();

  try {
    const response = await auth.fetchWithAuth(`${API_BASE_URL}/ba/user/sessions`);

    if (!response.ok) {
      throw new Error('Failed to load sessions');
    }

    const data = await response.json();
    const sessions = data.sessions || [];

    if (sessions.length === 0) {
      showEmpty();
      return;
    }

    renderSessions(sessions);
  } catch (error) {
    console.error('Error loading sessions:', error);
    showEmpty();
  }
}

/**
 * Render sessions list
 */
function renderSessions(sessions) {
  hideAllStates();
  sessionsGrid.style.display = 'grid';

  sessionsGrid.innerHTML = sessions.map(session => {
    const statusClass = session.status === 'complete' ? 'complete' : 'started';
    const statusText = session.status === 'complete' ? 'Complete' : 'In Progress';
    const date = new Date(session.updated_at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return `
      <a href="ba-chat.html?session=${session.id}" class="session-card">
        <div class="session-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <div class="session-details">
          <div class="session-name">${escapeHtml(session.project_name)}</div>
          <div class="session-meta">
            <span class="session-status ${statusClass}">${statusText}</span>
            <span>Updated ${date}</span>
          </div>
        </div>
        ${session.unread_notes > 0 ? `
          <div class="session-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            ${session.unread_notes} new
          </div>
        ` : ''}
        <div class="session-arrow">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * Show loading state
 */
function showLoading() {
  hideAllStates();
  loadingState.style.display = 'flex';
}

/**
 * Show auth required state
 */
function showAuthRequired() {
  hideAllStates();
  authRequiredState.style.display = 'flex';
}

/**
 * Show empty state
 */
function showEmpty() {
  hideAllStates();
  emptyState.style.display = 'flex';
}

/**
 * Hide all states
 */
function hideAllStates() {
  loadingState.style.display = 'none';
  authRequiredState.style.display = 'none';
  emptyState.style.display = 'none';
  sessionsGrid.style.display = 'none';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show toast notification
 */
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
