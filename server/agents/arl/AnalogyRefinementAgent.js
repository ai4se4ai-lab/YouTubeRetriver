/**
 * Analogy Refinement Agent (A33)
 * Refines analogies based on validation feedback
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");

class AnalogyRefinementAgent extends BaseAgent {
  constructor() {
    super(
      "Analogy Refinement Agent (A33)",
      "Refines analogies based on validation feedback to ensure clarity and effectiveness"
    );
    this.prompt = config.agents.analogyRefinementPrompt;
  }

  /**
   * Refine analogies based on validation feedback
   * @param {Object} validationResults - Results from Analogy Validation Agent
   * @param {Object} originalAnalogies - Original analogies from Generation Agent
   * @returns {Promise<Object>} - Refined analogies
   */
  async refineAnalogies(validationResults, originalAnalogies) {
    // Format the input for refinement
    const formattedInput = this.formatRefinementInput(
      validationResults,
      originalAnalogies
    );
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format input for analogy refinement
   * @param {Object} validationResults - Validation feedback
   * @param {Object} originalAnalogies - Original generated analogies
   * @returns {Object} - Formatted input for refinement
   */
  formatRefinementInput(validationResults, originalAnalogies) {
    return {
      originalAnalogies:
        originalAnalogies.result?.output || "No original analogies provided",
      validationFeedback:
        validationResults.result?.output || "No validation feedback provided",
      sourceAgents: [
        originalAnalogies.name || "Unknown",
        validationResults.name || "Unknown",
      ],
      refinementGoals: [
        "Improve clarity and comprehensibility",
        "Enhance accuracy and relevance",
        "Increase educational value",
        "Maintain or improve engagement factor",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new AnalogyRefinementAgent();
