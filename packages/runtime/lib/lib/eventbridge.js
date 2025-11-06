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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnRicmlkZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2V2ZW50YnJpZGdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG9FQUFrRjtBQUdsRixNQUFhLGtCQUFrQjtJQUk3QixZQUFZLE1BQXFCO1FBQy9CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQztZQUNsQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVM7U0FDekIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEtBQXNCO1FBQzVDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsaUJBQWlCLENBQUMsS0FBc0I7UUFDNUMsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxLQUFzQjtRQUM1QyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUEwRDtRQUNuRixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLG9CQUFvQixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUM7UUFFekYsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkRBQTJELENBQUMsQ0FBQztZQUMxRSxPQUFPO1FBQ1QsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxxQ0FBZ0IsQ0FBQztnQkFDMUMsT0FBTyxFQUFFO29CQUNQO3dCQUNFLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTt3QkFDcEIsVUFBVSxFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUM7d0JBQ2hDLE1BQU0sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7d0JBQ3BDLFlBQVksRUFBRSxZQUFZO3FCQUMzQjtpQkFDRjthQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxxQkFBcUIsQ0FDMUIsUUFBZ0IsRUFDaEIsU0FBaUIsRUFDakIsSUFBWSxFQUNaLGdCQUFrRCxFQUNsRCxPQUlDLEVBQ0QsVUFHSSxFQUFFO1FBRU4sT0FBTztZQUNMLE1BQU0sRUFBRSxhQUFhO1lBQ3JCLGFBQWEsRUFBRSxxQkFBcUI7WUFDcEMsTUFBTSxFQUFFO2dCQUNOLFFBQVE7Z0JBQ1IsVUFBVSxFQUFFLFNBQVM7Z0JBQ3JCLGdCQUFnQjtnQkFDaEIsSUFBSTtnQkFDSixPQUFPO2dCQUNQLGVBQWUsRUFBRSxPQUFPLENBQUMsY0FBYztnQkFDdkMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRO2FBQzNCO1NBQ0YsQ0FBQztJQUNKLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxxQkFBcUIsQ0FDMUIsUUFBZ0IsRUFDaEIsS0FBYSxFQUNiLFVBSUksRUFBRTtRQUVOLE9BQU87WUFDTCxNQUFNLEVBQUUsYUFBYTtZQUNyQixhQUFhLEVBQUUsYUFBYTtZQUM1QixNQUFNLEVBQUU7Z0JBQ04sUUFBUTtnQkFDUixVQUFVLEVBQUUsT0FBTyxDQUFDLFNBQVM7Z0JBQzdCLEtBQUs7Z0JBQ0wsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLO2dCQUNwQixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87YUFDekI7U0FDRixDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLHFCQUFxQixDQUMxQixRQUFnQixFQUNoQixTQUFpQixFQUNqQixVQUlJLEVBQUU7UUFFTixPQUFPO1lBQ0wsTUFBTSxFQUFFLGFBQWE7WUFDckIsYUFBYSxFQUFFLGFBQWE7WUFDNUIsTUFBTSxFQUFFO2dCQUNOLFFBQVE7Z0JBQ1IsVUFBVSxFQUFFLE9BQU8sQ0FBQyxTQUFTO2dCQUM3QixTQUFTO2dCQUNULFdBQVcsRUFBRSxPQUFPLENBQUMsVUFBVTtnQkFDL0IsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRO2FBQzNCO1NBQ0YsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTlJRCxnREE4SUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFdmVudEJyaWRnZUNsaWVudCwgUHV0RXZlbnRzQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1ldmVudGJyaWRnZSc7XHJcbmltcG9ydCB0eXBlIHsgQWdlbnRSZXBseUV2ZW50LCBBZ2VudEVycm9yRXZlbnQsIEFnZW50VHJhY2VFdmVudCwgUnVudGltZUNvbmZpZyB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcclxuXHJcbmV4cG9ydCBjbGFzcyBFdmVudEJyaWRnZVNlcnZpY2Uge1xyXG4gIHByaXZhdGUgY2xpZW50OiBFdmVudEJyaWRnZUNsaWVudDtcclxuICBwcml2YXRlIGNvbmZpZzogUnVudGltZUNvbmZpZztcclxuXHJcbiAgY29uc3RydWN0b3IoY29uZmlnOiBSdW50aW1lQ29uZmlnKSB7XHJcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgIHRoaXMuY2xpZW50ID0gbmV3IEV2ZW50QnJpZGdlQ2xpZW50KHtcclxuICAgICAgcmVnaW9uOiBjb25maWcuYXdzUmVnaW9uLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQdWJsaXNoIGFnZW50IHJlcGx5IGV2ZW50IHRvIHRoZSBpbmplY3RlZCBFdmVudEJyaWRnZSBidXNcclxuICAgKi9cclxuICBhc3luYyBwdWJsaXNoQWdlbnRSZXBseShldmVudDogQWdlbnRSZXBseUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhd2FpdCB0aGlzLnB1Ymxpc2hFdmVudChldmVudCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQdWJsaXNoIGFnZW50IGVycm9yIGV2ZW50XHJcbiAgICovXHJcbiAgYXN5bmMgcHVibGlzaEFnZW50RXJyb3IoZXZlbnQ6IEFnZW50RXJyb3JFdmVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgdGhpcy5wdWJsaXNoRXZlbnQoZXZlbnQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHVibGlzaCBhZ2VudCB0cmFjZSBldmVudCBmb3IgdGVsZW1ldHJ5XHJcbiAgICovXHJcbiAgYXN5bmMgcHVibGlzaEFnZW50VHJhY2UoZXZlbnQ6IEFnZW50VHJhY2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgdGhpcy5wdWJsaXNoRXZlbnQoZXZlbnQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2VuZXJpYyBldmVudCBwdWJsaXNoZXJcclxuICAgKi9cclxuICBwcml2YXRlIGFzeW5jIHB1Ymxpc2hFdmVudChldmVudDogQWdlbnRSZXBseUV2ZW50IHwgQWdlbnRFcnJvckV2ZW50IHwgQWdlbnRUcmFjZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBldmVudEJ1c05hbWUgPSB0aGlzLmNvbmZpZy5vdXRib3VuZEV2ZW50QnVzTmFtZSB8fCB0aGlzLmNvbmZpZy5vdXRib3VuZEV2ZW50QnVzQXJuO1xyXG4gICAgXHJcbiAgICBpZiAoIWV2ZW50QnVzTmFtZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ05vIEV2ZW50QnJpZGdlIGJ1cyBjb25maWd1cmVkLCBza2lwcGluZyBldmVudCBwdWJsaWNhdGlvbicpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgUHV0RXZlbnRzQ29tbWFuZCh7XHJcbiAgICAgICAgRW50cmllczogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBTb3VyY2U6IGV2ZW50LnNvdXJjZSxcclxuICAgICAgICAgICAgRGV0YWlsVHlwZTogZXZlbnRbJ2RldGFpbC10eXBlJ10sXHJcbiAgICAgICAgICAgIERldGFpbDogSlNPTi5zdHJpbmdpZnkoZXZlbnQuZGV0YWlsKSxcclxuICAgICAgICAgICAgRXZlbnRCdXNOYW1lOiBldmVudEJ1c05hbWUsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwdWJsaXNoIGV2ZW50IHRvIEV2ZW50QnJpZGdlOicsIGVycm9yKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgYWdlbnQgcmVwbHkgZXZlbnRcclxuICAgKi9cclxuICBzdGF0aWMgY3JlYXRlQWdlbnRSZXBseUV2ZW50KFxyXG4gICAgdGVuYW50SWQ6IHN0cmluZyxcclxuICAgIGNvbnRhY3RQazogc3RyaW5nLFxyXG4gICAgdGV4dDogc3RyaW5nLFxyXG4gICAgcHJlZmVycmVkQ2hhbm5lbDogJ3NtcycgfCAnZW1haWwnIHwgJ2NoYXQnIHwgJ2FwaScsXHJcbiAgICByb3V0aW5nOiB7XHJcbiAgICAgIHNtcz86IHsgdG86IHN0cmluZyB9O1xyXG4gICAgICBlbWFpbD86IHsgdG86IHN0cmluZyB9O1xyXG4gICAgICBjaGF0PzogeyBzZXNzaW9uSWQ6IHN0cmluZyB9O1xyXG4gICAgfSxcclxuICAgIG9wdGlvbnM6IHtcclxuICAgICAgY29udmVyc2F0aW9uSWQ/OiBzdHJpbmc7XHJcbiAgICAgIG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgYW55PjtcclxuICAgIH0gPSB7fVxyXG4gICk6IEFnZW50UmVwbHlFdmVudCB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzb3VyY2U6ICdreGdlbi5hZ2VudCcsXHJcbiAgICAgICdkZXRhaWwtdHlwZSc6ICdhZ2VudC5yZXBseS5jcmVhdGVkJyxcclxuICAgICAgZGV0YWlsOiB7XHJcbiAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgY29udGFjdF9wazogY29udGFjdFBrLFxyXG4gICAgICAgIHByZWZlcnJlZENoYW5uZWwsXHJcbiAgICAgICAgdGV4dCxcclxuICAgICAgICByb3V0aW5nLFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbl9pZDogb3B0aW9ucy5jb252ZXJzYXRpb25JZCxcclxuICAgICAgICBtZXRhZGF0YTogb3B0aW9ucy5tZXRhZGF0YSxcclxuICAgICAgfSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgYWdlbnQgZXJyb3IgZXZlbnRcclxuICAgKi9cclxuICBzdGF0aWMgY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxyXG4gICAgdGVuYW50SWQ6IHN0cmluZyxcclxuICAgIGVycm9yOiBzdHJpbmcsXHJcbiAgICBvcHRpb25zOiB7XHJcbiAgICAgIGNvbnRhY3RQaz86IHN0cmluZztcclxuICAgICAgc3RhY2s/OiBzdHJpbmc7XHJcbiAgICAgIGNvbnRleHQ/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgfSA9IHt9XHJcbiAgKTogQWdlbnRFcnJvckV2ZW50IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNvdXJjZTogJ2t4Z2VuLmFnZW50JyxcclxuICAgICAgJ2RldGFpbC10eXBlJzogJ2FnZW50LmVycm9yJyxcclxuICAgICAgZGV0YWlsOiB7XHJcbiAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgY29udGFjdF9wazogb3B0aW9ucy5jb250YWN0UGssXHJcbiAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgc3RhY2s6IG9wdGlvbnMuc3RhY2ssXHJcbiAgICAgICAgY29udGV4dDogb3B0aW9ucy5jb250ZXh0LFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENyZWF0ZSBhZ2VudCB0cmFjZSBldmVudFxyXG4gICAqL1xyXG4gIHN0YXRpYyBjcmVhdGVBZ2VudFRyYWNlRXZlbnQoXHJcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxyXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXHJcbiAgICBvcHRpb25zOiB7XHJcbiAgICAgIGNvbnRhY3RQaz86IHN0cmluZztcclxuICAgICAgZHVyYXRpb25Ncz86IG51bWJlcjtcclxuICAgICAgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgfSA9IHt9XHJcbiAgKTogQWdlbnRUcmFjZUV2ZW50IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNvdXJjZTogJ2t4Z2VuLmFnZW50JyxcclxuICAgICAgJ2RldGFpbC10eXBlJzogJ2FnZW50LnRyYWNlJyxcclxuICAgICAgZGV0YWlsOiB7XHJcbiAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgY29udGFjdF9wazogb3B0aW9ucy5jb250YWN0UGssXHJcbiAgICAgICAgb3BlcmF0aW9uLFxyXG4gICAgICAgIGR1cmF0aW9uX21zOiBvcHRpb25zLmR1cmF0aW9uTXMsXHJcbiAgICAgICAgbWV0YWRhdGE6IG9wdGlvbnMubWV0YWRhdGEsXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG4iXX0=