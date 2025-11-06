"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
exports.healthHandler = healthHandler;
const dynamodb_js_1 = require("../lib/dynamodb.js");
const eventbridge_js_1 = require("../lib/eventbridge.js");
const agent_js_1 = require("../lib/agent.js");
const config_js_1 = require("../lib/config.js");
const zod_1 = require("zod");
/**
 * Request body schema for API Gateway chat requests
 */
const ChatRequestSchema = zod_1.z.object({
    tenantId: zod_1.z.string(),
    message: zod_1.z.string(),
    userEmail: zod_1.z.string().email().optional(),
    userId: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    conversationId: zod_1.z.string().optional(),
    leadId: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
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
async function handler(event, context) {
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
                    message: error instanceof zod_1.z.ZodError
                        ? `Validation errors: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                        : 'Invalid JSON in request body',
                }),
            };
        }
        // Load and validate configuration
        const config = (0, config_js_1.loadRuntimeConfig)();
        (0, config_js_1.validateRuntimeConfig)(config);
        // Initialize services
        const dynamoService = new dynamodb_js_1.DynamoDBService(config);
        const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
        // Create agent service
        const agentService = new agent_js_1.AgentService({
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
        eventBridgeService.publishAgentReply(eventbridge_js_1.EventBridgeService.createAgentReplyEvent(requestBody.tenantId, dynamodb_js_1.DynamoDBService.createContactPK(requestBody.tenantId, emailLc), structuredResponse.message, 'chat', {
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
async function healthHandler(event, context) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWdhdGV3YXkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaGFuZGxlcnMvYXBpLWdhdGV3YXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFtRUEsMEJBNk9DO0FBS0Qsc0NBaUJDO0FBclVELG9EQUFxRDtBQUNyRCwwREFBMkQ7QUFDM0QsOENBQStDO0FBQy9DLGdEQUE0RTtBQUU1RSw2QkFBd0I7QUFFeEI7O0dBRUc7QUFDSCxNQUFNLGlCQUFpQixHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7SUFDakMsUUFBUSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUU7SUFDcEIsT0FBTyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUU7SUFDbkIsU0FBUyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDeEMsTUFBTSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDN0IsU0FBUyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDaEMsY0FBYyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDckMsTUFBTSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDN0IsUUFBUSxFQUFFLE9BQUMsQ0FBQyxNQUFNLENBQUMsT0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFO0NBQ3ZDLENBQUMsQ0FBQztBQVlIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBa0NHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FDM0IsS0FBNkIsRUFDN0IsT0FBZ0I7SUFFaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUV6RSxNQUFN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LGFBQWEsR0FBRztZQUNwQixPQUFPLEVBQUUsS0FBSztZQUNkLEtBQUssRUFBRSx1QkFBdUI7WUFDOUIsT0FBTyxFQUFFLG9FQUFvRTtZQUM3RSxRQUFRLEVBQUU7Z0JBQ1IsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVM7Z0JBQ3hDLFNBQVMsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLFNBQVM7YUFDMUM7U0FDRixDQUFDO1FBRUYsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLDZCQUE2QixFQUFFLEdBQUc7Z0JBQ2xDLGNBQWMsRUFBRSxrQkFBa0I7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUM7U0FDcEMsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDO0FBRUQ7O0dBRUc7QUFDSSxLQUFLLFVBQVUsYUFBYSxDQUNqQyxLQUE2QixFQUM3QixPQUFnQjtJQUVoQixPQUFPO1FBQ0wsVUFBVSxFQUFFLEdBQUc7UUFDZixPQUFPLEVBQUU7WUFDUCxjQUFjLEVBQUUsa0JBQWtCO1lBQ2xDLDZCQUE2QixFQUFFLEdBQUc7U0FDbkM7UUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNuQixNQUFNLEVBQUUsU0FBUztZQUNqQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksT0FBTztZQUNuRCxPQUFPLEVBQUUsMkJBQTJCO1NBQ3JDLENBQUM7S0FDSCxDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQVBJR2F0ZXdheVByb3h5RXZlbnRWMiwgQVBJR2F0ZXdheVByb3h5UmVzdWx0VjIsIENvbnRleHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4uL2xpYi9keW5hbW9kYi5qcyc7XG5pbXBvcnQgeyBFdmVudEJyaWRnZVNlcnZpY2UgfSBmcm9tICcuLi9saWIvZXZlbnRicmlkZ2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vbGliL2FnZW50LmpzJztcbmltcG9ydCB7IGxvYWRSdW50aW1lQ29uZmlnLCB2YWxpZGF0ZVJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcbmltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuXG4vKipcbiAqIFJlcXVlc3QgYm9keSBzY2hlbWEgZm9yIEFQSSBHYXRld2F5IGNoYXQgcmVxdWVzdHNcbiAqL1xuY29uc3QgQ2hhdFJlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHRlbmFudElkOiB6LnN0cmluZygpLFxuICBtZXNzYWdlOiB6LnN0cmluZygpLFxuICB1c2VyRW1haWw6IHouc3RyaW5nKCkuZW1haWwoKS5vcHRpb25hbCgpLFxuICB1c2VySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgc2Vzc2lvbklkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNvbnZlcnNhdGlvbklkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGxlYWRJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBtZXRhZGF0YTogei5yZWNvcmQoei5hbnkoKSkub3B0aW9uYWwoKSxcbn0pO1xuXG50eXBlIENoYXRSZXF1ZXN0ID0gei5pbmZlcjx0eXBlb2YgQ2hhdFJlcXVlc3RTY2hlbWE+O1xuXG4vKipcbiAqIFJlc3BvbnNlIHN0cnVjdHVyZSBmb3IgQVBJIEdhdGV3YXkgY2hhdCByZXNwb25zZXNcbiAqL1xuaW50ZXJmYWNlIENoYXRSZXNwb25zZSBleHRlbmRzIEFnZW50UmVzcG9uc2Uge1xuICBjb252ZXJzYXRpb25JZD86IHN0cmluZztcbiAgc2Vzc2lvbklkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIExhbWJkYSBoYW5kbGVyIGZvciBBUEkgR2F0ZXdheSBWMiAoSFRUUCBBUEkpIGNoYXQgcmVxdWVzdHNcbiAqIFxuICogKipVc2FnZToqKlxuICogYGBgXG4gKiBQT1NUIC9jaGF0XG4gKiB7XG4gKiAgIFwidGVuYW50SWRcIjogXCJjb21wYW55MTIzXCIsXG4gKiAgIFwibWVzc2FnZVwiOiBcIkhpLCBJIHdhbnQgdG8gbGVhcm4gYWJvdXQgYm94aW5nIGNsYXNzZXNcIixcbiAqICAgXCJ1c2VyRW1haWxcIjogXCJqb2huLmRvZUBleGFtcGxlLmNvbVwiLFxuICogICBcInNlc3Npb25JZFwiOiBcInNlc3NfYWJjMTIzXCIsXG4gKiAgIFwiY29udmVyc2F0aW9uSWRcIjogXCJjb252X3h5ejc4OVwiLFxuICogICBcIm1ldGFkYXRhXCI6IHsgXCJzb3VyY2VcIjogXCJ3ZWJzaXRlX3dpZGdldFwiIH1cbiAqIH1cbiAqIGBgYFxuICogXG4gKiAqKlJlc3BvbnNlOioqXG4gKiBgYGBcbiAqIHtcbiAqICAgXCJzdWNjZXNzXCI6IHRydWUsXG4gKiAgIFwibWVzc2FnZVwiOiBcIkhleSBjaGFtcCEgSSdkIGxvdmUgdG8gaGVscCB5b3UgZ2V0IHN0YXJ0ZWQgd2l0aCBib3hpbmchIFtib3hpbmdfZ2xvdmVdXCIsXG4gKiAgIFwiaW50ZW50XCI6IHtcbiAqICAgICBcImlkXCI6IFwiZ2VuZXJhbF9pbnF1aXJ5XCIsXG4gKiAgICAgXCJjb25maWRlbmNlXCI6IDAuODUsXG4gKiAgICAgXCJjYXRlZ29yeVwiOiBcImluZm9ybWF0aW9uX3JlcXVlc3RcIlxuICogICB9LFxuICogICBcIm1ldGFkYXRhXCI6IHtcbiAqICAgICBcInByb2Nlc3NpbmdUaW1lTXNcIjogMTI1MCxcbiAqICAgICBcIm1vZGVsXCI6IFwiYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0yMDI0MDIyOS12MTowXCJcbiAqICAgfSxcbiAqICAgXCJjb252ZXJzYXRpb25JZFwiOiBcImNvbnZfeHl6Nzg5XCIsXG4gKiAgIFwic2Vzc2lvbklkXCI6IFwic2Vzc19hYmMxMjNcIlxuICogfVxuICogYGBgXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnRWMixcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHRWMj4ge1xuICBjb25zb2xlLmxvZygnQVBJIEdhdGV3YXkgY2hhdCByZXF1ZXN0OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gIFxuICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBDT1JTIGhlYWRlcnMgZm9yIGJyb3dzZXIgcmVxdWVzdHNcbiAgICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdQT1NULE9QVElPTlMnLFxuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICB9O1xuXG4gICAgLy8gSGFuZGxlIHByZWZsaWdodCBPUFRJT05TIHJlcXVlc3RcbiAgICBpZiAoZXZlbnQucmVxdWVzdENvbnRleHQuaHR0cC5tZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogJycsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIE9ubHkgYWxsb3cgUE9TVCByZXF1ZXN0c1xuICAgIGlmIChldmVudC5yZXF1ZXN0Q29udGV4dC5odHRwLm1ldGhvZCAhPT0gJ1BPU1QnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDUsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgZXJyb3I6ICdNZXRob2Qgbm90IGFsbG93ZWQuIFVzZSBQT1NULicsXG4gICAgICAgICAgbWVzc2FnZTogJ09ubHkgUE9TVCByZXF1ZXN0cyBhcmUgc3VwcG9ydGVkIGZvciBjaGF0LicsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSBhbmQgdmFsaWRhdGUgcmVxdWVzdCBib2R5XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIHJlcXVlc3QgYm9keScsXG4gICAgICAgICAgbWVzc2FnZTogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCBmb3IgY2hhdCBtZXNzYWdlcy4nLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgbGV0IHJlcXVlc3RCb2R5OiBDaGF0UmVxdWVzdDtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgICByZXF1ZXN0Qm9keSA9IENoYXRSZXF1ZXN0U2NoZW1hLnBhcnNlKHBhcnNlZEJvZHkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdSZXF1ZXN0IHZhbGlkYXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCByZXF1ZXN0IGZvcm1hdCcsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiB6LlpvZEVycm9yIFxuICAgICAgICAgICAgPyBgVmFsaWRhdGlvbiBlcnJvcnM6ICR7ZXJyb3IuZXJyb3JzLm1hcChlID0+IGAke2UucGF0aC5qb2luKCcuJyl9OiAke2UubWVzc2FnZX1gKS5qb2luKCcsICcpfWBcbiAgICAgICAgICAgIDogJ0ludmFsaWQgSlNPTiBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gTG9hZCBhbmQgdmFsaWRhdGUgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGNvbmZpZyA9IGxvYWRSdW50aW1lQ29uZmlnKCk7XG4gICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKGNvbmZpZyk7XG5cbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG5cbiAgICAvLyBDcmVhdGUgYWdlbnQgc2VydmljZVxuICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgLi4uY29uZmlnLFxuICAgICAgZHluYW1vU2VydmljZSxcbiAgICAgIGV2ZW50QnJpZGdlU2VydmljZSxcbiAgICB9KTtcblxuICAgIC8vIERldGVybWluZSBlbWFpbF9sYyBmb3IgY29udGFjdCByZXNvbHV0aW9uXG4gICAgbGV0IGVtYWlsTGM6IHN0cmluZztcbiAgICBpZiAocmVxdWVzdEJvZHkudXNlckVtYWlsKSB7XG4gICAgICBlbWFpbExjID0gcmVxdWVzdEJvZHkudXNlckVtYWlsLnRvTG93ZXJDYXNlKCk7XG4gICAgfSBlbHNlIGlmIChyZXF1ZXN0Qm9keS51c2VySWQpIHtcbiAgICAgIC8vIElmIG5vIGVtYWlsIHByb3ZpZGVkLCB1c2UgdXNlcklkIGFzIGVtYWlsX2xjIChmb3IgYW5vbnltb3VzIGNoYXQpXG4gICAgICBlbWFpbExjID0gYCR7cmVxdWVzdEJvZHkudXNlcklkfUBhbm9ueW1vdXMuY2hhdGA7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEdlbmVyYXRlIGFub255bW91cyBlbWFpbCBmcm9tIHNlc3Npb25cbiAgICAgIGNvbnN0IHNlc3Npb25JZCA9IHJlcXVlc3RCb2R5LnNlc3Npb25JZCB8fCBgc2Vzc18ke0RhdGUubm93KCl9YDtcbiAgICAgIGVtYWlsTGMgPSBgJHtzZXNzaW9uSWR9QGFub255bW91cy5jaGF0YDtcbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSBjb252ZXJzYXRpb24gSUQgaWYgbm90IHByb3ZpZGVkXG4gICAgY29uc3QgY29udmVyc2F0aW9uSWQgPSByZXF1ZXN0Qm9keS5jb252ZXJzYXRpb25JZCB8fCBgY29udl8ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpfWA7XG5cbiAgICAvLyBTdG9yZSBpbmJvdW5kIG1lc3NhZ2UgaW4gRHluYW1vREJcbiAgICBjb25zdCBpbmJvdW5kTWVzc2FnZSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XG4gICAgICB0ZW5hbnRJZDogcmVxdWVzdEJvZHkudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgIGxlYWRfaWQ6IHJlcXVlc3RCb2R5LmxlYWRJZCxcbiAgICAgIHNvdXJjZTogJ2NoYXQnLFxuICAgICAgZGlyZWN0aW9uOiAnaW5ib3VuZCcsXG4gICAgICB0ZXh0OiByZXF1ZXN0Qm9keS5tZXNzYWdlLFxuICAgICAgY29udmVyc2F0aW9uX2lkOiBjb252ZXJzYXRpb25JZCxcbiAgICAgIGNoYW5uZWxfY29udGV4dDoge1xuICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgc2Vzc2lvbklkOiByZXF1ZXN0Qm9keS5zZXNzaW9uSWQgfHwgYHNlc3NfJHtEYXRlLm5vdygpfWAsXG4gICAgICAgICAgY2xpZW50SWQ6ICdhcGlfZ2F0ZXdheScsXG4gICAgICAgICAgdXNlckFnZW50OiBldmVudC5oZWFkZXJzWyd1c2VyLWFnZW50J10gfHwgJ3Vua25vd24nLFxuICAgICAgICAgIGlwQWRkcmVzczogZXZlbnQucmVxdWVzdENvbnRleHQuaHR0cC5zb3VyY2VJcCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBtZXRhOiB7XG4gICAgICAgIGFwaV9nYXRld2F5X3JlcXVlc3RfaWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0LnJlcXVlc3RJZCxcbiAgICAgICAgcmVjZWl2ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgbWV0YWRhdGE6IHJlcXVlc3RCb2R5Lm1ldGFkYXRhLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKGBTdG9yZWQgaW5ib3VuZCBjaGF0IG1lc3NhZ2U6ICR7aW5ib3VuZE1lc3NhZ2UuY29udGFjdF9wa30vJHtpbmJvdW5kTWVzc2FnZS50c31gKTtcblxuICAgIC8vIFByb2Nlc3MgbWVzc2FnZSB3aXRoIGFnZW50IHNlcnZpY2UgYW5kIGdldCBzdHJ1Y3R1cmVkIHJlc3BvbnNlXG4gICAgY29uc3Qgc3RydWN0dXJlZFJlc3BvbnNlID0gYXdhaXQgYWdlbnRTZXJ2aWNlLnByb2Nlc3NNZXNzYWdlU3RydWN0dXJlZCh7XG4gICAgICB0ZW5hbnRJZDogcmVxdWVzdEJvZHkudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgIHRleHQ6IHJlcXVlc3RCb2R5Lm1lc3NhZ2UsXG4gICAgICBzb3VyY2U6ICdjaGF0JyxcbiAgICAgIGNoYW5uZWxfY29udGV4dDoge1xuICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgc2Vzc2lvbklkOiByZXF1ZXN0Qm9keS5zZXNzaW9uSWQgfHwgYHNlc3NfJHtEYXRlLm5vdygpfWAsXG4gICAgICAgICAgY2xpZW50SWQ6ICdhcGlfZ2F0ZXdheScsXG4gICAgICAgICAgdXNlckFnZW50OiBldmVudC5oZWFkZXJzWyd1c2VyLWFnZW50J10gfHwgJ3Vua25vd24nLFxuICAgICAgICAgIGlwQWRkcmVzczogZXZlbnQucmVxdWVzdENvbnRleHQuaHR0cC5zb3VyY2VJcCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBsZWFkX2lkOiByZXF1ZXN0Qm9keS5sZWFkSWQsXG4gICAgICBjb252ZXJzYXRpb25faWQ6IGNvbnZlcnNhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgb3V0Ym91bmQgbWVzc2FnZSBpbiBEeW5hbW9EQlxuICAgIGNvbnN0IG91dGJvdW5kTWVzc2FnZSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XG4gICAgICB0ZW5hbnRJZDogcmVxdWVzdEJvZHkudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgIGxlYWRfaWQ6IHJlcXVlc3RCb2R5LmxlYWRJZCxcbiAgICAgIHNvdXJjZTogJ2FnZW50JyxcbiAgICAgIGRpcmVjdGlvbjogJ291dGJvdW5kJyxcbiAgICAgIHRleHQ6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXNzYWdlLFxuICAgICAgY29udmVyc2F0aW9uX2lkOiBjb252ZXJzYXRpb25JZCxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgdHJpZ2dlcmVkX2J5X21lc3NhZ2U6IGluYm91bmRNZXNzYWdlLnRzLFxuICAgICAgICBwcm9jZXNzZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgaW50ZW50OiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LFxuICAgICAgICBwcm9jZXNzaW5nX3RpbWVfbXM6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXRhZGF0YS5wcm9jZXNzaW5nVGltZU1zLFxuICAgICAgICBhcGlfZ2F0ZXdheV9yZXF1ZXN0X2lkOiBldmVudC5yZXF1ZXN0Q29udGV4dC5yZXF1ZXN0SWQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coYFN0b3JlZCBvdXRib3VuZCBjaGF0IHJlc3BvbnNlOiAke291dGJvdW5kTWVzc2FnZS5jb250YWN0X3BrfS8ke291dGJvdW5kTWVzc2FnZS50c31gKTtcblxuICAgIC8vIExvZyBpbnRlbnQgZGV0ZWN0aW9uIGZvciBtb25pdG9yaW5nXG4gICAgaWYgKHN0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW3wn46vIEludGVudCBkZXRlY3RlZDogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LmlkfSAoY29uZmlkZW5jZTogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LmNvbmZpZGVuY2V9KVxceDFiWzBtYCk7XG4gICAgfVxuXG4gICAgLy8gUHJlcGFyZSByZXNwb25zZSB3aXRoIGFkZGl0aW9uYWwgY2hhdC1zcGVjaWZpYyBmaWVsZHNcbiAgICBjb25zdCBjaGF0UmVzcG9uc2U6IENoYXRSZXNwb25zZSA9IHtcbiAgICAgIC4uLnN0cnVjdHVyZWRSZXNwb25zZSxcbiAgICAgIGNvbnZlcnNhdGlvbklkLFxuICAgICAgc2Vzc2lvbklkOiByZXF1ZXN0Qm9keS5zZXNzaW9uSWQsXG4gICAgfTtcblxuICAgIC8vIEFkZCB0b3RhbCBwcm9jZXNzaW5nIHRpbWUgdG8gbWV0YWRhdGFcbiAgICBjaGF0UmVzcG9uc2UubWV0YWRhdGEudG90YWxQcm9jZXNzaW5nVGltZU1zID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcblxuICAgIC8vIE9wdGlvbmFsbHkgcHVibGlzaCBldmVudCBmb3IgYW5hbHl0aWNzL3dlYmhvb2tzIChhc3luYywgZG9uJ3Qgd2FpdClcbiAgICBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50UmVwbHkoXG4gICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRSZXBseUV2ZW50KFxuICAgICAgICByZXF1ZXN0Qm9keS50ZW5hbnRJZCxcbiAgICAgICAgRHluYW1vREJTZXJ2aWNlLmNyZWF0ZUNvbnRhY3RQSyhyZXF1ZXN0Qm9keS50ZW5hbnRJZCwgZW1haWxMYyksXG4gICAgICAgIHN0cnVjdHVyZWRSZXNwb25zZS5tZXNzYWdlLFxuICAgICAgICAnY2hhdCcsXG4gICAgICAgIHtcbiAgICAgICAgICBjaGF0OiB7IHNlc3Npb25JZDogcmVxdWVzdEJvZHkuc2Vzc2lvbklkIHx8IGBzZXNzXyR7RGF0ZS5ub3coKX1gIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgICAgIHRyaWdnZXJlZF9ieV9tZXNzYWdlOiBpbmJvdW5kTWVzc2FnZS50cyxcbiAgICAgICAgICAgIHJlc3BvbnNlX21lc3NhZ2VfdHM6IG91dGJvdW5kTWVzc2FnZS50cyxcbiAgICAgICAgICAgIGxlYWRfaWQ6IHJlcXVlc3RCb2R5LmxlYWRJZCxcbiAgICAgICAgICAgIGFwaV9nYXRld2F5X3JlcXVlc3RfaWQ6IGV2ZW50LnJlcXVlc3RDb250ZXh0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIGludGVudDogc3RydWN0dXJlZFJlc3BvbnNlLmludGVudCxcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICApXG4gICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAvLyBMb2cgYnV0IGRvbid0IGZhaWwgdGhlIHJlcXVlc3RcbiAgICAgIGNvbnNvbGUud2FybignRmFpbGVkIHRvIHB1Ymxpc2ggYWdlbnQgcmVwbHkgZXZlbnQ6JywgZXJyb3IpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoY2hhdFJlc3BvbnNlKSxcbiAgICB9O1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQVBJIEdhdGV3YXkgY2hhdCBlcnJvcjonLCBlcnJvcik7XG5cbiAgICBjb25zdCBlcnJvclJlc3BvbnNlID0ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICBtZXNzYWdlOiAnQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgcHJvY2Vzc2luZyB5b3VyIG1lc3NhZ2UuIFBsZWFzZSB0cnkgYWdhaW4uJyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIHByb2Nlc3NpbmdUaW1lTXM6IERhdGUubm93KCkgLSBzdGFydFRpbWUsXG4gICAgICAgIHJlcXVlc3RJZDogZXZlbnQucmVxdWVzdENvbnRleHQucmVxdWVzdElkLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShlcnJvclJlc3BvbnNlKSxcbiAgICB9O1xuICB9XG59XG5cbi8qKlxuICogSGVhbHRoIGNoZWNrIGhhbmRsZXIgZm9yIEFQSSBHYXRld2F5XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoZWFsdGhIYW5kbGVyKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnRWMixcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHRWMj4ge1xuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIHN0YXR1czogJ2hlYWx0aHknLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB2ZXJzaW9uOiBwcm9jZXNzLmVudi5ucG1fcGFja2FnZV92ZXJzaW9uIHx8ICcxLjAuMCcsXG4gICAgICBzZXJ2aWNlOiAna3hnZW4tbGFuZ2NoYWluLWFnZW50LWFwaScsXG4gICAgfSksXG4gIH07XG59XG4iXX0=