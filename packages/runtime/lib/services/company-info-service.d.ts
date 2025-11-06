import { CompanyInfo } from '../models/company-info.js';
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
 * Service for managing CompanyInfo objects in DynamoDB
 * Provides CRUD operations for company information and intent capturing configuration
 */
export declare class CompanyInfoService extends Service<CompanyInfo> {
    constructor();
    /**
     * Create a new company info record
     */
    create(event: any): Promise<any>;
    /**
     * Get company info by tenant ID
     */
    get(event: any): Promise<any>;
    /**
     * Update company info
     */
    update(event: any): Promise<any>;
    /**
     * Delete company info
     */
    delete(event: any): Promise<any>;
    /**
     * List all companies (for admin purposes)
     */
    list(event: any): Promise<any>;
}
export {};
