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
            console.warn('No EventBridge bus configured, skipping event publication');
            return;
        }
        try {
            await this.client.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [{
                        Source: source,
                        DetailType: detailType,
                        Detail: JSON.stringify(detail),
                        EventBusName: eventBusName,
                    }],
            }));
        }
        catch (error) {
            console.error('Failed to publish custom event to EventBridge:', error);
            throw error;
        }
    }
    /**
     * Generic event publisher
     */
    async publishEvent(event) {
        const eventBusName = this.config.outboundEventBusName || this.config.outboundEventBusArn;
        if (!eventBusName) {
            console.warn('No EventBridge bus configured, skipping event publication');
            return;
        }
        try {
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
        }
        catch (error) {
            console.error('Failed to publish event to EventBridge:', error);
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
}
exports.EventBridgeService = EventBridgeService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnRicmlkZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2V2ZW50YnJpZGdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG9FQUFrRjtBQUdsRixNQUFhLGtCQUFrQjtJQUk3QixZQUFZLE1BQXFCO1FBQy9CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQztZQUNsQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVM7U0FDekIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEtBQXNCO1FBQzVDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsaUJBQWlCLENBQUMsS0FBc0I7UUFDNUMsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxLQUFzQjtRQUM1QyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQWMsRUFBRSxVQUFrQixFQUFFLE1BQVc7UUFDdEUsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDO1FBRXpGLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNsQixPQUFPLENBQUMsSUFBSSxDQUFDLDJEQUEyRCxDQUFDLENBQUM7WUFDMUUsT0FBTztRQUNULENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsSUFB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QU8sQ0FBQyxRQUFRO2FBQzNCO1NBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQXhLRCxnREF3S0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEJyaWRnZUNsaWVudCwgUHV0RXZlbnRzQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1ldmVudGJyaWRnZSc7XHJcbmltcG9ydCB0eXBlIHsgQWdlbnRSZXBseUV2ZW50LCBBZ2VudEVycm9yRXZlbnQsIEFnZW50VHJhY2VFdmVudCwgUnVudGltZUNvbmZpZyB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcclxuXHJcbmV4cG9ydCBjbGFzcyBFdmVudEJyaWRnZVNlcnZpY2Uge1xyXG4gIHByaXZhdGUgY2xpZW50OiBFdmVudEJyaWRnZUNsaWVudDtcclxuICBwcml2YXRlIGNvbmZpZzogUnVudGltZUNvbmZpZztcclxuXHJcbiAgY29uc3RydWN0b3IoY29uZmlnOiBSdW50aW1lQ29uZmlnKSB7XHJcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgIHRoaXMuY2xpZW50ID0gbmV3IEV2ZW50QnJpZGdlQ2xpZW50KHtcclxuICAgICAgcmVnaW9uOiBjb25maWcuYXdzUmVnaW9uLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQdWJsaXNoIGFnZW50IHJlcGx5IGV2ZW50IHRvIHRoZSBpbmplY3RlZCBFdmVudEJyaWRnZSBidXNcclxuICAgKi9cclxuICBhc3luYyBwdWJsaXNoQWdlbnRSZXBseShldmVudDogQWdlbnRSZXBseUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhd2FpdCB0aGlzLnB1Ymxpc2hFdmVudChldmVudCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQdWJsaXNoIGFnZW50IGVycm9yIGV2ZW50XHJcbiAgICovXHJcbiAgYXN5bmMgcHVibGlzaEFnZW50RXJyb3IoZXZlbnQ6IEFnZW50RXJyb3JFdmVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgdGhpcy5wdWJsaXNoRXZlbnQoZXZlbnQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBhZ2VudCB0cmFjZSBldmVudCBmb3IgdGVsZW1ldHJ5XHJcbiAgICovXHJcbiAgYXN5bmMgcHVibGlzaEFnZW50VHJhY2UoZXZlbnQ6IEFnZW50VHJhY2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgdGhpcy5wdWJsaXNoRXZlbnQoZXZlbnQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBhIGN1c3RvbSBldmVudCB0byBFdmVudEJyaWRnZVxyXG4gICAqL1xyXG4gIGFzeW5jIHB1Ymxpc2hDdXN0b21FdmVudChzb3VyY2U6IHN0cmluZywgZGV0YWlsVHlwZTogc3RyaW5nLCBkZXRhaWw6IGFueSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgZXZlbnRCdXNOYW1lID0gdGhpcy5jb25maWcub3V0Ym91bmRFdmVudEJ1c05hbWUgfHwgdGhpcy5jb25maWcub3V0Ym91bmRFdmVudEJ1c0FybjtcclxuICAgIFxyXG4gICAgaWYgKCFldmVudEJ1c05hbWUpIHtcclxuICAgICAgY29uc29sZS53YXJuKCdObyBFdmVudEJyaWRnZSBidXMgY29uZmlndXJlZCwgc2tpcHBpbmcgZXZlbnQgcHVibGljYXRpb24nKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IFB1dEV2ZW50c0NvbW1hbmQoe1xyXG4gICAgICAgIEVudHJpZXM6IFt7XHJcbiAgICAgICAgICBTb3VyY2U6IHNvdXJjZSxcclxuICAgICAgICAgIERldGFpbFR5cGU6IGRldGFpbFR5cGUsXHJcbiAgICAgICAgICBEZXRhaWw6IEpTT04uc3RyaW5naWZ5KGRldGFpbCksXHJcbiAgICAgICAgICBFdmVudEJ1c05hbWU6IGV2ZW50QnVzTmFtZSxcclxuICAgICAgICB9XSxcclxuICAgICAgfSkpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHB1Ymxpc2ggY3VzdG9tIGV2ZW50IHRvIEV2ZW50QnJpZGdlOicsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZW5lcmljIGV2ZW50IHB1Ymxpc2hlclxyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgcHVibGlzaEV2ZW50KGV2ZW50OiBBZ2VudFJlcGx5RXZlbnQgfCBBZ2VudEVycm9yRXZlbnQgfCBBZ2VudFRyYWNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IGV2ZW50QnVzTmFtZSA9IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNOYW1lIHx8IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNBcm47XHJcbiAgICBcclxuICAgIGlmICghZXZlbnRCdXNOYW1lKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybignTm8gRXZlbnRCcmlkZ2UgYnVzIGNvbmZpZ3VyZWQsIHNraXBwaW5nIGV2ZW50IHB1YmxpY2F0aW9uJyk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBQdXRFdmVudHNDb21tYW5kKHtcclxuICAgICAgICBFbnRyaWVzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIFNvdXJjZTogZXZlbnQuc291cmNlLFxyXG4gICAgICAgICAgICBEZXRhaWxUeXBlOiBldmVudFsnZGV0YWlsLXR5cGUnXSxcclxuICAgICAgICAgICAgRGV0YWlsOiBKU09OLnN0cmluZ2lmeShldmVudC5kZXRhaWwpLFxyXG4gICAgICAgICAgICBFdmVudEJ1c05hbWU6IGV2ZW50QnVzTmFtZSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSkpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHB1Ymxpc2ggZXZlbnQgdG8gRXZlbnRCcmlkZ2U6JywgZXJyb3IpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBhZ2VudCByZXBseSBldmVudFxyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVBZ2VudFJlcGx5RXZlbnQoXHJcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxyXG4gICAgY29udGFjdFBrOiBzdHJpbmcsXHJcbiAgICB0ZXh0OiBzdHJpbmcsXHJcbiAgICBwcmVmZXJyZWRDaGFubmVsOiAnc21zJyB8ICdlbWFpbCcgfCAnY2hhdCcgfCAnYXBpJyxcclxuICAgIHJvdXRpbmc6IHtcclxuICAgICAgc21zPzogeyB0bzogc3RyaW5nIH07XHJcbiAgICAgIGVtYWlsPzogeyB0bzogc3RyaW5nIH07XHJcbiAgICAgIGNoYXQ/OiB7IHNlc3Npb25JZDogc3RyaW5nIH07XHJcbiAgICB9LFxyXG4gICAgb3B0aW9uczoge1xyXG4gICAgICBjb252ZXJzYXRpb25JZD86IHN0cmluZztcclxuICAgICAgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgfSA9IHt9XHJcbiAgKTogQWdlbnRSZXBseUV2ZW50IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNvdXJjZTogJ2t4Z2VuLmFnZW50JyxcclxuICAgICAgJ2RldGFpbC10eXBlJzogJ2FnZW50LnJlcGx5LmNyZWF0ZWQnLFxyXG4gICAgICBkZXRhaWw6IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBjb250YWN0X3BrOiBjb250YWN0UGssXHJcbiAgICAgICAgcHJlZmVycmVkQ2hhbm5lbCxcclxuICAgICAgICB0ZXh0LFxyXG4gICAgICAgIHJvdXRpbmcsXHJcbiAgICAgICAgY29udmVyc2F0aW9uX2lkOiBvcHRpb25zLmNvbnZlcnNhdGlvbklkLFxyXG4gICAgICAgIG1ldGFkYXRhOiBvcHRpb25zLm1ldGFkYXRhLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBhZ2VudCBlcnJvciBldmVudFxyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVBZ2VudEVycm9yRXZlbnQoXHJcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxyXG4gICAgZXJyb3I6IHN0cmluZyxcclxuICAgIG9wdGlvbnM6IHtcclxuICAgICAgY29udGFjdFBrPzogc3RyaW5nO1xyXG4gICAgICBzdGFjaz86IHN0cmluZztcclxuICAgICAgY29udGV4dD86IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICB9ID0ge31cclxuICApOiBBZ2VudEVycm9yRXZlbnQge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc291cmNlOiAna3hnZW4uYWdlbnQnLFxyXG4gICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQuZXJyb3InLFxyXG4gICAgICBkZXRhaWw6IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBjb250YWN0X3BrOiBvcHRpb25zLmNvbnRhY3RQayxcclxuICAgICAgICBlcnJvcixcclxuICAgICAgICBzdGFjazogb3B0aW9ucy5zdGFjayxcclxuICAgICAgICBjb250ZXh0OiBvcHRpb25zLmNvbnRleHQsXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIGFnZW50IHRyYWNlIGV2ZW50XHJcbiAgICovXHJcbiAgc3RhdGljIGNyZWF0ZUFnZW50VHJhY2VFdmVudChcclxuICAgIHRlbmFudElkOiBzdHJpbmcsXHJcbiAgICBvcGVyYXRpb246IHN0cmluZyxcclxuICAgIG9wdGlvbnM6IHtcclxuICAgICAgY29udGFjdFBrPzogc3RyaW5nO1xyXG4gICAgICBkdXJhdGlvbk1zPzogbnVtYmVyO1xyXG4gICAgICBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICB9ID0ge31cclxuICApOiBBZ2VudFRyYWNlRXZlbnQge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc291cmNlOiAna3hnZW4uYWdlbnQnLFxyXG4gICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQudHJhY2UnLFxyXG4gICAgICBkZXRhaWw6IHtcclxuICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICBjb250YWN0X3BrOiBvcHRpb25zLmNvbnRhY3RQayxcclxuICAgICAgICBvcGVyYXRpb24sXHJcbiAgICAgICAgZHVyYXRpb25fbXM6IG9wdGlvbnMuZHVyYXRpb25NcyxcclxuICAgICAgICBtZXRhZGF0YTogb3B0aW9ucy5tZXRhZGF0YSxcclxuICAgICAgfSxcclxuICAgIH07XHJcbiAgfVxyXG59XHJcbiJdfQ==