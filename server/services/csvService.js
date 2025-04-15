/**
 * CSV Generation Service
 */
const fs = require("fs");
const path = require("path");
const { Parser } = require("json2csv");
const config = require("../config/config");

module.exports = {
  /**
   * Generate CSV files from YouTube data
   * @param {Object} data - Data to convert to CSV
   * @param {Array} [data.likedVideos] - Array of liked videos
   * @param {Array} [data.watchHistory] - Array of watch history items
   * @returns {Promise<string>} Filename of the generated CSV
   */
  async generateCsv(data) {
    try {
      // Define fields for each data type
      const fields = {
        likedVideos: [
          { label: "Video ID", value: "id" },
          { label: "Title", value: "title" },
          { label: "Channel", value: "channelTitle" },
          { label: "Channel ID", value: "channelId" },
          { label: "Published Date", value: "publishedAt" },
          { label: "Duration", value: "duration" },
          { label: "View Count", value: "viewCount" },
          { label: "Like Count", value: "likeCount" },
          { label: "Comment Count", value: "commentCount" },
          { label: "Thumbnail URL", value: "thumbnailUrl" },
          { label: "Description", value: "description" },
        ],
        watchHistory: [
          { label: "Item ID", value: "id" },
          { label: "Video ID", value: "videoId" },
          { label: "Title", value: "title" },
          { label: "Channel", value: "channelTitle" },
          { label: "Channel ID", value: "channelId" },
          { label: "Watched Date", value: "watchedAt" },
          { label: "Thumbnail URL", value: "thumbnailUrl" },
        ],
      };

      // Generate a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `youtube_data_${timestamp}.csv`;
      const filePath = path.join(config.storage.tempDir, filename);

      // Create the CSV content
      let csvContent = "";

      // Add header section
      csvContent += "YouTube Data Export\r\n";
      csvContent += `Generated: ${new Date().toISOString()}\r\n\r\n`;

      // Add liked videos if present
      if (data.likedVideos && data.likedVideos.length > 0) {
        csvContent += "=== LIKED VIDEOS ===\r\n";

        const parser = new Parser({
          fields: fields.likedVideos,
          header: true,
        });

        csvContent += parser.parse(data.likedVideos);
        csvContent += "\r\n\r\n";
      }

      // Add watch history if present
      if (data.watchHistory && data.watchHistory.length > 0) {
        csvContent += "=== WATCH HISTORY ===\r\n";

        const parser = new Parser({
          fields: fields.watchHistory,
          header: true,
        });

        csvContent += parser.parse(data.watchHistory);
      }

      // Write to file
      await fs.promises.writeFile(filePath, csvContent, "utf8");

      return filename;
    } catch (error) {
      console.error("Error generating CSV:", error);
      throw new Error("Failed to generate CSV file");
    }
  },
};
