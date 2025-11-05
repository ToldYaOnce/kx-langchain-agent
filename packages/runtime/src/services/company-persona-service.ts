import { CompanyInfo } from '../models/company-info.js';
import { Persona } from '../models/personas.js';

// Placeholder decorators and utilities for @toldyaonce/kx-cdk-lambda-utils
const ApiBasePath = (path: string) => (target: any) => target;
const ApiMethod = (method: string, path?: string) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;

// Placeholder Service class
class Service<T> {
  constructor(model: any, partitionKey: string, sortKey?: string) {}
  
  async create(event: any): Promise<any> {
    console.log('Service.create called with:', event.body);
    return { success: true, message: 'Create method not implemented' };
  }
  
  async get(event: any): Promise<any> {
    console.log('Service.get called with:', event.pathParameters);
    return { success: true, message: 'Get method not implemented' };
  }
  
  async update(event: any): Promise<any> {
    console.log('Service.update called with:', event.body);
    return { success: true, message: 'Update method not implemented' };
  }
  
  async delete(event: any): Promise<any> {
    console.log('Service.delete called with:', event.pathParameters);
    return { success: true, message: 'Delete method not implemented' };
  }
  
  async list(event: any): Promise<any> {
    console.log('Service.list called');
    return { success: true, data: [], message: 'List method not implemented' };
  }
  
  async query(event: any): Promise<any> {
    console.log('Service.query called with:', event.pathParameters);
    return { success: true, data: [], message: 'Query method not implemented' };
  }
}

// Placeholder getApiMethodHandlers
function getApiMethodHandlers(service: any): Record<string, any> {
  return {
    handler: async (event: any) => {
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
}

/**
 * Service for retrieving combined Company + Persona data
 * Aggregates company information with persona configuration and interpolates templates
 */
@ApiBasePath('/company-persona')
export class CompanyPersonaService extends Service<any> {
  
  constructor() {
    // This service doesn't directly map to a single model
    super(Object, 'tenantId');
  }

  /**
   * Get company info + specific persona
   */
  @ApiMethod('GET', '/{tenantId}/{personaId}')
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
        }
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
  @ApiMethod('GET', '/{tenantId}')
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

// Export the service and method handlers for Lambda integration
module.exports = {
  CompanyPersonaService,
  ...getApiMethodHandlers(new CompanyPersonaService())
};