"use strict";
/**
 * Example: Using the new API-based persona loading in the agent
 * This shows how to migrate from personas.json to the new API structure
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiPersonaAgentService = void 0;
exports.createApiPersonaAgent = createApiPersonaAgent;
exports.exampleLambdaHandler = exampleLambdaHandler;
const agent_js_1 = require("../lib/agent.js");
const persona_api_loader_js_1 = require("../lib/persona-api-loader.js");
class ApiPersonaAgentService extends agent_js_1.AgentService {
    constructor(config, personaApiConfig) {
        super(config);
        // Initialize the persona API loader
        this.personaLoader = (0, persona_api_loader_js_1.createPersonaApiLoader)(personaApiConfig);
    }
    /**
     * Override the persona loading to use API instead of personas.json
     */
    async loadPersonaForTenant(tenantId, personaId) {
        try {
            // Load from API instead of personas.json
            const companyPersona = await this.personaLoader.loadCompanyPersona(tenantId, personaId);
            // Convert to legacy format for backward compatibility
            const legacyPersona = this.personaLoader.convertToLegacyFormat(companyPersona);
            console.log(`Loaded persona '${legacyPersona.name}' for tenant ${tenantId}`);
            return legacyPersona;
        }
        catch (error) {
            console.error('Failed to load persona from API, falling back to default:', error);
            // Fallback to a basic default persona
            return this.getDefaultPersona();
        }
    }
    /**
     * Process message with API-loaded persona
     */
    async processMessageWithApiPersona(params) {
        // Load persona from API
        const persona = await this.loadPersonaForTenant(params.tenantId, params.personaId);
        // Process message with the loaded persona
        // Note: This is a conceptual example - actual implementation would depend on AgentService interface
        return this.processMessage({
            tenantId: params.tenantId,
            email_lc: params.email_lc,
            text: params.text,
            source: params.source,
            // persona would be used internally by the service
        });
    }
    getDefaultPersona() {
        return {
            name: 'Default Agent',
            description: 'A helpful assistant',
            systemPrompt: 'You are a helpful assistant.',
            personality: {
                tone: 'friendly, professional',
                style: 'conversational',
            },
            greetings: {
                gist: 'Friendly greeting',
                variations: ['Hello! How can I help you today?'],
            },
            responseGuidelines: ['Be helpful and professional'],
            intentCapturing: {
                enabled: false,
                intents: [],
                fallbackIntent: {
                    id: 'general_inquiry',
                    name: 'General Inquiry',
                    description: 'Default response',
                    response: {
                        type: 'conversational',
                        template: 'I\'d be happy to help you with that!',
                    },
                    actions: [],
                },
                confidence: {
                    threshold: 0.6,
                    multipleIntentHandling: 'highest_confidence',
                },
            },
        };
    }
}
exports.ApiPersonaAgentService = ApiPersonaAgentService;
/**
 * Factory function to create an agent with API persona loading
 */
function createApiPersonaAgent(config) {
    const agentConfig = {
        messagesTable: config.messagesTable,
        leadsTable: config.leadsTable,
        bedrockModelId: config.bedrockModelId,
        outboundEventBusName: config.outboundEventBusName,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        historyLimit: 50,
    };
    const personaApiConfig = {
        baseUrl: config.managementApiUrl,
        timeout: config.apiTimeout,
        headers: config.apiAuthToken ? {
            'Authorization': `Bearer ${config.apiAuthToken}`,
        } : undefined,
    };
    return new ApiPersonaAgentService(agentConfig, personaApiConfig);
}
/**
 * Example usage in a Lambda handler
 */
async function exampleLambdaHandler(event, context) {
    // Create agent with API persona loading
    const agent = createApiPersonaAgent({
        messagesTable: process.env.MESSAGES_TABLE,
        leadsTable: process.env.LEADS_TABLE,
        bedrockModelId: process.env.BEDROCK_MODEL_ID,
        managementApiUrl: process.env.MANAGEMENT_API_URL,
        apiAuthToken: process.env.API_AUTH_TOKEN,
    });
    // Extract message details from event
    const { tenantId, email_lc, text, source, personaId } = event.detail;
    try {
        // Process message with API-loaded persona
        const response = await agent.processMessageWithApiPersona({
            tenantId,
            email_lc,
            text,
            source,
            personaId, // Optional - will use random if not provided
        });
        console.log('Agent response:', response);
        return response;
    }
    catch (error) {
        console.error('Error processing message:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQtd2l0aC1hcGktcGVyc29uYXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvZXhhbXBsZXMvYWdlbnQtd2l0aC1hcGktcGVyc29uYXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBc0dILHNEQThCQztBQUtELG9EQTZCQztBQXBLRCw4Q0FBK0M7QUFDL0Msd0VBQXdGO0FBSXhGLE1BQWEsc0JBQXVCLFNBQVEsdUJBQVk7SUFHdEQsWUFBWSxNQUFXLEVBQUUsZ0JBQXNCO1FBQzdDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVkLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUEsOENBQXNCLEVBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsb0JBQW9CLENBQUMsUUFBZ0IsRUFBRSxTQUFrQjtRQUM3RCxJQUFJLENBQUM7WUFDSCx5Q0FBeUM7WUFDekMsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUV4RixzREFBc0Q7WUFDdEQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUUvRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixhQUFhLENBQUMsSUFBSSxnQkFBZ0IsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUU3RSxPQUFPLGFBQWEsQ0FBQztRQUN2QixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkRBQTJELEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFbEYsc0NBQXNDO1lBQ3RDLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDbEMsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxNQU1sQztRQUNDLHdCQUF3QjtRQUN4QixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVuRiwwQ0FBMEM7UUFDMUMsb0dBQW9HO1FBQ3BHLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztZQUN6QixRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVE7WUFDekIsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRO1lBQ3pCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtZQUNqQixNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU07WUFDckIsa0RBQWtEO1NBQ25ELENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxpQkFBaUI7UUFDdkIsT0FBTztZQUNMLElBQUksRUFBRSxlQUFlO1lBQ3JCLFdBQVcsRUFBRSxxQkFBcUI7WUFDbEMsWUFBWSxFQUFFLDhCQUE4QjtZQUM1QyxXQUFXLEVBQUU7Z0JBQ1gsSUFBSSxFQUFFLHdCQUF3QjtnQkFDOUIsS0FBSyxFQUFFLGdCQUFnQjthQUN4QjtZQUNELFNBQVMsRUFBRTtnQkFDVCxJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixVQUFVLEVBQUUsQ0FBQyxrQ0FBa0MsQ0FBQzthQUNqRDtZQUNELGtCQUFrQixFQUFFLENBQUMsNkJBQTZCLENBQUM7WUFDbkQsZUFBZSxFQUFFO2dCQUNmLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE9BQU8sRUFBRSxFQUFFO2dCQUNYLGNBQWMsRUFBRTtvQkFDZCxFQUFFLEVBQUUsaUJBQWlCO29CQUNyQixJQUFJLEVBQUUsaUJBQWlCO29CQUN2QixXQUFXLEVBQUUsa0JBQWtCO29CQUMvQixRQUFRLEVBQUU7d0JBQ1IsSUFBSSxFQUFFLGdCQUFnQjt3QkFDdEIsUUFBUSxFQUFFLHNDQUFzQztxQkFDakQ7b0JBQ0QsT0FBTyxFQUFFLEVBQUU7aUJBQ1o7Z0JBQ0QsVUFBVSxFQUFFO29CQUNWLFNBQVMsRUFBRSxHQUFHO29CQUNkLHNCQUFzQixFQUFFLG9CQUFvQjtpQkFDN0M7YUFDRjtTQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUExRkQsd0RBMEZDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQixxQkFBcUIsQ0FBQyxNQVdyQztJQUNDLE1BQU0sV0FBVyxHQUFHO1FBQ2xCLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTtRQUNuQyxVQUFVLEVBQUUsTUFBTSxDQUFDLFVBQVU7UUFDN0IsY0FBYyxFQUFFLE1BQU0sQ0FBQyxjQUFjO1FBQ3JDLG9CQUFvQixFQUFFLE1BQU0sQ0FBQyxvQkFBb0I7UUFDakQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVc7UUFDaEQsWUFBWSxFQUFFLEVBQUU7S0FDakIsQ0FBQztJQUVGLE1BQU0sZ0JBQWdCLEdBQUc7UUFDdkIsT0FBTyxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0I7UUFDaEMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVO1FBQzFCLE9BQU8sRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUM3QixlQUFlLEVBQUUsVUFBVSxNQUFNLENBQUMsWUFBWSxFQUFFO1NBQ2pELENBQUMsQ0FBQyxDQUFDLFNBQVM7S0FDZCxDQUFDO0lBRUYsT0FBTyxJQUFJLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ25FLENBQUM7QUFFRDs7R0FFRztBQUNJLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxLQUFVLEVBQUUsT0FBWTtJQUNqRSx3Q0FBd0M7SUFDeEMsTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUM7UUFDbEMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtRQUMxQyxVQUFVLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZO1FBQ3BDLGNBQWMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFpQjtRQUM3QyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFtQjtRQUNqRCxZQUFZLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjO0tBQ3pDLENBQUMsQ0FBQztJQUVILHFDQUFxQztJQUNyQyxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFFckUsSUFBSSxDQUFDO1FBQ0gsMENBQTBDO1FBQzFDLE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLDRCQUE0QixDQUFDO1lBQ3hELFFBQVE7WUFDUixRQUFRO1lBQ1IsSUFBSTtZQUNKLE1BQU07WUFDTixTQUFTLEVBQUUsNkNBQTZDO1NBQ3pELENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDekMsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRXhhbXBsZTogVXNpbmcgdGhlIG5ldyBBUEktYmFzZWQgcGVyc29uYSBsb2FkaW5nIGluIHRoZSBhZ2VudFxyXG4gKiBUaGlzIHNob3dzIGhvdyB0byBtaWdyYXRlIGZyb20gcGVyc29uYXMuanNvbiB0byB0aGUgbmV3IEFQSSBzdHJ1Y3R1cmVcclxuICovXHJcblxyXG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9saWIvYWdlbnQuanMnO1xyXG5pbXBvcnQgeyBQZXJzb25hQXBpTG9hZGVyLCBjcmVhdGVQZXJzb25hQXBpTG9hZGVyIH0gZnJvbSAnLi4vbGliL3BlcnNvbmEtYXBpLWxvYWRlci5qcyc7XHJcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4uL2xpYi9keW5hbW9kYi5qcyc7XHJcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4uL2xpYi9ldmVudGJyaWRnZS5qcyc7XHJcblxyXG5leHBvcnQgY2xhc3MgQXBpUGVyc29uYUFnZW50U2VydmljZSBleHRlbmRzIEFnZW50U2VydmljZSB7XHJcbiAgcHJpdmF0ZSBwZXJzb25hTG9hZGVyOiBQZXJzb25hQXBpTG9hZGVyO1xyXG5cclxuICBjb25zdHJ1Y3Rvcihjb25maWc6IGFueSwgcGVyc29uYUFwaUNvbmZpZz86IGFueSkge1xyXG4gICAgc3VwZXIoY29uZmlnKTtcclxuICAgIFxyXG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgcGVyc29uYSBBUEkgbG9hZGVyXHJcbiAgICB0aGlzLnBlcnNvbmFMb2FkZXIgPSBjcmVhdGVQZXJzb25hQXBpTG9hZGVyKHBlcnNvbmFBcGlDb25maWcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogT3ZlcnJpZGUgdGhlIHBlcnNvbmEgbG9hZGluZyB0byB1c2UgQVBJIGluc3RlYWQgb2YgcGVyc29uYXMuanNvblxyXG4gICAqL1xyXG4gIGFzeW5jIGxvYWRQZXJzb25hRm9yVGVuYW50KHRlbmFudElkOiBzdHJpbmcsIHBlcnNvbmFJZD86IHN0cmluZyk6IFByb21pc2U8YW55PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyBMb2FkIGZyb20gQVBJIGluc3RlYWQgb2YgcGVyc29uYXMuanNvblxyXG4gICAgICBjb25zdCBjb21wYW55UGVyc29uYSA9IGF3YWl0IHRoaXMucGVyc29uYUxvYWRlci5sb2FkQ29tcGFueVBlcnNvbmEodGVuYW50SWQsIHBlcnNvbmFJZCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDb252ZXJ0IHRvIGxlZ2FjeSBmb3JtYXQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcclxuICAgICAgY29uc3QgbGVnYWN5UGVyc29uYSA9IHRoaXMucGVyc29uYUxvYWRlci5jb252ZXJ0VG9MZWdhY3lGb3JtYXQoY29tcGFueVBlcnNvbmEpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYExvYWRlZCBwZXJzb25hICcke2xlZ2FjeVBlcnNvbmEubmFtZX0nIGZvciB0ZW5hbnQgJHt0ZW5hbnRJZH1gKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiBsZWdhY3lQZXJzb25hO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgcGVyc29uYSBmcm9tIEFQSSwgZmFsbGluZyBiYWNrIHRvIGRlZmF1bHQ6JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgLy8gRmFsbGJhY2sgdG8gYSBiYXNpYyBkZWZhdWx0IHBlcnNvbmFcclxuICAgICAgcmV0dXJuIHRoaXMuZ2V0RGVmYXVsdFBlcnNvbmEoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb2Nlc3MgbWVzc2FnZSB3aXRoIEFQSS1sb2FkZWQgcGVyc29uYVxyXG4gICAqL1xyXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlV2l0aEFwaVBlcnNvbmEocGFyYW1zOiB7XHJcbiAgICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gICAgZW1haWxfbGM6IHN0cmluZztcclxuICAgIHRleHQ6IHN0cmluZztcclxuICAgIHNvdXJjZTogJ3NtcycgfCAnZW1haWwnIHwgJ2NoYXQnIHwgJ2FwaScgfCAnYWdlbnQnO1xyXG4gICAgcGVyc29uYUlkPzogc3RyaW5nO1xyXG4gIH0pIHtcclxuICAgIC8vIExvYWQgcGVyc29uYSBmcm9tIEFQSVxyXG4gICAgY29uc3QgcGVyc29uYSA9IGF3YWl0IHRoaXMubG9hZFBlcnNvbmFGb3JUZW5hbnQocGFyYW1zLnRlbmFudElkLCBwYXJhbXMucGVyc29uYUlkKTtcclxuICAgIFxyXG4gICAgLy8gUHJvY2VzcyBtZXNzYWdlIHdpdGggdGhlIGxvYWRlZCBwZXJzb25hXHJcbiAgICAvLyBOb3RlOiBUaGlzIGlzIGEgY29uY2VwdHVhbCBleGFtcGxlIC0gYWN0dWFsIGltcGxlbWVudGF0aW9uIHdvdWxkIGRlcGVuZCBvbiBBZ2VudFNlcnZpY2UgaW50ZXJmYWNlXHJcbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzTWVzc2FnZSh7XHJcbiAgICAgIHRlbmFudElkOiBwYXJhbXMudGVuYW50SWQsXHJcbiAgICAgIGVtYWlsX2xjOiBwYXJhbXMuZW1haWxfbGMsXHJcbiAgICAgIHRleHQ6IHBhcmFtcy50ZXh0LFxyXG4gICAgICBzb3VyY2U6IHBhcmFtcy5zb3VyY2UsXHJcbiAgICAgIC8vIHBlcnNvbmEgd291bGQgYmUgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoZSBzZXJ2aWNlXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0RGVmYXVsdFBlcnNvbmEoKTogYW55IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIG5hbWU6ICdEZWZhdWx0IEFnZW50JyxcclxuICAgICAgZGVzY3JpcHRpb246ICdBIGhlbHBmdWwgYXNzaXN0YW50JyxcclxuICAgICAgc3lzdGVtUHJvbXB0OiAnWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50LicsXHJcbiAgICAgIHBlcnNvbmFsaXR5OiB7XHJcbiAgICAgICAgdG9uZTogJ2ZyaWVuZGx5LCBwcm9mZXNzaW9uYWwnLFxyXG4gICAgICAgIHN0eWxlOiAnY29udmVyc2F0aW9uYWwnLFxyXG4gICAgICB9LFxyXG4gICAgICBncmVldGluZ3M6IHtcclxuICAgICAgICBnaXN0OiAnRnJpZW5kbHkgZ3JlZXRpbmcnLFxyXG4gICAgICAgIHZhcmlhdGlvbnM6IFsnSGVsbG8hIEhvdyBjYW4gSSBoZWxwIHlvdSB0b2RheT8nXSxcclxuICAgICAgfSxcclxuICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBbJ0JlIGhlbHBmdWwgYW5kIHByb2Zlc3Npb25hbCddLFxyXG4gICAgICBpbnRlbnRDYXB0dXJpbmc6IHtcclxuICAgICAgICBlbmFibGVkOiBmYWxzZSxcclxuICAgICAgICBpbnRlbnRzOiBbXSxcclxuICAgICAgICBmYWxsYmFja0ludGVudDoge1xyXG4gICAgICAgICAgaWQ6ICdnZW5lcmFsX2lucXVpcnknLFxyXG4gICAgICAgICAgbmFtZTogJ0dlbmVyYWwgSW5xdWlyeScsXHJcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0RlZmF1bHQgcmVzcG9uc2UnLFxyXG4gICAgICAgICAgcmVzcG9uc2U6IHtcclxuICAgICAgICAgICAgdHlwZTogJ2NvbnZlcnNhdGlvbmFsJyxcclxuICAgICAgICAgICAgdGVtcGxhdGU6ICdJXFwnZCBiZSBoYXBweSB0byBoZWxwIHlvdSB3aXRoIHRoYXQhJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBhY3Rpb25zOiBbXSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbmZpZGVuY2U6IHtcclxuICAgICAgICAgIHRocmVzaG9sZDogMC42LFxyXG4gICAgICAgICAgbXVsdGlwbGVJbnRlbnRIYW5kbGluZzogJ2hpZ2hlc3RfY29uZmlkZW5jZScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgIH07XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRmFjdG9yeSBmdW5jdGlvbiB0byBjcmVhdGUgYW4gYWdlbnQgd2l0aCBBUEkgcGVyc29uYSBsb2FkaW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXBpUGVyc29uYUFnZW50KGNvbmZpZzoge1xyXG4gIC8vIFN0YW5kYXJkIGFnZW50IGNvbmZpZ1xyXG4gIG1lc3NhZ2VzVGFibGU6IHN0cmluZztcclxuICBsZWFkc1RhYmxlOiBzdHJpbmc7XHJcbiAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZztcclxuICBvdXRib3VuZEV2ZW50QnVzTmFtZT86IHN0cmluZztcclxuICBcclxuICAvLyBBUEkgcGVyc29uYSBjb25maWdcclxuICBtYW5hZ2VtZW50QXBpVXJsOiBzdHJpbmc7XHJcbiAgYXBpVGltZW91dD86IG51bWJlcjtcclxuICBhcGlBdXRoVG9rZW4/OiBzdHJpbmc7XHJcbn0pIHtcclxuICBjb25zdCBhZ2VudENvbmZpZyA9IHtcclxuICAgIG1lc3NhZ2VzVGFibGU6IGNvbmZpZy5tZXNzYWdlc1RhYmxlLFxyXG4gICAgbGVhZHNUYWJsZTogY29uZmlnLmxlYWRzVGFibGUsXHJcbiAgICBiZWRyb2NrTW9kZWxJZDogY29uZmlnLmJlZHJvY2tNb2RlbElkLFxyXG4gICAgb3V0Ym91bmRFdmVudEJ1c05hbWU6IGNvbmZpZy5vdXRib3VuZEV2ZW50QnVzTmFtZSxcclxuICAgIGF3c1JlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcclxuICAgIGhpc3RvcnlMaW1pdDogNTAsXHJcbiAgfTtcclxuXHJcbiAgY29uc3QgcGVyc29uYUFwaUNvbmZpZyA9IHtcclxuICAgIGJhc2VVcmw6IGNvbmZpZy5tYW5hZ2VtZW50QXBpVXJsLFxyXG4gICAgdGltZW91dDogY29uZmlnLmFwaVRpbWVvdXQsXHJcbiAgICBoZWFkZXJzOiBjb25maWcuYXBpQXV0aFRva2VuID8ge1xyXG4gICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtjb25maWcuYXBpQXV0aFRva2VufWAsXHJcbiAgICB9IDogdW5kZWZpbmVkLFxyXG4gIH07XHJcblxyXG4gIHJldHVybiBuZXcgQXBpUGVyc29uYUFnZW50U2VydmljZShhZ2VudENvbmZpZywgcGVyc29uYUFwaUNvbmZpZyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBFeGFtcGxlIHVzYWdlIGluIGEgTGFtYmRhIGhhbmRsZXJcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleGFtcGxlTGFtYmRhSGFuZGxlcihldmVudDogYW55LCBjb250ZXh0OiBhbnkpIHtcclxuICAvLyBDcmVhdGUgYWdlbnQgd2l0aCBBUEkgcGVyc29uYSBsb2FkaW5nXHJcbiAgY29uc3QgYWdlbnQgPSBjcmVhdGVBcGlQZXJzb25hQWdlbnQoe1xyXG4gICAgbWVzc2FnZXNUYWJsZTogcHJvY2Vzcy5lbnYuTUVTU0FHRVNfVEFCTEUhLFxyXG4gICAgbGVhZHNUYWJsZTogcHJvY2Vzcy5lbnYuTEVBRFNfVEFCTEUhLFxyXG4gICAgYmVkcm9ja01vZGVsSWQ6IHByb2Nlc3MuZW52LkJFRFJPQ0tfTU9ERUxfSUQhLFxyXG4gICAgbWFuYWdlbWVudEFwaVVybDogcHJvY2Vzcy5lbnYuTUFOQUdFTUVOVF9BUElfVVJMISxcclxuICAgIGFwaUF1dGhUb2tlbjogcHJvY2Vzcy5lbnYuQVBJX0FVVEhfVE9LRU4sXHJcbiAgfSk7XHJcblxyXG4gIC8vIEV4dHJhY3QgbWVzc2FnZSBkZXRhaWxzIGZyb20gZXZlbnRcclxuICBjb25zdCB7IHRlbmFudElkLCBlbWFpbF9sYywgdGV4dCwgc291cmNlLCBwZXJzb25hSWQgfSA9IGV2ZW50LmRldGFpbDtcclxuXHJcbiAgdHJ5IHtcclxuICAgIC8vIFByb2Nlc3MgbWVzc2FnZSB3aXRoIEFQSS1sb2FkZWQgcGVyc29uYVxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBhZ2VudC5wcm9jZXNzTWVzc2FnZVdpdGhBcGlQZXJzb25hKHtcclxuICAgICAgdGVuYW50SWQsXHJcbiAgICAgIGVtYWlsX2xjLFxyXG4gICAgICB0ZXh0LFxyXG4gICAgICBzb3VyY2UsXHJcbiAgICAgIHBlcnNvbmFJZCwgLy8gT3B0aW9uYWwgLSB3aWxsIHVzZSByYW5kb20gaWYgbm90IHByb3ZpZGVkXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zb2xlLmxvZygnQWdlbnQgcmVzcG9uc2U6JywgcmVzcG9uc2UpO1xyXG4gICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIG1lc3NhZ2U6JywgZXJyb3IpO1xyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcbiJdfQ==