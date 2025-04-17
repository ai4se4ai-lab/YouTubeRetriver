/**
 * Base Agent Class
 * Serves as the foundation for all LLM agents in the system
 */
const { OpenAI } = require("openai");
const config = require("../config/config");

class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.openai = new OpenAI({
      apiKey: config.agents.openaiApiKey,
    });
    this.model = config.agents.model;
    this.processed = false;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.duration = null;
  }

  /**
   * Process data through the agent
   * @param {Object} data - Input data to process
   * @param {string} prompt - Specific prompt for this processing
   * @param {string} editedContent - Optional edited content from previous step
   * @returns {Promise<Object>} - Processing result
   */
  async process(data, prompt, editedContent = null) {
    this.startTime = Date.now();
    this.processed = false;

    try {
      console.log(`${this.name} starting processing...`);

      // If we have edited content and it's relevant to this processing
      // (e.g., it's from a previous agent that feeds into this one),
      // we can incorporate it into our processing logic here
      if (editedContent) {
        console.log(`${this.name} processing with edited content`);
        // You might need to update 'data' based on editedContent
        // This is specific to each agent's implementation
      }

      // Add instruction to summarize output for display to the system prompt
      const enhancedPrompt = `${prompt}
      
IMPORTANT: Your response will be shown to the user and also passed to other agents. Please follow these guidelines:
1. Focus on the most relevant information and insights
2. Be concise and clear - limit your response to 250 words maximum
3. Avoid including technical details like token counts, usage statistics, etc.
4. Structure your response logically with clear sections if appropriate
5. If you're generating analogies, make them short, interesting, and focused
6. Remove any metadata or system-related information from your response`;

      const messages = [
        {
          role: "system",
          content: `You are ${this.name}, ${this.description}. ${enhancedPrompt}`,
        },
        {
          role: "user",
          content: JSON.stringify(data, null, 2),
        },
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.7,
      });

      const rawOutput = response.choices[0].message.content;

      // Process the output to ensure it's clean and summarized for display
      const summarizedOutput = this.summarizeOutput(rawOutput);

      this.result = {
        output: summarizedOutput,
        rawOutput: rawOutput, // Keep the raw output for agents that might need it
        usage: response.usage,
        model: response.model,
      };

      this.processed = true;
      console.log(`${this.name} completed processing`);
    } catch (error) {
      console.error(`${this.name} processing error:`, error);
      this.error = error.message;
    } finally {
      this.endTime = Date.now();
      this.duration = this.endTime - this.startTime;
      return {
        name: this.name,
        description: this.description,
        processed: this.processed,
        result: this.result,
        error: this.error,
        duration: this.duration,
      };
    }
  }

  /**
   * Summarize and clean agent output for display
   * @param {string} output - Raw output to summarize
   * @param {number} maxWords - Maximum number of words to include
   * @returns {string} - Summarized and cleaned output
   */
  summarizeOutput(output, maxWords = 250) {
    if (!output) return "";

    // Remove technical data like tokens, usage, etc.
    let cleaned = output.replace(/prompt_tokens.*?[,}]/g, "");
    cleaned = cleaned.replace(/completion_tokens.*?[,}]/g, "");
    cleaned = cleaned.replace(/total_tokens.*?[,}]/g, "");
    cleaned = cleaned.replace(/usage.*?}/g, "");
    cleaned = cleaned.replace(/{"output": /g, "");
    cleaned = cleaned.replace(/},?\s*$/g, "");

    // Remove any JSON formatting artifacts
    cleaned = cleaned.replace(/```json\s*|```\s*$/g, "");

    // Remove any token or technical stats that might be in text form
    cleaned = cleaned.replace(/Tokens used:.*$/gm, "");
    cleaned = cleaned.replace(/Total tokens:.*$/gm, "");
    cleaned = cleaned.replace(/Processing time:.*$/gm, "");

    // Remove quotes at beginning and end if they exist (from JSON)
    cleaned = cleaned.replace(/^"/, "").replace(/"$/, "");

    // Split into words and limit to maxWords
    const words = cleaned.split(/\s+/);
    if (words.length <= maxWords) return cleaned;

    return words.slice(0, maxWords).join(" ") + "...";
  }

  /**
   * Reset the agent state
   */
  reset() {
    this.processed = false;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.duration = null;
  }

  /**
   * Get agent status
   * @returns {Object} - Current agent status
   */
  getStatus() {
    return {
      name: this.name,
      description: this.description,
      processed: this.processed,
      hasError: !!this.error,
      duration: this.duration,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = BaseAgent;
