/**
 * Workflow Utility Functions
 * Contains helper functions for agent workflow management
 */

/**
 * Initialize a new agent session
 * @param {string} sessionId - Optional existing session ID
 * @param {function} resetAgentsFn - Function to reset all agents
 * @returns {string} - Active session ID
 */
function initSession(sessionId = null, resetAgentsFn) {
  const activeSession = sessionId || `session_${Date.now()}`;

  // Reset all agents
  if (resetAgentsFn) {
    resetAgentsFn();
  }

  return activeSession;
}

/**
 * Update orchestrator with the current step progress
 * @param {string} message - Progress message
 * @param {Object} orchestrator - Orchestrator agent
 * @param {Object} currentState - Current workflow state
 * @param {Array} processingHistory - Complete history of agent processing
 * @param {Function} updateStateFn - Function to update state
 * @returns {Promise<void>}
 */
async function updateOrchestrator(
  message,
  orchestrator,
  currentState,
  processingHistory,
  updateStateFn
) {
  try {
    const updateResult = await orchestrator.monitorWorkflow(
      {
        message,
        timestamp: new Date().toISOString(),
        currentState,
      },
      processingHistory[0] // Original workflow plan
    );

    // Update state and emit event
    updateStateFn("orchestratorProgress", updateResult);
  } catch (error) {
    console.error("Error updating orchestrator:", error);
  }
}

/**
 * Start orchestrator monitoring
 * @param {Object} orchestrator - Orchestrator agent
 * @param {Object} agents - All agents object
 * @param {Array} processingHistory - Complete history of agent processing
 * @param {Function} updateStateFn - Function to update state
 * @param {Function} emitEventFn - Function to emit events
 * @param {number} interval - Monitoring interval in milliseconds
 * @returns {NodeJS.Timeout} - Interval ID
 */
function startOrchestratorMonitoring(
  orchestrator,
  agents,
  processingHistory,
  updateStateFn,
  emitEventFn,
  interval = 10000
) {
  return setInterval(async () => {
    try {
      // Get current state of all agents
      const agentStatuses = {};
      for (const [key, agent] of Object.entries(agents)) {
        agentStatuses[key] = agent.getStatus();
      }

      // Send to orchestrator for monitoring
      const monitorResult = await orchestrator.monitorWorkflow(
        agentStatuses,
        processingHistory[0] // Original workflow plan
      );

      // Only update state if there's something significant to report
      // Add proper null/undefined checks
      if (
        monitorResult &&
        (typeof monitorResult === "string"
          ? monitorResult.includes("Alert") ||
            monitorResult.includes("bottleneck") ||
            monitorResult.includes("intervention")
          : monitorResult.result?.output?.includes("Alert") ||
            monitorResult.result?.output?.includes("bottleneck") ||
            monitorResult.result?.output?.includes("intervention"))
      ) {
        updateStateFn("orchestratorMonitor", monitorResult);

        // Emit an event with the appropriate message format
        emitEventFn("orchestratorUpdate", {
          timestamp: new Date().toISOString(),
          message:
            typeof monitorResult === "string"
              ? monitorResult
              : monitorResult.result?.output || "Orchestrator update",
        });
      }
    } catch (error) {
      console.error("Error in orchestrator monitoring:", error);
    }
  }, interval);
}

/**
 * Handle workflow termination
 * @param {Object} terminationData - Information about the termination
 * @param {Object} orchestrator - Orchestrator agent
 * @param {string} activeSession - Active session ID
 * @param {Object} currentState - Current workflow state
 * @param {Array} processingHistory - Complete history of agent processing
 * @param {Function} emitEventFn - Function to emit events
 * @returns {Promise<Object>} - Termination summary
 */
async function handleWorkflowTermination(
  terminationData,
  orchestrator,
  activeSession,
  currentState,
  processingHistory,
  emitEventFn
) {
  try {
    // Update state to reflect termination
    currentState.terminated = true;
    currentState.endTime = Date.now();
    currentState.totalDuration = currentState.endTime - currentState.startTime;
    currentState.terminationReason =
      terminationData.reason || "User rejected a step";

    // Let orchestrator handle the termination
    const terminationSummary = await orchestrator.handleTermination({
      ...terminationData,
      sessionId: activeSession,
      timestamp: new Date().toISOString(),
    });

    // Add to processing history
    processingHistory.push({
      name: "Termination",
      processed: true,
      result: {
        output: `Workflow terminated at step ${terminationData.rejectedStep}. Reason: ${terminationData.reason}`,
      },
      timestamp: new Date().toISOString(),
    });

    // Emit termination event
    emitEventFn("terminated", {
      sessionId: activeSession,
      step: terminationData.rejectedStep,
      reason: terminationData.reason,
      timestamp: new Date().toISOString(),
    });

    return terminationSummary;
  } catch (error) {
    console.error("Error handling termination:", error);
    throw error;
  }
}

/**
 * Process user feedback
 * @param {string} feedback - User feedback
 * @param {Object} explanationResult - Final explanation presented to user
 * @param {Object} userFeedbackAgent - User feedback agent
 * @param {Object} learningAgent - Learning agent
 * @param {Array} processingHistory - Complete history of agent processing
 * @param {Function} updateStateFn - Function to update state
 * @returns {Promise<Object>} - Processed feedback and learning insights
 */
async function processFeedback(
  feedback,
  explanationResult,
  userFeedbackAgent,
  learningAgent,
  processingHistory,
  updateStateFn
) {
  try {
    // Process user feedback
    const feedbackResult = await userFeedbackAgent.processFeedback(
      feedback,
      explanationResult
    );
    updateStateFn("userFeedback", feedbackResult);

    // Generate learning insights
    const learningResult = await learningAgent.analyzeForImprovements(
      feedbackResult,
      processingHistory
    );
    updateStateFn("learning", learningResult);

    return {
      feedback: feedbackResult,
      learning: learningResult,
    };
  } catch (error) {
    console.error("Error processing feedback:", error);
    throw error;
  }
}

module.exports = {
  initSession,
  updateOrchestrator,
  startOrchestratorMonitoring,
  handleWorkflowTermination,
  processFeedback,
};
