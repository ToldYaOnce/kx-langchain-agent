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
   * Publish a custom event to EventBridge
   */
  async publishCustomEvent(source: string, detailType: string, detail: any): Promise<void> {
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
      
      await this.client.send(new PutEventsCommand({
        Entries: [{
          Source: source,
          DetailType: detailType,
          Detail: JSON.stringify(detail),
          EventBusName: eventBusName,
        }],
      }));
      
      console.log(`\x1b[32m✅ Event published successfully: ${detailType}\x1b[0m`);
    } catch (error) {
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
  private async publishEvent(event: AgentReplyEvent | AgentErrorEvent | AgentTraceEvent): Promise<void> {
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
      
      console.log(`\x1b[32m✅ Event published successfully: ${event['detail-type']}\x1b[0m`);
    } catch (error) {
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

  /**
   * Publish LLM usage event for cost tracking
   */
  async publishLLMUsage(usage: LLMUsageEvent): Promise<void> {
    // Always log for debugging
    const costStr = usage.estimatedCostUsd !== undefined 
      ? `, Cost=$${usage.estimatedCostUsd.toFixed(6)}` 
      : '';
    console.log(`📊 LLM Usage [${usage.requestType}]: Input=${usage.inputTokens}, Output=${usage.outputTokens}, Total=${usage.totalTokens}${costStr}`);
    
    await this.publishCustomEvent(
      'kxgen.agent',
      'llm.usage',
      usage
    );
  }
}

/**
 * LLM Usage Event for cost tracking
 */
export interface LLMUsageEvent {
  /** Tenant identifier */
  tenantId: string;
  /** Channel/conversation identifier */
  channelId?: string;
  /** Message source (chat, sms, email, etc.) */
  source: string;
  /** Type of LLM request */
  requestType: 'intent_detection' | 'conversational_response' | 'follow_up_question' | 'verification_message' | 'error_recovery' | 'engagement_question';
  /** Model identifier */
  model: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Timestamp */
  timestamp: string;
  /** Optional: Estimated cost in USD (if rate available) */
  estimatedCostUsd?: number;
}
