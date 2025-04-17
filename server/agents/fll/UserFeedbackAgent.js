/**
 * User Feedback Agent (A51)
 * Collects and processes user feedback on presented analogies
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");

class UserFeedbackAgent extends BaseAgent {
  constructor() {
    super(
      "User Feedback Agent (A51)",
      "Processes user feedback to assess analogy effectiveness"
    );
    this.prompt = config.agents.userFeedbackPrompt;
  }

  /**
   * Process user feedback on presented analogies
   * @param {Object} userFeedback - Feedback provided by the user
   * @param {Object} presentedAnalogy - The analogy that was presented to the user
   * @returns {Promise<Object>} - Processed feedback
   */
  async processFeedback(userFeedback, presentedAnalogy) {
    // Format the input for feedback processing
    const formattedInput = this.formatFeedbackInput(
      userFeedback,
      presentedAnalogy
    );
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format input for feedback processing
   * @param {Object} userFeedback - Raw user feedback
   * @param {Object} presentedAnalogy - Presented analogy
   * @returns {Object} - Formatted input for feedback processing
   */
  formatFeedbackInput(userFeedback, presentedAnalogy) {
    return {
      userFeedback:
        typeof userFeedback === "string"
          ? userFeedback
          : JSON.stringify(userFeedback),
      presentedAnalogy:
        presentedAnalogy.result?.output || "No analogy data available",
      sourceAgent: presentedAnalogy.name,
      feedbackCategories: [
        "Clarity - Was the analogy clear and understandable?",
        "Relevance - Was the analogy relevant to the user's interests?",
        "Insight - Did the analogy provide new perspectives or understanding?",
        "Engagement - Was the analogy interesting and engaging?",
        "Overall Satisfaction - How satisfied was the user with the analogy?",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new UserFeedbackAgent();
