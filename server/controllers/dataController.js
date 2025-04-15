/**
 * Data Controller
 */
const youtubeService = require("../services/youtubeService");
const csvService = require("../services/csvService");
const path = require("path");
const fs = require("fs");
const config = require("../config/config");

// In-memory store for chunked exports (would use Redis or similar in production)
const exportSessions = new Map();

module.exports = {
  /**
   * Get liked videos
   */
  async getLikedVideos(req, res) {
    try {
      const maxResults = parseInt(req.query.maxResults, 10) || 50;
      const accessToken = req.token;

      // Get liked videos from YouTube API
      const likedVideos = await youtubeService.getLikedVideos(
        accessToken,
        maxResults
      );

      res.json(likedVideos);
    } catch (error) {
      console.error("Error fetching liked videos:", error);
      res.status(500).json({ 
        error: "Failed to fetch liked videos",
        message: error.message 
      });
    }
  },

  /**
   * Get watch history
   */
  async getWatchHistory(req, res) {
    try {
      const maxResults = parseInt(req.query.maxResults, 10) || 50;
      const accessToken = req.token;

      // Get watch history from YouTube API
      const watchHistory = await youtubeService.getWatchHistory(
        accessToken,
        maxResults
      );

      // Return empty array instead of error if no watch history is available
      // This prevents frontend errors
      res.json(watchHistory || []);
    } catch (error) {
      console.error("Error fetching watch history:", error);
      // Return empty array instead of error to prevent frontend crashes
      res.json([]);
    }
  },

  /**
   * Get channel statistics
   */
  async getStatistics(req, res) {
    try {
      const accessToken = req.token;

      // Get channel and activity statistics
      const statistics = await youtubeService.getChannelStatistics(accessToken);

      res.json(statistics);
    } catch (error) {
      console.error("Error fetching statistics:", error);
      res.status(500).json({ 
        error: "Failed to fetch statistics",
        message: error.message
      });
    }
  },

  /**
   * Export data to CSV (single request)
   */
  async exportToCsv(req, res) {
    try {
      const { likedVideos, watchHistory } = req.body;

      // Check if there's at least one valid data type
      const hasLikedVideos = Array.isArray(likedVideos) && likedVideos.length > 0;
      const hasWatchHistory = Array.isArray(watchHistory) && watchHistory.length > 0;

      if (!hasLikedVideos && !hasWatchHistory) {
        return res.status(400).json({ error: "No data provided for export" });
      }

      // Generate CSV files
      const filename = await csvService.generateCsv({
        likedVideos: hasLikedVideos ? likedVideos : [],
        watchHistory: hasWatchHistory ? watchHistory : []
      });

      res.json({ filename });
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      res.status(500).json({ 
        error: "Failed to export data to CSV",
        message: error.message 
      });
    }
  },

  /**
   * Initialize a chunked export session
   */
  async initExport(req, res) {
    try {
      const { sessionId, totalChunks } = req.body;

      if (!sessionId || !totalChunks) {
        return res.status(400).json({ error: "Session ID and total chunks are required" });
      }

      // Create a new export session
      exportSessions.set(sessionId, {
        createdAt: Date.now(),
        totalChunks,
        receivedChunks: 0,
        likedVideos: [],
        watchHistory: [],
        chunkStatus: new Array(totalChunks).fill(false),
      });

      // Create temp directory for chunks if it doesn't exist
      const chunksDir = path.join(config.storage.tempDir, sessionId);
      if (!fs.existsSync(chunksDir)) {
        fs.mkdirSync(chunksDir, { recursive: true });
      }

      res.json({ success: true, message: "Export session initialized" });
    } catch (error) {
      console.error("Error initializing export:", error);
      res.status(500).json({ error: "Failed to initialize export session" });
    }
  },

  /**
   * Add a chunk to an export session
   */
  async addExportChunk(req, res) {
    try {
      const { sessionId, chunkIndex, dataType, data } = req.body;

      if (!sessionId || chunkIndex === undefined || !dataType || !data) {
        return res.status(400).json({ error: "Missing required fields for chunk export" });
      }

      // Validate session exists
      if (!exportSessions.has(sessionId)) {
        return res.status(404).json({ error: "Export session not found" });
      }

      const session = exportSessions.get(sessionId);

      // Validate chunk index
      if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
        return res.status(400).json({ error: "Invalid chunk index" });
      }

      // Save chunk data to file to reduce memory usage
      const chunkDir = path.join(config.storage.tempDir, sessionId);
      const chunkFile = path.join(chunkDir, `chunk_${dataType}_${chunkIndex}.json`);
      
      await fs.promises.writeFile(
        chunkFile,
        JSON.stringify(data),
        'utf8'
      );

      // Update session status
      session.chunkStatus[chunkIndex] = true;
      session.receivedChunks++;

      res.json({ 
        success: true, 
        message: `Chunk ${chunkIndex} received`,
        progress: `${session.receivedChunks}/${session.totalChunks}` 
      });
    } catch (error) {
      console.error("Error adding export chunk:", error);
      res.status(500).json({ error: "Failed to process export chunk" });
    }
  },

  /**
   * Finalize an export session and generate the CSV
   */
  async finalizeExport(req, res) {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }

      // Validate session exists
      if (!exportSessions.has(sessionId)) {
        return res.status(404).json({ error: "Export session not found" });
      }

      const session = exportSessions.get(sessionId);

      // Check if all chunks are received
      if (session.receivedChunks < session.totalChunks) {
        return res.status(400).json({ 
          error: "Not all chunks received",
          received: session.receivedChunks,
          total: session.totalChunks
        });
      }

      // Combine all chunks
      const chunkDir = path.join(config.storage.tempDir, sessionId);
      let likedVideos = [];
      let watchHistory = [];

      // Read all chunk files
      const files = await fs.promises.readdir(chunkDir);
      
      for (const file of files) {
        const filePath = path.join(chunkDir, file);
        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        // Add to appropriate collection based on filename
        if (file.includes('liked')) {
          likedVideos = likedVideos.concat(data);
        } else if (file.includes('watch')) {
          watchHistory = watchHistory.concat(data);
        }
      }

      // Generate the CSV file
      const filename = await csvService.generateCsv({
        likedVideos,
        watchHistory,
      });

      // Clean up the session and temp files
      exportSessions.delete(sessionId);
      
      // Delete chunk directory with all files asynchronously
      fs.rm(chunkDir, { recursive: true, force: true }, (err) => {
        if (err) {
          console.error(`Error cleaning up export session chunks: ${err}`);
        }
      });

      res.json({ 
        success: true, 
        message: "Export finalized successfully",
        filename
      });
    } catch (error) {
      console.error("Error finalizing export:", error);
      res.status(500).json({ error: "Failed to finalize export" });
    }
  }
};