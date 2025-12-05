/**
 * Example: Using the new API-based persona loading in the agent
 * This shows how to migrate from personas.json to the new API structure
 */
import { AgentService } from '../lib/agent.js';
export declare class ApiPersonaAgentService extends AgentService {
    private personaLoader;
    constructor(config: any, personaApiConfig?: any);
    /**
     * Override the persona loading to use API instead of personas.json
     */
    loadPersonaForTenant(tenantId: string, personaId?: string): Promise<any>;
    /**
     * Process message with API-loaded persona
     */
    processMessageWithApiPersona(params: {
        tenantId: string;
        email_lc: string;
        text: string;
        source: 'sms' | 'email' | 'chat' | 'api' | 'agent';
        personaId?: string;
    }): Promise<{
        response: string;
        followUpQuestion?: string;
    }>;
    private getDefaultPersona;
}
/**
 * Factory function to create an agent with API persona loading
 */
export declare function createApiPersonaAgent(config: {
    messagesTable: string;
    leadsTable: string;
    bedrockModelId: string;
    outboundEventBusName?: string;
    managementApiUrl: string;
    apiTimeout?: number;
    apiAuthToken?: string;
}): ApiPersonaAgentService;
/**
 * Example usage in a Lambda handler
 */
export declare function exampleLambdaHandler(event: any, context: any): Promise<{
    response: string;
    followUpQuestion?: string;
}>;
