import type { AgentReplyEvent, AgentErrorEvent, AgentTraceEvent, RuntimeConfig } from '../types/index.js';
export declare class EventBridgeService {
    private client;
    private config;
    constructor(config: RuntimeConfig);
    /**
     * Publish agent reply event to the injected EventBridge bus
     */
    publishAgentReply(event: AgentReplyEvent): Promise<void>;
    /**
     * Publish agent error event
     */
    publishAgentError(event: AgentErrorEvent): Promise<void>;
    /**
     * Publish agent trace event for telemetry
     */
    publishAgentTrace(event: AgentTraceEvent): Promise<void>;
    /**
     * Publish a custom event to EventBridge
     */
    publishCustomEvent(source: string, detailType: string, detail: any): Promise<void>;
    /**
     * Generic event publisher
     */
    private publishEvent;
    /**
     * Create agent reply event
     */
    static createAgentReplyEvent(tenantId: string, contactPk: string, text: string, preferredChannel: 'sms' | 'email' | 'chat' | 'api', routing: {
        sms?: {
            to: string;
        };
        email?: {
            to: string;
        };
        chat?: {
            sessionId: string;
        };
    }, options?: {
        conversationId?: string;
        metadata?: Record<string, any>;
    }): AgentReplyEvent;
    /**
     * Create agent error event
     */
    static createAgentErrorEvent(tenantId: string, error: string, options?: {
        contactPk?: string;
        stack?: string;
        context?: Record<string, any>;
    }): AgentErrorEvent;
    /**
     * Create agent trace event
     */
    static createAgentTraceEvent(tenantId: string, operation: string, options?: {
        contactPk?: string;
        durationMs?: number;
        metadata?: Record<string, any>;
    }): AgentTraceEvent;
    /**
     * Publish LLM usage event for cost tracking
     */
    publishLLMUsage(usage: LLMUsageEvent): Promise<void>;
}
/**
 * LLM Usage Event for cost tracking
 */
export interface LLMUsageEvent {
    /** Tenant identifier */
    tenantId: string;
    /** Channel/conversation identifier */
    channelId?: string;
    /** Message source (chat, sms, email, etc.) */
    source: string;
    /** Type of LLM request */
    requestType: 'intent_detection' | 'conversational_response' | 'follow_up_question' | 'verification_message' | 'error_recovery' | 'engagement_question';
    /** Model identifier */
    model: string;
    /** Input tokens consumed */
    inputTokens: number;
    /** Output tokens generated */
    outputTokens: number;
    /** Total tokens (input + output) */
    totalTokens: number;
    /** Timestamp */
    timestamp: string;
    /** Optional: Estimated cost in USD (if rate available) */
    estimatedCostUsd?: number;
}
