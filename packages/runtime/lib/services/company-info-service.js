"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyInfoService = void 0;
const company_info_js_1 = require("../models/company-info.js");
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
const TABLE_NAME = process.env.COMPANY_INFO_TABLE || company_info_js_1.CompanyInfo.name;
/**
 * Service for managing CompanyInfo objects in DynamoDB
 * Provides CRUD operations for company information and intent capturing configuration
 */
class CompanyInfoService {
    constructor() {
        // Lightweight service - direct DynamoDB implementation
    }
    /**
     * Create a new company info record
     */
    async create(event) {
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
    async get(event) {
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
            const result = await getDocClient().send(new lib_dynamodb_1.GetCommand({
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
        }
        catch (error) {
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
    async update(event) {
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
    async delete(event) {
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
            await getDocClient().send(new lib_dynamodb_1.DeleteCommand({
                TableName: TABLE_NAME,
                Key: { tenantId }
            }));
            return {
                statusCode: 204,
                headers: corsHeaders,
                body: ''
            };
        }
        catch (error) {
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
    async list(event) {
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
        }
        catch (error) {
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
exports.CompanyInfoService = CompanyInfoService;
// Create service instance
const serviceInstance = new CompanyInfoService();
console.log('🚀 CompanyInfoService: Service instance created');
// Create a universal handler that routes based on HTTP method
const handler = async (event) => {
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
    }
    catch (error) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFueS1pbmZvLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2VydmljZXMvY29tcGFueS1pbmZvLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0RBQXdEO0FBQ3hELDhEQUEwRDtBQUMxRCx3REFBc0c7QUFFdEcsNkJBQTZCO0FBQzdCLElBQUksU0FBaUMsQ0FBQztBQUV0QyxTQUFTLFlBQVk7SUFDbkIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2YsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUM7QUFFRCw2REFBNkQ7QUFDN0QsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSw2QkFBVyxDQUFDLElBQUksQ0FBQztBQUV0RTs7O0dBR0c7QUFDSCxNQUFhLGtCQUFrQjtJQUU3QjtRQUNFLHVEQUF1RDtJQUN6RCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQVU7UUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRXJFLE1BQU0sV0FBVyxHQUFHO1lBQ2xCLGNBQWMsRUFBRSxrQkFBa0I7WUFDbEMsNkJBQTZCLEVBQUUsR0FBRztZQUNsQyw4QkFBOEIsRUFBRSw0QkFBNEI7WUFDNUQsOEJBQThCLEVBQUUsbUNBQW1DO1NBQ3BFLENBQUM7UUFFRixJQUFJLENBQUM7WUFDSCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLENB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QUFDLEVBQUUsS0FBSyxFQUFFLFVBQVUsTUFBTSxjQUFjLEVBQUUsQ0FBQztpQkFDaEUsQ0FBQztRQUNOLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztRQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQy9DLENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO0FBRXZELE1BQU0sQ0FBQyxPQUFPLEdBQUc7SUFDZixrQkFBa0I7SUFDbEIsT0FBTztDQUNSLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wYW55SW5mbyB9IGZyb20gJy4uL21vZGVscy9jb21wYW55LWluZm8uanMnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCwgUHV0Q29tbWFuZCwgRGVsZXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5cbi8vIEluaXRpYWxpemUgRHluYW1vREIgY2xpZW50XG5sZXQgZG9jQ2xpZW50OiBEeW5hbW9EQkRvY3VtZW50Q2xpZW50O1xuXG5mdW5jdGlvbiBnZXREb2NDbGllbnQoKSB7XG4gIGlmICghZG9jQ2xpZW50KSB7XG4gICAgY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbiAgICBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcbiAgfVxuICByZXR1cm4gZG9jQ2xpZW50O1xufVxuXG4vLyBHZXQgdGFibGUgbmFtZSBmcm9tIGVudmlyb25tZW50IG9yIGZhbGwgYmFjayB0byBjbGFzcyBuYW1lXG5jb25zdCBUQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuQ09NUEFOWV9JTkZPX1RBQkxFIHx8IENvbXBhbnlJbmZvLm5hbWU7XG5cbi8qKlxuICogU2VydmljZSBmb3IgbWFuYWdpbmcgQ29tcGFueUluZm8gb2JqZWN0cyBpbiBEeW5hbW9EQlxuICogUHJvdmlkZXMgQ1JVRCBvcGVyYXRpb25zIGZvciBjb21wYW55IGluZm9ybWF0aW9uIGFuZCBpbnRlbnQgY2FwdHVyaW5nIGNvbmZpZ3VyYXRpb25cbiAqL1xuZXhwb3J0IGNsYXNzIENvbXBhbnlJbmZvU2VydmljZSB7XG4gIFxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBMaWdodHdlaWdodCBzZXJ2aWNlIC0gZGlyZWN0IER5bmFtb0RCIGltcGxlbWVudGF0aW9uXG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IGNvbXBhbnkgaW5mbyByZWNvcmRcbiAgICovXG4gIGFzeW5jIGNyZWF0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zb2xlLmxvZygnQ29tcGFueUluZm8gY3JlYXRlIGNhbGxlZCcsIEpTT04uc3RyaW5naWZ5KGV2ZW50LmJvZHkpKTtcbiAgICBcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSB8fCAne30nKTtcbiAgICAgIFxuICAgICAgLy8gQWRkIHRpbWVzdGFtcHNcbiAgICAgIGJvZHkuY3JlYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgYm9keS51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICBcbiAgICAgIGF3YWl0IGdldERvY0NsaWVudCgpLnNlbmQobmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGJvZHlcbiAgICAgIH0pKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAxLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YTogYm9keVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBjb21wYW55IGluZm86JywgZXJyb3IpO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byBjcmVhdGUgY29tcGFueSBpbmZvJyxcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IGNvbXBhbnkgaW5mbyBieSB0ZW5hbnQgSURcbiAgICovXG4gIGFzeW5jIGdldChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zb2xlLmxvZygnQ29tcGFueUluZm8gZ2V0IGNhbGxlZCcsIEpTT04uc3RyaW5naWZ5KGV2ZW50LnBhdGhQYXJhbWV0ZXJzKSk7XG4gICAgXG4gICAgY29uc3QgY29yc0hlYWRlcnMgPSB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRlbmFudElkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnRlbmFudElkO1xuICAgICAgXG4gICAgICBpZiAoIXRlbmFudElkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ3RlbmFudElkIGlzIHJlcXVpcmVkJ1xuICAgICAgICAgIH0pXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKCdRdWVyeWluZyBEeW5hbW9EQiBmb3IgdGVuYW50SWQ6JywgdGVuYW50SWQpO1xuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZXREb2NDbGllbnQoKS5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBUQUJMRV9OQU1FLFxuICAgICAgICBLZXk6IHsgdGVuYW50SWQgfVxuICAgICAgfSkpO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygnRHluYW1vREIgcmVzdWx0OicsIEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICAgICAgXG4gICAgICBpZiAoIXJlc3VsdC5JdGVtKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogJ0NvbXBhbnkgaW5mbyBub3QgZm91bmQnXG4gICAgICAgICAgfSlcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YTogcmVzdWx0Lkl0ZW1cbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyBjb21wYW55IGluZm86JywgZXJyb3IpO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0Vycm9yIHJldHJpZXZpbmcgY29tcGFueSBpbmZvJyxcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIGNvbXBhbnkgaW5mb1xuICAgKi9cbiAgYXN5bmMgdXBkYXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnNvbGUubG9nKCdDb21wYW55SW5mbyB1cGRhdGUgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYm9keSkpO1xuICAgIFxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB0ZW5hbnRJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy50ZW5hbnRJZDtcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XG4gICAgICBcbiAgICAgIGlmICghdGVuYW50SWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiAndGVuYW50SWQgaXMgcmVxdWlyZWQnXG4gICAgICAgICAgfSlcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gVXBkYXRlIHRpbWVzdGFtcFxuICAgICAgYm9keS51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICBib2R5LnRlbmFudElkID0gdGVuYW50SWQ7XG4gICAgICBcbiAgICAgIGF3YWl0IGdldERvY0NsaWVudCgpLnNlbmQobmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGJvZHlcbiAgICAgIH0pKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YTogYm9keVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBjb21wYW55IGluZm86JywgZXJyb3IpO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byB1cGRhdGUgY29tcGFueSBpbmZvJyxcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxuICAgICAgICB9KVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGVsZXRlIGNvbXBhbnkgaW5mb1xuICAgKi9cbiAgYXN5bmMgZGVsZXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnNvbGUubG9nKCdDb21wYW55SW5mbyBkZWxldGUgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQucGF0aFBhcmFtZXRlcnMpKTtcbiAgICBcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgdGVuYW50SWQgPSBldmVudC5wYXRoUGFyYW1ldGVycz8udGVuYW50SWQ7XG4gICAgICBcbiAgICAgIGlmICghdGVuYW50SWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiAndGVuYW50SWQgaXMgcmVxdWlyZWQnXG4gICAgICAgICAgfSlcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgYXdhaXQgZ2V0RG9jQ2xpZW50KCkuc2VuZChuZXcgRGVsZXRlQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7IHRlbmFudElkIH1cbiAgICAgIH0pKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjA0LFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogJydcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZGVsZXRpbmcgY29tcGFueSBpbmZvOicsIGVycm9yKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gZGVsZXRlIGNvbXBhbnkgaW5mbycsXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgYWxsIGNvbXBhbmllcyAoZm9yIGFkbWluIHB1cnBvc2VzKVxuICAgKi9cbiAgYXN5bmMgbGlzdChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zb2xlLmxvZygnQ29tcGFueUluZm8gbGlzdCBjYWxsZWQnKTtcbiAgICBcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgLy8gRm9yIG5vdywgcmV0dXJuIHBsYWNlaG9sZGVyIGRhdGEgc2luY2Ugd2UgZG9uJ3QgaGF2ZSBEeW5hbW9EQiBzZXR1cFxuICAgICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy50ZW5hbnRJZCxcbiAgICAgICAgICBjb21wYW55TmFtZTogJ0t4R3J5bmRlIEZpdG5lc3MnLFxuICAgICAgICAgIGluZHVzdHJ5OiAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1ByZW1pdW0gZml0bmVzcyBjZW50ZXIgb2ZmZXJpbmcgcGVyc29uYWxpemVkIHRyYWluaW5nLCBncm91cCBjbGFzc2VzLCBhbmQgd2VsbG5lc3MgcHJvZ3JhbXMnXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3VsdClcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbGlzdGluZyBjb21wYW5pZXM6JywgZXJyb3IpO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byBsaXN0IGNvbXBhbmllcycsXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgfSlcbiAgICAgIH07XG4gICAgfVxuICB9XG59XG5cbi8vIENyZWF0ZSBzZXJ2aWNlIGluc3RhbmNlXG5jb25zdCBzZXJ2aWNlSW5zdGFuY2UgPSBuZXcgQ29tcGFueUluZm9TZXJ2aWNlKCk7XG5jb25zb2xlLmxvZygn8J+agCBDb21wYW55SW5mb1NlcnZpY2U6IFNlcnZpY2UgaW5zdGFuY2UgY3JlYXRlZCcpO1xuXG4vLyBDcmVhdGUgYSB1bml2ZXJzYWwgaGFuZGxlciB0aGF0IHJvdXRlcyBiYXNlZCBvbiBIVFRQIG1ldGhvZFxuY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KSA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn5qAIENvbXBhbnlJbmZvU2VydmljZTogVW5pdmVyc2FsIGhhbmRsZXIgY2FsbGVkIHdpdGggbWV0aG9kOicsIGV2ZW50Lmh0dHBNZXRob2QgfHwgZXZlbnQucmVxdWVzdENvbnRleHQ/Lmh0dHA/Lm1ldGhvZCk7XG4gIGNvbnN0IG1ldGhvZCA9IChldmVudC5odHRwTWV0aG9kIHx8IGV2ZW50LnJlcXVlc3RDb250ZXh0Py5odHRwPy5tZXRob2QgfHwgJ0dFVCcpLnRvVXBwZXJDYXNlKCk7XG4gIFxuICAvLyBSb3V0ZSB0byBhcHByb3ByaWF0ZSBoYW5kbGVyIGJhc2VkIG9uIEhUVFAgbWV0aG9kIGFuZCBwYXRoXG4gIHRyeSB7XG4gICAgc3dpdGNoIChtZXRob2QpIHtcbiAgICAgIGNhc2UgJ1BPU1QnOlxuICAgICAgICByZXR1cm4gYXdhaXQgc2VydmljZUluc3RhbmNlLmNyZWF0ZShldmVudCk7XG4gICAgICBjYXNlICdHRVQnOlxuICAgICAgICAvLyBDaGVjayBpZiBwYXRoIGhhcyB0ZW5hbnRJZCBwYXJhbWV0ZXJcbiAgICAgICAgaWYgKGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy50ZW5hbnRJZCkge1xuICAgICAgICAgIHJldHVybiBhd2FpdCBzZXJ2aWNlSW5zdGFuY2UuZ2V0KGV2ZW50KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXdhaXQgc2VydmljZUluc3RhbmNlLmxpc3QoZXZlbnQpO1xuICAgICAgY2FzZSAnUEFUQ0gnOlxuICAgICAgY2FzZSAnUFVUJzpcbiAgICAgICAgcmV0dXJuIGF3YWl0IHNlcnZpY2VJbnN0YW5jZS51cGRhdGUoZXZlbnQpO1xuICAgICAgY2FzZSAnREVMRVRFJzpcbiAgICAgICAgcmV0dXJuIGF3YWl0IHNlcnZpY2VJbnN0YW5jZS5kZWxldGUoZXZlbnQpO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDUsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBgTWV0aG9kICR7bWV0aG9kfSBub3QgYWxsb3dlZGAgfSlcbiAgICAgICAgfTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICBjb25zb2xlLmVycm9yKCdIYW5kbGVyIGVycm9yOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSlcbiAgICB9O1xuICB9XG59O1xuXG5jb25zb2xlLmxvZygn8J+agCBDb21wYW55SW5mb1NlcnZpY2U6IEhhbmRsZXIgZXhwb3J0ZWQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIENvbXBhbnlJbmZvU2VydmljZSxcbiAgaGFuZGxlclxufTsiXX0=