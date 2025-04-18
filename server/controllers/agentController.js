/**
 * Agent Controller
 * Handles agent-related routes and WebSocket communication
 */
const agentService = require("../services/agentService");
const config = require("../config/config");

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

      console.log("Starting agent processing with options:", options);
      console.log("Agent approval configuration:", config.agentApprovals);

      // Initialize a new session
      const activeSessionId = agentService.startSession(sessionId);

      // Create a promise for each step that requires approval
      pendingApprovals.set(activeSessionId, new Map());

      // Define approval callback
      const approvalCallback = (step, result) => {
        console.log(`APPROVAL CALLBACK INVOKED for step: ${step}`);

        return new Promise((resolve, reject) => {
          console.log(`Creating promise for approval of step: ${step}`);

          // Create a new entry in the pending approvals map
          if (!pendingApprovals.get(activeSessionId)) {
            pendingApprovals.set(activeSessionId, new Map());
          }

          pendingApprovals
            .get(activeSessionId)
            .set(step, { resolve, reject, result });

          // Emit event to notify UI
          const io = req.app.get("io");
          if (io) {
            console.log(
              `Emitting 'processingStep' event with status 'waiting' for step ${step}`
            );
            io.to(activeSessionId).emit("processingStep", {
              step: step,
              status: "waiting",
            });
          } else {
            console.error("Socket.IO instance not found in req.app");
          }
        });
      };

      // Start processing in the background
      agentService
        .processYouTubeData(accessToken, options, approvalCallback)
        .then((results) => {
          // Processing completed
          console.log("Processing completed successfully");
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
      console.log(
        `Received approval request for session ${sessionId}, step ${step}`
      );

      if (
        !pendingApprovals.has(sessionId) ||
        !pendingApprovals.get(sessionId).has(step)
      ) {
        console.error(
          `No pending approval found for session ${sessionId}, step ${step}`
        );
        return res
          .status(404)
          .json({ error: "No pending approval found for this step" });
      }

      // Get the resolver function and original result
      const { resolve, result } = pendingApprovals.get(sessionId).get(step);
      console.log(
        `Found pending approval for ${step}, proceeding with resolution`
      );

      // Create a copy of the result to avoid reference issues
      const approvedResult = JSON.parse(JSON.stringify(result));

      // If there's edited content, update the result
      if (editedContent) {
        if (approvedResult && approvedResult.result) {
          approvedResult.result.output = editedContent;
          console.log(`Updated content for ${step} with edited version`);
        }
      }

      // Remove from pending map
      pendingApprovals.get(sessionId).delete(step);

      // Resolve the promise to continue processing with the potentially modified result
      console.log(`Resolving promise for ${step}`);
      resolve(approvedResult);

      // Notify all clients via socket
      const io = req.app.get("io");
      if (io) {
        console.log(`Emitting stepApproved event for ${step}`);
        io.to(sessionId).emit("stepApproved", {
          step,
          wasEdited: !!editedContent,
        });
      }

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
   * Terminate the process (reject a step)
   */
  async terminateProcess(req, res) {
    try {
      const { sessionId, step, reason } = req.body;
      console.log(
        `Received termination request for session ${sessionId}, step ${step}`
      );

      if (
        !pendingApprovals.has(sessionId) ||
        !pendingApprovals.get(sessionId).has(step)
      ) {
        console.error(
          `No pending approval found for session ${sessionId}, step ${step}`
        );
        return res
          .status(404)
          .json({ error: "No pending approval found for this step" });
      }

      // Get the reject function
      const { reject } = pendingApprovals.get(sessionId).get(step);

      // Remove from pending map
      pendingApprovals.get(sessionId).delete(step);

      // Call the orchestrator to handle termination
      await agentService.handleTermination(sessionId, {
        rejectedStep: step,
        reason: reason || "User rejected step",
      });

      // Reject the promise to stop processing
      console.log(`Rejecting promise for ${step} to terminate workflow`);
      reject(new Error("Process terminated by user"));

      // Notify all clients subscribed to this session via socket
      const io = req.app.get("io");
      if (io) {
        console.log(`Emitting processTerminated event for ${step}`);
        io.to(sessionId).emit("processTerminated", {
          step,
          reason: reason || "User rejected step",
        });
      }

      res.json({
        success: true,
        message: `Process terminated at step ${step}`,
      });
    } catch (error) {
      console.error("Error terminating process:", error);
      res.status(500).json({
        error: "Failed to terminate process",
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
      console.log(`Received feedback for session ${sessionId}`);

      // Check for termination phrases
      const terminationPhrases = [
        "terminate the process",
        "finish it",
        "i am done",
        "end process",
        "stop it",
        "that's enough",
        "that's all",
        "i'm finished",
      ];

      const feedbackLower = feedback.toLowerCase();
      const isTerminating = terminationPhrases.some((phrase) =>
        feedbackLower.includes(phrase)
      );

      if (isTerminating) {
        console.log("Termination phrase detected in feedback");
        // User wants to terminate - just return success
        return res.json({
          success: true,
          terminated: true,
          message: "Process terminated by user feedback",
        });
      }

      // Get the current state to find the explanation
      const history = agentService.getProcessingHistory();
      const explanationResult = history.find((step) =>
        step.name.includes("Explanation Agent")
      );

      if (!explanationResult) {
        console.error("No explanation found to provide feedback on");
        return res
          .status(400)
          .json({ error: "No explanation found to provide feedback on" });
      }

      console.log("Processing feedback with explanation result");
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
      console.log(`Getting status for session ${sessionId}`);

      // Get current state
      const state = agentService.getCurrentState();

      // Check if this is the active session
      if (state.sessionId !== sessionId) {
        console.error(`Session ${sessionId} not found or no longer active`);
        return res
          .status(404)
          .json({ error: "Session not found or no longer active" });
      }

      // Get pending approvals for this session
      const pending = pendingApprovals.has(sessionId)
        ? Array.from(pendingApprovals.get(sessionId).keys())
        : [];

      console.log(`Pending approvals for session ${sessionId}:`, pending);

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
      console.log(
        `Getting pending step details for session ${sessionId}, step ${step}`
      );

      if (
        !pendingApprovals.has(sessionId) ||
        !pendingApprovals.get(sessionId).has(step)
      ) {
        console.error(
          `No pending approval found for session ${sessionId}, step ${step}`
        );
        return res
          .status(404)
          .json({ error: "No pending approval found for this step" });
      }

      // Get the result
      const { result } = pendingApprovals.get(sessionId).get(step);
      console.log(`Found pending approval details for ${step}`);

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
        console.log(`Socket approveStep event for ${sessionId}, step ${step}`);

        if (
          pendingApprovals.has(sessionId) &&
          pendingApprovals.get(sessionId).has(step)
        ) {
          console.log(`Step ${step} approved via socket`);

          // Get the resolver function and result
          const { resolve, result } = pendingApprovals.get(sessionId).get(step);

          // Create a copy of the result to avoid reference issues
          const approvedResult = JSON.parse(JSON.stringify(result));

          // If there's edited content, update the result
          if (editedContent) {
            if (approvedResult && approvedResult.result) {
              approvedResult.result.output = editedContent;
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
        } else {
          console.error(
            `No pending approval found for socket approval of ${step}`
          );
        }
      });

      // Listen for step rejection/termination
      socket.on("rejectStep", (data) => {
        const { sessionId, step, reason } = data;
        console.log(`Socket rejectStep event for ${sessionId}, step ${step}`);

        if (
          pendingApprovals.has(sessionId) &&
          pendingApprovals.get(sessionId).has(step)
        ) {
          console.log(`Step ${step} rejected via socket`);

          // Get the reject function
          const { reject } = pendingApprovals.get(sessionId).get(step);

          // Remove from pending map
          pendingApprovals.get(sessionId).delete(step);

          // Call the orchestrator to handle termination
          agentService
            .handleTermination(sessionId, {
              rejectedStep: step,
              reason: reason || "User rejected step",
            })
            .then(() => {
              // Notify all clients subscribed to this session
              io.to(sessionId).emit("processTerminated", {
                step,
                reason: reason || "User rejected step",
              });
            });

          // Reject the promise to stop processing
          reject(new Error("Process terminated by user"));
        } else {
          console.error(
            `No pending approval found for socket rejection of ${step}`
          );
        }
      });

      // Listen for feedback submission
      socket.on("feedback", async (data) => {
        try {
          const { feedback, sessionId } = data;
          console.log(`Socket feedback event for ${sessionId}`);

          // Check for termination phrases
          const terminationPhrases = [
            "terminate the process",
            "finish it",
            "i am done",
            "end process",
            "stop it",
            "that's enough",
            "that's all",
            "i'm finished",
          ];

          const feedbackLower = feedback.toLowerCase();
          const isTerminating = terminationPhrases.some((phrase) =>
            feedbackLower.includes(phrase)
          );

          if (isTerminating) {
            // User wants to terminate - just notify the clients
            console.log("Termination phrase detected in socket feedback");
            io.to(sessionId).emit("processFeedbackTerminated", {
              message: "Process completed by user request",
            });
            return;
          }

          // Get the explanation result
          const history = agentService.getProcessingHistory();
          const explanationResult = history.find((step) =>
            step.name.includes("Explanation Agent")
          );

          if (explanationResult) {
            // Show that feedback processing is starting
            console.log("Processing socket feedback with explanation result");
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
          } else {
            console.error("No explanation found for socket feedback");
          }
        } catch (error) {
          console.error("Error processing socket feedback:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Listen for orchestrator updates from clients
      socket.on("orchestratorUpdate", (data) => {
        if (data.sessionId) {
          console.log(`Socket orchestratorUpdate event for ${data.sessionId}`);
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
      console.log(`Agent state update for ${update.agent}`);
      io.to(update.state.sessionId).emit("stateUpdate", update);
    });

    agentManager.on("processingStep", (stepInfo) => {
      console.log(
        `Processing step event: ${stepInfo.step} - ${stepInfo.status}`
      );
      io.to(agentManager.getCurrentState().sessionId).emit(
        "processingStep",
        stepInfo
      );
    });

    // Add listener for orchestrator updates
    agentManager.on("orchestratorUpdate", (update) => {
      console.log(
        `Orchestrator update: ${update.message?.substring(0, 50)}...`
      );
      io.to(agentManager.getCurrentState().sessionId).emit(
        "orchestratorUpdate",
        update
      );
    });

    agentManager.on("error", (error) => {
      console.error(`Agent error: ${error.message}`);
      io.to(error.state.sessionId).emit("error", error);
    });

    agentManager.on("terminated", (terminationInfo) => {
      console.log(`Workflow terminated: ${terminationInfo.reason}`);
      io.to(terminationInfo.sessionId).emit(
        "processTerminated",
        terminationInfo
      );
    });
  },
};
