/**
 * Agent Service
 * Handles agent operations and integration with the main application
 */
const agentManager = require("../agents/AgentManager");
const youtubeService = require("./youtubeService");

module.exports = {
  /**
   * Initialize agent system
   * @returns {Object} - Agent manager instance
   */
  initAgents() {
    return agentManager;
  },

  /**
   * Get the agent manager instance
   * @returns {Object} - Agent manager instance
   */
  getAgentManager() {
    return agentManager;
  },

  /**
   * Start a new agent session
   * @param {string} sessionId - Optional session ID
   * @returns {string} - Active session ID
   */
  startSession(sessionId) {
    return agentManager.initSession(sessionId);
  },

  /**
   * Get all agent statuses
   * @returns {Object} - Status of all agents
   */
  getAgentStatuses() {
    const agents = agentManager.getAllAgents();
    const statuses = {};

    for (const [key, agent] of Object.entries(agents)) {
      statuses[key] = agent.getStatus();
    }

    return statuses;
  },

  /**
   * Process YouTube data with AI agents
   * @param {string} accessToken - YouTube API access token
   * @param {Object} options - Processing options
   * @param {Function} approvalCallback - User approval callback
   * @returns {Promise<Object>} - Processing results
   */
  async processYouTubeData(accessToken, options, approvalCallback) {
    try {
      // Fetch YouTube data
      const youtubeData = {};

      if (options.likedVideos) {
        youtubeData.likedVideos = await youtubeService.getLikedVideos(
          accessToken,
          options.maxResults || 50
        );
      }

      if (options.watchHistory) {
        youtubeData.watchHistory = await youtubeService.getWatchHistory(
          accessToken,
          options.maxResults || 50
        );
      }

      // Process data through agents
      const results = await agentManager.runFullWorkflow(
        youtubeData,
        approvalCallback
      );
      return results;
    } catch (error) {
      console.error("Error processing YouTube data with agents:", error);
      throw error;
    }
  },

  /**
   * Submit user feedback
   * @param {string} feedback - User feedback
   * @param {Object} explanationResult - Final explanation presented to user
   * @returns {Promise<Object>} - Feedback processing results
   */
  async submitFeedback(feedback, explanationResult) {
    try {
      const feedbackResults = await agentManager.processFeedback(
        feedback,
        explanationResult
      );
      return feedbackResults;
    } catch (error) {
      console.error("Error processing feedback:", error);
      throw error;
    }
  },

  /**
   * Get current processing state
   * @returns {Object} - Current state
   */
  getCurrentState() {
    return agentManager.getCurrentState();
  },

  /**
   * Get processing history
   * @returns {Array} - Processing history
   */
  getProcessingHistory() {
    return agentManager.getProcessingHistory();
  },

  /**
   * Get agent thinking process
   * @param {string} sessionId - Session ID
   * @param {string} agentKey - Agent key
   * @returns {string|null} - Thinking process or null if not found
   */
  getAgentThinking(sessionId, agentKey) {
    return agentManager.getAgentThinking(sessionId, agentKey);
  },

  /**
   * Request workflow termination
   * @param {string} sessionId - Session ID
   * @param {string} rejectedStep - Step that was rejected
   * @param {string} reason - Reason for termination
   * @returns {Promise<boolean>} - Success status
   */
  async requestTermination(sessionId, rejectedStep, reason) {
    return await agentManager.requestTermination(
      sessionId,
      rejectedStep,
      reason
    );
  },
};
