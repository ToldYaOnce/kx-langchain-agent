"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonasService = void 0;
const personas_js_1 = require("../models/personas.js");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
// Initialize DynamoDB client
let docClient;
function getDocClient() {
    if (!docClient) {
        const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
        docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
    }
    return docClient;
}
// Get table name from environment or fall back to class name
const TABLE_NAME = process.env.PERSONAS_TABLE || personas_js_1.Persona.name;
console.log('🚀 PersonasService: Service instance created');
/**
 * Service for managing Persona objects in DynamoDB
 * Provides CRUD operations for persona configurations
 */
class PersonasService {
    constructor() {
        // Lightweight service - direct DynamoDB implementation
    }
    /**
     * Create a new persona
     */
    async createPersona(event) {
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
            await getDocClient().send(new lib_dynamodb_1.PutCommand({
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
        }
        catch (error) {
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
    async getPersona(event) {
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
            const result = await getDocClient().send(new lib_dynamodb_1.GetCommand({
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
        }
        catch (error) {
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
    async updatePersona(event) {
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
            await getDocClient().send(new lib_dynamodb_1.PutCommand({
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
        }
        catch (error) {
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
    async deletePersona(event) {
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
            await getDocClient().send(new lib_dynamodb_1.DeleteCommand({
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
        }
        catch (error) {
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
    async listPersonas(event) {
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
            const result = await getDocClient().send(new lib_dynamodb_1.QueryCommand({
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
        }
        catch (error) {
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
    async getRandomPersona(event) {
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
            const result = await getDocClient().send(new lib_dynamodb_1.QueryCommand({
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
        }
        catch (error) {
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
exports.PersonasService = PersonasService;
// Create service instance
const serviceInstance = new PersonasService();
console.log('🚀 PersonasService: Handler exported');
// Universal handler to route requests
const handler = async (event) => {
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
    }
    else if (method === 'GET' && tenantId && personaId) {
        return serviceInstance.getPersona(event);
    }
    else if (method === 'PATCH' && tenantId && personaId) {
        return serviceInstance.updatePersona(event);
    }
    else if (method === 'DELETE' && tenantId && personaId) {
        return serviceInstance.deletePersona(event);
    }
    else if (method === 'GET' && tenantId && lastSegment === 'random') {
        return serviceInstance.getRandomPersona(event);
    }
    else if (method === 'GET' && tenantId && !personaId) {
        return serviceInstance.listPersonas(event);
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYXMtc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXJ2aWNlcy9wZXJzb25hcy1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHVEQUFnRDtBQUNoRCw4REFBMEQ7QUFDMUQsd0RBQW9IO0FBRXBILDZCQUE2QjtBQUM3QixJQUFJLFNBQWlDLENBQUM7QUFFdEMsU0FBUyxZQUFZO0lBQ25CLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNmLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1QyxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBRUQsNkRBQTZEO0FBQzdELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLHFCQUFPLENBQUMsSUFBSSxDQUFDO0FBRTlELE9BQU8sQ0FBQyxHQUFHLENBQUMsOENBQThDLENBQUMsQ0FBQztBQUU1RDs7O0dBR0c7QUFDSCxNQUFhLGVBQWU7SUFFMUI7UUFDRSx1REFBdUQ7SUFDekQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFVO1FBQzVCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVqRSxNQUFNLFdBQVcsR0FBRztZQUNsQixjQUFjLEVBQUUsa0JBQWtCO1lBQ2xDLDZCQUE2QixFQUFFLEdBQUc7WUFDbEMsOEJBQThCLEVBQUUsNEJBQTRCO1lBQzVELDhCQUE4QixFQUFFLG1DQUFtQztTQUNwRSxDQUFDO1FBRUYsSUFBSSxDQUFDO1lBQ0gsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxL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QUFlLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdDLENBQUM7U0FBTSxDQUFDO1FBQ04sT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsT0FBTyxFQUFFLFVBQVUsTUFBTSxjQUFjLEtBQUssQ0FBQyxJQUFJLGtCQUFrQjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUFFRixNQUFNLENBQUMsT0FBTyxHQUFHO0lBQ2YsZUFBZTtJQUNmLE9BQU87Q0FDUixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGVyc29uYSB9IGZyb20gJy4uL21vZGVscy9wZXJzb25hcy5qcyc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBQdXRDb21tYW5kLCBEZWxldGVDb21tYW5kLCBRdWVyeUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuXG4vLyBJbml0aWFsaXplIER5bmFtb0RCIGNsaWVudFxubGV0IGRvY0NsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudDtcblxuZnVuY3Rpb24gZ2V0RG9jQ2xpZW50KCkge1xuICBpZiAoIWRvY0NsaWVudCkge1xuICAgIGNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG4gICAgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG4gIH1cbiAgcmV0dXJuIGRvY0NsaWVudDtcbn1cblxuLy8gR2V0IHRhYmxlIG5hbWUgZnJvbSBlbnZpcm9ubWVudCBvciBmYWxsIGJhY2sgdG8gY2xhc3MgbmFtZVxuY29uc3QgVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlBFUlNPTkFTX1RBQkxFIHx8IFBlcnNvbmEubmFtZTtcblxuY29uc29sZS5sb2coJ/CfmoAgUGVyc29uYXNTZXJ2aWNlOiBTZXJ2aWNlIGluc3RhbmNlIGNyZWF0ZWQnKTtcblxuLyoqXG4gKiBTZXJ2aWNlIGZvciBtYW5hZ2luZyBQZXJzb25hIG9iamVjdHMgaW4gRHluYW1vREJcbiAqIFByb3ZpZGVzIENSVUQgb3BlcmF0aW9ucyBmb3IgcGVyc29uYSBjb25maWd1cmF0aW9uc1xuICovXG5leHBvcnQgY2xhc3MgUGVyc29uYXNTZXJ2aWNlIHtcbiAgXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIExpZ2h0d2VpZ2h0IHNlcnZpY2UgLSBkaXJlY3QgRHluYW1vREIgaW1wbGVtZW50YXRpb25cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuZXcgcGVyc29uYVxuICAgKi9cbiAgYXN5bmMgY3JlYXRlUGVyc29uYShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zb2xlLmxvZygnUGVyc29uYSBjcmVhdGUgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYm9keSkpO1xuICAgIFxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgICAgY29uc3QgeyB0ZW5hbnRJZCB9ID0gZXZlbnQucGF0aFBhcmFtZXRlcnMgfHwge307XG4gICAgICBcbiAgICAgIGlmICghdGVuYW50SWQgfHwgIWJvZHkucGVyc29uYUlkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ3RlbmFudElkIGFuZCBwZXJzb25hSWQgYXJlIHJlcXVpcmVkJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIEVuc3VyZSB0ZW5hbnRJZCBpcyBzZXQgZnJvbSBwYXRoXG4gICAgICBib2R5LnRlbmFudElkID0gdGVuYW50SWQ7XG4gICAgICBcbiAgICAgIC8vIEFkZCB0aW1lc3RhbXBzXG4gICAgICBib2R5LmNyZWF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgICAgIGJvZHkudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgXG4gICAgICBhd2FpdCBnZXREb2NDbGllbnQoKS5zZW5kKG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBUQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBib2R5XG4gICAgICB9KSk7XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMSxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IGJvZHlcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgY3JlYXRpbmcgcGVyc29uYTonLCBlcnJvcik7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0Vycm9yIGNyZWF0aW5nIHBlcnNvbmEnLFxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXG4gICAgICAgIH0pXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcGVyc29uYSBieSB0ZW5hbnRJZCBhbmQgcGVyc29uYUlkXG4gICAqL1xuICBhc3luYyBnZXRQZXJzb25hKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnNvbGUubG9nKCdQZXJzb25hIGdldCBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xuICAgIFxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHRlbmFudElkLCBwZXJzb25hSWQgfSA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzIHx8IHt9O1xuICAgICAgXG4gICAgICBpZiAoIXRlbmFudElkIHx8ICFwZXJzb25hSWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiAndGVuYW50SWQgYW5kIHBlcnNvbmFJZCBhcmUgcmVxdWlyZWQnXG4gICAgICAgICAgfSlcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0RG9jQ2xpZW50KCkuc2VuZChuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7IHRlbmFudElkLCBwZXJzb25hSWQgfVxuICAgICAgfSkpO1xuICAgICAgXG4gICAgICBpZiAoIXJlc3VsdC5JdGVtKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1BlcnNvbmEgbm90IGZvdW5kJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IHJlc3VsdC5JdGVtXG4gICAgICAgIH0pXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdldHRpbmcgcGVyc29uYTonLCBlcnJvcik7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0Vycm9yIGdldHRpbmcgcGVyc29uYScsXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBwZXJzb25hXG4gICAqL1xuICBhc3luYyB1cGRhdGVQZXJzb25hKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnNvbGUubG9nKCdQZXJzb25hIHVwZGF0ZSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5ib2R5KSk7XG4gICAgXG4gICAgY29uc3QgY29yc0hlYWRlcnMgPSB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XG4gICAgICBjb25zdCB7IHRlbmFudElkLCBwZXJzb25hSWQgfSA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzIHx8IHt9O1xuICAgICAgXG4gICAgICBpZiAoIXRlbmFudElkIHx8ICFwZXJzb25hSWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiAndGVuYW50SWQgYW5kIHBlcnNvbmFJZCBhcmUgcmVxdWlyZWQnXG4gICAgICAgICAgfSlcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRW5zdXJlIGtleXMgYXJlIHNldFxuICAgICAgYm9keS50ZW5hbnRJZCA9IHRlbmFudElkO1xuICAgICAgYm9keS5wZXJzb25hSWQgPSBwZXJzb25hSWQ7XG4gICAgICBcbiAgICAgIC8vIFVwZGF0ZSB0aW1lc3RhbXBcbiAgICAgIGJvZHkudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgXG4gICAgICBhd2FpdCBnZXREb2NDbGllbnQoKS5zZW5kKG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBUQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBib2R5XG4gICAgICB9KSk7XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IGJvZHlcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgcGVyc29uYTonLCBlcnJvcik7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0Vycm9yIHVwZGF0aW5nIHBlcnNvbmEnLFxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXG4gICAgICAgIH0pXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZWxldGUgcGVyc29uYVxuICAgKi9cbiAgYXN5bmMgZGVsZXRlUGVyc29uYShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zb2xlLmxvZygnUGVyc29uYSBkZWxldGUgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQucGF0aFBhcmFtZXRlcnMpKTtcbiAgICBcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB0ZW5hbnRJZCwgcGVyc29uYUlkIH0gPSBldmVudC5wYXRoUGFyYW1ldGVycyB8fCB7fTtcbiAgICAgIFxuICAgICAgaWYgKCF0ZW5hbnRJZCB8fCAhcGVyc29uYUlkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ3RlbmFudElkIGFuZCBwZXJzb25hSWQgYXJlIHJlcXVpcmVkJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIGF3YWl0IGdldERvY0NsaWVudCgpLnNlbmQobmV3IERlbGV0ZUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEtleTogeyB0ZW5hbnRJZCwgcGVyc29uYUlkIH1cbiAgICAgIH0pKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgbWVzc2FnZTogJ1BlcnNvbmEgZGVsZXRlZCBzdWNjZXNzZnVsbHknXG4gICAgICAgIH0pXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGRlbGV0aW5nIHBlcnNvbmE6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6ICdFcnJvciBkZWxldGluZyBwZXJzb25hJyxcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTGlzdCBhbGwgcGVyc29uYXMgZm9yIGEgdGVuYW50XG4gICAqL1xuICBhc3luYyBsaXN0UGVyc29uYXMoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc29sZS5sb2coJ1BlcnNvbmEgbGlzdCBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xuICAgIFxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHRlbmFudElkIH0gPSBldmVudC5wYXRoUGFyYW1ldGVycyB8fCB7fTtcbiAgICAgIFxuICAgICAgaWYgKCF0ZW5hbnRJZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICd0ZW5hbnRJZCBpcyByZXF1aXJlZCdcbiAgICAgICAgICB9KVxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXREb2NDbGllbnQoKS5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd0ZW5hbnRJZCA9IDp0ZW5hbnRJZCcsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICAnOnRlbmFudElkJzogdGVuYW50SWRcbiAgICAgICAgfVxuICAgICAgfSkpO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBkYXRhOiByZXN1bHQuSXRlbXMgfHwgW11cbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbGlzdGluZyBwZXJzb25hczonLCBlcnJvcik7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0Vycm9yIGxpc3RpbmcgcGVyc29uYXMnLFxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXG4gICAgICAgIH0pXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYSByYW5kb20gcGVyc29uYSBmb3IgYSB0ZW5hbnRcbiAgICovXG4gIGFzeW5jIGdldFJhbmRvbVBlcnNvbmEoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc29sZS5sb2coJ0dldCByYW5kb20gcGVyc29uYSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xuICAgIFxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHRlbmFudElkIH0gPSBldmVudC5wYXRoUGFyYW1ldGVycyB8fCB7fTtcbiAgICAgIFxuICAgICAgaWYgKCF0ZW5hbnRJZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICd0ZW5hbnRJZCBpcyByZXF1aXJlZCdcbiAgICAgICAgICB9KVxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXREb2NDbGllbnQoKS5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd0ZW5hbnRJZCA9IDp0ZW5hbnRJZCcsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICAnOnRlbmFudElkJzogdGVuYW50SWRcbiAgICAgICAgfVxuICAgICAgfSkpO1xuICAgICAgXG4gICAgICBjb25zdCBwZXJzb25hcyA9IHJlc3VsdC5JdGVtcyB8fCBbXTtcbiAgICAgIFxuICAgICAgaWYgKHBlcnNvbmFzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdObyBwZXJzb25hcyBmb3VuZCBmb3IgdGVuYW50J1xuICAgICAgICAgIH0pXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IHJhbmRvbVBlcnNvbmEgPSBwZXJzb25hc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBwZXJzb25hcy5sZW5ndGgpXTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YTogcmFuZG9tUGVyc29uYVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIHJhbmRvbSBwZXJzb25hOicsIGVycm9yKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBtZXNzYWdlOiAnRXJyb3IgZ2V0dGluZyByYW5kb20gcGVyc29uYScsXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfVxuICB9XG59XG5cbi8vIENyZWF0ZSBzZXJ2aWNlIGluc3RhbmNlXG5jb25zdCBzZXJ2aWNlSW5zdGFuY2UgPSBuZXcgUGVyc29uYXNTZXJ2aWNlKCk7XG5cbmNvbnNvbGUubG9nKCfwn5qAIFBlcnNvbmFzU2VydmljZTogSGFuZGxlciBleHBvcnRlZCcpO1xuXG4vLyBVbml2ZXJzYWwgaGFuZGxlciB0byByb3V0ZSByZXF1ZXN0c1xuY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KSA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn5qAIFBlcnNvbmFzU2VydmljZTogVW5pdmVyc2FsIGhhbmRsZXIgY2FsbGVkIHdpdGggbWV0aG9kOicsIGV2ZW50Lmh0dHBNZXRob2QpO1xuICBjb25zb2xlLmxvZygn8J+agCBQZXJzb25hc1NlcnZpY2U6IFBhdGg6JywgZXZlbnQucGF0aCk7XG4gIGNvbnNvbGUubG9nKCfwn5qAIFBlcnNvbmFzU2VydmljZTogUGF0aCBwYXJhbWV0ZXJzOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LnBhdGhQYXJhbWV0ZXJzKSk7XG4gIFxuICBjb25zdCBtZXRob2QgPSBldmVudC5odHRwTWV0aG9kO1xuICBjb25zdCB7IHRlbmFudElkLCBwZXJzb25hSWQgfSA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzIHx8IHt9O1xuICBjb25zdCBwYXRoU2VnbWVudHMgPSBldmVudC5wYXRoPy5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKSB8fCBbXTtcbiAgY29uc3QgbGFzdFNlZ21lbnQgPSBwYXRoU2VnbWVudHNbcGF0aFNlZ21lbnRzLmxlbmd0aCAtIDFdO1xuICBcbiAgLy8gUm91dGUgYmFzZWQgb24gSFRUUCBtZXRob2QgYW5kIHBhdGhcbiAgaWYgKG1ldGhvZCA9PT0gJ1BPU1QnICYmIHRlbmFudElkICYmICFwZXJzb25hSWQpIHtcbiAgICByZXR1cm4gc2VydmljZUluc3RhbmNlLmNyZWF0ZVBlcnNvbmEoZXZlbnQpO1xuICB9IGVsc2UgaWYgKG1ldGhvZCA9PT0gJ0dFVCcgJiYgdGVuYW50SWQgJiYgcGVyc29uYUlkKSB7XG4gICAgcmV0dXJuIHNlcnZpY2VJbnN0YW5jZS5nZXRQZXJzb25hKGV2ZW50KTtcbiAgfSBlbHNlIGlmIChtZXRob2QgPT09ICdQQVRDSCcgJiYgdGVuYW50SWQgJiYgcGVyc29uYUlkKSB7XG4gICAgcmV0dXJuIHNlcnZpY2VJbnN0YW5jZS51cGRhdGVQZXJzb25hKGV2ZW50KTtcbiAgfSBlbHNlIGlmIChtZXRob2QgPT09ICdERUxFVEUnICYmIHRlbmFudElkICYmIHBlcnNvbmFJZCkge1xuICAgIHJldHVybiBzZXJ2aWNlSW5zdGFuY2UuZGVsZXRlUGVyc29uYShldmVudCk7XG4gIH0gZWxzZSBpZiAobWV0aG9kID09PSAnR0VUJyAmJiB0ZW5hbnRJZCAmJiBsYXN0U2VnbWVudCA9PT0gJ3JhbmRvbScpIHtcbiAgICByZXR1cm4gc2VydmljZUluc3RhbmNlLmdldFJhbmRvbVBlcnNvbmEoZXZlbnQpO1xuICB9IGVsc2UgaWYgKG1ldGhvZCA9PT0gJ0dFVCcgJiYgdGVuYW50SWQgJiYgIXBlcnNvbmFJZCkge1xuICAgIHJldHVybiBzZXJ2aWNlSW5zdGFuY2UubGlzdFBlcnNvbmFzKGV2ZW50KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAxLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogYE1ldGhvZCAke21ldGhvZH0gd2l0aCBwYXRoICR7ZXZlbnQucGF0aH0gbm90IGltcGxlbWVudGVkYFxuICAgICAgfSlcbiAgICB9O1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgUGVyc29uYXNTZXJ2aWNlLFxuICBoYW5kbGVyXG59O1xuIl19