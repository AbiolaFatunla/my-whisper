/**
 * BA (Business Analyst) Access Gate Controller
 * Handles access code validation and session management
 */

class BAController {
  constructor() {
    // Storage key for access code
    this.STORAGE_KEY = 'ba_access_code';

    // DOM elements
    this.gateSection = document.getElementById('baGate');
    this.welcomeSection = document.getElementById('baWelcome');
    this.accessCodeInput = document.getElementById('accessCodeInput');
    this.continueBtn = document.getElementById('continueBtn');
    this.errorMessage = document.getElementById('errorMessage');
    this.clientNameSpan = document.getElementById('clientName');
    this.startBtn = document.getElementById('startBtn');
    this.resumeSection = document.getElementById('resumeSection');
    this.resumeBtn = document.getElementById('resumeBtn');
    this.projectNameSpan = document.getElementById('projectName');
    this.themeToggle = document.getElementById('themeToggle');

    // State
    this.accessCode = null;
    this.clientName = null;
    this.existingSession = null;
  }

  async init() {
    this.setupEventListeners();
    this.initTheme();

    // Check for stored access code
    const storedCode = localStorage.getItem(this.STORAGE_KEY);
    if (storedCode) {
      // Validate stored code
      const result = await this.validateCode(storedCode);
      if (result.valid) {
        this.accessCode = storedCode;
        this.clientName = result.clientName;
        this.existingSession = result.existingSession;
        this.showWelcome();
      } else {
        // Stored code no longer valid
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  setupEventListeners() {
    // Continue button
    this.continueBtn.addEventListener('click', () => this.handleContinue());

    // Enter key on input
    this.accessCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleContinue();
      }
    });

    // Clear error on input
    this.accessCodeInput.addEventListener('input', () => {
      this.hideError();
    });

    // Start new session
    this.startBtn.addEventListener('click', () => this.handleStart());

    // Resume session
    this.resumeBtn.addEventListener('click', () => this.handleResume());

    // Theme toggle
    this.themeToggle.addEventListener('click', () => this.toggleTheme());
  }

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  async handleContinue() {
    const code = this.accessCodeInput.value.trim().toLowerCase();

    if (!code) {
      this.showError('Please enter an access code');
      return;
    }

    this.setLoading(true);
    this.hideError();

    try {
      const result = await this.validateCode(code);

      if (result.valid) {
        this.accessCode = code;
        this.clientName = result.clientName;
        this.existingSession = result.existingSession;

        // Store valid code
        localStorage.setItem(this.STORAGE_KEY, code);

        this.showWelcome();
      } else {
        this.showError(result.message || 'Invalid access code');
      }
    } catch (error) {
      console.error('Validation error:', error);
      this.showError('Failed to validate code. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }

  async validateCode(code) {
    const response = await fetch(`${config.apiUrl}/ba/validate-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    return response.json();
  }

  showWelcome() {
    // Update client name
    this.clientNameSpan.textContent = this.clientName;

    // Show resume option if existing session
    if (this.existingSession && this.existingSession.status !== 'complete') {
      this.resumeSection.style.display = 'block';
      this.projectNameSpan.textContent = this.existingSession.project_name || 'Untitled Project';
    } else {
      this.resumeSection.style.display = 'none';
    }

    // Transition to welcome screen
    this.gateSection.classList.add('hidden');
    this.welcomeSection.classList.add('visible');
  }

  handleStart() {
    // Create new session and redirect to chat
    // For now, store that we want a new session and redirect
    sessionStorage.setItem('ba_new_session', 'true');
    sessionStorage.setItem('ba_access_code', this.accessCode);
    window.location.href = 'ba-chat.html';
  }

  handleResume() {
    // Resume existing session
    sessionStorage.setItem('ba_session_id', this.existingSession.id);
    sessionStorage.setItem('ba_access_code', this.accessCode);
    window.location.href = 'ba-chat.html';
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.add('visible');
  }

  hideError() {
    this.errorMessage.classList.remove('visible');
  }

  setLoading(loading) {
    this.continueBtn.disabled = loading;
    this.continueBtn.textContent = loading ? 'Checking...' : 'Continue';
  }
}

// Initialize
const baController = new BAController();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => baController.init());
} else {
  baController.init();
}

window.baController = baController;
