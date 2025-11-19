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
    readingSpeed: 50, // Average adult reading speed (chars/sec) - very fast reading
    typingSpeed: 8, // Realistic typing speed (chars/sec) - slower, more human-like
    minBusyTime: 0.5, // Minimum "busy" time before first response - very quick
    maxBusyTime: 2, // Maximum "busy" time before first response - faster initial response
    minThinkingTime: 1.0, // Min pause between messages - slower typing between chunks
    maxThinkingTime: 2.5, // Max pause between messages - more realistic pauses
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
            // Use persona's responseChunking config if available, otherwise build verbosity-aware defaults
            let chunkingConfig;
            if (personaConfig?.responseChunking?.rules?.chat) {
                // Use persona's explicit chunking configuration (only if it has valid rules)
                chunkingConfig = personaConfig.responseChunking;
                console.log('📏 Using persona-defined chunking config');
            }
            else {
                console.log('📏 Persona chunking config missing or invalid, building verbosity-aware defaults');
                // Build verbosity-aware defaults based on personality traits
                const verbosity = personaConfig?.personalityTraits?.verbosity || 5;
                console.log(`📏 Building verbosity-aware chunking config (verbosity: ${verbosity})`);
                // ALWAYS chunk by sentence (1 sentence per message) for chat
                // Verbosity controls HOW MANY sentences total, not chunk size
                // For very low verbosity (1-2), disable chunking - they'll only generate 1 sentence
                // For verbosity 3+, enable sentence-level chunking
                if (verbosity <= 2) {
                    chunkingConfig = {
                        enabled: false, // Disable chunking for VERY low verbosity (1 sentence total)
                        rules: {
                            chat: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            sms: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            email: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            api: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            agent: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 }
                        }
                    };
                }
                else {
                    // For verbosity 3+, chunk into 1 sentence per message
                    chunkingConfig = {
                        enabled: true,
                        rules: {
                            chat: { chunkBy: 'sentence', maxLength: 120, delayBetweenChunks: 1000 }, // ~1 sentence max per chunk
                            sms: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            email: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            api: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 },
                            agent: { chunkBy: 'none', maxLength: -1, delayBetweenChunks: 0 }
                        }
                    };
                }
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaGFuZGxlcnMvYWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5RUEsMEJBb1VDO0FBTUQsOENBa0hDO0FBcGdCRCxvREFBcUQ7QUFDckQsMERBQTJEO0FBQzNELDhDQUErQztBQUMvQyxnREFBNEU7QUFlNUUsTUFBTSxjQUFjLEdBQWlCO0lBQ25DLFlBQVksRUFBRSxFQUFFLEVBQUUsOERBQThEO0lBQ2hGLFdBQVcsRUFBRSxDQUFDLEVBQUUsK0RBQStEO0lBQy9FLFdBQVcsRUFBRSxHQUFHLEVBQUUseURBQXlEO0lBQzNFLFdBQVcsRUFBRSxDQUFDLEVBQUUsc0VBQXNFO0lBQ3RGLGVBQWUsRUFBRSxHQUFHLEVBQUUsNERBQTREO0lBQ2xGLGVBQWUsRUFBRSxHQUFHLEVBQUUscURBQXFEO0NBQzVFLENBQUM7QUF1QkYsU0FBUyxlQUFlLENBQUMsS0FBMkI7SUFDbEQsSUFBSSxLQUFLLENBQUMsWUFBWSxLQUFLLFNBQVM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUNsRCxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssT0FBTztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzlDLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDNUMsSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEtBQUssSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ2pELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxZQUFZLEtBQUssU0FBUztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzVELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsS0FBSyxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDM0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxLQUEy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QUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQ29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJTZXJ2aWNlIH0gZnJvbSAnLi4vbGliL2R5bmFtb2RiLmpzJztcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4uL2xpYi9ldmVudGJyaWRnZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9saWIvYWdlbnQuanMnO1xuaW1wb3J0IHsgbG9hZFJ1bnRpbWVDb25maWcsIHZhbGlkYXRlUnVudGltZUNvbmZpZyB9IGZyb20gJy4uL2xpYi9jb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudENvbnRleHQsIEFnZW50UmVzcG9uc2UgfSBmcm9tICcuLi90eXBlcy9pbmRleC5qcyc7XG5cbi8qKlxuICogVGltaW5nIGNvbmZpZ3VyYXRpb24gZm9yIHJlYWxpc3RpYyBhZ2VudCByZXNwb25zZSBkZWxheXNcbiAqL1xuaW50ZXJmYWNlIFRpbWluZ0NvbmZpZyB7XG4gIHJlYWRpbmdTcGVlZDogbnVtYmVyOyAvLyBjaGFycyBwZXIgc2Vjb25kXG4gIHR5cGluZ1NwZWVkOiBudW1iZXI7IC8vIGNoYXJzIHBlciBzZWNvbmRcbiAgbWluQnVzeVRpbWU6IG51bWJlcjsgLy8gc2Vjb25kc1xuICBtYXhCdXN5VGltZTogbnVtYmVyOyAvLyBzZWNvbmRzXG4gIG1pblRoaW5raW5nVGltZTogbnVtYmVyOyAvLyBzZWNvbmRzXG4gIG1heFRoaW5raW5nVGltZTogbnVtYmVyOyAvLyBzZWNvbmRzXG59XG5cbmNvbnN0IERFRkFVTFRfVElNSU5HOiBUaW1pbmdDb25maWcgPSB7XG4gIHJlYWRpbmdTcGVlZDogNTAsIC8vIEF2ZXJhZ2UgYWR1bHQgcmVhZGluZyBzcGVlZCAoY2hhcnMvc2VjKSAtIHZlcnkgZmFzdCByZWFkaW5nXG4gIHR5cGluZ1NwZWVkOiA4LCAvLyBSZWFsaXN0aWMgdHlwaW5nIHNwZWVkIChjaGFycy9zZWMpIC0gc2xvd2VyLCBtb3JlIGh1bWFuLWxpa2VcbiAgbWluQnVzeVRpbWU6IDAuNSwgLy8gTWluaW11bSBcImJ1c3lcIiB0aW1lIGJlZm9yZSBmaXJzdCByZXNwb25zZSAtIHZlcnkgcXVpY2tcbiAgbWF4QnVzeVRpbWU6IDIsIC8vIE1heGltdW0gXCJidXN5XCIgdGltZSBiZWZvcmUgZmlyc3QgcmVzcG9uc2UgLSBmYXN0ZXIgaW5pdGlhbCByZXNwb25zZVxuICBtaW5UaGlua2luZ1RpbWU6IDEuMCwgLy8gTWluIHBhdXNlIGJldHdlZW4gbWVzc2FnZXMgLSBzbG93ZXIgdHlwaW5nIGJldHdlZW4gY2h1bmtzXG4gIG1heFRoaW5raW5nVGltZTogMi41LCAvLyBNYXggcGF1c2UgYmV0d2VlbiBtZXNzYWdlcyAtIG1vcmUgcmVhbGlzdGljIHBhdXNlc1xufTtcblxuLyoqXG4gKiBBZ2VudCBpbnZvY2F0aW9uIGNvbnRleHQgKGludGVybmFsIGV2ZW50IGZyb20gcm91dGVyKVxuICovXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50SW52b2NhdGlvbkV2ZW50IGV4dGVuZHMgQWdlbnRDb250ZXh0IHtcbiAgbWVzc2FnZV90czogc3RyaW5nOyAvLyBUaW1lc3RhbXAgb2YgdGhlIG1lc3NhZ2UgdGhhdCB0cmlnZ2VyZWQgdGhpc1xuICBtZXRhZGF0YT86IHtcbiAgICBvcmlnaW5NYXJrZXI/OiBzdHJpbmc7XG4gICAgYWdlbnRJZD86IHN0cmluZztcbiAgICBvcmlnaW5hbE1lc3NhZ2VJZD86IHN0cmluZztcbiAgICBzZW5kZXJUeXBlPzogc3RyaW5nO1xuICAgIHVzZXJUeXBlPzogc3RyaW5nO1xuICAgIC8vIExlZ2FjeSBzdXBwb3J0XG4gICAgaXNBZ2VudEdlbmVyYXRlZD86IGJvb2xlYW47XG4gIH07XG4gIHNlbmRlclR5cGU/OiBzdHJpbmc7XG4gIHVzZXJUeXBlPzogc3RyaW5nO1xuICBvcmlnaW5NYXJrZXI/OiBzdHJpbmc7XG4gIC8vIExlZ2FjeSBzdXBwb3J0XG4gIGlzQWdlbnRHZW5lcmF0ZWQ/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBpc1BlcnNvbmFPcmlnaW4oZXZlbnQ6IEFnZW50SW52b2NhdGlvbkV2ZW50KTogYm9vbGVhbiB7XG4gIGlmIChldmVudC5vcmlnaW5NYXJrZXIgPT09ICdwZXJzb25hJykgcmV0dXJuIHRydWU7XG4gIGlmIChldmVudC5zZW5kZXJUeXBlID09PSAnYWdlbnQnKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50LnVzZXJUeXBlID09PSAnYWdlbnQnKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50LmlzQWdlbnRHZW5lcmF0ZWQgPT09IHRydWUpIHJldHVybiB0cnVlO1xuICBpZiAoZXZlbnQubWV0YWRhdGE/Lm9yaWdpbk1hcmtlciA9PT0gJ3BlcnNvbmEnKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50Lm1ldGFkYXRhPy5pc0FnZW50R2VuZXJhdGVkID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVPcmlnaW5NZXRhZGF0YShldmVudDogQWdlbnRJbnZvY2F0aW9uRXZlbnQsIGdlbmVyYXRlZE1lc3NhZ2VJZDogc3RyaW5nKSB7XG4gIHJldHVybiB7XG4gICAgb3JpZ2luTWFya2VyOiAncGVyc29uYScsXG4gICAgYWdlbnRJZDogZXZlbnQudXNlcklkLFxuICAgIG9yaWdpbmFsTWVzc2FnZUlkOiBldmVudC5tZXRhZGF0YT8ub3JpZ2luYWxNZXNzYWdlSWQgfHwgZ2VuZXJhdGVkTWVzc2FnZUlkLFxuICAgIHNlbmRlclR5cGU6ICdhZ2VudCcsXG4gICAgcmVjaXBpZW50SWQ6IGV2ZW50LnNlbmRlcklkLFxuICB9O1xufVxuXG4vKipcbiAqIExhbWJkYSBoYW5kbGVyIGZvciBwcm9jZXNzaW5nIGFnZW50IHJlc3BvbnNlc1xuICogSW52b2tlZCBieSBBZ2VudFJvdXRlckZuIHdpdGggcHJvY2Vzc2VkIGNvbnRleHRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoXG4gIGV2ZW50OiBBZ2VudEludm9jYXRpb25FdmVudCxcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnNvbGUubG9nKCdBZ2VudCByZWNlaXZlZCBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICB2YWxpZGF0ZVJ1bnRpbWVDb25maWcoY29uZmlnKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gTG9hZCBjb21wYW55IGluZm8gYW5kIHBlcnNvbmEgZnJvbSBEeW5hbW9EQlxuICAgIGxldCBjb21wYW55SW5mbzogYW55ID0gdW5kZWZpbmVkO1xuICAgIGxldCBwZXJzb25hQ29uZmlnOiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHRpbWluZ0NvbmZpZzogVGltaW5nQ29uZmlnID0gREVGQVVMVF9USU1JTkc7XG4gICAgXG4gICAgaWYgKGV2ZW50LnRlbmFudElkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+PoiBMb2FkaW5nIGNvbXBhbnkgaW5mbyBmb3IgdGVuYW50OiAke2V2ZW50LnRlbmFudElkfWApO1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIEdldENvbW1hbmQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG4gICAgICAgIGNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShjbGllbnQpO1xuXG4gICAgICAgIC8vIExvYWQgY29tcGFueSBpbmZvIGZyb20gRGVsYXllZFJlcGxpZXMtY29tcGFueV9pbmZvIHRhYmxlXG4gICAgICAgIGNvbnN0IGNvbXBhbnlSZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5DT01QQU5ZX0lORk9fVEFCTEUgfHwgJ0RlbGF5ZWRSZXBsaWVzLWNvbXBhbnlfaW5mbycsXG4gICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWRcbiAgICAgICAgICB9XG4gICAgICAgIH0pKTtcblxuICAgICAgICBpZiAoY29tcGFueVJlc3VsdC5JdGVtKSB7XG4gICAgICAgICAgY29tcGFueUluZm8gPSB7XG4gICAgICAgICAgICBuYW1lOiBjb21wYW55UmVzdWx0Lkl0ZW0ubmFtZSxcbiAgICAgICAgICAgIGluZHVzdHJ5OiBjb21wYW55UmVzdWx0Lkl0ZW0uaW5kdXN0cnksXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogY29tcGFueVJlc3VsdC5JdGVtLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgcHJvZHVjdHM6IGNvbXBhbnlSZXN1bHQuSXRlbS5wcm9kdWN0cyxcbiAgICAgICAgICAgIGJlbmVmaXRzOiBjb21wYW55UmVzdWx0Lkl0ZW0uYmVuZWZpdHMsXG4gICAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6IGNvbXBhbnlSZXN1bHQuSXRlbS50YXJnZXRDdXN0b21lcnMsXG4gICAgICAgICAgICBkaWZmZXJlbnRpYXRvcnM6IGNvbXBhbnlSZXN1bHQuSXRlbS5kaWZmZXJlbnRpYXRvcnMsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExvYWRlZCBjb21wYW55IGluZm86ICR7Y29tcGFueUluZm8ubmFtZX0gKCR7Y29tcGFueUluZm8uaW5kdXN0cnl9KWApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gY29tcGFueSBpbmZvIGZvdW5kIGZvciB0ZW5hbnQgJHtldmVudC50ZW5hbnRJZH0sIHVzaW5nIGRlZmF1bHRzYCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExvYWQgdGltaW5nIGNvbmZpZyBmcm9tIGNvbXBhbnkgaW5mbyBvciB1c2UgZGVmYXVsdHNcbiAgICAgICAgY29uc3QgYWdlbnRUaW1pbmcgPSBjb21wYW55UmVzdWx0Lkl0ZW0/LmFnZW50VGltaW5nO1xuICAgICAgICB0aW1pbmdDb25maWcgPSBhZ2VudFRpbWluZyA/IHtcbiAgICAgICAgICByZWFkaW5nU3BlZWQ6IGFnZW50VGltaW5nLnJlYWRpbmdTcGVlZCB8fCBERUZBVUxUX1RJTUlORy5yZWFkaW5nU3BlZWQsXG4gICAgICAgICAgdHlwaW5nU3BlZWQ6IGFnZW50VGltaW5nLnR5cGluZ1NwZWVkIHx8IERFRkFVTFRfVElNSU5HLnR5cGluZ1NwZWVkLFxuICAgICAgICAgIG1pbkJ1c3lUaW1lOiBhZ2VudFRpbWluZy5taW5CdXN5VGltZSB8fCBERUZBVUxUX1RJTUlORy5taW5CdXN5VGltZSxcbiAgICAgICAgICBtYXhCdXN5VGltZTogYWdlbnRUaW1pbmcubWF4QnVzeVRpbWUgfHwgREVGQVVMVF9USU1JTkcubWF4QnVzeVRpbWUsXG4gICAgICAgICAgbWluVGhpbmtpbmdUaW1lOiBhZ2VudFRpbWluZy5taW5UaGlua2luZ1RpbWUgfHwgREVGQVVMVF9USU1JTkcubWluVGhpbmtpbmdUaW1lLFxuICAgICAgICAgIG1heFRoaW5raW5nVGltZTogYWdlbnRUaW1pbmcubWF4VGhpbmtpbmdUaW1lIHx8IERFRkFVTFRfVElNSU5HLm1heFRoaW5raW5nVGltZSxcbiAgICAgICAgfSA6IERFRkFVTFRfVElNSU5HO1xuICAgICAgICBcbiAgICAgICAgaWYgKGFnZW50VGltaW5nKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKPse+4jyBVc2luZyBjdXN0b20gdGltaW5nIGNvbmZpZyBmcm9tIGNvbXBhbnkgaW5mb2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gVXNpbmcgZGVmYXVsdCB0aW1pbmcgY29uZmlnYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb2FkIHBlcnNvbmEgZnJvbSBEZWxheWVkUmVwbGllcy1wZXJzb25hcyB0YWJsZVxuICAgICAgICBpZiAoZXZlbnQudXNlcklkKSB7IC8vIHVzZXJJZCBpcyB0aGUgcGVyc29uYUlkIGZyb20gcm91dGVyXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkaQgTG9hZGluZyBwZXJzb25hIGZvciB0ZW5hbnQ6ICR7ZXZlbnQudGVuYW50SWR9LCBwZXJzb25hSWQ6ICR7ZXZlbnQudXNlcklkfWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5GkIFBFUlNPTkFTX1RBQkxFIGVudiB2YXI6ICR7cHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEV9YCk7XG4gICAgICAgICAgY29uc3QgcGVyc29uYVJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEUgfHwgJ0RlbGF5ZWRSZXBsaWVzLXBlcnNvbmFzJyxcbiAgICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICAgICAgICAgIHBlcnNvbmFJZDogZXZlbnQudXNlcklkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkaQgUGVyc29uYSBxdWVyeSByZXN1bHQ6ICR7SlNPTi5zdHJpbmdpZnkocGVyc29uYVJlc3VsdCl9YCk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHBlcnNvbmFSZXN1bHQuSXRlbSkge1xuICAgICAgICAgICAgcGVyc29uYUNvbmZpZyA9IHBlcnNvbmFSZXN1bHQuSXRlbTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTG9hZGVkIHBlcnNvbmEgZnJvbSBEeW5hbW9EQjogJHtwZXJzb25hQ29uZmlnLm5hbWV9ICgke3BlcnNvbmFDb25maWcucGVyc29uYUlkfSlgKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgUGVyc29uYSBzeXN0ZW1Qcm9tcHQgcHJldmlldzogJHtwZXJzb25hQ29uZmlnLnN5c3RlbVByb21wdD8uc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gcGVyc29uYSBmb3VuZCBmb3IgJHtldmVudC50ZW5hbnRJZH0vJHtldmVudC51c2VySWR9LCB3aWxsIHVzZSBmYWxsYmFja2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGxvYWRpbmcgY29tcGFueSBpbmZvL3BlcnNvbmE6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBDcmVhdGUgYWdlbnQgc2VydmljZSB3aXRoIGNvbXBhbnkgaW5mbyBhbmQgcGVyc29uYVxuICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgLi4uY29uZmlnLFxuICAgICAgZHluYW1vU2VydmljZSxcbiAgICAgIGV2ZW50QnJpZGdlU2VydmljZSxcbiAgICAgIGNvbXBhbnlJbmZvLFxuICAgICAgcGVyc29uYUlkOiBldmVudC51c2VySWQsIC8vIFBhc3MgcGVyc29uYUlkXG4gICAgICBwZXJzb25hOiBwZXJzb25hQ29uZmlnLCAvLyBQYXNzIHByZS1sb2FkZWQgcGVyc29uYSBmcm9tIER5bmFtb0RCXG4gICAgfSk7XG4gICAgXG4gICAgLy8gUHJvY2VzcyB0aGUgbWVzc2FnZSBhbmQgZ2VuZXJhdGUgcmVzcG9uc2VcbiAgICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBtZXNzYWdlIGZvciAke2V2ZW50LnRlbmFudElkfS8ke2V2ZW50LmVtYWlsX2xjfWApO1xuICAgIFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYWdlbnRTZXJ2aWNlLnByb2Nlc3NNZXNzYWdlKHtcbiAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgIGVtYWlsX2xjOiBldmVudC5lbWFpbF9sYyxcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXG4gICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgIGNoYW5uZWxfY29udGV4dDogZXZlbnQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGBHZW5lcmF0ZWQgcmVzcG9uc2U6ICR7cmVzcG9uc2Uuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgXG4gICAgLy8gRW1pdCBjaGF0Lm1lc3NhZ2UgZXZlbnQgZm9yIHRoZSBhZ2VudCdzIHJlc3BvbnNlXG4gICAgLy8gVGhpcyB3aWxsIGJlIHBpY2tlZCB1cCBieSB0aGUgbWVzc2FnaW5nIHNlcnZpY2UgZm9yIHBlcnNpc3RlbmNlIGFuZCBkZWxpdmVyeVxuICAgIGlmIChldmVudC5zb3VyY2UgPT09ICdjaGF0JyAmJiBldmVudC5jaGFubmVsSWQgJiYgZXZlbnQudXNlcklkKSB7XG4gICAgICBpZiAoaXNQZXJzb25hT3JpZ2luKGV2ZW50KSkge1xuICAgICAgICBjb25zb2xlLmxvZygnU2tpcHBpbmcgY2hhdC5tZXNzYWdlIGVtaXNzaW9uIGJlY2F1c2UgdGhpcyBldmVudCBvcmlnaW5hdGVkIGZyb20gdGhlIGFnZW50LicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9ICAgICAgXG4gICAgICBjb25zb2xlLmxvZygnRW1pdHRpbmcgbXVsdGktcGFydCBjaGF0Lm1lc3NhZ2UgZXZlbnRzIGZvciBhZ2VudCByZXNwb25zZScpO1xuICAgICAgY29uc29sZS5sb2coYPCfkaQgQWdlbnQgaWRlbnRpdHk6IHBlcnNvbmFJZD0ke2V2ZW50LnVzZXJJZH0sIHBlcnNvbmFOYW1lPVwiJHtldmVudC51c2VyTmFtZX1cIiwgc2VuZGVySWQ9JHtldmVudC51c2VySWR9YCk7XG4gICAgICBcbiAgICAgIC8vIEltcG9ydCBjaHVua2luZyB1dGlsaXRpZXNcbiAgICAgIGNvbnN0IHsgUmVzcG9uc2VDaHVua2VyIH0gPSBhd2FpdCBpbXBvcnQoJy4uL2xpYi9yZXNwb25zZS1jaHVua2VyLmpzJyk7XG4gICAgICBcbiAgICAgIC8vIFVzZSBwZXJzb25hJ3MgcmVzcG9uc2VDaHVua2luZyBjb25maWcgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgYnVpbGQgdmVyYm9zaXR5LWF3YXJlIGRlZmF1bHRzXG4gICAgICBsZXQgY2h1bmtpbmdDb25maWc6IGFueTtcbiAgICAgIFxuICAgICAgaWYgKHBlcnNvbmFDb25maWc/LnJlc3BvbnNlQ2h1bmtpbmc/LnJ1bGVzPy5jaGF0KSB7XG4gICAgICAgIC8vIFVzZSBwZXJzb25hJ3MgZXhwbGljaXQgY2h1bmtpbmcgY29uZmlndXJhdGlvbiAob25seSBpZiBpdCBoYXMgdmFsaWQgcnVsZXMpXG4gICAgICAgIGNodW5raW5nQ29uZmlnID0gcGVyc29uYUNvbmZpZy5yZXNwb25zZUNodW5raW5nO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+TjyBVc2luZyBwZXJzb25hLWRlZmluZWQgY2h1bmtpbmcgY29uZmlnJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+TjyBQZXJzb25hIGNodW5raW5nIGNvbmZpZyBtaXNzaW5nIG9yIGludmFsaWQsIGJ1aWxkaW5nIHZlcmJvc2l0eS1hd2FyZSBkZWZhdWx0cycpO1xuICAgICAgICAvLyBCdWlsZCB2ZXJib3NpdHktYXdhcmUgZGVmYXVsdHMgYmFzZWQgb24gcGVyc29uYWxpdHkgdHJhaXRzXG4gICAgICAgIGNvbnN0IHZlcmJvc2l0eSA9IChwZXJzb25hQ29uZmlnIGFzIGFueSk/LnBlcnNvbmFsaXR5VHJhaXRzPy52ZXJib3NpdHkgfHwgNTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk48gQnVpbGRpbmcgdmVyYm9zaXR5LWF3YXJlIGNodW5raW5nIGNvbmZpZyAodmVyYm9zaXR5OiAke3ZlcmJvc2l0eX0pYCk7XG4gICAgICAgIFxuICAgICAgICAvLyBBTFdBWVMgY2h1bmsgYnkgc2VudGVuY2UgKDEgc2VudGVuY2UgcGVyIG1lc3NhZ2UpIGZvciBjaGF0XG4gICAgICAgIC8vIFZlcmJvc2l0eSBjb250cm9scyBIT1cgTUFOWSBzZW50ZW5jZXMgdG90YWwsIG5vdCBjaHVuayBzaXplXG4gICAgICAgIC8vIEZvciB2ZXJ5IGxvdyB2ZXJib3NpdHkgKDEtMiksIGRpc2FibGUgY2h1bmtpbmcgLSB0aGV5J2xsIG9ubHkgZ2VuZXJhdGUgMSBzZW50ZW5jZVxuICAgICAgICAvLyBGb3IgdmVyYm9zaXR5IDMrLCBlbmFibGUgc2VudGVuY2UtbGV2ZWwgY2h1bmtpbmdcbiAgICAgICAgaWYgKHZlcmJvc2l0eSA8PSAyKSB7XG4gICAgICAgICAgY2h1bmtpbmdDb25maWcgPSB7XG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSwgLy8gRGlzYWJsZSBjaHVua2luZyBmb3IgVkVSWSBsb3cgdmVyYm9zaXR5ICgxIHNlbnRlbmNlIHRvdGFsKVxuICAgICAgICAgICAgcnVsZXM6IHtcbiAgICAgICAgICAgICAgY2hhdDogeyBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsIG1heExlbmd0aDogLTEsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9LFxuICAgICAgICAgICAgICBzbXM6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgICAgICAgZW1haWw6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgICAgICAgYXBpOiB7IGNodW5rQnk6ICdub25lJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAtMSwgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwIH0sXG4gICAgICAgICAgICAgIGFnZW50OiB7IGNodW5rQnk6ICdub25lJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAtMSwgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEZvciB2ZXJib3NpdHkgMyssIGNodW5rIGludG8gMSBzZW50ZW5jZSBwZXIgbWVzc2FnZVxuICAgICAgICAgIGNodW5raW5nQ29uZmlnID0ge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHJ1bGVzOiB7XG4gICAgICAgICAgICAgIGNoYXQ6IHsgY2h1bmtCeTogJ3NlbnRlbmNlJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAxMjAsIGRlbGF5QmV0d2VlbkNodW5rczogMTAwMCB9LCAvLyB+MSBzZW50ZW5jZSBtYXggcGVyIGNodW5rXG4gICAgICAgICAgICAgIHNtczogeyBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsIG1heExlbmd0aDogLTEsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9LFxuICAgICAgICAgICAgICBlbWFpbDogeyBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsIG1heExlbmd0aDogLTEsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9LFxuICAgICAgICAgICAgICBhcGk6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgICAgICAgYWdlbnQ6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIFxuICAgICAgY29uc3QgY2h1bmtzID0gUmVzcG9uc2VDaHVua2VyLmNodW5rUmVzcG9uc2UocmVzcG9uc2UsICdjaGF0JywgY2h1bmtpbmdDb25maWcpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6ggU3BsaXQgcmVzcG9uc2UgaW50byAke2NodW5rcy5sZW5ndGh9IG1lc3NhZ2UgY2h1bmtzYCk7XG4gICAgICBcbiAgICAgIC8vIENhbGN1bGF0ZSBkZWxheXMgZm9yIHJlYWxpc3RpYyB0eXBpbmcgYmVoYXZpb3JcbiAgICAgIGNvbnN0IGNhbGN1bGF0ZVR5cGluZ1RpbWUgPSAodGV4dDogc3RyaW5nLCBjb25maWc6IFRpbWluZ0NvbmZpZyk6IG51bWJlciA9PiB7XG4gICAgICAgIGNvbnN0IGNoYXJDb3VudCA9IHRleHQubGVuZ3RoO1xuICAgICAgICByZXR1cm4gTWF0aC5mbG9vcigoY2hhckNvdW50IC8gY29uZmlnLnR5cGluZ1NwZWVkKSAqIDEwMDApO1xuICAgICAgfTtcbiAgICAgIFxuICAgICAgY29uc3QgY2FsY3VsYXRlRmlyc3RNZXNzYWdlRGVsYXkgPSAob3JpZ2luYWxUZXh0OiBzdHJpbmcsIHJlc3BvbnNlVGV4dDogc3RyaW5nLCBjb25maWc6IFRpbWluZ0NvbmZpZyk6IG51bWJlciA9PiB7XG4gICAgICAgIGNvbnN0IHJlYWRpbmdUaW1lID0gTWF0aC5mbG9vcigob3JpZ2luYWxUZXh0Lmxlbmd0aCAvIGNvbmZpZy5yZWFkaW5nU3BlZWQpICogMTAwMCk7XG4gICAgICAgIGNvbnN0IHR5cGluZ1RpbWUgPSBjYWxjdWxhdGVUeXBpbmdUaW1lKHJlc3BvbnNlVGV4dCwgY29uZmlnKTtcbiAgICAgICAgY29uc3QgYnVzeVRpbWUgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoY29uZmlnLm1heEJ1c3lUaW1lIC0gY29uZmlnLm1pbkJ1c3lUaW1lKSArIGNvbmZpZy5taW5CdXN5VGltZSkgKiAxMDAwO1xuICAgICAgICByZXR1cm4gcmVhZGluZ1RpbWUgKyB0eXBpbmdUaW1lICsgYnVzeVRpbWU7XG4gICAgICB9O1xuICAgICAgXG4gICAgICBjb25zdCBjYWxjdWxhdGVTdWJzZXF1ZW50TWVzc2FnZURlbGF5ID0gKHJlc3BvbnNlVGV4dDogc3RyaW5nLCBjb25maWc6IFRpbWluZ0NvbmZpZyk6IG51bWJlciA9PiB7XG4gICAgICAgIGNvbnN0IHR5cGluZ1RpbWUgPSBjYWxjdWxhdGVUeXBpbmdUaW1lKHJlc3BvbnNlVGV4dCwgY29uZmlnKTtcbiAgICAgICAgY29uc3QgdGhpbmtpbmdUaW1lID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGNvbmZpZy5tYXhUaGlua2luZ1RpbWUgLSBjb25maWcubWluVGhpbmtpbmdUaW1lKSArIGNvbmZpZy5taW5UaGlua2luZ1RpbWUpICogMTAwMDtcbiAgICAgICAgcmV0dXJuIHR5cGluZ1RpbWUgKyB0aGlua2luZ1RpbWU7XG4gICAgICB9O1xuICAgICAgXG4gICAgICAvLyBVc2UgdGltaW5nIGNvbmZpZyAoYWxyZWFkeSBsb2FkZWQgZWFybGllcilcbiAgICAgIGNvbnN0IGZpcnN0Q2h1bmtEZWxheSA9IGNhbGN1bGF0ZUZpcnN0TWVzc2FnZURlbGF5KGV2ZW50LnRleHQsIGNodW5rc1swXS50ZXh0LCB0aW1pbmdDb25maWcpO1xuICAgICAgY29uc29sZS5sb2coYOKPse+4jyBGaXJzdCBtZXNzYWdlIGRlbGF5OiAtIFJlYWRpbmcgdGltZTogJHtNYXRoLmZsb29yKChldmVudC50ZXh0Lmxlbmd0aCAvIHRpbWluZ0NvbmZpZy5yZWFkaW5nU3BlZWQpICogMTAwMCl9bXMgKCR7ZXZlbnQudGV4dC5sZW5ndGh9IGNoYXJzIGF0ICR7dGltaW5nQ29uZmlnLnJlYWRpbmdTcGVlZH0gY2hhcnMvc2VjKSAtIFR5cGluZyB0aW1lOiAke2NhbGN1bGF0ZVR5cGluZ1RpbWUoY2h1bmtzWzBdLnRleHQsIHRpbWluZ0NvbmZpZyl9bXMgKCR7Y2h1bmtzWzBdLnRleHQubGVuZ3RofSBjaGFycyBhdCAke3RpbWluZ0NvbmZpZy50eXBpbmdTcGVlZH0gY2hhcnMvc2VjKSAtIEJ1c3kgdGltZTogJHtmaXJzdENodW5rRGVsYXkgLSBNYXRoLmZsb29yKChldmVudC50ZXh0Lmxlbmd0aCAvIHRpbWluZ0NvbmZpZy5yZWFkaW5nU3BlZWQpICogMTAwMCkgLSBjYWxjdWxhdGVUeXBpbmdUaW1lKGNodW5rc1swXS50ZXh0LCB0aW1pbmdDb25maWcpfW1zIChyYW5kb20gJHt0aW1pbmdDb25maWcubWluQnVzeVRpbWV9LSR7dGltaW5nQ29uZmlnLm1heEJ1c3lUaW1lfSBzZWMpIC0gVG90YWwgZGVsYXk6ICR7Zmlyc3RDaHVua0RlbGF5fW1zICgke01hdGguZmxvb3IoZmlyc3RDaHVua0RlbGF5IC8gMTAwMCl9IHNlY29uZHMpYCk7XG4gICAgICBcbiAgICAgIC8vIEVtaXQgY2h1bmtzIHdpdGggcmVhbGlzdGljIGRlbGF5c1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjaHVua3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgY2h1bmsgPSBjaHVua3NbaV07XG4gICAgICAgIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgICAgICAgY29uc3QgZXBvY2hNcyA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IHJhbmRvbVN1ZmZpeCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA5KTtcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkTWVzc2FnZUlkID0gYGFnZW50LSR7ZXBvY2hNc30tJHtyYW5kb21TdWZmaXh9YDtcbiAgICAgICAgY29uc3Qgb3JpZ2luTWV0YWRhdGEgPSBjcmVhdGVPcmlnaW5NZXRhZGF0YShldmVudCwgZ2VuZXJhdGVkTWVzc2FnZUlkKTtcbiAgICAgICAgXG4gICAgICAgIC8vIENhbGN1bGF0ZSBkZWxheVxuICAgICAgICBsZXQgZGVsYXk6IG51bWJlcjtcbiAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICBkZWxheSA9IGZpcnN0Q2h1bmtEZWxheTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4o+x77iPIE1lc3NhZ2UgJHtpICsgMX0vJHtjaHVua3MubGVuZ3RofTogV2FpdGluZyAke01hdGguZmxvb3IoZGVsYXkgLyAxMDAwKX0gc2Vjb25kcy4uLmApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlbGF5ID0gY2FsY3VsYXRlU3Vic2VxdWVudE1lc3NhZ2VEZWxheShjaHVuay50ZXh0LCB0aW1pbmdDb25maWcpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gU3Vic2VxdWVudCBtZXNzYWdlIGRlbGF5OiAtIFR5cGluZyB0aW1lOiAke2NhbGN1bGF0ZVR5cGluZ1RpbWUoY2h1bmsudGV4dCwgdGltaW5nQ29uZmlnKX1tcyAoJHtjaHVuay50ZXh0Lmxlbmd0aH0gY2hhcnMgYXQgJHt0aW1pbmdDb25maWcudHlwaW5nU3BlZWR9IGNoYXJzL3NlYykgLSBUaGlua2luZyB0aW1lOiAke2RlbGF5IC0gY2FsY3VsYXRlVHlwaW5nVGltZShjaHVuay50ZXh0LCB0aW1pbmdDb25maWcpfW1zIChyYW5kb20gJHt0aW1pbmdDb25maWcubWluVGhpbmtpbmdUaW1lfS0ke3RpbWluZ0NvbmZpZy5tYXhUaGlua2luZ1RpbWV9IHNlYykgLSBUb3RhbCBkZWxheTogJHtkZWxheX1tcyAoJHtNYXRoLmZsb29yKGRlbGF5IC8gMTAwMCl9IHNlY29uZHMpYCk7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKPse+4jyBNZXNzYWdlICR7aSArIDF9LyR7Y2h1bmtzLmxlbmd0aH06IFdhaXRpbmcgJHtNYXRoLmZsb29yKGRlbGF5IC8gMTAwMCl9IHNlY29uZHMuLi5gKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gV2FpdCBiZWZvcmUgc2VuZGluZ1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5GkIFVzaW5nIHBlcnNvbmEgbmFtZTogXCIke2V2ZW50LnVzZXJOYW1lfVwiIChwZXJzb25hSWQ6ICR7ZXZlbnQudXNlcklkfSlgKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk6QgU2VuZGluZyBtZXNzYWdlICR7aSArIDF9LyR7Y2h1bmtzLmxlbmd0aH0gd2l0aCB1c2VyTmFtZT1cIiR7ZXZlbnQudXNlck5hbWV9XCI6ICR7Y2h1bmsudGV4dC5zdWJzdHJpbmcoMCwgNTApfS4uLmApO1xuXG4gICAgICAgIGNvbnN0IGNoYXRNZXNzYWdlRXZlbnQgPSB7XG4gICAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxuICAgICAgICAgIGNoYW5uZWxJZDogZXZlbnQuY2hhbm5lbElkLFxuICAgICAgICAgIHVzZXJJZDogZXZlbnQudXNlcklkLCAvLyBQZXJzb25hIElEICh0aGUgYWdlbnQgc2VuZGluZyB0aGUgbWVzc2FnZSlcbiAgICAgICAgICB1c2VyTmFtZTogZXZlbnQudXNlck5hbWUgfHwgJ0FJIEFzc2lzdGFudCcsXG4gICAgICAgICAgdXNlclR5cGU6ICdhZ2VudCcsIC8vIEV4cGxpY2l0bHkgbWFyayB0aGlzIGFzIGFuIGFnZW50IG1lc3NhZ2VcbiAgICAgICAgICBtZXNzYWdlOiBjaHVuay50ZXh0LFxuICAgICAgICAgIG1lc3NhZ2VJZDogZ2VuZXJhdGVkTWVzc2FnZUlkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICBjb25uZWN0aW9uSWQ6IGV2ZW50LmNvbm5lY3Rpb25JZCB8fCBldmVudC5jaGFubmVsX2NvbnRleHQ/LmNoYXQ/LmNvbm5lY3Rpb25JZCxcbiAgICAgICAgICBtZXNzYWdlVHlwZTogJ3RleHQnLFxuICAgICAgICAgIHNlbmRlcklkOiBldmVudC51c2VySWQsIC8vIEZvciByb3V0aW5nLCBzZW5kZXJJZCA9IGFnZW50IChwZXJzb25hIElEKVxuICAgICAgICAgIHNlbmRlclR5cGU6ICdhZ2VudCcsXG4gICAgICAgICAgYWdlbnRJZDogZXZlbnQudXNlcklkLFxuICAgICAgICAgIG9yaWdpbk1hcmtlcjogJ3BlcnNvbmEnLFxuICAgICAgICAgIG1ldGFkYXRhOiBvcmlnaW5NZXRhZGF0YSxcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQ3VzdG9tRXZlbnQoXG4gICAgICAgICAgJ2t4LWV2ZW50LXRyYWNraW5nJyxcbiAgICAgICAgICAnY2hhdC5tZXNzYWdlJyxcbiAgICAgICAgICBjaGF0TWVzc2FnZUV2ZW50XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIE1lc3NhZ2UgJHtpICsgMX0vJHtjaHVua3MubGVuZ3RofSBlbWl0dGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+OiSBBbGwgJHtjaHVua3MubGVuZ3RofSBtZXNzYWdlcyBzZW50IHN1Y2Nlc3NmdWxseSFgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ05vdCBhIGNoYXQgbWVzc2FnZSwgc2tpcHBpbmcgY2hhdC5tZXNzYWdlIGVtaXNzaW9uJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIERldGVybWluZSBwcmVmZXJyZWQgY2hhbm5lbCBhbmQgcm91dGluZ1xuICAgIGNvbnN0IHByZWZlcnJlZENoYW5uZWwgPSBldmVudC5zb3VyY2U7IC8vIFVzZSBvcmlnaW5hdGluZyBjaGFubmVsXG4gICAgXG4gICAgY29uc3Qgcm91dGluZyA9IGFnZW50U2VydmljZS5jcmVhdGVSb3V0aW5nSW5mbyh7XG4gICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZXZlbnQuZW1haWxfbGMsXG4gICAgICB0ZXh0OiBldmVudC50ZXh0LFxuICAgICAgc291cmNlOiBldmVudC5zb3VyY2UsXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGV2ZW50LmNoYW5uZWxfY29udGV4dCxcbiAgICAgIGxlYWRfaWQ6IGV2ZW50LmxlYWRfaWQsXG4gICAgICBjb252ZXJzYXRpb25faWQ6IGV2ZW50LmNvbnZlcnNhdGlvbl9pZCxcbiAgICB9LCBwcmVmZXJyZWRDaGFubmVsKTtcbiAgICBcbiAgICAvLyBFbWl0IGFnZW50LnJlcGx5LmNyZWF0ZWQgZXZlbnQgKGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS90cmFja2luZylcbiAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50UmVwbHkoXG4gICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRSZXBseUV2ZW50KFxuICAgICAgICBldmVudC50ZW5hbnRJZCxcbiAgICAgICAgRHluYW1vREJTZXJ2aWNlLmNyZWF0ZUNvbnRhY3RQSyhldmVudC50ZW5hbnRJZCwgZXZlbnQuZW1haWxfbGMpLFxuICAgICAgICByZXNwb25zZSxcbiAgICAgICAgcHJlZmVycmVkQ2hhbm5lbCBhcyAnc21zJyB8ICdlbWFpbCcgfCAnY2hhdCcgfCAnYXBpJyxcbiAgICAgICAgcm91dGluZyxcbiAgICAgICAge1xuICAgICAgICAgIGNvbnZlcnNhdGlvbklkOiBldmVudC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIG1vZGVsOiBjb25maWcuYmVkcm9ja01vZGVsSWQsXG4gICAgICAgICAgICB0cmlnZ2VyZWRfYnlfbWVzc2FnZTogZXZlbnQubWVzc2FnZV90cyxcbiAgICAgICAgICAgIHJlc3BvbnNlX3RpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICApXG4gICAgKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygnQWdlbnQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0FnZW50IGVycm9yOicsIGVycm9yKTtcbiAgICBcbiAgICAvLyBUcnkgdG8gZW1pdCBlcnJvciBldmVudFxuICAgIHRyeSB7XG4gICAgICBjb25zdCBjb25maWcgPSBsb2FkUnVudGltZUNvbmZpZygpO1xuICAgICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xuICAgICAgXG4gICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXG4gICAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudEVycm9yRXZlbnQoXG4gICAgICAgICAgZXZlbnQudGVuYW50SWQsXG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBhZ2VudCBlcnJvcicsXG4gICAgICAgICAge1xuICAgICAgICAgICAgY29udGFjdFBrOiBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGV2ZW50LnRlbmFudElkLCBldmVudC5lbWFpbF9sYyksXG4gICAgICAgICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgICAgICAgICAgdGV4dF9sZW5ndGg6IGV2ZW50LnRleHQ/Lmxlbmd0aCxcbiAgICAgICAgICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfVxuICAgICAgICApXG4gICAgICApO1xuICAgIH0gY2F0Y2ggKGV2ZW50RXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBlbWl0IGVycm9yIGV2ZW50OicsIGV2ZW50RXJyb3IpO1xuICAgIH1cbiAgICBcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vKipcbiAqIExhbWJkYSBoYW5kbGVyIHRoYXQgcmV0dXJucyBzdHJ1Y3R1cmVkIEpTT04gcmVzcG9uc2Ugd2l0aCBpbnRlbnQgbWV0YWRhdGFcbiAqIFVzZWZ1bCBmb3IgQVBJIEdhdGV3YXkgaW50ZWdyYXRpb25zIG9yIHdoZW4geW91IG5lZWQgZGV0YWlsZWQgcmVzcG9uc2UgZGF0YVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RydWN0dXJlZEhhbmRsZXIoXG4gIGV2ZW50OiBBZ2VudEludm9jYXRpb25FdmVudCxcbiAgY29udGV4dDogQ29udGV4dFxuKTogUHJvbWlzZTxBZ2VudFJlc3BvbnNlPiB7XG4gIGNvbnNvbGUubG9nKCdBZ2VudCByZWNlaXZlZCBldmVudCBmb3Igc3RydWN0dXJlZCByZXNwb25zZTonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICB2YWxpZGF0ZVJ1bnRpbWVDb25maWcoY29uZmlnKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIHNlcnZpY2VzXG4gICAgY29uc3QgZHluYW1vU2VydmljZSA9IG5ldyBEeW5hbW9EQlNlcnZpY2UoY29uZmlnKTtcbiAgICBjb25zdCBldmVudEJyaWRnZVNlcnZpY2UgPSBuZXcgRXZlbnRCcmlkZ2VTZXJ2aWNlKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gQ3JlYXRlIGFnZW50IHNlcnZpY2VcbiAgICBjb25zdCBhZ2VudFNlcnZpY2UgPSBuZXcgQWdlbnRTZXJ2aWNlKHtcbiAgICAgIC4uLmNvbmZpZyxcbiAgICAgIGR5bmFtb1NlcnZpY2UsXG4gICAgICBldmVudEJyaWRnZVNlcnZpY2UsXG4gICAgfSk7XG4gICAgXG4gICAgLy8gUHJvY2VzcyB0aGUgbWVzc2FnZSBhbmQgZ2V0IHN0cnVjdHVyZWQgcmVzcG9uc2VcbiAgICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBtZXNzYWdlIGZvciAke2V2ZW50LnRlbmFudElkfS8ke2V2ZW50LmVtYWlsX2xjfWApO1xuICAgIFxuICAgIGNvbnN0IHN0cnVjdHVyZWRSZXNwb25zZSA9IGF3YWl0IGFnZW50U2VydmljZS5wcm9jZXNzTWVzc2FnZVN0cnVjdHVyZWQoe1xuICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxuICAgICAgZW1haWxfbGM6IGV2ZW50LmVtYWlsX2xjLFxuICAgICAgdGV4dDogZXZlbnQudGV4dCxcbiAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlLFxuICAgICAgY2hhbm5lbF9jb250ZXh0OiBldmVudC5jaGFubmVsX2NvbnRleHQsXG4gICAgICBsZWFkX2lkOiBldmVudC5sZWFkX2lkLFxuICAgICAgY29udmVyc2F0aW9uX2lkOiBldmVudC5jb252ZXJzYXRpb25faWQsXG4gICAgfSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYEdlbmVyYXRlZCBzdHJ1Y3R1cmVkIHJlc3BvbnNlOmAsIHtcbiAgICAgIHN1Y2Nlc3M6IHN0cnVjdHVyZWRSZXNwb25zZS5zdWNjZXNzLFxuICAgICAgbWVzc2FnZUxlbmd0aDogc3RydWN0dXJlZFJlc3BvbnNlLm1lc3NhZ2UubGVuZ3RoLFxuICAgICAgaW50ZW50OiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Py5pZCxcbiAgICAgIGNvbmZpZGVuY2U6IHN0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQ/LmNvbmZpZGVuY2UsXG4gICAgICBwcm9jZXNzaW5nVGltZTogc3RydWN0dXJlZFJlc3BvbnNlLm1ldGFkYXRhLnByb2Nlc3NpbmdUaW1lTXNcbiAgICB9KTtcbiAgICBcbiAgICAvLyBMb2cgaW50ZW50IGRldGVjdGlvbiBpbiByZWQgZm9yIHZpc2liaWxpdHlcbiAgICBpZiAoc3RydWN0dXJlZFJlc3BvbnNlLmludGVudCkge1xuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfjq8gSU5URU5UIERFVEVDVEVEIElOIExBTUJEQTogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LmlkfSAoY29uZmlkZW5jZTogJHsoc3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5jb25maWRlbmNlICogMTAwKS50b0ZpeGVkKDEpfSUpXFx4MWJbMG1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBOYW1lOiAke3N0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQubmFtZX1cXHgxYlswbWApO1xuICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIFByaW9yaXR5OiAke3N0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQucHJpb3JpdHl9XFx4MWJbMG1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBBY3Rpb25zOiAke3N0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQuYWN0aW9ucz8uam9pbignLCAnKSB8fCAnbm9uZSd9XFx4MWJbMG1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gRW1pdCBjaGF0Lm1lc3NhZ2UgZXZlbnQgaWYgdGhpcyBpcyBhIGNoYXQgY29udmVyc2F0aW9uXG4gICAgaWYgKHN0cnVjdHVyZWRSZXNwb25zZS5zdWNjZXNzICYmIGV2ZW50LnNvdXJjZSA9PT0gJ2NoYXQnICYmIGV2ZW50LmNoYW5uZWxJZCAmJiBldmVudC51c2VySWQpIHtcbiAgICAgIGlmIChpc1BlcnNvbmFPcmlnaW4oZXZlbnQpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdTa2lwcGluZyBzdHJ1Y3R1cmVkIGNoYXQubWVzc2FnZSBlbWlzc2lvbiBiZWNhdXNlIHRoaXMgZXZlbnQgb3JpZ2luYXRlZCBmcm9tIHRoZSBhZ2VudC4nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdFbWl0dGluZyBjaGF0Lm1lc3NhZ2UgZXZlbnQgZm9yIHN0cnVjdHVyZWQgYWdlbnQgcmVzcG9uc2UnKTtcblxuICAgICAgICBjb25zdCB0aW1lc3RhbXAgPSBzdHJ1Y3R1cmVkUmVzcG9uc2UubWV0YWRhdGEudGltZXN0YW1wO1xuICAgICAgICBjb25zdCBlcG9jaE1zID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgcmFuZG9tU3VmZml4ID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpO1xuICAgICAgICBjb25zdCBnZW5lcmF0ZWRNZXNzYWdlSWQgPSBgYWdlbnQtJHtlcG9jaE1zfS0ke3JhbmRvbVN1ZmZpeH1gO1xuICAgICAgICBjb25zdCBvcmlnaW5NZXRhZGF0YSA9IGNyZWF0ZU9yaWdpbk1ldGFkYXRhKGV2ZW50LCBnZW5lcmF0ZWRNZXNzYWdlSWQpO1xuXG4gICAgICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQ3VzdG9tRXZlbnQoXG4gICAgICAgICAgJ2t4LWV2ZW50LXRyYWNraW5nJyxcbiAgICAgICAgICAnY2hhdC5tZXNzYWdlJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICAgICAgICBjaGFubmVsSWQ6IGV2ZW50LmNoYW5uZWxJZCxcbiAgICAgICAgICAgIHVzZXJJZDogZXZlbnQudXNlcklkLCAvLyBQZXJzb25hIElEICh0aGUgYWdlbnQpXG4gICAgICAgICAgICB1c2VyTmFtZTogZXZlbnQudXNlck5hbWUgfHwgJ0FJIEFzc2lzdGFudCcsXG4gICAgICAgICAgICB1c2VyVHlwZTogJ2FnZW50JywgLy8gTWFyayBhcyBhZ2VudCBtZXNzYWdlXG4gICAgICAgICAgICBtZXNzYWdlOiBzdHJ1Y3R1cmVkUmVzcG9uc2UubWVzc2FnZSxcbiAgICAgICAgICAgIG1lc3NhZ2VJZDogZ2VuZXJhdGVkTWVzc2FnZUlkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgY29ubmVjdGlvbklkOiBldmVudC5jb25uZWN0aW9uSWQgfHwgZXZlbnQuY2hhbm5lbF9jb250ZXh0Py5jaGF0Py5jb25uZWN0aW9uSWQsIC8vIFVzZSBjb25uZWN0aW9uSWQgZnJvbSBvcmlnaW5hbCBtZXNzYWdlXG4gICAgICAgICAgICBtZXNzYWdlVHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgc2VuZGVySWQ6IGV2ZW50LnVzZXJJZCwgLy8gRm9yIHJvdXRpbmcsIHNlbmRlcklkID0gYWdlbnQgKHBlcnNvbmEgSUQpXG4gICAgICAgICAgICBzZW5kZXJUeXBlOiAnYWdlbnQnLFxuICAgICAgICAgICAgYWdlbnRJZDogZXZlbnQudXNlcklkLFxuICAgICAgICAgICAgb3JpZ2luTWFya2VyOiAncGVyc29uYScsXG4gICAgICAgICAgICBtZXRhZGF0YTogb3JpZ2luTWV0YWRhdGFcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZygnU3RydWN0dXJlZCByZXNwb25zZSBjaGF0Lm1lc3NhZ2UgZXZlbnQgZW1pdHRlZCcpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gc3RydWN0dXJlZFJlc3BvbnNlO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0FnZW50IHByb2Nlc3NpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgIFxuICAgIC8vIFJldHVybiBzdHJ1Y3R1cmVkIGVycm9yIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgbWVzc2FnZTogJ0kgYXBvbG9naXplLCBidXQgSSBlbmNvdW50ZXJlZCBhbiBlcnJvciBwcm9jZXNzaW5nIHlvdXIgbWVzc2FnZS4gUGxlYXNlIHRyeSBhZ2Fpbi4nLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgc2Vzc2lvbklkOiBldmVudC5jb252ZXJzYXRpb25faWQgfHwgJ3Vua25vd24nLFxuICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICAgIHVzZXJJZDogZXZlbnQuZW1haWxfbGMsXG4gICAgICAgIGNoYW5uZWw6IGV2ZW50LnNvdXJjZSxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIHByb2Nlc3NpbmdUaW1lTXM6IDBcbiAgICAgIH0sXG4gICAgICBlcnJvcjoge1xuICAgICAgICBjb2RlOiAnSEFORExFUl9FUlJPUicsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgICBkZXRhaWxzOiBlcnJvclxuICAgICAgfVxuICAgIH07XG4gIH1cbn1cbiJdfQ==