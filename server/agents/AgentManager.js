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

    // Emit update event
    this.emit("stateUpdate", {
      agent: agentName,
      result: result,
      state: this.currentState,
    });
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

      // Step 1: Content Analysis
      this.emit("processingStep", {
        step: "contentAnalysis",
        status: "starting",
      });
      const formattedData = this.agents.contentAnalysis.formatData(youtubeData);
      const contentAnalysisResult = await this.agents.contentAnalysis.analyze(
        formattedData
      );
      this.updateState("contentAnalysis", contentAnalysisResult);

      // Wait for user approval
      const approvedContentAnalysis = await approvalCallback(
        "contentAnalysis",
        contentAnalysisResult
      );
      // Use either approved content or original result
      const finalContentAnalysis =
        approvedContentAnalysis || contentAnalysisResult;

      // Step 2: Knowledge Retrieval
      this.emit("processingStep", {
        step: "knowledgeRetrieval",
        status: "starting",
      });
      const knowledgeResult =
        await this.agents.knowledgeRetrieval.retrieveKnowledge(
          finalContentAnalysis
        );
      this.updateState("knowledgeRetrieval", knowledgeResult);

      // Wait for user approval
      const approvedKnowledgeResult = await approvalCallback(
        "knowledgeRetrieval",
        knowledgeResult
      );
      // Use either approved content or original result
      const finalKnowledgeResult = approvedKnowledgeResult || knowledgeResult;

      // Step 3: Analogy Generation
      this.emit("processingStep", {
        step: "analogyGeneration",
        status: "starting",
      });
      const combinedInput = {
        contentAnalysis: finalContentAnalysis,
        knowledgeRetrieval: finalKnowledgeResult,
      };

      const analogiesResult =
        await this.agents.analogyGeneration.generateAnalogies(combinedInput);
      this.updateState("analogyGeneration", analogiesResult);

      // Wait for user approval
      const approvedAnalogiesResult = await approvalCallback(
        "analogyGeneration",
        analogiesResult
      );
      // Use either approved content or original result
      const finalAnalogiesResult = approvedAnalogiesResult || analogiesResult;

      // Step 4: Analogy Validation
      this.emit("processingStep", {
        step: "analogyValidation",
        status: "starting",
      });
      const validationResult =
        await this.agents.analogyValidation.validateAnalogies(
          finalAnalogiesResult,
          combinedInput
        );
      this.updateState("analogyValidation", validationResult);

      // Wait for user approval
      const approvedValidationResult = await approvalCallback(
        "analogyValidation",
        validationResult
      );
      // Use either approved content or original result
      const finalValidationResult =
        approvedValidationResult || validationResult;

      // Step 5: Analogy Refinement
      this.emit("processingStep", {
        step: "analogyRefinement",
        status: "starting",
      });
      const refinementResult =
        await this.agents.analogyRefinement.refineAnalogies(
          finalValidationResult,
          finalAnalogiesResult
        );
      this.updateState("analogyRefinement", refinementResult);

      // Wait for user approval
      const approvedRefinementResult = await approvalCallback(
        "analogyRefinement",
        refinementResult
      );
      // Use either approved content or original result
      const finalRefinementResult =
        approvedRefinementResult || refinementResult;

      // Step 6: Explanation Generation
      this.emit("processingStep", { step: "explanation", status: "starting" });
      const explanationResult = await this.agents.explanation.createExplanation(
        finalRefinementResult,
        { contentAnalysis: finalContentAnalysis }
      );
      this.updateState("explanation", explanationResult);

      // Wait for user approval
      const approvedExplanationResult = await approvalCallback(
        "explanation",
        explanationResult
      );
      // Use either approved content or original result
      const finalExplanationResult =
        approvedExplanationResult || explanationResult;

      // Complete workflow
      this.currentState.completed = true;
      this.currentState.endTime = Date.now();
      this.currentState.totalDuration =
        this.currentState.endTime - this.currentState.startTime;

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

      this.emit("error", {
        message: error.message,
        state: this.currentState,
      });

      throw error;
    }
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
}

module.exports = new AgentManager();
