import * as operationalData from '../config/operational-data.json';
export interface OperationalHours {
    open: string;
    close: string;
    is24Hours: boolean;
}
export interface LocationInfo {
    name: string;
    address: string;
    phone: string;
    website: string;
    hours: {
        monday: OperationalHours;
        tuesday: OperationalHours;
        wednesday: OperationalHours;
        thursday: OperationalHours;
        friday: OperationalHours;
        saturday: OperationalHours;
        sunday: OperationalHours;
        holidays: Record<string, string>;
    };
    timezone: string;
    specialNotes: string[];
}
export interface Membership {
    id: string;
    name: string;
    price: number;
    currency: string;
    billing: string;
    features: string[];
    restrictions: string[];
    popular?: boolean;
}
export interface Promotion {
    id: string;
    name: string;
    description: string;
    start_date: string;
    end_date: string;
    status: 'active' | 'scheduled' | 'expired';
    benefits: string[];
    applies_to: string[];
    terms: string[];
}
export interface OperationalContext {
    currentDate?: Date;
    locationId?: string;
    timezone?: string;
}
export declare class OperationalService {
    private data;
    constructor();
    /**
     * Get current operational hours for a location
     */
    getCurrentHours(context?: OperationalContext): {
        isOpen: boolean;
        hours: OperationalHours | null;
        nextChange: string;
        specialNote?: string;
    };
    /**
     * Get current pricing information
     */
    getCurrentPricing(): {
        memberships: Membership[];
        fees: any[];
        activePromotions: Promotion[];
    };
    /**
     * Get active promotions based on current date
     */
    getActivePromotions(context?: OperationalContext): Promotion[];
    /**
     * Get membership details by ID
     */
    getMembership(membershipId: string): Membership | null;
    /**
     * Get formatted pricing information for a membership
     */
    getFormattedPricing(membershipId: string): string;
    /**
     * Get services and amenities information
     */
    getServices(): typeof operationalData.services;
    /**
     * Get contact information
     */
    getContactInfo(): typeof operationalData.contact;
    /**
     * Get policies information
     */
    getPolicies(): typeof operationalData.policies;
    /**
     * Search for information based on query
     */
    searchOperationalInfo(query: string): {
        type: string;
        data: any;
        relevance: number;
    }[];
    /**
     * Format time for display
     */
    private formatTime;
    /**
     * Format date for display
     */
    private formatDate;
    /**
     * Get all operational data (for admin/debugging)
     */
    getAllData(): typeof operationalData;
    /**
     * Update operational data (for future dynamic updates)
     */
    updateData(updates: Partial<typeof operationalData>): void;
}
