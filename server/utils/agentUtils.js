/**
 * Agent Utility Functions
 * Contains helper functions for agent processing
 */

/**
 * Merge edited content with original result object
 * @param {Object} originalResult - Original result object
 * @param {Object} editedResult - Potentially edited result object
 * @returns {Object} - Merged result object
 */
function mergeEditedContent(originalResult, editedResult) {
  // If no edited content, return original
  if (!editedResult) {
    return originalResult;
  }

  // Create a copy of the original result
  const mergedResult = JSON.parse(JSON.stringify(originalResult));

  // If the edited result has updated output, use it
  if (editedResult.result && editedResult.result.output) {
    mergedResult.result.output = editedResult.result.output;
  }

  return mergedResult;
}

/**
 * Update agent state with a new step
 * @param {Object} stateObject - Current state object
 * @param {Array} processingHistory - Processing history array
 * @param {string} agentName - Name of the agent
 * @param {Object} result - Processing result
 * @param {Function} emitCallback - Function to emit events
 * @param {Object} agents - All agents object
 * @returns {void}
 */
function updateAgentState(stateObject, processingHistory, agentName, result, emitCallback, agents) {
  // Special handling for Git Analysis Agent in monitoring mode
  if (agentName === "gitAnalysis" && agents.gitAnalysis.isMonitoring) {
    // Clone result but override processed state
    const monitoringResult = { ...result, processed: false };
    processingHistory.push(monitoringResult);

    stateObject.steps.push({
      agentName,
      timestamp: Date.now(),
      duration: result.duration,
      success: true, // Always consider successful in monitoring mode
      hasError: !!result.error,
      isMonitoring: true,
    });

    // Emit update event with monitoring state
    emitCallback("stateUpdate", {
      agent: agentName,
      result: monitoringResult,
      state: stateObject,
      isMonitoring: true,
    });
  } else {
    processingHistory.push(result);

    stateObject.steps.push({
      agentName,
      timestamp: Date.now(),
      duration: result.duration,
      success: result.processed,
      hasError: !!result.error,
    });

    // Emit update event
    emitCallback("stateUpdate", {
      agent: agentName,
      result: result,
      state: stateObject,
    });
  }
}

/**
 * Determines if an agent needs approval based on configuration
 * @param {string} agentName - The name of the agent
 * @param {string|Array} requiredApprovals - Config for required approvals
 * @param {Object} options - Processing options
 * @returns {boolean} - Whether the agent needs approval
 */
function needsApproval(agentName, requiredApprovals, options = {}) {
  // Override with automatic approvals if specified
  if (options.automaticApprovals) return false;

  if (requiredApprovals === "all") return true;
  if (requiredApprovals === "none") return false;
  return Array.isArray(requiredApprovals) && requiredApprovals.includes(agentName);
}

/**
 * Conditional approval function that checks the configuration
 * @param {string} agentName - The name of the agent
 * @param {Object} result - The result to potentially approve
 * @param {Function} approvalCallback - The callback for user approval
 * @param {string|Array} requiredApprovals - Config for required approvals
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - The approved result
 */
async function conditionalApproval(agentName, result, approvalCallback, requiredApprovals, options = {}) {
  console.log(
    `Checking if ${agentName} requires user approval based on configuration`
  );
  if (needsApproval(agentName, requiredApprovals, options)) {
    console.log(
      `User approval required for ${agentName} based on configuration`
    );
    // Request approval from user
    return approvalCallback(agentName, result);
  } else {
    // Skip approval and continue immediately
    console.log(
      `Skipping approval for ${agentName} based on configuration`
    );
    return result;
  }
}

/**
 * Summarize agent output for display
 * @param {string} output - Raw output to summarize
 * @param {number} maxWords - Maximum number of words to include
 * @returns {string} - Summarized and cleaned output
 */
function summarizeAgentOutput(output, maxWords = 250) {
  if (!output) return "";

  // Remove technical data like tokens, usage, etc.
  let cleaned = output.replace(/prompt_tokens.*?[,}]/g, "");
  cleaned = cleaned.replace(/completion_tokens.*?[,}]/g, "");
  cleaned = cleaned.replace(/total_tokens.*?[,}]/g, "");
  cleaned = cleaned.replace(/usage.*?}/g, "");
  cleaned = cleaned.replace(/{"output": /g, "");
  cleaned = cleaned.replace(/},?\s*$/g, "");

  // Remove any JSON formatting artifacts
  cleaned = cleaned.replace(/```json\s*|```\s*$/g, "");

  // Remove any token or technical stats that might be in text form
  cleaned = cleaned.replace(/Tokens used:.*$/gm, "");
  cleaned = cleaned.replace(/Total tokens:.*$/gm, "");
  cleaned = cleaned.replace(/Processing time:.*$/gm, "");

  // Remove quotes at beginning and end if they exist (from JSON)
  cleaned = cleaned.replace(/^"/, "").replace(/"$/, "");

  // Split into words and limit to maxWords
  const words = cleaned.split(/\s+/);
  if (words.length <= maxWords) return cleaned;

  return words.slice(0, maxWords).join(" ") + "...";
}

/**
 * Get agent statuses
 * @param {Object} agents - All agents object
 * @returns {Object} - Status of all agents
 */
function getAgentStatuses(agents) {
  const statuses = {};
  for (const [key, agent] of Object.entries(agents)) {
    statuses[key] = agent.getStatus();
  }
  return statuses;
}

/**
 * Reset all agents to initial state
 * @param {Object} agents - All agents object
 */
function resetAllAgents(agents) {
  Object.values(agents).forEach((agent) => agent.reset());
}

module.exports = {
  mergeEditedContent,
  updateAgentState,
  needsApproval,
  conditionalApproval,
  summarizeAgentOutput,
  getAgentStatuses,
  resetAllAgents
};