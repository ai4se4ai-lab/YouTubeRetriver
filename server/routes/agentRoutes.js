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

// Approve a processing step
router.post("/approve", helpers.authenticateToken, agentController.approveStep);

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

// New route for getting agent thinking process
router.get(
  "/thinking/:sessionId/:agentKey",
  helpers.authenticateToken,
  agentController.getAgentThinking
);

// New route for rejecting a step and terminating workflow
router.post("/reject", helpers.authenticateToken, agentController.rejectStep);

module.exports = router;
