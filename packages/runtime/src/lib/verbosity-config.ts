/**
 * Verbosity Configuration Utility
 * 
 * Manages response length, tone, and LLM parameters based on verbosity level (1-10).
 * Lower verbosity = shorter, punchier responses.
 * Higher verbosity = longer, more detailed responses.
 */

export interface VerbosityConfig {
  level: number;
  maxTokens: number;
  maxSentences: number;
  temperature: number;
  description: string;
  tone: string;
}

export class VerbosityHelper {
  /**
   * Get configuration for a specific verbosity level
   */
  static getConfig(verbosity: number): VerbosityConfig {
    // Clamp verbosity to valid range
    const level = Math.max(1, Math.min(10, verbosity));

    switch (level) {
      case 1:
        return {
          level: 1,
          maxTokens: 200,
          maxSentences: 2,
          temperature: 0.3,
          description: 'Extremely brief and to the point',
          tone: 'Keep sentences extremely short and to the point.',
        };

      case 2:
        return {
          level: 2,
          maxTokens: 250,
          maxSentences: 4,
          temperature: 0.3,
          description: 'Brief and concise',
          tone: 'Keep sentences short and to the point.',
        };

      case 3:
        return {
          level: 3,
          maxTokens: 300,
          maxSentences: 6,
          temperature: 0.3,
          description: 'Somewhat concise',
          tone: 'Keep sentences somewhat short.',
        };

      case 4:
        return {
          level: 4,
          maxTokens: 350,
          maxSentences: 8,
          temperature: 0.3,
          description: 'Balanced - clear and concise',
          tone: 'Use clear, concise sentences.',
        };

      case 5:
        return {
          level: 5,
          maxTokens: 400,
          maxSentences: 10,
          temperature: 0.4,
          description: 'Balanced - moderate detail',
          tone: 'Provide moderate detail with clear sentences.',
        };

      case 6:
        return {
          level: 6,
          maxTokens: 500,
          maxSentences: 12,
          temperature: 0.5,
          description: 'Moderately detailed',
          tone: 'Provide helpful detail without being excessive.',
        };

      case 7:
        return {
          level: 7,
          maxTokens: 600,
          maxSentences: 14,
          temperature: 0.5,
          description: 'Detailed and thorough',
          tone: 'Provide thorough explanations with supporting details.',
        };

      case 8:
        return {
          level: 8,
          maxTokens: 700,
          maxSentences: 16,
          temperature: 0.6,
          description: 'Very detailed',
          tone: 'Provide comprehensive explanations with examples and context.',
        };

      case 9:
        return {
          level: 9,
          maxTokens: 800,
          maxSentences: 18,
          temperature: 0.6,
          description: 'Extremely detailed',
          tone: 'Provide extensive detail, examples, and thorough explanations.',
        };

      case 10:
        return {
          level: 10,
          maxTokens: 1000,
          maxSentences: 20,
          temperature: 0.7,
          description: 'Maximum detail and depth',
          tone: 'Provide exhaustive detail with multiple examples, context, and complete explanations.',
        };

      default:
        // Default to level 4 (balanced)
        return this.getConfig(4);
    }
  }

  /**
   * Generate the verbosity rule section for the system prompt
   */
  static getSystemPromptRule(verbosity: number): string {
    const config = this.getConfig(verbosity);
    
    const baseRules = `
You MUST respond in at most {maxSentences} sentences.
Each sentence must be short and self-contained.
Do NOT use bullet points or numbered lists.
Do NOT combine multiple ideas with semicolons.
⚠️ CRITICAL: Always end your response cleanly. NEVER cut off mid-sentence or mid-word.
`;

    let verbosityRule = `🚨🚨 CRITICAL RESPONSE CONSTRAINT 🚨🚨\n${config.tone}\n${baseRules.replace('{maxSentences}', config.maxSentences.toString())}`;

    // For lower verbosity levels (1-4), explicitly tell the LLM NOT to ask questions in the main response
    if (config.level <= 4) {
      verbosityRule += '\nDo NOT ask questions in your response - make statements only. A follow-up question will be added separately.\n';
    }

    return verbosityRule;
  }

  /**
   * Get structured output instructions for the system prompt
   */
  static getStructuredOutputInstructions(verbosity: number): string {
    const config = this.getConfig(verbosity);
    
    return `\n\n🚨 CRITICAL OUTPUT RULES 🚨
- You MUST return a JSON object with ONLY the key "sentences"
- The value MUST be an array of strings (complete sentences)
- Each sentence MUST be complete and standalone
- Maximum ${config.maxSentences} sentences
- Use your persona's voice, style, and emojis in the sentences
- Do NOT include explanations about the rules
`;
  }

  /**
   * Validate and enforce sentence count
   */
  static enforceSentenceLimit(sentences: string[], verbosity: number): string[] {
    const config = this.getConfig(verbosity);
    
    if (!Array.isArray(sentences)) {
      console.error('⚠️ Structured output did not return an array! Got:', typeof sentences, sentences);
      return [String(sentences)];
    }

    if (sentences.length > config.maxSentences) {
      console.log(`⚠️ LLM generated ${sentences.length} sentences, truncating to ${config.maxSentences}`);
      return sentences.slice(0, config.maxSentences);
    }

    // Check for empty responses
    if (sentences.length === 0 || sentences.every(s => !s || s.trim() === '')) {
      console.error('❌ CRITICAL: Structured output returned empty sentences!');
      console.warn('⚠️ Using fallback response to prevent empty message');
      return ["I'm here and ready to help! What would you like to know?"];
    }

    return sentences;
  }

  /**
   * Count sentences in a text response (regex-based fallback)
   */
  static countSentences(text: string): number {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.length;
  }

  /**
   * Get a human-readable description of a verbosity level
   */
  static getDescription(verbosity: number): string {
    return this.getConfig(verbosity).description;
  }
}

