/**
 * Message Processor
 *
 * Handles the three-request architecture for processing user messages:
 * 1. Intent Detection & Context Analysis
 * 2. Conversational Response Generation
 * 3. Follow-Up Generation (Verification or Goal Question)
 */
import { ChatBedrockConverse } from '@langchain/aws';
import { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { AgentPersona } from '../config/personas.js';
import type { CompanyInfo } from './persona-service.js';
import type { GoalOrchestrationResult } from './goal-orchestrator.js';
import { type EffectiveGoalConfig } from './goal-config-helper.js';
import { ActionTagProcessor } from './action-tag-processor.js';
import { EventBridgeService } from './eventbridge.js';
declare const IntentDetectionSchema: z.ZodObject<{
    primaryIntent: z.ZodEnum<["company_info_request", "workflow_data_capture", "general_conversation", "objection", "scheduling", "end_conversation", "unknown"]>;
    extractedData: z.ZodNullable<z.ZodArray<z.ZodObject<{
        field: z.ZodEnum<["email", "phone", "firstName", "lastName", "gender", "primaryGoal", "motivationReason", "motivationCategories", "timeline", "height", "weight", "bodyFatPercentage", "injuries", "medicalConditions", "physicalLimitations", "doctorClearance", "preferredDate", "preferredTime", "normalizedDateTime", "wrong_phone", "wrong_email"]>;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        field: "email" | "phone" | "firstName" | "lastName" | "timeline" | "gender" | "primaryGoal" | "motivationReason" | "motivationCategories" | "height" | "weight" | "bodyFatPercentage" | "injuries" | "medicalConditions" | "physicalLimitations" | "doctorClearance" | "preferredDate" | "preferredTime" | "normalizedDateTime" | "wrong_phone" | "wrong_email";
    }, {
        value: string;
        field: "email" | "phone" | "firstName" | "lastName" | "timeline" | "gender" | "primaryGoal" | "motivationReason" | "motivationCategories" | "height" | "weight" | "bodyFatPercentage" | "injuries" | "medicalConditions" | "physicalLimitations" | "doctorClearance" | "preferredDate" | "preferredTime" | "normalizedDateTime" | "wrong_phone" | "wrong_email";
    }>, "many">>;
    detectedWorkflowIntent: z.ZodNullable<z.ZodUnion<[z.ZodLiteral<"email">, z.ZodLiteral<"phone">, z.ZodLiteral<"firstName">, z.ZodLiteral<"lastName">, z.ZodLiteral<"gender">, z.ZodLiteral<"primaryGoal">, z.ZodLiteral<"motivationReason">, z.ZodLiteral<"motivationCategories">, z.ZodLiteral<"timeline">, z.ZodLiteral<"height">, z.ZodLiteral<"weight">, z.ZodLiteral<"bodyFatPercentage">, z.ZodLiteral<"injuries">, z.ZodLiteral<"medicalConditions">, z.ZodLiteral<"physicalLimitations">, z.ZodLiteral<"doctorClearance">, z.ZodLiteral<"preferredDate">, z.ZodLiteral<"preferredTime">, z.ZodLiteral<"normalizedDateTime">, z.ZodLiteral<"wrong_phone">, z.ZodLiteral<"wrong_email">, z.ZodNull]>>;
    extractedValue: z.ZodNullable<z.ZodString>;
    companyInfoRequested: z.ZodNullable<z.ZodArray<z.ZodEnum<["hours", "pricing", "plans", "promotions", "location", "services", "staff", "contact", "website", "email", "phone", "address"]>, "many">>;
    requiresDeepContext: z.ZodBoolean;
    conversationComplexity: z.ZodEnum<["simple", "moderate", "complex"]>;
    detectedEmotionalTone: z.ZodNullable<z.ZodEnum<["positive", "neutral", "negative", "frustrated", "urgent"]>>;
    interestLevel: z.ZodNumber;
    conversionLikelihood: z.ZodNumber;
    languageProfile: z.ZodObject<{
        formality: z.ZodNumber;
        hypeTolerance: z.ZodNumber;
        emojiUsage: z.ZodNumber;
        language: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        language: string;
        formality: number;
        hypeTolerance: number;
        emojiUsage: number;
    }, {
        language: string;
        formality: number;
        hypeTolerance: number;
        emojiUsage: number;
    }>;
}, "strip", z.ZodTypeAny, {
    interestLevel: number;
    primaryIntent: "scheduling" | "unknown" | "company_info_request" | "workflow_data_capture" | "general_conversation" | "objection" | "end_conversation";
    extractedData: {
        value: string;
        field: "email" | "phone" | "firstName" | "lastName" | "timeline" | "gender" | "primaryGoal" | "motivationReason" | "motivationCategories" | "height" | "weight" | "bodyFatPercentage" | "injuries" | "medicalConditions" | "physicalLimitations" | "doctorClearance" | "preferredDate" | "preferredTime" | "normalizedDateTime" | "wrong_phone" | "wrong_email";
    }[] | null;
    detectedWorkflowIntent: "email" | "phone" | "firstName" | "lastName" | "timeline" | "gender" | "primaryGoal" | "motivationReason" | "motivationCategories" | "height" | "weight" | "bodyFatPercentage" | "injuries" | "medicalConditions" | "physicalLimitations" | "doctorClearance" | "preferredDate" | "preferredTime" | "normalizedDateTime" | "wrong_phone" | "wrong_email" | null;
    extractedValue: string | null;
    companyInfoRequested: ("email" | "phone" | "pricing" | "services" | "hours" | "location" | "address" | "promotions" | "contact" | "plans" | "staff" | "website")[] | null;
    requiresDeepContext: boolean;
    conversationComplexity: "moderate" | "simple" | "complex";
    detectedEmotionalTone: "positive" | "negative" | "neutral" | "urgent" | "frustrated" | null;
    conversionLikelihood: number;
    languageProfile: {
        language: string;
        formality: number;
        hypeTolerance: number;
        emojiUsage: number;
    };
}, {
    interestLevel: number;
    primaryIntent: "scheduling" | "unknown" | "company_info_request" | "workflow_data_capture" | "general_conversation" | "objection" | "end_conversation";
    extractedData: {
        value: string;
        field: "email" | "phone" | "firstName" | "lastName" | "timeline" | "gender" | "primaryGoal" | "motivationReason" | "motivationCategories" | "height" | "weight" | "bodyFatPercentage" | "injuries" | "medicalConditions" | "physicalLimitations" | "doctorClearance" | "preferredDate" | "preferredTime" | "normalizedDateTime" | "wrong_phone" | "wrong_email";
    }[] | null;
    detectedWorkflowIntent: "email" | "phone" | "firstName" | "lastName" | "timeline" | "gender" | "primaryGoal" | "motivationReason" | "motivationCategories" | "height" | "weight" | "bodyFatPercentage" | "injuries" | "medicalConditions" | "physicalLimitations" | "doctorClearance" | "preferredDate" | "preferredTime" | "normalizedDateTime" | "wrong_phone" | "wrong_email" | null;
    extractedValue: string | null;
    companyInfoRequested: ("email" | "phone" | "pricing" | "services" | "hours" | "location" | "address" | "promotions" | "contact" | "plans" | "staff" | "website")[] | null;
    requiresDeepContext: boolean;
    conversationComplexity: "moderate" | "simple" | "complex";
    detectedEmotionalTone: "positive" | "negative" | "neutral" | "urgent" | "frustrated" | null;
    conversionLikelihood: number;
    languageProfile: {
        language: string;
        formality: number;
        hypeTolerance: number;
        emojiUsage: number;
    };
}>;
export type IntentDetectionResult = z.infer<typeof IntentDetectionSchema>;
export interface MessageProcessorConfig {
    model: ChatBedrockConverse;
    persona: AgentPersona;
    companyInfo?: CompanyInfo;
    actionTagProcessor: ActionTagProcessor;
}
export interface ProcessingContext {
    userMessage: string;
    messages: BaseMessage[];
    goalResult: GoalOrchestrationResult | null;
    effectiveGoalConfig: EffectiveGoalConfig;
    channelState?: any;
    onDataExtracted?: (extractedData: Record<string, any>, goalResult: GoalOrchestrationResult | null, userMessage?: string) => Promise<void>;
    tenantId?: string;
    channelId?: string;
    messageSource?: string;
}
export interface ProcessingResult {
    response: string;
    followUpQuestion?: string;
    intentDetectionResult: IntentDetectionResult | null;
    preExtractedData: Record<string, any>;
}
/**
 * Processes user messages through a three-request architecture
 */
export declare class MessageProcessor {
    private model;
    private persona;
    private companyInfo?;
    private actionTagProcessor;
    private eventBridgeService?;
    private tenantId?;
    private channelId?;
    private messageSource?;
    constructor(config: MessageProcessorConfig & {
        eventBridgeService?: EventBridgeService;
    });
    /**
     * Get identity enforcement prefix for ALL user-facing LLM calls
     * This prevents Claude from breaking character
     */
    private getIdentityEnforcement;
    /**
     * Emit chat presence event (received, read, typing, stoppedTyping)
     */
    private emitPresenceEvent;
    /**
     * Extract and emit token usage from LLM response
     */
    private emitTokenUsage;
    /**
     * Calculate estimated cost in USD based on model and token counts
     * Pricing as of Dec 2024 (per 1K tokens):
     * - Claude 3.5 Sonnet: Input $0.003, Output $0.015
     * - Claude 3 Sonnet: Input $0.003, Output $0.015
     * - Claude 3 Haiku: Input $0.00025, Output $0.00125
     * - Claude 3 Opus: Input $0.015, Output $0.075
     */
    private calculateTokenCost;
    /**
     * Main processing method - orchestrates the three-request architecture
     */
    process(context: ProcessingContext): Promise<ProcessingResult>;
    /**
     * REQUEST #1: Detect user intent and determine context requirements
     */
    private performIntentDetection;
    /**
     * REQUEST #2: Generate natural conversational response
     */
    private generateConversationalResponse;
    /**
     * REQUEST #3: Generate follow-up (verification message or goal question)
     */
    private generateFollowUp;
    /**
     * Generate engagement question for first message (to keep conversation flowing)
     */
    private generateEngagementQuestion;
    /**
     * Generate error recovery message when user says contact info was wrong
     */
    private generateErrorRecoveryMessage;
    /**
     * Validate email format
     */
    private isValidEmail;
    /**
     * Validate phone format (must contain digits)
     */
    private isValidPhone;
    /**
     * Generate verification message when contact info is captured
     */
    private generateVerificationMessage;
    /**
     * Generate exit message when user is ending conversation
     * - If primary goal achieved: Warm farewell with appointment confirmation
     * - If primary goal NOT achieved: Gentle last-ditch attempt
     */
    private generateExitMessage;
    /**
     * Generate goal-driven question
     */
    private generateGoalQuestion;
    /**
     * Build intent detection prompt
     */
    private buildIntentDetectionPrompt;
    /**
     * Detect likely gender from first name for gender-aware language
     */
    private detectGenderFromName;
    /**
     * Get gender-aware language rule based on channelState
     * Returns appropriate instruction for LLM based on known/unknown gender
     */
    private getGenderLanguageRule;
    /**
     * Build system prompt for conversational response
     */
    private buildSystemPrompt;
}
export {};
