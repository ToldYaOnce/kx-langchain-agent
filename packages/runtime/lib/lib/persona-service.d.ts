import { DynamoDBService } from './dynamodb.js';
import type { AgentPersona, ResponseChunking, GreetingConfig } from '../config/personas.js';
export interface Promotion {
    id: string;
    title: string;
    description: string;
    urgencyMessage?: string;
    discount?: string;
    validUntil: string;
    conditions?: string[];
    applicablePlans?: string[];
}
export interface PricingPlan {
    id: string;
    name: string;
    price: string;
    description?: string;
    features: string[];
    popular?: boolean;
    cta?: string;
}
export interface CompanyInfo {
    name?: string;
    industry?: string;
    description?: string;
    products?: string;
    services?: string[];
    benefits?: string;
    targetCustomers?: string;
    differentiators?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
    };
    businessHours?: {
        monday?: Array<{
            from: string;
            to: string;
        }>;
        tuesday?: Array<{
            from: string;
            to: string;
        }>;
        wednesday?: Array<{
            from: string;
            to: string;
        }>;
        thursday?: Array<{
            from: string;
            to: string;
        }>;
        friday?: Array<{
            from: string;
            to: string;
        }>;
        saturday?: Array<{
            from: string;
            to: string;
        }>;
        sunday?: Array<{
            from: string;
            to: string;
        }>;
    };
    pricing?: {
        plans: PricingPlan[];
        customPricingAvailable?: boolean;
        contactForPricing?: boolean;
    };
    promotions?: Promotion[];
    goalConfiguration?: any;
    responseGuidelines?: {
        contactPolicy?: {
            allowBasicInfoWithoutContact?: boolean;
            requireContactForDetails?: boolean;
        };
        informationCategories?: Array<{
            id: string;
            label: string;
            column: 'always' | 'require' | 'never';
        }>;
        sharingPermissions?: {
            alwaysAllowed?: string[];
            requiresContact?: string[];
            neverShare?: string[];
            defaultPermission?: 'always_allowed' | 'contact_required' | 'never_share';
            allowedValues?: string[];
            default?: string;
            overrides?: Record<string, string>;
        };
    };
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
     * Get default persona from JSON config
     */
    getDefaultPersona(personaId: string, companyInfo?: CompanyInfo): AgentPersona;
    /**
     * Convert PersonaItem to AgentPersona
     */
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
