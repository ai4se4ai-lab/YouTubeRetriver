/**
 * Learning Agent (A52)
 * Analyzes feedback to improve the analogy generation process
 */
const BaseAgent = require("../BaseAgent");
const config = require("../../config/config");

class LearningAgent extends BaseAgent {
  constructor() {
    super(
      "Learning Agent (A52)",
      "Analyzes feedback to update and improve the analogy generation process"
    );
    this.prompt = config.agents.learningPrompt;
  }

  /**
   * Analyze feedback to generate system improvements
   * @param {Object} processedFeedback - Processed feedback from User Feedback Agent
   * @param {Array} processingHistory - History of the analogy generation process
   * @returns {Promise<Object>} - Learning insights and improvement suggestions
   */
  async analyzeForImprovements(processedFeedback, processingHistory) {
    // Format the input for learning analysis
    const formattedInput = this.formatLearningInput(
      processedFeedback,
      processingHistory
    );
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format input for learning analysis
   * @param {Object} processedFeedback - Processed user feedback
   * @param {Array} processingHistory - System processing history
   * @returns {Object} - Formatted input for learning analysis
   */
  formatLearningInput(processedFeedback, processingHistory) {
    // Create a summary of the processing steps
    const processingSteps = processingHistory.map((step) => ({
      agent: step.name,
      duration: step.duration,
      success: step.processed,
      hasError: !!step.error,
    }));

    return {
      processedFeedback:
        processedFeedback.result?.output || "No processed feedback available",
      processingSteps: processingSteps,
      sourceAgent: processedFeedback.name,
      improvementAreas: [
        "Content Analysis - Effectiveness in identifying relevant user interests",
        "Knowledge Retrieval - Quality and relevance of retrieved information",
        "Analogy Generation - Creativity and insight of initial analogies",
        "Analogy Validation - Accuracy and helpfulness of validation",
        "Analogy Refinement - Quality improvements made during refinement",
        "Explanation - Clarity and engagement of final presentation",
        "Overall Process - End-to-end effectiveness and efficiency",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new LearningAgent();
