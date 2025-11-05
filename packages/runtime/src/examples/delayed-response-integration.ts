// Note: In production, this would be: import { scheduleActions, estimateTokenCount } from "@toldyaonce/kx-agent-core";
// For now, we'll create a local interface to avoid cross-package compilation issues

interface Timing {
  read_ms: number;
  comprehension_ms: number;
  write_ms: number;
  type_ms: number;
  jitter_ms: number;
  pauses_ms?: number;
  total_ms: number;
}

// Placeholder function - replace with actual import in production
async function scheduleActions(params: {
  queueUrl: string;
  tenantId: string;
  contact_pk: string;
  conversation_id?: string;
  channel: 'sms' | 'email' | 'chat' | 'api';
  personaName: string;
  message_id: string;
  replyText: string;
  inputChars: number;
  inputTokens: number;
}): Promise<Timing> {
  // This is a placeholder - actual implementation would use @toldyaonce/kx-agent-core
  console.log('scheduleActions called with:', params);
  return {
    read_ms: 1000,
    comprehension_ms: 500,
    write_ms: 2000,
    type_ms: 3000,
    jitter_ms: 500,
    pauses_ms: 0,
    total_ms: 7000
  };
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
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
    source: 'sms' | 'email' | 'chat' | 'api';
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
        replyText: typeof response === 'string' ? response : 'No response generated',
        inputChars: text.length,
        inputTokens: estimateTokenCount(text)
      });

      // Log timing for telemetry
      const replyText = typeof response === 'string' ? response : 'No response generated';
      console.log('Scheduled delayed response', {
        tenantId,
        conversation_id,
        personaName,
        timing,
        replyLength: replyText.length
      });

      // Emit trace event for monitoring (placeholder - replace with actual EventBridge service)
      console.log('Trace event:', {
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
            replyLength: replyText.length
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
      
      // Emit error event (placeholder - replace with actual EventBridge service)
      console.log('Error event:', {
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
    source: 'sms' | 'email' | 'chat' | 'api';
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
    messagesTable: process.env.MESSAGES_TABLE || 'messages',
    leadsTable: process.env.LEADS_TABLE || 'leads',
    bedrockModelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514-v1:0',
    historyLimit: 50,
    awsRegion: process.env.AWS_REGION || 'us-east-1'
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
