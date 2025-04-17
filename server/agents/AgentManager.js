/**
 * Agent Manager
 * Centralizes access to all agents and manages their execution
 */
const EventEmitter = require("events");

// Import all agents
const contentAnalysisAgent = require("./dal/ContentAnalysisAgent");
const knowledgeRetrievalAgent = require("./dal/KnowledgeRetrievalAgent");
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
    this.agentThinking = new Map(); // Store thinking processes by sessionId/agent
    this.monitorIntervalId = null; // Monitor interval for the orchestrator
  }

  /**
   * Initialize a new agent processing session
   * @param {string} sessionId - Unique session identifier
   * @returns {string} - The active session ID
   */
  initSession(sessionId = null) {
    this.activeSession = sessionId || `session_${Date.now()}`;
    this.processingHistory = [];
    this.currentState = {
      sessionId: this.activeSession,
      startTime: Date.now(),
      completed: false,
      terminatedEarly: false,
      terminationReason: null,
      steps: [],
    };

    // Reset all agents
    Object.values(this.agents).forEach((agent) => agent.reset());

    // Initialize thinking map for this session
    if (!this.agentThinking.has(this.activeSession)) {
      this.agentThinking.set(this.activeSession, new Map());
    }

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
    this.processingHistory.push(result);

    this.currentState.steps.push({
      agentName,
      timestamp: Date.now(),
      duration: result.duration,
      success: result.processed,
      hasError: !!result.error,
    });

    // Store thinking process if available
    if (result.thinking) {
      this.storeAgentThinking(this.activeSession, agentName, result.thinking);
    }

    // Emit update event
    this.emit("stateUpdate", {
      agent: agentName,
      result: result,
      state: this.currentState,
    });
  }

  /**
   * Store an agent's thinking process
   * @param {string} sessionId - Session ID
   * @param {string} agentKey - Agent key
   * @param {string} thinking - Thinking process content
   */
  storeAgentThinking(sessionId, agentKey, thinking) {
    if (!this.agentThinking.has(sessionId)) {
      this.agentThinking.set(sessionId, new Map());
    }

    this.agentThinking.get(sessionId).set(agentKey, thinking);

    // Emit event
    this.emit("agentThinking", {
      sessionId,
      agent: agentKey,
      thinking,
    });
  }

  /**
   * Get an agent's thinking process
   * @param {string} sessionId - Session ID
   * @param {string} agentKey - Agent key
   * @returns {string|null} - The thinking process or null if not found
   */
  getAgentThinking(sessionId, agentKey) {
    if (!this.agentThinking.has(sessionId)) {
      return null;
    }

    return this.agentThinking.get(sessionId).get(agentKey) || null;
  }

  /**
   * Run the full agent workflow
   * @param {Object} youtubeData - YouTube data to process
   * @param {Function} approvalCallback - Callback for user approval between steps
   * @returns {Promise<Object>} - Final processing results
   */
  async runFullWorkflow(youtubeData, approvalCallback) {
    // Initialize session if not already done
    if (!this.activeSession) {
      this.initSession();
    }

    try {
      // Plan workflow with orchestrator
      const workflowPlan = await this.agents.orchestrator.planWorkflow({
        dataType: "YouTube Data",
        availableAgents: Object.keys(this.agents),
        timestamp: Date.now(),
      });

      this.updateState("orchestrator", workflowPlan);

      // Start the orchestrator monitoring
      this.startOrchestratorMonitoring();

      // Step 1: Content Analysis
      this.emit("processingStep", {
        step: "contentAnalysis",
        status: "starting",
      });

      // Define thinking callback for real-time updates
      const contentAnalysisThinkingCallback = (thinking) => {
        this.storeAgentThinking(
          this.activeSession,
          "contentAnalysis",
          thinking
        );
      };

      const formattedData = this.agents.contentAnalysis.formatData(youtubeData);
      const contentAnalysisResult = await this.agents.contentAnalysis.analyze(
        formattedData,
        contentAnalysisThinkingCallback
      );
      this.updateState("contentAnalysis", contentAnalysisResult);

      // Wait for user approval and get edited content if any
      const approvedContentAnalysis = await approvalCallback(
        "contentAnalysis",
        contentAnalysisResult
      );

      // Create a modified result object that preserves the original structure but with updated content
      const finalContentAnalysis = this.mergeEditedContent(
        contentAnalysisResult,
        approvedContentAnalysis
      );

      // Update orchestrator about progress
      await this.updateOrchestrator(
        "Content Analysis completed, moving to Knowledge Retrieval"
      );

      // Step 2: Knowledge Retrieval
      this.emit("processingStep", {
        step: "knowledgeRetrieval",
        status: "starting",
      });

      // Define thinking callback for this agent
      const knowledgeThinkingCallback = (thinking) => {
        this.storeAgentThinking(
          this.activeSession,
          "knowledgeRetrieval",
          thinking
        );
      };

      // Pass the potentially edited content to the knowledge retrieval agent
      const knowledgeResult =
        await this.agents.knowledgeRetrieval.retrieveKnowledge(
          finalContentAnalysis,
          knowledgeThinkingCallback
        );
      this.updateState("knowledgeRetrieval", knowledgeResult);

      // Wait for user approval and get edited content if any
      const approvedKnowledgeResult = await approvalCallback(
        "knowledgeRetrieval",
        knowledgeResult
      );

      // Merge edited content if any
      const finalKnowledgeResult = this.mergeEditedContent(
        knowledgeResult,
        approvedKnowledgeResult
      );

      // Update orchestrator about progress
      await this.updateOrchestrator(
        "Knowledge Retrieval completed, moving to Analogy Generation"
      );

      // Step 3: Analogy Generation
      this.emit("processingStep", {
        step: "analogyGeneration",
        status: "starting",
      });

      // Define thinking callback
      const analogyGenThinkingCallback = (thinking) => {
        this.storeAgentThinking(
          this.activeSession,
          "analogyGeneration",
          thinking
        );
      };

      // Pass both potentially edited content objects to the analogy generation
      const combinedInput = {
        contentAnalysis: finalContentAnalysis,
        knowledgeRetrieval: finalKnowledgeResult,
      };

      const analogiesResult =
        await this.agents.analogyGeneration.generateAnalogies(
          combinedInput,
          analogyGenThinkingCallback
        );
      this.updateState("analogyGeneration", analogiesResult);

      // Wait for user approval and get edited content if any
      const approvedAnalogiesResult = await approvalCallback(
        "analogyGeneration",
        analogiesResult
      );

      // Merge edited content if any
      const finalAnalogiesResult = this.mergeEditedContent(
        analogiesResult,
        approvedAnalogiesResult
      );

      // Update orchestrator about progress
      await this.updateOrchestrator(
        "Analogy Generation completed, moving to Analogy Validation"
      );

      // Step 4: Analogy Validation
      this.emit("processingStep", {
        step: "analogyValidation",
        status: "starting",
      });

      // Define thinking callback
      const validationThinkingCallback = (thinking) => {
        this.storeAgentThinking(
          this.activeSession,
          "analogyValidation",
          thinking
        );
      };

      // Pass the potentially edited content to validation
      const validationResult =
        await this.agents.analogyValidation.validateAnalogies(
          finalAnalogiesResult,
          combinedInput,
          validationThinkingCallback
        );
      this.updateState("analogyValidation", validationResult);

      // Wait for user approval and get edited content if any
      const approvedValidationResult = await approvalCallback(
        "analogyValidation",
        validationResult
      );

      // Merge edited content if any
      const finalValidationResult = this.mergeEditedContent(
        validationResult,
        approvedValidationResult
      );

      // Update orchestrator about progress
      await this.updateOrchestrator(
        "Analogy Validation completed, moving to Analogy Refinement"
      );

      // Step 5: Analogy Refinement
      this.emit("processingStep", {
        step: "analogyRefinement",
        status: "starting",
      });

      // Define thinking callback
      const refinementThinkingCallback = (thinking) => {
        this.storeAgentThinking(
          this.activeSession,
          "analogyRefinement",
          thinking
        );
      };

      // Pass potentially edited content to refinement
      const refinementResult =
        await this.agents.analogyRefinement.refineAnalogies(
          finalValidationResult,
          finalAnalogiesResult,
          refinementThinkingCallback
        );
      this.updateState("analogyRefinement", refinementResult);

      // Wait for user approval and get edited content if any
      const approvedRefinementResult = await approvalCallback(
        "analogyRefinement",
        refinementResult
      );

      // Merge edited content if any
      const finalRefinementResult = this.mergeEditedContent(
        refinementResult,
        approvedRefinementResult
      );

      // Update orchestrator about progress
      await this.updateOrchestrator(
        "Analogy Refinement completed, moving to Explanation Generation"
      );

      // Step 6: Explanation Generation
      this.emit("processingStep", {
        step: "explanation",
        status: "starting",
      });

      // Define thinking callback
      const explanationThinkingCallback = (thinking) => {
        this.storeAgentThinking(this.activeSession, "explanation", thinking);
      };

      // Pass potentially edited content to explanation
      const explanationResult = await this.agents.explanation.createExplanation(
        finalRefinementResult,
        { contentAnalysis: finalContentAnalysis },
        explanationThinkingCallback
      );
      this.updateState("explanation", explanationResult);

      // Wait for user approval and get edited content if any
      const approvedExplanationResult = await approvalCallback(
        "explanation",
        explanationResult
      );

      // Merge edited content if any
      const finalExplanationResult = this.mergeEditedContent(
        explanationResult,
        approvedExplanationResult
      );

      // Update orchestrator about completion
      await this.updateOrchestrator(
        "Explanation Generation completed, workflow is now complete"
      );

      // Complete workflow
      this.currentState.completed = true;
      this.currentState.endTime = Date.now();
      this.currentState.totalDuration =
        this.currentState.endTime - this.currentState.startTime;

      // Stop the orchestrator monitoring
      this.stopOrchestratorMonitoring();

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
      this.stopOrchestratorMonitoring();

      this.emit("error", {
        message: error.message,
        state: this.currentState,
      });

      throw error;
    }
  }

  /**
   * Start continuous orchestrator monitoring
   */
  startOrchestratorMonitoring() {
    // Clear any existing interval
    this.stopOrchestratorMonitoring();

    // Start a new monitoring interval - check every 10 seconds
    this.monitorIntervalId = setInterval(async () => {
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
   */
  stopOrchestratorMonitoring() {
    if (this.monitorIntervalId) {
      clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = null;
    }
  }

  /**
   * Update the orchestrator with the current step progress
   * @param {string} message - Progress message
   */
  async updateOrchestrator(message) {
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
   */
  mergeEditedContent(originalResult, editedResult) {
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

      // Define thinking callback
      const feedbackThinkingCallback = (thinking) => {
        this.storeAgentThinking(this.activeSession, "userFeedback", thinking);
      };

      const feedbackResult = await this.agents.userFeedback.processFeedback(
        feedback,
        explanationResult,
        feedbackThinkingCallback
      );
      this.updateState("userFeedback", feedbackResult);

      // Generate learning insights
      this.emit("processingStep", { step: "learning", status: "starting" });

      // Define thinking callback for learning agent
      const learningThinkingCallback = (thinking) => {
        this.storeAgentThinking(this.activeSession, "learning", thinking);
      };

      const learningResult = await this.agents.learning.analyzeForImprovements(
        feedbackResult,
        this.processingHistory,
        learningThinkingCallback
      );
      this.updateState("learning", learningResult);

      // Update orchestrator
      await this.updateOrchestrator(
        "Feedback processed and analyzed by learning agent"
      );

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
   * Request termination of a workflow
   * @param {string} sessionId - Session ID
   * @param {string} rejectedStep - Step that was rejected
   * @param {string} reason - Reason for termination
   * @returns {Promise<boolean>} - Success status
   */
  async requestTermination(sessionId, rejectedStep, reason) {
    try {
      // Check if this is the active session
      if (this.activeSession !== sessionId) {
        return false;
      }

      console.log(
        `Termination requested for session ${sessionId} at step ${rejectedStep}: ${reason}`
      );

      // Add a termination message via the orchestrator
      await this.agents.orchestrator.handleTermination({
        sessionId,
        rejectedStep,
        reason,
        timestamp: new Date().toISOString(),
      });

      // Update state
      this.currentState.completed = true;
      this.currentState.terminatedEarly = true;
      this.currentState.terminationReason = reason;
      this.currentState.endTime = Date.now();
      this.currentState.totalDuration =
        this.currentState.endTime - this.currentState.startTime;

      // Stop monitoring
      this.stopOrchestratorMonitoring();

      // Update orchestrator status for UI
      const updateResult = await this.agents.orchestrator.monitorWorkflow(
        {
          message: `Workflow terminated: ${reason}`,
          timestamp: new Date().toISOString(),
          currentState: this.currentState,
          terminationRequested: true,
        },
        this.processingHistory[0] // Original workflow plan
      );

      // Update state and emit event
      this.updateState("orchestratorTermination", updateResult);

      // Emit termination event
      this.emit("workflowTerminated", {
        sessionId,
        rejectedStep,
        reason,
        timestamp: new Date().toISOString(),
        message: "Workflow was terminated by user rejection",
        alertUser: true,
      });

      return true;
    } catch (error) {
      console.error("Error requesting termination:", error);
      return false;
    }
  }
}

module.exports = new AgentManager();
