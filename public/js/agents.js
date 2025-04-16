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
    }

    updateUI();
    drawAgentConnections();
  }

  function handleProcessingStep(stepInfo) {
    console.log("Processing step update:", stepInfo);

    if (stepInfo.step && agentSystem.agents[stepInfo.step]) {
      agentSystem.workflow.currentStep = stepInfo.step;
      agentSystem.agents[stepInfo.step].status = "processing";
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
    }

    updateUI();
  }

  function handleError(error) {
    console.error("Socket error:", error);
    alert(`Error: ${error.message}`);
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
      updateUI();

      // Start polling for status
      startStatusPolling();
    } catch (error) {
      console.error("Error starting agent processing:", error);
      alert(`Failed to start agent processing: ${error.message}`);
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

            // Fetch step details and show approval modal
            fetchPendingStepDetails(pendingStep);
          }
        }

        // Check if workflow is completed
        if (data.state && data.state.completed) {
          agentSystem.workflow.completed = true;
          clearInterval(statusPollInterval);
        }

        updateUI();
      } catch (error) {
        console.error("Error polling status:", error);
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
      updateUI();
    } catch (error) {
      console.error("Error approving step:", error);
      alert(`Failed to approve step: ${error.message}`);
    }
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

      updateUI();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert(`Failed to submit feedback: ${error.message}`);
      // Reset UI state
      document.getElementById("feedback-submit-btn").disabled = false;
      document.getElementById("feedback-status").textContent =
        "Failed to submit feedback.";
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
            <div class="markdown-view">${md.render(outputContent)}</div>
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

  // Show approval modal
  function showApprovalModal(step, result) {
    const modal = document.getElementById("approval-modal");
    if (!modal) return;

    // Set modal content
    const titleElement = modal.querySelector(".approval-title");
    const resultElement = modal.querySelector(".approval-result");
    const approveButton = modal.querySelector(".approve-button");

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
          <div class="markdown-view">${md.render(outputContent)}</div>
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
        markdownView.innerHTML = md.render(content);

        const saveConfirm = resultElement.querySelector(
          "#modal-save-confirmation"
        );
        saveConfirm.classList.add("visible");
        setTimeout(() => {
          saveConfirm.classList.remove("visible");
        }, 2000);
      });

      // Initially hide the editable view
      editableView.classList.add("hidden");
    }

    if (approveButton) {
      approveButton.onclick = () => approveStep(step);
    }

    // Show modal
    modal.classList.add("active");
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

      const x1 = fromRect.right - containerRect.left;
      const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
      const x2 = toRect.left - containerRect.left;
      const y2 = toRect.top + toRect.height / 2 - containerRect.top;

      // Create path
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );

      // Determine if connection is active
      const isActive =
        (agentSystem.agents[conn.from].status === "completed" ||
          agentSystem.agents[conn.from].status === "waiting") &&
        (agentSystem.agents[conn.to].status === "processing" ||
          agentSystem.agents[conn.to].status === "waiting" ||
          agentSystem.agents[conn.to].status === "completed");

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
