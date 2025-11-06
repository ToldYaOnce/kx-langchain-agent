import type { GreetingConfig } from '../config/personas.js';
import type { CompanyInfo } from './persona-service.js';
/**
 * Service for generating randomized persona greetings
 */
export declare class GreetingService {
    /**
     * Generate a random greeting from the persona's greeting configuration
     */
    static generateGreeting(greetingConfig?: GreetingConfig, companyInfo?: CompanyInfo): string;
    /**
     * Get the greeting gist/description for a persona
     */
    static getGreetingGist(greetingConfig?: GreetingConfig): string;
    /**
     * Get all greeting variations for a persona (useful for testing/preview)
     */
    static getGreetingVariations(greetingConfig?: GreetingConfig, companyInfo?: CompanyInfo): string[];
}
