import { CompanyInfo } from '../models/company-info.js';
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
}
/**
 * Service for retrieving combined Company + Persona data
 * Aggregates company information with persona configuration and interpolates templates
 */
export declare class CompanyPersonaService extends Service<any> {
    constructor();
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
export {};
