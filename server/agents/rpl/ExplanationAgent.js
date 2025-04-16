/**
 * Explanation Agent (A4)
 * Presents the final analogies to the user in an understandable and engaging manner
 */
const BaseAgent = require("../BaseAgent");
const config = require("../../config/config");

class ExplanationAgent extends BaseAgent {
  constructor() {
    super(
      "Explanation Agent (A4)",
      "Presents analogies to users in an understandable and engaging manner"
    );
    this.prompt = config.agents.explanationPrompt;
  }

  /**
   * Create user-friendly explanation of analogies
   * @param {Object} refinedAnalogies - Refined analogies from Refinement Agent
   * @param {Object} userData - Original user data and interests
   * @returns {Promise<Object>} - User-ready explanation
   */
  async createExplanation(refinedAnalogies, userData) {
    // Format the input for explanation
    const formattedInput = this.formatExplanationInput(
      refinedAnalogies,
      userData
    );
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format input for explanation creation
   * @param {Object} refinedAnalogies - Refined analogies
   * @param {Object} userData - User data and interests
   * @returns {Object} - Formatted input for explanation
   */
  formatExplanationInput(refinedAnalogies, userData) {
    return {
      refinedAnalogies:
        refinedAnalogies.result?.output || "No refined analogies available",
      userInterests:
        userData.contentAnalysis?.result?.output ||
        "No user interests identified",
      sourceAgent: refinedAnalogies.name,
      presentationGoals: [
        "Create clear, engaging explanations",
        "Highlight relevance to user interests",
        "Emphasize educational value",
        "Use appropriate language and examples",
        "Structure information for easy comprehension",
      ],
      includeElements: [
        "Main analogy explanation",
        "Connection to user interests",
        "Educational insights gained",
        "Potential further explorations",
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new ExplanationAgent();
