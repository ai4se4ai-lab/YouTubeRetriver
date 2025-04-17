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
    this.thinking = null; // Store thinking process
  }

  /**
   * Summarize output to a maximum of 250 words
   * @param {string} output - The full output to summarize
   * @returns {string} - Summarized output (max 250 words)
   */
  summarizeOutput(output) {
    if (!output) return "";

    // Count words
    const words = output.split(/\s+/);
    if (words.length <= 250) return output;

    // If over 250 words, create summary
    const truncated = words.slice(0, 240).join(" ");

    // Add note about truncation
    return (
      truncated +
      "... [Output truncated to 250 words. Click 'Show Full Content' to see full content]"
    );
  }

  /**
   * Process data through the agent
   * @param {Object} data - Input data to process
   * @param {string} prompt - Specific prompt for this processing
   * @param {function} thinkingCallback - Optional callback to receive thinking updates
   * @returns {Promise<Object>} - Processing result
   */
  async process(data, prompt, thinkingCallback = null) {
    this.startTime = Date.now();
    this.processed = false;
    let thinking = "";

    try {
      console.log(`${this.name} starting processing...`);

      // Capture thinking process
      thinking = `Agent: ${this.name}\n`;
      thinking += `Description: ${this.description}\n`;
      thinking += `Timestamp: ${new Date().toISOString()}\n\n`;
      thinking += `Input Data:\n${JSON.stringify(data, null, 2)}\n\n`;
      thinking += `Prompt:\n${prompt}\n\n`;
      thinking += `Processing Steps:\n`;

      // Add a starting thinking entry
      thinking += `[${new Date().toISOString()}] Starting processing with model: ${
        this.model
      }\n`;

      // If we have a thinking callback, send initial thinking
      if (thinkingCallback) {
        thinkingCallback(thinking);
      }

      const messages = [
        {
          role: "system",
          content: `You are ${this.name}, ${this.description}. ${prompt}`,
        },
        {
          role: "user",
          content: JSON.stringify(data, null, 2),
        },
      ];

      // Add thinking for message preparation
      thinking += `[${new Date().toISOString()}] Prepared messages for API call:\n`;
      thinking += `System message: ${messages[0].content.substring(
        0,
        100
      )}...\n`;
      thinking += `User message: ${messages[1].content.substring(
        0,
        100
      )}...\n\n`;

      // Update thinking callback
      if (thinkingCallback) {
        thinkingCallback(thinking);
      }

      // Make the API call
      thinking += `[${new Date().toISOString()}] Making API call to ${
        this.model
      }...\n`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.7,
      });

      // Add response to thinking
      thinking += `[${new Date().toISOString()}] Received response from API\n`;
      thinking += `Tokens used: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})\n\n`;
      thinking += `Response content:\n${response.choices[0].message.content.substring(
        0,
        200
      )}...\n\n`;

      // Final thinking update
      if (thinkingCallback) {
        thinkingCallback(thinking);
      }

      // Create result with both full output and summarized output
      const fullOutput = response.choices[0].message.content;
      const summarizedOutput = this.summarizeOutput(fullOutput);

      this.result = {
        output: fullOutput,
        summarizedOutput: summarizedOutput,
        usage: response.usage,
        model: response.model,
      };

      this.processed = true;
      console.log(`${this.name} completed processing`);

      // Final thinking entry
      thinking += `[${new Date().toISOString()}] Processing completed successfully.\n`;
      thinking += `[${new Date().toISOString()}] Summarized output to ${
        summarizedOutput.split(/\s+/).length
      } words from ${fullOutput.split(/\s+/).length} words.\n`;
    } catch (error) {
      console.error(`${this.name} processing error:`, error);
      this.error = error.message;

      // Add error to thinking
      thinking += `[${new Date().toISOString()}] ERROR: ${error.message}\n`;
      thinking += `Stack trace: ${error.stack}\n`;
    } finally {
      this.endTime = Date.now();
      this.duration = this.endTime - this.startTime;

      // Add duration to thinking
      thinking += `[${new Date().toISOString()}] Total processing time: ${
        this.duration
      }ms\n`;

      // Final thinking update
      if (thinkingCallback) {
        thinkingCallback(thinking);
      }

      // Store the complete thinking process
      this.thinking = thinking;

      return {
        name: this.name,
        description: this.description,
        processed: this.processed,
        result: this.result,
        error: this.error,
        duration: this.duration,
        thinking: thinking,
      };
    }
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
    this.thinking = null;
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
      hasThinking: !!this.thinking,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get agent thinking process
   * @returns {string|null} - Thinking process or null if not available
   */
  getThinking() {
    return this.thinking;
  }
}

module.exports = BaseAgent;
