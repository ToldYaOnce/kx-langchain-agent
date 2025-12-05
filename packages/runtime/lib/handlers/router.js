"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const dynamodb_js_1 = require("../lib/dynamodb.js");
const eventbridge_js_1 = require("../lib/eventbridge.js");
const config_js_1 = require("../lib/config.js");
const index_js_1 = require("../types/index.js");
/**
 * Lambda handler for routing inbound messages
 * Triggered by EventBridge rule: lead.message.created
 */
async function handler(event, context) {
    console.log('🔥 1.0 ROUTER HANDLER START - v1.4.0');
    console.log('AgentRouter received event:', JSON.stringify(event, null, 2));
    try {
        console.log('🔥 1.1 Loading runtime config');
        // Load and validate configuration
        const config = (0, config_js_1.loadRuntimeConfig)();
        (0, config_js_1.validateRuntimeConfig)(config);
        console.log('🔥 1.2 Initializing DynamoDB service');
        // Initialize services
        const dynamoService = new dynamodb_js_1.DynamoDBService(config);
        const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
        // Transform chat.message.available to standard format
        let detail;
        if (event['detail-type'] === 'chat.message.available' && event.source === 'kx-notifications-messaging') {
            console.log('🔥 1.2.1 Transforming chat.message.available event');
            const chatDetail = event.detail;
            console.log('🔥 1.2.1.0 chatDetail.connectionId:', chatDetail.connectionId);
            // IGNORE agent's own messages - check multiple indicators
            // The agent sets several fields to identify its messages, check them all
            // First, check if the sender (actual message author) is an agent persona
            // Load channel to see which persona(s) are assigned to this channel
            let assignedPersonaId;
            let botEmployeeIds = [];
            try {
                const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                const { DynamoDBDocumentClient, QueryCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
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
            }
            catch (error) {
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
            const isAgentMessage = isSenderTheAgent || // The actual sender is the AI agent persona
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
            console.log(`userType=${chatDetail.userType}, senderType=${chatDetail.senderType}, messageId=${chatDetail.messageId}`);
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
                    const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                    const { DynamoDBDocumentClient, GetCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
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
                    }
                    else {
                        console.log('🔥 1.2.3 No persona found for tenantId:', tenantId, 'personaId:', chatDetail.userId);
                    }
                }
                catch (error) {
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
        }
        else {
            // Validate incoming event as standard format
            const validatedEvent = index_js_1.InboundMessageEventSchema.parse(event);
            detail = validatedEvent.detail;
            if (event['detail-type'] === 'chat.message') {
                console.log('🔥 1.2.x evaluating direct chat.message event');
                if (detail.userType === 'agent') {
                    console.log('🔥 1.2.x SKIPPING direct chat.message event from agent (userType=agent)');
                    return;
                }
                const isAgentMessage = detail.userId === detail.senderId ||
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
            const resolvedEmailLc = await dynamoService.resolveContactFromPhone(detail.tenantId, detail.phone_e164);
            if (!resolvedEmailLc) {
                console.error(`Could not resolve contact for phone: ${detail.phone_e164}`);
                // Emit error event
                await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(detail.tenantId, `Could not resolve contact for phone: ${detail.phone_e164}`, {
                    context: {
                        phone_e164: detail.phone_e164,
                        source: detail.source,
                    },
                }));
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
        const { handler: agentHandler } = await Promise.resolve().then(() => __importStar(require('./agent.js')));
        // Get botEmployeeIds from detail (set earlier when loading channel)
        const personaIds = detail.botEmployeeIds || [detail.assignedPersonaId || detail.userId];
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
    }
    catch (error) {
        console.error('AgentRouter error:', error);
        // Try to emit error event if we have enough context
        try {
            const config = (0, config_js_1.loadRuntimeConfig)();
            const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
            await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(event.detail?.tenantId || 'unknown', error instanceof Error ? error.message : 'Unknown router error', {
                stack: error instanceof Error ? error.stack : undefined,
                context: {
                    event_source: event.source,
                    event_detail_type: event['detail-type'],
                },
            }));
        }
        catch (eventError) {
            console.error('Failed to emit error event:', eventError);
        }
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2hhbmRsZXJzL3JvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVVBLDBCQXVUQztBQWhVRCxvREFBcUQ7QUFDckQsMERBQTJEO0FBQzNELGdEQUE0RTtBQUM1RSxnREFBd0Y7QUFFeEY7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FDM0IsS0FBb0MsRUFDcEMsT0FBZ0I7SUFFaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0UsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzdDLGtDQUFrQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFpQixHQUFFLENBQUM7UUFDbkMsSUFBQSxpQ0FBcUIsRUFBQyxNQUFNLENBQUMsQ0FBQztRQUU5QixPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDcEQsc0JBQXNCO1FBQ3RCLE1BQU0sYUFBYSxHQUFHLElBQUksNkJBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRCxNQUFNLGtCQUFrQixHQUFHLElBQUksbUNBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUQsc0RBQXNEO1FBQ3RELElBQUksTUFBVyxDQUFDO1FBQ2hCLElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLHdCQUF3QixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssNEJBQTRCLEVBQUUsQ0FBQztZQUN2RyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7WUFDbEUsTUFBTSxV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QUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3ZELE9BQU8sRUFBRTtvQkFDUCxZQUFZLEVBQUUsS0FBSyxDQUFDLE1BQU07b0JBQzFCLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUM7aUJBQ3hDO2FBQ0YsQ0FDRixDQUNGLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxVQUFVLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBFdmVudEJyaWRnZUV2ZW50LCBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuLi9saWIvZHluYW1vZGIuanMnO1xuaW1wb3J0IHsgRXZlbnRCcmlkZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vbGliL2V2ZW50YnJpZGdlLmpzJztcbmltcG9ydCB7IGxvYWRSdW50aW1lQ29uZmlnLCB2YWxpZGF0ZVJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnLmpzJztcbmltcG9ydCB7IEluYm91bmRNZXNzYWdlRXZlbnRTY2hlbWEsIHR5cGUgSW5ib3VuZE1lc3NhZ2VFdmVudCB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuLyoqXG4gKiBMYW1iZGEgaGFuZGxlciBmb3Igcm91dGluZyBpbmJvdW5kIG1lc3NhZ2VzXG4gKiBUcmlnZ2VyZWQgYnkgRXZlbnRCcmlkZ2UgcnVsZTogbGVhZC5tZXNzYWdlLmNyZWF0ZWRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoXG4gIGV2ZW50OiBFdmVudEJyaWRnZUV2ZW50PHN0cmluZywgYW55PixcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnNvbGUubG9nKCfwn5SlIDEuMCBST1VURVIgSEFORExFUiBTVEFSVCAtIHYxLjQuMCcpO1xuICBjb25zb2xlLmxvZygnQWdlbnRSb3V0ZXIgcmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ/CflKUgMS4xIExvYWRpbmcgcnVudGltZSBjb25maWcnKTtcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICB2YWxpZGF0ZVJ1bnRpbWVDb25maWcoY29uZmlnKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIgSW5pdGlhbGl6aW5nIER5bmFtb0RCIHNlcnZpY2UnKTtcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gVHJhbnNmb3JtIGNoYXQubWVzc2FnZS5hdmFpbGFibGUgdG8gc3RhbmRhcmQgZm9ybWF0XG4gICAgbGV0IGRldGFpbDogYW55O1xuICAgIGlmIChldmVudFsnZGV0YWlsLXR5cGUnXSA9PT0gJ2NoYXQubWVzc2FnZS5hdmFpbGFibGUnICYmIGV2ZW50LnNvdXJjZSA9PT0gJ2t4LW5vdGlmaWNhdGlvbnMtbWVzc2FnaW5nJykge1xuICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjEgVHJhbnNmb3JtaW5nIGNoYXQubWVzc2FnZS5hdmFpbGFibGUgZXZlbnQnKTtcbiAgICAgIGNvbnN0IGNoYXREZXRhaWwgPSBldmVudC5kZXRhaWw7XG4gICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4wIGNoYXREZXRhaWwuY29ubmVjdGlvbklkOicsIGNoYXREZXRhaWwuY29ubmVjdGlvbklkKTtcbiAgICAgIFxuICAgICAgLy8gSUdOT1JFIGFnZW50J3Mgb3duIG1lc3NhZ2VzIC0gY2hlY2sgbXVsdGlwbGUgaW5kaWNhdG9yc1xuICAgICAgLy8gVGhlIGFnZW50IHNldHMgc2V2ZXJhbCBmaWVsZHMgdG8gaWRlbnRpZnkgaXRzIG1lc3NhZ2VzLCBjaGVjayB0aGVtIGFsbFxuICAgICAgXG4gICAgICAvLyBGaXJzdCwgY2hlY2sgaWYgdGhlIHNlbmRlciAoYWN0dWFsIG1lc3NhZ2UgYXV0aG9yKSBpcyBhbiBhZ2VudCBwZXJzb25hXG4gICAgICAvLyBMb2FkIGNoYW5uZWwgdG8gc2VlIHdoaWNoIHBlcnNvbmEocykgYXJlIGFzc2lnbmVkIHRvIHRoaXMgY2hhbm5lbFxuICAgICAgbGV0IGFzc2lnbmVkUGVyc29uYUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgYm90RW1wbG95ZWVJZHM6IHN0cmluZ1tdID0gW107XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFF1ZXJ5Q29tbWFuZCB9ID0gYXdhaXQgaW1wb3J0KCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbiAgICAgICAgY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG4gICAgICAgIFxuICAgICAgICAvLyBRdWVyeSBieSBjaGFubmVsSWQgKFBLKSAtIGNoYW5uZWxzIHRhYmxlIHVzZXMgY2hhbm5lbElkIGFzIFBLLCBub3QgY29tcG9zaXRlIGtleVxuICAgICAgICBjb25zdCBjaGFubmVsUmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5DSEFOTkVMU19UQUJMRSB8fCAnS3hHZW4tY2hhbm5lbHMtdjInLFxuICAgICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdjaGFubmVsSWQgPSA6Y2hhbm5lbElkJyxcbiAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICAgICAnOmNoYW5uZWxJZCc6IGV2ZW50LmRldGFpbC5jaGFubmVsSWRcbiAgICAgICAgICB9LFxuICAgICAgICAgIExpbWl0OiAxXG4gICAgICAgIH0pKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuMi4xLjAuMiBRdWVyeSByZXN1bHQ6IEl0ZW1zIGNvdW50PSR7Y2hhbm5lbFJlc3VsdC5JdGVtcz8ubGVuZ3RofSwgdGFibGVOYW1lPSR7cHJvY2Vzcy5lbnYuQ0hBTk5FTFNfVEFCTEUgfHwgJ2t4LWNoYW5uZWxzJ31gKTtcbiAgICAgICAgY29uc3QgY2hhbm5lbERhdGEgPSBjaGFubmVsUmVzdWx0Lkl0ZW1zPy5bMF07XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuMi4xLjAuMi41IENoYW5uZWwgZGF0YTogJHtKU09OLnN0cmluZ2lmeShjaGFubmVsRGF0YSl9YCk7XG4gICAgICAgIC8vIFN1cHBvcnQgYm90aCBib3RFbXBsb3llZUlkcyAoYXJyYXkpIGFuZCBib3RFbXBsb3llZUlkIChzaW5ndWxhciwgYmFja3dhcmQgY29tcGF0KVxuICAgICAgICBib3RFbXBsb3llZUlkcyA9IGNoYW5uZWxEYXRhPy5ib3RFbXBsb3llZUlkcyB8fCAoY2hhbm5lbERhdGE/LmJvdEVtcGxveWVlSWQgPyBbY2hhbm5lbERhdGEuYm90RW1wbG95ZWVJZF0gOiBbXSkgfHwgKGNoYW5uZWxEYXRhPy5wZXJzb25hSWQgPyBbY2hhbm5lbERhdGEucGVyc29uYUlkXSA6IFtdKTtcbiAgICAgICAgYXNzaWduZWRQZXJzb25hSWQgPSBwcm9jZXNzLmVudi5QRVJTT05BX0lEIHx8ICdkZWZhdWx0JzsgLy8gVGhpcyBMYW1iZGEncyBwZXJzb25hIElEIGZyb20gZW52aXJvbm1lbnRcbiAgICAgICAgY29uc29sZS5sb2coYPCflKUgMS4yLjEuMC4zIENoYW5uZWwgJHtldmVudC5kZXRhaWwuY2hhbm5lbElkfSBoYXMgYm90RW1wbG95ZWVJZHM6ICR7SlNPTi5zdHJpbmdpZnkoYm90RW1wbG95ZWVJZHMpfSwgdGhpcyBMYW1iZGEncyBwZXJzb25hSWQ6ICR7YXNzaWduZWRQZXJzb25hSWR9YCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfwn5SlIDEuMi4xLjAuMiBFUlJPUiAtIEZhaWxlZCB0byBsb2FkIGNoYW5uZWw6JywgZXJyb3IpO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiB0aGUgc2VuZGVySWQgbWF0Y2hlcyBBTlkgb2YgdGhlIGFzc2lnbmVkIHBlcnNvbmFzIChtZWFuaW5nIGFuIEFJIHNlbnQgdGhpcyBtZXNzYWdlKVxuICAgICAgY29uc3QgaXNTZW5kZXJUaGVBZ2VudCA9IGJvdEVtcGxveWVlSWRzLmluY2x1ZGVzKGNoYXREZXRhaWwuc2VuZGVySWQpO1xuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiB0aGlzIGV2ZW50IGlzIEZPUiBhIGh1bWFuIHBhcnRpY2lwYW50IChub3QgYSBib3QpXG4gICAgICAvLyBUaGUgZmFub3V0IGNyZWF0ZXMgZXZlbnRzIGZvciBBTEwgY2hhbm5lbCBwYXJ0aWNpcGFudHMgKGh1bWFucyArIGJvdHMpXG4gICAgICAvLyBXZSBzaG91bGQgT05MWSBwcm9jZXNzIGV2ZW50cyB3aGVyZSB1c2VySWQgaXMgYSBib3QgcGVyc29uYVxuICAgICAgY29uc3QgaXNSZWNpcGllbnRUaGVCb3QgPSBib3RFbXBsb3llZUlkcy5pbmNsdWRlcyhjaGF0RGV0YWlsLnVzZXJJZCk7XG4gICAgICBcbiAgICAgIGlmICghaXNSZWNpcGllbnRUaGVCb3QpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjEuMC41IFNLSVBQSU5HIC0gRXZlbnQgaXMgZm9yIGh1bWFuIHBhcnRpY2lwYW50LCBub3QgYm90Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGB1c2VySWQ9JHtjaGF0RGV0YWlsLnVzZXJJZH0sIGJvdEVtcGxveWVlSWRzPSR7SlNPTi5zdHJpbmdpZnkoYm90RW1wbG95ZWVJZHMpfWApO1xuICAgICAgICByZXR1cm47IC8vIERvbid0IHByb2Nlc3MgZXZlbnRzIG1lYW50IGZvciBodW1hbiBwYXJ0aWNpcGFudHNcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gQ1JJVElDQUw6IElmIHRoZSBzZW5kZXIgaXMgYSBib3QsIHNraXAgaW1tZWRpYXRlbHkgdG8gYXZvaWQgaW5maW5pdGUgbG9vcHNcbiAgICAgIGlmIChpc1NlbmRlclRoZUFnZW50KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMi4xLjAuNiBTS0lQUElORyAtIFNlbmRlciBpcyBhIGJvdCAoZWFybHkgY2hlY2spJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBzZW5kZXJJZD0ke2NoYXREZXRhaWwuc2VuZGVySWR9LCBib3RFbXBsb3llZUlkcz0ke0pTT04uc3RyaW5naWZ5KGJvdEVtcGxveWVlSWRzKX1gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBpc0FnZW50TWVzc2FnZSA9IFxuICAgICAgICBpc1NlbmRlclRoZUFnZW50IHx8IC8vIFRoZSBhY3R1YWwgc2VuZGVyIGlzIHRoZSBBSSBhZ2VudCBwZXJzb25hXG4gICAgICAgIGNoYXREZXRhaWwudXNlclR5cGUgPT09ICdhZ2VudCcgfHxcbiAgICAgICAgY2hhdERldGFpbC5zZW5kZXJUeXBlID09PSAnYWdlbnQnIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLm1lc3NhZ2VJZCAmJiBjaGF0RGV0YWlsLm1lc3NhZ2VJZC5zdGFydHNXaXRoKCdhZ2VudC0nKSkgfHxcbiAgICAgICAgKGNoYXREZXRhaWwubWV0YWRhdGEgJiYgY2hhdERldGFpbC5tZXRhZGF0YS5zZW5kZXJUeXBlID09PSAnYWdlbnQnKSB8fFxuICAgICAgICAoY2hhdERldGFpbC5tZXRhZGF0YSAmJiBjaGF0RGV0YWlsLm1ldGFkYXRhLm9yaWdpbk1hcmtlciA9PT0gJ3BlcnNvbmEnKSB8fFxuICAgICAgICAoY2hhdERldGFpbC5tZXRhZGF0YSAmJiBjaGF0RGV0YWlsLm1ldGFkYXRhLmFnZW50SWQpIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLm1ldGFkYXRhICYmIGNoYXREZXRhaWwubWV0YWRhdGEuaXNBZ2VudEdlbmVyYXRlZCA9PT0gdHJ1ZSkgfHxcbiAgICAgICAgKGNoYXREZXRhaWwub3JpZ2luTWFya2VyID09PSAncGVyc29uYScpIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLmFnZW50SWQpO1xuICAgICAgXG4gICAgICBpZiAoaXNBZ2VudE1lc3NhZ2UpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjEuMSBTS0lQUElORyAtIEFnZW50IG1lc3NhZ2UgZGV0ZWN0ZWQnKTtcbiAgICAgICAgY29uc29sZS5sb2coYERldGVjdGlvbjogYXNzaWduZWRQZXJzb25hPSR7YXNzaWduZWRQZXJzb25hSWR9LCBzZW5kZXJJZD0ke2NoYXREZXRhaWwuc2VuZGVySWR9LCBpc1NlbmRlclRoZUFnZW50PSR7aXNTZW5kZXJUaGVBZ2VudH1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYHVzZXJUeXBlPSR7Y2hhdERldGFpbC51c2VyVHlwZX0sIHNlbmRlclR5cGU9JHtjaGF0RGV0YWlsLnNlbmRlclR5cGV9LCBtZXNzYWdlSWQ9JHtjaGF0RGV0YWlsLm1lc3NhZ2VJZH0sIG9yaWdpbk1hcmtlcj0ke2NoYXREZXRhaWwub3JpZ2luTWFya2VyIHx8IGNoYXREZXRhaWwubWV0YWRhdGE/Lm9yaWdpbk1hcmtlcn1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYHVzZXJJZDogJHtjaGF0RGV0YWlsLnVzZXJJZH0sIHNlbmRlcklkOiAke2NoYXREZXRhaWwuc2VuZGVySWR9YCk7XG4gICAgICAgIHJldHVybjsgLy8gRG9uJ3QgcHJvY2VzcyBhZ2VudCdzIG93biByZXNwb25zZXNcbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjEuMiBQcm9jZXNzaW5nIGFzIFVTRVIgbWVzc2FnZSAobm90IGRldGVjdGVkIGFzIGFnZW50KScpO1xuICAgICAgY29uc29sZS5sb2coYGFzc2lnbmVkUGVyc29uYT0ke2Fzc2lnbmVkUGVyc29uYUlkfSwgc2VuZGVySWQ9JHtjaGF0RGV0YWlsLnNlbmRlcklkfSwgdXNlcklkPSR7Y2hhdERldGFpbC51c2VySWR9YCk7XG4gICAgICBjb25zb2xlLmxvZyhgdXNlclR5cGU9JHtjaGF0RGV0YWlsLnVzZXJUeXBlfSwgc2VuZGVyVHlwZT0ke2NoYXREZXRhaWwuc2VuZGVyVHlwZX0sIG1lc3NhZ2VJZD0ke2NoYXREZXRhaWwubWVzc2FnZUlkfWApXG4gICAgICBcbiAgICAgIC8vIENoZWNrIG1lc3NhZ2UgZnJlc2huZXNzIGZvciBkZWJ1Z2dpbmdcbiAgICAgIGNvbnN0IG1lc3NhZ2VUaW1lc3RhbXAgPSBjaGF0RGV0YWlsLm1ldGFkYXRhPy50aW1lc3RhbXAgfHwgY2hhdERldGFpbC50aW1lc3RhbXAgfHwgY2hhdERldGFpbC5tZXNzYWdlX3RzO1xuICAgICAgaWYgKG1lc3NhZ2VUaW1lc3RhbXApIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZVRpbWUgPSBuZXcgRGF0ZShtZXNzYWdlVGltZXN0YW1wKS5nZXRUaW1lKCk7XG4gICAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IGFnZUluU2Vjb25kcyA9IChub3cgLSBtZXNzYWdlVGltZSkgLyAxMDAwO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UpSAxLjIuMS4zIE1lc3NhZ2UgYWdlOiAke2FnZUluU2Vjb25kcy50b0ZpeGVkKDEpfXMgKHRpbWVzdGFtcDogJHttZXNzYWdlVGltZXN0YW1wfSlgKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gRXh0cmFjdCB0ZW5hbnRJZCBhbmQgcGVyc29uYSBuYW1lIC0gaXQncyBpbiB0aGUgZGV0YWlsIG9yIG1ldGFkYXRhXG4gICAgICBsZXQgdGVuYW50SWQgPSBjaGF0RGV0YWlsLnRlbmFudElkIHx8IGNoYXREZXRhaWwubWV0YWRhdGE/LnRlbmFudElkO1xuICAgICAgbGV0IHBlcnNvbmFOYW1lID0gJ0FJIEFzc2lzdGFudCc7IC8vIERlZmF1bHQgZmFsbGJhY2tcbiAgICAgIFxuICAgICAgLy8gSWYgd2UgaGF2ZSB0ZW5hbnRJZCwgbG9hZCB0aGUgZnVsbCBwZXJzb25hIHRvIGdldCB0aGUgbmFtZVxuICAgICAgaWYgKHRlbmFudElkICYmIGNoYXREZXRhaWwudXNlcklkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMi4yIExvYWRpbmcgcGVyc29uYSBuYW1lIGZvciB0ZW5hbnRJZDonLCB0ZW5hbnRJZCwgJ3BlcnNvbmFJZDonLCBjaGF0RGV0YWlsLnVzZXJJZCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBEeW5hbW9EQkNsaWVudCB9ID0gYXdhaXQgaW1wb3J0KCdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInKTtcbiAgICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XG4gICAgICAgICAgY29uc3QgY2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbiAgICAgICAgICBjb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgICAgICBUYWJsZU5hbWU6IGNvbmZpZy5wZXJzb25hc1RhYmxlIHx8IHByb2Nlc3MuZW52LlBFUlNPTkFTX1RBQkxFIHx8ICdwZXJzb25hcycsXG4gICAgICAgICAgICBLZXk6IHtcbiAgICAgICAgICAgICAgdGVuYW50SWQ6IHRlbmFudElkLFxuICAgICAgICAgICAgICBwZXJzb25hSWQ6IGNoYXREZXRhaWwudXNlcklkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChyZXN1bHQuSXRlbSkge1xuICAgICAgICAgICAgcGVyc29uYU5hbWUgPSByZXN1bHQuSXRlbS5uYW1lIHx8IHBlcnNvbmFOYW1lO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjMgRm91bmQgcGVyc29uYSBuYW1lOicsIHBlcnNvbmFOYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjMgTm8gcGVyc29uYSBmb3VuZCBmb3IgdGVuYW50SWQ6JywgdGVuYW50SWQsICdwZXJzb25hSWQ6JywgY2hhdERldGFpbC51c2VySWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfwn5SlIDEuMi4zIEVSUk9SIC0gRmFpbGVkIHRvIGxvb2t1cCBwZXJzb25hOicsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoIXRlbmFudElkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGRldGVybWluZSB0ZW5hbnRJZCBmcm9tIHBlcnNvbmFJZDogJHtjaGF0RGV0YWlsLnVzZXJJZH1gKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gTm8gZ3VhcmQgbmVlZGVkIC0gd2UnbGwgbG9hZCB3aGF0ZXZlciBwZXJzb25hIGlzIGFzc2lnbmVkIGluIGJvdEVtcGxveWVlSWRzXG4gICAgICAvLyBBbGwgTGFtYmRhcyBwcm9jZXNzIHRoZSBtZXNzYWdlIGFuZCBsb2FkIHRoZSBhc3NpZ25lZCBwZXJzb25hKHMpIGR5bmFtaWNhbGx5XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFByb2Nlc3NpbmcgbWVzc2FnZSAtIHdpbGwgbG9hZCBwZXJzb25hKHMpIGZyb20gYm90RW1wbG95ZWVJZHM6ICR7SlNPTi5zdHJpbmdpZnkoYm90RW1wbG95ZWVJZHMpfWApO1xuICAgICAgXG4gICAgICBkZXRhaWwgPSB7XG4gICAgICAgIHRlbmFudElkLFxuICAgICAgICBjb252ZXJzYXRpb25faWQ6IGNoYXREZXRhaWwuY2hhbm5lbElkLFxuICAgICAgICBlbWFpbF9sYzogYGNoYW5uZWwtJHtjaGF0RGV0YWlsLmNoYW5uZWxJZH1AYW5vbnltb3VzLmNvbWAsXG4gICAgICAgIHRleHQ6IGNoYXREZXRhaWwuY29udGVudCxcbiAgICAgICAgc291cmNlOiAnY2hhdCcsXG4gICAgICAgIHRpbWVzdGFtcHM6IHtcbiAgICAgICAgICByZWNlaXZlZDogY2hhdERldGFpbC50aW1lc3RhbXAsXG4gICAgICAgICAgcHJvY2Vzc2VkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgICAgfSxcbiAgICAgICAgY2hhbm5lbF9jb250ZXh0OiB7XG4gICAgICAgICAgY2hhdDoge1xuICAgICAgICAgICAgc2Vzc2lvbklkOiBjaGF0RGV0YWlsLmNoYW5uZWxJZCxcbiAgICAgICAgICAgIGNsaWVudElkOiBjaGF0RGV0YWlsLnNlbmRlcklkLFxuICAgICAgICAgICAgbWVzc2FnZUlkOiBjaGF0RGV0YWlsLm1lc3NhZ2VJZCxcbiAgICAgICAgICAgIGNvbm5lY3Rpb25JZDogY2hhdERldGFpbC5jb25uZWN0aW9uSWQgLy8gU3RvcmUgdGhlIFdlYlNvY2tldCBjb25uZWN0aW9uSWQgaWYgYXZhaWxhYmxlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjaGFubmVsSWQ6IGNoYXREZXRhaWwuY2hhbm5lbElkLFxuICAgICAgICB1c2VySWQ6IGNoYXREZXRhaWwudXNlcklkLCAvLyBQZXJzb25hIElEICh0aGUgYWdlbnQpXG4gICAgICAgIHNlbmRlcklkOiBjaGF0RGV0YWlsLnNlbmRlcklkLCAvLyBVc2VyIElEICh0aGUgaHVtYW4pXG4gICAgICAgIGFzc2lnbmVkUGVyc29uYUlkOiBhc3NpZ25lZFBlcnNvbmFJZCwgLy8gU3RvcmUgZm9yIGFnZW50IGludm9jYXRpb24gKGJhY2t3YXJkIGNvbXBhdClcbiAgICAgICAgYm90RW1wbG95ZWVJZHM6IGJvdEVtcGxveWVlSWRzLCAvLyBBcnJheSBvZiBwZXJzb25hIElEcyB0byBwcm9jZXNzXG4gICAgICAgIHVzZXJOYW1lOiBwZXJzb25hTmFtZSwgLy8gVXNlIHRoZSBwZXJzb25hJ3MgYWN0dWFsIG5hbWVcbiAgICAgICAgY29ubmVjdGlvbklkOiBjaGF0RGV0YWlsLmNvbm5lY3Rpb25JZCAvLyBQYXNzIHRocm91Z2ggdGhlIGNvbm5lY3Rpb25JZCBmb3IgcmVzcG9uc2Ugcm91dGluZ1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVmFsaWRhdGUgaW5jb21pbmcgZXZlbnQgYXMgc3RhbmRhcmQgZm9ybWF0XG4gICAgICBjb25zdCB2YWxpZGF0ZWRFdmVudCA9IEluYm91bmRNZXNzYWdlRXZlbnRTY2hlbWEucGFyc2UoZXZlbnQpO1xuICAgICAgZGV0YWlsID0gdmFsaWRhdGVkRXZlbnQuZGV0YWlsO1xuXG4gICAgICBpZiAoZXZlbnRbJ2RldGFpbC10eXBlJ10gPT09ICdjaGF0Lm1lc3NhZ2UnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMi54IGV2YWx1YXRpbmcgZGlyZWN0IGNoYXQubWVzc2FnZSBldmVudCcpO1xuXG4gICAgICAgIGlmIChkZXRhaWwudXNlclR5cGUgPT09ICdhZ2VudCcpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIueCBTS0lQUElORyBkaXJlY3QgY2hhdC5tZXNzYWdlIGV2ZW50IGZyb20gYWdlbnQgKHVzZXJUeXBlPWFnZW50KScpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlzQWdlbnRNZXNzYWdlID1cbiAgICAgICAgICBkZXRhaWwudXNlcklkID09PSBkZXRhaWwuc2VuZGVySWQgfHxcbiAgICAgICAgICAoZGV0YWlsLm1lc3NhZ2VJZCAmJiBkZXRhaWwubWVzc2FnZUlkLnN0YXJ0c1dpdGgoJ2FnZW50LScpKSB8fFxuICAgICAgICAgIChkZXRhaWwubWV0YWRhdGEgJiYgZGV0YWlsLm1ldGFkYXRhLmlzQWdlbnRHZW5lcmF0ZWQgPT09IHRydWUpO1xuXG4gICAgICAgIGlmIChpc0FnZW50TWVzc2FnZSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMi54IFNLSVBQSU5HIGRpcmVjdCBjaGF0Lm1lc3NhZ2UgZXZlbnQgZGV0ZWN0ZWQgYXMgYWdlbnQgbWVzc2FnZScpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGB1c2VySWQ6ICR7ZGV0YWlsLnVzZXJJZH0sIHNlbmRlcklkOiAke2RldGFpbC5zZW5kZXJJZH0sIG1lc3NhZ2VJZDogJHtkZXRhaWwubWVzc2FnZUlkfWApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBSZXNvbHZlIGNvbnRhY3QgaW5mb3JtYXRpb25cbiAgICBsZXQgZW1haWxMYyA9IGRldGFpbC5lbWFpbF9sYztcbiAgICBsZXQgbGVhZElkID0gZGV0YWlsLmxlYWRfaWQ7XG4gICAgXG4gICAgLy8gSWYgd2Ugb25seSBoYXZlIHBob25lIG51bWJlciwgcmVzb2x2ZSB0byBlbWFpbF9sYyB2aWEgbGVhZHMgdGFibGVcbiAgICBpZiAoIWVtYWlsTGMgJiYgZGV0YWlsLnBob25lX2UxNjQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBSZXNvbHZpbmcgY29udGFjdCBmcm9tIHBob25lOiAke2RldGFpbC5waG9uZV9lMTY0fWApO1xuICAgICAgXG4gICAgICBjb25zdCByZXNvbHZlZEVtYWlsTGMgPSBhd2FpdCBkeW5hbW9TZXJ2aWNlLnJlc29sdmVDb250YWN0RnJvbVBob25lKFxuICAgICAgICBkZXRhaWwudGVuYW50SWQsXG4gICAgICAgIGRldGFpbC5waG9uZV9lMTY0XG4gICAgICApO1xuICAgICAgXG4gICAgICBpZiAoIXJlc29sdmVkRW1haWxMYykge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBjb250YWN0IGZvciBwaG9uZTogJHtkZXRhaWwucGhvbmVfZTE2NH1gKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEVtaXQgZXJyb3IgZXZlbnRcbiAgICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudEVycm9yKFxuICAgICAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudEVycm9yRXZlbnQoXG4gICAgICAgICAgICBkZXRhaWwudGVuYW50SWQsXG4gICAgICAgICAgICBgQ291bGQgbm90IHJlc29sdmUgY29udGFjdCBmb3IgcGhvbmU6ICR7ZGV0YWlsLnBob25lX2UxNjR9YCxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgICAgICAgIHBob25lX2UxNjQ6IGRldGFpbC5waG9uZV9lMTY0LFxuICAgICAgICAgICAgICAgIHNvdXJjZTogZGV0YWlsLnNvdXJjZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGVtYWlsTGMgPSByZXNvbHZlZEVtYWlsTGM7XG4gICAgICBcbiAgICAgIC8vIEFsc28gZmV0Y2ggdGhlIGxlYWQgdG8gZ2V0IGxlYWRfaWRcbiAgICAgIGNvbnN0IGxlYWQgPSBhd2FpdCBkeW5hbW9TZXJ2aWNlLmdldExlYWQoZGV0YWlsLnRlbmFudElkLCBlbWFpbExjKTtcbiAgICAgIGxlYWRJZCA9IGxlYWQ/LmxlYWRfaWQ7XG4gICAgfVxuICAgIFxuICAgIGlmICghZW1haWxMYykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZGV0ZXJtaW5lIGVtYWlsX2xjIGZvciBjb250YWN0Jyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMyBTa2lwcGluZyBwdXRNZXNzYWdlIC0gbWVzc2FnaW5nIHNlcnZpY2UgaGFuZGxlcyBwZXJzaXN0ZW5jZScpO1xuICAgIFxuICAgIC8vIEludm9rZSBBZ2VudEZuIHdpdGggdGhlIHByb2Nlc3NlZCBjb250ZXh0XG4gICAgY29uc3QgeyBoYW5kbGVyOiBhZ2VudEhhbmRsZXIgfSA9IGF3YWl0IGltcG9ydCgnLi9hZ2VudC5qcycpO1xuICAgIFxuICAgIC8vIEdldCBib3RFbXBsb3llZUlkcyBmcm9tIGRldGFpbCAoc2V0IGVhcmxpZXIgd2hlbiBsb2FkaW5nIGNoYW5uZWwpXG4gICAgY29uc3QgcGVyc29uYUlkcyA9IChkZXRhaWwgYXMgYW55KS5ib3RFbXBsb3llZUlkcyB8fCBbZGV0YWlsLmFzc2lnbmVkUGVyc29uYUlkIHx8IGRldGFpbC51c2VySWRdO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuNCBQcm9jZXNzaW5nIG1lc3NhZ2UgZm9yICR7cGVyc29uYUlkcy5sZW5ndGh9IHBlcnNvbmEocyk6ICR7SlNPTi5zdHJpbmdpZnkocGVyc29uYUlkcyl9YCk7XG4gICAgXG4gICAgLy8gTG9vcCB0aHJvdWdoIGVhY2ggcGVyc29uYSBhbmQgZ2VuZXJhdGUgYSByZXNwb25zZVxuICAgIGZvciAoY29uc3QgcGVyc29uYUlkIG9mIHBlcnNvbmFJZHMpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuNC4ke3BlcnNvbmFJZHMuaW5kZXhPZihwZXJzb25hSWQpICsgMX0gR2VuZXJhdGluZyByZXNwb25zZSBmb3IgcGVyc29uYTogJHtwZXJzb25hSWR9YCk7XG4gICAgICBcbiAgICAgIGF3YWl0IGFnZW50SGFuZGxlcih7XG4gICAgICAgIHRlbmFudElkOiBkZXRhaWwudGVuYW50SWQsXG4gICAgICAgIGVtYWlsX2xjOiBlbWFpbExjLFxuICAgICAgICB0ZXh0OiBkZXRhaWwudGV4dCxcbiAgICAgICAgc291cmNlOiBkZXRhaWwuc291cmNlLFxuICAgICAgICBjaGFubmVsX2NvbnRleHQ6IGRldGFpbC5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgIGxlYWRfaWQ6IGxlYWRJZCxcbiAgICAgICAgY29udmVyc2F0aW9uX2lkOiBkZXRhaWwuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICBtZXNzYWdlX3RzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIC8vIFBhc3MgY2hhdC1zcGVjaWZpYyBjb250ZXh0IGZvciByZXNwb25zZSBlbWlzc2lvblxuICAgICAgICBjaGFubmVsSWQ6IGRldGFpbC5jaGFubmVsSWQsXG4gICAgICAgIHVzZXJJZDogcGVyc29uYUlkLCAvLyBDdXJyZW50IHBlcnNvbmEgaW4gbG9vcFxuICAgICAgICBzZW5kZXJJZDogZGV0YWlsLnNlbmRlcklkLFxuICAgICAgICB1c2VyTmFtZTogZGV0YWlsLnVzZXJOYW1lLFxuICAgICAgfSwgY29udGV4dCk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgMS40LiR7cGVyc29uYUlkcy5pbmRleE9mKHBlcnNvbmFJZCkgKyAxfSBDb21wbGV0ZWQgcmVzcG9uc2UgZm9yIHBlcnNvbmE6ICR7cGVyc29uYUlkfWApO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhgQWdlbnRSb3V0ZXIgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSAtIHByb2Nlc3NlZCAke3BlcnNvbmFJZHMubGVuZ3RofSBwZXJzb25hKHMpYCk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQWdlbnRSb3V0ZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgIFxuICAgIC8vIFRyeSB0byBlbWl0IGVycm9yIGV2ZW50IGlmIHdlIGhhdmUgZW5vdWdoIGNvbnRleHRcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcbiAgICAgIFxuICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudEVycm9yKFxuICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxuICAgICAgICAgIGV2ZW50LmRldGFpbD8udGVuYW50SWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gcm91dGVyIGVycm9yJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgICAgICBldmVudF9zb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgICAgICAgICAgZXZlbnRfZGV0YWlsX3R5cGU6IGV2ZW50WydkZXRhaWwtdHlwZSddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXZlbnRFcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGVtaXQgZXJyb3IgZXZlbnQ6JywgZXZlbnRFcnJvcik7XG4gICAgfVxuICAgIFxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=