/**
 * Agent Controller
 * Handles agent-related routes and WebSocket communication
 */
const agentService = require("../services/agentService");

// Store active sessions and approval callbacks
const pendingApprovals = new Map();
// Global variable for socket.io instance
let io;

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

      // Create a copy of the result to avoid reference issues
      const approvedResult = JSON.parse(JSON.stringify(result));

      // If there's edited content, update the result
      if (editedContent) {
        if (approvedResult && approvedResult.result) {
          approvedResult.result.output = editedContent;
          // Also update the summarized output
          approvedResult.result.summarizedOutput =
            approvedResult.result.output.split(/\s+/).length > 250
              ? approvedResult.result.output
                  .split(/\s+/)
                  .slice(0, 240)
                  .join(" ") +
                "... [Output truncated to 250 words. Click 'Show Full Content' to see full content]"
              : approvedResult.result.output;

          console.log(`Updated content for ${step} with edited version`);
        }
      }

      // Remove from pending map
      pendingApprovals.get(sessionId).delete(step);

      // Resolve the promise to continue processing with the potentially modified result
      resolve(approvedResult);

      res.json({
        success: true,
        message: `Step ${step} approved, processing continuing with ${
          editedContent ? "edited" : "original"
        } content`,
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
   * Reject a step and terminate the workflow
   */
  async rejectStep(req, res) {
    try {
      const { sessionId, step } = req.body;

      if (!sessionId || !step) {
        return res
          .status(400)
          .json({ error: "Session ID and step are required" });
      }

      console.log(
        `Reject request received for session ${sessionId}, step ${step}`
      );

      // Get the agent manager
      const agentManager = agentService.getAgentManager();

      // Request termination
      const terminationResult = await agentManager.requestTermination(
        sessionId,
        step,
        "User rejected the results"
      );

      // Remove from pending approvals if exists
      if (
        pendingApprovals.has(sessionId) &&
        pendingApprovals.get(sessionId).has(step)
      ) {
        // Get resolver to properly resolve the promise
        const { resolve } = pendingApprovals.get(sessionId).get(step);
        // Resolve with null to indicate rejection
        resolve(null);
        // Remove from pending map
        pendingApprovals.get(sessionId).delete(step);

        console.log(
          `Removed ${step} from pending approvals for session ${sessionId}`
        );
      }

      // Notify all clients subscribed to this session
      if (io) {
        io.to(sessionId).emit("workflowTerminated", {
          reason: "User rejected results",
          step,
          message: "Workflow terminated because results were rejected.",
          alertUser: true,
          timestamp: new Date().toISOString(),
        });

        console.log(`Emitted workflowTerminated event to session ${sessionId}`);
      } else {
        console.error("IO instance not available for socket emissions");
      }

      res.json({
        success: true,
        message: "Workflow termination requested",
        result: terminationResult,
      });
    } catch (error) {
      console.error("Error rejecting step:", error);
      res.status(500).json({
        error: "Failed to reject step",
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
   * Get agent thinking process
   */
  async getAgentThinking(req, res) {
    try {
      const { sessionId, agentKey } = req.params;

      // Get the agent manager
      const agentManager = agentService.getAgentManager();

      // Get thinking process from the manager
      const thinking = agentManager.getAgentThinking(sessionId, agentKey);

      if (!thinking) {
        return res.status(404).json({
          error: "No thinking process found for this agent",
        });
      }

      res.json({
        success: true,
        agent: agentKey,
        thinking,
      });
    } catch (error) {
      console.error("Error getting agent thinking:", error);
      res.status(500).json({
        error: "Failed to get agent thinking",
        message: error.message,
      });
    }
  },

  /**
   * Set up WebSocket handlers
   * @param {Object} socketIo - Socket.IO instance
   */
  setupSocketHandlers(socketIo) {
    // Store io instance for use in other methods
    io = socketIo;

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
          console.log(
            `Step ${step} approved via socket with edited content: ${!!editedContent}`
          );

          // Get the resolver function and result
          const { resolve, result } = pendingApprovals.get(sessionId).get(step);

          // Create a copy of the result to avoid reference issues
          const approvedResult = JSON.parse(JSON.stringify(result));

          // If there's edited content, update the result
          if (editedContent) {
            if (approvedResult && approvedResult.result) {
              approvedResult.result.output = editedContent;
              // Also update the summarized output for consistency
              approvedResult.result.summarizedOutput =
                approvedResult.result.output.split(/\s+/).length > 250
                  ? approvedResult.result.output
                      .split(/\s+/)
                      .slice(0, 240)
                      .join(" ") +
                    "... [Output truncated to 250 words. Click 'Show Full Content' to see full content]"
                  : approvedResult.result.output;

              console.log(
                `Updated content for ${step} with edited version via socket`
              );
            }
          }

          // Remove from pending map
          pendingApprovals.get(sessionId).delete(step);

          // Resolve the promise to continue processing with the potentially modified result
          resolve(approvedResult);

          // Notify all clients subscribed to this session
          io.to(sessionId).emit("stepApproved", {
            step,
            wasEdited: !!editedContent,
          });
        }
      });

      // Listen for step rejection
      socket.on("rejectStep", (data) => {
        const { sessionId, step } = data;
        console.log(
          `Received rejectStep via socket for session ${sessionId}, step ${step}`
        );

        // Call the reject handler directly
        this.rejectStep(
          {
            body: { sessionId, step },
          },
          {
            json: (response) => {
              console.log("Step rejection processed via socket:", response);
            },
            status: (code) => ({
              json: (error) => {
                console.error(
                  `Error processing step rejection via socket: ${code}`,
                  error
                );
                socket.emit("error", error);
              },
            }),
          }
        );
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
            // Show that feedback processing is starting
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

            // Also notify about the Learning agent starting
            io.to(sessionId).emit("processingStep", {
              step: "learning",
              status: "starting",
            });
          }
        } catch (error) {
          console.error("Error processing socket feedback:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Listen for orchestrator updates from clients
      socket.on("orchestratorUpdate", (data) => {
        if (data.sessionId) {
          // Forward the update to all clients in the session
          io.to(data.sessionId).emit("orchestratorUpdate", {
            timestamp: new Date().toISOString(),
            message: data.message,
          });
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

    // Add listener for agent thinking updates
    agentManager.on("agentThinking", (data) => {
      if (data.sessionId) {
        io.to(data.sessionId).emit("agentThinking", {
          agent: data.agent,
          thinking: data.thinking,
        });
      }
    });

    // Add listener for orchestrator updates
    agentManager.on("orchestratorUpdate", (update) => {
      io.to(agentManager.getCurrentState().sessionId).emit(
        "orchestratorUpdate",
        update
      );
    });

    // Add listener for workflow termination
    agentManager.on("workflowTerminated", (data) => {
      if (data.sessionId) {
        io.to(data.sessionId).emit("workflowTerminated", {
          reason: data.reason,
          rejectedStep: data.rejectedStep,
          message: data.message || "Workflow terminated by user request",
          alertUser: data.alertUser || false,
          timestamp: data.timestamp,
        });
      }
    });

    agentManager.on("error", (error) => {
      io.to(error.state.sessionId).emit("error", error);
    });
  },
};
