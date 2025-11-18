import type { Context } from 'aws-lambda';
import { DynamoDBService } from '../lib/dynamodb.js';
import { EventBridgeService } from '../lib/eventbridge.js';
import { AgentService } from '../lib/agent.js';
import { loadRuntimeConfig, validateRuntimeConfig } from '../lib/config.js';
import type { AgentContext, AgentResponse } from '../types/index.js';

/**
 * Timing configuration for realistic agent response delays
 */
interface TimingConfig {
  readingSpeed: number; // chars per second
  typingSpeed: number; // chars per second
  minBusyTime: number; // seconds
  maxBusyTime: number; // seconds
  minThinkingTime: number; // seconds
  maxThinkingTime: number; // seconds
}

const DEFAULT_TIMING: TimingConfig = {
  readingSpeed: 50, // Average adult reading speed (chars/sec) - very fast reading
  typingSpeed: 8, // Realistic typing speed (chars/sec) - slower, more human-like
  minBusyTime: 0.5, // Minimum "busy" time before first response - very quick
  maxBusyTime: 2, // Maximum "busy" time before first response - faster initial response
  minThinkingTime: 1.0, // Min pause between messages - slower typing between chunks
  maxThinkingTime: 2.5, // Max pause between messages - more realistic pauses
};

/**
 * Agent invocation context (internal event from router)
 */
export interface AgentInvocationEvent extends AgentContext {
  message_ts: string; // Timestamp of the message that triggered this
  metadata?: {
    originMarker?: string;
    agentId?: string;
    originalMessageId?: string;
    senderType?: string;
    userType?: string;
    // Legacy support
    isAgentGenerated?: boolean;
  };
  senderType?: string;
  userType?: string;
  originMarker?: string;
  // Legacy support
  isAgentGenerated?: boolean;
}

function isPersonaOrigin(event: AgentInvocationEvent): boolean {
  if (event.originMarker === 'persona') return true;
  if (event.senderType === 'agent') return true;
  if (event.userType === 'agent') return true;
  if (event.isAgentGenerated === true) return true;
  if (event.metadata?.originMarker === 'persona') return true;
  if (event.metadata?.isAgentGenerated === true) return true;
  return false;
}

function createOriginMetadata(event: AgentInvocationEvent, generatedMessageId: string) {
  return {
    originMarker: 'persona',
    agentId: event.userId,
    originalMessageId: event.metadata?.originalMessageId || generatedMessageId,
    senderType: 'agent',
    recipientId: event.senderId,
  };
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
    
    // Load company info and persona from DynamoDB
    let companyInfo: any = undefined;
    let personaConfig: any = undefined;
    let timingConfig: TimingConfig = DEFAULT_TIMING;
    
    if (event.tenantId) {
      try {
        console.log(`🏢 Loading company info for tenant: ${event.tenantId}`);
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb');
        const client = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(client);

        // Load company info from DelayedReplies-company_info table
        const companyResult = await docClient.send(new GetCommand({
          TableName: process.env.COMPANY_INFO_TABLE || 'DelayedReplies-company_info',
          Key: {
            tenantId: event.tenantId
          }
        }));

        if (companyResult.Item) {
          companyInfo = {
            name: companyResult.Item.name,
            industry: companyResult.Item.industry,
            description: companyResult.Item.description,
            products: companyResult.Item.products,
            benefits: companyResult.Item.benefits,
            targetCustomers: companyResult.Item.targetCustomers,
            differentiators: companyResult.Item.differentiators,
          };
          console.log(`✅ Loaded company info: ${companyInfo.name} (${companyInfo.industry})`);
        } else {
          console.log(`⚠️ No company info found for tenant ${event.tenantId}, using defaults`);
        }
        
        // Load timing config from company info or use defaults
        const agentTiming = companyResult.Item?.agentTiming;
        timingConfig = agentTiming ? {
          readingSpeed: agentTiming.readingSpeed || DEFAULT_TIMING.readingSpeed,
          typingSpeed: agentTiming.typingSpeed || DEFAULT_TIMING.typingSpeed,
          minBusyTime: agentTiming.minBusyTime || DEFAULT_TIMING.minBusyTime,
          maxBusyTime: agentTiming.maxBusyTime || DEFAULT_TIMING.maxBusyTime,
          minThinkingTime: agentTiming.minThinkingTime || DEFAULT_TIMING.minThinkingTime,
          maxThinkingTime: agentTiming.maxThinkingTime || DEFAULT_TIMING.maxThinkingTime,
        } : DEFAULT_TIMING;
        
        if (agentTiming) {
          console.log(`⏱️ Using custom timing config from company info`);
        } else {
          console.log(`⏱️ Using default timing config`);
        }

        // Load persona from DelayedReplies-personas table
        if (event.userId) { // userId is the personaId from router
          console.log(`👤 Loading persona for tenant: ${event.tenantId}, personaId: ${event.userId}`);
          console.log(`👤 PERSONAS_TABLE env var: ${process.env.PERSONAS_TABLE}`);
          const personaResult = await docClient.send(new GetCommand({
            TableName: process.env.PERSONAS_TABLE || 'DelayedReplies-personas',
            Key: {
              tenantId: event.tenantId,
              personaId: event.userId
            }
          }));

          console.log(`👤 Persona query result: ${JSON.stringify(personaResult)}`);
          
          if (personaResult.Item) {
            personaConfig = personaResult.Item;
            console.log(`✅ Loaded persona from DynamoDB: ${personaConfig.name} (${personaConfig.personaId})`);
            console.log(`✅ Persona systemPrompt preview: ${personaConfig.systemPrompt?.substring(0, 100)}...`);
          } else {
            console.log(`⚠️ No persona found for ${event.tenantId}/${event.userId}, will use fallback`);
          }
        }
      } catch (error) {
        console.error('❌ Error loading company info/persona:', error);
      }
    }
    
    // Create agent service with company info and persona
    const agentService = new AgentService({
      ...config,
      dynamoService,
      eventBridgeService,
      companyInfo,
      personaId: event.userId, // Pass personaId
      persona: personaConfig, // Pass pre-loaded persona from DynamoDB
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
    
    // Emit chat.message event for the agent's response
    // This will be picked up by the messaging service for persistence and delivery
    if (event.source === 'chat' && event.channelId && event.userId) {
      if (isPersonaOrigin(event)) {
        console.log('Skipping chat.message emission because this event originated from the agent.');
        return;
      }      
      console.log('Emitting multi-part chat.message events for agent response');
      console.log(`👤 Agent identity: personaId=${event.userId}, personaName="${event.userName}", senderId=${event.userId}`);
      
      // Import chunking utilities
      const { ResponseChunker } = await import('../lib/response-chunker.js');
      
      // Simple chunking config for chat: 1-2 sentences per chunk
      const chunkingConfig = {
        enabled: true,
        rules: {
          chat: {
            chunkBy: 'sentence' as const,
            maxLength: 150, // ~1 sentence (force single sentence chunks)
            delayBetweenChunks: 1000
          },
          sms: {
            chunkBy: 'none' as const,
            maxLength: -1,
            delayBetweenChunks: 0
          },
          email: {
            chunkBy: 'none' as const,
            maxLength: -1,
            delayBetweenChunks: 0
          },
          api: {
            chunkBy: 'none' as const,
            maxLength: -1,
            delayBetweenChunks: 0
          },
          agent: {
            chunkBy: 'none' as const,
            maxLength: -1,
            delayBetweenChunks: 0
          }
        }
      };
      
      const chunks = ResponseChunker.chunkResponse(response, 'chat', chunkingConfig);
      console.log(`📨 Split response into ${chunks.length} message chunks`);
      
      // Calculate delays for realistic typing behavior
      const calculateTypingTime = (text: string, config: TimingConfig): number => {
        const charCount = text.length;
        return Math.floor((charCount / config.typingSpeed) * 1000);
      };
      
      const calculateFirstMessageDelay = (originalText: string, responseText: string, config: TimingConfig): number => {
        const readingTime = Math.floor((originalText.length / config.readingSpeed) * 1000);
        const typingTime = calculateTypingTime(responseText, config);
        const busyTime = Math.floor(Math.random() * (config.maxBusyTime - config.minBusyTime) + config.minBusyTime) * 1000;
        return readingTime + typingTime + busyTime;
      };
      
      const calculateSubsequentMessageDelay = (responseText: string, config: TimingConfig): number => {
        const typingTime = calculateTypingTime(responseText, config);
        const thinkingTime = Math.floor(Math.random() * (config.maxThinkingTime - config.minThinkingTime) + config.minThinkingTime) * 1000;
        return typingTime + thinkingTime;
      };
      
      // Use timing config (already loaded earlier)
      const firstChunkDelay = calculateFirstMessageDelay(event.text, chunks[0].text, timingConfig);
      console.log(`⏱️ First message delay: - Reading time: ${Math.floor((event.text.length / timingConfig.readingSpeed) * 1000)}ms (${event.text.length} chars at ${timingConfig.readingSpeed} chars/sec) - Typing time: ${calculateTypingTime(chunks[0].text, timingConfig)}ms (${chunks[0].text.length} chars at ${timingConfig.typingSpeed} chars/sec) - Busy time: ${firstChunkDelay - Math.floor((event.text.length / timingConfig.readingSpeed) * 1000) - calculateTypingTime(chunks[0].text, timingConfig)}ms (random ${timingConfig.minBusyTime}-${timingConfig.maxBusyTime} sec) - Total delay: ${firstChunkDelay}ms (${Math.floor(firstChunkDelay / 1000)} seconds)`);
      
      // Emit chunks with realistic delays
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const timestamp = new Date().toISOString();
        const epochMs = Date.now();
        const randomSuffix = Math.random().toString(36).substr(2, 9);
        const generatedMessageId = `agent-${epochMs}-${randomSuffix}`;
        const originMetadata = createOriginMetadata(event, generatedMessageId);
        
        // Calculate delay
        let delay: number;
        if (i === 0) {
          delay = firstChunkDelay;
          console.log(`⏱️ Message ${i + 1}/${chunks.length}: Waiting ${Math.floor(delay / 1000)} seconds...`);
        } else {
          delay = calculateSubsequentMessageDelay(chunk.text, timingConfig);
          console.log(`⏱️ Subsequent message delay: - Typing time: ${calculateTypingTime(chunk.text, timingConfig)}ms (${chunk.text.length} chars at ${timingConfig.typingSpeed} chars/sec) - Thinking time: ${delay - calculateTypingTime(chunk.text, timingConfig)}ms (random ${timingConfig.minThinkingTime}-${timingConfig.maxThinkingTime} sec) - Total delay: ${delay}ms (${Math.floor(delay / 1000)} seconds)`);
          console.log(`⏱️ Message ${i + 1}/${chunks.length}: Waiting ${Math.floor(delay / 1000)} seconds...`);
        }
        
        // Wait before sending
        await new Promise(resolve => setTimeout(resolve, delay));
        
        console.log(`👤 Using persona name: "${event.userName}" (personaId: ${event.userId})`);
        console.log(`📤 Sending message ${i + 1}/${chunks.length} with userName="${event.userName}": ${chunk.text.substring(0, 50)}...`);

        const chatMessageEvent = {
          tenantId: event.tenantId,
          channelId: event.channelId,
          userId: event.userId, // Persona ID (the agent sending the message)
          userName: event.userName || 'AI Assistant',
          userType: 'agent', // Explicitly mark this as an agent message
          message: chunk.text,
          messageId: generatedMessageId,
          timestamp,
          connectionId: event.connectionId || event.channel_context?.chat?.connectionId,
          messageType: 'text',
          senderId: event.userId, // For routing, senderId = agent (persona ID)
          senderType: 'agent',
          agentId: event.userId,
          originMarker: 'persona',
          metadata: originMetadata,
        };
        
        await eventBridgeService.publishCustomEvent(
          'kx-event-tracking',
          'chat.message',
          chatMessageEvent
        );
        
        console.log(`✅ Message ${i + 1}/${chunks.length} emitted successfully`);
      }
      
      console.log(`🎉 All ${chunks.length} messages sent successfully!`);
    } else {
      console.log('Not a chat message, skipping chat.message emission');
    }
    
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
    
    // Emit agent.reply.created event (for backwards compatibility/tracking)
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
            response_timestamp: new Date().toISOString(),
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
    
    // Emit chat.message event if this is a chat conversation
    if (structuredResponse.success && event.source === 'chat' && event.channelId && event.userId) {
      if (isPersonaOrigin(event)) {
        console.log('Skipping structured chat.message emission because this event originated from the agent.');
      } else {
        console.log('Emitting chat.message event for structured agent response');

        const timestamp = structuredResponse.metadata.timestamp;
        const epochMs = Date.now();
        const randomSuffix = Math.random().toString(36).substr(2, 9);
        const generatedMessageId = `agent-${epochMs}-${randomSuffix}`;
        const originMetadata = createOriginMetadata(event, generatedMessageId);

        await eventBridgeService.publishCustomEvent(
          'kx-event-tracking',
          'chat.message',
          {
            tenantId: event.tenantId,
            channelId: event.channelId,
            userId: event.userId, // Persona ID (the agent)
            userName: event.userName || 'AI Assistant',
            userType: 'agent', // Mark as agent message
            message: structuredResponse.message,
            messageId: generatedMessageId,
            timestamp,
            connectionId: event.connectionId || event.channel_context?.chat?.connectionId, // Use connectionId from original message
            messageType: 'text',
            senderId: event.userId, // For routing, senderId = agent (persona ID)
            senderType: 'agent',
            agentId: event.userId,
            originMarker: 'persona',
            metadata: originMetadata
          }
        );
        
        console.log('Structured response chat.message event emitted');
      }
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
