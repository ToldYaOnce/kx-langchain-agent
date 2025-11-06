"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaStorage = void 0;
exports.createPersonaStorage = createPersonaStorage;
// =============================================================================
// PERSONA STORAGE SERVICE
// =============================================================================
/**
 * Service for loading and managing personas from DynamoDB with fallback support
 */
class PersonaStorage {
    constructor(config) {
        this.cache = new Map();
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
    async getPersona(tenantId, personaId) {
        const effectivePersonaId = personaId || this.config.defaultPersonaId || 'default';
        const cacheKey = `${tenantId}#${effectivePersonaId}`;
        // Check cache first
        if (this.config.enableCache) {
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < (this.config.cacheTtl || 0)) {
                return cached.persona;
            }
        }
        let persona = null;
        let source = 'fallback';
        // Try DynamoDB first
        if (this.config.dynamoService) {
            try {
                persona = await this.loadPersonaFromDynamoDB(tenantId, effectivePersonaId);
                if (persona) {
                    source = 'dynamodb';
                }
            }
            catch (error) {
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
    async savePersona(tenantId, personaId, persona, options = {}) {
        if (!this.config.dynamoService) {
            throw new Error('DynamoDB service not configured - cannot save persona');
        }
        const now = new Date().toISOString();
        const personaPk = `${tenantId}#${personaId}`;
        // Convert AgentPersona to PersonaConfig for DynamoDB storage
        const personaConfig = this.convertAgentPersonaToPersonaConfig(persona);
        const personaItem = {
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
        const fullItem = {
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
    async listPersonas(tenantId, options = {}) {
        const results = [];
        // Load from DynamoDB if available
        if (this.config.dynamoService) {
            try {
                const dynamoResults = await this.listPersonasFromDynamoDB(tenantId, options);
                results.push(...dynamoResults);
            }
            catch (error) {
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
    async deletePersona(tenantId, personaId) {
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
    clearCache(tenantId) {
        if (tenantId) {
            // Clear cache for specific tenant
            const keysToDelete = [];
            this.cache.forEach((_, key) => {
                if (key.startsWith(`${tenantId}#`)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(key => this.cache.delete(key));
        }
        else {
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
    async loadPersonaFromDynamoDB(tenantId, personaId) {
        if (!this.config.dynamoService)
            return null;
        try {
            // This would use a method we'd add to DynamoDBService
            const personaItem = await this.getPersonaFromDynamoDB(tenantId, personaId);
            if (!personaItem?.config)
                return null;
            // Convert DynamoDB PersonaConfig to AgentPersona
            return this.convertPersonaConfigToAgentPersona(personaItem.config);
        }
        catch (error) {
            console.error('Error loading persona from DynamoDB:', error);
            return null;
        }
    }
    /**
     * Save persona to DynamoDB
     */
    async savePersonaToDynamoDB(personaItem) {
        if (!this.config.dynamoService)
            return;
        // This would use a method we'd add to DynamoDBService
        // For now, we'll use the generic putItem method
        const dynamoService = this.config.dynamoService;
        if (dynamoService.putPersona) {
            await dynamoService.putPersona(personaItem);
        }
        else {
            // Fallback to generic put if persona-specific method doesn't exist
            console.warn('DynamoDB service does not have putPersona method - persona not saved');
        }
    }
    /**
     * Get persona from DynamoDB
     */
    async getPersonaFromDynamoDB(tenantId, personaId) {
        if (!this.config.dynamoService)
            return null;
        const dynamoService = this.config.dynamoService;
        if (dynamoService.getPersona) {
            return await dynamoService.getPersona(tenantId, personaId);
        }
        else {
            console.warn('DynamoDB service does not have getPersona method');
            return null;
        }
    }
    /**
     * List personas from DynamoDB
     */
    async listPersonasFromDynamoDB(tenantId, options) {
        if (!this.config.dynamoService)
            return [];
        const dynamoService = this.config.dynamoService;
        if (dynamoService.listPersonas) {
            const items = await dynamoService.listPersonas(tenantId, options);
            return items.map((item) => ({
                personaId: item.persona_id,
                persona: item.config,
                status: item.status,
                isTemplate: item.isTemplate || false,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
            }));
        }
        else {
            console.warn('DynamoDB service does not have listPersonas method');
            return [];
        }
    }
    /**
     * Delete persona from DynamoDB
     */
    async deletePersonaFromDynamoDB(tenantId, personaId) {
        if (!this.config.dynamoService)
            return;
        const dynamoService = this.config.dynamoService;
        if (dynamoService.deletePersona) {
            await dynamoService.deletePersona(tenantId, personaId);
        }
        else {
            console.warn('DynamoDB service does not have deletePersona method - persona not deleted');
        }
    }
    /**
     * Convert DynamoDB PersonaConfig to AgentPersona
     */
    convertPersonaConfigToAgentPersona(config) {
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
        };
    }
    /**
     * Convert AgentPersona to DynamoDB PersonaConfig
     */
    convertAgentPersonaToPersonaConfig(persona) {
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
                ...(persona.responseChunking.rules.voice && { voice: persona.responseChunking.rules.voice }),
                ...(persona.responseChunking.rules.social && { social: persona.responseChunking.rules.social }),
            }
        } : undefined;
        return {
            ...persona,
            responseChunking,
            metadata: {
                ...(persona.metadata || {}),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: '1.0.0',
                tags: [],
            },
        };
    }
}
exports.PersonaStorage = PersonaStorage;
// =============================================================================
// PERSONA LOADER FACTORY
// =============================================================================
/**
 * Factory function to create a persona storage instance with common configurations
 */
function createPersonaStorage(config) {
    let fallbackPersonas;
    // Load fallback personas from file if path provided
    if (config.fallbackPersonasPath) {
        try {
            // In a real implementation, you'd load from the file system
            // For now, we'll assume it's the personas.json content
            fallbackPersonas = require(config.fallbackPersonasPath);
        }
        catch (error) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYS1zdG9yYWdlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9wZXJzb25hLXN0b3JhZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQkc7OztBQThjSCxvREF5QkM7QUFqYkQsZ0ZBQWdGO0FBQ2hGLDBCQUEwQjtBQUMxQixnRkFBZ0Y7QUFFaEY7O0dBRUc7QUFDSCxNQUFhLGNBQWM7SUFJekIsWUFBWSxNQUE0QjtRQUZoQyxVQUFLLEdBQUcsSUFBSSxHQUFHLEVBQXlCLENBQUM7UUFHL0MsSUFBSSxDQUFDLE1BQU0sR0FBRztZQUNaLFFBQVEsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBRSxvQkFBb0I7WUFDN0MsV0FBVyxFQUFFLElBQUk7WUFDakIsZ0JBQWdCLEVBQUUsU0FBUztZQUMzQixHQUFHLE1BQU07U0FDVixDQUFDO0lBQ0osQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsUUFBZ0IsRUFBRSxTQUFrQjtRQUNuRCxNQUFNLGtCQUFrQixHQUFHLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixJQUFJLFNBQVMsQ0FBQztRQUNsRixNQUFNLFFBQVEsR0FBRyxHQUFHLFFBQVEsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBRXJELG9CQUFvQjtRQUNwQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDNUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEMsSUFBSSxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDNUUs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LFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVyxLQUFLLEtBQUs7S0FDMUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGZpbGVvdmVydmlld1xuICogUGVyc29uYSBTdG9yYWdlIFNlcnZpY2UgLSBIYW5kbGVzIGxvYWRpbmcgcGVyc29uYXMgZnJvbSBEeW5hbW9EQiBvciBmYWxsYmFjayBzb3VyY2VzXG4gKiBcbiAqIFRoaXMgZGVjb3VwbGVzIHBlcnNvbmEgbWFuYWdlbWVudCBmcm9tIHRoZSBzdGF0aWMgcGVyc29uYXMuanNvbiBmaWxlLCBhbGxvd2luZ1xuICogY29uc3VtZXJzIHRvIHN0b3JlIGFuZCBtYW5hZ2UgcGVyc29uYXMgaW4gRHluYW1vREIgd2hpbGUgdXNpbmcgcGVyc29uYXMuanNvblxuICogYXMgYSBmYWxsYmFjayBvciByZWZlcmVuY2UgaW1wbGVtZW50YXRpb24uXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBzdG9yYWdlID0gbmV3IFBlcnNvbmFTdG9yYWdlKHtcbiAqICAgZHluYW1vU2VydmljZSxcbiAqICAgZmFsbGJhY2tQZXJzb25hczogZGVmYXVsdFBlcnNvbmFzLCAvLyBmcm9tIHBlcnNvbmFzLmpzb25cbiAqIH0pO1xuICogXG4gKiAvLyBMb2FkIHBlcnNvbmEgKHRyaWVzIER5bmFtb0RCIGZpcnN0LCB0aGVuIGZhbGxiYWNrKVxuICogY29uc3QgcGVyc29uYSA9IGF3YWl0IHN0b3JhZ2UuZ2V0UGVyc29uYSgndGVuYW50MTIzJywgJ2NhcmxvcycpO1xuICogXG4gKiAvLyBTYXZlIHBlcnNvbmEgdG8gRHluYW1vREJcbiAqIGF3YWl0IHN0b3JhZ2Uuc2F2ZVBlcnNvbmEoJ3RlbmFudDEyMycsICdjYXJsb3MnLCBwZXJzb25hQ29uZmlnKTtcbiAqIGBgYFxuICovXG5cbmltcG9ydCB0eXBlIHsgRHluYW1vREJTZXJ2aWNlIH0gZnJvbSAnLi9keW5hbW9kYi5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50UGVyc29uYSB9IGZyb20gJy4uL2NvbmZpZy9wZXJzb25hcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFBlcnNvbmFJdGVtLCBDcmVhdGVQZXJzb25hSXRlbSB9IGZyb20gJy4uL3R5cGVzL2R5bmFtb2RiLXNjaGVtYXMuanMnO1xuaW1wb3J0IHsgdWxpZCB9IGZyb20gJ3VsaWQnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVFlQRVNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBmb3IgcGVyc29uYSBzdG9yYWdlXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUGVyc29uYVN0b3JhZ2VDb25maWcge1xuICAvKiogRHluYW1vREIgc2VydmljZSBpbnN0YW5jZSAqL1xuICBkeW5hbW9TZXJ2aWNlPzogRHluYW1vREJTZXJ2aWNlO1xuICBcbiAgLyoqIEZhbGxiYWNrIHBlcnNvbmFzIChlLmcuLCBmcm9tIHBlcnNvbmFzLmpzb24pICovXG4gIGZhbGxiYWNrUGVyc29uYXM/OiBSZWNvcmQ8c3RyaW5nLCBBZ2VudFBlcnNvbmE+O1xuICBcbiAgLyoqIERlZmF1bHQgcGVyc29uYSBJRCB0byB1c2UgaWYgbm9uZSBzcGVjaWZpZWQgKi9cbiAgZGVmYXVsdFBlcnNvbmFJZD86IHN0cmluZztcbiAgXG4gIC8qKiBDYWNoZSBUVEwgaW4gbWlsbGlzZWNvbmRzICovXG4gIGNhY2hlVHRsPzogbnVtYmVyO1xuICBcbiAgLyoqIFdoZXRoZXIgdG8gZW5hYmxlIGNhY2hpbmcgKi9cbiAgZW5hYmxlQ2FjaGU/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIENhY2hlZCBwZXJzb25hIGVudHJ5XG4gKi9cbmludGVyZmFjZSBDYWNoZWRQZXJzb25hIHtcbiAgcGVyc29uYTogQWdlbnRQZXJzb25hO1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbiAgc291cmNlOiAnZHluYW1vZGInIHwgJ2ZhbGxiYWNrJztcbn1cblxuLyoqXG4gKiBQZXJzb25hIHF1ZXJ5IG9wdGlvbnNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQZXJzb25hUXVlcnlPcHRpb25zIHtcbiAgLyoqIEluY2x1ZGUgYXJjaGl2ZWQgcGVyc29uYXMgKi9cbiAgaW5jbHVkZUFyY2hpdmVkPzogYm9vbGVhbjtcbiAgXG4gIC8qKiBJbmNsdWRlIHRlbXBsYXRlIHBlcnNvbmFzICovXG4gIGluY2x1ZGVUZW1wbGF0ZXM/OiBib29sZWFuO1xuICBcbiAgLyoqIExpbWl0IG51bWJlciBvZiByZXN1bHRzICovXG4gIGxpbWl0PzogbnVtYmVyO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUEVSU09OQSBTVE9SQUdFIFNFUlZJQ0Vcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogU2VydmljZSBmb3IgbG9hZGluZyBhbmQgbWFuYWdpbmcgcGVyc29uYXMgZnJvbSBEeW5hbW9EQiB3aXRoIGZhbGxiYWNrIHN1cHBvcnRcbiAqL1xuZXhwb3J0IGNsYXNzIFBlcnNvbmFTdG9yYWdlIHtcbiAgcHJpdmF0ZSBjb25maWc6IFBlcnNvbmFTdG9yYWdlQ29uZmlnO1xuICBwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlZFBlcnNvbmE+KCk7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBQZXJzb25hU3RvcmFnZUNvbmZpZykge1xuICAgIHRoaXMuY29uZmlnID0ge1xuICAgICAgY2FjaGVUdGw6IDUgKiA2MCAqIDEwMDAsIC8vIDUgbWludXRlcyBkZWZhdWx0XG4gICAgICBlbmFibGVDYWNoZTogdHJ1ZSxcbiAgICAgIGRlZmF1bHRQZXJzb25hSWQ6ICdkZWZhdWx0JyxcbiAgICAgIC4uLmNvbmZpZyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhIHBlcnNvbmEgYnkgdGVuYW50IGFuZCBwZXJzb25hIElEXG4gICAqIFxuICAgKiBAcGFyYW0gdGVuYW50SWQgVGVuYW50IGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHBlcnNvbmFJZCBQZXJzb25hIGlkZW50aWZpZXIgKG9wdGlvbmFsLCB1c2VzIGRlZmF1bHQgaWYgbm90IHByb3ZpZGVkKVxuICAgKiBAcmV0dXJucyBQZXJzb25hIGNvbmZpZ3VyYXRpb24gb3IgbnVsbCBpZiBub3QgZm91bmRcbiAgICovXG4gIGFzeW5jIGdldFBlcnNvbmEodGVuYW50SWQ6IHN0cmluZywgcGVyc29uYUlkPzogc3RyaW5nKTogUHJvbWlzZTxBZ2VudFBlcnNvbmEgfCBudWxsPiB7XG4gICAgY29uc3QgZWZmZWN0aXZlUGVyc29uYUlkID0gcGVyc29uYUlkIHx8IHRoaXMuY29uZmlnLmRlZmF1bHRQZXJzb25hSWQgfHwgJ2RlZmF1bHQnO1xuICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGVuYW50SWR9IyR7ZWZmZWN0aXZlUGVyc29uYUlkfWA7XG5cbiAgICAvLyBDaGVjayBjYWNoZSBmaXJzdFxuICAgIGlmICh0aGlzLmNvbmZpZy5lbmFibGVDYWNoZSkge1xuICAgICAgY29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZS5nZXQoY2FjaGVLZXkpO1xuICAgICAgaWYgKGNhY2hlZCAmJiAoRGF0ZS5ub3coKSAtIGNhY2hlZC50aW1lc3RhbXApIDwgKHRoaXMuY29uZmlnLmNhY2hlVHRsIHx8IDApKSB7XG4gICAgICAgIHJldHVybiBjYWNoZWQucGVyc29uYTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgcGVyc29uYTogQWdlbnRQZXJzb25hIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHNvdXJjZTogJ2R5bmFtb2RiJyB8ICdmYWxsYmFjaycgPSAnZmFsbGJhY2snO1xuXG4gICAgLy8gVHJ5IER5bmFtb0RCIGZpcnN0XG4gICAgaWYgKHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHBlcnNvbmEgPSBhd2FpdCB0aGlzLmxvYWRQZXJzb25hRnJvbUR5bmFtb0RCKHRlbmFudElkLCBlZmZlY3RpdmVQZXJzb25hSWQpO1xuICAgICAgICBpZiAocGVyc29uYSkge1xuICAgICAgICAgIHNvdXJjZSA9ICdkeW5hbW9kYic7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgRmFpbGVkIHRvIGxvYWQgcGVyc29uYSBmcm9tIER5bmFtb0RCOiAke3RlbmFudElkfSMke2VmZmVjdGl2ZVBlcnNvbmFJZH1gLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRmFsbGJhY2sgdG8gc3RhdGljIHBlcnNvbmFzXG4gICAgaWYgKCFwZXJzb25hICYmIHRoaXMuY29uZmlnLmZhbGxiYWNrUGVyc29uYXMpIHtcbiAgICAgIHBlcnNvbmEgPSB0aGlzLmNvbmZpZy5mYWxsYmFja1BlcnNvbmFzW2VmZmVjdGl2ZVBlcnNvbmFJZF0gfHwgbnVsbDtcbiAgICAgIHNvdXJjZSA9ICdmYWxsYmFjayc7XG4gICAgfVxuXG4gICAgLy8gQ2FjaGUgdGhlIHJlc3VsdFxuICAgIGlmIChwZXJzb25hICYmIHRoaXMuY29uZmlnLmVuYWJsZUNhY2hlKSB7XG4gICAgICB0aGlzLmNhY2hlLnNldChjYWNoZUtleSwge1xuICAgICAgICBwZXJzb25hLFxuICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgIHNvdXJjZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwZXJzb25hO1xuICB9XG5cbiAgLyoqXG4gICAqIFNhdmUgYSBwZXJzb25hIHRvIER5bmFtb0RCXG4gICAqIFxuICAgKiBAcGFyYW0gdGVuYW50SWQgVGVuYW50IGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHBlcnNvbmFJZCBQZXJzb25hIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHBlcnNvbmEgUGVyc29uYSBjb25maWd1cmF0aW9uXG4gICAqIEBwYXJhbSBvcHRpb25zIFNhdmUgb3B0aW9uc1xuICAgKi9cbiAgYXN5bmMgc2F2ZVBlcnNvbmEoXG4gICAgdGVuYW50SWQ6IHN0cmluZywgXG4gICAgcGVyc29uYUlkOiBzdHJpbmcsIFxuICAgIHBlcnNvbmE6IEFnZW50UGVyc29uYSxcbiAgICBvcHRpb25zOiB7XG4gICAgICBzdGF0dXM/OiAnYWN0aXZlJyB8ICdkcmFmdCcgfCAnYXJjaGl2ZWQnO1xuICAgICAgaXNUZW1wbGF0ZT86IGJvb2xlYW47XG4gICAgICB0ZW1wbGF0ZUNhdGVnb3J5Pzogc3RyaW5nO1xuICAgICAgY3JlYXRlZEJ5Pzogc3RyaW5nO1xuICAgIH0gPSB7fVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRHluYW1vREIgc2VydmljZSBub3QgY29uZmlndXJlZCAtIGNhbm5vdCBzYXZlIHBlcnNvbmEnKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgY29uc3QgcGVyc29uYVBrID0gYCR7dGVuYW50SWR9IyR7cGVyc29uYUlkfWA7XG5cbiAgICAvLyBDb252ZXJ0IEFnZW50UGVyc29uYSB0byBQZXJzb25hQ29uZmlnIGZvciBEeW5hbW9EQiBzdG9yYWdlXG4gICAgY29uc3QgcGVyc29uYUNvbmZpZyA9IHRoaXMuY29udmVydEFnZW50UGVyc29uYVRvUGVyc29uYUNvbmZpZyhwZXJzb25hKTtcblxuICAgIGNvbnN0IHBlcnNvbmFJdGVtOiBDcmVhdGVQZXJzb25hSXRlbSA9IHtcbiAgICAgIHRlbmFudElkLFxuICAgICAgcGVyc29uYV9pZDogcGVyc29uYUlkLFxuICAgICAgc3RhdHVzOiBvcHRpb25zLnN0YXR1cyB8fCAnYWN0aXZlJyxcbiAgICAgIGNvbmZpZzogcGVyc29uYUNvbmZpZyxcbiAgICAgIGlzVGVtcGxhdGU6IG9wdGlvbnMuaXNUZW1wbGF0ZSB8fCBmYWxzZSxcbiAgICAgIHRlbXBsYXRlQ2F0ZWdvcnk6IG9wdGlvbnMudGVtcGxhdGVDYXRlZ29yeSxcbiAgICAgIGNyZWF0ZWRfYnk6IG9wdGlvbnMuY3JlYXRlZEJ5IHx8ICdzeXN0ZW0nLFxuICAgICAgdXBkYXRlZF9ieTogb3B0aW9ucy5jcmVhdGVkQnkgfHwgJ3N5c3RlbScsXG4gICAgfTtcblxuICAgIC8vIENyZWF0ZSB0aGUgZnVsbCBQZXJzb25hSXRlbSB3aXRoIGdlbmVyYXRlZCBmaWVsZHNcbiAgICBjb25zdCBmdWxsSXRlbTogUGVyc29uYUl0ZW0gPSB7XG4gICAgICBwZXJzb25hX3BrOiBwZXJzb25hUGssXG4gICAgICBzazogJ0NPTkZJRycsXG4gICAgICB0ZW5hbnRJZCxcbiAgICAgIHBlcnNvbmFfaWQ6IHBlcnNvbmFJZCxcbiAgICAgIHN0YXR1czogb3B0aW9ucy5zdGF0dXMgfHwgJ2FjdGl2ZScsXG4gICAgICBjb25maWc6IHBlcnNvbmFDb25maWcsXG4gICAgICBpc1RlbXBsYXRlOiBvcHRpb25zLmlzVGVtcGxhdGUgfHwgZmFsc2UsXG4gICAgICB0ZW1wbGF0ZUNhdGVnb3J5OiBvcHRpb25zLnRlbXBsYXRlQ2F0ZWdvcnksXG4gICAgICBjcmVhdGVkX2J5OiBvcHRpb25zLmNyZWF0ZWRCeSB8fCAnc3lzdGVtJyxcbiAgICAgIHVwZGF0ZWRfYnk6IG9wdGlvbnMuY3JlYXRlZEJ5IHx8ICdzeXN0ZW0nLFxuICAgICAgR1NJMVBLOiB0ZW5hbnRJZCxcbiAgICAgIEdTSTFTSzogYCR7b3B0aW9ucy5zdGF0dXMgfHwgJ2FjdGl2ZSd9IyR7bm93fWAsXG4gICAgICBjcmVhdGVkX2F0OiBub3csXG4gICAgICB1cGRhdGVkX2F0OiBub3csXG4gICAgfTtcblxuICAgIC8vIEFkZCB0ZW1wbGF0ZSBHU0kgaWYgaXQncyBhIHRlbXBsYXRlXG4gICAgaWYgKG9wdGlvbnMuaXNUZW1wbGF0ZSAmJiBvcHRpb25zLnRlbXBsYXRlQ2F0ZWdvcnkpIHtcbiAgICAgIGZ1bGxJdGVtLkdTSTJQSyA9IGBURU1QTEFURSMke29wdGlvbnMudGVtcGxhdGVDYXRlZ29yeX1gO1xuICAgICAgZnVsbEl0ZW0uR1NJMlNLID0gJzAnOyAvLyBEZWZhdWx0IHBvcHVsYXJpdHkgc2NvcmVcbiAgICAgIGZ1bGxJdGVtLnRlbXBsYXRlRGVzY3JpcHRpb24gPSBwZXJzb25hLmRlc2NyaXB0aW9uO1xuICAgIH1cblxuICAgIC8vIFNhdmUgdG8gRHluYW1vREIgKGFzc3VtaW5nIHdlIGV4dGVuZCBEeW5hbW9EQlNlcnZpY2Ugd2l0aCBwZXJzb25hIG1ldGhvZHMpXG4gICAgYXdhaXQgdGhpcy5zYXZlUGVyc29uYVRvRHluYW1vREIoZnVsbEl0ZW0pO1xuXG4gICAgLy8gSW52YWxpZGF0ZSBjYWNoZVxuICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7dGVuYW50SWR9IyR7cGVyc29uYUlkfWA7XG4gICAgdGhpcy5jYWNoZS5kZWxldGUoY2FjaGVLZXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgcGVyc29uYXMgZm9yIGEgdGVuYW50XG4gICAqIFxuICAgKiBAcGFyYW0gdGVuYW50SWQgVGVuYW50IGlkZW50aWZpZXJcbiAgICogQHBhcmFtIG9wdGlvbnMgUXVlcnkgb3B0aW9uc1xuICAgKiBAcmV0dXJucyBBcnJheSBvZiBwZXJzb25hIGNvbmZpZ3VyYXRpb25zIHdpdGggbWV0YWRhdGFcbiAgICovXG4gIGFzeW5jIGxpc3RQZXJzb25hcyhcbiAgICB0ZW5hbnRJZDogc3RyaW5nLCBcbiAgICBvcHRpb25zOiBQZXJzb25hUXVlcnlPcHRpb25zID0ge31cbiAgKTogUHJvbWlzZTxBcnJheTx7XG4gICAgcGVyc29uYUlkOiBzdHJpbmc7XG4gICAgcGVyc29uYTogQWdlbnRQZXJzb25hO1xuICAgIHN0YXR1czogc3RyaW5nO1xuICAgIGlzVGVtcGxhdGU6IGJvb2xlYW47XG4gICAgY3JlYXRlZEF0OiBzdHJpbmc7XG4gICAgdXBkYXRlZEF0OiBzdHJpbmc7XG4gIH0+PiB7XG4gICAgY29uc3QgcmVzdWx0czogQXJyYXk8e1xuICAgICAgcGVyc29uYUlkOiBzdHJpbmc7XG4gICAgICBwZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gICAgICBzdGF0dXM6IHN0cmluZztcbiAgICAgIGlzVGVtcGxhdGU6IGJvb2xlYW47XG4gICAgICBjcmVhdGVkQXQ6IHN0cmluZztcbiAgICAgIHVwZGF0ZWRBdDogc3RyaW5nO1xuICAgIH0+ID0gW107XG5cbiAgICAvLyBMb2FkIGZyb20gRHluYW1vREIgaWYgYXZhaWxhYmxlXG4gICAgaWYgKHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGR5bmFtb1Jlc3VsdHMgPSBhd2FpdCB0aGlzLmxpc3RQZXJzb25hc0Zyb21EeW5hbW9EQih0ZW5hbnRJZCwgb3B0aW9ucyk7XG4gICAgICAgIHJlc3VsdHMucHVzaCguLi5keW5hbW9SZXN1bHRzKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgRmFpbGVkIHRvIGxpc3QgcGVyc29uYXMgZnJvbSBEeW5hbW9EQiBmb3IgdGVuYW50OiAke3RlbmFudElkfWAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBZGQgZmFsbGJhY2sgcGVyc29uYXMgaWYgbm8gRHluYW1vREIgcmVzdWx0c1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmNvbmZpZy5mYWxsYmFja1BlcnNvbmFzKSB7XG4gICAgICBmb3IgKGNvbnN0IFtwZXJzb25hSWQsIHBlcnNvbmFdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuY29uZmlnLmZhbGxiYWNrUGVyc29uYXMpKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgcGVyc29uYUlkLFxuICAgICAgICAgIHBlcnNvbmEsXG4gICAgICAgICAgc3RhdHVzOiAnYWN0aXZlJyxcbiAgICAgICAgICBpc1RlbXBsYXRlOiBmYWxzZSxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgICogRGVsZXRlIGEgcGVyc29uYSBmcm9tIER5bmFtb0RCXG4gICAqIFxuICAgKiBAcGFyYW0gdGVuYW50SWQgVGVuYW50IGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHBlcnNvbmFJZCBQZXJzb25hIGlkZW50aWZpZXJcbiAgICovXG4gIGFzeW5jIGRlbGV0ZVBlcnNvbmEodGVuYW50SWQ6IHN0cmluZywgcGVyc29uYUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRHluYW1vREIgc2VydmljZSBub3QgY29uZmlndXJlZCAtIGNhbm5vdCBkZWxldGUgcGVyc29uYScpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZGVsZXRlUGVyc29uYUZyb21EeW5hbW9EQih0ZW5hbnRJZCwgcGVyc29uYUlkKTtcblxuICAgIC8vIEludmFsaWRhdGUgY2FjaGVcbiAgICBjb25zdCBjYWNoZUtleSA9IGAke3RlbmFudElkfSMke3BlcnNvbmFJZH1gO1xuICAgIHRoaXMuY2FjaGUuZGVsZXRlKGNhY2hlS2V5KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciBjYWNoZSBmb3IgYSBzcGVjaWZpYyB0ZW5hbnQgb3IgYWxsIGNhY2hlXG4gICAqIFxuICAgKiBAcGFyYW0gdGVuYW50SWQgT3B0aW9uYWwgdGVuYW50IElEIHRvIGNsZWFyIGNhY2hlIGZvclxuICAgKi9cbiAgY2xlYXJDYWNoZSh0ZW5hbnRJZD86IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICh0ZW5hbnRJZCkge1xuICAgICAgLy8gQ2xlYXIgY2FjaGUgZm9yIHNwZWNpZmljIHRlbmFudFxuICAgICAgY29uc3Qga2V5c1RvRGVsZXRlOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgdGhpcy5jYWNoZS5mb3JFYWNoKChfLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKGAke3RlbmFudElkfSNgKSkge1xuICAgICAgICAgIGtleXNUb0RlbGV0ZS5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAga2V5c1RvRGVsZXRlLmZvckVhY2goa2V5ID0+IHRoaXMuY2FjaGUuZGVsZXRlKGtleSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDbGVhciBhbGwgY2FjaGVcbiAgICAgIHRoaXMuY2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gIH1cblxuICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvLyBQUklWQVRFIE1FVEhPRFMgLSBEeW5hbW9EQiBPUEVSQVRJT05TXG4gIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIExvYWQgcGVyc29uYSBmcm9tIER5bmFtb0RCXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGxvYWRQZXJzb25hRnJvbUR5bmFtb0RCKHRlbmFudElkOiBzdHJpbmcsIHBlcnNvbmFJZDogc3RyaW5nKTogUHJvbWlzZTxBZ2VudFBlcnNvbmEgfCBudWxsPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlKSByZXR1cm4gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAvLyBUaGlzIHdvdWxkIHVzZSBhIG1ldGhvZCB3ZSdkIGFkZCB0byBEeW5hbW9EQlNlcnZpY2VcbiAgICAgIGNvbnN0IHBlcnNvbmFJdGVtID0gYXdhaXQgdGhpcy5nZXRQZXJzb25hRnJvbUR5bmFtb0RCKHRlbmFudElkLCBwZXJzb25hSWQpO1xuICAgICAgaWYgKCFwZXJzb25hSXRlbT8uY29uZmlnKSByZXR1cm4gbnVsbDtcblxuICAgICAgLy8gQ29udmVydCBEeW5hbW9EQiBQZXJzb25hQ29uZmlnIHRvIEFnZW50UGVyc29uYVxuICAgICAgcmV0dXJuIHRoaXMuY29udmVydFBlcnNvbmFDb25maWdUb0FnZW50UGVyc29uYShwZXJzb25hSXRlbS5jb25maWcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIHBlcnNvbmEgZnJvbSBEeW5hbW9EQjonLCBlcnJvcik7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2F2ZSBwZXJzb25hIHRvIER5bmFtb0RCXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHNhdmVQZXJzb25hVG9EeW5hbW9EQihwZXJzb25hSXRlbTogUGVyc29uYUl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHJldHVybjtcblxuICAgIC8vIFRoaXMgd291bGQgdXNlIGEgbWV0aG9kIHdlJ2QgYWRkIHRvIER5bmFtb0RCU2VydmljZVxuICAgIC8vIEZvciBub3csIHdlJ2xsIHVzZSB0aGUgZ2VuZXJpYyBwdXRJdGVtIG1ldGhvZFxuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSB0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlIGFzIGFueTtcbiAgICBcbiAgICBpZiAoZHluYW1vU2VydmljZS5wdXRQZXJzb25hKSB7XG4gICAgICBhd2FpdCBkeW5hbW9TZXJ2aWNlLnB1dFBlcnNvbmEocGVyc29uYUl0ZW0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGYWxsYmFjayB0byBnZW5lcmljIHB1dCBpZiBwZXJzb25hLXNwZWNpZmljIG1ldGhvZCBkb2Vzbid0IGV4aXN0XG4gICAgICBjb25zb2xlLndhcm4oJ0R5bmFtb0RCIHNlcnZpY2UgZG9lcyBub3QgaGF2ZSBwdXRQZXJzb25hIG1ldGhvZCAtIHBlcnNvbmEgbm90IHNhdmVkJyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBwZXJzb25hIGZyb20gRHluYW1vREJcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZ2V0UGVyc29uYUZyb21EeW5hbW9EQih0ZW5hbnRJZDogc3RyaW5nLCBwZXJzb25hSWQ6IHN0cmluZyk6IFByb21pc2U8UGVyc29uYUl0ZW0gfCBudWxsPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSB0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlIGFzIGFueTtcbiAgICBcbiAgICBpZiAoZHluYW1vU2VydmljZS5nZXRQZXJzb25hKSB7XG4gICAgICByZXR1cm4gYXdhaXQgZHluYW1vU2VydmljZS5nZXRQZXJzb25hKHRlbmFudElkLCBwZXJzb25hSWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJ0R5bmFtb0RCIHNlcnZpY2UgZG9lcyBub3QgaGF2ZSBnZXRQZXJzb25hIG1ldGhvZCcpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgcGVyc29uYXMgZnJvbSBEeW5hbW9EQlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBsaXN0UGVyc29uYXNGcm9tRHluYW1vREIoXG4gICAgdGVuYW50SWQ6IHN0cmluZywgXG4gICAgb3B0aW9uczogUGVyc29uYVF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHtcbiAgICBwZXJzb25hSWQ6IHN0cmluZztcbiAgICBwZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gICAgc3RhdHVzOiBzdHJpbmc7XG4gICAgaXNUZW1wbGF0ZTogYm9vbGVhbjtcbiAgICBjcmVhdGVkQXQ6IHN0cmluZztcbiAgICB1cGRhdGVkQXQ6IHN0cmluZztcbiAgfT4+IHtcbiAgICBpZiAoIXRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSB0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlIGFzIGFueTtcbiAgICBcbiAgICBpZiAoZHluYW1vU2VydmljZS5saXN0UGVyc29uYXMpIHtcbiAgICAgIGNvbnN0IGl0ZW1zID0gYXdhaXQgZHluYW1vU2VydmljZS5saXN0UGVyc29uYXModGVuYW50SWQsIG9wdGlvbnMpO1xuICAgICAgcmV0dXJuIGl0ZW1zLm1hcCgoaXRlbTogUGVyc29uYUl0ZW0pID0+ICh7XG4gICAgICAgIHBlcnNvbmFJZDogaXRlbS5wZXJzb25hX2lkLFxuICAgICAgICBwZXJzb25hOiBpdGVtLmNvbmZpZyxcbiAgICAgICAgc3RhdHVzOiBpdGVtLnN0YXR1cyxcbiAgICAgICAgaXNUZW1wbGF0ZTogaXRlbS5pc1RlbXBsYXRlIHx8IGZhbHNlLFxuICAgICAgICBjcmVhdGVkQXQ6IGl0ZW0uY3JlYXRlZF9hdCxcbiAgICAgICAgdXBkYXRlZEF0OiBpdGVtLnVwZGF0ZWRfYXQsXG4gICAgICB9KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybignRHluYW1vREIgc2VydmljZSBkb2VzIG5vdCBoYXZlIGxpc3RQZXJzb25hcyBtZXRob2QnKTtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGVsZXRlIHBlcnNvbmEgZnJvbSBEeW5hbW9EQlxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBkZWxldGVQZXJzb25hRnJvbUR5bmFtb0RCKHRlbmFudElkOiBzdHJpbmcsIHBlcnNvbmFJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlKSByZXR1cm47XG5cbiAgICBjb25zdCBkeW5hbW9TZXJ2aWNlID0gdGhpcy5jb25maWcuZHluYW1vU2VydmljZSBhcyBhbnk7XG4gICAgXG4gICAgaWYgKGR5bmFtb1NlcnZpY2UuZGVsZXRlUGVyc29uYSkge1xuICAgICAgYXdhaXQgZHluYW1vU2VydmljZS5kZWxldGVQZXJzb25hKHRlbmFudElkLCBwZXJzb25hSWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLndhcm4oJ0R5bmFtb0RCIHNlcnZpY2UgZG9lcyBub3QgaGF2ZSBkZWxldGVQZXJzb25hIG1ldGhvZCAtIHBlcnNvbmEgbm90IGRlbGV0ZWQnKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29udmVydCBEeW5hbW9EQiBQZXJzb25hQ29uZmlnIHRvIEFnZW50UGVyc29uYVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0UGVyc29uYUNvbmZpZ1RvQWdlbnRQZXJzb25hKGNvbmZpZzogYW55KTogQWdlbnRQZXJzb25hIHtcbiAgICAvLyBFbnN1cmUgcmVzcG9uc2VDaHVua2luZyBoYXMgYWxsIHJlcXVpcmVkIGNoYW5uZWxzXG4gICAgY29uc3QgcmVzcG9uc2VDaHVua2luZyA9IGNvbmZpZy5yZXNwb25zZUNodW5raW5nID8ge1xuICAgICAgLi4uY29uZmlnLnJlc3BvbnNlQ2h1bmtpbmcsXG4gICAgICBydWxlczoge1xuICAgICAgICBzbXM6IGNvbmZpZy5yZXNwb25zZUNodW5raW5nLnJ1bGVzPy5zbXMgfHwgeyBtYXhMZW5ndGg6IDE2MCwgY2h1bmtCeTogJ3NlbnRlbmNlJywgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAxMDAwIH0sXG4gICAgICAgIGNoYXQ6IGNvbmZpZy5yZXNwb25zZUNodW5raW5nLnJ1bGVzPy5jaGF0IHx8IHsgbWF4TGVuZ3RoOiA1MDAsIGNodW5rQnk6ICdwYXJhZ3JhcGgnLCBkZWxheUJldHdlZW5DaHVua3M6IDUwMCB9LFxuICAgICAgICBlbWFpbDogY29uZmlnLnJlc3BvbnNlQ2h1bmtpbmcucnVsZXM/LmVtYWlsIHx8IHsgbWF4TGVuZ3RoOiAyMDAwLCBjaHVua0J5OiAnbm9uZScsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9LFxuICAgICAgICBhcGk6IGNvbmZpZy5yZXNwb25zZUNodW5raW5nLnJ1bGVzPy5hcGkgfHwgeyBtYXhMZW5ndGg6IDEwMDAsIGNodW5rQnk6ICdwYXJhZ3JhcGgnLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgYWdlbnQ6IGNvbmZpZy5yZXNwb25zZUNodW5raW5nLnJ1bGVzPy5hZ2VudCB8fCB7IG1heExlbmd0aDogMTAwMCwgY2h1bmtCeTogJ3BhcmFncmFwaCcsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9LFxuICAgICAgICB2b2ljZTogY29uZmlnLnJlc3BvbnNlQ2h1bmtpbmcucnVsZXM/LnZvaWNlIHx8IHsgbWF4TGVuZ3RoOiAzMDAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMjAwMCB9LFxuICAgICAgICBzb2NpYWw6IGNvbmZpZy5yZXNwb25zZUNodW5raW5nLnJ1bGVzPy5zb2NpYWwgfHwgeyBtYXhMZW5ndGg6IDI4MCwgY2h1bmtCeTogJ3NlbnRlbmNlJywgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAxMDAwIH0sXG4gICAgICB9XG4gICAgfSA6IHVuZGVmaW5lZDtcblxuICAgIHJldHVybiB7XG4gICAgICAuLi5jb25maWcsXG4gICAgICByZXNwb25zZUNodW5raW5nLFxuICAgIH0gYXMgQWdlbnRQZXJzb25hO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgQWdlbnRQZXJzb25hIHRvIER5bmFtb0RCIFBlcnNvbmFDb25maWdcbiAgICovXG4gIHByaXZhdGUgY29udmVydEFnZW50UGVyc29uYVRvUGVyc29uYUNvbmZpZyhwZXJzb25hOiBBZ2VudFBlcnNvbmEpOiBhbnkge1xuICAgIC8vIENvbnZlcnQgcmVzcG9uc2VDaHVua2luZyB0byBvbmx5IGluY2x1ZGUgYmFzaWMgTWVzc2FnZVNvdXJjZSBjaGFubmVsc1xuICAgIGNvbnN0IHJlc3BvbnNlQ2h1bmtpbmcgPSBwZXJzb25hLnJlc3BvbnNlQ2h1bmtpbmcgPyB7XG4gICAgICAuLi5wZXJzb25hLnJlc3BvbnNlQ2h1bmtpbmcsXG4gICAgICBydWxlczoge1xuICAgICAgICBzbXM6IHBlcnNvbmEucmVzcG9uc2VDaHVua2luZy5ydWxlcy5zbXMsXG4gICAgICAgIGNoYXQ6IHBlcnNvbmEucmVzcG9uc2VDaHVua2luZy5ydWxlcy5jaGF0LFxuICAgICAgICBlbWFpbDogcGVyc29uYS5yZXNwb25zZUNodW5raW5nLnJ1bGVzLmVtYWlsLFxuICAgICAgICBhcGk6IHBlcnNvbmEucmVzcG9uc2VDaHVua2luZy5ydWxlcy5hcGksXG4gICAgICAgIC8vIFN0b3JlIGV4dGVuZGVkIGNoYW5uZWxzIGluIG1ldGFkYXRhIGlmIG5lZWRlZFxuICAgICAgICAuLi4ocGVyc29uYS5yZXNwb25zZUNodW5raW5nLnJ1bGVzLmFnZW50ICYmIHsgYWdlbnQ6IHBlcnNvbmEucmVzcG9uc2VDaHVua2luZy5ydWxlcy5hZ2VudCB9KSxcbiAgICAgICAgLi4uKChwZXJzb25hLnJlc3BvbnNlQ2h1bmtpbmcucnVsZXMgYXMgYW55KS52b2ljZSAmJiB7IHZvaWNlOiAocGVyc29uYS5yZXNwb25zZUNodW5raW5nLnJ1bGVzIGFzIGFueSkudm9pY2UgfSksXG4gICAgICAgIC4uLigocGVyc29uYS5yZXNwb25zZUNodW5raW5nLnJ1bGVzIGFzIGFueSkuc29jaWFsICYmIHsgc29jaWFsOiAocGVyc29uYS5yZXNwb25zZUNodW5raW5nLnJ1bGVzIGFzIGFueSkuc29jaWFsIH0pLFxuICAgICAgfVxuICAgIH0gOiB1bmRlZmluZWQ7XG5cbiAgICByZXR1cm4ge1xuICAgICAgLi4ucGVyc29uYSxcbiAgICAgIHJlc3BvbnNlQ2h1bmtpbmcsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICAuLi4oKHBlcnNvbmEgYXMgYW55KS5tZXRhZGF0YSB8fCB7fSksXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgdmVyc2lvbjogJzEuMC4wJyxcbiAgICAgICAgdGFnczogW10sXG4gICAgICB9LFxuICAgIH07XG4gIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFBFUlNPTkEgTE9BREVSIEZBQ1RPUllcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogRmFjdG9yeSBmdW5jdGlvbiB0byBjcmVhdGUgYSBwZXJzb25hIHN0b3JhZ2UgaW5zdGFuY2Ugd2l0aCBjb21tb24gY29uZmlndXJhdGlvbnNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVBlcnNvbmFTdG9yYWdlKGNvbmZpZzoge1xuICBkeW5hbW9TZXJ2aWNlPzogRHluYW1vREJTZXJ2aWNlO1xuICBmYWxsYmFja1BlcnNvbmFzUGF0aD86IHN0cmluZztcbiAgZGVmYXVsdFBlcnNvbmFJZD86IHN0cmluZztcbiAgZW5hYmxlQ2FjaGU/OiBib29sZWFuO1xufSk6IFBlcnNvbmFTdG9yYWdlIHtcbiAgbGV0IGZhbGxiYWNrUGVyc29uYXM6IFJlY29yZDxzdHJpbmcsIEFnZW50UGVyc29uYT4gfCB1bmRlZmluZWQ7XG5cbiAgLy8gTG9hZCBmYWxsYmFjayBwZXJzb25hcyBmcm9tIGZpbGUgaWYgcGF0aCBwcm92aWRlZFxuICBpZiAoY29uZmlnLmZhbGxiYWNrUGVyc29uYXNQYXRoKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEluIGEgcmVhbCBpbXBsZW1lbnRhdGlvbiwgeW91J2QgbG9hZCBmcm9tIHRoZSBmaWxlIHN5c3RlbVxuICAgICAgLy8gRm9yIG5vdywgd2UnbGwgYXNzdW1lIGl0J3MgdGhlIHBlcnNvbmFzLmpzb24gY29udGVudFxuICAgICAgZmFsbGJhY2tQZXJzb25hcyA9IHJlcXVpcmUoY29uZmlnLmZhbGxiYWNrUGVyc29uYXNQYXRoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gbG9hZCBmYWxsYmFjayBwZXJzb25hcyBmcm9tICR7Y29uZmlnLmZhbGxiYWNrUGVyc29uYXNQYXRofTpgLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5ldyBQZXJzb25hU3RvcmFnZSh7XG4gICAgZHluYW1vU2VydmljZTogY29uZmlnLmR5bmFtb1NlcnZpY2UsXG4gICAgZmFsbGJhY2tQZXJzb25hcyxcbiAgICBkZWZhdWx0UGVyc29uYUlkOiBjb25maWcuZGVmYXVsdFBlcnNvbmFJZCB8fCAnY2FybG9zJyxcbiAgICBlbmFibGVDYWNoZTogY29uZmlnLmVuYWJsZUNhY2hlICE9PSBmYWxzZSxcbiAgfSk7XG59XG4iXX0=