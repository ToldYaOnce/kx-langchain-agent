"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBridgeService = void 0;
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
class EventBridgeService {
    constructor(config) {
        this.config = config;
        this.client = new client_eventbridge_1.EventBridgeClient({
            region: config.awsRegion,
        });
    }
    /**
     * Publish agent reply event to the injected EventBridge bus
     */
    async publishAgentReply(event) {
        await this.publishEvent(event);
    }
    /**
     * Publish agent error event
     */
    async publishAgentError(event) {
        await this.publishEvent(event);
    }
    /**
     * Publish agent trace event for telemetry
     */
    async publishAgentTrace(event) {
        await this.publishEvent(event);
    }
    /**
     * Publish a custom event to EventBridge
     */
    async publishCustomEvent(source, detailType, detail) {
        const eventBusName = this.config.outboundEventBusName || this.config.outboundEventBusArn;
        if (!eventBusName) {
            console.warn('⚠️  No EventBridge bus configured, skipping event publication');
            console.warn('   Event would have been:', { source, detailType, detail });
            return;
        }
        try {
            console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
            console.log('\x1b[35m📤 PUBLISHING EVENTBRIDGE EVENT\x1b[0m');
            console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
            console.log(`\x1b[36m🎯 Source:      \x1b[0m${source}`);
            console.log(`\x1b[36m🏷️  Detail Type: \x1b[0m${detailType}`);
            console.log(`\x1b[36m🚀 Event Bus:   \x1b[0m${eventBusName}`);
            console.log(`\x1b[36m📦 Payload:\x1b[0m`);
            console.log(JSON.stringify(detail, null, 2));
            console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
            await this.client.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [{
                        Source: source,
                        DetailType: detailType,
                        Detail: JSON.stringify(detail),
                        EventBusName: eventBusName,
                    }],
            }));
            console.log(`\x1b[32m✅ Event published successfully: ${detailType}\x1b[0m`);
        }
        catch (error) {
            console.log('\x1b[31m════════════════════════════════════════════════════════════════\x1b[0m');
            console.log('\x1b[31m❌ EVENTBRIDGE PUBLISH FAILED\x1b[0m');
            console.log('\x1b[31m════════════════════════════════════════════════════════════════\x1b[0m');
            console.error('Failed to publish custom event to EventBridge:', error);
            console.log('\x1b[31m════════════════════════════════════════════════════════════════\x1b[0m');
            throw error;
        }
    }
    /**
     * Generic event publisher
     */
    async publishEvent(event) {
        const eventBusName = this.config.outboundEventBusName || this.config.outboundEventBusArn;
        if (!eventBusName) {
            console.warn('⚠️  No EventBridge bus configured, skipping event publication');
            console.warn('   Event would have been:', {
                source: event.source,
                detailType: event['detail-type'],
                detail: event.detail
            });
            return;
        }
        try {
            console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
            console.log('\x1b[35m📤 PUBLISHING EVENTBRIDGE EVENT\x1b[0m');
            console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
            console.log(`\x1b[36m🎯 Source:      \x1b[0m${event.source}`);
            console.log(`\x1b[36m🏷️  Detail Type: \x1b[0m${event['detail-type']}`);
            console.log(`\x1b[36m🚀 Event Bus:   \x1b[0m${eventBusName}`);
            console.log(`\x1b[36m📦 Payload:\x1b[0m`);
            console.log(JSON.stringify(event.detail, null, 2));
            console.log('\x1b[35m════════════════════════════════════════════════════════════════\x1b[0m');
            await this.client.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [
                    {
                        Source: event.source,
                        DetailType: event['detail-type'],
                        Detail: JSON.stringify(event.detail),
                        EventBusName: eventBusName,
                    },
                ],
            }));
            console.log(`\x1b[32m✅ Event published successfully: ${event['detail-type']}\x1b[0m`);
        }
        catch (error) {
            console.log('\x1b[31m════════════════════════════════════════════════════════════════\x1b[0m');
            console.log('\x1b[31m❌ EVENTBRIDGE PUBLISH FAILED\x1b[0m');
            console.log('\x1b[31m════════════════════════════════════════════════════════════════\x1b[0m');
            console.error('Failed to publish event to EventBridge:', error);
            console.log('\x1b[31m════════════════════════════════════════════════════════════════\x1b[0m');
            throw error;
        }
    }
    /**
     * Create agent reply event
     */
    static createAgentReplyEvent(tenantId, contactPk, text, preferredChannel, routing, options = {}) {
        return {
            source: 'kxgen.agent',
            'detail-type': 'agent.reply.created',
            detail: {
                tenantId,
                contact_pk: contactPk,
                preferredChannel,
                text,
                routing,
                conversation_id: options.conversationId,
                metadata: options.metadata,
            },
        };
    }
    /**
     * Create agent error event
     */
    static createAgentErrorEvent(tenantId, error, options = {}) {
        return {
            source: 'kxgen.agent',
            'detail-type': 'agent.error',
            detail: {
                tenantId,
                contact_pk: options.contactPk,
                error,
                stack: options.stack,
                context: options.context,
            },
        };
    }
    /**
     * Create agent trace event
     */
    static createAgentTraceEvent(tenantId, operation, options = {}) {
        return {
            source: 'kxgen.agent',
            'detail-type': 'agent.trace',
            detail: {
                tenantId,
                contact_pk: options.contactPk,
                operation,
                duration_ms: options.durationMs,
                metadata: options.metadata,
            },
        };
    }
    /**
     * Publish LLM usage event for cost tracking
     */
    async publishLLMUsage(usage) {
        // Always log for debugging
        const costStr = usage.estimatedCostUsd !== undefined
            ? `, Cost=$${usage.estimatedCostUsd.toFixed(6)}`
            : '';
        console.log(`📊 LLM Usage [${usage.requestType}]: Input=${usage.inputTokens}, Output=${usage.outputTokens}, Total=${usage.totalTokens}${costStr}`);
        await this.publishCustomEvent('kxgen.agent', 'llm.usage', usage);
    }
}
exports.EventBridgeService = EventBridgeService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnRicmlkZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2V2ZW50YnJpZGdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG9FQUFrRjtBQUdsRixNQUFhLGtCQUFrQjtJQUk3QixZQUFZLE1BQXFCO1FBQy9CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQztZQUNsQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVM7U0FDekIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEtBQXNCO1FBQzVDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsaUJBQWlCLENBQUMsS0FBc0I7UUFDNUMsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxLQUFzQjtRQUM1QyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQWMsRUFBRSxVQUFrQixFQUFFLE1BQVc7UUFDdEUsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDO1FBRXpGLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNsQixPQUFPLENBQUMsSUFBSSxDQUFDLCtEQUErRCxDQUFDLENBQUM7WUFDOUUsT0FBTyxDQUFDLElBQUksQ0FBQywyQkFBMkIsRUFBRSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxF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QUNsRCxDQUFDLENBQUMsV0FBVyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2hELENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixLQUFLLENBQUMsV0FBVyxZQUFZLEtBQUssQ0FBQyxXQUFXLFlBQVksS0FBSyxDQUFDLFlBQVksV0FBVyxLQUFLLENBQUMsV0FBVyxHQUFHLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFbkosTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQzNCLGFBQWEsRUFDYixXQUFXLEVBQ1gsS0FBSyxDQUNOLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUEvTkQsZ0RBK05DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRXZlbnRCcmlkZ2VDbGllbnQsIFB1dEV2ZW50c0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZXZlbnRicmlkZ2UnO1xyXG5pbXBvcnQgdHlwZSB7IEFnZW50UmVwbHlFdmVudCwgQWdlbnRFcnJvckV2ZW50LCBBZ2VudFRyYWNlRXZlbnQsIFJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi90eXBlcy9pbmRleC5qcyc7XHJcblxyXG5leHBvcnQgY2xhc3MgRXZlbnRCcmlkZ2VTZXJ2aWNlIHtcclxuICBwcml2YXRlIGNsaWVudDogRXZlbnRCcmlkZ2VDbGllbnQ7XHJcbiAgcHJpdmF0ZSBjb25maWc6IFJ1bnRpbWVDb25maWc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUnVudGltZUNvbmZpZykge1xyXG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICB0aGlzLmNsaWVudCA9IG5ldyBFdmVudEJyaWRnZUNsaWVudCh7XHJcbiAgICAgIHJlZ2lvbjogY29uZmlnLmF3c1JlZ2lvbixcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBhZ2VudCByZXBseSBldmVudCB0byB0aGUgaW5qZWN0ZWQgRXZlbnRCcmlkZ2UgYnVzXHJcbiAgICovXHJcbiAgYXN5bmMgcHVibGlzaEFnZW50UmVwbHkoZXZlbnQ6IEFnZW50UmVwbHlFdmVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgdGhpcy5wdWJsaXNoRXZlbnQoZXZlbnQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBhZ2VudCBlcnJvciBldmVudFxyXG4gICAqL1xyXG4gIGFzeW5jIHB1Ymxpc2hBZ2VudEVycm9yKGV2ZW50OiBBZ2VudEVycm9yRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGF3YWl0IHRoaXMucHVibGlzaEV2ZW50KGV2ZW50KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFB1Ymxpc2ggYWdlbnQgdHJhY2UgZXZlbnQgZm9yIHRlbGVtZXRyeVxyXG4gICAqL1xyXG4gIGFzeW5jIHB1Ymxpc2hBZ2VudFRyYWNlKGV2ZW50OiBBZ2VudFRyYWNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGF3YWl0IHRoaXMucHVibGlzaEV2ZW50KGV2ZW50KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFB1Ymxpc2ggYSBjdXN0b20gZXZlbnQgdG8gRXZlbnRCcmlkZ2VcclxuICAgKi9cclxuICBhc3luYyBwdWJsaXNoQ3VzdG9tRXZlbnQoc291cmNlOiBzdHJpbmcsIGRldGFpbFR5cGU6IHN0cmluZywgZGV0YWlsOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGV2ZW50QnVzTmFtZSA9IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNOYW1lIHx8IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNBcm47XHJcbiAgICBcclxuICAgIGlmICghZXZlbnRCdXNOYW1lKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBObyBFdmVudEJyaWRnZSBidXMgY29uZmlndXJlZCwgc2tpcHBpbmcgZXZlbnQgcHVibGljYXRpb24nKTtcclxuICAgICAgY29uc29sZS53YXJuKCcgICBFdmVudCB3b3VsZCBoYXZlIGJlZW46JywgeyBzb3VyY2UsIGRldGFpbFR5cGUsIGRldGFpbCB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXHgxYlszNW3ilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcXHgxYlswbScpO1xyXG4gICAgICBjb25zb2xlLmxvZygnXFx4MWJbMzVt8J+TpCBQVUJMSVNISU5HIEVWRU5UQlJJREdFIEVWRU5UXFx4MWJbMG0nKTtcclxuICAgICAgY29uc29sZS5sb2coJ1xceDFiWzM1beKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxceDFiWzBtJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszNm3wn46vIFNvdXJjZTogICAgICBcXHgxYlswbSR7c291cmNlfWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzZt8J+Pt++4jyAgRGV0YWlsIFR5cGU6IFxceDFiWzBtJHtkZXRhaWxUeXBlfWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzZt8J+agCBFdmVudCBCdXM6ICAgXFx4MWJbMG0ke2V2ZW50QnVzTmFtZX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYFxceDFiWzM2bfCfk6YgUGF5bG9hZDpcXHgxYlswbWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShkZXRhaWwsIG51bGwsIDIpKTtcclxuICAgICAgY29uc29sZS5sb2coJ1xceDFiWzM1beKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxceDFiWzBtJyk7XHJcbiAgICAgIFxyXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBQdXRFdmVudHNDb21tYW5kKHtcclxuICAgICAgICBFbnRyaWVzOiBbe1xyXG4gICAgICAgICAgU291cmNlOiBzb3VyY2UsXHJcbiAgICAgICAgICBEZXRhaWxUeXBlOiBkZXRhaWxUeXBlLFxyXG4gICAgICAgICAgRGV0YWlsOiBKU09OLnN0cmluZ2lmeShkZXRhaWwpLFxyXG4gICAgICAgICAgRXZlbnRCdXNOYW1lOiBldmVudEJ1c05hbWUsXHJcbiAgICAgICAgfV0sXHJcbiAgICAgIH0pKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMm3inIUgRXZlbnQgcHVibGlzaGVkIHN1Y2Nlc3NmdWxseTogJHtkZXRhaWxUeXBlfVxceDFiWzBtYCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmxvZygnXFx4MWJbMzFt4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXFx4MWJbMG0nKTtcclxuICAgICAgY29uc29sZS5sb2coJ1xceDFiWzMxbeKdjCBFVkVOVEJSSURHRSBQVUJMSVNIIEZBSUxFRFxceDFiWzBtJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXHgxYlszMW3ilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcXHgxYlswbScpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcHVibGlzaCBjdXN0b20gZXZlbnQgdG8gRXZlbnRCcmlkZ2U6JywgZXJyb3IpO1xyXG4gICAgICBjb25zb2xlLmxvZygnXFx4MWJbMzFt4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXFx4MWJbMG0nKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmljIGV2ZW50IHB1Ymxpc2hlclxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgcHVibGlzaEV2ZW50KGV2ZW50OiBBZ2VudFJlcGx5RXZlbnQgfCBBZ2VudEVycm9yRXZlbnQgfCBBZ2VudFRyYWNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGV2ZW50QnVzTmFtZSA9IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNOYW1lIHx8IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNBcm47XHJcbiAgICBcclxuICAgIGlmICghZXZlbnRCdXNOYW1lKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPICBObyBFdmVudEJyaWRnZSBidXMgY29uZmlndXJlZCwgc2tpcHBpbmcgZXZlbnQgcHVibGljYXRpb24nKTtcclxuICAgICAgY29uc29sZS53YXJuKCcgICBFdmVudCB3b3VsZCBoYXZlIGJlZW46JywgeyBcclxuICAgICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSwgXHJcbiAgICAgICAgZGV0YWlsVHlwZTogZXZlbnRbJ2RldGFpbC10eXBlJ10sXHJcbiAgICAgICAgZGV0YWlsOiBldmVudC5kZXRhaWwgXHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc29sZS5sb2coJ1xceDFiWzM1beKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxceDFiWzBtJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXHgxYlszNW3wn5OkIFBVQkxJU0hJTkcgRVZFTlRCUklER0UgRVZFTlRcXHgxYlswbScpO1xyXG4gICAgICBjb25zb2xlLmxvZygnXFx4MWJbMzVt4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXFx4MWJbMG0nKTtcclxuICAgICAgY29uc29sZS5sb2coYFxceDFiWzM2bfCfjq8gU291cmNlOiAgICAgIFxceDFiWzBtJHtldmVudC5zb3VyY2V9YCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszNm3wn4+377iPICBEZXRhaWwgVHlwZTogXFx4MWJbMG0ke2V2ZW50WydkZXRhaWwtdHlwZSddfWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzZt8J+agCBFdmVudCBCdXM6ICAgXFx4MWJbMG0ke2V2ZW50QnVzTmFtZX1gKTtcclxuICAgICAgY29uc29sZS5sb2coYFxceDFiWzM2bfCfk6YgUGF5bG9hZDpcXHgxYlswbWApO1xyXG4gICAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShldmVudC5kZXRhaWwsIG51bGwsIDIpKTtcclxuICAgICAgY29uc29sZS5sb2coJ1xceDFiWzM1beKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxceDFiWzBtJyk7XHJcbiAgICAgIFxyXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBQdXRFdmVudHNDb21tYW5kKHtcclxuICAgICAgICBFbnRyaWVzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIFNvdXJjZTogZXZlbnQuc291cmNlLFxyXG4gICAgICAgICAgICBEZXRhaWxUeXBlOiBldmVudFsnZGV0YWlsLXR5cGUnXSxcclxuICAgICAgICAgICAgRGV0YWlsOiBKU09OLnN0cmluZ2lmeShldmVudC5kZXRhaWwpLFxyXG4gICAgICAgICAgICBFdmVudEJ1c05hbWU6IGV2ZW50QnVzTmFtZSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSkpO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMybeKchSBFdmVudCBwdWJsaXNoZWQgc3VjY2Vzc2Z1bGx5OiAke2V2ZW50WydkZXRhaWwtdHlwZSddfVxceDFiWzBtYCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmxvZygnXFx4MWJbMzFt4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXFx4MWJbMG0nKTtcclxuICAgICAgY29uc29sZS5sb2coJ1xceDFiWzMxbeKdjCBFVkVOVEJSSURHRSBQVUJMSVNIIEZBSUxFRFxceDFiWzBtJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXHgxYlszMW3ilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcXHgxYlswbScpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcHVibGlzaCBldmVudCB0byBFdmVudEJyaWRnZTonLCBlcnJvcik7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXHgxYlszMW3ilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcXHgxYlswbScpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBhZ2VudCByZXBseSBldmVudFxyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVBZ2VudFJlcGx5RXZlbnQoXHJcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxyXG4gICAgY29udGFjdFBrOiBzdHJpbmcsXHJcbiAgICB0ZXh0OiBzdHJpbmcsXHJcbiAgICBwcmVmZXJyZWRDaGFubmVsOiAnc21zJyB8ICdlbWFpbCcgfCAnY2hhdCcgfCAnYXBpJyxcclxuICAgIHJvdXRpbmc6IHtcclxuICAgICAgc21zPzogeyB0bzogc3RyaW5nIH07XHJcbiAgICAgIGVtYWlsPzogeyB0bzogc3RyaW5nIH07XHJcbiAgICAgIGNoYXQ/OiB7IHNlc3Npb25JZDogc3RyaW5nIH07XHJcbiAgICB9LFxyXG4gICAgb3B0aW9uczoge1xyXG4gICAgICBjb252ZXJzYXRpb25JZD86IHN0cmluZztcclxuICAgICAgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgfSA9IHt9XHJcbiAgKTogQWdlbnRSZXBseUV2ZW50IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNvdXJjZTogJ2t4Z2VuLmFnZW50JyxcclxuICAgICAgJ2RldGFpbC10eXBlJzogJ2FnZW50LnJlcGx5LmNyZWF0ZWQnLFxyXG4gICAgICBkZXRhaWw6IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBjb250YWN0X3BrOiBjb250YWN0UGssXHJcbiAgICAgICAgcHJlZmVycmVkQ2hhbm5lbCxcclxuICAgICAgICB0ZXh0LFxyXG4gICAgICAgIHJvdXRpbmcsXHJcbiAgICAgICAgY29udmVyc2F0aW9uX2lkOiBvcHRpb25zLmNvbnZlcnNhdGlvbklkLFxyXG4gICAgICAgIG1ldGFkYXRhOiBvcHRpb25zLm1ldGFkYXRhLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBhZ2VudCBlcnJvciBldmVudFxyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVBZ2VudEVycm9yRXZlbnQoXHJcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxyXG4gICAgZXJyb3I6IHN0cmluZyxcclxuICAgIG9wdGlvbnM6IHtcclxuICAgICAgY29udGFjdFBrPzogc3RyaW5nO1xyXG4gICAgICBzdGFjaz86IHN0cmluZztcclxuICAgICAgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICB9ID0ge31cclxuICApOiBBZ2VudEVycm9yRXZlbnQge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc291cmNlOiAna3hnZW4uYWdlbnQnLFxyXG4gICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQuZXJyb3InLFxyXG4gICAgICBkZXRhaWw6IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBjb250YWN0X3BrOiBvcHRpb25zLmNvbnRhY3RQayxcclxuICAgICAgICBlcnJvcixcclxuICAgICAgICBzdGFjazogb3B0aW9ucy5zdGFjayxcclxuICAgICAgICBjb250ZXh0OiBvcHRpb25zLmNvbnRleHQsXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGFnZW50IHRyYWNlIGV2ZW50XHJcbiAgICovXHJcbiAgc3RhdGljIGNyZWF0ZUFnZW50VHJhY2VFdmVudChcclxuICAgIHRlbmFudElkOiBzdHJpbmcsXHJcbiAgICBvcGVyYXRpb246IHN0cmluZyxcclxuICAgIG9wdGlvbnM6IHtcclxuICAgICAgY29udGFjdFBrPzogc3RyaW5nO1xyXG4gICAgICBkdXJhdGlvbk1zPzogbnVtYmVyO1xyXG4gICAgICBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICB9ID0ge31cclxuICApOiBBZ2VudFRyYWNlRXZlbnQge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc291cmNlOiAna3hnZW4uYWdlbnQnLFxyXG4gICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQudHJhY2UnLFxyXG4gICAgICBkZXRhaWw6IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBjb250YWN0X3BrOiBvcHRpb25zLmNvbnRhY3RQayxcclxuICAgICAgICBvcGVyYXRpb24sXHJcbiAgICAgICAgZHVyYXRpb25fbXM6IG9wdGlvbnMuZHVyYXRpb25NcyxcclxuICAgICAgICBtZXRhZGF0YTogb3B0aW9ucy5tZXRhZGF0YSxcclxuICAgICAgfSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQdWJsaXNoIExMTSB1c2FnZSBldmVudCBmb3IgY29zdCB0cmFja2luZ1xyXG4gICAqL1xyXG4gIGFzeW5jIHB1Ymxpc2hMTE1Vc2FnZSh1c2FnZTogTExNVXNhZ2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgLy8gQWx3YXlzIGxvZyBmb3IgZGVidWdnaW5nXHJcbiAgICBjb25zdCBjb3N0U3RyID0gdXNhZ2UuZXN0aW1hdGVkQ29zdFVzZCAhPT0gdW5kZWZpbmVkIFxyXG4gICAgICA/IGAsIENvc3Q9JCR7dXNhZ2UuZXN0aW1hdGVkQ29zdFVzZC50b0ZpeGVkKDYpfWAgXHJcbiAgICAgIDogJyc7XHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBMTE0gVXNhZ2UgWyR7dXNhZ2UucmVxdWVzdFR5cGV9XTogSW5wdXQ9JHt1c2FnZS5pbnB1dFRva2Vuc30sIE91dHB1dD0ke3VzYWdlLm91dHB1dFRva2Vuc30sIFRvdGFsPSR7dXNhZ2UudG90YWxUb2tlbnN9JHtjb3N0U3RyfWApO1xyXG4gICAgXHJcbiAgICBhd2FpdCB0aGlzLnB1Ymxpc2hDdXN0b21FdmVudChcclxuICAgICAgJ2t4Z2VuLmFnZW50JyxcclxuICAgICAgJ2xsbS51c2FnZScsXHJcbiAgICAgIHVzYWdlXHJcbiAgICApO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIExMTSBVc2FnZSBFdmVudCBmb3IgY29zdCB0cmFja2luZ1xyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBMTE1Vc2FnZUV2ZW50IHtcclxuICAvKiogVGVuYW50IGlkZW50aWZpZXIgKi9cclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIC8qKiBDaGFubmVsL2NvbnZlcnNhdGlvbiBpZGVudGlmaWVyICovXHJcbiAgY2hhbm5lbElkPzogc3RyaW5nO1xyXG4gIC8qKiBNZXNzYWdlIHNvdXJjZSAoY2hhdCwgc21zLCBlbWFpbCwgZXRjLikgKi9cclxuICBzb3VyY2U6IHN0cmluZztcclxuICAvKiogVHlwZSBvZiBMTE0gcmVxdWVzdCAqL1xyXG4gIHJlcXVlc3RUeXBlOiAnaW50ZW50X2RldGVjdGlvbicgfCAnY29udmVyc2F0aW9uYWxfcmVzcG9uc2UnIHwgJ2ZvbGxvd191cF9xdWVzdGlvbicgfCAndmVyaWZpY2F0aW9uX21lc3NhZ2UnIHwgJ2Vycm9yX3JlY292ZXJ5JyB8ICdlbmdhZ2VtZW50X3F1ZXN0aW9uJztcclxuICAvKiogTW9kZWwgaWRlbnRpZmllciAqL1xyXG4gIG1vZGVsOiBzdHJpbmc7XHJcbiAgLyoqIElucHV0IHRva2VucyBjb25zdW1lZCAqL1xyXG4gIGlucHV0VG9rZW5zOiBudW1iZXI7XHJcbiAgLyoqIE91dHB1dCB0b2tlbnMgZ2VuZXJhdGVkICovXHJcbiAgb3V0cHV0VG9rZW5zOiBudW1iZXI7XHJcbiAgLyoqIFRvdGFsIHRva2VucyAoaW5wdXQgKyBvdXRwdXQpICovXHJcbiAgdG90YWxUb2tlbnM6IG51bWJlcjtcclxuICAvKiogVGltZXN0YW1wICovXHJcbiAgdGltZXN0YW1wOiBzdHJpbmc7XHJcbiAgLyoqIE9wdGlvbmFsOiBFc3RpbWF0ZWQgY29zdCBpbiBVU0QgKGlmIHJhdGUgYXZhaWxhYmxlKSAqL1xyXG4gIGVzdGltYXRlZENvc3RVc2Q/OiBudW1iZXI7XHJcbn1cclxuIl19