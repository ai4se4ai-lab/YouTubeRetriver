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
    },
    orchestrator: {
      messages: [],
      isActive: false,
      lastActivity: null,
    },
  };

  // Markdown converter
  const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(lang, str).value;
        } catch (__) {}
      }
      return ""; // use external default escaping
    },
  });

  // Initialize socket connection
  function initSocket() {
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

    // Subscribe to session events
    agentSystem.socket.on("stateUpdate", handleStateUpdate);
    agentSystem.socket.on("processingStep", handleProcessingStep);
    agentSystem.socket.on("stepApproved", handleStepApproved);
    agentSystem.socket.on("feedbackProcessed", handleFeedbackProcessed);
    agentSystem.socket.on("orchestratorUpdate", handleOrchestratorUpdate);
    agentSystem.socket.on("error", handleError);
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

      // If this was the explanation agent, automatically display the feedback form
      if (data.step === "explanation") {
        document.getElementById("feedback-section").classList.remove("hidden");
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
      };

      // Validate options
      if (!options.likedVideos && !options.watchHistory) {
        alert("Please select at least one data type to process.");
        return;
      }

      if (isNaN(options.maxResults) || options.maxResults < 1) {
        alert("Please enter a valid number for maximum results.");
        return;
      }

      // Reset agent statuses
      for (const agent in agentSystem.agents) {
        agentSystem.agents[agent].status = "idle";
        agentSystem.agents[agent].result = null;
      }

      // Clear edited results
      agentSystem.workflow.editedResults = {};

      // Reset orchestrator messages
      agentSystem.orchestrator.messages = [];
      addOrchestratorMessage("Initializing agent system workflow...");

      // Show agent system
      document.getElementById("agent-system").classList.remove("hidden");
      document.getElementById("results-section").classList.remove("hidden");

      // Start processing
      const response = await fetch("/api/agents/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
        body: JSON.stringify({ options }),
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
        agentSystem.workflow.completed
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
  //   async function approveStep(step) {
  //     try {
  //       // Get the edited content if available
  //       const editedContent = agentSystem.workflow.editedResults[step];

  //       // Create the payload, including edited content if available
  //       const payload = {
  //         sessionId: agentSystem.sessionId,
  //         step: step,
  //       };

  //       if (editedContent) {
  //         payload.editedContent = editedContent;
  //       }

  //       const response = await fetch("/api/agents/approve", {
  //         method: "POST",
  //         headers: {
  //           "Content-Type": "application/json",
  //           Authorization: `Bearer ${auth.getAccessToken()}`,
  //         },
  //         body: JSON.stringify(payload),
  //       });

  //       if (!response.ok) {
  //         const errorData = await response.json();
  //         throw new Error(errorData.message || "Failed to approve step");
  //       }

  //       // Also send via socket for redundancy
  //       agentSystem.socket.emit("approveStep", payload);

  //       hideApprovalModal();

  //       // Properly mark the step as completed
  //       agentSystem.agents[step].status = "completed";
  //       agentSystem.workflow.pendingApproval = null;

  //       console.log("Step approved:", step);

  //       // Add orchestrator message
  //       addOrchestratorMessage(
  //         `${step} approved${
  //           editedContent ? " with edits" : ""
  //         }. Continuing workflow.`
  //       );

  //       updateUI();
  //     } catch (error) {
  //       console.error("Error approving step:", error);
  //       alert(`Failed to approve step: ${error.message}`);

  //       // Add error to orchestrator
  //       addOrchestratorMessage(`Error approving step: ${error.message}`, true);
  //     }
  //   }

  // Improved function to save edited content and ensure it's used
  function approveStep(step) {
    try {
      // Get the edited content from the modal
      const editableDiv = document.querySelector(
        `.approval-modal .editable-content`
      );
      let editedContent = null;

      if (editableDiv) {
        editedContent = editableDiv.textContent.trim();

        // Log the edited content to verify
        console.log(`Saving edited content for ${step}:`, editedContent);

        // Store in our local state for UI updates
        agentSystem.workflow.editedResults[step] = editedContent;
      }

      // Show loading state
      const approveButton = document.querySelector(
        ".approval-modal .approve-button"
      );
      const originalText = approveButton.textContent;
      approveButton.textContent = "Approving...";
      approveButton.disabled = true;

      // Create the payload, including edited content
      const payload = {
        sessionId: agentSystem.sessionId,
        step: step,
        editedContent: editedContent,
      };

      console.log("Sending approval with payload:", payload);

      // Send to server and via socket
      Promise.all([
        // RESTful API call
        fetch("/api/agents/approve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.getAccessToken()}`,
          },
          body: JSON.stringify(payload),
        }),

        // Also emit via socket for redundancy
        new Promise((resolve) => {
          agentSystem.socket.emit("approveStep", payload);
          resolve();
        }),
      ])
        .then(([response]) => {
          if (!response.ok) {
            throw new Error(
              `Server returned ${response.status}: ${response.statusText}`
            );
          }
          return response.json();
        })
        .then((data) => {
          console.log("Step approved successfully:", data);
          hideApprovalModal();

          // Mark the step as completed
          agentSystem.agents[step].status = "completed";
          agentSystem.workflow.pendingApproval = null;

          // Add orchestrator message
          addOrchestratorMessage(
            `${step} approved with edited content. Continuing workflow.`
          );

          updateUI();
        })
        .catch((error) => {
          console.error("Error approving step:", error);
          alert(`Error: ${error.message}`);
          approveButton.textContent = originalText;
          approveButton.disabled = false;
        });
    } catch (error) {
      console.error("Error in approveStep:", error);
      alert(`Error approving step: ${error.message}`);
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
        .getElementById("feedback-text")
        .value.trim();

      if (!feedbackText) {
        alert("Please enter feedback before submitting");
        return;
      }

      // Update UI first to show processing state
      document.getElementById("feedback-submit-btn").disabled = true;
      document.getElementById("feedback-status").textContent =
        "Processing feedback...";
      agentSystem.agents.userFeedback.status = "processing";
      addOrchestratorMessage("Processing user feedback. Analyzing content...");
      updateUI();

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

      // Update UI
      document.getElementById("feedback-text").value = "";
      document.getElementById("feedback-submit-btn").disabled = true;
      document.getElementById("feedback-status").textContent =
        "Feedback submitted, processing...";

      // Add orchestrator message
      addOrchestratorMessage(
        "User feedback submitted. Learning agent is analyzing patterns."
      );

      updateUI();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert(`Failed to submit feedback: ${error.message}`);
      // Reset UI state
      document.getElementById("feedback-submit-btn").disabled = false;
      document.getElementById("feedback-status").textContent =
        "Failed to submit feedback.";

      // Add error to orchestrator
      addOrchestratorMessage(
        `Error submitting feedback: ${error.message}`,
        true
      );
    }
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
      // In agents.js, update how results are displayed
      if (resultElement && agentData.result) {
        let outputContent = "";
        let fullOutputContent = "";

        if (typeof agentData.result === "object") {
          if (agentData.result.summarizedOutput) {
            outputContent = agentData.result.summarizedOutput;
            fullOutputContent = agentData.result.output;
          } else if (agentData.result.output) {
            outputContent = agentData.result.output;
            fullOutputContent = agentData.result.output;
          } else {
            outputContent = JSON.stringify(agentData.result, null, 2);
            fullOutputContent = outputContent;
          }
        } else {
          outputContent = agentData.result;
          fullOutputContent = agentData.result;
        }

        // Check if we have an edited version of this content
        if (agentSystem.workflow.editedResults[agentKey]) {
          outputContent = agentSystem.workflow.editedResults[agentKey];
          fullOutputContent = agentSystem.workflow.editedResults[agentKey];
        }

        // Create editable content area with both summarized and full views
        resultElement.innerHTML = `
      <div class="summarized-view">${md.render(outputContent)}</div>
      <div class="full-content hidden">${md.render(fullOutputContent)}</div>
      <div id="${agentKey}-editable" class="editable-content hidden" contenteditable="true">${fullOutputContent}</div>
      <div class="editor-controls">
        <button class="btn view-toggle-btn">Show Full Content</button>
        <button class="btn editor-toggle-btn">Edit</button>
        <button class="btn editor-save-btn" onclick="saveEditedResult('${agentKey}')">Save Changes</button>
        <span id="${agentKey}-save-confirmation" class="save-confirmation">Changes saved!</span>
      </div>
    `;
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
        agentSystem.workflow.started && !agentSystem.workflow.completed;

      // Update the text of the button
      if (agentSystem.workflow.started && !agentSystem.workflow.completed) {
        startButton.textContent = "Processing...";
      } else if (agentSystem.workflow.completed) {
        startButton.textContent = "Start New Analysis";
      } else {
        startButton.textContent = "Start Analysis with AI Agents";
      }
    }

    // Show feedback section when explanation is completed
    if (feedbackSection) {
      if (agentSystem.agents.explanation.status === "completed") {
        feedbackSection.classList.remove("hidden");

        // Enable feedback submit button
        const feedbackText = document.getElementById("feedback-text");
        const feedbackSubmitBtn = document.getElementById(
          "feedback-submit-btn"
        );

        if (feedbackText && feedbackSubmitBtn) {
          feedbackText.addEventListener("input", () => {
            feedbackSubmitBtn.disabled = feedbackText.value.trim() === "";
          });
        }
      } else {
        feedbackSection.classList.add("hidden");
      }
    }

    // Draw connections between agents
    drawAgentConnections();
  }

  function showThinkingProcess(agentKey) {
    const card = document.getElementById(`${agentKey}-card`);
    if (!card) return;

    const thinkingContainer = card.querySelector(".thinking-container");
    const thinkingContent = card.querySelector(".thinking-content");

    if (!thinkingContainer || !thinkingContent) {
      console.error(`Thinking container elements not found for ${agentKey}`);
      return;
    }

    // Show the thinking container
    thinkingContainer.classList.remove("hidden");
    thinkingContent.textContent = "Loading thinking process...";

    // Set up real-time updates if agent is processing
    if (agentSystem.agents[agentKey].status === "processing") {
      // Set up socket listener for thinking updates
      agentSystem.socket.on("agentThinking", (data) => {
        if (data.agent === agentKey) {
          thinkingContent.textContent = data.thinking;
          // Auto scroll to bottom
          thinkingContent.scrollTop = thinkingContent.scrollHeight;
        }
      });
    } else {
      // Fetch existing thinking process
      fetch(`/api/agents/thinking/${agentSystem.sessionId}/${agentKey}`, {
        headers: {
          Authorization: `Bearer ${auth.getAccessToken()}`,
        },
      })
        .then((response) => {
          if (!response.ok) throw new Error("Failed to fetch thinking process");
          return response.json();
        })
        .then((data) => {
          if (data.thinking) {
            thinkingContent.textContent = data.thinking;
          } else {
            thinkingContent.textContent =
              "No thinking process available for this agent yet.";
          }
        })
        .catch((error) => {
          console.error("Error fetching thinking process:", error);
          thinkingContent.textContent =
            "Error loading thinking process: " + error.message;
        });
    }

    // Set up close button
    const closeBtn = thinkingContainer.querySelector(".thinking-close");
    if (closeBtn) {
      closeBtn.onclick = () => {
        thinkingContainer.classList.add("hidden");
        // Remove socket listener if it exists
        agentSystem.socket.off("agentThinking");
      };
    }
  }

  // Show approval modal
  function showApprovalModal(step, result) {
    const modal = document.getElementById("approval-modal");
    if (!modal) return;

    // Set modal content
    const titleElement = modal.querySelector(".approval-title");
    const resultElement = modal.querySelector(".approval-result");
    const approveButton = modal.querySelector(".approve-button");
    const rejectButton = document
      .getElementById("reject-approval")
      .addEventListener("click", function () {
        const step = agentSystem.workflow.pendingApproval;
        if (step) {
          if (
            confirm(
              "Are you sure you want to reject this result? This will terminate the entire workflow."
            )
          ) {
            rejectCurrentStep();
          }
        }
      });

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

      // Clear previous content and create new editable area
      resultElement.innerHTML = "";

      // Create the editable div with proper styling
      const editableDiv = document.createElement("div");
      editableDiv.id = `modal-${step}-editable`;
      editableDiv.className = "editable-content";
      editableDiv.contentEditable = true;
      editableDiv.textContent = outputContent;

      // Add instructions for editing
      const instructions = document.createElement("p");
      instructions.className = "edit-instructions";
      instructions.innerHTML =
        '<i class="fas fa-edit"></i> This content is editable. Your changes will be passed to the next agent.';

      // Append everything to the result element
      resultElement.appendChild(instructions);
      resultElement.appendChild(editableDiv);
    }

    if (approveButton) {
      approveButton.onclick = () => {
        // Get the edited content before approving
        const editableDiv = document.getElementById(`modal-${step}-editable`);
        if (editableDiv) {
          const editedContent = editableDiv.textContent.trim();
          agentSystem.workflow.editedResults[step] = editedContent;

          // Now approve with the edited content
          approveStep(step, editedContent);
        } else {
          approveStep(step);
        }
      };
    }

    if (rejectButton) {
      rejectButton.onclick = () => {
        if (
          confirm(
            "Are you sure you want to reject this result? This will terminate the entire workflow."
          )
        ) {
          rejectCurrentStep();
        }
      };
    }

    // Show modal
    modal.classList.add("active");
  }

  // Make sure the rejectCurrentStep function is properly defined and called
  //   function rejectCurrentStep() {
  //     const step = agentSystem.workflow.pendingApproval;

  //     // Set termination flag
  //     agentSystem.terminationRequested = true;

  //     // Notify server
  //     fetch("/api/agents/reject", {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //         Authorization: `Bearer ${auth.getAccessToken()}`,
  //       },
  //       body: JSON.stringify({
  //         sessionId: agentSystem.sessionId,
  //         step: step,
  //       }),
  //     })
  //       .then((response) => {
  //         if (!response.ok) throw new Error("Failed to reject step");
  //         return response.json();
  //       })
  //       .then((data) => {
  //         console.log("Step rejected successfully:", data);
  //         hideApprovalModal();
  //         addOrchestratorMessage(
  //           `User rejected ${step} result. Terminating workflow.`,
  //           true
  //         );
  //       })
  //       .catch((error) => {
  //         console.error("Error rejecting step:", error);
  //         alert(`Error: ${error.message}`);
  //       });
  //   }

  // Improved rejection function
  function rejectCurrentStep() {
    const step = agentSystem.workflow.pendingApproval;
    if (!step || !agentSystem.sessionId) {
      console.error("Cannot reject: missing step or session information");
      alert("Cannot reject at this time. Missing necessary information.");
      return;
    }

    // Show loading indicator
    const rejectButton = document.getElementById("reject-approval");
    const originalText = rejectButton.textContent;
    rejectButton.textContent = "Rejecting...";
    rejectButton.disabled = true;

    // Notify server via both socket and REST API for redundancy
    agentSystem.socket.emit("rejectStep", {
      sessionId: agentSystem.sessionId,
      step: step,
    });

    fetch("/api/agents/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.getAccessToken()}`,
      },
      body: JSON.stringify({
        sessionId: agentSystem.sessionId,
        step: step,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}: ${response.statusText}`
          );
        }
        return response.json();
      })
      .then((data) => {
        console.log("Step rejected successfully:", data);
        hideApprovalModal();

        // Update UI to show termination
        for (const key in agentSystem.agents) {
          if (key !== "orchestrator") {
            agentSystem.agents[key].status = "idle";
          }
        }
        agentSystem.agents.orchestrator.status = "error";

        // Add message to orchestrator
        addOrchestratorMessage(
          `Workflow terminated: User rejected results from ${step}`,
          true
        );

        // Update workflow state
        agentSystem.workflow.started = false;
        agentSystem.workflow.completed = true;
        agentSystem.terminationRequested = true;

        updateUI();

        // Alert user
        alert("Workflow terminated. You can start a new analysis when ready.");
      })
      .catch((error) => {
        console.error("Error rejecting step:", error);
        alert(`Error rejecting step: ${error.message}. Please try again.`);
        rejectButton.textContent = originalText;
        rejectButton.disabled = false;
      });
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
      { from: "contentAnalysis", to: "knowledgeRetrieval" },
      { from: "knowledgeRetrieval", to: "analogyGeneration" },
      { from: "analogyGeneration", to: "analogyValidation" },
      { from: "analogyValidation", to: "analogyRefinement" },
      { from: "analogyRefinement", to: "explanation" },
      { from: "explanation", to: "userFeedback" },
      { from: "userFeedback", to: "learning" },
      // Add connections from orchestrator to all agents
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

  // Make saveEditedResult available globally
  window.saveEditedResult = saveEditedResult;

  // Resize handler for connections
  window.addEventListener("resize", () => {
    drawAgentConnections();
  });

  // Initialize agent interface
  function init() {
    // Initialize socket
    initSocket();

    // Load necessary libraries
    loadExternalScript(
      "https://cdn.jsdelivr.net/npm/markdown-it@12.0.6/dist/markdown-it.min.js",
      () => {
        loadExternalScript(
          "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.5.0/build/highlight.min.js",
          () => {
            console.log("Markdown and highlighting libraries loaded");
          }
        );
      }
    );

    // Set up event listeners
    const startButton = document.getElementById("agent-start-btn");
    if (startButton) {
      startButton.addEventListener("click", startAgentProcessing);
    }

    const feedbackSubmitBtn = document.getElementById("feedback-submit-btn");
    if (feedbackSubmitBtn) {
      feedbackSubmitBtn.addEventListener("click", submitFeedback);
    }

    // Set up result toggles
    const resultToggles = document.querySelectorAll(".agent-result-toggle");
    resultToggles.forEach((toggle) => {
      toggle.addEventListener("click", function () {
        toggleResultDisplay(this);
      });
    });

    // Close modal when clicking outside
    const modal = document.getElementById("approval-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === this) {
          hideApprovalModal();
        }
      });
    }

    // Initialize UI
    updateUI();

    console.log("Agent interface initialized");
  }

  // Helper function to load external scripts
  function loadExternalScript(url, callback) {
    const script = document.createElement("script");
    script.src = url;
    script.onload = callback;
    document.head.appendChild(script);
  }

  // Initialize when document is ready
  init();
});
