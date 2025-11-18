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
exports.structuredHandler = structuredHandler;
const dynamodb_js_1 = require("../lib/dynamodb.js");
const eventbridge_js_1 = require("../lib/eventbridge.js");
const agent_js_1 = require("../lib/agent.js");
const config_js_1 = require("../lib/config.js");
const DEFAULT_TIMING = {
    readingSpeed: 30, // Average adult reading speed (chars/sec) - faster reading
    typingSpeed: 20, // Realistic typing speed (chars/sec) - faster typing
    minBusyTime: 1, // Minimum "busy" time before first response - reduced from 2
    maxBusyTime: 3, // Maximum "busy" time before first response - reduced from 8
    minThinkingTime: 0.3, // Min pause between messages
    maxThinkingTime: 1.0, // Max pause between messages
};
function isPersonaOrigin(event) {
    if (event.originMarker === 'persona')
        return true;
    if (event.senderType === 'agent')
        return true;
    if (event.userType === 'agent')
        return true;
    if (event.isAgentGenerated === true)
        return true;
    if (event.metadata?.originMarker === 'persona')
        return true;
    if (event.metadata?.isAgentGenerated === true)
        return true;
    return false;
}
function createOriginMetadata(event, generatedMessageId) {
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
async function handler(event, context) {
    console.log('Agent received event:', JSON.stringify(event, null, 2));
    try {
        // Load and validate configuration
        const config = (0, config_js_1.loadRuntimeConfig)();
        (0, config_js_1.validateRuntimeConfig)(config);
        // Initialize services
        const dynamoService = new dynamodb_js_1.DynamoDBService(config);
        const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
        // Load company info and persona from DynamoDB
        let companyInfo = undefined;
        let personaConfig = undefined;
        let timingConfig = DEFAULT_TIMING;
        if (event.tenantId) {
            try {
                console.log(`🏢 Loading company info for tenant: ${event.tenantId}`);
                const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                const { DynamoDBDocumentClient, GetCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
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
                }
                else {
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
                }
                else {
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
                    }
                    else {
                        console.log(`⚠️ No persona found for ${event.tenantId}/${event.userId}, will use fallback`);
                    }
                }
            }
            catch (error) {
                console.error('❌ Error loading company info/persona:', error);
            }
        }
        // Create agent service with company info and persona
        const agentService = new agent_js_1.AgentService({
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
            const { ResponseChunker } = await Promise.resolve().then(() => __importStar(require('../lib/response-chunker.js')));
            // Simple chunking config for chat: 1-2 sentences per chunk
            const chunkingConfig = {
                enabled: true,
                rules: {
                    chat: {
                        chunkBy: 'sentence',
                        maxLength: 150, // ~1 sentence (force single sentence chunks)
                        delayBetweenChunks: 1000
                    },
                    sms: {
                        chunkBy: 'none',
                        maxLength: -1,
                        delayBetweenChunks: 0
                    },
                    email: {
                        chunkBy: 'none',
                        maxLength: -1,
                        delayBetweenChunks: 0
                    },
                    api: {
                        chunkBy: 'none',
                        maxLength: -1,
                        delayBetweenChunks: 0
                    },
                    agent: {
                        chunkBy: 'none',
                        maxLength: -1,
                        delayBetweenChunks: 0
                    }
                }
            };
            const chunks = ResponseChunker.chunkResponse(response, 'chat', chunkingConfig);
            console.log(`📨 Split response into ${chunks.length} message chunks`);
            // Calculate delays for realistic typing behavior
            const calculateTypingTime = (text, config) => {
                const charCount = text.length;
                return Math.floor((charCount / config.typingSpeed) * 1000);
            };
            const calculateFirstMessageDelay = (originalText, responseText, config) => {
                const readingTime = Math.floor((originalText.length / config.readingSpeed) * 1000);
                const typingTime = calculateTypingTime(responseText, config);
                const busyTime = Math.floor(Math.random() * (config.maxBusyTime - config.minBusyTime) + config.minBusyTime) * 1000;
                return readingTime + typingTime + busyTime;
            };
            const calculateSubsequentMessageDelay = (responseText, config) => {
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
                let delay;
                if (i === 0) {
                    delay = firstChunkDelay;
                    console.log(`⏱️ Message ${i + 1}/${chunks.length}: Waiting ${Math.floor(delay / 1000)} seconds...`);
                }
                else {
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
                await eventBridgeService.publishCustomEvent('kx-event-tracking', 'chat.message', chatMessageEvent);
                console.log(`✅ Message ${i + 1}/${chunks.length} emitted successfully`);
            }
            console.log(`🎉 All ${chunks.length} messages sent successfully!`);
        }
        else {
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
        await eventBridgeService.publishAgentReply(eventbridge_js_1.EventBridgeService.createAgentReplyEvent(event.tenantId, dynamodb_js_1.DynamoDBService.createContactPK(event.tenantId, event.email_lc), response, preferredChannel, routing, {
            conversationId: event.conversation_id,
            metadata: {
                model: config.bedrockModelId,
                triggered_by_message: event.message_ts,
                response_timestamp: new Date().toISOString(),
                lead_id: event.lead_id,
            },
        }));
        console.log('Agent completed successfully');
    }
    catch (error) {
        console.error('Agent error:', error);
        // Try to emit error event
        try {
            const config = (0, config_js_1.loadRuntimeConfig)();
            const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
            await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(event.tenantId, error instanceof Error ? error.message : 'Unknown agent error', {
                contactPk: dynamodb_js_1.DynamoDBService.createContactPK(event.tenantId, event.email_lc),
                stack: error instanceof Error ? error.stack : undefined,
                context: {
                    source: event.source,
                    text_length: event.text?.length,
                    lead_id: event.lead_id,
                },
            }));
        }
        catch (eventError) {
            console.error('Failed to emit error event:', eventError);
        }
        throw error;
    }
}
/**
 * Lambda handler that returns structured JSON response with intent metadata
 * Useful for API Gateway integrations or when you need detailed response data
 */
async function structuredHandler(event, context) {
    console.log('Agent received event for structured response:', JSON.stringify(event, null, 2));
    try {
        // Load and validate configuration
        const config = (0, config_js_1.loadRuntimeConfig)();
        (0, config_js_1.validateRuntimeConfig)(config);
        // Initialize services
        const dynamoService = new dynamodb_js_1.DynamoDBService(config);
        const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
        // Create agent service
        const agentService = new agent_js_1.AgentService({
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
            }
            else {
                console.log('Emitting chat.message event for structured agent response');
                const timestamp = structuredResponse.metadata.timestamp;
                const epochMs = Date.now();
                const randomSuffix = Math.random().toString(36).substr(2, 9);
                const generatedMessageId = `agent-${epochMs}-${randomSuffix}`;
                const originMetadata = createOriginMetadata(event, generatedMessageId);
                await eventBridgeService.publishCustomEvent('kx-event-tracking', 'chat.message', {
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
                });
                console.log('Structured response chat.message event emitted');
            }
        }
        return structuredResponse;
    }
    catch (error) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaGFuZGxlcnMvYWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5RUEsMEJBeVRDO0FBTUQsOENBa0hDO0FBemZELG9EQUFxRDtBQUNyRCwwREFBMkQ7QUFDM0QsOENBQStDO0FBQy9DLGdEQUE0RTtBQWU1RSxNQUFNLGNBQWMsR0FBaUI7SUFDbkMsWUFBWSxFQUFFLEVBQUUsRUFBRSwyREFBMkQ7SUFDN0UsV0FBVyxFQUFFLEVBQUUsRUFBRSxxREFBcUQ7SUFDdEUsV0FBVyxFQUFFLENBQUMsRUFBRSw2REFBNkQ7SUFDN0UsV0FBVyxFQUFFLENBQUMsRUFBRSw2REFBNkQ7SUFDN0UsZUFBZSxFQUFFLEdBQUcsRUFBRSw2QkFBNkI7SUFDbkQsZUFBZSxFQUFFLEdBQUcsRUFBRSw2QkFBNkI7Q0FDcEQsQ0FBQztBQXVCRixTQUFTLGVBQWUsQ0FBQyxLQUEyQjtJQUNsRCxJQUFJLEtBQUssQ0FBQyxZQUFZLEtBQUssU0FBUztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ2xELElBQUksS0FBSyxDQUFDLFVBQVUsS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDOUMsSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLE9BQU87UUFBRSxPQUFPLElBQUksQ0FBQztJQUM1QyxJQUFJLEtBQUssQ0FBQyxnQkFBZ0IsS0FBSyxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDakQsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLFlBQVksS0FBSyxTQUFTO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDNUQsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLGdCQUFnQixLQUFLLElBQUk7UUFBRSxPQUFPLElBQUksQ0FBQztJQUMzRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLEtBQTJC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QixRQUFRLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSw2Q0FBNkM7b0JBQ3JFLFVBQVUsRUFBRSxPQUFPO29CQUNuQixPQUFPLEVBQUUsS0FBSyxDQUFDLE1BQU07b0JBQ3JCLFlBQVksRUFBRSxTQUFTO29CQUN2QixRQUFRLEVBQUUsY0FBYztpQkFDekIsQ0FDRixDQUFDO2dCQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0RBQWdELENBQUMsQ0FBQztZQUNoRSxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sa0JBQWtCLENBQUM7SUFFNUIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRWhELG1DQUFtQztRQUNuQyxPQUFPO1lBQ0wsT0FBTyxFQUFFLEtBQUs7WUFDZCxPQUFPLEVBQUUsb0ZBQW9GO1lBQzdGLFFBQVEsRUFBRTtnQkFDUixTQUFTLEVBQUUsS0FBSyxDQUFDLGVBQWUsSUFBSSxTQUFTO2dCQUM3QyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7Z0JBQ3hCLE1BQU0sRUFBRSxLQUFLLENBQUMsUUFBUTtnQkFDdEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxNQUFNO2dCQUNyQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ25DLGdCQUFnQixFQUFFLENBQUM7YUFDcEI7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsSUFBSSxFQUFFLGVBQWU7Z0JBQ3JCLE9BQU8sRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlO2dCQUNqRSxPQUFPLEVBQUUsS0FBSzthQUNmO1NBQ0YsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuLi9saWIvZHluYW1vZGIuanMnO1xuaW1wb3J0IHsgRXZlbnRCcmlkZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vbGliL2V2ZW50YnJpZGdlLmpzJztcbmltcG9ydCB7IEFnZW50U2VydmljZSB9IGZyb20gJy4uL2xpYi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBsb2FkUnVudGltZUNvbmZpZywgdmFsaWRhdGVSdW50aW1lQ29uZmlnIH0gZnJvbSAnLi4vbGliL2NvbmZpZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50Q29udGV4dCwgQWdlbnRSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuLyoqXG4gKiBUaW1pbmcgY29uZmlndXJhdGlvbiBmb3IgcmVhbGlzdGljIGFnZW50IHJlc3BvbnNlIGRlbGF5c1xuICovXG5pbnRlcmZhY2UgVGltaW5nQ29uZmlnIHtcbiAgcmVhZGluZ1NwZWVkOiBudW1iZXI7IC8vIGNoYXJzIHBlciBzZWNvbmRcbiAgdHlwaW5nU3BlZWQ6IG51bWJlcjsgLy8gY2hhcnMgcGVyIHNlY29uZFxuICBtaW5CdXN5VGltZTogbnVtYmVyOyAvLyBzZWNvbmRzXG4gIG1heEJ1c3lUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcbiAgbWluVGhpbmtpbmdUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcbiAgbWF4VGhpbmtpbmdUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcbn1cblxuY29uc3QgREVGQVVMVF9USU1JTkc6IFRpbWluZ0NvbmZpZyA9IHtcbiAgcmVhZGluZ1NwZWVkOiAzMCwgLy8gQXZlcmFnZSBhZHVsdCByZWFkaW5nIHNwZWVkIChjaGFycy9zZWMpIC0gZmFzdGVyIHJlYWRpbmdcbiAgdHlwaW5nU3BlZWQ6IDIwLCAvLyBSZWFsaXN0aWMgdHlwaW5nIHNwZWVkIChjaGFycy9zZWMpIC0gZmFzdGVyIHR5cGluZ1xuICBtaW5CdXN5VGltZTogMSwgLy8gTWluaW11bSBcImJ1c3lcIiB0aW1lIGJlZm9yZSBmaXJzdCByZXNwb25zZSAtIHJlZHVjZWQgZnJvbSAyXG4gIG1heEJ1c3lUaW1lOiAzLCAvLyBNYXhpbXVtIFwiYnVzeVwiIHRpbWUgYmVmb3JlIGZpcnN0IHJlc3BvbnNlIC0gcmVkdWNlZCBmcm9tIDhcbiAgbWluVGhpbmtpbmdUaW1lOiAwLjMsIC8vIE1pbiBwYXVzZSBiZXR3ZWVuIG1lc3NhZ2VzXG4gIG1heFRoaW5raW5nVGltZTogMS4wLCAvLyBNYXggcGF1c2UgYmV0d2VlbiBtZXNzYWdlc1xufTtcblxuLyoqXG4gKiBBZ2VudCBpbnZvY2F0aW9uIGNvbnRleHQgKGludGVybmFsIGV2ZW50IGZyb20gcm91dGVyKVxuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50SW52b2NhdGlvbkV2ZW50IGV4dGVuZHMgQWdlbnRDb250ZXh0IHtcbiAgbWVzc2FnZV90czogc3RyaW5nOyAvLyBUaW1lc3RhbXAgb2YgdGhlIG1lc3NhZ2UgdGhhdCB0cmlnZ2VyZWQgdGhpc1xuICBtZXRhZGF0YT86IHtcbiAgICBvcmlnaW5NYXJrZXI/OiBzdHJpbmc7XG4gICAgYWdlbnRJZD86IHN0cmluZztcbiAgICBvcmlnaW5hbE1lc3NhZ2VJZD86IHN0cmluZztcbiAgICBzZW5kZXJUeXBlPzogc3RyaW5nO1xuICAgIHVzZXJUeXBlPzogc3RyaW5nO1xuICAgIC8vIExlZ2FjeSBzdXBwb3J0XG4gICAgaXNBZ2VudEdlbmVyYXRlZD86IGJvb2xlYW47XG4gIH07XG4gIHNlbmRlclR5cGU/OiBzdHJpbmc7XG4gIHVzZXJUeXBlPzogc3RyaW5nO1xuICBvcmlnaW5NYXJrZXI/OiBzdHJpbmc7XG4gIC8vIExlZ2FjeSBzdXBwb3J0XG4gIGlzQWdlbnRHZW5lcmF0ZWQ/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBpc1BlcnNvbmFPcmlnaW4oZXZlbnQ6IEFnZW50SW52b2NhdGlvbkV2ZW50KTogYm9vbGVhbiB7XG4gIGlmIChldmVudC5vcmlnaW5NYXJrZXIgPT09ICdwZXJzb25hJykgcmV0dXJuIHRydWU7XG4gIGlmIChldmVudC5zZW5kZXJUeXBlID09PSAnYWdlbnQnKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50LnVzZXJUeXBlID09PSAnYWdlbnQnKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50LmlzQWdlbnRHZW5lcmF0ZWQgPT09IHRydWUpIHJldHVybiB0cnVlO1xuICBpZiAoZXZlbnQubWV0YWRhdGE/Lm9yaWdpbk1hcmtlciA9PT0gJ3BlcnNvbmEnKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50Lm1ldGFkYXRhPy5pc0FnZW50R2VuZXJhdGVkID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVPcmlnaW5NZXRhZGF0YShldmVudDogQWdlbnRJbnZvY2F0aW9uRXZlbnQsIGdlbmVyYXRlZE1lc3NhZ2VJZDogc3RyaW5nKSB7XG4gIHJldHVybiB7XG4gICAgb3JpZ2luTWFya2VyOiAncGVyc29uYScsXG4gICAgYWdlbnRJZDogZXZlbnQudXNlcklkLFxuICAgIG9yaWdpbmFsTWVzc2FnZUlkOiBldmVudC5tZXRhZGF0YT8ub3JpZ2luYWxNZXNzYWdlSWQgfHwgZ2VuZXJhdGVkTWVzc2FnZUlkLFxuICAgIHNlbmRlclR5cGU6ICdhZ2VudCcsXG4gICAgcmVjaXBpZW50SWQ6IGV2ZW50LnNlbmRlcklkLFxuICB9O1xufVxuXG4vKipcbiAqIExhbWJkYSBoYW5kbGVyIGZvciBwcm9jZXNzaW5nIGFnZW50IHJlc3BvbnNlc1xuICogSW52b2tlZCBieSBBZ2VudFJvdXRlckZuIHdpdGggcHJvY2Vzc2VkIGNvbnRleHRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoXG4gIGV2ZW50OiBBZ2VudEludm9jYXRpb25FdmVudCxcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnNvbGUubG9nKCdBZ2VudCByZWNlaXZlZCBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICB2YWxpZGF0ZVJ1bnRpbWVDb25maWcoY29uZmlnKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gTG9hZCBjb21wYW55IGluZm8gYW5kIHBlcnNvbmEgZnJvbSBEeW5hbW9EQlxuICAgIGxldCBjb21wYW55SW5mbzogYW55ID0gdW5kZWZpbmVkO1xuICAgIGxldCBwZXJzb25hQ29uZmlnOiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHRpbWluZ0NvbmZpZzogVGltaW5nQ29uZmlnID0gREVGQVVMVF9USU1JTkc7XG4gICAgXG4gICAgaWYgKGV2ZW50LnRlbmFudElkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+PoiBMb2FkaW5nIGNvbXBhbnkgaW5mbyBmb3IgdGVuYW50OiAke2V2ZW50LnRlbmFudElkfWApO1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG4gICAgICAgIGNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShjbGllbnQpO1xuXG4gICAgICAgIC8vIExvYWQgY29tcGFueSBpbmZvIGZyb20gRGVsYXllZFJlcGxpZXMtY29tcGFueV9pbmZvIHRhYmxlXG4gICAgICAgIGNvbnN0IGNvbXBhbnlSZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5DT01QQU5ZX0lORk9fVEFCTEUgfHwgJ0RlbGF5ZWRSZXBsaWVzLWNvbXBhbnlfaW5mbycsXG4gICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWRcbiAgICAgICAgICB9XG4gICAgICAgIH0pKTtcblxuICAgICAgICBpZiAoY29tcGFueVJlc3VsdC5JdGVtKSB7XG4gICAgICAgICAgY29tcGFueUluZm8gPSB7XG4gICAgICAgICAgICBuYW1lOiBjb21wYW55UmVzdWx0Lkl0ZW0ubmFtZSxcbiAgICAgICAgICAgIGluZHVzdHJ5OiBjb21wYW55UmVzdWx0Lkl0ZW0uaW5kdXN0cnksXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogY29tcGFueVJlc3VsdC5JdGVtLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgcHJvZHVjdHM6IGNvbXBhbnlSZXN1bHQuSXRlbS5wcm9kdWN0cyxcbiAgICAgICAgICAgIGJlbmVmaXRzOiBjb21wYW55UmVzdWx0Lkl0ZW0uYmVuZWZpdHMsXG4gICAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6IGNvbXBhbnlSZXN1bHQuSXRlbS50YXJnZXRDdXN0b21lcnMsXG4gICAgICAgICAgICBkaWZmZXJlbnRpYXRvcnM6IGNvbXBhbnlSZXN1bHQuSXRlbS5kaWZmZXJlbnRpYXRvcnMsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExvYWRlZCBjb21wYW55IGluZm86ICR7Y29tcGFueUluZm8ubmFtZX0gKCR7Y29tcGFueUluZm8uaW5kdXN0cnl9KWApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gY29tcGFueSBpbmZvIGZvdW5kIGZvciB0ZW5hbnQgJHtldmVudC50ZW5hbnRJZH0sIHVzaW5nIGRlZmF1bHRzYCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExvYWQgdGltaW5nIGNvbmZpZyBmcm9tIGNvbXBhbnkgaW5mbyBvciB1c2UgZGVmYXVsdHNcbiAgICAgICAgY29uc3QgYWdlbnRUaW1pbmcgPSBjb21wYW55UmVzdWx0Lkl0ZW0/LmFnZW50VGltaW5nO1xuICAgICAgICB0aW1pbmdDb25maWcgPSBhZ2VudFRpbWluZyA/IHtcbiAgICAgICAgICByZWFkaW5nU3BlZWQ6IGFnZW50VGltaW5nLnJlYWRpbmdTcGVlZCB8fCBERUZBVUxUX1RJTUlORy5yZWFkaW5nU3BlZWQsXG4gICAgICAgICAgdHlwaW5nU3BlZWQ6IGFnZW50VGltaW5nLnR5cGluZ1NwZWVkIHx8IERFRkFVTFRfVElNSU5HLnR5cGluZ1NwZWVkLFxuICAgICAgICAgIG1pbkJ1c3lUaW1lOiBhZ2VudFRpbWluZy5taW5CdXN5VGltZSB8fCBERUZBVUxUX1RJTUlORy5taW5CdXN5VGltZSxcbiAgICAgICAgICBtYXhCdXN5VGltZTogYWdlbnRUaW1pbmcubWF4QnVzeVRpbWUgfHwgREVGQVVMVF9USU1JTkcubWF4QnVzeVRpbWUsXG4gICAgICAgICAgbWluVGhpbmtpbmdUaW1lOiBhZ2VudFRpbWluZy5taW5UaGlua2luZ1RpbWUgfHwgREVGQVVMVF9USU1JTkcubWluVGhpbmtpbmdUaW1lLFxuICAgICAgICAgIG1heFRoaW5raW5nVGltZTogYWdlbnRUaW1pbmcubWF4VGhpbmtpbmdUaW1lIHx8IERFRkFVTFRfVElNSU5HLm1heFRoaW5raW5nVGltZSxcbiAgICAgICAgfSA6IERFRkFVTFRfVElNSU5HO1xuICAgICAgICBcbiAgICAgICAgaWYgKGFnZW50VGltaW5nKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKPse+4jyBVc2luZyBjdXN0b20gdGltaW5nIGNvbmZpZyBmcm9tIGNvbXBhbnkgaW5mb2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gVXNpbmcgZGVmYXVsdCB0aW1pbmcgY29uZmlnYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb2FkIHBlcnNvbmEgZnJvbSBEZWxheWVkUmVwbGllcy1wZXJzb25hcyB0YWJsZVxuICAgICAgICBpZiAoZXZlbnQudXNlcklkKSB7IC8vIHVzZXJJZCBpcyB0aGUgcGVyc29uYUlkIGZyb20gcm91dGVyXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkaQgTG9hZGluZyBwZXJzb25hIGZvciB0ZW5hbnQ6ICR7ZXZlbnQudGVuYW50SWR9LCBwZXJzb25hSWQ6ICR7ZXZlbnQudXNlcklkfWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5GkIFBFUlNPTkFTX1RBQkxFIGVudiB2YXI6ICR7cHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEV9YCk7XG4gICAgICAgICAgY29uc3QgcGVyc29uYVJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEUgfHwgJ0RlbGF5ZWRSZXBsaWVzLXBlcnNvbmFzJyxcbiAgICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICAgICAgICAgIHBlcnNvbmFJZDogZXZlbnQudXNlcklkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkaQgUGVyc29uYSBxdWVyeSByZXN1bHQ6ICR7SlNPTi5zdHJpbmdpZnkocGVyc29uYVJlc3VsdCl9YCk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHBlcnNvbmFSZXN1bHQuSXRlbSkge1xuICAgICAgICAgICAgcGVyc29uYUNvbmZpZyA9IHBlcnNvbmFSZXN1bHQuSXRlbTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTG9hZGVkIHBlcnNvbmEgZnJvbSBEeW5hbW9EQjogJHtwZXJzb25hQ29uZmlnLm5hbWV9ICgke3BlcnNvbmFDb25maWcucGVyc29uYUlkfSlgKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgUGVyc29uYSBzeXN0ZW1Qcm9tcHQgcHJldmlldzogJHtwZXJzb25hQ29uZmlnLnN5c3RlbVByb21wdD8uc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gcGVyc29uYSBmb3VuZCBmb3IgJHtldmVudC50ZW5hbnRJZH0vJHtldmVudC51c2VySWR9LCB3aWxsIHVzZSBmYWxsYmFja2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGxvYWRpbmcgY29tcGFueSBpbmZvL3BlcnNvbmE6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBDcmVhdGUgYWdlbnQgc2VydmljZSB3aXRoIGNvbXBhbnkgaW5mbyBhbmQgcGVyc29uYVxuICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgLi4uY29uZmlnLFxuICAgICAgZHluYW1vU2VydmljZSxcbiAgICAgIGV2ZW50QnJpZGdlU2VydmljZSxcbiAgICAgIGNvbXBhbnlJbmZvLFxuICAgICAgcGVyc29uYUlkOiBldmVudC51c2VySWQsIC8vIFBhc3MgcGVyc29uYUlkXG4gICAgICBwZXJzb25hOiBwZXJzb25hQ29uZmlnLCAvLyBQYXNzIHByZS1sb2FkZWQgcGVyc29uYSBmcm9tIER5bmFtb0RCXG4gICAgfSk7XG4gICAgXG4gICAgLy8gUHJvY2VzcyB0aGUgbWVzc2FnZSBhbmQgZ2VuZXJhdGUgcmVzcG9uc2VcbiAgICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBtZXNzYWdlIGZvciAke2V2ZW50LnRlbmFudElkfS8ke2V2ZW50LmVtYWlsX2xjfWApO1xuICAgIFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYWdlbnRTZXJ2aWNlLnByb2Nlc3NNZXNzYWdlKHtcbiAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgIGVtYWlsX2xjOiBldmVudC5lbWFpbF9sYyxcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXG4gICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgIGNoYW5uZWxfY29udGV4dDogZXZlbnQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGBHZW5lcmF0ZWQgcmVzcG9uc2U6ICR7cmVzcG9uc2Uuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgXG4gICAgLy8gRW1pdCBjaGF0Lm1lc3NhZ2UgZXZlbnQgZm9yIHRoZSBhZ2VudCdzIHJlc3BvbnNlXG4gICAgLy8gVGhpcyB3aWxsIGJlIHBpY2tlZCB1cCBieSB0aGUgbWVzc2FnaW5nIHNlcnZpY2UgZm9yIHBlcnNpc3RlbmNlIGFuZCBkZWxpdmVyeVxuICAgIGlmIChldmVudC5zb3VyY2UgPT09ICdjaGF0JyAmJiBldmVudC5jaGFubmVsSWQgJiYgZXZlbnQudXNlcklkKSB7XG4gICAgICBpZiAoaXNQZXJzb25hT3JpZ2luKGV2ZW50KSkge1xuICAgICAgICBjb25zb2xlLmxvZygnU2tpcHBpbmcgY2hhdC5tZXNzYWdlIGVtaXNzaW9uIGJlY2F1c2UgdGhpcyBldmVudCBvcmlnaW5hdGVkIGZyb20gdGhlIGFnZW50LicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9ICAgICAgXG4gICAgICBjb25zb2xlLmxvZygnRW1pdHRpbmcgbXVsdGktcGFydCBjaGF0Lm1lc3NhZ2UgZXZlbnRzIGZvciBhZ2VudCByZXNwb25zZScpO1xuICAgICAgY29uc29sZS5sb2coYPCfkaQgQWdlbnQgaWRlbnRpdHk6IHBlcnNvbmFJZD0ke2V2ZW50LnVzZXJJZH0sIHBlcnNvbmFOYW1lPVwiJHtldmVudC51c2VyTmFtZX1cIiwgc2VuZGVySWQ9JHtldmVudC51c2VySWR9YCk7XG4gICAgICBcbiAgICAgIC8vIEltcG9ydCBjaHVua2luZyB1dGlsaXRpZXNcbiAgICAgIGNvbnN0IHsgUmVzcG9uc2VDaHVua2VyIH0gPSBhd2FpdCBpbXBvcnQoJy4uL2xpYi9yZXNwb25zZS1jaHVua2VyLmpzJyk7XG4gICAgICBcbiAgICAgIC8vIFNpbXBsZSBjaHVua2luZyBjb25maWcgZm9yIGNoYXQ6IDEtMiBzZW50ZW5jZXMgcGVyIGNodW5rXG4gICAgICBjb25zdCBjaHVua2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgcnVsZXM6IHtcbiAgICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgICBjaHVua0J5OiAnc2VudGVuY2UnIGFzIGNvbnN0LFxuICAgICAgICAgICAgbWF4TGVuZ3RoOiAxNTAsIC8vIH4xIHNlbnRlbmNlIChmb3JjZSBzaW5nbGUgc2VudGVuY2UgY2h1bmtzKVxuICAgICAgICAgICAgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAxMDAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzbXM6IHtcbiAgICAgICAgICAgIGNodW5rQnk6ICdub25lJyBhcyBjb25zdCxcbiAgICAgICAgICAgIG1heExlbmd0aDogLTEsXG4gICAgICAgICAgICBkZWxheUJldHdlZW5DaHVua3M6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgICBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsXG4gICAgICAgICAgICBtYXhMZW5ndGg6IC0xLFxuICAgICAgICAgICAgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhcGk6IHtcbiAgICAgICAgICAgIGNodW5rQnk6ICdub25lJyBhcyBjb25zdCxcbiAgICAgICAgICAgIG1heExlbmd0aDogLTEsXG4gICAgICAgICAgICBkZWxheUJldHdlZW5DaHVua3M6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFnZW50OiB7XG4gICAgICAgICAgICBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsXG4gICAgICAgICAgICBtYXhMZW5ndGg6IC0xLFxuICAgICAgICAgICAgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgXG4gICAgICBjb25zdCBjaHVua3MgPSBSZXNwb25zZUNodW5rZXIuY2h1bmtSZXNwb25zZShyZXNwb25zZSwgJ2NoYXQnLCBjaHVua2luZ0NvbmZpZyk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TqCBTcGxpdCByZXNwb25zZSBpbnRvICR7Y2h1bmtzLmxlbmd0aH0gbWVzc2FnZSBjaHVua3NgKTtcbiAgICAgIFxuICAgICAgLy8gQ2FsY3VsYXRlIGRlbGF5cyBmb3IgcmVhbGlzdGljIHR5cGluZyBiZWhhdmlvclxuICAgICAgY29uc3QgY2FsY3VsYXRlVHlwaW5nVGltZSA9ICh0ZXh0OiBzdHJpbmcsIGNvbmZpZzogVGltaW5nQ29uZmlnKTogbnVtYmVyID0+IHtcbiAgICAgICAgY29uc3QgY2hhckNvdW50ID0gdGV4dC5sZW5ndGg7XG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKChjaGFyQ291bnQgLyBjb25maWcudHlwaW5nU3BlZWQpICogMTAwMCk7XG4gICAgICB9O1xuICAgICAgXG4gICAgICBjb25zdCBjYWxjdWxhdGVGaXJzdE1lc3NhZ2VEZWxheSA9IChvcmlnaW5hbFRleHQ6IHN0cmluZywgcmVzcG9uc2VUZXh0OiBzdHJpbmcsIGNvbmZpZzogVGltaW5nQ29uZmlnKTogbnVtYmVyID0+IHtcbiAgICAgICAgY29uc3QgcmVhZGluZ1RpbWUgPSBNYXRoLmZsb29yKChvcmlnaW5hbFRleHQubGVuZ3RoIC8gY29uZmlnLnJlYWRpbmdTcGVlZCkgKiAxMDAwKTtcbiAgICAgICAgY29uc3QgdHlwaW5nVGltZSA9IGNhbGN1bGF0ZVR5cGluZ1RpbWUocmVzcG9uc2VUZXh0LCBjb25maWcpO1xuICAgICAgICBjb25zdCBidXN5VGltZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChjb25maWcubWF4QnVzeVRpbWUgLSBjb25maWcubWluQnVzeVRpbWUpICsgY29uZmlnLm1pbkJ1c3lUaW1lKSAqIDEwMDA7XG4gICAgICAgIHJldHVybiByZWFkaW5nVGltZSArIHR5cGluZ1RpbWUgKyBidXN5VGltZTtcbiAgICAgIH07XG4gICAgICBcbiAgICAgIGNvbnN0IGNhbGN1bGF0ZVN1YnNlcXVlbnRNZXNzYWdlRGVsYXkgPSAocmVzcG9uc2VUZXh0OiBzdHJpbmcsIGNvbmZpZzogVGltaW5nQ29uZmlnKTogbnVtYmVyID0+IHtcbiAgICAgICAgY29uc3QgdHlwaW5nVGltZSA9IGNhbGN1bGF0ZVR5cGluZ1RpbWUocmVzcG9uc2VUZXh0LCBjb25maWcpO1xuICAgICAgICBjb25zdCB0aGlua2luZ1RpbWUgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoY29uZmlnLm1heFRoaW5raW5nVGltZSAtIGNvbmZpZy5taW5UaGlua2luZ1RpbWUpICsgY29uZmlnLm1pblRoaW5raW5nVGltZSkgKiAxMDAwO1xuICAgICAgICByZXR1cm4gdHlwaW5nVGltZSArIHRoaW5raW5nVGltZTtcbiAgICAgIH07XG4gICAgICBcbiAgICAgIC8vIFVzZSB0aW1pbmcgY29uZmlnIChhbHJlYWR5IGxvYWRlZCBlYXJsaWVyKVxuICAgICAgY29uc3QgZmlyc3RDaHVua0RlbGF5ID0gY2FsY3VsYXRlRmlyc3RNZXNzYWdlRGVsYXkoZXZlbnQudGV4dCwgY2h1bmtzWzBdLnRleHQsIHRpbWluZ0NvbmZpZyk7XG4gICAgICBjb25zb2xlLmxvZyhg4o+x77iPIEZpcnN0IG1lc3NhZ2UgZGVsYXk6IC0gUmVhZGluZyB0aW1lOiAke01hdGguZmxvb3IoKGV2ZW50LnRleHQubGVuZ3RoIC8gdGltaW5nQ29uZmlnLnJlYWRpbmdTcGVlZCkgKiAxMDAwKX1tcyAoJHtldmVudC50ZXh0Lmxlbmd0aH0gY2hhcnMgYXQgJHt0aW1pbmdDb25maWcucmVhZGluZ1NwZWVkfSBjaGFycy9zZWMpIC0gVHlwaW5nIHRpbWU6ICR7Y2FsY3VsYXRlVHlwaW5nVGltZShjaHVua3NbMF0udGV4dCwgdGltaW5nQ29uZmlnKX1tcyAoJHtjaHVua3NbMF0udGV4dC5sZW5ndGh9IGNoYXJzIGF0ICR7dGltaW5nQ29uZmlnLnR5cGluZ1NwZWVkfSBjaGFycy9zZWMpIC0gQnVzeSB0aW1lOiAke2ZpcnN0Q2h1bmtEZWxheSAtIE1hdGguZmxvb3IoKGV2ZW50LnRleHQubGVuZ3RoIC8gdGltaW5nQ29uZmlnLnJlYWRpbmdTcGVlZCkgKiAxMDAwKSAtIGNhbGN1bGF0ZVR5cGluZ1RpbWUoY2h1bmtzWzBdLnRleHQsIHRpbWluZ0NvbmZpZyl9bXMgKHJhbmRvbSAke3RpbWluZ0NvbmZpZy5taW5CdXN5VGltZX0tJHt0aW1pbmdDb25maWcubWF4QnVzeVRpbWV9IHNlYykgLSBUb3RhbCBkZWxheTogJHtmaXJzdENodW5rRGVsYXl9bXMgKCR7TWF0aC5mbG9vcihmaXJzdENodW5rRGVsYXkgLyAxMDAwKX0gc2Vjb25kcylgKTtcbiAgICAgIFxuICAgICAgLy8gRW1pdCBjaHVua3Mgd2l0aCByZWFsaXN0aWMgZGVsYXlzXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNodW5rcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBjaHVuayA9IGNodW5rc1tpXTtcbiAgICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgICBjb25zdCBlcG9jaE1zID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgcmFuZG9tU3VmZml4ID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpO1xuICAgICAgICBjb25zdCBnZW5lcmF0ZWRNZXNzYWdlSWQgPSBgYWdlbnQtJHtlcG9jaE1zfS0ke3JhbmRvbVN1ZmZpeH1gO1xuICAgICAgICBjb25zdCBvcmlnaW5NZXRhZGF0YSA9IGNyZWF0ZU9yaWdpbk1ldGFkYXRhKGV2ZW50LCBnZW5lcmF0ZWRNZXNzYWdlSWQpO1xuICAgICAgICBcbiAgICAgICAgLy8gQ2FsY3VsYXRlIGRlbGF5XG4gICAgICAgIGxldCBkZWxheTogbnVtYmVyO1xuICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgIGRlbGF5ID0gZmlyc3RDaHVua0RlbGF5O1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gTWVzc2FnZSAke2kgKyAxfS8ke2NodW5rcy5sZW5ndGh9OiBXYWl0aW5nICR7TWF0aC5mbG9vcihkZWxheSAvIDEwMDApfSBzZWNvbmRzLi4uYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGVsYXkgPSBjYWxjdWxhdGVTdWJzZXF1ZW50TWVzc2FnZURlbGF5KGNodW5rLnRleHQsIHRpbWluZ0NvbmZpZyk7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKPse+4jyBTdWJzZXF1ZW50IG1lc3NhZ2UgZGVsYXk6IC0gVHlwaW5nIHRpbWU6ICR7Y2FsY3VsYXRlVHlwaW5nVGltZShjaHVuay50ZXh0LCB0aW1pbmdDb25maWcpfW1zICgke2NodW5rLnRleHQubGVuZ3RofSBjaGFycyBhdCAke3RpbWluZ0NvbmZpZy50eXBpbmdTcGVlZH0gY2hhcnMvc2VjKSAtIFRoaW5raW5nIHRpbWU6ICR7ZGVsYXkgLSBjYWxjdWxhdGVUeXBpbmdUaW1lKGNodW5rLnRleHQsIHRpbWluZ0NvbmZpZyl9bXMgKHJhbmRvbSAke3RpbWluZ0NvbmZpZy5taW5UaGlua2luZ1RpbWV9LSR7dGltaW5nQ29uZmlnLm1heFRoaW5raW5nVGltZX0gc2VjKSAtIFRvdGFsIGRlbGF5OiAke2RlbGF5fW1zICgke01hdGguZmxvb3IoZGVsYXkgLyAxMDAwKX0gc2Vjb25kcylgKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4o+x77iPIE1lc3NhZ2UgJHtpICsgMX0vJHtjaHVua3MubGVuZ3RofTogV2FpdGluZyAke01hdGguZmxvb3IoZGVsYXkgLyAxMDAwKX0gc2Vjb25kcy4uLmApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBXYWl0IGJlZm9yZSBzZW5kaW5nXG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBkZWxheSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYPCfkaQgVXNpbmcgcGVyc29uYSBuYW1lOiBcIiR7ZXZlbnQudXNlck5hbWV9XCIgKHBlcnNvbmFJZDogJHtldmVudC51c2VySWR9KWApO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+TpCBTZW5kaW5nIG1lc3NhZ2UgJHtpICsgMX0vJHtjaHVua3MubGVuZ3RofSB3aXRoIHVzZXJOYW1lPVwiJHtldmVudC51c2VyTmFtZX1cIjogJHtjaHVuay50ZXh0LnN1YnN0cmluZygwLCA1MCl9Li4uYCk7XG5cbiAgICAgICAgY29uc3QgY2hhdE1lc3NhZ2VFdmVudCA9IHtcbiAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICAgICAgY2hhbm5lbElkOiBldmVudC5jaGFubmVsSWQsXG4gICAgICAgICAgdXNlcklkOiBldmVudC51c2VySWQsIC8vIFBlcnNvbmEgSUQgKHRoZSBhZ2VudCBzZW5kaW5nIHRoZSBtZXNzYWdlKVxuICAgICAgICAgIHVzZXJOYW1lOiBldmVudC51c2VyTmFtZSB8fCAnQUkgQXNzaXN0YW50JyxcbiAgICAgICAgICB1c2VyVHlwZTogJ2FnZW50JywgLy8gRXhwbGljaXRseSBtYXJrIHRoaXMgYXMgYW4gYWdlbnQgbWVzc2FnZVxuICAgICAgICAgIG1lc3NhZ2U6IGNodW5rLnRleHQsXG4gICAgICAgICAgbWVzc2FnZUlkOiBnZW5lcmF0ZWRNZXNzYWdlSWQsXG4gICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgIGNvbm5lY3Rpb25JZDogZXZlbnQuY29ubmVjdGlvbklkIHx8IGV2ZW50LmNoYW5uZWxfY29udGV4dD8uY2hhdD8uY29ubmVjdGlvbklkLFxuICAgICAgICAgIG1lc3NhZ2VUeXBlOiAndGV4dCcsXG4gICAgICAgICAgc2VuZGVySWQ6IGV2ZW50LnVzZXJJZCwgLy8gRm9yIHJvdXRpbmcsIHNlbmRlcklkID0gYWdlbnQgKHBlcnNvbmEgSUQpXG4gICAgICAgICAgc2VuZGVyVHlwZTogJ2FnZW50JyxcbiAgICAgICAgICBhZ2VudElkOiBldmVudC51c2VySWQsXG4gICAgICAgICAgb3JpZ2luTWFya2VyOiAncGVyc29uYScsXG4gICAgICAgICAgbWV0YWRhdGE6IG9yaWdpbk1ldGFkYXRhLFxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hDdXN0b21FdmVudChcbiAgICAgICAgICAna3gtZXZlbnQtdHJhY2tpbmcnLFxuICAgICAgICAgICdjaGF0Lm1lc3NhZ2UnLFxuICAgICAgICAgIGNoYXRNZXNzYWdlRXZlbnRcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgTWVzc2FnZSAke2kgKyAxfS8ke2NodW5rcy5sZW5ndGh9IGVtaXR0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGDwn46JIEFsbCAke2NodW5rcy5sZW5ndGh9IG1lc3NhZ2VzIHNlbnQgc3VjY2Vzc2Z1bGx5IWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygnTm90IGEgY2hhdCBtZXNzYWdlLCBza2lwcGluZyBjaGF0Lm1lc3NhZ2UgZW1pc3Npb24nKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRGV0ZXJtaW5lIHByZWZlcnJlZCBjaGFubmVsIGFuZCByb3V0aW5nXG4gICAgY29uc3QgcHJlZmVycmVkQ2hhbm5lbCA9IGV2ZW50LnNvdXJjZTsgLy8gVXNlIG9yaWdpbmF0aW5nIGNoYW5uZWxcbiAgICBcbiAgICBjb25zdCByb3V0aW5nID0gYWdlbnRTZXJ2aWNlLmNyZWF0ZVJvdXRpbmdJbmZvKHtcbiAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgIGVtYWlsX2xjOiBldmVudC5lbWFpbF9sYyxcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXG4gICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgIGNoYW5uZWxfY29udGV4dDogZXZlbnQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxuICAgIH0sIHByZWZlcnJlZENoYW5uZWwpO1xuICAgIFxuICAgIC8vIEVtaXQgYWdlbnQucmVwbHkuY3JlYXRlZCBldmVudCAoZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5L3RyYWNraW5nKVxuICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRSZXBseShcbiAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudFJlcGx5RXZlbnQoXG4gICAgICAgIGV2ZW50LnRlbmFudElkLFxuICAgICAgICBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGV2ZW50LnRlbmFudElkLCBldmVudC5lbWFpbF9sYyksXG4gICAgICAgIHJlc3BvbnNlLFxuICAgICAgICBwcmVmZXJyZWRDaGFubmVsIGFzICdzbXMnIHwgJ2VtYWlsJyB8ICdjaGF0JyB8ICdhcGknLFxuICAgICAgICByb3V0aW5nLFxuICAgICAgICB7XG4gICAgICAgICAgY29udmVyc2F0aW9uSWQ6IGV2ZW50LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgICAgIHRyaWdnZXJlZF9ieV9tZXNzYWdlOiBldmVudC5tZXNzYWdlX3RzLFxuICAgICAgICAgICAgcmVzcG9uc2VfdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICBsZWFkX2lkOiBldmVudC5sZWFkX2lkLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cbiAgICAgIClcbiAgICApO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCdBZ2VudCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQWdlbnQgZXJyb3I6JywgZXJyb3IpO1xuICAgIFxuICAgIC8vIFRyeSB0byBlbWl0IGVycm9yIGV2ZW50XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IGxvYWRSdW50aW1lQ29uZmlnKCk7XG4gICAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgICBcbiAgICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRFcnJvcihcbiAgICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50RXJyb3JFdmVudChcbiAgICAgICAgICBldmVudC50ZW5hbnRJZCxcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGFnZW50IGVycm9yJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjb250YWN0UGs6IER5bmFtb0RCU2VydmljZS5jcmVhdGVDb250YWN0UEsoZXZlbnQudGVuYW50SWQsIGV2ZW50LmVtYWlsX2xjKSxcbiAgICAgICAgICAgIHN0YWNrOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBjb250ZXh0OiB7XG4gICAgICAgICAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlLFxuICAgICAgICAgICAgICB0ZXh0X2xlbmd0aDogZXZlbnQudGV4dD8ubGVuZ3RoLFxuICAgICAgICAgICAgICBsZWFkX2lkOiBldmVudC5sZWFkX2lkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9XG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXZlbnRFcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGVtaXQgZXJyb3IgZXZlbnQ6JywgZXZlbnRFcnJvcik7XG4gICAgfVxuICAgIFxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8qKlxuICogTGFtYmRhIGhhbmRsZXIgdGhhdCByZXR1cm5zIHN0cnVjdHVyZWQgSlNPTiByZXNwb25zZSB3aXRoIGludGVudCBtZXRhZGF0YVxuICogVXNlZnVsIGZvciBBUEkgR2F0ZXdheSBpbnRlZ3JhdGlvbnMgb3Igd2hlbiB5b3UgbmVlZCBkZXRhaWxlZCByZXNwb25zZSBkYXRhXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdHJ1Y3R1cmVkSGFuZGxlcihcbiAgZXZlbnQ6IEFnZW50SW52b2NhdGlvbkV2ZW50LFxuICBjb250ZXh0OiBDb250ZXh0XG4pOiBQcm9taXNlPEFnZW50UmVzcG9uc2U+IHtcbiAgY29uc29sZS5sb2coJ0FnZW50IHJlY2VpdmVkIGV2ZW50IGZvciBzdHJ1Y3R1cmVkIHJlc3BvbnNlOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gIFxuICB0cnkge1xuICAgIC8vIExvYWQgYW5kIHZhbGlkYXRlIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjb25maWcgPSBsb2FkUnVudGltZUNvbmZpZygpO1xuICAgIHZhbGlkYXRlUnVudGltZUNvbmZpZyhjb25maWcpO1xuICAgIFxuICAgIC8vIEluaXRpYWxpemUgc2VydmljZXNcbiAgICBjb25zdCBkeW5hbW9TZXJ2aWNlID0gbmV3IER5bmFtb0RCU2VydmljZShjb25maWcpO1xuICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgYWdlbnQgc2VydmljZVxuICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgLi4uY29uZmlnLFxuICAgICAgZHluYW1vU2VydmljZSxcbiAgICAgIGV2ZW50QnJpZGdlU2VydmljZSxcbiAgICB9KTtcbiAgICBcbiAgICAvLyBQcm9jZXNzIHRoZSBtZXNzYWdlIGFuZCBnZXQgc3RydWN0dXJlZCByZXNwb25zZVxuICAgIGNvbnNvbGUubG9nKGBQcm9jZXNzaW5nIG1lc3NhZ2UgZm9yICR7ZXZlbnQudGVuYW50SWR9LyR7ZXZlbnQuZW1haWxfbGN9YCk7XG4gICAgXG4gICAgY29uc3Qgc3RydWN0dXJlZFJlc3BvbnNlID0gYXdhaXQgYWdlbnRTZXJ2aWNlLnByb2Nlc3NNZXNzYWdlU3RydWN0dXJlZCh7XG4gICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZXZlbnQuZW1haWxfbGMsXG4gICAgICB0ZXh0OiBldmVudC50ZXh0LFxuICAgICAgc291cmNlOiBldmVudC5zb3VyY2UsXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGV2ZW50LmNoYW5uZWxfY29udGV4dCxcbiAgICAgIGxlYWRfaWQ6IGV2ZW50LmxlYWRfaWQsXG4gICAgICBjb252ZXJzYXRpb25faWQ6IGV2ZW50LmNvbnZlcnNhdGlvbl9pZCxcbiAgICB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhgR2VuZXJhdGVkIHN0cnVjdHVyZWQgcmVzcG9uc2U6YCwge1xuICAgICAgc3VjY2Vzczogc3RydWN0dXJlZFJlc3BvbnNlLnN1Y2Nlc3MsXG4gICAgICBtZXNzYWdlTGVuZ3RoOiBzdHJ1Y3R1cmVkUmVzcG9uc2UubWVzc2FnZS5sZW5ndGgsXG4gICAgICBpbnRlbnQ6IHN0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQ/LmlkLFxuICAgICAgY29uZmlkZW5jZTogc3RydWN0dXJlZFJlc3BvbnNlLmludGVudD8uY29uZmlkZW5jZSxcbiAgICAgIHByb2Nlc3NpbmdUaW1lOiBzdHJ1Y3R1cmVkUmVzcG9uc2UubWV0YWRhdGEucHJvY2Vzc2luZ1RpbWVNc1xuICAgIH0pO1xuICAgIFxuICAgIC8vIExvZyBpbnRlbnQgZGV0ZWN0aW9uIGluIHJlZCBmb3IgdmlzaWJpbGl0eVxuICAgIGlmIChzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+OryBJTlRFTlQgREVURUNURUQgSU4gTEFNQkRBOiAke3N0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQuaWR9IChjb25maWRlbmNlOiAkeyhzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMSl9JSlcXHgxYlswbWApO1xuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIE5hbWU6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5uYW1lfVxceDFiWzBtYCk7XG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgUHJpb3JpdHk6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5wcmlvcml0eX1cXHgxYlswbWApO1xuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIEFjdGlvbnM6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5hY3Rpb25zPy5qb2luKCcsICcpIHx8ICdub25lJ31cXHgxYlswbWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBFbWl0IGNoYXQubWVzc2FnZSBldmVudCBpZiB0aGlzIGlzIGEgY2hhdCBjb252ZXJzYXRpb25cbiAgICBpZiAoc3RydWN0dXJlZFJlc3BvbnNlLnN1Y2Nlc3MgJiYgZXZlbnQuc291cmNlID09PSAnY2hhdCcgJiYgZXZlbnQuY2hhbm5lbElkICYmIGV2ZW50LnVzZXJJZCkge1xuICAgICAgaWYgKGlzUGVyc29uYU9yaWdpbihldmVudCkpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1NraXBwaW5nIHN0cnVjdHVyZWQgY2hhdC5tZXNzYWdlIGVtaXNzaW9uIGJlY2F1c2UgdGhpcyBldmVudCBvcmlnaW5hdGVkIGZyb20gdGhlIGFnZW50LicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0VtaXR0aW5nIGNoYXQubWVzc2FnZSBldmVudCBmb3Igc3RydWN0dXJlZCBhZ2VudCByZXNwb25zZScpO1xuXG4gICAgICAgIGNvbnN0IHRpbWVzdGFtcCA9IHN0cnVjdHVyZWRSZXNwb25zZS5tZXRhZGF0YS50aW1lc3RhbXA7XG4gICAgICAgIGNvbnN0IGVwb2NoTXMgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zdCByYW5kb21TdWZmaXggPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHIoMiwgOSk7XG4gICAgICAgIGNvbnN0IGdlbmVyYXRlZE1lc3NhZ2VJZCA9IGBhZ2VudC0ke2Vwb2NoTXN9LSR7cmFuZG9tU3VmZml4fWA7XG4gICAgICAgIGNvbnN0IG9yaWdpbk1ldGFkYXRhID0gY3JlYXRlT3JpZ2luTWV0YWRhdGEoZXZlbnQsIGdlbmVyYXRlZE1lc3NhZ2VJZCk7XG5cbiAgICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hDdXN0b21FdmVudChcbiAgICAgICAgICAna3gtZXZlbnQtdHJhY2tpbmcnLFxuICAgICAgICAgICdjaGF0Lm1lc3NhZ2UnLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgICAgICAgIGNoYW5uZWxJZDogZXZlbnQuY2hhbm5lbElkLFxuICAgICAgICAgICAgdXNlcklkOiBldmVudC51c2VySWQsIC8vIFBlcnNvbmEgSUQgKHRoZSBhZ2VudClcbiAgICAgICAgICAgIHVzZXJOYW1lOiBldmVudC51c2VyTmFtZSB8fCAnQUkgQXNzaXN0YW50JyxcbiAgICAgICAgICAgIHVzZXJUeXBlOiAnYWdlbnQnLCAvLyBNYXJrIGFzIGFnZW50IG1lc3NhZ2VcbiAgICAgICAgICAgIG1lc3NhZ2U6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXNzYWdlLFxuICAgICAgICAgICAgbWVzc2FnZUlkOiBnZW5lcmF0ZWRNZXNzYWdlSWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBjb25uZWN0aW9uSWQ6IGV2ZW50LmNvbm5lY3Rpb25JZCB8fCBldmVudC5jaGFubmVsX2NvbnRleHQ/LmNoYXQ/LmNvbm5lY3Rpb25JZCwgLy8gVXNlIGNvbm5lY3Rpb25JZCBmcm9tIG9yaWdpbmFsIG1lc3NhZ2VcbiAgICAgICAgICAgIG1lc3NhZ2VUeXBlOiAndGV4dCcsXG4gICAgICAgICAgICBzZW5kZXJJZDogZXZlbnQudXNlcklkLCAvLyBGb3Igcm91dGluZywgc2VuZGVySWQgPSBhZ2VudCAocGVyc29uYSBJRClcbiAgICAgICAgICAgIHNlbmRlclR5cGU6ICdhZ2VudCcsXG4gICAgICAgICAgICBhZ2VudElkOiBldmVudC51c2VySWQsXG4gICAgICAgICAgICBvcmlnaW5NYXJrZXI6ICdwZXJzb25hJyxcbiAgICAgICAgICAgIG1ldGFkYXRhOiBvcmlnaW5NZXRhZGF0YVxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKCdTdHJ1Y3R1cmVkIHJlc3BvbnNlIGNoYXQubWVzc2FnZSBldmVudCBlbWl0dGVkJyk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBzdHJ1Y3R1cmVkUmVzcG9uc2U7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQWdlbnQgcHJvY2Vzc2luZyBlcnJvcjonLCBlcnJvcik7XG4gICAgXG4gICAgLy8gUmV0dXJuIHN0cnVjdHVyZWQgZXJyb3IgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBtZXNzYWdlOiAnSSBhcG9sb2dpemUsIGJ1dCBJIGVuY291bnRlcmVkIGFuIGVycm9yIHByb2Nlc3NpbmcgeW91ciBtZXNzYWdlLiBQbGVhc2UgdHJ5IGFnYWluLicsXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICBzZXNzaW9uSWQ6IGV2ZW50LmNvbnZlcnNhdGlvbl9pZCB8fCAndW5rbm93bicsXG4gICAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgICAgdXNlcklkOiBldmVudC5lbWFpbF9sYyxcbiAgICAgICAgY2hhbm5lbDogZXZlbnQuc291cmNlLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogMFxuICAgICAgfSxcbiAgICAgIGVycm9yOiB7XG4gICAgICAgIGNvZGU6ICdIQU5ETEVSX0VSUk9SJyxcbiAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgIGRldGFpbHM6IGVycm9yXG4gICAgICB9XG4gICAgfTtcbiAgfVxufVxuIl19