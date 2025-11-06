import { CompanyPersonaResponse } from '../services/company-persona-service.js';
export interface PersonaApiConfig {
    baseUrl: string;
    timeout?: number;
    headers?: Record<string, string>;
}
export declare class PersonaApiLoader {
    private config;
    constructor(config: PersonaApiConfig);
    /**
     * Load company persona data from the new API structure
     * This replaces the old personas.json loading
     */
    loadCompanyPersona(tenantId: string, personaId?: string): Promise<CompanyPersonaResponse>;
    /**
     * Load random company persona
     */
    loadRandomCompanyPersona(tenantId: string): Promise<CompanyPersonaResponse>;
    /**
     * Get available personas for a tenant
     */
    getAvailablePersonas(tenantId: string): Promise<Array<{
        personaId: string;
        name: string;
        description: string;
    }>>;
    /**
     * Convert the new API response to the legacy AgentPersona format
     * This helps with backward compatibility during transition
     */
    convertToLegacyFormat(companyPersona: CompanyPersonaResponse): any;
}
/**
 * Factory function to create a PersonaApiLoader with environment-based config
 */
export declare function createPersonaApiLoader(overrides?: Partial<PersonaApiConfig>): PersonaApiLoader;
