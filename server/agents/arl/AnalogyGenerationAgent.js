/**
 * Analogy Generation Agent (A31)
 * Creates analogies by mapping user interests to complex concepts
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");

class AnalogyGenerationAgent extends BaseAgent {
  constructor() {
    super(
      "Analogy Generation Agent (A31)",
      "Creates meaningful analogies that connect user interests to concepts in humanities, science, ethics, or other domains"
    );
    this.prompt = config.agents.analogyGenerationPrompt;
  }

  /**
   * Generate analogies based on analysis and knowledge
   * @param {Object} input - Combined output from Content Analysis and Knowledge Retrieval
   * @returns {Promise<Object>} - Generated analogies
   */
  async generateAnalogies(input) {
    // Format the combined input for analogy generation
    const formattedInput = this.formatInput(input);
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format the combined input for analogy generation
   * @param {Object} input - Combined data from previous agents
   * @returns {Object} - Formatted input for analogy generation
   */
  formatInput(input) {
    return {
      contentAnalysis:
        input.contentAnalysis?.result?.output ||
        "No content analysis available",
      knowledgeContext:
        input.knowledgeRetrieval?.result?.output ||
        "No knowledge context available",
      gitAnalysis:
        input.gitAnalysis?.result?.output || "No Git analysis available",
      sourceAgents: [
        input.contentAnalysis?.name || "Unknown",
        input.knowledgeRetrieval?.name || "Unknown",
        input.gitAnalysis?.name || "Unknown",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new AnalogyGenerationAgent();
