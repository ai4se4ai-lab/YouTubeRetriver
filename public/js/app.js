/**
 * Main application file
 * Handles UI interactions and orchestrates auth and data handling operations
 */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing app");

  // DOM Elements
  const authButton = document.getElementById("auth-button");
  const exportButton = document.getElementById("export-button");
  const downloadButton = document.getElementById("download-button");
  const privacyLink = document.getElementById("privacy-link");
  const closeModal = document.querySelector(".close-modal");
  const privacyModal = document.getElementById("privacy-modal");

  const loginStatus = document.getElementById("login-status");
  const dataSection = document.getElementById("data-section");
  const resultsSection = document.getElementById("results-section");
  const downloadContainer = document.getElementById("download-container");
  const exportStatus = document.getElementById("export-status");
  const progressBar = document.getElementById("progress-bar");

  // Log DOM elements to ensure they're found
  console.log("Auth button found:", !!authButton);
  console.log("Login status element found:", !!loginStatus);
  console.log("Data section found:", !!dataSection);

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
        })
        .catch((error) => {
          console.error("Export error:", error);
          exportStatus.textContent = `Export failed: ${error.message}`;
          progressBar.style.width = "0%";
        });
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

  // Helper functions
  function updateUIOnAuth(isAuthenticated) {
    console.log("Updating UI, authenticated:", isAuthenticated);
    if (isAuthenticated) {
      authButton.textContent = "Disconnect";
      loginStatus.textContent = "Connected";
      loginStatus.classList.add("connected");
      dataSection.classList.remove("hidden");
    } else {
      authButton.textContent = "Connect to YouTube";
      loginStatus.textContent = "Not connected";
      loginStatus.classList.remove("connected");
      dataSection.classList.add("hidden");
      resultsSection.classList.add("hidden");
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
});
