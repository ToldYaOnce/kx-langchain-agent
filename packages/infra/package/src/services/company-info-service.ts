import { CompanyInfo } from '../models/company-info.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

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
const TABLE_NAME = process.env.COMPANY_INFO_TABLE || CompanyInfo.name;

/**
 * Service for managing CompanyInfo objects in DynamoDB
 * Provides CRUD operations for company information and intent capturing configuration
 */
export class CompanyInfoService {
  
  constructor() {
    // Lightweight service - direct DynamoDB implementation
  }

  /**
   * Create a new company info record
   */
  async create(event: any): Promise<any> {
    console.log('CompanyInfo create called', JSON.stringify(event.body));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const body = JSON.parse(event.body || '{}');
      
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
      console.error('Error creating company info:', error);
      
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to create company info',
          error: error.message
        })
      };
    }
  }

  /**
   * Get company info by tenant ID
   */
  async get(event: any): Promise<any> {
    console.log('CompanyInfo get called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const tenantId = event.pathParameters?.tenantId;
      
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
      
      console.log('Querying DynamoDB for tenantId:', tenantId);
      
      const result = await getDocClient().send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { tenantId }
      }));
      
      console.log('DynamoDB result:', JSON.stringify(result));
      
      if (!result.Item) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'Company info not found'
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
      console.error('Error getting company info:', error);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error retrieving company info',
          error: error.message
        })
      };
    }
  }

  /**
   * Update company info
   */
  async update(event: any): Promise<any> {
    console.log('CompanyInfo update called', JSON.stringify(event.body));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const tenantId = event.pathParameters?.tenantId;
      const body = JSON.parse(event.body || '{}');
      
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
      
      // Update timestamp
      body.updatedAt = new Date().toISOString();
      body.tenantId = tenantId;
      
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
      console.error('Error updating company info:', error);
      
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to update company info',
          error: error.message
        })
      };
    }
  }

  /**
   * Delete company info
   */
  async delete(event: any): Promise<any> {
    console.log('CompanyInfo delete called', JSON.stringify(event.pathParameters));
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      const tenantId = event.pathParameters?.tenantId;
      
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
      
      await getDocClient().send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { tenantId }
      }));
      
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: ''
      };
    } catch (error: any) {
      console.error('Error deleting company info:', error);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to delete company info',
          error: error.message
        })
      };
    }
  }

  /**
   * List all companies (for admin purposes)
   */
  async list(event: any): Promise<any> {
    console.log('CompanyInfo list called');
    
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    };

    try {
      // For now, return placeholder data since we don't have DynamoDB setup
      const result = {
        success: true,
        data: {
          tenantId: event.pathParameters?.tenantId,
          companyName: 'KxGrynde Fitness',
          industry: 'Fitness & Wellness',
          description: 'Premium fitness center offering personalized training, group classes, and wellness programs'
        }
      };
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
      };
    } catch (error: any) {
      console.error('Error listing companies:', error);
      
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Failed to list companies',
          error: error.message
        })
      };
    }
  }
}

// Create service instance
const serviceInstance = new CompanyInfoService();
console.log('🚀 CompanyInfoService: Service instance created');

// Create a universal handler that routes based on HTTP method
const handler = async (event: any) => {
  console.log('🚀 CompanyInfoService: Universal handler called with method:', event.httpMethod || event.requestContext?.http?.method);
  const method = (event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();
  
  // Route to appropriate handler based on HTTP method and path
  try {
    switch (method) {
      case 'POST':
        return await serviceInstance.create(event);
      case 'GET':
        // Check if path has tenantId parameter
        if (event.pathParameters?.tenantId) {
          return await serviceInstance.get(event);
        }
        return await serviceInstance.list(event);
      case 'PATCH':
      case 'PUT':
        return await serviceInstance.update(event);
      case 'DELETE':
        return await serviceInstance.delete(event);
      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: `Method ${method} not allowed` })
        };
    }
  } catch (error: any) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};

console.log('🚀 CompanyInfoService: Handler exported');

module.exports = {
  CompanyInfoService,
  handler
};