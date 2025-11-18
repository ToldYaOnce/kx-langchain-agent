import { Persona } from '../models/personas.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
let docClient: DynamoDBDocumentClient;

function getDocClient() {
  if (!docClient) {
    const dynamoClient = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(dynamoClient);
  }
  return docClient;
}

// Get table name from environment or fall back to class name
const TABLE_NAME = process.env.PERSONAS_TABLE || Persona.name;

console.log('🚀 PersonasService: Service instance created');

/**
 * Service for managing Persona objects in DynamoDB
 * Provides CRUD operations for persona configurations
 */
export class PersonasService {
  
  constructor() {
    // Lightweight service - direct DynamoDB implementation
  }

  /**
   * Create a new persona
   */
  async createPersona(event: any): Promise<any> {
    console.log('Persona create called', JSON.stringify(event.body));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const body = JSON.parse(event.body || '{}');
      const { tenantId } = event.pathParameters || {};
      
      if (!tenantId || !body.personaId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'tenantId and personaId are required'
          })
        };
      }
      
      // Ensure tenantId is set from path
      body.tenantId = tenantId;
      
      // Add timestamps
      body.createdAt = new Date().toISOString();
      body.updatedAt = new Date().toISOString();
      
      await getDocClient().send(new PutCommand({
        TableName: TABLE_NAME,
        Item: body
      }));
      
      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: body
        })
      };
    } catch (error: any) {
      console.error('Error creating persona:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error creating persona',
          error: error.message
        })
      };
    }
  }

  /**
   * Get persona by tenantId and personaId
   */
  async getPersona(event: any): Promise<any> {
    console.log('Persona get called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const { tenantId, personaId } = event.pathParameters || {};
      
      if (!tenantId || !personaId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'tenantId and personaId are required'
          })
        };
      }
      
      const result = await getDocClient().send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { tenantId, personaId }
      }));
      
      if (!result.Item) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'Persona not found'
          })
        };
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: result.Item
        })
      };
    } catch (error: any) {
      console.error('Error getting persona:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error getting persona',
          error: error.message
        })
      };
    }
  }

  /**
   * Update persona
   */
  async updatePersona(event: any): Promise<any> {
    console.log('Persona update called', JSON.stringify(event.body));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const body = JSON.parse(event.body || '{}');
      const { tenantId, personaId } = event.pathParameters || {};
      
      if (!tenantId || !personaId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'tenantId and personaId are required'
          })
        };
      }
      
      // Ensure keys are set
      body.tenantId = tenantId;
      body.personaId = personaId;
      
      // Update timestamp
      body.updatedAt = new Date().toISOString();
      
      await getDocClient().send(new PutCommand({
        TableName: TABLE_NAME,
        Item: body
      }));
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: body
        })
      };
    } catch (error: any) {
      console.error('Error updating persona:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error updating persona',
          error: error.message
        })
      };
    }
  }

  /**
   * Delete persona
   */
  async deletePersona(event: any): Promise<any> {
    console.log('Persona delete called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const { tenantId, personaId } = event.pathParameters || {};
      
      if (!tenantId || !personaId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'tenantId and personaId are required'
          })
        };
      }
      
      await getDocClient().send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { tenantId, personaId }
      }));
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Persona deleted successfully'
        })
      };
    } catch (error: any) {
      console.error('Error deleting persona:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error deleting persona',
          error: error.message
        })
      };
    }
  }

  /**
   * List all personas for a tenant
   */
  async listPersonas(event: any): Promise<any> {
    console.log('Persona list called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const { tenantId } = event.pathParameters || {};
      
      if (!tenantId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'tenantId is required'
          })
        };
      }
      
      const result = await getDocClient().send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: {
          ':tenantId': tenantId
        }
      }));
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: result.Items || []
        })
      };
    } catch (error: any) {
      console.error('Error listing personas:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error listing personas',
          error: error.message
        })
      };
    }
  }

  /**
   * Get a random persona for a tenant
   */
  async getRandomPersona(event: any): Promise<any> {
    console.log('Get random persona called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const { tenantId } = event.pathParameters || {};
      
      if (!tenantId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'tenantId is required'
          })
        };
      }
      
      const result = await getDocClient().send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: {
          ':tenantId': tenantId
        }
      }));
      
      const personas = result.Items || [];
      
      if (personas.length === 0) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'No personas found for tenant'
          })
        };
      }
      
      const randomPersona = personas[Math.floor(Math.random() * personas.length)];
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          data: randomPersona
        })
      };
    } catch (error: any) {
      console.error('Error getting random persona:', error);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error getting random persona',
          error: error.message
        })
      };
    }
  }
}

// Create service instance
const serviceInstance = new PersonasService();

console.log('🚀 PersonasService: Handler exported');

// Universal handler to route requests
const handler = async (event: any) => {
  console.log('🚀 PersonasService: Universal handler called with method:', event.httpMethod);
  console.log('🚀 PersonasService: Path:', event.path);
  console.log('🚀 PersonasService: Path parameters:', JSON.stringify(event.pathParameters));
  
  const method = event.httpMethod;
  const { tenantId, personaId } = event.pathParameters || {};
  const pathSegments = event.path?.split('/').filter(Boolean) || [];
  const lastSegment = pathSegments[pathSegments.length - 1];
  
  // Route based on HTTP method and path
  if (method === 'POST' && tenantId && !personaId) {
    return serviceInstance.createPersona(event);
  } else if (method === 'GET' && tenantId && personaId) {
    return serviceInstance.getPersona(event);
  } else if (method === 'PATCH' && tenantId && personaId) {
    return serviceInstance.updatePersona(event);
  } else if (method === 'DELETE' && tenantId && personaId) {
    return serviceInstance.deletePersona(event);
  } else if (method === 'GET' && tenantId && lastSegment === 'random') {
    return serviceInstance.getRandomPersona(event);
  } else if (method === 'GET' && tenantId && !personaId) {
    return serviceInstance.listPersonas(event);
  } else {
    return {
      statusCode: 501,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        message: `Method ${method} with path ${event.path} not implemented`
      })
    };
  }
};

module.exports = {
  PersonasService,
  handler
};
