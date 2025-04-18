/**
 * Agent routes
 */
const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agentController");
const agentService = require("../services/agentService");
const gitConfig = require("../config/gitConfig");
const helpers = require("../utils/helpers");

// Start agent processing
router.post(
  "/process",
  helpers.authenticateToken,
  agentController.startProcessing
);

// Approve a processing step
router.post("/approve", helpers.authenticateToken, agentController.approveStep);

// Reject and terminate the process
router.post(
  "/terminate",
  helpers.authenticateToken,
  agentController.terminateProcess
);

// Submit feedback
router.post(
  "/feedback",
  helpers.authenticateToken,
  agentController.submitFeedback
);

// Get processing status
router.get(
  "/status/:sessionId",
  helpers.authenticateToken,
  agentController.getStatus
);

// Get pending step details
router.get(
  "/pending/:sessionId/:step",
  helpers.authenticateToken,
  agentController.getPendingStepDetails
);

// Get Git configuration
router.get("/git-config", helpers.authenticateToken, async (req, res) => {
  try {
    // Get the default Git configuration
    const defaultConfig = gitConfig.getConfig();

    // Return just the necessary parts (not credentials)
    res.json({
      repoUrl: defaultConfig.repoUrl,
      targetBranch: defaultConfig.targetBranch,
      scanInterval: defaultConfig.scanInterval,
    });
  } catch (error) {
    console.error("Error fetching Git configuration:", error);
    res.status(500).json({
      error: "Failed to fetch Git configuration",
      message: error.message,
    });
  }
});

// Test Git connection
router.post(
  "/test-git-connection",
  helpers.authenticateToken,
  async (req, res) => {
    try {
      const gitAgent = agentService.getAgent("gitAnalysis");
      if (!gitAgent) {
        return res.status(404).json({ error: "Git Analysis Agent not found" });
      }

      // Create a temporary session ID for testing
      const tempSessionId = `test_${Date.now()}`;

      // Set the session for the Git agent using default configuration
      gitAgent.setSession(tempSessionId);
      const connected = await gitAgent.connectToRepository();

      // Clean up after testing
      gitAgent.cleanup();

      res.json({
        success: connected,
        message: connected
          ? "Successfully connected to Git repository"
          : "Failed to connect to Git repository",
      });
    } catch (error) {
      console.error("Error testing Git connection:", error);
      res.status(500).json({
        error: "Failed to test Git connection",
        message: error.message,
      });
    }
  }
);

// Trigger Git analysis manually
router.post(
  "/trigger-git-analysis",
  helpers.authenticateToken,
  async (req, res) => {
    try {
      const { sessionId } = req.body;
      console.log(`Manually triggering Git analysis for session ${sessionId}`);

      // Get the Git agent via the manager
      const agentManager = agentService.initAgents();
      const result = await agentManager.triggerGitAnalysis(sessionId);

      // Emit the result via socket
      const io = req.app.get("io");
      if (io && sessionId) {
        io.to(sessionId).emit("processingStep", {
          step: "gitAnalysis",
          status: "completed",
        });

        io.to(sessionId).emit("stateUpdate", {
          agent: "gitAnalysis",
          result: result,
          state: agentManager.getCurrentState(),
        });
      }

      res.json({
        success: true,
        message: "Git analysis triggered successfully",
        result: result,
      });
    } catch (error) {
      console.error("Error triggering Git analysis:", error);
      res.status(500).json({
        error: "Failed to trigger Git analysis",
        message: error.message,
      });
    }
  }
);

module.exports = router;
