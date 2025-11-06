import { BaseMessage } from '@langchain/core/messages';
import { DynamoDBService } from './dynamodb.js';
import { EventBridgeService } from './eventbridge.js';
import { type CompanyInfo } from './persona-service.js';
import { type ResponseChunk } from './response-chunker.js';
import { IntentActionRegistry } from './intent-action-registry.js';
import { PersonaStorage } from './persona-storage.js';
import type { AgentContext, RuntimeConfig, MessageSource, AgentResponse } from '../types/index.js';
export interface AgentServiceConfig extends RuntimeConfig {
    dynamoService?: DynamoDBService;
    eventBridgeService?: EventBridgeService;
    personaId?: string;
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
    constructor(config: AgentServiceConfig);
    /**
     * Process an agent context and generate a response
     * @param context - The agent context
     * @param existingHistory - Optional chat history (for CLI/local use)
     */
    processMessage(context: AgentContext, existingHistory?: BaseMessage[]): Promise<string>;
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
}
