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
  event: EventBridgeEvent<string, any>,
  context: Context
): Promise<void> {
  console.log('🔥 1.0 ROUTER HANDLER START - v1.4.0');
  console.log('AgentRouter received event:', JSON.stringify(event, null, 2));
  
  try {
    console.log('🔥 1.1 Loading runtime config');
    // Load and validate configuration
    const config = loadRuntimeConfig();
    validateRuntimeConfig(config);
    
    console.log('🔥 1.2 Initializing DynamoDB service');
    // Initialize services
    const dynamoService = new DynamoDBService(config);
    const eventBridgeService = new EventBridgeService(config);
    
    // Transform chat.message.available to standard format
    let detail: any;
    if (event['detail-type'] === 'chat.message.available' && event.source === 'kx-notifications-messaging') {
      console.log('🔥 1.2.1 Transforming chat.message.available event');
      const chatDetail = event.detail;
      console.log('🔥 1.2.1.0 chatDetail.connectionId:', chatDetail.connectionId);
      
      // IGNORE agent's own messages - check multiple indicators
      // The agent sets several fields to identify its messages, check them all
      
      // First, check if the sender (actual message author) is an agent persona
      // Load channel to see which persona(s) are assigned to this channel
      let assignedPersonaId: string | undefined;
      let botEmployeeIds: string[] = [];
      try {
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
        const client = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(client);
        
        // Query by channelId (PK) - channels table uses channelId as PK, not composite key
        const channelResult = await docClient.send(new QueryCommand({
          TableName: process.env.CHANNELS_TABLE || 'KxGen-channels-v2',
          KeyConditionExpression: 'channelId = :channelId',
          ExpressionAttributeValues: {
            ':channelId': event.detail.channelId
          },
          Limit: 1
        }));
        
        console.log(`🔥 1.2.1.0.2 Query result: Items count=${channelResult.Items?.length}, tableName=${process.env.CHANNELS_TABLE || 'kx-channels'}`);
        const channelData = channelResult.Items?.[0];
        console.log(`🔥 1.2.1.0.2.5 Channel data: ${JSON.stringify(channelData)}`);
        // Support both botEmployeeIds (array) and botEmployeeId (singular, backward compat)
        botEmployeeIds = channelData?.botEmployeeIds || (channelData?.botEmployeeId ? [channelData.botEmployeeId] : []) || (channelData?.personaId ? [channelData.personaId] : []);
        assignedPersonaId = process.env.PERSONA_ID || 'default'; // This Lambda's persona ID from environment
        console.log(`🔥 1.2.1.0.3 Channel ${event.detail.channelId} has botEmployeeIds: ${JSON.stringify(botEmployeeIds)}, this Lambda's personaId: ${assignedPersonaId}`);
      } catch (error) {
        console.error('🔥 1.2.1.0.2 ERROR - Failed to load channel:', error);
      }
      
      // Check if the senderId matches ANY of the assigned personas (meaning an AI sent this message)
      const isSenderTheAgent = botEmployeeIds.includes(chatDetail.senderId);
      
      // Check if this event is FOR a human participant (not a bot)
      // The fanout creates events for ALL channel participants (humans + bots)
      // We should ONLY process events where userId is a bot persona
      const isRecipientTheBot = botEmployeeIds.includes(chatDetail.userId);
      
      if (!isRecipientTheBot) {
        console.log('🔥 1.2.1.0.5 SKIPPING - Event is for human participant, not bot');
        console.log(`userId=${chatDetail.userId}, botEmployeeIds=${JSON.stringify(botEmployeeIds)}`);
        return; // Don't process events meant for human participants
      }
      
      // CRITICAL: If the sender is a bot, skip immediately to avoid infinite loops
      if (isSenderTheAgent) {
        console.log('🔥 1.2.1.0.6 SKIPPING - Sender is a bot (early check)');
        console.log(`senderId=${chatDetail.senderId}, botEmployeeIds=${JSON.stringify(botEmployeeIds)}`);
        return;
      }
      
      const isAgentMessage = 
        isSenderTheAgent || // The actual sender is the AI agent persona
        chatDetail.userType === 'agent' ||
        chatDetail.senderType === 'agent' ||
        (chatDetail.messageId && chatDetail.messageId.startsWith('agent-')) ||
        (chatDetail.metadata && chatDetail.metadata.senderType === 'agent') ||
        (chatDetail.metadata && chatDetail.metadata.originMarker === 'persona') ||
        (chatDetail.metadata && chatDetail.metadata.agentId) ||
        (chatDetail.metadata && chatDetail.metadata.isAgentGenerated === true) ||
        (chatDetail.originMarker === 'persona') ||
        (chatDetail.agentId);
      
      if (isAgentMessage) {
        console.log('🔥 1.2.1.1 SKIPPING - Agent message detected');
        console.log(`Detection: assignedPersona=${assignedPersonaId}, senderId=${chatDetail.senderId}, isSenderTheAgent=${isSenderTheAgent}`);
        console.log(`userType=${chatDetail.userType}, senderType=${chatDetail.senderType}, messageId=${chatDetail.messageId}, originMarker=${chatDetail.originMarker || chatDetail.metadata?.originMarker}`);
        console.log(`userId: ${chatDetail.userId}, senderId: ${chatDetail.senderId}`);
        return; // Don't process agent's own responses
      }
      
      console.log('🔥 1.2.1.2 Processing as USER message (not detected as agent)');
      console.log(`assignedPersona=${assignedPersonaId}, senderId=${chatDetail.senderId}, userId=${chatDetail.userId}`);
      console.log(`userType=${chatDetail.userType}, senderType=${chatDetail.senderType}, messageId=${chatDetail.messageId}`)
      
      // Check message freshness for debugging
      const messageTimestamp = chatDetail.metadata?.timestamp || chatDetail.timestamp || chatDetail.message_ts;
      if (messageTimestamp) {
        const messageTime = new Date(messageTimestamp).getTime();
        const now = Date.now();
        const ageInSeconds = (now - messageTime) / 1000;
        console.log(`🔥 1.2.1.3 Message age: ${ageInSeconds.toFixed(1)}s (timestamp: ${messageTimestamp})`);
      }
      
      // Extract tenantId and persona name - it's in the detail or metadata
      let tenantId = chatDetail.tenantId || chatDetail.metadata?.tenantId;
      let personaName = 'AI Assistant'; // Default fallback
      
      // If we have tenantId, load the full persona to get the name
      if (tenantId && chatDetail.userId) {
        console.log('🔥 1.2.2 Loading persona name for tenantId:', tenantId, 'personaId:', chatDetail.userId);
        try {
          const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
          const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb');
          const client = new DynamoDBClient({});
          const docClient = DynamoDBDocumentClient.from(client);
          
          const result = await docClient.send(new GetCommand({
            TableName: config.personasTable || process.env.PERSONAS_TABLE || 'personas',
            Key: {
              tenantId: tenantId,
              personaId: chatDetail.userId
            }
          }));
          
          if (result.Item) {
            personaName = result.Item.name || personaName;
            console.log('🔥 1.2.3 Found persona name:', personaName);
          } else {
            console.log('🔥 1.2.3 No persona found for tenantId:', tenantId, 'personaId:', chatDetail.userId);
          }
        } catch (error) {
          console.error('🔥 1.2.3 ERROR - Failed to lookup persona:', error);
        }
      }
      
      if (!tenantId) {
        throw new Error(`Could not determine tenantId from personaId: ${chatDetail.userId}`);
      }
      
      // No guard needed - we'll load whatever persona is assigned in botEmployeeIds
      // All Lambdas process the message and load the assigned persona(s) dynamically
      console.log(`✅ Processing message - will load persona(s) from botEmployeeIds: ${JSON.stringify(botEmployeeIds)}`);
      
      detail = {
        tenantId,
        conversation_id: chatDetail.channelId,
        email_lc: `channel-${chatDetail.channelId}@anonymous.com`,
        text: chatDetail.content,
        source: 'chat',
        timestamps: {
          received: chatDetail.timestamp,
          processed: new Date().toISOString()
        },
        channel_context: {
          chat: {
            sessionId: chatDetail.channelId,
            clientId: chatDetail.senderId,
            messageId: chatDetail.messageId,
            connectionId: chatDetail.connectionId // Store the WebSocket connectionId if available
          }
        },
        channelId: chatDetail.channelId,
        userId: chatDetail.userId, // Persona ID (the agent)
        senderId: chatDetail.senderId, // User ID (the human)
        assignedPersonaId: assignedPersonaId, // Store for agent invocation (backward compat)
        botEmployeeIds: botEmployeeIds, // Array of persona IDs to process
        userName: personaName, // Use the persona's actual name
        connectionId: chatDetail.connectionId // Pass through the connectionId for response routing
      };
    } else {
      // Validate incoming event as standard format
      const validatedEvent = InboundMessageEventSchema.parse(event);
      detail = validatedEvent.detail;

      if (event['detail-type'] === 'chat.message') {
        console.log('🔥 1.2.x evaluating direct chat.message event');

        if (detail.userType === 'agent') {
          console.log('🔥 1.2.x SKIPPING direct chat.message event from agent (userType=agent)');
          return;
        }

        const isAgentMessage =
          detail.userId === detail.senderId ||
          (detail.messageId && detail.messageId.startsWith('agent-')) ||
          (detail.metadata && detail.metadata.isAgentGenerated === true);

        if (isAgentMessage) {
          console.log('🔥 1.2.x SKIPPING direct chat.message event detected as agent message');
          console.log(`userId: ${detail.userId}, senderId: ${detail.senderId}, messageId: ${detail.messageId}`);
          return;
        }
      }
    }
    
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
    
    console.log('🔥 1.3 Skipping putMessage - messaging service handles persistence');
    
    // Invoke AgentFn with the processed context
    const { handler: agentHandler } = await import('./agent.js');
    
    // Get botEmployeeIds from detail (set earlier when loading channel)
    const personaIds = (detail as any).botEmployeeIds || [detail.assignedPersonaId || detail.userId];
    
    console.log(`🔥 1.4 Processing message for ${personaIds.length} persona(s): ${JSON.stringify(personaIds)}`);
    
    // Loop through each persona and generate a response
    for (const personaId of personaIds) {
      console.log(`🔥 1.4.${personaIds.indexOf(personaId) + 1} Generating response for persona: ${personaId}`);
      
      await agentHandler({
        tenantId: detail.tenantId,
        email_lc: emailLc,
        text: detail.text,
        source: detail.source,
        channel_context: detail.channel_context,
        lead_id: leadId,
        conversation_id: detail.conversation_id,
        message_ts: new Date().toISOString(),
        // Pass chat-specific context for response emission
        channelId: detail.channelId,
        userId: personaId, // Current persona in loop
        senderId: detail.senderId,
        userName: detail.userName,
      }, context);
      
      console.log(`✅ 1.4.${personaIds.indexOf(personaId) + 1} Completed response for persona: ${personaId}`);
    }
    
    console.log(`AgentRouter completed successfully - processed ${personaIds.length} persona(s)`);
    
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
