import { DynamoDBService } from './dynamodb.js';
import type { AgentPersona, ResponseChunking, GreetingConfig } from '../config/personas.js';
export interface CompanyInfo {
    name?: string;
    industry?: string;
    description?: string;
    products?: string;
    benefits?: string;
    targetCustomers?: string;
    differentiators?: string;
}
export interface PersonaItem {
    PK: string;
    SK: string;
    personaId: string;
    tenantId: string;
    name: string;
    description: string;
    systemPrompt: string;
    personality: {
        tone: string;
        style: string;
        languageQuirks?: string[];
        specialBehaviors?: string[];
    };
    responseGuidelines: string[];
    greetings?: GreetingConfig;
    responseChunking?: ResponseChunking;
    intentCapturing?: any;
    metadata: {
        createdAt: string;
        updatedAt: string;
        version: string;
        tags?: string[];
    };
    isActive: boolean;
}
/**
 * Service for managing agent personas in DynamoDB
 */
export declare class PersonaService {
    private dynamoService;
    constructor(dynamoService: DynamoDBService | null);
    /**
     * Get persona for a tenant (falls back to default if not found)
     */
    getPersona(tenantId: string, personaId: string, companyInfo?: CompanyInfo): Promise<AgentPersona>;
    /**
     * Get tenant-specific persona from DynamoDB
     * TODO: Implement when DynamoDB methods are available
     */
    getTenantPersona(tenantId: string, personaId: string): Promise<PersonaItem | null>;
    /**
     * List all personas for a tenant
     * TODO: Implement when DynamoDB methods are available
     */
    listTenantPersonas(tenantId: string): Promise<PersonaItem[]>;
    /**
     * Create or update a persona for a tenant
     * TODO: Implement when DynamoDB methods are available
     */
    putPersona(tenantId: string, personaData: Omit<PersonaItem, 'PK' | 'SK' | 'tenantId'>): Promise<void>;
    /**
     * Delete a persona for a tenant (soft delete)
     * TODO: Implement when DynamoDB methods are available
     */
    deletePersona(tenantId: string, personaId: string): Promise<void>;
    /**
     * Initialize default personas for a tenant
     */
    initializeDefaultPersonas(tenantId: string): Promise<void>;
    /**
     * Get default persona from JSON config
     */
    getDefaultPersona(personaId: string, companyInfo?: CompanyInfo): AgentPersona;
    /**
     * Convert PersonaItem to AgentPersona
     */
    private convertToAgentPersona;
    /**
     * Create DynamoDB partition key for personas
     */
    private createPersonaPK;
    /**
     * List available default personas
     */
    static listDefaultPersonas(): Array<{
        id: string;
        name: string;
        description: string;
    }>;
}
//# sourceMappingURL=persona-service.d.ts.map