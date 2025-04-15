/**
 * Authentication Service
 */
const { google } = require("googleapis");
const config = require("../config/config");

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

module.exports = {
  /**
   * Revoke an OAuth token
   * @param {string} token - The token to revoke
   * @returns {Promise<void>}
   */
  async revokeToken(token) {
    try {
      await oauth2Client.revokeToken(token);
    } catch (error) {
      console.error("Error revoking token:", error);
      throw new Error("Failed to revoke token");
    }
  },

  /**
   * Verify an access token
   * @param {string} token - The token to verify
   * @returns {Promise<boolean>} Whether the token is valid
   */
  async verifyToken(token) {
    try {
      oauth2Client.setCredentials({ access_token: token });
      const tokenInfo = await oauth2Client.getTokenInfo(token);

      // Check if token has required scopes
      const hasRequiredScopes = config.google.scopes.every((scope) =>
        tokenInfo.scopes.includes(scope)
      );

      return hasRequiredScopes;
    } catch (error) {
      console.error("Token verification error:", error);
      return false;
    }
  },

  /**
   * Get OAuth client with token set
   * @param {string} accessToken - The access token
   * @returns {OAuth2Client} Configured OAuth2 client
   */
  getAuthenticatedClient(accessToken) {
    const client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
    console.log("config.google.clientId:" + config.google.clientId);
    client.setCredentials({ access_token: accessToken });
    return client;
  },
};
