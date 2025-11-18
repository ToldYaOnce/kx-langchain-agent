import type { EventBridgeEvent, Context } from 'aws-lambda';
import { DynamoDBService } from '../lib/dynamodb.js';
import { EventBridgeService } from '../lib/eventbridge.js';
import { loadRuntimeConfig, validateRuntimeConfig } from '../lib/config.js';
import { InboundMessageEventSchema, type InboundMessageEvent } from '../types/index.js';

/**
 * Lambda handler for routing inbound messages
 * Triggered by EventBridge rule: lead.message.created
 */
export async function handler(
  event: EventBridgeEvent<'lead.message.created', InboundMessageEvent['detail']>,
  context: Context
): Promise<void> {
  console.log('AgentRouter received event:', JSON.stringify(event, null, 2));
  
  try {
    // Load and validate configuration
    const config = loadRuntimeConfig();
    validateRuntimeConfig(config);
    
    // Initialize services
    const dynamoService = new DynamoDBService(config);
    const eventBridgeService = new EventBridgeService(config);
    
    // Validate incoming event
    const validatedEvent = InboundMessageEventSchema.parse(event);
    const { detail } = validatedEvent;
    
    // Resolve contact information
    let emailLc = detail.email_lc;
    let leadId = detail.lead_id;
    
    // If we only have phone number, resolve to email_lc via leads table
    if (!emailLc && detail.phone_e164) {
      console.log(`Resolving contact from phone: ${detail.phone_e164}`);
      
      const resolvedEmailLc = await dynamoService.resolveContactFromPhone(
        detail.tenantId,
        detail.phone_e164
      );
      
      if (!resolvedEmailLc) {
        console.error(`Could not resolve contact for phone: ${detail.phone_e164}`);
        
        // Emit error event
        await eventBridgeService.publishAgentError(
          EventBridgeService.createAgentErrorEvent(
            detail.tenantId,
            `Could not resolve contact for phone: ${detail.phone_e164}`,
            {
              context: {
                phone_e164: detail.phone_e164,
                source: detail.source,
              },
            }
          )
        );
        
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
    const { handler: agentHandler } = await import('./agent.js');
    
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
    
  } catch (error) {
    console.error('AgentRouter error:', error);
    
    // Try to emit error event if we have enough context
    try {
      const config = loadRuntimeConfig();
      const eventBridgeService = new EventBridgeService(config);
      
      await eventBridgeService.publishAgentError(
        EventBridgeService.createAgentErrorEvent(
          event.detail?.tenantId || 'unknown',
          error instanceof Error ? error.message : 'Unknown router error',
          {
            stack: error instanceof Error ? error.stack : undefined,
            context: {
              event_source: event.source,
              event_detail_type: event['detail-type'],
            },
          }
        )
      );
    } catch (eventError) {
      console.error('Failed to emit error event:', eventError);
    }
    
    throw error;
  }
}
