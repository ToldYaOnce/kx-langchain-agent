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
    readingSpeed: 100, // Fast reading speed (chars/sec)
    typingSpeed: 12, // Faster typing speed (chars/sec)
    minBusyTime: 0.1, // Minimum "busy" time before first response - very quick
    maxBusyTime: 0.5, // Maximum "busy" time before first response - fast initial response
    minThinkingTime: 0.3, // Min pause between messages - quick typing between chunks
    maxThinkingTime: 0.8, // Max pause between messages - shorter pauses
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
        // 📨 Emit chat.received - message has arrived
        await eventBridgeService.publishCustomEvent('kxgen.agent', 'chat.received', {
            channelId: event.channelId,
            tenantId: event.tenantId,
            personaId: event.userId,
            timestamp: new Date().toISOString()
        });
        // Load company info and persona from DynamoDB
        let companyInfo = undefined;
        let personaConfig = undefined;
        let timingConfig = DEFAULT_TIMING;
        let channelStateService = undefined; // For message interruption detection
        if (event.tenantId) {
            try {
                console.log(`🏢 Loading company info for tenant: ${event.tenantId}`);
                const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                const { DynamoDBDocumentClient, GetCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
                const { ChannelStateService } = await Promise.resolve().then(() => __importStar(require('../lib/channel-state-service.js')));
                const client = new DynamoDBClient({});
                const docClient = DynamoDBDocumentClient.from(client, {
                    marshallOptions: {
                        removeUndefinedValues: true,
                    },
                });
                // Initialize channel state service for message interruption detection
                channelStateService = new ChannelStateService(docClient, process.env.WORKFLOW_STATE_TABLE || 'KxGen-agent-workflow-state');
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
        // Generate unique message ID for interruption detection
        const inboundMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        console.log(`📨 Processing message ${inboundMessageId} for ${event.tenantId}/${event.email_lc}`);
        // Update channel state with this message ID BEFORE processing
        // This allows us to detect if user sent another message while we're processing
        if (event.channelId && channelStateService) {
            await channelStateService.updateLastProcessedMessageId(event.channelId, inboundMessageId, event.tenantId);
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
            const calculateFirstMessageDelay = (originalText, chunkText, config) => {
                const readingTime = Math.floor((originalText.length / config.readingSpeed) * 1000);
                const typingTime = calculateTypingTime(chunkText, config);
                const busyTime = Math.floor(Math.random() * (config.maxBusyTime - config.minBusyTime) + config.minBusyTime) * 1000;
                return readingTime + typingTime + busyTime;
            };
            const calculateSubsequentMessageDelay = (chunkText, config) => {
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
                    currentChunk: i + 1, // 1-indexed
                    totalChunks: chunks.length + (followUpQuestion ? 1 : 0), // Include follow-up in count
                };
                await eventBridgeService.publishCustomEvent('kx-event-tracking', 'chat.message', chatMessageEvent);
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
                await eventBridgeService.publishCustomEvent('kx-event-tracking', 'chat.message', followUpEvent);
                console.log(`✅ Follow-up question sent successfully!`);
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaGFuZGxlcnMvYWdlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF5RUEsMEJBd2RDO0FBTUQsOENBa0hDO0FBeHBCRCxvREFBcUQ7QUFDckQsMERBQTJEO0FBQzNELDhDQUErQztBQUMvQyxnREFBNEU7QUFlNUUsTUFBTSxjQUFjLEdBQWlCO0lBQ25DLFlBQVksRUFBRSxHQUFHLEVBQUUsaUNBQWlDO0lBQ3BELFdBQVcsRUFBRSxFQUFFLEVBQUUsa0NBQWtDO0lBQ25ELFdBQVcsRUFBRSxHQUFHLEVBQUUseURBQXlEO0lBQzNFLFdBQVcsRUFBRSxHQUFHLEVBQUUsb0VBQW9FO0lBQ3RGLGVBQWUsRUFBRSxHQUFHLEVBQUUsMkRBQTJEO0lBQ2pGLGVBQWUsRUFBRSxHQUFHLEVBQUUsOENBQThDO0NBQ3JFLENBQUM7QUF1QkYsU0FBUyxlQUFlLENBQUMsS0FBMkI7SUFDbEQsSUFBSSxLQUFLLENBQUMsWUFBWSxLQUFLLFNBQVM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUNsRCxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssT0FBTztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzlDLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxPQUFPO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDNUMsSUFBSSxLQUFLLENBQUMsZ0JBQWdCLEtBQUssSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ2pELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxZQUFZLEtBQUssU0FBUztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzVELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxnQkFBZ0IsS0FBSyxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDM0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxLQUEy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Q0wsSUFBSSxFQUFFLGVBQWU7Z0JBQ3JCLE9BQU8sRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlO2dCQUNqRSxPQUFPLEVBQUUsS0FBSzthQUNmO1NBQ0YsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuLi9saWIvZHluYW1vZGIuanMnO1xuaW1wb3J0IHsgRXZlbnRCcmlkZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vbGliL2V2ZW50YnJpZGdlLmpzJztcbmltcG9ydCB7IEFnZW50U2VydmljZSB9IGZyb20gJy4uL2xpYi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBsb2FkUnVudGltZUNvbmZpZywgdmFsaWRhdGVSdW50aW1lQ29uZmlnIH0gZnJvbSAnLi4vbGliL2NvbmZpZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50Q29udGV4dCwgQWdlbnRSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuLyoqXG4gKiBUaW1pbmcgY29uZmlndXJhdGlvbiBmb3IgcmVhbGlzdGljIGFnZW50IHJlc3BvbnNlIGRlbGF5c1xuICovXG5pbnRlcmZhY2UgVGltaW5nQ29uZmlnIHtcbiAgcmVhZGluZ1NwZWVkOiBudW1iZXI7IC8vIGNoYXJzIHBlciBzZWNvbmRcbiAgdHlwaW5nU3BlZWQ6IG51bWJlcjsgLy8gY2hhcnMgcGVyIHNlY29uZFxuICBtaW5CdXN5VGltZTogbnVtYmVyOyAvLyBzZWNvbmRzXG4gIG1heEJ1c3lUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcbiAgbWluVGhpbmtpbmdUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcbiAgbWF4VGhpbmtpbmdUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcbn1cblxuY29uc3QgREVGQVVMVF9USU1JTkc6IFRpbWluZ0NvbmZpZyA9IHtcbiAgcmVhZGluZ1NwZWVkOiAxMDAsIC8vIEZhc3QgcmVhZGluZyBzcGVlZCAoY2hhcnMvc2VjKVxuICB0eXBpbmdTcGVlZDogMTIsIC8vIEZhc3RlciB0eXBpbmcgc3BlZWQgKGNoYXJzL3NlYylcbiAgbWluQnVzeVRpbWU6IDAuMSwgLy8gTWluaW11bSBcImJ1c3lcIiB0aW1lIGJlZm9yZSBmaXJzdCByZXNwb25zZSAtIHZlcnkgcXVpY2tcbiAgbWF4QnVzeVRpbWU6IDAuNSwgLy8gTWF4aW11bSBcImJ1c3lcIiB0aW1lIGJlZm9yZSBmaXJzdCByZXNwb25zZSAtIGZhc3QgaW5pdGlhbCByZXNwb25zZVxuICBtaW5UaGlua2luZ1RpbWU6IDAuMywgLy8gTWluIHBhdXNlIGJldHdlZW4gbWVzc2FnZXMgLSBxdWljayB0eXBpbmcgYmV0d2VlbiBjaHVua3NcbiAgbWF4VGhpbmtpbmdUaW1lOiAwLjgsIC8vIE1heCBwYXVzZSBiZXR3ZWVuIG1lc3NhZ2VzIC0gc2hvcnRlciBwYXVzZXNcbn07XG5cbi8qKlxuICogQWdlbnQgaW52b2NhdGlvbiBjb250ZXh0IChpbnRlcm5hbCBldmVudCBmcm9tIHJvdXRlcilcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBZ2VudEludm9jYXRpb25FdmVudCBleHRlbmRzIEFnZW50Q29udGV4dCB7XG4gIG1lc3NhZ2VfdHM6IHN0cmluZzsgLy8gVGltZXN0YW1wIG9mIHRoZSBtZXNzYWdlIHRoYXQgdHJpZ2dlcmVkIHRoaXNcbiAgbWV0YWRhdGE/OiB7XG4gICAgb3JpZ2luTWFya2VyPzogc3RyaW5nO1xuICAgIGFnZW50SWQ/OiBzdHJpbmc7XG4gICAgb3JpZ2luYWxNZXNzYWdlSWQ/OiBzdHJpbmc7XG4gICAgc2VuZGVyVHlwZT86IHN0cmluZztcbiAgICB1c2VyVHlwZT86IHN0cmluZztcbiAgICAvLyBMZWdhY3kgc3VwcG9ydFxuICAgIGlzQWdlbnRHZW5lcmF0ZWQ/OiBib29sZWFuO1xuICB9O1xuICBzZW5kZXJUeXBlPzogc3RyaW5nO1xuICB1c2VyVHlwZT86IHN0cmluZztcbiAgb3JpZ2luTWFya2VyPzogc3RyaW5nO1xuICAvLyBMZWdhY3kgc3VwcG9ydFxuICBpc0FnZW50R2VuZXJhdGVkPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gaXNQZXJzb25hT3JpZ2luKGV2ZW50OiBBZ2VudEludm9jYXRpb25FdmVudCk6IGJvb2xlYW4ge1xuICBpZiAoZXZlbnQub3JpZ2luTWFya2VyID09PSAncGVyc29uYScpIHJldHVybiB0cnVlO1xuICBpZiAoZXZlbnQuc2VuZGVyVHlwZSA9PT0gJ2FnZW50JykgcmV0dXJuIHRydWU7XG4gIGlmIChldmVudC51c2VyVHlwZSA9PT0gJ2FnZW50JykgcmV0dXJuIHRydWU7XG4gIGlmIChldmVudC5pc0FnZW50R2VuZXJhdGVkID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGV2ZW50Lm1ldGFkYXRhPy5vcmlnaW5NYXJrZXIgPT09ICdwZXJzb25hJykgcmV0dXJuIHRydWU7XG4gIGlmIChldmVudC5tZXRhZGF0YT8uaXNBZ2VudEdlbmVyYXRlZCA9PT0gdHJ1ZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlT3JpZ2luTWV0YWRhdGEoZXZlbnQ6IEFnZW50SW52b2NhdGlvbkV2ZW50LCBnZW5lcmF0ZWRNZXNzYWdlSWQ6IHN0cmluZykge1xuICByZXR1cm4ge1xuICAgIG9yaWdpbk1hcmtlcjogJ3BlcnNvbmEnLFxuICAgIGFnZW50SWQ6IGV2ZW50LnVzZXJJZCxcbiAgICBvcmlnaW5hbE1lc3NhZ2VJZDogZXZlbnQubWV0YWRhdGE/Lm9yaWdpbmFsTWVzc2FnZUlkIHx8IGdlbmVyYXRlZE1lc3NhZ2VJZCxcbiAgICBzZW5kZXJUeXBlOiAnYWdlbnQnLFxuICAgIHJlY2lwaWVudElkOiBldmVudC5zZW5kZXJJZCxcbiAgfTtcbn1cblxuLyoqXG4gKiBMYW1iZGEgaGFuZGxlciBmb3IgcHJvY2Vzc2luZyBhZ2VudCByZXNwb25zZXNcbiAqIEludm9rZWQgYnkgQWdlbnRSb3V0ZXJGbiB3aXRoIHByb2Nlc3NlZCBjb250ZXh0XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKFxuICBldmVudDogQWdlbnRJbnZvY2F0aW9uRXZlbnQsXG4gIGNvbnRleHQ6IENvbnRleHRcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zb2xlLmxvZygnQWdlbnQgcmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gTG9hZCBhbmQgdmFsaWRhdGUgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGNvbmZpZyA9IGxvYWRSdW50aW1lQ29uZmlnKCk7XG4gICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBzZXJ2aWNlc1xuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSBuZXcgRHluYW1vREJTZXJ2aWNlKGNvbmZpZyk7XG4gICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xuICAgIFxuICAgIC8vIPCfk6ggRW1pdCBjaGF0LnJlY2VpdmVkIC0gbWVzc2FnZSBoYXMgYXJyaXZlZFxuICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQ3VzdG9tRXZlbnQoXG4gICAgICAna3hnZW4uYWdlbnQnLFxuICAgICAgJ2NoYXQucmVjZWl2ZWQnLFxuICAgICAge1xuICAgICAgICBjaGFubmVsSWQ6IGV2ZW50LmNoYW5uZWxJZCxcbiAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxuICAgICAgICBwZXJzb25hSWQ6IGV2ZW50LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICAgIH1cbiAgICApO1xuICAgIFxuICAgIC8vIExvYWQgY29tcGFueSBpbmZvIGFuZCBwZXJzb25hIGZyb20gRHluYW1vREJcbiAgICBsZXQgY29tcGFueUluZm86IGFueSA9IHVuZGVmaW5lZDtcbiAgICBsZXQgcGVyc29uYUNvbmZpZzogYW55ID0gdW5kZWZpbmVkO1xuICAgIGxldCB0aW1pbmdDb25maWc6IFRpbWluZ0NvbmZpZyA9IERFRkFVTFRfVElNSU5HO1xuICAgIGxldCBjaGFubmVsU3RhdGVTZXJ2aWNlOiBhbnkgPSB1bmRlZmluZWQ7IC8vIEZvciBtZXNzYWdlIGludGVycnVwdGlvbiBkZXRlY3Rpb25cbiAgICBcbiAgICBpZiAoZXZlbnQudGVuYW50SWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn4+iIExvYWRpbmcgY29tcGFueSBpbmZvIGZvciB0ZW5hbnQ6ICR7ZXZlbnQudGVuYW50SWR9YCk7XG4gICAgICAgIGNvbnN0IHsgRHluYW1vREJDbGllbnQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyk7XG4gICAgICAgIGNvbnN0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCB9ID0gYXdhaXQgaW1wb3J0KCdAYXdzLXNkay9saWItZHluYW1vZGInKTtcbiAgICAgICAgY29uc3QgeyBDaGFubmVsU3RhdGVTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4uL2xpYi9jaGFubmVsLXN0YXRlLXNlcnZpY2UuanMnKTtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbiAgICAgICAgY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCwge1xuICAgICAgICAgIG1hcnNoYWxsT3B0aW9uczoge1xuICAgICAgICAgICAgcmVtb3ZlVW5kZWZpbmVkVmFsdWVzOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBjaGFubmVsIHN0YXRlIHNlcnZpY2UgZm9yIG1lc3NhZ2UgaW50ZXJydXB0aW9uIGRldGVjdGlvblxuICAgICAgICBjaGFubmVsU3RhdGVTZXJ2aWNlID0gbmV3IENoYW5uZWxTdGF0ZVNlcnZpY2UoXG4gICAgICAgICAgZG9jQ2xpZW50LFxuICAgICAgICAgIHByb2Nlc3MuZW52LldPUktGTE9XX1NUQVRFX1RBQkxFIHx8ICdLeEdlbi1hZ2VudC13b3JrZmxvdy1zdGF0ZSdcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBMb2FkIGNvbXBhbnkgaW5mbyBmcm9tIERlbGF5ZWRSZXBsaWVzLWNvbXBhbnlfaW5mbyB0YWJsZVxuICAgICAgICBjb25zdCBjb21wYW55SW5mb1RhYmxlID0gcHJvY2Vzcy5lbnYuQ09NUEFOWV9JTkZPX1RBQkxFIHx8ICdEZWxheWVkUmVwbGllcy1jb21wYW55X2luZm8nO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+PoiBRdWVyeWluZyBjb21wYW55IGluZm8gdGFibGU6ICR7Y29tcGFueUluZm9UYWJsZX0gZm9yIHRlbmFudElkOiAke2V2ZW50LnRlbmFudElkfWApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY29tcGFueVJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICBUYWJsZU5hbWU6IGNvbXBhbnlJbmZvVGFibGUsXG4gICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWRcbiAgICAgICAgICB9XG4gICAgICAgIH0pKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn4+iIENvbXBhbnkgaW5mbyBxdWVyeSByZXN1bHQ6IEl0ZW0gZm91bmQgPSAkeyEhY29tcGFueVJlc3VsdC5JdGVtfWApO1xuXG4gICAgICAgIGlmIChjb21wYW55UmVzdWx0Lkl0ZW0pIHtcbiAgICAgICAgICBjb21wYW55SW5mbyA9IHtcbiAgICAgICAgICAgIC8vIENvcmUgaWRlbnRpdHlcbiAgICAgICAgICAgIG5hbWU6IGNvbXBhbnlSZXN1bHQuSXRlbS5jb21wYW55TmFtZSB8fCBjb21wYW55UmVzdWx0Lkl0ZW0ubmFtZSxcbiAgICAgICAgICAgIGluZHVzdHJ5OiBjb21wYW55UmVzdWx0Lkl0ZW0uaW5kdXN0cnksXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogY29tcGFueVJlc3VsdC5JdGVtLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDb250YWN0IGluZm9cbiAgICAgICAgICAgIHBob25lOiBjb21wYW55UmVzdWx0Lkl0ZW0ucGhvbmUsXG4gICAgICAgICAgICBlbWFpbDogY29tcGFueVJlc3VsdC5JdGVtLmVtYWlsLFxuICAgICAgICAgICAgd2Vic2l0ZTogY29tcGFueVJlc3VsdC5JdGVtLndlYnNpdGUsXG4gICAgICAgICAgICBhZGRyZXNzOiBjb21wYW55UmVzdWx0Lkl0ZW0uYWRkcmVzcyxcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQnVzaW5lc3MgZGV0YWlsc1xuICAgICAgICAgICAgYnVzaW5lc3NIb3VyczogY29tcGFueVJlc3VsdC5JdGVtLmJ1c2luZXNzSG91cnMsXG4gICAgICAgICAgICBzZXJ2aWNlczogY29tcGFueVJlc3VsdC5JdGVtLnNlcnZpY2VzLFxuICAgICAgICAgICAgcHJvZHVjdHM6IGNvbXBhbnlSZXN1bHQuSXRlbS5wcm9kdWN0cyxcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gTWFya2V0aW5nXG4gICAgICAgICAgICBiZW5lZml0czogY29tcGFueVJlc3VsdC5JdGVtLmJlbmVmaXRzLFxuICAgICAgICAgICAgdGFyZ2V0Q3VzdG9tZXJzOiBjb21wYW55UmVzdWx0Lkl0ZW0udGFyZ2V0Q3VzdG9tZXJzLFxuICAgICAgICAgICAgZGlmZmVyZW50aWF0b3JzOiBjb21wYW55UmVzdWx0Lkl0ZW0uZGlmZmVyZW50aWF0b3JzLFxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDb25maWd1cmF0aW9uXG4gICAgICAgICAgICBnb2FsQ29uZmlndXJhdGlvbjogY29tcGFueVJlc3VsdC5JdGVtLmdvYWxDb25maWd1cmF0aW9uLFxuICAgICAgICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBjb21wYW55UmVzdWx0Lkl0ZW0ucmVzcG9uc2VHdWlkZWxpbmVzLFxuICAgICAgICAgICAgY29udGFjdFJlcXVpcmVtZW50czogY29tcGFueVJlc3VsdC5JdGVtLmNvbnRhY3RSZXF1aXJlbWVudHMsXG4gICAgICAgICAgfTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIExvYWRlZCBjb21wYW55IGluZm86ICR7Y29tcGFueUluZm8ubmFtZX0gKCR7Y29tcGFueUluZm8uaW5kdXN0cnl9KWApO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIExvZyBpZiBjb21wYW55LWxldmVsIGdvYWxzIGFyZSBjb25maWd1cmVkXG4gICAgICAgICAgaWYgKGNvbXBhbnlJbmZvLmdvYWxDb25maWd1cmF0aW9uPy5lbmFibGVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBDb21wYW55LWxldmVsIGdvYWxzIGVuYWJsZWQ6ICR7Y29tcGFueUluZm8uZ29hbENvbmZpZ3VyYXRpb24uZ29hbHM/Lmxlbmd0aCB8fCAwfSBnb2FscyBjb25maWd1cmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gY29tcGFueSBpbmZvIGZvdW5kIGZvciB0ZW5hbnQgJHtldmVudC50ZW5hbnRJZH0sIHVzaW5nIGRlZmF1bHRzYCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExvYWQgdGltaW5nIGNvbmZpZyBmcm9tIGNvbXBhbnkgaW5mbyBvciB1c2UgZGVmYXVsdHNcbiAgICAgICAgY29uc3QgYWdlbnRUaW1pbmcgPSBjb21wYW55UmVzdWx0Lkl0ZW0/LmFnZW50VGltaW5nO1xuICAgICAgICB0aW1pbmdDb25maWcgPSBhZ2VudFRpbWluZyA/IHtcbiAgICAgICAgICByZWFkaW5nU3BlZWQ6IGFnZW50VGltaW5nLnJlYWRpbmdTcGVlZCB8fCBERUZBVUxUX1RJTUlORy5yZWFkaW5nU3BlZWQsXG4gICAgICAgICAgdHlwaW5nU3BlZWQ6IGFnZW50VGltaW5nLnR5cGluZ1NwZWVkIHx8IERFRkFVTFRfVElNSU5HLnR5cGluZ1NwZWVkLFxuICAgICAgICAgIG1pbkJ1c3lUaW1lOiBhZ2VudFRpbWluZy5taW5CdXN5VGltZSB8fCBERUZBVUxUX1RJTUlORy5taW5CdXN5VGltZSxcbiAgICAgICAgICBtYXhCdXN5VGltZTogYWdlbnRUaW1pbmcubWF4QnVzeVRpbWUgfHwgREVGQVVMVF9USU1JTkcubWF4QnVzeVRpbWUsXG4gICAgICAgICAgbWluVGhpbmtpbmdUaW1lOiBhZ2VudFRpbWluZy5taW5UaGlua2luZ1RpbWUgfHwgREVGQVVMVF9USU1JTkcubWluVGhpbmtpbmdUaW1lLFxuICAgICAgICAgIG1heFRoaW5raW5nVGltZTogYWdlbnRUaW1pbmcubWF4VGhpbmtpbmdUaW1lIHx8IERFRkFVTFRfVElNSU5HLm1heFRoaW5raW5nVGltZSxcbiAgICAgICAgfSA6IERFRkFVTFRfVElNSU5HO1xuICAgICAgICBcbiAgICAgICAgaWYgKGFnZW50VGltaW5nKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKPse+4jyBVc2luZyBjdXN0b20gdGltaW5nIGNvbmZpZyBmcm9tIGNvbXBhbnkgaW5mb2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gVXNpbmcgZGVmYXVsdCB0aW1pbmcgY29uZmlnYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb2FkIHBlcnNvbmEgZnJvbSBEZWxheWVkUmVwbGllcy1wZXJzb25hcyB0YWJsZVxuICAgICAgICBpZiAoZXZlbnQudXNlcklkKSB7IC8vIHVzZXJJZCBpcyB0aGUgcGVyc29uYUlkIGZyb20gcm91dGVyXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkaQgTG9hZGluZyBwZXJzb25hIGZvciB0ZW5hbnQ6ICR7ZXZlbnQudGVuYW50SWR9LCBwZXJzb25hSWQ6ICR7ZXZlbnQudXNlcklkfWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5GkIFBFUlNPTkFTX1RBQkxFIGVudiB2YXI6ICR7cHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEV9YCk7XG4gICAgICAgICAgY29uc3QgcGVyc29uYVJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUEVSU09OQVNfVEFCTEUgfHwgJ0RlbGF5ZWRSZXBsaWVzLXBlcnNvbmFzJyxcbiAgICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICAgICAgICAgIHBlcnNvbmFJZDogZXZlbnQudXNlcklkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkaQgUGVyc29uYSBxdWVyeSByZXN1bHQ6ICR7SlNPTi5zdHJpbmdpZnkocGVyc29uYVJlc3VsdCl9YCk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHBlcnNvbmFSZXN1bHQuSXRlbSkge1xuICAgICAgICAgICAgcGVyc29uYUNvbmZpZyA9IHBlcnNvbmFSZXN1bHQuSXRlbTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTG9hZGVkIHBlcnNvbmEgZnJvbSBEeW5hbW9EQjogJHtwZXJzb25hQ29uZmlnLm5hbWV9ICgke3BlcnNvbmFDb25maWcucGVyc29uYUlkfSlgKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgUGVyc29uYSBzeXN0ZW1Qcm9tcHQgcHJldmlldzogJHtwZXJzb25hQ29uZmlnLnN5c3RlbVByb21wdD8uc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gTm8gcGVyc29uYSBmb3VuZCBmb3IgJHtldmVudC50ZW5hbnRJZH0vJHtldmVudC51c2VySWR9LCB3aWxsIHVzZSBmYWxsYmFja2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGxvYWRpbmcgY29tcGFueSBpbmZvL3BlcnNvbmE6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBDcmVhdGUgYWdlbnQgc2VydmljZSB3aXRoIGNvbXBhbnkgaW5mbyBhbmQgcGVyc29uYVxuICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2Uoe1xuICAgICAgLi4uY29uZmlnLFxuICAgICAgZHluYW1vU2VydmljZSxcbiAgICAgIGV2ZW50QnJpZGdlU2VydmljZSxcbiAgICAgIGNvbXBhbnlJbmZvLFxuICAgICAgcGVyc29uYUlkOiBldmVudC51c2VySWQsIC8vIFBhc3MgcGVyc29uYUlkXG4gICAgICBwZXJzb25hOiBwZXJzb25hQ29uZmlnLCAvLyBQYXNzIHByZS1sb2FkZWQgcGVyc29uYSBmcm9tIER5bmFtb0RCXG4gICAgfSk7XG4gICAgXG4gICAgLy8gR2VuZXJhdGUgdW5pcXVlIG1lc3NhZ2UgSUQgZm9yIGludGVycnVwdGlvbiBkZXRlY3Rpb25cbiAgICBjb25zdCBpbmJvdW5kTWVzc2FnZUlkID0gYG1zZ18ke0RhdGUubm93KCl9XyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDcpfWA7XG4gICAgY29uc29sZS5sb2coYPCfk6ggUHJvY2Vzc2luZyBtZXNzYWdlICR7aW5ib3VuZE1lc3NhZ2VJZH0gZm9yICR7ZXZlbnQudGVuYW50SWR9LyR7ZXZlbnQuZW1haWxfbGN9YCk7XG4gICAgXG4gICAgLy8gVXBkYXRlIGNoYW5uZWwgc3RhdGUgd2l0aCB0aGlzIG1lc3NhZ2UgSUQgQkVGT1JFIHByb2Nlc3NpbmdcbiAgICAvLyBUaGlzIGFsbG93cyB1cyB0byBkZXRlY3QgaWYgdXNlciBzZW50IGFub3RoZXIgbWVzc2FnZSB3aGlsZSB3ZSdyZSBwcm9jZXNzaW5nXG4gICAgaWYgKGV2ZW50LmNoYW5uZWxJZCAmJiBjaGFubmVsU3RhdGVTZXJ2aWNlKSB7XG4gICAgICBhd2FpdCBjaGFubmVsU3RhdGVTZXJ2aWNlLnVwZGF0ZUxhc3RQcm9jZXNzZWRNZXNzYWdlSWQoXG4gICAgICAgIGV2ZW50LmNoYW5uZWxJZCxcbiAgICAgICAgaW5ib3VuZE1lc3NhZ2VJZCxcbiAgICAgICAgZXZlbnQudGVuYW50SWRcbiAgICAgICk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50U2VydmljZS5wcm9jZXNzTWVzc2FnZSh7XG4gICAgICB0ZW5hbnRJZDogZXZlbnQudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogZXZlbnQuZW1haWxfbGMsXG4gICAgICB0ZXh0OiBldmVudC50ZXh0LFxuICAgICAgc291cmNlOiBldmVudC5zb3VyY2UsXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGV2ZW50LmNoYW5uZWxfY29udGV4dCxcbiAgICAgIGxlYWRfaWQ6IGV2ZW50LmxlYWRfaWQsXG4gICAgICBjb252ZXJzYXRpb25faWQ6IGV2ZW50LmNvbnZlcnNhdGlvbl9pZCxcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCByZXNwb25zZSA9IHJlc3VsdC5yZXNwb25zZTtcbiAgICBjb25zdCBmb2xsb3dVcFF1ZXN0aW9uID0gcmVzdWx0LmZvbGxvd1VwUXVlc3Rpb247XG4gICAgXG4gICAgY29uc29sZS5sb2coYEdlbmVyYXRlZCByZXNwb25zZTogJHtyZXNwb25zZS5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcbiAgICBpZiAoZm9sbG93VXBRdWVzdGlvbikge1xuICAgICAgY29uc29sZS5sb2coYPCfkqwgRm9sbG93LXVwIHF1ZXN0aW9uOiAke2ZvbGxvd1VwUXVlc3Rpb259YCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEVtaXQgY2hhdC5tZXNzYWdlIGV2ZW50IGZvciB0aGUgYWdlbnQncyByZXNwb25zZVxuICAgIC8vIFRoaXMgd2lsbCBiZSBwaWNrZWQgdXAgYnkgdGhlIG1lc3NhZ2luZyBzZXJ2aWNlIGZvciBwZXJzaXN0ZW5jZSBhbmQgZGVsaXZlcnlcbiAgICBpZiAoZXZlbnQuc291cmNlID09PSAnY2hhdCcgJiYgZXZlbnQuY2hhbm5lbElkICYmIGV2ZW50LnVzZXJJZCkge1xuICAgICAgaWYgKGlzUGVyc29uYU9yaWdpbihldmVudCkpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1NraXBwaW5nIGNoYXQubWVzc2FnZSBlbWlzc2lvbiBiZWNhdXNlIHRoaXMgZXZlbnQgb3JpZ2luYXRlZCBmcm9tIHRoZSBhZ2VudC4nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSAgICAgIFxuICAgICAgY29uc29sZS5sb2coJ0VtaXR0aW5nIG11bHRpLXBhcnQgY2hhdC5tZXNzYWdlIGV2ZW50cyBmb3IgYWdlbnQgcmVzcG9uc2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5GkIEFnZW50IGlkZW50aXR5OiBwZXJzb25hSWQ9JHtldmVudC51c2VySWR9LCBwZXJzb25hTmFtZT1cIiR7ZXZlbnQudXNlck5hbWV9XCIsIHNlbmRlcklkPSR7ZXZlbnQudXNlcklkfWApO1xuICAgICAgXG4gICAgICAvLyBJbXBvcnQgY2h1bmtpbmcgdXRpbGl0aWVzXG4gICAgICBjb25zdCB7IFJlc3BvbnNlQ2h1bmtlciB9ID0gYXdhaXQgaW1wb3J0KCcuLi9saWIvcmVzcG9uc2UtY2h1bmtlci5qcycpO1xuICAgICAgXG4gICAgICAvLyBVc2UgcGVyc29uYSdzIHJlc3BvbnNlQ2h1bmtpbmcgY29uZmlnIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGJ1aWxkIHZlcmJvc2l0eS1hd2FyZSBkZWZhdWx0c1xuICAgICAgbGV0IGNodW5raW5nQ29uZmlnOiBhbnk7XG4gICAgICBcbiAgICAgIGlmIChwZXJzb25hQ29uZmlnPy5yZXNwb25zZUNodW5raW5nPy5ydWxlcz8uY2hhdCkge1xuICAgICAgICAvLyBVc2UgcGVyc29uYSdzIGV4cGxpY2l0IGNodW5raW5nIGNvbmZpZ3VyYXRpb24gKG9ubHkgaWYgaXQgaGFzIHZhbGlkIHJ1bGVzKVxuICAgICAgICBjaHVua2luZ0NvbmZpZyA9IHBlcnNvbmFDb25maWcucmVzcG9uc2VDaHVua2luZztcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk48gVXNpbmcgcGVyc29uYS1kZWZpbmVkIGNodW5raW5nIGNvbmZpZycpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk48gUGVyc29uYSBjaHVua2luZyBjb25maWcgbWlzc2luZyBvciBpbnZhbGlkLCBidWlsZGluZyB2ZXJib3NpdHktYXdhcmUgZGVmYXVsdHMnKTtcbiAgICAgICAgLy8gQnVpbGQgdmVyYm9zaXR5LWF3YXJlIGRlZmF1bHRzIGJhc2VkIG9uIHBlcnNvbmFsaXR5IHRyYWl0c1xuICAgICAgICBjb25zdCB2ZXJib3NpdHkgPSAocGVyc29uYUNvbmZpZyBhcyBhbnkpPy5wZXJzb25hbGl0eVRyYWl0cz8udmVyYm9zaXR5IHx8IDU7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OPIEJ1aWxkaW5nIHZlcmJvc2l0eS1hd2FyZSBjaHVua2luZyBjb25maWcgKHZlcmJvc2l0eTogJHt2ZXJib3NpdHl9KWApO1xuICAgICAgICBcbiAgICAgICAgLy8gQUxXQVlTIGNodW5rIGJ5IHNlbnRlbmNlICgxIHNlbnRlbmNlIHBlciBtZXNzYWdlKSBmb3IgY2hhdFxuICAgICAgICAvLyBWZXJib3NpdHkgY29udHJvbHMgSE9XIE1BTlkgc2VudGVuY2VzIHRvdGFsLCBub3QgY2h1bmsgc2l6ZVxuICAgICAgICAvLyBGb3IgdmVyeSBsb3cgdmVyYm9zaXR5ICgxLTIpLCBkaXNhYmxlIGNodW5raW5nIC0gdGhleSdsbCBvbmx5IGdlbmVyYXRlIDEgc2VudGVuY2VcbiAgICAgICAgLy8gRm9yIHZlcmJvc2l0eSAzKywgZW5hYmxlIHNlbnRlbmNlLWxldmVsIGNodW5raW5nXG4gICAgICAgIGlmICh2ZXJib3NpdHkgPD0gMikge1xuICAgICAgICAgIGNodW5raW5nQ29uZmlnID0ge1xuICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsIC8vIERpc2FibGUgY2h1bmtpbmcgZm9yIFZFUlkgbG93IHZlcmJvc2l0eSAoMSBzZW50ZW5jZSB0b3RhbClcbiAgICAgICAgICAgIHJ1bGVzOiB7XG4gICAgICAgICAgICAgIGNoYXQ6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgICAgICAgc21zOiB7IGNodW5rQnk6ICdub25lJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAtMSwgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwIH0sXG4gICAgICAgICAgICAgIGVtYWlsOiB7IGNodW5rQnk6ICdub25lJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAtMSwgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwIH0sXG4gICAgICAgICAgICAgIGFwaTogeyBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsIG1heExlbmd0aDogLTEsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9LFxuICAgICAgICAgICAgICBhZ2VudDogeyBjaHVua0J5OiAnbm9uZScgYXMgY29uc3QsIG1heExlbmd0aDogLTEsIGRlbGF5QmV0d2VlbkNodW5rczogMCB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBGb3IgdmVyYm9zaXR5IDMrLCBjaHVuayBpbnRvIDEgc2VudGVuY2UgcGVyIG1lc3NhZ2VcbiAgICAgICAgICBjaHVua2luZ0NvbmZpZyA9IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBydWxlczoge1xuICAgICAgICAgICAgICBjaGF0OiB7IGNodW5rQnk6ICdzZW50ZW5jZScgYXMgY29uc3QsIG1heExlbmd0aDogMTIwLCBkZWxheUJldHdlZW5DaHVua3M6IDEwMDAgfSwgLy8gfjEgc2VudGVuY2UgbWF4IHBlciBjaHVua1xuICAgICAgICAgICAgICBzbXM6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgICAgICAgZW1haWw6IHsgY2h1bmtCeTogJ25vbmUnIGFzIGNvbnN0LCBtYXhMZW5ndGg6IC0xLCBkZWxheUJldHdlZW5DaHVua3M6IDAgfSxcbiAgICAgICAgICAgICAgYXBpOiB7IGNodW5rQnk6ICdub25lJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAtMSwgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwIH0sXG4gICAgICAgICAgICAgIGFnZW50OiB7IGNodW5rQnk6ICdub25lJyBhcyBjb25zdCwgbWF4TGVuZ3RoOiAtMSwgZGVsYXlCZXR3ZWVuQ2h1bmtzOiAwIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IGNodW5rcyA9IFJlc3BvbnNlQ2h1bmtlci5jaHVua1Jlc3BvbnNlKHJlc3BvbnNlLCAnY2hhdCcsIGNodW5raW5nQ29uZmlnKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OoIFNwbGl0IHJlc3BvbnNlIGludG8gJHtjaHVua3MubGVuZ3RofSBtZXNzYWdlIGNodW5rc2ApO1xuICAgICAgXG4gICAgICAvLyBDYWxjdWxhdGUgZGVsYXlzIGZvciByZWFsaXN0aWMgdHlwaW5nIGJlaGF2aW9yXG4gICAgICBjb25zdCBjYWxjdWxhdGVUeXBpbmdUaW1lID0gKHRleHQ6IHN0cmluZywgY29uZmlnOiBUaW1pbmdDb25maWcpOiBudW1iZXIgPT4ge1xuICAgICAgICBjb25zdCBjaGFyQ291bnQgPSB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgcmV0dXJuIE1hdGguZmxvb3IoKGNoYXJDb3VudCAvIGNvbmZpZy50eXBpbmdTcGVlZCkgKiAxMDAwKTtcbiAgICAgIH07XG4gICAgICBcbiAgICAgIGNvbnN0IGNhbGN1bGF0ZUZpcnN0TWVzc2FnZURlbGF5ID0gKG9yaWdpbmFsVGV4dDogc3RyaW5nLCBjaHVua1RleHQ6IHN0cmluZywgY29uZmlnOiBUaW1pbmdDb25maWcpOiBudW1iZXIgPT4ge1xuICAgICAgICBjb25zdCByZWFkaW5nVGltZSA9IE1hdGguZmxvb3IoKG9yaWdpbmFsVGV4dC5sZW5ndGggLyBjb25maWcucmVhZGluZ1NwZWVkKSAqIDEwMDApO1xuICAgICAgICBjb25zdCB0eXBpbmdUaW1lID0gY2FsY3VsYXRlVHlwaW5nVGltZShjaHVua1RleHQsIGNvbmZpZyk7XG4gICAgICAgIGNvbnN0IGJ1c3lUaW1lID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGNvbmZpZy5tYXhCdXN5VGltZSAtIGNvbmZpZy5taW5CdXN5VGltZSkgKyBjb25maWcubWluQnVzeVRpbWUpICogMTAwMDtcbiAgICAgICAgcmV0dXJuIHJlYWRpbmdUaW1lICsgdHlwaW5nVGltZSArIGJ1c3lUaW1lO1xuICAgICAgfTtcbiAgICAgIFxuICAgICAgY29uc3QgY2FsY3VsYXRlU3Vic2VxdWVudE1lc3NhZ2VEZWxheSA9IChjaHVua1RleHQ6IHN0cmluZywgY29uZmlnOiBUaW1pbmdDb25maWcpOiBudW1iZXIgPT4ge1xuICAgICAgICBjb25zdCB0eXBpbmdUaW1lID0gY2FsY3VsYXRlVHlwaW5nVGltZShjaHVua1RleHQsIGNvbmZpZyk7XG4gICAgICAgIGNvbnN0IHRoaW5raW5nVGltZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChjb25maWcubWF4VGhpbmtpbmdUaW1lIC0gY29uZmlnLm1pblRoaW5raW5nVGltZSkgKyBjb25maWcubWluVGhpbmtpbmdUaW1lKSAqIDEwMDA7XG4gICAgICAgIHJldHVybiB0eXBpbmdUaW1lICsgdGhpbmtpbmdUaW1lO1xuICAgICAgfTtcbiAgICAgIFxuICAgICAgLy8gVXNlIHRpbWluZyBjb25maWcgKGFscmVhZHkgbG9hZGVkIGVhcmxpZXIpXG4gICAgICBjb25zdCBmaXJzdENodW5rRGVsYXkgPSBjYWxjdWxhdGVGaXJzdE1lc3NhZ2VEZWxheShldmVudC50ZXh0LCBjaHVua3NbMF0udGV4dCwgdGltaW5nQ29uZmlnKTtcbiAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gRmlyc3QgbWVzc2FnZSBkZWxheTogLSBSZWFkaW5nIHRpbWU6ICR7TWF0aC5mbG9vcigoZXZlbnQudGV4dC5sZW5ndGggLyB0aW1pbmdDb25maWcucmVhZGluZ1NwZWVkKSAqIDEwMDApfW1zICgke2V2ZW50LnRleHQubGVuZ3RofSBjaGFycyBhdCAke3RpbWluZ0NvbmZpZy5yZWFkaW5nU3BlZWR9IGNoYXJzL3NlYykgLSBUeXBpbmcgdGltZTogJHtjYWxjdWxhdGVUeXBpbmdUaW1lKGNodW5rc1swXS50ZXh0LCB0aW1pbmdDb25maWcpfW1zICgke2NodW5rc1swXS50ZXh0Lmxlbmd0aH0gY2hhcnMgYXQgJHt0aW1pbmdDb25maWcudHlwaW5nU3BlZWR9IGNoYXJzL3NlYykgLSBCdXN5IHRpbWU6ICR7Zmlyc3RDaHVua0RlbGF5IC0gTWF0aC5mbG9vcigoZXZlbnQudGV4dC5sZW5ndGggLyB0aW1pbmdDb25maWcucmVhZGluZ1NwZWVkKSAqIDEwMDApIC0gY2FsY3VsYXRlVHlwaW5nVGltZShjaHVua3NbMF0udGV4dCwgdGltaW5nQ29uZmlnKX1tcyAocmFuZG9tICR7dGltaW5nQ29uZmlnLm1pbkJ1c3lUaW1lfS0ke3RpbWluZ0NvbmZpZy5tYXhCdXN5VGltZX0gc2VjKSAtIFRvdGFsIGRlbGF5OiAke2ZpcnN0Q2h1bmtEZWxheX1tcyAoJHtNYXRoLmZsb29yKGZpcnN0Q2h1bmtEZWxheSAvIDEwMDApfSBzZWNvbmRzKWApO1xuICAgICAgXG4gICAgICAvLyBFbWl0IGNodW5rcyB3aXRoIHJlYWxpc3RpYyBkZWxheXNcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGNodW5rID0gY2h1bmtzW2ldO1xuICAgICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICAgIGNvbnN0IGVwb2NoTXMgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zdCByYW5kb21TdWZmaXggPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHIoMiwgOSk7XG4gICAgICAgIGNvbnN0IGdlbmVyYXRlZE1lc3NhZ2VJZCA9IGBhZ2VudC0ke2Vwb2NoTXN9LSR7cmFuZG9tU3VmZml4fWA7XG4gICAgICAgIGNvbnN0IG9yaWdpbk1ldGFkYXRhID0gY3JlYXRlT3JpZ2luTWV0YWRhdGEoZXZlbnQsIGdlbmVyYXRlZE1lc3NhZ2VJZCk7XG4gICAgICAgIFxuICAgICAgICAvLyBDYWxjdWxhdGUgZGVsYXlcbiAgICAgICAgbGV0IGRlbGF5OiBudW1iZXI7XG4gICAgICAgIGlmIChpID09PSAwKSB7XG4gICAgICAgICAgZGVsYXkgPSBmaXJzdENodW5rRGVsYXk7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKPse+4jyBNZXNzYWdlICR7aSArIDF9LyR7Y2h1bmtzLmxlbmd0aH06IFdhaXRpbmcgJHtNYXRoLmZsb29yKGRlbGF5IC8gMTAwMCl9IHNlY29uZHMuLi5gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZWxheSA9IGNhbGN1bGF0ZVN1YnNlcXVlbnRNZXNzYWdlRGVsYXkoY2h1bmsudGV4dCwgdGltaW5nQ29uZmlnKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4o+x77iPIFN1YnNlcXVlbnQgbWVzc2FnZSBkZWxheTogLSBUeXBpbmcgdGltZTogJHtjYWxjdWxhdGVUeXBpbmdUaW1lKGNodW5rLnRleHQsIHRpbWluZ0NvbmZpZyl9bXMgKCR7Y2h1bmsudGV4dC5sZW5ndGh9IGNoYXJzIGF0ICR7dGltaW5nQ29uZmlnLnR5cGluZ1NwZWVkfSBjaGFycy9zZWMpIC0gVGhpbmtpbmcgdGltZTogJHtkZWxheSAtIGNhbGN1bGF0ZVR5cGluZ1RpbWUoY2h1bmsudGV4dCwgdGltaW5nQ29uZmlnKX1tcyAocmFuZG9tICR7dGltaW5nQ29uZmlnLm1pblRoaW5raW5nVGltZX0tJHt0aW1pbmdDb25maWcubWF4VGhpbmtpbmdUaW1lfSBzZWMpIC0gVG90YWwgZGVsYXk6ICR7ZGVsYXl9bXMgKCR7TWF0aC5mbG9vcihkZWxheSAvIDEwMDApfSBzZWNvbmRzKWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDij7HvuI8gTWVzc2FnZSAke2kgKyAxfS8ke2NodW5rcy5sZW5ndGh9OiBXYWl0aW5nICR7TWF0aC5mbG9vcihkZWxheSAvIDEwMDApfSBzZWNvbmRzLi4uYCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFdhaXQgYmVmb3JlIHNlbmRpbmdcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGRlbGF5KSk7XG4gICAgICAgIFxuICAgICAgICAvLyDwn5qoIElOVEVSUlVQVElPTiBDSEVDSzogRElTQUJMRUQgRk9SIE5PVyAtIG5lZWRzIG1vcmUgdGVzdGluZ1xuICAgICAgICAvLyBUaGUgaXNzdWUgaXMgdGhhdCBsb2FkV29ya2Zsb3dTdGF0ZSBtYXkgcmV0dXJuIGEgZnJlc2ggc3RhdGUgd2l0aG91dCBsYXN0UHJvY2Vzc2VkTWVzc2FnZUlkXG4gICAgICAgIC8vIFRPRE86IEZpeCB0aGlzIHByb3Blcmx5IGJ5IGVuc3VyaW5nIGxhc3RQcm9jZXNzZWRNZXNzYWdlSWQgaXMgcGVyc2lzdGVkIGFuZCBsb2FkZWQgY29ycmVjdGx5XG4gICAgICAgIC8vIGlmIChldmVudC5jaGFubmVsSWQgJiYgY2hhbm5lbFN0YXRlU2VydmljZSkge1xuICAgICAgICAvLyAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IGNoYW5uZWxTdGF0ZVNlcnZpY2UubG9hZFdvcmtmbG93U3RhdGUoZXZlbnQuY2hhbm5lbElkLCBldmVudC50ZW5hbnRJZCk7XG4gICAgICAgIC8vICAgaWYgKGN1cnJlbnRTdGF0ZS5sYXN0UHJvY2Vzc2VkTWVzc2FnZUlkICYmIGN1cnJlbnRTdGF0ZS5sYXN0UHJvY2Vzc2VkTWVzc2FnZUlkICE9PSBpbmJvdW5kTWVzc2FnZUlkKSB7XG4gICAgICAgIC8vICAgICBjb25zb2xlLmxvZyhg4pqg77iPIE1lc3NhZ2Ugc3VwZXJzZWRlZCEgVXNlciBzZW50IG5ldyBtZXNzYWdlIHdoaWxlIHdlIHdlcmUgcHJvY2Vzc2luZy5gKTtcbiAgICAgICAgLy8gICAgIGNvbnNvbGUubG9nKGAgICBFeHBlY3RlZCBtZXNzYWdlSWQ6ICR7aW5ib3VuZE1lc3NhZ2VJZH1gKTtcbiAgICAgICAgLy8gICAgIGNvbnNvbGUubG9nKGAgICBDdXJyZW50IG1lc3NhZ2VJZDogJHtjdXJyZW50U3RhdGUubGFzdFByb2Nlc3NlZE1lc3NhZ2VJZH1gKTtcbiAgICAgICAgLy8gICAgIGNvbnNvbGUubG9nKGAgICBEaXNjYXJkaW5nIHJlbWFpbmluZyAke2NodW5rcy5sZW5ndGggLSBpfSBjaHVuayhzKWApO1xuICAgICAgICAvLyAgICAgY29uc29sZS5sb2coYCAgIOKchSBHb2FsIGRhdGEgYWxyZWFkeSBwZXJzaXN0ZWQgLSBubyBkYXRhIGxvc3NgKTtcbiAgICAgICAgLy8gICAgIHJldHVybjsgLy8gRXhpdCBlYXJseSAtIGRvbid0IHNlbmQgc3RhbGUgY2h1bmtzXG4gICAgICAgIC8vICAgfVxuICAgICAgICAvLyB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+RpCBVc2luZyBwZXJzb25hIG5hbWU6IFwiJHtldmVudC51c2VyTmFtZX1cIiAocGVyc29uYUlkOiAke2V2ZW50LnVzZXJJZH0pYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OkIFNlbmRpbmcgbWVzc2FnZSAke2kgKyAxfS8ke2NodW5rcy5sZW5ndGh9IHdpdGggdXNlck5hbWU9XCIke2V2ZW50LnVzZXJOYW1lfVwiOiAke2NodW5rLnRleHQuc3Vic3RyaW5nKDAsIDUwKX0uLi5gKTtcblxuICAgICAgICBjb25zdCBjaGF0TWVzc2FnZUV2ZW50ID0ge1xuICAgICAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgICAgICBjaGFubmVsSWQ6IGV2ZW50LmNoYW5uZWxJZCxcbiAgICAgICAgICB1c2VySWQ6IGV2ZW50LnVzZXJJZCwgLy8gUGVyc29uYSBJRCAodGhlIGFnZW50IHNlbmRpbmcgdGhlIG1lc3NhZ2UpXG4gICAgICAgICAgdXNlck5hbWU6IGV2ZW50LnVzZXJOYW1lIHx8ICdBSSBBc3Npc3RhbnQnLFxuICAgICAgICAgIHVzZXJUeXBlOiAnYWdlbnQnLCAvLyBFeHBsaWNpdGx5IG1hcmsgdGhpcyBhcyBhbiBhZ2VudCBtZXNzYWdlXG4gICAgICAgICAgbWVzc2FnZTogY2h1bmsudGV4dCxcbiAgICAgICAgICBtZXNzYWdlSWQ6IGdlbmVyYXRlZE1lc3NhZ2VJZCxcbiAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgY29ubmVjdGlvbklkOiBldmVudC5jb25uZWN0aW9uSWQgfHwgZXZlbnQuY2hhbm5lbF9jb250ZXh0Py5jaGF0Py5jb25uZWN0aW9uSWQsXG4gICAgICAgICAgbWVzc2FnZVR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICBzZW5kZXJJZDogZXZlbnQudXNlcklkLCAvLyBGb3Igcm91dGluZywgc2VuZGVySWQgPSBhZ2VudCAocGVyc29uYSBJRClcbiAgICAgICAgICBzZW5kZXJUeXBlOiAnYWdlbnQnLFxuICAgICAgICAgIGFnZW50SWQ6IGV2ZW50LnVzZXJJZCxcbiAgICAgICAgICBvcmlnaW5NYXJrZXI6ICdwZXJzb25hJyxcbiAgICAgICAgICBtZXRhZGF0YTogb3JpZ2luTWV0YWRhdGEsXG4gICAgICAgICAgLy8gQ2h1bmsgdHJhY2tpbmcgZm9yIHByZXNlbmNlIGV2ZW50cyAoY29uc3VtZXIgZW1pdHMgY2hhdC5zdG9wcGVkVHlwaW5nIHdoZW4gY3VycmVudENodW5rID09PSB0b3RhbENodW5rcylcbiAgICAgICAgICBjdXJyZW50Q2h1bms6IGkgKyAxLCAgLy8gMS1pbmRleGVkXG4gICAgICAgICAgdG90YWxDaHVua3M6IGNodW5rcy5sZW5ndGggKyAoZm9sbG93VXBRdWVzdGlvbiA/IDEgOiAwKSwgLy8gSW5jbHVkZSBmb2xsb3ctdXAgaW4gY291bnRcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IGV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQ3VzdG9tRXZlbnQoXG4gICAgICAgICAgJ2t4LWV2ZW50LXRyYWNraW5nJyxcbiAgICAgICAgICAnY2hhdC5tZXNzYWdlJyxcbiAgICAgICAgICBjaGF0TWVzc2FnZUV2ZW50XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIE1lc3NhZ2UgJHtpICsgMX0vJHtjaHVua3MubGVuZ3RofSBlbWl0dGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+OiSBBbGwgJHtjaHVua3MubGVuZ3RofSBtZXNzYWdlcyBzZW50IHN1Y2Nlc3NmdWxseSFgKTtcbiAgICAgIFxuICAgICAgLy8gU2VuZCBmb2xsb3ctdXAgcXVlc3Rpb24gYXMgYSBzZXBhcmF0ZSBkZWxheWVkIG1lc3NhZ2UgKGlmIHByZXNlbnQpXG4gICAgICBpZiAoZm9sbG93VXBRdWVzdGlvbikge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+SrCBTZW5kaW5nIGZvbGxvdy11cCBxdWVzdGlvbiBhZnRlciBtYWluIHJlc3BvbnNlLi4uYCk7XG4gICAgICAgIFxuICAgICAgICAvLyBDYWxjdWxhdGUgZGVsYXkgYWZ0ZXIgbGFzdCBjaHVua1xuICAgICAgICBjb25zdCBmb2xsb3dVcERlbGF5ID0gY2FsY3VsYXRlU3Vic2VxdWVudE1lc3NhZ2VEZWxheShmb2xsb3dVcFF1ZXN0aW9uLCB0aW1pbmdDb25maWcpO1xuICAgICAgICBjb25zb2xlLmxvZyhg4o+x77iPIEZvbGxvdy11cCBkZWxheTogJHtNYXRoLmZsb29yKGZvbGxvd1VwRGVsYXkgLyAxMDAwKX0gc2Vjb25kc2ApO1xuICAgICAgICBcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGZvbGxvd1VwRGVsYXkpKTtcbiAgICAgICAgXG4gICAgICAgIC8vIPCfmqggSU5URVJSVVBUSU9OIENIRUNLOiBESVNBQkxFRCBGT1IgTk9XIC0gbmVlZHMgbW9yZSB0ZXN0aW5nXG4gICAgICAgIC8vIFRPRE86IEZpeCB0aGlzIHByb3Blcmx5IGJ5IGVuc3VyaW5nIGxhc3RQcm9jZXNzZWRNZXNzYWdlSWQgaXMgcGVyc2lzdGVkIGFuZCBsb2FkZWQgY29ycmVjdGx5XG4gICAgICAgIC8vIGlmIChldmVudC5jaGFubmVsSWQgJiYgY2hhbm5lbFN0YXRlU2VydmljZSkge1xuICAgICAgICAvLyAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IGNoYW5uZWxTdGF0ZVNlcnZpY2UubG9hZFdvcmtmbG93U3RhdGUoZXZlbnQuY2hhbm5lbElkLCBldmVudC50ZW5hbnRJZCk7XG4gICAgICAgIC8vICAgaWYgKGN1cnJlbnRTdGF0ZS5sYXN0UHJvY2Vzc2VkTWVzc2FnZUlkICYmIGN1cnJlbnRTdGF0ZS5sYXN0UHJvY2Vzc2VkTWVzc2FnZUlkICE9PSBpbmJvdW5kTWVzc2FnZUlkKSB7XG4gICAgICAgIC8vICAgICBjb25zb2xlLmxvZyhg4pqg77iPIEZvbGxvdy11cCBxdWVzdGlvbiBzdXBlcnNlZGVkISBVc2VyIHNlbnQgbmV3IG1lc3NhZ2UuYCk7XG4gICAgICAgIC8vICAgICBjb25zb2xlLmxvZyhgICAgRGlzY2FyZGluZyBmb2xsb3ctdXAgcXVlc3Rpb25gKTtcbiAgICAgICAgLy8gICAgIGNvbnNvbGUubG9nKGAgICDinIUgR29hbCBkYXRhIGFscmVhZHkgcGVyc2lzdGVkIC0gbm8gZGF0YSBsb3NzYCk7XG4gICAgICAgIC8vICAgICByZXR1cm47IC8vIEV4aXQgZWFybHkgLSBkb24ndCBzZW5kIHN0YWxlIGZvbGxvdy11cFxuICAgICAgICAvLyAgIH1cbiAgICAgICAgLy8gfVxuICAgICAgICBcbiAgICAgICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgICBjb25zdCBlcG9jaE1zID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgcmFuZG9tU3VmZml4ID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpO1xuICAgICAgICBjb25zdCBnZW5lcmF0ZWRNZXNzYWdlSWQgPSBgYWdlbnQtZm9sbG93dXAtJHtlcG9jaE1zfS0ke3JhbmRvbVN1ZmZpeH1gO1xuICAgICAgICBjb25zdCBvcmlnaW5NZXRhZGF0YSA9IGNyZWF0ZU9yaWdpbk1ldGFkYXRhKGV2ZW50LCBnZW5lcmF0ZWRNZXNzYWdlSWQpO1xuICAgICAgICBcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRvdGFsIGNodW5rcyAobWFpbiBjaHVua3MgKyBmb2xsb3ctdXApXG4gICAgICAgIGNvbnN0IHRvdGFsQ2h1bmtzV2l0aEZvbGxvd1VwID0gY2h1bmtzLmxlbmd0aCArIDE7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBmb2xsb3dVcEV2ZW50ID0ge1xuICAgICAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgICAgICBjaGFubmVsSWQ6IGV2ZW50LmNoYW5uZWxJZCxcbiAgICAgICAgICB1c2VySWQ6IGV2ZW50LnVzZXJJZCxcbiAgICAgICAgICB1c2VyTmFtZTogZXZlbnQudXNlck5hbWUgfHwgJ0FJIEFzc2lzdGFudCcsXG4gICAgICAgICAgdXNlclR5cGU6ICdhZ2VudCcsXG4gICAgICAgICAgbWVzc2FnZTogZm9sbG93VXBRdWVzdGlvbixcbiAgICAgICAgICBtZXNzYWdlSWQ6IGdlbmVyYXRlZE1lc3NhZ2VJZCxcbiAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgY29ubmVjdGlvbklkOiBldmVudC5jb25uZWN0aW9uSWQgfHwgZXZlbnQuY2hhbm5lbF9jb250ZXh0Py5jaGF0Py5jb25uZWN0aW9uSWQsXG4gICAgICAgICAgbWVzc2FnZVR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICBzZW5kZXJJZDogZXZlbnQudXNlcklkLFxuICAgICAgICAgIHNlbmRlclR5cGU6ICdhZ2VudCcsXG4gICAgICAgICAgYWdlbnRJZDogZXZlbnQudXNlcklkLFxuICAgICAgICAgIG9yaWdpbk1hcmtlcjogJ3BlcnNvbmEnLFxuICAgICAgICAgIG1ldGFkYXRhOiBvcmlnaW5NZXRhZGF0YSxcbiAgICAgICAgICAvLyBUaGlzIGlzIHRoZSBsYXN0IGNodW5rIC0gY29uc3VtZXIgc2hvdWxkIGVtaXQgY2hhdC5zdG9wcGVkVHlwaW5nXG4gICAgICAgICAgY3VycmVudENodW5rOiB0b3RhbENodW5rc1dpdGhGb2xsb3dVcCxcbiAgICAgICAgICB0b3RhbENodW5rczogdG90YWxDaHVua3NXaXRoRm9sbG93VXAsXG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEN1c3RvbUV2ZW50KFxuICAgICAgICAgICdreC1ldmVudC10cmFja2luZycsXG4gICAgICAgICAgJ2NoYXQubWVzc2FnZScsXG4gICAgICAgICAgZm9sbG93VXBFdmVudFxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBGb2xsb3ctdXAgcXVlc3Rpb24gc2VudCBzdWNjZXNzZnVsbHkhYCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCdOb3QgYSBjaGF0IG1lc3NhZ2UsIHNraXBwaW5nIGNoYXQubWVzc2FnZSBlbWlzc2lvbicpO1xuICAgIH1cbiAgICBcbiAgICAvLyBEZXRlcm1pbmUgcHJlZmVycmVkIGNoYW5uZWwgYW5kIHJvdXRpbmdcbiAgICBjb25zdCBwcmVmZXJyZWRDaGFubmVsID0gZXZlbnQuc291cmNlOyAvLyBVc2Ugb3JpZ2luYXRpbmcgY2hhbm5lbFxuICAgIFxuICAgIGNvbnN0IHJvdXRpbmcgPSBhZ2VudFNlcnZpY2UuY3JlYXRlUm91dGluZ0luZm8oe1xuICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxuICAgICAgZW1haWxfbGM6IGV2ZW50LmVtYWlsX2xjLFxuICAgICAgdGV4dDogZXZlbnQudGV4dCxcbiAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlLFxuICAgICAgY2hhbm5lbF9jb250ZXh0OiBldmVudC5jaGFubmVsX2NvbnRleHQsXG4gICAgICBsZWFkX2lkOiBldmVudC5sZWFkX2lkLFxuICAgICAgY29udmVyc2F0aW9uX2lkOiBldmVudC5jb252ZXJzYXRpb25faWQsXG4gICAgfSwgcHJlZmVycmVkQ2hhbm5lbCk7XG4gICAgXG4gICAgLy8gRW1pdCBhZ2VudC5yZXBseS5jcmVhdGVkIGV2ZW50IChmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkvdHJhY2tpbmcpXG4gICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudFJlcGx5KFxuICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50UmVwbHlFdmVudChcbiAgICAgICAgZXZlbnQudGVuYW50SWQsXG4gICAgICAgIER5bmFtb0RCU2VydmljZS5jcmVhdGVDb250YWN0UEsoZXZlbnQudGVuYW50SWQsIGV2ZW50LmVtYWlsX2xjKSxcbiAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgIHByZWZlcnJlZENoYW5uZWwgYXMgJ3NtcycgfCAnZW1haWwnIHwgJ2NoYXQnIHwgJ2FwaScsXG4gICAgICAgIHJvdXRpbmcsXG4gICAgICAgIHtcbiAgICAgICAgICBjb252ZXJzYXRpb25JZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICBtb2RlbDogY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICAgICAgdHJpZ2dlcmVkX2J5X21lc3NhZ2U6IGV2ZW50Lm1lc3NhZ2VfdHMsXG4gICAgICAgICAgICByZXNwb25zZV90aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgIGxlYWRfaWQ6IGV2ZW50LmxlYWRfaWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgKVxuICAgICk7XG4gICAgXG4gICAgY29uc29sZS5sb2coJ0FnZW50IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdBZ2VudCBlcnJvcjonLCBlcnJvcik7XG4gICAgXG4gICAgLy8gVHJ5IHRvIGVtaXQgZXJyb3IgZXZlbnRcbiAgICB0cnkge1xuICAgICAgY29uc3QgY29uZmlnID0gbG9hZFJ1bnRpbWVDb25maWcoKTtcbiAgICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcbiAgICAgIFxuICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudEVycm9yKFxuICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxuICAgICAgICAgIGV2ZW50LnRlbmFudElkLFxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gYWdlbnQgZXJyb3InLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGNvbnRhY3RQazogRHluYW1vREJTZXJ2aWNlLmNyZWF0ZUNvbnRhY3RQSyhldmVudC50ZW5hbnRJZCwgZXZlbnQuZW1haWxfbGMpLFxuICAgICAgICAgICAgc3RhY2s6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGNvbnRleHQ6IHtcbiAgICAgICAgICAgICAgc291cmNlOiBldmVudC5zb3VyY2UsXG4gICAgICAgICAgICAgIHRleHRfbGVuZ3RoOiBldmVudC50ZXh0Py5sZW5ndGgsXG4gICAgICAgICAgICAgIGxlYWRfaWQ6IGV2ZW50LmxlYWRfaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9IGNhdGNoIChldmVudEVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZW1pdCBlcnJvciBldmVudDonLCBldmVudEVycm9yKTtcbiAgICB9XG4gICAgXG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBMYW1iZGEgaGFuZGxlciB0aGF0IHJldHVybnMgc3RydWN0dXJlZCBKU09OIHJlc3BvbnNlIHdpdGggaW50ZW50IG1ldGFkYXRhXG4gKiBVc2VmdWwgZm9yIEFQSSBHYXRld2F5IGludGVncmF0aW9ucyBvciB3aGVuIHlvdSBuZWVkIGRldGFpbGVkIHJlc3BvbnNlIGRhdGFcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHN0cnVjdHVyZWRIYW5kbGVyKFxuICBldmVudDogQWdlbnRJbnZvY2F0aW9uRXZlbnQsXG4gIGNvbnRleHQ6IENvbnRleHRcbik6IFByb21pc2U8QWdlbnRSZXNwb25zZT4ge1xuICBjb25zb2xlLmxvZygnQWdlbnQgcmVjZWl2ZWQgZXZlbnQgZm9yIHN0cnVjdHVyZWQgcmVzcG9uc2U6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gTG9hZCBhbmQgdmFsaWRhdGUgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGNvbmZpZyA9IGxvYWRSdW50aW1lQ29uZmlnKCk7XG4gICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKGNvbmZpZyk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBzZXJ2aWNlc1xuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSBuZXcgRHluYW1vREJTZXJ2aWNlKGNvbmZpZyk7XG4gICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xuICAgIFxuICAgIC8vIENyZWF0ZSBhZ2VudCBzZXJ2aWNlXG4gICAgY29uc3QgYWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZSh7XG4gICAgICAuLi5jb25maWcsXG4gICAgICBkeW5hbW9TZXJ2aWNlLFxuICAgICAgZXZlbnRCcmlkZ2VTZXJ2aWNlLFxuICAgIH0pO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgdGhlIG1lc3NhZ2UgYW5kIGdldCBzdHJ1Y3R1cmVkIHJlc3BvbnNlXG4gICAgY29uc29sZS5sb2coYFByb2Nlc3NpbmcgbWVzc2FnZSBmb3IgJHtldmVudC50ZW5hbnRJZH0vJHtldmVudC5lbWFpbF9sY31gKTtcbiAgICBcbiAgICBjb25zdCBzdHJ1Y3R1cmVkUmVzcG9uc2UgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2VTdHJ1Y3R1cmVkKHtcbiAgICAgIHRlbmFudElkOiBldmVudC50ZW5hbnRJZCxcbiAgICAgIGVtYWlsX2xjOiBldmVudC5lbWFpbF9sYyxcbiAgICAgIHRleHQ6IGV2ZW50LnRleHQsXG4gICAgICBzb3VyY2U6IGV2ZW50LnNvdXJjZSxcbiAgICAgIGNoYW5uZWxfY29udGV4dDogZXZlbnQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgbGVhZF9pZDogZXZlbnQubGVhZF9pZCxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogZXZlbnQuY29udmVyc2F0aW9uX2lkLFxuICAgIH0pO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGBHZW5lcmF0ZWQgc3RydWN0dXJlZCByZXNwb25zZTpgLCB7XG4gICAgICBzdWNjZXNzOiBzdHJ1Y3R1cmVkUmVzcG9uc2Uuc3VjY2VzcyxcbiAgICAgIG1lc3NhZ2VMZW5ndGg6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXNzYWdlLmxlbmd0aCxcbiAgICAgIGludGVudDogc3RydWN0dXJlZFJlc3BvbnNlLmludGVudD8uaWQsXG4gICAgICBjb25maWRlbmNlOiBzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Py5jb25maWRlbmNlLFxuICAgICAgcHJvY2Vzc2luZ1RpbWU6IHN0cnVjdHVyZWRSZXNwb25zZS5tZXRhZGF0YS5wcm9jZXNzaW5nVGltZU1zXG4gICAgfSk7XG4gICAgXG4gICAgLy8gTG9nIGludGVudCBkZXRlY3Rpb24gaW4gcmVkIGZvciB2aXNpYmlsaXR5XG4gICAgaWYgKHN0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW3wn46vIElOVEVOVCBERVRFQ1RFRCBJTiBMQU1CREE6ICR7c3RydWN0dXJlZFJlc3BvbnNlLmludGVudC5pZH0gKGNvbmZpZGVuY2U6ICR7KHN0cnVjdHVyZWRSZXNwb25zZS5pbnRlbnQuY29uZmlkZW5jZSAqIDEwMCkudG9GaXhlZCgxKX0lKVxceDFiWzBtYCk7XG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTmFtZTogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50Lm5hbWV9XFx4MWJbMG1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBQcmlvcml0eTogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LnByaW9yaXR5fVxceDFiWzBtYCk7XG4gICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgQWN0aW9uczogJHtzdHJ1Y3R1cmVkUmVzcG9uc2UuaW50ZW50LmFjdGlvbnM/LmpvaW4oJywgJykgfHwgJ25vbmUnfVxceDFiWzBtYCk7XG4gICAgfVxuICAgIFxuICAgIC8vIEVtaXQgY2hhdC5tZXNzYWdlIGV2ZW50IGlmIHRoaXMgaXMgYSBjaGF0IGNvbnZlcnNhdGlvblxuICAgIGlmIChzdHJ1Y3R1cmVkUmVzcG9uc2Uuc3VjY2VzcyAmJiBldmVudC5zb3VyY2UgPT09ICdjaGF0JyAmJiBldmVudC5jaGFubmVsSWQgJiYgZXZlbnQudXNlcklkKSB7XG4gICAgICBpZiAoaXNQZXJzb25hT3JpZ2luKGV2ZW50KSkge1xuICAgICAgICBjb25zb2xlLmxvZygnU2tpcHBpbmcgc3RydWN0dXJlZCBjaGF0Lm1lc3NhZ2UgZW1pc3Npb24gYmVjYXVzZSB0aGlzIGV2ZW50IG9yaWdpbmF0ZWQgZnJvbSB0aGUgYWdlbnQuJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZygnRW1pdHRpbmcgY2hhdC5tZXNzYWdlIGV2ZW50IGZvciBzdHJ1Y3R1cmVkIGFnZW50IHJlc3BvbnNlJyk7XG5cbiAgICAgICAgY29uc3QgdGltZXN0YW1wID0gc3RydWN0dXJlZFJlc3BvbnNlLm1ldGFkYXRhLnRpbWVzdGFtcDtcbiAgICAgICAgY29uc3QgZXBvY2hNcyA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IHJhbmRvbVN1ZmZpeCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA5KTtcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkTWVzc2FnZUlkID0gYGFnZW50LSR7ZXBvY2hNc30tJHtyYW5kb21TdWZmaXh9YDtcbiAgICAgICAgY29uc3Qgb3JpZ2luTWV0YWRhdGEgPSBjcmVhdGVPcmlnaW5NZXRhZGF0YShldmVudCwgZ2VuZXJhdGVkTWVzc2FnZUlkKTtcblxuICAgICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEN1c3RvbUV2ZW50KFxuICAgICAgICAgICdreC1ldmVudC10cmFja2luZycsXG4gICAgICAgICAgJ2NoYXQubWVzc2FnZScsXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxuICAgICAgICAgICAgY2hhbm5lbElkOiBldmVudC5jaGFubmVsSWQsXG4gICAgICAgICAgICB1c2VySWQ6IGV2ZW50LnVzZXJJZCwgLy8gUGVyc29uYSBJRCAodGhlIGFnZW50KVxuICAgICAgICAgICAgdXNlck5hbWU6IGV2ZW50LnVzZXJOYW1lIHx8ICdBSSBBc3Npc3RhbnQnLFxuICAgICAgICAgICAgdXNlclR5cGU6ICdhZ2VudCcsIC8vIE1hcmsgYXMgYWdlbnQgbWVzc2FnZVxuICAgICAgICAgICAgbWVzc2FnZTogc3RydWN0dXJlZFJlc3BvbnNlLm1lc3NhZ2UsXG4gICAgICAgICAgICBtZXNzYWdlSWQ6IGdlbmVyYXRlZE1lc3NhZ2VJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgIGNvbm5lY3Rpb25JZDogZXZlbnQuY29ubmVjdGlvbklkIHx8IGV2ZW50LmNoYW5uZWxfY29udGV4dD8uY2hhdD8uY29ubmVjdGlvbklkLCAvLyBVc2UgY29ubmVjdGlvbklkIGZyb20gb3JpZ2luYWwgbWVzc2FnZVxuICAgICAgICAgICAgbWVzc2FnZVR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIHNlbmRlcklkOiBldmVudC51c2VySWQsIC8vIEZvciByb3V0aW5nLCBzZW5kZXJJZCA9IGFnZW50IChwZXJzb25hIElEKVxuICAgICAgICAgICAgc2VuZGVyVHlwZTogJ2FnZW50JyxcbiAgICAgICAgICAgIGFnZW50SWQ6IGV2ZW50LnVzZXJJZCxcbiAgICAgICAgICAgIG9yaWdpbk1hcmtlcjogJ3BlcnNvbmEnLFxuICAgICAgICAgICAgbWV0YWRhdGE6IG9yaWdpbk1ldGFkYXRhXG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coJ1N0cnVjdHVyZWQgcmVzcG9uc2UgY2hhdC5tZXNzYWdlIGV2ZW50IGVtaXR0ZWQnKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHN0cnVjdHVyZWRSZXNwb25zZTtcbiAgICBcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdBZ2VudCBwcm9jZXNzaW5nIGVycm9yOicsIGVycm9yKTtcbiAgICBcbiAgICAvLyBSZXR1cm4gc3RydWN0dXJlZCBlcnJvciByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgIG1lc3NhZ2U6ICdJIGFwb2xvZ2l6ZSwgYnV0IEkgZW5jb3VudGVyZWQgYW4gZXJyb3IgcHJvY2Vzc2luZyB5b3VyIG1lc3NhZ2UuIFBsZWFzZSB0cnkgYWdhaW4uJyxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIHNlc3Npb25JZDogZXZlbnQuY29udmVyc2F0aW9uX2lkIHx8ICd1bmtub3duJyxcbiAgICAgICAgdGVuYW50SWQ6IGV2ZW50LnRlbmFudElkLFxuICAgICAgICB1c2VySWQ6IGV2ZW50LmVtYWlsX2xjLFxuICAgICAgICBjaGFubmVsOiBldmVudC5zb3VyY2UsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBwcm9jZXNzaW5nVGltZU1zOiAwXG4gICAgICB9LFxuICAgICAgZXJyb3I6IHtcbiAgICAgICAgY29kZTogJ0hBTkRMRVJfRVJST1InLFxuICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3JcbiAgICAgIH1cbiAgICB9O1xuICB9XG59XG4iXX0=