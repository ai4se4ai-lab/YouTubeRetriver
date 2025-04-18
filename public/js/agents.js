/**
 * Agents Interface
 * Handles UI interactions for the agent system
 */

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
  };

  // Markdown converter
  let md;

  // Initialize markdown when library is loaded
  function initMarkdown() {
    if (window.markdownit) {
      md = window.markdownit({
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
      md = {
        render: function (text) {
          return `<p>${text}</p>`;
        },
      };
    }
  }

  // Initialize socket connection
  function initSocket() {
    if (typeof io !== "undefined") {
      agentSystem.socket = io();

      // Socket event listeners
      agentSystem.socket.on("connect", () => {
        console.log("Socket connected");
        updateUI();
      });

      agentSystem.socket.on("disconnect", () => {
        console.log("Socket disconnected");
        updateUI();
      });

      agentSystem.socket.on("gitChangesDetected", (data) => {
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
      agentSystem.socket.on("stateUpdate", handleStateUpdate);
      agentSystem.socket.on("processingStep", handleProcessingStep);
      agentSystem.socket.on("stepApproved", handleStepApproved);
      agentSystem.socket.on("feedbackProcessed", handleFeedbackProcessed);
      agentSystem.socket.on("orchestratorUpdate", handleOrchestratorUpdate);
      agentSystem.socket.on("error", handleError);
    } else {
      console.error("Socket.io not loaded! Please check network connection");
      setTimeout(initSocket, 1000); // Try again in 1 second
    }
  }

  // Function to trigger Git analysis
  function triggerGitAnalysis() {
    if (!agentSystem.sessionId) {
      console.error("No active session for Git analysis");
      return;
    }

    fetch("/api/agents/trigger-git-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.getAccessToken()}`,
      },
      body: JSON.stringify({ sessionId: agentSystem.sessionId }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Git analysis triggered:", data);
        addOrchestratorMessage("Manual Git analysis triggered");
      })
      .catch((error) => {
        console.error("Error triggering Git analysis:", error);
        alert(`Failed to trigger Git analysis: ${error.message}`);
      });
  }

  // Event handlers for socket events
  function handleStateUpdate(update) {
    console.log("State update received:", update);

    // Update agent status
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
        updateOrchestratorStatus("active");
      }
    }

    updateUI();
    drawAgentConnections();
  }

  function handleProcessingStep(stepInfo) {
    console.log("Processing step update:", stepInfo);

    if (stepInfo.step && agentSystem.agents[stepInfo.step]) {
      agentSystem.workflow.currentStep = stepInfo.step;
      agentSystem.agents[stepInfo.step].status = "processing";

      // If a new step is starting, update orchestrator status
      updateOrchestratorStatus("active");
      addOrchestratorMessage(
        `Monitoring step: ${stepInfo.step} - ${stepInfo.status}`
      );
    }

    updateUI();
  }

  function handleStepApproved(data) {
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
        }. Proceeding to next step.`
      );

      // If this was the explanation agent, automatically display the feedback modal
      if (data.step === "explanation") {
        setTimeout(() => {
          showFeedbackModal();
        }, 1000); // Small delay to ensure UI updates first
      }
    }

    updateUI();
  }

  function handleFeedbackProcessed(data) {
    console.log("Feedback processed:", data);

    if (data.results) {
      agentSystem.agents.userFeedback.status = "completed";
      agentSystem.agents.userFeedback.result = data.results.feedback;

      agentSystem.agents.learning.status = "completed";
      agentSystem.agents.learning.result = data.results.learning;

      // Add orchestrator message
      addOrchestratorMessage(
        "Feedback successfully processed and analyzed by learning agent."
      );

      // Show final results modal
      showFinalResultsModal();
    }

    updateUI();
  }

  function handleOrchestratorUpdate(update) {
    console.log("Orchestrator update received:", update);

    // Update orchestrator status
    updateOrchestratorStatus("active");

    // Add message
    addOrchestratorMessage(update.message);

    updateUI();
  }

  function handleError(error) {
    console.error("Socket error:", error);
    alert(`Error: ${error.message}`);

    // Add error to orchestrator
    addOrchestratorMessage(`ERROR: ${error.message}`, true);

    updateUI();
  }

  // Start agent processing
  async function startAgentProcessing() {
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
        gitRepoUrl: document.getElementById("git-repo-url")?.value || "",
        gitBranch: document.getElementById("git-branch")?.value || "main",
      };

      gitConnectionSuccessful = true; // Assume true for now
      //Validate Git analysis if enabled
      if (options.enableGitAnalysis) {
        if (!gitConnectionSuccessful) {
          const confirmContinue = confirm(
            "Git connection has not been tested successfully. Test connection now?"
          );
          if (confirmContinue) {
            // Trigger the test connection button
            testGitConnectionBtn.click();
            return; // Don't continue until connection is tested
          }
        }
      }

      // Validate options
      if (!options.likedVideos && !options.watchHistory) {
        alert("Please select at least one data type to process.");
        return;
      }

      if (isNaN(options.maxResults) || options.maxResults < 1) {
        alert("Please enter a valid number for maximum results.");
        return;
      }

      // Reset agent system state
      resetAgentSystem();

      // Initialize markdown if not already done
      if (!md) initMarkdown();

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
      agentSystem.socket.emit("subscribe", agentSystem.sessionId);

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
    // Reset agent statuses
    for (const agent in agentSystem.agents) {
      agentSystem.agents[agent].status = "idle";
      agentSystem.agents[agent].result = null;
    }

    // Clear edited results
    agentSystem.workflow.editedResults = {};
    agentSystem.workflow.terminated = false;

    // Reset orchestrator messages
    agentSystem.orchestrator.messages = [];
    addOrchestratorMessage("Initializing agent system workflow...");
  }

  // Poll for status updates
  let statusPollInterval = null;
  function startStatusPolling() {
    // Clear any existing interval
    if (statusPollInterval) {
      clearInterval(statusPollInterval);
    }

    // Poll every 3 seconds
    statusPollInterval = setInterval(async () => {
      if (
        !agentSystem.sessionId ||
        !agentSystem.workflow.started ||
        agentSystem.workflow.completed ||
        agentSystem.workflow.terminated
      ) {
        clearInterval(statusPollInterval);
        return;
      }

      try {
        const response = await fetch(
          `/api/agents/status/${agentSystem.sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${auth.getAccessToken()}`,
            },
          }
        );

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
              `Waiting for user approval on ${pendingStep} results.`
            );

            // Fetch step details and show approval modal
            fetchPendingStepDetails(pendingStep);
          }
        }

        // Check if workflow is completed
        if (data.state && data.state.completed) {
          agentSystem.workflow.completed = true;
          clearInterval(statusPollInterval);

          // Add orchestrator message
          addOrchestratorMessage(
            "Workflow completed successfully. Final results ready."
          );
        }

        updateUI();
      } catch (error) {
        console.error("Error polling status:", error);

        // Add error to orchestrator
        addOrchestratorMessage(`Error polling status: ${error.message}`, true);
      }
    }, 3000);
  }

  // Fetch pending step details
  async function fetchPendingStepDetails(step) {
    try {
      const response = await fetch(
        `/api/agents/pending/${agentSystem.sessionId}/${step}`,
        {
          headers: {
            Authorization: `Bearer ${auth.getAccessToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get step details");
      }

      const data = await response.json();
      showApprovalModal(step, data.result);
    } catch (error) {
      console.error("Error fetching step details:", error);

      // Add error to orchestrator
      addOrchestratorMessage(
        `Error fetching step details: ${error.message}`,
        true
      );
    }
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
      agentSystem.socket.emit("approveStep", payload);

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
      if (statusPollInterval) {
        clearInterval(statusPollInterval);
        statusPollInterval = null;
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
    const orchestratorCard = document.getElementById("orchestrator-card");
    if (!orchestratorCard) return;

    if (status === "active") {
      agentSystem.orchestrator.isActive = true;
      agentSystem.orchestrator.lastActivity = Date.now();

      // Add active monitoring class to show it's active
      orchestratorCard.classList.add("active-monitoring");

      // Update status text
      const statusElement = orchestratorCard.querySelector(".agent-status");
      if (statusElement) {
        statusElement.textContent = "Active";
        statusElement.className = statusElement.className
          .replace(/idle|processing|completed|error|waiting/g, "")
          .trim();
        statusElement.classList.add("processing");
      }

      // Update status in state
      agentSystem.agents.orchestrator.status = "processing";

      // Remove active class after 3 seconds
      setTimeout(() => {
        orchestratorCard.classList.remove("active-monitoring");
      }, 3000);
    } else if (status === "idle") {
      agentSystem.orchestrator.isActive = false;

      // Update status text
      const statusElement = orchestratorCard.querySelector(".agent-status");
      if (statusElement) {
        statusElement.textContent = "Idle";
        statusElement.className = statusElement.className
          .replace(/idle|processing|completed|error|waiting/g, "")
          .trim();
        statusElement.classList.add("idle");
      }

      // Update status in state
      agentSystem.agents.orchestrator.status = "idle";

      // Remove active class
      orchestratorCard.classList.remove("active-monitoring");
    } else if (status === "completed") {
      agentSystem.orchestrator.isActive = false;

      // Update status text
      const statusElement = orchestratorCard.querySelector(".agent-status");
      if (statusElement) {
        statusElement.textContent = "Completed";
        statusElement.className = statusElement.className
          .replace(/idle|processing|completed|error|waiting/g, "")
          .trim();
        statusElement.classList.add("completed");
      }

      // Update status in state
      agentSystem.agents.orchestrator.status = "completed";

      // Remove active class
      orchestratorCard.classList.remove("active-monitoring");
    }
  }

  // Add a message to the orchestrator
  function addOrchestratorMessage(message, isAlert = false) {
    const now = new Date();

    // Add to messages array
    agentSystem.orchestrator.messages.push({
      timestamp: now.toISOString(),
      message: message,
      isAlert: isAlert,
    });

    // Limit to 10 messages
    if (agentSystem.orchestrator.messages.length > 10) {
      agentSystem.orchestrator.messages.shift();
    }

    // Update UI
    const messageContainer = document.querySelector(
      "#orchestrator-card .agent-message"
    );
    if (messageContainer) {
      // Clear container
      messageContainer.innerHTML = "";

      // Add all messages
      agentSystem.orchestrator.messages.forEach((msg) => {
        const messageElement = document.createElement("div");
        messageElement.className = `orchestrator-message${
          msg.isAlert ? " alert" : ""
        }`;
        messageElement.innerHTML = `
            <span class="message-time">${new Date(
              msg.timestamp
            ).toLocaleTimeString()}</span>
            <span class="message-content">${msg.message}</span>
          `;

        messageContainer.appendChild(messageElement);
      });

      // Scroll to bottom
      messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    // Always mark orchestrator as active when a new message is added
    updateOrchestratorStatus("active");
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
      agentSystem.socket.emit("feedback", {
        sessionId: agentSystem.sessionId,
        feedback: feedbackText,
      });

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
    const modal = document.getElementById("feedback-modal");
    if (!modal) {
      console.error("Feedback modal not found in DOM");
      return;
    }

    // Enable the submit button if there's text
    const feedbackText = document.getElementById("feedback-modal-text");
    const submitBtn = document.getElementById("feedback-modal-submit");

    if (feedbackText && submitBtn) {
      feedbackText.value = ""; // Clear previous feedback
      submitBtn.disabled = true;

      feedbackText.addEventListener("input", function () {
        submitBtn.disabled = this.value.trim() === "";
      });
    }

    // Reset status message
    const statusElement = document.getElementById("feedback-modal-status");
    if (statusElement) {
      statusElement.textContent = "";
    }

    // Show the modal
    modal.classList.add("active");

    // Add orchestrator message
    addOrchestratorMessage("Waiting for user feedback. Modal displayed.");
  }

  // Hide feedback modal
  function hideFeedbackModal() {
    const modal = document.getElementById("feedback-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Show final results modal
  // Modify showFinalResultsModal function to ensure it properly extracts analogies
  function showFinalResultsModal(wasTerminated = false) {
    const modal = document.getElementById("final-results-modal");
    if (!modal) {
      console.error("Final results modal not found in DOM");
      return;
    }

    // Get the final explanation result
    const explanationResult = agentSystem.agents.explanation.result;

    // Format the content for the modal
    const resultContent = document.getElementById("final-results-content");
    if (resultContent) {
      if (wasTerminated) {
        resultContent.innerHTML = `
        <div class="termination-notice">
          <p><strong>Process was terminated early.</strong></p>
          <p>Here are the results based on the completed steps:</p>
        </div>
      `;

        // Add whatever results we have so far
        if (explanationResult && explanationResult.output) {
          resultContent.innerHTML += md.render(
            extractAnalogiesForDisplay(explanationResult.output)
          );
        } else {
          resultContent.innerHTML +=
            "<p>No final results were generated before termination.</p>";
        }
      } else {
        // Show full results
        if (explanationResult && explanationResult.output) {
          resultContent.innerHTML = md.render(
            extractAnalogiesForDisplay(explanationResult.output)
          );
        } else {
          resultContent.innerHTML =
            "<p>No results were generated. There may have been an error in processing.</p>";
        }
      }
    }

    // Show the modal
    modal.classList.add("active");

    // Add orchestrator message
    addOrchestratorMessage("Displaying final results to user.");

    // Update UI to show workflow as completed
    agentSystem.workflow.completed = true;
    updateOrchestratorStatus("completed");
    updateUI();
  }

  // Improve extractAnalogiesForDisplay function to better extract just the analogies
  function extractAnalogiesForDisplay(output) {
    // This function processes the explanation output to extract just the analogies
    // for a cleaner final display

    // First, try to find a section that has analogies
    const analogySections = [
      "## Analogies",
      "# Analogies",
      "### Analogies",
      "Analogies:",
      "Here are the analogies",
      "YouTube Interest Analogies",
    ];

    let cleanOutput = output;

    // Look for analogy section markers
    for (const section of analogySections) {
      const index = output.indexOf(section);
      if (index !== -1) {
        // Found a section, extract from there
        cleanOutput = output.substring(index);
        break;
      }
    }

    // If we couldn't find a clear section, just return what we have
    // but with a better title
    if (cleanOutput === output) {
      return "# YouTube Interest Analogies\n\n" + cleanOutput;
    }

    return "# YouTube Interest Analogies\n\n" + cleanOutput;
  }

  // Hide final results modal
  function hideFinalResultsModal() {
    const modal = document.getElementById("final-results-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Extract analogies for display
  function extractAnalogiesForDisplay(output) {
    // This function processes the explanation output to extract just the analogies
    // for a cleaner final display

    // First, try to find a section that has analogies
    const analogySections = [
      "## Analogies",
      "# Analogies",
      "### Analogies",
      "Analogies:",
      "Here are the analogies",
    ];

    let cleanOutput = output;

    // Look for analogy section markers
    for (const section of analogySections) {
      const index = output.indexOf(section);
      if (index !== -1) {
        // Found a section, extract from there
        cleanOutput = output.substring(index);
        break;
      }
    }

    // If we couldn't find a clear section, just return what we have
    // but with a better title
    return "# YouTube Interest Analogies\n\n" + cleanOutput;
  }

  // Save edited result
  function saveEditedResult(agentKey) {
    const editableDiv = document.getElementById(`${agentKey}-editable`);
    if (editableDiv) {
      const content = editableDiv.innerText;
      agentSystem.workflow.editedResults[agentKey] = content;

      // Show save confirmation
      const saveConfirm = document.getElementById(
        `${agentKey}-save-confirmation`
      );
      if (saveConfirm) {
        saveConfirm.textContent = "Changes saved!";
        saveConfirm.classList.add("visible");
        setTimeout(() => {
          saveConfirm.classList.remove("visible");
        }, 2000);
      }

      // Update markdown preview
      const markdownView =
        editableDiv.parentNode.querySelector(".markdown-view");
      if (markdownView) {
        markdownView.innerHTML = md.render(content);
      }

      // Add orchestrator message
      addOrchestratorMessage(
        `User edited content for ${agentKey}. Changes saved and will be used in subsequent steps.`
      );
    }
  }

  // UI functions
  function updateUI() {
    // Update agent cards
    for (const [agentKey, agentData] of Object.entries(agentSystem.agents)) {
      const cardElement = document.getElementById(`${agentKey}-card`);
      if (!cardElement) continue;

      // Update status class
      cardElement.className = cardElement.className
        .replace(/idle|processing|completed|error|waiting/g, "")
        .trim();
      cardElement.classList.add(agentData.status);

      // Update status text
      const statusElement = cardElement.querySelector(".agent-status");
      if (statusElement) {
        statusElement.textContent =
          agentData.status.charAt(0).toUpperCase() + agentData.status.slice(1);
        statusElement.className = statusElement.className
          .replace(/idle|processing|completed|error|waiting/g, "")
          .trim();
        statusElement.classList.add(agentData.status);
      }

      // Update progress bar
      const progressBar = cardElement.querySelector(".agent-progress-bar");
      if (progressBar) {
        switch (agentData.status) {
          case "idle":
            progressBar.style.width = "0%";
            break;
          case "processing":
            progressBar.style.width = "50%";
            break;
          case "waiting":
            progressBar.style.width = "75%";
            break;
          case "completed":
            progressBar.style.width = "100%";
            break;
          case "error":
            progressBar.style.width = "100%";
            break;
        }
      }

      // Update result with markdown if available
      const resultElement = cardElement.querySelector(".agent-result");
      if (resultElement && agentData.result) {
        let outputContent = "";

        if (typeof agentData.result === "object") {
          if (agentData.result.output) {
            outputContent = agentData.result.output;
          } else {
            outputContent = JSON.stringify(agentData.result, null, 2);
          }
        } else {
          outputContent = agentData.result;
        }

        // Check if we have an edited version of this content
        if (agentSystem.workflow.editedResults[agentKey]) {
          outputContent = agentSystem.workflow.editedResults[agentKey];
        }

        // Create editable content area
        resultElement.innerHTML = `
            <div class="markdown-view">${
              md ? md.render(outputContent) : `<p>${outputContent}</p>`
            }</div>
            <div id="${agentKey}-editable" class="editable-content" contenteditable="true">${outputContent}</div>
            <div class="editor-controls">
              <button class="btn editor-toggle-btn">Toggle Editor</button>
              <button class="btn editor-save-btn" onclick="saveEditedResult('${agentKey}')">Save Changes</button>
              <span id="${agentKey}-save-confirmation" class="save-confirmation">Changes saved!</span>
            </div>
          `;

        // Add toggle functionality
        const toggleBtn = resultElement.querySelector(".editor-toggle-btn");
        const markdownView = resultElement.querySelector(".markdown-view");
        const editableView = resultElement.querySelector(".editable-content");

        toggleBtn.addEventListener("click", () => {
          markdownView.classList.toggle("hidden");
          editableView.classList.toggle("hidden");
          toggleBtn.textContent = markdownView.classList.contains("hidden")
            ? "Preview"
            : "Edit";
        });

        // Initially hide the editable view
        editableView.classList.add("hidden");

        resultElement.parentElement.classList.remove("hidden");
      }

      // Show approve button if waiting for approval
      const approveButton = cardElement.querySelector(".approve-button");
      if (approveButton) {
        if (
          agentData.status === "waiting" &&
          agentSystem.workflow.pendingApproval === agentKey
        ) {
          approveButton.classList.remove("hidden");
        } else {
          approveButton.classList.add("hidden");
        }
      }
    }

    // Update workflow controls
    const startButton = document.getElementById("agent-start-btn");
    const feedbackSection = document.getElementById("feedback-section");

    if (startButton) {
      startButton.disabled =
        agentSystem.workflow.started &&
        !agentSystem.workflow.completed &&
        !agentSystem.workflow.terminated;

      // Update the text of the button
      if (
        agentSystem.workflow.started &&
        !agentSystem.workflow.completed &&
        !agentSystem.workflow.terminated
      ) {
        startButton.textContent = "Processing...";
      } else if (
        agentSystem.workflow.completed ||
        agentSystem.workflow.terminated
      ) {
        startButton.textContent = "Start New Analysis";
        startButton.disabled = false;
      } else {
        startButton.textContent = "Start Analysis with AI Agents";
      }
    }

    // Show feedback section when explanation is completed
    if (feedbackSection) {
      feedbackSection.classList.add("hidden"); // Hide the inline feedback section since we're using a modal now
    }

    // Draw connections between agents
    drawAgentConnections();
  }

  // Show approval modal
  function showApprovalModal(step, result) {
    const modal = document.getElementById("approval-modal");
    if (!modal) return;

    // Set modal content
    const titleElement = modal.querySelector(".approval-title");
    const resultElement = modal.querySelector(".approval-result");
    const approveButton = modal.querySelector(".approve-button");
    const rejectButton = modal.querySelector(".reject-button");

    if (titleElement) {
      titleElement.textContent = `Approve results from ${step
        .replace(/([A-Z])/g, " $1")
        .trim()}`;
    }

    if (resultElement) {
      let outputContent = "";

      if (typeof result === "object") {
        if (result.output) {
          outputContent = result.output;
        } else {
          outputContent = JSON.stringify(result, null, 2);
        }
      } else {
        outputContent = result || "No result data available";
      }

      // Check if we have an edited version of this content
      if (agentSystem.workflow.editedResults[step]) {
        outputContent = agentSystem.workflow.editedResults[step];
      }

      // Create editable content area with markdown preview
      resultElement.innerHTML = `
          <div class="markdown-view">${
            md ? md.render(outputContent) : `<p>${outputContent}</p>`
          }</div>
          <div id="modal-${step}-editable" class="editable-content" contenteditable="true">${outputContent}</div>
          <div class="editor-controls">
            <button class="btn editor-toggle-btn">Toggle Editor</button>
            <button class="btn editor-save-btn" id="modal-save-btn">Save Changes</button>
            <span id="modal-save-confirmation" class="save-confirmation">Changes saved!</span>
          </div>
        `;

      // Add toggle functionality
      const toggleBtn = resultElement.querySelector(".editor-toggle-btn");
      const markdownView = resultElement.querySelector(".markdown-view");
      const editableView = resultElement.querySelector(".editable-content");

      toggleBtn.addEventListener("click", () => {
        markdownView.classList.toggle("hidden");
        editableView.classList.toggle("hidden");
        toggleBtn.textContent = markdownView.classList.contains("hidden")
          ? "Preview"
          : "Edit";
      });

      // Add save functionality
      const saveBtn = resultElement.querySelector("#modal-save-btn");
      saveBtn.addEventListener("click", () => {
        const content = editableView.innerText;
        agentSystem.workflow.editedResults[step] = content;
        markdownView.innerHTML = md ? md.render(content) : `<p>${content}</p>`;

        const saveConfirm = resultElement.querySelector(
          "#modal-save-confirmation"
        );
        saveConfirm.classList.add("visible");
        setTimeout(() => {
          saveConfirm.classList.remove("visible");
        }, 2000);

        // Add orchestrator message
        addOrchestratorMessage(
          `User edited content for ${step} in approval modal. Changes saved.`
        );
      });

      // Initially hide the editable view
      editableView.classList.add("hidden");
    }

    if (approveButton) {
      approveButton.onclick = () => approveStep(step);
    }

    if (rejectButton) {
      rejectButton.onclick = () => rejectStep(step);
    }

    // Show modal
    modal.classList.add("active");

    // Add orchestrator message
    addOrchestratorMessage(
      `Waiting for user approval on ${step}. Modal displayed.`
    );
  }

  // Hide approval modal
  function hideApprovalModal() {
    const modal = document.getElementById("approval-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Toggle result display
  function toggleResultDisplay(element) {
    const resultElement = element.parentNode.querySelector(".agent-result");
    if (resultElement) {
      resultElement.classList.toggle("expanded");
      element.textContent = resultElement.classList.contains("expanded")
        ? "Show Less"
        : "Show More";
    }
  }

  // Draw connections between agents to visualize workflow
  function drawAgentConnections() {
    const svg = document.getElementById("agent-connections-svg");
    if (!svg) return;

    // Clear existing connections
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Define connections between agents
    const connections = [
      // Add Git Analysis Agent connections
      { from: "gitAnalysis", to: "contentAnalysis" },
      { from: "gitAnalysis", to: "analogyGeneration" },

      // Existing connections
      { from: "contentAnalysis", to: "knowledgeRetrieval" },
      { from: "knowledgeRetrieval", to: "analogyGeneration" },
      { from: "analogyGeneration", to: "analogyValidation" },
      { from: "analogyValidation", to: "analogyRefinement" },
      { from: "analogyRefinement", to: "explanation" },
      { from: "explanation", to: "userFeedback" },
      { from: "userFeedback", to: "learning" },

      // Orchestrator connections - add connection to gitAnalysis
      { from: "orchestrator", to: "gitAnalysis" },
      { from: "orchestrator", to: "contentAnalysis" },
      { from: "orchestrator", to: "knowledgeRetrieval" },
      { from: "orchestrator", to: "analogyGeneration" },
      { from: "orchestrator", to: "analogyValidation" },
      { from: "orchestrator", to: "analogyRefinement" },
      { from: "orchestrator", to: "explanation" },
      { from: "orchestrator", to: "userFeedback" },
      { from: "orchestrator", to: "learning" },
    ];

    // Draw each connection
    connections.forEach((conn) => {
      const fromElement = document.getElementById(`${conn.from}-card`);
      const toElement = document.getElementById(`${conn.to}-card`);

      if (!fromElement || !toElement) return;

      const fromRect = fromElement.getBoundingClientRect();
      const toRect = toElement.getBoundingClientRect();

      // Calculate positions relative to SVG container
      const containerRect = svg.parentNode.getBoundingClientRect();

      // For regular connections
      if (conn.from !== "orchestrator") {
        const x1 = fromRect.right - containerRect.left;
        const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
        const x2 = toRect.left - containerRect.left;
        const y2 = toRect.top + toRect.height / 2 - containerRect.top;

        // Determine if connection is active
        const isActive =
          (agentSystem.agents[conn.from].status === "completed" ||
            agentSystem.agents[conn.from].status === "waiting") &&
          (agentSystem.agents[conn.to].status === "processing" ||
            agentSystem.agents[conn.to].status === "waiting" ||
            agentSystem.agents[conn.to].status === "completed");

        // Create path
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );

        // Set path attributes
        path.setAttribute(
          "d",
          `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${
            (x1 + x2) / 2
          },${y2} ${x2},${y2}`
        );
        path.setAttribute(
          "stroke",
          isActive ? "var(--accent-color)" : "var(--gray)"
        );
        path.setAttribute("stroke-width", isActive ? "3" : "2");
        path.setAttribute("fill", "none");

        if (isActive) {
          path.setAttribute("stroke-dasharray", "5");
          path.setAttribute("class", "agent-connection active");
        } else {
          path.setAttribute("class", "agent-connection");
        }

        svg.appendChild(path);
      }
      // For orchestrator connections (special case)
      else {
        // Starting point at the orchestrator card
        const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
        const y1 = fromRect.top - containerRect.top + 10; // Top of orchestrator card

        // Ending point at the target agent
        const x2 = toRect.left + toRect.width / 2 - containerRect.left;
        const y2 = toRect.bottom - containerRect.top - 10; // Bottom of target agent card

        // Determine if orchestrator connection is active
        const isActive =
          agentSystem.orchestrator.isActive &&
          (agentSystem.agents[conn.to].status === "processing" ||
            agentSystem.agents[conn.to].status === "waiting");

        // Create path for orchestrator connection (dotted)
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );

        // Create curved path from orchestrator to the agent
        path.setAttribute(
          "d",
          `M${x1},${y1} C${x1},${y1 - 50} ${x2},${y2 + 50} ${x2},${y2}`
        );

        path.setAttribute(
          "stroke",
          isActive ? "var(--accent-color)" : "var(--gray)"
        );
        path.setAttribute("stroke-width", "1");
        path.setAttribute("stroke-dasharray", "3,3"); // Dotted line
        path.setAttribute("fill", "none");
        path.setAttribute("opacity", isActive ? "0.8" : "0.3");

        if (isActive) {
          path.setAttribute(
            "class",
            "agent-connection active orchestrator-connection"
          );
        } else {
          path.setAttribute(
            "class",
            "agent-connection orchestrator-connection"
          );
        }

        svg.appendChild(path);
      }
    });
  }

  // Make functions available globally
  window.saveEditedResult = saveEditedResult;
  window.startAgentProcessing = startAgentProcessing;
  window.submitFeedback = submitFeedback;
  window.showThinkingProcess = true;
  window.hideFeedbackModal = hideFeedbackModal;
  window.hideFinalResultsModal = hideFinalResultsModal;

  // Resize handler for connections
  window.addEventListener("resize", () => {
    drawAgentConnections();
  });

  // Initialize agent interface
  function init() {
    // Initialize socket
    initSocket();

    // Initialize markdown
    initMarkdown();

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
});
