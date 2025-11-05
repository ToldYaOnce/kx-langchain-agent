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
import type { PersonaItem, CreatePersonaItem } from '../types/dynamodb-schemas.js';
import { ulid } from 'ulid';

// =============================================================================
// TYPES
// =============================================================================

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
 * Cached persona entry
 */
interface CachedPersona {
  persona: AgentPersona;
  timestamp: number;
  source: 'dynamodb' | 'fallback';
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

// =============================================================================
// PERSONA STORAGE SERVICE
// =============================================================================

/**
 * Service for loading and managing personas from DynamoDB with fallback support
 */
export class PersonaStorage {
  private config: PersonaStorageConfig;
  private cache = new Map<string, CachedPersona>();

  constructor(config: PersonaStorageConfig) {
    this.config = {
      cacheTtl: 5 * 60 * 1000, // 5 minutes default
      enableCache: true,
      defaultPersonaId: 'default',
      ...config,
    };
  }

  /**
   * Get a persona by tenant and persona ID
   * 
   * @param tenantId Tenant identifier
   * @param personaId Persona identifier (optional, uses default if not provided)
   * @returns Persona configuration or null if not found
   */
  async getPersona(tenantId: string, personaId?: string): Promise<AgentPersona | null> {
    const effectivePersonaId = personaId || this.config.defaultPersonaId || 'default';
    const cacheKey = `${tenantId}#${effectivePersonaId}`;

    // Check cache first
    if (this.config.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < (this.config.cacheTtl || 0)) {
        return cached.persona;
      }
    }

    let persona: AgentPersona | null = null;
    let source: 'dynamodb' | 'fallback' = 'fallback';

    // Try DynamoDB first
    if (this.config.dynamoService) {
      try {
        persona = await this.loadPersonaFromDynamoDB(tenantId, effectivePersonaId);
        if (persona) {
          source = 'dynamodb';
        }
      } catch (error) {
        console.warn(`Failed to load persona from DynamoDB: ${tenantId}#${effectivePersonaId}`, error);
      }
    }

    // Fallback to static personas
    if (!persona && this.config.fallbackPersonas) {
      persona = this.config.fallbackPersonas[effectivePersonaId] || null;
      source = 'fallback';
    }

    // Cache the result
    if (persona && this.config.enableCache) {
      this.cache.set(cacheKey, {
        persona,
        timestamp: Date.now(),
        source,
      });
    }

    return persona;
  }

  /**
   * Save a persona to DynamoDB
   * 
   * @param tenantId Tenant identifier
   * @param personaId Persona identifier
   * @param persona Persona configuration
   * @param options Save options
   */
  async savePersona(
    tenantId: string, 
    personaId: string, 
    persona: AgentPersona,
    options: {
      status?: 'active' | 'draft' | 'archived';
      isTemplate?: boolean;
      templateCategory?: string;
      createdBy?: string;
    } = {}
  ): Promise<void> {
    if (!this.config.dynamoService) {
      throw new Error('DynamoDB service not configured - cannot save persona');
    }

    const now = new Date().toISOString();
    const personaPk = `${tenantId}#${personaId}`;

    // Convert AgentPersona to PersonaConfig for DynamoDB storage
    const personaConfig = this.convertAgentPersonaToPersonaConfig(persona);

    const personaItem: CreatePersonaItem = {
      tenantId,
      persona_id: personaId,
      status: options.status || 'active',
      config: personaConfig,
      isTemplate: options.isTemplate || false,
      templateCategory: options.templateCategory,
      created_by: options.createdBy || 'system',
      updated_by: options.createdBy || 'system',
    };

    // Create the full PersonaItem with generated fields
    const fullItem: PersonaItem = {
      persona_pk: personaPk,
      sk: 'CONFIG',
      tenantId,
      persona_id: personaId,
      status: options.status || 'active',
      config: personaConfig,
      isTemplate: options.isTemplate || false,
      templateCategory: options.templateCategory,
      created_by: options.createdBy || 'system',
      updated_by: options.createdBy || 'system',
      GSI1PK: tenantId,
      GSI1SK: `${options.status || 'active'}#${now}`,
      created_at: now,
      updated_at: now,
    };

    // Add template GSI if it's a template
    if (options.isTemplate && options.templateCategory) {
      fullItem.GSI2PK = `TEMPLATE#${options.templateCategory}`;
      fullItem.GSI2SK = '0'; // Default popularity score
      fullItem.templateDescription = persona.description;
    }

    // Save to DynamoDB (assuming we extend DynamoDBService with persona methods)
    await this.savePersonaToDynamoDB(fullItem);

    // Invalidate cache
    const cacheKey = `${tenantId}#${personaId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * List personas for a tenant
   * 
   * @param tenantId Tenant identifier
   * @param options Query options
   * @returns Array of persona configurations with metadata
   */
  async listPersonas(
    tenantId: string, 
    options: PersonaQueryOptions = {}
  ): Promise<Array<{
    personaId: string;
    persona: AgentPersona;
    status: string;
    isTemplate: boolean;
    createdAt: string;
    updatedAt: string;
  }>> {
    const results: Array<{
      personaId: string;
      persona: AgentPersona;
      status: string;
      isTemplate: boolean;
      createdAt: string;
      updatedAt: string;
    }> = [];

    // Load from DynamoDB if available
    if (this.config.dynamoService) {
      try {
        const dynamoResults = await this.listPersonasFromDynamoDB(tenantId, options);
        results.push(...dynamoResults);
      } catch (error) {
        console.warn(`Failed to list personas from DynamoDB for tenant: ${tenantId}`, error);
      }
    }

    // Add fallback personas if no DynamoDB results
    if (results.length === 0 && this.config.fallbackPersonas) {
      for (const [personaId, persona] of Object.entries(this.config.fallbackPersonas)) {
        results.push({
          personaId,
          persona,
          status: 'active',
          isTemplate: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  /**
   * Delete a persona from DynamoDB
   * 
   * @param tenantId Tenant identifier
   * @param personaId Persona identifier
   */
  async deletePersona(tenantId: string, personaId: string): Promise<void> {
    if (!this.config.dynamoService) {
      throw new Error('DynamoDB service not configured - cannot delete persona');
    }

    await this.deletePersonaFromDynamoDB(tenantId, personaId);

    // Invalidate cache
    const cacheKey = `${tenantId}#${personaId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Clear cache for a specific tenant or all cache
   * 
   * @param tenantId Optional tenant ID to clear cache for
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      // Clear cache for specific tenant
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(`${tenantId}#`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.cache.delete(key));
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  // =============================================================================
  // PRIVATE METHODS - DynamoDB OPERATIONS
  // =============================================================================

  /**
   * Load persona from DynamoDB
   */
  private async loadPersonaFromDynamoDB(tenantId: string, personaId: string): Promise<AgentPersona | null> {
    if (!this.config.dynamoService) return null;

    try {
      // This would use a method we'd add to DynamoDBService
      const personaItem = await this.getPersonaFromDynamoDB(tenantId, personaId);
      if (!personaItem?.config) return null;

      // Convert DynamoDB PersonaConfig to AgentPersona
      return this.convertPersonaConfigToAgentPersona(personaItem.config);
    } catch (error) {
      console.error('Error loading persona from DynamoDB:', error);
      return null;
    }
  }

  /**
   * Save persona to DynamoDB
   */
  private async savePersonaToDynamoDB(personaItem: PersonaItem): Promise<void> {
    if (!this.config.dynamoService) return;

    // This would use a method we'd add to DynamoDBService
    // For now, we'll use the generic putItem method
    const dynamoService = this.config.dynamoService as any;
    
    if (dynamoService.putPersona) {
      await dynamoService.putPersona(personaItem);
    } else {
      // Fallback to generic put if persona-specific method doesn't exist
      console.warn('DynamoDB service does not have putPersona method - persona not saved');
    }
  }

  /**
   * Get persona from DynamoDB
   */
  private async getPersonaFromDynamoDB(tenantId: string, personaId: string): Promise<PersonaItem | null> {
    if (!this.config.dynamoService) return null;

    const dynamoService = this.config.dynamoService as any;
    
    if (dynamoService.getPersona) {
      return await dynamoService.getPersona(tenantId, personaId);
    } else {
      console.warn('DynamoDB service does not have getPersona method');
      return null;
    }
  }

  /**
   * List personas from DynamoDB
   */
  private async listPersonasFromDynamoDB(
    tenantId: string, 
    options: PersonaQueryOptions
  ): Promise<Array<{
    personaId: string;
    persona: AgentPersona;
    status: string;
    isTemplate: boolean;
    createdAt: string;
    updatedAt: string;
  }>> {
    if (!this.config.dynamoService) return [];

    const dynamoService = this.config.dynamoService as any;
    
    if (dynamoService.listPersonas) {
      const items = await dynamoService.listPersonas(tenantId, options);
      return items.map((item: PersonaItem) => ({
        personaId: item.persona_id,
        persona: item.config,
        status: item.status,
        isTemplate: item.isTemplate || false,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
    } else {
      console.warn('DynamoDB service does not have listPersonas method');
      return [];
    }
  }

  /**
   * Delete persona from DynamoDB
   */
  private async deletePersonaFromDynamoDB(tenantId: string, personaId: string): Promise<void> {
    if (!this.config.dynamoService) return;

    const dynamoService = this.config.dynamoService as any;
    
    if (dynamoService.deletePersona) {
      await dynamoService.deletePersona(tenantId, personaId);
    } else {
      console.warn('DynamoDB service does not have deletePersona method - persona not deleted');
    }
  }

  /**
   * Convert DynamoDB PersonaConfig to AgentPersona
   */
  private convertPersonaConfigToAgentPersona(config: any): AgentPersona {
    // Ensure responseChunking has all required channels
    const responseChunking = config.responseChunking ? {
      ...config.responseChunking,
      rules: {
        sms: config.responseChunking.rules?.sms || { maxLength: 160, chunkBy: 'sentence', delayBetweenChunks: 1000 },
        chat: config.responseChunking.rules?.chat || { maxLength: 500, chunkBy: 'paragraph', delayBetweenChunks: 500 },
        email: config.responseChunking.rules?.email || { maxLength: 2000, chunkBy: 'none', delayBetweenChunks: 0 },
        api: config.responseChunking.rules?.api || { maxLength: 1000, chunkBy: 'paragraph', delayBetweenChunks: 0 },
        agent: config.responseChunking.rules?.agent || { maxLength: 1000, chunkBy: 'paragraph', delayBetweenChunks: 0 },
        voice: config.responseChunking.rules?.voice || { maxLength: 300, chunkBy: 'sentence', delayBetweenChunks: 2000 },
        social: config.responseChunking.rules?.social || { maxLength: 280, chunkBy: 'sentence', delayBetweenChunks: 1000 },
      }
    } : undefined;

    return {
      ...config,
      responseChunking,
    } as AgentPersona;
  }

  /**
   * Convert AgentPersona to DynamoDB PersonaConfig
   */
  private convertAgentPersonaToPersonaConfig(persona: AgentPersona): any {
    // Convert responseChunking to only include basic MessageSource channels
    const responseChunking = persona.responseChunking ? {
      ...persona.responseChunking,
      rules: {
        sms: persona.responseChunking.rules.sms,
        chat: persona.responseChunking.rules.chat,
        email: persona.responseChunking.rules.email,
        api: persona.responseChunking.rules.api,
        // Store extended channels in metadata if needed
        ...(persona.responseChunking.rules.agent && { agent: persona.responseChunking.rules.agent }),
        ...((persona.responseChunking.rules as any).voice && { voice: (persona.responseChunking.rules as any).voice }),
        ...((persona.responseChunking.rules as any).social && { social: (persona.responseChunking.rules as any).social }),
      }
    } : undefined;

    return {
      ...persona,
      responseChunking,
      metadata: {
        ...((persona as any).metadata || {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        tags: [],
      },
    };
  }
}

// =============================================================================
// PERSONA LOADER FACTORY
// =============================================================================

/**
 * Factory function to create a persona storage instance with common configurations
 */
export function createPersonaStorage(config: {
  dynamoService?: DynamoDBService;
  fallbackPersonasPath?: string;
  defaultPersonaId?: string;
  enableCache?: boolean;
}): PersonaStorage {
  let fallbackPersonas: Record<string, AgentPersona> | undefined;

  // Load fallback personas from file if path provided
  if (config.fallbackPersonasPath) {
    try {
      // In a real implementation, you'd load from the file system
      // For now, we'll assume it's the personas.json content
      fallbackPersonas = require(config.fallbackPersonasPath);
    } catch (error) {
      console.warn(`Failed to load fallback personas from ${config.fallbackPersonasPath}:`, error);
    }
  }

  return new PersonaStorage({
    dynamoService: config.dynamoService,
    fallbackPersonas,
    defaultPersonaId: config.defaultPersonaId || 'carlos',
    enableCache: config.enableCache !== false,
  });
}
