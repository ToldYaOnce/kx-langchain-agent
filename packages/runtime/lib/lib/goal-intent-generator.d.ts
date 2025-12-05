/**
 * @fileoverview
 * Automatically generates LangChain intents from goal configurations.
 * Allows the LLM to detect and extract data based on conversation goals.
 */
import { z } from 'zod';
export interface GoalIntent {
    intentId: string;
    goalId: string;
    fieldName: string;
    description: string;
    extractionSchema: z.ZodType<any>;
}
export interface IntentDetectionResult {
    detectedIntents: {
        intentId: string;
        goalId: string;
        fieldName: string;
        extractedValue: any;
        confidence: number;
    }[];
}
/**
 * Generate intents from goal configuration
 */
export declare function generateIntentsFromGoals(goalConfig: any): GoalIntent[];
/**
 * Generate system prompt section for intent monitoring
 */
export declare function generateIntentMonitoringPrompt(intents: GoalIntent[]): string;
/**
 * Create extraction schema for all active intents
 */
export declare function createExtractionSchema(intents: GoalIntent[]): z.ZodObject<any>;
/**
 * Build LLM extraction prompt
 */
export declare function buildExtractionPrompt(userMessage: string, conversationHistory: string[], intents: GoalIntent[]): string;
