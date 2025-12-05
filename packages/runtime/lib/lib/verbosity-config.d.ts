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
export declare class VerbosityHelper {
    /**
     * Get configuration for a specific verbosity level
     */
    static getConfig(verbosity: number): VerbosityConfig;
    /**
     * Generate the verbosity rule section for the system prompt
     */
    static getSystemPromptRule(verbosity: number): string;
    /**
     * Get structured output instructions for the system prompt
     */
    static getStructuredOutputInstructions(verbosity: number): string;
    /**
     * Validate and enforce sentence count
     */
    static enforceSentenceLimit(sentences: string[], verbosity: number): string[];
    /**
     * Count sentences in a text response (regex-based fallback)
     */
    static countSentences(text: string): number;
    /**
     * Get a human-readable description of a verbosity level
     */
    static getDescription(verbosity: number): string;
}
