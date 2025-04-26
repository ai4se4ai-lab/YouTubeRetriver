/**
 * Agent Display Utility Functions
 * Contains helper functions for agent display and interaction
 */

// Create namespace for agent display utilities
window.agentDisplayUtils = (function () {
  /**
   * Event handler for socket state updates
   * @param {Object} update - The state update
   * @param {Object} agentSystem - Agent system state
   * @param {Function} updateUI - Function to update UI
   * @param {Function} drawAgentConnections - Function to draw agent connections
   */
  function handleStateUpdate(
    update,
    agentSystem,
    updateUI,
    drawAgentConnections
  ) {
    console.log("State update received:", update);

    // Special handling for Git Analysis Agent in monitoring mode
    if (update.agent === "gitAnalysis" && update.isMonitoring) {
      agentSystem.agents[update.agent].status = "processing"; // Keep in processing state
      agentSystem.agents[update.agent].result = update.result;

      // Update UI to show it's actively monitoring
      const gitCard = document.getElementById("gitAnalysis-card");
      if (gitCard) {
        gitCard.classList.remove("completed", "error", "idle");
        gitCard.classList.add("processing");

        const statusElement = gitCard.querySelector(".agent-status");
        if (statusElement) {
          statusElement.textContent = "Monitoring";
          statusElement.className = statusElement.className
            .replace(/idle|processing|completed|error|waiting/g, "")
            .trim();
          statusElement.classList.add("processing");
        }
      }
    } else {
      // Regular update handling for other agents
      if (update.agent && agentSystem.agents[update.agent]) {
        agentSystem.agents[update.agent].status = update.result.processed
          ? "completed"
          : "error";
        agentSystem.agents[update.agent].result = update.result;

        // If this was the pending approval, clear it
        if (agentSystem.workflow.pendingApproval === update.agent) {
          agentSystem.workflow.pendingApproval = null;
        }

        // Special handling for orchestrator
        if (update.agent.includes("orchestrator")) {
          window.uiUtils.updateOrchestratorStatus("active", agentSystem);
        }
      }
    }

    updateUI(agentSystem, drawAgentConnections);
  }

  /**
   * Event handler for processing step updates
   * @param {Object} stepInfo - The step info
   * @param {Object} agentSystem - Agent system state
   * @param {Function} updateUI - Function to update UI
   * @param {Function} updateOrchestratorStatus - Function to update orchestrator status
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   */
  function handleProcessingStep(
    stepInfo,
    agentSystem,
    updateUI,
    updateOrchestratorStatus,
    addOrchestratorMessage
  ) {
    console.log("Processing step update:", stepInfo);

    if (stepInfo.step && agentSystem.agents[stepInfo.step]) {
      agentSystem.workflow.currentStep = stepInfo.step;
      agentSystem.agents[stepInfo.step].status = "processing";

      // If a new step is starting, update orchestrator status
      updateOrchestratorStatus("active", agentSystem);
      addOrchestratorMessage(
        `Monitoring step: ${stepInfo.step} - ${stepInfo.status}`,
        false,
        agentSystem
      );
    }

    updateUI(agentSystem);
  }

  /**
   * Event handler for step approvals
   * @param {Object} data - The approval data
   * @param {Object} agentSystem - Agent system state
   * @param {Function} updateUI - Function to update UI
   * @param {Function} hideApprovalModal - Function to hide approval modal
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @param {Function} showFeedbackModal - Function to show feedback modal
   */
  function handleStepApproved(
    data,
    agentSystem,
    updateUI,
    hideApprovalModal,
    addOrchestratorMessage,
    showFeedbackModal
  ) {
    console.log("Step approved:", data);

    if (data.step && agentSystem.agents[data.step]) {
      // Properly update the agent status to completed
      agentSystem.agents[data.step].status = "completed";
      agentSystem.workflow.pendingApproval = null;
      hideApprovalModal();

      // Add orchestrator message about the approval
      addOrchestratorMessage(
        `${data.step} was approved${
          data.wasEdited ? " with edits" : ""
        }. Proceeding to next step.`,
        false,
        agentSystem
      );

      // If this was the explanation agent, automatically display the feedback modal
      if (data.step === "explanation") {
        setTimeout(() => {
          showFeedbackModal(agentSystem, addOrchestratorMessage);
        }, 1000); // Small delay to ensure UI updates first
      }
    }

    updateUI(agentSystem);
  }

  /**
   * Event handler for feedback processed
   * @param {Object} data - The feedback data
   * @param {Object} agentSystem - Agent system state
   * @param {Function} updateUI - Function to update UI
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @param {Function} showFinalResultsModal - Function to show final results modal
   */
  function handleFeedbackProcessed(
    data,
    agentSystem,
    updateUI,
    addOrchestratorMessage,
    showFinalResultsModal
  ) {
    console.log("Feedback processed:", data);

    if (data.results) {
      agentSystem.agents.userFeedback.status = "completed";
      agentSystem.agents.userFeedback.result = data.results.feedback;

      agentSystem.agents.learning.status = "completed";
      agentSystem.agents.learning.result = data.results.learning;

      // Add orchestrator message
      addOrchestratorMessage(
        "Feedback successfully processed and analyzed by learning agent.",
        false,
        agentSystem
      );

      // Show final results modal
      showFinalResultsModal(false, agentSystem);
    }

    updateUI(agentSystem);
  }

  /**
   * Event handler for orchestrator updates
   * @param {Object} update - The update data
   * @param {Object} agentSystem - Agent system state
   * @param {Function} updateOrchestratorStatus - Function to update orchestrator status
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @param {Function} updateUI - Function to update UI
   */
  function handleOrchestratorUpdate(
    update,
    agentSystem,
    updateOrchestratorStatus,
    addOrchestratorMessage,
    updateUI
  ) {
    console.log("Orchestrator update received:", update);

    // Update orchestrator status
    updateOrchestratorStatus("active", agentSystem);

    // Add message
    addOrchestratorMessage(update.message, false, agentSystem);

    updateUI(agentSystem);
  }

  /**
   * Event handler for errors
   * @param {Object} error - The error data
   * @param {Object} agentSystem - Agent system state
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @param {Function} updateUI - Function to update UI
   */
  function handleError(error, agentSystem, addOrchestratorMessage, updateUI) {
    console.error("Socket error:", error);
    alert(`Error: ${error.message}`);

    // Add error to orchestrator
    addOrchestratorMessage(`ERROR: ${error.message}`, true, agentSystem);

    updateUI(agentSystem);
  }

  /**
   * Trigger Git analysis
   * @param {string} sessionId - Session ID
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @returns {Promise<Object>} - Analysis result
   */
  async function triggerGitAnalysis(sessionId, addOrchestratorMessage) {
    if (!sessionId) {
      console.error("No active session for Git analysis");
      return;
    }

    try {
      const response = await fetch("/api/agents/trigger-git-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify({ sessionId: sessionId }),
      });

      const data = await response.json();
      console.log("Git analysis triggered:", data);
      addOrchestratorMessage("Manual Git analysis triggered", false);
      return data;
    } catch (error) {
      console.error("Error triggering Git analysis:", error);
      alert(`Failed to trigger Git analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Poll for status updates
   * @param {string} sessionId - Session ID
   * @param {Object} agentSystem - Agent system state
   * @param {Function} fetchPendingStepDetails - Function to fetch pending step details
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @param {Function} updateUI - Function to update UI
   * @returns {NodeJS.Timeout} - Interval ID
   */
  function startStatusPolling(
    sessionId,
    agentSystem,
    fetchPendingStepDetails,
    addOrchestratorMessage,
    updateUI
  ) {
    // Poll every 3 seconds
    return setInterval(async () => {
      if (
        !sessionId ||
        !agentSystem.workflow.started ||
        agentSystem.workflow.completed ||
        agentSystem.workflow.terminated
      ) {
        clearInterval(agentSystem.statusPollInterval);
        return;
      }

      try {
        const response = await fetch(`/api/agents/status/${sessionId}`, {
          headers: {
            Authorization: `Bearer ${auth.getAccessToken()}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to get status");
        }

        const data = await response.json();

        // Check for pending approvals
        if (data.pendingApprovals && data.pendingApprovals.length > 0) {
          const pendingStep = data.pendingApprovals[0];

          if (pendingStep !== agentSystem.workflow.pendingApproval) {
            agentSystem.workflow.pendingApproval = pendingStep;
            agentSystem.agents[pendingStep].status = "waiting";

            // Add orchestrator message about pending approval
            addOrchestratorMessage(
              `Waiting for user approval on ${pendingStep} results.`,
              false,
              agentSystem
            );

            // Fetch step details and show approval modal
            fetchPendingStepDetails(pendingStep);
          }
        }

        // Check if workflow is completed
        if (data.state && data.state.completed) {
          agentSystem.workflow.completed = true;
          clearInterval(agentSystem.statusPollInterval);

          // Add orchestrator message
          addOrchestratorMessage(
            "Workflow completed successfully. Final results ready.",
            false,
            agentSystem
          );
        }

        updateUI(agentSystem);
      } catch (error) {
        console.error("Error polling status:", error);

        // Add error to orchestrator
        addOrchestratorMessage(
          `Error polling status: ${error.message}`,
          true,
          agentSystem
        );
      }
    }, 3000);
  }

  /**
   * Fetch pending step details
   * @param {string} step - The step to fetch details for
   * @param {string} sessionId - Session ID
   * @param {Object} agentSystem - Agent system state
   * @param {Function} showApprovalModal - Function to show approval modal
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @returns {Promise<void>}
   */
  async function fetchPendingStepDetails(
    step,
    sessionId,
    agentSystem,
    showApprovalModal,
    addOrchestratorMessage
  ) {
    try {
      const response = await fetch(`/api/agents/pending/${sessionId}/${step}`, {
        headers: {
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get step details");
      }

      const data = await response.json();
      showApprovalModal(step, data.result, agentSystem);
    } catch (error) {
      console.error("Error fetching step details:", error);

      // Add error to orchestrator
      addOrchestratorMessage(
        `Error fetching step details: ${error.message}`,
        true,
        agentSystem
      );
    }
  }

  /**
   * Initialize Markdown-it renderer
   * @returns {Object} - Markdown-it instance
   */
  function initMarkdown() {
    if (window.markdownit) {
      return window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        highlight: function (str, lang) {
          if (lang && window.hljs && window.hljs.getLanguage(lang)) {
            try {
              return window.hljs.highlight(lang, str).value;
            } catch (__) {}
          }
          return ""; // use external default escaping
        },
      });
    } else {
      console.warn("markdown-it library not loaded, using plaintext for now");
      // Simple fallback if markdown isn't loaded
      return {
        render: function (text) {
          return `<p>${text}</p>`;
        },
      };
    }
  }

  // Return public API
  return {
    handleStateUpdate,
    handleProcessingStep,
    handleStepApproved,
    handleFeedbackProcessed,
    handleOrchestratorUpdate,
    handleError,
    triggerGitAnalysis,
    startStatusPolling,
    fetchPendingStepDetails,
    initMarkdown,
  };
})();
