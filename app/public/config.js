/**
 * App Configuration
 * Detects environment and sets API URL accordingly
 */

const config = {
  // API URL based on environment
  apiUrl: (() => {
    const hostname = window.location.hostname;

    // Local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return '/api';
    }

    // Production (Vercel or any other host)
    return 'https://s0ejd5tdzg.execute-api.eu-west-2.amazonaws.com/api';
  })(),

  // Supabase config (for direct client access if needed)
  supabase: {
    url: 'https://ohtrhcksobxspcnqxkbz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9odHJoY2tzb2J4c3BjbnF4a2J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUzNDQ2ODUsImV4cCI6MjA1MDkyMDY4NX0.xeligGHv0KAyT5yOSJcgYgYAkrfno0wFqXgwHCHKdhA'
  }
};

// Freeze to prevent accidental modification
Object.freeze(config);
Object.freeze(config.supabase);

console.log('Config loaded:', { apiUrl: config.apiUrl, env: window.location.hostname });
