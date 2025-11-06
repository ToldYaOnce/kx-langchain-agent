"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const dynamodb_js_1 = require("../lib/dynamodb.js");
const eventbridge_js_1 = require("../lib/eventbridge.js");
const config_js_1 = require("../lib/config.js");
const index_js_1 = require("../types/index.js");
/**
 * Lambda handler for routing inbound messages
 * Triggered by EventBridge rule: lead.message.created
 */
async function handler(event, context) {
    console.log('AgentRouter received event:', JSON.stringify(event, null, 2));
    try {
        // Load and validate configuration
        const config = (0, config_js_1.loadRuntimeConfig)();
        (0, config_js_1.validateRuntimeConfig)(config);
        // Initialize services
        const dynamoService = new dynamodb_js_1.DynamoDBService(config);
        const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
        // Validate incoming event
        const validatedEvent = index_js_1.InboundMessageEventSchema.parse(event);
        const { detail } = validatedEvent;
        // Resolve contact information
        let emailLc = detail.email_lc;
        let leadId = detail.lead_id;
        // If we only have phone number, resolve to email_lc via leads table
        if (!emailLc && detail.phone_e164) {
            console.log(`Resolving contact from phone: ${detail.phone_e164}`);
            const resolvedEmailLc = await dynamoService.resolveContactFromPhone(detail.tenantId, detail.phone_e164);
            if (!resolvedEmailLc) {
                console.error(`Could not resolve contact for phone: ${detail.phone_e164}`);
                // Emit error event
                await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(detail.tenantId, `Could not resolve contact for phone: ${detail.phone_e164}`, {
                    context: {
                        phone_e164: detail.phone_e164,
                        source: detail.source,
                    },
                }));
                return;
            }
            emailLc = resolvedEmailLc;
            // Also fetch the lead to get lead_id
            const lead = await dynamoService.getLead(detail.tenantId, emailLc);
            leadId = lead?.lead_id;
        }
        if (!emailLc) {
            throw new Error('Could not determine email_lc for contact');
        }
        // Write inbound message to messages table
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
        console.log(`Stored inbound message: ${messageItem.contact_pk}/${messageItem.ts}`);
        // Invoke AgentFn with the processed context
        // In a real implementation, you might use Lambda invoke or SQS
        // For now, we'll emit an internal event that the AgentFn can listen to
        // Import and invoke the agent handler directly
        const { handler: agentHandler } = await Promise.resolve().then(() => __importStar(require('./agent.js')));
        await agentHandler({
            tenantId: detail.tenantId,
            email_lc: emailLc,
            text: detail.text,
            source: detail.source,
            channel_context: detail.channel_context,
            lead_id: leadId,
            message_ts: messageItem.ts,
        }, context);
        console.log('AgentRouter completed successfully');
    }
    catch (error) {
        console.error('AgentRouter error:', error);
        // Try to emit error event if we have enough context
        try {
            const config = (0, config_js_1.loadRuntimeConfig)();
            const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
            await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(event.detail?.tenantId || 'unknown', error instanceof Error ? error.message : 'Unknown router error', {
                stack: error instanceof Error ? error.stack : undefined,
                context: {
                    event_source: event.source,
                    event_detail_type: event['detail-type'],
                },
            }));
        }
        catch (eventError) {
            console.error('Failed to emit error event:', eventError);
        }
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2hhbmRsZXJzL3JvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVVBLDBCQStIQztBQXhJRCxvREFBcUQ7QUFDckQsMERBQTJEO0FBQzNELGdEQUE0RTtBQUM1RSxnREFBd0Y7QUFFeEY7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FDM0IsS0FBOEUsRUFDOUUsT0FBZ0I7SUFFaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUzRSxJQUFJLENBQUM7UUFDSCxrQ0FBa0M7UUFDbEMsTUFBTSxNQUFNLEdBQUcsSUFBQSw2QkFBaUIsR0FBRSxDQUFDO1FBQ25DLElBQUEsaUNBQXFCLEVBQUMsTUFBTSxDQUFDLENBQUM7UUFFOUIsc0JBQXNCO1FBQ3RCLE1BQU0sYUFBYSxHQUFHLElBQUksNkJBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRCxNQUFNLGtCQUFrQixHQUFHLElBQUksbUNBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUQsMEJBQTBCO1FBQzFCLE1BQU0sY0FBYyxHQUFHLG9DQUF5QixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5RCxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsY0FBYyxDQUFDO1FBRWxDLDhCQUE4QjtRQUM5QixJQUFJLE9BQU8sR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQzlCLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFFNUIsb0VBQW9FO1FBQ3BFLElBQUksQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlD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QUFNLENBQUMsQ0FBQztZQUUxRCxNQUFNLGtCQUFrQixDQUFDLGlCQUFpQixDQUN4QyxtQ0FBa0IsQ0FBQyxxQkFBcUIsQ0FDdEMsS0FBSyxDQUFDLE1BQU0sRUFBRSxRQUFRLElBQUksU0FBUyxFQUNuQyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsRUFDL0Q7Z0JBQ0UsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3ZELE9BQU8sRUFBRTtvQkFDUCxZQUFZLEVBQUUsS0FBSyxDQUFDLE1BQU07b0JBQzFCLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUM7aUJBQ3hDO2FBQ0YsQ0FDRixDQUNGLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxVQUFVLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBFdmVudEJyaWRnZUV2ZW50LCBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4uL2xpYi9keW5hbW9kYi5qcyc7XHJcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4uL2xpYi9ldmVudGJyaWRnZS5qcyc7XHJcbmltcG9ydCB7IGxvYWRSdW50aW1lQ29uZmlnLCB2YWxpZGF0ZVJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnLmpzJztcclxuaW1wb3J0IHsgSW5ib3VuZE1lc3NhZ2VFdmVudFNjaGVtYSwgdHlwZSBJbmJvdW5kTWVzc2FnZUV2ZW50IH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xyXG5cclxuLyoqXHJcbiAqIExhbWJkYSBoYW5kbGVyIGZvciByb3V0aW5nIGluYm91bmQgbWVzc2FnZXNcclxuICogVHJpZ2dlcmVkIGJ5IEV2ZW50QnJpZGdlIHJ1bGU6IGxlYWQubWVzc2FnZS5jcmVhdGVkXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihcclxuICBldmVudDogRXZlbnRCcmlkZ2VFdmVudDwnbGVhZC5tZXNzYWdlLmNyZWF0ZWQnLCBJbmJvdW5kTWVzc2FnZUV2ZW50WydkZXRhaWwnXT4sXHJcbiAgY29udGV4dDogQ29udGV4dFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zb2xlLmxvZygnQWdlbnRSb3V0ZXIgcmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuICBcclxuICB0cnkge1xyXG4gICAgLy8gTG9hZCBhbmQgdmFsaWRhdGUgY29uZmlndXJhdGlvblxyXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcclxuICAgIHZhbGlkYXRlUnVudGltZUNvbmZpZyhjb25maWcpO1xyXG4gICAgXHJcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXHJcbiAgICBjb25zdCBkeW5hbW9TZXJ2aWNlID0gbmV3IER5bmFtb0RCU2VydmljZShjb25maWcpO1xyXG4gICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xyXG4gICAgXHJcbiAgICAvLyBWYWxpZGF0ZSBpbmNvbWluZyBldmVudFxyXG4gICAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSBJbmJvdW5kTWVzc2FnZUV2ZW50U2NoZW1hLnBhcnNlKGV2ZW50KTtcclxuICAgIGNvbnN0IHsgZGV0YWlsIH0gPSB2YWxpZGF0ZWRFdmVudDtcclxuICAgIFxyXG4gICAgLy8gUmVzb2x2ZSBjb250YWN0IGluZm9ybWF0aW9uXHJcbiAgICBsZXQgZW1haWxMYyA9IGRldGFpbC5lbWFpbF9sYztcclxuICAgIGxldCBsZWFkSWQgPSBkZXRhaWwubGVhZF9pZDtcclxuICAgIFxyXG4gICAgLy8gSWYgd2Ugb25seSBoYXZlIHBob25lIG51bWJlciwgcmVzb2x2ZSB0byBlbWFpbF9sYyB2aWEgbGVhZHMgdGFibGVcclxuICAgIGlmICghZW1haWxMYyAmJiBkZXRhaWwucGhvbmVfZTE2NCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhgUmVzb2x2aW5nIGNvbnRhY3QgZnJvbSBwaG9uZTogJHtkZXRhaWwucGhvbmVfZTE2NH1gKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlc29sdmVkRW1haWxMYyA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucmVzb2x2ZUNvbnRhY3RGcm9tUGhvbmUoXHJcbiAgICAgICAgZGV0YWlsLnRlbmFudElkLFxyXG4gICAgICAgIGRldGFpbC5waG9uZV9lMTY0XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIXJlc29sdmVkRW1haWxMYykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYENvdWxkIG5vdCByZXNvbHZlIGNvbnRhY3QgZm9yIHBob25lOiAke2RldGFpbC5waG9uZV9lMTY0fWApO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEVtaXQgZXJyb3IgZXZlbnRcclxuICAgICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXHJcbiAgICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxyXG4gICAgICAgICAgICBkZXRhaWwudGVuYW50SWQsXHJcbiAgICAgICAgICAgIGBDb3VsZCBub3QgcmVzb2x2ZSBjb250YWN0IGZvciBwaG9uZTogJHtkZXRhaWwucGhvbmVfZTE2NH1gLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgY29udGV4dDoge1xyXG4gICAgICAgICAgICAgICAgcGhvbmVfZTE2NDogZGV0YWlsLnBob25lX2UxNjQsXHJcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGRldGFpbC5zb3VyY2UsXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBlbWFpbExjID0gcmVzb2x2ZWRFbWFpbExjO1xyXG4gICAgICBcclxuICAgICAgLy8gQWxzbyBmZXRjaCB0aGUgbGVhZCB0byBnZXQgbGVhZF9pZFxyXG4gICAgICBjb25zdCBsZWFkID0gYXdhaXQgZHluYW1vU2VydmljZS5nZXRMZWFkKGRldGFpbC50ZW5hbnRJZCwgZW1haWxMYyk7XHJcbiAgICAgIGxlYWRJZCA9IGxlYWQ/LmxlYWRfaWQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmICghZW1haWxMYykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBkZXRlcm1pbmUgZW1haWxfbGMgZm9yIGNvbnRhY3QnKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gV3JpdGUgaW5ib3VuZCBtZXNzYWdlIHRvIG1lc3NhZ2VzIHRhYmxlXHJcbiAgICBjb25zdCBtZXNzYWdlSXRlbSA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZSh7XHJcbiAgICAgIHRlbmFudElkOiBkZXRhaWwudGVuYW50SWQsXHJcbiAgICAgIGVtYWlsX2xjOiBlbWFpbExjLFxyXG4gICAgICBsZWFkX2lkOiBsZWFkSWQsXHJcbiAgICAgIHNvdXJjZTogZGV0YWlsLnNvdXJjZSxcclxuICAgICAgZGlyZWN0aW9uOiAnaW5ib3VuZCcsXHJcbiAgICAgIHRleHQ6IGRldGFpbC50ZXh0LFxyXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGRldGFpbC5jaGFubmVsX2NvbnRleHQsXHJcbiAgICAgIG1ldGE6IHtcclxuICAgICAgICBwcm92aWRlcjogZGV0YWlsLnByb3ZpZGVyLFxyXG4gICAgICAgIHRpbWVzdGFtcHM6IGRldGFpbC50aW1lc3RhbXBzLFxyXG4gICAgICAgIHJvdXRlcl9wcm9jZXNzZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZyhgU3RvcmVkIGluYm91bmQgbWVzc2FnZTogJHttZXNzYWdlSXRlbS5jb250YWN0X3BrfS8ke21lc3NhZ2VJdGVtLnRzfWApO1xyXG4gICAgXHJcbiAgICAvLyBJbnZva2UgQWdlbnRGbiB3aXRoIHRoZSBwcm9jZXNzZWQgY29udGV4dFxyXG4gICAgLy8gSW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCB5b3UgbWlnaHQgdXNlIExhbWJkYSBpbnZva2Ugb3IgU1FTXHJcbiAgICAvLyBGb3Igbm93LCB3ZSdsbCBlbWl0IGFuIGludGVybmFsIGV2ZW50IHRoYXQgdGhlIEFnZW50Rm4gY2FuIGxpc3RlbiB0b1xyXG4gICAgXHJcbiAgICAvLyBJbXBvcnQgYW5kIGludm9rZSB0aGUgYWdlbnQgaGFuZGxlciBkaXJlY3RseVxyXG4gICAgY29uc3QgeyBoYW5kbGVyOiBhZ2VudEhhbmRsZXIgfSA9IGF3YWl0IGltcG9ydCgnLi9hZ2VudC5qcycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCBhZ2VudEhhbmRsZXIoe1xyXG4gICAgICB0ZW5hbnRJZDogZGV0YWlsLnRlbmFudElkLFxyXG4gICAgICBlbWFpbF9sYzogZW1haWxMYyxcclxuICAgICAgdGV4dDogZGV0YWlsLnRleHQsXHJcbiAgICAgIHNvdXJjZTogZGV0YWlsLnNvdXJjZSxcclxuICAgICAgY2hhbm5lbF9jb250ZXh0OiBkZXRhaWwuY2hhbm5lbF9jb250ZXh0LFxyXG4gICAgICBsZWFkX2lkOiBsZWFkSWQsXHJcbiAgICAgIG1lc3NhZ2VfdHM6IG1lc3NhZ2VJdGVtLnRzLFxyXG4gICAgfSwgY29udGV4dCk7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCdBZ2VudFJvdXRlciBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignQWdlbnRSb3V0ZXIgZXJyb3I6JywgZXJyb3IpO1xyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gZW1pdCBlcnJvciBldmVudCBpZiB3ZSBoYXZlIGVub3VnaCBjb250ZXh0XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb25maWcgPSBsb2FkUnVudGltZUNvbmZpZygpO1xyXG4gICAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XHJcbiAgICAgIFxyXG4gICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXHJcbiAgICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50RXJyb3JFdmVudChcclxuICAgICAgICAgIGV2ZW50LmRldGFpbD8udGVuYW50SWQgfHwgJ3Vua25vd24nLFxyXG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biByb3V0ZXIgZXJyb3InLFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICBjb250ZXh0OiB7XHJcbiAgICAgICAgICAgICAgZXZlbnRfc291cmNlOiBldmVudC5zb3VyY2UsXHJcbiAgICAgICAgICAgICAgZXZlbnRfZGV0YWlsX3R5cGU6IGV2ZW50WydkZXRhaWwtdHlwZSddLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIClcclxuICAgICAgKTtcclxuICAgIH0gY2F0Y2ggKGV2ZW50RXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGVtaXQgZXJyb3IgZXZlbnQ6JywgZXZlbnRFcnJvcik7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG4iXX0=