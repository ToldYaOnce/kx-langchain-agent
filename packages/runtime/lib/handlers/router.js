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
    console.log('🔥 1.0 ROUTER HANDLER START - v1.3.7');
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
            // Load channel to see which persona is assigned to this channel
            let assignedPersonaId;
            try {
                const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                const { DynamoDBDocumentClient, QueryCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
                const client = new DynamoDBClient({});
                const docClient = DynamoDBDocumentClient.from(client);
                // Query by channelId (PK) - channels table uses channelId as PK, not composite key
                const channelResult = await docClient.send(new QueryCommand({
                    TableName: process.env.CHANNELS_TABLE || 'kx-channels',
                    KeyConditionExpression: 'channelId = :channelId',
                    ExpressionAttributeValues: {
                        ':channelId': event.detail.channelId
                    },
                    Limit: 1
                }));
                const channelData = channelResult.Items?.[0];
                assignedPersonaId = channelData?.botEmployeeId || channelData?.personaId; // Check both field names
                console.log(`🔥 1.2.1.0.3 Channel ${event.detail.channelId} has assignedPersona: ${assignedPersonaId} (from botEmployeeId)`);
            }
            catch (error) {
                console.error('🔥 1.2.1.0.2 ERROR - Failed to load channel:', error);
            }
            // Check if the senderId matches the assigned persona (meaning the AI sent this message)
            const isSenderTheAgent = assignedPersonaId && chatDetail.senderId === assignedPersonaId;
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
                        TableName: config.personasTable || process.env.PERSONAS_TABLE || 'DelayedReplies-personas',
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
            // Guard: Only respond if this message is FOR the assigned bot
            if (assignedPersonaId && chatDetail.userId !== assignedPersonaId) {
                console.log(`🔥 1.2.1.0.4 SKIPPING - Message is for userId=${chatDetail.userId}, but assigned bot is ${assignedPersonaId}`);
                return;
            }
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
                assignedPersonaId: assignedPersonaId, // Store for agent invocation
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
        await agentHandler({
            tenantId: detail.tenantId,
            email_lc: emailLc,
            text: detail.text,
            source: detail.source,
            channel_context: detail.channel_context,
            lead_id: leadId,
            conversation_id: detail.conversation_id,
            message_ts: new Date().toISOString(), // Use current timestamp since we're not storing
            // Pass chat-specific context for response emission
            channelId: detail.channelId,
            userId: detail.assignedPersonaId || detail.userId, // Use channel's assigned bot (King Mo), not recipient
            senderId: detail.senderId, // User ID (human sender)
            userName: detail.userName,
        }, context);
        console.log('AgentRouter completed successfully');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2hhbmRsZXJzL3JvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVVBLDBCQXFSQztBQTlSRCxvREFBcUQ7QUFDckQsMERBQTJEO0FBQzNELGdEQUE0RTtBQUM1RSxnREFBd0Y7QUFFeEY7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FDM0IsS0FBb0MsRUFDcEMsT0FBZ0I7SUFFaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0UsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzdDLGtDQUFrQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFpQixHQUFFLENBQUM7UUFDbkMsSUFBQSxpQ0FBcUIsRUFBQyxNQUFNLENBQUMsQ0FBQztRQUU5QixPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDcEQsc0JBQXNCO1FBQ3RCLE1BQU0sYUFBYSxHQUFHLElBQUksNkJBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRCxNQUFNLGtCQUFrQixHQUFHLElBQUksbUNBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUQsc0RBQXNEO1FBQ3RELElBQUksTUFBVyxDQUFDO1FBQ2hCLElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLHdCQUF3QixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssNEJBQTRCLEVBQUUsQ0FBQztZQUN2RyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7WUFDbEUsTUFBTSxV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QUFLLENBQUMsQ0FBQztRQUUzQyxvREFBb0Q7UUFDcEQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBQSw2QkFBaUIsR0FBRSxDQUFDO1lBQ25DLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxtQ0FBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUUxRCxNQUFNLGtCQUFrQixDQUFDLGlCQUFpQixDQUN4QyxtQ0FBa0IsQ0FBQyxxQkFBcUIsQ0FDdEMsS0FBSyxDQUFDLE1BQU0sRUFBRSxRQUFRLElBQUksU0FBUyxFQUNuQyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsRUFDL0Q7Z0JBQ0UsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQ3ZELE9BQU8sRUFBRTtvQkFDUCxZQUFZLEVBQUUsS0FBSyxDQUFDLE1BQU07b0JBQzFCLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUM7aUJBQ3hDO2FBQ0YsQ0FDRixDQUNGLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxVQUFVLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBFdmVudEJyaWRnZUV2ZW50LCBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuLi9saWIvZHluYW1vZGIuanMnO1xuaW1wb3J0IHsgRXZlbnRCcmlkZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vbGliL2V2ZW50YnJpZGdlLmpzJztcbmltcG9ydCB7IGxvYWRSdW50aW1lQ29uZmlnLCB2YWxpZGF0ZVJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnLmpzJztcbmltcG9ydCB7IEluYm91bmRNZXNzYWdlRXZlbnRTY2hlbWEsIHR5cGUgSW5ib3VuZE1lc3NhZ2VFdmVudCB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuLyoqXG4gKiBMYW1iZGEgaGFuZGxlciBmb3Igcm91dGluZyBpbmJvdW5kIG1lc3NhZ2VzXG4gKiBUcmlnZ2VyZWQgYnkgRXZlbnRCcmlkZ2UgcnVsZTogbGVhZC5tZXNzYWdlLmNyZWF0ZWRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoXG4gIGV2ZW50OiBFdmVudEJyaWRnZUV2ZW50PHN0cmluZywgYW55PixcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnNvbGUubG9nKCfwn5SlIDEuMCBST1VURVIgSEFORExFUiBTVEFSVCAtIHYxLjMuNycpO1xuICBjb25zb2xlLmxvZygnQWdlbnRSb3V0ZXIgcmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ/CflKUgMS4xIExvYWRpbmcgcnVudGltZSBjb25maWcnKTtcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICB2YWxpZGF0ZVJ1bnRpbWVDb25maWcoY29uZmlnKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIgSW5pdGlhbGl6aW5nIER5bmFtb0RCIHNlcnZpY2UnKTtcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gVHJhbnNmb3JtIGNoYXQubWVzc2FnZS5hdmFpbGFibGUgdG8gc3RhbmRhcmQgZm9ybWF0XG4gICAgbGV0IGRldGFpbDogYW55O1xuICAgIGlmIChldmVudFsnZGV0YWlsLXR5cGUnXSA9PT0gJ2NoYXQubWVzc2FnZS5hdmFpbGFibGUnICYmIGV2ZW50LnNvdXJjZSA9PT0gJ2t4LW5vdGlmaWNhdGlvbnMtbWVzc2FnaW5nJykge1xuICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjEgVHJhbnNmb3JtaW5nIGNoYXQubWVzc2FnZS5hdmFpbGFibGUgZXZlbnQnKTtcbiAgICAgIGNvbnN0IGNoYXREZXRhaWwgPSBldmVudC5kZXRhaWw7XG4gICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4wIGNoYXREZXRhaWwuY29ubmVjdGlvbklkOicsIGNoYXREZXRhaWwuY29ubmVjdGlvbklkKTtcbiAgICAgIFxuICAgICAgLy8gSUdOT1JFIGFnZW50J3Mgb3duIG1lc3NhZ2VzIC0gY2hlY2sgbXVsdGlwbGUgaW5kaWNhdG9yc1xuICAgICAgLy8gVGhlIGFnZW50IHNldHMgc2V2ZXJhbCBmaWVsZHMgdG8gaWRlbnRpZnkgaXRzIG1lc3NhZ2VzLCBjaGVjayB0aGVtIGFsbFxuICAgICAgXG4gICAgICAvLyBGaXJzdCwgY2hlY2sgaWYgdGhlIHNlbmRlciAoYWN0dWFsIG1lc3NhZ2UgYXV0aG9yKSBpcyBhbiBhZ2VudCBwZXJzb25hXG4gICAgICAvLyBMb2FkIGNoYW5uZWwgdG8gc2VlIHdoaWNoIHBlcnNvbmEgaXMgYXNzaWduZWQgdG8gdGhpcyBjaGFubmVsXG4gICAgICBsZXQgYXNzaWduZWRQZXJzb25hSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyk7XG4gICAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUXVlcnlDb21tYW5kIH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuICAgICAgICBjb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFF1ZXJ5IGJ5IGNoYW5uZWxJZCAoUEspIC0gY2hhbm5lbHMgdGFibGUgdXNlcyBjaGFubmVsSWQgYXMgUEssIG5vdCBjb21wb3NpdGUga2V5XG4gICAgICAgIGNvbnN0IGNoYW5uZWxSZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LkNIQU5ORUxTX1RBQkxFIHx8ICdreC1jaGFubmVscycsXG4gICAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ2NoYW5uZWxJZCA9IDpjaGFubmVsSWQnLFxuICAgICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICAgICc6Y2hhbm5lbElkJzogZXZlbnQuZGV0YWlsLmNoYW5uZWxJZFxuICAgICAgICAgIH0sXG4gICAgICAgICAgTGltaXQ6IDFcbiAgICAgICAgfSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY2hhbm5lbERhdGEgPSBjaGFubmVsUmVzdWx0Lkl0ZW1zPy5bMF07XG4gICAgICAgIGFzc2lnbmVkUGVyc29uYUlkID0gY2hhbm5lbERhdGE/LmJvdEVtcGxveWVlSWQgfHwgY2hhbm5lbERhdGE/LnBlcnNvbmFJZDsgLy8gQ2hlY2sgYm90aCBmaWVsZCBuYW1lc1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UpSAxLjIuMS4wLjMgQ2hhbm5lbCAke2V2ZW50LmRldGFpbC5jaGFubmVsSWR9IGhhcyBhc3NpZ25lZFBlcnNvbmE6ICR7YXNzaWduZWRQZXJzb25hSWR9IChmcm9tIGJvdEVtcGxveWVlSWQpYCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfwn5SlIDEuMi4xLjAuMiBFUlJPUiAtIEZhaWxlZCB0byBsb2FkIGNoYW5uZWw6JywgZXJyb3IpO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiB0aGUgc2VuZGVySWQgbWF0Y2hlcyB0aGUgYXNzaWduZWQgcGVyc29uYSAobWVhbmluZyB0aGUgQUkgc2VudCB0aGlzIG1lc3NhZ2UpXG4gICAgICBjb25zdCBpc1NlbmRlclRoZUFnZW50ID0gYXNzaWduZWRQZXJzb25hSWQgJiYgY2hhdERldGFpbC5zZW5kZXJJZCA9PT0gYXNzaWduZWRQZXJzb25hSWQ7XG4gICAgICBcbiAgICAgIGNvbnN0IGlzQWdlbnRNZXNzYWdlID0gXG4gICAgICAgIGlzU2VuZGVyVGhlQWdlbnQgfHwgLy8gVGhlIGFjdHVhbCBzZW5kZXIgaXMgdGhlIEFJIGFnZW50IHBlcnNvbmFcbiAgICAgICAgY2hhdERldGFpbC51c2VyVHlwZSA9PT0gJ2FnZW50JyB8fFxuICAgICAgICBjaGF0RGV0YWlsLnNlbmRlclR5cGUgPT09ICdhZ2VudCcgfHxcbiAgICAgICAgKGNoYXREZXRhaWwubWVzc2FnZUlkICYmIGNoYXREZXRhaWwubWVzc2FnZUlkLnN0YXJ0c1dpdGgoJ2FnZW50LScpKSB8fFxuICAgICAgICAoY2hhdERldGFpbC5tZXRhZGF0YSAmJiBjaGF0RGV0YWlsLm1ldGFkYXRhLnNlbmRlclR5cGUgPT09ICdhZ2VudCcpIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLm1ldGFkYXRhICYmIGNoYXREZXRhaWwubWV0YWRhdGEub3JpZ2luTWFya2VyID09PSAncGVyc29uYScpIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLm1ldGFkYXRhICYmIGNoYXREZXRhaWwubWV0YWRhdGEuYWdlbnRJZCkgfHxcbiAgICAgICAgKGNoYXREZXRhaWwubWV0YWRhdGEgJiYgY2hhdERldGFpbC5tZXRhZGF0YS5pc0FnZW50R2VuZXJhdGVkID09PSB0cnVlKSB8fFxuICAgICAgICAoY2hhdERldGFpbC5vcmlnaW5NYXJrZXIgPT09ICdwZXJzb25hJykgfHxcbiAgICAgICAgKGNoYXREZXRhaWwuYWdlbnRJZCk7XG4gICAgICBcbiAgICAgIGlmIChpc0FnZW50TWVzc2FnZSkge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4xIFNLSVBQSU5HIC0gQWdlbnQgbWVzc2FnZSBkZXRlY3RlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZyhgRGV0ZWN0aW9uOiBhc3NpZ25lZFBlcnNvbmE9JHthc3NpZ25lZFBlcnNvbmFJZH0sIHNlbmRlcklkPSR7Y2hhdERldGFpbC5zZW5kZXJJZH0sIGlzU2VuZGVyVGhlQWdlbnQ9JHtpc1NlbmRlclRoZUFnZW50fWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgdXNlclR5cGU9JHtjaGF0RGV0YWlsLnVzZXJUeXBlfSwgc2VuZGVyVHlwZT0ke2NoYXREZXRhaWwuc2VuZGVyVHlwZX0sIG1lc3NhZ2VJZD0ke2NoYXREZXRhaWwubWVzc2FnZUlkfSwgb3JpZ2luTWFya2VyPSR7Y2hhdERldGFpbC5vcmlnaW5NYXJrZXIgfHwgY2hhdERldGFpbC5tZXRhZGF0YT8ub3JpZ2luTWFya2VyfWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgdXNlcklkOiAke2NoYXREZXRhaWwudXNlcklkfSwgc2VuZGVySWQ6ICR7Y2hhdERldGFpbC5zZW5kZXJJZH1gKTtcbiAgICAgICAgcmV0dXJuOyAvLyBEb24ndCBwcm9jZXNzIGFnZW50J3Mgb3duIHJlc3BvbnNlc1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4yIFByb2Nlc3NpbmcgYXMgVVNFUiBtZXNzYWdlIChub3QgZGV0ZWN0ZWQgYXMgYWdlbnQpJyk7XG4gICAgICBjb25zb2xlLmxvZyhgYXNzaWduZWRQZXJzb25hPSR7YXNzaWduZWRQZXJzb25hSWR9LCBzZW5kZXJJZD0ke2NoYXREZXRhaWwuc2VuZGVySWR9LCB1c2VySWQ9JHtjaGF0RGV0YWlsLnVzZXJJZH1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGB1c2VyVHlwZT0ke2NoYXREZXRhaWwudXNlclR5cGV9LCBzZW5kZXJUeXBlPSR7Y2hhdERldGFpbC5zZW5kZXJUeXBlfSwgbWVzc2FnZUlkPSR7Y2hhdERldGFpbC5tZXNzYWdlSWR9YClcbiAgICAgIFxuICAgICAgLy8gQ2hlY2sgbWVzc2FnZSBmcmVzaG5lc3MgZm9yIGRlYnVnZ2luZ1xuICAgICAgY29uc3QgbWVzc2FnZVRpbWVzdGFtcCA9IGNoYXREZXRhaWwubWV0YWRhdGE/LnRpbWVzdGFtcCB8fCBjaGF0RGV0YWlsLnRpbWVzdGFtcCB8fCBjaGF0RGV0YWlsLm1lc3NhZ2VfdHM7XG4gICAgICBpZiAobWVzc2FnZVRpbWVzdGFtcCkge1xuICAgICAgICBjb25zdCBtZXNzYWdlVGltZSA9IG5ldyBEYXRlKG1lc3NhZ2VUaW1lc3RhbXApLmdldFRpbWUoKTtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgYWdlSW5TZWNvbmRzID0gKG5vdyAtIG1lc3NhZ2VUaW1lKSAvIDEwMDA7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuMi4xLjMgTWVzc2FnZSBhZ2U6ICR7YWdlSW5TZWNvbmRzLnRvRml4ZWQoMSl9cyAodGltZXN0YW1wOiAke21lc3NhZ2VUaW1lc3RhbXB9KWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBFeHRyYWN0IHRlbmFudElkIGFuZCBwZXJzb25hIG5hbWUgLSBpdCdzIGluIHRoZSBkZXRhaWwgb3IgbWV0YWRhdGFcbiAgICAgIGxldCB0ZW5hbnRJZCA9IGNoYXREZXRhaWwudGVuYW50SWQgfHwgY2hhdERldGFpbC5tZXRhZGF0YT8udGVuYW50SWQ7XG4gICAgICBsZXQgcGVyc29uYU5hbWUgPSAnQUkgQXNzaXN0YW50JzsgLy8gRGVmYXVsdCBmYWxsYmFja1xuICAgICAgXG4gICAgICAvLyBJZiB3ZSBoYXZlIHRlbmFudElkLCBsb2FkIHRoZSBmdWxsIHBlcnNvbmEgdG8gZ2V0IHRoZSBuYW1lXG4gICAgICBpZiAodGVuYW50SWQgJiYgY2hhdERldGFpbC51c2VySWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjIgTG9hZGluZyBwZXJzb25hIG5hbWUgZm9yIHRlbmFudElkOicsIHRlbmFudElkLCAncGVyc29uYUlkOicsIGNoYXREZXRhaWwudXNlcklkKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IER5bmFtb0RCQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xuICAgICAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCB9ID0gYXdhaXQgaW1wb3J0KCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcbiAgICAgICAgICBjb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuICAgICAgICAgIGNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShjbGllbnQpO1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogY29uZmlnLnBlcnNvbmFzVGFibGUgfHwgcHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEUgfHwgJ0RlbGF5ZWRSZXBsaWVzLXBlcnNvbmFzJyxcbiAgICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogdGVuYW50SWQsXG4gICAgICAgICAgICAgIHBlcnNvbmFJZDogY2hhdERldGFpbC51c2VySWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHJlc3VsdC5JdGVtKSB7XG4gICAgICAgICAgICBwZXJzb25hTmFtZSA9IHJlc3VsdC5JdGVtLm5hbWUgfHwgcGVyc29uYU5hbWU7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMyBGb3VuZCBwZXJzb25hIG5hbWU6JywgcGVyc29uYU5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMyBObyBwZXJzb25hIGZvdW5kIGZvciB0ZW5hbnRJZDonLCB0ZW5hbnRJZCwgJ3BlcnNvbmFJZDonLCBjaGF0RGV0YWlsLnVzZXJJZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ/CflKUgMS4yLjMgRVJST1IgLSBGYWlsZWQgdG8gbG9va3VwIHBlcnNvbmE6JywgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGlmICghdGVuYW50SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZGV0ZXJtaW5lIHRlbmFudElkIGZyb20gcGVyc29uYUlkOiAke2NoYXREZXRhaWwudXNlcklkfWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBHdWFyZDogT25seSByZXNwb25kIGlmIHRoaXMgbWVzc2FnZSBpcyBGT1IgdGhlIGFzc2lnbmVkIGJvdFxuICAgICAgaWYgKGFzc2lnbmVkUGVyc29uYUlkICYmIGNoYXREZXRhaWwudXNlcklkICE9PSBhc3NpZ25lZFBlcnNvbmFJZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UpSAxLjIuMS4wLjQgU0tJUFBJTkcgLSBNZXNzYWdlIGlzIGZvciB1c2VySWQ9JHtjaGF0RGV0YWlsLnVzZXJJZH0sIGJ1dCBhc3NpZ25lZCBib3QgaXMgJHthc3NpZ25lZFBlcnNvbmFJZH1gKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBkZXRhaWwgPSB7XG4gICAgICAgIHRlbmFudElkLFxuICAgICAgICBjb252ZXJzYXRpb25faWQ6IGNoYXREZXRhaWwuY2hhbm5lbElkLFxuICAgICAgICBlbWFpbF9sYzogYGNoYW5uZWwtJHtjaGF0RGV0YWlsLmNoYW5uZWxJZH1AYW5vbnltb3VzLmNvbWAsXG4gICAgICAgIHRleHQ6IGNoYXREZXRhaWwuY29udGVudCxcbiAgICAgICAgc291cmNlOiAnY2hhdCcsXG4gICAgICAgIHRpbWVzdGFtcHM6IHtcbiAgICAgICAgICByZWNlaXZlZDogY2hhdERldGFpbC50aW1lc3RhbXAsXG4gICAgICAgICAgcHJvY2Vzc2VkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgICAgfSxcbiAgICAgICAgY2hhbm5lbF9jb250ZXh0OiB7XG4gICAgICAgICAgY2hhdDoge1xuICAgICAgICAgICAgc2Vzc2lvbklkOiBjaGF0RGV0YWlsLmNoYW5uZWxJZCxcbiAgICAgICAgICAgIGNsaWVudElkOiBjaGF0RGV0YWlsLnNlbmRlcklkLFxuICAgICAgICAgICAgbWVzc2FnZUlkOiBjaGF0RGV0YWlsLm1lc3NhZ2VJZCxcbiAgICAgICAgICAgIGNvbm5lY3Rpb25JZDogY2hhdERldGFpbC5jb25uZWN0aW9uSWQgLy8gU3RvcmUgdGhlIFdlYlNvY2tldCBjb25uZWN0aW9uSWQgaWYgYXZhaWxhYmxlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBjaGFubmVsSWQ6IGNoYXREZXRhaWwuY2hhbm5lbElkLFxuICAgICAgICB1c2VySWQ6IGNoYXREZXRhaWwudXNlcklkLCAvLyBQZXJzb25hIElEICh0aGUgYWdlbnQpXG4gICAgICAgIHNlbmRlcklkOiBjaGF0RGV0YWlsLnNlbmRlcklkLCAvLyBVc2VyIElEICh0aGUgaHVtYW4pXG4gICAgICAgIGFzc2lnbmVkUGVyc29uYUlkOiBhc3NpZ25lZFBlcnNvbmFJZCwgLy8gU3RvcmUgZm9yIGFnZW50IGludm9jYXRpb25cbiAgICAgICAgdXNlck5hbWU6IHBlcnNvbmFOYW1lLCAvLyBVc2UgdGhlIHBlcnNvbmEncyBhY3R1YWwgbmFtZVxuICAgICAgICBjb25uZWN0aW9uSWQ6IGNoYXREZXRhaWwuY29ubmVjdGlvbklkIC8vIFBhc3MgdGhyb3VnaCB0aGUgY29ubmVjdGlvbklkIGZvciByZXNwb25zZSByb3V0aW5nXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBWYWxpZGF0ZSBpbmNvbWluZyBldmVudCBhcyBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHZhbGlkYXRlZEV2ZW50ID0gSW5ib3VuZE1lc3NhZ2VFdmVudFNjaGVtYS5wYXJzZShldmVudCk7XG4gICAgICBkZXRhaWwgPSB2YWxpZGF0ZWRFdmVudC5kZXRhaWw7XG5cbiAgICAgIGlmIChldmVudFsnZGV0YWlsLXR5cGUnXSA9PT0gJ2NoYXQubWVzc2FnZScpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLnggZXZhbHVhdGluZyBkaXJlY3QgY2hhdC5tZXNzYWdlIGV2ZW50Jyk7XG5cbiAgICAgICAgaWYgKGRldGFpbC51c2VyVHlwZSA9PT0gJ2FnZW50Jykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMi54IFNLSVBQSU5HIGRpcmVjdCBjaGF0Lm1lc3NhZ2UgZXZlbnQgZnJvbSBhZ2VudCAodXNlclR5cGU9YWdlbnQpJyk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaXNBZ2VudE1lc3NhZ2UgPVxuICAgICAgICAgIGRldGFpbC51c2VySWQgPT09IGRldGFpbC5zZW5kZXJJZCB8fFxuICAgICAgICAgIChkZXRhaWwubWVzc2FnZUlkICYmIGRldGFpbC5tZXNzYWdlSWQuc3RhcnRzV2l0aCgnYWdlbnQtJykpIHx8XG4gICAgICAgICAgKGRldGFpbC5tZXRhZGF0YSAmJiBkZXRhaWwubWV0YWRhdGEuaXNBZ2VudEdlbmVyYXRlZCA9PT0gdHJ1ZSk7XG5cbiAgICAgICAgaWYgKGlzQWdlbnRNZXNzYWdlKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLnggU0tJUFBJTkcgZGlyZWN0IGNoYXQubWVzc2FnZSBldmVudCBkZXRlY3RlZCBhcyBhZ2VudCBtZXNzYWdlJyk7XG4gICAgICAgICAgY29uc29sZS5sb2coYHVzZXJJZDogJHtkZXRhaWwudXNlcklkfSwgc2VuZGVySWQ6ICR7ZGV0YWlsLnNlbmRlcklkfSwgbWVzc2FnZUlkOiAke2RldGFpbC5tZXNzYWdlSWR9YCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFJlc29sdmUgY29udGFjdCBpbmZvcm1hdGlvblxuICAgIGxldCBlbWFpbExjID0gZGV0YWlsLmVtYWlsX2xjO1xuICAgIGxldCBsZWFkSWQgPSBkZXRhaWwubGVhZF9pZDtcbiAgICBcbiAgICAvLyBJZiB3ZSBvbmx5IGhhdmUgcGhvbmUgbnVtYmVyLCByZXNvbHZlIHRvIGVtYWlsX2xjIHZpYSBsZWFkcyB0YWJsZVxuICAgIGlmICghZW1haWxMYyAmJiBkZXRhaWwucGhvbmVfZTE2NCkge1xuICAgICAgY29uc29sZS5sb2coYFJlc29sdmluZyBjb250YWN0IGZyb20gcGhvbmU6ICR7ZGV0YWlsLnBob25lX2UxNjR9YCk7XG4gICAgICBcbiAgICAgIGNvbnN0IHJlc29sdmVkRW1haWxMYyA9IGF3YWl0IGR5bmFtb1NlcnZpY2UucmVzb2x2ZUNvbnRhY3RGcm9tUGhvbmUoXG4gICAgICAgIGRldGFpbC50ZW5hbnRJZCxcbiAgICAgICAgZGV0YWlsLnBob25lX2UxNjRcbiAgICAgICk7XG4gICAgICBcbiAgICAgIGlmICghcmVzb2x2ZWRFbWFpbExjKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYENvdWxkIG5vdCByZXNvbHZlIGNvbnRhY3QgZm9yIHBob25lOiAke2RldGFpbC5waG9uZV9lMTY0fWApO1xuICAgICAgICBcbiAgICAgICAgLy8gRW1pdCBlcnJvciBldmVudFxuICAgICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXG4gICAgICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50RXJyb3JFdmVudChcbiAgICAgICAgICAgIGRldGFpbC50ZW5hbnRJZCxcbiAgICAgICAgICAgIGBDb3VsZCBub3QgcmVzb2x2ZSBjb250YWN0IGZvciBwaG9uZTogJHtkZXRhaWwucGhvbmVfZTE2NH1gLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjb250ZXh0OiB7XG4gICAgICAgICAgICAgICAgcGhvbmVfZTE2NDogZGV0YWlsLnBob25lX2UxNjQsXG4gICAgICAgICAgICAgICAgc291cmNlOiBkZXRhaWwuc291cmNlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgZW1haWxMYyA9IHJlc29sdmVkRW1haWxMYztcbiAgICAgIFxuICAgICAgLy8gQWxzbyBmZXRjaCB0aGUgbGVhZCB0byBnZXQgbGVhZF9pZFxuICAgICAgY29uc3QgbGVhZCA9IGF3YWl0IGR5bmFtb1NlcnZpY2UuZ2V0TGVhZChkZXRhaWwudGVuYW50SWQsIGVtYWlsTGMpO1xuICAgICAgbGVhZElkID0gbGVhZD8ubGVhZF9pZDtcbiAgICB9XG4gICAgXG4gICAgaWYgKCFlbWFpbExjKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBkZXRlcm1pbmUgZW1haWxfbGMgZm9yIGNvbnRhY3QnKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coJ/CflKUgMS4zIFNraXBwaW5nIHB1dE1lc3NhZ2UgLSBtZXNzYWdpbmcgc2VydmljZSBoYW5kbGVzIHBlcnNpc3RlbmNlJyk7XG4gICAgXG4gICAgLy8gSW52b2tlIEFnZW50Rm4gd2l0aCB0aGUgcHJvY2Vzc2VkIGNvbnRleHRcbiAgICBjb25zdCB7IGhhbmRsZXI6IGFnZW50SGFuZGxlciB9ID0gYXdhaXQgaW1wb3J0KCcuL2FnZW50LmpzJyk7XG4gICAgXG4gICAgYXdhaXQgYWdlbnRIYW5kbGVyKHtcbiAgICAgIHRlbmFudElkOiBkZXRhaWwudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgIHRleHQ6IGRldGFpbC50ZXh0LFxuICAgICAgc291cmNlOiBkZXRhaWwuc291cmNlLFxuICAgICAgY2hhbm5lbF9jb250ZXh0OiBkZXRhaWwuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgbGVhZF9pZDogbGVhZElkLFxuICAgICAgY29udmVyc2F0aW9uX2lkOiBkZXRhaWwuY29udmVyc2F0aW9uX2lkLFxuICAgICAgbWVzc2FnZV90czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLCAvLyBVc2UgY3VycmVudCB0aW1lc3RhbXAgc2luY2Ugd2UncmUgbm90IHN0b3JpbmdcbiAgICAgIC8vIFBhc3MgY2hhdC1zcGVjaWZpYyBjb250ZXh0IGZvciByZXNwb25zZSBlbWlzc2lvblxuICAgICAgY2hhbm5lbElkOiBkZXRhaWwuY2hhbm5lbElkLFxuICAgICAgdXNlcklkOiBkZXRhaWwuYXNzaWduZWRQZXJzb25hSWQgfHwgZGV0YWlsLnVzZXJJZCwgLy8gVXNlIGNoYW5uZWwncyBhc3NpZ25lZCBib3QgKEtpbmcgTW8pLCBub3QgcmVjaXBpZW50XG4gICAgICBzZW5kZXJJZDogZGV0YWlsLnNlbmRlcklkLCAvLyBVc2VyIElEIChodW1hbiBzZW5kZXIpXG4gICAgICB1c2VyTmFtZTogZGV0YWlsLnVzZXJOYW1lLFxuICAgIH0sIGNvbnRleHQpO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCdBZ2VudFJvdXRlciBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQWdlbnRSb3V0ZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgIFxuICAgIC8vIFRyeSB0byBlbWl0IGVycm9yIGV2ZW50IGlmIHdlIGhhdmUgZW5vdWdoIGNvbnRleHRcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcbiAgICAgIFxuICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudEVycm9yKFxuICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxuICAgICAgICAgIGV2ZW50LmRldGFpbD8udGVuYW50SWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gcm91dGVyIGVycm9yJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgICAgICBldmVudF9zb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgICAgICAgICAgZXZlbnRfZGV0YWlsX3R5cGU6IGV2ZW50WydkZXRhaWwtdHlwZSddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXZlbnRFcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGVtaXQgZXJyb3IgZXZlbnQ6JywgZXZlbnRFcnJvcik7XG4gICAgfVxuICAgIFxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=