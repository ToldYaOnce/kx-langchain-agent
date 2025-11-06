"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonasService = void 0;
const personas_js_1 = require("../models/personas.js");
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
 * Service for managing Persona objects in DynamoDB
 * Provides CRUD operations for persona configurations
 */
let PersonasService = class PersonasService extends Service {
    constructor() {
        super(personas_js_1.Persona, 'tenantId', 'personaId');
    }
    /**
     * Create a new persona
     */
    async create(event) {
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
        }
        catch (error) {
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
    async get(event) {
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
        }
        catch (error) {
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
    async update(event) {
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
        }
        catch (error) {
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
    async delete(event) {
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
        }
        catch (error) {
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
    async listByTenant(event) {
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
        }
        catch (error) {
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
    async getRandomPersona(event) {
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
        }
        catch (error) {
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
};
exports.PersonasService = PersonasService;
__decorate([
    ApiMethod('POST', '/{tenantId}')
], PersonasService.prototype, "create", null);
__decorate([
    ApiMethod('GET', '/{tenantId}/{personaId}')
], PersonasService.prototype, "get", null);
__decorate([
    ApiMethod('PATCH', '/{tenantId}/{personaId}')
], PersonasService.prototype, "update", null);
__decorate([
    ApiMethod('DELETE', '/{tenantId}/{personaId}')
], PersonasService.prototype, "delete", null);
__decorate([
    ApiMethod('GET', '/{tenantId}')
], PersonasService.prototype, "listByTenant", null);
__decorate([
    ApiMethod('GET', '/{tenantId}/random')
], PersonasService.prototype, "getRandomPersona", null);
exports.PersonasService = PersonasService = __decorate([
    ApiBasePath('/personas')
], PersonasService);
// Export the service and method handlers for Lambda integration
module.exports = {
    PersonasService,
    ...getApiMethodHandlers(new PersonasService())
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYXMtc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXJ2aWNlcy9wZXJzb25hcy1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHVEQUFnRDtBQUVoRCwyRUFBMkU7QUFDM0UsTUFBTSxXQUFXLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBVyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUM7QUFDOUQsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUFjLEVBQUUsSUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQVcsRUFBRSxXQUFtQixFQUFFLFVBQThCLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQztBQUV0SSw0QkFBNEI7QUFDNUIsTUFBTSxPQUFPO0lBQ1gsWUFBWSxLQUFVLEVBQUUsWUFBb0IsRUFBRSxPQUFnQixJQUFHLENBQUM7SUFFbEUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFVO1FBQ3JCLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxDQUFDO0lBQ3JFLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQVU7UUFDbEIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLENBQUM7SUFDbEUsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBVTtRQUNyQixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFB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S0FBVSxFQUFFLENBQUM7WUFDcEIsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUV0RCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRSxXQUFXO2dCQUNwQixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsT0FBTyxFQUFFLDhCQUE4QjtvQkFDdkMsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPO2lCQUNyQixDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0NBQ0YsQ0FBQTtBQXZRWSwwQ0FBZTtBQVVwQjtJQURMLFNBQVMsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDOzZDQTBDaEM7QUFNSztJQURMLFNBQVMsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUM7MENBZ0MzQztBQU1LO0lBREwsU0FBUyxDQUFDLE9BQU8sRUFBRSx5QkFBeUIsQ0FBQzs2Q0EwQzdDO0FBTUs7SUFETCxTQUFTLENBQUMsUUFBUSxFQUFFLHlCQUF5QixDQUFDOzZDQWdDOUM7QUFNSztJQURMLFNBQVMsQ0FBQyxLQUFLLEVBQUUsYUFBYSxDQUFDO21EQWlDL0I7QUFNSztJQURMLFNBQVMsQ0FBQyxLQUFLLEVBQUUsb0JBQW9CLENBQUM7dURBK0N0QzswQkF0UVUsZUFBZTtJQUQzQixXQUFXLENBQUMsV0FBVyxDQUFDO0dBQ1osZUFBZSxDQXVRM0I7QUFFRCxnRUFBZ0U7QUFDaEUsTUFBTSxDQUFDLE9BQU8sR0FBRztJQUNmLGVBQWU7SUFDZixHQUFHLG9CQUFvQixDQUFDLElBQUksZUFBZSxFQUFFLENBQUM7Q0FDL0MsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBlcnNvbmEgfSBmcm9tICcuLi9tb2RlbHMvcGVyc29uYXMuanMnO1xyXG5cclxuLy8gUGxhY2Vob2xkZXIgZGVjb3JhdG9ycyBhbmQgdXRpbGl0aWVzIGZvciBAdG9sZHlhb25jZS9reC1jZGstbGFtYmRhLXV0aWxzXHJcbmNvbnN0IEFwaUJhc2VQYXRoID0gKHBhdGg6IHN0cmluZykgPT4gKHRhcmdldDogYW55KSA9PiB0YXJnZXQ7XHJcbmNvbnN0IEFwaU1ldGhvZCA9IChtZXRob2Q6IHN0cmluZywgcGF0aD86IHN0cmluZykgPT4gKHRhcmdldDogYW55LCBwcm9wZXJ0eUtleTogc3RyaW5nLCBkZXNjcmlwdG9yOiBQcm9wZXJ0eURlc2NyaXB0b3IpID0+IGRlc2NyaXB0b3I7XHJcblxyXG4vLyBQbGFjZWhvbGRlciBTZXJ2aWNlIGNsYXNzXHJcbmNsYXNzIFNlcnZpY2U8VD4ge1xyXG4gIGNvbnN0cnVjdG9yKG1vZGVsOiBhbnksIHBhcnRpdGlvbktleTogc3RyaW5nLCBzb3J0S2V5Pzogc3RyaW5nKSB7fVxyXG4gIFxyXG4gIGFzeW5jIGNyZWF0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLmNyZWF0ZSBjYWxsZWQgd2l0aDonLCBldmVudC5ib2R5KTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdDcmVhdGUgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgZ2V0KGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1NlcnZpY2UuZ2V0IGNhbGxlZCB3aXRoOicsIGV2ZW50LnBhdGhQYXJhbWV0ZXJzKTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6ICdHZXQgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbiAgXHJcbiAgYXN5bmMgdXBkYXRlKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1NlcnZpY2UudXBkYXRlIGNhbGxlZCB3aXRoOicsIGV2ZW50LmJvZHkpO1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ1VwZGF0ZSBtZXRob2Qgbm90IGltcGxlbWVudGVkJyB9O1xyXG4gIH1cclxuICBcclxuICBhc3luYyBkZWxldGUoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnU2VydmljZS5kZWxldGUgY2FsbGVkIHdpdGg6JywgZXZlbnQucGF0aFBhcmFtZXRlcnMpO1xyXG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ0RlbGV0ZSBtZXRob2Qgbm90IGltcGxlbWVudGVkJyB9O1xyXG4gIH1cclxuICBcclxuICBhc3luYyBsaXN0KGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1NlcnZpY2UubGlzdCBjYWxsZWQnKTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IFtdLCBtZXNzYWdlOiAnTGlzdCBtZXRob2Qgbm90IGltcGxlbWVudGVkJyB9O1xyXG4gIH1cclxuICBcclxuICBhc3luYyBxdWVyeShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdTZXJ2aWNlLnF1ZXJ5IGNhbGxlZCB3aXRoOicsIGV2ZW50LnBhdGhQYXJhbWV0ZXJzKTtcclxuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IFtdLCBtZXNzYWdlOiAnUXVlcnkgbWV0aG9kIG5vdCBpbXBsZW1lbnRlZCcgfTtcclxuICB9XHJcbn1cclxuXHJcbi8vIFBsYWNlaG9sZGVyIGdldEFwaU1ldGhvZEhhbmRsZXJzXHJcbmZ1bmN0aW9uIGdldEFwaU1ldGhvZEhhbmRsZXJzKHNlcnZpY2U6IGFueSk6IFJlY29yZDxzdHJpbmcsIGFueT4ge1xyXG4gIHJldHVybiB7XHJcbiAgICBoYW5kbGVyOiBhc3luYyAoZXZlbnQ6IGFueSkgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZygnR2VuZXJpYyBoYW5kbGVyIGNhbGxlZCB3aXRoOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULFBPU1QsUFVULFBBVENILERFTEVURSxPUFRJT05TJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBcclxuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsIFxyXG4gICAgICAgICAgbWVzc2FnZTogJ1NlcnZpY2UgbWV0aG9kIGhhbmRsZXJzIG5vdCBpbXBsZW1lbnRlZCAtIHJlcXVpcmVzIEB0b2xkeWFvbmNlL2t4LWNkay1sYW1iZGEtdXRpbHMnIFxyXG4gICAgICAgIH0pXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNlcnZpY2UgZm9yIG1hbmFnaW5nIFBlcnNvbmEgb2JqZWN0cyBpbiBEeW5hbW9EQlxyXG4gKiBQcm92aWRlcyBDUlVEIG9wZXJhdGlvbnMgZm9yIHBlcnNvbmEgY29uZmlndXJhdGlvbnNcclxuICovXHJcbkBBcGlCYXNlUGF0aCgnL3BlcnNvbmFzJylcclxuZXhwb3J0IGNsYXNzIFBlcnNvbmFzU2VydmljZSBleHRlbmRzIFNlcnZpY2U8UGVyc29uYT4ge1xyXG4gIFxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgc3VwZXIoUGVyc29uYSwgJ3RlbmFudElkJywgJ3BlcnNvbmFJZCcpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGEgbmV3IHBlcnNvbmFcclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdQT1NUJywgJy97dGVuYW50SWR9JylcclxuICBhc3luYyBjcmVhdGUoZXZlbnQ6IGFueSk6IFByb21pc2U8YW55PiB7XHJcbiAgICBjb25zb2xlLmxvZygnUGVyc29uYSBjcmVhdGUgY2FsbGVkJywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuYm9keSkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XHJcbiAgICAgIGNvbnN0IHsgdGVuYW50SWQgfSA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzO1xyXG4gICAgICBcclxuICAgICAgLy8gRW5zdXJlIHRlbmFudElkIGlzIHNldCBmcm9tIHBhdGhcclxuICAgICAgYm9keS50ZW5hbnRJZCA9IHRlbmFudElkO1xyXG4gICAgICBcclxuICAgICAgLy8gQWRkIHRpbWVzdGFtcHNcclxuICAgICAgYm9keS5jcmVhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XHJcbiAgICAgIGJvZHkudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3VwZXIuY3JlYXRlKGV2ZW50KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAxLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3VsdClcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgY3JlYXRpbmcgcGVyc29uYTonLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gY3JlYXRlIHBlcnNvbmEnLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IHBlcnNvbmEgYnkgdGVuYW50SWQgYW5kIHBlcnNvbmFJZFxyXG4gICAqL1xyXG4gIEBBcGlNZXRob2QoJ0dFVCcsICcve3RlbmFudElkfS97cGVyc29uYUlkfScpXHJcbiAgYXN5bmMgZ2V0KGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1BlcnNvbmEgZ2V0IGNhbGxlZCcsIEpTT04uc3RyaW5naWZ5KGV2ZW50LnBhdGhQYXJhbWV0ZXJzKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3VwZXIuZ2V0KGV2ZW50KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3VsdClcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyBwZXJzb25hOicsIGVycm9yKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ1BlcnNvbmEgbm90IGZvdW5kJyxcclxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlXHJcbiAgICAgICAgfSlcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFVwZGF0ZSBwZXJzb25hXHJcbiAgICovXHJcbiAgQEFwaU1ldGhvZCgnUEFUQ0gnLCAnL3t0ZW5hbnRJZH0ve3BlcnNvbmFJZH0nKVxyXG4gIGFzeW5jIHVwZGF0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdQZXJzb25hIHVwZGF0ZSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5ib2R5KSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgYm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSB8fCAne30nKTtcclxuICAgICAgY29uc3QgeyB0ZW5hbnRJZCwgcGVyc29uYUlkIH0gPSBldmVudC5wYXRoUGFyYW1ldGVycztcclxuICAgICAgXHJcbiAgICAgIC8vIEVuc3VyZSBrZXlzIGFyZSBzZXQgZnJvbSBwYXRoXHJcbiAgICAgIGJvZHkudGVuYW50SWQgPSB0ZW5hbnRJZDtcclxuICAgICAgYm9keS5wZXJzb25hSWQgPSBwZXJzb25hSWQ7XHJcbiAgICAgIFxyXG4gICAgICAvLyBVcGRhdGUgdGltZXN0YW1wXHJcbiAgICAgIGJvZHkudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3VwZXIudXBkYXRlKGV2ZW50KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3VsdClcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgcGVyc29uYTonLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gdXBkYXRlIHBlcnNvbmEnLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcclxuICAgICAgICB9KVxyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGVsZXRlIHBlcnNvbmFcclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdERUxFVEUnLCAnL3t0ZW5hbnRJZH0ve3BlcnNvbmFJZH0nKVxyXG4gIGFzeW5jIGRlbGV0ZShldmVudDogYW55KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIGNvbnNvbGUubG9nKCdQZXJzb25hIGRlbGV0ZSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHN1cGVyLmRlbGV0ZShldmVudCk7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDIwNCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiAnJ1xyXG4gICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkZWxldGluZyBwZXJzb25hOicsIGVycm9yKTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxyXG4gICAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byBkZWxldGUgcGVyc29uYScsXHJcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMaXN0IHBlcnNvbmFzIGZvciBhIHRlbmFudFxyXG4gICAqL1xyXG4gIEBBcGlNZXRob2QoJ0dFVCcsICcve3RlbmFudElkfScpXHJcbiAgYXN5bmMgbGlzdEJ5VGVuYW50KGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1BlcnNvbmEgbGlzdEJ5VGVuYW50IGNhbGxlZCcsIEpTT04uc3RyaW5naWZ5KGV2ZW50LnBhdGhQYXJhbWV0ZXJzKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xyXG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ0dFVCxQT1NULFBVVCxQQVRDSCxERUxFVEUsT1BUSU9OUydcclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVXNlIHRoZSBiYXNlIHNlcnZpY2UncyBxdWVyeSBtZXRob2QgdG8gZ2V0IGFsbCBwZXJzb25hcyBmb3IgdGVuYW50XHJcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1cGVyLnF1ZXJ5KGV2ZW50KTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlc3VsdClcclxuICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbGlzdGluZyBwZXJzb25hczonLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcclxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gbGlzdCBwZXJzb25hcycsXHJcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgYSByYW5kb20gcGVyc29uYSBmb3IgYSB0ZW5hbnQgKHVzZWQgd2hlbiBubyBzcGVjaWZpYyBwZXJzb25hIGlzIHJlcXVlc3RlZClcclxuICAgKi9cclxuICBAQXBpTWV0aG9kKCdHRVQnLCAnL3t0ZW5hbnRJZH0vcmFuZG9tJylcclxuICBhc3luYyBnZXRSYW5kb21QZXJzb25hKGV2ZW50OiBhbnkpOiBQcm9taXNlPGFueT4ge1xyXG4gICAgY29uc29sZS5sb2coJ1BlcnNvbmEgZ2V0UmFuZG9tUGVyc29uYSBjYWxsZWQnLCBKU09OLnN0cmluZ2lmeShldmVudC5wYXRoUGFyYW1ldGVycykpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcclxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcclxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxyXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdHRVQsUE9TVCxQVVQsUEFUQ0gsREVMRVRFLE9QVElPTlMnXHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIEdldCBhbGwgcGVyc29uYXMgZm9yIHRlbmFudFxyXG4gICAgICBjb25zdCBwZXJzb25hcyA9IGF3YWl0IHN1cGVyLnF1ZXJ5KGV2ZW50KTtcclxuICAgICAgXHJcbiAgICAgIGlmICghcGVyc29uYXMgfHwgcGVyc29uYXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcclxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcclxuICAgICAgICAgICAgbWVzc2FnZTogJ05vIHBlcnNvbmFzIGZvdW5kIGZvciB0ZW5hbnQnXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFJldHVybiBhIHJhbmRvbSBwZXJzb25hXHJcbiAgICAgIGNvbnN0IHJhbmRvbVBlcnNvbmEgPSBwZXJzb25hc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBwZXJzb25hcy5sZW5ndGgpXTtcclxuICAgICAgXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxyXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxyXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJhbmRvbVBlcnNvbmEpXHJcbiAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdldHRpbmcgcmFuZG9tIHBlcnNvbmE6JywgZXJyb3IpO1xyXG4gICAgICBcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXHJcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXHJcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGdldCByYW5kb20gcGVyc29uYScsXHJcbiAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBFeHBvcnQgdGhlIHNlcnZpY2UgYW5kIG1ldGhvZCBoYW5kbGVycyBmb3IgTGFtYmRhIGludGVncmF0aW9uXHJcbm1vZHVsZS5leHBvcnRzID0ge1xyXG4gIFBlcnNvbmFzU2VydmljZSxcclxuICAuLi5nZXRBcGlNZXRob2RIYW5kbGVycyhuZXcgUGVyc29uYXNTZXJ2aWNlKCkpXHJcbn07Il19