/**
 * BA Chat Controller
 * Handles the conversation interface for the AI Business Analyst
 */

class BAChatController {
  constructor() {
    // Session state
    this.accessCode = null;
    this.sessionId = null;
    this.session = null;
    this.conversationHistory = [];
    this.coverageStatus = {
      vision: false,
      users: false,
      features: false,
      rules: false,
      data: false,
      priority: false
    };

    // Recording state
    this.recorder = new AudioRecorder();
    this.uploader = new S3Uploader();
    this.isRecording = false;
    this.recordingBlob = null;
    this.recordingDuration = 0;
    this.timerInterval = null;
    this.audioElement = null;

    // Input mode: 'voice' or 'text'
    this.inputMode = 'voice';

    // DOM elements
    this.messagesContainer = document.getElementById('messagesContainer');
    this.headerTitle = document.getElementById('headerTitle');
    this.progressBar = document.getElementById('progressBar');
    this.loadingIndicator = document.getElementById('loadingIndicator');
    this.toast = document.getElementById('toast');

    // Recorder elements
    this.recorderSection = document.getElementById('recorderSection');
    this.recordBtn = document.getElementById('recordBtn');
    this.recordHint = document.getElementById('recordHint');
    this.recordTimer = document.getElementById('recordTimer');
    this.waveformContainer = document.getElementById('waveformContainer');
    this.waveformCanvas = document.getElementById('waveformCanvas');

    // Review elements
    this.reviewSection = document.getElementById('reviewSection');
    this.reviewTextarea = document.getElementById('reviewTextarea');
    this.reviewDuration = document.getElementById('reviewDuration');
    this.playReviewBtn = document.getElementById('playReviewBtn');
    this.discardBtn = document.getElementById('discardBtn');
    this.sendBtn = document.getElementById('sendBtn');

    // Text input elements
    this.textInputSection = document.getElementById('textInputSection');
    this.textInput = document.getElementById('textInput');
    this.textSendBtn = document.getElementById('textSendBtn');
    this.typeToggleBtn = document.getElementById('typeToggleBtn');
    this.recordToggleBtn = document.getElementById('recordToggleBtn');

    // Other buttons
    this.backBtn = document.getElementById('backBtn');
    this.themeToggle = document.getElementById('themeToggle');
    this.generateBtn = document.getElementById('generateBtn');

    // Section modal elements
    this.sectionModal = document.getElementById('sectionModal');
    this.sectionModalTitle = document.getElementById('sectionModalTitle');
    this.sectionModalContent = document.getElementById('sectionModalContent');
    this.closeSectionModal = document.getElementById('closeSectionModal');
    this.addMoreBtn = document.getElementById('addMoreBtn');
    this.looksGoodBtn = document.getElementById('looksGoodBtn');
    this.currentSection = null;

    // Review modal elements
    this.reviewModal = document.getElementById('reviewModal');
    this.reviewSections = document.getElementById('reviewSections');
    this.closeReviewModal = document.getElementById('closeReviewModal');
    this.backToConversationBtn = document.getElementById('backToConversationBtn');
    this.generateDocsBtn = document.getElementById('generateDocsBtn');

    // Output view elements
    this.outputView = document.getElementById('outputView');
    this.outputTabs = document.getElementById('outputTabs');
    this.outputContent = document.getElementById('outputContent');
    this.closeOutputView = document.getElementById('closeOutputView');
    this.copyDocsBtn = document.getElementById('copyDocsBtn');
    this.downloadDocsBtn = document.getElementById('downloadDocsBtn');
    this.newSessionBtn = document.getElementById('newSessionBtn');

    // Generated documents storage
    this.generatedDocs = null;
    this.currentTab = 'all';

    // Section labels
    this.sectionLabels = {
      vision: 'Vision & Problem',
      users: 'Users & Personas',
      features: 'Features & Workflows',
      rules: 'Business Rules',
      data: 'Data & Entities',
      priority: 'Priority & Scope'
    };
  }

  async init() {
    // Get session info from sessionStorage
    this.accessCode = sessionStorage.getItem('ba_access_code');
    const isNewSession = sessionStorage.getItem('ba_new_session') === 'true';
    const existingSessionId = sessionStorage.getItem('ba_session_id');

    if (!this.accessCode) {
      // No access code, redirect to gate
      window.location.href = 'ba.html';
      return;
    }

    // Clear session storage flags
    sessionStorage.removeItem('ba_new_session');
    sessionStorage.removeItem('ba_session_id');

    // Setup event listeners
    this.setupEventListeners();
    this.initTheme();

    // Load or create session
    if (isNewSession) {
      await this.createSession();
    } else if (existingSessionId) {
      this.sessionId = existingSessionId;
      await this.loadSession();
    } else {
      // Try to load existing session
      await this.loadSession();
      if (!this.session) {
        await this.createSession();
      }
    }

    // Set max duration callback
    this.recorder.onMaxDurationReached = () => {
      this.showToast('Maximum recording time reached (15 minutes)');
      this.stopRecording();
    };
  }

  setupEventListeners() {
    // Back button
    this.backBtn.addEventListener('click', () => {
      window.location.href = 'ba.html';
    });

    // Theme toggle
    this.themeToggle.addEventListener('click', () => this.toggleTheme());

    // Record button
    this.recordBtn.addEventListener('click', () => this.toggleRecording());

    // Type toggle
    this.typeToggleBtn.addEventListener('click', () => this.switchToTextInput());

    // Review actions
    this.playReviewBtn.addEventListener('click', () => this.togglePlayback());
    this.discardBtn.addEventListener('click', () => this.discardRecording());
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // Text input
    this.textInput.addEventListener('input', () => this.autoResizeTextarea());
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });
    this.textSendBtn.addEventListener('click', () => this.sendTextMessage());

    // Record toggle (switch back to voice from text)
    this.recordToggleBtn.addEventListener('click', () => this.switchToVoiceInput());

    // Progress bar clicks
    this.progressBar.querySelectorAll('.ba-progress-item').forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (this.coverageStatus[section]) {
          this.showSectionReview(section);
        }
      });
    });

    // Generate button
    this.generateBtn.addEventListener('click', () => this.showPreGenerationReview());

    // Section modal
    this.closeSectionModal.addEventListener('click', () => this.closeSectionModalFn());
    this.looksGoodBtn.addEventListener('click', () => this.closeSectionModalFn());
    this.addMoreBtn.addEventListener('click', () => this.addMoreToSection());
    this.sectionModal.addEventListener('click', (e) => {
      if (e.target === this.sectionModal) this.closeSectionModalFn();
    });

    // Review modal
    this.closeReviewModal.addEventListener('click', () => this.closeReviewModalFn());
    this.backToConversationBtn.addEventListener('click', () => this.closeReviewModalFn());
    this.generateDocsBtn.addEventListener('click', () => this.generateDocuments());
    this.reviewModal.addEventListener('click', (e) => {
      if (e.target === this.reviewModal) this.closeReviewModalFn();
    });

    // Output view handlers
    if (this.closeOutputView) {
      this.closeOutputView.addEventListener('click', () => this.hideOutputView());
    }
    if (this.outputTabs) {
      this.outputTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.ba-output-tab');
        if (tab) {
          this.switchTab(tab.dataset.tab);
        }
      });
    }
    if (this.copyDocsBtn) {
      this.copyDocsBtn.addEventListener('click', () => this.copyDocuments());
    }
    if (this.downloadDocsBtn) {
      this.downloadDocsBtn.addEventListener('click', () => this.downloadDocuments());
    }
    if (this.newSessionBtn) {
      this.newSessionBtn.addEventListener('click', () => this.startNewSession());
    }
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

  // Session management
  async createSession() {
    try {
      const response = await fetch(`${config.apiUrl}/ba/session`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: this.accessCode })
      });

      const data = await response.json();
      if (data.session) {
        this.session = data.session;
        this.sessionId = data.session.id;
        this.conversationHistory = data.session.conversation_history || [];
        this.coverageStatus = data.session.coverage_status || this.coverageStatus;
        this.updateUI();
        this.addInitialMessage();
      }
    } catch (error) {
      console.error('Error creating session:', error);
      this.showToast('Failed to create session');
    }
  }

  async loadSession() {
    try {
      const response = await fetch(`${config.apiUrl}/ba/session?code=${this.accessCode}`);
      const data = await response.json();

      if (data.session) {
        this.session = data.session;
        this.sessionId = data.session.id;
        this.conversationHistory = data.session.conversation_history || [];
        this.coverageStatus = data.session.coverage_status || this.coverageStatus;
        this.updateUI();
        this.renderMessages();

        // Add initial message if conversation is empty
        if (this.conversationHistory.length === 0) {
          this.addInitialMessage();
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  }

  async saveSession() {
    try {
      await fetch(`${config.apiUrl}/ba/session`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCode: this.accessCode,
          sessionId: this.sessionId,
          conversationHistory: this.conversationHistory,
          coverageStatus: this.coverageStatus,
          status: 'in_progress'
        })
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  updateUI() {
    // Update header title
    if (this.session?.project_name) {
      this.headerTitle.textContent = this.session.project_name;
    }

    // Update progress bar
    Object.entries(this.coverageStatus).forEach(([section, covered]) => {
      const item = this.progressBar.querySelector(`[data-section="${section}"]`);
      if (item) {
        item.classList.toggle('covered', covered);
      }
    });

    // Check if ready to generate
    this.checkReadyToGenerate();
  }

  addInitialMessage() {
    const initialMessage = {
      role: 'assistant',
      content: "Hi! I'm here to help document your project requirements. Tell me about what you want to build - who's it for, what problem does it solve?",
      timestamp: new Date().toISOString()
    };

    this.conversationHistory.push(initialMessage);
    this.renderMessage(initialMessage);
    this.saveSession();
  }

  renderMessages() {
    this.messagesContainer.innerHTML = '';
    this.conversationHistory.forEach(msg => this.renderMessage(msg));
    this.scrollToBottom();
  }

  renderMessage(message) {
    const div = document.createElement('div');
    div.className = `ba-message ${message.role}`;

    let html = `<div class="ba-message-content">${this.escapeHtml(message.content)}</div>`;

    // Add audio indicator for user messages with audio
    if (message.role === 'user' && message.audio_url) {
      html += `
        <div class="ba-message-audio">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          </svg>
          <span>Voice message</span>
        </div>
      `;
    }

    // Add timestamp
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `<div class="ba-message-time">${time}</div>`;

    div.innerHTML = html;
    this.messagesContainer.appendChild(div);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  // Recording
  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      await this.recorder.startRecording();
      this.isRecording = true;

      // Update UI
      this.recordBtn.classList.add('recording');
      this.recordBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>
      `;
      this.recordHint.textContent = 'Tap to stop';
      this.waveformContainer.style.display = 'block';
      this.recordTimer.style.display = 'block';

      // Start visualization
      this.recorder.drawVisualization(this.waveformCanvas);

      // Start timer
      this.recordingDuration = 0;
      this.updateTimerDisplay();
      this.timerInterval = setInterval(() => {
        this.recordingDuration += 1000;
        this.updateTimerDisplay();
      }, 1000);

    } catch (error) {
      console.error('Recording error:', error);
      this.showToast(error.message || 'Failed to start recording');
    }
  }

  async stopRecording() {
    if (!this.isRecording) return;

    try {
      const result = await this.recorder.stopRecording();
      this.isRecording = false;
      this.recordingBlob = result.blob;
      this.recordingDuration = result.duration;

      // Clear timer
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      // Reset record button
      this.recordBtn.classList.remove('recording');
      this.recordBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      `;

      // Transcribe and show review
      await this.transcribeRecording();

    } catch (error) {
      console.error('Stop recording error:', error);
      this.showToast('Failed to stop recording');
      this.resetRecorderUI();
    }
  }

  async transcribeRecording() {
    this.showLoading(true, 'Transcribing...');

    try {
      // Upload to S3
      const filename = AudioRecorder.generateFilename(
        this.recorder.getFileExtension(this.recordingBlob.type)
      );

      const uploadResult = await this.uploader.uploadRecording(
        this.recordingBlob,
        filename,
        null // No progress callback for now
      );

      // Transcribe
      const response = await fetch(`${config.apiUrl}/ba/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: uploadResult.shareableUrl })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Store audio URL for the message
      this.currentAudioUrl = uploadResult.shareableUrl;

      // Show review
      this.showReview(data.transcription);

    } catch (error) {
      console.error('Transcription error:', error);
      this.showToast('Failed to transcribe. Please try again.');
      this.resetRecorderUI();
    } finally {
      this.showLoading(false);
    }
  }

  showReview(transcription) {
    // Hide recorder, show review
    this.recorderSection.style.display = 'none';
    this.reviewSection.classList.add('visible');

    // Set review content
    this.reviewTextarea.value = transcription;
    this.reviewDuration.textContent = AudioRecorder.formatTime(this.recordingDuration);

    // Create audio element for playback
    if (this.recordingBlob) {
      const url = URL.createObjectURL(this.recordingBlob);
      this.audioElement = new Audio(url);
    }
  }

  togglePlayback() {
    if (!this.audioElement) return;

    if (this.audioElement.paused) {
      this.audioElement.play();
      this.playReviewBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
      `;
    } else {
      this.audioElement.pause();
      this.playReviewBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
    }

    this.audioElement.onended = () => {
      this.playReviewBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
    };
  }

  discardRecording() {
    this.recordingBlob = null;
    this.currentAudioUrl = null;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    this.resetRecorderUI();
  }

  async sendMessage() {
    const content = this.reviewTextarea.value.trim();
    if (!content) {
      this.showToast('Please enter a message');
      return;
    }

    // Create message
    const message = {
      role: 'user',
      content: content,
      audio_url: this.currentAudioUrl || null,
      timestamp: new Date().toISOString()
    };

    // Add to conversation
    this.conversationHistory.push(message);
    this.renderMessage(message);

    // Reset UI
    this.discardRecording();

    // Save session
    await this.saveSession();

    // Get AI response
    await this.getAIResponse(content);
  }

  async getAIResponse(userMessage) {
    this.showLoading(true);

    try {
      const response = await fetch(`${config.apiUrl}/ba/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          message: userMessage,
          conversationHistory: this.conversationHistory
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Create assistant message
      const assistantMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
      };

      // Add to conversation
      this.conversationHistory.push(assistantMessage);
      this.renderMessage(assistantMessage);

      // Update coverage if provided
      if (data.coverage) {
        this.updateCoverage(data.coverage);
      }

      // Save session
      await this.saveSession();

    } catch (error) {
      console.error('AI response error:', error);
      this.showToast('Failed to get response. Please try again.');
    } finally {
      this.showLoading(false);
    }
  }

  updateCoverage(newCoverage) {
    // Merge new coverage with existing (only update to true, never back to false)
    for (const [section, covered] of Object.entries(newCoverage)) {
      if (covered && this.coverageStatus.hasOwnProperty(section)) {
        this.coverageStatus[section] = true;
      }
    }
    this.updateUI();
    this.checkReadyToGenerate();
  }

  resetRecorderUI() {
    this.reviewSection.classList.remove('visible');
    this.recorderSection.style.display = 'flex';
    this.waveformContainer.style.display = 'none';
    this.recordTimer.style.display = 'none';
    this.recordHint.textContent = 'Tap to record';
    this.reviewTextarea.value = '';
  }

  updateTimerDisplay() {
    this.recordTimer.textContent = AudioRecorder.formatTime(this.recordingDuration);
  }

  // Text input mode
  switchToTextInput() {
    this.inputMode = 'text';
    this.recorderSection.style.display = 'none';
    this.textInputSection.classList.add('visible');
    this.textInput.focus();
  }

  switchToVoiceInput() {
    this.inputMode = 'voice';
    this.textInputSection.classList.remove('visible');
    this.recorderSection.style.display = 'flex';
  }

  autoResizeTextarea() {
    this.textInput.style.height = 'auto';
    this.textInput.style.height = Math.min(this.textInput.scrollHeight, 120) + 'px';
  }

  async sendTextMessage() {
    const content = this.textInput.value.trim();
    if (!content) return;

    // Create message
    const message = {
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };

    // Add to conversation
    this.conversationHistory.push(message);
    this.renderMessage(message);

    // Clear input
    this.textInput.value = '';
    this.autoResizeTextarea();

    // Save session
    await this.saveSession();

    // Get AI response
    await this.getAIResponse(content);
  }

  // Section review modal
  async showSectionReview(section) {
    this.currentSection = section;
    this.sectionModalTitle.textContent = this.sectionLabels[section];
    this.sectionModalContent.innerHTML = `
      <div class="ba-modal-loading">
        <div class="ba-loading-spinner"></div>
        <span>Summarising...</span>
      </div>
    `;
    this.sectionModal.classList.add('visible');

    try {
      const response = await fetch(`${config.apiUrl}/ba/summarise-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: section,
          conversationHistory: this.conversationHistory
        })
      });

      const data = await response.json();
      this.sectionModalContent.textContent = data.summary || 'No information captured yet.';

    } catch (error) {
      console.error('Summarise error:', error);
      this.sectionModalContent.textContent = 'Failed to load summary. Please try again.';
    }
  }

  closeSectionModalFn() {
    this.sectionModal.classList.remove('visible');
    this.currentSection = null;
  }

  addMoreToSection() {
    const section = this.currentSection;
    this.closeSectionModalFn();

    // Switch to text input and pre-fill with a prompt
    this.switchToTextInput();
    const prompts = {
      vision: "Let me add more about the vision...",
      users: "About the users...",
      features: "For the features...",
      rules: "Regarding business rules...",
      data: "About the data...",
      priority: "On priorities..."
    };
    this.textInput.value = prompts[section] || '';
    this.textInput.focus();
    this.textInput.setSelectionRange(this.textInput.value.length, this.textInput.value.length);
  }

  // Pre-generation review modal
  showPreGenerationReview() {
    this.renderReviewSections();
    this.reviewModal.classList.add('visible');
  }

  closeReviewModalFn() {
    this.reviewModal.classList.remove('visible');
  }

  renderReviewSections() {
    const sections = ['vision', 'users', 'features', 'rules', 'data', 'priority'];
    const coveredCount = Object.values(this.coverageStatus).filter(v => v).length;

    this.reviewSections.innerHTML = sections.map(section => {
      const covered = this.coverageStatus[section];
      return `
        <div class="ba-review-section ${covered ? 'covered' : ''}">
          <div class="ba-review-section-icon">
            ${covered
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'
            }
          </div>
          <div class="ba-review-section-info">
            <div class="ba-review-section-title">${this.sectionLabels[section]}</div>
            <div class="ba-review-section-status">${covered ? 'Captured' : 'Not captured yet'}</div>
          </div>
          <button class="ba-review-section-btn" data-section="${section}">
            ${covered ? 'Review' : 'Add info'}
          </button>
        </div>
      `;
    }).join('');

    // Add click handlers for section buttons
    this.reviewSections.querySelectorAll('.ba-review-section-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        this.closeReviewModalFn();
        if (this.coverageStatus[section]) {
          this.showSectionReview(section);
        } else {
          this.switchToTextInput();
          this.textInput.focus();
        }
      });
    });

    // Enable generate button if minimum sections covered (vision + at least 2 others)
    const canGenerate = this.coverageStatus.vision && coveredCount >= 3;
    this.generateDocsBtn.disabled = !canGenerate;
  }

  async generateDocuments() {
    this.closeReviewModalFn();
    this.showOutputView();

    // Show generating state
    this.outputContent.innerHTML = `
      <div class="ba-generating">
        <div class="ba-generating-spinner"></div>
        <span>Generating documentation...</span>
      </div>
    `;

    try {
      const response = await fetch(`${config.apiUrl}/ba/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          conversationHistory: this.conversationHistory
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Store generated documents
      this.generatedDocs = data.documents;
      this.currentTab = 'all';

      // Render documents
      this.renderDocuments();

    } catch (error) {
      console.error('Generation error:', error);
      this.outputContent.innerHTML = `
        <div class="ba-generating">
          <p>Failed to generate documentation. Please try again.</p>
          <button class="ba-output-btn" onclick="baChatController.generateDocuments()">Retry</button>
        </div>
      `;
    }
  }

  showOutputView() {
    this.outputView.classList.add('visible');
  }

  hideOutputView() {
    this.outputView.classList.remove('visible');
  }

  switchTab(tab) {
    if (!this.generatedDocs) return;

    this.currentTab = tab;

    // Update tab styles
    this.outputTabs.querySelectorAll('.ba-output-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Render documents for selected tab
    this.renderDocuments();
  }

  renderDocuments() {
    if (!this.generatedDocs) return;

    const content = this.generatedDocs[this.currentTab] || this.generatedDocs.all;
    this.outputContent.innerHTML = this.markdownToHtml(content);
  }

  markdownToHtml(markdown) {
    if (!markdown) return '<p>No content available.</p>';

    let html = markdown
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      // Paragraphs
      .replace(/\n\n+/g, '</p><p>')
      // Line breaks
      .replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = '<p>' + html + '</p>';

    // Fix list items (wrap consecutive li in ul)
    html = html.replace(/(<li>.*?<\/li>)(<br>)?/g, '$1');
    html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');
    html = html.replace(/<br><h/g, '<h');
    html = html.replace(/<\/h(\d)><br>/g, '</h$1>');
    html = html.replace(/<p><h/g, '<h');
    html = html.replace(/<\/h(\d)><\/p>/g, '</h$1>');

    return html;
  }

  async copyDocuments() {
    if (!this.generatedDocs) return;

    const content = this.generatedDocs[this.currentTab] || this.generatedDocs.all;

    try {
      await navigator.clipboard.writeText(content);
      this.showToast('Copied to clipboard');
    } catch (error) {
      console.error('Copy error:', error);
      this.showToast('Failed to copy');
    }
  }

  downloadDocuments() {
    if (!this.generatedDocs) return;

    const content = this.generatedDocs[this.currentTab] || this.generatedDocs.all;
    const filename = `requirements-${this.currentTab}.md`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast('Downloaded ' + filename);
  }

  startNewSession() {
    // Clear session and start fresh
    sessionStorage.setItem('ba_new_session', 'true');
    sessionStorage.removeItem('ba_session_id');
    window.location.reload();
  }

  // Check if ready to generate and show button
  checkReadyToGenerate() {
    const coveredCount = Object.values(this.coverageStatus).filter(v => v).length;
    const isReady = this.coverageStatus.vision && coveredCount >= 3;
    this.generateBtn.classList.toggle('visible', isReady);
  }

  // Utilities
  showLoading(show, text = 'Thinking...') {
    this.loadingIndicator.querySelector('span').textContent = text;
    this.loadingIndicator.classList.toggle('visible', show);
  }

  showToast(message, duration = 3000) {
    this.toast.textContent = message;
    this.toast.classList.add('visible');
    setTimeout(() => {
      this.toast.classList.remove('visible');
    }, duration);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
const baChatController = new BAChatController();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => baChatController.init());
} else {
  baChatController.init();
}

window.baChatController = baChatController;
