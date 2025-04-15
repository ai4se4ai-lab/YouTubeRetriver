/**
 * Data Controller
 */
const youtubeService = require("../services/youtubeService");
const csvService = require("../services/csvService");

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
      res.status(500).json({ error: "Failed to fetch liked videos" });
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

      res.json(watchHistory);
    } catch (error) {
      console.error("Error fetching watch history:", error);
      res.status(500).json({ error: "Failed to fetch watch history" });
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
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  },

  /**
   * Export data to CSV
   */
  async exportToCsv(req, res) {
    try {
      const { likedVideos, watchHistory } = req.body;

      if (!likedVideos && !watchHistory) {
        return res.status(400).json({ error: "No data provided for export" });
      }

      // Generate CSV files
      const filename = await csvService.generateCsv({
        likedVideos,
        watchHistory,
      });

      res.json({ filename });
    } catch (error) {
      console.error("Error exporting to CSV:", error);
      res.status(500).json({ error: "Failed to export data to CSV" });
    }
  },
};
