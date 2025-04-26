/**
 * Agents Interface
 * Handles UI interactions for the agent system
 */

// Import utility modules
// Note: In a real implementation, we would use proper module imports
// but since this is client-side code without a bundler, we're defining these as global functions

// Wait for DOM to fully load
document.addEventListener("DOMContentLoaded", () => {
  console.log("Agent interface initializing...");

  // Agent system state
  const agentSystem = {
    socket: null,
    sessionId: null,
    agents: {
      gitAnalysis: { status: "idle", result: null },
      contentAnalysis: { status: "idle", result: null },
      knowledgeRetrieval: { status: "idle", result: null },
      analogyGeneration: { status: "idle", result: null },
      analogyValidation: { status: "idle", result: null },
      analogyRefinement: { status: "idle", result: null },
      explanation: { status: "idle", result: null },
      userFeedback: { status: "idle", result: null },
      learning: { status: "idle", result: null },
      orchestrator: { status: "idle", result: null },
    },
    workflow: {
      started: false,
      completed: false,
      currentStep: null,
      pendingApproval: null,
      editedResults: {}, // Store edited results here
      terminated: false, // Track if workflow was terminated
    },
    orchestrator: {
      messages: [],
      isActive: false,
      lastActivity: null,
    },
    statusPollInterval: null,
  };

  // Markdown converter
  let md;

  // Initialize markdown using utility
  function initMarkdownRenderer() {
    md = window.agentDisplayUtils.initMarkdown();
  }

  // Initialize socket connection using utility
  function initSocketConnection() {
    agentSystem.socket = window.socketClientUtils.initSocket(
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
    );
  }

  // Handle socket events using utilities
  function handleStateUpdate(update) {
    window.agentDisplayUtils.handleStateUpdate(
      update,
      agentSystem,
      updateUI,
      drawAgentConnections
    );
  }

  function handleProcessingStep(stepInfo) {
    window.agentDisplayUtils.handleProcessingStep(
      stepInfo,
      agentSystem,
      updateUI,
      updateOrchestratorStatus,
      addOrchestratorMessage
    );
  }

  function handleStepApproved(data) {
    window.agentDisplayUtils.handleStepApproved(
      data,
      agentSystem,
      updateUI,
      hideApprovalModal,
      addOrchestratorMessage,
      showFeedbackModal
    );
  }

  function handleFeedbackProcessed(data) {
    window.agentDisplayUtils.handleFeedbackProcessed(
      data,
      agentSystem,
      updateUI,
      addOrchestratorMessage,
      showFinalResultsModal
    );
  }

  function handleOrchestratorUpdate(update) {
    window.agentDisplayUtils.handleOrchestratorUpdate(
      update,
      agentSystem,
      updateOrchestratorStatus,
      addOrchestratorMessage,
      updateUI
    );
  }

  function handleError(error) {
    window.agentDisplayUtils.handleError(
      error,
      agentSystem,
      addOrchestratorMessage,
      updateUI
    );
  }

  // Start agent processing
  async function startAgentProcessing(gitTriggeredOnly = false) {
    try {
      // Check if user is authenticated
      if (!auth.isAuthenticated()) {
        alert("Please connect to YouTube first");
        return;
      }

      // Get export options
      const options = {
        likedVideos: document.getElementById("liked-videos").checked,
        watchHistory: document.getElementById("watch-history").checked,
        maxResults: parseInt(document.getElementById("max-results").value, 10),
        enableGitAnalysis:
          document.getElementById("git-analysis")?.checked || false,
        gitTriggeredOnly: gitTriggeredOnly, // Add this option
      };

      // Assume true for now - this is set in app.js and should be exposed
      const gitConnectionSuccessful = true;

      // Validate Git analysis if enabled
      if (options.enableGitAnalysis) {
        if (!gitConnectionSuccessful) {
          const confirmContinue = confirm(
            "Git connection has not been tested successfully. Test connection now?"
          );
          if (confirmContinue) {
            // Trigger the test connection button - this is handled in app.js
            const testGitConnectionBtn = document.getElementById(
              "test-git-connection"
            );
            if (testGitConnectionBtn) {
              testGitConnectionBtn.click();
            }
            return; // Don't continue until connection is tested
          }
        }
      }

      // Reset agent system state
      resetAgentSystem();

      // Initialize markdown if not already done
      if (!md) initMarkdownRenderer();

      // Show agent system
      document.getElementById("agent-system").classList.remove("hidden");
      document.getElementById("results-section").classList.remove("hidden");

      // Start processing
      // Make sure options are passed to the server
      const response = await fetch("/api/agents/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify({ options }), // Make sure options are included here
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to start agent processing"
        );
      }

      const data = await response.json();
      agentSystem.sessionId = data.sessionId;
      agentSystem.workflow.started = true;

      // Subscribe to session events
      if (agentSystem.socket) {
        window.socketClientUtils.subscribeToSession(
          agentSystem.socket,
          agentSystem.sessionId
        );
      }

      console.log(
        "Agent processing started, session ID:",
        agentSystem.sessionId
      );

      // Update orchestrator status
      updateOrchestratorStatus("active");
      addOrchestratorMessage(
        "Agent workflow started. Orchestrator is actively monitoring the process."
      );

      updateUI();

      // Start polling for status
      startStatusPolling();
    } catch (error) {
      console.error("Error starting agent processing:", error);
      alert(`Failed to start agent processing: ${error.message}`);

      // Add error to orchestrator
      addOrchestratorMessage(`ERROR: ${error.message}`, true);
    }
  }

  // Reset agent system to initial state
  function resetAgentSystem() {
    window.uiUtils.resetAgentSystem(agentSystem);
  }

  // Poll for status updates
  function startStatusPolling() {
    // Clear any existing interval
    if (agentSystem.statusPollInterval) {
      clearInterval(agentSystem.statusPollInterval);
    }

    // Start polling
    agentSystem.statusPollInterval =
      window.agentDisplayUtils.startStatusPolling(
        agentSystem.sessionId,
        agentSystem,
        fetchPendingStepDetails,
        addOrchestratorMessage,
        updateUI
      );
  }

  // Fetch pending step details
  async function fetchPendingStepDetails(step) {
    await window.agentDisplayUtils.fetchPendingStepDetails(
      step,
      agentSystem.sessionId,
      agentSystem,
      showApprovalModal,
      addOrchestratorMessage
    );
  }

  // Approve a step with potentially edited content
  async function approveStep(step) {
    try {
      // Get the edited content if available
      const editedContent = agentSystem.workflow.editedResults[step];

      // Create the payload, including edited content if available
      const payload = {
        sessionId: agentSystem.sessionId,
        step: step,
      };

      if (editedContent) {
        payload.editedContent = editedContent;
      }

      const response = await fetch("/api/agents/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to approve step");
      }

      // Also send via socket for redundancy
      if (agentSystem.socket) {
        window.socketClientUtils.approveStepViaSocket(
          agentSystem.socket,
          agentSystem.sessionId,
          step,
          editedContent
        );
      }

      hideApprovalModal();

      // Properly mark the step as completed
      agentSystem.agents[step].status = "completed";
      agentSystem.workflow.pendingApproval = null;

      console.log("Step approved:", step);

      // Add orchestrator message
      addOrchestratorMessage(
        `${step} approved${
          editedContent ? " with edits" : ""
        }. Continuing workflow.`
      );

      updateUI();
    } catch (error) {
      console.error("Error approving step:", error);
      alert(`Failed to approve step: ${error.message}`);

      // Add error to orchestrator
      addOrchestratorMessage(`Error approving step: ${error.message}`, true);
    }
  }

  // Reject and terminate a step
  async function rejectStep(step) {
    try {
      // Mark workflow as terminated
      agentSystem.workflow.terminated = true;

      // Send termination to server
      const response = await fetch("/api/agents/terminate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify({
          sessionId: agentSystem.sessionId,
          step: step,
          reason: "User rejected output",
        }),
      });

      hideApprovalModal();

      // Add orchestrator message
      addOrchestratorMessage(
        `${step} was rejected by user. Workflow has been terminated.`,
        true
      );

      // Update UI to show terminated state
      agentSystem.agents[step].status = "error";
      agentSystem.workflow.pendingApproval = null;

      // Stop status polling
      if (agentSystem.statusPollInterval) {
        clearInterval(agentSystem.statusPollInterval);
        agentSystem.statusPollInterval = null;
      }

      // Show final results with what we have so far
      showFinalResultsModal(true);

      updateUI();
    } catch (error) {
      console.error("Error rejecting step:", error);
      alert(`Failed to reject step: ${error.message}`);

      // Add error to orchestrator
      addOrchestratorMessage(`Error rejecting step: ${error.message}`, true);
    }
  }

  // Update orchestrator status
  function updateOrchestratorStatus(status) {
    window.uiUtils.updateOrchestratorStatus(status, agentSystem);
  }

  // Add a message to the orchestrator
  function addOrchestratorMessage(message, isAlert = false) {
    window.uiUtils.addOrchestratorMessage(message, isAlert, agentSystem);
  }

  // Submit feedback
  async function submitFeedback() {
    try {
      const feedbackText = document
        .getElementById("feedback-modal-text")
        .value.trim();

      if (!feedbackText) {
        alert("Please enter feedback before submitting");
        return;
      }

      // Check if user wants to terminate the process
      const terminationPhrases = [
        "terminate the process",
        "finish it",
        "i am done",
        "end process",
        "stop it",
        "that's enough",
        "that's all",
        "i'm finished",
      ];

      const feedbackLower = feedbackText.toLowerCase();
      const isTerminating = terminationPhrases.some((phrase) =>
        feedbackLower.includes(phrase)
      );

      if (isTerminating) {
        // User wants to terminate - just show final results
        hideFeedbackModal();

        // Mark feedback and learning agents as completed to show final state
        agentSystem.agents.userFeedback.status = "completed";
        agentSystem.agents.learning.status = "completed";

        // Add orchestrator message
        addOrchestratorMessage(
          "User chose to terminate process. Showing final results."
        );

        updateUI();
        showFinalResultsModal();
        return;
      }

      // Update UI first to show processing state
      document.getElementById("feedback-modal-submit").disabled = true;
      document.getElementById("feedback-modal-status").textContent =
        "Processing feedback...";
      agentSystem.agents.userFeedback.status = "processing";
      addOrchestratorMessage("Processing user feedback. Analyzing content...");
      updateUI();

      // Hide the feedback modal while processing
      hideFeedbackModal();

      const response = await fetch("/api/agents/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify({
          sessionId: agentSystem.sessionId,
          feedback: feedbackText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to submit feedback");
      }

      // Also send via socket for redundancy
      if (agentSystem.socket) {
        await window.socketClientUtils.submitFeedbackViaSocket(
          agentSystem.socket,
          agentSystem.sessionId,
          feedbackText
        );
      }

      // Add orchestrator message
      addOrchestratorMessage(
        "User feedback submitted. Learning agent is analyzing patterns."
      );

      updateUI();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert(`Failed to submit feedback: ${error.message}`);

      // Reset UI state
      document.getElementById("feedback-modal-submit").disabled = false;
      document.getElementById("feedback-modal-status").textContent =
        "Failed to submit feedback.";

      // Reshow feedback modal if there was an error
      showFeedbackModal();

      // Add error to orchestrator
      addOrchestratorMessage(
        `Error submitting feedback: ${error.message}`,
        true
      );
    }
  }

  // Show feedback modal
  function showFeedbackModal() {
    window.modalUtils.showFeedbackModal(agentSystem, addOrchestratorMessage);
  }

  // Hide feedback modal
  function hideFeedbackModal() {
    window.modalUtils.hideFeedbackModal();
  }

  // Show final results modal
  function showFinalResultsModal(wasTerminated = false) {
    window.modalUtils.showFinalResultsModal(
      wasTerminated,
      agentSystem,
      md,
      addOrchestratorMessage,
      updateUI,
      updateOrchestratorStatus
    );
  }

  // Hide final results modal
  function hideFinalResultsModal() {
    window.modalUtils.hideFinalResultsModal();
  }

  // Show approval modal
  function showApprovalModal(step, result) {
    window.modalUtils.showApprovalModal(
      step,
      result,
      agentSystem,
      md,
      approveStep,
      rejectStep,
      addOrchestratorMessage
    );
  }

  // Hide approval modal
  function hideApprovalModal() {
    window.modalUtils.hideApprovalModal();
  }

  // Toggle result display
  function toggleResultDisplay(element) {
    window.uiUtils.toggleResultDisplay(element);
  }

  // Save edited result
  function saveEditedResult(agentKey) {
    window.uiUtils.saveEditedResult(agentKey, agentSystem, md);
  }

  // Draw connections between agents
  function drawAgentConnections() {
    window.uiUtils.drawAgentConnections(agentSystem);
  }

  // Update UI
  function updateUI() {
    window.uiUtils.updateUI(
      agentSystem,
      drawAgentConnections,
      saveEditedResult,
      md
    );
  }

  // Trigger Git analysis
  async function triggerGitAnalysis() {
    try {
      await window.agentDisplayUtils.triggerGitAnalysis(
        agentSystem.sessionId,
        addOrchestratorMessage
      );
    } catch (error) {
      console.error("Error triggering Git analysis:", error);
      alert(`Failed to trigger Git analysis: ${error.message}`);
    }
  }

  // Initialize agent interface
  function init() {
    // Initialize socket
    initSocketConnection();

    // Initialize markdown
    initMarkdownRenderer();

    // Set up event listeners
    const startButton = document.getElementById("agent-start-btn");
    if (startButton) {
      startButton.addEventListener("click", startAgentProcessing);
    }

    // Set up result toggles
    const resultToggles = document.querySelectorAll(".agent-result-toggle");
    resultToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        toggleResultDisplay(this);
      });
    });

    // Git repository options toggle
    const gitAnalysisCheckbox = document.getElementById("git-analysis");
    const gitRepoDetails = document.querySelector(".git-repo-details");

    if (gitAnalysisCheckbox && gitRepoDetails) {
      gitAnalysisCheckbox.addEventListener("change", function () {
        if (this.checked) {
          gitRepoDetails.classList.remove("hidden");
        } else {
          gitRepoDetails.classList.add("hidden");
        }
      });
    }

    // Close modal when clicking outside
    const modals = document.querySelectorAll(
      ".modal, .approval-modal, .feedback-modal, .final-results-modal"
    );
    modals.forEach((modal) => {
      modal.addEventListener("click", function (e) {
        if (e.target === this) {
          if (this.classList.contains("approval-modal")) {
            hideApprovalModal();
          } else if (this.classList.contains("feedback-modal")) {
            hideFeedbackModal();
          } else if (this.classList.contains("final-results-modal")) {
            hideFinalResultsModal();
          } else {
            this.style.display = "none";
          }
        }
      });
    });

    // Initialize UI
    updateUI();

    console.log("Agent interface initialized");
  }

  // Initialize when document is ready
  init();

  // Make functions available globally
  window.saveEditedResult = saveEditedResult;
  window.startAgentProcessing = startAgentProcessing;
  window.submitFeedback = submitFeedback;
  window.showThinkingProcess = true;
  window.hideFeedbackModal = hideFeedbackModal;
  window.hideFinalResultsModal = hideFinalResultsModal;
  window.triggerGitAnalysis = triggerGitAnalysis;

  // Resize handler for connections
  window.addEventListener("resize", () => {
    drawAgentConnections();
  });
});
