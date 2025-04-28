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
// In mergeEditedContent function
function mergeEditedContent(originalResult, editedResult) {
  // Handle string results
  if (typeof originalResult === "string") {
    return typeof editedResult === "string" ? editedResult : originalResult;
  }

  // Handle object results (backwards compatibility)
  if (!editedResult) {
    return originalResult;
  }

  // Create a copy of the original result
  const mergedResult = JSON.parse(JSON.stringify(originalResult));

  // If the edited result has updated output, use it
  if (typeof editedResult === "string") {
    mergedResult.result.output = editedResult;
  } else if (editedResult.result && editedResult.result.output) {
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
function updateAgentState(
  stateObject,
  processingHistory,
  agentName,
  result,
  emitCallback,
  agents
) {
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
  console.log("DEBUGGING APPROVALS:", {
    agentName,
    requiredApprovals,
    options,
    automaticApprovals: options.automaticApprovals,
  });

  // Override with automatic approvals if specified
  if (options.automaticApprovals) {
    console.log(`Auto approvals enabled, skipping approval for ${agentName}`);
    return false;
  }

  const needsIt =
    requiredApprovals === "all" ||
    (Array.isArray(requiredApprovals) && requiredApprovals.includes(agentName));

  console.log(`${agentName} needs approval: ${needsIt}`);
  return needsIt;
}

async function conditionalApproval(
  agentName,
  result,
  approvalCallback,
  requiredApprovals,
  options = {}
) {
  console.log(`CONDITIONAL APPROVAL CHECK for ${agentName}`, {
    requiredApprovals,
    options,
  });

  const approval = needsApproval(agentName, requiredApprovals, options);
  console.log(`Approval decision for ${agentName}: ${approval}`);

  if (approval) {
    console.log(`Requesting user approval for ${agentName}`);
    return approvalCallback(agentName, result);
  } else {
    console.log(`Skipping approval for ${agentName}`);
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
  resetAllAgents,
};
