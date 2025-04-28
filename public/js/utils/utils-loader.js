/**
 * Utility Loader
 * Loads all client-side utility modules and exposes them globally
 */

// Self-executing function to load utility modules
(function () {
  console.log("Loading utility modules...");

  // Function to load a script dynamically
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;

      script.onload = () => {
        console.log(`Loaded: ${url}`);
        resolve();
      };

      script.onerror = () => {
        console.error(`Failed to load: ${url}`);
        reject(new Error(`Failed to load script: ${url}`));
      };

      document.head.appendChild(script);
    });
  }

  // Define utility files to load
  const utilityFiles = [
    "js/utils/uiHelpers.js",
    "js/utils/uiUtils.js",
    "js/utils/modalUtils.js",
    "js/utils/socketClientUtils.js",
    "js/utils/agentDisplayUtils.js",
  ];

  // Initialize global namespaces - these are now set by each utility file itself
  // using the window.utilityName = (function() {...})() pattern

  // Load all utility scripts sequentially
  async function loadUtilities() {
    try {
      for (const file of utilityFiles) {
        await loadScript(file);
      }
      console.log("All utility modules loaded successfully");

      // Do a quick check to make sure all utilities are available
      const utilitiesLoaded =
        window.uiHelpers &&
        window.uiUtils &&
        window.modalUtils &&
        window.socketClientUtils &&
        window.agentDisplayUtils;

      if (utilitiesLoaded) {
        console.log("All utility namespaces verified");
        // Dispatch an event when all utilities are loaded
        window.dispatchEvent(new CustomEvent("utils-loaded"));
      } else {
        console.error(
          "One or more utility modules failed to initialize properly"
        );
      }
    } catch (error) {
      console.error("Error loading utility modules:", error);
    }
  }

  // Start loading utilities
  loadUtilities();
})();
