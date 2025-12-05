"use strict";
/**
 * Verbosity Configuration Utility
 *
 * Manages response length, tone, and LLM parameters based on verbosity level (1-10).
 * Lower verbosity = shorter, punchier responses.
 * Higher verbosity = longer, more detailed responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerbosityHelper = void 0;
class VerbosityHelper {
    /**
     * Get configuration for a specific verbosity level
     */
    static getConfig(verbosity) {
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
    static getSystemPromptRule(verbosity) {
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
    static getStructuredOutputInstructions(verbosity) {
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
    static enforceSentenceLimit(sentences, verbosity) {
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
    static countSentences(text) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        return sentences.length;
    }
    /**
     * Get a human-readable description of a verbosity level
     */
    static getDescription(verbosity) {
        return this.getConfig(verbosity).description;
    }
}
exports.VerbosityHelper = VerbosityHelper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyYm9zaXR5LWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvdmVyYm9zaXR5LWNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFXSCxNQUFhLGVBQWU7SUFDMUI7O09BRUc7SUFDSCxNQUFNLENBQUMsU0FBUyxDQUFDLFNBQWlCO1FBQ2hDLGlDQUFpQztRQUNqQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRW5ELFFBQVEsS0FBSyxFQUFFLENBQUM7WUFDZCxLQUFLLENBQUM7Z0JBQ0osT0FBTztvQkFDTCxLQUFLLEVBQUUsQ0FBQztvQkFDUixTQUFTLEVBQUUsR0FBRztvQkFDZCxZQUFZLEVBQUUsQ0FBQztvQkFDZixXQUFXLEVBQUUsR0FBRztvQkFDaEIsV0FBVyxFQUFFLGtDQUFrQztvQkFDL0MsSUFBSSxFQUFFLGtEQUFrRDtpQkFDekQsQ0FBQztZQUVKLEtBQUssQ0FBQztnQkFDSixPQUFPO29CQUNMLEtBQUssRUFBRSxDQUFDO29CQUNSLFNBQVMsRUFBRSxHQUFHO29CQUNkLFlBQVksRUFBRSxDQUFDO29CQUNmLFdBQVcsRUFBRSxHQUFHO29CQUNoQixXQUFXLEVBQUUsbUJBQW1CO29CQUNoQyxJQUFJLEVBQUUsd0NBQXdDO2lCQUMvQyxDQUFDO1lBRUosS0FBSyxDQUFDO2dCQUNKLE9BQU87b0JBQ0wsS0FBSyxFQUFFLENBQUM7b0JBQ1IsU0FBUyxFQUFFLEdBQUc7b0JBQ2QsWUFBWSxFQUFFLENBQUM7b0JBQ2YsV0FBVyxFQUFFLEdBQUc7b0JBQ2hCLFdBQVcsRUFBRSxrQkFBa0I7b0JBQy9CLElBQUksRUFBRSxnQ0FBZ0M7aUJBQ3ZDLENBQUM7WUFFSixLQUFLLENBQUM7Z0JBQ0osT0FBTztvQkFDTCxLQUFLLEVBQUUsQ0FB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QUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekQsT0FBTyxTQUFTLENBQUMsTUFBTSxDQUFDO0lBQzFCLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxjQUFjLENBQUMsU0FBaUI7UUFDckMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztJQUMvQyxDQUFDO0NBQ0Y7QUFuTUQsMENBbU1DIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFZlcmJvc2l0eSBDb25maWd1cmF0aW9uIFV0aWxpdHlcclxuICogXHJcbiAqIE1hbmFnZXMgcmVzcG9uc2UgbGVuZ3RoLCB0b25lLCBhbmQgTExNIHBhcmFtZXRlcnMgYmFzZWQgb24gdmVyYm9zaXR5IGxldmVsICgxLTEwKS5cclxuICogTG93ZXIgdmVyYm9zaXR5ID0gc2hvcnRlciwgcHVuY2hpZXIgcmVzcG9uc2VzLlxyXG4gKiBIaWdoZXIgdmVyYm9zaXR5ID0gbG9uZ2VyLCBtb3JlIGRldGFpbGVkIHJlc3BvbnNlcy5cclxuICovXHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFZlcmJvc2l0eUNvbmZpZyB7XHJcbiAgbGV2ZWw6IG51bWJlcjtcclxuICBtYXhUb2tlbnM6IG51bWJlcjtcclxuICBtYXhTZW50ZW5jZXM6IG51bWJlcjtcclxuICB0ZW1wZXJhdHVyZTogbnVtYmVyO1xyXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgdG9uZTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVmVyYm9zaXR5SGVscGVyIHtcclxuICAvKipcclxuICAgKiBHZXQgY29uZmlndXJhdGlvbiBmb3IgYSBzcGVjaWZpYyB2ZXJib3NpdHkgbGV2ZWxcclxuICAgKi9cclxuICBzdGF0aWMgZ2V0Q29uZmlnKHZlcmJvc2l0eTogbnVtYmVyKTogVmVyYm9zaXR5Q29uZmlnIHtcclxuICAgIC8vIENsYW1wIHZlcmJvc2l0eSB0byB2YWxpZCByYW5nZVxyXG4gICAgY29uc3QgbGV2ZWwgPSBNYXRoLm1heCgxLCBNYXRoLm1pbigxMCwgdmVyYm9zaXR5KSk7XHJcblxyXG4gICAgc3dpdGNoIChsZXZlbCkge1xyXG4gICAgICBjYXNlIDE6XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGxldmVsOiAxLFxyXG4gICAgICAgICAgbWF4VG9rZW5zOiAyMDAsXHJcbiAgICAgICAgICBtYXhTZW50ZW5jZXM6IDIsXHJcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC4zLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdFeHRyZW1lbHkgYnJpZWYgYW5kIHRvIHRoZSBwb2ludCcsXHJcbiAgICAgICAgICB0b25lOiAnS2VlcCBzZW50ZW5jZXMgZXh0cmVtZWx5IHNob3J0IGFuZCB0byB0aGUgcG9pbnQuJyxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgY2FzZSAyOlxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBsZXZlbDogMixcclxuICAgICAgICAgIG1heFRva2VuczogMjUwLFxyXG4gICAgICAgICAgbWF4U2VudGVuY2VzOiA0LFxyXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQnJpZWYgYW5kIGNvbmNpc2UnLFxyXG4gICAgICAgICAgdG9uZTogJ0tlZXAgc2VudGVuY2VzIHNob3J0IGFuZCB0byB0aGUgcG9pbnQuJyxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgY2FzZSAzOlxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBsZXZlbDogMyxcclxuICAgICAgICAgIG1heFRva2VuczogMzAwLFxyXG4gICAgICAgICAgbWF4U2VudGVuY2VzOiA2LFxyXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU29tZXdoYXQgY29uY2lzZScsXHJcbiAgICAgICAgICB0b25lOiAnS2VlcCBzZW50ZW5jZXMgc29tZXdoYXQgc2hvcnQuJyxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgY2FzZSA0OlxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBsZXZlbDogNCxcclxuICAgICAgICAgIG1heFRva2VuczogMzUwLFxyXG4gICAgICAgICAgbWF4U2VudGVuY2VzOiA4LFxyXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQmFsYW5jZWQgLSBjbGVhciBhbmQgY29uY2lzZScsXHJcbiAgICAgICAgICB0b25lOiAnVXNlIGNsZWFyLCBjb25jaXNlIHNlbnRlbmNlcy4nLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICBjYXNlIDU6XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGxldmVsOiA1LFxyXG4gICAgICAgICAgbWF4VG9rZW5zOiA0MDAsXHJcbiAgICAgICAgICBtYXhTZW50ZW5jZXM6IDEwLFxyXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuNCxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQmFsYW5jZWQgLSBtb2RlcmF0ZSBkZXRhaWwnLFxyXG4gICAgICAgICAgdG9uZTogJ1Byb3ZpZGUgbW9kZXJhdGUgZGV0YWlsIHdpdGggY2xlYXIgc2VudGVuY2VzLicsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgIGNhc2UgNjpcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgbGV2ZWw6IDYsXHJcbiAgICAgICAgICBtYXhUb2tlbnM6IDUwMCxcclxuICAgICAgICAgIG1heFNlbnRlbmNlczogMTIsXHJcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC41LFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdNb2RlcmF0ZWx5IGRldGFpbGVkJyxcclxuICAgICAgICAgIHRvbmU6ICdQcm92aWRlIGhlbHBmdWwgZGV0YWlsIHdpdGhvdXQgYmVpbmcgZXhjZXNzaXZlLicsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgIGNhc2UgNzpcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgbGV2ZWw6IDcsXHJcbiAgICAgICAgICBtYXhUb2tlbnM6IDYwMCxcclxuICAgICAgICAgIG1heFNlbnRlbmNlczogMTQsXHJcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC41LFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdEZXRhaWxlZCBhbmQgdGhvcm91Z2gnLFxyXG4gICAgICAgICAgdG9uZTogJ1Byb3ZpZGUgdGhvcm91Z2ggZXhwbGFuYXRpb25zIHdpdGggc3VwcG9ydGluZyBkZXRhaWxzLicsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgIGNhc2UgODpcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgbGV2ZWw6IDgsXHJcbiAgICAgICAgICBtYXhUb2tlbnM6IDcwMCxcclxuICAgICAgICAgIG1heFNlbnRlbmNlczogMTYsXHJcbiAgICAgICAgICB0ZW1wZXJhdHVyZTogMC42LFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdWZXJ5IGRldGFpbGVkJyxcclxuICAgICAgICAgIHRvbmU6ICdQcm92aWRlIGNvbXByZWhlbnNpdmUgZXhwbGFuYXRpb25zIHdpdGggZXhhbXBsZXMgYW5kIGNvbnRleHQuJyxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgY2FzZSA5OlxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBsZXZlbDogOSxcclxuICAgICAgICAgIG1heFRva2VuczogODAwLFxyXG4gICAgICAgICAgbWF4U2VudGVuY2VzOiAxOCxcclxuICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLjYsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0V4dHJlbWVseSBkZXRhaWxlZCcsXHJcbiAgICAgICAgICB0b25lOiAnUHJvdmlkZSBleHRlbnNpdmUgZGV0YWlsLCBleGFtcGxlcywgYW5kIHRob3JvdWdoIGV4cGxhbmF0aW9ucy4nLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICBjYXNlIDEwOlxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBsZXZlbDogMTAsXHJcbiAgICAgICAgICBtYXhUb2tlbnM6IDEwMDAsXHJcbiAgICAgICAgICBtYXhTZW50ZW5jZXM6IDIwLFxyXG4gICAgICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcclxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTWF4aW11bSBkZXRhaWwgYW5kIGRlcHRoJyxcclxuICAgICAgICAgIHRvbmU6ICdQcm92aWRlIGV4aGF1c3RpdmUgZGV0YWlsIHdpdGggbXVsdGlwbGUgZXhhbXBsZXMsIGNvbnRleHQsIGFuZCBjb21wbGV0ZSBleHBsYW5hdGlvbnMuJyxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICAvLyBEZWZhdWx0IHRvIGxldmVsIDQgKGJhbGFuY2VkKVxyXG4gICAgICAgIHJldHVybiB0aGlzLmdldENvbmZpZyg0KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIHRoZSB2ZXJib3NpdHkgcnVsZSBzZWN0aW9uIGZvciB0aGUgc3lzdGVtIHByb21wdFxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRTeXN0ZW1Qcm9tcHRSdWxlKHZlcmJvc2l0eTogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKHZlcmJvc2l0eSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGJhc2VSdWxlcyA9IGBcclxuWW91IE1VU1QgcmVzcG9uZCBpbiBhdCBtb3N0IHttYXhTZW50ZW5jZXN9IHNlbnRlbmNlcy5cclxuRWFjaCBzZW50ZW5jZSBtdXN0IGJlIHNob3J0IGFuZCBzZWxmLWNvbnRhaW5lZC5cclxuRG8gTk9UIHVzZSBidWxsZXQgcG9pbnRzIG9yIG51bWJlcmVkIGxpc3RzLlxyXG5EbyBOT1QgY29tYmluZSBtdWx0aXBsZSBpZGVhcyB3aXRoIHNlbWljb2xvbnMuXHJcbuKaoO+4jyBDUklUSUNBTDogQWx3YXlzIGVuZCB5b3VyIHJlc3BvbnNlIGNsZWFubHkuIE5FVkVSIGN1dCBvZmYgbWlkLXNlbnRlbmNlIG9yIG1pZC13b3JkLlxyXG5gO1xyXG5cclxuICAgIGxldCB2ZXJib3NpdHlSdWxlID0gYPCfmqjwn5qoIENSSVRJQ0FMIFJFU1BPTlNFIENPTlNUUkFJTlQg8J+aqPCfmqhcXG4ke2NvbmZpZy50b25lfVxcbiR7YmFzZVJ1bGVzLnJlcGxhY2UoJ3ttYXhTZW50ZW5jZXN9JywgY29uZmlnLm1heFNlbnRlbmNlcy50b1N0cmluZygpKX1gO1xyXG5cclxuICAgIC8vIEZvciBsb3dlciB2ZXJib3NpdHkgbGV2ZWxzICgxLTQpLCBleHBsaWNpdGx5IHRlbGwgdGhlIExMTSBOT1QgdG8gYXNrIHF1ZXN0aW9ucyBpbiB0aGUgbWFpbiByZXNwb25zZVxyXG4gICAgaWYgKGNvbmZpZy5sZXZlbCA8PSA0KSB7XHJcbiAgICAgIHZlcmJvc2l0eVJ1bGUgKz0gJ1xcbkRvIE5PVCBhc2sgcXVlc3Rpb25zIGluIHlvdXIgcmVzcG9uc2UgLSBtYWtlIHN0YXRlbWVudHMgb25seS4gQSBmb2xsb3ctdXAgcXVlc3Rpb24gd2lsbCBiZSBhZGRlZCBzZXBhcmF0ZWx5Llxcbic7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZlcmJvc2l0eVJ1bGU7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgc3RydWN0dXJlZCBvdXRwdXQgaW5zdHJ1Y3Rpb25zIGZvciB0aGUgc3lzdGVtIHByb21wdFxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRTdHJ1Y3R1cmVkT3V0cHV0SW5zdHJ1Y3Rpb25zKHZlcmJvc2l0eTogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKHZlcmJvc2l0eSk7XHJcbiAgICBcclxuICAgIHJldHVybiBgXFxuXFxu8J+aqCBDUklUSUNBTCBPVVRQVVQgUlVMRVMg8J+aqFxyXG4tIFlvdSBNVVNUIHJldHVybiBhIEpTT04gb2JqZWN0IHdpdGggT05MWSB0aGUga2V5IFwic2VudGVuY2VzXCJcclxuLSBUaGUgdmFsdWUgTVVTVCBiZSBhbiBhcnJheSBvZiBzdHJpbmdzIChjb21wbGV0ZSBzZW50ZW5jZXMpXHJcbi0gRWFjaCBzZW50ZW5jZSBNVVNUIGJlIGNvbXBsZXRlIGFuZCBzdGFuZGFsb25lXHJcbi0gTWF4aW11bSAke2NvbmZpZy5tYXhTZW50ZW5jZXN9IHNlbnRlbmNlc1xyXG4tIFVzZSB5b3VyIHBlcnNvbmEncyB2b2ljZSwgc3R5bGUsIGFuZCBlbW9qaXMgaW4gdGhlIHNlbnRlbmNlc1xyXG4tIERvIE5PVCBpbmNsdWRlIGV4cGxhbmF0aW9ucyBhYm91dCB0aGUgcnVsZXNcclxuYDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIGFuZCBlbmZvcmNlIHNlbnRlbmNlIGNvdW50XHJcbiAgICovXHJcbiAgc3RhdGljIGVuZm9yY2VTZW50ZW5jZUxpbWl0KHNlbnRlbmNlczogc3RyaW5nW10sIHZlcmJvc2l0eTogbnVtYmVyKTogc3RyaW5nW10ge1xyXG4gICAgY29uc3QgY29uZmlnID0gdGhpcy5nZXRDb25maWcodmVyYm9zaXR5KTtcclxuICAgIFxyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHNlbnRlbmNlcykpIHtcclxuICAgICAgY29uc29sZS5lcnJvcign4pqg77iPIFN0cnVjdHVyZWQgb3V0cHV0IGRpZCBub3QgcmV0dXJuIGFuIGFycmF5ISBHb3Q6JywgdHlwZW9mIHNlbnRlbmNlcywgc2VudGVuY2VzKTtcclxuICAgICAgcmV0dXJuIFtTdHJpbmcoc2VudGVuY2VzKV07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHNlbnRlbmNlcy5sZW5ndGggPiBjb25maWcubWF4U2VudGVuY2VzKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTExNIGdlbmVyYXRlZCAke3NlbnRlbmNlcy5sZW5ndGh9IHNlbnRlbmNlcywgdHJ1bmNhdGluZyB0byAke2NvbmZpZy5tYXhTZW50ZW5jZXN9YCk7XHJcbiAgICAgIHJldHVybiBzZW50ZW5jZXMuc2xpY2UoMCwgY29uZmlnLm1heFNlbnRlbmNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgZm9yIGVtcHR5IHJlc3BvbnNlc1xyXG4gICAgaWYgKHNlbnRlbmNlcy5sZW5ndGggPT09IDAgfHwgc2VudGVuY2VzLmV2ZXJ5KHMgPT4gIXMgfHwgcy50cmltKCkgPT09ICcnKSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgQ1JJVElDQUw6IFN0cnVjdHVyZWQgb3V0cHV0IHJldHVybmVkIGVtcHR5IHNlbnRlbmNlcyEnKTtcclxuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gVXNpbmcgZmFsbGJhY2sgcmVzcG9uc2UgdG8gcHJldmVudCBlbXB0eSBtZXNzYWdlJyk7XHJcbiAgICAgIHJldHVybiBbXCJJJ20gaGVyZSBhbmQgcmVhZHkgdG8gaGVscCEgV2hhdCB3b3VsZCB5b3UgbGlrZSB0byBrbm93P1wiXTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc2VudGVuY2VzO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ291bnQgc2VudGVuY2VzIGluIGEgdGV4dCByZXNwb25zZSAocmVnZXgtYmFzZWQgZmFsbGJhY2spXHJcbiAgICovXHJcbiAgc3RhdGljIGNvdW50U2VudGVuY2VzKHRleHQ6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgICBjb25zdCBzZW50ZW5jZXMgPSB0ZXh0Lm1hdGNoKC9bXi4hP10rWy4hP10rL2cpIHx8IFt0ZXh0XTtcclxuICAgIHJldHVybiBzZW50ZW5jZXMubGVuZ3RoO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGEgaHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2YgYSB2ZXJib3NpdHkgbGV2ZWxcclxuICAgKi9cclxuICBzdGF0aWMgZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5OiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0Q29uZmlnKHZlcmJvc2l0eSkuZGVzY3JpcHRpb247XHJcbiAgfVxyXG59XHJcblxyXG4iXX0=