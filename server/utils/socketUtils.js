/**
 * Socket Utility Functions
 * Contains helper functions for Socket.IO communication
 */

/**
 * Set up Socket.IO handlers for agent-based workflow
 * @param {Object} io - Socket.IO instance
 * @param {Object} pendingApprovals - Map of pending approvals
 * @param {Object} agentManager - Agent manager instance
 */
function setupSocketHandlers(io, pendingApprovals, agentManager) {
  io.on("connection", (socket) => {
    console.log("Client connected to agent socket");

    // Listen for session subscription
    socket.on("subscribe", (sessionId) => {
      console.log(`Client subscribed to session: ${sessionId}`);
      socket.join(sessionId);
    });

    // Listen for step approval
    socket.on("approveStep", (data) => {
      handleStepApproval(socket, data, pendingApprovals, io);
    });

    // Listen for step rejection/termination
    socket.on("rejectStep", (data) => {
      handleStepRejection(socket, data, pendingApprovals, io, agentManager);
    });

    // Listen for feedback submission
    socket.on("feedback", async (data) => {
      await handleFeedbackSubmission(socket, data, io, agentManager);
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
}

/**
 * Handle step approval via socket
 * @param {Object} socket - Socket.IO socket
 * @param {Object} data - Approval data
 * @param {Map} pendingApprovals - Map of pending approvals
 * @param {Object} io - Socket.IO instance
 */
function handleStepApproval(socket, data, pendingApprovals, io) {
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
}

/**
 * Handle step rejection via socket
 * @param {Object} socket - Socket.IO socket
 * @param {Object} data - Rejection data
 * @param {Map} pendingApprovals - Map of pending approvals
 * @param {Object} io - Socket.IO instance
 * @param {Object} agentManager - Agent manager instance
 */
function handleStepRejection(socket, data, pendingApprovals, io, agentManager) {
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
    agentManager
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
}

/**
 * Handle feedback submission via socket
 * @param {Object} socket - Socket.IO socket
 * @param {Object} data - Feedback data
 * @param {Object} io - Socket.IO instance
 * @param {Object} agentManager - Agent manager instance
 */
async function handleFeedbackSubmission(socket, data, io, agentManager) {
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
    const history = agentManager.getProcessingHistory();
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
      const results = await agentManager.submitFeedback(
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
}

module.exports = {
  setupSocketHandlers,
  handleStepApproval,
  handleStepRejection,
  handleFeedbackSubmission
};