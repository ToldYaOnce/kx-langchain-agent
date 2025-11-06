"use strict";
/**
 * @fileoverview
 * Factory functions for creating Lambda handlers with the KxGen LangChain Agent.
 *
 * This approach gives consumers complete control over their Lambda functions while
 * providing pre-built, tested handler logic they can use or customize.
 *
 * Consumers can:
 * - Use the factory functions directly for common patterns
 * - Customize the handlers with their own middleware/logic
 * - Create entirely custom handlers using the core AgentService
 *
 * @example
 * ```typescript
 * // In consumer's Lambda function
 * import { createApiGatewayHandler, createEventBridgeHandler } from '@kxgen/langchain-agent-runtime';
 *
 * // Option 1: Use factory directly
 * export const handler = createApiGatewayHandler({
 *   tenantId: 'my-company',
 *   customMiddleware: async (event, context, next) => {
 *     // Custom auth, logging, etc.
 *     return next();
 *   }
 * });
 *
 * // Option 2: Customize the handler
 * const baseHandler = createApiGatewayHandler();
 * export const handler = async (event, context) => {
 *   // Custom preprocessing
 *   if (!validateApiKey(event.headers.authorization)) {
 *     return { statusCode: 401, body: 'Unauthorized' };
 *   }
 *
 *   // Call base handler
 *   return baseHandler(event, context);
 * };
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiGatewayHandler = createApiGatewayHandler;
exports.createEventBridgeHandler = createEventBridgeHandler;
exports.createHealthCheckHandler = createHealthCheckHandler;
const dynamodb_js_1 = require("./dynamodb.js");
const eventbridge_js_1 = require("./eventbridge.js");
const agent_js_1 = require("./agent.js");
const config_js_1 = require("./config.js");
const zod_1 = require("zod");
// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
/**
 * Default logger implementation
 */
const defaultLogger = (level, message, data) => {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${logData}`);
};
/**
 * Default CORS headers
 */
const defaultCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json',
};
/**
 * Apply middleware functions in sequence
 */
async function applyMiddleware(middleware, event, context, finalHandler) {
    let index = 0;
    const next = async () => {
        if (index >= middleware.length) {
            return finalHandler();
        }
        const currentMiddleware = middleware[index++];
        return currentMiddleware(event, context, next);
    };
    return next();
}
// =============================================================================
// API GATEWAY HANDLER FACTORY
// =============================================================================
/**
 * Default request schema for API Gateway chat requests
 */
const DefaultChatRequestSchema = zod_1.z.object({
    tenantId: zod_1.z.string().optional(),
    message: zod_1.z.string(),
    userEmail: zod_1.z.string().email().optional(),
    userId: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    conversationId: zod_1.z.string().optional(),
    leadId: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
/**
 * Creates an API Gateway Lambda handler for synchronous chat requests
 *
 * @param config Configuration options for the handler
 * @returns Lambda handler function
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const handler = createApiGatewayHandler();
 *
 * // With custom configuration
 * export const handler = createApiGatewayHandler({
 *   tenantId: 'my-company',
 *   cors: {
 *     allowOrigins: ['https://mycompany.com'],
 *     allowCredentials: true,
 *   },
 *   middleware: [
 *     async (event, context, next) => {
 *       // Custom authentication
 *       if (!event.headers.authorization) {
 *         return {
 *           statusCode: 401,
 *           headers: defaultCorsHeaders,
 *           body: JSON.stringify({ error: 'Unauthorized' }),
 *         };
 *       }
 *       return next();
 *     },
 *   ],
 * });
 * ```
 */
function createApiGatewayHandler(config = {}) {
    const { tenantId: defaultTenantId, environmentOverrides = {}, errorHandler, logger = defaultLogger, cors = {}, requestSchema = DefaultChatRequestSchema, middleware = [], responseTransformer, } = config;
    // Build CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': cors.allowOrigins?.join(',') || '*',
        'Access-Control-Allow-Headers': cors.allowHeaders?.join(',') || 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': cors.allowMethods?.join(',') || 'POST,OPTIONS',
        'Content-Type': 'application/json',
        ...(cors.allowCredentials && { 'Access-Control-Allow-Credentials': 'true' }),
    };
    const coreHandler = async (event, context) => {
        const startTime = Date.now();
        try {
            logger('info', 'API Gateway chat request received', {
                method: event.requestContext.http.method,
                path: event.requestContext.http.path,
                requestId: event.requestContext.requestId,
            });
            // Handle preflight OPTIONS request
            if (event.requestContext.http.method === 'OPTIONS') {
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: '',
                };
            }
            // Only allow POST requests
            if (event.requestContext.http.method !== 'POST') {
                return {
                    statusCode: 405,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Method not allowed',
                        message: 'Only POST requests are supported.',
                    }),
                };
            }
            // Parse and validate request body
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Missing request body',
                        message: 'Request body is required.',
                    }),
                };
            }
            let requestBody;
            try {
                const parsedBody = JSON.parse(event.body);
                requestBody = requestSchema.parse(parsedBody);
            }
            catch (error) {
                logger('error', 'Request validation failed', { error });
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid request format',
                        message: error instanceof zod_1.z.ZodError
                            ? `Validation errors: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                            : 'Invalid JSON in request body',
                    }),
                };
            }
            // Load configuration with overrides
            const originalEnv = { ...process.env };
            Object.assign(process.env, environmentOverrides);
            try {
                const runtimeConfig = (0, config_js_1.loadRuntimeConfig)();
                (0, config_js_1.validateRuntimeConfig)(runtimeConfig);
                // Initialize services
                const dynamoService = new dynamodb_js_1.DynamoDBService(runtimeConfig);
                const eventBridgeService = new eventbridge_js_1.EventBridgeService(runtimeConfig);
                const agentService = new agent_js_1.AgentService({
                    ...runtimeConfig,
                    dynamoService,
                    eventBridgeService,
                });
                // Determine tenant ID and email
                const tenantId = requestBody.tenantId || defaultTenantId;
                if (!tenantId) {
                    throw new Error('tenantId is required (in request body or handler config)');
                }
                let emailLc;
                if (requestBody.userEmail) {
                    emailLc = requestBody.userEmail.toLowerCase();
                }
                else if (requestBody.userId) {
                    emailLc = `${requestBody.userId}@anonymous.chat`;
                }
                else {
                    const sessionId = requestBody.sessionId || `sess_${Date.now()}`;
                    emailLc = `${sessionId}@anonymous.chat`;
                }
                const conversationId = requestBody.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                // Store inbound message
                const inboundMessage = await dynamoService.putMessage({
                    tenantId,
                    email_lc: emailLc,
                    lead_id: requestBody.leadId,
                    source: 'chat',
                    direction: 'inbound',
                    text: requestBody.message,
                    conversation_id: conversationId,
                    channel_context: {
                        chat: {
                            sessionId: requestBody.sessionId || `sess_${Date.now()}`,
                            clientId: 'api_gateway',
                            userAgent: event.headers['user-agent'] || 'unknown',
                            ipAddress: event.requestContext.http.sourceIp,
                        },
                    },
                    meta: {
                        api_gateway_request_id: event.requestContext.requestId,
                        received_at: new Date().toISOString(),
                        metadata: requestBody.metadata,
                    },
                });
                logger('info', 'Stored inbound message', {
                    messageId: `${inboundMessage.contact_pk}/${inboundMessage.ts}`,
                });
                // Process with agent service
                const structuredResponse = await agentService.processMessageStructured({
                    tenantId,
                    email_lc: emailLc,
                    text: requestBody.message,
                    source: 'chat',
                    channel_context: {
                        chat: {
                            sessionId: requestBody.sessionId || `sess_${Date.now()}`,
                            clientId: 'api_gateway',
                            userAgent: event.headers['user-agent'] || 'unknown',
                            ipAddress: event.requestContext.http.sourceIp,
                        },
                    },
                    lead_id: requestBody.leadId,
                    conversation_id: conversationId,
                });
                // Store outbound message
                const outboundMessage = await dynamoService.putMessage({
                    tenantId,
                    email_lc: emailLc,
                    lead_id: requestBody.leadId,
                    source: 'agent',
                    direction: 'outbound',
                    text: structuredResponse.message,
                    conversation_id: conversationId,
                    meta: {
                        model: runtimeConfig.bedrockModelId,
                        triggered_by_message: inboundMessage.ts,
                        processed_at: new Date().toISOString(),
                        intent: structuredResponse.intent,
                        processing_time_ms: structuredResponse.metadata.processingTimeMs,
                        api_gateway_request_id: event.requestContext.requestId,
                    },
                });
                logger('info', 'Stored outbound message', {
                    messageId: `${outboundMessage.contact_pk}/${outboundMessage.ts}`,
                });
                // Log intent detection
                if (structuredResponse.intent) {
                    logger('info', `🎯 Intent detected: ${structuredResponse.intent.id} (confidence: ${structuredResponse.intent.confidence})`);
                }
                // Prepare response
                const chatResponse = {
                    ...structuredResponse,
                    conversationId,
                    sessionId: requestBody.sessionId,
                };
                chatResponse.metadata.totalProcessingTimeMs = Date.now() - startTime;
                // Use custom response transformer if provided
                if (responseTransformer) {
                    return responseTransformer(chatResponse, event);
                }
                // Default response
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(chatResponse),
                };
            }
            finally {
                // Restore original environment
                process.env = originalEnv;
            }
        }
        catch (error) {
            logger('error', 'API Gateway handler error', { error });
            if (errorHandler) {
                return errorHandler(error, event, context);
            }
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: false,
                    error: 'Internal server error',
                    message: 'An error occurred while processing your message.',
                    metadata: {
                        processingTimeMs: Date.now() - startTime,
                        requestId: event.requestContext.requestId,
                    },
                }),
            };
        }
    };
    // Return handler with middleware support
    return async (event, context) => {
        if (middleware.length === 0) {
            return coreHandler(event, context);
        }
        return applyMiddleware(middleware, event, context, () => coreHandler(event, context));
    };
}
// =============================================================================
// EVENTBRIDGE HANDLER FACTORY
// =============================================================================
/**
 * Creates an EventBridge Lambda handler for asynchronous message processing
 *
 * @param config Configuration options for the handler
 * @returns Lambda handler function
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const handler = createEventBridgeHandler();
 *
 * // With custom configuration
 * export const handler = createEventBridgeHandler({
 *   middleware: [
 *     async (event, context, next) => {
 *       // Custom preprocessing
 *       console.log('Processing event:', event.source);
 *       return next();
 *     },
 *   ],
 *   invokeAgent: true, // Directly invoke agent processing
 * });
 * ```
 */
function createEventBridgeHandler(config = {}) {
    const { tenantId: defaultTenantId, environmentOverrides = {}, errorHandler, logger = defaultLogger, eventSchema, middleware = [], invokeAgent = true, } = config;
    const coreHandler = async (event, context) => {
        try {
            logger('info', 'EventBridge event received', {
                source: event.source,
                detailType: event['detail-type'],
            });
            // Validate event if schema provided
            if (eventSchema) {
                eventSchema.parse(event);
            }
            // Load configuration with overrides
            const originalEnv = { ...process.env };
            Object.assign(process.env, environmentOverrides);
            try {
                const runtimeConfig = (0, config_js_1.loadRuntimeConfig)();
                (0, config_js_1.validateRuntimeConfig)(runtimeConfig);
                // Initialize services
                const dynamoService = new dynamodb_js_1.DynamoDBService(runtimeConfig);
                const eventBridgeService = new eventbridge_js_1.EventBridgeService(runtimeConfig);
                // Process based on event type
                if (event.source === 'kxgen.messaging' && event['detail-type'] === 'lead.message.created') {
                    const detail = event.detail;
                    // Resolve contact information
                    let emailLc = detail.email_lc;
                    let leadId = detail.lead_id;
                    if (!emailLc && detail.phone_e164) {
                        logger('info', `Resolving contact from phone: ${detail.phone_e164}`);
                        const resolvedEmailLc = await dynamoService.resolveContactFromPhone(detail.tenantId, detail.phone_e164);
                        emailLc = resolvedEmailLc || undefined;
                        if (!emailLc) {
                            logger('error', `Could not resolve contact for phone: ${detail.phone_e164}`);
                            return;
                        }
                        const lead = await dynamoService.getLead(detail.tenantId, emailLc);
                        leadId = lead?.lead_id;
                    }
                    if (!emailLc) {
                        throw new Error('Could not determine email_lc for contact');
                    }
                    // Store inbound message
                    const messageItem = await dynamoService.putMessage({
                        tenantId: detail.tenantId,
                        email_lc: emailLc,
                        lead_id: leadId,
                        source: detail.source,
                        direction: 'inbound',
                        text: detail.text,
                        channel_context: detail.channel_context,
                        meta: {
                            provider: detail.provider,
                            timestamps: detail.timestamps,
                            router_processed_at: new Date().toISOString(),
                        },
                    });
                    logger('info', `Stored inbound message: ${messageItem.contact_pk}/${messageItem.ts}`);
                    // Invoke agent if requested
                    if (invokeAgent) {
                        const agentService = new agent_js_1.AgentService({
                            ...runtimeConfig,
                            dynamoService,
                            eventBridgeService,
                        });
                        const response = await agentService.processMessage({
                            tenantId: detail.tenantId,
                            email_lc: emailLc,
                            text: detail.text,
                            source: detail.source,
                            channel_context: detail.channel_context,
                            lead_id: leadId,
                            conversation_id: detail.conversation_id,
                        });
                        logger('info', `Generated response: ${response.substring(0, 100)}...`);
                        // Store and publish response
                        const responseMessage = await dynamoService.putMessage({
                            tenantId: detail.tenantId,
                            email_lc: emailLc,
                            lead_id: leadId,
                            source: 'agent',
                            direction: 'outbound',
                            text: response,
                            conversation_id: detail.conversation_id,
                            meta: {
                                model: runtimeConfig.bedrockModelId,
                                triggered_by_message: messageItem.ts,
                                processed_at: new Date().toISOString(),
                            },
                        });
                        // Publish agent reply event
                        await eventBridgeService.publishAgentReply(eventbridge_js_1.EventBridgeService.createAgentReplyEvent(detail.tenantId, dynamodb_js_1.DynamoDBService.createContactPK(detail.tenantId, emailLc), response, detail.source, agentService.createRoutingInfo({
                            tenantId: detail.tenantId,
                            email_lc: emailLc,
                            text: detail.text,
                            source: detail.source,
                            channel_context: detail.channel_context,
                            lead_id: leadId,
                            conversation_id: detail.conversation_id,
                        }, detail.source), {
                            conversationId: detail.conversation_id,
                            metadata: {
                                model: runtimeConfig.bedrockModelId,
                                triggered_by_message: messageItem.ts,
                                response_message_ts: responseMessage.ts,
                                lead_id: leadId,
                            },
                        }));
                    }
                }
            }
            finally {
                // Restore original environment
                process.env = originalEnv;
            }
        }
        catch (error) {
            logger('error', 'EventBridge handler error', { error });
            if (errorHandler) {
                await errorHandler(error, event, context);
                return;
            }
            throw error;
        }
    };
    // Return handler with middleware support
    return async (event, context) => {
        if (middleware.length === 0) {
            return coreHandler(event, context);
        }
        return applyMiddleware(middleware, event, context, () => coreHandler(event, context));
    };
}
// =============================================================================
// HEALTH CHECK HANDLER FACTORY
// =============================================================================
/**
 * Creates a simple health check handler
 *
 * @param config Basic configuration
 * @returns Health check handler
 */
function createHealthCheckHandler(config = {}) {
    const { version = '1.0.0', serviceName = 'kxgen-langchain-agent' } = config;
    return async (event, context) => {
        const response = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version,
            service: serviceName,
            requestId: context.awsRequestId,
        };
        // For API Gateway
        if (event.requestContext) {
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify(response),
            };
        }
        // For other triggers
        return response;
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQtaGFuZGxlci1mYWN0b3J5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9hZ2VudC1oYW5kbGVyLWZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXNDRzs7QUFtTUgsMERBZ1FDO0FBOEJELDREQWdMQztBQVlELDREQThCQztBQXhyQkQsK0NBQWdEO0FBQ2hELHFEQUFzRDtBQUN0RCx5Q0FBMEM7QUFDMUMsMkNBQXVFO0FBRXZFLDZCQUF3QjtBQTBGeEIsZ0ZBQWdGO0FBQ2hGLG9CQUFvQjtBQUNwQixnRkFBZ0Y7QUFFaEY7O0dBRUc7QUFDSCxNQUFNLGFBQWEsR0FBRyxDQUFDLEtBQWEsRUFBRSxPQUFlLEVBQUUsSUFBVSxFQUFFLEVBQUU7SUFDbkUsTUFBTSxTQUFTLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUMzQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLFNBQVMsS0FBSyxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssT0FBTyxHQUFHLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDN0UsQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLGtCQUFrQixHQUFHO0lBQ3pCLDZCQUE2QixFQUFFLEdBQUc7SUFDbEMsOEJBQThCLEVBQUUsNEJBQTRCO0lBQzVELDhCQUE4QixFQUFFLGNBQWM7SUFDOUMsY0FBYyxFQUFFLGtCQUFrQjtDQUNuQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxLQUFLLFVBQVUsZUFBZSxDQUM1QixVQUFpRCxFQUNqRCxLQUFhLEVBQ2IsT0FBZ0IsRUFDaEIsWUFBb0M7SUFFcEMs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bGVvdmVydmlld1xuICogRmFjdG9yeSBmdW5jdGlvbnMgZm9yIGNyZWF0aW5nIExhbWJkYSBoYW5kbGVycyB3aXRoIHRoZSBLeEdlbiBMYW5nQ2hhaW4gQWdlbnQuXG4gKiBcbiAqIFRoaXMgYXBwcm9hY2ggZ2l2ZXMgY29uc3VtZXJzIGNvbXBsZXRlIGNvbnRyb2wgb3ZlciB0aGVpciBMYW1iZGEgZnVuY3Rpb25zIHdoaWxlXG4gKiBwcm92aWRpbmcgcHJlLWJ1aWx0LCB0ZXN0ZWQgaGFuZGxlciBsb2dpYyB0aGV5IGNhbiB1c2Ugb3IgY3VzdG9taXplLlxuICogXG4gKiBDb25zdW1lcnMgY2FuOlxuICogLSBVc2UgdGhlIGZhY3RvcnkgZnVuY3Rpb25zIGRpcmVjdGx5IGZvciBjb21tb24gcGF0dGVybnNcbiAqIC0gQ3VzdG9taXplIHRoZSBoYW5kbGVycyB3aXRoIHRoZWlyIG93biBtaWRkbGV3YXJlL2xvZ2ljXG4gKiAtIENyZWF0ZSBlbnRpcmVseSBjdXN0b20gaGFuZGxlcnMgdXNpbmcgdGhlIGNvcmUgQWdlbnRTZXJ2aWNlXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBJbiBjb25zdW1lcidzIExhbWJkYSBmdW5jdGlvblxuICogaW1wb3J0IHsgY3JlYXRlQXBpR2F0ZXdheUhhbmRsZXIsIGNyZWF0ZUV2ZW50QnJpZGdlSGFuZGxlciB9IGZyb20gJ0BreGdlbi9sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG4gKiBcbiAqIC8vIE9wdGlvbiAxOiBVc2UgZmFjdG9yeSBkaXJlY3RseVxuICogZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVBcGlHYXRld2F5SGFuZGxlcih7XG4gKiAgIHRlbmFudElkOiAnbXktY29tcGFueScsXG4gKiAgIGN1c3RvbU1pZGRsZXdhcmU6IGFzeW5jIChldmVudCwgY29udGV4dCwgbmV4dCkgPT4ge1xuICogICAgIC8vIEN1c3RvbSBhdXRoLCBsb2dnaW5nLCBldGMuXG4gKiAgICAgcmV0dXJuIG5leHQoKTtcbiAqICAgfVxuICogfSk7XG4gKiBcbiAqIC8vIE9wdGlvbiAyOiBDdXN0b21pemUgdGhlIGhhbmRsZXJcbiAqIGNvbnN0IGJhc2VIYW5kbGVyID0gY3JlYXRlQXBpR2F0ZXdheUhhbmRsZXIoKTtcbiAqIGV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50LCBjb250ZXh0KSA9PiB7XG4gKiAgIC8vIEN1c3RvbSBwcmVwcm9jZXNzaW5nXG4gKiAgIGlmICghdmFsaWRhdGVBcGlLZXkoZXZlbnQuaGVhZGVycy5hdXRob3JpemF0aW9uKSkge1xuICogICAgIHJldHVybiB7IHN0YXR1c0NvZGU6IDQwMSwgYm9keTogJ1VuYXV0aG9yaXplZCcgfTtcbiAqICAgfVxuICogICBcbiAqICAgLy8gQ2FsbCBiYXNlIGhhbmRsZXJcbiAqICAgcmV0dXJuIGJhc2VIYW5kbGVyKGV2ZW50LCBjb250ZXh0KTtcbiAqIH07XG4gKiBgYGBcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEFQSUdhdGV3YXlQcm94eUV2ZW50VjIsIEFQSUdhdGV3YXlQcm94eVJlc3VsdFYyLCBDb250ZXh0LCBFdmVudEJyaWRnZUV2ZW50IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuL2R5bmFtb2RiLmpzJztcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4vZXZlbnRicmlkZ2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBsb2FkUnVudGltZUNvbmZpZywgdmFsaWRhdGVSdW50aW1lQ29uZmlnIH0gZnJvbSAnLi9jb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudFJlc3BvbnNlLCBJbmJvdW5kTWVzc2FnZUV2ZW50IH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xuaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDT05GSUdVUkFUSU9OIFRZUEVTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEJhc2UgY29uZmlndXJhdGlvbiBmb3IgYWxsIGhhbmRsZXIgZmFjdG9yaWVzXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmFzZUhhbmRsZXJDb25maWcge1xuICAvKipcbiAgICogT3B0aW9uYWwgdGVuYW50IElEIG92ZXJyaWRlIChpZiBub3QgcHJvdmlkZWQgaW4gcmVxdWVzdClcbiAgICovXG4gIHRlbmFudElkPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBDdXN0b20gZW52aXJvbm1lbnQgdmFyaWFibGUgb3ZlcnJpZGVzXG4gICAqL1xuICBlbnZpcm9ubWVudE92ZXJyaWRlcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cbiAgLyoqXG4gICAqIEN1c3RvbSBlcnJvciBoYW5kbGVyXG4gICAqL1xuICBlcnJvckhhbmRsZXI/OiAoZXJyb3I6IEVycm9yLCBldmVudDogYW55LCBjb250ZXh0OiBDb250ZXh0KSA9PiBQcm9taXNlPGFueT47XG5cbiAgLyoqXG4gICAqIEN1c3RvbSBsb2dnaW5nIGZ1bmN0aW9uXG4gICAqL1xuICBsb2dnZXI/OiAobGV2ZWw6ICdpbmZvJyB8ICd3YXJuJyB8ICdlcnJvcicsIG1lc3NhZ2U6IHN0cmluZywgZGF0YT86IGFueSkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBNaWRkbGV3YXJlIGZ1bmN0aW9uIHR5cGUgZm9yIGN1c3RvbSBwcm9jZXNzaW5nXG4gKi9cbmV4cG9ydCB0eXBlIE1pZGRsZXdhcmVGdW5jdGlvbjxURXZlbnQsIFRSZXN1bHQ+ID0gKFxuICBldmVudDogVEV2ZW50LFxuICBjb250ZXh0OiBDb250ZXh0LFxuICBuZXh0OiAoKSA9PiBQcm9taXNlPFRSZXN1bHQ+XG4pID0+IFByb21pc2U8VFJlc3VsdD47XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBmb3IgQVBJIEdhdGV3YXkgaGFuZGxlciBmYWN0b3J5XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXBpR2F0ZXdheUhhbmRsZXJDb25maWcgZXh0ZW5kcyBCYXNlSGFuZGxlckNvbmZpZyB7XG4gIC8qKlxuICAgKiBDT1JTIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGNvcnM/OiB7XG4gICAgYWxsb3dPcmlnaW5zPzogc3RyaW5nW107XG4gICAgYWxsb3dNZXRob2RzPzogc3RyaW5nW107XG4gICAgYWxsb3dIZWFkZXJzPzogc3RyaW5nW107XG4gICAgYWxsb3dDcmVkZW50aWFscz86IGJvb2xlYW47XG4gIH07XG5cbiAgLyoqXG4gICAqIFJlcXVlc3QgdmFsaWRhdGlvbiBzY2hlbWEgb3ZlcnJpZGVcbiAgICovXG4gIHJlcXVlc3RTY2hlbWE/OiB6LlpvZFNjaGVtYTtcblxuICAvKipcbiAgICogQ3VzdG9tIG1pZGRsZXdhcmUgZnVuY3Rpb25zXG4gICAqL1xuICBtaWRkbGV3YXJlPzogTWlkZGxld2FyZUZ1bmN0aW9uPEFQSUdhdGV3YXlQcm94eUV2ZW50VjIsIEFQSUdhdGV3YXlQcm94eVJlc3VsdFYyPltdO1xuXG4gIC8qKlxuICAgKiBDdXN0b20gcmVzcG9uc2UgdHJhbnNmb3JtZXJcbiAgICovXG4gIHJlc3BvbnNlVHJhbnNmb3JtZXI/OiAocmVzcG9uc2U6IEFnZW50UmVzcG9uc2UsIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudFYyKSA9PiBBUElHYXRld2F5UHJveHlSZXN1bHRWMjtcbn1cblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIGZvciBFdmVudEJyaWRnZSBoYW5kbGVyIGZhY3RvcnlcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFdmVudEJyaWRnZUhhbmRsZXJDb25maWcgZXh0ZW5kcyBCYXNlSGFuZGxlckNvbmZpZyB7XG4gIC8qKlxuICAgKiBDdXN0b20gZXZlbnQgdmFsaWRhdGlvbiBzY2hlbWFcbiAgICovXG4gIGV2ZW50U2NoZW1hPzogei5ab2RTY2hlbWE7XG5cbiAgLyoqXG4gICAqIEN1c3RvbSBtaWRkbGV3YXJlIGZ1bmN0aW9uc1xuICAgKi9cbiAgbWlkZGxld2FyZT86IE1pZGRsZXdhcmVGdW5jdGlvbjxFdmVudEJyaWRnZUV2ZW50PHN0cmluZywgYW55Piwgdm9pZD5bXTtcblxuICAvKipcbiAgICogV2hldGhlciB0byBpbnZva2UgYWdlbnQgaGFuZGxlciBkaXJlY3RseSBvciBwdWJsaXNoIHRvIGFub3RoZXIgZXZlbnRcbiAgICovXG4gIGludm9rZUFnZW50PzogYm9vbGVhbjtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFVUSUxJVFkgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIERlZmF1bHQgbG9nZ2VyIGltcGxlbWVudGF0aW9uXG4gKi9cbmNvbnN0IGRlZmF1bHRMb2dnZXIgPSAobGV2ZWw6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBkYXRhPzogYW55KSA9PiB7XG4gIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3QgbG9nRGF0YSA9IGRhdGEgPyBgICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCA6ICcnO1xuICBjb25zb2xlLmxvZyhgWyR7dGltZXN0YW1wfV0gJHtsZXZlbC50b1VwcGVyQ2FzZSgpfTogJHttZXNzYWdlfSR7bG9nRGF0YX1gKTtcbn07XG5cbi8qKlxuICogRGVmYXVsdCBDT1JTIGhlYWRlcnNcbiAqL1xuY29uc3QgZGVmYXVsdENvcnNIZWFkZXJzID0ge1xuICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ1BPU1QsT1BUSU9OUycsXG4gICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG59O1xuXG4vKipcbiAqIEFwcGx5IG1pZGRsZXdhcmUgZnVuY3Rpb25zIGluIHNlcXVlbmNlXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5TWlkZGxld2FyZTxURXZlbnQsIFRSZXN1bHQ+KFxuICBtaWRkbGV3YXJlOiBNaWRkbGV3YXJlRnVuY3Rpb248VEV2ZW50LCBUUmVzdWx0PltdLFxuICBldmVudDogVEV2ZW50LFxuICBjb250ZXh0OiBDb250ZXh0LFxuICBmaW5hbEhhbmRsZXI6ICgpID0+IFByb21pc2U8VFJlc3VsdD5cbik6IFByb21pc2U8VFJlc3VsdD4ge1xuICBsZXQgaW5kZXggPSAwO1xuXG4gIGNvbnN0IG5leHQgPSBhc3luYyAoKTogUHJvbWlzZTxUUmVzdWx0PiA9PiB7XG4gICAgaWYgKGluZGV4ID49IG1pZGRsZXdhcmUubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmluYWxIYW5kbGVyKCk7XG4gICAgfVxuICAgIGNvbnN0IGN1cnJlbnRNaWRkbGV3YXJlID0gbWlkZGxld2FyZVtpbmRleCsrXTtcbiAgICByZXR1cm4gY3VycmVudE1pZGRsZXdhcmUoZXZlbnQsIGNvbnRleHQsIG5leHQpO1xuICB9O1xuXG4gIHJldHVybiBuZXh0KCk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBBUEkgR0FURVdBWSBIQU5ETEVSIEZBQ1RPUllcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogRGVmYXVsdCByZXF1ZXN0IHNjaGVtYSBmb3IgQVBJIEdhdGV3YXkgY2hhdCByZXF1ZXN0c1xuICovXG5jb25zdCBEZWZhdWx0Q2hhdFJlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHRlbmFudElkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIG1lc3NhZ2U6IHouc3RyaW5nKCksXG4gIHVzZXJFbWFpbDogei5zdHJpbmcoKS5lbWFpbCgpLm9wdGlvbmFsKCksXG4gIHVzZXJJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBzZXNzaW9uSWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY29udmVyc2F0aW9uSWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbGVhZElkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIG1ldGFkYXRhOiB6LnJlY29yZCh6LmFueSgpKS5vcHRpb25hbCgpLFxufSk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBBUEkgR2F0ZXdheSBMYW1iZGEgaGFuZGxlciBmb3Igc3luY2hyb25vdXMgY2hhdCByZXF1ZXN0c1xuICogXG4gKiBAcGFyYW0gY29uZmlnIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIGhhbmRsZXJcbiAqIEByZXR1cm5zIExhbWJkYSBoYW5kbGVyIGZ1bmN0aW9uXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBCYXNpYyB1c2FnZVxuICogZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVBcGlHYXRld2F5SGFuZGxlcigpO1xuICogXG4gKiAvLyBXaXRoIGN1c3RvbSBjb25maWd1cmF0aW9uXG4gKiBleHBvcnQgY29uc3QgaGFuZGxlciA9IGNyZWF0ZUFwaUdhdGV3YXlIYW5kbGVyKHtcbiAqICAgdGVuYW50SWQ6ICdteS1jb21wYW55JyxcbiAqICAgY29yczoge1xuICogICAgIGFsbG93T3JpZ2luczogWydodHRwczovL215Y29tcGFueS5jb20nXSxcbiAqICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICogICB9LFxuICogICBtaWRkbGV3YXJlOiBbXG4gKiAgICAgYXN5bmMgKGV2ZW50LCBjb250ZXh0LCBuZXh0KSA9PiB7XG4gKiAgICAgICAvLyBDdXN0b20gYXV0aGVudGljYXRpb25cbiAqICAgICAgIGlmICghZXZlbnQuaGVhZGVycy5hdXRob3JpemF0aW9uKSB7XG4gKiAgICAgICAgIHJldHVybiB7XG4gKiAgICAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICogICAgICAgICAgIGhlYWRlcnM6IGRlZmF1bHRDb3JzSGVhZGVycyxcbiAqICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9KSxcbiAqICAgICAgICAgfTtcbiAqICAgICAgIH1cbiAqICAgICAgIHJldHVybiBuZXh0KCk7XG4gKiAgICAgfSxcbiAqICAgXSxcbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBcGlHYXRld2F5SGFuZGxlcihcbiAgY29uZmlnOiBBcGlHYXRld2F5SGFuZGxlckNvbmZpZyA9IHt9XG4pOiAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50VjIsIGNvbnRleHQ6IENvbnRleHQpID0+IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0VjI+IHtcbiAgXG4gIGNvbnN0IHtcbiAgICB0ZW5hbnRJZDogZGVmYXVsdFRlbmFudElkLFxuICAgIGVudmlyb25tZW50T3ZlcnJpZGVzID0ge30sXG4gICAgZXJyb3JIYW5kbGVyLFxuICAgIGxvZ2dlciA9IGRlZmF1bHRMb2dnZXIsXG4gICAgY29ycyA9IHt9LFxuICAgIHJlcXVlc3RTY2hlbWEgPSBEZWZhdWx0Q2hhdFJlcXVlc3RTY2hlbWEsXG4gICAgbWlkZGxld2FyZSA9IFtdLFxuICAgIHJlc3BvbnNlVHJhbnNmb3JtZXIsXG4gIH0gPSBjb25maWc7XG5cbiAgLy8gQnVpbGQgQ09SUyBoZWFkZXJzXG4gIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBjb3JzLmFsbG93T3JpZ2lucz8uam9pbignLCcpIHx8ICcqJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IGNvcnMuYWxsb3dIZWFkZXJzPy5qb2luKCcsJykgfHwgJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IGNvcnMuYWxsb3dNZXRob2RzPy5qb2luKCcsJykgfHwgJ1BPU1QsT1BUSU9OUycsXG4gICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAuLi4oY29ycy5hbGxvd0NyZWRlbnRpYWxzICYmIHsgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogJ3RydWUnIH0pLFxuICB9O1xuXG4gIGNvbnN0IGNvcmVIYW5kbGVyID0gYXN5bmMgKFxuICAgIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudFYyLFxuICAgIGNvbnRleHQ6IENvbnRleHRcbiAgKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHRWMj4gPT4ge1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlcignaW5mbycsICdBUEkgR2F0ZXdheSBjaGF0IHJlcXVlc3QgcmVjZWl2ZWQnLCB7XG4gICAgICAgIG1ldGhvZDogZXZlbnQucmVxdWVzdENvbnRleHQuaHR0cC5tZXRob2QsXG4gICAgICAgIHBhdGg6IGV2ZW50LnJlcXVlc3RDb250ZXh0Lmh0dHAucGF0aCxcbiAgICAgICAgcmVxdWVzdElkOiBldmVudC5yZXF1ZXN0Q29udGV4dC5yZXF1ZXN0SWQsXG4gICAgICB9KTtcblxuICAgICAgLy8gSGFuZGxlIHByZWZsaWdodCBPUFRJT05TIHJlcXVlc3RcbiAgICAgIGlmIChldmVudC5yZXF1ZXN0Q29udGV4dC5odHRwLm1ldGhvZCA9PT0gJ09QVElPTlMnKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6ICcnLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICAvLyBPbmx5IGFsbG93IFBPU1QgcmVxdWVzdHNcbiAgICAgIGlmIChldmVudC5yZXF1ZXN0Q29udGV4dC5odHRwLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzQ29kZTogNDA1LFxuICAgICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQnLFxuICAgICAgICAgICAgbWVzc2FnZTogJ09ubHkgUE9TVCByZXF1ZXN0cyBhcmUgc3VwcG9ydGVkLicsXG4gICAgICAgICAgfSksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIC8vIFBhcnNlIGFuZCB2YWxpZGF0ZSByZXF1ZXN0IGJvZHlcbiAgICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiAnTWlzc2luZyByZXF1ZXN0IGJvZHknLFxuICAgICAgICAgICAgbWVzc2FnZTogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZC4nLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBsZXQgcmVxdWVzdEJvZHk6IGFueTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZEJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgICByZXF1ZXN0Qm9keSA9IHJlcXVlc3RTY2hlbWEucGFyc2UocGFyc2VkQm9keSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIoJ2Vycm9yJywgJ1JlcXVlc3QgdmFsaWRhdGlvbiBmYWlsZWQnLCB7IGVycm9yIH0pO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGVycm9yOiAnSW52YWxpZCByZXF1ZXN0IGZvcm1hdCcsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIHouWm9kRXJyb3IgXG4gICAgICAgICAgICAgID8gYFZhbGlkYXRpb24gZXJyb3JzOiAke2Vycm9yLmVycm9ycy5tYXAoZSA9PiBgJHtlLnBhdGguam9pbignLicpfTogJHtlLm1lc3NhZ2V9YCkuam9pbignLCAnKX1gXG4gICAgICAgICAgICAgIDogJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICAvLyBMb2FkIGNvbmZpZ3VyYXRpb24gd2l0aCBvdmVycmlkZXNcbiAgICAgIGNvbnN0IG9yaWdpbmFsRW52ID0geyAuLi5wcm9jZXNzLmVudiB9O1xuICAgICAgT2JqZWN0LmFzc2lnbihwcm9jZXNzLmVudiwgZW52aXJvbm1lbnRPdmVycmlkZXMpO1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBydW50aW1lQ29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICAgICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKHJ1bnRpbWVDb25maWcpO1xuXG4gICAgICAgIC8vIEluaXRpYWxpemUgc2VydmljZXNcbiAgICAgICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UocnVudGltZUNvbmZpZyk7XG4gICAgICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UocnVudGltZUNvbmZpZyk7XG4gICAgICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgICAgIC4uLnJ1bnRpbWVDb25maWcsXG4gICAgICAgICAgZHluYW1vU2VydmljZSxcbiAgICAgICAgICBldmVudEJyaWRnZVNlcnZpY2UsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIERldGVybWluZSB0ZW5hbnQgSUQgYW5kIGVtYWlsXG4gICAgICAgIGNvbnN0IHRlbmFudElkID0gcmVxdWVzdEJvZHkudGVuYW50SWQgfHwgZGVmYXVsdFRlbmFudElkO1xuICAgICAgICBpZiAoIXRlbmFudElkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0ZW5hbnRJZCBpcyByZXF1aXJlZCAoaW4gcmVxdWVzdCBib2R5IG9yIGhhbmRsZXIgY29uZmlnKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGVtYWlsTGM6IHN0cmluZztcbiAgICAgICAgaWYgKHJlcXVlc3RCb2R5LnVzZXJFbWFpbCkge1xuICAgICAgICAgIGVtYWlsTGMgPSByZXF1ZXN0Qm9keS51c2VyRW1haWwudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0Qm9keS51c2VySWQpIHtcbiAgICAgICAgICBlbWFpbExjID0gYCR7cmVxdWVzdEJvZHkudXNlcklkfUBhbm9ueW1vdXMuY2hhdGA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxdWVzdEJvZHkuc2Vzc2lvbklkIHx8IGBzZXNzXyR7RGF0ZS5ub3coKX1gO1xuICAgICAgICAgIGVtYWlsTGMgPSBgJHtzZXNzaW9uSWR9QGFub255bW91cy5jaGF0YDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbklkID0gcmVxdWVzdEJvZHkuY29udmVyc2F0aW9uSWQgfHwgYGNvbnZfJHtEYXRlLm5vdygpfV8ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA5KX1gO1xuXG4gICAgICAgIC8vIFN0b3JlIGluYm91bmQgbWVzc2FnZVxuICAgICAgICBjb25zdCBpbmJvdW5kTWVzc2FnZSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XG4gICAgICAgICAgdGVuYW50SWQsXG4gICAgICAgICAgZW1haWxfbGM6IGVtYWlsTGMsXG4gICAgICAgICAgbGVhZF9pZDogcmVxdWVzdEJvZHkubGVhZElkLFxuICAgICAgICAgIHNvdXJjZTogJ2NoYXQnLFxuICAgICAgICAgIGRpcmVjdGlvbjogJ2luYm91bmQnLFxuICAgICAgICAgIHRleHQ6IHJlcXVlc3RCb2R5Lm1lc3NhZ2UsXG4gICAgICAgICAgY29udmVyc2F0aW9uX2lkOiBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgICBjaGFubmVsX2NvbnRleHQ6IHtcbiAgICAgICAgICAgIGNoYXQ6IHtcbiAgICAgICAgICAgICAgc2Vzc2lvbklkOiByZXF1ZXN0Qm9keS5zZXNzaW9uSWQgfHwgYHNlc3NfJHtEYXRlLm5vdygpfWAsXG4gICAgICAgICAgICAgIGNsaWVudElkOiAnYXBpX2dhdGV3YXknLFxuICAgICAgICAgICAgICB1c2VyQWdlbnQ6IGV2ZW50LmhlYWRlcnNbJ3VzZXItYWdlbnQnXSB8fCAndW5rbm93bicsXG4gICAgICAgICAgICAgIGlwQWRkcmVzczogZXZlbnQucmVxdWVzdENvbnRleHQuaHR0cC5zb3VyY2VJcCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBtZXRhOiB7XG4gICAgICAgICAgICBhcGlfZ2F0ZXdheV9yZXF1ZXN0X2lkOiBldmVudC5yZXF1ZXN0Q29udGV4dC5yZXF1ZXN0SWQsXG4gICAgICAgICAgICByZWNlaXZlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgbWV0YWRhdGE6IHJlcXVlc3RCb2R5Lm1ldGFkYXRhLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxvZ2dlcignaW5mbycsICdTdG9yZWQgaW5ib3VuZCBtZXNzYWdlJywge1xuICAgICAgICAgIG1lc3NhZ2VJZDogYCR7aW5ib3VuZE1lc3NhZ2UuY29udGFjdF9wa30vJHtpbmJvdW5kTWVzc2FnZS50c31gLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBQcm9jZXNzIHdpdGggYWdlbnQgc2VydmljZVxuICAgICAgICBjb25zdCBzdHJ1Y3R1cmVkUmVzcG9uc2UgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2VTdHJ1Y3R1cmVkKHtcbiAgICAgICAgICB0ZW5hbnRJZCxcbiAgICAgICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgICAgICB0ZXh0OiByZXF1ZXN0Qm9keS5tZXNzYWdlLFxuICAgICAgICAgIHNvdXJjZTogJ2NoYXQnLFxuICAgICAgICAgIGNoYW5uZWxfY29udGV4dDoge1xuICAgICAgICAgICAgY2hhdDoge1xuICAgICAgICAgICAgICBzZXNzaW9uSWQ6IHJlcXVlc3RCb2R5LnNlc3Npb25JZCB8fCBgc2Vzc18ke0RhdGUubm93KCl9YCxcbiAgICAgICAgICAgICAgY2xpZW50SWQ6ICdhcGlfZ2F0ZXdheScsXG4gICAgICAgICAgICAgIHVzZXJBZ2VudDogZXZlbnQuaGVhZGVyc1sndXNlci1hZ2VudCddIHx8ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgaXBBZGRyZXNzOiBldmVudC5yZXF1ZXN0Q29udGV4dC5odHRwLnNvdXJjZUlwLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGxlYWRfaWQ6IHJlcXVlc3RCb2R5LmxlYWRJZCxcbiAgICAgICAgICBjb252ZXJzYXRpb25faWQ6IGNvbnZlcnNhdGlvbklkLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBTdG9yZSBvdXRib3VuZCBtZXNzYWdlXG4gICAgICAgIGNvbnN0IG91dGJvdW5kTWVzc2FnZSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XG4gICAgICAgICAgdGVuYW50SWQsXG4gICAgICAgICAgZW1haWxfbGM6IGVtYWlsTGMsXG4gICAgICAgICAgbGVhZF9pZDogcmVxdWVzdEJvZHkubGVhZElkLFxuICAgICAgICAgIHNvdXJjZTogJ2FnZW50JyxcbiAgICAgICAgICBkaXJlY3Rpb246ICdvdXRib3VuZCcsXG4gICAgICAgICAgdGV4dDogc3RydWN0dXJlZFJlc3BvbnNlLm1lc3NhZ2UsXG4gICAgICAgICAgY29udmVyc2F0aW9uX2lkOiBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgICBtZXRhOiB7XG4gICAgICAgICAgICBtb2RlbDogcnVudGltZUNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgICAgIHRyaWdnZXJlZF9ieV9tZXNzYWdlOiBpbmJvdW5kTWVzc2FnZS50cyxcbiAgICAgICAgICAgIHByb2Nlc3NlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgaW50ZW50OiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LFxuICAgICAgICAgICAgcHJvY2Vzc2luZ190aW1lX21zOiBzdHJ1Y3R1cmVkUmVzcG9uc2UubWV0YWRhdGEucHJvY2Vzc2luZ1RpbWVNcyxcbiAgICAgICAgICAgIGFwaV9nYXRld2F5X3JlcXVlc3RfaWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0LnJlcXVlc3RJZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBsb2dnZXIoJ2luZm8nLCAnU3RvcmVkIG91dGJvdW5kIG1lc3NhZ2UnLCB7XG4gICAgICAgICAgbWVzc2FnZUlkOiBgJHtvdXRib3VuZE1lc3NhZ2UuY29udGFjdF9wa30vJHtvdXRib3VuZE1lc3NhZ2UudHN9YCxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gTG9nIGludGVudCBkZXRlY3Rpb25cbiAgICAgICAgaWYgKHN0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQpIHtcbiAgICAgICAgICBsb2dnZXIoJ2luZm8nLCBg8J+OryBJbnRlbnQgZGV0ZWN0ZWQ6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5pZH0gKGNvbmZpZGVuY2U6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5jb25maWRlbmNlfSlgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByZXBhcmUgcmVzcG9uc2VcbiAgICAgICAgY29uc3QgY2hhdFJlc3BvbnNlID0ge1xuICAgICAgICAgIC4uLnN0cnVjdHVyZWRSZXNwb25zZSxcbiAgICAgICAgICBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgICBzZXNzaW9uSWQ6IHJlcXVlc3RCb2R5LnNlc3Npb25JZCxcbiAgICAgICAgfTtcbiAgICAgICAgY2hhdFJlc3BvbnNlLm1ldGFkYXRhLnRvdGFsUHJvY2Vzc2luZ1RpbWVNcyA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgLy8gVXNlIGN1c3RvbSByZXNwb25zZSB0cmFuc2Zvcm1lciBpZiBwcm92aWRlZFxuICAgICAgICBpZiAocmVzcG9uc2VUcmFuc2Zvcm1lcikge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZVRyYW5zZm9ybWVyKGNoYXRSZXNwb25zZSwgZXZlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGVmYXVsdCByZXNwb25zZVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShjaGF0UmVzcG9uc2UpLFxuICAgICAgICB9O1xuXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICAvLyBSZXN0b3JlIG9yaWdpbmFsIGVudmlyb25tZW50XG4gICAgICAgIHByb2Nlc3MuZW52ID0gb3JpZ2luYWxFbnY7XG4gICAgICB9XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyKCdlcnJvcicsICdBUEkgR2F0ZXdheSBoYW5kbGVyIGVycm9yJywgeyBlcnJvciB9KTtcblxuICAgICAgaWYgKGVycm9ySGFuZGxlcikge1xuICAgICAgICByZXR1cm4gZXJyb3JIYW5kbGVyKGVycm9yIGFzIEVycm9yLCBldmVudCwgY29udGV4dCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICAgICAgbWVzc2FnZTogJ0FuIGVycm9yIG9jY3VycmVkIHdoaWxlIHByb2Nlc3NpbmcgeW91ciBtZXNzYWdlLicsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIHByb2Nlc3NpbmdUaW1lTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgICAgICByZXF1ZXN0SWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0LnJlcXVlc3RJZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybiBoYW5kbGVyIHdpdGggbWlkZGxld2FyZSBzdXBwb3J0XG4gIHJldHVybiBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50VjIsIGNvbnRleHQ6IENvbnRleHQpID0+IHtcbiAgICBpZiAobWlkZGxld2FyZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBjb3JlSGFuZGxlcihldmVudCwgY29udGV4dCk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBhcHBseU1pZGRsZXdhcmUobWlkZGxld2FyZSwgZXZlbnQsIGNvbnRleHQsICgpID0+IGNvcmVIYW5kbGVyKGV2ZW50LCBjb250ZXh0KSk7XG4gIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBFVkVOVEJSSURHRSBIQU5ETEVSIEZBQ1RPUllcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBFdmVudEJyaWRnZSBMYW1iZGEgaGFuZGxlciBmb3IgYXN5bmNocm9ub3VzIG1lc3NhZ2UgcHJvY2Vzc2luZ1xuICogXG4gKiBAcGFyYW0gY29uZmlnIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIGhhbmRsZXJcbiAqIEByZXR1cm5zIExhbWJkYSBoYW5kbGVyIGZ1bmN0aW9uXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBCYXNpYyB1c2FnZVxuICogZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVFdmVudEJyaWRnZUhhbmRsZXIoKTtcbiAqIFxuICogLy8gV2l0aCBjdXN0b20gY29uZmlndXJhdGlvblxuICogZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVFdmVudEJyaWRnZUhhbmRsZXIoe1xuICogICBtaWRkbGV3YXJlOiBbXG4gKiAgICAgYXN5bmMgKGV2ZW50LCBjb250ZXh0LCBuZXh0KSA9PiB7XG4gKiAgICAgICAvLyBDdXN0b20gcHJlcHJvY2Vzc2luZ1xuICogICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgZXZlbnQ6JywgZXZlbnQuc291cmNlKTtcbiAqICAgICAgIHJldHVybiBuZXh0KCk7XG4gKiAgICAgfSxcbiAqICAgXSxcbiAqICAgaW52b2tlQWdlbnQ6IHRydWUsIC8vIERpcmVjdGx5IGludm9rZSBhZ2VudCBwcm9jZXNzaW5nXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRXZlbnRCcmlkZ2VIYW5kbGVyKFxuICBjb25maWc6IEV2ZW50QnJpZGdlSGFuZGxlckNvbmZpZyA9IHt9XG4pOiAoZXZlbnQ6IEV2ZW50QnJpZGdlRXZlbnQ8c3RyaW5nLCBhbnk+LCBjb250ZXh0OiBDb250ZXh0KSA9PiBQcm9taXNlPHZvaWQ+IHtcbiAgXG4gIGNvbnN0IHtcbiAgICB0ZW5hbnRJZDogZGVmYXVsdFRlbmFudElkLFxuICAgIGVudmlyb25tZW50T3ZlcnJpZGVzID0ge30sXG4gICAgZXJyb3JIYW5kbGVyLFxuICAgIGxvZ2dlciA9IGRlZmF1bHRMb2dnZXIsXG4gICAgZXZlbnRTY2hlbWEsXG4gICAgbWlkZGxld2FyZSA9IFtdLFxuICAgIGludm9rZUFnZW50ID0gdHJ1ZSxcbiAgfSA9IGNvbmZpZztcblxuICBjb25zdCBjb3JlSGFuZGxlciA9IGFzeW5jIChcbiAgICBldmVudDogRXZlbnRCcmlkZ2VFdmVudDxzdHJpbmcsIGFueT4sXG4gICAgY29udGV4dDogQ29udGV4dFxuICApOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICB0cnkge1xuICAgICAgbG9nZ2VyKCdpbmZvJywgJ0V2ZW50QnJpZGdlIGV2ZW50IHJlY2VpdmVkJywge1xuICAgICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgICAgZGV0YWlsVHlwZTogZXZlbnRbJ2RldGFpbC10eXBlJ10sXG4gICAgICB9KTtcblxuICAgICAgLy8gVmFsaWRhdGUgZXZlbnQgaWYgc2NoZW1hIHByb3ZpZGVkXG4gICAgICBpZiAoZXZlbnRTY2hlbWEpIHtcbiAgICAgICAgZXZlbnRTY2hlbWEucGFyc2UoZXZlbnQpO1xuICAgICAgfVxuXG4gICAgICAvLyBMb2FkIGNvbmZpZ3VyYXRpb24gd2l0aCBvdmVycmlkZXNcbiAgICAgIGNvbnN0IG9yaWdpbmFsRW52ID0geyAuLi5wcm9jZXNzLmVudiB9O1xuICAgICAgT2JqZWN0LmFzc2lnbihwcm9jZXNzLmVudiwgZW52aXJvbm1lbnRPdmVycmlkZXMpO1xuICAgICAgXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBydW50aW1lQ29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICAgICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKHJ1bnRpbWVDb25maWcpO1xuXG4gICAgICAgIC8vIEluaXRpYWxpemUgc2VydmljZXNcbiAgICAgICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UocnVudGltZUNvbmZpZyk7XG4gICAgICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UocnVudGltZUNvbmZpZyk7XG5cbiAgICAgICAgLy8gUHJvY2VzcyBiYXNlZCBvbiBldmVudCB0eXBlXG4gICAgICAgIGlmIChldmVudC5zb3VyY2UgPT09ICdreGdlbi5tZXNzYWdpbmcnICYmIGV2ZW50WydkZXRhaWwtdHlwZSddID09PSAnbGVhZC5tZXNzYWdlLmNyZWF0ZWQnKSB7XG4gICAgICAgICAgY29uc3QgZGV0YWlsID0gZXZlbnQuZGV0YWlsIGFzIEluYm91bmRNZXNzYWdlRXZlbnRbJ2RldGFpbCddO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIFJlc29sdmUgY29udGFjdCBpbmZvcm1hdGlvblxuICAgICAgICAgIGxldCBlbWFpbExjID0gZGV0YWlsLmVtYWlsX2xjO1xuICAgICAgICAgIGxldCBsZWFkSWQgPSBkZXRhaWwubGVhZF9pZDtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIWVtYWlsTGMgJiYgZGV0YWlsLnBob25lX2UxNjQpIHtcbiAgICAgICAgICAgIGxvZ2dlcignaW5mbycsIGBSZXNvbHZpbmcgY29udGFjdCBmcm9tIHBob25lOiAke2RldGFpbC5waG9uZV9lMTY0fWApO1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWRFbWFpbExjID0gYXdhaXQgZHluYW1vU2VydmljZS5yZXNvbHZlQ29udGFjdEZyb21QaG9uZShkZXRhaWwudGVuYW50SWQsIGRldGFpbC5waG9uZV9lMTY0KTtcbiAgICAgICAgICAgIGVtYWlsTGMgPSByZXNvbHZlZEVtYWlsTGMgfHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWVtYWlsTGMpIHtcbiAgICAgICAgICAgICAgbG9nZ2VyKCdlcnJvcicsIGBDb3VsZCBub3QgcmVzb2x2ZSBjb250YWN0IGZvciBwaG9uZTogJHtkZXRhaWwucGhvbmVfZTE2NH1gKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBsZWFkID0gYXdhaXQgZHluYW1vU2VydmljZS5nZXRMZWFkKGRldGFpbC50ZW5hbnRJZCwgZW1haWxMYyk7XG4gICAgICAgICAgICBsZWFkSWQgPSBsZWFkPy5sZWFkX2lkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIWVtYWlsTGMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGRldGVybWluZSBlbWFpbF9sYyBmb3IgY29udGFjdCcpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBTdG9yZSBpbmJvdW5kIG1lc3NhZ2VcbiAgICAgICAgICBjb25zdCBtZXNzYWdlSXRlbSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XG4gICAgICAgICAgICB0ZW5hbnRJZDogZGV0YWlsLnRlbmFudElkLFxuICAgICAgICAgICAgZW1haWxfbGM6IGVtYWlsTGMsXG4gICAgICAgICAgICBsZWFkX2lkOiBsZWFkSWQsXG4gICAgICAgICAgICBzb3VyY2U6IGRldGFpbC5zb3VyY2UsXG4gICAgICAgICAgICBkaXJlY3Rpb246ICdpbmJvdW5kJyxcbiAgICAgICAgICAgIHRleHQ6IGRldGFpbC50ZXh0LFxuICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBkZXRhaWwuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICAgICAgbWV0YToge1xuICAgICAgICAgICAgICBwcm92aWRlcjogZGV0YWlsLnByb3ZpZGVyLFxuICAgICAgICAgICAgICB0aW1lc3RhbXBzOiBkZXRhaWwudGltZXN0YW1wcyxcbiAgICAgICAgICAgICAgcm91dGVyX3Byb2Nlc3NlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBcbiAgICAgICAgICBsb2dnZXIoJ2luZm8nLCBgU3RvcmVkIGluYm91bmQgbWVzc2FnZTogJHttZXNzYWdlSXRlbS5jb250YWN0X3BrfS8ke21lc3NhZ2VJdGVtLnRzfWApO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIEludm9rZSBhZ2VudCBpZiByZXF1ZXN0ZWRcbiAgICAgICAgICBpZiAoaW52b2tlQWdlbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgICAgICAgICAuLi5ydW50aW1lQ29uZmlnLFxuICAgICAgICAgICAgICBkeW5hbW9TZXJ2aWNlLFxuICAgICAgICAgICAgICBldmVudEJyaWRnZVNlcnZpY2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2Uoe1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogZGV0YWlsLnRlbmFudElkLFxuICAgICAgICAgICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgICAgICAgICAgdGV4dDogZGV0YWlsLnRleHQsXG4gICAgICAgICAgICAgIHNvdXJjZTogZGV0YWlsLnNvdXJjZSxcbiAgICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBkZXRhaWwuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICAgICAgICBsZWFkX2lkOiBsZWFkSWQsXG4gICAgICAgICAgICAgIGNvbnZlcnNhdGlvbl9pZDogZGV0YWlsLmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBsb2dnZXIoJ2luZm8nLCBgR2VuZXJhdGVkIHJlc3BvbnNlOiAke3Jlc3BvbnNlLnN1YnN0cmluZygwLCAxMDApfS4uLmApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBTdG9yZSBhbmQgcHVibGlzaCByZXNwb25zZVxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2VNZXNzYWdlID0gYXdhaXQgZHluYW1vU2VydmljZS5wdXRNZXNzYWdlKHtcbiAgICAgICAgICAgICAgdGVuYW50SWQ6IGRldGFpbC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgZW1haWxfbGM6IGVtYWlsTGMsXG4gICAgICAgICAgICAgIGxlYWRfaWQ6IGxlYWRJZCxcbiAgICAgICAgICAgICAgc291cmNlOiAnYWdlbnQnLFxuICAgICAgICAgICAgICBkaXJlY3Rpb246ICdvdXRib3VuZCcsXG4gICAgICAgICAgICAgIHRleHQ6IHJlc3BvbnNlLFxuICAgICAgICAgICAgICBjb252ZXJzYXRpb25faWQ6IGRldGFpbC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgIG1ldGE6IHtcbiAgICAgICAgICAgICAgICBtb2RlbDogcnVudGltZUNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgICAgICAgICB0cmlnZ2VyZWRfYnlfbWVzc2FnZTogbWVzc2FnZUl0ZW0udHMsXG4gICAgICAgICAgICAgICAgcHJvY2Vzc2VkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gUHVibGlzaCBhZ2VudCByZXBseSBldmVudFxuICAgICAgICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudFJlcGx5KFxuICAgICAgICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRSZXBseUV2ZW50KFxuICAgICAgICAgICAgICAgIGRldGFpbC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgICBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGRldGFpbC50ZW5hbnRJZCwgZW1haWxMYyksXG4gICAgICAgICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgICAgICAgZGV0YWlsLnNvdXJjZSBhcyBhbnksXG4gICAgICAgICAgICAgICAgYWdlbnRTZXJ2aWNlLmNyZWF0ZVJvdXRpbmdJbmZvKHtcbiAgICAgICAgICAgICAgICAgIHRlbmFudElkOiBkZXRhaWwudGVuYW50SWQsXG4gICAgICAgICAgICAgICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgICAgICAgICAgICAgIHRleHQ6IGRldGFpbC50ZXh0LFxuICAgICAgICAgICAgICAgICAgc291cmNlOiBkZXRhaWwuc291cmNlLFxuICAgICAgICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBkZXRhaWwuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICAgICAgICAgICAgbGVhZF9pZDogbGVhZElkLFxuICAgICAgICAgICAgICAgICAgY29udmVyc2F0aW9uX2lkOiBkZXRhaWwuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgIH0sIGRldGFpbC5zb3VyY2UpLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbklkOiBkZXRhaWwuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgbW9kZWw6IHJ1bnRpbWVDb25maWcuYmVkcm9ja01vZGVsSWQsXG4gICAgICAgICAgICAgICAgICAgIHRyaWdnZXJlZF9ieV9tZXNzYWdlOiBtZXNzYWdlSXRlbS50cyxcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VfbWVzc2FnZV90czogcmVzcG9uc2VNZXNzYWdlLnRzLFxuICAgICAgICAgICAgICAgICAgICBsZWFkX2lkOiBsZWFkSWQsXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgLy8gUmVzdG9yZSBvcmlnaW5hbCBlbnZpcm9ubWVudFxuICAgICAgICBwcm9jZXNzLmVudiA9IG9yaWdpbmFsRW52O1xuICAgICAgfVxuXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlcignZXJyb3InLCAnRXZlbnRCcmlkZ2UgaGFuZGxlciBlcnJvcicsIHsgZXJyb3IgfSk7XG5cbiAgICAgIGlmIChlcnJvckhhbmRsZXIpIHtcbiAgICAgICAgYXdhaXQgZXJyb3JIYW5kbGVyKGVycm9yIGFzIEVycm9yLCBldmVudCwgY29udGV4dCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybiBoYW5kbGVyIHdpdGggbWlkZGxld2FyZSBzdXBwb3J0XG4gIHJldHVybiBhc3luYyAoZXZlbnQ6IEV2ZW50QnJpZGdlRXZlbnQ8c3RyaW5nLCBhbnk+LCBjb250ZXh0OiBDb250ZXh0KSA9PiB7XG4gICAgaWYgKG1pZGRsZXdhcmUubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gY29yZUhhbmRsZXIoZXZlbnQsIGNvbnRleHQpO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gYXBwbHlNaWRkbGV3YXJlKG1pZGRsZXdhcmUsIGV2ZW50LCBjb250ZXh0LCAoKSA9PiBjb3JlSGFuZGxlcihldmVudCwgY29udGV4dCkpO1xuICB9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSEVBTFRIIENIRUNLIEhBTkRMRVIgRkFDVE9SWVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBDcmVhdGVzIGEgc2ltcGxlIGhlYWx0aCBjaGVjayBoYW5kbGVyXG4gKiBcbiAqIEBwYXJhbSBjb25maWcgQmFzaWMgY29uZmlndXJhdGlvblxuICogQHJldHVybnMgSGVhbHRoIGNoZWNrIGhhbmRsZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUhlYWx0aENoZWNrSGFuZGxlcihcbiAgY29uZmlnOiB7IHZlcnNpb24/OiBzdHJpbmc7IHNlcnZpY2VOYW1lPzogc3RyaW5nIH0gPSB7fVxuKTogKGV2ZW50OiBhbnksIGNvbnRleHQ6IENvbnRleHQpID0+IFByb21pc2U8YW55PiB7XG4gIFxuICBjb25zdCB7IHZlcnNpb24gPSAnMS4wLjAnLCBzZXJ2aWNlTmFtZSA9ICdreGdlbi1sYW5nY2hhaW4tYWdlbnQnIH0gPSBjb25maWc7XG4gIFxuICByZXR1cm4gYXN5bmMgKGV2ZW50OiBhbnksIGNvbnRleHQ6IENvbnRleHQpID0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IHtcbiAgICAgIHN0YXR1czogJ2hlYWx0aHknLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB2ZXJzaW9uLFxuICAgICAgc2VydmljZTogc2VydmljZU5hbWUsXG4gICAgICByZXF1ZXN0SWQ6IGNvbnRleHQuYXdzUmVxdWVzdElkLFxuICAgIH07XG5cbiAgICAvLyBGb3IgQVBJIEdhdGV3YXlcbiAgICBpZiAoZXZlbnQucmVxdWVzdENvbnRleHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBGb3Igb3RoZXIgdHJpZ2dlcnNcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH07XG59XG4iXX0=