"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyInfoService = void 0;
const company_info_js_1 = require("../models/company-info.js");
// Placeholder decorators and utilities for @toldyaonce/kx-cdk-lambda-utils
const ApiBasePath = (path) => (target) => target;
const ApiMethod = (method, path) => (target, propertyKey, descriptor) => descriptor;
// Placeholder Service class
class Service {
    constructor(model, partitionKey, sortKey) { }
    async create(event) {
        console.log('Service.create called with:', event.body);
        return { success: true, message: 'Create method not implemented' };
    }
    async get(event) {
        console.log('Service.get called with:', event.pathParameters);
        return { success: true, message: 'Get method not implemented' };
    }
    async update(event) {
        console.log('Service.update called with:', event.body);
        return { success: true, message: 'Update method not implemented' };
    }
    async delete(event) {
        console.log('Service.delete called with:', event.pathParameters);
        return { success: true, message: 'Delete method not implemented' };
    }
    async list(event) {
        console.log('Service.list called');
        return { success: true, data: [], message: 'List method not implemented' };
    }
    async query(event) {
        console.log('Service.query called with:', event.pathParameters);
        return { success: true, data: [], message: 'Query method not implemented' };
    }
}
// Placeholder getApiMethodHandlers
function getApiMethodHandlers(service) {
    return {
        handler: async (event) => {
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
 * Service for managing CompanyInfo objects in DynamoDB
 * Provides CRUD operations for company information and intent capturing configuration
 */
let CompanyInfoService = class CompanyInfoService extends Service {
    constructor() {
        super(company_info_js_1.CompanyInfo, 'tenantId');
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
            const result = await super.create(event);
            return {
                statusCode: 201,
                headers: corsHeaders,
                body: JSON.stringify(result)
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
            const result = await super.get(event);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(result)
            };
        }
        catch (error) {
            console.error('Error getting company info:', error);
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: false,
                    message: 'Company info not found',
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
            const body = JSON.parse(event.body || '{}');
            // Update timestamp
            body.updatedAt = new Date().toISOString();
            const result = await super.update(event);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(result)
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
            await super.delete(event);
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
            const result = await super.list(event);
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
};
exports.CompanyInfoService = CompanyInfoService;
__decorate([
    ApiMethod('POST', '/')
], CompanyInfoService.prototype, "create", null);
__decorate([
    ApiMethod('GET', '/{tenantId}')
], CompanyInfoService.prototype, "get", null);
__decorate([
    ApiMethod('PATCH', '/{tenantId}')
], CompanyInfoService.prototype, "update", null);
__decorate([
    ApiMethod('DELETE', '/{tenantId}')
], CompanyInfoService.prototype, "delete", null);
__decorate([
    ApiMethod('GET', '/')
], CompanyInfoService.prototype, "list", null);
exports.CompanyInfoService = CompanyInfoService = __decorate([
    ApiBasePath('/company-info')
], CompanyInfoService);
// Export the service and method handlers for Lambda integration
module.exports = {
    CompanyInfoService,
    ...getApiMethodHandlers(new CompanyInfoService())
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFueS1pbmZvLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2VydmljZXMvY29tcGFueS1pbmZvLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsK0RBQXdEO0FBRXhELDJFQUEyRTtBQUMzRSxNQUFNLFdBQVcsR0FBRyxDQUFDLElBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFXLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQztBQUM5RCxNQUFNLFNBQVMsR0FBRyxDQUFDLE1BQWMsRUFBRSxJQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBVyxFQUFFLFdBQW1CLEVBQUUsVUFBOEIsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDO0FBRXRJLDRCQUE0QjtBQUM1QixNQUFNLE9BQU87SUFDWCxZQUFZLEtBQVUsRUFBRSxZQUFvQixFQUFFLE9BQWdCLElBQUcsQ0FBQztJQUVsRSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQVU7UUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLCtCQUErQixFQUFFLENBQUM7SUFDckUsQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBVTtRQUNsQixPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsQ0FBQztJQUNsRSxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFVO1FBQ3JCLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sRUFBRSxPQUFPLEVBQUUs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QyxLQUFLLEVBQUUsR0FBRyxDQUFDOzhDQWdDckI7NkJBeE1VLGtCQUFrQjtJQUQ5QixXQUFXLENBQUMsZUFBZSxDQUFDO0dBQ2hCLGtCQUFrQixDQXlNOUI7QUFFRCxnRUFBZ0U7QUFDaEUsTUFBTSxDQUFDLE9BQU8sR0FBRztJQUNmLGtCQUFrQjtJQUNsQixHQUFHLG9CQUFvQixDQUFDLElBQUksa0JBQWtCLEVBQUUsQ0FBQztDQUNsRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tcGFueUluZm8gfSBmcm9tICcuLi9tb2RlbHMvY29tcGFueS1pbmZvLmpzJztcclxuXHJcbi8vIFBsYWNlaG9sZGVyIGRlY29yYXRvcnMgYW5kIHV0aWxpdGllcyBmb3IgQHRvbGR5YW9uY2Uva3gtY2RrLWxhbWJkYS11dGlsc1xyXG5jb25zdCBBcGlCYXNlUGF0aCA9IChwYXRoOiBzdHJpbmcpID0+ICh0YXJnZXQ6IGFueSkgPT4gdGFyZ2V0O1xyXG5jb25zdCBBcGlNZXRob2QgPSAobWV0aG9kOiBzdHJpbmcsIHBhdGg/OiBzdHJpbmcpID0+ICh0YXJnZXQ6IGFueSwgcHJvcGVydHlLZXk6IHN0cmluZywgZGVzY3JpcHRvcjogUHJvcGVydHlEZXNjcmlwdG9yKSA9PiBkZXNjcmlwdG9yO1xyXG5cclxuLy8gUGxhY2Vob2xkZXIgU2VydmljZSBjbGFzc1xyXG5jbGFzcyBTZXJ2aWNlPFQ+IHtcclxuICBjb25zdHJ1Y3Rvcihtb2RlbDogYW55LCBwYXJ0aXRpb25LZXk6IHN0cmluZywgc29ydEtleT86IHN0cmluZykge31cclxuICBcclxuICBhc3luYyBjcmVhdGUoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnU2VydmljZS5jcmVhdGUgY2FsbGVkIHdpdGg6JywgZXZlbnQuYm9keSk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnQ3JlYXRlIG1ldGhvZCBub3QgaW1wbGVtZW50ZWQnIH07XHJcbiAgfVxyXG4gIFxyXG4gIGFzeW5jIGdldChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLmdldCBjYWxsZWQgd2l0aDonLCBldmVudC5wYXRoUGFyYW1ldGVycyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnR2V0IG1ldGhvZCBub3QgaW1wbGVtZW50ZWQnIH07XHJcbiAgfVxyXG4gIFxyXG4gIGFzeW5jIHVwZGF0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLnVwZGF0ZSBjYWxsZWQgd2l0aDonLCBldmVudC5ib2R5KTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdVcGRhdGUgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgZGVsZXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1NlcnZpY2UuZGVsZXRlIGNhbGxlZCB3aXRoOicsIGV2ZW50LnBhdGhQYXJhbWV0ZXJzKTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdEZWxldGUgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgbGlzdChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLmxpc3QgY2FsbGVkJyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBbXSwgbWVzc2FnZTogJ0xpc3QgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgcXVlcnkoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnU2VydmljZS5xdWVyeSBjYWxsZWQgd2l0aDonLCBldmVudC5wYXRoUGFyYW1ldGVycyk7XHJcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBbXSwgbWVzc2FnZTogJ1F1ZXJ5IG1ldGhvZCBub3QgaW1wbGVtZW50ZWQnIH07XHJcbiAgfVxyXG59XHJcblxyXG4vLyBQbGFjZWhvbGRlciBnZXRBcGlNZXRob2RIYW5kbGVyc1xyXG5mdW5jdGlvbiBnZXRBcGlNZXRob2RIYW5kbGVycyhzZXJ2aWNlOiBhbnkpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcclxuICByZXR1cm4ge1xyXG4gICAgaGFuZGxlcjogYXN5bmMgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coJ0dlbmVyaWMgaGFuZGxlciBjYWxsZWQgd2l0aDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcclxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgXHJcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLCBcclxuICAgICAgICAgIG1lc3NhZ2U6ICdTZXJ2aWNlIG1ldGhvZCBoYW5kbGVycyBub3QgaW1wbGVtZW50ZWQgLSByZXF1aXJlcyBAdG9sZHlhb25jZS9reC1jZGstbGFtYmRhLXV0aWxzJyBcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXJ2aWNlIGZvciBtYW5hZ2luZyBDb21wYW55SW5mbyBvYmplY3RzIGluIER5bmFtb0RCXHJcbiAqIFByb3ZpZGVzIENSVUQgb3BlcmF0aW9ucyBmb3IgY29tcGFueSBpbmZvcm1hdGlvbiBhbmQgaW50ZW50IGNhcHR1cmluZyBjb25maWd1cmF0aW9uXHJcbiAqL1xyXG5AQXBpQmFzZVBhdGgoJy9jb21wYW55LWluZm8nKVxyXG5leHBvcnQgY2xhc3MgQ29tcGFueUluZm9TZXJ2aWNlIGV4dGVuZHMgU2VydmljZTxDb21wYW55SW5mbz4ge1xyXG4gIFxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgc3VwZXIoQ29tcGFueUluZm8sICd0ZW5hbnRJZCcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGEgbmV3IGNvbXBhbnkgaW5mbyByZWNvcmRcclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdQT1NUJywgJy8nKVxyXG4gIGFzeW5jIGNyZWF0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdDb21wYW55SW5mbyBjcmVhdGUgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYm9keSkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBBZGQgdGltZXN0YW1wc1xyXG4gICAgICBib2R5LmNyZWF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgICAgYm9keS51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5jcmVhdGUoZXZlbnQpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiAyMDEsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVzdWx0KVxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBjb21wYW55IGluZm86JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGNyZWF0ZSBjb21wYW55IGluZm8nLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGNvbXBhbnkgaW5mbyBieSB0ZW5hbnQgSURcclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdHRVQnLCAnL3t0ZW5hbnRJZH0nKVxyXG4gIGFzeW5jIGdldChldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdDb21wYW55SW5mbyBnZXQgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQucGF0aFBhcmFtZXRlcnMpKTtcclxuICAgIFxyXG4gICAgY29uc3QgY29yc0hlYWRlcnMgPSB7XHJcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xyXG4gICAgfTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5nZXQoZXZlbnQpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVzdWx0KVxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIGNvbXBhbnkgaW5mbzonLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdDb21wYW55IGluZm8gbm90IGZvdW5kJyxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFVwZGF0ZSBjb21wYW55IGluZm9cclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdQQVRDSCcsICcve3RlbmFudElkfScpXHJcbiAgYXN5bmMgdXBkYXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ0NvbXBhbnlJbmZvIHVwZGF0ZSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5ib2R5KSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSB8fCAne30nKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFVwZGF0ZSB0aW1lc3RhbXBcclxuICAgICAgYm9keS51cGRhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci51cGRhdGUoZXZlbnQpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVzdWx0KVxyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBjb21wYW55IGluZm86JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIHVwZGF0ZSBjb21wYW55IGluZm8nLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGVsZXRlIGNvbXBhbnkgaW5mb1xyXG4gICAqL1xyXG4gIEBBcGlNZXRob2QoJ0RFTEVURScsICcve3RlbmFudElkfScpXHJcbiAgYXN5bmMgZGVsZXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ0NvbXBhbnlJbmZvIGRlbGV0ZSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHN1cGVyLmRlbGV0ZShldmVudCk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwNCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiAnJ1xyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkZWxldGluZyBjb21wYW55IGluZm86JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGRlbGV0ZSBjb21wYW55IGluZm8nLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTGlzdCBhbGwgY29tcGFuaWVzIChmb3IgYWRtaW4gcHVycG9zZXMpXHJcbiAgICovXHJcbiAgQEFwaU1ldGhvZCgnR0VUJywgJy8nKVxyXG4gIGFzeW5jIGxpc3QoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnQ29tcGFueUluZm8gbGlzdCBjYWxsZWQnKTtcclxuICAgIFxyXG4gICAgY29uc3QgY29yc0hlYWRlcnMgPSB7XHJcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xyXG4gICAgfTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5saXN0KGV2ZW50KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3VsdClcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbGlzdGluZyBjb21wYW5pZXM6JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGxpc3QgY29tcGFuaWVzJyxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cG9ydCB0aGUgc2VydmljZSBhbmQgbWV0aG9kIGhhbmRsZXJzIGZvciBMYW1iZGEgaW50ZWdyYXRpb25cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgQ29tcGFueUluZm9TZXJ2aWNlLFxyXG4gIC4uLmdldEFwaU1ldGhvZEhhbmRsZXJzKG5ldyBDb21wYW55SW5mb1NlcnZpY2UoKSlcclxufTsiXX0=