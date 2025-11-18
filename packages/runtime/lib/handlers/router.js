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
    console.log('🔥 1.0 ROUTER HANDLER START - v1.1.87');
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
            if (!tenantId && chatDetail.userId) {
                console.log('🔥 1.2.2 Looking up tenantId from personaId:', chatDetail.userId);
                try {
                    // Query personas table - userId is the personaId
                    // We need to scan/query to find which tenant owns this persona
                    // For now, extract from the persona_pk pattern if it's stored as tenantId#personaId
                    // Or better - have your messaging system include tenantId in metadata!
                    // TEMPORARY: Query personas table with GSI to find the persona
                    const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                    const { DynamoDBDocumentClient, GetCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
                    const client = new DynamoDBClient({});
                    const docClient = DynamoDBDocumentClient.from(client);
                    const result = await docClient.send(new GetCommand({
                        TableName: config.personasTable || process.env.PERSONAS_TABLE,
                        Key: {
                            persona_pk: chatDetail.userId, // Assuming this is the full key
                            sk: 'CONFIG'
                        }
                    }));
                    if (result.Item) {
                        tenantId = result.Item.tenantId;
                        personaName = result.Item.name || result.Item.persona_name || personaName;
                        console.log('🔥 1.2.3 Found tenantId:', tenantId, 'personaName:', personaName);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2hhbmRsZXJzL3JvdXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVVBLDBCQXlSQztBQWxTRCxvREFBcUQ7QUFDckQsMERBQTJEO0FBQzNELGdEQUE0RTtBQUM1RSxnREFBd0Y7QUFFeEY7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FDM0IsS0FBb0MsRUFDcEMsT0FBZ0I7SUFFaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO0lBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0UsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzdDLGtDQUFrQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFpQixHQUFFLENBQUM7UUFDbkMsSUFBQSxpQ0FBcUIsRUFBQyxNQUFNLENBQUMsQ0FBQztRQUU5QixPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDcEQsc0JBQXNCO1FBQ3RCLE1BQU0sYUFBYSxHQUFHLElBQUksNkJBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRCxNQUFNLGtCQUFrQixHQUFHLElBQUksbUNBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUQsc0RBQXNEO1FBQ3RELElBQUksTUFBVyxDQUFDO1FBQ2hCLElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLHdCQUF3QixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssNEJBQTRCLEVBQUUsQ0FBQztZQUN2RyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7WUFDbEUsTUFBTSxV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QUFPLENBQUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTNDLG9EQUFvRDtRQUNwRCxJQUFJLENBQUM7WUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFpQixHQUFFLENBQUM7WUFDbkMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLG1DQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRTFELE1BQU0sa0JBQWtCLENBQUMsaUJBQWlCLENBQ3hDLG1DQUFrQixDQUFDLHFCQUFxQixDQUN0QyxLQUFLLENBQUMsTUFBTSxFQUFFLFFBQVEsSUFBSSxTQUFTLEVBQ25DLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixFQUMvRDtnQkFDRSxLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDdkQsT0FBTyxFQUFFO29CQUNQLFlBQVksRUFBRSxLQUFLLENBQUMsTUFBTTtvQkFDMUIsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQztpQkFDeEM7YUFDRixDQUNGLENBQ0YsQ0FBQztRQUNKLENBQUM7UUFBQyxPQUFPLFVBQVUsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0QsQ0FBQztRQUVELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IEV2ZW50QnJpZGdlRXZlbnQsIENvbnRleHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4uL2xpYi9keW5hbW9kYi5qcyc7XG5pbXBvcnQgeyBFdmVudEJyaWRnZVNlcnZpY2UgfSBmcm9tICcuLi9saWIvZXZlbnRicmlkZ2UuanMnO1xuaW1wb3J0IHsgbG9hZFJ1bnRpbWVDb25maWcsIHZhbGlkYXRlUnVudGltZUNvbmZpZyB9IGZyb20gJy4uL2xpYi9jb25maWcuanMnO1xuaW1wb3J0IHsgSW5ib3VuZE1lc3NhZ2VFdmVudFNjaGVtYSwgdHlwZSBJbmJvdW5kTWVzc2FnZUV2ZW50IH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xuXG4vKipcbiAqIExhbWJkYSBoYW5kbGVyIGZvciByb3V0aW5nIGluYm91bmQgbWVzc2FnZXNcbiAqIFRyaWdnZXJlZCBieSBFdmVudEJyaWRnZSBydWxlOiBsZWFkLm1lc3NhZ2UuY3JlYXRlZFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihcbiAgZXZlbnQ6IEV2ZW50QnJpZGdlRXZlbnQ8c3RyaW5nLCBhbnk+LFxuICBjb250ZXh0OiBDb250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc29sZS5sb2coJ/CflKUgMS4wIFJPVVRFUiBIQU5ETEVSIFNUQVJUIC0gdjEuMS44NycpO1xuICBjb25zb2xlLmxvZygnQWdlbnRSb3V0ZXIgcmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ/CflKUgMS4xIExvYWRpbmcgcnVudGltZSBjb25maWcnKTtcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICB2YWxpZGF0ZVJ1bnRpbWVDb25maWcoY29uZmlnKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIgSW5pdGlhbGl6aW5nIER5bmFtb0RCIHNlcnZpY2UnKTtcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gVHJhbnNmb3JtIGNoYXQubWVzc2FnZS5hdmFpbGFibGUgdG8gc3RhbmRhcmQgZm9ybWF0XG4gICAgbGV0IGRldGFpbDogYW55O1xuICAgIGlmIChldmVudFsnZGV0YWlsLXR5cGUnXSA9PT0gJ2NoYXQubWVzc2FnZS5hdmFpbGFibGUnICYmIGV2ZW50LnNvdXJjZSA9PT0gJ2t4LW5vdGlmaWNhdGlvbnMtbWVzc2FnaW5nJykge1xuICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLjEgVHJhbnNmb3JtaW5nIGNoYXQubWVzc2FnZS5hdmFpbGFibGUgZXZlbnQnKTtcbiAgICAgIGNvbnN0IGNoYXREZXRhaWwgPSBldmVudC5kZXRhaWw7XG4gICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4wIGNoYXREZXRhaWwuY29ubmVjdGlvbklkOicsIGNoYXREZXRhaWwuY29ubmVjdGlvbklkKTtcbiAgICAgIFxuICAgICAgLy8gSUdOT1JFIGFnZW50J3Mgb3duIG1lc3NhZ2VzIC0gY2hlY2sgbXVsdGlwbGUgaW5kaWNhdG9yc1xuICAgICAgLy8gVGhlIGFnZW50IHNldHMgc2V2ZXJhbCBmaWVsZHMgdG8gaWRlbnRpZnkgaXRzIG1lc3NhZ2VzLCBjaGVjayB0aGVtIGFsbFxuICAgICAgXG4gICAgICAvLyBGaXJzdCwgY2hlY2sgaWYgdGhlIHNlbmRlciAoYWN0dWFsIG1lc3NhZ2UgYXV0aG9yKSBpcyBhbiBhZ2VudCBwZXJzb25hXG4gICAgICAvLyBMb2FkIGNoYW5uZWwgdG8gc2VlIHdoaWNoIHBlcnNvbmEgaXMgYXNzaWduZWQgdG8gdGhpcyBjaGFubmVsXG4gICAgICBsZXQgYXNzaWduZWRQZXJzb25hSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyk7XG4gICAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUXVlcnlDb21tYW5kIH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuICAgICAgICBjb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFF1ZXJ5IGJ5IGNoYW5uZWxJZCAoUEspIC0gY2hhbm5lbHMgdGFibGUgdXNlcyBjaGFubmVsSWQgYXMgUEssIG5vdCBjb21wb3NpdGUga2V5XG4gICAgICAgIGNvbnN0IGNoYW5uZWxSZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LkNIQU5ORUxTX1RBQkxFIHx8ICdreC1jaGFubmVscycsXG4gICAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJ2NoYW5uZWxJZCA9IDpjaGFubmVsSWQnLFxuICAgICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICAgICc6Y2hhbm5lbElkJzogZXZlbnQuZGV0YWlsLmNoYW5uZWxJZFxuICAgICAgICAgIH0sXG4gICAgICAgICAgTGltaXQ6IDFcbiAgICAgICAgfSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY2hhbm5lbERhdGEgPSBjaGFubmVsUmVzdWx0Lkl0ZW1zPy5bMF07XG4gICAgICAgIGFzc2lnbmVkUGVyc29uYUlkID0gY2hhbm5lbERhdGE/LmJvdEVtcGxveWVlSWQgfHwgY2hhbm5lbERhdGE/LnBlcnNvbmFJZDsgLy8gQ2hlY2sgYm90aCBmaWVsZCBuYW1lc1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UpSAxLjIuMS4wLjMgQ2hhbm5lbCAke2V2ZW50LmRldGFpbC5jaGFubmVsSWR9IGhhcyBhc3NpZ25lZFBlcnNvbmE6ICR7YXNzaWduZWRQZXJzb25hSWR9IChmcm9tIGJvdEVtcGxveWVlSWQpYCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfwn5SlIDEuMi4xLjAuMiBFUlJPUiAtIEZhaWxlZCB0byBsb2FkIGNoYW5uZWw6JywgZXJyb3IpO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDaGVjayBpZiB0aGUgc2VuZGVySWQgbWF0Y2hlcyB0aGUgYXNzaWduZWQgcGVyc29uYSAobWVhbmluZyB0aGUgQUkgc2VudCB0aGlzIG1lc3NhZ2UpXG4gICAgICBjb25zdCBpc1NlbmRlclRoZUFnZW50ID0gYXNzaWduZWRQZXJzb25hSWQgJiYgY2hhdERldGFpbC5zZW5kZXJJZCA9PT0gYXNzaWduZWRQZXJzb25hSWQ7XG4gICAgICBcbiAgICAgIGNvbnN0IGlzQWdlbnRNZXNzYWdlID0gXG4gICAgICAgIGlzU2VuZGVyVGhlQWdlbnQgfHwgLy8gVGhlIGFjdHVhbCBzZW5kZXIgaXMgdGhlIEFJIGFnZW50IHBlcnNvbmFcbiAgICAgICAgY2hhdERldGFpbC51c2VyVHlwZSA9PT0gJ2FnZW50JyB8fFxuICAgICAgICBjaGF0RGV0YWlsLnNlbmRlclR5cGUgPT09ICdhZ2VudCcgfHxcbiAgICAgICAgKGNoYXREZXRhaWwubWVzc2FnZUlkICYmIGNoYXREZXRhaWwubWVzc2FnZUlkLnN0YXJ0c1dpdGgoJ2FnZW50LScpKSB8fFxuICAgICAgICAoY2hhdERldGFpbC5tZXRhZGF0YSAmJiBjaGF0RGV0YWlsLm1ldGFkYXRhLnNlbmRlclR5cGUgPT09ICdhZ2VudCcpIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLm1ldGFkYXRhICYmIGNoYXREZXRhaWwubWV0YWRhdGEub3JpZ2luTWFya2VyID09PSAncGVyc29uYScpIHx8XG4gICAgICAgIChjaGF0RGV0YWlsLm1ldGFkYXRhICYmIGNoYXREZXRhaWwubWV0YWRhdGEuYWdlbnRJZCkgfHxcbiAgICAgICAgKGNoYXREZXRhaWwubWV0YWRhdGEgJiYgY2hhdERldGFpbC5tZXRhZGF0YS5pc0FnZW50R2VuZXJhdGVkID09PSB0cnVlKSB8fFxuICAgICAgICAoY2hhdERldGFpbC5vcmlnaW5NYXJrZXIgPT09ICdwZXJzb25hJykgfHxcbiAgICAgICAgKGNoYXREZXRhaWwuYWdlbnRJZCk7XG4gICAgICBcbiAgICAgIGlmIChpc0FnZW50TWVzc2FnZSkge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4xIFNLSVBQSU5HIC0gQWdlbnQgbWVzc2FnZSBkZXRlY3RlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZyhgRGV0ZWN0aW9uOiBhc3NpZ25lZFBlcnNvbmE9JHthc3NpZ25lZFBlcnNvbmFJZH0sIHNlbmRlcklkPSR7Y2hhdERldGFpbC5zZW5kZXJJZH0sIGlzU2VuZGVyVGhlQWdlbnQ9JHtpc1NlbmRlclRoZUFnZW50fWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgdXNlclR5cGU9JHtjaGF0RGV0YWlsLnVzZXJUeXBlfSwgc2VuZGVyVHlwZT0ke2NoYXREZXRhaWwuc2VuZGVyVHlwZX0sIG1lc3NhZ2VJZD0ke2NoYXREZXRhaWwubWVzc2FnZUlkfSwgb3JpZ2luTWFya2VyPSR7Y2hhdERldGFpbC5vcmlnaW5NYXJrZXIgfHwgY2hhdERldGFpbC5tZXRhZGF0YT8ub3JpZ2luTWFya2VyfWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgdXNlcklkOiAke2NoYXREZXRhaWwudXNlcklkfSwgc2VuZGVySWQ6ICR7Y2hhdERldGFpbC5zZW5kZXJJZH1gKTtcbiAgICAgICAgcmV0dXJuOyAvLyBEb24ndCBwcm9jZXNzIGFnZW50J3Mgb3duIHJlc3BvbnNlc1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMS4yIFByb2Nlc3NpbmcgYXMgVVNFUiBtZXNzYWdlIChub3QgZGV0ZWN0ZWQgYXMgYWdlbnQpJyk7XG4gICAgICBjb25zb2xlLmxvZyhgYXNzaWduZWRQZXJzb25hPSR7YXNzaWduZWRQZXJzb25hSWR9LCBzZW5kZXJJZD0ke2NoYXREZXRhaWwuc2VuZGVySWR9LCB1c2VySWQ9JHtjaGF0RGV0YWlsLnVzZXJJZH1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGB1c2VyVHlwZT0ke2NoYXREZXRhaWwudXNlclR5cGV9LCBzZW5kZXJUeXBlPSR7Y2hhdERldGFpbC5zZW5kZXJUeXBlfSwgbWVzc2FnZUlkPSR7Y2hhdERldGFpbC5tZXNzYWdlSWR9YClcbiAgICAgIFxuICAgICAgLy8gQ2hlY2sgbWVzc2FnZSBmcmVzaG5lc3MgZm9yIGRlYnVnZ2luZ1xuICAgICAgY29uc3QgbWVzc2FnZVRpbWVzdGFtcCA9IGNoYXREZXRhaWwubWV0YWRhdGE/LnRpbWVzdGFtcCB8fCBjaGF0RGV0YWlsLnRpbWVzdGFtcCB8fCBjaGF0RGV0YWlsLm1lc3NhZ2VfdHM7XG4gICAgICBpZiAobWVzc2FnZVRpbWVzdGFtcCkge1xuICAgICAgICBjb25zdCBtZXNzYWdlVGltZSA9IG5ldyBEYXRlKG1lc3NhZ2VUaW1lc3RhbXApLmdldFRpbWUoKTtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgYWdlSW5TZWNvbmRzID0gKG5vdyAtIG1lc3NhZ2VUaW1lKSAvIDEwMDA7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuMi4xLjMgTWVzc2FnZSBhZ2U6ICR7YWdlSW5TZWNvbmRzLnRvRml4ZWQoMSl9cyAodGltZXN0YW1wOiAke21lc3NhZ2VUaW1lc3RhbXB9KWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBFeHRyYWN0IHRlbmFudElkIGFuZCBwZXJzb25hIG5hbWUgLSBpdCdzIGluIHRoZSBkZXRhaWwgb3IgbWV0YWRhdGFcbiAgICAgIGxldCB0ZW5hbnRJZCA9IGNoYXREZXRhaWwudGVuYW50SWQgfHwgY2hhdERldGFpbC5tZXRhZGF0YT8udGVuYW50SWQ7XG4gICAgICBsZXQgcGVyc29uYU5hbWUgPSAnQUkgQXNzaXN0YW50JzsgLy8gRGVmYXVsdCBmYWxsYmFja1xuICAgICAgXG4gICAgICBpZiAoIXRlbmFudElkICYmIGNoYXREZXRhaWwudXNlcklkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SlIDEuMi4yIExvb2tpbmcgdXAgdGVuYW50SWQgZnJvbSBwZXJzb25hSWQ6JywgY2hhdERldGFpbC51c2VySWQpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIFF1ZXJ5IHBlcnNvbmFzIHRhYmxlIC0gdXNlcklkIGlzIHRoZSBwZXJzb25hSWRcbiAgICAgICAgICAvLyBXZSBuZWVkIHRvIHNjYW4vcXVlcnkgdG8gZmluZCB3aGljaCB0ZW5hbnQgb3ducyB0aGlzIHBlcnNvbmFcbiAgICAgICAgICAvLyBGb3Igbm93LCBleHRyYWN0IGZyb20gdGhlIHBlcnNvbmFfcGsgcGF0dGVybiBpZiBpdCdzIHN0b3JlZCBhcyB0ZW5hbnRJZCNwZXJzb25hSWRcbiAgICAgICAgICAvLyBPciBiZXR0ZXIgLSBoYXZlIHlvdXIgbWVzc2FnaW5nIHN5c3RlbSBpbmNsdWRlIHRlbmFudElkIGluIG1ldGFkYXRhIVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFRFTVBPUkFSWTogUXVlcnkgcGVyc29uYXMgdGFibGUgd2l0aCBHU0kgdG8gZmluZCB0aGUgcGVyc29uYVxuICAgICAgICAgIGNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyk7XG4gICAgICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kIH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xuICAgICAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG4gICAgICAgICAgY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xuICAgICAgICAgICAgVGFibGVOYW1lOiBjb25maWcucGVyc29uYXNUYWJsZSB8fCBwcm9jZXNzLmVudi5QRVJTT05BU19UQUJMRSxcbiAgICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgICBwZXJzb25hX3BrOiBjaGF0RGV0YWlsLnVzZXJJZCwgLy8gQXNzdW1pbmcgdGhpcyBpcyB0aGUgZnVsbCBrZXlcbiAgICAgICAgICAgICAgc2s6ICdDT05GSUcnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChyZXN1bHQuSXRlbSkge1xuICAgICAgICAgICAgdGVuYW50SWQgPSByZXN1bHQuSXRlbS50ZW5hbnRJZDtcbiAgICAgICAgICAgIHBlcnNvbmFOYW1lID0gcmVzdWx0Lkl0ZW0ubmFtZSB8fCByZXN1bHQuSXRlbS5wZXJzb25hX25hbWUgfHwgcGVyc29uYU5hbWU7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIuMyBGb3VuZCB0ZW5hbnRJZDonLCB0ZW5hbnRJZCwgJ3BlcnNvbmFOYW1lOicsIHBlcnNvbmFOYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcign8J+UpSAxLjIuMyBFUlJPUiAtIEZhaWxlZCB0byBsb29rdXAgcGVyc29uYTonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgaWYgKCF0ZW5hbnRJZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBkZXRlcm1pbmUgdGVuYW50SWQgZnJvbSBwZXJzb25hSWQ6ICR7Y2hhdERldGFpbC51c2VySWR9YCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIEd1YXJkOiBPbmx5IHJlc3BvbmQgaWYgdGhpcyBtZXNzYWdlIGlzIEZPUiB0aGUgYXNzaWduZWQgYm90XG4gICAgICBpZiAoYXNzaWduZWRQZXJzb25hSWQgJiYgY2hhdERldGFpbC51c2VySWQgIT09IGFzc2lnbmVkUGVyc29uYUlkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SlIDEuMi4xLjAuNCBTS0lQUElORyAtIE1lc3NhZ2UgaXMgZm9yIHVzZXJJZD0ke2NoYXREZXRhaWwudXNlcklkfSwgYnV0IGFzc2lnbmVkIGJvdCBpcyAke2Fzc2lnbmVkUGVyc29uYUlkfWApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBcbiAgICAgIGRldGFpbCA9IHtcbiAgICAgICAgdGVuYW50SWQsXG4gICAgICAgIGNvbnZlcnNhdGlvbl9pZDogY2hhdERldGFpbC5jaGFubmVsSWQsXG4gICAgICAgIGVtYWlsX2xjOiBgY2hhbm5lbC0ke2NoYXREZXRhaWwuY2hhbm5lbElkfUBhbm9ueW1vdXMuY29tYCxcbiAgICAgICAgdGV4dDogY2hhdERldGFpbC5jb250ZW50LFxuICAgICAgICBzb3VyY2U6ICdjaGF0JyxcbiAgICAgICAgdGltZXN0YW1wczoge1xuICAgICAgICAgIHJlY2VpdmVkOiBjaGF0RGV0YWlsLnRpbWVzdGFtcCxcbiAgICAgICAgICBwcm9jZXNzZWQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICB9LFxuICAgICAgICBjaGFubmVsX2NvbnRleHQ6IHtcbiAgICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgICBzZXNzaW9uSWQ6IGNoYXREZXRhaWwuY2hhbm5lbElkLFxuICAgICAgICAgICAgY2xpZW50SWQ6IGNoYXREZXRhaWwuc2VuZGVySWQsXG4gICAgICAgICAgICBtZXNzYWdlSWQ6IGNoYXREZXRhaWwubWVzc2FnZUlkLFxuICAgICAgICAgICAgY29ubmVjdGlvbklkOiBjaGF0RGV0YWlsLmNvbm5lY3Rpb25JZCAvLyBTdG9yZSB0aGUgV2ViU29ja2V0IGNvbm5lY3Rpb25JZCBpZiBhdmFpbGFibGVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGNoYW5uZWxJZDogY2hhdERldGFpbC5jaGFubmVsSWQsXG4gICAgICAgIHVzZXJJZDogY2hhdERldGFpbC51c2VySWQsIC8vIFBlcnNvbmEgSUQgKHRoZSBhZ2VudClcbiAgICAgICAgc2VuZGVySWQ6IGNoYXREZXRhaWwuc2VuZGVySWQsIC8vIFVzZXIgSUQgKHRoZSBodW1hbilcbiAgICAgICAgYXNzaWduZWRQZXJzb25hSWQ6IGFzc2lnbmVkUGVyc29uYUlkLCAvLyBTdG9yZSBmb3IgYWdlbnQgaW52b2NhdGlvblxuICAgICAgICB1c2VyTmFtZTogcGVyc29uYU5hbWUsIC8vIFVzZSB0aGUgcGVyc29uYSdzIGFjdHVhbCBuYW1lXG4gICAgICAgIGNvbm5lY3Rpb25JZDogY2hhdERldGFpbC5jb25uZWN0aW9uSWQgLy8gUGFzcyB0aHJvdWdoIHRoZSBjb25uZWN0aW9uSWQgZm9yIHJlc3BvbnNlIHJvdXRpbmdcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFZhbGlkYXRlIGluY29taW5nIGV2ZW50IGFzIHN0YW5kYXJkIGZvcm1hdFxuICAgICAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSBJbmJvdW5kTWVzc2FnZUV2ZW50U2NoZW1hLnBhcnNlKGV2ZW50KTtcbiAgICAgIGRldGFpbCA9IHZhbGlkYXRlZEV2ZW50LmRldGFpbDtcblxuICAgICAgaWYgKGV2ZW50WydkZXRhaWwtdHlwZSddID09PSAnY2hhdC5tZXNzYWdlJykge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIueCBldmFsdWF0aW5nIGRpcmVjdCBjaGF0Lm1lc3NhZ2UgZXZlbnQnKTtcblxuICAgICAgICBpZiAoZGV0YWlsLnVzZXJUeXBlID09PSAnYWdlbnQnKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ/CflKUgMS4yLnggU0tJUFBJTkcgZGlyZWN0IGNoYXQubWVzc2FnZSBldmVudCBmcm9tIGFnZW50ICh1c2VyVHlwZT1hZ2VudCknKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBpc0FnZW50TWVzc2FnZSA9XG4gICAgICAgICAgZGV0YWlsLnVzZXJJZCA9PT0gZGV0YWlsLnNlbmRlcklkIHx8XG4gICAgICAgICAgKGRldGFpbC5tZXNzYWdlSWQgJiYgZGV0YWlsLm1lc3NhZ2VJZC5zdGFydHNXaXRoKCdhZ2VudC0nKSkgfHxcbiAgICAgICAgICAoZGV0YWlsLm1ldGFkYXRhICYmIGRldGFpbC5tZXRhZGF0YS5pc0FnZW50R2VuZXJhdGVkID09PSB0cnVlKTtcblxuICAgICAgICBpZiAoaXNBZ2VudE1lc3NhZ2UpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+UpSAxLjIueCBTS0lQUElORyBkaXJlY3QgY2hhdC5tZXNzYWdlIGV2ZW50IGRldGVjdGVkIGFzIGFnZW50IG1lc3NhZ2UnKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgdXNlcklkOiAke2RldGFpbC51c2VySWR9LCBzZW5kZXJJZDogJHtkZXRhaWwuc2VuZGVySWR9LCBtZXNzYWdlSWQ6ICR7ZGV0YWlsLm1lc3NhZ2VJZH1gKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gUmVzb2x2ZSBjb250YWN0IGluZm9ybWF0aW9uXG4gICAgbGV0IGVtYWlsTGMgPSBkZXRhaWwuZW1haWxfbGM7XG4gICAgbGV0IGxlYWRJZCA9IGRldGFpbC5sZWFkX2lkO1xuICAgIFxuICAgIC8vIElmIHdlIG9ubHkgaGF2ZSBwaG9uZSBudW1iZXIsIHJlc29sdmUgdG8gZW1haWxfbGMgdmlhIGxlYWRzIHRhYmxlXG4gICAgaWYgKCFlbWFpbExjICYmIGRldGFpbC5waG9uZV9lMTY0KSB7XG4gICAgICBjb25zb2xlLmxvZyhgUmVzb2x2aW5nIGNvbnRhY3QgZnJvbSBwaG9uZTogJHtkZXRhaWwucGhvbmVfZTE2NH1gKTtcbiAgICAgIFxuICAgICAgY29uc3QgcmVzb2x2ZWRFbWFpbExjID0gYXdhaXQgZHluYW1vU2VydmljZS5yZXNvbHZlQ29udGFjdEZyb21QaG9uZShcbiAgICAgICAgZGV0YWlsLnRlbmFudElkLFxuICAgICAgICBkZXRhaWwucGhvbmVfZTE2NFxuICAgICAgKTtcbiAgICAgIFxuICAgICAgaWYgKCFyZXNvbHZlZEVtYWlsTGMpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgQ291bGQgbm90IHJlc29sdmUgY29udGFjdCBmb3IgcGhvbmU6ICR7ZGV0YWlsLnBob25lX2UxNjR9YCk7XG4gICAgICAgIFxuICAgICAgICAvLyBFbWl0IGVycm9yIGV2ZW50XG4gICAgICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRFcnJvcihcbiAgICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxuICAgICAgICAgICAgZGV0YWlsLnRlbmFudElkLFxuICAgICAgICAgICAgYENvdWxkIG5vdCByZXNvbHZlIGNvbnRhY3QgZm9yIHBob25lOiAke2RldGFpbC5waG9uZV9lMTY0fWAsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNvbnRleHQ6IHtcbiAgICAgICAgICAgICAgICBwaG9uZV9lMTY0OiBkZXRhaWwucGhvbmVfZTE2NCxcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGRldGFpbC5zb3VyY2UsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgXG4gICAgICBlbWFpbExjID0gcmVzb2x2ZWRFbWFpbExjO1xuICAgICAgXG4gICAgICAvLyBBbHNvIGZldGNoIHRoZSBsZWFkIHRvIGdldCBsZWFkX2lkXG4gICAgICBjb25zdCBsZWFkID0gYXdhaXQgZHluYW1vU2VydmljZS5nZXRMZWFkKGRldGFpbC50ZW5hbnRJZCwgZW1haWxMYyk7XG4gICAgICBsZWFkSWQgPSBsZWFkPy5sZWFkX2lkO1xuICAgIH1cbiAgICBcbiAgICBpZiAoIWVtYWlsTGMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGRldGVybWluZSBlbWFpbF9sYyBmb3IgY29udGFjdCcpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZygn8J+UpSAxLjMgU2tpcHBpbmcgcHV0TWVzc2FnZSAtIG1lc3NhZ2luZyBzZXJ2aWNlIGhhbmRsZXMgcGVyc2lzdGVuY2UnKTtcbiAgICBcbiAgICAvLyBJbnZva2UgQWdlbnRGbiB3aXRoIHRoZSBwcm9jZXNzZWQgY29udGV4dFxuICAgIGNvbnN0IHsgaGFuZGxlcjogYWdlbnRIYW5kbGVyIH0gPSBhd2FpdCBpbXBvcnQoJy4vYWdlbnQuanMnKTtcbiAgICBcbiAgICBhd2FpdCBhZ2VudEhhbmRsZXIoe1xuICAgICAgdGVuYW50SWQ6IGRldGFpbC50ZW5hbnRJZCxcbiAgICAgIGVtYWlsX2xjOiBlbWFpbExjLFxuICAgICAgdGV4dDogZGV0YWlsLnRleHQsXG4gICAgICBzb3VyY2U6IGRldGFpbC5zb3VyY2UsXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGRldGFpbC5jaGFubmVsX2NvbnRleHQsXG4gICAgICBsZWFkX2lkOiBsZWFkSWQsXG4gICAgICBjb252ZXJzYXRpb25faWQ6IGRldGFpbC5jb252ZXJzYXRpb25faWQsXG4gICAgICBtZXNzYWdlX3RzOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksIC8vIFVzZSBjdXJyZW50IHRpbWVzdGFtcCBzaW5jZSB3ZSdyZSBub3Qgc3RvcmluZ1xuICAgICAgLy8gUGFzcyBjaGF0LXNwZWNpZmljIGNvbnRleHQgZm9yIHJlc3BvbnNlIGVtaXNzaW9uXG4gICAgICBjaGFubmVsSWQ6IGRldGFpbC5jaGFubmVsSWQsXG4gICAgICB1c2VySWQ6IGRldGFpbC5hc3NpZ25lZFBlcnNvbmFJZCB8fCBkZXRhaWwudXNlcklkLCAvLyBVc2UgY2hhbm5lbCdzIGFzc2lnbmVkIGJvdCAoS2luZyBNbyksIG5vdCByZWNpcGllbnRcbiAgICAgIHNlbmRlcklkOiBkZXRhaWwuc2VuZGVySWQsIC8vIFVzZXIgSUQgKGh1bWFuIHNlbmRlcilcbiAgICAgIHVzZXJOYW1lOiBkZXRhaWwudXNlck5hbWUsXG4gICAgfSwgY29udGV4dCk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJ0FnZW50Um91dGVyIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdBZ2VudFJvdXRlciBlcnJvcjonLCBlcnJvcik7XG4gICAgXG4gICAgLy8gVHJ5IHRvIGVtaXQgZXJyb3IgZXZlbnQgaWYgd2UgaGF2ZSBlbm91Z2ggY29udGV4dFxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWcgPSBsb2FkUnVudGltZUNvbmZpZygpO1xuICAgICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xuICAgICAgXG4gICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXG4gICAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudEVycm9yRXZlbnQoXG4gICAgICAgICAgZXZlbnQuZGV0YWlsPy50ZW5hbnRJZCB8fCAndW5rbm93bicsXG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biByb3V0ZXIgZXJyb3InLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHN0YWNrOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBjb250ZXh0OiB7XG4gICAgICAgICAgICAgIGV2ZW50X3NvdXJjZTogZXZlbnQuc291cmNlLFxuICAgICAgICAgICAgICBldmVudF9kZXRhaWxfdHlwZTogZXZlbnRbJ2RldGFpbC10eXBlJ10sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChldmVudEVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZW1pdCBlcnJvciBldmVudDonLCBldmVudEVycm9yKTtcbiAgICB9XG4gICAgXG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==