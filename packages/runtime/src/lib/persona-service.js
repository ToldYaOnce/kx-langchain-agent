import * as personasJson from '../config/personas.json';
/**
 * Service for managing agent personas in DynamoDB
 */
export class PersonaService {
    dynamoService;
    constructor(dynamoService) {
        this.dynamoService = dynamoService;
    }
    /**
     * Get persona for a tenant (falls back to default if not found)
     */
    async getPersona(tenantId, personaId, companyInfo) {
        // For now, just return default personas with company name substitution
        // TODO: Implement DynamoDB storage when needed
        return this.getDefaultPersona(personaId, companyInfo);
    }
    /**
     * Get tenant-specific persona from DynamoDB
     * TODO: Implement when DynamoDB methods are available
     */
    async getTenantPersona(tenantId, personaId) {
        // TODO: Implement DynamoDB storage
        return null;
    }
    /**
     * List all personas for a tenant
     * TODO: Implement when DynamoDB methods are available
     */
    async listTenantPersonas(tenantId) {
        // TODO: Implement DynamoDB storage
        return [];
    }
    /**
     * Create or update a persona for a tenant
     * TODO: Implement when DynamoDB methods are available
     */
    async putPersona(tenantId, personaData) {
        // TODO: Implement DynamoDB storage
        console.log(`Would store persona ${personaData.personaId} for tenant ${tenantId}`);
    }
    /**
     * Delete a persona for a tenant (soft delete)
     * TODO: Implement when DynamoDB methods are available
     */
    async deletePersona(tenantId, personaId) {
        // TODO: Implement DynamoDB storage
        console.log(`Would delete persona ${personaId} for tenant ${tenantId}`);
    }
    /**
     * Initialize default personas for a tenant
     */
    async initializeDefaultPersonas(tenantId) {
        const defaultPersonas = Object.entries(personasJson);
        for (const [personaId, personaConfig] of defaultPersonas) {
            const config = personaConfig;
            const personaItem = {
                personaId,
                name: config.name,
                description: config.description,
                systemPrompt: config.systemPrompt,
                personality: config.personality,
                responseGuidelines: config.responseGuidelines,
                metadata: {
                    ...config.metadata,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                isActive: true,
            };
            await this.putPersona(tenantId, personaItem);
        }
    }
    /**
     * Get default persona from JSON config
     */
    getDefaultPersona(personaId, companyInfo) {
        const persona = personasJson[personaId];
        if (!persona) {
            throw new Error(`Unknown persona: ${personaId}. Available personas: ${Object.keys(personasJson).join(', ')}`);
        }
        let systemPrompt = persona.systemPrompt;
        // Replace company placeholders
        if (companyInfo) {
            systemPrompt = systemPrompt
                .replace(/\{\{companyName\}\}/g, companyInfo.name || 'KxGen')
                .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Lead Management')
                .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'A comprehensive lead management platform')
                .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Lead capture, nurturing, and conversion tools')
                .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Increased conversion rates and streamlined sales processes')
                .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'Small to medium businesses')
                .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Easy-to-use interface with powerful automation');
        }
        else {
            // Default values - use Planet Fitness info
            systemPrompt = systemPrompt
                .replace(/\{\{companyName\}\}/g, 'Planet Fitness')
                .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
                .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers, offering a variety of cardio and strength equipment, circuit training areas, and free fitness instruction through its PE@PF program. Members can choose between standard and Black Card memberships with different amenities and perks, including access to features like a 30-minute workout circuit, a functional fitness area with equipment like TRX and kettlebells, and spa areas like the Wellness Pod at some locations')
                .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
                .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
                .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
                .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
        }
        return {
            name: persona.name,
            description: persona.description,
            systemPrompt,
            personality: persona.personality,
            responseGuidelines: persona.responseGuidelines,
            greetings: persona.greetings,
            responseChunking: persona.responseChunking,
            intentCapturing: persona.intentCapturing,
            goalConfiguration: persona.goalConfiguration,
            actionTags: persona.actionTags,
        };
    }
    /**
     * Convert PersonaItem to AgentPersona
     */
    convertToAgentPersona(item, companyInfo) {
        let systemPrompt = item.systemPrompt;
        // Replace company placeholders (same logic as getDefaultPersona)
        if (companyInfo) {
            systemPrompt = systemPrompt
                .replace(/\{\{companyName\}\}/g, companyInfo.name || 'KxGen')
                .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Lead Management')
                .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'A comprehensive lead management platform')
                .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Lead capture, nurturing, and conversion tools')
                .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Increased conversion rates and streamlined sales processes')
                .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'Small to medium businesses')
                .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Easy-to-use interface with powerful automation');
        }
        else {
            systemPrompt = systemPrompt
                .replace(/\{\{companyName\}\}/g, 'Planet Fitness')
                .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
                .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers, offering a variety of cardio and strength equipment, circuit training areas, and free fitness instruction through its PE@PF program. Members can choose between standard and Black Card memberships with different amenities and perks, including access to features like a 30-minute workout circuit, a functional fitness area with equipment like TRX and kettlebells, and spa areas like the Wellness Pod at some locations')
                .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
                .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
                .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
                .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
        }
        return {
            name: item.name,
            description: item.description,
            systemPrompt,
            personality: item.personality,
            responseGuidelines: item.responseGuidelines,
            greetings: item.greetings,
            responseChunking: item.responseChunking,
            intentCapturing: item.intentCapturing,
            goalConfiguration: item.goalConfiguration,
        };
    }
    /**
     * Create DynamoDB partition key for personas
     */
    createPersonaPK(tenantId) {
        return `PERSONA#${tenantId}`;
    }
    /**
     * List available default personas
     */
    static listDefaultPersonas() {
        return Object.entries(personasJson).map(([id, persona]) => ({
            id,
            name: persona.name,
            description: persona.description
        }));
    }
}
//# sourceMappingURL=persona-service.js.map