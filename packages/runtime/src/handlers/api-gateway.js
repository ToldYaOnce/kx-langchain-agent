import { DynamoDBService } from '../lib/dynamodb.js';
import { EventBridgeService } from '../lib/eventbridge.js';
import { AgentService } from '../lib/agent.js';
import { loadRuntimeConfig, validateRuntimeConfig } from '../lib/config.js';
import { z } from 'zod';
/**
 * Request body schema for API Gateway chat requests
 */
const ChatRequestSchema = z.object({
    tenantId: z.string(),
    message: z.string(),
    userEmail: z.string().email().optional(),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    conversationId: z.string().optional(),
    leadId: z.string().optional(),
    metadata: z.record(z.any()).optional(),
});
/**
 * Lambda handler for API Gateway V2 (HTTP API) chat requests
 *
 * **Usage:**
 * ```
 * POST /chat
 * {
 *   "tenantId": "company123",
 *   "message": "Hi, I want to learn about boxing classes",
 *   "userEmail": "john.doe@example.com",
 *   "sessionId": "sess_abc123",
 *   "conversationId": "conv_xyz789",
 *   "metadata": { "source": "website_widget" }
 * }
 * ```
 *
 * **Response:**
 * ```
 * {
 *   "success": true,
 *   "message": "Hey champ! I'd love to help you get started with boxing! [boxing_glove]",
 *   "intent": {
 *     "id": "general_inquiry",
 *     "confidence": 0.85,
 *     "category": "information_request"
 *   },
 *   "metadata": {
 *     "processingTimeMs": 1250,
 *     "model": "anthropic.claude-3-sonnet-20240229-v1:0"
 *   },
 *   "conversationId": "conv_xyz789",
 *   "sessionId": "sess_abc123"
 * }
 * ```
 */
export async function handler(event, context) {
    console.log('API Gateway chat request:', JSON.stringify(event, null, 2));
    const startTime = Date.now();
    try {
        // CORS headers for browser requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Content-Type': 'application/json',
        };
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
                    error: 'Method not allowed. Use POST.',
                    message: 'Only POST requests are supported for chat.',
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
                    message: 'Request body is required for chat messages.',
                }),
            };
        }
        let requestBody;
        try {
            const parsedBody = JSON.parse(event.body);
            requestBody = ChatRequestSchema.parse(parsedBody);
        }
        catch (error) {
            console.error('Request validation error:', error);
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
        // Load and validate configuration
        const config = loadRuntimeConfig();
        validateRuntimeConfig(config);
        // Initialize services
        const dynamoService = new DynamoDBService(config);
        const eventBridgeService = new EventBridgeService(config);
        // Create agent service
        const agentService = new AgentService({
            ...config,
            dynamoService,
            eventBridgeService,
        });
        // Determine email_lc for contact resolution
        let emailLc;
        if (requestBody.userEmail) {
            emailLc = requestBody.userEmail.toLowerCase();
        }
        else if (requestBody.userId) {
            // If no email provided, use userId as email_lc (for anonymous chat)
            emailLc = `${requestBody.userId}@anonymous.chat`;
        }
        else {
            // Generate anonymous email from session
            const sessionId = requestBody.sessionId || `sess_${Date.now()}`;
            emailLc = `${sessionId}@anonymous.chat`;
        }
        // Generate conversation ID if not provided
        const conversationId = requestBody.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Store inbound message in DynamoDB
        const inboundMessage = await dynamoService.putMessage({
            tenantId: requestBody.tenantId,
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
        console.log(`Stored inbound chat message: ${inboundMessage.contact_pk}/${inboundMessage.ts}`);
        // Process message with agent service and get structured response
        const structuredResponse = await agentService.processMessageStructured({
            tenantId: requestBody.tenantId,
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
        // Store outbound message in DynamoDB
        const outboundMessage = await dynamoService.putMessage({
            tenantId: requestBody.tenantId,
            email_lc: emailLc,
            lead_id: requestBody.leadId,
            source: 'agent',
            direction: 'outbound',
            text: structuredResponse.message,
            conversation_id: conversationId,
            meta: {
                model: config.bedrockModelId,
                triggered_by_message: inboundMessage.ts,
                processed_at: new Date().toISOString(),
                intent: structuredResponse.intent,
                processing_time_ms: structuredResponse.metadata.processingTimeMs,
                api_gateway_request_id: event.requestContext.requestId,
            },
        });
        console.log(`Stored outbound chat response: ${outboundMessage.contact_pk}/${outboundMessage.ts}`);
        // Log intent detection for monitoring
        if (structuredResponse.intent) {
            console.log(`\x1b[31m🎯 Intent detected: ${structuredResponse.intent.id} (confidence: ${structuredResponse.intent.confidence})\x1b[0m`);
        }
        // Prepare response with additional chat-specific fields
        const chatResponse = {
            ...structuredResponse,
            conversationId,
            sessionId: requestBody.sessionId,
        };
        // Add total processing time to metadata
        chatResponse.metadata.totalProcessingTimeMs = Date.now() - startTime;
        // Optionally publish event for analytics/webhooks (async, don't wait)
        eventBridgeService.publishAgentReply(EventBridgeService.createAgentReplyEvent(requestBody.tenantId, DynamoDBService.createContactPK(requestBody.tenantId, emailLc), structuredResponse.message, 'chat', {
            chat: { sessionId: requestBody.sessionId || `sess_${Date.now()}` },
        }, {
            conversationId,
            metadata: {
                model: config.bedrockModelId,
                triggered_by_message: inboundMessage.ts,
                response_message_ts: outboundMessage.ts,
                lead_id: requestBody.leadId,
                api_gateway_request_id: event.requestContext.requestId,
                intent: structuredResponse.intent,
            },
        })).catch(error => {
            // Log but don't fail the request
            console.warn('Failed to publish agent reply event:', error);
        });
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(chatResponse),
        };
    }
    catch (error) {
        console.error('API Gateway chat error:', error);
        const errorResponse = {
            success: false,
            error: 'Internal server error',
            message: 'An error occurred while processing your message. Please try again.',
            metadata: {
                processingTimeMs: Date.now() - startTime,
                requestId: event.requestContext.requestId,
            },
        };
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(errorResponse),
        };
    }
}
/**
 * Health check handler for API Gateway
 */
export async function healthHandler(event, context) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            service: 'kxgen-langchain-agent-api',
        }),
    };
}
//# sourceMappingURL=api-gateway.js.map