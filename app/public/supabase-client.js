/**
 * Supabase Auth Client
 * Handles authentication (Google OAuth) and anonymous user management
 */

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(
  config.supabase.url,
  config.supabase.anonKey
);

/**
 * Auth state management
 */
const auth = {
  currentUser: null,
  session: null,
  listeners: [],

  /**
   * Initialize auth - call on page load
   */
  async init() {
    // Get current session
    const { data: { session } } = await supabaseClient.auth.getSession();
    this.session = session;
    this.currentUser = session?.user || null;

    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
      this.session = session;
      this.currentUser = session?.user || null;
      this.notifyListeners(event, session);
    });

    return this.currentUser;
  },

  /**
   * Sign in with Google
   */
  async signInWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) {
      console.error('Sign in error:', error);
      throw error;
    }

    return data;
  },

  /**
   * Sign out
   */
  async signOut() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error('Sign out error:', error);
      throw error;
    }

    this.currentUser = null;
    this.session = null;
  },

  /**
   * Get current user
   */
  getUser() {
    return this.currentUser;
  },

  /**
   * Get current session
   */
  getSession() {
    return this.session;
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser;
  },

  /**
   * Add auth state change listener
   */
  onAuthStateChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  },

  /**
   * Notify all listeners of auth state change
   */
  notifyListeners(event, session) {
    this.listeners.forEach(callback => callback(event, session));
  }
};

/**
 * Anonymous user management
 * For users who haven't signed in, we generate a unique ID stored in localStorage
 */
const anonymousUser = {
  STORAGE_KEY: 'my_whisper_anonymous_id',

  /**
   * Get or create anonymous user ID
   * Returns a UUID that persists in localStorage
   */
  getId() {
    let id = localStorage.getItem(this.STORAGE_KEY);

    if (!id) {
      // Generate a UUID v4
      id = crypto.randomUUID();
      localStorage.setItem(this.STORAGE_KEY, id);
      console.log('Generated new anonymous ID:', id);
    }

    return id;
  },

  /**
   * Clear anonymous ID (e.g., after migration to real account)
   */
  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
};

/**
 * Get the effective user ID for API requests
 * Returns authenticated user ID if signed in, otherwise anonymous ID
 */
function getEffectiveUserId() {
  if (auth.isAuthenticated()) {
    return auth.currentUser.id;
  }
  return anonymousUser.getId();
}

/**
 * Get headers for API requests
 * Includes auth token for authenticated users, or anonymous ID header
 */
function getAuthHeaders() {
  const headers = {};

  if (auth.isAuthenticated() && auth.session?.access_token) {
    headers['Authorization'] = `Bearer ${auth.session.access_token}`;
  } else {
    headers['X-Anonymous-ID'] = anonymousUser.getId();
  }

  return headers;
}

/**
 * Make authenticated API request
 * Wrapper around fetch that adds auth headers
 */
async function authFetch(url, options = {}) {
  const authHeaders = getAuthHeaders();

  const mergedOptions = {
    ...options,
    headers: {
      ...options.headers,
      ...authHeaders
    }
  };

  return fetch(url, mergedOptions);
}

// Export for use in other scripts
window.auth = auth;
window.anonymousUser = anonymousUser;
window.getEffectiveUserId = getEffectiveUserId;
window.getAuthHeaders = getAuthHeaders;
window.authFetch = authFetch;
