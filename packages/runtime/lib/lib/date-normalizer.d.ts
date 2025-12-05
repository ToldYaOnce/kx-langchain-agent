/**
 * Date Normalizer Module
 *
 * Provides context and utilities for normalizing relative dates/times
 * into ISO 8601 format. Used by intent detection to convert
 * "Monday at 6" → "2025-12-09T18:00:00"
 */
export interface DateContext {
    today: string;
    dayOfWeek: string;
    timezone?: string;
    businessHours?: {
        openTime?: string;
        closeTime?: string;
    };
}
export interface NormalizationPromptConfig {
    includeExamples?: boolean;
    businessContext?: 'fitness' | 'medical' | 'general';
}
/**
 * Get current date context for LLM prompts
 */
export declare function getDateContext(timezone?: string): DateContext;
/**
 * Build the date normalization section for intent detection prompt
 */
export declare function buildDateNormalizationPrompt(config?: NormalizationPromptConfig): string;
/**
 * Validate an ISO datetime string
 */
export declare function isValidISODateTime(dateTimeStr: string | null | undefined): boolean;
/**
 * Parse a normalized datetime and return a Date object
 */
export declare function parseNormalizedDateTime(dateTimeStr: string): Date | null;
/**
 * Format a Date for display
 */
export declare function formatForDisplay(date: Date, options?: {
    includeTime?: boolean;
    includeDay?: boolean;
}): string;
