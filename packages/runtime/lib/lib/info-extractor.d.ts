export interface ExtractedInfo {
    email?: {
        value: string;
        confidence: number;
        validated: boolean;
    };
    phone?: {
        value: string;
        confidence: number;
        validated: boolean;
        formatted: string;
    };
    firstName?: {
        value: string;
        confidence: number;
    };
    lastName?: {
        value: string;
        confidence: number;
    };
    fullName?: {
        value: string;
        confidence: number;
    };
}
export declare class InfoExtractor {
    private emailPatterns;
    private phonePatterns;
    private nameFilters;
    /**
     * Extract all possible information from a message
     */
    extractInfo(message: string): ExtractedInfo;
    /**
     * Extract email addresses from message
     */
    private extractEmail;
    /**
     * Extract phone numbers from message
     */
    private extractPhone;
    /**
     * Extract names from message
     */
    private extractNames;
    /**
     * Parse a full name into first and last name components
     */
    private parseFullName;
    /**
     * Validate email format
     */
    private validateEmail;
    /**
     * Clean phone number to digits only
     */
    private cleanPhoneNumber;
    /**
     * Validate phone number
     */
    private validatePhone;
    /**
     * Format phone number for display
     */
    private formatPhoneNumber;
    /**
     * Check if message contains information request decline
     */
    detectInformationDecline(message: string): {
        declined: boolean;
        type: 'email' | 'phone' | 'name' | 'general' | null;
        confidence: number;
    };
    /**
     * Detect if user is providing information in response to a request
     */
    detectInformationProvision(message: string, requestedType: 'email' | 'phone' | 'name'): {
        isProviding: boolean;
        confidence: number;
        extracted?: any;
    };
}
