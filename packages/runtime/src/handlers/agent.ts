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
  readingSpeed: 100, // Fast reading speed (chars/sec)
  typingSpeed: 12, // Faster typing speed (chars/sec)
  minBusyTime: 0.1, // Minimum "busy" time before first response - very quick
  maxBusyTime: 0.5, // Maximum "busy" time before first response - fast initial response
  minThinkingTime: 0.3, // Min pause between messages - quick typing between chunks
  maxThinkingTime: 0.8, // Max pause between messages - shorter pauses
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
    
    // 📨 Emit chat.received - message has arrived
    await eventBridgeService.publishCustomEvent(
      'kxgen.agent',
      'chat.received',
      {
        channelId: event.channelId,
        tenantId: event.tenantId,
        personaId: event.userId,
        timestamp: new Date().toISOString()
      }
    );
    
    // Load company info and persona from DynamoDB
    let companyInfo: any = undefined;
    let personaConfig: any = undefined;
    let timingConfig: TimingConfig = DEFAULT_TIMING;
    let channelStateService: any = undefined; // For message interruption detection
    
    if (event.tenantId) {
      try {
        console.log(`🏢 Loading company info for tenant: ${event.tenantId}`);
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb');
        const { ChannelStateService } = await import('../lib/channel-state-service.js');
        const client = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(client, {
          marshallOptions: {
            removeUndefinedValues: true,
          },
        });
        
        // Initialize channel state service for message interruption detection
        channelStateService = new ChannelStateService(
          docClient,
          process.env.WORKFLOW_STATE_TABLE || 'KxGen-agent-workflow-state'
        );

        // Load company info from DelayedReplies-company_info table
        const companyInfoTable = process.env.COMPANY_INFO_TABLE || 'DelayedReplies-company_info';
        console.log(`🏢 Querying company info table: ${companyInfoTable} for tenantId: ${event.tenantId}`);
        
        const companyResult = await docClient.send(new GetCommand({
          TableName: companyInfoTable,
          Key: {
            tenantId: event.tenantId
          }
        }));
        
        console.log(`🏢 Company info query result: Item found = ${!!companyResult.Item}`);

        if (companyResult.Item) {
          companyInfo = {
            // Core identity
            name: companyResult.Item.companyName || companyResult.Item.name,
            industry: companyResult.Item.industry,
            description: companyResult.Item.description,
            
            // Contact info
            phone: companyResult.Item.phone,
            email: companyResult.Item.email,
            website: companyResult.Item.website,
            address: companyResult.Item.address,
            
            // Business details
            businessHours: companyResult.Item.businessHours,
            services: companyResult.Item.services,
            products: companyResult.Item.products,
            
            // Marketing
            benefits: companyResult.Item.benefits,
            targetCustomers: companyResult.Item.targetCustomers,
            differentiators: companyResult.Item.differentiators,
            
            // Configuration
            goalConfiguration: companyResult.Item.goalConfiguration,
            responseGuidelines: companyResult.Item.responseGuidelines,
            contactRequirements: companyResult.Item.contactRequirements,
          };
          console.log(`✅ Loaded company info: ${companyInfo.name} (${companyInfo.industry})`);
          
          // Log if company-level goals are configured
          if (companyInfo.goalConfiguration?.enabled) {
            console.log(`🎯 Company-level goals enabled: ${companyInfo.goalConfiguration.goals?.length || 0} goals configured`);
          }
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
    
    // Generate unique message ID for interruption detection
    const inboundMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.log(`📨 Processing message ${inboundMessageId} for ${event.tenantId}/${event.email_lc}`);
    
    // Update channel state with this message ID BEFORE processing
    // This allows us to detect if user sent another message while we're processing
    if (event.channelId && channelStateService) {
      await channelStateService.updateLastProcessedMessageId(
        event.channelId,
        inboundMessageId,
        event.tenantId
      );
    }
    
    const result = await agentService.processMessage({
      tenantId: event.tenantId,
      email_lc: event.email_lc,
      text: event.text,
      source: event.source,
      channel_context: event.channel_context,
      lead_id: event.lead_id,
      conversation_id: event.conversation_id,
    });
    
    const response = result.response;
    const followUpQuestion = result.followUpQuestion;
    
    console.log(`Generated response: ${response.substring(0, 100)}...`);
    if (followUpQuestion) {
      console.log(`💬 Follow-up question: ${followUpQuestion}`);
    }
    
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
      
      // Use persona's responseChunking config if available, otherwise build verbosity-aware defaults
      let chunkingConfig: any;
      
      if (personaConfig?.responseChunking?.rules?.chat) {
        // Use persona's explicit chunking configuration (only if it has valid rules)
        chunkingConfig = personaConfig.responseChunking;
        console.log('📏 Using persona-defined chunking config');
      } else {
        console.log('📏 Persona chunking config missing or invalid, building verbosity-aware defaults');
        // Build verbosity-aware defaults based on personality traits
        const verbosity = (personaConfig as any)?.personalityTraits?.verbosity || 5;
        console.log(`📏 Building verbosity-aware chunking config (verbosity: ${verbosity})`);
        
        // ALWAYS chunk by sentence (1 sentence per message) for chat
        // Verbosity controls HOW MANY sentences total, not chunk size
        // For very low verbosity (1-2), disable chunking - they'll only generate 1 sentence
        // For verbosity 3+, enable sentence-level chunking
        if (verbosity <= 2) {
          chunkingConfig = {
            enabled: false, // Disable chunking for VERY low verbosity (1 sentence total)
            rules: {
              chat: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              sms: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              email: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              api: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              agent: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 }
            }
          };
        } else {
          // For verbosity 3+, chunk into 1 sentence per message
          chunkingConfig = {
            enabled: true,
            rules: {
              chat: { chunkBy: 'sentence' as const, maxLength: 120, delayBetweenChunks: 1000 }, // ~1 sentence max per chunk
              sms: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              email: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              api: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 },
              agent: { chunkBy: 'none' as const, maxLength: -1, delayBetweenChunks: 0 }
            }
          };
        }
      }
      
      const chunks = ResponseChunker.chunkResponse(response, 'chat', chunkingConfig);
      console.log(`📨 Split response into ${chunks.length} message chunks`);
      
      // Calculate delays for realistic typing behavior
      const calculateTypingTime = (text: string, config: TimingConfig): number => {
        const charCount = text.length;
        return Math.floor((charCount / config.typingSpeed) * 1000);
      };
      
      const calculateFirstMessageDelay = (originalText: string, chunkText: string, config: TimingConfig): number => {
        const readingTime = Math.floor((originalText.length / config.readingSpeed) * 1000);
        const typingTime = calculateTypingTime(chunkText, config);
        const busyTime = Math.floor(Math.random() * (config.maxBusyTime - config.minBusyTime) + config.minBusyTime) * 1000;
        return readingTime + typingTime + busyTime;
      };
      
      const calculateSubsequentMessageDelay = (chunkText: string, config: TimingConfig): number => {
        const typingTime = calculateTypingTime(chunkText, config);
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
        
        // 🚨 INTERRUPTION CHECK: DISABLED FOR NOW - needs more testing
        // The issue is that loadWorkflowState may return a fresh state without lastProcessedMessageId
        // TODO: Fix this properly by ensuring lastProcessedMessageId is persisted and loaded correctly
        // if (event.channelId && channelStateService) {
        //   const currentState = await channelStateService.loadWorkflowState(event.channelId, event.tenantId);
        //   if (currentState.lastProcessedMessageId && currentState.lastProcessedMessageId !== inboundMessageId) {
        //     console.log(`⚠️ Message superseded! User sent new message while we were processing.`);
        //     console.log(`   Expected messageId: ${inboundMessageId}`);
        //     console.log(`   Current messageId: ${currentState.lastProcessedMessageId}`);
        //     console.log(`   Discarding remaining ${chunks.length - i} chunk(s)`);
        //     console.log(`   ✅ Goal data already persisted - no data loss`);
        //     return; // Exit early - don't send stale chunks
        //   }
        // }
        
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
          // Chunk tracking for presence events (consumer emits chat.stoppedTyping when currentChunk === totalChunks)
          currentChunk: i + 1,  // 1-indexed
          totalChunks: chunks.length + (followUpQuestion ? 1 : 0), // Include follow-up in count
        };
        
        await eventBridgeService.publishCustomEvent(
          'kx-event-tracking',
          'chat.message',
          chatMessageEvent
        );
        
        console.log(`✅ Message ${i + 1}/${chunks.length} emitted successfully`);
      }
      
      console.log(`🎉 All ${chunks.length} messages sent successfully!`);
      
      // Send follow-up question as a separate delayed message (if present)
      if (followUpQuestion) {
        console.log(`💬 Sending follow-up question after main response...`);
        
        // Calculate delay after last chunk
        const followUpDelay = calculateSubsequentMessageDelay(followUpQuestion, timingConfig);
        console.log(`⏱️ Follow-up delay: ${Math.floor(followUpDelay / 1000)} seconds`);
        
        await new Promise(resolve => setTimeout(resolve, followUpDelay));
        
        // 🚨 INTERRUPTION CHECK: DISABLED FOR NOW - needs more testing
        // TODO: Fix this properly by ensuring lastProcessedMessageId is persisted and loaded correctly
        // if (event.channelId && channelStateService) {
        //   const currentState = await channelStateService.loadWorkflowState(event.channelId, event.tenantId);
        //   if (currentState.lastProcessedMessageId && currentState.lastProcessedMessageId !== inboundMessageId) {
        //     console.log(`⚠️ Follow-up question superseded! User sent new message.`);
        //     console.log(`   Discarding follow-up question`);
        //     console.log(`   ✅ Goal data already persisted - no data loss`);
        //     return; // Exit early - don't send stale follow-up
        //   }
        // }
        
        const timestamp = new Date().toISOString();
        const epochMs = Date.now();
        const randomSuffix = Math.random().toString(36).substr(2, 9);
        const generatedMessageId = `agent-followup-${epochMs}-${randomSuffix}`;
        const originMetadata = createOriginMetadata(event, generatedMessageId);
        
        // Calculate total chunks (main chunks + follow-up)
        const totalChunksWithFollowUp = chunks.length + 1;
        
        const followUpEvent = {
          tenantId: event.tenantId,
          channelId: event.channelId,
          userId: event.userId,
          userName: event.userName || 'AI Assistant',
          userType: 'agent',
          message: followUpQuestion,
          messageId: generatedMessageId,
          timestamp,
          connectionId: event.connectionId || event.channel_context?.chat?.connectionId,
          messageType: 'text',
          senderId: event.userId,
          senderType: 'agent',
          agentId: event.userId,
          originMarker: 'persona',
          metadata: originMetadata,
          // This is the last chunk - consumer should emit chat.stoppedTyping
          currentChunk: totalChunksWithFollowUp,
          totalChunks: totalChunksWithFollowUp,
        };
        
        await eventBridgeService.publishCustomEvent(
          'kx-event-tracking',
          'chat.message',
          followUpEvent
        );
        
        console.log(`✅ Follow-up question sent successfully!`);
      }
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
