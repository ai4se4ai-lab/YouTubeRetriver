/**
 * Data Handler module
 * Manages the retrieval and export of YouTube data
 */
const dataHandler = (() => {
  // Constants
  const API_ENDPOINT = "/api/data";

  // Private methods
  const _fetchData = async (endpoint, params = {}) => {
    const token = auth.getAccessToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    // Build query string
    const queryParams = new URLSearchParams(params).toString();
    const url = `${API_ENDPOINT}/${endpoint}${
      queryParams ? `?${queryParams}` : ""
    }`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to fetch ${endpoint}`);
    }

    return response.json();
  };

  // Public API
  return {
    /**
     * Export YouTube data based on provided options
     * @param {Object} options - Export options
     * @param {boolean} options.likedVideos - Whether to export liked videos
     * @param {boolean} options.watchHistory - Whether to export watch history
     * @param {number} options.maxResults - Maximum number of results to retrieve per category
     * @param {Function} progressCallback - Callback function for progress updates
     * @returns {Promise<string>} - Filename of the exported data
     */
    async exportData(options, progressCallback) {
      let totalProgress = 0;
      let dataToExport = {};

      // Update progress at the start
      if (progressCallback) {
        progressCallback(0, "Starting export...");
      }

      // Fetch liked videos if selected
      if (options.likedVideos) {
        if (progressCallback) {
          progressCallback(5, "Fetching liked videos...");
        }

        const likedVideos = await _fetchData("liked", {
          maxResults: options.maxResults,
        });

        dataToExport.likedVideos = likedVideos;
        totalProgress = 40;

        if (progressCallback) {
          progressCallback(
            totalProgress,
            `Retrieved ${likedVideos.length} liked videos`
          );
        }
      }

      // Fetch watch history if selected
      if (options.watchHistory) {
        if (progressCallback) {
          progressCallback(
            options.likedVideos ? 45 : 5,
            "Fetching watch history..."
          );
        }

        const watchHistory = await _fetchData("history", {
          maxResults: options.maxResults,
        });

        dataToExport.watchHistory = watchHistory;
        totalProgress = options.likedVideos ? 80 : 40;

        if (progressCallback) {
          progressCallback(
            totalProgress,
            `Retrieved ${watchHistory.length} watch history items`
          );
        }
      }

      // Generate the CSV file on the server
      if (progressCallback) {
        progressCallback(85, "Generating CSV file...");
      }

      const response = await fetch(`${API_ENDPOINT}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify(dataToExport),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate CSV file");
      }

      const result = await response.json();

      if (progressCallback) {
        progressCallback(100, "Export completed!");
      }

      return result.filename;
    },

    /**
     * Get statistics about user's YouTube data
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
      return _fetchData("statistics");
    },
  };
})();
