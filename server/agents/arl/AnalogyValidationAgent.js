/**
 * Analogy Validation Agent (A32)
 * Evaluates generated analogies for accuracy, relevance, and educational value
 */
const BaseAgent = require("../BaseAgent");
const config = require("../../config/config");

class AnalogyValidationAgent extends BaseAgent {
  constructor() {
    super(
      "Analogy Validation Agent (A32)",
      "Evaluates generated analogies for accuracy, relevance, and educational value"
    );
    this.prompt = config.agents.analogyValidationPrompt;
  }

  /**
   * Validate generated analogies
   * @param {Object} analogies - Output from Analogy Generation Agent
   * @param {Object} originalData - Original content analysis and knowledge
   * @returns {Promise<Object>} - Validation results and feedback
   */
  async validateAnalogies(analogies, originalData) {
    // Format the input for validation
    const formattedInput = this.formatValidationInput(analogies, originalData);
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format input for validation
   * @param {Object} analogies - Generated analogies
   * @param {Object} originalData - Content analysis and knowledge retrieval data
   * @returns {Object} - Formatted input for validation
   */
  formatValidationInput(analogies, originalData) {
    return {
      generatedAnalogies: analogies.result?.output || "No analogies provided",
      originalContentAnalysis:
        originalData.contentAnalysis?.result?.output ||
        "No content analysis available",
      originalKnowledgeContext:
        originalData.knowledgeRetrieval?.result?.output ||
        "No knowledge context available",
      sourceAgent: analogies.name,
      validationCriteria: [
        "Accuracy - Does the analogy correctly represent the concepts?",
        "Relevance - Is the analogy clearly related to the user's interests?",
        "Educational Value - Does the analogy provide new insights or perspectives?",
        "Clarity - Is the analogy easy to understand?",
        "Engagement - Is the analogy likely to be interesting to the user?",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new AnalogyValidationAgent();
