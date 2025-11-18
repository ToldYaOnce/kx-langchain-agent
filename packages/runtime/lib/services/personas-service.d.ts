/**
 * Service for managing Persona objects in DynamoDB
 * Provides CRUD operations for persona configurations
 */
export declare class PersonasService {
    constructor();
    /**
     * Create a new persona
     */
    createPersona(event: any): Promise<any>;
    /**
     * Get persona by tenantId and personaId
     */
    getPersona(event: any): Promise<any>;
    /**
     * Update persona
     */
    updatePersona(event: any): Promise<any>;
    /**
     * Delete persona
     */
    deletePersona(event: any): Promise<any>;
    /**
     * List all personas for a tenant
     */
    listPersonas(event: any): Promise<any>;
    /**
     * Get a random persona for a tenant
     */
    getRandomPersona(event: any): Promise<any>;
}
