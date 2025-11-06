"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
exports.structuredHandler = structuredHandler;
const dynamodb_js_1 = require("../lib/dynamodb.js");
const eventbridge_js_1 = require("../lib/eventbridge.js");
const agent_js_1 = require("../lib/agent.js");
const config_js_1 = require("../lib/config.js");
/**
 * Lambda handler for processing agent responses
 * Invoked by AgentRouterFn with processed context
 */
async function handler(event, context) {
    console.log('Agent received event:', JSON.stringify(event, null, 2));
    try {
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
        // Process the message and generate response
        console.log(`Processing message for ${event.tenantId}/${event.email_lc}`);
        const response = await agentService.processMessage({
            tenantId: event.tenantId,
            email_lc: event.email_lc,
            text: event.text,
            source: event.source,
            channel_context: event.channel_context,
            lead_id: event.lead_id,
            conversation_id: event.conversation_id,
        });
        console.log(`Generated response: ${response.substring(0, 100)}...`);
        // Write agent response to messages table
        const responseMessage = await dynamoService.putMessage({
            tenantId: event.tenantId,
            email_lc: event.email_lc,
            lead_id: event.lead_id,
            source: 'agent',
            direction: 'outbound',
            text: response,
            conversation_id: event.conversation_id,
            meta: {
                model: config.bedrockModelId,
                triggered_by_message: event.message_ts,
                processed_at: new Date().toISOString(),
            },
        });
        console.log(`Stored agent response: ${responseMessage.contact_pk}/${responseMessage.ts}`);
        // Determine preferred channel and routing
        const preferredChannel = event.source; // Use originating channel
        const routing = agentService.createRoutingInfo({
            tenantId: event.tenantId,
            email_lc: event.email_lc,
            text: event.text,
            source: event.source,
            channel_context: event.channel_context,
            lead_id: event.lead_id,
            conversation_id: event.conversation_id,
        }, preferredChannel);
        // Emit agent.reply.created event
        await eventBridgeService.publishAgentReply(eventbridge_js_1.EventBridgeService.createAgentReplyEvent(event.tenantId, dynamodb_js_1.DynamoDBService.createContactPK(event.tenantId, event.email_lc), response, preferredChannel, routing, {
            conversationId: event.conversation_id,
            metadata: {
                model: config.bedrockModelId,
                triggered_by_message: event.message_ts,
                response_message_ts: responseMessage.ts,
                lead_id: event.lead_id,
            },
        }));
        console.log('Agent completed successfully');
    }
    catch (error) {
        console.error('Agent error:', error);
        // Try to emit error event
        try {
            const config = (0, config_js_1.loadRuntimeConfig)();
            const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
            await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(event.tenantId, error instanceof Error ? error.message : 'Unknown agent error', {
                contactPk: dynamodb_js_1.DynamoDBService.createContactPK(event.tenantId, event.email_lc),
                stack: error instanceof Error ? error.stack : undefined,
                context: {
                    source: event.source,
                    text_length: event.text?.length,
                    lead_id: event.lead_id,
                },
            }));
        }
        catch (eventError) {
            console.error('Failed to emit error event:', eventError);
        }
        throw error;
    }
}
/**
 * Lambda handler that returns structured JSON response with intent metadata
 * Useful for API Gateway integrations or when you need detailed response data
 */
async function structuredHandler(event, context) {
    console.log('Agent received event for structured response:', JSON.stringify(event, null, 2));
    try {
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
        // Process the message and get structured response
        console.log(`Processing message for ${event.tenantId}/${event.email_lc}`);
        const structuredResponse = await agentService.processMessageStructured({
            tenantId: event.tenantId,
            email_lc: event.email_lc,
            text: event.text,
            source: event.source,
            channel_context: event.channel_context,
            lead_id: event.lead_id,
            conversation_id: event.conversation_id,
        });
        console.log(`Generated structured response:`, {
            success: structuredResponse.success,
            messageLength: structuredResponse.message.length,
            intent: structuredResponse.intent?.id,
            confidence: structuredResponse.intent?.confidence,
            processingTime: structuredResponse.metadata.processingTimeMs
        });
        // Log intent detection in red for visibility
        if (structuredResponse.intent) {
            console.log(`\x1b[31m🎯 INTENT DETECTED IN LAMBDA: ${structuredResponse.intent.id} (confidence: ${(structuredResponse.intent.confidence * 100).toFixed(1)}%)\x1b[0m`);
            console.log(`\x1b[31m   Name: ${structuredResponse.intent.name}\x1b[0m`);
            console.log(`\x1b[31m   Priority: ${structuredResponse.intent.priority}\x1b[0m`);
            console.log(`\x1b[31m   Actions: ${structuredResponse.intent.actions?.join(', ') || 'none'}\x1b[0m`);
        }
        // Store the response in DynamoDB if successful
        if (structuredResponse.success) {
            const responseMessage = await dynamoService.putMessage({
                tenantId: event.tenantId,
                email_lc: event.email_lc,
                lead_id: event.lead_id,
                source: 'agent',
                direction: 'outbound',
                text: structuredResponse.message,
                conversation_id: event.conversation_id,
                meta: {
                    model: config.bedrockModelId,
                    triggered_by_message: event.message_ts,
                    processed_at: structuredResponse.metadata.timestamp,
                    intent_detected: structuredResponse.intent?.id,
                    intent_confidence: structuredResponse.intent?.confidence,
                    processing_time_ms: structuredResponse.metadata.processingTimeMs,
                },
            });
            console.log(`Stored agent response: ${responseMessage.contact_pk}/${responseMessage.ts}`);
        }
        return structuredResponse;
    }
    catch (error) {
        console.error('Agent processing error:', error);
        // Return structured error response
        return {
            success: false,
            message: 'I apologize, but I encountered an error processing your message. Please try again.',
            metadata: {
                sessionId: event.conversation_id || 'unknown',
                tenantId: event.tenantId,
                userId: event.email_lc,
                channel: event.source,
                timestamp: new Date().toISOString(),
                processingTimeMs: 0
            },
            error: {
                code: 'HANDLER_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
                details: error
            }
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaGFuZGxlcnMvYWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFrQkEsMEJBdUhDO0FBTUQsOENBa0dDO0FBaFBELG9EQUFxRDtBQUNyRCwwREFBMkQ7QUFDM0QsOENBQStDO0FBQy9DLGdEQUE0RTtBQVU1RTs7O0dBR0c7QUFDSSxLQUFLLFVBQVUsT0FBTyxDQUMzQixLQUEyQixFQUMzQixPQUFnQjtJQUVoQixPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXJFLElBQUksQ0FBQztRQUNILGtDQUFrQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFpQixHQUFFLENBQUM7UUFDbkMsSUFBQSxpQ0FBcUIsRUFBQyxNQUFNLENBQUMsQ0FBQztRQUU5QixzQkFBc0I7UUFDdEIsTUFBTSxhQUFhLEdBQUcsSUFBSSw2QkFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxtQ0FBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUxRCx1QkFBdUI7UUFDdkIsTUFBTSxZQUFZLEdBQUcsSUFBSSx1QkFBWSxDQUFDO1lBQ3BDLEdBQUcsTUFBTTtZQUNULGFBQWE7WUFDYixrQkFBa0I7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsNENBQTRDO1FBQzVDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEtBQUssQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFMUUsTUFBTSxRQUFRLEdBQUcsTUFBTSxZQUFZLENBQUMsY0FBYyxDQUFDO1lBQ2pELFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtZQUN4QixRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7WUFDeEIsSUFBSSxFQUFFLEtB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RixDQUFDLENBQUM7WUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixlQUFlLENBQUMsVUFBVSxJQUFJLGVBQWUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLENBQUM7UUFFRCxPQUFPLGtCQUFrQixDQUFDO0lBRTVCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVoRCxtQ0FBbUM7UUFDbkMsT0FBTztZQUNMLE9BQU8sRUFBRSxLQUFLO1lBQ2QsT0FBTyxFQUFFLG9GQUFvRjtZQUM3RixRQUFRLEVBQUU7Z0JBQ1IsU0FBUyxFQUFFLEtBQUssQ0FBQyxlQUFlLElBQUksU0FBUztnQkFDN0MsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO2dCQUN4QixNQUFNLEVBQUUsS0FBSyxDQUFDLFFBQVE7Z0JBQ3RCLE9BQU8sRUFBRSxLQUFLLENBQUMsTUFBTTtnQkFDckIsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2dCQUNuQyxnQkFBZ0IsRUFBRSxDQUFDO2FBQ3BCO1lBQ0QsS0FBSyxFQUFFO2dCQUNMLElBQUksRUFBRSxlQUFlO2dCQUNyQixPQUFPLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTtnQkFDakUsT0FBTyxFQUFFLEtBQUs7YUFDZjtTQUNGLENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuLi9saWIvZHluYW1vZGIuanMnO1xyXG5pbXBvcnQgeyBFdmVudEJyaWRnZVNlcnZpY2UgfSBmcm9tICcuLi9saWIvZXZlbnRicmlkZ2UuanMnO1xyXG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9saWIvYWdlbnQuanMnO1xyXG5pbXBvcnQgeyBsb2FkUnVudGltZUNvbmZpZywgdmFsaWRhdGVSdW50aW1lQ29uZmlnIH0gZnJvbSAnLi4vbGliL2NvbmZpZy5qcyc7XHJcbmltcG9ydCB0eXBlIHsgQWdlbnRDb250ZXh0LCBBZ2VudFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xyXG5cclxuLyoqXHJcbiAqIEFnZW50IGludm9jYXRpb24gY29udGV4dCAoaW50ZXJuYWwgZXZlbnQgZnJvbSByb3V0ZXIpXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50SW52b2NhdGlvbkV2ZW50IGV4dGVuZHMgQWdlbnRDb250ZXh0IHtcclxuICBtZXNzYWdlX3RzOiBzdHJpbmc7IC8vIFRpbWVzdGFtcCBvZiB0aGUgbWVzc2FnZSB0aGF0IHRyaWdnZXJlZCB0aGlzXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBMYW1iZGEgaGFuZGxlciBmb3IgcHJvY2Vzc2luZyBhZ2VudCByZXNwb25zZXNcclxuICogSW52b2tlZCBieSBBZ2VudFJvdXRlckZuIHdpdGggcHJvY2Vzc2VkIGNvbnRleHRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKFxyXG4gIGV2ZW50OiBBZ2VudEludm9jYXRpb25FdmVudCxcclxuICBjb250ZXh0OiBDb250ZXh0XHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnNvbGUubG9nKCdBZ2VudCByZWNlaXZlZCBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXHJcbiAgICBjb25zdCBjb25maWcgPSBsb2FkUnVudGltZUNvbmZpZygpO1xyXG4gICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKGNvbmZpZyk7XHJcbiAgICBcclxuICAgIC8vIEluaXRpYWxpemUgc2VydmljZXNcclxuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSBuZXcgRHluYW1vREJTZXJ2aWNlKGNvbmZpZyk7XHJcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XHJcbiAgICBcclxuICAgIC8vIENyZWF0ZSBhZ2VudCBzZXJ2aWNlXHJcbiAgICBjb25zdCBhZ2VudFNlcnZpY2UgPSBuZXcgQWdlbnRTZXJ2aWNlKHtcclxuICAgICAgLi4uY29uZmlnLFxyXG4gICAgICBkeW5hbW9TZXJ2aWNlLFxyXG4gICAgICBldmVudEJyaWRnZVNlcnZpY2UsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gUHJvY2VzcyB0aGUgbWVzc2FnZSBhbmQgZ2VuZXJhdGUgcmVzcG9uc2VcclxuICAgIGNvbnNvbGUubG9nKGBQcm9jZXNzaW5nIG1lc3NhZ2UgZm9yICR7ZXZlbnQudGVuYW50SWR9LyR7ZXZlbnQuZW1haWxfbGN9YCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYWdlbnRTZXJ2aWNlLnByb2Nlc3NNZXNzYWdlKHtcclxuICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxyXG4gICAgICBlbWFpbF9sYzogZXZlbnQuZW1haWxfbGMsXHJcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXHJcbiAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlLFxyXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGV2ZW50LmNoYW5uZWxfY29udGV4dCxcclxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcclxuICAgICAgY29udmVyc2F0aW9uX2lkOiBldmVudC5jb252ZXJzYXRpb25faWQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYEdlbmVyYXRlZCByZXNwb25zZTogJHtyZXNwb25zZS5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcclxuICAgIFxyXG4gICAgLy8gV3JpdGUgYWdlbnQgcmVzcG9uc2UgdG8gbWVzc2FnZXMgdGFibGVcclxuICAgIGNvbnN0IHJlc3BvbnNlTWVzc2FnZSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XHJcbiAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcclxuICAgICAgZW1haWxfbGM6IGV2ZW50LmVtYWlsX2xjLFxyXG4gICAgICBsZWFkX2lkOiBldmVudC5sZWFkX2lkLFxyXG4gICAgICBzb3VyY2U6ICdhZ2VudCcsXHJcbiAgICAgIGRpcmVjdGlvbjogJ291dGJvdW5kJyxcclxuICAgICAgdGV4dDogcmVzcG9uc2UsXHJcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxyXG4gICAgICBtZXRhOiB7XHJcbiAgICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcclxuICAgICAgICB0cmlnZ2VyZWRfYnlfbWVzc2FnZTogZXZlbnQubWVzc2FnZV90cyxcclxuICAgICAgICBwcm9jZXNzZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgU3RvcmVkIGFnZW50IHJlc3BvbnNlOiAke3Jlc3BvbnNlTWVzc2FnZS5jb250YWN0X3BrfS8ke3Jlc3BvbnNlTWVzc2FnZS50c31gKTtcclxuICAgIFxyXG4gICAgLy8gRGV0ZXJtaW5lIHByZWZlcnJlZCBjaGFubmVsIGFuZCByb3V0aW5nXHJcbiAgICBjb25zdCBwcmVmZXJyZWRDaGFubmVsID0gZXZlbnQuc291cmNlOyAvLyBVc2Ugb3JpZ2luYXRpbmcgY2hhbm5lbFxyXG4gICAgXHJcbiAgICBjb25zdCByb3V0aW5nID0gYWdlbnRTZXJ2aWNlLmNyZWF0ZVJvdXRpbmdJbmZvKHtcclxuICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxyXG4gICAgICBlbWFpbF9sYzogZXZlbnQuZW1haWxfbGMsXHJcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXHJcbiAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlLFxyXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGV2ZW50LmNoYW5uZWxfY29udGV4dCxcclxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcclxuICAgICAgY29udmVyc2F0aW9uX2lkOiBldmVudC5jb252ZXJzYXRpb25faWQsXHJcbiAgICB9LCBwcmVmZXJyZWRDaGFubmVsKTtcclxuICAgIFxyXG4gICAgLy8gRW1pdCBhZ2VudC5yZXBseS5jcmVhdGVkIGV2ZW50XHJcbiAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50UmVwbHkoXHJcbiAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudFJlcGx5RXZlbnQoXHJcbiAgICAgICAgZXZlbnQudGVuYW50SWQsXHJcbiAgICAgICAgRHluYW1vREJTZXJ2aWNlLmNyZWF0ZUNvbnRhY3RQSyhldmVudC50ZW5hbnRJZCwgZXZlbnQuZW1haWxfbGMpLFxyXG4gICAgICAgIHJlc3BvbnNlLFxyXG4gICAgICAgIHByZWZlcnJlZENoYW5uZWwgYXMgJ3NtcycgfCAnZW1haWwnIHwgJ2NoYXQnIHwgJ2FwaScsXHJcbiAgICAgICAgcm91dGluZyxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBjb252ZXJzYXRpb25JZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxyXG4gICAgICAgICAgbWV0YWRhdGE6IHtcclxuICAgICAgICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcclxuICAgICAgICAgICAgdHJpZ2dlcmVkX2J5X21lc3NhZ2U6IGV2ZW50Lm1lc3NhZ2VfdHMsXHJcbiAgICAgICAgICAgIHJlc3BvbnNlX21lc3NhZ2VfdHM6IHJlc3BvbnNlTWVzc2FnZS50cyxcclxuICAgICAgICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfVxyXG4gICAgICApXHJcbiAgICApO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnQWdlbnQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0FnZW50IGVycm9yOicsIGVycm9yKTtcclxuICAgIFxyXG4gICAgLy8gVHJ5IHRvIGVtaXQgZXJyb3IgZXZlbnRcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbmZpZyA9IGxvYWRSdW50aW1lQ29uZmlnKCk7XHJcbiAgICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcclxuICAgICAgXHJcbiAgICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRFcnJvcihcclxuICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxyXG4gICAgICAgICAgZXZlbnQudGVuYW50SWQsXHJcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGFnZW50IGVycm9yJyxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgY29udGFjdFBrOiBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGV2ZW50LnRlbmFudElkLCBldmVudC5lbWFpbF9sYyksXHJcbiAgICAgICAgICAgIHN0YWNrOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgIGNvbnRleHQ6IHtcclxuICAgICAgICAgICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcclxuICAgICAgICAgICAgICB0ZXh0X2xlbmd0aDogZXZlbnQudGV4dD8ubGVuZ3RoLFxyXG4gICAgICAgICAgICAgIGxlYWRfaWQ6IGV2ZW50LmxlYWRfaWQsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKVxyXG4gICAgICApO1xyXG4gICAgfSBjYXRjaCAoZXZlbnRFcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZW1pdCBlcnJvciBldmVudDonLCBldmVudEVycm9yKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhyb3cgZXJyb3I7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogTGFtYmRhIGhhbmRsZXIgdGhhdCByZXR1cm5zIHN0cnVjdHVyZWQgSlNPTiByZXNwb25zZSB3aXRoIGludGVudCBtZXRhZGF0YVxyXG4gKiBVc2VmdWwgZm9yIEFQSSBHYXRld2F5IGludGVncmF0aW9ucyBvciB3aGVuIHlvdSBuZWVkIGRldGFpbGVkIHJlc3BvbnNlIGRhdGFcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdHJ1Y3R1cmVkSGFuZGxlcihcclxuICBldmVudDogQWdlbnRJbnZvY2F0aW9uRXZlbnQsXHJcbiAgY29udGV4dDogQ29udGV4dFxyXG4pOiBQcm9taXNlPEFnZW50UmVzcG9uc2U+IHtcclxuICBjb25zb2xlLmxvZygnQWdlbnQgcmVjZWl2ZWQgZXZlbnQgZm9yIHN0cnVjdHVyZWQgcmVzcG9uc2U6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuICBcclxuICB0cnkge1xyXG4gICAgLy8gTG9hZCBhbmQgdmFsaWRhdGUgY29uZmlndXJhdGlvblxyXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcclxuICAgIHZhbGlkYXRlUnVudGltZUNvbmZpZyhjb25maWcpO1xyXG4gICAgXHJcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXHJcbiAgICBjb25zdCBkeW5hbW9TZXJ2aWNlID0gbmV3IER5bmFtb0RCU2VydmljZShjb25maWcpO1xyXG4gICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xyXG4gICAgXHJcbiAgICAvLyBDcmVhdGUgYWdlbnQgc2VydmljZVxyXG4gICAgY29uc3QgYWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZSh7XHJcbiAgICAgIC4uLmNvbmZpZyxcclxuICAgICAgZHluYW1vU2VydmljZSxcclxuICAgICAgZXZlbnRCcmlkZ2VTZXJ2aWNlLFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8vIFByb2Nlc3MgdGhlIG1lc3NhZ2UgYW5kIGdldCBzdHJ1Y3R1cmVkIHJlc3BvbnNlXHJcbiAgICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBtZXNzYWdlIGZvciAke2V2ZW50LnRlbmFudElkfS8ke2V2ZW50LmVtYWlsX2xjfWApO1xyXG4gICAgXHJcbiAgICBjb25zdCBzdHJ1Y3R1cmVkUmVzcG9uc2UgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2VTdHJ1Y3R1cmVkKHtcclxuICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxyXG4gICAgICBlbWFpbF9sYzogZXZlbnQuZW1haWxfbGMsXHJcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXHJcbiAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlLFxyXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGV2ZW50LmNoYW5uZWxfY29udGV4dCxcclxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcclxuICAgICAgY29udmVyc2F0aW9uX2lkOiBldmVudC5jb252ZXJzYXRpb25faWQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYEdlbmVyYXRlZCBzdHJ1Y3R1cmVkIHJlc3BvbnNlOmAsIHtcclxuICAgICAgc3VjY2Vzczogc3RydWN0dXJlZFJlc3BvbnNlLnN1Y2Nlc3MsXHJcbiAgICAgIG1lc3NhZ2VMZW5ndGg6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXNzYWdlLmxlbmd0aCxcclxuICAgICAgaW50ZW50OiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Py5pZCxcclxuICAgICAgY29uZmlkZW5jZTogc3RydWN0dXJlZFJlc3BvbnNlLmludGVudD8uY29uZmlkZW5jZSxcclxuICAgICAgcHJvY2Vzc2luZ1RpbWU6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXRhZGF0YS5wcm9jZXNzaW5nVGltZU1zXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gTG9nIGludGVudCBkZXRlY3Rpb24gaW4gcmVkIGZvciB2aXNpYmlsaXR5XHJcbiAgICBpZiAoc3RydWN0dXJlZFJlc3BvbnNlLmludGVudCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+OryBJTlRFTlQgREVURUNURUQgSU4gTEFNQkRBOiAke3N0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQuaWR9IChjb25maWRlbmNlOiAkeyhzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMSl9JSlcXHgxYlswbWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTmFtZTogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Lm5hbWV9XFx4MWJbMG1gKTtcclxuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIFByaW9yaXR5OiAke3N0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQucHJpb3JpdHl9XFx4MWJbMG1gKTtcclxuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIEFjdGlvbnM6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5hY3Rpb25zPy5qb2luKCcsICcpIHx8ICdub25lJ31cXHgxYlswbWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBTdG9yZSB0aGUgcmVzcG9uc2UgaW4gRHluYW1vREIgaWYgc3VjY2Vzc2Z1bFxyXG4gICAgaWYgKHN0cnVjdHVyZWRSZXNwb25zZS5zdWNjZXNzKSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlTWVzc2FnZSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XHJcbiAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxyXG4gICAgICAgIGVtYWlsX2xjOiBldmVudC5lbWFpbF9sYyxcclxuICAgICAgICBsZWFkX2lkOiBldmVudC5sZWFkX2lkLFxyXG4gICAgICAgIHNvdXJjZTogJ2FnZW50JyxcclxuICAgICAgICBkaXJlY3Rpb246ICdvdXRib3VuZCcsXHJcbiAgICAgICAgdGV4dDogc3RydWN0dXJlZFJlc3BvbnNlLm1lc3NhZ2UsXHJcbiAgICAgICAgY29udmVyc2F0aW9uX2lkOiBldmVudC5jb252ZXJzYXRpb25faWQsXHJcbiAgICAgICAgbWV0YToge1xyXG4gICAgICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcclxuICAgICAgICAgIHRyaWdnZXJlZF9ieV9tZXNzYWdlOiBldmVudC5tZXNzYWdlX3RzLFxyXG4gICAgICAgICAgcHJvY2Vzc2VkX2F0OiBzdHJ1Y3R1cmVkUmVzcG9uc2UubWV0YWRhdGEudGltZXN0YW1wLFxyXG4gICAgICAgICAgaW50ZW50X2RldGVjdGVkOiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Py5pZCxcclxuICAgICAgICAgIGludGVudF9jb25maWRlbmNlOiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Py5jb25maWRlbmNlLFxyXG4gICAgICAgICAgcHJvY2Vzc2luZ190aW1lX21zOiBzdHJ1Y3R1cmVkUmVzcG9uc2UubWV0YWRhdGEucHJvY2Vzc2luZ1RpbWVNcyxcclxuICAgICAgICB9LFxyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGBTdG9yZWQgYWdlbnQgcmVzcG9uc2U6ICR7cmVzcG9uc2VNZXNzYWdlLmNvbnRhY3RfcGt9LyR7cmVzcG9uc2VNZXNzYWdlLnRzfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gc3RydWN0dXJlZFJlc3BvbnNlO1xyXG4gICAgXHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0FnZW50IHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xyXG4gICAgXHJcbiAgICAvLyBSZXR1cm4gc3RydWN0dXJlZCBlcnJvciByZXNwb25zZVxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3VjY2VzczogZmFsc2UsXHJcbiAgICAgIG1lc3NhZ2U6ICdJIGFwb2xvZ2l6ZSwgYnV0IEkgZW5jb3VudGVyZWQgYW4gZXJyb3IgcHJvY2Vzc2luZyB5b3VyIG1lc3NhZ2UuIFBsZWFzZSB0cnkgYWdhaW4uJyxcclxuICAgICAgbWV0YWRhdGE6IHtcclxuICAgICAgICBzZXNzaW9uSWQ6IGV2ZW50LmNvbnZlcnNhdGlvbl9pZCB8fCAndW5rbm93bicsXHJcbiAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxyXG4gICAgICAgIHVzZXJJZDogZXZlbnQuZW1haWxfbGMsXHJcbiAgICAgICAgY2hhbm5lbDogZXZlbnQuc291cmNlLFxyXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgIHByb2Nlc3NpbmdUaW1lTXM6IDBcclxuICAgICAgfSxcclxuICAgICAgZXJyb3I6IHtcclxuICAgICAgICBjb2RlOiAnSEFORExFUl9FUlJPUicsXHJcbiAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXHJcbiAgICAgICAgZGV0YWlsczogZXJyb3JcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XHJcbn1cclxuIl19