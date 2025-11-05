/**
 * Service for generating randomized persona greetings
 */
export class GreetingService {
    /**
     * Generate a random greeting from the persona's greeting configuration
     */
    static generateGreeting(greetingConfig, companyInfo) {
        if (!greetingConfig || !greetingConfig.variations || greetingConfig.variations.length === 0) {
            return "Hello! How can I help you today?";
        }
        // Pick a random variation
        const randomIndex = Math.floor(Math.random() * greetingConfig.variations.length);
        let greeting = greetingConfig.variations[randomIndex];
        // Replace company placeholders
        if (companyInfo) {
            greeting = greeting
                .replace(/\{\{companyName\}\}/g, companyInfo.name || 'Planet Fitness')
                .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Big Box Gyms')
                .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'Planet Fitness is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers')
                .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Big fitness but also has apparrel, coffee, and a cafe')
                .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Only $10 a month')
                .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'People who seek value')
                .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Best prices');
        }
        else {
            // Default values
            greeting = greeting
                .replace(/\{\{companyName\}\}/g, 'Planet Fitness')
                .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
                .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers')
                .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
                .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
                .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
                .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
        }
        return greeting;
    }
    /**
     * Get the greeting gist/description for a persona
     */
    static getGreetingGist(greetingConfig) {
        return greetingConfig?.gist || "Standard friendly greeting";
    }
    /**
     * Get all greeting variations for a persona (useful for testing/preview)
     */
    static getGreetingVariations(greetingConfig, companyInfo) {
        if (!greetingConfig || !greetingConfig.variations) {
            return ["Hello! How can I help you today?"];
        }
        return greetingConfig.variations.map(variation => {
            let greeting = variation;
            // Replace company placeholders
            if (companyInfo) {
                greeting = greeting
                    .replace(/\{\{companyName\}\}/g, companyInfo.name || 'Planet Fitness')
                    .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Big Box Gyms')
                    .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'Planet Fitness is a global franchisor and operator of fitness centers')
                    .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Big fitness but also has apparrel, coffee, and a cafe')
                    .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Only $10 a month')
                    .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'People who seek value')
                    .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Best prices');
            }
            else {
                greeting = greeting
                    .replace(/\{\{companyName\}\}/g, 'Planet Fitness')
                    .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
                    .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness is a global franchisor and operator of fitness centers')
                    .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
                    .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
                    .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
                    .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
            }
            return greeting;
        });
    }
}
//# sourceMappingURL=greeting-service.js.map