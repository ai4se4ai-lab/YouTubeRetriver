/**
 * Agent Manager
 * Centralizes access to all agents and manages their execution
 */
const EventEmitter = require("events");

// Import all agents
const contentAnalysisAgent = require("./dal/ContentAnalysisAgent");
const knowledgeRetrievalAgent = require("./dal/KnowledgeRetrievalAgent");
const gitAnalysisAgent = require("./dal/GitAnalysisAgent"); // Add Git Analysis Agent
const analogyGenerationAgent = require("./arl/AnalogyGenerationAgent");
const analogyValidationAgent = require("./arl/AnalogyValidationAgent");
const analogyRefinementAgent = require("./arl/AnalogyRefinementAgent");
const explanationAgent = require("./rpl/ExplanationAgent");
const userFeedbackAgent = require("./fll/UserFeedbackAgent");
const learningAgent = require("./fll/LearningAgent");
const orchestratorAgent = require("./ccl/OrchestratorAgent");

class AgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = {
      contentAnalysis: contentAnalysisAgent,
      knowledgeRetrieval: knowledgeRetrievalAgent,
      gitAnalysis: gitAnalysisAgent, // Add Git Analysis Agent
      analogyGeneration: analogyGenerationAgent,
      analogyValidation: analogyValidationAgent,
      analogyRefinement: analogyRefinementAgent,
      explanation: explanationAgent,
      userFeedback: userFeedbackAgent,
      learning: learningAgent,
      orchestrator: orchestratorAgent,
    };

    this.processingHistory = [];
    this.currentState = {};
    this.activeSession = null;
    this.gitPollingInterval = null;
  }

  /**
   * Stop Git repository polling
   */
  stopGitRepositoryPolling() {
    if (this.gitPollingInterval) {
      console.log("Stopping Git repository polling");
      clearInterval(this.gitPollingInterval);
      this.gitPollingInterval = null;
    }
  }

  /**
   * Start Git repository polling
   * @param {Object} options - Options including Git repository settings
   */
  startGitRepositoryPolling(options) {
    // Clear any existing polling
    this.stopGitRepositoryPolling();

    if (options && options.enableGitAnalysis) {
      console.log("Starting Git repository polling");

      // Poll every 60 seconds (adjust as needed)
      this.gitPollingInterval = setInterval(async () => {
        try {
          console.log("Polling Git repository for changes");

          // Get the Git Analysis Agent
          const gitAgent = this.agents.gitAnalysis;

          // Check for changes
          if (gitAgent.isConnected) {
            const changeData = await gitAgent.checkForChanges();

            if (changeData.hasChanges) {
              console.log("Git changes detected, triggering analysis");

              // Emit event about new changes
              this.emit("gitChangesDetected", {
                changeData,
                timestamp: new Date().toISOString(),
              });

              // If workflow is active, trigger Git analysis
              if (
                this.activeSession &&
                !this.currentState.completed &&
                !this.currentState.terminated
              ) {
                console.log("Running Git analysis as part of active workflow");

                this.emit("processingStep", {
                  step: "gitAnalysis",
                  status: "starting",
                });

                const gitAnalysisResult = await gitAgent.analyzeChanges();
                this.updateState("gitAnalysis", gitAnalysisResult);

                // Update orchestrator about the Git analysis
                await this.#updateOrchestrator(
                  "New Git changes detected and analyzed during workflow"
                );
              }
            } else {
              console.log("No Git changes detected during polling");
            }
          } else {
            console.log("Git agent not connected, attempting to connect");
            await gitAgent.connectToRepository();
          }
        } catch (error) {
          console.error("Error during Git repository polling:", error);
        }
      }, 60000); // 60 seconds
    }
  }

  /**
   * Initialize a new agent processing session
   * @param {string} sessionId - Unique session identifier
   * @returns {string} - The active session ID
   */
  initSession(sessionId = null) {
    // Stop any existing Git polling
    this.stopGitRepositoryPolling();

    this.activeSession = sessionId || `session_${Date.now()}`;
    this.processingHistory = [];
    this.currentState = {
      sessionId: this.activeSession,
      startTime: Date.now(),
      completed: false,
      steps: [],
    };

    // Reset all agents
    Object.values(this.agents).forEach((agent) => agent.reset());

    return this.activeSession;
  }

  /**
   * Get all agents
   * @returns {Object} - All available agents
   */
  getAllAgents() {
    return this.agents;
  }

  /**
   * Get a specific agent by key
   * @param {string} agentKey - The agent key
   * @returns {Object|null} - The agent or null if not found
   */
  getAgent(agentKey) {
    return this.agents[agentKey] || null;
  }

  /**
   * Get processing history
   * @returns {Array} - Processing history
   */
  getProcessingHistory() {
    return this.processingHistory;
  }

  /**
   * Get current processing state
   * @returns {Object} - Current state
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Get agent statuses
   * @returns {Object} - Status of all agents
   */
  getAgentStatuses() {
    const statuses = {};
    for (const [key, agent] of Object.entries(this.agents)) {
      statuses[key] = agent.getStatus();
    }
    return statuses;
  }

  /**
   * Update processing state with a new step
   * @param {string} agentName - Name of the agent
   * @param {Object} result - Processing result
   */
  updateState(agentName, result) {
    this.processingHistory.push(result);

    this.currentState.steps.push({
      agentName,
      timestamp: Date.now(),
      duration: result.duration,
      success: result.processed,
      hasError: !!result.error,
    });

    // Emit update event
    this.emit("stateUpdate", {
      agent: agentName,
      result: result,
      state: this.currentState,
    });
  }

  // Monitor interval for the orchestrator
  #monitorIntervalId = null;

  /**
   * Run the full agent workflow
   * @param {Object} youtubeData - YouTube data to process
   * @param {Function} approvalCallback - Callback for user approval between steps
   * @param {Object} options - Processing options with enableGitAnalysis flag
   * @returns {Promise<Object>} - Final processing results
   */
  async runFullWorkflow(youtubeData, approvalCallback, options = {}) {
    // Initialize session if not already done
    if (!this.activeSession) {
      this.initSession();
    }

    try {
      // Start Git polling if enabled
      if (options && options.enableGitAnalysis) {
        this.startGitRepositoryPolling(options);
      }

      // Plan workflow with orchestrator
      const workflowPlan = await this.agents.orchestrator.planWorkflow({
        dataType: "YouTube Data",
        availableAgents: Object.keys(this.agents),
        timestamp: Date.now(),
        options: options, // Pass options to orchestrator
      });

      this.updateState("orchestrator", workflowPlan);

      // Start the orchestrator monitoring
      this.#startOrchestratorMonitoring();

      // Step 1 (optional): Git Repository Analysis
      let gitAnalysisResult = null;
      if (options && options.enableGitAnalysis) {
        this.emit("processingStep", {
          step: "gitAnalysis",
          status: "starting",
        });

        gitAnalysisResult = await this.agents.gitAnalysis.analyzeChanges();
        this.updateState("gitAnalysis", gitAnalysisResult);

        // Wait for user approval and get edited content if any
        const approvedGitAnalysis = await approvalCallback(
          "gitAnalysis",
          gitAnalysisResult
        );

        // Create a modified result object that preserves the original structure but with updated content
        const finalGitAnalysis = this.#mergeEditedContent(
          gitAnalysisResult,
          approvedGitAnalysis
        );

        // Update orchestrator about progress
        await this.#updateOrchestrator(
          "Git Analysis completed, moving to Content Analysis"
        );

        gitAnalysisResult = finalGitAnalysis;
      }

      // Step 2: Content Analysis
      let contentAnalysisResult = null;
      if (
        youtubeData &&
        (youtubeData.likedVideos || youtubeData.watchHistory)
      ) {
        this.emit("processingStep", {
          step: "contentAnalysis",
          status: "starting",
        });

        const formattedData =
          this.agents.contentAnalysis.formatData(youtubeData);
        contentAnalysisResult = await this.agents.contentAnalysis.analyze(
          formattedData
        );
        this.updateState("contentAnalysis", contentAnalysisResult);

        // Wait for user approval and get edited content if any
        const approvedContentAnalysis = await approvalCallback(
          "contentAnalysis",
          contentAnalysisResult
        );

        // Create a modified result object that preserves the original structure but with updated content
        const finalContentAnalysis = this.#mergeEditedContent(
          contentAnalysisResult,
          approvedContentAnalysis
        );

        // Update orchestrator about progress
        await this.#updateOrchestrator(
          "Content Analysis completed, moving to Knowledge Retrieval"
        );

        contentAnalysisResult = finalContentAnalysis;
      }

      // Step 3: Knowledge Retrieval
      let knowledgeResult = null;
      if (contentAnalysisResult) {
        this.emit("processingStep", {
          step: "knowledgeRetrieval",
          status: "starting",
        });

        // Pass the potentially edited content to the knowledge retrieval agent
        knowledgeResult =
          await this.agents.knowledgeRetrieval.retrieveKnowledge(
            contentAnalysisResult
          );
        this.updateState("knowledgeRetrieval", knowledgeResult);

        // Wait for user approval and get edited content if any
        const approvedKnowledgeResult = await approvalCallback(
          "knowledgeRetrieval",
          knowledgeResult
        );

        // Merge edited content if any
        const finalKnowledgeResult = this.#mergeEditedContent(
          knowledgeResult,
          approvedKnowledgeResult
        );

        // Update orchestrator about progress
        await this.#updateOrchestrator(
          "Knowledge Retrieval completed, moving to Analogy Generation"
        );

        knowledgeResult = finalKnowledgeResult;
      }

      // Step 4: Analogy Generation
      this.emit("processingStep", {
        step: "analogyGeneration",
        status: "starting",
      });

      // Pass both potentially edited content objects to the analogy generation
      const combinedInput = {
        contentAnalysis: contentAnalysisResult,
        knowledgeRetrieval: knowledgeResult,
        gitAnalysis: gitAnalysisResult,
      };

      const analogiesResult =
        await this.agents.analogyGeneration.generateAnalogies(combinedInput);
      this.updateState("analogyGeneration", analogiesResult);

      // Wait for user approval and get edited content if any
      const approvedAnalogiesResult = await approvalCallback(
        "analogyGeneration",
        analogiesResult
      );

      // Merge edited content if any
      const finalAnalogiesResult = this.#mergeEditedContent(
        analogiesResult,
        approvedAnalogiesResult
      );

      // Update orchestrator about progress
      await this.#updateOrchestrator(
        "Analogy Generation completed, moving to Analogy Validation"
      );

      // Step 5: Analogy Validation
      this.emit("processingStep", {
        step: "analogyValidation",
        status: "starting",
      });

      // Pass the potentially edited content to validation
      const validationResult =
        await this.agents.analogyValidation.validateAnalogies(
          finalAnalogiesResult,
          combinedInput
        );
      this.updateState("analogyValidation", validationResult);

      // Wait for user approval and get edited content if any
      const approvedValidationResult = await approvalCallback(
        "analogyValidation",
        validationResult
      );

      // Merge edited content if any
      const finalValidationResult = this.#mergeEditedContent(
        validationResult,
        approvedValidationResult
      );

      // Update orchestrator about progress
      await this.#updateOrchestrator(
        "Analogy Validation completed, moving to Analogy Refinement"
      );

      // Step 6: Analogy Refinement
      this.emit("processingStep", {
        step: "analogyRefinement",
        status: "starting",
      });

      // Pass potentially edited content to refinement
      const refinementResult =
        await this.agents.analogyRefinement.refineAnalogies(
          finalValidationResult,
          finalAnalogiesResult
        );
      this.updateState("analogyRefinement", refinementResult);

      // Wait for user approval and get edited content if any
      const approvedRefinementResult = await approvalCallback(
        "analogyRefinement",
        refinementResult
      );

      // Merge edited content if any
      const finalRefinementResult = this.#mergeEditedContent(
        refinementResult,
        approvedRefinementResult
      );

      // Update orchestrator about progress
      await this.#updateOrchestrator(
        "Analogy Refinement completed, moving to Explanation Generation"
      );

      // Step 7: Explanation Generation
      this.emit("processingStep", { step: "explanation", status: "starting" });

      // Pass potentially edited content to explanation
      const explanationResult = await this.agents.explanation.createExplanation(
        finalRefinementResult,
        {
          contentAnalysis: contentAnalysisResult,
          gitAnalysis: gitAnalysisResult,
        }
      );
      this.updateState("explanation", explanationResult);

      // Wait for user approval and get edited content if any
      const approvedExplanationResult = await approvalCallback(
        "explanation",
        explanationResult
      );

      // Merge edited content if any
      const finalExplanationResult = this.#mergeEditedContent(
        explanationResult,
        approvedExplanationResult
      );

      // Update orchestrator about completion
      await this.#updateOrchestrator(
        "Explanation Generation completed, workflow is now complete"
      );

      // Complete workflow
      this.currentState.completed = true;
      this.currentState.endTime = Date.now();
      this.currentState.totalDuration =
        this.currentState.endTime - this.currentState.startTime;

      // Stop the orchestrator monitoring
      this.#stopOrchestratorMonitoring();

      // Stop Git polling when workflow completes
      this.stopGitRepositoryPolling();

      // Summarize workflow
      const workflowSummary = await this.agents.orchestrator.summarizeWorkflow(
        this.processingHistory
      );
      this.updateState("workflowSummary", workflowSummary);

      // Return final results
      return {
        finalExplanation: finalExplanationResult,
        workflowSummary: workflowSummary,
        processingHistory: this.processingHistory,
        sessionState: this.currentState,
      };
    } catch (error) {
      console.error("Error in agent workflow:", error);

      this.currentState.completed = false;
      this.currentState.error = error.message;
      this.currentState.endTime = Date.now();
      this.currentState.totalDuration =
        this.currentState.endTime - this.currentState.startTime;

      // Stop the orchestrator monitoring on error
      this.#stopOrchestratorMonitoring();

      // Stop Git polling on error
      this.stopGitRepositoryPolling();

      this.emit("error", {
        message: error.message,
        state: this.currentState,
      });

      throw error;
    }
  }

  /**
   * Start continuous orchestrator monitoring
   * @private
   */
  #startOrchestratorMonitoring() {
    // Clear any existing interval
    this.#stopOrchestratorMonitoring();

    // Start a new monitoring interval - check every 10 seconds
    this.#monitorIntervalId = setInterval(async () => {
      try {
        // Get current state of all agents
        const agentStatuses = {};
        for (const [key, agent] of Object.entries(this.agents)) {
          agentStatuses[key] = agent.getStatus();
        }

        // Send to orchestrator for monitoring
        const monitorResult = await this.agents.orchestrator.monitorWorkflow(
          agentStatuses,
          this.processingHistory[0] // Original workflow plan
        );

        // Only update state if there's something significant to report
        if (
          (monitorResult.result &&
            monitorResult.result.output.includes("Alert")) ||
          monitorResult.result.output.includes("bottleneck") ||
          monitorResult.result.output.includes("intervention")
        ) {
          this.updateState("orchestratorMonitor", monitorResult);

          // Emit an event so the UI can show the orchestrator is active
          this.emit("orchestratorUpdate", {
            timestamp: new Date().toISOString(),
            message: monitorResult.result.output,
          });
        }
      } catch (error) {
        console.error("Error in orchestrator monitoring:", error);
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop the orchestrator monitoring
   * @private
   */
  #stopOrchestratorMonitoring() {
    if (this.#monitorIntervalId) {
      clearInterval(this.#monitorIntervalId);
      this.#monitorIntervalId = null;
    }
  }

  /**
   * Update the orchestrator with the current step progress
   * @param {string} message - Progress message
   * @private
   */
  async #updateOrchestrator(message) {
    try {
      const updateResult = await this.agents.orchestrator.monitorWorkflow(
        {
          message,
          timestamp: new Date().toISOString(),
          currentState: this.currentState,
        },
        this.processingHistory[0] // Original workflow plan
      );

      // Update state and emit event
      this.updateState("orchestratorProgress", updateResult);

      this.emit("orchestratorUpdate", {
        timestamp: new Date().toISOString(),
        message: updateResult.result?.output || message,
      });
    } catch (error) {
      console.error("Error updating orchestrator:", error);
    }
  }

  /**
   * Merge edited content with original result object
   * @param {Object} originalResult - Original result object
   * @param {Object} editedResult - Potentially edited result object
   * @returns {Object} - Merged result object
   * @private
   */
  #mergeEditedContent(originalResult, editedResult) {
    // If no edited content, return original
    if (!editedResult) {
      return originalResult;
    }

    // Create a copy of the original result
    const mergedResult = JSON.parse(JSON.stringify(originalResult));

    // If the edited result has updated output, use it
    if (editedResult.result && editedResult.result.output) {
      mergedResult.result.output = editedResult.result.output;
    }

    return mergedResult;
  }

  /**
   * Process user feedback
   * @param {string} feedback - User feedback
   * @param {Object} explanationResult - Final explanation presented to user
   * @returns {Promise<Object>} - Processed feedback and learning insights
   */
  async processFeedback(feedback, explanationResult) {
    try {
      // Process user feedback
      this.emit("processingStep", { step: "userFeedback", status: "starting" });
      const feedbackResult = await this.agents.userFeedback.processFeedback(
        feedback,
        explanationResult
      );
      this.updateState("userFeedback", feedbackResult);

      // Generate learning insights
      this.emit("processingStep", { step: "learning", status: "starting" });
      const learningResult = await this.agents.learning.analyzeForImprovements(
        feedbackResult,
        this.processingHistory
      );
      this.updateState("learning", learningResult);

      return {
        feedback: feedbackResult,
        learning: learningResult,
      };
    } catch (error) {
      console.error("Error processing feedback:", error);
      throw error;
    }
  }

  /**
   * Handle workflow termination
   * @param {Object} terminationData - Information about the termination
   * @returns {Promise<Object>} - Termination handling result
   */
  async handleTermination(terminationData) {
    try {
      // Update state to reflect termination
      this.currentState.terminated = true;
      this.currentState.endTime = Date.now();
      this.currentState.totalDuration =
        this.currentState.endTime - this.currentState.startTime;
      this.currentState.terminationReason =
        terminationData.reason || "User rejected a step";

      // Stop the orchestrator monitoring
      this.#stopOrchestratorMonitoring();

      // Stop Git repository polling
      this.stopGitRepositoryPolling();

      // Let orchestrator handle the termination
      const terminationSummary =
        await this.agents.orchestrator.handleTermination({
          ...terminationData,
          sessionId: this.activeSession,
          timestamp: new Date().toISOString(),
        });

      // Add to processing history
      this.processingHistory.push({
        name: "Termination",
        processed: true,
        result: {
          output: `Workflow terminated at step ${terminationData.rejectedStep}. Reason: ${terminationData.reason}`,
        },
        timestamp: new Date().toISOString(),
      });

      // Emit termination event
      this.emit("terminated", {
        sessionId: this.activeSession,
        step: terminationData.rejectedStep,
        reason: terminationData.reason,
        timestamp: new Date().toISOString(),
      });

      return terminationSummary;
    } catch (error) {
      console.error("Error handling termination:", error);
      throw error;
    }
  }

  /**
   * Manually trigger Git analysis for testing
   * @returns {Promise<Object>} - Analysis results
   */
  async triggerGitAnalysis() {
    try {
      console.log("Manually triggering Git analysis");

      // Get the Git Analysis Agent
      const gitAgent = this.agents.gitAnalysis;

      // Ensure connection
      if (!gitAgent.isConnected) {
        await gitAgent.connectToRepository();
      }

      // Emit processing step event
      this.emit("processingStep", {
        step: "gitAnalysis",
        status: "starting",
      });

      // Run analysis
      const gitAnalysisResult = await gitAgent.analyzeChanges();
      this.updateState("gitAnalysis", gitAnalysisResult);

      // Update orchestrator
      await this.#updateOrchestrator(
        "Manual Git analysis triggered and completed"
      );

      return gitAnalysisResult;
    } catch (error) {
      console.error("Error during manual Git analysis:", error);
      throw error;
    }
  }
}

module.exports = new AgentManager();
