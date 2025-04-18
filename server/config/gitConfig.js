/**
 * Git Repository Configuration
 *
 * This module manages Git repository configurations for different analysis sessions.
 * It loads base settings from gitConfig.json and provides session-specific overrides.
 */
const path = require("path");
const fs = require("fs");

// Load configuration from JSON file
let configJson = {};
const configFilePath = path.join(__dirname, "gitConfig.json");

try {
  // Read configuration from JSON file
  if (fs.existsSync(configFilePath)) {
    const rawConfig = fs.readFileSync(configFilePath, "utf8");
    configJson = JSON.parse(rawConfig);
    console.log("Git configuration loaded from gitConfig.json");
  } else {
    console.warn("gitConfig.json not found, using default settings");
  }
} catch (error) {
  console.error("Error loading Git configuration:", error);
  console.warn("Using default Git configuration settings");
}

// Extract configuration values with defaults
const {
  defaultSettings = {
    repoUrl: "",
    targetBranch: "main",
    username: "",
    token: "",
    scanInterval: 60000,
  },
  reposDirectory = "./temp/git-repos",
  cleanupDelay = 5000,
  maxConcurrentSessions = 10,
} = configJson;

// Ensure the repositories directory exists
const REPOS_DIR = path.resolve(reposDirectory);
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  console.log(`Created Git repositories directory: ${REPOS_DIR}`);
}

// Store active configurations by session ID
const sessionConfigs = new Map();

const gitConfig = {
  /**
   * Get Git configuration for a specific session
   * @param {string} sessionId - Session identifier
   * @returns {Object} Git configuration for the session
   */
  getConfig(sessionId) {
    // If we have a specific configuration for this session, use it
    if (sessionId && sessionConfigs.has(sessionId)) {
      return sessionConfigs.get(sessionId);
    }

    // If no valid session, return a copy of the default config
    return {
      ...defaultSettings,
      repoPath: path.join(REPOS_DIR, "default"),
    };
  },

  /**
   * Set Git configuration for a specific session
   * @param {string} sessionId - Session identifier
   * @param {Object} config - Git configuration
   * @returns {Object} The updated configuration
   */
  setConfig(sessionId, config) {
    if (!sessionId) {
      throw new Error("Session ID is required to set Git configuration");
    }

    // Check if we're at the maximum number of concurrent sessions
    if (
      !sessionConfigs.has(sessionId) &&
      sessionConfigs.size >= maxConcurrentSessions
    ) {
      console.warn(
        `Maximum number of concurrent Git sessions (${maxConcurrentSessions}) reached`
      );

      // Find the oldest session to remove
      let oldestSession = null;
      let oldestTime = Date.now();

      for (const [id, cfg] of sessionConfigs.entries()) {
        if (cfg.createdAt && cfg.createdAt < oldestTime) {
          oldestTime = cfg.createdAt;
          oldestSession = id;
        }
      }

      // Remove the oldest session if found
      if (oldestSession) {
        console.log(`Removing oldest Git session: ${oldestSession}`);
        this.clearConfig(oldestSession);
      }
    }

    // If this session already has a config, get it
    const existingConfig = sessionConfigs.has(sessionId)
      ? sessionConfigs.get(sessionId)
      : {
          ...defaultSettings,
          repoPath: path.join(REPOS_DIR, `session-${sessionId}`),
          createdAt: Date.now(),
        };

    // Create a new config object by merging with existing
    const updatedConfig = {
      ...existingConfig,
      ...config,
      // Always ensure the repoPath is set correctly
      repoPath: path.join(REPOS_DIR, `session-${sessionId}`),
      // Update the last modified time
      lastModified: Date.now(),
    };

    // Store the configuration for this session
    sessionConfigs.set(sessionId, updatedConfig);

    return updatedConfig;
  },

  /**
   * Clear Git configuration for a specific session
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if a configuration was cleared
   */
  clearConfig(sessionId) {
    if (!sessionId) return false;

    const wasDeleted = sessionConfigs.delete(sessionId);

    // Clean up the repository directory
    const repoPath = path.join(REPOS_DIR, `session-${sessionId}`);
    if (fs.existsSync(repoPath)) {
      try {
        console.log(`Scheduling cleanup for repository: ${repoPath}`);
        setTimeout(() => {
          try {
            // Use recursive option to delete directory and contents
            fs.rm(repoPath, { recursive: true, force: true }, (err) => {
              if (err) {
                console.error(
                  `Failed to delete repository directory: ${repoPath}`,
                  err
                );
              } else {
                console.log(`Successfully deleted repository: ${repoPath}`);
              }
            });
          } catch (err) {
            console.error(`Error during repository cleanup: ${repoPath}`, err);
          }
        }, cleanupDelay);
      } catch (error) {
        console.error(
          `Failed to schedule cleanup for repository: ${repoPath}`,
          error
        );
      }
    }

    return wasDeleted;
  },

  /**
   * Check if a session has a valid Git configuration
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if the session has a valid configuration
   */
  hasValidConfig(sessionId) {
    if (!sessionId || !sessionConfigs.has(sessionId)) {
      return false;
    }

    const config = sessionConfigs.get(sessionId);
    // A valid config must have at least a repository URL
    return !!config.repoUrl;
  },

  /**
   * Get the repository path for a specific session
   * @param {string} sessionId - Session identifier
   * @returns {string} The absolute path to the repository
   */
  getRepoPath(sessionId) {
    if (!sessionId) {
      return path.resolve(path.join(REPOS_DIR, "default"));
    }

    const repoPath = path.join(REPOS_DIR, `session-${sessionId}`);
    return path.resolve(repoPath);
  },

  /**
   * Update the last scan timestamp for a session
   * @param {string} sessionId - Session identifier
   * @param {Date} timestamp - The timestamp of the last scan
   */
  updateLastScan(sessionId, timestamp = new Date()) {
    if (!sessionId || !sessionConfigs.has(sessionId)) {
      return;
    }

    const config = sessionConfigs.get(sessionId);
    config.lastScan = timestamp;
    sessionConfigs.set(sessionId, config);
  },

  /**
   * Get all active sessions with their configurations
   * @returns {Array} Array of objects with sessionId and config properties
   */
  getAllSessions() {
    const sessions = [];
    for (const [sessionId, config] of sessionConfigs.entries()) {
      sessions.push({
        sessionId,
        config: {
          ...config,
          token: config.token ? "***" : "", // Mask sensitive data
        },
      });
    }
    return sessions;
  },

  /**
   * Get the scan interval from configuration
   * @returns {number} Scan interval in milliseconds
   */
  getScanInterval() {
    return defaultSettings.scanInterval;
  },

  /**
   * Reset all sessions and configurations
   * Used primarily for testing
   */
  resetAll() {
    sessionConfigs.clear();
    console.log("All Git configurations have been reset");
  },
};

// Export the gitConfig object
module.exports = gitConfig;
