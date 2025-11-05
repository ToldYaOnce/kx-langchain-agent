import { CompanyPersonaResponse } from '../services/company-persona-service.js';

export interface PersonaApiConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class PersonaApiLoader {
  private config: PersonaApiConfig;

  constructor(config: PersonaApiConfig) {
    this.config = {
      timeout: 5000,
      ...config,
    };
  }

  /**
   * Load company persona data from the new API structure
   * This replaces the old personas.json loading
   */
  async loadCompanyPersona(tenantId: string, personaId?: string): Promise<CompanyPersonaResponse> {
    const url = personaId 
      ? `${this.config.baseUrl}/company-persona/${tenantId}/${personaId}`
      : `${this.config.baseUrl}/company-persona/${tenantId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        throw new Error(`Failed to load persona: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as CompanyPersonaResponse;
      return data;
    } catch (error) {
      console.error('Error loading company persona:', error);
      throw new Error(`Failed to load persona for tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load random company persona
   */
  async loadRandomCompanyPersona(tenantId: string): Promise<CompanyPersonaResponse> {
    return this.loadCompanyPersona(tenantId); // No personaId = random
  }

  /**
   * Get available personas for a tenant
   */
  async getAvailablePersonas(tenantId: string): Promise<Array<{ personaId: string; name: string; description: string }>> {
    const url = `${this.config.baseUrl}/company-persona/${tenantId}/personas/list`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        throw new Error(`Failed to load available personas: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { availablePersonas: Array<{ personaId: string; name: string; description: string }> };
      return data.availablePersonas || [];
    } catch (error) {
      console.error('Error loading available personas:', error);
      throw new Error(`Failed to load available personas for tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert the new API response to the legacy AgentPersona format
   * This helps with backward compatibility during transition
   */
  convertToLegacyFormat(companyPersona: CompanyPersonaResponse): any {
    return {
      name: companyPersona.persona.name,
      description: companyPersona.persona.description,
      systemPrompt: companyPersona.persona.systemPromptInterpolated, // Already interpolated
      personality: companyPersona.persona.personality,
      responseGuidelines: companyPersona.persona.responseGuidelines,
      greetings: companyPersona.persona.greetingsInterpolated, // Already interpolated
      responseChunking: companyPersona.persona.responseChunking,
      goalConfiguration: companyPersona.persona.goalConfiguration,
      actionTags: companyPersona.persona.actionTags,
      metadata: companyPersona.persona.metadata,
      // Company-level data
      companyInfo: companyPersona.companyInfo,
      intentCapturing: companyPersona.intentCapturing, // Now at company level
    };
  }
}

/**
 * Factory function to create a PersonaApiLoader with environment-based config
 */
export function createPersonaApiLoader(overrides?: Partial<PersonaApiConfig>): PersonaApiLoader {
  const config: PersonaApiConfig = {
    baseUrl: process.env.MANAGEMENT_API_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.API_TIMEOUT || '5000'),
    headers: process.env.API_AUTH_TOKEN ? {
      'Authorization': `Bearer ${process.env.API_AUTH_TOKEN}`,
    } : {},
    ...overrides,
  };

  // Remove undefined headers
  if (config.headers) {
    Object.keys(config.headers).forEach(key => {
      if (config.headers![key] === undefined) {
        delete config.headers![key];
      }
    });
  }

  return new PersonaApiLoader(config);
}
