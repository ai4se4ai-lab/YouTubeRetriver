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
      1. Detecting issues related to inclusion, diversity, and equity:
        - Potentially Harmful or Biased Language: Look for variable names, comments, or user-facing strings that might perpetuate stereotypes, use exclusionary language, or make assumptions about user identity (e.g., gendered pronouns when referring to a generic user, terms that could be offensive to certain groups)
        - Lack of Localization/Internationalization (i18n): If the software is intended for a global audience, the absence of i18n considerations (e.g., hardcoded strings, lack of support for different date/time formats, currency symbols, or right-to-left languages) can indicate a lack of inclusivity for non-English speakers.
        - Limited Input Options: Code that makes assumptions about user identity or characteristics by offering a limited set of options (e.g., only "Male" and "Female" gender choices) can be exclusionary and not reflect the diversity of users.
        - Lack of Robust Error Handling for Diverse Inputs: Insufficient error handling for unexpected or varied inputs might disproportionately affect users with different data formats or input methods.
        - Hardcoded or Default Values Reflecting Bias: Check for default values or hardcoded data that might reflect societal biases (e.g., assuming a certain profession is predominantly one gender).
        - Lack of Anonymization or Privacy Considerations: Code that doesn't properly handle sensitive user data, especially demographic information, can disproportionately affect marginalized groups who might be more vulnerable to privacy breaches.
        - Accessibility Considerations, Missing or Poor Semantic HTML: In web development, the lack of semantic HTML elements (e.g., <nav>, <article>, <aside>) and proper use of ARIA attributes can create barriers for users with assistive technologies like screen readers.
        - Accessibility Considerations, Insufficient Color Contrast: Inadequate color contrast between text and background can make content difficult to read for users with low vision.
        - Accessibility Considerations, Lack of Keyboard Navigation: Code that doesn't support keyboard navigation can exclude users with mobility impairments who rely on keyboard shortcuts or assistive devices.

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

      Format your analysis as a consise, structured report with separate sections for each category.`,
    contentAnalysisPrompt:
      "Analyze the YouTube data to identify main themes, topics, and potential user interests. Focus on extracting meaningful patterns and insights.",
    knowledgeRetrievalPrompt:
      "Based on the identified topics, retrieve and summarize relevant factual information that could enhance understanding. Focus on high-quality, accurate information.",
    analogyGenerationPrompt:
      "Create meaningful analogies that connect the user's interests from their YouTube data to concepts in humanities, science, ethics, or other domains. If Git analysis results are available, prioritize creating analogies that help explain the code issues, technical concepts, and best practices identified by the Git Analysis Agent. Make these analogies educational and insightful.",
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
