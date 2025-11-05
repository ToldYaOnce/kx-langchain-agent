import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { AgentReplyEvent, AgentErrorEvent, AgentTraceEvent, RuntimeConfig } from '../types/index.js';

export class EventBridgeService {
  private client: EventBridgeClient;
  private config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.client = new EventBridgeClient({
      region: config.awsRegion,
    });
  }

  /**
   * Publish agent reply event to the injected EventBridge bus
   */
  async publishAgentReply(event: AgentReplyEvent): Promise<void> {
    await this.publishEvent(event);
  }

  /**
   * Publish agent error event
   */
  async publishAgentError(event: AgentErrorEvent): Promise<void> {
    await this.publishEvent(event);
  }

  /**
   * Publish agent trace event for telemetry
   */
  async publishAgentTrace(event: AgentTraceEvent): Promise<void> {
    await this.publishEvent(event);
  }

  /**
   * Generic event publisher
   */
  private async publishEvent(event: AgentReplyEvent | AgentErrorEvent | AgentTraceEvent): Promise<void> {
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
    } catch (error) {
      console.error('Failed to publish event to EventBridge:', error);
      throw error;
    }
  }

  /**
   * Create agent reply event
   */
  static createAgentReplyEvent(
    tenantId: string,
    contactPk: string,
    text: string,
    preferredChannel: 'sms' | 'email' | 'chat' | 'api',
    routing: {
      sms?: { to: string };
      email?: { to: string };
      chat?: { sessionId: string };
    },
    options: {
      conversationId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): AgentReplyEvent {
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
  static createAgentErrorEvent(
    tenantId: string,
    error: string,
    options: {
      contactPk?: string;
      stack?: string;
      context?: Record<string, any>;
    } = {}
  ): AgentErrorEvent {
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
  static createAgentTraceEvent(
    tenantId: string,
    operation: string,
    options: {
      contactPk?: string;
      durationMs?: number;
      metadata?: Record<string, any>;
    } = {}
  ): AgentTraceEvent {
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
