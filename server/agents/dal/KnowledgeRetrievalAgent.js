/**
 * Knowledge Retrieval Agent (A22)
 * Accesses external knowledge bases to gather information on identified topics
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");

class KnowledgeRetrievalAgent extends BaseAgent {
  constructor() {
    super(
      "Knowledge Retrieval Agent (A22)",
      "Retrieves relevant factual information related to identified topics to support analogy generation"
    );
    this.prompt = config.agents.knowledgeRetrievalPrompt;
  }

  /**
   * Retrieve knowledge related to identified topics
   * @param {Object} analysisResults - Results from Content Analysis Agent
   * @returns {Promise<Object>} - Retrieved knowledge and context
   */
  async retrieveKnowledge(analysisResults) {
    // Format the analysis results to focus on key topics
    const formattedInput = this.formatAnalysisResults(analysisResults);
    return this.process(formattedInput, this.prompt);
  }

  /**
   * Format analysis results to extract key topics for knowledge retrieval
   * @param {Object} analysisResults - Results from Content Analysis Agent
   * @returns {Object} - Formatted input for knowledge retrieval
   */
  formatAnalysisResults(analysisResults) {
    // Extract the analysis output and structure it for knowledge retrieval
    try {
      const result = analysisResults.result?.output || "";

      // Try to parse if it's a JSON string, otherwise use as is
      let parsedResult;
      try {
        parsedResult = JSON.parse(result);
      } catch (e) {
        parsedResult = { content: result };
      }

      return {
        analysisOutput: result,
        sourceAgent: analysisResults.name,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error formatting analysis results:", error);
      return {
        error: "Failed to format analysis results",
        raw: analysisResults,
      };
    }
  }
}

module.exports = new KnowledgeRetrievalAgent();
