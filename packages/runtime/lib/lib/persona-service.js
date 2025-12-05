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
            // Default values - use KxGrynde Fitness info
            systemPrompt = systemPrompt
                .replace(/\{\{companyName\}\}/g, 'KxGrynde Fitness')
                .replace(/\{\{companyIndustry\}\}/g, 'Fitness & Wellness')
                .replace(/\{\{companyDescription\}\}/g, 'Premium fitness center offering personalized training, group classes, and wellness programs')
                .replace(/\{\{companyProducts\}\}/g, 'Personal Training, Group Fitness Classes, Nutrition Coaching, Wellness Programs, Equipment Training')
                .replace(/\{\{companyBenefits\}\}/g, 'Personalized fitness programs, expert coaching, state-of-the-art equipment')
                .replace(/\{\{companyTargetCustomers\}\}/g, 'Fitness enthusiasts seeking personalized coaching and premium facilities')
                .replace(/\{\{companyDifferentiators\}\}/g, 'Personalized approach with holistic wellness focus');
        }
        return {
            name: persona.name,
            description: persona.description,
            systemPrompt,
            personality: persona.personality,
            responseGuidelines: persona.responseGuidelines,
            greetings: persona.greetingConfig || persona.greetings,
            responseChunking: persona.responseChunking,
            intentCapturing: persona.intentCapturing,
            goalConfiguration: persona.goalConfiguration,
            actionTags: persona.actionTags,
            personalityTraits: persona.personalityTraits,
        };
    }
    /**
     * Convert PersonaItem to AgentPersona
     */
    // private convertToAgentPersona(item: PersonaItem, companyInfo?: CompanyInfo): AgentPersona {
    //   let systemPrompt = item.systemPrompt;
    //   // Replace company placeholders (same logic as getDefaultPersona)
    //   if (companyInfo) {
    //     systemPrompt = systemPrompt
    //       .replace(/\{\{companyName\}\}/g, companyInfo.name || 'KxGen')
    //       .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Lead Management')
    //       .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'A comprehensive lead management platform')
    //       .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Lead capture, nurturing, and conversion tools')
    //       .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Increased conversion rates and streamlined sales processes')
    //       .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'Small to medium businesses')
    //       .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Easy-to-use interface with powerful automation');
    //   } else {
    //     systemPrompt = systemPrompt
    //       .replace(/\{\{companyName\}\}/g, 'Planet Fitness')
    //       .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
    //       .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers, offering a variety of cardio and strength equipment, circuit training areas, and free fitness instruction through its PE@PF program. Members can choose between standard and Black Card memberships with different amenities and perks, including access to features like a 30-minute workout circuit, a functional fitness area with equipment like TRX and kettlebells, and spa areas like the Wellness Pod at some locations')
    //       .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
    //       .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
    //       .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
    //       .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
    //   }
    //   return {
    //     name: item.name,
    //     description: item.description,
    //     systemPrompt,
    //     personality: item.personality,
    //     responseGuidelines: item.responseGuidelines,
    //     greetings: item.greetings,
    //     responseChunking: item.responseChunking,
    //     intentCapturing: item.intentCapturing,
    //     goalConfiguration: (item as any).goalConfiguration,
    //   };
    // }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYS1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9wZXJzb25hLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsc0VBQXdEO0FBNEd4RDs7R0FFRztBQUNILE1BQWEsY0FBYztJQUN6QixZQUFvQixhQUFxQztRQUFyQyxrQkFBYSxHQUFiLGFBQWEsQ0FBd0I7SUFBRyxDQUFDO0lBRTdEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFVBQVUsQ0FBQyxRQUFnQixFQUFFLFNBQWlCLEVBQUUsV0FBeUI7UUFDN0UsdUVBQXVFO1FBQ3ZFLCtDQUErQztRQUMvQyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUtEOztPQUVHO0lBQ0ksaUJBQWlCLENBQUMsU0FBaUIsRUFBRSxXQUF5QjtRQUNuRSxNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsU0FBc0MsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLFNBQVMseUJBQXlCLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoSCxDQUFDO1FBR0QsSUFBSSxZQUFZLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUV4QywrQkFBK0I7UUFDL0IsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQixZQUFZLEdBQUcsWUFBWTtpQkFDeEIsT0FBTyxDQUFDLHNCQUFzQixFQUFFLFdBQVcsQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDO2lCQUM1RCxPQUFPLENBQUMsMEJBQTBCLEVBQUUsV0FBVyxDQUFDLFFBQVEsSUFBSSxpQkFBaUIsQ0FBQztpQkFDOUUsT0FBTyxDQUFDLDZCQUE2QixFQUFFLFdBQVcsQ0FBQyxXQUFXLElBQUksMENBQTBDLENBQUM7aUJBQzdHLE9BQU8sQ0FBQywwQkFBMEIsRUFBRSxXQUFXLENBQUMsUUFBUSxJQUFJLCtDQUErQyxDQUFDO2lCQUM1RyxPQUFPLENBQUMsMEJBQTBCLEVBQUUsV0FBVyxDQUFDLFFBQVEsSUFBSSw0REFBNEQsQ0FBQztpQkFDekgsT0FBTyxDQUFDLGlDQUFpQyxFQUFFLFdBQVcsQ0FBQyxlQUFlLElBQUksNEJBQTRCLENBQUM7aUJBQ3ZHLE9BQU8sQ0FBQyxpQ0FBaUMsRUFBRSxXQUFXLENBQUMsZUFBZSxJQUFJLGdEQUFnRCxDQUFDLENBQUM7UUFDakksQ0FBQzthQUFNLENBQUM7WUFDTiw2Q0FBNkM7WUFDN0MsWUFBWSxHQUFHLFlBQVk7aUJBQ3hCLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxrQkFBa0IsQ0FBQztpQkFDbkQsT0FBTyxDQUFDLDBCQUEwQixFQUFFLG9CQUFvQixDQUFDO2lCQUN6RCxPQUFPLENBQUMsNkJBQTZCLEVBQUUsNkZBQTZGLENBQUM7aUJBQ3JJLE9BQU8sQ0FBQywwQkFBMEIsRUFBRSxxR0FBcUcsQ0FBQztpQkFDMUksT0FBTyxDQUFDLDBCQUEwQixFQUFFLDRFQUE0RSxDQUFDO2lCQUNqSCxPQUFPLENBQUMsaUNBQWlDLEVBQUUsMEVBQTBFLENBQUM7aUJBQ3RILE9BQU8sQ0FBQyxpQ0FBaUMsRUFBRSxvREFBb0QsQ0FBQyxDQUFDO1FBQ3RHLENBQUM7UUFFRCxPQUFPO1lBQ0wsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVztZQUNoQyxZQUFZO1lBQ1osV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXO1lBQ2hDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxrQkFBeUI7WUFDckQsU0FBUyxFQUFHLE9BQWUsQ0FBQyxjQUFjLElBQUssT0FBZSxDQUFDLFNBQVM7WUFDeEUsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLGdCQUFnRDtZQUMxRSxlQUFlLEVBQUcsT0FBZSxDQUFDLGVBQWU7WUFDakQsaUJBQWlCLEVBQUcsT0FBZSxDQUFDLGlCQUFpQjtZQUNyRCxVQUFVLEVBQUcsT0FBZSxDQUFDLFVBQVU7WUFDdkMsaUJBQWlCLEVBQUcsT0FBZSxDQUFDLGlCQUFpQjtTQUN0RCxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsOEZBQThGO0lBQzlGLDBDQUEwQztJQUUxQyxzRUFBc0U7SUFDdEUsdUJBQXVCO0lBQ3ZCLGtDQUFrQztJQUNsQyxzRUFBc0U7SUFDdEUsd0ZBQXdGO0lBQ3hGLHVIQUF1SDtJQUN2SCxzSEFBc0g7SUFDdEgsbUlBQW1JO0lBQ25JLGlIQUFpSDtJQUNqSCxzSUFBc0k7SUFDdEksYUFBYTtJQUNiLGtDQUFrQztJQUNsQywyREFBMkQ7SUFDM0QsNkRBQTZEO0lBQzdELGdsQkFBZ2xCO0lBQ2hsQixzR0FBc0c7SUFDdEcsaUVBQWlFO0lBQ2pFLDZFQUE2RTtJQUM3RSxvRUFBb0U7SUFDcEUsTUFBTTtJQUVOLGFBQWE7SUFDYix1QkFBdUI7SUFDdkIscUNBQXFDO0lBQ3JDLG9CQUFvQjtJQUNwQixxQ0FBcUM7SUFDckMsbURBQW1EO0lBQ25ELGlDQUFpQztJQUNqQywrQ0FBK0M7SUFDL0MsNkNBQTZDO0lBQzdDLDBEQUEwRDtJQUMxRCxPQUFPO0lBQ1AsSUFBSTtJQUVKOztPQUVHO0lBQ0ssZUFBZSxDQUFDLFFBQWdCO1FBQ3RDLE9BQU8sV0FBVyxRQUFRLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsbUJBQW1CO1FBQ3hCLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMxRCxFQUFFO1lBQ0YsSUFBSSxFQUFHLE9BQWUsQ0FBQyxJQUFJO1lBQzNCLFdBQVcsRUFBRyxPQUFlLENBQUMsV0FBVztTQUMxQyxDQUFDLENBQUMsQ0FBQztJQUNOLENBQUM7Q0FDRjtBQXpIRCx3Q0F5SEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuL2R5bmFtb2RiLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRQZXJzb25hLCBSZXNwb25zZUNodW5raW5nLCBHcmVldGluZ0NvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9wZXJzb25hcy5qcyc7XG5pbXBvcnQgKiBhcyBwZXJzb25hc0pzb24gZnJvbSAnLi4vY29uZmlnL3BlcnNvbmFzLmpzb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb21vdGlvbiB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHVyZ2VuY3lNZXNzYWdlPzogc3RyaW5nOyAvLyBlLmcuLCBcIlNpZ24gdXAgbm93IGFuZCBnZXQuLi5cIlxuICBkaXNjb3VudD86IHN0cmluZzsgLy8gZS5nLiwgXCI1MCUgb2ZmXCIsIFwiJDEwMCBvZmZcIlxuICB2YWxpZFVudGlsOiBzdHJpbmc7IC8vIElTTyBkYXRlIHN0cmluZ1xuICBjb25kaXRpb25zPzogc3RyaW5nW107IC8vIGUuZy4sIFtcIkZpcnN0LXRpbWUgbWVtYmVycyBvbmx5XCIsIFwiTXVzdCBzaWduIHVwIGJ5IGVuZCBvZiBtb250aFwiXVxuICBhcHBsaWNhYmxlUGxhbnM/OiBzdHJpbmdbXTsgLy8gSURzIG9mIHBsYW5zIHRoaXMgcHJvbW8gYXBwbGllcyB0b1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByaWNpbmdQbGFuIHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBwcmljZTogc3RyaW5nOyAvLyBlLmcuLCBcIiQ0OS9tb250aFwiLCBcIiQ1MDAveWVhclwiXG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBmZWF0dXJlczogc3RyaW5nW107XG4gIHBvcHVsYXI/OiBib29sZWFuOyAvLyBIaWdobGlnaHQgYXMgXCJtb3N0IHBvcHVsYXJcIlxuICBjdGE/OiBzdHJpbmc7IC8vIENhbGwgdG8gYWN0aW9uLCBlLmcuLCBcIkdldCBTdGFydGVkXCIsIFwiSm9pbiBOb3dcIlxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBhbnlJbmZvIHtcbiAgbmFtZT86IHN0cmluZztcbiAgaW5kdXN0cnk/OiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuICBwcm9kdWN0cz86IHN0cmluZztcbiAgc2VydmljZXM/OiBzdHJpbmdbXTtcbiAgYmVuZWZpdHM/OiBzdHJpbmc7XG4gIHRhcmdldEN1c3RvbWVycz86IHN0cmluZztcbiAgZGlmZmVyZW50aWF0b3JzPzogc3RyaW5nO1xuICBwaG9uZT86IHN0cmluZztcbiAgZW1haWw/OiBzdHJpbmc7XG4gIHdlYnNpdGU/OiBzdHJpbmc7XG4gIGFkZHJlc3M/OiB7XG4gICAgc3RyZWV0Pzogc3RyaW5nO1xuICAgIGNpdHk/OiBzdHJpbmc7XG4gICAgc3RhdGU/OiBzdHJpbmc7XG4gICAgemlwQ29kZT86IHN0cmluZztcbiAgICBjb3VudHJ5Pzogc3RyaW5nO1xuICB9O1xuICBidXNpbmVzc0hvdXJzPzoge1xuICAgIG1vbmRheT86IEFycmF5PHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nIH0+O1xuICAgIHR1ZXNkYXk/OiBBcnJheTx7IGZyb206IHN0cmluZzsgdG86IHN0cmluZyB9PjtcbiAgICB3ZWRuZXNkYXk/OiBBcnJheTx7IGZyb206IHN0cmluZzsgdG86IHN0cmluZyB9PjtcbiAgICB0aHVyc2RheT86IEFycmF5PHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nIH0+O1xuICAgIGZyaWRheT86IEFycmF5PHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nIH0+O1xuICAgIHNhdHVyZGF5PzogQXJyYXk8eyBmcm9tOiBzdHJpbmc7IHRvOiBzdHJpbmcgfT47XG4gICAgc3VuZGF5PzogQXJyYXk8eyBmcm9tOiBzdHJpbmc7IHRvOiBzdHJpbmcgfT47XG4gIH07XG4gIHByaWNpbmc/OiB7XG4gICAgcGxhbnM6IFByaWNpbmdQbGFuW107XG4gICAgY3VzdG9tUHJpY2luZ0F2YWlsYWJsZT86IGJvb2xlYW47XG4gICAgY29udGFjdEZvclByaWNpbmc/OiBib29sZWFuOyAvLyBJZiB0cnVlLCBhZ2VudCBzaG91bGQgY29sbGVjdCBjb250YWN0IGluZm8gYmVmb3JlIHNoYXJpbmcgZGV0YWlsZWQgcHJpY2luZ1xuICB9O1xuICBwcm9tb3Rpb25zPzogUHJvbW90aW9uW107XG4gIGdvYWxDb25maWd1cmF0aW9uPzogYW55OyAvLyBJbXBvcnQgZnJvbSBkeW5hbW9kYi1zY2hlbWFzIGlmIG5lZWRlZFxuICByZXNwb25zZUd1aWRlbGluZXM/OiB7XG4gICAgY29udGFjdFBvbGljeT86IHtcbiAgICAgIGFsbG93QmFzaWNJbmZvV2l0aG91dENvbnRhY3Q/OiBib29sZWFuO1xuICAgICAgcmVxdWlyZUNvbnRhY3RGb3JEZXRhaWxzPzogYm9vbGVhbjtcbiAgICB9O1xuICAgIGluZm9ybWF0aW9uQ2F0ZWdvcmllcz86IEFycmF5PHtcbiAgICAgIGlkOiBzdHJpbmc7XG4gICAgICBsYWJlbDogc3RyaW5nO1xuICAgICAgY29sdW1uOiAnYWx3YXlzJyB8ICdyZXF1aXJlJyB8ICduZXZlcic7XG4gICAgfT47XG4gICAgc2hhcmluZ1Blcm1pc3Npb25zPzoge1xuICAgICAgYWx3YXlzQWxsb3dlZD86IHN0cmluZ1tdO1xuICAgICAgcmVxdWlyZXNDb250YWN0Pzogc3RyaW5nW107XG4gICAgICBuZXZlclNoYXJlPzogc3RyaW5nW107XG4gICAgICBkZWZhdWx0UGVybWlzc2lvbj86ICdhbHdheXNfYWxsb3dlZCcgfCAnY29udGFjdF9yZXF1aXJlZCcgfCAnbmV2ZXJfc2hhcmUnO1xuICAgICAgLy8gTGVnYWN5IGZvcm1hdCBzdXBwb3J0XG4gICAgICBhbGxvd2VkVmFsdWVzPzogc3RyaW5nW107XG4gICAgICBkZWZhdWx0Pzogc3RyaW5nO1xuICAgICAgb3ZlcnJpZGVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICB9O1xuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBlcnNvbmFJdGVtIHtcbiAgUEs6IHN0cmluZzsgLy8gUEVSU09OQSN7dGVuYW50SWR9XG4gIFNLOiBzdHJpbmc7IC8vIHtwZXJzb25hSWR9XG4gIHBlcnNvbmFJZDogc3RyaW5nO1xuICB0ZW5hbnRJZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHN5c3RlbVByb21wdDogc3RyaW5nO1xuICBwZXJzb25hbGl0eToge1xuICAgIHRvbmU6IHN0cmluZztcbiAgICBzdHlsZTogc3RyaW5nO1xuICAgIGxhbmd1YWdlUXVpcmtzPzogc3RyaW5nW107XG4gICAgc3BlY2lhbEJlaGF2aW9ycz86IHN0cmluZ1tdO1xuICB9O1xuICByZXNwb25zZUd1aWRlbGluZXM6IHN0cmluZ1tdO1xuICBncmVldGluZ3M/OiBHcmVldGluZ0NvbmZpZztcbiAgcmVzcG9uc2VDaHVua2luZz86IFJlc3BvbnNlQ2h1bmtpbmc7XG4gIGludGVudENhcHR1cmluZz86IGFueTsgLy8gV2lsbCBiZSBwcm9wZXJseSB0eXBlZCB3aGVuIG5lZWRlZFxuICBtZXRhZGF0YToge1xuICAgIGNyZWF0ZWRBdDogc3RyaW5nO1xuICAgIHVwZGF0ZWRBdDogc3RyaW5nO1xuICAgIHZlcnNpb246IHN0cmluZztcbiAgICB0YWdzPzogc3RyaW5nW107XG4gIH07XG4gIGlzQWN0aXZlOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFNlcnZpY2UgZm9yIG1hbmFnaW5nIGFnZW50IHBlcnNvbmFzIGluIER5bmFtb0RCXG4gKi9cbmV4cG9ydCBjbGFzcyBQZXJzb25hU2VydmljZSB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZHluYW1vU2VydmljZTogRHluYW1vREJTZXJ2aWNlIHwgbnVsbCkge31cblxuICAvKipcbiAgICogR2V0IHBlcnNvbmEgZm9yIGEgdGVuYW50IChmYWxscyBiYWNrIHRvIGRlZmF1bHQgaWYgbm90IGZvdW5kKVxuICAgKi9cbiAgYXN5bmMgZ2V0UGVyc29uYSh0ZW5hbnRJZDogc3RyaW5nLCBwZXJzb25hSWQ6IHN0cmluZywgY29tcGFueUluZm8/OiBDb21wYW55SW5mbyk6IFByb21pc2U8QWdlbnRQZXJzb25hPiB7XG4gICAgLy8gRm9yIG5vdywganVzdCByZXR1cm4gZGVmYXVsdCBwZXJzb25hcyB3aXRoIGNvbXBhbnkgbmFtZSBzdWJzdGl0dXRpb25cbiAgICAvLyBUT0RPOiBJbXBsZW1lbnQgRHluYW1vREIgc3RvcmFnZSB3aGVuIG5lZWRlZFxuICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRQZXJzb25hKHBlcnNvbmFJZCwgY29tcGFueUluZm8pO1xuICB9XG5cblxuXG5cbiAgLyoqXG4gICAqIEdldCBkZWZhdWx0IHBlcnNvbmEgZnJvbSBKU09OIGNvbmZpZ1xuICAgKi9cbiAgcHVibGljIGdldERlZmF1bHRQZXJzb25hKHBlcnNvbmFJZDogc3RyaW5nLCBjb21wYW55SW5mbz86IENvbXBhbnlJbmZvKTogQWdlbnRQZXJzb25hIHtcbiAgICBjb25zdCBwZXJzb25hID0gcGVyc29uYXNKc29uW3BlcnNvbmFJZCBhcyBrZXlvZiB0eXBlb2YgcGVyc29uYXNKc29uXTtcbiAgICBpZiAoIXBlcnNvbmEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBwZXJzb25hOiAke3BlcnNvbmFJZH0uIEF2YWlsYWJsZSBwZXJzb25hczogJHtPYmplY3Qua2V5cyhwZXJzb25hc0pzb24pLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIGxldCBzeXN0ZW1Qcm9tcHQgPSBwZXJzb25hLnN5c3RlbVByb21wdDtcbiAgICBcbiAgICAvLyBSZXBsYWNlIGNvbXBhbnkgcGxhY2Vob2xkZXJzXG4gICAgaWYgKGNvbXBhbnlJbmZvKSB7XG4gICAgICBzeXN0ZW1Qcm9tcHQgPSBzeXN0ZW1Qcm9tcHRcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csIGNvbXBhbnlJbmZvLm5hbWUgfHwgJ0t4R2VuJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlJbmR1c3RyeVxcfVxcfS9nLCBjb21wYW55SW5mby5pbmR1c3RyeSB8fCAnTGVhZCBNYW5hZ2VtZW50JylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEZXNjcmlwdGlvblxcfVxcfS9nLCBjb21wYW55SW5mby5kZXNjcmlwdGlvbiB8fCAnQSBjb21wcmVoZW5zaXZlIGxlYWQgbWFuYWdlbWVudCBwbGF0Zm9ybScpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55UHJvZHVjdHNcXH1cXH0vZywgY29tcGFueUluZm8ucHJvZHVjdHMgfHwgJ0xlYWQgY2FwdHVyZSwgbnVydHVyaW5nLCBhbmQgY29udmVyc2lvbiB0b29scycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgY29tcGFueUluZm8uYmVuZWZpdHMgfHwgJ0luY3JlYXNlZCBjb252ZXJzaW9uIHJhdGVzIGFuZCBzdHJlYW1saW5lZCBzYWxlcyBwcm9jZXNzZXMnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVRhcmdldEN1c3RvbWVyc1xcfVxcfS9nLCBjb21wYW55SW5mby50YXJnZXRDdXN0b21lcnMgfHwgJ1NtYWxsIHRvIG1lZGl1bSBidXNpbmVzc2VzJylcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEaWZmZXJlbnRpYXRvcnNcXH1cXH0vZywgY29tcGFueUluZm8uZGlmZmVyZW50aWF0b3JzIHx8ICdFYXN5LXRvLXVzZSBpbnRlcmZhY2Ugd2l0aCBwb3dlcmZ1bCBhdXRvbWF0aW9uJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZmF1bHQgdmFsdWVzIC0gdXNlIEt4R3J5bmRlIEZpdG5lc3MgaW5mb1xuICAgICAgc3lzdGVtUHJvbXB0ID0gc3lzdGVtUHJvbXB0XG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55TmFtZVxcfVxcfS9nLCAnS3hHcnluZGUgRml0bmVzcycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgJ0ZpdG5lc3MgJiBXZWxsbmVzcycpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgJ1ByZW1pdW0gZml0bmVzcyBjZW50ZXIgb2ZmZXJpbmcgcGVyc29uYWxpemVkIHRyYWluaW5nLCBncm91cCBjbGFzc2VzLCBhbmQgd2VsbG5lc3MgcHJvZ3JhbXMnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVByb2R1Y3RzXFx9XFx9L2csICdQZXJzb25hbCBUcmFpbmluZywgR3JvdXAgRml0bmVzcyBDbGFzc2VzLCBOdXRyaXRpb24gQ29hY2hpbmcsIFdlbGxuZXNzIFByb2dyYW1zLCBFcXVpcG1lbnQgVHJhaW5pbmcnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUJlbmVmaXRzXFx9XFx9L2csICdQZXJzb25hbGl6ZWQgZml0bmVzcyBwcm9ncmFtcywgZXhwZXJ0IGNvYWNoaW5nLCBzdGF0ZS1vZi10aGUtYXJ0IGVxdWlwbWVudCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55VGFyZ2V0Q3VzdG9tZXJzXFx9XFx9L2csICdGaXRuZXNzIGVudGh1c2lhc3RzIHNlZWtpbmcgcGVyc29uYWxpemVkIGNvYWNoaW5nIGFuZCBwcmVtaXVtIGZhY2lsaXRpZXMnKVxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueURpZmZlcmVudGlhdG9yc1xcfVxcfS9nLCAnUGVyc29uYWxpemVkIGFwcHJvYWNoIHdpdGggaG9saXN0aWMgd2VsbG5lc3MgZm9jdXMnKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IHBlcnNvbmEubmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiBwZXJzb25hLmRlc2NyaXB0aW9uLFxuICAgICAgc3lzdGVtUHJvbXB0LFxuICAgICAgcGVyc29uYWxpdHk6IHBlcnNvbmEucGVyc29uYWxpdHksXG4gICAgICByZXNwb25zZUd1aWRlbGluZXM6IHBlcnNvbmEucmVzcG9uc2VHdWlkZWxpbmVzIGFzIGFueSxcbiAgICAgIGdyZWV0aW5nczogKHBlcnNvbmEgYXMgYW55KS5ncmVldGluZ0NvbmZpZyB8fCAocGVyc29uYSBhcyBhbnkpLmdyZWV0aW5ncyxcbiAgICAgIHJlc3BvbnNlQ2h1bmtpbmc6IHBlcnNvbmEucmVzcG9uc2VDaHVua2luZyBhcyBSZXNwb25zZUNodW5raW5nIHwgdW5kZWZpbmVkLFxuICAgICAgaW50ZW50Q2FwdHVyaW5nOiAocGVyc29uYSBhcyBhbnkpLmludGVudENhcHR1cmluZyxcbiAgICAgIGdvYWxDb25maWd1cmF0aW9uOiAocGVyc29uYSBhcyBhbnkpLmdvYWxDb25maWd1cmF0aW9uLFxuICAgICAgYWN0aW9uVGFnczogKHBlcnNvbmEgYXMgYW55KS5hY3Rpb25UYWdzLFxuICAgICAgcGVyc29uYWxpdHlUcmFpdHM6IChwZXJzb25hIGFzIGFueSkucGVyc29uYWxpdHlUcmFpdHMsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IFBlcnNvbmFJdGVtIHRvIEFnZW50UGVyc29uYVxuICAgKi9cbiAgLy8gcHJpdmF0ZSBjb252ZXJ0VG9BZ2VudFBlcnNvbmEoaXRlbTogUGVyc29uYUl0ZW0sIGNvbXBhbnlJbmZvPzogQ29tcGFueUluZm8pOiBBZ2VudFBlcnNvbmEge1xuICAvLyAgIGxldCBzeXN0ZW1Qcm9tcHQgPSBpdGVtLnN5c3RlbVByb21wdDtcbiAgICBcbiAgLy8gICAvLyBSZXBsYWNlIGNvbXBhbnkgcGxhY2Vob2xkZXJzIChzYW1lIGxvZ2ljIGFzIGdldERlZmF1bHRQZXJzb25hKVxuICAvLyAgIGlmIChjb21wYW55SW5mbykge1xuICAvLyAgICAgc3lzdGVtUHJvbXB0ID0gc3lzdGVtUHJvbXB0XG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55TmFtZVxcfVxcfS9nLCBjb21wYW55SW5mby5uYW1lIHx8ICdLeEdlbicpXG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgY29tcGFueUluZm8uaW5kdXN0cnkgfHwgJ0xlYWQgTWFuYWdlbWVudCcpXG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgY29tcGFueUluZm8uZGVzY3JpcHRpb24gfHwgJ0EgY29tcHJlaGVuc2l2ZSBsZWFkIG1hbmFnZW1lbnQgcGxhdGZvcm0nKVxuICAvLyAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVByb2R1Y3RzXFx9XFx9L2csIGNvbXBhbnlJbmZvLnByb2R1Y3RzIHx8ICdMZWFkIGNhcHR1cmUsIG51cnR1cmluZywgYW5kIGNvbnZlcnNpb24gdG9vbHMnKVxuICAvLyAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUJlbmVmaXRzXFx9XFx9L2csIGNvbXBhbnlJbmZvLmJlbmVmaXRzIHx8ICdJbmNyZWFzZWQgY29udmVyc2lvbiByYXRlcyBhbmQgc3RyZWFtbGluZWQgc2FsZXMgcHJvY2Vzc2VzJylcbiAgLy8gICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgY29tcGFueUluZm8udGFyZ2V0Q3VzdG9tZXJzIHx8ICdTbWFsbCB0byBtZWRpdW0gYnVzaW5lc3NlcycpXG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGlmZmVyZW50aWF0b3JzXFx9XFx9L2csIGNvbXBhbnlJbmZvLmRpZmZlcmVudGlhdG9ycyB8fCAnRWFzeS10by11c2UgaW50ZXJmYWNlIHdpdGggcG93ZXJmdWwgYXV0b21hdGlvbicpO1xuICAvLyAgIH0gZWxzZSB7XG4gIC8vICAgICBzeXN0ZW1Qcm9tcHQgPSBzeXN0ZW1Qcm9tcHRcbiAgLy8gICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csICdQbGFuZXQgRml0bmVzcycpXG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgJ0JpZyBCb3ggR3ltcycpXG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgJ1BsYW5ldCBGaXRuZXNzIGlzIGEgZ2xvYmFsIGZyYW5jaGlzb3IgYW5kIG9wZXJhdG9yIG9mIGZpdG5lc3MgY2VudGVycyBrbm93biBhcyBhIFwiSnVkZ2VtZW50IEZyZWUgWm9uZVwiIGZvciBjYXN1YWwgZ3ltLWdvZXJzLCBvZmZlcmluZyBhIHZhcmlldHkgb2YgY2FyZGlvIGFuZCBzdHJlbmd0aCBlcXVpcG1lbnQsIGNpcmN1aXQgdHJhaW5pbmcgYXJlYXMsIGFuZCBmcmVlIGZpdG5lc3MgaW5zdHJ1Y3Rpb24gdGhyb3VnaCBpdHMgUEVAUEYgcHJvZ3JhbS4gTWVtYmVycyBjYW4gY2hvb3NlIGJldHdlZW4gc3RhbmRhcmQgYW5kIEJsYWNrIENhcmQgbWVtYmVyc2hpcHMgd2l0aCBkaWZmZXJlbnQgYW1lbml0aWVzIGFuZCBwZXJrcywgaW5jbHVkaW5nIGFjY2VzcyB0byBmZWF0dXJlcyBsaWtlIGEgMzAtbWludXRlIHdvcmtvdXQgY2lyY3VpdCwgYSBmdW5jdGlvbmFsIGZpdG5lc3MgYXJlYSB3aXRoIGVxdWlwbWVudCBsaWtlIFRSWCBhbmQga2V0dGxlYmVsbHMsIGFuZCBzcGEgYXJlYXMgbGlrZSB0aGUgV2VsbG5lc3MgUG9kIGF0IHNvbWUgbG9jYXRpb25zJylcbiAgLy8gICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlQcm9kdWN0c1xcfVxcfS9nLCAnQmlnIGZpdG5lc3MgYnV0IGFsc28gaGFzIGFwcGFycmVsLCBjb2ZmZWUsIGFuZCBhIGNhZmUnKVxuICAvLyAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUJlbmVmaXRzXFx9XFx9L2csICdPbmx5ICQxMCBhIG1vbnRoJylcbiAgLy8gICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgJ1Blb3BsZSB3aG8gc2VlayB2YWx1ZScpXG4gIC8vICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGlmZmVyZW50aWF0b3JzXFx9XFx9L2csICdCZXN0IHByaWNlcycpO1xuICAvLyAgIH1cbiAgICAgIFxuICAvLyAgIHJldHVybiB7XG4gIC8vICAgICBuYW1lOiBpdGVtLm5hbWUsXG4gIC8vICAgICBkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcbiAgLy8gICAgIHN5c3RlbVByb21wdCxcbiAgLy8gICAgIHBlcnNvbmFsaXR5OiBpdGVtLnBlcnNvbmFsaXR5LFxuICAvLyAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBpdGVtLnJlc3BvbnNlR3VpZGVsaW5lcyxcbiAgLy8gICAgIGdyZWV0aW5nczogaXRlbS5ncmVldGluZ3MsXG4gIC8vICAgICByZXNwb25zZUNodW5raW5nOiBpdGVtLnJlc3BvbnNlQ2h1bmtpbmcsXG4gIC8vICAgICBpbnRlbnRDYXB0dXJpbmc6IGl0ZW0uaW50ZW50Q2FwdHVyaW5nLFxuICAvLyAgICAgZ29hbENvbmZpZ3VyYXRpb246IChpdGVtIGFzIGFueSkuZ29hbENvbmZpZ3VyYXRpb24sXG4gIC8vICAgfTtcbiAgLy8gfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgRHluYW1vREIgcGFydGl0aW9uIGtleSBmb3IgcGVyc29uYXNcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlUGVyc29uYVBLKHRlbmFudElkOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBgUEVSU09OQSMke3RlbmFudElkfWA7XG4gIH1cblxuICAvKipcbiAgICogTGlzdCBhdmFpbGFibGUgZGVmYXVsdCBwZXJzb25hc1xuICAgKi9cbiAgc3RhdGljIGxpc3REZWZhdWx0UGVyc29uYXMoKTogQXJyYXk8e2lkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZ30+IHtcbiAgICByZXR1cm4gT2JqZWN0LmVudHJpZXMocGVyc29uYXNKc29uKS5tYXAoKFtpZCwgcGVyc29uYV0pID0+ICh7XG4gICAgICBpZCxcbiAgICAgIG5hbWU6IChwZXJzb25hIGFzIGFueSkubmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAocGVyc29uYSBhcyBhbnkpLmRlc2NyaXB0aW9uXG4gICAgfSkpO1xuICB9XG59XG4iXX0=