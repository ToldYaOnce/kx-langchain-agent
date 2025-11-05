import { DynamoDBService } from './dynamodb.js';
import type { AgentPersona, ResponseChunking, GreetingConfig } from '../config/personas.js';
import * as personasJson from '../config/personas.json';

export interface CompanyInfo {
  name?: string;
  industry?: string;
  description?: string;
  products?: string;
  benefits?: string;
  targetCustomers?: string;
  differentiators?: string;
}

export interface PersonaItem {
  PK: string; // PERSONA#{tenantId}
  SK: string; // {personaId}
  personaId: string;
  tenantId: string;
  name: string;
  description: string;
  systemPrompt: string;
  personality: {
    tone: string;
    style: string;
    languageQuirks?: string[];
    specialBehaviors?: string[];
  };
  responseGuidelines: string[];
  greetings?: GreetingConfig;
  responseChunking?: ResponseChunking;
  intentCapturing?: any; // Will be properly typed when needed
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: string;
    tags?: string[];
  };
  isActive: boolean;
}

/**
 * Service for managing agent personas in DynamoDB
 */
export class PersonaService {
  constructor(private dynamoService: DynamoDBService | null) {}

  /**
   * Get persona for a tenant (falls back to default if not found)
   */
  async getPersona(tenantId: string, personaId: string, companyInfo?: CompanyInfo): Promise<AgentPersona> {
    // For now, just return default personas with company name substitution
    // TODO: Implement DynamoDB storage when needed
    return this.getDefaultPersona(personaId, companyInfo);
  }

  /**
   * Get tenant-specific persona from DynamoDB
   * TODO: Implement when DynamoDB methods are available
   */
  async getTenantPersona(tenantId: string, personaId: string): Promise<PersonaItem | null> {
    // TODO: Implement DynamoDB storage
    return null;
  }

  /**
   * List all personas for a tenant
   * TODO: Implement when DynamoDB methods are available
   */
  async listTenantPersonas(tenantId: string): Promise<PersonaItem[]> {
    // TODO: Implement DynamoDB storage
    return [];
  }

  /**
   * Create or update a persona for a tenant
   * TODO: Implement when DynamoDB methods are available
   */
  async putPersona(tenantId: string, personaData: Omit<PersonaItem, 'PK' | 'SK' | 'tenantId'>): Promise<void> {
    // TODO: Implement DynamoDB storage
    console.log(`Would store persona ${personaData.personaId} for tenant ${tenantId}`);
  }

  /**
   * Delete a persona for a tenant (soft delete)
   * TODO: Implement when DynamoDB methods are available
   */
  async deletePersona(tenantId: string, personaId: string): Promise<void> {
    // TODO: Implement DynamoDB storage
    console.log(`Would delete persona ${personaId} for tenant ${tenantId}`);
  }

  /**
   * Initialize default personas for a tenant
   */
  async initializeDefaultPersonas(tenantId: string): Promise<void> {
    const defaultPersonas = Object.entries(personasJson);
    
    for (const [personaId, personaConfig] of defaultPersonas) {
      const config = personaConfig as any;
      const personaItem: Omit<PersonaItem, 'PK' | 'SK' | 'tenantId'> = {
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
  public getDefaultPersona(personaId: string, companyInfo?: CompanyInfo): AgentPersona {
    const persona = personasJson[personaId as keyof typeof personasJson];
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
    } else {
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
      greetings: persona.greetings as any,
      responseChunking: persona.responseChunking as ResponseChunking | undefined,
      intentCapturing: (persona as any).intentCapturing,
      goalConfiguration: (persona as any).goalConfiguration,
      actionTags: (persona as any).actionTags,
    };
  }

  /**
   * Convert PersonaItem to AgentPersona
   */
  private convertToAgentPersona(item: PersonaItem, companyInfo?: CompanyInfo): AgentPersona {
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
    } else {
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
      goalConfiguration: (item as any).goalConfiguration,
    };
  }

  /**
   * Create DynamoDB partition key for personas
   */
  private createPersonaPK(tenantId: string): string {
    return `PERSONA#${tenantId}`;
  }

  /**
   * List available default personas
   */
  static listDefaultPersonas(): Array<{id: string, name: string, description: string}> {
    return Object.entries(personasJson).map(([id, persona]) => ({
      id,
      name: (persona as any).name,
      description: (persona as any).description
    }));
  }
}
