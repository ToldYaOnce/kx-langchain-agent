"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyPersonaService = void 0;
// Placeholder decorators and utilities for @toldyaonce/kx-cdk-lambda-utils
const ApiBasePath = (path) => (target) => target;
const ApiMethod = (method, path) => (target, propertyKey, descriptor) => descriptor;
// Placeholder Service class
class Service {
    constructor(model, partitionKey, sortKey) { }
    async create(event) {
        console.log('Service.create called with:', event.body);
        return { success: true, message: 'Create method not implemented' };
    }
    async get(event) {
        console.log('Service.get called with:', event.pathParameters);
        return { success: true, message: 'Get method not implemented' };
    }
    async update(event) {
        console.log('Service.update called with:', event.body);
        return { success: true, message: 'Update method not implemented' };
    }
    async delete(event) {
        console.log('Service.delete called with:', event.pathParameters);
        return { success: true, message: 'Delete method not implemented' };
    }
    async list(event) {
        console.log('Service.list called');
        return { success: true, data: [], message: 'List method not implemented' };
    }
    async query(event) {
        console.log('Service.query called with:', event.pathParameters);
        return { success: true, data: [], message: 'Query method not implemented' };
    }
}
// Placeholder getApiMethodHandlers
function getApiMethodHandlers(service) {
    return {
        handler: async (event) => {
            console.log('Generic handler called with:', JSON.stringify(event, null, 2));
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Service method handlers not implemented - requires @toldyaonce/kx-cdk-lambda-utils'
                })
            };
        }
    };
}
/**
 * Service for retrieving combined Company + Persona data
 * Aggregates company information with persona configuration and interpolates templates
 */
let CompanyPersonaService = class CompanyPersonaService extends Service {
    constructor() {
        // This service doesn't directly map to a single model
        super(Object, 'tenantId');
    }
    /**
     * Get company info + specific persona
     */
    async getCompanyPersona(event) {
        console.log('CompanyPersona get called', JSON.stringify(event.pathParameters));
        const corsHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        };
        try {
            const { tenantId, personaId } = event.pathParameters;
            // Create type-safe placeholder data
            const companyInfo = {
                tenantId,
                name: 'Sample Company',
                industry: 'Technology',
                description: 'A sample company for demonstration',
                products: 'Software solutions and consulting services',
                benefits: 'Innovative technology, expert support, competitive pricing',
                targetCustomers: 'Small to medium businesses looking for digital transformation',
                differentiators: 'Personalized service, cutting-edge technology, proven track record',
                intentCapturing: {
                    enabled: true,
                    intents: [
                        {
                            id: 'appointment',
                            name: 'appointment',
                            description: 'Schedule appointments',
                            triggers: ['appointment', 'schedule'],
                            patterns: ['book appointment', 'schedule meeting'],
                            priority: 'high',
                            response: {
                                type: 'template',
                                template: 'I can help you schedule an appointment',
                                followUp: ['What time works best?']
                            },
                            actions: ['collect_contact_info', 'schedule_appointment']
                        },
                        {
                            id: 'pricing',
                            name: 'pricing',
                            description: 'Pricing inquiries',
                            triggers: ['price', 'cost'],
                            patterns: ['how much', 'pricing'],
                            priority: 'medium',
                            response: {
                                type: 'template',
                                template: 'Let me help you with pricing information',
                                followUp: ['What service are you interested in?']
                            },
                            actions: ['provide_pricing']
                        },
                        {
                            id: 'support',
                            name: 'support',
                            description: 'Support requests',
                            triggers: ['help', 'support'],
                            patterns: ['need help', 'support'],
                            priority: 'high',
                            response: {
                                type: 'template',
                                template: 'I\'m here to help you',
                                followUp: ['What can I assist you with?']
                            },
                            actions: ['provide_support']
                        }
                    ],
                    fallbackIntent: {
                        id: 'general',
                        name: 'general',
                        description: 'General assistance',
                        response: {
                            type: 'template',
                            template: 'How can I help you today?'
                        },
                        actions: ['general_help']
                    },
                    confidence: {
                        threshold: 0.8,
                        multipleIntentHandling: 'highest_confidence'
                    }
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const persona = {
                tenantId,
                personaId,
                name: 'Sample Persona',
                description: 'A sample persona for demonstration',
                systemPrompt: 'You are a helpful assistant',
                responseGuidelines: ['Be polite', 'Be helpful', 'Be professional'],
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: '1.0.0',
                    tags: ['sample', 'demo']
                },
                personality: {
                    tone: 'friendly',
                    style: 'conversational',
                    languageQuirks: ['uses emojis'],
                    specialBehaviors: ['helpful', 'professional']
                },
                greetings: {
                    gist: 'Welcome and offer help',
                    variations: ['Hello! How can I help you today?', 'Welcome back! What can I do for you?']
                },
                responseChunking: {
                    enabled: true,
                    rules: {
                        chat: { maxLength: 500, chunkBy: 'sentence', delayBetweenChunks: 1000 },
                        sms: { maxLength: 160, chunkBy: 'sentence', delayBetweenChunks: 2000 },
                        email: { maxLength: 1000, chunkBy: 'paragraph', delayBetweenChunks: 0 }
                    }
                },
                goalConfiguration: {
                    enabled: true,
                    goals: [
                        {
                            id: 'assist_customers',
                            name: 'Assist Customers',
                            description: 'Help customers with their needs',
                            type: 'primary',
                            priority: '1',
                            target: { field: 'satisfaction', extractionPatterns: ['satisfied', 'happy'] },
                            timing: { minMessages: 1, maxMessages: 5 },
                            messages: { request: 'How can I help you?', followUp: 'Anything else?', acknowledgment: 'Glad I could help!' },
                            approach: { directness: 'medium', contextual: true, valueProposition: 'Quick assistance', fallbackStrategies: ['escalate'] }
                        }
                    ],
                    globalSettings: {
                        maxActiveGoals: 3,
                        respectDeclines: true,
                        adaptToUrgency: true,
                        interestThreshold: 0.7
                    },
                    completionTriggers: {
                        allCriticalComplete: 'Thank you for choosing us!'
                    }
                },
                actionTags: {
                    enabled: true,
                    mappings: { helpful: '👍', professional: '💼' },
                    fallbackEmoji: '✨'
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const response = {
                tenantId,
                companyInfo,
                persona,
                compiledPersona: {
                    name: persona.name,
                    personality: persona.personality,
                    greetings: persona.greetings,
                    responseChunking: persona.responseChunking,
                    goalConfiguration: persona.goalConfiguration,
                    actionTags: persona.actionTags
                }
            };
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(response)
            };
        }
        catch (error) {
            console.error('Error getting company persona:', error);
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: false,
                    message: 'Company persona not found',
                    error: error.message
                })
            };
        }
    }
    /**
     * Get company info + random persona
     */
    async getCompanyRandomPersona(event) {
        console.log('CompanyPersona getRandomPersona called', JSON.stringify(event.pathParameters));
        const corsHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        };
        try {
            const { tenantId } = event.pathParameters;
            // Create type-safe placeholder data
            const companyInfo = {
                tenantId,
                name: 'Sample Company',
                industry: 'Technology',
                description: 'A sample company for demonstration',
                products: 'Software solutions and consulting services',
                benefits: 'Innovative technology, expert support, competitive pricing',
                targetCustomers: 'Small to medium businesses looking for digital transformation',
                differentiators: 'Personalized service, cutting-edge technology, proven track record',
                intentCapturing: {
                    enabled: true,
                    intents: [
                        {
                            id: 'appointment',
                            name: 'appointment',
                            description: 'Schedule appointments',
                            triggers: ['appointment', 'schedule'],
                            patterns: ['book appointment', 'schedule meeting'],
                            priority: 'high',
                            response: {
                                type: 'template',
                                template: 'I can help you schedule an appointment',
                                followUp: ['What time works best?']
                            },
                            actions: ['collect_contact_info', 'schedule_appointment']
                        },
                        {
                            id: 'pricing',
                            name: 'pricing',
                            description: 'Pricing inquiries',
                            triggers: ['price', 'cost'],
                            patterns: ['how much', 'pricing'],
                            priority: 'medium',
                            response: {
                                type: 'template',
                                template: 'Let me help you with pricing information',
                                followUp: ['What service are you interested in?']
                            },
                            actions: ['provide_pricing']
                        },
                        {
                            id: 'support',
                            name: 'support',
                            description: 'Support requests',
                            triggers: ['help', 'support'],
                            patterns: ['need help', 'support'],
                            priority: 'high',
                            response: {
                                type: 'template',
                                template: 'I\'m here to help you',
                                followUp: ['What can I assist you with?']
                            },
                            actions: ['provide_support']
                        }
                    ],
                    fallbackIntent: {
                        id: 'general',
                        name: 'general',
                        description: 'General assistance',
                        response: {
                            type: 'template',
                            template: 'How can I help you today?'
                        },
                        actions: ['general_help']
                    },
                    confidence: {
                        threshold: 0.8,
                        multipleIntentHandling: 'highest_confidence'
                    }
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const persona = {
                tenantId,
                personaId: 'random-persona',
                name: 'Random Persona',
                description: 'A random persona with company templates',
                systemPrompt: 'You are a helpful assistant for {{companyName}}',
                responseGuidelines: ['Be polite', 'Use company name', 'Be helpful'],
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: '1.0.0',
                    tags: ['sample', 'demo']
                },
                personality: {
                    tone: 'friendly',
                    style: 'conversational',
                    languageQuirks: ['uses company name'],
                    specialBehaviors: ['helpful', 'professional']
                },
                greetings: {
                    gist: 'Welcome with company name',
                    variations: ['Hello! How can I help you with {{companyName}}?', 'Welcome to {{companyName}}!']
                },
                responseChunking: {
                    enabled: true,
                    rules: {
                        chat: { maxLength: 500, chunkBy: 'sentence', delayBetweenChunks: 1000 },
                        sms: { maxLength: 160, chunkBy: 'sentence', delayBetweenChunks: 2000 },
                        email: { maxLength: 1000, chunkBy: 'paragraph', delayBetweenChunks: 0 }
                    }
                },
                goalConfiguration: {
                    enabled: true,
                    goals: [
                        {
                            id: 'assist_customers',
                            name: 'Assist Customers',
                            description: 'Help customers with their needs',
                            type: 'primary',
                            priority: '1',
                            target: { field: 'satisfaction', extractionPatterns: ['satisfied', 'happy'] },
                            timing: { minMessages: 1, maxMessages: 5 },
                            messages: { request: 'How can I help you?', followUp: 'Anything else?', acknowledgment: 'Glad I could help!' },
                            approach: { directness: 'medium', contextual: true, valueProposition: 'Quick assistance', fallbackStrategies: ['escalate'] }
                        }
                    ],
                    globalSettings: {
                        maxActiveGoals: 3,
                        respectDeclines: true,
                        adaptToUrgency: true,
                        interestThreshold: 0.7
                    },
                    completionTriggers: {
                        allCriticalComplete: 'Thank you for choosing us!'
                    }
                },
                actionTags: {
                    enabled: true,
                    mappings: { helpful: '👍', professional: '💼' },
                    fallbackEmoji: '✨'
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };
            // Interpolate company details into persona templates
            const compiledPersona = this.interpolatePersonaTemplates(persona, companyInfo);
            const response = {
                tenantId,
                companyInfo,
                persona,
                compiledPersona
            };
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(response)
            };
        }
        catch (error) {
            console.error('Error getting company random persona:', error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: false,
                    message: 'Failed to get company persona',
                    error: error.message
                })
            };
        }
    }
    /**
     * Helper method to interpolate company details into persona templates
     */
    interpolatePersonaTemplates(persona, companyInfo) {
        const interpolate = (text) => {
            return text
                .replace(/\{\{companyName\}\}/g, companyInfo.name)
                .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry)
                .replace(/\{\{companyDescription\}\}/g, companyInfo.description || '');
        };
        const interpolateArray = (arr) => {
            return arr.map(interpolate);
        };
        const interpolateObject = (obj) => {
            if (Array.isArray(obj)) {
                return interpolateArray(obj);
            }
            else if (typeof obj === 'object' && obj !== null) {
                const result = {};
                for (const [key, value] of Object.entries(obj)) {
                    result[key] = interpolateObject(value);
                }
                return result;
            }
            else if (typeof obj === 'string') {
                return interpolate(obj);
            }
            return obj;
        };
        return {
            name: persona.name,
            personality: interpolateObject(persona.personality),
            greetings: interpolateObject(persona.greetings),
            responseChunking: persona.responseChunking,
            goalConfiguration: interpolateObject(persona.goalConfiguration),
            actionTags: persona.actionTags
        };
    }
};
exports.CompanyPersonaService = CompanyPersonaService;
__decorate([
    ApiMethod('GET', '/{tenantId}/{personaId}')
], CompanyPersonaService.prototype, "getCompanyPersona", null);
__decorate([
    ApiMethod('GET', '/{tenantId}')
], CompanyPersonaService.prototype, "getCompanyRandomPersona", null);
exports.CompanyPersonaService = CompanyPersonaService = __decorate([
    ApiBasePath('/company-persona')
], CompanyPersonaService);
// Export the service and method handlers for Lambda integration
module.exports = {
    CompanyPersonaService,
    ...getApiMethodHandlers(new CompanyPersonaService())
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFueS1wZXJzb25hLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2VydmljZXMvY29tcGFueS1wZXJzb25hLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBR0EsMkVBQTJFO0FBQzNFLE1BQU0sV0FBVyxHQUFHLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQVcsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDO0FBQzlELE1BQU0sU0FBUyxHQUFHLENBQUMsTUFBYyxFQUFFLElBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFXLEVBQUUsV0FBbUIsRUFBRSxVQUE4QixFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUM7QUFFdEksNEJBQTRCO0FBQzVCLE1BQU0sT0FBTztJQUNYLFlBQVksS0FBVSxFQUFFLFlBQW9CLEVBQUUsT0FBZ0IsSUFBRyxDQUFDO0lBRWxFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBVTtRQUNyQixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsQ0FBQztJQUNyRSxDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFVO1FBQ2xCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxDQUFDO0lBQ2xFLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQVU7UUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVB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LEdBQUcsQ0FBQyxDQUFDO1lBQzFCLENBQUM7WUFDRCxPQUFPLEdBQUcsQ0FBQztRQUNiLENBQUMsQ0FBQztRQUVGLE9BQU87WUFDTCxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7WUFDbEIsV0FBVyxFQUFFLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7WUFDbkQsU0FBUyxFQUFFLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7WUFDL0MsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLGdCQUFnQjtZQUMxQyxpQkFBaUIsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUM7WUFDL0QsVUFBVSxFQUFFLE9BQU8sQ0FBQyxVQUFVO1NBQy9CLENBQUM7SUFDSixDQUFDO0NBQ0YsQ0FBQTtBQXhhWSxzREFBcUI7QUFXMUI7SUFETCxTQUFTLENBQUMsS0FBSyxFQUFFLHlCQUF5QixDQUFDOzhEQTBMM0M7QUFNSztJQURMLFNBQVMsQ0FBQyxLQUFLLEVBQUUsYUFBYSxDQUFDO29FQXNML0I7Z0NBL1hVLHFCQUFxQjtJQURqQyxXQUFXLENBQUMsa0JBQWtCLENBQUM7R0FDbkIscUJBQXFCLENBd2FqQztBQUVELGdFQUFnRTtBQUNoRSxNQUFNLENBQUMsT0FBTyxHQUFHO0lBQ2YscUJBQXFCO0lBQ3JCLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO0NBQ3JELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wYW55SW5mbyB9IGZyb20gJy4uL21vZGVscy9jb21wYW55LWluZm8uanMnO1xyXG5pbXBvcnQgeyBQZXJzb25hIH0gZnJvbSAnLi4vbW9kZWxzL3BlcnNvbmFzLmpzJztcclxuXHJcbi8vIFBsYWNlaG9sZGVyIGRlY29yYXRvcnMgYW5kIHV0aWxpdGllcyBmb3IgQHRvbGR5YW9uY2Uva3gtY2RrLWxhbWJkYS11dGlsc1xyXG5jb25zdCBBcGlCYXNlUGF0aCA9IChwYXRoOiBzdHJpbmcpID0+ICh0YXJnZXQ6IGFueSkgPT4gdGFyZ2V0O1xyXG5jb25zdCBBcGlNZXRob2QgPSAobWV0aG9kOiBzdHJpbmcsIHBhdGg/OiBzdHJpbmcpID0+ICh0YXJnZXQ6IGFueSwgcHJvcGVydHlLZXk6IHN0cmluZywgZGVzY3JpcHRvcjogUHJvcGVydHlEZXNjcmlwdG9yKSA9PiBkZXNjcmlwdG9yO1xyXG5cclxuLy8gUGxhY2Vob2xkZXIgU2VydmljZSBjbGFzc1xyXG5jbGFzcyBTZXJ2aWNlPFQ+IHtcclxuICBjb25zdHJ1Y3Rvcihtb2RlbDogYW55LCBwYXJ0aXRpb25LZXk6IHN0cmluZywgc29ydEtleT86IHN0cmluZykge31cclxuICBcclxuICBhc3luYyBjcmVhdGUoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnU2VydmljZS5jcmVhdGUgY2FsbGVkIHdpdGg6JywgZXZlbnQuYm9keSk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnQ3JlYXRlIG1ldGhvZCBub3QgaW1wbGVtZW50ZWQnIH07XHJcbiAgfVxyXG4gIFxyXG4gIGFzeW5jIGdldChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLmdldCBjYWxsZWQgd2l0aDonLCBldmVudC5wYXRoUGFyYW1ldGVycyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnR2V0IG1ldGhvZCBub3QgaW1wbGVtZW50ZWQnIH07XHJcbiAgfVxyXG4gIFxyXG4gIGFzeW5jIHVwZGF0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLnVwZGF0ZSBjYWxsZWQgd2l0aDonLCBldmVudC5ib2R5KTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdVcGRhdGUgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgZGVsZXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1NlcnZpY2UuZGVsZXRlIGNhbGxlZCB3aXRoOicsIGV2ZW50LnBhdGhQYXJhbWV0ZXJzKTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdEZWxldGUgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgbGlzdChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLmxpc3QgY2FsbGVkJyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBbXSwgbWVzc2FnZTogJ0xpc3QgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgcXVlcnkoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnU2VydmljZS5xdWVyeSBjYWxsZWQgd2l0aDonLCBldmVudC5wYXRoUGFyYW1ldGVycyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBbXSwgbWVzc2FnZTogJ1F1ZXJ5IG1ldGhvZCBub3QgaW1wbGVtZW50ZWQnIH07XHJcbiAgfVxyXG59XHJcblxyXG4vLyBQbGFjZWhvbGRlciBnZXRBcGlNZXRob2RIYW5kbGVyc1xyXG5mdW5jdGlvbiBnZXRBcGlNZXRob2RIYW5kbGVycyhzZXJ2aWNlOiBhbnkpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcclxuICByZXR1cm4ge1xyXG4gICAgaGFuZGxlcjogYXN5bmMgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coJ0dlbmVyaWMgaGFuZGxlciBjYWxsZWQgd2l0aDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcclxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgXHJcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcclxuICAgICAgICAgIG1lc3NhZ2U6ICdTZXJ2aWNlIG1ldGhvZCBoYW5kbGVycyBub3QgaW1wbGVtZW50ZWQgLSByZXF1aXJlcyBAdG9sZHlhb25jZS9reC1jZGstbGFtYmRhLXV0aWxzJyBcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGFueVBlcnNvbmFSZXNwb25zZSB7XHJcbiAgdGVuYW50SWQ6IHN0cmluZztcclxuICBjb21wYW55SW5mbzogQ29tcGFueUluZm87XHJcbiAgcGVyc29uYTogUGVyc29uYTtcclxuICBjb21waWxlZFBlcnNvbmE6IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBlcnNvbmFsaXR5OiBhbnk7XHJcbiAgICBncmVldGluZ3M6IGFueTtcclxuICAgIHJlc3BvbnNlQ2h1bmtpbmc6IGFueTtcclxuICAgIGdvYWxDb25maWd1cmF0aW9uOiBhbnk7XHJcbiAgICBhY3Rpb25UYWdzOiBhbnk7XHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNlcnZpY2UgZm9yIHJldHJpZXZpbmcgY29tYmluZWQgQ29tcGFueSArIFBlcnNvbmEgZGF0YVxyXG4gKiBBZ2dyZWdhdGVzIGNvbXBhbnkgaW5mb3JtYXRpb24gd2l0aCBwZXJzb25hIGNvbmZpZ3VyYXRpb24gYW5kIGludGVycG9sYXRlcyB0ZW1wbGF0ZXNcclxuICovXHJcbkBBcGlCYXNlUGF0aCgnL2NvbXBhbnktcGVyc29uYScpXHJcbmV4cG9ydCBjbGFzcyBDb21wYW55UGVyc29uYVNlcnZpY2UgZXh0ZW5kcyBTZXJ2aWNlPGFueT4ge1xyXG4gIFxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgLy8gVGhpcyBzZXJ2aWNlIGRvZXNuJ3QgZGlyZWN0bHkgbWFwIHRvIGEgc2luZ2xlIG1vZGVsXHJcbiAgICBzdXBlcihPYmplY3QsICd0ZW5hbnRJZCcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGNvbXBhbnkgaW5mbyArIHNwZWNpZmljIHBlcnNvbmFcclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdHRVQnLCAnL3t0ZW5hbnRJZH0ve3BlcnNvbmFJZH0nKVxyXG4gIGFzeW5jIGdldENvbXBhbnlQZXJzb25hKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ0NvbXBhbnlQZXJzb25hIGdldCBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHsgdGVuYW50SWQsIHBlcnNvbmFJZCB9ID0gZXZlbnQucGF0aFBhcmFtZXRlcnM7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDcmVhdGUgdHlwZS1zYWZlIHBsYWNlaG9sZGVyIGRhdGFcclxuICAgICAgY29uc3QgY29tcGFueUluZm86IENvbXBhbnlJbmZvID0ge1xyXG4gICAgICAgIHRlbmFudElkLFxyXG4gICAgICAgIG5hbWU6ICdTYW1wbGUgQ29tcGFueScsXHJcbiAgICAgICAgaW5kdXN0cnk6ICdUZWNobm9sb2d5JyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Egc2FtcGxlIGNvbXBhbnkgZm9yIGRlbW9uc3RyYXRpb24nLFxyXG4gICAgICAgIHByb2R1Y3RzOiAnU29mdHdhcmUgc29sdXRpb25zIGFuZCBjb25zdWx0aW5nIHNlcnZpY2VzJyxcclxuICAgICAgICBiZW5lZml0czogJ0lubm92YXRpdmUgdGVjaG5vbG9neSwgZXhwZXJ0IHN1cHBvcnQsIGNvbXBldGl0aXZlIHByaWNpbmcnLFxyXG4gICAgICAgIHRhcmdldEN1c3RvbWVyczogJ1NtYWxsIHRvIG1lZGl1bSBidXNpbmVzc2VzIGxvb2tpbmcgZm9yIGRpZ2l0YWwgdHJhbnNmb3JtYXRpb24nLFxyXG4gICAgICAgIGRpZmZlcmVudGlhdG9yczogJ1BlcnNvbmFsaXplZCBzZXJ2aWNlLCBjdXR0aW5nLWVkZ2UgdGVjaG5vbG9neSwgcHJvdmVuIHRyYWNrIHJlY29yZCcsXHJcbiAgICAgICAgaW50ZW50Q2FwdHVyaW5nOiB7XHJcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgaW50ZW50czogW1xyXG4gICAgICAgICAgICB7IFxyXG4gICAgICAgICAgICAgIGlkOiAnYXBwb2ludG1lbnQnLFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdhcHBvaW50bWVudCcsIFxyXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU2NoZWR1bGUgYXBwb2ludG1lbnRzJywgXHJcbiAgICAgICAgICAgICAgdHJpZ2dlcnM6IFsnYXBwb2ludG1lbnQnLCAnc2NoZWR1bGUnXSxcclxuICAgICAgICAgICAgICBwYXR0ZXJuczogWydib29rIGFwcG9pbnRtZW50JywgJ3NjaGVkdWxlIG1lZXRpbmcnXSxcclxuICAgICAgICAgICAgICBwcmlvcml0eTogJ2hpZ2gnIGFzIGNvbnN0LFxyXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiB7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAndGVtcGxhdGUnIGFzIGNvbnN0LFxyXG4gICAgICAgICAgICAgICAgdGVtcGxhdGU6ICdJIGNhbiBoZWxwIHlvdSBzY2hlZHVsZSBhbiBhcHBvaW50bWVudCcsXHJcbiAgICAgICAgICAgICAgICBmb2xsb3dVcDogWydXaGF0IHRpbWUgd29ya3MgYmVzdD8nXVxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgYWN0aW9uczogWydjb2xsZWN0X2NvbnRhY3RfaW5mbycsICdzY2hlZHVsZV9hcHBvaW50bWVudCddXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgXHJcbiAgICAgICAgICAgICAgaWQ6ICdwcmljaW5nJyxcclxuICAgICAgICAgICAgICBuYW1lOiAncHJpY2luZycsIFxyXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnUHJpY2luZyBpbnF1aXJpZXMnLCBcclxuICAgICAgICAgICAgICB0cmlnZ2VyczogWydwcmljZScsICdjb3N0J10sXHJcbiAgICAgICAgICAgICAgcGF0dGVybnM6IFsnaG93IG11Y2gnLCAncHJpY2luZyddLFxyXG4gICAgICAgICAgICAgIHByaW9yaXR5OiAnbWVkaXVtJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICByZXNwb25zZToge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICAgIHRlbXBsYXRlOiAnTGV0IG1lIGhlbHAgeW91IHdpdGggcHJpY2luZyBpbmZvcm1hdGlvbicsXHJcbiAgICAgICAgICAgICAgICBmb2xsb3dVcDogWydXaGF0IHNlcnZpY2UgYXJlIHlvdSBpbnRlcmVzdGVkIGluPyddXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3Byb3ZpZGVfcHJpY2luZyddXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHsgXHJcbiAgICAgICAgICAgICAgaWQ6ICdzdXBwb3J0JyxcclxuICAgICAgICAgICAgICBuYW1lOiAnc3VwcG9ydCcsIFxyXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3VwcG9ydCByZXF1ZXN0cycsIFxyXG4gICAgICAgICAgICAgIHRyaWdnZXJzOiBbJ2hlbHAnLCAnc3VwcG9ydCddLFxyXG4gICAgICAgICAgICAgIHBhdHRlcm5zOiBbJ25lZWQgaGVscCcsICdzdXBwb3J0J10sXHJcbiAgICAgICAgICAgICAgcHJpb3JpdHk6ICdoaWdoJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICByZXNwb25zZToge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICAgIHRlbXBsYXRlOiAnSVxcJ20gaGVyZSB0byBoZWxwIHlvdScsXHJcbiAgICAgICAgICAgICAgICBmb2xsb3dVcDogWydXaGF0IGNhbiBJIGFzc2lzdCB5b3Ugd2l0aD8nXVxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgYWN0aW9uczogWydwcm92aWRlX3N1cHBvcnQnXVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgZmFsbGJhY2tJbnRlbnQ6IHtcclxuICAgICAgICAgICAgaWQ6ICdnZW5lcmFsJyxcclxuICAgICAgICAgICAgbmFtZTogJ2dlbmVyYWwnLFxyXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0dlbmVyYWwgYXNzaXN0YW5jZScsXHJcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7XHJcbiAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyxcclxuICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0hvdyBjYW4gSSBoZWxwIHlvdSB0b2RheT8nXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGFjdGlvbnM6IFsnZ2VuZXJhbF9oZWxwJ11cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBjb25maWRlbmNlOiB7XHJcbiAgICAgICAgICAgIHRocmVzaG9sZDogMC44LFxyXG4gICAgICAgICAgICBtdWx0aXBsZUludGVudEhhbmRsaW5nOiAnaGlnaGVzdF9jb25maWRlbmNlJ1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxyXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgcGVyc29uYTogUGVyc29uYSA9IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBwZXJzb25hSWQsXHJcbiAgICAgICAgbmFtZTogJ1NhbXBsZSBQZXJzb25hJyxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Egc2FtcGxlIHBlcnNvbmEgZm9yIGRlbW9uc3RyYXRpb24nLFxyXG4gICAgICAgIHN5c3RlbVByb21wdDogJ1lvdSBhcmUgYSBoZWxwZnVsIGFzc2lzdGFudCcsXHJcbiAgICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBbJ0JlIHBvbGl0ZScsICdCZSBoZWxwZnVsJywgJ0JlIHByb2Zlc3Npb25hbCddLFxyXG4gICAgICAgIG1ldGFkYXRhOiB7XHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgdmVyc2lvbjogJzEuMC4wJyxcclxuICAgICAgICAgIHRhZ3M6IFsnc2FtcGxlJywgJ2RlbW8nXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcGVyc29uYWxpdHk6IHtcclxuICAgICAgICAgIHRvbmU6ICdmcmllbmRseScsXHJcbiAgICAgICAgICBzdHlsZTogJ2NvbnZlcnNhdGlvbmFsJyxcclxuICAgICAgICAgIGxhbmd1YWdlUXVpcmtzOiBbJ3VzZXMgZW1vamlzJ10sXHJcbiAgICAgICAgICBzcGVjaWFsQmVoYXZpb3JzOiBbJ2hlbHBmdWwnLCAncHJvZmVzc2lvbmFsJ11cclxuICAgICAgICB9LFxyXG4gICAgICAgIGdyZWV0aW5nczoge1xyXG4gICAgICAgICAgZ2lzdDogJ1dlbGNvbWUgYW5kIG9mZmVyIGhlbHAnLFxyXG4gICAgICAgICAgdmFyaWF0aW9uczogWydIZWxsbyEgSG93IGNhbiBJIGhlbHAgeW91IHRvZGF5PycsICdXZWxjb21lIGJhY2shIFdoYXQgY2FuIEkgZG8gZm9yIHlvdT8nXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcmVzcG9uc2VDaHVua2luZzoge1xyXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgIHJ1bGVzOiB7XHJcbiAgICAgICAgICAgIGNoYXQ6IHsgbWF4TGVuZ3RoOiA1MDAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMTAwMCB9LFxyXG4gICAgICAgICAgICBzbXM6IHsgbWF4TGVuZ3RoOiAxNjAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMjAwMCB9LFxyXG4gICAgICAgICAgICBlbWFpbDogeyBtYXhMZW5ndGg6IDEwMDAsIGNodW5rQnk6ICdwYXJhZ3JhcGgnLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZ29hbENvbmZpZ3VyYXRpb246IHtcclxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICBnb2FsczogW1xyXG4gICAgICAgICAgICB7IFxyXG4gICAgICAgICAgICAgIGlkOiAnYXNzaXN0X2N1c3RvbWVycycsIFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdBc3Npc3QgQ3VzdG9tZXJzJyxcclxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0hlbHAgY3VzdG9tZXJzIHdpdGggdGhlaXIgbmVlZHMnLFxyXG4gICAgICAgICAgICAgIHR5cGU6ICdwcmltYXJ5JyxcclxuICAgICAgICAgICAgICBwcmlvcml0eTogJzEnLFxyXG4gICAgICAgICAgICAgIHRhcmdldDogeyBmaWVsZDogJ3NhdGlzZmFjdGlvbicsIGV4dHJhY3Rpb25QYXR0ZXJuczogWydzYXRpc2ZpZWQnLCAnaGFwcHknXSB9LFxyXG4gICAgICAgICAgICAgIHRpbWluZzogeyBtaW5NZXNzYWdlczogMSwgbWF4TWVzc2FnZXM6IDUgfSxcclxuICAgICAgICAgICAgICBtZXNzYWdlczogeyByZXF1ZXN0OiAnSG93IGNhbiBJIGhlbHAgeW91PycsIGZvbGxvd1VwOiAnQW55dGhpbmcgZWxzZT8nLCBhY2tub3dsZWRnbWVudDogJ0dsYWQgSSBjb3VsZCBoZWxwIScgfSxcclxuICAgICAgICAgICAgICBhcHByb2FjaDogeyBkaXJlY3RuZXNzOiAnbWVkaXVtJywgY29udGV4dHVhbDogdHJ1ZSwgdmFsdWVQcm9wb3NpdGlvbjogJ1F1aWNrIGFzc2lzdGFuY2UnLCBmYWxsYmFja1N0cmF0ZWdpZXM6IFsnZXNjYWxhdGUnXSB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBnbG9iYWxTZXR0aW5nczoge1xyXG4gICAgICAgICAgICBtYXhBY3RpdmVHb2FsczogMyxcclxuICAgICAgICAgICAgcmVzcGVjdERlY2xpbmVzOiB0cnVlLFxyXG4gICAgICAgICAgICBhZGFwdFRvVXJnZW5jeTogdHJ1ZSxcclxuICAgICAgICAgICAgaW50ZXJlc3RUaHJlc2hvbGQ6IDAuN1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIGNvbXBsZXRpb25UcmlnZ2Vyczoge1xyXG4gICAgICAgICAgICBhbGxDcml0aWNhbENvbXBsZXRlOiAnVGhhbmsgeW91IGZvciBjaG9vc2luZyB1cyEnXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBhY3Rpb25UYWdzOiB7XHJcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgbWFwcGluZ3M6IHsgaGVscGZ1bDogJ/CfkY0nLCBwcm9mZXNzaW9uYWw6ICfwn5K8JyB9LFxyXG4gICAgICAgICAgZmFsbGJhY2tFbW9qaTogJ+KcqCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcclxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBDb21wYW55UGVyc29uYVJlc3BvbnNlID0ge1xyXG4gICAgICAgIHRlbmFudElkLFxyXG4gICAgICAgIGNvbXBhbnlJbmZvLFxyXG4gICAgICAgIHBlcnNvbmEsXHJcbiAgICAgICAgY29tcGlsZWRQZXJzb25hOiB7XHJcbiAgICAgICAgICBuYW1lOiBwZXJzb25hLm5hbWUsXHJcbiAgICAgICAgICBwZXJzb25hbGl0eTogcGVyc29uYS5wZXJzb25hbGl0eSxcclxuICAgICAgICAgIGdyZWV0aW5nczogcGVyc29uYS5ncmVldGluZ3MsXHJcbiAgICAgICAgICByZXNwb25zZUNodW5raW5nOiBwZXJzb25hLnJlc3BvbnNlQ2h1bmtpbmcsXHJcbiAgICAgICAgICBnb2FsQ29uZmlndXJhdGlvbjogcGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbixcclxuICAgICAgICAgIGFjdGlvblRhZ3M6IHBlcnNvbmEuYWN0aW9uVGFnc1xyXG4gICAgICAgIH1cclxuICAgICAgfTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKVxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIGNvbXBhbnkgcGVyc29uYTonLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdDb21wYW55IHBlcnNvbmEgbm90IGZvdW5kJyxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjb21wYW55IGluZm8gKyByYW5kb20gcGVyc29uYVxyXG4gICAqL1xyXG4gIEBBcGlNZXRob2QoJ0dFVCcsICcve3RlbmFudElkfScpXHJcbiAgYXN5bmMgZ2V0Q29tcGFueVJhbmRvbVBlcnNvbmEoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnQ29tcGFueVBlcnNvbmEgZ2V0UmFuZG9tUGVyc29uYSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHsgdGVuYW50SWQgfSA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzO1xyXG4gICAgICBcclxuICAgICAgLy8gQ3JlYXRlIHR5cGUtc2FmZSBwbGFjZWhvbGRlciBkYXRhXHJcbiAgICAgIGNvbnN0IGNvbXBhbnlJbmZvOiBDb21wYW55SW5mbyA9IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBuYW1lOiAnU2FtcGxlIENvbXBhbnknLFxyXG4gICAgICAgIGluZHVzdHJ5OiAnVGVjaG5vbG9neScsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdBIHNhbXBsZSBjb21wYW55IGZvciBkZW1vbnN0cmF0aW9uJyxcclxuICAgICAgICBwcm9kdWN0czogJ1NvZnR3YXJlIHNvbHV0aW9ucyBhbmQgY29uc3VsdGluZyBzZXJ2aWNlcycsXHJcbiAgICAgICAgYmVuZWZpdHM6ICdJbm5vdmF0aXZlIHRlY2hub2xvZ3ksIGV4cGVydCBzdXBwb3J0LCBjb21wZXRpdGl2ZSBwcmljaW5nJyxcclxuICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdTbWFsbCB0byBtZWRpdW0gYnVzaW5lc3NlcyBsb29raW5nIGZvciBkaWdpdGFsIHRyYW5zZm9ybWF0aW9uJyxcclxuICAgICAgICBkaWZmZXJlbnRpYXRvcnM6ICdQZXJzb25hbGl6ZWQgc2VydmljZSwgY3V0dGluZy1lZGdlIHRlY2hub2xvZ3ksIHByb3ZlbiB0cmFjayByZWNvcmQnLFxyXG4gICAgICAgIGludGVudENhcHR1cmluZzoge1xyXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgIGludGVudHM6IFtcclxuICAgICAgICAgICAgeyBcclxuICAgICAgICAgICAgICBpZDogJ2FwcG9pbnRtZW50JyxcclxuICAgICAgICAgICAgICBuYW1lOiAnYXBwb2ludG1lbnQnLCBcclxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1NjaGVkdWxlIGFwcG9pbnRtZW50cycsIFxyXG4gICAgICAgICAgICAgIHRyaWdnZXJzOiBbJ2FwcG9pbnRtZW50JywgJ3NjaGVkdWxlJ10sXHJcbiAgICAgICAgICAgICAgcGF0dGVybnM6IFsnYm9vayBhcHBvaW50bWVudCcsICdzY2hlZHVsZSBtZWV0aW5nJ10sXHJcbiAgICAgICAgICAgICAgcHJpb3JpdHk6ICdoaWdoJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICByZXNwb25zZToge1xyXG4gICAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyBhcyBjb25zdCxcclxuICAgICAgICAgICAgICAgIHRlbXBsYXRlOiAnSSBjYW4gaGVscCB5b3Ugc2NoZWR1bGUgYW4gYXBwb2ludG1lbnQnLFxyXG4gICAgICAgICAgICAgICAgZm9sbG93VXA6IFsnV2hhdCB0aW1lIHdvcmtzIGJlc3Q/J11cclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnY29sbGVjdF9jb250YWN0X2luZm8nLCAnc2NoZWR1bGVfYXBwb2ludG1lbnQnXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7IFxyXG4gICAgICAgICAgICAgIGlkOiAncHJpY2luZycsXHJcbiAgICAgICAgICAgICAgbmFtZTogJ3ByaWNpbmcnLCBcclxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1ByaWNpbmcgaW5xdWlyaWVzJywgXHJcbiAgICAgICAgICAgICAgdHJpZ2dlcnM6IFsncHJpY2UnLCAnY29zdCddLFxyXG4gICAgICAgICAgICAgIHBhdHRlcm5zOiBbJ2hvdyBtdWNoJywgJ3ByaWNpbmcnXSxcclxuICAgICAgICAgICAgICBwcmlvcml0eTogJ21lZGl1bScgYXMgY29uc3QsXHJcbiAgICAgICAgICAgICAgcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICd0ZW1wbGF0ZScgYXMgY29uc3QsXHJcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0xldCBtZSBoZWxwIHlvdSB3aXRoIHByaWNpbmcgaW5mb3JtYXRpb24nLFxyXG4gICAgICAgICAgICAgICAgZm9sbG93VXA6IFsnV2hhdCBzZXJ2aWNlIGFyZSB5b3UgaW50ZXJlc3RlZCBpbj8nXVxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgYWN0aW9uczogWydwcm92aWRlX3ByaWNpbmcnXVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7IFxyXG4gICAgICAgICAgICAgIGlkOiAnc3VwcG9ydCcsXHJcbiAgICAgICAgICAgICAgbmFtZTogJ3N1cHBvcnQnLCBcclxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1N1cHBvcnQgcmVxdWVzdHMnLCBcclxuICAgICAgICAgICAgICB0cmlnZ2VyczogWydoZWxwJywgJ3N1cHBvcnQnXSxcclxuICAgICAgICAgICAgICBwYXR0ZXJuczogWyduZWVkIGhlbHAnLCAnc3VwcG9ydCddLFxyXG4gICAgICAgICAgICAgIHByaW9yaXR5OiAnaGlnaCcgYXMgY29uc3QsXHJcbiAgICAgICAgICAgICAgcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICd0ZW1wbGF0ZScgYXMgY29uc3QsXHJcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0lcXCdtIGhlcmUgdG8gaGVscCB5b3UnLFxyXG4gICAgICAgICAgICAgICAgZm9sbG93VXA6IFsnV2hhdCBjYW4gSSBhc3Npc3QgeW91IHdpdGg/J11cclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsncHJvdmlkZV9zdXBwb3J0J11cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgXSxcclxuICAgICAgICAgIGZhbGxiYWNrSW50ZW50OiB7XHJcbiAgICAgICAgICAgIGlkOiAnZ2VuZXJhbCcsXHJcbiAgICAgICAgICAgIG5hbWU6ICdnZW5lcmFsJyxcclxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZW5lcmFsIGFzc2lzdGFuY2UnLFxyXG4gICAgICAgICAgICByZXNwb25zZToge1xyXG4gICAgICAgICAgICAgIHR5cGU6ICd0ZW1wbGF0ZScsXHJcbiAgICAgICAgICAgICAgdGVtcGxhdGU6ICdIb3cgY2FuIEkgaGVscCB5b3UgdG9kYXk/J1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBhY3Rpb25zOiBbJ2dlbmVyYWxfaGVscCddXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgY29uZmlkZW5jZToge1xyXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDAuOCxcclxuICAgICAgICAgICAgbXVsdGlwbGVJbnRlbnRIYW5kbGluZzogJ2hpZ2hlc3RfY29uZmlkZW5jZSdcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcclxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcclxuICAgICAgfTtcclxuXHJcbiAgICAgIGNvbnN0IHBlcnNvbmE6IFBlcnNvbmEgPSB7XHJcbiAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgcGVyc29uYUlkOiAncmFuZG9tLXBlcnNvbmEnLFxyXG4gICAgICAgIG5hbWU6ICdSYW5kb20gUGVyc29uYScsXHJcbiAgICAgICAgZGVzY3JpcHRpb246ICdBIHJhbmRvbSBwZXJzb25hIHdpdGggY29tcGFueSB0ZW1wbGF0ZXMnLFxyXG4gICAgICAgIHN5c3RlbVByb21wdDogJ1lvdSBhcmUgYSBoZWxwZnVsIGFzc2lzdGFudCBmb3Ige3tjb21wYW55TmFtZX19JyxcclxuICAgICAgICByZXNwb25zZUd1aWRlbGluZXM6IFsnQmUgcG9saXRlJywgJ1VzZSBjb21wYW55IG5hbWUnLCAnQmUgaGVscGZ1bCddLFxyXG4gICAgICAgIG1ldGFkYXRhOiB7XHJcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgdmVyc2lvbjogJzEuMC4wJyxcclxuICAgICAgICAgIHRhZ3M6IFsnc2FtcGxlJywgJ2RlbW8nXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcGVyc29uYWxpdHk6IHtcclxuICAgICAgICAgIHRvbmU6ICdmcmllbmRseScsXHJcbiAgICAgICAgICBzdHlsZTogJ2NvbnZlcnNhdGlvbmFsJyxcclxuICAgICAgICAgIGxhbmd1YWdlUXVpcmtzOiBbJ3VzZXMgY29tcGFueSBuYW1lJ10sXHJcbiAgICAgICAgICBzcGVjaWFsQmVoYXZpb3JzOiBbJ2hlbHBmdWwnLCAncHJvZmVzc2lvbmFsJ11cclxuICAgICAgICB9LFxyXG4gICAgICAgIGdyZWV0aW5nczoge1xyXG4gICAgICAgICAgZ2lzdDogJ1dlbGNvbWUgd2l0aCBjb21wYW55IG5hbWUnLFxyXG4gICAgICAgICAgdmFyaWF0aW9uczogWydIZWxsbyEgSG93IGNhbiBJIGhlbHAgeW91IHdpdGgge3tjb21wYW55TmFtZX19PycsICdXZWxjb21lIHRvIHt7Y29tcGFueU5hbWV9fSEnXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcmVzcG9uc2VDaHVua2luZzoge1xyXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgIHJ1bGVzOiB7XHJcbiAgICAgICAgICAgIGNoYXQ6IHsgbWF4TGVuZ3RoOiA1MDAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMTAwMCB9LFxyXG4gICAgICAgICAgICBzbXM6IHsgbWF4TGVuZ3RoOiAxNjAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMjAwMCB9LFxyXG4gICAgICAgICAgICBlbWFpbDogeyBtYXhMZW5ndGg6IDEwMDAsIGNodW5rQnk6ICdwYXJhZ3JhcGgnLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZ29hbENvbmZpZ3VyYXRpb246IHtcclxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICBnb2FsczogW1xyXG4gICAgICAgICAgICB7IFxyXG4gICAgICAgICAgICAgIGlkOiAnYXNzaXN0X2N1c3RvbWVycycsIFxyXG4gICAgICAgICAgICAgIG5hbWU6ICdBc3Npc3QgQ3VzdG9tZXJzJyxcclxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0hlbHAgY3VzdG9tZXJzIHdpdGggdGhlaXIgbmVlZHMnLFxyXG4gICAgICAgICAgICAgIHR5cGU6ICdwcmltYXJ5JyxcclxuICAgICAgICAgICAgICBwcmlvcml0eTogJzEnLFxyXG4gICAgICAgICAgICAgIHRhcmdldDogeyBmaWVsZDogJ3NhdGlzZmFjdGlvbicsIGV4dHJhY3Rpb25QYXR0ZXJuczogWydzYXRpc2ZpZWQnLCAnaGFwcHknXSB9LFxyXG4gICAgICAgICAgICAgIHRpbWluZzogeyBtaW5NZXNzYWdlczogMSwgbWF4TWVzc2FnZXM6IDUgfSxcclxuICAgICAgICAgICAgICBtZXNzYWdlczogeyByZXF1ZXN0OiAnSG93IGNhbiBJIGhlbHAgeW91PycsIGZvbGxvd1VwOiAnQW55dGhpbmcgZWxzZT8nLCBhY2tub3dsZWRnbWVudDogJ0dsYWQgSSBjb3VsZCBoZWxwIScgfSxcclxuICAgICAgICAgICAgICBhcHByb2FjaDogeyBkaXJlY3RuZXNzOiAnbWVkaXVtJywgY29udGV4dHVhbDogdHJ1ZSwgdmFsdWVQcm9wb3NpdGlvbjogJ1F1aWNrIGFzc2lzdGFuY2UnLCBmYWxsYmFja1N0cmF0ZWdpZXM6IFsnZXNjYWxhdGUnXSB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBnbG9iYWxTZXR0aW5nczoge1xyXG4gICAgICAgICAgICBtYXhBY3RpdmVHb2FsczogMyxcclxuICAgICAgICAgICAgcmVzcGVjdERlY2xpbmVzOiB0cnVlLFxyXG4gICAgICAgICAgICBhZGFwdFRvVXJnZW5jeTogdHJ1ZSxcclxuICAgICAgICAgICAgaW50ZXJlc3RUaHJlc2hvbGQ6IDAuN1xyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIGNvbXBsZXRpb25UcmlnZ2Vyczoge1xyXG4gICAgICAgICAgICBhbGxDcml0aWNhbENvbXBsZXRlOiAnVGhhbmsgeW91IGZvciBjaG9vc2luZyB1cyEnXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBhY3Rpb25UYWdzOiB7XHJcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgbWFwcGluZ3M6IHsgaGVscGZ1bDogJ/CfkY0nLCBwcm9mZXNzaW9uYWw6ICfwn5K8JyB9LFxyXG4gICAgICAgICAgZmFsbGJhY2tFbW9qaTogJ+KcqCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcclxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIEludGVycG9sYXRlIGNvbXBhbnkgZGV0YWlscyBpbnRvIHBlcnNvbmEgdGVtcGxhdGVzXHJcbiAgICAgIGNvbnN0IGNvbXBpbGVkUGVyc29uYSA9IHRoaXMuaW50ZXJwb2xhdGVQZXJzb25hVGVtcGxhdGVzKHBlcnNvbmEsIGNvbXBhbnlJbmZvKTtcclxuXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBDb21wYW55UGVyc29uYVJlc3BvbnNlID0ge1xyXG4gICAgICAgIHRlbmFudElkLFxyXG4gICAgICAgIGNvbXBhbnlJbmZvLFxyXG4gICAgICAgIHBlcnNvbmEsXHJcbiAgICAgICAgY29tcGlsZWRQZXJzb25hXHJcbiAgICAgIH07XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXNwb25zZSlcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyBjb21wYW55IHJhbmRvbSBwZXJzb25hOicsIGVycm9yKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byBnZXQgY29tcGFueSBwZXJzb25hJyxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEhlbHBlciBtZXRob2QgdG8gaW50ZXJwb2xhdGUgY29tcGFueSBkZXRhaWxzIGludG8gcGVyc29uYSB0ZW1wbGF0ZXNcclxuICAgKi9cclxuICBwcml2YXRlIGludGVycG9sYXRlUGVyc29uYVRlbXBsYXRlcyhwZXJzb25hOiBQZXJzb25hLCBjb21wYW55SW5mbzogQ29tcGFueUluZm8pOiBhbnkge1xyXG4gICAgY29uc3QgaW50ZXJwb2xhdGUgPSAodGV4dDogc3RyaW5nKTogc3RyaW5nID0+IHtcclxuICAgICAgcmV0dXJuIHRleHRcclxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueU5hbWVcXH1cXH0vZywgY29tcGFueUluZm8ubmFtZSlcclxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUluZHVzdHJ5XFx9XFx9L2csIGNvbXBhbnlJbmZvLmluZHVzdHJ5KVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgY29tcGFueUluZm8uZGVzY3JpcHRpb24gfHwgJycpO1xyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBpbnRlcnBvbGF0ZUFycmF5ID0gKGFycjogc3RyaW5nW10pOiBzdHJpbmdbXSA9PiB7XHJcbiAgICAgIHJldHVybiBhcnIubWFwKGludGVycG9sYXRlKTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgaW50ZXJwb2xhdGVPYmplY3QgPSAob2JqOiBhbnkpOiBhbnkgPT4ge1xyXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShvYmopKSB7XHJcbiAgICAgICAgcmV0dXJuIGludGVycG9sYXRlQXJyYXkob2JqKTtcclxuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpIHtcclxuICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IHt9O1xyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcclxuICAgICAgICAgIHJlc3VsdFtrZXldID0gaW50ZXJwb2xhdGVPYmplY3QodmFsdWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgcmV0dXJuIGludGVycG9sYXRlKG9iaik7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG9iajtcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbmFtZTogcGVyc29uYS5uYW1lLFxyXG4gICAgICBwZXJzb25hbGl0eTogaW50ZXJwb2xhdGVPYmplY3QocGVyc29uYS5wZXJzb25hbGl0eSksXHJcbiAgICAgIGdyZWV0aW5nczogaW50ZXJwb2xhdGVPYmplY3QocGVyc29uYS5ncmVldGluZ3MpLFxyXG4gICAgICByZXNwb25zZUNodW5raW5nOiBwZXJzb25hLnJlc3BvbnNlQ2h1bmtpbmcsXHJcbiAgICAgIGdvYWxDb25maWd1cmF0aW9uOiBpbnRlcnBvbGF0ZU9iamVjdChwZXJzb25hLmdvYWxDb25maWd1cmF0aW9uKSxcclxuICAgICAgYWN0aW9uVGFnczogcGVyc29uYS5hY3Rpb25UYWdzXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IHRoZSBzZXJ2aWNlIGFuZCBtZXRob2QgaGFuZGxlcnMgZm9yIExhbWJkYSBpbnRlZ3JhdGlvblxyXG5tb2R1bGUuZXhwb3J0cyA9IHtcclxuICBDb21wYW55UGVyc29uYVNlcnZpY2UsXHJcbiAgLi4uZ2V0QXBpTWV0aG9kSGFuZGxlcnMobmV3IENvbXBhbnlQZXJzb25hU2VydmljZSgpKVxyXG59OyJdfQ==