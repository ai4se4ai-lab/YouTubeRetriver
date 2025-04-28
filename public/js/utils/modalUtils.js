/**
 * Modal Utility Functions
 * Contains helper functions for modal management
 */

// Create namespace for modal utilities
window.modalUtils = (function () {
  /**
   * Show the approval modal for a specific step
   * @param {string} step - The step to approve
   * @param {Object} result - The result to display
   * @param {Object} agentSystem - Agent system state
   * @param {Object} md - Markdown renderer
   * @param {Function} approveStep - Function to approve the step
   * @param {Function} rejectStep - Function to reject the step
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   */
  function showApprovalModal(
    step,
    result,
    agentSystem,
    md,
    approveStep,
    rejectStep,
    addOrchestratorMessage
  ) {
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
      // Extract the meaningful content using the helper function
      const displayContent = window.uiHelpers.getOutputContent(result);

      // Check if we have an edited version of this content
      if (agentSystem.workflow.editedResults[step]) {
        // Changed agentKey to step
        const editedContent = agentSystem.workflow.editedResults[step]; // Changed agentKey to step
        outputContent = editedContent;
      }

      // Create editable content area with markdown preview
      resultElement.innerHTML = `
          <div class="markdown-view">${
            md ? md.render(displayContent) : `<p>${displayContent}</p>`
          }</div>
          <div id="modal-${step}-editable" class="editable-content" contenteditable="true">${displayContent}</div>
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
        agentSystem.workflow.editedResults[step] = content; // Changed agentKey to step
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
          `User edited content for ${step} in approval modal. Changes saved.`, // Changed agentKey to step
          false,
          agentSystem
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
      `Waiting for user approval on ${step}. Modal displayed.`,
      false,
      agentSystem
    );
  }

  /**
   * Hide approval modal
   */
  function hideApprovalModal() {
    const modal = document.getElementById("approval-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  /**
   * Show feedback modal
   * @param {Object} agentSystem - Agent system state
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   */
  function showFeedbackModal(agentSystem, addOrchestratorMessage) {
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
    addOrchestratorMessage(
      "Waiting for user feedback. Modal displayed.",
      false,
      agentSystem
    );
  }

  /**
   * Hide feedback modal
   */
  function hideFeedbackModal() {
    const modal = document.getElementById("feedback-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  /**
   * Extract analogies for display from output
   * @param {string} output - Raw output from explanation agent
   * @returns {string} - Formatted analogies for display
   */
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

    return cleanOutput;
  }

  /**
   * Show final results modal
   * @param {boolean} wasTerminated - Whether the workflow was terminated early
   * @param {Object} agentSystem - Agent system state
   * @param {Object} md - Markdown renderer
   * @param {Function} addOrchestratorMessage - Function to add orchestrator message
   * @param {Function} updateUI - Function to update UI
   * @param {Function} updateOrchestratorStatus - Function to update orchestrator status
   */
  function showFinalResultsModal(
    wasTerminated,
    agentSystem,
    md,
    addOrchestratorMessage,
    updateUI,
    updateOrchestratorStatus
  ) {
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
        if (explanationResult) {
          // Extract the meaningful content using the helper function
          const displayContent =
            window.uiHelpers.getOutputContent(explanationResult);
          resultContent.innerHTML += md.render(
            extractAnalogiesForDisplay(displayContent)
          );
        } else {
          resultContent.innerHTML +=
            "<p>No final results were generated before termination.</p>";
        }
      } else {
        // Show full results
        if (explanationResult) {
          // Extract the meaningful content using the helper function
          const displayContent =
            window.uiHelpers.getOutputContent(explanationResult);
          resultContent.innerHTML = md.render(
            extractAnalogiesForDisplay(displayContent)
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
    addOrchestratorMessage(
      "Displaying final results to user.",
      false,
      agentSystem
    );

    // Update UI to show workflow as completed
    agentSystem.workflow.completed = true;
    updateOrchestratorStatus("completed", agentSystem);
    updateUI(agentSystem);
  }

  /**
   * Hide final results modal
   */
  function hideFinalResultsModal() {
    const modal = document.getElementById("final-results-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Return public API
  return {
    showApprovalModal,
    hideApprovalModal,
    showFeedbackModal,
    hideFeedbackModal,
    extractAnalogiesForDisplay,
    showFinalResultsModal,
    hideFinalResultsModal,
  };
})();
