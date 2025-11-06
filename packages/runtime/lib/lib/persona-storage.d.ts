/**
 * @fileoverview
 * Persona Storage Service - Handles loading personas from DynamoDB or fallback sources
 *
 * This decouples persona management from the static personas.json file, allowing
 * consumers to store and manage personas in DynamoDB while using personas.json
 * as a fallback or reference implementation.
 *
 * @example
 * ```typescript
 * const storage = new PersonaStorage({
 *   dynamoService,
 *   fallbackPersonas: defaultPersonas, // from personas.json
 * });
 *
 * // Load persona (tries DynamoDB first, then fallback)
 * const persona = await storage.getPersona('tenant123', 'carlos');
 *
 * // Save persona to DynamoDB
 * await storage.savePersona('tenant123', 'carlos', personaConfig);
 * ```
 */
import type { DynamoDBService } from './dynamodb.js';
import type { AgentPersona } from '../config/personas.js';
/**
 * Configuration for persona storage
 */
export interface PersonaStorageConfig {
    /** DynamoDB service instance */
    dynamoService?: DynamoDBService;
    /** Fallback personas (e.g., from personas.json) */
    fallbackPersonas?: Record<string, AgentPersona>;
    /** Default persona ID to use if none specified */
    defaultPersonaId?: string;
    /** Cache TTL in milliseconds */
    cacheTtl?: number;
    /** Whether to enable caching */
    enableCache?: boolean;
}
/**
 * Persona query options
 */
export interface PersonaQueryOptions {
    /** Include archived personas */
    includeArchived?: boolean;
    /** Include template personas */
    includeTemplates?: boolean;
    /** Limit number of results */
    limit?: number;
}
/**
 * Service for loading and managing personas from DynamoDB with fallback support
 */
export declare class PersonaStorage {
    private config;
    private cache;
    constructor(config: PersonaStorageConfig);
    /**
     * Get a persona by tenant and persona ID
     *
     * @param tenantId Tenant identifier
     * @param personaId Persona identifier (optional, uses default if not provided)
     * @returns Persona configuration or null if not found
     */
    getPersona(tenantId: string, personaId?: string): Promise<AgentPersona | null>;
    /**
     * Save a persona to DynamoDB
     *
     * @param tenantId Tenant identifier
     * @param personaId Persona identifier
     * @param persona Persona configuration
     * @param options Save options
     */
    savePersona(tenantId: string, personaId: string, persona: AgentPersona, options?: {
        status?: 'active' | 'draft' | 'archived';
        isTemplate?: boolean;
        templateCategory?: string;
        createdBy?: string;
    }): Promise<void>;
    /**
     * List personas for a tenant
     *
     * @param tenantId Tenant identifier
     * @param options Query options
     * @returns Array of persona configurations with metadata
     */
    listPersonas(tenantId: string, options?: PersonaQueryOptions): Promise<Array<{
        personaId: string;
        persona: AgentPersona;
        status: string;
        isTemplate: boolean;
        createdAt: string;
        updatedAt: string;
    }>>;
    /**
     * Delete a persona from DynamoDB
     *
     * @param tenantId Tenant identifier
     * @param personaId Persona identifier
     */
    deletePersona(tenantId: string, personaId: string): Promise<void>;
    /**
     * Clear cache for a specific tenant or all cache
     *
     * @param tenantId Optional tenant ID to clear cache for
     */
    clearCache(tenantId?: string): void;
    /**
     * Load persona from DynamoDB
     */
    private loadPersonaFromDynamoDB;
    /**
     * Save persona to DynamoDB
     */
    private savePersonaToDynamoDB;
    /**
     * Get persona from DynamoDB
     */
    private getPersonaFromDynamoDB;
    /**
     * List personas from DynamoDB
     */
    private listPersonasFromDynamoDB;
    /**
     * Delete persona from DynamoDB
     */
    private deletePersonaFromDynamoDB;
    /**
     * Convert DynamoDB PersonaConfig to AgentPersona
     */
    private convertPersonaConfigToAgentPersona;
    /**
     * Convert AgentPersona to DynamoDB PersonaConfig
     */
    private convertAgentPersonaToPersonaConfig;
}
/**
 * Factory function to create a persona storage instance with common configurations
 */
export declare function createPersonaStorage(config: {
    dynamoService?: DynamoDBService;
    fallbackPersonasPath?: string;
    defaultPersonaId?: string;
    enableCache?: boolean;
}): PersonaStorage;
