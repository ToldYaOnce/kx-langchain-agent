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

/**
 * Service for managing Persona objects in DynamoDB
 * Provides CRUD operations for persona configurations
 */
@ApiBasePath('/personas')
export class PersonasService extends Service<Persona> {
  
  constructor() {
    super(Persona, 'tenantId', 'personaId');
  }

  /**
   * Create a new persona
   */
  @ApiMethod('POST', '/{tenantId}')
  async create(event: any): Promise<any> {
    console.log('Persona create called', JSON.stringify(event.body));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const body = JSON.parse(event.body || '{}');
      const { tenantId } = event.pathParameters;
      
      // Ensure tenantId is set from path
      body.tenantId = tenantId;
      
      // Add timestamps
      body.createdAt = new Date().toISOString();
      body.updatedAt = new Date().toISOString();
      
      const result = await super.create(event);
      
      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } catch (error: any) {
      console.error('Error creating persona:', error);
      
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to create persona',
          error: error.message
        })
      };
    }
  }

  /**
   * Get persona by tenantId and personaId
   */
  @ApiMethod('GET', '/{tenantId}/{personaId}')
  async get(event: any): Promise<any> {
    console.log('Persona get called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const result = await super.get(event);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } catch (error: any) {
      console.error('Error getting persona:', error);
      
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Persona not found',
          error: error.message
        })
      };
    }
  }

  /**
   * Update persona
   */
  @ApiMethod('PATCH', '/{tenantId}/{personaId}')
  async update(event: any): Promise<any> {
    console.log('Persona update called', JSON.stringify(event.body));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const body = JSON.parse(event.body || '{}');
      const { tenantId, personaId } = event.pathParameters;
      
      // Ensure keys are set from path
      body.tenantId = tenantId;
      body.personaId = personaId;
      
      // Update timestamp
      body.updatedAt = new Date().toISOString();
      
      const result = await super.update(event);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } catch (error: any) {
      console.error('Error updating persona:', error);
      
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to update persona',
          error: error.message
        })
      };
    }
  }

  /**
   * Delete persona
   */
  @ApiMethod('DELETE', '/{tenantId}/{personaId}')
  async delete(event: any): Promise<any> {
    console.log('Persona delete called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      await super.delete(event);
      
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: ''
      };
    } catch (error: any) {
      console.error('Error deleting persona:', error);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to delete persona',
          error: error.message
        })
      };
    }
  }

  /**
   * List personas for a tenant
   */
  @ApiMethod('GET', '/{tenantId}')
  async listByTenant(event: any): Promise<any> {
    console.log('Persona listByTenant called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      // Use the base service's query method to get all personas for tenant
      const result = await super.query(event);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } catch (error: any) {
      console.error('Error listing personas:', error);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to list personas',
          error: error.message
        })
      };
    }
  }

  /**
   * Get a random persona for a tenant (used when no specific persona is requested)
   */
  @ApiMethod('GET', '/{tenantId}/random')
  async getRandomPersona(event: any): Promise<any> {
    console.log('Persona getRandomPersona called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      // Get all personas for tenant
      const personas = await super.query(event);
      
      if (!personas || personas.length === 0) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'No personas found for tenant'
          })
        };
      }
      
      // Return a random persona
      const randomPersona = personas[Math.floor(Math.random() * personas.length)];
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(randomPersona)
      };
    } catch (error: any) {
      console.error('Error getting random persona:', error);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to get random persona',
          error: error.message
        })
      };
    }
  }
}

// Export the service and method handlers for Lambda integration
module.exports = {
  PersonasService,
  ...getApiMethodHandlers(new PersonasService())
};