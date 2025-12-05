import { DynamoDBService } from './dynamodb.js';
import type { AgentPersona, ResponseChunking, GreetingConfig } from '../config/personas.js';
import * as personasJson from '../config/personas.json';

export interface Promotion {
  id: string;
  title: string;
  description: string;
  urgencyMessage?: string; // e.g., "Sign up now and get..."
  discount?: string; // e.g., "50% off", "$100 off"
  validUntil: string; // ISO date string
  conditions?: string[]; // e.g., ["First-time members only", "Must sign up by end of month"]
  applicablePlans?: string[]; // IDs of plans this promo applies to
}

export interface PricingPlan {
  id: string;
  name: string;
  price: string; // e.g., "$49/month", "$500/year"
  description?: string;
  features: string[];
  popular?: boolean; // Highlight as "most popular"
  cta?: string; // Call to action, e.g., "Get Started", "Join Now"
}

export interface CompanyInfo {
  name?: string;
  industry?: string;
  description?: string;
  products?: string;
  services?: string[];
  benefits?: string;
  targetCustomers?: string;
  differentiators?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  businessHours?: {
    monday?: Array<{ from: string; to: string }>;
    tuesday?: Array<{ from: string; to: string }>;
    wednesday?: Array<{ from: string; to: string }>;
    thursday?: Array<{ from: string; to: string }>;
    friday?: Array<{ from: string; to: string }>;
    saturday?: Array<{ from: string; to: string }>;
    sunday?: Array<{ from: string; to: string }>;
  };
  pricing?: {
    plans: PricingPlan[];
    customPricingAvailable?: boolean;
    contactForPricing?: boolean; // If true, agent should collect contact info before sharing detailed pricing
  };
  promotions?: Promotion[];
  goalConfiguration?: any; // Import from dynamodb-schemas if needed
  responseGuidelines?: {
    contactPolicy?: {
      allowBasicInfoWithoutContact?: boolean;
      requireContactForDetails?: boolean;
    };
    informationCategories?: Array<{
      id: string;
      label: string;
      column: 'always' | 'require' | 'never';
    }>;
    sharingPermissions?: {
      alwaysAllowed?: string[];
      requiresContact?: string[];
      neverShare?: string[];
      defaultPermission?: 'always_allowed' | 'contact_required' | 'never_share';
      // Legacy format support
      allowedValues?: string[];
      default?: string;
      overrides?: Record<string, string>;
    };
  };
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
      responseGuidelines: persona.responseGuidelines as any,
      greetings: (persona as any).greetingConfig || (persona as any).greetings,
      responseChunking: persona.responseChunking as ResponseChunking | undefined,
      intentCapturing: (persona as any).intentCapturing,
      goalConfiguration: (persona as any).goalConfiguration,
      actionTags: (persona as any).actionTags,
      personalityTraits: (persona as any).personalityTraits,
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
