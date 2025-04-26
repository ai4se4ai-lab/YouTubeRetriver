/**
 * Socket Client Utility Functions
 * Contains helper functions for client-side socket communication
 */

// Create namespace for socket client utilities
window.socketClientUtils = (function () {
  /**
   * Initialize socket connection
   * @param {Object} agentSystem - Agent system state
   * @param {Function} handleStateUpdate - Function to handle state updates
   * @param {Function} handleProcessingStep - Function to handle processing steps
   * @param {Function} handleStepApproved - Function to handle step approvals
   * @param {Function} handleFeedbackProcessed - Function to handle feedback processed
   * @param {Function} handleOrchestratorUpdate - Function to handle orchestrator updates
   * @param {Function} handleError - Function to handle errors
   * @param {Function} resetAgentSystem - Function to reset agent system
   * @param {Function} updateUI - Function to update UI
   * @param {Function} startStatusPolling - Function to start status polling
   * @param {Function} addOrchestratorMessage - Function to add orchestrator messages
   * @returns {Object|null} - Socket.IO instance or null if not available
   */
  function initSocket(
    agentSystem,
    handleStateUpdate,
    handleProcessingStep,
    handleStepApproved,
    handleFeedbackProcessed,
    handleOrchestratorUpdate,
    handleError,
    resetAgentSystem,
    updateUI,
    startStatusPolling,
    addOrchestratorMessage
  ) {
    if (typeof io !== "undefined") {
      const socket = io();

      // Add socket event handler
      socket.on("gitWorkflowStarted", (data) => {
        console.log("Git-triggered workflow started:", data);

        // Show notification to the user
        addOrchestratorMessage(
          `Git-triggered workflow started at ${new Date(
            data.timestamp
          ).toLocaleTimeString()}: ${data.message}`,
          true // Mark as alert to draw attention
        );

        // If we're not already in an active workflow, switch to this session
        if (!agentSystem.workflow.started || agentSystem.workflow.completed) {
          // Subscribe to the new session
          socket.emit("subscribe", data.sessionId);
          agentSystem.sessionId = data.sessionId;
          agentSystem.workflow.started = true;
          agentSystem.workflow.completed = false;

          // Show agent system UI if not already visible
          document.getElementById("agent-system").classList.remove("hidden");
          document.getElementById("results-section").classList.remove("hidden");

          // Reset agent state for the new session
          resetAgentSystem(agentSystem);

          // Update UI
          updateUI(agentSystem);

          // Start polling for status
          startStatusPolling(agentSystem.sessionId);
        }
      });

      // Socket event listeners
      socket.on("connect", () => {
        console.log("Socket connected");
        updateUI(agentSystem);
      });

      socket.on("disconnect", () => {
        console.log("Socket disconnected");
        updateUI(agentSystem);
      });

      socket.on("gitChangesDetected", (data) => {
        console.log("Git changes detected:", data);

        // Add a message to the orchestrator's message area
        addOrchestratorMessage(
          `Git changes detected at ${new Date(
            data.timestamp
          ).toLocaleTimeString()}. ${
            data.changeData.commitCount !== "unknown"
              ? `${data.changeData.commitCount} new commits found.`
              : "New commits detected."
          }`,
          true // Mark as alert to draw attention
        );

        // Optionally, if Git Analysis card exists, update it
        const gitCard = document.getElementById("gitAnalysis-card");
        if (gitCard) {
          // Add a visual indicator that new changes are available
          gitCard.classList.add("git-changes-available");

          // If the Git Analysis agent is idle, you could add a button to analyze now
          if (agentSystem.agents.gitAnalysis.status === "idle") {
            const actionButtons = gitCard.querySelector(
              ".agent-action-buttons"
            );
            if (actionButtons) {
              // Remove any existing analyze button
              const existingButton = actionButtons.querySelector(
                ".analyze-git-button"
              );
              if (existingButton) {
                existingButton.remove();
              }

              // Add new analyze button
              const analyzeButton = document.createElement("button");
              analyzeButton.className =
                "btn analyze-git-button pulse-attention";
              analyzeButton.textContent = "Analyze New Changes";
              analyzeButton.onclick = triggerGitAnalysis;
              actionButtons.appendChild(analyzeButton);
            }
          }
        }
      });

      // Subscribe to session events
      socket.on("stateUpdate", handleStateUpdate);
      socket.on("processingStep", handleProcessingStep);
      socket.on("stepApproved", handleStepApproved);
      socket.on("feedbackProcessed", handleFeedbackProcessed);
      socket.on("orchestratorUpdate", handleOrchestratorUpdate);
      socket.on("error", handleError);

      return socket;
    } else {
      console.error("Socket.io not loaded! Please check network connection");
      setTimeout(
        () =>
          initSocket(
            agentSystem,
            handleStateUpdate,
            handleProcessingStep,
            handleStepApproved,
            handleFeedbackProcessed,
            handleOrchestratorUpdate,
            handleError,
            resetAgentSystem,
            updateUI,
            startStatusPolling
          ),
        1000
      ); // Try again in 1 second
      return null;
    }
  }

  /**
   * Submit feedback via socket
   * @param {Object} socket - Socket.IO socket
   * @param {string} sessionId - Session ID
   * @param {string} feedbackText - Feedback text
   * @returns {Promise<void>}
   */
  async function submitFeedbackViaSocket(socket, sessionId, feedbackText) {
    return new Promise((resolve, reject) => {
      try {
        // Send via socket
        socket.emit("feedback", {
          sessionId: sessionId,
          feedback: feedbackText,
        });
        resolve();
      } catch (error) {
        console.error("Error submitting feedback via socket:", error);
        reject(error);
      }
    });
  }

  /**
   * Approve step via socket
   * @param {Object} socket - Socket.IO socket
   * @param {string} sessionId - Session ID
   * @param {string} step - Step to approve
   * @param {string|null} editedContent - Optional edited content
   * @returns {Promise<void>}
   */
  async function approveStepViaSocket(
    socket,
    sessionId,
    step,
    editedContent = null
  ) {
    return new Promise((resolve, reject) => {
      try {
        // Create the payload, including edited content if available
        const payload = {
          sessionId: sessionId,
          step: step,
        };

        if (editedContent) {
          payload.editedContent = editedContent;
        }

        // Send via socket
        socket.emit("approveStep", payload);
        resolve();
      } catch (error) {
        console.error("Error approving step via socket:", error);
        reject(error);
      }
    });
  }

  /**
   * Reject step via socket
   * @param {Object} socket - Socket.IO socket
   * @param {string} sessionId - Session ID
   * @param {string} step - Step to reject
   * @param {string} reason - Reason for rejection
   * @returns {Promise<void>}
   */
  async function rejectStepViaSocket(socket, sessionId, step, reason) {
    return new Promise((resolve, reject) => {
      try {
        // Send via socket
        socket.emit("rejectStep", {
          sessionId: sessionId,
          step: step,
          reason: reason || "User rejected output",
        });
        resolve();
      } catch (error) {
        console.error("Error rejecting step via socket:", error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to session via socket
   * @param {Object} socket - Socket.IO socket
   * @param {string} sessionId - Session ID to subscribe to
   * @returns {Promise<void>}
   */
  async function subscribeToSession(socket, sessionId) {
    return new Promise((resolve, reject) => {
      try {
        socket.emit("subscribe", sessionId);
        resolve();
      } catch (error) {
        console.error("Error subscribing to session:", error);
        reject(error);
      }
    });
  }

  /**
   * Send orchestrator update via socket
   * @param {Object} socket - Socket.IO socket
   * @param {string} sessionId - Session ID
   * @param {string} message - Update message
   * @returns {Promise<void>}
   */
  async function sendOrchestratorUpdate(socket, sessionId, message) {
    return new Promise((resolve, reject) => {
      try {
        socket.emit("orchestratorUpdate", {
          sessionId: sessionId,
          message: message,
        });
        resolve();
      } catch (error) {
        console.error("Error sending orchestrator update:", error);
        reject(error);
      }
    });
  }

  // Return public API
  return {
    initSocket,
    submitFeedbackViaSocket,
    approveStepViaSocket,
    rejectStepViaSocket,
    subscribeToSession,
    sendOrchestratorUpdate,
  };
})();
