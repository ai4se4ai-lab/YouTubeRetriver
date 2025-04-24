/**
 * Application configuration
 */
require("dotenv").config();

// Define the configuration
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || "development",
  },

  // Google OAuth settings
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:3000/api/auth/callback",
    scopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
  },

  // YouTube API settings
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    apiBase: "https://www.googleapis.com/youtube/v3",
  },

  // Security settings
  security: {
    sessionSecret: process.env.SESSION_SECRET || "youtube-data-exporter-secret",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },

  // File storage settings
  storage: {
    tempDir: process.env.TEMP_DIR || "./temp",
    maxFileAge: 60 * 60 * 1000, // 1 hour in milliseconds
  },

  // Agent approval settings
  agentApprovals: {
    required: process.env.REQUIRED_AGENT_APPROVALS
      ? process.env.REQUIRED_AGENT_APPROVALS === "all"
        ? "all"
        : process.env.REQUIRED_AGENT_APPROVALS.split(",")
      : "none",
  },

  // LLM Agent settings
  agents: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    gitAnalysisPrompt: `You are analyzing Git repository changes in continuous monitoring mode. 
      Your job is to identify potential IDE integration issues, environmental sustainability concerns, and ethical considerations in the code changes.

      For each detected issue, provide:
      1. Category (IDE Integration, Environmental Sustainability, or Ethical Consideration)
      2. A brief description of the issue
      3. The potential impact
      4. A suggested improvement

      Your analysis should be continuously available to the Orchestrator agent, which will direct when to perform checks and analyses.

      Focus on these specific areas:
      1. IDE Integration Issues:
        - Code constructs that prevent effective IDE features like code navigation, refactoring, etc.
        - Non-standard formatting that reduces IDE effectiveness
        - Ambiguous naming or references that confuse IDE tooling

      2. Environmental Sustainability Issues:
        - Code patterns that could lead to excessive resource consumption
        - Inefficient algorithms or data structures
        - Excessive polling or background processes
        - Potential energy waste

      3. Ethical Considerations:
        - Privacy concerns (data collection, storage, user tracking)
        - Transparency issues (hidden functionality, unclear user impacts)
        - Accessibility problems in UI components
        - Potential for bias in algorithms or data processing

      Provide clear explanations for each issue identified, including:
      - The category of the issue (IDE, Environmental, Ethical)
      - Why it's a concern
      - Potential impacts
      - Suggestions for improvement

      Format your analysis as a clear, structured report with separate sections for each category.`,
    contentAnalysisPrompt:
      "Analyze the YouTube data to identify main themes, topics, and potential user interests. Focus on extracting meaningful patterns and insights.",
    knowledgeRetrievalPrompt:
      "Based on the identified topics, retrieve and summarize relevant factual information that could enhance understanding. Focus on high-quality, accurate information.",
    analogyGenerationPrompt:
      "Create meaningful analogies that connect the user's interests from their YouTube data to concepts in humanities, science, ethics, or other domains. Make these analogies educational and insightful.",
    analogyValidationPrompt:
      "Evaluate the proposed analogy for accuracy, relevance, educational value, and clarity. Provide specific feedback on strengths and areas for improvement.",
    analogyRefinementPrompt:
      "Refine the analogy based on the validation feedback. Improve clarity, accuracy, and educational value while maintaining the core insight.",
    explanationPrompt:
      "Present the refined analogy to the user in an engaging, clear manner. Explain why this analogy is relevant to their interests and what insights it offers.",
    userFeedbackPrompt:
      "Based on user feedback, assess the effectiveness of the presented analogy. Identify specific strengths and weaknesses in the analogy generation process.",
    learningPrompt:
      "Analyze feedback patterns to suggest improvements to the analogy generation system. Identify recurring issues and potential enhancements.",
    orchestratorPrompt:
      "Coordinate the workflow between all agents, ensuring proper sequencing and information flow. Maintain overall coherence and effectiveness of the system.",
  },
};

// Log important config values
console.log("Environment variables loaded:");
console.log("- Google Client ID exists:", !!config.google.clientId);
console.log("- Google Client Secret exists:", !!config.google.clientSecret);
console.log("- Google Redirect URI:", config.google.redirectUri);
console.log("- CORS Origin:", config.security.corsOrigin);
console.log("- OpenAI API Key exists:", !!config.agents.openaiApiKey);

module.exports = config;
