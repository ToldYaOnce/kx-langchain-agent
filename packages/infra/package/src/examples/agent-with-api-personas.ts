/**
 * Example: Using the new API-based persona loading in the agent
 * This shows how to migrate from personas.json to the new API structure
 */

import { AgentService } from '../lib/agent.js';
import { PersonaApiLoader, createPersonaApiLoader } from '../lib/persona-api-loader.js';
import { DynamoDBService } from '../lib/dynamodb.js';
import { EventBridgeService } from '../lib/eventbridge.js';

export class ApiPersonaAgentService extends AgentService {
  private personaLoader: PersonaApiLoader;

  constructor(config: any, personaApiConfig?: any) {
    super(config);
    
    // Initialize the persona API loader
    this.personaLoader = createPersonaApiLoader(personaApiConfig);
  }

  /**
   * Override the persona loading to use API instead of personas.json
   */
  async loadPersonaForTenant(tenantId: string, personaId?: string): Promise<any> {
    try {
      // Load from API instead of personas.json
      const companyPersona = await this.personaLoader.loadCompanyPersona(tenantId, personaId);
      
      // Convert to legacy format for backward compatibility
      const legacyPersona = this.personaLoader.convertToLegacyFormat(companyPersona);
      
      console.log(`Loaded persona '${legacyPersona.name}' for tenant ${tenantId}`);
      
      return legacyPersona;
    } catch (error) {
      console.error('Failed to load persona from API, falling back to default:', error);
      
      // Fallback to a basic default persona
      return this.getDefaultPersona();
    }
  }

  /**
   * Process message with API-loaded persona
   */
  async processMessageWithApiPersona(params: {
    tenantId: string;
    email_lc: string;
    text: string;
    source: 'sms' | 'email' | 'chat' | 'api' | 'agent';
    personaId?: string;
  }) {
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

  private getDefaultPersona(): any {
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

/**
 * Factory function to create an agent with API persona loading
 */
export function createApiPersonaAgent(config: {
  // Standard agent config
  messagesTable: string;
  leadsTable: string;
  bedrockModelId: string;
  outboundEventBusName?: string;
  
  // API persona config
  managementApiUrl: string;
  apiTimeout?: number;
  apiAuthToken?: string;
}) {
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
export async function exampleLambdaHandler(event: any, context: any) {
  // Create agent with API persona loading
  const agent = createApiPersonaAgent({
    messagesTable: process.env.MESSAGES_TABLE!,
    leadsTable: process.env.LEADS_TABLE!,
    bedrockModelId: process.env.BEDROCK_MODEL_ID!,
    managementApiUrl: process.env.MANAGEMENT_API_URL!,
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
  } catch (error) {
    console.error('Error processing message:', error);
    throw error;
  }
}
