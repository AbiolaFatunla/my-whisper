/**
 * BA Admin Dashboard Controller
 * Handles admin authentication, session browsing, and access code management
 */

// Admin email
const ADMIN_EMAIL = 'ftnlabiola@gmail.com';

// DOM Elements
const authRequired = document.getElementById('authRequired');
const mainContent = document.getElementById('mainContent');
const signInBtn = document.getElementById('signInBtn');
const adminUser = document.getElementById('adminUser');
const adminAvatar = document.getElementById('adminAvatar');
const adminEmail = document.getElementById('adminEmail');

// Tab Elements
const tabs = document.querySelectorAll('.ba-admin-tab');
const sessionsPanel = document.getElementById('sessionsPanel');
const codesPanel = document.getElementById('codesPanel');

// Session Elements
const sessionsLoading = document.getElementById('sessionsLoading');
const sessionsList = document.getElementById('sessionsList');
const sessionsEmpty = document.getElementById('sessionsEmpty');
const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');

// Access Code Elements
const codesLoading = document.getElementById('codesLoading');
const codesList = document.getElementById('codesList');
const codesEmpty = document.getElementById('codesEmpty');
const newCodeBtn = document.getElementById('newCodeBtn');
const createCodeForm = document.getElementById('createCodeForm');
const codeInput = document.getElementById('codeInput');
const clientNameInput = document.getElementById('clientNameInput');
const cancelCodeBtn = document.getElementById('cancelCodeBtn');
const saveCodeBtn = document.getElementById('saveCodeBtn');

// Modal Elements
const sessionModal = document.getElementById('sessionModal');
const modalSessionTitle = document.getElementById('modalSessionTitle');
const modalConversation = document.getElementById('modalConversation');
const modalDocs = document.getElementById('modalDocs');
const closeSessionModal = document.getElementById('closeSessionModal');

// Toast
const toast = document.getElementById('toast');

// State
let sessions = [];
let accessCodes = [];

/**
 * Initialize the admin dashboard
 */
async function init() {
    initTheme();
    await initAuth();
    setupEventListeners();
}

/**
 * Initialize theme from localStorage
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.dataset.theme = savedTheme;
}

/**
 * Initialize authentication
 */
async function initAuth() {
    try {
        await auth.init();
        checkAdminAccess();

        auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            checkAdminAccess();
        });
    } catch (error) {
        console.error('Auth init error:', error);
        showAuthRequired();
    }
}

/**
 * Check if user has admin access
 */
function checkAdminAccess() {
    const user = auth.getUser();

    if (user && user.email === ADMIN_EMAIL) {
        showMainContent(user);
        loadData();
    } else if (user) {
        // Signed in but not admin
        showAuthRequired();
        showToast('Admin access is restricted to ' + ADMIN_EMAIL);
    } else {
        showAuthRequired();
    }
}

/**
 * Show auth required state
 */
function showAuthRequired() {
    authRequired.style.display = 'flex';
    mainContent.style.display = 'none';
    adminUser.style.display = 'none';
}

/**
 * Show main content (authenticated admin)
 */
function showMainContent(user) {
    authRequired.style.display = 'none';
    mainContent.style.display = 'block';
    adminUser.style.display = 'flex';

    if (user.user_metadata?.avatar_url) {
        adminAvatar.src = user.user_metadata.avatar_url;
    }
    adminEmail.textContent = user.email;
}

/**
 * Load all data (sessions and access codes)
 * Load access codes first so client names are available when rendering sessions
 */
async function loadData() {
    await loadAccessCodes();
    await loadSessions();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Sign in
    signInBtn.addEventListener('click', handleSignIn);

    // Tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Sessions
    refreshSessionsBtn.addEventListener('click', loadSessions);

    // Access Codes
    newCodeBtn.addEventListener('click', showCreateForm);
    cancelCodeBtn.addEventListener('click', hideCreateForm);
    saveCodeBtn.addEventListener('click', createAccessCode);

    // Modal
    closeSessionModal.addEventListener('click', closeModal);
    sessionModal.addEventListener('click', (e) => {
        if (e.target === sessionModal) closeModal();
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sessionModal.classList.contains('active')) {
            closeModal();
        }
    });
}

/**
 * Handle sign in
 */
async function handleSignIn() {
    try {
        await auth.signInWithGoogle();
    } catch (error) {
        console.error('Sign in error:', error);
        showToast('Sign in failed. Please try again.');
    }
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
    // Update tab buttons
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update panels
    sessionsPanel.classList.toggle('active', tabName === 'sessions');
    codesPanel.classList.toggle('active', tabName === 'codes');
}

/**
 * Load sessions from API
 */
async function loadSessions() {
    sessionsLoading.style.display = 'flex';
    sessionsList.innerHTML = '';
    sessionsEmpty.style.display = 'none';

    try {
        const response = await authFetch(`${config.apiUrl}/ba/admin/sessions`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load sessions');
        }

        sessions = data.sessions || [];
        renderSessions();
    } catch (error) {
        console.error('Error loading sessions:', error);
        showToast('Failed to load sessions');
        sessionsEmpty.style.display = 'block';
    } finally {
        sessionsLoading.style.display = 'none';
    }
}

/**
 * Get client name from access code
 */
function getClientNameForCode(code) {
    const accessCode = accessCodes.find(ac => ac.code === code);
    return accessCode?.client_name || null;
}

/**
 * Render sessions list
 */
function renderSessions() {
    if (sessions.length === 0) {
        sessionsEmpty.style.display = 'block';
        return;
    }

    sessionsList.innerHTML = sessions.map(session => {
        const clientName = getClientNameForCode(session.access_code);
        const projectName = session.project_name;
        // Show client name first (your label), then project name (their label) if different
        let displayName = clientName || 'Unknown Client';
        if (projectName && projectName !== clientName) {
            displayName += ` - ${projectName}`;
        }

        const status = session.status || 'started';
        const code = session.access_code;
        const date = new Date(session.updated_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        // Count covered sections
        const coverage = session.coverage_status || {};
        const coveredCount = Object.values(coverage).filter(Boolean).length;

        return `
            <div class="ba-card ba-session-card" data-id="${session.id}" data-code="${code}">
                <div class="ba-session-info">
                    <div class="ba-session-name">${escapeHtml(displayName)}</div>
                    <div class="ba-session-meta">
                        <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                            ${escapeHtml(code)}
                        </span>
                        <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            ${date}
                        </span>
                        <span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            ${coveredCount}/6 sections
                        </span>
                    </div>
                </div>
                <span class="ba-session-status ${status}">
                    <span class="ba-session-status-dot"></span>
                    ${status.replace('_', ' ')}
                </span>
                <div class="ba-session-actions">
                    <button class="ba-btn ba-btn-secondary ba-btn-sm" onclick="viewSession('${session.id}', '${code}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        View
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * View session details
 */
async function viewSession(sessionId, accessCode) {
    modalSessionTitle.textContent = 'Loading...';
    modalConversation.innerHTML = '<div class="ba-loading"><div class="ba-spinner"></div></div>';
    modalDocs.innerHTML = '<p style="color: var(--text-secondary);">Loading...</p>';
    sessionModal.classList.add('active');

    try {
        const response = await authFetch(`${config.apiUrl}/ba/session?code=${encodeURIComponent(accessCode)}`);
        const data = await response.json();

        if (!response.ok || !data.session) {
            throw new Error('Failed to load session details');
        }

        const session = data.session;
        modalSessionTitle.textContent = session.project_name || 'Untitled Session';

        // Render conversation
        const conversation = session.conversation_history || [];
        if (conversation.length === 0) {
            modalConversation.innerHTML = '<p style="color: var(--text-secondary);">No messages yet</p>';
        } else {
            modalConversation.innerHTML = conversation.map(msg => {
                const audioHtml = msg.audio_url ? `
                    <div class="ba-detail-message-audio">
                        <audio controls src="${getAudioUrl(msg.audio_url)}"></audio>
                    </div>
                ` : '';

                return `
                    <div class="ba-detail-message ${msg.role}">
                        <div>${escapeHtml(msg.content)}</div>
                        ${audioHtml}
                    </div>
                `;
            }).join('');
        }

        // Render generated docs
        const docs = session.generated_docs;
        if (docs && docs.combined) {
            modalDocs.innerHTML = markdownToHtml(docs.combined);
        } else {
            modalDocs.innerHTML = '<p style="color: var(--text-secondary);">Documents not yet generated</p>';
        }
    } catch (error) {
        console.error('Error loading session:', error);
        modalConversation.innerHTML = '<p style="color: var(--text-secondary);">Failed to load session</p>';
        modalDocs.innerHTML = '';
    }
}

/**
 * Get audio URL (convert S3 URL to proxy URL)
 */
function getAudioUrl(url) {
    if (url.startsWith('s3://')) {
        const key = url.replace('s3://abiola-whisper-audio/', '');
        return `${config.apiUrl}/audio-proxy?key=${encodeURIComponent(key)}`;
    }
    return url;
}

/**
 * Close session modal
 */
function closeModal() {
    sessionModal.classList.remove('active');
}

/**
 * Load access codes from API
 */
async function loadAccessCodes() {
    codesLoading.style.display = 'flex';
    codesList.innerHTML = '';
    codesEmpty.style.display = 'none';

    try {
        const response = await authFetch(`${config.apiUrl}/ba/admin/access-codes`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load access codes');
        }

        accessCodes = data.accessCodes || [];
        renderAccessCodes();
    } catch (error) {
        console.error('Error loading access codes:', error);
        showToast('Failed to load access codes');
        codesEmpty.style.display = 'block';
    } finally {
        codesLoading.style.display = 'none';
    }
}

/**
 * Render access codes list
 */
function renderAccessCodes() {
    if (accessCodes.length === 0) {
        codesEmpty.style.display = 'block';
        return;
    }

    codesList.innerHTML = accessCodes.map(code => {
        const isActive = code.is_active !== false;
        const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
        const statusClass = isExpired ? 'expired' : (isActive ? 'active' : 'expired');
        const statusText = isExpired ? 'Expired' : (isActive ? 'Active' : 'Revoked');

        const date = new Date(code.created_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        return `
            <div class="ba-card ba-code-card" data-code="${code.code}">
                <div class="ba-code-info">
                    <div class="ba-code-value">${escapeHtml(code.code)}</div>
                    <div class="ba-code-client">${escapeHtml(code.client_name)}</div>
                    <div class="ba-code-meta">Created ${date}</div>
                </div>
                <span class="ba-code-status ${statusClass}">${statusText}</span>
                <div class="ba-session-actions">
                    <button class="ba-btn ba-btn-secondary ba-btn-sm" onclick="copyCode('${code.code}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                    </button>
                    ${isActive && !isExpired ? `
                        <button class="ba-btn ba-btn-danger ba-btn-sm" onclick="revokeCode('${code.code}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Revoke
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show create code form
 */
function showCreateForm() {
    createCodeForm.classList.add('active');
    codeInput.value = '';
    clientNameInput.value = '';
    codeInput.focus();
}

/**
 * Hide create code form
 */
function hideCreateForm() {
    createCodeForm.classList.remove('active');
}

/**
 * Create new access code
 */
async function createAccessCode() {
    const code = codeInput.value.trim().toLowerCase();
    const clientName = clientNameInput.value.trim();

    if (!code || !clientName) {
        showToast('Please fill in all fields');
        return;
    }

    if (!/^[a-z0-9-]+$/.test(code)) {
        showToast('Code must be lowercase letters, numbers, and hyphens only');
        return;
    }

    saveCodeBtn.disabled = true;
    saveCodeBtn.textContent = 'Creating...';

    try {
        const response = await authFetch(`${config.apiUrl}/ba/admin/access-codes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, clientName })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create access code');
        }

        showToast('Access code created successfully');
        hideCreateForm();
        loadAccessCodes();
    } catch (error) {
        console.error('Error creating access code:', error);
        showToast(error.message || 'Failed to create access code');
    } finally {
        saveCodeBtn.disabled = false;
        saveCodeBtn.textContent = 'Create Code';
    }
}

/**
 * Copy access code to clipboard
 */
function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        showToast('Access code copied to clipboard');
    }).catch(() => {
        showToast('Failed to copy code');
    });
}

/**
 * Revoke access code
 */
async function revokeCode(code) {
    if (!confirm(`Are you sure you want to revoke the access code "${code}"? This cannot be undone.`)) {
        return;
    }

    try {
        const response = await authFetch(`${config.apiUrl}/ba/admin/access-codes/${encodeURIComponent(code)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to revoke access code');
        }

        showToast('Access code revoked');
        loadAccessCodes();
    } catch (error) {
        console.error('Error revoking access code:', error);
        showToast(error.message || 'Failed to revoke access code');
    }
}

/**
 * Convert markdown to HTML (simple implementation)
 */
function markdownToHtml(markdown) {
    if (!markdown) return '';

    return markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Unordered lists
        .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
        // Wrap consecutive list items
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        // Line breaks
        .replace(/\n/g, '<br>')
        // Clean up
        .replace(/<br><h/g, '<h')
        .replace(/<\/h([123])><br>/g, '</h$1>')
        .replace(/<br><ul>/g, '<ul>')
        .replace(/<\/ul><br>/g, '</ul>');
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

/**
 * Show toast notification
 */
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Expose functions for inline onclick handlers
window.viewSession = viewSession;
window.copyCode = copyCode;
window.revokeCode = revokeCode;
