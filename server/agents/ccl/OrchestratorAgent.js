/**
 * Orchestrator Agent (A6)
 * Manages workflow and coordination among all agents
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");

class OrchestratorAgent extends BaseAgent {
  constructor() {
    super(
      "Orchestrator Agent (A6)",
      "Manages the workflow and coordination among all agents"
    );
    this.prompt = config.agents.orchestratorPrompt;
    this.lastMonitoringTime = null;
    this.monitoringHistory = [];
    this.isTerminated = false;
  }

  /**
   * Plan and coordinate agent workflow
   * @param {Object} inputData - Input data and processing requirements
   * @returns {Promise<Object>} - Processing plan and coordination guidelines
   */
  async planWorkflow(inputData) {
    this.lastMonitoringTime = Date.now();
    const result = await this.process(inputData, this.prompt);

    // Initialize monitoring history with the initial plan
    this.monitoringHistory = [
      {
        timestamp: new Date().toISOString(),
        event: "Workflow initialized",
        details: "Initial workflow plan created",
      },
    ];

    return result;
  }

  /**
   * Monitor and adjust workflow as needed
   * @param {Object} currentState - Current state of all agents
   * @param {Object} originalPlan - Original processing plan
   * @returns {Promise<Object>} - Updated coordination instructions
   */
  async monitorWorkflow(currentState, originalPlan) {
    // If workflow is terminated, add that information to the monitoring prompt
    const termState = this.isTerminated
      ? "This workflow has been terminated. "
      : "";

    const monitoringPrompt = `${this.prompt} 

${termState}You are now actively monitoring the execution of a multi-agent workflow. Your role is to:

1. Continuously observe all agent states and identify any issues or bottlenecks
2. Detect if any agent is stuck or not progressing as expected
3. Provide real-time guidance to optimize the workflow
4. Alert if user intervention might be needed
5. Ensure the overall process stays on track according to the original plan

If you identify any concerning patterns or issues that require attention, prefix your response with "ALERT: " followed by a concise description of the issue.

Otherwise, provide a brief status summary and any optimization recommendations.
`;

    // Add time since last monitoring check
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastMonitoringTime;
    this.lastMonitoringTime = now;

    // Record this monitoring event
    this.monitoringHistory.push({
      timestamp: new Date().toISOString(),
      event: "Monitoring check",
      timeSinceLastCheck: `${Math.round(timeSinceLastCheck / 1000)} seconds`,
    });

    const formattedInput = {
      currentState: currentState,
      originalPlan:
        originalPlan?.result?.output || "No original plan available",
      monitoringHistory: this.monitoringHistory,
      timeSinceLastCheck: `${Math.round(timeSinceLastCheck / 1000)} seconds`,
      timestamp: new Date().toISOString(),
      isTerminated: this.isTerminated,
    };

    return this.process(formattedInput, monitoringPrompt);
  }

  /**
   * Summarize the complete workflow execution
   * @param {Array} processingHistory - Complete history of agent processing
   * @returns {Promise<Object>} - Workflow summary and evaluation
   */
  async summarizeWorkflow(processingHistory) {
    // Add termination status to summary prompt if applicable
    const termStatus = this.isTerminated
      ? "Note: This workflow was terminated early by user request. "
      : "";

    const summaryPrompt = `${this.prompt} 
    
${termStatus}Your task is to summarize the entire workflow execution. Analyze the following:

1. Overall effectiveness and efficiency of the multi-agent system
2. Key strengths and weaknesses identified throughout the process
3. Specific contributions of each agent
4. Any bottlenecks or issues that occurred
5. Recommendations for future workflow improvements
6. The quality of content passed between agents
7. Impact of any user edits on the workflow
8. Executive summary of the entire process

Organize your response into clearly labeled sections.`;

    // Add monitoring history to show continuous oversight
    const formattedInput = {
      processingSteps: processingHistory.map((step) => ({
        agent: step.name,
        duration: step.duration,
        success: step.processed,
        hasError: !!step.error,
      })),
      monitoringHistory: this.monitoringHistory,
      totalDuration: processingHistory.reduce(
        (total, step) => total + (step.duration || 0),
        0
      ),
      successRate:
        processingHistory.filter((step) => step.processed).length /
        processingHistory.length,
      timestamp: new Date().toISOString(),
      isTerminated: this.isTerminated,
    };

    return this.process(formattedInput, summaryPrompt);
  }

  /**
   * Provide oversight for a specific agent's progress
   * @param {string} agentName - Name of the agent
   * @param {Object} agentState - Current state of the agent
   * @param {Object} previousResults - Results from previous agents
   * @returns {Promise<Object>} - Oversight guidance
   */
  async provideAgentOversight(agentName, agentState, previousResults) {
    const oversightPrompt = `${this.prompt}
    
You are now focusing on providing specific oversight for the ${agentName}. Your role is to:

1. Analyze the current state of this agent in the workflow
2. Check if the agent has all necessary information from previous agents
3. Verify the quality and relevance of its current outputs
4. Identify any assistance or clarification the agent might need
5. Ensure the agent's output aligns with the overall workflow objectives

Provide concise but thorough guidance to optimize this agent's performance.`;

    const formattedInput = {
      agentName,
      agentState,
      previousResults,
      timestamp: new Date().toISOString(),
    };

    // Record this oversight event
    this.monitoringHistory.push({
      timestamp: new Date().toISOString(),
      event: "Agent oversight",
      agent: agentName,
    });

    return this.process(formattedInput, oversightPrompt);
  }

  /**
   * Handle workflow termination
   * @param {Object} terminationData - Information about the termination
   * @returns {Promise<Object>} - Termination handling result
   */
  async handleTermination(terminationData) {
    // Set termination flag
    this.isTerminated = true;

    const terminationPrompt = `${this.prompt}
  
The workflow has been terminated early because the user rejected results from the ${terminationData.rejectedStep} agent.
Your task is to:

1. Acknowledge the termination request
2. Provide a summary of what was completed before termination
3. Suggest alternative approaches or improvements for future attempts
4. Ensure all resources are properly released and the system is in a clean state

Format your response as a detailed termination report.`;

    // Record this termination event
    this.monitoringHistory.push({
      timestamp: new Date().toISOString(),
      event: "Workflow terminated",
      reason: terminationData.reason,
      rejectedStep: terminationData.rejectedStep,
    });

    return this.process(terminationData, terminationPrompt);
  }

  /**
   * Reset the agent state including monitoring history
   */
  reset() {
    super.reset();
    this.lastMonitoringTime = null;
    this.monitoringHistory = [];
    this.isTerminated = false;
  }
}

module.exports = new OrchestratorAgent();
