/**
 * Authentication Controller
 */
const { google } = require("googleapis");
const config = require("../config/config");
const authService = require("../services/authService");

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

// Generate the OAuth2 URL with appropriate scopes
const generateAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: config.google.scopes,
    prompt: "consent", // Always prompt for consent to ensure refresh token is returned
  });
};

module.exports = {
  /**
   * Initiate OAuth flow
   */
  initiateOAuth(req, res) {
    try {
      console.log("Initiating OAuth flow");
      // Generate authentication URL
      const authUrl = generateAuthUrl();
      console.log("Auth URL generated:", authUrl);

      // Render a simple HTML page that will redirect or post message to parent
      res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>YouTube Authorization</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
                    .btn { display: inline-block; background: #ff0000; color: white; padding: 10px 20px; 
                          text-decoration: none; border-radius: 4px; font-weight: bold; }
                </style>
            </head>
            <body>
                <h2>YouTube Data Exporter</h2>
                <p>Click the button below to authorize access to your YouTube data.</p>
                <a href="${authUrl}" class="btn">Authorize</a>
                <script>
                    console.log('Auth popup loaded');
                    // If we're in a popup, go directly to auth URL
                    if (window.opener) {
                        console.log('Detected opener, redirecting to auth URL');
                        window.location.href = "${authUrl}";
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
      console.error("OAuth initiation error:", error);
      res.status(500).json({ error: "Failed to initiate authentication" });
    }
  },

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(req, res) {
    const { code } = req.query;

    // Check if code is present
    if (!code) {
      return sendAuthResponse(res, false, "No authorization code received");
    }

    try {
      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      const { access_token, refresh_token, expiry_date } = tokens;

      // Store tokens in session
      req.session.tokens = tokens;

      // Calculate expires_in from expiry_date
      const expiresIn = Math.floor((expiry_date - Date.now()) / 1000);

      // Send success response
      sendAuthResponse(res, true, null, access_token, expiresIn);
    } catch (error) {
      console.error("OAuth callback error:", error);
      sendAuthResponse(res, false, "Failed to complete authentication");
    }
  },

  /**
   * Refresh access token
   */
  async refreshToken(req, res) {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    try {
      // Use the refresh token associated with this user in the database
      // This is simplified - in a real app, you'd look up the refresh token for this user
      const refreshToken = req.session.tokens?.refresh_token;

      if (!refreshToken) {
        return res.status(401).json({ error: "No refresh token available" });
      }

      // Set credentials and refresh
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update session
      req.session.tokens = credentials;

      // Calculate expires_in
      const expiresIn = Math.floor(
        (credentials.expiry_date - Date.now()) / 1000
      );

      res.json({
        access_token: credentials.access_token,
        expires_in: expiresIn,
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ error: "Failed to refresh token" });
    }
  },

  /**
   * Revoke access token
   */
  async revokeToken(req, res) {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    try {
      await authService.revokeToken(token);

      // Clear session
      req.session.destroy();

      res.json({ success: true });
    } catch (error) {
      console.error("Token revocation error:", error);
      res.status(500).json({ error: "Failed to revoke token" });
    }
  },

  /**
   * Get current auth status
   */
  getAuthStatus(req, res) {
    const tokens = req.session.tokens;

    if (!tokens || !tokens.access_token) {
      return res.json({ authenticated: false });
    }

    // Check if token is expired
    const isExpired = tokens.expiry_date
      ? Date.now() >= tokens.expiry_date
      : true;

    res.json({
      authenticated: !isExpired,
      // Don't send the actual tokens back to the client for security
      expires_at: tokens.expiry_date,
    });
  },
};

/**
 * Helper function to send OAuth response to client
 */
function sendAuthResponse(res, success, error, token, expiresIn) {
  // Create HTML page that posts message to opener
  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authentication ${success ? "Successful" : "Failed"}</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
                .success { color: #4CAF50; }
                .error { color: #F44336; }
            </style>
        </head>
        <body>
            <h2 class="${success ? "success" : "error"}">${
    success ? "Authentication Successful" : "Authentication Failed"
  }</h2>
            <p>${
              success
                ? "You can now close this window and return to the application."
                : error
            }</p>
            <script>
                // Send message to opener and close window
                if (window.opener) {
                    window.opener.postMessage({
                        type: 'auth_response',
                        success: ${success},
                        ${
                          success
                            ? `token: '${token}', expiresIn: ${expiresIn}`
                            : `error: '${error}'`
                        }
                    }, '${config.security.corsOrigin}');
                    
                    // Close the window after a short delay
                    setTimeout(() => window.close(), 1500);
                }
            </script>
        </body>
        </html>
    `);
}
