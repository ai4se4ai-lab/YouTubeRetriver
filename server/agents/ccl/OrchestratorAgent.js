/**
 * Orchestrator Agent (A6)
 * Manages workflow and coordination among all agents
 */
const BaseAgent = require("../BaseAgent");
const config = require("../../config/config");

class OrchestratorAgent extends BaseAgent {
  constructor() {
    super(
      "Orchestrator Agent (A6)",
      "Manages the workflow and coordination among all agents"
    );
    this.prompt = config.agents.orchestratorPrompt;
  }

  /**
   * Plan and coordinate agent workflow
   * @param {Object} inputData - Input data and processing requirements
   * @returns {Promise<Object>} - Processing plan and coordination guidelines
   */
  async planWorkflow(inputData) {
    return this.process(inputData, this.prompt);
  }

  /**
   * Monitor and adjust workflow as needed
   * @param {Object} currentState - Current state of all agents
   * @param {Object} originalPlan - Original processing plan
   * @returns {Promise<Object>} - Updated coordination instructions
   */
  async monitorWorkflow(currentState, originalPlan) {
    const monitoringPrompt = `${this.prompt} You are now monitoring the execution of a workflow. 
    Analyze the current state compared to the original plan. Identify any issues or bottlenecks and suggest adjustments.`;

    const formattedInput = {
      currentState: currentState,
      originalPlan: originalPlan.result?.output || "No original plan available",
      timestamp: new Date().toISOString(),
    };

    return this.process(formattedInput, monitoringPrompt);
  }

  /**
   * Summarize the complete workflow execution
   * @param {Array} processingHistory - Complete history of agent processing
   * @returns {Promise<Object>} - Workflow summary and evaluation
   */
  async summarizeWorkflow(processingHistory) {
    const summaryPrompt = `${this.prompt} Summarize the entire workflow execution. 
    Evaluate overall effectiveness, identify strengths and weaknesses, and provide an executive summary of the process.`;

    const formattedInput = {
      processingSteps: processingHistory.map((step) => ({
        agent: step.name,
        duration: step.duration,
        success: step.processed,
        hasError: !!step.error,
      })),
      totalDuration: processingHistory.reduce(
        (total, step) => total + (step.duration || 0),
        0
      ),
      successRate:
        processingHistory.filter((step) => step.processed).length /
        processingHistory.length,
      timestamp: new Date().toISOString(),
    };

    return this.process(formattedInput, summaryPrompt);
  }
}

module.exports = new OrchestratorAgent();
