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
   * @returns {Promise<Object>} - Processing result
   */
  async process(data, prompt) {
    this.startTime = Date.now();
    this.processed = false;

    try {
      console.log(`${this.name} starting processing...`);

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

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.7,
      });

      this.result = {
        output: response.choices[0].message.content,
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
