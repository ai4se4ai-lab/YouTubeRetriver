/**
 * Application configuration
 */
require("dotenv").config();

// Define the configuration
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },

  // Google OAuth settings
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3000/api/auth/callback",
    scopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
  },

  // YouTube API settings
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    apiBase: "https://www.googleapis.com/youtube/v3",
  },

  // Security settings
  security: {
    sessionSecret: process.env.SESSION_SECRET || "youtube-data-exporter-secret",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },

  // File storage settings
  storage: {
    tempDir: process.env.TEMP_DIR || "./temp",
    maxFileAge: 60 * 60 * 1000, // 1 hour in milliseconds
  },
};

// Log important config values
console.log("Environment variables loaded:");
console.log("- Google Client ID exists:", !!config.google.clientId);
console.log("- Google Client Secret exists:", !!config.google.clientSecret);
console.log("- Google Redirect URI:", config.google.redirectUri);
console.log("- CORS Origin:", config.security.corsOrigin);

module.exports = config;
