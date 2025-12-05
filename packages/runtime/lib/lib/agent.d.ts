import { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { DynamoDBService } from './dynamodb.js';
import { EventBridgeService } from './eventbridge.js';
import { type CompanyInfo } from './persona-service.js';
import { type ResponseChunk } from './response-chunker.js';
import { IntentActionRegistry } from './intent-action-registry.js';
import { PersonaStorage } from './persona-storage.js';
import type { AgentContext, RuntimeConfig, MessageSource, AgentResponse } from '../types/index.js';
declare const SentenceListSchema: z.ZodObject<{
    sentences: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    sentences: string[];
}, {
    sentences: string[];
}>;
export type SentenceList = z.infer<typeof SentenceListSchema>;
declare const IntentDetectionSchema: z.ZodObject<{
    primaryIntent: z.ZodEnum<["company_info_request", "workflow_data_capture", "general_conversation", "objection", "scheduling", "complaint", "question"]>;
    detectedWorkflowIntent: z.ZodNullable<z.ZodString>;
    companyInfoRequested: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    requiresDeepContext: z.ZodBoolean;
    conversationComplexity: z.ZodEnum<["simple", "moderate", "complex"]>;
    detectedEmotionalTone: z.ZodOptional<z.ZodEnum<["positive", "neutral", "frustrated", "urgent"]>>;
}, "strip", z.ZodTypeAny, {
    primaryIntent: "scheduling" | "company_info_request" | "workflow_data_capture" | "general_conversation" | "objection" | "complaint" | "question";
    detectedWorkflowIntent: string | null;
    companyInfoRequested: string[] | null;
    requiresDeepContext: boolean;
    conversationComplexity: "moderate" | "simple" | "complex";
    detectedEmotionalTone?: "positive" | "neutral" | "urgent" | "frustrated" | undefined;
}, {
    primaryIntent: "scheduling" | "company_info_request" | "workflow_data_capture" | "general_conversation" | "objection" | "complaint" | "question";
    detectedWorkflowIntent: string | null;
    companyInfoRequested: string[] | null;
    requiresDeepContext: boolean;
    conversationComplexity: "moderate" | "simple" | "complex";
    detectedEmotionalTone?: "positive" | "neutral" | "urgent" | "frustrated" | undefined;
}>;
export type IntentDetectionResult = z.infer<typeof IntentDetectionSchema>;
export interface AgentServiceConfig extends RuntimeConfig {
    dynamoService?: DynamoDBService;
    eventBridgeService?: EventBridgeService;
    personaId?: string;
    persona?: any;
    intentActionRegistry?: IntentActionRegistry;
    personaStorage?: PersonaStorage;
    companyInfo?: CompanyInfo;
}
/**
 * LangChain agent service that processes messages and generates responses
 */
export declare class AgentService {
    private config;
    private model;
    private persona;
    private personaService?;
    private intentService;
    private goalOrchestrator;
    private actionTagProcessor;
    private intentActionRegistry;
    private personaStorage?;
    private channelStateService?;
    private messageTrackingService?;
    constructor(config: AgentServiceConfig);
    /**
     * 🏢 Build selective company info section (only requested fields)
     */
    private buildSelectiveCompanyInfo;
    /**
     * 🎯 REQUEST #1: Detect intent and determine context needs
     */
    /**
     * Process an agent context and generate a response
     * @param context - The agent context
     * @param existingHistory - Optional chat history (for CLI/local use)
     */
    processMessage(context: AgentContext, existingHistory?: BaseMessage[]): Promise<{
        response: string;
        followUpQuestion?: string;
    }>;
    /**
     * Process an agent context and generate chunked responses
     */
    processMessageChunked(context: AgentContext): Promise<ResponseChunk[]>;
    /**
     * Create prompt template based on tenant and context
     */
    private createPromptTemplate;
    /**
     * Get system prompt based on persona and context
     */
    private getSystemPrompt;
    /**
     * Process message and return structured response with metadata
     */
    processMessageStructured(context: AgentContext): Promise<AgentResponse>;
    /**
     * Helper: Get required field names from goal (supports both old and new formats)
     */
    private getRequiredFieldNames;
    /**
     * Helper: Get ALL field names from goal (not just required)
     */
    private getFieldNamesForGoal;
    /**
     * Detect gender from first name
     */
    private detectGenderFromName;
    /**
     * Determine preferred channel for response based on context and tenant preferences
     */
    determinePreferredChannel(context: AgentContext, tenantPreferences?: Record<string, any>): MessageSource;
    /**
     * Create routing information for the response
     */
    createRoutingInfo(context: AgentContext, preferredChannel: MessageSource): {
        sms?: {
            to: string;
        };
        email?: {
            to: string;
        };
        chat?: {
            sessionId: string;
        };
    };
    /**
     * Infer interest level from intent when LLM doesn't provide it
     */
    private inferInterestLevel;
    /**
     * Infer conversion likelihood from intent when LLM doesn't provide it
     */
    private inferConversionLikelihood;
}
export {};
