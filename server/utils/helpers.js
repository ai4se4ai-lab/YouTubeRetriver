/**
 * Utility Helper Functions
 */
const authService = require("../services/authService");

module.exports = {
  /**
   * Middleware to authenticate requests with OAuth token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  async authenticateToken(req, res, next) {
    // Get the authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header required" });
    }

    // Extract the token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Token required" });
    }

    try {
      // Verify the token
      const isValid = await authService.verifyToken(token);

      if (!isValid) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      // Store the token in the request for later use
      req.token = token;
      next();
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(401).json({ error: "Authentication failed" });
    }
  },

  /**
   * Format ISO duration to human readable format
   * @param {string} isoDuration - ISO 8601 duration format
   * @returns {string} Human readable duration
   */
  formatDuration(isoDuration) {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    if (!match) return "Unknown";

    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseInt(match[3], 10) : 0;

    let result = "";

    if (hours > 0) {
      result += `${hours}:`;
      result += minutes < 10 ? `0${minutes}:` : `${minutes}:`;
    } else {
      result += `${minutes}:`;
    }

    result += seconds < 10 ? `0${seconds}` : `${seconds}`;

    return result;
  },

  /**
   * Format a number with comma separators
   * @param {number} number - Number to format
   * @returns {string} Formatted number
   */
  formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },

  /**
   * Sanitize text for CSV
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  sanitizeForCsv(text) {
    if (!text) return "";

    // Replace newlines and commas
    return text.replace(/\r?\n/g, " ").replace(/,/g, ";").replace(/"/g, '""');
  },
};
