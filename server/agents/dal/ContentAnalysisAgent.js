/**
 * Content Analysis Agent (A21)
 * Processes YouTube data to extract themes, topics, and user interests
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");

class ContentAnalysisAgent extends BaseAgent {
  constructor() {
    super(
      "Content Analysis Agent (A21)",
      "Processes YouTube data to extract themes, topics, and user interests using natural language processing techniques"
    );
    this.prompt = config.agents.contentAnalysisPrompt;
  }

  /**
   * Analyze YouTube data to extract meaningful insights
   * @param {Object} youtubeData - YouTube liked videos and watch history data
   * @returns {Promise<Object>} - Analysis results with themes and interests
   */
  async analyze(youtubeData) {
    return this.process(youtubeData, this.prompt);
  }

  /**
   * Format the YouTube data for better analysis
   * @param {Object} rawData - Raw YouTube data
   * @returns {Object} - Formatted data for analysis
   */
  formatData(rawData) {
    // Extract and format only the necessary parts for analysis
    const formattedData = {
      likedVideos: [],
      watchHistory: [],
      gitFindings: rawData.gitFindings || null,
    };

    if (rawData.likedVideos && Array.isArray(rawData.likedVideos)) {
      formattedData.likedVideos = rawData.likedVideos.map((video) => ({
        title: video.title,
        channelTitle: video.channelTitle,
        description: video.description?.slice(0, 500), // Truncate long descriptions
      }));
    }

    if (rawData.watchHistory && Array.isArray(rawData.watchHistory)) {
      formattedData.watchHistory = rawData.watchHistory.map((item) => ({
        title: item.title,
        channelTitle: item.channelTitle,
      }));
    }

    return formattedData;
  }
}

module.exports = new ContentAnalysisAgent();
