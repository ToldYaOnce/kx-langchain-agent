import { CompanyInfo } from '../models/company-info.js';
import { Persona } from '../models/personas.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client for chat history
let docClient: DynamoDBDocumentClient;

function getDocClient() {
  if (!docClient) {
    const dynamoClient = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(dynamoClient);
  }
  return docClient;
}

console.log('🚀 CompanyPersonaService: Service instance created');

export interface ChatMessage {
  conversationId: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
}

export interface CompanyPersonaResponse {
  tenantId: string;
  companyInfo: CompanyInfo;
  persona: Persona;
  compiledPersona: {
    name: string;
    personality: any;
    greetings: any;
    responseChunking: any;
    goalConfiguration: any;
    actionTags: any;
  };
  chatHistory?: ChatMessage[];
}

/**
 * Service for retrieving combined Company + Persona data
 * Aggregates company information with persona configuration and interpolates templates
 */
export class CompanyPersonaService {
  
  constructor() {
    // Lightweight service - returns placeholder data
  }

  /**
   * Load chat history from DynamoDB Messages table
   */
  async loadChatHistory(channelId: string, limit: number = 50): Promise<ChatMessage[]> {
    const chatHistoryTable = process.env.CHAT_HISTORY_TABLE;
    
    if (!chatHistoryTable) {
      console.warn('CHAT_HISTORY_TABLE not configured, skipping chat history load');
      return [];
    }

    try {
      console.log(`Loading chat history for channel: ${channelId}`);
      
      const result = await getDocClient().send(new QueryCommand({
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
        let role: 'user' | 'assistant' | 'system' = 'user';
        if (item.senderId === item.metadata?.personaId || item.metadata?.isBot) {
          role = 'assistant';
        } else if (item.metadata?.role === 'system') {
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
      
    } catch (error: any) {
      console.error('Error loading chat history:', error);
      return []; // Don't fail the whole request if chat history fails
    }
  }

  /**
   * Get company info + specific persona
   */
  async getCompanyPersona(event: any): Promise<any> {
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
      let chatHistory: ChatMessage[] = [];
      if (channelId) {
        chatHistory = await this.loadChatHistory(channelId);
      }
      
      // Create type-safe placeholder data
      const companyInfo: CompanyInfo = {
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
              priority: 'high' as const,
              response: {
                type: 'template' as const,
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
              priority: 'medium' as const,
              response: {
                type: 'template' as const,
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
              priority: 'high' as const,
              response: {
                type: 'template' as const,
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

      const persona: Persona = {
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

      const response: CompanyPersonaResponse = {
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
    } catch (error: any) {
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
  async getCompanyRandomPersona(event: any): Promise<any> {
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
      const companyInfo: CompanyInfo = {
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
              priority: 'high' as const,
              response: {
                type: 'template' as const,
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
              priority: 'medium' as const,
              response: {
                type: 'template' as const,
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
              priority: 'high' as const,
              response: {
                type: 'template' as const,
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

      const persona: Persona = {
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

      const response: CompanyPersonaResponse = {
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
    } catch (error: any) {
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
  private interpolatePersonaTemplates(persona: Persona, companyInfo: CompanyInfo): any {
    const interpolate = (text: string): string => {
      return text
        .replace(/\{\{companyName\}\}/g, companyInfo.name)
        .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry)
        .replace(/\{\{companyDescription\}\}/g, companyInfo.description || '');
    };

    const interpolateArray = (arr: string[]): string[] => {
      return arr.map(interpolate);
    };

    const interpolateObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return interpolateArray(obj);
      } else if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = interpolateObject(value);
        }
        return result;
      } else if (typeof obj === 'string') {
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

// Create service instance
const serviceInstance = new CompanyPersonaService();

console.log('🚀 CompanyPersonaService: Handler exported');

// Universal handler that routes GET requests
const handler = async (event: any) => {
  console.log('🚀 CompanyPersonaService: Universal handler called with method:', event.httpMethod);
  
  const method = event.httpMethod;
  
  if (method === 'GET') {
    return serviceInstance.getCompanyPersona(event);
  } else {
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