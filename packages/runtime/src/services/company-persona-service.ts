// Note: These would come from @toldyaonce/kx-aws-utils when available
// For now, using placeholder decorators and base class
const ApiBasePath = (path: string) => (target: any) => target;
const ApiMethod = (method: string, path?: string) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => descriptor;

// Placeholder base service class
class Service<T> {
  constructor(model: any, partitionKey: string) {}
}
import { CompanyInfo } from '../models/company-info.js';
import { Persona } from '../models/personas.js';
import { CompanyInfoService } from './company-info-service.js';
import { PersonasService } from './personas-service.js';

export interface CompanyPersonaResponse {
  tenantId: string;
  companyInfo: CompanyInfo;
  persona: Persona & {
    // Interpolated fields with company data
    systemPromptInterpolated: string;
    greetingsInterpolated: {
      gist: string;
      variations: string[];
    };
  };
  intentCapturing: any; // From company level
  aggregatedAt: string;
}

@ApiBasePath('/company-persona')
export class CompanyPersonaService extends Service<any> {
  private companyInfoService: CompanyInfoService;
  private personasService: PersonasService;

  constructor() {
    super({} as any, 'tenantId'); // Dummy model since we're aggregating
    this.companyInfoService = new CompanyInfoService();
    this.personasService = new PersonasService();
  }

  @ApiMethod('GET', '/:tenantId/:personaId?')
  async getCompanyPersona(event: any) {
    const { tenantId, personaId } = event.pathParameters;
    
    try {
      // Get company info
      const companyInfo = await this.getCompanyInfoByTenant(tenantId);
      if (!companyInfo) {
        return {
          statusCode: 404,
          body: JSON.stringify({ 
            error: 'Company info not found',
            tenantId
          })
        };
      }

      // Get persona (random if not specified)
      const persona = await this.getPersonaByTenantAndId(tenantId, personaId);
      if (!persona) {
        return {
          statusCode: 404,
          body: JSON.stringify({ 
            error: personaId ? 'Persona not found' : 'No personas available for tenant',
            tenantId,
            personaId
          })
        };
      }

      // Create aggregated response
      const response: CompanyPersonaResponse = {
        tenantId,
        companyInfo,
        persona: {
          ...persona,
          systemPromptInterpolated: this.interpolateCompanyInfo(persona.systemPrompt, companyInfo),
          greetingsInterpolated: {
            gist: this.interpolateCompanyInfo(persona.greetings.gist, companyInfo),
            variations: persona.greetings.variations.map(variation => 
              this.interpolateCompanyInfo(variation, companyInfo)
            )
          }
        },
        intentCapturing: companyInfo.intentCapturing,
        aggregatedAt: new Date().toISOString()
      };

      return {
        statusCode: 200,
        body: JSON.stringify(response)
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to retrieve company persona',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  @ApiMethod('GET', '/:tenantId/random')
  async getRandomCompanyPersona(event: any) {
    const { tenantId } = event.pathParameters;
    
    // Redirect to main endpoint without personaId (will select random)
    event.pathParameters.personaId = undefined;
    return this.getCompanyPersona(event);
  }

  @ApiMethod('GET', '/:tenantId/personas/list')
  async getAvailablePersonas(event: any) {
    const { tenantId } = event.pathParameters;
    
    try {
      const personas = await this.getPersonasByTenant(tenantId);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          tenantId,
          availablePersonas: personas.map(p => ({
            personaId: p.personaId,
            name: p.name,
            description: p.description
          }))
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to retrieve available personas',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }
  }

  private async getCompanyInfoByTenant(tenantId: string): Promise<CompanyInfo | null> {
    try {
      return await this.companyInfoService.getByKey(tenantId);
    } catch (error) {
      console.error('Error fetching company info:', error);
      return null;
    }
  }

  private async getPersonasByTenant(tenantId: string): Promise<Persona[]> {
    try {
      return await this.personasService.queryByPartitionKey(tenantId) || [];
    } catch (error) {
      console.error('Error fetching personas:', error);
      return [];
    }
  }

  private async getPersonaByTenantAndId(tenantId: string, personaId?: string): Promise<Persona | null> {
    try {
      if (personaId) {
        // Get specific persona
        return await this.personasService.getByKey(tenantId, personaId);
      } else {
        // Get random persona
        const personas = await this.getPersonasByTenant(tenantId);
        if (personas.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * personas.length);
        return personas[randomIndex];
      }
    } catch (error) {
      console.error('Error fetching persona:', error);
      return null;
    }
  }

  private interpolateCompanyInfo(template: string, companyInfo: CompanyInfo): string {
    if (!template || typeof template !== 'string') return template;
    
    return template
      .replace(/\{\{companyName\}\}/g, companyInfo.name || 'Our Company')
      .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'Our business')
      .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Our industry')
      .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Our products')
      .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Our benefits')
      .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'Our customers')
      .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'What makes us different');
  }
}
