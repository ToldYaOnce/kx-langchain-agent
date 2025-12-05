interface Timing {
    read_ms: number;
    comprehension_ms: number;
    write_ms: number;
    type_ms: number;
    jitter_ms: number;
    pauses_ms?: number;
    total_ms: number;
}
import { AgentService } from "../lib/agent";
import { RuntimeConfig } from "../types/index";
/**
 * Enhanced Agent Service that integrates delayed human-like responses
 */
export declare class DelayedResponseAgentService extends AgentService {
    private releaseQueueUrl;
    constructor(config: RuntimeConfig, releaseQueueUrl: string);
    /**
     * Process message with delayed response scheduling
     * This replaces the immediate agent.reply.created emission
     */
    processMessageWithDelayedResponse(params: {
        tenantId: string;
        email_lc?: string;
        phone_e164?: string;
        text: string;
        source: 'sms' | 'email' | 'chat' | 'api';
        conversation_id?: string;
        message_id?: string;
        personaName?: 'Carlos' | 'Alex' | 'Sam';
    }): Promise<{
        success: boolean;
        timing: Timing;
        message: string;
    }>;
    /**
     * Emergency bypass for immediate responses (human takeover, urgent messages)
     */
    processMessageImmediate(params: {
        tenantId: string;
        email_lc?: string;
        phone_e164?: string;
        text: string;
        source: 'sms' | 'email' | 'chat' | 'api';
        reason?: string;
    }): Promise<{
        response: string;
        followUpQuestion?: string;
    }>;
}
/**
 * Factory function for creating delayed response agent
 */
export declare function createDelayedResponseAgent(config: RuntimeConfig, releaseQueueUrl: string): DelayedResponseAgentService;
/**
 * Lambda handler that uses delayed responses
 */
export declare function delayedResponseHandler(event: any): Promise<{
    response: string;
    followUpQuestion?: string;
} | {
    success: boolean;
    timing: Timing;
    message: string;
}>;
export {};
