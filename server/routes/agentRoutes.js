/**
 * Agent routes
 */
const express = require("express");
const router = express.Router();
const agentController = require("../controllers/agentController");
const helpers = require("../utils/helpers");

// Start agent processing
router.post(
  "/process",
  helpers.authenticateToken,
  agentController.startProcessing
);

// Basic test endpoint
router.get("/simple-test", (req, res) => {
  res.json({ success: true, message: "Simple test endpoint working" });
});

// Test Git repository connection
router.post(
  "/test-git-connection",
  helpers.authenticateToken,
  agentController.testGitConnection
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

module.exports = router;
