import { AgentPersona } from '../config/personas';
import { type CompanyInfo } from './persona-service.js';
export interface IntentTrigger {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    patterns: string[];
    priority: 'high' | 'medium' | 'low';
    response: {
        type: 'template' | 'conversational';
        template: string;
        followUp?: string[];
    };
    actions: string[];
}
export interface IntentCapturing {
    enabled: boolean;
    intents: IntentTrigger[];
    fallbackIntent: {
        id: string;
        name: string;
        description: string;
        response: {
            type: 'template' | 'conversational';
            template: string;
        };
        actions: string[];
    };
    confidence: {
        threshold: number;
        multipleIntentHandling: 'highest_confidence' | 'all' | 'first_match';
    };
}
export interface IntentMatch {
    intent: IntentTrigger;
    confidence: number;
    matchedTriggers: string[];
    matchedPatterns: string[];
    response: string;
    followUp?: string[];
    actions: string[];
}
export interface IntentAnalytics {
    intentId: string;
    tenantId: string;
    userId: string;
    message: string;
    confidence: number;
    timestamp: string;
    sessionId?: string;
    channel?: string;
}
export declare class IntentService {
    private analytics;
    private operationalService;
    constructor();
    /**
     * Detects user intent from a message using the persona's intent configuration
     */
    detectIntent(message: string, persona: AgentPersona, companyInfo: CompanyInfo, context?: {
        tenantId?: string;
        userId?: string;
        sessionId?: string;
        channel?: string;
    }): Promise<IntentMatch | null>;
    /**
     * Generate response based on intent type (template or operational)
     */
    private generateResponse;
    /**
     * Generate operational response with live data
     */
    private generateOperationalResponse;
    /**
     * Format time for display
     */
    private formatTime;
    /**
     * Substitutes template variables with company information
     */
    private substituteTemplate;
    /**
     * Tracks intent analytics for reporting and optimization
     */
    private trackIntent;
    /**
     * Gets intent analytics for a tenant
     */
    getAnalytics(tenantId: string, options?: {
        startDate?: string;
        endDate?: string;
        intentId?: string;
        channel?: string;
    }): IntentAnalytics[];
    /**
     * Gets intent statistics for optimization
     */
    getIntentStats(tenantId: string): Record<string, {
        count: number;
        averageConfidence: number;
        channels: Record<string, number>;
    }>;
}
