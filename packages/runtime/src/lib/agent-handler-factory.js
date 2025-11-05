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
import { DynamoDBService } from './dynamodb.js';
import { EventBridgeService } from './eventbridge.js';
import { AgentService } from './agent.js';
import { loadRuntimeConfig, validateRuntimeConfig } from './config.js';
import { z } from 'zod';
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
const DefaultChatRequestSchema = z.object({
    tenantId: z.string().optional(),
    message: z.string(),
    userEmail: z.string().email().optional(),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    conversationId: z.string().optional(),
    leadId: z.string().optional(),
    metadata: z.record(z.any()).optional(),
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
export function createApiGatewayHandler(config = {}) {
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
                        message: error instanceof z.ZodError
                            ? `Validation errors: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                            : 'Invalid JSON in request body',
                    }),
                };
            }
            // Load configuration with overrides
            const originalEnv = { ...process.env };
            Object.assign(process.env, environmentOverrides);
            try {
                const runtimeConfig = loadRuntimeConfig();
                validateRuntimeConfig(runtimeConfig);
                // Initialize services
                const dynamoService = new DynamoDBService(runtimeConfig);
                const eventBridgeService = new EventBridgeService(runtimeConfig);
                const agentService = new AgentService({
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
export function createEventBridgeHandler(config = {}) {
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
                const runtimeConfig = loadRuntimeConfig();
                validateRuntimeConfig(runtimeConfig);
                // Initialize services
                const dynamoService = new DynamoDBService(runtimeConfig);
                const eventBridgeService = new EventBridgeService(runtimeConfig);
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
                        const agentService = new AgentService({
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
                        await eventBridgeService.publishAgentReply(EventBridgeService.createAgentReplyEvent(detail.tenantId, DynamoDBService.createContactPK(detail.tenantId, emailLc), response, detail.source, agentService.createRoutingInfo({
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
export function createHealthCheckHandler(config = {}) {
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
//# sourceMappingURL=agent-handler-factory.js.map