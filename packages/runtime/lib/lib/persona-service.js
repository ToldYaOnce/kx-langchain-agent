"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaService = void 0;
const personasJson = __importStar(require("../config/personas.json"));
/**
 * Service for managing agent personas in DynamoDB
 */
class PersonaService {
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
exports.PersonaService = PersonaService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYS1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9wZXJzb25hLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsc0VBQXdEO0FBdUN4RDs7R0FFRztBQUNILE1BQWEsY0FBYztJQUN6QixZQUFvQixhQUFxQztRQUFyQyxrQkFBYSxHQUFiLGFBQWEsQ0FBd0I7SUFBRyxDQUFDO0lBRTdEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFnQixFQUFFLFNBQWlCLEVBQUUsV0FBeUI7UUFDN0UsdUVBQXVFO1FBQ3ZFLCtDQUErQztRQUMvQyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFnQixFQUFFLFNBQWlCO1FBQ3hELG1DQUFtQztRQUNuQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBZ0I7UUFDdkMsbUNBQW1DO1FBQ25DLE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsUUFBZ0IsRUFBRSxXQUF3RDtRQUN6RixtQ0FBbUM7UUFDbkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsV0FBVyxDQUFDLFNBQVMsZUFBZSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3JGLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQWdCLEVBQUUsU0FBaUI7UUFDckQsbUNBQW1DO1FBQ25DLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLFNBQVMsZUFBZSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzFFLENBQUM7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Q0FBQyxXQUFXO1NBQzFDLENBQUMsQ0FBQyxDQUFDO0lBQ04sQ0FBQztDQUNGO0FBckxELHdDQXFMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4vZHluYW1vZGIuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudFBlcnNvbmEsIFJlc3BvbnNlQ2h1bmtpbmcsIEdyZWV0aW5nQ29uZmlnIH0gZnJvbSAnLi4vY29uZmlnL3BlcnNvbmFzLmpzJztcbmltcG9ydCAqIGFzIHBlcnNvbmFzSnNvbiBmcm9tICcuLi9jb25maWcvcGVyc29uYXMuanNvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGFueUluZm8ge1xuICBuYW1lPzogc3RyaW5nO1xuICBpbmR1c3RyeT86IHN0cmluZztcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gIHByb2R1Y3RzPzogc3RyaW5nO1xuICBiZW5lZml0cz86IHN0cmluZztcbiAgdGFyZ2V0Q3VzdG9tZXJzPzogc3RyaW5nO1xuICBkaWZmZXJlbnRpYXRvcnM/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGVyc29uYUl0ZW0ge1xuICBQSzogc3RyaW5nOyAvLyBQRVJTT05BI3t0ZW5hbnRJZH1cbiAgU0s6IHN0cmluZzsgLy8ge3BlcnNvbmFJZH1cbiAgcGVyc29uYUlkOiBzdHJpbmc7XG4gIHRlbmFudElkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgc3lzdGVtUHJvbXB0OiBzdHJpbmc7XG4gIHBlcnNvbmFsaXR5OiB7XG4gICAgdG9uZTogc3RyaW5nO1xuICAgIHN0eWxlOiBzdHJpbmc7XG4gICAgbGFuZ3VhZ2VRdWlya3M/OiBzdHJpbmdbXTtcbiAgICBzcGVjaWFsQmVoYXZpb3JzPzogc3RyaW5nW107XG4gIH07XG4gIHJlc3BvbnNlR3VpZGVsaW5lczogc3RyaW5nW107XG4gIGdyZWV0aW5ncz86IEdyZWV0aW5nQ29uZmlnO1xuICByZXNwb25zZUNodW5raW5nPzogUmVzcG9uc2VDaHVua2luZztcbiAgaW50ZW50Q2FwdHVyaW5nPzogYW55OyAvLyBXaWxsIGJlIHByb3Blcmx5IHR5cGVkIHdoZW4gbmVlZGVkXG4gIG1ldGFkYXRhOiB7XG4gICAgY3JlYXRlZEF0OiBzdHJpbmc7XG4gICAgdXBkYXRlZEF0OiBzdHJpbmc7XG4gICAgdmVyc2lvbjogc3RyaW5nO1xuICAgIHRhZ3M/OiBzdHJpbmdbXTtcbiAgfTtcbiAgaXNBY3RpdmU6IGJvb2xlYW47XG59XG5cbi8qKlxuICogU2VydmljZSBmb3IgbWFuYWdpbmcgYWdlbnQgcGVyc29uYXMgaW4gRHluYW1vREJcbiAqL1xuZXhwb3J0IGNsYXNzIFBlcnNvbmFTZXJ2aWNlIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBkeW5hbW9TZXJ2aWNlOiBEeW5hbW9EQlNlcnZpY2UgfCBudWxsKSB7fVxuXG4gIC8qKlxuICAgKiBHZXQgcGVyc29uYSBmb3IgYSB0ZW5hbnQgKGZhbGxzIGJhY2sgdG8gZGVmYXVsdCBpZiBub3QgZm91bmQpXG4gICAqL1xuICBhc3luYyBnZXRQZXJzb25hKHRlbmFudElkOiBzdHJpbmcsIHBlcnNvbmFJZDogc3RyaW5nLCBjb21wYW55SW5mbz86IENvbXBhbnlJbmZvKTogUHJvbWlzZTxBZ2VudFBlcnNvbmE+IHtcbiAgICAvLyBGb3Igbm93LCBqdXN0IHJldHVybiBkZWZhdWx0IHBlcnNvbmFzIHdpdGggY29tcGFueSBuYW1lIHN1YnN0aXR1dGlvblxuICAgIC8vIFRPRE86IEltcGxlbWVudCBEeW5hbW9EQiBzdG9yYWdlIHdoZW4gbmVlZGVkXG4gICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdFBlcnNvbmEocGVyc29uYUlkLCBjb21wYW55SW5mbyk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRlbmFudC1zcGVjaWZpYyBwZXJzb25hIGZyb20gRHluYW1vREJcbiAgICogVE9ETzogSW1wbGVtZW50IHdoZW4gRHluYW1vREIgbWV0aG9kcyBhcmUgYXZhaWxhYmxlXG4gICAqL1xuICBhc3luYyBnZXRUZW5hbnRQZXJzb25hKHRlbmFudElkOiBzdHJpbmcsIHBlcnNvbmFJZDogc3RyaW5nKTogUHJvbWlzZTxQZXJzb25hSXRlbSB8IG51bGw+IHtcbiAgICAvLyBUT0RPOiBJbXBsZW1lbnQgRHluYW1vREIgc3RvcmFnZVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgYWxsIHBlcnNvbmFzIGZvciBhIHRlbmFudFxuICAgKiBUT0RPOiBJbXBsZW1lbnQgd2hlbiBEeW5hbW9EQiBtZXRob2RzIGFyZSBhdmFpbGFibGVcbiAgICovXG4gIGFzeW5jIGxpc3RUZW5hbnRQZXJzb25hcyh0ZW5hbnRJZDogc3RyaW5nKTogUHJvbWlzZTxQZXJzb25hSXRlbVtdPiB7XG4gICAgLy8gVE9ETzogSW1wbGVtZW50IER5bmFtb0RCIHN0b3JhZ2VcbiAgICByZXR1cm4gW107XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIG9yIHVwZGF0ZSBhIHBlcnNvbmEgZm9yIGEgdGVuYW50XG4gICAqIFRPRE86IEltcGxlbWVudCB3aGVuIER5bmFtb0RCIG1ldGhvZHMgYXJlIGF2YWlsYWJsZVxuICAgKi9cbiAgYXN5bmMgcHV0UGVyc29uYSh0ZW5hbnRJZDogc3RyaW5nLCBwZXJzb25hRGF0YTogT21pdDxQZXJzb25hSXRlbSwgJ1BLJyB8ICdTSycgfCAndGVuYW50SWQnPik6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIFRPRE86IEltcGxlbWVudCBEeW5hbW9EQiBzdG9yYWdlXG4gICAgY29uc29sZS5sb2coYFdvdWxkIHN0b3JlIHBlcnNvbmEgJHtwZXJzb25hRGF0YS5wZXJzb25hSWR9IGZvciB0ZW5hbnQgJHt0ZW5hbnRJZH1gKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgYSBwZXJzb25hIGZvciBhIHRlbmFudCAoc29mdCBkZWxldGUpXG4gICAqIFRPRE86IEltcGxlbWVudCB3aGVuIER5bmFtb0RCIG1ldGhvZHMgYXJlIGF2YWlsYWJsZVxuICAgKi9cbiAgYXN5bmMgZGVsZXRlUGVyc29uYSh0ZW5hbnRJZDogc3RyaW5nLCBwZXJzb25hSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIFRPRE86IEltcGxlbWVudCBEeW5hbW9EQiBzdG9yYWdlXG4gICAgY29uc29sZS5sb2coYFdvdWxkIGRlbGV0ZSBwZXJzb25hICR7cGVyc29uYUlkfSBmb3IgdGVuYW50ICR7dGVuYW50SWR9YCk7XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSBkZWZhdWx0IHBlcnNvbmFzIGZvciBhIHRlbmFudFxuICAgKi9cbiAgYXN5bmMgaW5pdGlhbGl6ZURlZmF1bHRQZXJzb25hcyh0ZW5hbnRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZGVmYXVsdFBlcnNvbmFzID0gT2JqZWN0LmVudHJpZXMocGVyc29uYXNKc29uKTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IFtwZXJzb25hSWQsIHBlcnNvbmFDb25maWddIG9mIGRlZmF1bHRQZXJzb25hcykge1xuICAgICAgY29uc3QgY29uZmlnID0gcGVyc29uYUNvbmZpZyBhcyBhbnk7XG4gICAgICBjb25zdCBwZXJzb25hSXRlbTogT21pdDxQZXJzb25hSXRlbSwgJ1BLJyB8ICdTSycgfCAndGVuYW50SWQnPiA9IHtcbiAgICAgICAgcGVyc29uYUlkLFxuICAgICAgICBuYW1lOiBjb25maWcubmFtZSxcbiAgICAgICAgZGVzY3JpcHRpb246IGNvbmZpZy5kZXNjcmlwdGlvbixcbiAgICAgICAgc3lzdGVtUHJvbXB0OiBjb25maWcuc3lzdGVtUHJvbXB0LFxuICAgICAgICBwZXJzb25hbGl0eTogY29uZmlnLnBlcnNvbmFsaXR5LFxuICAgICAgICByZXNwb25zZUd1aWRlbGluZXM6IGNvbmZpZy5yZXNwb25zZUd1aWRlbGluZXMsXG4gICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgLi4uY29uZmlnLm1ldGFkYXRhLFxuICAgICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IHRoaXMucHV0UGVyc29uYSh0ZW5hbnRJZCwgcGVyc29uYUl0ZW0pO1xuICAgIH1cbiAgfVxuXG5cbiAgLyoqXG4gICAqIEdldCBkZWZhdWx0IHBlcnNvbmEgZnJvbSBKU09OIGNvbmZpZ1xuICAgKi9cbiAgcHVibGljIGdldERlZmF1bHRQZXJzb25hKHBlcnNvbmFJZDogc3RyaW5nLCBjb21wYW55SW5mbz86IENvbXBhbnlJbmZvKTogQWdlbnRQZXJzb25hIHtcbiAgICBjb25zdCBwZXJzb25hID0gcGVyc29uYXNKc29uW3BlcnNvbmFJZCBhcyBrZXlvZiB0eXBlb2YgcGVyc29uYXNKc29uXTtcbiAgICBpZiAoIXBlcnNvbmEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwZXJzb25hOiAke3BlcnNvbmFJZH0uIEF2YWlsYWJsZSBwZXJzb25hczogJHtPYmplY3Qua2V5cyhwZXJzb25hc0pzb24pLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIGxldCBzeXN0ZW1Qcm9tcHQgPSBwZXJzb25hLnN5c3RlbVByb21wdDtcbiAgICBcbiAgICAvLyBSZXBsYWNlIGNvbXBhbnkgcGxhY2Vob2xkZXJzXG4gICAgaWYgKGNvbXBhbnlJbmZvKSB7XG4gICAgICBzeXN0ZW1Qcm9tcHQgPSBzeXN0ZW1Qcm9tcHRcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csIGNvbXBhbnlJbmZvLm5hbWUgfHwgJ0t4R2VuJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlJbmR1c3RyeVxcfVxcfS9nLCBjb21wYW55SW5mby5pbmR1c3RyeSB8fCAnTGVhZCBNYW5hZ2VtZW50JylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEZXNjcmlwdGlvblxcfVxcfS9nLCBjb21wYW55SW5mby5kZXNjcmlwdGlvbiB8fCAnQSBjb21wcmVoZW5zaXZlIGxlYWQgbWFuYWdlbWVudCBwbGF0Zm9ybScpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55UHJvZHVjdHNcXH1cXH0vZywgY29tcGFueUluZm8ucHJvZHVjdHMgfHwgJ0xlYWQgY2FwdHVyZSwgbnVydHVyaW5nLCBhbmQgY29udmVyc2lvbiB0b29scycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgY29tcGFueUluZm8uYmVuZWZpdHMgfHwgJ0luY3JlYXNlZCBjb252ZXJzaW9uIHJhdGVzIGFuZCBzdHJlYW1saW5lZCBzYWxlcyBwcm9jZXNzZXMnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVRhcmdldEN1c3RvbWVyc1xcfVxcfS9nLCBjb21wYW55SW5mby50YXJnZXRDdXN0b21lcnMgfHwgJ1NtYWxsIHRvIG1lZGl1bSBidXNpbmVzc2VzJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEaWZmZXJlbnRpYXRvcnNcXH1cXH0vZywgY29tcGFueUluZm8uZGlmZmVyZW50aWF0b3JzIHx8ICdFYXN5LXRvLXVzZSBpbnRlcmZhY2Ugd2l0aCBwb3dlcmZ1bCBhdXRvbWF0aW9uJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZmF1bHQgdmFsdWVzIC0gdXNlIFBsYW5ldCBGaXRuZXNzIGluZm9cbiAgICAgIHN5c3RlbVByb21wdCA9IHN5c3RlbVByb21wdFxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueU5hbWVcXH1cXH0vZywgJ1BsYW5ldCBGaXRuZXNzJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlJbmR1c3RyeVxcfVxcfS9nLCAnQmlnIEJveCBHeW1zJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEZXNjcmlwdGlvblxcfVxcfS9nLCAnUGxhbmV0IEZpdG5lc3MgaXMgYSBnbG9iYWwgZnJhbmNoaXNvciBhbmQgb3BlcmF0b3Igb2YgZml0bmVzcyBjZW50ZXJzIGtub3duIGFzIGEgXCJKdWRnZW1lbnQgRnJlZSBab25lXCIgZm9yIGNhc3VhbCBneW0tZ29lcnMsIG9mZmVyaW5nIGEgdmFyaWV0eSBvZiBjYXJkaW8gYW5kIHN0cmVuZ3RoIGVxdWlwbWVudCwgY2lyY3VpdCB0cmFpbmluZyBhcmVhcywgYW5kIGZyZWUgZml0bmVzcyBpbnN0cnVjdGlvbiB0aHJvdWdoIGl0cyBQRUBQRiBwcm9ncmFtLiBNZW1iZXJzIGNhbiBjaG9vc2UgYmV0d2VlbiBzdGFuZGFyZCBhbmQgQmxhY2sgQ2FyZCBtZW1iZXJzaGlwcyB3aXRoIGRpZmZlcmVudCBhbWVuaXRpZXMgYW5kIHBlcmtzLCBpbmNsdWRpbmcgYWNjZXNzIHRvIGZlYXR1cmVzIGxpa2UgYSAzMC1taW51dGUgd29ya291dCBjaXJjdWl0LCBhIGZ1bmN0aW9uYWwgZml0bmVzcyBhcmVhIHdpdGggZXF1aXBtZW50IGxpa2UgVFJYIGFuZCBrZXR0bGViZWxscywgYW5kIHNwYSBhcmVhcyBsaWtlIHRoZSBXZWxsbmVzcyBQb2QgYXQgc29tZSBsb2NhdGlvbnMnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVByb2R1Y3RzXFx9XFx9L2csICdCaWcgZml0bmVzcyBidXQgYWxzbyBoYXMgYXBwYXJyZWwsIGNvZmZlZSwgYW5kIGEgY2FmZScpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgJ09ubHkgJDEwIGEgbW9udGgnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVRhcmdldEN1c3RvbWVyc1xcfVxcfS9nLCAnUGVvcGxlIHdobyBzZWVrIHZhbHVlJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEaWZmZXJlbnRpYXRvcnNcXH1cXH0vZywgJ0Jlc3QgcHJpY2VzJyk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBwZXJzb25hLm5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogcGVyc29uYS5kZXNjcmlwdGlvbixcbiAgICAgIHN5c3RlbVByb21wdCxcbiAgICAgIHBlcnNvbmFsaXR5OiBwZXJzb25hLnBlcnNvbmFsaXR5LFxuICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBwZXJzb25hLnJlc3BvbnNlR3VpZGVsaW5lcyxcbiAgICAgIGdyZWV0aW5nczogcGVyc29uYS5ncmVldGluZ3MgYXMgYW55LFxuICAgICAgcmVzcG9uc2VDaHVua2luZzogcGVyc29uYS5yZXNwb25zZUNodW5raW5nIGFzIFJlc3BvbnNlQ2h1bmtpbmcgfCB1bmRlZmluZWQsXG4gICAgICBpbnRlbnRDYXB0dXJpbmc6IChwZXJzb25hIGFzIGFueSkuaW50ZW50Q2FwdHVyaW5nLFxuICAgICAgZ29hbENvbmZpZ3VyYXRpb246IChwZXJzb25hIGFzIGFueSkuZ29hbENvbmZpZ3VyYXRpb24sXG4gICAgICBhY3Rpb25UYWdzOiAocGVyc29uYSBhcyBhbnkpLmFjdGlvblRhZ3MsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IFBlcnNvbmFJdGVtIHRvIEFnZW50UGVyc29uYVxuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0VG9BZ2VudFBlcnNvbmEoaXRlbTogUGVyc29uYUl0ZW0sIGNvbXBhbnlJbmZvPzogQ29tcGFueUluZm8pOiBBZ2VudFBlcnNvbmEge1xuICAgIGxldCBzeXN0ZW1Qcm9tcHQgPSBpdGVtLnN5c3RlbVByb21wdDtcbiAgICBcbiAgICAvLyBSZXBsYWNlIGNvbXBhbnkgcGxhY2Vob2xkZXJzIChzYW1lIGxvZ2ljIGFzIGdldERlZmF1bHRQZXJzb25hKVxuICAgIGlmIChjb21wYW55SW5mbykge1xuICAgICAgc3lzdGVtUHJvbXB0ID0gc3lzdGVtUHJvbXB0XG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55TmFtZVxcfVxcfS9nLCBjb21wYW55SW5mby5uYW1lIHx8ICdLeEdlbicpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgY29tcGFueUluZm8uaW5kdXN0cnkgfHwgJ0xlYWQgTWFuYWdlbWVudCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgY29tcGFueUluZm8uZGVzY3JpcHRpb24gfHwgJ0EgY29tcHJlaGVuc2l2ZSBsZWFkIG1hbmFnZW1lbnQgcGxhdGZvcm0nKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVByb2R1Y3RzXFx9XFx9L2csIGNvbXBhbnlJbmZvLnByb2R1Y3RzIHx8ICdMZWFkIGNhcHR1cmUsIG51cnR1cmluZywgYW5kIGNvbnZlcnNpb24gdG9vbHMnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUJlbmVmaXRzXFx9XFx9L2csIGNvbXBhbnlJbmZvLmJlbmVmaXRzIHx8ICdJbmNyZWFzZWQgY29udmVyc2lvbiByYXRlcyBhbmQgc3RyZWFtbGluZWQgc2FsZXMgcHJvY2Vzc2VzJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgY29tcGFueUluZm8udGFyZ2V0Q3VzdG9tZXJzIHx8ICdTbWFsbCB0byBtZWRpdW0gYnVzaW5lc3NlcycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGlmZmVyZW50aWF0b3JzXFx9XFx9L2csIGNvbXBhbnlJbmZvLmRpZmZlcmVudGlhdG9ycyB8fCAnRWFzeS10by11c2UgaW50ZXJmYWNlIHdpdGggcG93ZXJmdWwgYXV0b21hdGlvbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzeXN0ZW1Qcm9tcHQgPSBzeXN0ZW1Qcm9tcHRcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csICdQbGFuZXQgRml0bmVzcycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgJ0JpZyBCb3ggR3ltcycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgJ1BsYW5ldCBGaXRuZXNzIGlzIGEgZ2xvYmFsIGZyYW5jaGlzb3IgYW5kIG9wZXJhdG9yIG9mIGZpdG5lc3MgY2VudGVycyBrbm93biBhcyBhIFwiSnVkZ2VtZW50IEZyZWUgWm9uZVwiIGZvciBjYXN1YWwgZ3ltLWdvZXJzLCBvZmZlcmluZyBhIHZhcmlldHkgb2YgY2FyZGlvIGFuZCBzdHJlbmd0aCBlcXVpcG1lbnQsIGNpcmN1aXQgdHJhaW5pbmcgYXJlYXMsIGFuZCBmcmVlIGZpdG5lc3MgaW5zdHJ1Y3Rpb24gdGhyb3VnaCBpdHMgUEVAUEYgcHJvZ3JhbS4gTWVtYmVycyBjYW4gY2hvb3NlIGJldHdlZW4gc3RhbmRhcmQgYW5kIEJsYWNrIENhcmQgbWVtYmVyc2hpcHMgd2l0aCBkaWZmZXJlbnQgYW1lbml0aWVzIGFuZCBwZXJrcywgaW5jbHVkaW5nIGFjY2VzcyB0byBmZWF0dXJlcyBsaWtlIGEgMzAtbWludXRlIHdvcmtvdXQgY2lyY3VpdCwgYSBmdW5jdGlvbmFsIGZpdG5lc3MgYXJlYSB3aXRoIGVxdWlwbWVudCBsaWtlIFRSWCBhbmQga2V0dGxlYmVsbHMsIGFuZCBzcGEgYXJlYXMgbGlrZSB0aGUgV2VsbG5lc3MgUG9kIGF0IHNvbWUgbG9jYXRpb25zJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlQcm9kdWN0c1xcfVxcfS9nLCAnQmlnIGZpdG5lc3MgYnV0IGFsc28gaGFzIGFwcGFycmVsLCBjb2ZmZWUsIGFuZCBhIGNhZmUnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUJlbmVmaXRzXFx9XFx9L2csICdPbmx5ICQxMCBhIG1vbnRoJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgJ1Blb3BsZSB3aG8gc2VlayB2YWx1ZScpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGlmZmVyZW50aWF0b3JzXFx9XFx9L2csICdCZXN0IHByaWNlcycpO1xuICAgIH1cbiAgICAgIFxuICAgIHJldHVybiB7XG4gICAgICBuYW1lOiBpdGVtLm5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcbiAgICAgIHN5c3RlbVByb21wdCxcbiAgICAgIHBlcnNvbmFsaXR5OiBpdGVtLnBlcnNvbmFsaXR5LFxuICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBpdGVtLnJlc3BvbnNlR3VpZGVsaW5lcyxcbiAgICAgIGdyZWV0aW5nczogaXRlbS5ncmVldGluZ3MsXG4gICAgICByZXNwb25zZUNodW5raW5nOiBpdGVtLnJlc3BvbnNlQ2h1bmtpbmcsXG4gICAgICBpbnRlbnRDYXB0dXJpbmc6IGl0ZW0uaW50ZW50Q2FwdHVyaW5nLFxuICAgICAgZ29hbENvbmZpZ3VyYXRpb246IChpdGVtIGFzIGFueSkuZ29hbENvbmZpZ3VyYXRpb24sXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgRHluYW1vREIgcGFydGl0aW9uIGtleSBmb3IgcGVyc29uYXNcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlUGVyc29uYVBLKHRlbmFudElkOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBgUEVSU09OQSMke3RlbmFudElkfWA7XG4gIH1cblxuICAvKipcbiAgICogTGlzdCBhdmFpbGFibGUgZGVmYXVsdCBwZXJzb25hc1xuICAgKi9cbiAgc3RhdGljIGxpc3REZWZhdWx0UGVyc29uYXMoKTogQXJyYXk8e2lkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZ30+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocGVyc29uYXNKc29uKS5tYXAoKFtpZCwgcGVyc29uYV0pID0+ICh7XG4gICAgICBpZCxcbiAgICAgIG5hbWU6IChwZXJzb25hIGFzIGFueSkubmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAocGVyc29uYSBhcyBhbnkpLmRlc2NyaXB0aW9uXG4gICAgfSkpO1xuICB9XG59XG4iXX0=