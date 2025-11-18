"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyPersonaService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
// Initialize DynamoDB client for chat history
let docClient;
function getDocClient() {
    if (!docClient) {
        const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
        docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
    }
    return docClient;
}
console.log('🚀 CompanyPersonaService: Service instance created');
/**
 * Service for retrieving combined Company + Persona data
 * Aggregates company information with persona configuration and interpolates templates
 */
class CompanyPersonaService {
    constructor() {
        // Lightweight service - returns placeholder data
    }
    /**
     * Load chat history from DynamoDB Messages table
     */
    async loadChatHistory(channelId, limit = 50) {
        const chatHistoryTable = process.env.CHAT_HISTORY_TABLE;
        if (!chatHistoryTable) {
            console.warn('CHAT_HISTORY_TABLE not configured, skipping chat history load');
            return [];
        }
        try {
            console.log(`Loading chat history for channel: ${channelId}`);
            const result = await getDocClient().send(new lib_dynamodb_1.QueryCommand({
                TableName: chatHistoryTable,
                KeyConditionExpression: 'targetKey = :targetKey',
                ExpressionAttributeValues: {
                    ':targetKey': `channel#${channelId}`
                },
                ScanIndexForward: true, // Oldest first (sorted by dateReceived)
                Limit: limit
            }));
            const messages = (result.Items || []).map(item => {
                // Determine role based on sender
                let role = 'user';
                if (item.senderId === item.metadata?.personaId || item.metadata?.isBot) {
                    role = 'assistant';
                }
                else if (item.metadata?.role === 'system') {
                    role = 'system';
                }
                return {
                    conversationId: channelId,
                    timestamp: new Date(item.dateReceived || item.createdAt).getTime(),
                    role,
                    content: item.content,
                    metadata: {
                        ...item.metadata,
                        senderId: item.senderId,
                        messageId: item.messageId,
                        messageType: item.messageType
                    }
                };
            });
            console.log(`Loaded ${messages.length} messages from channel ${channelId}`);
            return messages;
        }
        catch (error) {
            console.error('Error loading chat history:', error);
            return []; // Don't fail the whole request if chat history fails
        }
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
            const channelId = event.queryStringParameters?.channelId;
            // Load chat history if channelId provided
            let chatHistory = [];
            if (channelId) {
                chatHistory = await this.loadChatHistory(channelId);
            }
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
                },
                chatHistory
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
}
exports.CompanyPersonaService = CompanyPersonaService;
// Create service instance
const serviceInstance = new CompanyPersonaService();
console.log('🚀 CompanyPersonaService: Handler exported');
// Universal handler that routes GET requests
const handler = async (event) => {
    console.log('🚀 CompanyPersonaService: Universal handler called with method:', event.httpMethod);
    const method = event.httpMethod;
    if (method === 'GET') {
        return serviceInstance.getCompanyPersona(event);
    }
    else {
        return {
            statusCode: 501,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                message: `Method ${method} not implemented`
            })
        };
    }
};
const moduleExports = {
    CompanyPersonaService,
    handler
};
console.log('🚀 CompanyPersonaService: Final exports:', Object.keys(moduleExports));
module.exports = moduleExports;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFueS1wZXJzb25hLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2VydmljZXMvY29tcGFueS1wZXJzb25hLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUEsOERBQTBEO0FBQzFELHdEQUE2RTtBQUU3RSw4Q0FBOEM7QUFDOUMsSUFBSSxTQUFpQyxDQUFDO0FBRXRDLFNBQVMsWUFBWTtJQUNuQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDZixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUMsU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0RBQW9ELENBQUMsQ0FBQztBQXlCbEU7OztHQUdHO0FBQ0gsTUFBYSxxQkFBcUI7SUFFaEM7UUFDRSxpREFBaUQ7SUFDbkQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFpQixFQUFFLFFBQWdCLEVBQUU7UUFDekQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDO1FBRXhELElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxJQUFJLENBQUMsK0RBQStELENBQUMsQ0FBQztZQUM5RSxPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRTlELE1BQU0sTUFBTSxHQUFHLE1BQU0sWUFBWSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksMkJBQVksQ0FBQztnQkFDeEQsU0FBUyxFQUFFLGdCQUFnQjtnQkFDM0Isc0JBQXNCLEVB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QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE9BQU8sRUFBRSxVQUFVLE1BQU0sa0JBQWtCO2FBQzVDLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQUVGLE1BQU0sYUFBYSxHQUFHO0lBQ3BCLHFCQUFxQjtJQUNyQixPQUFPO0NBQ1IsQ0FBQztBQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBRXBGLE1BQU0sQ0FBQyxPQUFPLEdBQUcsYUFBYSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tcGFueUluZm8gfSBmcm9tICcuLi9tb2RlbHMvY29tcGFueS1pbmZvLmpzJztcbmltcG9ydCB7IFBlcnNvbmEgfSBmcm9tICcuLi9tb2RlbHMvcGVyc29uYXMuanMnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUXVlcnlDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcblxuLy8gSW5pdGlhbGl6ZSBEeW5hbW9EQiBjbGllbnQgZm9yIGNoYXQgaGlzdG9yeVxubGV0IGRvY0NsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudDtcblxuZnVuY3Rpb24gZ2V0RG9jQ2xpZW50KCkge1xuICBpZiAoIWRvY0NsaWVudCkge1xuICAgIGNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG4gICAgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG4gIH1cbiAgcmV0dXJuIGRvY0NsaWVudDtcbn1cblxuY29uc29sZS5sb2coJ/CfmoAgQ29tcGFueVBlcnNvbmFTZXJ2aWNlOiBTZXJ2aWNlIGluc3RhbmNlIGNyZWF0ZWQnKTtcblxuZXhwb3J0IGludGVyZmFjZSBDaGF0TWVzc2FnZSB7XG4gIGNvbnZlcnNhdGlvbklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xuICByb2xlOiAndXNlcicgfCAnYXNzaXN0YW50JyB8ICdzeXN0ZW0nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIG1ldGFkYXRhPzogYW55O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBhbnlQZXJzb25hUmVzcG9uc2Uge1xuICB0ZW5hbnRJZDogc3RyaW5nO1xuICBjb21wYW55SW5mbzogQ29tcGFueUluZm87XG4gIHBlcnNvbmE6IFBlcnNvbmE7XG4gIGNvbXBpbGVkUGVyc29uYToge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBwZXJzb25hbGl0eTogYW55O1xuICAgIGdyZWV0aW5nczogYW55O1xuICAgIHJlc3BvbnNlQ2h1bmtpbmc6IGFueTtcbiAgICBnb2FsQ29uZmlndXJhdGlvbjogYW55O1xuICAgIGFjdGlvblRhZ3M6IGFueTtcbiAgfTtcbiAgY2hhdEhpc3Rvcnk/OiBDaGF0TWVzc2FnZVtdO1xufVxuXG4vKipcbiAqIFNlcnZpY2UgZm9yIHJldHJpZXZpbmcgY29tYmluZWQgQ29tcGFueSArIFBlcnNvbmEgZGF0YVxuICogQWdncmVnYXRlcyBjb21wYW55IGluZm9ybWF0aW9uIHdpdGggcGVyc29uYSBjb25maWd1cmF0aW9uIGFuZCBpbnRlcnBvbGF0ZXMgdGVtcGxhdGVzXG4gKi9cbmV4cG9ydCBjbGFzcyBDb21wYW55UGVyc29uYVNlcnZpY2Uge1xuICBcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLy8gTGlnaHR3ZWlnaHQgc2VydmljZSAtIHJldHVybnMgcGxhY2Vob2xkZXIgZGF0YVxuICB9XG5cbiAgLyoqXG4gICAqIExvYWQgY2hhdCBoaXN0b3J5IGZyb20gRHluYW1vREIgTWVzc2FnZXMgdGFibGVcbiAgICovXG4gIGFzeW5jIGxvYWRDaGF0SGlzdG9yeShjaGFubmVsSWQ6IHN0cmluZywgbGltaXQ6IG51bWJlciA9IDUwKTogUHJvbWlzZTxDaGF0TWVzc2FnZVtdPiB7XG4gICAgY29uc3QgY2hhdEhpc3RvcnlUYWJsZSA9IHByb2Nlc3MuZW52LkNIQVRfSElTVE9SWV9UQUJMRTtcbiAgICBcbiAgICBpZiAoIWNoYXRIaXN0b3J5VGFibGUpIHtcbiAgICAgIGNvbnNvbGUud2FybignQ0hBVF9ISVNUT1JZX1RBQkxFIG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBjaGF0IGhpc3RvcnkgbG9hZCcpO1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLmxvZyhgTG9hZGluZyBjaGF0IGhpc3RvcnkgZm9yIGNoYW5uZWw6ICR7Y2hhbm5lbElkfWApO1xuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXREb2NDbGllbnQoKS5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGNoYXRIaXN0b3J5VGFibGUsXG4gICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd0YXJnZXRLZXkgPSA6dGFyZ2V0S2V5JyxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICc6dGFyZ2V0S2V5JzogYGNoYW5uZWwjJHtjaGFubmVsSWR9YFxuICAgICAgICB9LFxuICAgICAgICBTY2FuSW5kZXhGb3J3YXJkOiB0cnVlLCAvLyBPbGRlc3QgZmlyc3QgKHNvcnRlZCBieSBkYXRlUmVjZWl2ZWQpXG4gICAgICAgIExpbWl0OiBsaW1pdFxuICAgICAgfSkpO1xuXG4gICAgICBjb25zdCBtZXNzYWdlcyA9IChyZXN1bHQuSXRlbXMgfHwgW10pLm1hcChpdGVtID0+IHtcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHJvbGUgYmFzZWQgb24gc2VuZGVyXG4gICAgICAgIGxldCByb2xlOiAndXNlcicgfCAnYXNzaXN0YW50JyB8ICdzeXN0ZW0nID0gJ3VzZXInO1xuICAgICAgICBpZiAoaXRlbS5zZW5kZXJJZCA9PT0gaXRlbS5tZXRhZGF0YT8ucGVyc29uYUlkIHx8IGl0ZW0ubWV0YWRhdGE/LmlzQm90KSB7XG4gICAgICAgICAgcm9sZSA9ICdhc3Npc3RhbnQnO1xuICAgICAgICB9IGVsc2UgaWYgKGl0ZW0ubWV0YWRhdGE/LnJvbGUgPT09ICdzeXN0ZW0nKSB7XG4gICAgICAgICAgcm9sZSA9ICdzeXN0ZW0nO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNvbnZlcnNhdGlvbklkOiBjaGFubmVsSWQsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShpdGVtLmRhdGVSZWNlaXZlZCB8fCBpdGVtLmNyZWF0ZWRBdCkuZ2V0VGltZSgpLFxuICAgICAgICAgIHJvbGUsXG4gICAgICAgICAgY29udGVudDogaXRlbS5jb250ZW50LFxuICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICAuLi5pdGVtLm1ldGFkYXRhLFxuICAgICAgICAgICAgc2VuZGVySWQ6IGl0ZW0uc2VuZGVySWQsXG4gICAgICAgICAgICBtZXNzYWdlSWQ6IGl0ZW0ubWVzc2FnZUlkLFxuICAgICAgICAgICAgbWVzc2FnZVR5cGU6IGl0ZW0ubWVzc2FnZVR5cGVcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9KTtcblxuICAgICAgY29uc29sZS5sb2coYExvYWRlZCAke21lc3NhZ2VzLmxlbmd0aH0gbWVzc2FnZXMgZnJvbSBjaGFubmVsICR7Y2hhbm5lbElkfWApO1xuICAgICAgcmV0dXJuIG1lc3NhZ2VzO1xuICAgICAgXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBjaGF0IGhpc3Rvcnk6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIFtdOyAvLyBEb24ndCBmYWlsIHRoZSB3aG9sZSByZXF1ZXN0IGlmIGNoYXQgaGlzdG9yeSBmYWlsc1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgY29tcGFueSBpbmZvICsgc3BlY2lmaWMgcGVyc29uYVxuICAgKi9cbiAgYXN5bmMgZ2V0Q29tcGFueVBlcnNvbmEoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc29sZS5sb2coJ0NvbXBhbnlQZXJzb25hIGdldCBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xuICAgIFxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHRlbmFudElkLCBwZXJzb25hSWQgfSA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzO1xuICAgICAgY29uc3QgY2hhbm5lbElkID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy5jaGFubmVsSWQ7XG4gICAgICBcbiAgICAgIC8vIExvYWQgY2hhdCBoaXN0b3J5IGlmIGNoYW5uZWxJZCBwcm92aWRlZFxuICAgICAgbGV0IGNoYXRIaXN0b3J5OiBDaGF0TWVzc2FnZVtdID0gW107XG4gICAgICBpZiAoY2hhbm5lbElkKSB7XG4gICAgICAgIGNoYXRIaXN0b3J5ID0gYXdhaXQgdGhpcy5sb2FkQ2hhdEhpc3RvcnkoY2hhbm5lbElkKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gQ3JlYXRlIHR5cGUtc2FmZSBwbGFjZWhvbGRlciBkYXRhXG4gICAgICBjb25zdCBjb21wYW55SW5mbzogQ29tcGFueUluZm8gPSB7XG4gICAgICAgIHRlbmFudElkLFxuICAgICAgICBuYW1lOiAnU2FtcGxlIENvbXBhbnknLFxuICAgICAgICBpbmR1c3RyeTogJ1RlY2hub2xvZ3knLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Egc2FtcGxlIGNvbXBhbnkgZm9yIGRlbW9uc3RyYXRpb24nLFxuICAgICAgICBwcm9kdWN0czogJ1NvZnR3YXJlIHNvbHV0aW9ucyBhbmQgY29uc3VsdGluZyBzZXJ2aWNlcycsXG4gICAgICAgIGJlbmVmaXRzOiAnSW5ub3ZhdGl2ZSB0ZWNobm9sb2d5LCBleHBlcnQgc3VwcG9ydCwgY29tcGV0aXRpdmUgcHJpY2luZycsXG4gICAgICAgIHRhcmdldEN1c3RvbWVyczogJ1NtYWxsIHRvIG1lZGl1bSBidXNpbmVzc2VzIGxvb2tpbmcgZm9yIGRpZ2l0YWwgdHJhbnNmb3JtYXRpb24nLFxuICAgICAgICBkaWZmZXJlbnRpYXRvcnM6ICdQZXJzb25hbGl6ZWQgc2VydmljZSwgY3V0dGluZy1lZGdlIHRlY2hub2xvZ3ksIHByb3ZlbiB0cmFjayByZWNvcmQnLFxuICAgICAgICBpbnRlbnRDYXB0dXJpbmc6IHtcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGludGVudHM6IFtcbiAgICAgICAgICAgIHsgXG4gICAgICAgICAgICAgIGlkOiAnYXBwb2ludG1lbnQnLFxuICAgICAgICAgICAgICBuYW1lOiAnYXBwb2ludG1lbnQnLCBcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdTY2hlZHVsZSBhcHBvaW50bWVudHMnLCBcbiAgICAgICAgICAgICAgdHJpZ2dlcnM6IFsnYXBwb2ludG1lbnQnLCAnc2NoZWR1bGUnXSxcbiAgICAgICAgICAgICAgcGF0dGVybnM6IFsnYm9vayBhcHBvaW50bWVudCcsICdzY2hlZHVsZSBtZWV0aW5nJ10sXG4gICAgICAgICAgICAgIHByaW9yaXR5OiAnaGlnaCcgYXMgY29uc3QsXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0kgY2FuIGhlbHAgeW91IHNjaGVkdWxlIGFuIGFwcG9pbnRtZW50JyxcbiAgICAgICAgICAgICAgICBmb2xsb3dVcDogWydXaGF0IHRpbWUgd29ya3MgYmVzdD8nXVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2NvbGxlY3RfY29udGFjdF9pbmZvJywgJ3NjaGVkdWxlX2FwcG9pbnRtZW50J11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IFxuICAgICAgICAgICAgICBpZDogJ3ByaWNpbmcnLFxuICAgICAgICAgICAgICBuYW1lOiAncHJpY2luZycsIFxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1ByaWNpbmcgaW5xdWlyaWVzJywgXG4gICAgICAgICAgICAgIHRyaWdnZXJzOiBbJ3ByaWNlJywgJ2Nvc3QnXSxcbiAgICAgICAgICAgICAgcGF0dGVybnM6IFsnaG93IG11Y2gnLCAncHJpY2luZyddLFxuICAgICAgICAgICAgICBwcmlvcml0eTogJ21lZGl1bScgYXMgY29uc3QsXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0xldCBtZSBoZWxwIHlvdSB3aXRoIHByaWNpbmcgaW5mb3JtYXRpb24nLFxuICAgICAgICAgICAgICAgIGZvbGxvd1VwOiBbJ1doYXQgc2VydmljZSBhcmUgeW91IGludGVyZXN0ZWQgaW4/J11cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydwcm92aWRlX3ByaWNpbmcnXVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgXG4gICAgICAgICAgICAgIGlkOiAnc3VwcG9ydCcsXG4gICAgICAgICAgICAgIG5hbWU6ICdzdXBwb3J0JywgXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3VwcG9ydCByZXF1ZXN0cycsIFxuICAgICAgICAgICAgICB0cmlnZ2VyczogWydoZWxwJywgJ3N1cHBvcnQnXSxcbiAgICAgICAgICAgICAgcGF0dGVybnM6IFsnbmVlZCBoZWxwJywgJ3N1cHBvcnQnXSxcbiAgICAgICAgICAgICAgcHJpb3JpdHk6ICdoaWdoJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAndGVtcGxhdGUnIGFzIGNvbnN0LFxuICAgICAgICAgICAgICAgIHRlbXBsYXRlOiAnSVxcJ20gaGVyZSB0byBoZWxwIHlvdScsXG4gICAgICAgICAgICAgICAgZm9sbG93VXA6IFsnV2hhdCBjYW4gSSBhc3Npc3QgeW91IHdpdGg/J11cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydwcm92aWRlX3N1cHBvcnQnXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgZmFsbGJhY2tJbnRlbnQ6IHtcbiAgICAgICAgICAgIGlkOiAnZ2VuZXJhbCcsXG4gICAgICAgICAgICBuYW1lOiAnZ2VuZXJhbCcsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0dlbmVyYWwgYXNzaXN0YW5jZScsXG4gICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICB0eXBlOiAndGVtcGxhdGUnLFxuICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0hvdyBjYW4gSSBoZWxwIHlvdSB0b2RheT8nXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYWN0aW9uczogWydnZW5lcmFsX2hlbHAnXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgY29uZmlkZW5jZToge1xuICAgICAgICAgICAgdGhyZXNob2xkOiAwLjgsXG4gICAgICAgICAgICBtdWx0aXBsZUludGVudEhhbmRsaW5nOiAnaGlnaGVzdF9jb25maWRlbmNlJ1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHBlcnNvbmE6IFBlcnNvbmEgPSB7XG4gICAgICAgIHRlbmFudElkLFxuICAgICAgICBwZXJzb25hSWQsXG4gICAgICAgIG5hbWU6ICdTYW1wbGUgUGVyc29uYScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQSBzYW1wbGUgcGVyc29uYSBmb3IgZGVtb25zdHJhdGlvbicsXG4gICAgICAgIHN5c3RlbVByb21wdDogJ1lvdSBhcmUgYSBoZWxwZnVsIGFzc2lzdGFudCcsXG4gICAgICAgIHJlc3BvbnNlR3VpZGVsaW5lczogWydCZSBwb2xpdGUnLCAnQmUgaGVscGZ1bCcsICdCZSBwcm9mZXNzaW9uYWwnXSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgICAgICAgIHRhZ3M6IFsnc2FtcGxlJywgJ2RlbW8nXVxuICAgICAgICB9LFxuICAgICAgICBwZXJzb25hbGl0eToge1xuICAgICAgICAgIHRvbmU6ICdmcmllbmRseScsXG4gICAgICAgICAgc3R5bGU6ICdjb252ZXJzYXRpb25hbCcsXG4gICAgICAgICAgbGFuZ3VhZ2VRdWlya3M6IFsndXNlcyBlbW9qaXMnXSxcbiAgICAgICAgICBzcGVjaWFsQmVoYXZpb3JzOiBbJ2hlbHBmdWwnLCAncHJvZmVzc2lvbmFsJ11cbiAgICAgICAgfSxcbiAgICAgICAgZ3JlZXRpbmdzOiB7XG4gICAgICAgICAgZ2lzdDogJ1dlbGNvbWUgYW5kIG9mZmVyIGhlbHAnLFxuICAgICAgICAgIHZhcmlhdGlvbnM6IFsnSGVsbG8hIEhvdyBjYW4gSSBoZWxwIHlvdSB0b2RheT8nLCAnV2VsY29tZSBiYWNrISBXaGF0IGNhbiBJIGRvIGZvciB5b3U/J11cbiAgICAgICAgfSxcbiAgICAgICAgcmVzcG9uc2VDaHVua2luZzoge1xuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgcnVsZXM6IHtcbiAgICAgICAgICAgIGNoYXQ6IHsgbWF4TGVuZ3RoOiA1MDAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMTAwMCB9LFxuICAgICAgICAgICAgc21zOiB7IG1heExlbmd0aDogMTYwLCBjaHVua0J5OiAnc2VudGVuY2UnLCBkZWxheUJldHdlZW5DaHVua3M6IDIwMDAgfSxcbiAgICAgICAgICAgIGVtYWlsOiB7IG1heExlbmd0aDogMTAwMCwgY2h1bmtCeTogJ3BhcmFncmFwaCcsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBnb2FsQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZ29hbHM6IFtcbiAgICAgICAgICAgIHsgXG4gICAgICAgICAgICAgIGlkOiAnYXNzaXN0X2N1c3RvbWVycycsIFxuICAgICAgICAgICAgICBuYW1lOiAnQXNzaXN0IEN1c3RvbWVycycsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnSGVscCBjdXN0b21lcnMgd2l0aCB0aGVpciBuZWVkcycsXG4gICAgICAgICAgICAgIHR5cGU6ICdwcmltYXJ5JyxcbiAgICAgICAgICAgICAgcHJpb3JpdHk6ICcxJyxcbiAgICAgICAgICAgICAgdGFyZ2V0OiB7IGZpZWxkOiAnc2F0aXNmYWN0aW9uJywgZXh0cmFjdGlvblBhdHRlcm5zOiBbJ3NhdGlzZmllZCcsICdoYXBweSddIH0sXG4gICAgICAgICAgICAgIHRpbWluZzogeyBtaW5NZXNzYWdlczogMSwgbWF4TWVzc2FnZXM6IDUgfSxcbiAgICAgICAgICAgICAgbWVzc2FnZXM6IHsgcmVxdWVzdDogJ0hvdyBjYW4gSSBoZWxwIHlvdT8nLCBmb2xsb3dVcDogJ0FueXRoaW5nIGVsc2U/JywgYWNrbm93bGVkZ21lbnQ6ICdHbGFkIEkgY291bGQgaGVscCEnIH0sXG4gICAgICAgICAgICAgIGFwcHJvYWNoOiB7IGRpcmVjdG5lc3M6ICdtZWRpdW0nLCBjb250ZXh0dWFsOiB0cnVlLCB2YWx1ZVByb3Bvc2l0aW9uOiAnUXVpY2sgYXNzaXN0YW5jZScsIGZhbGxiYWNrU3RyYXRlZ2llczogWydlc2NhbGF0ZSddIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIGdsb2JhbFNldHRpbmdzOiB7XG4gICAgICAgICAgICBtYXhBY3RpdmVHb2FsczogMyxcbiAgICAgICAgICAgIHJlc3BlY3REZWNsaW5lczogdHJ1ZSxcbiAgICAgICAgICAgIGFkYXB0VG9VcmdlbmN5OiB0cnVlLFxuICAgICAgICAgICAgaW50ZXJlc3RUaHJlc2hvbGQ6IDAuN1xuICAgICAgICAgIH0sXG4gICAgICAgICAgY29tcGxldGlvblRyaWdnZXJzOiB7XG4gICAgICAgICAgICBhbGxDcml0aWNhbENvbXBsZXRlOiAnVGhhbmsgeW91IGZvciBjaG9vc2luZyB1cyEnXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhY3Rpb25UYWdzOiB7XG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtYXBwaW5nczogeyBoZWxwZnVsOiAn8J+RjScsIHByb2Zlc3Npb25hbDogJ/CfkrwnIH0sXG4gICAgICAgICAgZmFsbGJhY2tFbW9qaTogJ+KcqCdcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBDb21wYW55UGVyc29uYVJlc3BvbnNlID0ge1xuICAgICAgICB0ZW5hbnRJZCxcbiAgICAgICAgY29tcGFueUluZm8sXG4gICAgICAgIHBlcnNvbmEsXG4gICAgICAgIGNvbXBpbGVkUGVyc29uYToge1xuICAgICAgICAgIG5hbWU6IHBlcnNvbmEubmFtZSxcbiAgICAgICAgICBwZXJzb25hbGl0eTogcGVyc29uYS5wZXJzb25hbGl0eSxcbiAgICAgICAgICBncmVldGluZ3M6IHBlcnNvbmEuZ3JlZXRpbmdzLFxuICAgICAgICAgIHJlc3BvbnNlQ2h1bmtpbmc6IHBlcnNvbmEucmVzcG9uc2VDaHVua2luZyxcbiAgICAgICAgICBnb2FsQ29uZmlndXJhdGlvbjogcGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbixcbiAgICAgICAgICBhY3Rpb25UYWdzOiBwZXJzb25hLmFjdGlvblRhZ3NcbiAgICAgICAgfSxcbiAgICAgICAgY2hhdEhpc3RvcnlcbiAgICAgIH07XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIGNvbXBhbnkgcGVyc29uYTonLCBlcnJvcik7XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBtZXNzYWdlOiAnQ29tcGFueSBwZXJzb25hIG5vdCBmb3VuZCcsXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjb21wYW55IGluZm8gKyByYW5kb20gcGVyc29uYVxuICAgKi9cbiAgYXN5bmMgZ2V0Q29tcGFueVJhbmRvbVBlcnNvbmEoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc29sZS5sb2coJ0NvbXBhbnlQZXJzb25hIGdldFJhbmRvbVBlcnNvbmEgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQucGF0aFBhcmFtZXRlcnMpKTtcbiAgICBcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB0ZW5hbnRJZCB9ID0gZXZlbnQucGF0aFBhcmFtZXRlcnM7XG4gICAgICBcbiAgICAgIC8vIENyZWF0ZSB0eXBlLXNhZmUgcGxhY2Vob2xkZXIgZGF0YVxuICAgICAgY29uc3QgY29tcGFueUluZm86IENvbXBhbnlJbmZvID0ge1xuICAgICAgICB0ZW5hbnRJZCxcbiAgICAgICAgbmFtZTogJ1NhbXBsZSBDb21wYW55JyxcbiAgICAgICAgaW5kdXN0cnk6ICdUZWNobm9sb2d5JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBIHNhbXBsZSBjb21wYW55IGZvciBkZW1vbnN0cmF0aW9uJyxcbiAgICAgICAgcHJvZHVjdHM6ICdTb2Z0d2FyZSBzb2x1dGlvbnMgYW5kIGNvbnN1bHRpbmcgc2VydmljZXMnLFxuICAgICAgICBiZW5lZml0czogJ0lubm92YXRpdmUgdGVjaG5vbG9neSwgZXhwZXJ0IHN1cHBvcnQsIGNvbXBldGl0aXZlIHByaWNpbmcnLFxuICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdTbWFsbCB0byBtZWRpdW0gYnVzaW5lc3NlcyBsb29raW5nIGZvciBkaWdpdGFsIHRyYW5zZm9ybWF0aW9uJyxcbiAgICAgICAgZGlmZmVyZW50aWF0b3JzOiAnUGVyc29uYWxpemVkIHNlcnZpY2UsIGN1dHRpbmctZWRnZSB0ZWNobm9sb2d5LCBwcm92ZW4gdHJhY2sgcmVjb3JkJyxcbiAgICAgICAgaW50ZW50Q2FwdHVyaW5nOiB7XG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBpbnRlbnRzOiBbXG4gICAgICAgICAgICB7IFxuICAgICAgICAgICAgICBpZDogJ2FwcG9pbnRtZW50JyxcbiAgICAgICAgICAgICAgbmFtZTogJ2FwcG9pbnRtZW50JywgXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU2NoZWR1bGUgYXBwb2ludG1lbnRzJywgXG4gICAgICAgICAgICAgIHRyaWdnZXJzOiBbJ2FwcG9pbnRtZW50JywgJ3NjaGVkdWxlJ10sXG4gICAgICAgICAgICAgIHBhdHRlcm5zOiBbJ2Jvb2sgYXBwb2ludG1lbnQnLCAnc2NoZWR1bGUgbWVldGluZyddLFxuICAgICAgICAgICAgICBwcmlvcml0eTogJ2hpZ2gnIGFzIGNvbnN0LFxuICAgICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0ZW1wbGF0ZScgYXMgY29uc3QsXG4gICAgICAgICAgICAgICAgdGVtcGxhdGU6ICdJIGNhbiBoZWxwIHlvdSBzY2hlZHVsZSBhbiBhcHBvaW50bWVudCcsXG4gICAgICAgICAgICAgICAgZm9sbG93VXA6IFsnV2hhdCB0aW1lIHdvcmtzIGJlc3Q/J11cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydjb2xsZWN0X2NvbnRhY3RfaW5mbycsICdzY2hlZHVsZV9hcHBvaW50bWVudCddXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBcbiAgICAgICAgICAgICAgaWQ6ICdwcmljaW5nJyxcbiAgICAgICAgICAgICAgbmFtZTogJ3ByaWNpbmcnLCBcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQcmljaW5nIGlucXVpcmllcycsIFxuICAgICAgICAgICAgICB0cmlnZ2VyczogWydwcmljZScsICdjb3N0J10sXG4gICAgICAgICAgICAgIHBhdHRlcm5zOiBbJ2hvdyBtdWNoJywgJ3ByaWNpbmcnXSxcbiAgICAgICAgICAgICAgcHJpb3JpdHk6ICdtZWRpdW0nIGFzIGNvbnN0LFxuICAgICAgICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0ZW1wbGF0ZScgYXMgY29uc3QsXG4gICAgICAgICAgICAgICAgdGVtcGxhdGU6ICdMZXQgbWUgaGVscCB5b3Ugd2l0aCBwcmljaW5nIGluZm9ybWF0aW9uJyxcbiAgICAgICAgICAgICAgICBmb2xsb3dVcDogWydXaGF0IHNlcnZpY2UgYXJlIHlvdSBpbnRlcmVzdGVkIGluPyddXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsncHJvdmlkZV9wcmljaW5nJ11cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IFxuICAgICAgICAgICAgICBpZDogJ3N1cHBvcnQnLFxuICAgICAgICAgICAgICBuYW1lOiAnc3VwcG9ydCcsIFxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1N1cHBvcnQgcmVxdWVzdHMnLCBcbiAgICAgICAgICAgICAgdHJpZ2dlcnM6IFsnaGVscCcsICdzdXBwb3J0J10sXG4gICAgICAgICAgICAgIHBhdHRlcm5zOiBbJ25lZWQgaGVscCcsICdzdXBwb3J0J10sXG4gICAgICAgICAgICAgIHByaW9yaXR5OiAnaGlnaCcgYXMgY29uc3QsXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZTogJ0lcXCdtIGhlcmUgdG8gaGVscCB5b3UnLFxuICAgICAgICAgICAgICAgIGZvbGxvd1VwOiBbJ1doYXQgY2FuIEkgYXNzaXN0IHlvdSB3aXRoPyddXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsncHJvdmlkZV9zdXBwb3J0J11cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIGZhbGxiYWNrSW50ZW50OiB7XG4gICAgICAgICAgICBpZDogJ2dlbmVyYWwnLFxuICAgICAgICAgICAgbmFtZTogJ2dlbmVyYWwnLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZW5lcmFsIGFzc2lzdGFuY2UnLFxuICAgICAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICAgICAgdHlwZTogJ3RlbXBsYXRlJyxcbiAgICAgICAgICAgICAgdGVtcGxhdGU6ICdIb3cgY2FuIEkgaGVscCB5b3UgdG9kYXk/J1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFsnZ2VuZXJhbF9oZWxwJ11cbiAgICAgICAgICB9LFxuICAgICAgICAgIGNvbmZpZGVuY2U6IHtcbiAgICAgICAgICAgIHRocmVzaG9sZDogMC44LFxuICAgICAgICAgICAgbXVsdGlwbGVJbnRlbnRIYW5kbGluZzogJ2hpZ2hlc3RfY29uZmlkZW5jZSdcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBwZXJzb25hOiBQZXJzb25hID0ge1xuICAgICAgICB0ZW5hbnRJZCxcbiAgICAgICAgcGVyc29uYUlkOiAncmFuZG9tLXBlcnNvbmEnLFxuICAgICAgICBuYW1lOiAnUmFuZG9tIFBlcnNvbmEnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0EgcmFuZG9tIHBlcnNvbmEgd2l0aCBjb21wYW55IHRlbXBsYXRlcycsXG4gICAgICAgIHN5c3RlbVByb21wdDogJ1lvdSBhcmUgYSBoZWxwZnVsIGFzc2lzdGFudCBmb3Ige3tjb21wYW55TmFtZX19JyxcbiAgICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBbJ0JlIHBvbGl0ZScsICdVc2UgY29tcGFueSBuYW1lJywgJ0JlIGhlbHBmdWwnXSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgICAgICAgIHRhZ3M6IFsnc2FtcGxlJywgJ2RlbW8nXVxuICAgICAgICB9LFxuICAgICAgICBwZXJzb25hbGl0eToge1xuICAgICAgICAgIHRvbmU6ICdmcmllbmRseScsXG4gICAgICAgICAgc3R5bGU6ICdjb252ZXJzYXRpb25hbCcsXG4gICAgICAgICAgbGFuZ3VhZ2VRdWlya3M6IFsndXNlcyBjb21wYW55IG5hbWUnXSxcbiAgICAgICAgICBzcGVjaWFsQmVoYXZpb3JzOiBbJ2hlbHBmdWwnLCAncHJvZmVzc2lvbmFsJ11cbiAgICAgICAgfSxcbiAgICAgICAgZ3JlZXRpbmdzOiB7XG4gICAgICAgICAgZ2lzdDogJ1dlbGNvbWUgd2l0aCBjb21wYW55IG5hbWUnLFxuICAgICAgICAgIHZhcmlhdGlvbnM6IFsnSGVsbG8hIEhvdyBjYW4gSSBoZWxwIHlvdSB3aXRoIHt7Y29tcGFueU5hbWV9fT8nLCAnV2VsY29tZSB0byB7e2NvbXBhbnlOYW1lfX0hJ11cbiAgICAgICAgfSxcbiAgICAgICAgcmVzcG9uc2VDaHVua2luZzoge1xuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgcnVsZXM6IHtcbiAgICAgICAgICAgIGNoYXQ6IHsgbWF4TGVuZ3RoOiA1MDAsIGNodW5rQnk6ICdzZW50ZW5jZScsIGRlbGF5QmV0d2VlbkNodW5rczogMTAwMCB9LFxuICAgICAgICAgICAgc21zOiB7IG1heExlbmd0aDogMTYwLCBjaHVua0J5OiAnc2VudGVuY2UnLCBkZWxheUJldHdlZW5DaHVua3M6IDIwMDAgfSxcbiAgICAgICAgICAgIGVtYWlsOiB7IG1heExlbmd0aDogMTAwMCwgY2h1bmtCeTogJ3BhcmFncmFwaCcsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBnb2FsQ29uZmlndXJhdGlvbjoge1xuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZ29hbHM6IFtcbiAgICAgICAgICAgIHsgXG4gICAgICAgICAgICAgIGlkOiAnYXNzaXN0X2N1c3RvbWVycycsIFxuICAgICAgICAgICAgICBuYW1lOiAnQXNzaXN0IEN1c3RvbWVycycsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnSGVscCBjdXN0b21lcnMgd2l0aCB0aGVpciBuZWVkcycsXG4gICAgICAgICAgICAgIHR5cGU6ICdwcmltYXJ5JyxcbiAgICAgICAgICAgICAgcHJpb3JpdHk6ICcxJyxcbiAgICAgICAgICAgICAgdGFyZ2V0OiB7IGZpZWxkOiAnc2F0aXNmYWN0aW9uJywgZXh0cmFjdGlvblBhdHRlcm5zOiBbJ3NhdGlzZmllZCcsICdoYXBweSddIH0sXG4gICAgICAgICAgICAgIHRpbWluZzogeyBtaW5NZXNzYWdlczogMSwgbWF4TWVzc2FnZXM6IDUgfSxcbiAgICAgICAgICAgICAgbWVzc2FnZXM6IHsgcmVxdWVzdDogJ0hvdyBjYW4gSSBoZWxwIHlvdT8nLCBmb2xsb3dVcDogJ0FueXRoaW5nIGVsc2U/JywgYWNrbm93bGVkZ21lbnQ6ICdHbGFkIEkgY291bGQgaGVscCEnIH0sXG4gICAgICAgICAgICAgIGFwcHJvYWNoOiB7IGRpcmVjdG5lc3M6ICdtZWRpdW0nLCBjb250ZXh0dWFsOiB0cnVlLCB2YWx1ZVByb3Bvc2l0aW9uOiAnUXVpY2sgYXNzaXN0YW5jZScsIGZhbGxiYWNrU3RyYXRlZ2llczogWydlc2NhbGF0ZSddIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIGdsb2JhbFNldHRpbmdzOiB7XG4gICAgICAgICAgICBtYXhBY3RpdmVHb2FsczogMyxcbiAgICAgICAgICAgIHJlc3BlY3REZWNsaW5lczogdHJ1ZSxcbiAgICAgICAgICAgIGFkYXB0VG9VcmdlbmN5OiB0cnVlLFxuICAgICAgICAgICAgaW50ZXJlc3RUaHJlc2hvbGQ6IDAuN1xuICAgICAgICAgIH0sXG4gICAgICAgICAgY29tcGxldGlvblRyaWdnZXJzOiB7XG4gICAgICAgICAgICBhbGxDcml0aWNhbENvbXBsZXRlOiAnVGhhbmsgeW91IGZvciBjaG9vc2luZyB1cyEnXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhY3Rpb25UYWdzOiB7XG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtYXBwaW5nczogeyBoZWxwZnVsOiAn8J+RjScsIHByb2Zlc3Npb25hbDogJ/CfkrwnIH0sXG4gICAgICAgICAgZmFsbGJhY2tFbW9qaTogJ+KcqCdcbiAgICAgICAgfSxcbiAgICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgICAgIH07XG5cbiAgICAgIC8vIEludGVycG9sYXRlIGNvbXBhbnkgZGV0YWlscyBpbnRvIHBlcnNvbmEgdGVtcGxhdGVzXG4gICAgICBjb25zdCBjb21waWxlZFBlcnNvbmEgPSB0aGlzLmludGVycG9sYXRlUGVyc29uYVRlbXBsYXRlcyhwZXJzb25hLCBjb21wYW55SW5mbyk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBDb21wYW55UGVyc29uYVJlc3BvbnNlID0ge1xuICAgICAgICB0ZW5hbnRJZCxcbiAgICAgICAgY29tcGFueUluZm8sXG4gICAgICAgIHBlcnNvbmEsXG4gICAgICAgIGNvbXBpbGVkUGVyc29uYVxuICAgICAgfTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UpXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdldHRpbmcgY29tcGFueSByYW5kb20gcGVyc29uYTonLCBlcnJvcik7XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGdldCBjb21wYW55IHBlcnNvbmEnLFxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXG4gICAgICAgIH0pXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIZWxwZXIgbWV0aG9kIHRvIGludGVycG9sYXRlIGNvbXBhbnkgZGV0YWlscyBpbnRvIHBlcnNvbmEgdGVtcGxhdGVzXG4gICAqL1xuICBwcml2YXRlIGludGVycG9sYXRlUGVyc29uYVRlbXBsYXRlcyhwZXJzb25hOiBQZXJzb25hLCBjb21wYW55SW5mbzogQ29tcGFueUluZm8pOiBhbnkge1xuICAgIGNvbnN0IGludGVycG9sYXRlID0gKHRleHQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICByZXR1cm4gdGV4dFxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueU5hbWVcXH1cXH0vZywgY29tcGFueUluZm8ubmFtZSlcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlJbmR1c3RyeVxcfVxcfS9nLCBjb21wYW55SW5mby5pbmR1c3RyeSlcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEZXNjcmlwdGlvblxcfVxcfS9nLCBjb21wYW55SW5mby5kZXNjcmlwdGlvbiB8fCAnJyk7XG4gICAgfTtcblxuICAgIGNvbnN0IGludGVycG9sYXRlQXJyYXkgPSAoYXJyOiBzdHJpbmdbXSk6IHN0cmluZ1tdID0+IHtcbiAgICAgIHJldHVybiBhcnIubWFwKGludGVycG9sYXRlKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaW50ZXJwb2xhdGVPYmplY3QgPSAob2JqOiBhbnkpOiBhbnkgPT4ge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkob2JqKSkge1xuICAgICAgICByZXR1cm4gaW50ZXJwb2xhdGVBcnJheShvYmopO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gaW50ZXJwb2xhdGVPYmplY3QodmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBpbnRlcnBvbGF0ZShvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG5hbWU6IHBlcnNvbmEubmFtZSxcbiAgICAgIHBlcnNvbmFsaXR5OiBpbnRlcnBvbGF0ZU9iamVjdChwZXJzb25hLnBlcnNvbmFsaXR5KSxcbiAgICAgIGdyZWV0aW5nczogaW50ZXJwb2xhdGVPYmplY3QocGVyc29uYS5ncmVldGluZ3MpLFxuICAgICAgcmVzcG9uc2VDaHVua2luZzogcGVyc29uYS5yZXNwb25zZUNodW5raW5nLFxuICAgICAgZ29hbENvbmZpZ3VyYXRpb246IGludGVycG9sYXRlT2JqZWN0KHBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24pLFxuICAgICAgYWN0aW9uVGFnczogcGVyc29uYS5hY3Rpb25UYWdzXG4gICAgfTtcbiAgfVxufVxuXG4vLyBDcmVhdGUgc2VydmljZSBpbnN0YW5jZVxuY29uc3Qgc2VydmljZUluc3RhbmNlID0gbmV3IENvbXBhbnlQZXJzb25hU2VydmljZSgpO1xuXG5jb25zb2xlLmxvZygn8J+agCBDb21wYW55UGVyc29uYVNlcnZpY2U6IEhhbmRsZXIgZXhwb3J0ZWQnKTtcblxuLy8gVW5pdmVyc2FsIGhhbmRsZXIgdGhhdCByb3V0ZXMgR0VUIHJlcXVlc3RzXG5jb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpID0+IHtcbiAgY29uc29sZS5sb2coJ/CfmoAgQ29tcGFueVBlcnNvbmFTZXJ2aWNlOiBVbml2ZXJzYWwgaGFuZGxlciBjYWxsZWQgd2l0aCBtZXRob2Q6JywgZXZlbnQuaHR0cE1ldGhvZCk7XG4gIFxuICBjb25zdCBtZXRob2QgPSBldmVudC5odHRwTWV0aG9kO1xuICBcbiAgaWYgKG1ldGhvZCA9PT0gJ0dFVCcpIHtcbiAgICByZXR1cm4gc2VydmljZUluc3RhbmNlLmdldENvbXBhbnlQZXJzb25hKGV2ZW50KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAxLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYE1ldGhvZCAke21ldGhvZH0gbm90IGltcGxlbWVudGVkYFxuICAgICAgfSlcbiAgICB9O1xuICB9XG59O1xuXG5jb25zdCBtb2R1bGVFeHBvcnRzID0ge1xuICBDb21wYW55UGVyc29uYVNlcnZpY2UsXG4gIGhhbmRsZXJcbn07XG5jb25zb2xlLmxvZygn8J+agCBDb21wYW55UGVyc29uYVNlcnZpY2U6IEZpbmFsIGV4cG9ydHM6JywgT2JqZWN0LmtleXMobW9kdWxlRXhwb3J0cykpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1vZHVsZUV4cG9ydHM7Il19