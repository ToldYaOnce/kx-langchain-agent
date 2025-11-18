/**
 * Service for managing CompanyInfo objects in DynamoDB
 * Provides CRUD operations for company information and intent capturing configuration
 */
export declare class CompanyInfoService {
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
