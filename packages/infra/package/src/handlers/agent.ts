import type { Context } from 'aws-lambda';
import { DynamoDBService } from '../lib/dynamodb.js';
import { EventBridgeService } from '../lib/eventbridge.js';
import { AgentService } from '../lib/agent.js';
import { loadRuntimeConfig, validateRuntimeConfig } from '../lib/config.js';
import type { AgentContext, AgentResponse } from '../types/index.js';

/**
 * Agent invocation context (internal event from router)
 */
export interface AgentInvocationEvent extends AgentContext {
  message_ts: string; // Timestamp of the message that triggered this
}

/**
 * Lambda handler for processing agent responses
 * Invoked by AgentRouterFn with processed context
 */
export async function handler(
  event: AgentInvocationEvent,
  context: Context
): Promise<void> {
  console.log('Agent received event:', JSON.stringify(event, null, 2));
  
  try {
    // Load and validate configuration
    const config = loadRuntimeConfig();
    validateRuntimeConfig(config);
    
    // Initialize services
    const dynamoService = new DynamoDBService(config);
    const eventBridgeService = new EventBridgeService(config);
    
    // Create agent service
    const agentService = new AgentService({
      ...config,
      dynamoService,
      eventBridgeService,
    });
    
    // Process the message and generate response
    console.log(`Processing message for ${event.tenantId}/${event.email_lc}`);
    
    const response = await agentService.processMessage({
      tenantId: event.tenantId,
      email_lc: event.email_lc,
      text: event.text,
      source: event.source,
      channel_context: event.channel_context,
      lead_id: event.lead_id,
      conversation_id: event.conversation_id,
    });
    
    console.log(`Generated response: ${response.substring(0, 100)}...`);
    
    // Write agent response to messages table
    const responseMessage = await dynamoService.putMessage({
      tenantId: event.tenantId,
      email_lc: event.email_lc,
      lead_id: event.lead_id,
      source: 'agent',
      direction: 'outbound',
      text: response,
      conversation_id: event.conversation_id,
      meta: {
        model: config.bedrockModelId,
        triggered_by_message: event.message_ts,
        processed_at: new Date().toISOString(),
      },
    });
    
    console.log(`Stored agent response: ${responseMessage.contact_pk}/${responseMessage.ts}`);
    
    // Determine preferred channel and routing
    const preferredChannel = event.source; // Use originating channel
    
    const routing = agentService.createRoutingInfo({
      tenantId: event.tenantId,
      email_lc: event.email_lc,
      text: event.text,
      source: event.source,
      channel_context: event.channel_context,
      lead_id: event.lead_id,
      conversation_id: event.conversation_id,
    }, preferredChannel);
    
    // Emit agent.reply.created event
    await eventBridgeService.publishAgentReply(
      EventBridgeService.createAgentReplyEvent(
        event.tenantId,
        DynamoDBService.createContactPK(event.tenantId, event.email_lc),
        response,
        preferredChannel as 'sms' | 'email' | 'chat' | 'api',
        routing,
        {
          conversationId: event.conversation_id,
          metadata: {
            model: config.bedrockModelId,
            triggered_by_message: event.message_ts,
            response_message_ts: responseMessage.ts,
            lead_id: event.lead_id,
          },
        }
      )
    );
    
    console.log('Agent completed successfully');
    
  } catch (error) {
    console.error('Agent error:', error);
    
    // Try to emit error event
    try {
      const config = loadRuntimeConfig();
      const eventBridgeService = new EventBridgeService(config);
      
      await eventBridgeService.publishAgentError(
        EventBridgeService.createAgentErrorEvent(
          event.tenantId,
          error instanceof Error ? error.message : 'Unknown agent error',
          {
            contactPk: DynamoDBService.createContactPK(event.tenantId, event.email_lc),
            stack: error instanceof Error ? error.stack : undefined,
            context: {
              source: event.source,
              text_length: event.text?.length,
              lead_id: event.lead_id,
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

/**
 * Lambda handler that returns structured JSON response with intent metadata
 * Useful for API Gateway integrations or when you need detailed response data
 */
export async function structuredHandler(
  event: AgentInvocationEvent,
  context: Context
): Promise<AgentResponse> {
  console.log('Agent received event for structured response:', JSON.stringify(event, null, 2));
  
  try {
    // Load and validate configuration
    const config = loadRuntimeConfig();
    validateRuntimeConfig(config);
    
    // Initialize services
    const dynamoService = new DynamoDBService(config);
    const eventBridgeService = new EventBridgeService(config);
    
    // Create agent service
    const agentService = new AgentService({
      ...config,
      dynamoService,
      eventBridgeService,
    });
    
    // Process the message and get structured response
    console.log(`Processing message for ${event.tenantId}/${event.email_lc}`);
    
    const structuredResponse = await agentService.processMessageStructured({
      tenantId: event.tenantId,
      email_lc: event.email_lc,
      text: event.text,
      source: event.source,
      channel_context: event.channel_context,
      lead_id: event.lead_id,
      conversation_id: event.conversation_id,
    });
    
    console.log(`Generated structured response:`, {
      success: structuredResponse.success,
      messageLength: structuredResponse.message.length,
      intent: structuredResponse.intent?.id,
      confidence: structuredResponse.intent?.confidence,
      processingTime: structuredResponse.metadata.processingTimeMs
    });
    
    // Log intent detection in red for visibility
    if (structuredResponse.intent) {
      console.log(`\x1b[31m🎯 INTENT DETECTED IN LAMBDA: ${structuredResponse.intent.id} (confidence: ${(structuredResponse.intent.confidence * 100).toFixed(1)}%)\x1b[0m`);
      console.log(`\x1b[31m   Name: ${structuredResponse.intent.name}\x1b[0m`);
      console.log(`\x1b[31m   Priority: ${structuredResponse.intent.priority}\x1b[0m`);
      console.log(`\x1b[31m   Actions: ${structuredResponse.intent.actions?.join(', ') || 'none'}\x1b[0m`);
    }
    
    // Store the response in DynamoDB if successful
    if (structuredResponse.success) {
      const responseMessage = await dynamoService.putMessage({
        tenantId: event.tenantId,
        email_lc: event.email_lc,
        lead_id: event.lead_id,
        source: 'agent',
        direction: 'outbound',
        text: structuredResponse.message,
        conversation_id: event.conversation_id,
        meta: {
          model: config.bedrockModelId,
          triggered_by_message: event.message_ts,
          processed_at: structuredResponse.metadata.timestamp,
          intent_detected: structuredResponse.intent?.id,
          intent_confidence: structuredResponse.intent?.confidence,
          processing_time_ms: structuredResponse.metadata.processingTimeMs,
        },
      });
      
      console.log(`Stored agent response: ${responseMessage.contact_pk}/${responseMessage.ts}`);
    }
    
    return structuredResponse;
    
  } catch (error) {
    console.error('Agent processing error:', error);
    
    // Return structured error response
    return {
      success: false,
      message: 'I apologize, but I encountered an error processing your message. Please try again.',
      metadata: {
        sessionId: event.conversation_id || 'unknown',
        tenantId: event.tenantId,
        userId: event.email_lc,
        channel: event.source,
        timestamp: new Date().toISOString(),
        processingTimeMs: 0
      },
      error: {
        code: 'HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }
    };
  }
}
