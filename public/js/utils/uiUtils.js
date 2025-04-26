/**
 * UI Utility Functions
 * Contains helper functions for UI interactions and display
 */

// Create namespace for UI utilities
window.uiUtils = (function () {
  /**
   * Update agent cards and UI state
   * @param {Object} agentSystem - Agent system state
   * @param {Function} drawAgentConnections - Function to draw connections between agents
   * @param {Function} saveEditedResult - Function to save edited results
   * @param {Object} md - Markdown renderer
   */
  function updateUI(agentSystem, drawAgentConnections, saveEditedResult, md) {
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
    if (drawAgentConnections) {
      drawAgentConnections();
    }
  }

  /**
   * Draw connections between agents to visualize workflow
   * @param {Object} agentSystem - Agent system state
   */
  function drawAgentConnections(agentSystem) {
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

  /**
   * Update orchestrator status
   * @param {string} status - New status (active, idle, completed)
   * @param {Object} agentSystem - Agent system state
   */
  function updateOrchestratorStatus(status, agentSystem) {
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

  /**
   * Add a message to the orchestrator
   * @param {string} message - Message content
   * @param {boolean} isAlert - Whether the message is an alert
   * @param {Object} agentSystem - Agent system state
   */
  function addOrchestratorMessage(message, isAlert, agentSystem) {
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
    updateOrchestratorStatus("active", agentSystem);
  }

  /**
   * Toggle result display
   * @param {HTMLElement} element - Toggle element
   */
  function toggleResultDisplay(element) {
    const resultElement = element.parentNode.querySelector(".agent-result");
    if (resultElement) {
      resultElement.classList.toggle("expanded");
      element.textContent = resultElement.classList.contains("expanded")
        ? "Show Less"
        : "Show More";
    }
  }

  /**
   * Reset agent system to initial state
   * @param {Object} agentSystem - Agent system state
   */
  function resetAgentSystem(agentSystem) {
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

    // Add initial message
    addOrchestratorMessage(
      "Initializing agent system workflow...",
      false,
      agentSystem
    );
  }

  /**
   * Save edited result
   * @param {string} agentKey - The agent key
   * @param {Object} agentSystem - Agent system state
   * @param {Object} md - Markdown renderer
   */
  function saveEditedResult(agentKey, agentSystem, md) {
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
        `User edited content for ${agentKey}. Changes saved and will be used in subsequent steps.`,
        false,
        agentSystem
      );
    }
  }

  // Return public API
  return {
    updateUI,
    drawAgentConnections,
    updateOrchestratorStatus,
    addOrchestratorMessage,
    toggleResultDisplay,
    resetAgentSystem,
    saveEditedResult,
  };
})();
