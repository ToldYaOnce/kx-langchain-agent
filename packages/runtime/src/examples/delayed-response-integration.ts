import { scheduleActions, estimateTokenCount } from "../../../agent-core/src/composeAndSchedule";
import { AgentService } from "../lib/agent";
import { EventBridgeService } from "../lib/eventbridge";
import { RuntimeConfig } from "../types/index";

/**
 * Enhanced Agent Service that integrates delayed human-like responses
 */
export class DelayedResponseAgentService extends AgentService {
  private releaseQueueUrl: string;

  constructor(config: RuntimeConfig, releaseQueueUrl: string) {
    super(config);
    this.releaseQueueUrl = releaseQueueUrl;
  }

  /**
   * Process message with delayed response scheduling
   * This replaces the immediate agent.reply.created emission
   */
  async processMessageWithDelayedResponse(params: {
    tenantId: string;
    email_lc?: string;
    phone_e164?: string;
    text: string;
    source: 'sms' | 'email' | 'chat' | 'api' | 'agent';
    conversation_id?: string;
    message_id?: string;
    personaName?: 'Carlos' | 'Alex' | 'Sam';
  }) {
    const {
      tenantId,
      email_lc,
      phone_e164,
      text,
      source,
      conversation_id,
      message_id,
      personaName = 'Carlos'
    } = params;

    try {
      // Process message using existing agent logic
      const response = await this.processMessage({
        tenantId,
        email_lc: email_lc || '',
        text,
        source
      });

      // Generate contact primary key
      const contact_pk = `contact#${email_lc || phone_e164 || 'unknown'}`;

      // Schedule delayed actions instead of immediate response
      const timing = await scheduleActions({
        queueUrl: this.releaseQueueUrl,
        tenantId,
        contact_pk,
        conversation_id,
        channel: source,
        personaName,
        message_id: message_id || `msg-${Date.now()}`,
        replyText: response.text,
        inputChars: text.length,
        inputTokens: estimateTokenCount(text)
      });

      // Log timing for telemetry
      console.log('Scheduled delayed response', {
        tenantId,
        conversation_id,
        personaName,
        timing,
        replyLength: response.text.length
      });

      // Emit trace event for monitoring
      await EventBridgeService.publishEvent({
        source: 'kxgen.agent',
        detailType: 'agent.trace',
        detail: {
          tenantId,
          contact_pk,
          operation: 'delayed_response_scheduled',
          metadata: {
            timing,
            persona: personaName,
            channel: source,
            inputLength: text.length,
            replyLength: response.text.length
          }
        }
      });

      return {
        success: true,
        timing,
        message: 'Response scheduled for delayed delivery'
      };

    } catch (error) {
      console.error('Failed to process message with delayed response:', error);
      
      // Emit error event
      await EventBridgeService.publishEvent({
        source: 'kxgen.agent',
        detailType: 'agent.error',
        detail: {
          tenantId,
          contact_pk: `contact#${email_lc || phone_e164 || 'unknown'}`,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          context: {
            operation: 'delayed_response_processing',
            source,
            messageLength: text.length
          }
        }
      });

      throw error;
    }
  }

  /**
   * Emergency bypass for immediate responses (human takeover, urgent messages)
   */
  async processMessageImmediate(params: {
    tenantId: string;
    email_lc?: string;
    phone_e164?: string;
    text: string;
    source: 'sms' | 'email' | 'chat' | 'api' | 'agent';
    reason?: string;
  }) {
    console.log('Processing immediate response (bypassing delays)', {
      tenantId: params.tenantId,
      reason: params.reason || 'emergency_bypass'
    });

    // Use original immediate processing
    return this.processMessage({
      tenantId: params.tenantId,
      email_lc: params.email_lc || '',
      text: params.text,
      source: params.source
    });
  }
}

/**
 * Factory function for creating delayed response agent
 */
export function createDelayedResponseAgent(
  config: RuntimeConfig,
  releaseQueueUrl: string
): DelayedResponseAgentService {
  return new DelayedResponseAgentService(config, releaseQueueUrl);
}

/**
 * Lambda handler that uses delayed responses
 */
export async function delayedResponseHandler(event: any) {
  const releaseQueueUrl = process.env.RELEASE_QUEUE_URL;
  if (!releaseQueueUrl) {
    throw new Error('RELEASE_QUEUE_URL environment variable is required');
  }

  // Create agent with delayed response capability
  const agent = createDelayedResponseAgent({
    // ... your runtime config
  }, releaseQueueUrl);

  // Determine if this should be immediate or delayed
  const isUrgent = event.detail.text?.toLowerCase().includes('urgent') || 
                   event.detail.text?.toLowerCase().includes('emergency');

  if (isUrgent) {
    // Process immediately for urgent messages
    return agent.processMessageImmediate({
      tenantId: event.detail.tenantId,
      email_lc: event.detail.email_lc,
      phone_e164: event.detail.phone_e164,
      text: event.detail.text,
      source: event.detail.source,
      reason: 'urgent_message'
    });
  } else {
    // Process with delayed response
    return agent.processMessageWithDelayedResponse({
      tenantId: event.detail.tenantId,
      email_lc: event.detail.email_lc,
      phone_e164: event.detail.phone_e164,
      text: event.detail.text,
      source: event.detail.source,
      conversation_id: event.detail.conversation_id,
      message_id: event.detail.message_id,
      personaName: event.detail.persona || 'Carlos'
    });
  }
}
