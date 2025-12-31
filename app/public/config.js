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
    url: 'https://vjimmmnexookthrdxrkz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqaW1tbW5leG9va3RocmR4cmt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDY0MjIsImV4cCI6MjA4MjUyMjQyMn0.YpREejftePiXJkQx6KOsBPicaMAABNLun9NyjfHzghM'
  }
};

// Freeze to prevent accidental modification
Object.freeze(config);
Object.freeze(config.supabase);

console.log('Config loaded:', { apiUrl: config.apiUrl, env: window.location.hostname });
