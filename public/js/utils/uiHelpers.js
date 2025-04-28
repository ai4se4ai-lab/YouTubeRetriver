/**
 * UI Helper Functions
 * Contains common helper functions for UI presentation
 */

// Create namespace for UI helper utilities
window.uiHelpers = (function () {
  /**
   * Extract result.output from agent response content
   * @param {Object|string} content - The agent response content
   * @returns {string} - The extracted output content
   */
  function getOutputContent(content) {
    // Check if content exists
    if (!content) return "";

    try {
      // If content is already a string, try to parse it as JSON
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content);
          // If parsed successfully, extract result.output
          if (parsed.result && parsed.result.output) {
            return parsed.result.output;
          } else {
            // If no result.output found, return the original string
            return content;
          }
        } catch (e) {
          // If not valid JSON, return as-is
          return content;
        }
      }

      // If content is already an object
      if (typeof content === "object") {
        // Extract result.output if it exists
        if (content.result && content.result.output) {
          return content.result.output;
        }

        // If we can't find result.output, return JSON stringified version
        return JSON.stringify(content, null, 2);
      }

      // Fallback for any other type
      return String(content);
    } catch (error) {
      console.error("Error extracting output content:", error);
      return "Error displaying content";
    }
  }

  // Return public API
  return {
    getOutputContent,
  };
})();
