/**
 * Data Handler module
 * Manages the retrieval and export of YouTube data
 */
const dataHandler = (() => {
  // Constants
  const API_ENDPOINT = "/api/data";
  const BATCH_SIZE = 500; // Maximum number of items to send in a single API request

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

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Try to get error details from response
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error fetching ${endpoint}:`, errorData);
        throw new Error(errorData.message || `Failed to fetch ${endpoint}`);
      }

      return response.json();
    } catch (error) {
      console.error(`Error in _fetchData for ${endpoint}:`, error);
      // Return empty array to prevent cascading errors
      return [];
    }
  };

  /**
   * Process data in chunks to avoid payload size limits
   * @param {Array} data - The data to process in chunks
   * @param {number} chunkSize - Maximum size of each chunk
   * @returns {Array} - Array of chunks
   */
  const _chunkArray = (data, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    return chunks;
  };

  /**
   * Export data in batches to avoid large payloads
   * @param {Object} data - Data to export
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<string>} - Filename of the exported data
   */
  const _batchedExport = async (data, progressCallback) => {
    // Generate a unique session ID for this export
    const sessionId = Date.now().toString();
    let currentProgress = 85;
    let totalChunks = 0;
    let processedChunks = 0;

    // Calculate total number of chunks
    if (data.likedVideos && data.likedVideos.length > 0) {
      totalChunks += Math.ceil(data.likedVideos.length / BATCH_SIZE);
    }
    if (data.watchHistory && data.watchHistory.length > 0) {
      totalChunks += Math.ceil(data.watchHistory.length / BATCH_SIZE);
    }

    // If no chunks (empty data), create one empty chunk
    if (totalChunks === 0) {
      totalChunks = 1;
    }

    // Start multi-part export
    if (progressCallback) {
      progressCallback(currentProgress, `Preparing to export data in ${totalChunks} parts...`);
    }

    // Initialize export session
    const initResponse = await fetch(`${API_ENDPOINT}/export/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.getAccessToken()}`,
      },
      body: JSON.stringify({ sessionId, totalChunks }),
    });

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to initialize export session");
    }

    // Process liked videos in chunks
    if (data.likedVideos && data.likedVideos.length > 0) {
      const chunks = _chunkArray(data.likedVideos, BATCH_SIZE);
      for (let i = 0; i < chunks.length; i++) {
        if (progressCallback) {
          currentProgress = 85 + (10 * (processedChunks / totalChunks));
          progressCallback(
            currentProgress,
            `Exporting liked videos part ${i + 1}/${chunks.length}...`
          );
        }

        const response = await fetch(`${API_ENDPOINT}/export/chunk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.getAccessToken()}`,
          },
          body: JSON.stringify({
            sessionId,
            chunkIndex: processedChunks,
            dataType: "likedVideos",
            data: chunks[i],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to export data chunk");
        }

        processedChunks++;
      }
    }

    // Process watch history in chunks
    if (data.watchHistory && data.watchHistory.length > 0) {
      const chunks = _chunkArray(data.watchHistory, BATCH_SIZE);
      for (let i = 0; i < chunks.length; i++) {
        if (progressCallback) {
          currentProgress = 85 + (10 * (processedChunks / totalChunks));
          progressCallback(
            currentProgress,
            `Exporting watch history part ${i + 1}/${chunks.length}...`
          );
        }

        const response = await fetch(`${API_ENDPOINT}/export/chunk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.getAccessToken()}`,
          },
          body: JSON.stringify({
            sessionId,
            chunkIndex: processedChunks,
            dataType: "watchHistory",
            data: chunks[i],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to export data chunk");
        }

        processedChunks++;
      }
    }

    // Finalize the export and get the filename
    if (progressCallback) {
      progressCallback(95, "Finalizing export...");
    }

    const finalizeResponse = await fetch(`${API_ENDPOINT}/export/finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.getAccessToken()}`,
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!finalizeResponse.ok) {
      const errorData = await finalizeResponse.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to finalize export");
    }

    const result = await finalizeResponse.json();
    return result.filename;
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
      let errors = [];

      // Update progress at the start
      if (progressCallback) {
        progressCallback(0, "Starting export...");
      }

      // Fetch liked videos if selected
      if (options.likedVideos) {
        if (progressCallback) {
          progressCallback(5, "Fetching liked videos...");
        }

        try {
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
        } catch (error) {
          console.error("Error fetching liked videos:", error);
          errors.push("Could not fetch liked videos: " + error.message);
          dataToExport.likedVideos = []; // Use empty array to continue
          totalProgress = 40;
          if (progressCallback) {
            progressCallback(totalProgress, "Liked videos unavailable");
          }
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

        try {
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
        } catch (error) {
          console.error("Error fetching watch history:", error);
          errors.push("Could not fetch watch history: " + error.message);
          dataToExport.watchHistory = []; // Use empty array to continue
          totalProgress = options.likedVideos ? 80 : 40;
          if (progressCallback) {
            progressCallback(totalProgress, "Watch history unavailable");
          }
        }
      }

      // Check if we have any data to export
      if (
        (dataToExport.likedVideos && dataToExport.likedVideos.length === 0) &&
        (dataToExport.watchHistory && dataToExport.watchHistory.length === 0)
      ) {
        // Only throw if both are empty and both were requested
        if (options.likedVideos && options.watchHistory) {
          throw new Error("No data available to export. YouTube API restrictions may prevent access to this data.");
        }
      }

      // Generate the CSV file on the server using batched approach
      if (progressCallback) {
        progressCallback(85, "Generating CSV file...");
      }

      try {
        // Determine if we should use batched export (for large datasets)
        const totalItems = 
          (dataToExport.likedVideos ? dataToExport.likedVideos.length : 0) + 
          (dataToExport.watchHistory ? dataToExport.watchHistory.length : 0);
        
        let filename;
        
        if (totalItems > BATCH_SIZE) {
          // Use batched export for large datasets
          filename = await _batchedExport(dataToExport, progressCallback);
        } else {
          // Use simple export for small datasets
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
          filename = result.filename;
        }

        if (progressCallback) {
          let message = "Export completed!";
          if (errors.length > 0) {
            message += " (with some warnings)";
          }
          progressCallback(100, message);
        }

        return filename;
      } catch (error) {
        console.error("Error generating CSV:", error);
        throw error;
      }
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