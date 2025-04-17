/**
 * Main application file
 * Handles UI interactions and orchestrates auth and data handling operations
 */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing app");

  // DOM Elements
  const authButton = document.getElementById("auth-button");
  const exportButton = document.getElementById("export-button");
  const agentStartButton = document.getElementById("agent-start-btn");
  const downloadButton = document.getElementById("download-button");
  const privacyLink = document.getElementById("privacy-link");
  const closeModal = document.querySelector(".close-modal");
  const privacyModal = document.getElementById("privacy-modal");

  const loginStatus = document.getElementById("login-status");
  const dataSection = document.getElementById("data-section");
  const resultsSection = document.getElementById("results-section");
  const agentSystemSection = document.getElementById("agent-system");
  const downloadContainer = document.getElementById("download-container");
  const exportStatus = document.getElementById("export-status");
  const progressBar = document.getElementById("progress-bar");

  // Track export completion state
  let exportCompleted = false;

  // Log DOM elements to ensure they're found
  console.log("Auth button found:", !!authButton);
  console.log("Login status element found:", !!loginStatus);
  console.log("Data section found:", !!dataSection);
  console.log("Agent start button found:", !!agentStartButton);

  // Initialize agent start button as disabled
  if (agentStartButton) {
    agentStartButton.disabled = true;
    agentStartButton.classList.add("analysis-disabled");
  }

  // Check if user is already authenticated on page load
  auth
    .checkAuthStatus()
    .then((isAuthenticated) => {
      console.log("Auth status checked, authenticated:", isAuthenticated);
      if (isAuthenticated) {
        updateUIOnAuth(true);
      }
    })
    .catch((error) => {
      console.error("Error checking auth status:", error);
    });

  // Authentication button click event
  if (authButton) {
    console.log("Adding click event to auth button");
    authButton.addEventListener("click", () => {
      console.log("Auth button clicked");
      if (auth.isAuthenticated()) {
        console.log("User is authenticated, signing out");
        auth
          .signOut()
          .then(() => {
            updateUIOnAuth(false);
            // Reset export state when logging out
            exportCompleted = false;
            updateAnalysisButtonState(false);
          })
          .catch((error) => {
            console.error("Error signing out:", error);
            showError("Failed to sign out. Please try again.");
          });
      } else {
        console.log("User is not authenticated, signing in");
        auth
          .signIn()
          .then(() => {
            console.log("Sign in successful");
            updateUIOnAuth(true);
          })
          .catch((error) => {
            console.error("Error signing in:", error);
            showError("Failed to authenticate with YouTube. Please try again.");
          });
      }
    });
  } else {
    console.error("Auth button not found in the DOM");
  }

  // Export button click event
  if (exportButton) {
    exportButton.addEventListener("click", () => {
      // Reset export state
      exportCompleted = false;
      updateAnalysisButtonState(false);

      // Get export options
      const options = {
        likedVideos: document.getElementById("liked-videos").checked,
        watchHistory: document.getElementById("watch-history").checked,
        maxResults: parseInt(document.getElementById("max-results").value, 10),
      };

      // Validate options
      if (!options.likedVideos && !options.watchHistory) {
        showError("Please select at least one data type to export.");
        return;
      }

      if (isNaN(options.maxResults) || options.maxResults < 1) {
        showError("Please enter a valid number for maximum results.");
        return;
      }

      // Show results section and reset UI
      resultsSection.classList.remove("hidden");
      downloadContainer.classList.add("hidden");
      progressBar.style.width = "0%";
      exportStatus.textContent = "Starting export...";

      // Hide agent system if visible
      agentSystemSection.classList.add("hidden");

      // Start the export process
      dataHandler
        .exportData(options, updateProgress)
        .then((filename) => {
          exportStatus.textContent = "Export completed successfully!";
          downloadContainer.classList.remove("hidden");

          // Set up download link
          downloadButton.onclick = () => {
            window.location.href = `/download/${filename}`;
          };

          // Update export state and enable analysis
          exportCompleted = true;
          updateAnalysisButtonState(true);
        })
        .catch((error) => {
          console.error("Export error:", error);
          exportStatus.textContent = `Export failed: ${error.message}`;
          progressBar.style.width = "0%";

          // Keep analysis disabled
          exportCompleted = false;
          updateAnalysisButtonState(false);
        });
    });
  }

  // Agent start button click event
  if (agentStartButton) {
    agentStartButton.addEventListener("click", () => {
      // Only allow starting analysis if export is completed
      if (!exportCompleted) {
        showError("Please export data first before starting analysis.");
        return;
      }

      // Start agent processing
      if (
        window.showThinkingProcess &&
        typeof window.startAgentProcessing === "function"
      ) {
        window.startAgentProcessing();
      } else {
        console.error("Agent functions not found - ensure agents.js is loaded");
        showError(
          "Failed to start AI analysis. Please refresh the page and try again."
        );
      }
    });
  }

  // Privacy modal
  if (privacyLink) {
    privacyLink.addEventListener("click", (e) => {
      e.preventDefault();
      privacyModal.style.display = "block";
    });
  }

  if (closeModal) {
    closeModal.addEventListener("click", () => {
      privacyModal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === privacyModal) {
      privacyModal.style.display = "none";
    }
  });

  // Helper function to update analysis button state
  function updateAnalysisButtonState(enabled) {
    if (agentStartButton) {
      agentStartButton.disabled = !enabled;

      if (enabled) {
        agentStartButton.classList.remove("analysis-disabled");
        // Add pulse effect to draw attention
        agentStartButton.classList.add("pulse-attention");
        setTimeout(() => {
          agentStartButton.classList.remove("pulse-attention");
        }, 5000);
      } else {
        agentStartButton.classList.add("analysis-disabled");
        agentStartButton.classList.remove("pulse-attention");
      }
    }
  }

  // Helper functions
  function updateUIOnAuth(isAuthenticated) {
    console.log("Updating UI, authenticated:", isAuthenticated);
    if (isAuthenticated) {
      authButton.textContent = "Disconnect";
      loginStatus.textContent = "Connected";
      loginStatus.classList.add("connected");
      dataSection.classList.remove("hidden");

      // Reset export completion state on new login
      exportCompleted = false;
      updateAnalysisButtonState(false);
    } else {
      authButton.textContent = "Connect to YouTube";
      loginStatus.textContent = "Not connected";
      loginStatus.classList.remove("connected");
      dataSection.classList.add("hidden");
      resultsSection.classList.add("hidden");
      agentSystemSection.classList.add("hidden");

      // Reset export completion state on logout
      exportCompleted = false;
      updateAnalysisButtonState(false);
    }
  }

  function updateProgress(percentage, statusText) {
    progressBar.style.width = `${percentage}%`;
    if (statusText) {
      exportStatus.textContent = statusText;
    }
  }

  function showError(message) {
    console.error("Error:", message);
    alert(message);
  }

  // Make functions available globally if needed by agent system
  window.handleExportCompletion = (success) => {
    exportCompleted = success;
    updateAnalysisButtonState(success);
  };
});
