import { Persona } from '../models/personas.js';
declare class Service<T> {
    constructor(model: any, partitionKey: string, sortKey?: string);
    create(event: any): Promise<any>;
    get(event: any): Promise<any>;
    update(event: any): Promise<any>;
    delete(event: any): Promise<any>;
    list(event: any): Promise<any>;
    query(event: any): Promise<any>;
}
/**
 * Service for managing Persona objects in DynamoDB
 * Provides CRUD operations for persona configurations
 */
export declare class PersonasService extends Service<Persona> {
    constructor();
    /**
     * Create a new persona
     */
    create(event: any): Promise<any>;
    /**
     * Get persona by tenantId and personaId
     */
    get(event: any): Promise<any>;
    /**
     * Update persona
     */
    update(event: any): Promise<any>;
    /**
     * Delete persona
     */
    delete(event: any): Promise<any>;
    /**
     * List personas for a tenant
     */
    listByTenant(event: any): Promise<any>;
    /**
     * Get a random persona for a tenant (used when no specific persona is requested)
     */
    getRandomPersona(event: any): Promise<any>;
}
export {};
