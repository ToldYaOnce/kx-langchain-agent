import { CompanyInfo } from '../models/company-info.js';
import { Persona } from '../models/personas.js';
export interface ChatMessage {
    conversationId: string;
    timestamp: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: any;
}
export interface CompanyPersonaResponse {
    tenantId: string;
    companyInfo: CompanyInfo;
    persona: Persona;
    compiledPersona: {
        name: string;
        personality: any;
        greetings: any;
        responseChunking: any;
        goalConfiguration: any;
        actionTags: any;
    };
    chatHistory?: ChatMessage[];
}
/**
 * Service for retrieving combined Company + Persona data
 * Aggregates company information with persona configuration and interpolates templates
 */
export declare class CompanyPersonaService {
    constructor();
    /**
     * Load chat history from DynamoDB Messages table
     */
    loadChatHistory(channelId: string, limit?: number): Promise<ChatMessage[]>;
    /**
     * Get company info + specific persona
     */
    getCompanyPersona(event: any): Promise<any>;
    /**
     * Get company info + random persona
     */
    getCompanyRandomPersona(event: any): Promise<any>;
    /**
     * Helper method to interpolate company details into persona templates
     */
    private interpolatePersonaTemplates;
}
