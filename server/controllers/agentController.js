/**
 * Agent Controller
 * Handles agent-related routes and WebSocket communication
 */
const agentService = require("../services/agentService");

// Store active sessions and approval callbacks
const pendingApprovals = new Map();

module.exports = {
  /**
   * Start agent processing
   */
  async startProcessing(req, res) {
    try {
      const { options, sessionId } = req.body;
      const accessToken = req.token;

      // Initialize a new session
      const activeSessionId = agentService.startSession(sessionId);

      // Create a promise for each step that requires approval
      // Will be resolved when the client sends approval via socket
      pendingApprovals.set(activeSessionId, new Map());

      // Define approval callback
      const approvalCallback = (step, result) => {
        return new Promise((resolve) => {
          // Store resolve function to be called when approved
          if (!pendingApprovals.has(activeSessionId)) {
            pendingApprovals.set(activeSessionId, new Map());
          }
          pendingApprovals.get(activeSessionId).set(step, { resolve, result });
        });
      };

      // Start processing in the background
      agentService
        .processYouTubeData(accessToken, options, approvalCallback)
        .then((results) => {
          // Processing completed
          // Clean up
          pendingApprovals.delete(activeSessionId);
        })
        .catch((error) => {
          console.error("Error in agent processing:", error);
          pendingApprovals.delete(activeSessionId);
        });

      // Return session ID immediately
      res.json({
        success: true,
        sessionId: activeSessionId,
        message: "Agent processing started",
      });
    } catch (error) {
      console.error("Error starting agent processing:", error);
      res.status(500).json({
        error: "Failed to start agent processing",
        message: error.message,
      });
    }
  },

  /**
   * Approve a processing step
   */
  async approveStep(req, res) {
    try {
      const { sessionId, step, editedContent } = req.body;

      if (
        !pendingApprovals.has(sessionId) ||
        !pendingApprovals.get(sessionId).has(step)
      ) {
        return res
          .status(404)
          .json({ error: "No pending approval found for this step" });
      }

      // Get the resolver function and original result
      const { resolve, result } = pendingApprovals.get(sessionId).get(step);

      // If there's edited content, update the result
      if (editedContent) {
        if (result && result.result) {
          result.result.output = editedContent;
        }
      }

      // Remove from pending map
      pendingApprovals.get(sessionId).delete(step);

      // Resolve the promise to continue processing
      resolve(result);

      res.json({
        success: true,
        message: `Step ${step} approved, processing continuing`,
      });
    } catch (error) {
      console.error("Error approving step:", error);
      res.status(500).json({
        error: "Failed to approve step",
        message: error.message,
      });
    }
  },

  /**
   * Submit user feedback
   */
  async submitFeedback(req, res) {
    try {
      const { feedback, sessionId } = req.body;

      // Get the current state to find the explanation
      const history = agentService.getProcessingHistory();
      const explanationResult = history.find((step) =>
        step.name.includes("Explanation Agent")
      );

      if (!explanationResult) {
        return res
          .status(400)
          .json({ error: "No explanation found to provide feedback on" });
      }

      // Process feedback
      const feedbackResults = await agentService.submitFeedback(
        feedback,
        explanationResult
      );

      res.json({
        success: true,
        results: feedbackResults,
      });
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({
        error: "Failed to process feedback",
        message: error.message,
      });
    }
  },

  /**
   * Get processing status
   */
  async getStatus(req, res) {
    try {
      const { sessionId } = req.params;

      // Get current state
      const state = agentService.getCurrentState();

      // Check if this is the active session
      if (state.sessionId !== sessionId) {
        return res
          .status(404)
          .json({ error: "Session not found or no longer active" });
      }

      // Get pending approvals for this session
      const pending = pendingApprovals.has(sessionId)
        ? Array.from(pendingApprovals.get(sessionId).keys())
        : [];

      res.json({
        state,
        pendingApprovals: pending,
        agentStatuses: agentService.getAgentStatuses(),
      });
    } catch (error) {
      console.error("Error getting status:", error);
      res.status(500).json({
        error: "Failed to get processing status",
        message: error.message,
      });
    }
  },

  /**
   * Get pending step details
   */
  async getPendingStepDetails(req, res) {
    try {
      const { sessionId, step } = req.params;

      if (
        !pendingApprovals.has(sessionId) ||
        !pendingApprovals.get(sessionId).has(step)
      ) {
        return res
          .status(404)
          .json({ error: "No pending approval found for this step" });
      }

      // Get the result
      const { result } = pendingApprovals.get(sessionId).get(step);

      res.json({
        step,
        result,
      });
    } catch (error) {
      console.error("Error getting pending step details:", error);
      res.status(500).json({
        error: "Failed to get step details",
        message: error.message,
      });
    }
  },

  /**
   * Set up WebSocket handlers
   * @param {Object} io - Socket.IO instance
   */
  setupSocketHandlers(io) {
    io.on("connection", (socket) => {
      console.log("Client connected to agent socket");

      // Listen for session subscription
      socket.on("subscribe", (sessionId) => {
        console.log(`Client subscribed to session: ${sessionId}`);
        socket.join(sessionId);
      });

      // Listen for step approval
      socket.on("approveStep", (data) => {
        const { sessionId, step, editedContent } = data;

        if (
          pendingApprovals.has(sessionId) &&
          pendingApprovals.get(sessionId).has(step)
        ) {
          console.log(`Step ${step} approved via socket`);

          // Get the resolver function and result
          const { resolve, result } = pendingApprovals.get(sessionId).get(step);

          // If there's edited content, update the result
          if (editedContent) {
            if (result && result.result) {
              result.result.output = editedContent;
            }
          }

          // Remove from pending map
          pendingApprovals.get(sessionId).delete(step);

          // Resolve the promise to continue processing
          resolve(result);

          // Notify all clients subscribed to this session
          io.to(sessionId).emit("stepApproved", { step });
        }
      });

      // Listen for feedback submission
      socket.on("feedback", async (data) => {
        try {
          const { feedback, sessionId } = data;

          // Get the explanation result
          const history = agentService.getProcessingHistory();
          const explanationResult = history.find((step) =>
            step.name.includes("Explanation Agent")
          );

          if (explanationResult) {
            // Process feedback and update status
            io.to(sessionId).emit("processingStep", {
              step: "userFeedback",
              status: "starting",
            });

            // Process feedback
            const results = await agentService.submitFeedback(
              feedback,
              explanationResult
            );

            // Emit results to all clients subscribed to this session
            io.to(sessionId).emit("feedbackProcessed", { results });
          }
        } catch (error) {
          console.error("Error processing socket feedback:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log("Client disconnected from agent socket");
      });
    });

    // Set up event listeners for agent state updates
    const agentManager = agentService.initAgents();

    agentManager.on("stateUpdate", (update) => {
      io.to(update.state.sessionId).emit("stateUpdate", update);
    });

    agentManager.on("processingStep", (stepInfo) => {
      io.to(agentManager.getCurrentState().sessionId).emit(
        "processingStep",
        stepInfo
      );
    });

    agentManager.on("error", (error) => {
      io.to(error.state.sessionId).emit("error", error);
    });
  },
};
