import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
export class EventBridgeService {
    client;
    config;
    constructor(config) {
        this.config = config;
        this.client = new EventBridgeClient({
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
            await this.client.send(new PutEventsCommand({
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
//# sourceMappingURL=eventbridge.js.map