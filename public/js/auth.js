/**
 * Authentication module
 * Handles OAuth 2.0 authentication with YouTube API
 */
const auth = (() => {
  // Private variables
  let _isAuthenticated = false;
  let _accessToken = null;
  let _tokenExpiry = null;

  // Constants
  const AUTH_ENDPOINT = "/api/auth";
  const TOKEN_KEY = "yt_data_exporter_token";
  const EXPIRY_KEY = "yt_data_exporter_expiry";

  // Private methods
  const _saveToken = (token, expiresIn) => {
    console.log("Saving token with expiry:", expiresIn);
    _accessToken = token;

    // Calculate and store expiry time
    const expiryTime = Date.now() + expiresIn * 1000;
    _tokenExpiry = expiryTime;

    // Save to localStorage for persistence
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRY_KEY, expiryTime.toString());

    _isAuthenticated = true;
  };

  const _clearToken = () => {
    console.log("Clearing token");
    _accessToken = null;
    _tokenExpiry = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    _isAuthenticated = false;
  };

  const _isTokenValid = () => {
    if (!_accessToken || !_tokenExpiry) return false;

    // Check if token has expired (with 5 minute buffer)
    const fiveMinutesInMs = 5 * 60 * 1000;
    return Date.now() < _tokenExpiry - fiveMinutesInMs;
  };

  const _loadTokenFromStorage = () => {
    console.log("Loading token from storage");
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(EXPIRY_KEY);

    if (token && expiry) {
      _accessToken = token;
      _tokenExpiry = parseInt(expiry, 10);
      _isAuthenticated = _isTokenValid();
      console.log("Token loaded, is authenticated:", _isAuthenticated);

      // Clean up if token is expired
      if (!_isAuthenticated) {
        _clearToken();
      }
    }
  };

  const _refreshToken = async () => {
    console.log("Attempting to refresh token");
    try {
      const response = await fetch(`${AUTH_ENDPOINT}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: _accessToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const data = await response.json();
      _saveToken(data.access_token, data.expires_in);
      return true;
    } catch (error) {
      console.error("Error refreshing token:", error);
      _clearToken();
      return false;
    }
  };

  // Public API
  return {
    /**
     * Initialize the auth module
     */
    init() {
      console.log("Initializing auth module");
      _loadTokenFromStorage();
    },

    /**
     * Check if user is currently authenticated
     * @returns {boolean} Authentication status
     */
    isAuthenticated() {
      return _isAuthenticated && _isTokenValid();
    },

    /**
     * Check authentication status and refresh token if needed
     * @returns {Promise<boolean>} Authentication status
     */
    async checkAuthStatus() {
      console.log("Checking auth status");
      _loadTokenFromStorage();

      if (_isAuthenticated && !_isTokenValid()) {
        return await _refreshToken();
      }

      return _isAuthenticated;
    },

    /**
     * Get the current access token
     * @returns {string|null} The access token or null if not authenticated
     */
    getAccessToken() {
      if (this.isAuthenticated()) {
        return _accessToken;
      }
      return null;
    },

    /**
     * Sign in with OAuth
     * @returns {Promise<void>}
     */
    async signIn() {
      console.log("Starting sign in process");

      // Open the auth window
      const authWindow = window.open(
        `${AUTH_ENDPOINT}/login`,
        "youtube-auth",
        "width=500,height=600,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no"
      );

      if (!authWindow) {
        console.error("Popup blocked");
        throw new Error("Popup blocked. Please allow popups for this site.");
      }

      console.log("Auth window opened");

      // Set up message listener for the auth response
      return new Promise((resolve, reject) => {
        const messageListener = (event) => {
          // Log all messages for debugging
          console.log("Received message:", event.origin, event.data);

          // Verify origin
          if (event.origin !== window.location.origin) {
            console.log("Ignoring message from different origin");
            return;
          }

          // Handle auth response
          if (event.data && event.data.type === "auth_response") {
            console.log("Received auth response:", event.data.success);
            window.removeEventListener("message", messageListener);

            if (event.data.success) {
              _saveToken(event.data.token, event.data.expiresIn);
              resolve();
            } else {
              reject(new Error(event.data.error || "Authentication failed"));
            }
          }
        };

        console.log("Adding message listener");
        window.addEventListener("message", messageListener);

        // Check if the popup is closed before authentication completes
        const popupCheckInterval = setInterval(() => {
          if (authWindow.closed) {
            console.log("Auth window was closed");
            clearInterval(popupCheckInterval);
            window.removeEventListener("message", messageListener);
            reject(new Error("Authentication window was closed"));
          }
        }, 1000);
      });
    },

    /**
     * Sign out
     * @returns {Promise<void>}
     */
    async signOut() {
      console.log("Starting sign out process");
      try {
        if (_accessToken) {
          // Call the server to revoke the token
          await fetch(`${AUTH_ENDPOINT}/revoke`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token: _accessToken }),
          });
        }
      } catch (error) {
        console.error("Error revoking token:", error);
      } finally {
        _clearToken();
      }
    },
  };
})();

// Initialize auth module when script loads
console.log("Auth script loaded");
auth.init();