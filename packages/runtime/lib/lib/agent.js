"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const aws_1 = require("@langchain/aws");
const chains_1 = require("langchain/chains");
const memory_1 = require("langchain/memory");
const prompts_1 = require("@langchain/core/prompts");
const messages_1 = require("@langchain/core/messages");
const chat_history_js_1 = require("./chat-history.js");
const memory_chat_history_js_1 = require("./memory-chat-history.js");
const dynamodb_js_1 = require("./dynamodb.js");
const eventbridge_js_1 = require("./eventbridge.js");
const personas_js_1 = require("../config/personas.js");
const persona_service_js_1 = require("./persona-service.js");
const response_chunker_js_1 = require("./response-chunker.js");
const intent_service_js_1 = require("./intent-service.js");
const goal_orchestrator_js_1 = require("./goal-orchestrator.js");
const action_tag_processor_js_1 = require("./action-tag-processor.js");
const intent_action_registry_js_1 = require("./intent-action-registry.js");
/**
 * LangChain agent service that processes messages and generates responses
 */
class AgentService {
    constructor(config) {
        this.config = config;
        // Always initialize persona service for company info substitution
        // Pass null for DynamoDB service if not available
        this.personaService = new persona_service_js_1.PersonaService(config.dynamoService || null);
        // Initialize intent service
        this.intentService = new intent_service_js_1.IntentService();
        // Initialize goal orchestrator
        this.goalOrchestrator = new goal_orchestrator_js_1.GoalOrchestrator();
        // Initialize action tag processor with default config (will be updated per persona)
        this.actionTagProcessor = new action_tag_processor_js_1.ActionTagProcessor({
            enabled: false,
            mappings: {},
            fallbackEmoji: '😊'
        });
        // Initialize intent action registry (use provided or create new)
        this.intentActionRegistry = config.intentActionRegistry || new intent_action_registry_js_1.IntentActionRegistry();
        // Initialize persona storage (use provided or create with fallback)
        this.personaStorage = config.personaStorage;
        // Persona will be loaded per-request with company info substitution
        this.persona = {}; // Will be loaded per-request
        this.model = new aws_1.ChatBedrockConverse({
            model: config.bedrockModelId,
            region: config.awsRegion,
            temperature: 0.7,
            maxTokens: 1000,
        });
    }
    /**
     * Process an agent context and generate a response
     * @param context - The agent context
     * @param existingHistory - Optional chat history (for CLI/local use)
     */
    async processMessage(context, existingHistory) {
        const startTime = Date.now();
        try {
            // Load persona for this tenant with company info substitution
            let currentPersona = this.persona;
            // Use pre-loaded persona if provided (from handler)
            if (this.config.persona) {
                console.log(`👤 Using pre-loaded persona from config`);
                currentPersona = this.config.persona;
            }
            else if (this.personaService) {
                try {
                    currentPersona = await this.personaService.getPersona(context.tenantId, this.config.personaId || 'carlos', this.config.companyInfo);
                }
                catch (error) {
                    console.warn(`Failed to load persona ${this.config.personaId} for tenant ${context.tenantId}, using fallback:`, error);
                    // Use PersonaService fallback to ensure goalConfiguration is loaded
                    currentPersona = this.personaService.getDefaultPersona(this.config.personaId || 'carlos', this.config.companyInfo);
                }
            }
            // Configure action tag processor based on persona
            if (currentPersona.actionTags) {
                const actionTagConfig = currentPersona.actionTags;
                this.actionTagProcessor = new action_tag_processor_js_1.ActionTagProcessor(actionTagConfig);
            }
            // Run goal orchestration to manage lead qualification
            let goalResult = null;
            console.log(`🔍 Goal config enabled: ${currentPersona.goalConfiguration?.enabled}, goals: ${currentPersona.goalConfiguration?.goals?.length || 0}`);
            if (currentPersona.goalConfiguration?.enabled) {
                try {
                    goalResult = await this.goalOrchestrator.orchestrateGoals(context.text, context.conversation_id || 'default', context.email_lc, context.tenantId, currentPersona.goalConfiguration);
                    // Log goal orchestration results
                    if (goalResult.extractedInfo && Object.keys(goalResult.extractedInfo).length > 0) {
                        console.log(`📧 Extracted info:`, goalResult.extractedInfo);
                    }
                    if (goalResult.recommendations.length > 0) {
                        console.log(`🎯 Goal recommendations:`, goalResult.recommendations.map(r => ({
                            goal: r.goalId,
                            priority: r.priority,
                            shouldPursue: r.shouldPursue,
                            approach: r.approach
                        })));
                    }
                    if (goalResult.triggeredIntents.length > 0) {
                        console.log(`🚀 Triggered intents:`, goalResult.triggeredIntents);
                        // Process triggered intents (like lead_generated)
                        for (const triggeredIntentId of goalResult.triggeredIntents) {
                            const triggeredIntent = currentPersona.intentCapturing?.intents?.find(i => i.id === triggeredIntentId);
                            if (triggeredIntent) {
                                console.log(`\x1b[31m🎉 GOAL TRIGGERED INTENT: ${triggeredIntentId}\x1b[0m`);
                                // You could return the triggered intent response here if desired
                                // For now, we'll let the normal flow continue and add it as context
                            }
                        }
                    }
                }
                catch (error) {
                    console.warn('Goal orchestration error:', error);
                }
            }
            // Check for intent matches before processing with LangChain
            const intentMatch = await this.intentService.detectIntent(context.text, currentPersona, this.config.companyInfo || {
                name: 'Planet Fitness',
                industry: 'Fitness & Wellness',
                description: 'America\'s most popular gym with over 2,400 locations',
                products: 'Gym memberships, fitness equipment, group classes',
                benefits: 'Affordable pricing, judgment-free environment, convenient locations',
                targetCustomers: 'People of all fitness levels looking for an affordable, non-intimidating gym experience',
                differentiators: 'Low cost, no-judgment atmosphere, beginner-friendly environment'
            }, {
                tenantId: context.tenantId,
                userId: context.email_lc,
                sessionId: context.conversation_id,
                channel: context.source
            });
            // If we have a high-confidence intent match, use the intent response
            if (intentMatch && intentMatch.confidence > 0.7) {
                console.log(`\x1b[31m🎯 INTENT DETECTED: ${intentMatch.intent.id} (confidence: ${(intentMatch.confidence * 100).toFixed(1)}%)\x1b[0m`);
                console.log(`\x1b[31m   Name: ${intentMatch.intent.name}\x1b[0m`);
                console.log(`\x1b[31m   Priority: ${intentMatch.intent.priority}\x1b[0m`);
                console.log(`\x1b[31m   Matched triggers: ${intentMatch.matchedTriggers.join(', ')}\x1b[0m`);
                console.log(`\x1b[31m   Matched patterns: ${intentMatch.matchedPatterns.join(', ')}\x1b[0m`);
                if (intentMatch.actions && intentMatch.actions.length > 0) {
                    console.log(`\x1b[31m   Actions: ${intentMatch.actions.join(', ')}\x1b[0m`);
                }
                // Execute intent actions if registry is available
                let intentActionResults = [];
                if (this.intentActionRegistry) {
                    try {
                        const actionContext = {
                            intent: {
                                id: intentMatch.intent.id,
                                name: intentMatch.intent.name,
                                confidence: intentMatch.confidence,
                                matchedTriggers: intentMatch.matchedTriggers,
                            },
                            agentContext: context,
                            message: context.text,
                            extractedData: goalResult?.extractedInfo || {},
                            conversation: {
                                id: context.conversation_id,
                                sessionId: context.conversation_id,
                                messageCount: 1, // TODO: Get actual message count
                                history: [], // TODO: Get conversation history
                            },
                            user: {
                                email: context.email_lc,
                                phone: goalResult?.extractedInfo?.phone?.value,
                                name: goalResult?.extractedInfo?.firstName?.value || goalResult?.extractedInfo?.fullName?.value,
                                leadId: context.lead_id,
                            },
                            tenant: {
                                id: context.tenantId,
                                companyInfo: this.config.companyInfo,
                            },
                            channel: {
                                source: context.source,
                                context: context.channel_context,
                            },
                        };
                        intentActionResults = await this.intentActionRegistry.executeActions(actionContext);
                        // Log action results
                        if (intentActionResults.length > 0) {
                            console.log(`\x1b[31m🚀 INTENT ACTIONS EXECUTED: ${intentActionResults.length} actions\x1b[0m`);
                            for (const result of intentActionResults) {
                                if (result.success) {
                                    console.log(`\x1b[32m   ✅ ${result.metadata?.actionName || 'Unknown'}: Success\x1b[0m`);
                                    if (result.message) {
                                        console.log(`\x1b[32m      Message: ${result.message}\x1b[0m`);
                                    }
                                }
                                else {
                                    console.log(`\x1b[31m   ❌ ${result.metadata?.actionName || 'Unknown'}: Failed\x1b[0m`);
                                    if (result.error) {
                                        console.log(`\x1b[31m      Error: ${result.error.message}\x1b[0m`);
                                    }
                                }
                            }
                        }
                    }
                    catch (error) {
                        console.error('Intent action execution error:', error);
                    }
                }
                // Track the intent response
                if (this.config.eventBridgeService) {
                    await this.config.eventBridgeService.publishAgentTrace({
                        source: 'kxgen.agent',
                        'detail-type': 'agent.trace',
                        detail: {
                            tenantId: context.tenantId,
                            operation: 'intent_match',
                            metadata: {
                                intentId: intentMatch.intent.id,
                                confidence: intentMatch.confidence,
                                matchedTriggers: intentMatch.matchedTriggers,
                                matchedPatterns: intentMatch.matchedPatterns,
                                actions: intentMatch.actions,
                                actionResults: intentActionResults.map(r => ({
                                    success: r.success,
                                    actionId: r.metadata?.actionId,
                                    message: r.message,
                                    error: r.error?.message,
                                })),
                            }
                        }
                    });
                }
                // Check if this is a persona_handled intent (empty response means let persona handle it)
                if (!intentMatch.response || intentMatch.response.trim() === '') {
                    console.log(`🎯 Intent detected but persona_handled - letting Carlos respond naturally`);
                    // Don't return early - let the normal LangChain flow handle this with the persona's rules
                    // The intent detection info is logged above for tracking purposes
                }
                else {
                    // Handle intents with templated responses (like operational hours)
                    let response = intentMatch.response;
                    if (goalResult && goalResult.recommendations.length > 0) {
                        const highPriorityGoal = goalResult.recommendations.find(r => r.shouldPursue && r.priority >= 4);
                        if (highPriorityGoal) {
                            response += `\n\n${highPriorityGoal.message}`;
                        }
                    }
                    // Add follow-up if available
                    if (intentMatch.followUp) {
                        response += '\n\n' + intentMatch.followUp.join(' ');
                    }
                    return response;
                }
            }
            // Handle chat history - either from existing history (CLI) or from storage (Lambda)
            let messages;
            if (existingHistory) {
                // CLI/Local mode: Use provided history
                console.log(`🔍 Using provided chat history: ${existingHistory.length} messages`);
                messages = existingHistory;
                // Add current message to the provided history
                const incomingMessage = new messages_1.HumanMessage({
                    content: context.text,
                    additional_kwargs: {
                        source: context.source,
                        channel_context: context.channel_context,
                        lead_id: context.lead_id,
                    },
                });
                messages.push(incomingMessage);
            }
            else {
                // Lambda mode: Load from DynamoDB or create new
                const sessionKey = `${context.tenantId}:${context.email_lc}:${context.conversation_id || 'default-session'}`;
                console.log(`🔍 Lambda mode - Session Key: ${sessionKey}`);
                const chatHistory = this.config.dynamoService
                    ? new chat_history_js_1.KxDynamoChatHistory({
                        tenantId: context.tenantId,
                        emailLc: context.email_lc,
                        dynamoService: this.config.dynamoService,
                        historyLimit: this.config.historyLimit,
                        conversationId: context.conversation_id,
                    })
                    : new memory_chat_history_js_1.MemoryChatHistory(sessionKey);
                // Add the incoming message to history
                const incomingMessage = new messages_1.HumanMessage({
                    content: context.text,
                    additional_kwargs: {
                        source: context.source,
                        channel_context: context.channel_context,
                        lead_id: context.lead_id,
                    },
                });
                // Skip adding to DynamoDB - messaging service handles persistence
                // await chatHistory.addMessage(incomingMessage);
                // Get conversation history from storage
                messages = this.config.dynamoService
                    ? await chatHistory.getMessagesWithTokenEstimate(3000)
                    : await chatHistory.getRecentMessages(3000);
            }
            // DEBUG: Check if history is working
            console.log(`🔍 Chat History Debug:`);
            console.log(`   Messages in history: ${messages.length}`);
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
                console.log(`   Last message: ${content.substring(0, 50)}...`);
            }
            // Create memory with messages
            const memory = new memory_1.BufferMemory({
                returnMessages: true,
                memoryKey: 'history',
            });
            // Add existing messages to memory (excluding the current message we just added)
            // Note: This adds to in-memory chat history for the LangChain conversation, NOT DynamoDB
            const historyMessages = messages.slice(0, -1); // Remove the current message we just added
            for (const msg of historyMessages) {
                await memory.chatHistory.addMessage(msg);
            }
            // Create prompt template with current persona
            const prompt = this.createPromptTemplate(context, currentPersona);
            // Create conversation chain
            const chain = new chains_1.ConversationChain({
                llm: this.model,
                memory,
                prompt,
                verbose: false,
            });
            // Let LangChain handle the conversation naturally - no hardcoded logic
            // Generate response
            let response = await chain.predict({
                input: context.text,
            });
            // Process action tags in the response
            response = this.actionTagProcessor.processActionTags(response);
            // Enhance response with goal-driven follow-ups
            if (goalResult && goalResult.recommendations.length > 0) {
                const urgentGoal = goalResult.recommendations.find(r => r.shouldPursue && r.priority >= 4);
                if (urgentGoal) {
                    console.log(`🎯 Adding goal-driven follow-up: ${urgentGoal.goalId}`);
                    // Detect if user is being vague/disengaged
                    const isVague = /^(sounds good|great|ok|okay|sure|yes|yeah|cool|nice)\.?$/i.test(context.text.trim());
                    if (isVague) {
                        // Re-engage with a more direct approach
                        response = `${response}\n\n${urgentGoal.message}`;
                    }
                    else {
                        // Add natural follow-up
                        response = `${response} ${urgentGoal.message}`;
                    }
                }
            }
            // Skip saving AI response to DynamoDB - messaging service handles persistence via EventBridge
            // if (!existingHistory && this.config.dynamoService) {
            //   const sessionKey = `${context.tenantId}:${context.email_lc}:${context.conversation_id || 'default-session'}`;
            //   const chatHistoryForSaving = new KxDynamoChatHistory({
            //     tenantId: context.tenantId,
            //     emailLc: context.email_lc,
            //     dynamoService: this.config.dynamoService,
            //     historyLimit: this.config.historyLimit,
            //     conversationId: context.conversation_id,
            //   });
            //   
            //   const aiMessage = new AIMessage({
            //     content: response,
            //     additional_kwargs: {
            //       source: 'agent',
            //       model: this.config.bedrockModelId,
            //     },
            //   });
            //   await chatHistoryForSaving.addMessage(aiMessage);
            // }
            // For CLI mode, the calling code will handle adding the response to history
            // Emit trace event
            // Emit trace event for successful processing (only if eventBridgeService is available)
            if (this.config.eventBridgeService) {
                const duration = Date.now() - startTime;
                await this.config.eventBridgeService.publishAgentTrace(eventbridge_js_1.EventBridgeService.createAgentTraceEvent(context.tenantId, 'agent.message.processed', {
                    contactPk: dynamodb_js_1.DynamoDBService.createContactPK(context.tenantId, context.email_lc),
                    durationMs: duration,
                    metadata: {
                        source: context.source,
                        model: this.config.bedrockModelId,
                        message_length: context.text.length,
                        response_length: response.length,
                    },
                }));
            }
            return response;
        }
        catch (error) {
            // Emit error event (only if eventBridgeService is available)
            if (this.config.eventBridgeService) {
                await this.config.eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(context.tenantId, error instanceof Error ? error.message : 'Unknown error', {
                    contactPk: dynamodb_js_1.DynamoDBService.createContactPK(context.tenantId, context.email_lc),
                    stack: error instanceof Error ? error.stack : undefined,
                    context: {
                        source: context.source,
                        text_length: context.text.length,
                    },
                }));
            }
            throw error;
        }
    }
    /**
     * Process an agent context and generate chunked responses
     */
    async processMessageChunked(context) {
        // First get the full response
        const fullResponse = await this.processMessage(context);
        // Load persona for chunking configuration
        let currentPersona = this.persona;
        if (this.personaService) {
            try {
                currentPersona = await this.personaService.getPersona(context.tenantId, this.config.personaId || 'carlos', this.config.companyInfo);
            }
            catch (error) {
                console.warn(`Failed to load persona for chunking, using fallback:`, error);
                // Use PersonaService fallback to ensure goalConfiguration is loaded
                currentPersona = this.personaService.getDefaultPersona(this.config.personaId || 'carlos', this.config.companyInfo);
            }
        }
        // Chunk the response based on persona configuration and channel
        return response_chunker_js_1.ResponseChunker.chunkResponse(fullResponse, context.source, currentPersona.responseChunking);
    }
    /**
     * Create prompt template based on tenant and context
     */
    createPromptTemplate(context, persona) {
        // Use the provided persona or fall back to the instance persona
        const systemPrompt = this.getSystemPrompt(context, persona || this.persona);
        return prompts_1.PromptTemplate.fromTemplate(`${systemPrompt}

Current conversation:
{history}

Human: {input}
Assistant:`);
    }
    /**
     * Get system prompt based on persona and context
     */
    getSystemPrompt(context, persona) {
        // Use the persona's system prompt as the primary instruction
        return persona.systemPrompt;
    }
    /**
     * Process message and return structured response with metadata
     */
    async processMessageStructured(context) {
        const startTime = Date.now();
        try {
            const response = await this.processMessage(context);
            const processingTime = Date.now() - startTime;
            // Check if we detected an intent during processing
            let intentData;
            // Re-run intent detection to get the metadata (this is cached/fast)
            let currentPersona;
            if (this.personaService && this.config.personaId) {
                try {
                    currentPersona = await this.personaService.getPersona('default', this.config.personaId, this.config.companyInfo);
                }
                catch (error) {
                    currentPersona = (0, personas_js_1.getPersona)(this.config.personaId || 'carlos');
                }
            }
            else {
                currentPersona = (0, personas_js_1.getPersona)(this.config.personaId || 'carlos');
            }
            const intentMatch = await this.intentService.detectIntent(context.text, currentPersona, this.config.companyInfo || {
                name: 'Planet Fitness',
                industry: 'Fitness & Wellness',
                description: 'America\'s most popular gym with over 2,400 locations',
                products: 'Gym memberships, fitness equipment, group classes',
                benefits: 'Affordable pricing, judgment-free environment, convenient locations',
                targetCustomers: 'People of all fitness levels looking for an affordable, non-intimidating gym experience',
                differentiators: 'Low cost, no-judgment atmosphere, beginner-friendly environment'
            }, {
                tenantId: context.tenantId,
                userId: context.email_lc,
                sessionId: context.conversation_id,
                channel: context.source
            });
            if (intentMatch && intentMatch.confidence > 0.7) {
                intentData = {
                    id: intentMatch.intent.id,
                    name: intentMatch.intent.name,
                    confidence: intentMatch.confidence,
                    priority: intentMatch.intent.priority,
                    matchedTriggers: intentMatch.matchedTriggers,
                    matchedPatterns: intentMatch.matchedPatterns,
                    actions: intentMatch.actions
                };
            }
            return {
                success: true,
                message: response,
                intent: intentData,
                metadata: {
                    sessionId: context.conversation_id || 'unknown',
                    tenantId: context.tenantId,
                    userId: context.email_lc,
                    channel: context.source,
                    timestamp: new Date().toISOString(),
                    processingTimeMs: processingTime,
                    personaId: this.config.personaId,
                    companyName: this.config.companyInfo?.name
                },
                followUp: intentMatch?.followUp
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            return {
                success: false,
                message: 'I apologize, but I encountered an error processing your message. Please try again.',
                metadata: {
                    sessionId: context.conversation_id || 'unknown',
                    tenantId: context.tenantId,
                    userId: context.email_lc,
                    channel: context.source,
                    timestamp: new Date().toISOString(),
                    processingTimeMs: processingTime,
                    personaId: this.config.personaId,
                    companyName: this.config.companyInfo?.name
                },
                error: {
                    code: 'PROCESSING_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error
                }
            };
        }
    }
    /**
     * Determine preferred channel for response based on context and tenant preferences
     */
    determinePreferredChannel(context, tenantPreferences) {
        // Default to the originating channel
        if (tenantPreferences?.preferredChannel) {
            return tenantPreferences.preferredChannel;
        }
        return context.source;
    }
    /**
     * Create routing information for the response
     */
    createRoutingInfo(context, preferredChannel) {
        const routing = {};
        if (preferredChannel === 'sms' && context.channel_context?.sms) {
            routing.sms = { to: context.channel_context.sms.from };
        }
        else if (preferredChannel === 'email' && context.channel_context?.email) {
            routing.email = { to: context.channel_context.email.from };
        }
        else if (preferredChannel === 'chat' && context.channel_context?.chat) {
            routing.chat = { sessionId: context.channel_context.chat.sessionId };
        }
        return routing;
    }
}
exports.AgentService = AgentService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUFxRDtBQUNyRCw2Q0FBcUQ7QUFDckQsNkNBQWdEO0FBQ2hELHFEQUF5RDtBQUN6RCx1REFBZ0Y7QUFDaEYsdURBQXdEO0FBQ3hELHFFQUE2RDtBQUM3RCwrQ0FBZ0Q7QUFDaEQscURBQXNEO0FBQ3RELHVEQUFzRTtBQUN0RSw2REFBd0U7QUFDeEUsK0RBQTRFO0FBQzVFLDJEQUFzRTtBQUN0RSxpRUFBd0Y7QUFDeEYsdUVBQXFGO0FBQ3JGLDJFQUFzSDtBQWN0SDs7R0FFRztBQUNILE1BQWEsWUFBWTtJQVd2QixZQUFZLE1BQTBCO1FBQ3BDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLGtFQUFrRTtRQUNsRSxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLG1DQUFjLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsQ0FBQztRQUV2RSw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLGlDQUFhLEVBQUUsQ0FBQztRQUV6QywrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksdUNBQWdCLEVBQUUsQ0FBQztRQUUvQyxvRkFBb0Y7UUFDcEYsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksNENBQWtCLENBQUM7WUFDL0MsT0FBTyxFQUFFLEtBQUs7WUFDZCxRQUFRLEVBQUUsRUFBRTtZQUNaLGFBQWEsRUFBRSxJQUFJO1NBQ3BCLENBQUMsQ0FBQztRQUVILGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixJQUFJLElBQUksZ0RBQW9CLEVBQUUsQ0FBQztRQUV0RixvRUFBb0U7UUFDcEUsSUFBSSxDQUFDLGNBQWMsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFD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akIsQ0FBQztDQUNGO0FBL25CRCxvQ0ErbkJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ2hhdEJlZHJvY2tDb252ZXJzZSB9IGZyb20gJ0BsYW5nY2hhaW4vYXdzJztcbmltcG9ydCB7IENvbnZlcnNhdGlvbkNoYWluIH0gZnJvbSAnbGFuZ2NoYWluL2NoYWlucyc7XG5pbXBvcnQgeyBCdWZmZXJNZW1vcnkgfSBmcm9tICdsYW5nY2hhaW4vbWVtb3J5JztcbmltcG9ydCB7IFByb21wdFRlbXBsYXRlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL3Byb21wdHMnO1xuaW1wb3J0IHsgQmFzZU1lc3NhZ2UsIEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IEt4RHluYW1vQ2hhdEhpc3RvcnkgfSBmcm9tICcuL2NoYXQtaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBNZW1vcnlDaGF0SGlzdG9yeSB9IGZyb20gJy4vbWVtb3J5LWNoYXQtaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuL2R5bmFtb2RiLmpzJztcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4vZXZlbnRicmlkZ2UuanMnO1xuaW1wb3J0IHsgZ2V0UGVyc29uYSwgdHlwZSBBZ2VudFBlcnNvbmEgfSBmcm9tICcuLi9jb25maWcvcGVyc29uYXMuanMnO1xuaW1wb3J0IHsgUGVyc29uYVNlcnZpY2UsIHR5cGUgQ29tcGFueUluZm8gfSBmcm9tICcuL3BlcnNvbmEtc2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZUNodW5rZXIsIHR5cGUgUmVzcG9uc2VDaHVuayB9IGZyb20gJy4vcmVzcG9uc2UtY2h1bmtlci5qcyc7XG5pbXBvcnQgeyBJbnRlbnRTZXJ2aWNlLCB0eXBlIEludGVudE1hdGNoIH0gZnJvbSAnLi9pbnRlbnQtc2VydmljZS5qcyc7XG5pbXBvcnQgeyBHb2FsT3JjaGVzdHJhdG9yLCB0eXBlIEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0IH0gZnJvbSAnLi9nb2FsLW9yY2hlc3RyYXRvci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UYWdQcm9jZXNzb3IsIHR5cGUgQWN0aW9uVGFnQ29uZmlnIH0gZnJvbSAnLi9hY3Rpb24tdGFnLXByb2Nlc3Nvci5qcyc7XG5pbXBvcnQgeyBJbnRlbnRBY3Rpb25SZWdpc3RyeSwgdHlwZSBJbnRlbnRBY3Rpb25Db250ZXh0LCB0eXBlIEludGVudEFjdGlvblJlc3VsdCB9IGZyb20gJy4vaW50ZW50LWFjdGlvbi1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQZXJzb25hU3RvcmFnZSB9IGZyb20gJy4vcGVyc29uYS1zdG9yYWdlLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRDb250ZXh0LCBSdW50aW1lQ29uZmlnLCBNZXNzYWdlU291cmNlLCBBZ2VudFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50U2VydmljZUNvbmZpZyBleHRlbmRzIFJ1bnRpbWVDb25maWcge1xuICBkeW5hbW9TZXJ2aWNlPzogRHluYW1vREJTZXJ2aWNlO1xuICBldmVudEJyaWRnZVNlcnZpY2U/OiBFdmVudEJyaWRnZVNlcnZpY2U7XG4gIHBlcnNvbmFJZD86IHN0cmluZzsgLy8gQWdlbnQgcGVyc29uYSB0byB1c2UgKGRlZmF1bHRzIHRvICdjYXJsb3MnKVxuICBwZXJzb25hPzogYW55OyAvLyBQcmUtbG9hZGVkIHBlcnNvbmEgb2JqZWN0IChza2lwcyBwZXJzb25hIGxvYWRpbmcgaWYgcHJvdmlkZWQpXG4gIGludGVudEFjdGlvblJlZ2lzdHJ5PzogSW50ZW50QWN0aW9uUmVnaXN0cnk7XG4gIHBlcnNvbmFTdG9yYWdlPzogUGVyc29uYVN0b3JhZ2U7XG4gIGNvbXBhbnlJbmZvPzogQ29tcGFueUluZm87IC8vIENvbXBhbnkgaW5mb3JtYXRpb24gZm9yIHBlcnNvbmEgY3VzdG9taXphdGlvblxufVxuXG4vKipcbiAqIExhbmdDaGFpbiBhZ2VudCBzZXJ2aWNlIHRoYXQgcHJvY2Vzc2VzIG1lc3NhZ2VzIGFuZCBnZW5lcmF0ZXMgcmVzcG9uc2VzXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFNlcnZpY2Uge1xuICBwcml2YXRlIGNvbmZpZzogQWdlbnRTZXJ2aWNlQ29uZmlnO1xuICBwcml2YXRlIG1vZGVsOiBDaGF0QmVkcm9ja0NvbnZlcnNlO1xuICBwcml2YXRlIHBlcnNvbmE6IEFnZW50UGVyc29uYTtcbiAgcHJpdmF0ZSBwZXJzb25hU2VydmljZT86IFBlcnNvbmFTZXJ2aWNlO1xuICBwcml2YXRlIGludGVudFNlcnZpY2U6IEludGVudFNlcnZpY2U7XG4gIHByaXZhdGUgZ29hbE9yY2hlc3RyYXRvcjogR29hbE9yY2hlc3RyYXRvcjtcbiAgcHJpdmF0ZSBhY3Rpb25UYWdQcm9jZXNzb3I6IEFjdGlvblRhZ1Byb2Nlc3NvcjtcbiAgcHJpdmF0ZSBpbnRlbnRBY3Rpb25SZWdpc3RyeTogSW50ZW50QWN0aW9uUmVnaXN0cnk7XG4gIHByaXZhdGUgcGVyc29uYVN0b3JhZ2U/OiBQZXJzb25hU3RvcmFnZTtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IEFnZW50U2VydmljZUNvbmZpZykge1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIFxuICAgIC8vIEFsd2F5cyBpbml0aWFsaXplIHBlcnNvbmEgc2VydmljZSBmb3IgY29tcGFueSBpbmZvIHN1YnN0aXR1dGlvblxuICAgIC8vIFBhc3MgbnVsbCBmb3IgRHluYW1vREIgc2VydmljZSBpZiBub3QgYXZhaWxhYmxlXG4gICAgdGhpcy5wZXJzb25hU2VydmljZSA9IG5ldyBQZXJzb25hU2VydmljZShjb25maWcuZHluYW1vU2VydmljZSB8fCBudWxsKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIGludGVudCBzZXJ2aWNlXG4gICAgdGhpcy5pbnRlbnRTZXJ2aWNlID0gbmV3IEludGVudFNlcnZpY2UoKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIGdvYWwgb3JjaGVzdHJhdG9yXG4gICAgdGhpcy5nb2FsT3JjaGVzdHJhdG9yID0gbmV3IEdvYWxPcmNoZXN0cmF0b3IoKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIGFjdGlvbiB0YWcgcHJvY2Vzc29yIHdpdGggZGVmYXVsdCBjb25maWcgKHdpbGwgYmUgdXBkYXRlZCBwZXIgcGVyc29uYSlcbiAgICB0aGlzLmFjdGlvblRhZ1Byb2Nlc3NvciA9IG5ldyBBY3Rpb25UYWdQcm9jZXNzb3Ioe1xuICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICBtYXBwaW5nczoge30sXG4gICAgICBmYWxsYmFja0Vtb2ppOiAn8J+YiidcbiAgICB9KTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIGludGVudCBhY3Rpb24gcmVnaXN0cnkgKHVzZSBwcm92aWRlZCBvciBjcmVhdGUgbmV3KVxuICAgIHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkgPSBjb25maWcuaW50ZW50QWN0aW9uUmVnaXN0cnkgfHwgbmV3IEludGVudEFjdGlvblJlZ2lzdHJ5KCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBwZXJzb25hIHN0b3JhZ2UgKHVzZSBwcm92aWRlZCBvciBjcmVhdGUgd2l0aCBmYWxsYmFjaylcbiAgICB0aGlzLnBlcnNvbmFTdG9yYWdlID0gY29uZmlnLnBlcnNvbmFTdG9yYWdlO1xuICAgIFxuICAgIC8vIFBlcnNvbmEgd2lsbCBiZSBsb2FkZWQgcGVyLXJlcXVlc3Qgd2l0aCBjb21wYW55IGluZm8gc3Vic3RpdHV0aW9uXG4gICAgdGhpcy5wZXJzb25hID0ge30gYXMgQWdlbnRQZXJzb25hOyAvLyBXaWxsIGJlIGxvYWRlZCBwZXItcmVxdWVzdFxuICAgIFxuICAgIHRoaXMubW9kZWwgPSBuZXcgQ2hhdEJlZHJvY2tDb252ZXJzZSh7XG4gICAgICBtb2RlbDogY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgICAgcmVnaW9uOiBjb25maWcuYXdzUmVnaW9uLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgIG1heFRva2VuczogMTAwMCxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIGFuIGFnZW50IGNvbnRleHQgYW5kIGdlbmVyYXRlIGEgcmVzcG9uc2VcbiAgICogQHBhcmFtIGNvbnRleHQgLSBUaGUgYWdlbnQgY29udGV4dFxuICAgKiBAcGFyYW0gZXhpc3RpbmdIaXN0b3J5IC0gT3B0aW9uYWwgY2hhdCBoaXN0b3J5IChmb3IgQ0xJL2xvY2FsIHVzZSlcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlKGNvbnRleHQ6IEFnZW50Q29udGV4dCwgZXhpc3RpbmdIaXN0b3J5PzogQmFzZU1lc3NhZ2VbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgLy8gTG9hZCBwZXJzb25hIGZvciB0aGlzIHRlbmFudCB3aXRoIGNvbXBhbnkgaW5mbyBzdWJzdGl0dXRpb25cbiAgICAgIGxldCBjdXJyZW50UGVyc29uYSA9IHRoaXMucGVyc29uYTtcbiAgICAgIFxuICAgICAgLy8gVXNlIHByZS1sb2FkZWQgcGVyc29uYSBpZiBwcm92aWRlZCAoZnJvbSBoYW5kbGVyKVxuICAgICAgaWYgKHRoaXMuY29uZmlnLnBlcnNvbmEpIHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfkaQgVXNpbmcgcHJlLWxvYWRlZCBwZXJzb25hIGZyb20gY29uZmlnYCk7XG4gICAgICAgIGN1cnJlbnRQZXJzb25hID0gdGhpcy5jb25maWcucGVyc29uYSBhcyBBZ2VudFBlcnNvbmE7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMucGVyc29uYVNlcnZpY2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjdXJyZW50UGVyc29uYSA9IGF3YWl0IHRoaXMucGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYShcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsIFxuICAgICAgICAgICAgdGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnLFxuICAgICAgICAgICAgdGhpcy5jb25maWcuY29tcGFueUluZm9cbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUud2FybihgRmFpbGVkIHRvIGxvYWQgcGVyc29uYSAke3RoaXMuY29uZmlnLnBlcnNvbmFJZH0gZm9yIHRlbmFudCAke2NvbnRleHQudGVuYW50SWR9LCB1c2luZyBmYWxsYmFjazpgLCBlcnJvcik7XG4gICAgICAgICAgLy8gVXNlIFBlcnNvbmFTZXJ2aWNlIGZhbGxiYWNrIHRvIGVuc3VyZSBnb2FsQ29uZmlndXJhdGlvbiBpcyBsb2FkZWRcbiAgICAgICAgICBjdXJyZW50UGVyc29uYSA9IHRoaXMucGVyc29uYVNlcnZpY2UuZ2V0RGVmYXVsdFBlcnNvbmEodGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnLCB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ29uZmlndXJlIGFjdGlvbiB0YWcgcHJvY2Vzc29yIGJhc2VkIG9uIHBlcnNvbmFcbiAgICAgIGlmICgoY3VycmVudFBlcnNvbmEgYXMgYW55KS5hY3Rpb25UYWdzKSB7XG4gICAgICAgIGNvbnN0IGFjdGlvblRhZ0NvbmZpZyA9IChjdXJyZW50UGVyc29uYSBhcyBhbnkpLmFjdGlvblRhZ3MgYXMgQWN0aW9uVGFnQ29uZmlnO1xuICAgICAgICB0aGlzLmFjdGlvblRhZ1Byb2Nlc3NvciA9IG5ldyBBY3Rpb25UYWdQcm9jZXNzb3IoYWN0aW9uVGFnQ29uZmlnKTtcbiAgICAgIH1cblxuICAgICAgLy8gUnVuIGdvYWwgb3JjaGVzdHJhdGlvbiB0byBtYW5hZ2UgbGVhZCBxdWFsaWZpY2F0aW9uXG4gICAgICBsZXQgZ29hbFJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfCBudWxsID0gbnVsbDtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SNIEdvYWwgY29uZmlnIGVuYWJsZWQ6ICR7Y3VycmVudFBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24/LmVuYWJsZWR9LCBnb2FsczogJHtjdXJyZW50UGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbj8uZ29hbHM/Lmxlbmd0aCB8fCAwfWApO1xuICAgICAgXG4gICAgICBpZiAoY3VycmVudFBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24/LmVuYWJsZWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBnb2FsUmVzdWx0ID0gYXdhaXQgdGhpcy5nb2FsT3JjaGVzdHJhdG9yLm9yY2hlc3RyYXRlR29hbHMoXG4gICAgICAgICAgICBjb250ZXh0LnRleHQsXG4gICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCB8fCAnZGVmYXVsdCcsXG4gICAgICAgICAgICBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgIGN1cnJlbnRQZXJzb25hLmdvYWxDb25maWd1cmF0aW9uXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIC8vIExvZyBnb2FsIG9yY2hlc3RyYXRpb24gcmVzdWx0c1xuICAgICAgICAgIGlmIChnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm8gJiYgT2JqZWN0LmtleXMoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TpyBFeHRyYWN0ZWQgaW5mbzpgLCBnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm8pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gR29hbCByZWNvbW1lbmRhdGlvbnM6YCwgZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubWFwKHIgPT4gKHtcbiAgICAgICAgICAgICAgZ29hbDogci5nb2FsSWQsXG4gICAgICAgICAgICAgIHByaW9yaXR5OiByLnByaW9yaXR5LFxuICAgICAgICAgICAgICBzaG91bGRQdXJzdWU6IHIuc2hvdWxkUHVyc3VlLFxuICAgICAgICAgICAgICBhcHByb2FjaDogci5hcHByb2FjaFxuICAgICAgICAgICAgfSkpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIFRyaWdnZXJlZCBpbnRlbnRzOmAsIGdvYWxSZXN1bHQudHJpZ2dlcmVkSW50ZW50cyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFByb2Nlc3MgdHJpZ2dlcmVkIGludGVudHMgKGxpa2UgbGVhZF9nZW5lcmF0ZWQpXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRyaWdnZXJlZEludGVudElkIG9mIGdvYWxSZXN1bHQudHJpZ2dlcmVkSW50ZW50cykge1xuICAgICAgICAgICAgICBjb25zdCB0cmlnZ2VyZWRJbnRlbnQgPSBjdXJyZW50UGVyc29uYS5pbnRlbnRDYXB0dXJpbmc/LmludGVudHM/LmZpbmQoaSA9PiBpLmlkID09PSB0cmlnZ2VyZWRJbnRlbnRJZCk7XG4gICAgICAgICAgICAgIGlmICh0cmlnZ2VyZWRJbnRlbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+OiSBHT0FMIFRSSUdHRVJFRCBJTlRFTlQ6ICR7dHJpZ2dlcmVkSW50ZW50SWR9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAvLyBZb3UgY291bGQgcmV0dXJuIHRoZSB0cmlnZ2VyZWQgaW50ZW50IHJlc3BvbnNlIGhlcmUgaWYgZGVzaXJlZFxuICAgICAgICAgICAgICAgIC8vIEZvciBub3csIHdlJ2xsIGxldCB0aGUgbm9ybWFsIGZsb3cgY29udGludWUgYW5kIGFkZCBpdCBhcyBjb250ZXh0XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oJ0dvYWwgb3JjaGVzdHJhdGlvbiBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgZm9yIGludGVudCBtYXRjaGVzIGJlZm9yZSBwcm9jZXNzaW5nIHdpdGggTGFuZ0NoYWluXG4gICAgICBjb25zdCBpbnRlbnRNYXRjaCA9IGF3YWl0IHRoaXMuaW50ZW50U2VydmljZS5kZXRlY3RJbnRlbnQoXG4gICAgICAgIGNvbnRleHQudGV4dCxcbiAgICAgICAgY3VycmVudFBlcnNvbmEsXG4gICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvIHx8IHtcbiAgICAgICAgICBuYW1lOiAnUGxhbmV0IEZpdG5lc3MnLFxuICAgICAgICAgIGluZHVzdHJ5OiAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FtZXJpY2FcXCdzIG1vc3QgcG9wdWxhciBneW0gd2l0aCBvdmVyIDIsNDAwIGxvY2F0aW9ucycsXG4gICAgICAgICAgcHJvZHVjdHM6ICdHeW0gbWVtYmVyc2hpcHMsIGZpdG5lc3MgZXF1aXBtZW50LCBncm91cCBjbGFzc2VzJyxcbiAgICAgICAgICBiZW5lZml0czogJ0FmZm9yZGFibGUgcHJpY2luZywganVkZ21lbnQtZnJlZSBlbnZpcm9ubWVudCwgY29udmVuaWVudCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHRhcmdldEN1c3RvbWVyczogJ1Blb3BsZSBvZiBhbGwgZml0bmVzcyBsZXZlbHMgbG9va2luZyBmb3IgYW4gYWZmb3JkYWJsZSwgbm9uLWludGltaWRhdGluZyBneW0gZXhwZXJpZW5jZScsXG4gICAgICAgICAgZGlmZmVyZW50aWF0b3JzOiAnTG93IGNvc3QsIG5vLWp1ZGdtZW50IGF0bW9zcGhlcmUsIGJlZ2lubmVyLWZyaWVuZGx5IGVudmlyb25tZW50J1xuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgdXNlcklkOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UgYXMgc3RyaW5nXG4gICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIElmIHdlIGhhdmUgYSBoaWdoLWNvbmZpZGVuY2UgaW50ZW50IG1hdGNoLCB1c2UgdGhlIGludGVudCByZXNwb25zZVxuICAgICAgaWYgKGludGVudE1hdGNoICYmIGludGVudE1hdGNoLmNvbmZpZGVuY2UgPiAwLjcpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfjq8gSU5URU5UIERFVEVDVEVEOiAke2ludGVudE1hdGNoLmludGVudC5pZH0gKGNvbmZpZGVuY2U6ICR7KGludGVudE1hdGNoLmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMSl9JSlcXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTmFtZTogJHtpbnRlbnRNYXRjaC5pbnRlbnQubmFtZX1cXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgUHJpb3JpdHk6ICR7aW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5fVxceDFiWzBtYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBNYXRjaGVkIHRyaWdnZXJzOiAke2ludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2Vycy5qb2luKCcsICcpfVxceDFiWzBtYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBNYXRjaGVkIHBhdHRlcm5zOiAke2ludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucy5qb2luKCcsICcpfVxceDFiWzBtYCk7XG4gICAgICAgIGlmIChpbnRlbnRNYXRjaC5hY3Rpb25zICYmIGludGVudE1hdGNoLmFjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBBY3Rpb25zOiAke2ludGVudE1hdGNoLmFjdGlvbnMuam9pbignLCAnKX1cXHgxYlswbWApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRlIGludGVudCBhY3Rpb25zIGlmIHJlZ2lzdHJ5IGlzIGF2YWlsYWJsZVxuICAgICAgICBsZXQgaW50ZW50QWN0aW9uUmVzdWx0czogSW50ZW50QWN0aW9uUmVzdWx0W10gPSBbXTtcbiAgICAgICAgaWYgKHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYWN0aW9uQ29udGV4dDogSW50ZW50QWN0aW9uQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgaW50ZW50OiB7XG4gICAgICAgICAgICAgICAgaWQ6IGludGVudE1hdGNoLmludGVudC5pZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBpbnRlbnRNYXRjaC5pbnRlbnQubmFtZSxcbiAgICAgICAgICAgICAgICBjb25maWRlbmNlOiBpbnRlbnRNYXRjaC5jb25maWRlbmNlLFxuICAgICAgICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBhZ2VudENvbnRleHQ6IGNvbnRleHQsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkRGF0YTogZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbyB8fCB7fSxcbiAgICAgICAgICAgICAgY29udmVyc2F0aW9uOiB7XG4gICAgICAgICAgICAgICAgaWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZUNvdW50OiAxLCAvLyBUT0RPOiBHZXQgYWN0dWFsIG1lc3NhZ2UgY291bnRcbiAgICAgICAgICAgICAgICBoaXN0b3J5OiBbXSwgLy8gVE9ETzogR2V0IGNvbnZlcnNhdGlvbiBoaXN0b3J5XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgICBlbWFpbDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgICAgICBwaG9uZTogZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8ucGhvbmU/LnZhbHVlLFxuICAgICAgICAgICAgICAgIG5hbWU6IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LmZpcnN0TmFtZT8udmFsdWUgfHwgZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8uZnVsbE5hbWU/LnZhbHVlLFxuICAgICAgICAgICAgICAgIGxlYWRJZDogY29udGV4dC5sZWFkX2lkLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB0ZW5hbnQ6IHtcbiAgICAgICAgICAgICAgICBpZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgICBjb21wYW55SW5mbzogdGhpcy5jb25maWcuY29tcGFueUluZm8sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGNoYW5uZWw6IHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaW50ZW50QWN0aW9uUmVzdWx0cyA9IGF3YWl0IHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkuZXhlY3V0ZUFjdGlvbnMoYWN0aW9uQ29udGV4dCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIExvZyBhY3Rpb24gcmVzdWx0c1xuICAgICAgICAgICAgaWYgKGludGVudEFjdGlvblJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+agCBJTlRFTlQgQUNUSU9OUyBFWEVDVVRFRDogJHtpbnRlbnRBY3Rpb25SZXN1bHRzLmxlbmd0aH0gYWN0aW9uc1xceDFiWzBtYCk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGludGVudEFjdGlvblJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMm0gICDinIUgJHtyZXN1bHQubWV0YWRhdGE/LmFjdGlvbk5hbWUgfHwgJ1Vua25vd24nfTogU3VjY2Vzc1xceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Lm1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMybSAgICAgIE1lc3NhZ2U6ICR7cmVzdWx0Lm1lc3NhZ2V9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIOKdjCAke3Jlc3VsdC5tZXRhZGF0YT8uYWN0aW9uTmFtZSB8fCAnVW5rbm93bid9OiBGYWlsZWRcXHgxYlswbWApO1xuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgICAgRXJyb3I6ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignSW50ZW50IGFjdGlvbiBleGVjdXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRyYWNrIHRoZSBpbnRlbnQgcmVzcG9uc2VcbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRUcmFjZSh7XG4gICAgICAgICAgICBzb3VyY2U6ICdreGdlbi5hZ2VudCcsXG4gICAgICAgICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQudHJhY2UnLFxuICAgICAgICAgICAgZGV0YWlsOiB7XG4gICAgICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgICBvcGVyYXRpb246ICdpbnRlbnRfbWF0Y2gnLFxuICAgICAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgICAgIGludGVudElkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICAgICAgICBtYXRjaGVkVHJpZ2dlcnM6IGludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2VycyxcbiAgICAgICAgICAgICAgICBtYXRjaGVkUGF0dGVybnM6IGludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucyxcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBpbnRlbnRNYXRjaC5hY3Rpb25zLFxuICAgICAgICAgICAgICAgIGFjdGlvblJlc3VsdHM6IGludGVudEFjdGlvblJlc3VsdHMubWFwKHIgPT4gKHtcbiAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHIuc3VjY2VzcyxcbiAgICAgICAgICAgICAgICAgIGFjdGlvbklkOiByLm1ldGFkYXRhPy5hY3Rpb25JZCxcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHIubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgIGVycm9yOiByLmVycm9yPy5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHBlcnNvbmFfaGFuZGxlZCBpbnRlbnQgKGVtcHR5IHJlc3BvbnNlIG1lYW5zIGxldCBwZXJzb25hIGhhbmRsZSBpdClcbiAgICAgICAgaWYgKCFpbnRlbnRNYXRjaC5yZXNwb25zZSB8fCBpbnRlbnRNYXRjaC5yZXNwb25zZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gSW50ZW50IGRldGVjdGVkIGJ1dCBwZXJzb25hX2hhbmRsZWQgLSBsZXR0aW5nIENhcmxvcyByZXNwb25kIG5hdHVyYWxseWApO1xuICAgICAgICAgIC8vIERvbid0IHJldHVybiBlYXJseSAtIGxldCB0aGUgbm9ybWFsIExhbmdDaGFpbiBmbG93IGhhbmRsZSB0aGlzIHdpdGggdGhlIHBlcnNvbmEncyBydWxlc1xuICAgICAgICAgIC8vIFRoZSBpbnRlbnQgZGV0ZWN0aW9uIGluZm8gaXMgbG9nZ2VkIGFib3ZlIGZvciB0cmFja2luZyBwdXJwb3Nlc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEhhbmRsZSBpbnRlbnRzIHdpdGggdGVtcGxhdGVkIHJlc3BvbnNlcyAobGlrZSBvcGVyYXRpb25hbCBob3VycylcbiAgICAgICAgICBsZXQgcmVzcG9uc2UgPSBpbnRlbnRNYXRjaC5yZXNwb25zZTtcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdCAmJiBnb2FsUmVzdWx0LnJlY29tbWVuZGF0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBoaWdoUHJpb3JpdHlHb2FsID0gZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMuZmluZChyID0+IHIuc2hvdWxkUHVyc3VlICYmIHIucHJpb3JpdHkgPj0gNCk7XG4gICAgICAgICAgICBpZiAoaGlnaFByaW9yaXR5R29hbCkge1xuICAgICAgICAgICAgICByZXNwb25zZSArPSBgXFxuXFxuJHtoaWdoUHJpb3JpdHlHb2FsLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQWRkIGZvbGxvdy11cCBpZiBhdmFpbGFibGVcbiAgICAgICAgICBpZiAoaW50ZW50TWF0Y2guZm9sbG93VXApIHtcbiAgICAgICAgICAgIHJlc3BvbnNlICs9ICdcXG5cXG4nICsgaW50ZW50TWF0Y2guZm9sbG93VXAuam9pbignICcpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIGNoYXQgaGlzdG9yeSAtIGVpdGhlciBmcm9tIGV4aXN0aW5nIGhpc3RvcnkgKENMSSkgb3IgZnJvbSBzdG9yYWdlIChMYW1iZGEpXG4gICAgICBsZXQgbWVzc2FnZXM6IEJhc2VNZXNzYWdlW107XG4gICAgICBcbiAgICAgIGlmIChleGlzdGluZ0hpc3RvcnkpIHtcbiAgICAgICAgLy8gQ0xJL0xvY2FsIG1vZGU6IFVzZSBwcm92aWRlZCBoaXN0b3J5XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFVzaW5nIHByb3ZpZGVkIGNoYXQgaGlzdG9yeTogJHtleGlzdGluZ0hpc3RvcnkubGVuZ3RofSBtZXNzYWdlc2ApO1xuICAgICAgICBtZXNzYWdlcyA9IGV4aXN0aW5nSGlzdG9yeTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBjdXJyZW50IG1lc3NhZ2UgdG8gdGhlIHByb3ZpZGVkIGhpc3RvcnlcbiAgICAgICAgY29uc3QgaW5jb21pbmdNZXNzYWdlID0gbmV3IEh1bWFuTWVzc2FnZSh7XG4gICAgICAgICAgY29udGVudDogY29udGV4dC50ZXh0LFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBjb250ZXh0LmNoYW5uZWxfY29udGV4dCxcbiAgICAgICAgICAgIGxlYWRfaWQ6IGNvbnRleHQubGVhZF9pZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgbWVzc2FnZXMucHVzaChpbmNvbWluZ01lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTGFtYmRhIG1vZGU6IExvYWQgZnJvbSBEeW5hbW9EQiBvciBjcmVhdGUgbmV3XG4gICAgICAgIGNvbnN0IHNlc3Npb25LZXkgPSBgJHtjb250ZXh0LnRlbmFudElkfToke2NvbnRleHQuZW1haWxfbGN9OiR7Y29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ2RlZmF1bHQtc2Vzc2lvbid9YDtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gTGFtYmRhIG1vZGUgLSBTZXNzaW9uIEtleTogJHtzZXNzaW9uS2V5fWApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY2hhdEhpc3RvcnkgPSB0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlIFxuICAgICAgICAgID8gbmV3IEt4RHluYW1vQ2hhdEhpc3Rvcnkoe1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgZW1haWxMYzogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgICAgZHluYW1vU2VydmljZTogdGhpcy5jb25maWcuZHluYW1vU2VydmljZSxcbiAgICAgICAgICAgICAgaGlzdG9yeUxpbWl0OiB0aGlzLmNvbmZpZy5oaXN0b3J5TGltaXQsXG4gICAgICAgICAgICAgIGNvbnZlcnNhdGlvbklkOiBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgOiBuZXcgTWVtb3J5Q2hhdEhpc3Rvcnkoc2Vzc2lvbktleSk7XG5cbiAgICAgICAgLy8gQWRkIHRoZSBpbmNvbWluZyBtZXNzYWdlIHRvIGhpc3RvcnlcbiAgICAgICAgY29uc3QgaW5jb21pbmdNZXNzYWdlID0gbmV3IEh1bWFuTWVzc2FnZSh7XG4gICAgICAgICAgY29udGVudDogY29udGV4dC50ZXh0LFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBjb250ZXh0LmNoYW5uZWxfY29udGV4dCxcbiAgICAgICAgICAgIGxlYWRfaWQ6IGNvbnRleHQubGVhZF9pZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgLy8gU2tpcCBhZGRpbmcgdG8gRHluYW1vREIgLSBtZXNzYWdpbmcgc2VydmljZSBoYW5kbGVzIHBlcnNpc3RlbmNlXG4gICAgICAgIC8vIGF3YWl0IGNoYXRIaXN0b3J5LmFkZE1lc3NhZ2UoaW5jb21pbmdNZXNzYWdlKTtcblxuICAgICAgICAvLyBHZXQgY29udmVyc2F0aW9uIGhpc3RvcnkgZnJvbSBzdG9yYWdlXG4gICAgICAgIG1lc3NhZ2VzID0gdGhpcy5jb25maWcuZHluYW1vU2VydmljZSBcbiAgICAgICAgICA/IGF3YWl0IChjaGF0SGlzdG9yeSBhcyBLeER5bmFtb0NoYXRIaXN0b3J5KS5nZXRNZXNzYWdlc1dpdGhUb2tlbkVzdGltYXRlKDMwMDApXG4gICAgICAgICAgOiBhd2FpdCAoY2hhdEhpc3RvcnkgYXMgTWVtb3J5Q2hhdEhpc3RvcnkpLmdldFJlY2VudE1lc3NhZ2VzKDMwMDApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBERUJVRzogQ2hlY2sgaWYgaGlzdG9yeSBpcyB3b3JraW5nXG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBDaGF0IEhpc3RvcnkgRGVidWc6YCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgTWVzc2FnZXMgaW4gaGlzdG9yeTogJHttZXNzYWdlcy5sZW5ndGh9YCk7XG4gICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBsYXN0TWVzc2FnZSA9IG1lc3NhZ2VzW21lc3NhZ2VzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdHlwZW9mIGxhc3RNZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbGFzdE1lc3NhZ2UuY29udGVudCA6IEpTT04uc3RyaW5naWZ5KGxhc3RNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgTGFzdCBtZXNzYWdlOiAke2NvbnRlbnQuc3Vic3RyaW5nKDAsIDUwKX0uLi5gKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIG1lbW9yeSB3aXRoIG1lc3NhZ2VzXG4gICAgICBjb25zdCBtZW1vcnkgPSBuZXcgQnVmZmVyTWVtb3J5KHtcbiAgICAgICAgcmV0dXJuTWVzc2FnZXM6IHRydWUsXG4gICAgICAgIG1lbW9yeUtleTogJ2hpc3RvcnknLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIEFkZCBleGlzdGluZyBtZXNzYWdlcyB0byBtZW1vcnkgKGV4Y2x1ZGluZyB0aGUgY3VycmVudCBtZXNzYWdlIHdlIGp1c3QgYWRkZWQpXG4gICAgICAvLyBOb3RlOiBUaGlzIGFkZHMgdG8gaW4tbWVtb3J5IGNoYXQgaGlzdG9yeSBmb3IgdGhlIExhbmdDaGFpbiBjb252ZXJzYXRpb24sIE5PVCBEeW5hbW9EQlxuICAgICAgY29uc3QgaGlzdG9yeU1lc3NhZ2VzID0gbWVzc2FnZXMuc2xpY2UoMCwgLTEpOyAvLyBSZW1vdmUgdGhlIGN1cnJlbnQgbWVzc2FnZSB3ZSBqdXN0IGFkZGVkXG4gICAgICBmb3IgKGNvbnN0IG1zZyBvZiBoaXN0b3J5TWVzc2FnZXMpIHtcbiAgICAgICAgYXdhaXQgbWVtb3J5LmNoYXRIaXN0b3J5LmFkZE1lc3NhZ2UobXNnKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIHByb21wdCB0ZW1wbGF0ZSB3aXRoIGN1cnJlbnQgcGVyc29uYVxuICAgICAgY29uc3QgcHJvbXB0ID0gdGhpcy5jcmVhdGVQcm9tcHRUZW1wbGF0ZShjb250ZXh0LCBjdXJyZW50UGVyc29uYSk7XG5cbiAgICAgIC8vIENyZWF0ZSBjb252ZXJzYXRpb24gY2hhaW5cbiAgICAgIGNvbnN0IGNoYWluID0gbmV3IENvbnZlcnNhdGlvbkNoYWluKHtcbiAgICAgICAgbGxtOiB0aGlzLm1vZGVsLFxuICAgICAgICBtZW1vcnksXG4gICAgICAgIHByb21wdCxcbiAgICAgICAgdmVyYm9zZTogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gTGV0IExhbmdDaGFpbiBoYW5kbGUgdGhlIGNvbnZlcnNhdGlvbiBuYXR1cmFsbHkgLSBubyBoYXJkY29kZWQgbG9naWNcblxuICAgICAgLy8gR2VuZXJhdGUgcmVzcG9uc2VcbiAgICAgIGxldCByZXNwb25zZSA9IGF3YWl0IGNoYWluLnByZWRpY3Qoe1xuICAgICAgICBpbnB1dDogY29udGV4dC50ZXh0LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFByb2Nlc3MgYWN0aW9uIHRhZ3MgaW4gdGhlIHJlc3BvbnNlXG4gICAgICByZXNwb25zZSA9IHRoaXMuYWN0aW9uVGFnUHJvY2Vzc29yLnByb2Nlc3NBY3Rpb25UYWdzKHJlc3BvbnNlKTtcblxuICAgICAgLy8gRW5oYW5jZSByZXNwb25zZSB3aXRoIGdvYWwtZHJpdmVuIGZvbGxvdy11cHNcbiAgICAgIGlmIChnb2FsUmVzdWx0ICYmIGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgdXJnZW50R29hbCA9IGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLmZpbmQociA9PiByLnNob3VsZFB1cnN1ZSAmJiByLnByaW9yaXR5ID49IDQpO1xuICAgICAgICBpZiAodXJnZW50R29hbCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46vIEFkZGluZyBnb2FsLWRyaXZlbiBmb2xsb3ctdXA6ICR7dXJnZW50R29hbC5nb2FsSWR9YCk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gRGV0ZWN0IGlmIHVzZXIgaXMgYmVpbmcgdmFndWUvZGlzZW5nYWdlZFxuICAgICAgICAgIGNvbnN0IGlzVmFndWUgPSAvXihzb3VuZHMgZ29vZHxncmVhdHxva3xva2F5fHN1cmV8eWVzfHllYWh8Y29vbHxuaWNlKVxcLj8kL2kudGVzdChjb250ZXh0LnRleHQudHJpbSgpKTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoaXNWYWd1ZSkge1xuICAgICAgICAgICAgLy8gUmUtZW5nYWdlIHdpdGggYSBtb3JlIGRpcmVjdCBhcHByb2FjaFxuICAgICAgICAgICAgcmVzcG9uc2UgPSBgJHtyZXNwb25zZX1cXG5cXG4ke3VyZ2VudEdvYWwubWVzc2FnZX1gO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBBZGQgbmF0dXJhbCBmb2xsb3ctdXBcbiAgICAgICAgICAgIHJlc3BvbnNlID0gYCR7cmVzcG9uc2V9ICR7dXJnZW50R29hbC5tZXNzYWdlfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFNraXAgc2F2aW5nIEFJIHJlc3BvbnNlIHRvIER5bmFtb0RCIC0gbWVzc2FnaW5nIHNlcnZpY2UgaGFuZGxlcyBwZXJzaXN0ZW5jZSB2aWEgRXZlbnRCcmlkZ2VcbiAgICAgIC8vIGlmICghZXhpc3RpbmdIaXN0b3J5ICYmIHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UpIHtcbiAgICAgIC8vICAgY29uc3Qgc2Vzc2lvbktleSA9IGAke2NvbnRleHQudGVuYW50SWR9OiR7Y29udGV4dC5lbWFpbF9sY306JHtjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCB8fCAnZGVmYXVsdC1zZXNzaW9uJ31gO1xuICAgICAgLy8gICBjb25zdCBjaGF0SGlzdG9yeUZvclNhdmluZyA9IG5ldyBLeER5bmFtb0NoYXRIaXN0b3J5KHtcbiAgICAgIC8vICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgIC8vICAgICBlbWFpbExjOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgLy8gICAgIGR5bmFtb1NlcnZpY2U6IHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UsXG4gICAgICAvLyAgICAgaGlzdG9yeUxpbWl0OiB0aGlzLmNvbmZpZy5oaXN0b3J5TGltaXQsXG4gICAgICAvLyAgICAgY29udmVyc2F0aW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgLy8gICB9KTtcbiAgICAgIC8vICAgXG4gICAgICAvLyAgIGNvbnN0IGFpTWVzc2FnZSA9IG5ldyBBSU1lc3NhZ2Uoe1xuICAgICAgLy8gICAgIGNvbnRlbnQ6IHJlc3BvbnNlLFxuICAgICAgLy8gICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAvLyAgICAgICBzb3VyY2U6ICdhZ2VudCcsXG4gICAgICAvLyAgICAgICBtb2RlbDogdGhpcy5jb25maWcuYmVkcm9ja01vZGVsSWQsXG4gICAgICAvLyAgICAgfSxcbiAgICAgIC8vICAgfSk7XG4gICAgICAvLyAgIGF3YWl0IGNoYXRIaXN0b3J5Rm9yU2F2aW5nLmFkZE1lc3NhZ2UoYWlNZXNzYWdlKTtcbiAgICAgIC8vIH1cbiAgICAgIC8vIEZvciBDTEkgbW9kZSwgdGhlIGNhbGxpbmcgY29kZSB3aWxsIGhhbmRsZSBhZGRpbmcgdGhlIHJlc3BvbnNlIHRvIGhpc3RvcnlcblxuICAgICAgLy8gRW1pdCB0cmFjZSBldmVudFxuICAgICAgLy8gRW1pdCB0cmFjZSBldmVudCBmb3Igc3VjY2Vzc2Z1bCBwcm9jZXNzaW5nIChvbmx5IGlmIGV2ZW50QnJpZGdlU2VydmljZSBpcyBhdmFpbGFibGUpXG4gICAgICBpZiAodGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlKSB7XG4gICAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgYXdhaXQgdGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudFRyYWNlKFxuICAgICAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudFRyYWNlRXZlbnQoXG4gICAgICAgICAgICBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgJ2FnZW50Lm1lc3NhZ2UucHJvY2Vzc2VkJyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY29udGFjdFBrOiBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGNvbnRleHQudGVuYW50SWQsIGNvbnRleHQuZW1haWxfbGMpLFxuICAgICAgICAgICAgICBkdXJhdGlvbk1zOiBkdXJhdGlvbixcbiAgICAgICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgICAgIG1vZGVsOiB0aGlzLmNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlX2xlbmd0aDogY29udGV4dC50ZXh0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICByZXNwb25zZV9sZW5ndGg6IHJlc3BvbnNlLmxlbmd0aCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gRW1pdCBlcnJvciBldmVudCAob25seSBpZiBldmVudEJyaWRnZVNlcnZpY2UgaXMgYXZhaWxhYmxlKVxuICAgICAgaWYgKHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZSkge1xuICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXG4gICAgICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50RXJyb3JFdmVudChcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY29udGFjdFBrOiBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGNvbnRleHQudGVuYW50SWQsIGNvbnRleHQuZW1haWxfbGMpLFxuICAgICAgICAgICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb250ZXh0OiB7XG4gICAgICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgICAgICB0ZXh0X2xlbmd0aDogY29udGV4dC50ZXh0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIGFuIGFnZW50IGNvbnRleHQgYW5kIGdlbmVyYXRlIGNodW5rZWQgcmVzcG9uc2VzXG4gICAqL1xuICBhc3luYyBwcm9jZXNzTWVzc2FnZUNodW5rZWQoY29udGV4dDogQWdlbnRDb250ZXh0KTogUHJvbWlzZTxSZXNwb25zZUNodW5rW10+IHtcbiAgICAvLyBGaXJzdCBnZXQgdGhlIGZ1bGwgcmVzcG9uc2VcbiAgICBjb25zdCBmdWxsUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnByb2Nlc3NNZXNzYWdlKGNvbnRleHQpO1xuICAgIFxuICAgIC8vIExvYWQgcGVyc29uYSBmb3IgY2h1bmtpbmcgY29uZmlndXJhdGlvblxuICAgIGxldCBjdXJyZW50UGVyc29uYSA9IHRoaXMucGVyc29uYTtcbiAgICBpZiAodGhpcy5wZXJzb25hU2VydmljZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY3VycmVudFBlcnNvbmEgPSBhd2FpdCB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEoXG4gICAgICAgICAgY29udGV4dC50ZW5hbnRJZCwgXG4gICAgICAgICAgdGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnLFxuICAgICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHBlcnNvbmEgZm9yIGNodW5raW5nLCB1c2luZyBmYWxsYmFjazpgLCBlcnJvcik7XG4gICAgICAgIC8vIFVzZSBQZXJzb25hU2VydmljZSBmYWxsYmFjayB0byBlbnN1cmUgZ29hbENvbmZpZ3VyYXRpb24gaXMgbG9hZGVkXG4gICAgICAgIGN1cnJlbnRQZXJzb25hID0gdGhpcy5wZXJzb25hU2VydmljZS5nZXREZWZhdWx0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycsIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaHVuayB0aGUgcmVzcG9uc2UgYmFzZWQgb24gcGVyc29uYSBjb25maWd1cmF0aW9uIGFuZCBjaGFubmVsXG4gICAgcmV0dXJuIFJlc3BvbnNlQ2h1bmtlci5jaHVua1Jlc3BvbnNlKFxuICAgICAgZnVsbFJlc3BvbnNlLFxuICAgICAgY29udGV4dC5zb3VyY2UsXG4gICAgICBjdXJyZW50UGVyc29uYS5yZXNwb25zZUNodW5raW5nXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgcHJvbXB0IHRlbXBsYXRlIGJhc2VkIG9uIHRlbmFudCBhbmQgY29udGV4dFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVQcm9tcHRUZW1wbGF0ZShjb250ZXh0OiBBZ2VudENvbnRleHQsIHBlcnNvbmE/OiBBZ2VudFBlcnNvbmEpOiBQcm9tcHRUZW1wbGF0ZSB7XG4gICAgLy8gVXNlIHRoZSBwcm92aWRlZCBwZXJzb25hIG9yIGZhbGwgYmFjayB0byB0aGUgaW5zdGFuY2UgcGVyc29uYVxuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IHRoaXMuZ2V0U3lzdGVtUHJvbXB0KGNvbnRleHQsIHBlcnNvbmEgfHwgdGhpcy5wZXJzb25hKTtcbiAgICBcbiAgICByZXR1cm4gUHJvbXB0VGVtcGxhdGUuZnJvbVRlbXBsYXRlKGAke3N5c3RlbVByb21wdH1cblxuQ3VycmVudCBjb252ZXJzYXRpb246XG57aGlzdG9yeX1cblxuSHVtYW46IHtpbnB1dH1cbkFzc2lzdGFudDpgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc3lzdGVtIHByb21wdCBiYXNlZCBvbiBwZXJzb25hIGFuZCBjb250ZXh0XG4gICAqL1xuICBwcml2YXRlIGdldFN5c3RlbVByb21wdChjb250ZXh0OiBBZ2VudENvbnRleHQsIHBlcnNvbmE6IEFnZW50UGVyc29uYSk6IHN0cmluZyB7XG4gICAgLy8gVXNlIHRoZSBwZXJzb25hJ3Mgc3lzdGVtIHByb21wdCBhcyB0aGUgcHJpbWFyeSBpbnN0cnVjdGlvblxuICAgIHJldHVybiBwZXJzb25hLnN5c3RlbVByb21wdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIG1lc3NhZ2UgYW5kIHJldHVybiBzdHJ1Y3R1cmVkIHJlc3BvbnNlIHdpdGggbWV0YWRhdGFcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlU3RydWN0dXJlZChjb250ZXh0OiBBZ2VudENvbnRleHQpOiBQcm9taXNlPEFnZW50UmVzcG9uc2U+IHtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgICBjb25zdCBwcm9jZXNzaW5nVGltZSA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGlmIHdlIGRldGVjdGVkIGFuIGludGVudCBkdXJpbmcgcHJvY2Vzc2luZ1xuICAgICAgbGV0IGludGVudERhdGE6IEFnZW50UmVzcG9uc2VbJ2ludGVudCddIHwgdW5kZWZpbmVkO1xuICAgICAgXG4gICAgICAvLyBSZS1ydW4gaW50ZW50IGRldGVjdGlvbiB0byBnZXQgdGhlIG1ldGFkYXRhICh0aGlzIGlzIGNhY2hlZC9mYXN0KVxuICAgICAgbGV0IGN1cnJlbnRQZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gICAgICBpZiAodGhpcy5wZXJzb25hU2VydmljZSAmJiB0aGlzLmNvbmZpZy5wZXJzb25hSWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjdXJyZW50UGVyc29uYSA9IGF3YWl0IHRoaXMucGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYSgnZGVmYXVsdCcsIHRoaXMuY29uZmlnLnBlcnNvbmFJZCwgdGhpcy5jb25maWcuY29tcGFueUluZm8pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGN1cnJlbnRQZXJzb25hID0gZ2V0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50UGVyc29uYSA9IGdldFBlcnNvbmEodGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW50ZW50TWF0Y2ggPSBhd2FpdCB0aGlzLmludGVudFNlcnZpY2UuZGV0ZWN0SW50ZW50KFxuICAgICAgICBjb250ZXh0LnRleHQsXG4gICAgICAgIGN1cnJlbnRQZXJzb25hLFxuICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyB8fCB7XG4gICAgICAgICAgbmFtZTogJ1BsYW5ldCBGaXRuZXNzJyxcbiAgICAgICAgICBpbmR1c3RyeTogJ0ZpdG5lc3MgJiBXZWxsbmVzcycsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdBbWVyaWNhXFwncyBtb3N0IHBvcHVsYXIgZ3ltIHdpdGggb3ZlciAyLDQwMCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHByb2R1Y3RzOiAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgICAgICAgYmVuZWZpdHM6ICdBZmZvcmRhYmxlIHByaWNpbmcsIGp1ZGdtZW50LWZyZWUgZW52aXJvbm1lbnQsIGNvbnZlbmllbnQgbG9jYXRpb25zJyxcbiAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdQZW9wbGUgb2YgYWxsIGZpdG5lc3MgbGV2ZWxzIGxvb2tpbmcgZm9yIGFuIGFmZm9yZGFibGUsIG5vbi1pbnRpbWlkYXRpbmcgZ3ltIGV4cGVyaWVuY2UnLFxuICAgICAgICAgIGRpZmZlcmVudGlhdG9yczogJ0xvdyBjb3N0LCBuby1qdWRnbWVudCBhdG1vc3BoZXJlLCBiZWdpbm5lci1mcmllbmRseSBlbnZpcm9ubWVudCdcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgIGNoYW5uZWw6IGNvbnRleHQuc291cmNlIGFzIHN0cmluZ1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICBpZiAoaW50ZW50TWF0Y2ggJiYgaW50ZW50TWF0Y2guY29uZmlkZW5jZSA+IDAuNykge1xuICAgICAgICBpbnRlbnREYXRhID0ge1xuICAgICAgICAgIGlkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgbmFtZTogaW50ZW50TWF0Y2guaW50ZW50Lm5hbWUsXG4gICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICBwcmlvcml0eTogaW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5LFxuICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgIG1hdGNoZWRQYXR0ZXJuczogaW50ZW50TWF0Y2gubWF0Y2hlZFBhdHRlcm5zLFxuICAgICAgICAgIGFjdGlvbnM6IGludGVudE1hdGNoLmFjdGlvbnNcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UsXG4gICAgICAgIGludGVudDogaW50ZW50RGF0YSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICB1c2VySWQ6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogcHJvY2Vzc2luZ1RpbWUsXG4gICAgICAgICAgcGVyc29uYUlkOiB0aGlzLmNvbmZpZy5wZXJzb25hSWQsXG4gICAgICAgICAgY29tcGFueU5hbWU6IHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvPy5uYW1lXG4gICAgICAgIH0sXG4gICAgICAgIGZvbGxvd1VwOiBpbnRlbnRNYXRjaD8uZm9sbG93VXBcbiAgICAgIH07XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgcHJvY2Vzc2luZ1RpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogJ0kgYXBvbG9naXplLCBidXQgSSBlbmNvdW50ZXJlZCBhbiBlcnJvciBwcm9jZXNzaW5nIHlvdXIgbWVzc2FnZS4gUGxlYXNlIHRyeSBhZ2Fpbi4nLFxuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBjaGFubmVsOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICBwcm9jZXNzaW5nVGltZU1zOiBwcm9jZXNzaW5nVGltZSxcbiAgICAgICAgICBwZXJzb25hSWQ6IHRoaXMuY29uZmlnLnBlcnNvbmFJZCxcbiAgICAgICAgICBjb21wYW55TmFtZTogdGhpcy5jb25maWcuY29tcGFueUluZm8/Lm5hbWVcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICBjb2RlOiAnUFJPQ0VTU0lOR19FUlJPUicsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgICAgZGV0YWlsczogZXJyb3JcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lIHByZWZlcnJlZCBjaGFubmVsIGZvciByZXNwb25zZSBiYXNlZCBvbiBjb250ZXh0IGFuZCB0ZW5hbnQgcHJlZmVyZW5jZXNcbiAgICovXG4gIGRldGVybWluZVByZWZlcnJlZENoYW5uZWwoY29udGV4dDogQWdlbnRDb250ZXh0LCB0ZW5hbnRQcmVmZXJlbmNlcz86IFJlY29yZDxzdHJpbmcsIGFueT4pOiBNZXNzYWdlU291cmNlIHtcbiAgICAvLyBEZWZhdWx0IHRvIHRoZSBvcmlnaW5hdGluZyBjaGFubmVsXG4gICAgaWYgKHRlbmFudFByZWZlcmVuY2VzPy5wcmVmZXJyZWRDaGFubmVsKSB7XG4gICAgICByZXR1cm4gdGVuYW50UHJlZmVyZW5jZXMucHJlZmVycmVkQ2hhbm5lbCBhcyBNZXNzYWdlU291cmNlO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY29udGV4dC5zb3VyY2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHJvdXRpbmcgaW5mb3JtYXRpb24gZm9yIHRoZSByZXNwb25zZVxuICAgKi9cbiAgY3JlYXRlUm91dGluZ0luZm8oY29udGV4dDogQWdlbnRDb250ZXh0LCBwcmVmZXJyZWRDaGFubmVsOiBNZXNzYWdlU291cmNlKToge1xuICAgIHNtcz86IHsgdG86IHN0cmluZyB9O1xuICAgIGVtYWlsPzogeyB0bzogc3RyaW5nIH07XG4gICAgY2hhdD86IHsgc2Vzc2lvbklkOiBzdHJpbmcgfTtcbiAgfSB7XG4gICAgY29uc3Qgcm91dGluZzogYW55ID0ge307XG4gICAgXG4gICAgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdzbXMnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5zbXMpIHtcbiAgICAgIHJvdXRpbmcuc21zID0geyB0bzogY29udGV4dC5jaGFubmVsX2NvbnRleHQuc21zLmZyb20gfTtcbiAgICB9IGVsc2UgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdlbWFpbCcgJiYgY29udGV4dC5jaGFubmVsX2NvbnRleHQ/LmVtYWlsKSB7XG4gICAgICByb3V0aW5nLmVtYWlsID0geyB0bzogY29udGV4dC5jaGFubmVsX2NvbnRleHQuZW1haWwuZnJvbSB9O1xuICAgIH0gZWxzZSBpZiAocHJlZmVycmVkQ2hhbm5lbCA9PT0gJ2NoYXQnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5jaGF0KSB7XG4gICAgICByb3V0aW5nLmNoYXQgPSB7IHNlc3Npb25JZDogY29udGV4dC5jaGFubmVsX2NvbnRleHQuY2hhdC5zZXNzaW9uSWQgfTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHJvdXRpbmc7XG4gIH1cbn0iXX0=