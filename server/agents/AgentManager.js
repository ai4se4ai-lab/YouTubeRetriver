// server/agents/AgentManager.js
/**
 * Agent Manager
 * Centralizes access to all agents and manages their execution
 */
const EventEmitter = require("events");
const gitConfig = require("../config/gitConfig");
const config = require("../config/config");

// Import utility functions
const {
  mergeEditedContent,
  updateAgentState,
  needsApproval,
  conditionalApproval,
} = require("../utils/agentUtils");

const { startGitPolling, ensureReposDirExists } = require("../utils/gitUtils");

const {
  initSession,
  updateOrchestrator,
  startOrchestratorMonitoring,
  handleWorkflowTermination,
  processFeedback,
} = require("../utils/workflowUtils");

// Import all agents
const contentAnalysisAgent = require("./dal/ContentAnalysisAgent");
const knowledgeRetrievalAgent = require("./dal/KnowledgeRetrievalAgent");
const gitAnalysisAgent = require("./dal/GitAnalysisAgent");
const analogyGenerationAgent = require("./arl/AnalogyGenerationAgent");
const analogyValidationAgent = require("./arl/AnalogyValidationAgent");
const analogyRefinementAgent = require("./arl/AnalogyRefinementAgent");
const explanationAgent = require("./rpl/ExplanationAgent");
const userFeedbackAgent = require("./fll/UserFeedbackAgent");
const learningAgent = require("./fll/LearningAgent");
const orchestratorAgent = require("./ccl/OrchestratorAgent");

// Get repository configuration
const repoConfig = gitConfig.getConfig();
console.log(`Agent Manager: Using repo URL ${repoConfig.repoUrl}`);

// Get repository path
const repoPath = gitConfig.getRepoPath();
console.log(`Agent Manager: Using repo path ${repoPath}`);

class AgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = {
      gitAnalysis: gitAnalysisAgent,
      contentAnalysis: contentAnalysisAgent,
      knowledgeRetrieval: knowledgeRetrievalAgent,
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

    // Add flag to track if workflow should be triggered by Git changes
    this.gitTriggeredWorkflow = false;
  }

  /**
   * Stop Git repository polling
   */
  stopGitRepositoryPolling() {
    console.log("Stopping Git repository polling");
    if (this.gitPollingInterval) {
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
      // Use startGitPolling utility function
      this.gitPollingInterval = startGitPolling(
        options,
        async () => {
          // Get the Git Analysis Agent
          const gitAgent = this.agents.gitAnalysis;
          // Check for changes if connected
          if (gitAgent.isConnected) {
            return await gitAgent.checkForChanges();
          } else {
            // Try to connect if not
            await gitAgent.connectToRepository();
            return { hasChanges: false };
          }
        },
        (eventName, data) => this.emit(eventName, data),
        60000 // 60 seconds interval
      );
    }
  }

  /**
   * Process Git changes detected in background monitoring
   * @param {Object} changeData - Information about Git changes
   * @returns {Promise<void>}
   */
  async processGitChanges(changeData) {
    try {
      console.log("Processing Git changes detected in background");

      // Create a new session for this Git-triggered workflow
      const sessionId = this.initSession();

      // Notify about the new session
      this.emit("gitWorkflowStarted", {
        sessionId,
        timestamp: new Date().toISOString(),
        message: "Starting a new workflow triggered by Git changes",
      });

      // Run the workflow with Git-triggered flag
      await this.runFullWorkflow(
        { gitAnalysisData: changeData }, // Pass Git data here instead of empty object
        async (step, result) => {
          // Auto-approve steps for background processing
          console.log(`Auto-approving step ${step} for Git-triggered workflow`);
          return result;
        },
        {
          enableGitAnalysis: true,
          gitTriggeredOnly: true,
          automaticApprovals: true,
        }
      );
    } catch (error) {
      console.error("Error processing Git changes:", error);
      this.emit("error", {
        message: `Failed to process Git changes: ${error.message}`,
        error,
      });
    }
  }

  /**
   * Initialize a new agent session
   * @param {string} sessionId - Unique session identifier
   * @returns {string} - The active session ID
   */
  initSession(sessionId = null) {
    // Stop any existing Git polling
    this.stopGitRepositoryPolling();

    // Use the initSession utility
    this.activeSession = initSession(sessionId, () => {
      // Reset all agents
      Object.values(this.agents).forEach((agent) => agent.reset());
    });

    this.processingHistory = [];
    this.currentState = {
      sessionId: this.activeSession,
      startTime: Date.now(),
      completed: false,
      steps: [],
    };

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
   * Update processing state with a new step
   * @param {string} agentName - Name of the agent
   * @param {Object} result - Processing result
   */
  updateState(agentName, result) {
    // Use the updateAgentState utility function
    updateAgentState(
      this.currentState,
      this.processingHistory,
      agentName,
      result,
      (eventName, data) => this.emit(eventName, data),
      this.agents
    );
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

    // Check if this should be a Git-triggered workflow
    this.gitTriggeredWorkflow = options.gitTriggeredOnly || false;

    // Check which agents require approval
    const requiredApprovals = config.agentApprovals?.required || "none";

    // Modified approval function that checks the configuration and calls utility
    const conditionalApprovalWrapper = async (agentName, result) => {
      console.log(
        `Checking if ${agentName} needs approval:`,
        requiredApprovals
      );
      return conditionalApproval(
        agentName,
        result,
        approvalCallback,
        requiredApprovals,
        options
      );
    };

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
        options: options,
        gitTriggeredOnly: this.gitTriggeredWorkflow,
      });

      this.updateState("orchestrator", workflowPlan);

      // Start the orchestrator monitoring using utility function
      this.#monitorIntervalId = startOrchestratorMonitoring(
        this.agents.orchestrator,
        this.agents,
        this.processingHistory,
        (agentName, result) => this.updateState(agentName, result),
        (eventName, data) => this.emit(eventName, data)
      );

      // Step 1: Git Repository Analysis (now always runs first if enabled)
      let gitAnalysisResult = null;
      let gitChangesDetected = false;

      if (options && options.enableGitAnalysis) {
        this.emit("processingStep", {
          step: "gitAnalysis",
          status: "starting",
        });

        gitAnalysisResult = await this.agents.gitAnalysis.analyzeChanges(
          this.activeSession,
          options
        );

        this.updateState("gitAnalysis", gitAnalysisResult);

        // Check if Git changes were detected
        gitChangesDetected =
          gitAnalysisResult &&
          gitAnalysisResult.result &&
          gitAnalysisResult.result.output &&
          !gitAnalysisResult.result.output.includes("no_changes");

        // Wait for user approval and get edited content if any
        const approvedGitAnalysis = await conditionalApprovalWrapper(
          "gitAnalysis",
          gitAnalysisResult
        );

        // Create a modified result object that preserves the original structure but with updated content
        const finalGitAnalysis = mergeEditedContent(
          gitAnalysisResult,
          approvedGitAnalysis
        );

        // Update orchestrator about progress
        await updateOrchestrator(
          gitChangesDetected
            ? "Git Analysis completed with changes detected, proceeding with workflow"
            : "Git Analysis completed with no changes detected",
          this.agents.orchestrator,
          this.currentState,
          this.processingHistory,
          (agentName, result) => this.updateState(agentName, result)
        );

        gitAnalysisResult = finalGitAnalysis;

        // If this is a Git-triggered workflow and no changes were detected, stop here
        if (this.gitTriggeredWorkflow && !gitChangesDetected) {
          this.emit("processingStep", {
            step: "workflow",
            status: "completed",
            message: "No Git changes detected, stopping workflow",
          });

          // Complete workflow without running other agents
          this.currentState.completed = true;
          this.currentState.endTime = Date.now();
          this.currentState.totalDuration =
            this.currentState.endTime - this.currentState.startTime;

          // Stop monitoring
          this.#stopOrchestratorMonitoring();

          // Return early
          return {
            noChangesDetected: true,
            gitAnalysis: gitAnalysisResult,
            sessionState: this.currentState,
          };
        }

        // After Git Analysis is complete and changes are detected
        if (gitChangesDetected) {
          // Make sure to emit an event indicating the next agent should start
          this.emit("processingStep", {
            step: "contentAnalysis",
            status: "starting",
          });

          const gitFindings = {
            issues: gitAnalysisResult?.result?.issues || [],
            categories: gitAnalysisResult?.result?.categories || {},
            recommendations: gitAnalysisResult?.result?.recommendations || [],
          };
          youtubeData.gitFindings = gitFindings;

          // Ensure there's sufficient data for Content Analysis
          if (!youtubeData.likedVideos && !youtubeData.watchHistory) {
            console.warn(
              "No YouTube data available, using Git analysis data instead"
            );
            // Create sample data structure if needed
            youtubeData.likedVideos = [];
            youtubeData.watchHistory = [];
          }
        }
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

        const formattedResult = this.formatAgentResult(
          contentAnalysisResult,
          this.agents.contentAnalysis
        );

        this.updateState("contentAnalysis", formattedResult);

        // Wait for user approval and get edited content if any
        const approvedContentAnalysis = await conditionalApprovalWrapper(
          "contentAnalysis",
          contentAnalysisResult
        );

        // Create a modified result object that preserves the original structure but with updated content
        const finalContentAnalysis = mergeEditedContent(
          contentAnalysisResult,
          approvedContentAnalysis
        );

        // Update orchestrator about progress
        await updateOrchestrator(
          "Content Analysis completed, moving to Knowledge Retrieval",
          this.agents.orchestrator,
          this.currentState,
          this.processingHistory,
          (agentName, result) => this.updateState(agentName, result)
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
        const approvedKnowledgeResult = await conditionalApprovalWrapper(
          "knowledgeRetrieval",
          knowledgeResult
        );

        // Merge edited content if any
        const finalKnowledgeResult = mergeEditedContent(
          knowledgeResult,
          approvedKnowledgeResult
        );

        // Update orchestrator about progress
        await updateOrchestrator(
          "Knowledge Retrieval completed, moving to Analogy Generation",
          this.agents.orchestrator,
          this.currentState,
          this.processingHistory,
          (agentName, result) => this.updateState(agentName, result)
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
      const approvedAnalogiesResult = await conditionalApprovalWrapper(
        "analogyGeneration",
        analogiesResult
      );

      // Merge edited content if any
      const finalAnalogiesResult = mergeEditedContent(
        analogiesResult,
        approvedAnalogiesResult
      );

      // Update orchestrator about progress
      await updateOrchestrator(
        "Analogy Generation completed, moving to Analogy Validation",
        this.agents.orchestrator,
        this.currentState,
        this.processingHistory,
        (agentName, result) => this.updateState(agentName, result)
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
      const approvedValidationResult = await conditionalApprovalWrapper(
        "analogyValidation",
        validationResult
      );

      // Merge edited content if any
      const finalValidationResult = mergeEditedContent(
        validationResult,
        approvedValidationResult
      );

      // Update orchestrator about progress
      await updateOrchestrator(
        "Analogy Validation completed, moving to Analogy Refinement",
        this.agents.orchestrator,
        this.currentState,
        this.processingHistory,
        (agentName, result) => this.updateState(agentName, result)
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
      const approvedRefinementResult = await conditionalApprovalWrapper(
        "analogyRefinement",
        refinementResult
      );

      // Merge edited content if any
      const finalRefinementResult = mergeEditedContent(
        refinementResult,
        approvedRefinementResult
      );

      // Update orchestrator about progress
      await updateOrchestrator(
        "Analogy Refinement completed, moving to Explanation Generation",
        this.agents.orchestrator,
        this.currentState,
        this.processingHistory,
        (agentName, result) => this.updateState(agentName, result)
      );

      // Step 7: Explanation Generation
      this.emit("processingStep", {
        step: "explanation",
        status: "starting",
      });

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
      const approvedExplanationResult = await conditionalApprovalWrapper(
        "explanation",
        explanationResult
      );

      // Merge edited content if any
      const finalExplanationResult = mergeEditedContent(
        explanationResult,
        approvedExplanationResult
      );

      // Update orchestrator about completion
      await updateOrchestrator(
        "Explanation Generation completed, workflow is now complete",
        this.agents.orchestrator,
        this.currentState,
        this.processingHistory,
        (agentName, result) => this.updateState(agentName, result)
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
   * Handle workflow termination
   * @param {string} sessionId - The session ID
   * @param {Object} terminationData - Information about the termination
   * @returns {Promise<Object>} - Termination summary
   */
  async handleTermination(sessionId, terminationData) {
    return handleWorkflowTermination(
      terminationData,
      this.agents.orchestrator,
      this.activeSession,
      this.currentState,
      this.processingHistory,
      (eventName, data) => this.emit(eventName, data)
    );
  }

  /**
   * Process user feedback
   * @param {string} feedback - User feedback
   * @param {Object} explanationResult - Final explanation presented to user
   * @returns {Promise<Object>} - Processed feedback and learning insights
   */
  async processFeedback(feedback, explanationResult) {
    try {
      console.log("Processing user feedback");

      // Process user feedback
      const feedbackResult = await this.agents.userFeedback.processFeedback(
        feedback,
        explanationResult
      );
      this.updateState("userFeedback", feedbackResult);

      // Generate learning insights
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
      await updateOrchestrator(
        "Manual Git analysis triggered and completed",
        this.agents.orchestrator,
        this.currentState,
        this.processingHistory,
        (agentName, result) => this.updateState(agentName, result)
      );

      return gitAnalysisResult;
    } catch (error) {
      console.error("Error during manual Git analysis:", error);
      throw error;
    }
  }
}

module.exports = new AgentManager();
