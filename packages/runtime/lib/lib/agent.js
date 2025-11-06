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
            if (this.personaService) {
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
                await chatHistory.addMessage(incomingMessage);
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
            // Add AI response to history
            // Add AI message to history (only for Lambda mode with persistent storage)
            if (!existingHistory && this.config.dynamoService) {
                // Only save to DynamoDB in Lambda mode
                const sessionKey = `${context.tenantId}:${context.email_lc}:${context.conversation_id || 'default-session'}`;
                const chatHistoryForSaving = new chat_history_js_1.KxDynamoChatHistory({
                    tenantId: context.tenantId,
                    emailLc: context.email_lc,
                    dynamoService: this.config.dynamoService,
                    historyLimit: this.config.historyLimit,
                    conversationId: context.conversation_id,
                });
                const aiMessage = new messages_1.AIMessage({
                    content: response,
                    additional_kwargs: {
                        source: 'agent',
                        model: this.config.bedrockModelId,
                    },
                });
                await chatHistoryForSaving.addMessage(aiMessage);
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUFxRDtBQUNyRCw2Q0FBcUQ7QUFDckQsNkNBQWdEO0FBQ2hELHFEQUF5RDtBQUN6RCx1REFBZ0Y7QUFDaEYsdURBQXdEO0FBQ3hELHFFQUE2RDtBQUM3RCwrQ0FBZ0Q7QUFDaEQscURBQXNEO0FBQ3RELHVEQUFzRTtBQUN0RSw2REFBd0U7QUFDeEUsK0RBQTRFO0FBQzVFLDJEQUFzRTtBQUN0RSxpRUFBd0Y7QUFDeEYsdUVBQXFGO0FBQ3JGLDJFQUFzSDtBQWF0SDs7R0FFRztBQUNILE1BQWEsWUFBWTtJQVd2QixZQUFZLE1BQTBCO1FBQ3BDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLGtFQUFrRTtRQUNsRSxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLG1DQUFjLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsQ0FBQztRQUV2RSw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLGlDQUFhLEVBQUUsQ0FBQztRQUV6QywrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksdUNBQWdCLEVBQUUsQ0FBQztRQUUvQyxvRkFBb0Y7UUFDcEYsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksNENBQWtCLENBQUM7WUFDL0MsT0FBTyxFQUFFLEtBQUs7WUFDZCxRQUFRLEVBQUUsRUFBRTtZQUNaLGFBQWEsRUFBRSxJQUFJO1NBQ3BCLENBQUMsQ0FBQztRQUVILGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixJQUFJLElBQUksZ0RBQW9CLEVBQUUsQ0FBQztRQUV0RixvRUFBb0U7UUFDcEUsSUFBSSxDQUFDLGNBQWMsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFD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LEdBQUcsRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0QsQ0FBQzthQUFNLElBQUksZ0JBQWdCLEtBQUssTUFBTSxJQUFJLE9BQU8sQ0FBQyxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDeEUsT0FBTyxDQUFDLElBQUksR0FBRyxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUN2RSxDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztDQUNGO0FBM25CRCxvQ0EybkJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ2hhdEJlZHJvY2tDb252ZXJzZSB9IGZyb20gJ0BsYW5nY2hhaW4vYXdzJztcbmltcG9ydCB7IENvbnZlcnNhdGlvbkNoYWluIH0gZnJvbSAnbGFuZ2NoYWluL2NoYWlucyc7XG5pbXBvcnQgeyBCdWZmZXJNZW1vcnkgfSBmcm9tICdsYW5nY2hhaW4vbWVtb3J5JztcbmltcG9ydCB7IFByb21wdFRlbXBsYXRlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL3Byb21wdHMnO1xuaW1wb3J0IHsgQmFzZU1lc3NhZ2UsIEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IEt4RHluYW1vQ2hhdEhpc3RvcnkgfSBmcm9tICcuL2NoYXQtaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBNZW1vcnlDaGF0SGlzdG9yeSB9IGZyb20gJy4vbWVtb3J5LWNoYXQtaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuL2R5bmFtb2RiLmpzJztcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4vZXZlbnRicmlkZ2UuanMnO1xuaW1wb3J0IHsgZ2V0UGVyc29uYSwgdHlwZSBBZ2VudFBlcnNvbmEgfSBmcm9tICcuLi9jb25maWcvcGVyc29uYXMuanMnO1xuaW1wb3J0IHsgUGVyc29uYVNlcnZpY2UsIHR5cGUgQ29tcGFueUluZm8gfSBmcm9tICcuL3BlcnNvbmEtc2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZUNodW5rZXIsIHR5cGUgUmVzcG9uc2VDaHVuayB9IGZyb20gJy4vcmVzcG9uc2UtY2h1bmtlci5qcyc7XG5pbXBvcnQgeyBJbnRlbnRTZXJ2aWNlLCB0eXBlIEludGVudE1hdGNoIH0gZnJvbSAnLi9pbnRlbnQtc2VydmljZS5qcyc7XG5pbXBvcnQgeyBHb2FsT3JjaGVzdHJhdG9yLCB0eXBlIEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0IH0gZnJvbSAnLi9nb2FsLW9yY2hlc3RyYXRvci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UYWdQcm9jZXNzb3IsIHR5cGUgQWN0aW9uVGFnQ29uZmlnIH0gZnJvbSAnLi9hY3Rpb24tdGFnLXByb2Nlc3Nvci5qcyc7XG5pbXBvcnQgeyBJbnRlbnRBY3Rpb25SZWdpc3RyeSwgdHlwZSBJbnRlbnRBY3Rpb25Db250ZXh0LCB0eXBlIEludGVudEFjdGlvblJlc3VsdCB9IGZyb20gJy4vaW50ZW50LWFjdGlvbi1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQZXJzb25hU3RvcmFnZSB9IGZyb20gJy4vcGVyc29uYS1zdG9yYWdlLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRDb250ZXh0LCBSdW50aW1lQ29uZmlnLCBNZXNzYWdlU291cmNlLCBBZ2VudFJlc3BvbnNlIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50U2VydmljZUNvbmZpZyBleHRlbmRzIFJ1bnRpbWVDb25maWcge1xuICBkeW5hbW9TZXJ2aWNlPzogRHluYW1vREJTZXJ2aWNlO1xuICBldmVudEJyaWRnZVNlcnZpY2U/OiBFdmVudEJyaWRnZVNlcnZpY2U7XG4gIHBlcnNvbmFJZD86IHN0cmluZzsgLy8gQWdlbnQgcGVyc29uYSB0byB1c2UgKGRlZmF1bHRzIHRvICdjYXJsb3MnKVxuICBpbnRlbnRBY3Rpb25SZWdpc3RyeT86IEludGVudEFjdGlvblJlZ2lzdHJ5O1xuICBwZXJzb25hU3RvcmFnZT86IFBlcnNvbmFTdG9yYWdlO1xuICBjb21wYW55SW5mbz86IENvbXBhbnlJbmZvOyAvLyBDb21wYW55IGluZm9ybWF0aW9uIGZvciBwZXJzb25hIGN1c3RvbWl6YXRpb25cbn1cblxuLyoqXG4gKiBMYW5nQ2hhaW4gYWdlbnQgc2VydmljZSB0aGF0IHByb2Nlc3NlcyBtZXNzYWdlcyBhbmQgZ2VuZXJhdGVzIHJlc3BvbnNlc1xuICovXG5leHBvcnQgY2xhc3MgQWdlbnRTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBjb25maWc6IEFnZW50U2VydmljZUNvbmZpZztcbiAgcHJpdmF0ZSBtb2RlbDogQ2hhdEJlZHJvY2tDb252ZXJzZTtcbiAgcHJpdmF0ZSBwZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gIHByaXZhdGUgcGVyc29uYVNlcnZpY2U/OiBQZXJzb25hU2VydmljZTtcbiAgcHJpdmF0ZSBpbnRlbnRTZXJ2aWNlOiBJbnRlbnRTZXJ2aWNlO1xuICBwcml2YXRlIGdvYWxPcmNoZXN0cmF0b3I6IEdvYWxPcmNoZXN0cmF0b3I7XG4gIHByaXZhdGUgYWN0aW9uVGFnUHJvY2Vzc29yOiBBY3Rpb25UYWdQcm9jZXNzb3I7XG4gIHByaXZhdGUgaW50ZW50QWN0aW9uUmVnaXN0cnk6IEludGVudEFjdGlvblJlZ2lzdHJ5O1xuICBwcml2YXRlIHBlcnNvbmFTdG9yYWdlPzogUGVyc29uYVN0b3JhZ2U7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBBZ2VudFNlcnZpY2VDb25maWcpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICBcbiAgICAvLyBBbHdheXMgaW5pdGlhbGl6ZSBwZXJzb25hIHNlcnZpY2UgZm9yIGNvbXBhbnkgaW5mbyBzdWJzdGl0dXRpb25cbiAgICAvLyBQYXNzIG51bGwgZm9yIER5bmFtb0RCIHNlcnZpY2UgaWYgbm90IGF2YWlsYWJsZVxuICAgIHRoaXMucGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UoY29uZmlnLmR5bmFtb1NlcnZpY2UgfHwgbnVsbCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBpbnRlbnQgc2VydmljZVxuICAgIHRoaXMuaW50ZW50U2VydmljZSA9IG5ldyBJbnRlbnRTZXJ2aWNlKCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBnb2FsIG9yY2hlc3RyYXRvclxuICAgIHRoaXMuZ29hbE9yY2hlc3RyYXRvciA9IG5ldyBHb2FsT3JjaGVzdHJhdG9yKCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBhY3Rpb24gdGFnIHByb2Nlc3NvciB3aXRoIGRlZmF1bHQgY29uZmlnICh3aWxsIGJlIHVwZGF0ZWQgcGVyIHBlcnNvbmEpXG4gICAgdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IgPSBuZXcgQWN0aW9uVGFnUHJvY2Vzc29yKHtcbiAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgbWFwcGluZ3M6IHt9LFxuICAgICAgZmFsbGJhY2tFbW9qaTogJ/CfmIonXG4gICAgfSk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBpbnRlbnQgYWN0aW9uIHJlZ2lzdHJ5ICh1c2UgcHJvdmlkZWQgb3IgY3JlYXRlIG5ldylcbiAgICB0aGlzLmludGVudEFjdGlvblJlZ2lzdHJ5ID0gY29uZmlnLmludGVudEFjdGlvblJlZ2lzdHJ5IHx8IG5ldyBJbnRlbnRBY3Rpb25SZWdpc3RyeSgpO1xuICAgIFxuICAgIC8vIEluaXRpYWxpemUgcGVyc29uYSBzdG9yYWdlICh1c2UgcHJvdmlkZWQgb3IgY3JlYXRlIHdpdGggZmFsbGJhY2spXG4gICAgdGhpcy5wZXJzb25hU3RvcmFnZSA9IGNvbmZpZy5wZXJzb25hU3RvcmFnZTtcbiAgICBcbiAgICAvLyBQZXJzb25hIHdpbGwgYmUgbG9hZGVkIHBlci1yZXF1ZXN0IHdpdGggY29tcGFueSBpbmZvIHN1YnN0aXR1dGlvblxuICAgIHRoaXMucGVyc29uYSA9IHt9IGFzIEFnZW50UGVyc29uYTsgLy8gV2lsbCBiZSBsb2FkZWQgcGVyLXJlcXVlc3RcbiAgICBcbiAgICB0aGlzLm1vZGVsID0gbmV3IENoYXRCZWRyb2NrQ29udmVyc2Uoe1xuICAgICAgbW9kZWw6IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgIHJlZ2lvbjogY29uZmlnLmF3c1JlZ2lvbixcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICBtYXhUb2tlbnM6IDEwMDAsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUHJvY2VzcyBhbiBhZ2VudCBjb250ZXh0IGFuZCBnZW5lcmF0ZSBhIHJlc3BvbnNlXG4gICAqIEBwYXJhbSBjb250ZXh0IC0gVGhlIGFnZW50IGNvbnRleHRcbiAgICogQHBhcmFtIGV4aXN0aW5nSGlzdG9yeSAtIE9wdGlvbmFsIGNoYXQgaGlzdG9yeSAoZm9yIENMSS9sb2NhbCB1c2UpXG4gICAqL1xuICBhc3luYyBwcm9jZXNzTWVzc2FnZShjb250ZXh0OiBBZ2VudENvbnRleHQsIGV4aXN0aW5nSGlzdG9yeT86IEJhc2VNZXNzYWdlW10pOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIC8vIExvYWQgcGVyc29uYSBmb3IgdGhpcyB0ZW5hbnQgd2l0aCBjb21wYW55IGluZm8gc3Vic3RpdHV0aW9uXG4gICAgICBsZXQgY3VycmVudFBlcnNvbmEgPSB0aGlzLnBlcnNvbmE7XG4gICAgICBcbiAgICAgIGlmICh0aGlzLnBlcnNvbmFTZXJ2aWNlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY3VycmVudFBlcnNvbmEgPSBhd2FpdCB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEoXG4gICAgICAgICAgICBjb250ZXh0LnRlbmFudElkLCBcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBlcnNvbmFJZCB8fCAnY2FybG9zJyxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHBlcnNvbmEgJHt0aGlzLmNvbmZpZy5wZXJzb25hSWR9IGZvciB0ZW5hbnQgJHtjb250ZXh0LnRlbmFudElkfSwgdXNpbmcgZmFsbGJhY2s6YCwgZXJyb3IpO1xuICAgICAgICAgIC8vIFVzZSBQZXJzb25hU2VydmljZSBmYWxsYmFjayB0byBlbnN1cmUgZ29hbENvbmZpZ3VyYXRpb24gaXMgbG9hZGVkXG4gICAgICAgICAgY3VycmVudFBlcnNvbmEgPSB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldERlZmF1bHRQZXJzb25hKHRoaXMuY29uZmlnLnBlcnNvbmFJZCB8fCAnY2FybG9zJywgdGhpcy5jb25maWcuY29tcGFueUluZm8pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENvbmZpZ3VyZSBhY3Rpb24gdGFnIHByb2Nlc3NvciBiYXNlZCBvbiBwZXJzb25hXG4gICAgICBpZiAoKGN1cnJlbnRQZXJzb25hIGFzIGFueSkuYWN0aW9uVGFncykge1xuICAgICAgICBjb25zdCBhY3Rpb25UYWdDb25maWcgPSAoY3VycmVudFBlcnNvbmEgYXMgYW55KS5hY3Rpb25UYWdzIGFzIEFjdGlvblRhZ0NvbmZpZztcbiAgICAgICAgdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IgPSBuZXcgQWN0aW9uVGFnUHJvY2Vzc29yKGFjdGlvblRhZ0NvbmZpZyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFJ1biBnb2FsIG9yY2hlc3RyYXRpb24gdG8gbWFuYWdlIGxlYWQgcXVhbGlmaWNhdGlvblxuICAgICAgbGV0IGdvYWxSZXN1bHQ6IEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0IHwgbnVsbCA9IG51bGw7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBHb2FsIGNvbmZpZyBlbmFibGVkOiAke2N1cnJlbnRQZXJzb25hLmdvYWxDb25maWd1cmF0aW9uPy5lbmFibGVkfSwgZ29hbHM6ICR7Y3VycmVudFBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24/LmdvYWxzPy5sZW5ndGggfHwgMH1gKTtcbiAgICAgIFxuICAgICAgaWYgKGN1cnJlbnRQZXJzb25hLmdvYWxDb25maWd1cmF0aW9uPy5lbmFibGVkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZ29hbFJlc3VsdCA9IGF3YWl0IHRoaXMuZ29hbE9yY2hlc3RyYXRvci5vcmNoZXN0cmF0ZUdvYWxzKFxuICAgICAgICAgICAgY29udGV4dC50ZXh0LFxuICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ2RlZmF1bHQnLFxuICAgICAgICAgICAgY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICBjdXJyZW50UGVyc29uYS5nb2FsQ29uZmlndXJhdGlvblxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBMb2cgZ29hbCBvcmNoZXN0cmF0aW9uIHJlc3VsdHNcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvICYmIE9iamVjdC5rZXlzKGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbykubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYPCfk6cgRXh0cmFjdGVkIGluZm86YCwgZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46vIEdvYWwgcmVjb21tZW5kYXRpb25zOmAsIGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLm1hcChyID0+ICh7XG4gICAgICAgICAgICAgIGdvYWw6IHIuZ29hbElkLFxuICAgICAgICAgICAgICBwcmlvcml0eTogci5wcmlvcml0eSxcbiAgICAgICAgICAgICAgc2hvdWxkUHVyc3VlOiByLnNob3VsZFB1cnN1ZSxcbiAgICAgICAgICAgICAgYXBwcm9hY2g6IHIuYXBwcm9hY2hcbiAgICAgICAgICAgIH0pKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGdvYWxSZXN1bHQudHJpZ2dlcmVkSW50ZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+agCBUcmlnZ2VyZWQgaW50ZW50czpgLCBnb2FsUmVzdWx0LnRyaWdnZXJlZEludGVudHMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBQcm9jZXNzIHRyaWdnZXJlZCBpbnRlbnRzIChsaWtlIGxlYWRfZ2VuZXJhdGVkKVxuICAgICAgICAgICAgZm9yIChjb25zdCB0cmlnZ2VyZWRJbnRlbnRJZCBvZiBnb2FsUmVzdWx0LnRyaWdnZXJlZEludGVudHMpIHtcbiAgICAgICAgICAgICAgY29uc3QgdHJpZ2dlcmVkSW50ZW50ID0gY3VycmVudFBlcnNvbmEuaW50ZW50Q2FwdHVyaW5nPy5pbnRlbnRzPy5maW5kKGkgPT4gaS5pZCA9PT0gdHJpZ2dlcmVkSW50ZW50SWQpO1xuICAgICAgICAgICAgICBpZiAodHJpZ2dlcmVkSW50ZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfjokgR09BTCBUUklHR0VSRUQgSU5URU5UOiAke3RyaWdnZXJlZEludGVudElkfVxceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgLy8gWW91IGNvdWxkIHJldHVybiB0aGUgdHJpZ2dlcmVkIGludGVudCByZXNwb25zZSBoZXJlIGlmIGRlc2lyZWRcbiAgICAgICAgICAgICAgICAvLyBGb3Igbm93LCB3ZSdsbCBsZXQgdGhlIG5vcm1hbCBmbG93IGNvbnRpbnVlIGFuZCBhZGQgaXQgYXMgY29udGV4dFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKCdHb2FsIG9yY2hlc3RyYXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGZvciBpbnRlbnQgbWF0Y2hlcyBiZWZvcmUgcHJvY2Vzc2luZyB3aXRoIExhbmdDaGFpblxuICAgICAgY29uc3QgaW50ZW50TWF0Y2ggPSBhd2FpdCB0aGlzLmludGVudFNlcnZpY2UuZGV0ZWN0SW50ZW50KFxuICAgICAgICBjb250ZXh0LnRleHQsXG4gICAgICAgIGN1cnJlbnRQZXJzb25hLFxuICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyB8fCB7XG4gICAgICAgICAgbmFtZTogJ1BsYW5ldCBGaXRuZXNzJyxcbiAgICAgICAgICBpbmR1c3RyeTogJ0ZpdG5lc3MgJiBXZWxsbmVzcycsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdBbWVyaWNhXFwncyBtb3N0IHBvcHVsYXIgZ3ltIHdpdGggb3ZlciAyLDQwMCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHByb2R1Y3RzOiAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgICAgICAgYmVuZWZpdHM6ICdBZmZvcmRhYmxlIHByaWNpbmcsIGp1ZGdtZW50LWZyZWUgZW52aXJvbm1lbnQsIGNvbnZlbmllbnQgbG9jYXRpb25zJyxcbiAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdQZW9wbGUgb2YgYWxsIGZpdG5lc3MgbGV2ZWxzIGxvb2tpbmcgZm9yIGFuIGFmZm9yZGFibGUsIG5vbi1pbnRpbWlkYXRpbmcgZ3ltIGV4cGVyaWVuY2UnLFxuICAgICAgICAgIGRpZmZlcmVudGlhdG9yczogJ0xvdyBjb3N0LCBuby1qdWRnbWVudCBhdG1vc3BoZXJlLCBiZWdpbm5lci1mcmllbmRseSBlbnZpcm9ubWVudCdcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgIGNoYW5uZWw6IGNvbnRleHQuc291cmNlIGFzIHN0cmluZ1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICAvLyBJZiB3ZSBoYXZlIGEgaGlnaC1jb25maWRlbmNlIGludGVudCBtYXRjaCwgdXNlIHRoZSBpbnRlbnQgcmVzcG9uc2VcbiAgICAgIGlmIChpbnRlbnRNYXRjaCAmJiBpbnRlbnRNYXRjaC5jb25maWRlbmNlID4gMC43KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW3wn46vIElOVEVOVCBERVRFQ1RFRDogJHtpbnRlbnRNYXRjaC5pbnRlbnQuaWR9IChjb25maWRlbmNlOiAkeyhpbnRlbnRNYXRjaC5jb25maWRlbmNlICogMTAwKS50b0ZpeGVkKDEpfSUpXFx4MWJbMG1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIE5hbWU6ICR7aW50ZW50TWF0Y2guaW50ZW50Lm5hbWV9XFx4MWJbMG1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIFByaW9yaXR5OiAke2ludGVudE1hdGNoLmludGVudC5wcmlvcml0eX1cXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTWF0Y2hlZCB0cmlnZ2VyczogJHtpbnRlbnRNYXRjaC5tYXRjaGVkVHJpZ2dlcnMuam9pbignLCAnKX1cXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTWF0Y2hlZCBwYXR0ZXJuczogJHtpbnRlbnRNYXRjaC5tYXRjaGVkUGF0dGVybnMuam9pbignLCAnKX1cXHgxYlswbWApO1xuICAgICAgICBpZiAoaW50ZW50TWF0Y2guYWN0aW9ucyAmJiBpbnRlbnRNYXRjaC5hY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgQWN0aW9uczogJHtpbnRlbnRNYXRjaC5hY3Rpb25zLmpvaW4oJywgJyl9XFx4MWJbMG1gKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gRXhlY3V0ZSBpbnRlbnQgYWN0aW9ucyBpZiByZWdpc3RyeSBpcyBhdmFpbGFibGVcbiAgICAgICAgbGV0IGludGVudEFjdGlvblJlc3VsdHM6IEludGVudEFjdGlvblJlc3VsdFtdID0gW107XG4gICAgICAgIGlmICh0aGlzLmludGVudEFjdGlvblJlZ2lzdHJ5KSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGFjdGlvbkNvbnRleHQ6IEludGVudEFjdGlvbkNvbnRleHQgPSB7XG4gICAgICAgICAgICAgIGludGVudDoge1xuICAgICAgICAgICAgICAgIGlkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgbmFtZTogaW50ZW50TWF0Y2guaW50ZW50Lm5hbWUsXG4gICAgICAgICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICAgICAgICBtYXRjaGVkVHJpZ2dlcnM6IGludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2VycyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgYWdlbnRDb250ZXh0OiBjb250ZXh0LFxuICAgICAgICAgICAgICBtZXNzYWdlOiBjb250ZXh0LnRleHQsXG4gICAgICAgICAgICAgIGV4dHJhY3RlZERhdGE6IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8gfHwge30sXG4gICAgICAgICAgICAgIGNvbnZlcnNhdGlvbjoge1xuICAgICAgICAgICAgICAgIGlkOiBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VDb3VudDogMSwgLy8gVE9ETzogR2V0IGFjdHVhbCBtZXNzYWdlIGNvdW50XG4gICAgICAgICAgICAgICAgaGlzdG9yeTogW10sIC8vIFRPRE86IEdldCBjb252ZXJzYXRpb24gaGlzdG9yeVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgICAgZW1haWw6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgICAgICAgcGhvbmU6IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LnBob25lPy52YWx1ZSxcbiAgICAgICAgICAgICAgICBuYW1lOiBnb2FsUmVzdWx0Py5leHRyYWN0ZWRJbmZvPy5maXJzdE5hbWU/LnZhbHVlIHx8IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LmZ1bGxOYW1lPy52YWx1ZSxcbiAgICAgICAgICAgICAgICBsZWFkSWQ6IGNvbnRleHQubGVhZF9pZCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgdGVuYW50OiB7XG4gICAgICAgICAgICAgICAgaWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICAgICAgY29tcGFueUluZm86IHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBjaGFubmVsOiB7XG4gICAgICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgICAgICBjb250ZXh0OiBjb250ZXh0LmNoYW5uZWxfY29udGV4dCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGludGVudEFjdGlvblJlc3VsdHMgPSBhd2FpdCB0aGlzLmludGVudEFjdGlvblJlZ2lzdHJ5LmV4ZWN1dGVBY3Rpb25zKGFjdGlvbkNvbnRleHQpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBMb2cgYWN0aW9uIHJlc3VsdHNcbiAgICAgICAgICAgIGlmIChpbnRlbnRBY3Rpb25SZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfmoAgSU5URU5UIEFDVElPTlMgRVhFQ1VURUQ6ICR7aW50ZW50QWN0aW9uUmVzdWx0cy5sZW5ndGh9IGFjdGlvbnNcXHgxYlswbWApO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiBpbnRlbnRBY3Rpb25SZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzJtICAg4pyFICR7cmVzdWx0Lm1ldGFkYXRhPy5hY3Rpb25OYW1lIHx8ICdVbmtub3duJ306IFN1Y2Nlc3NcXHgxYlswbWApO1xuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5tZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMm0gICAgICBNZXNzYWdlOiAke3Jlc3VsdC5tZXNzYWdlfVxceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICDinYwgJHtyZXN1bHQubWV0YWRhdGE/LmFjdGlvbk5hbWUgfHwgJ1Vua25vd24nfTogRmFpbGVkXFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgICAgIEVycm9yOiAke3Jlc3VsdC5lcnJvci5tZXNzYWdlfVxceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludGVudCBhY3Rpb24gZXhlY3V0aW9uIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUcmFjayB0aGUgaW50ZW50IHJlc3BvbnNlXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50VHJhY2Uoe1xuICAgICAgICAgICAgc291cmNlOiAna3hnZW4uYWdlbnQnLFxuICAgICAgICAgICAgJ2RldGFpbC10eXBlJzogJ2FnZW50LnRyYWNlJyxcbiAgICAgICAgICAgIGRldGFpbDoge1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgb3BlcmF0aW9uOiAnaW50ZW50X21hdGNoJyxcbiAgICAgICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgICBpbnRlbnRJZDogaW50ZW50TWF0Y2guaW50ZW50LmlkLFxuICAgICAgICAgICAgICAgIGNvbmZpZGVuY2U6IGludGVudE1hdGNoLmNvbmZpZGVuY2UsXG4gICAgICAgICAgICAgICAgbWF0Y2hlZFRyaWdnZXJzOiBpbnRlbnRNYXRjaC5tYXRjaGVkVHJpZ2dlcnMsXG4gICAgICAgICAgICAgICAgbWF0Y2hlZFBhdHRlcm5zOiBpbnRlbnRNYXRjaC5tYXRjaGVkUGF0dGVybnMsXG4gICAgICAgICAgICAgICAgYWN0aW9uczogaW50ZW50TWF0Y2guYWN0aW9ucyxcbiAgICAgICAgICAgICAgICBhY3Rpb25SZXN1bHRzOiBpbnRlbnRBY3Rpb25SZXN1bHRzLm1hcChyID0+ICh7XG4gICAgICAgICAgICAgICAgICBzdWNjZXNzOiByLnN1Y2Nlc3MsXG4gICAgICAgICAgICAgICAgICBhY3Rpb25JZDogci5tZXRhZGF0YT8uYWN0aW9uSWQsXG4gICAgICAgICAgICAgICAgICBtZXNzYWdlOiByLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICBlcnJvcjogci5lcnJvcj8ubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBwZXJzb25hX2hhbmRsZWQgaW50ZW50IChlbXB0eSByZXNwb25zZSBtZWFucyBsZXQgcGVyc29uYSBoYW5kbGUgaXQpXG4gICAgICAgIGlmICghaW50ZW50TWF0Y2gucmVzcG9uc2UgfHwgaW50ZW50TWF0Y2gucmVzcG9uc2UudHJpbSgpID09PSAnJykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46vIEludGVudCBkZXRlY3RlZCBidXQgcGVyc29uYV9oYW5kbGVkIC0gbGV0dGluZyBDYXJsb3MgcmVzcG9uZCBuYXR1cmFsbHlgKTtcbiAgICAgICAgICAvLyBEb24ndCByZXR1cm4gZWFybHkgLSBsZXQgdGhlIG5vcm1hbCBMYW5nQ2hhaW4gZmxvdyBoYW5kbGUgdGhpcyB3aXRoIHRoZSBwZXJzb25hJ3MgcnVsZXNcbiAgICAgICAgICAvLyBUaGUgaW50ZW50IGRldGVjdGlvbiBpbmZvIGlzIGxvZ2dlZCBhYm92ZSBmb3IgdHJhY2tpbmcgcHVycG9zZXNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgaW50ZW50cyB3aXRoIHRlbXBsYXRlZCByZXNwb25zZXMgKGxpa2Ugb3BlcmF0aW9uYWwgaG91cnMpXG4gICAgICAgICAgbGV0IHJlc3BvbnNlID0gaW50ZW50TWF0Y2gucmVzcG9uc2U7XG4gICAgICAgICAgaWYgKGdvYWxSZXN1bHQgJiYgZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgaGlnaFByaW9yaXR5R29hbCA9IGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLmZpbmQociA9PiByLnNob3VsZFB1cnN1ZSAmJiByLnByaW9yaXR5ID49IDQpO1xuICAgICAgICAgICAgaWYgKGhpZ2hQcmlvcml0eUdvYWwpIHtcbiAgICAgICAgICAgICAgcmVzcG9uc2UgKz0gYFxcblxcbiR7aGlnaFByaW9yaXR5R29hbC5tZXNzYWdlfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIEFkZCBmb2xsb3ctdXAgaWYgYXZhaWxhYmxlXG4gICAgICAgICAgaWYgKGludGVudE1hdGNoLmZvbGxvd1VwKSB7XG4gICAgICAgICAgICByZXNwb25zZSArPSAnXFxuXFxuJyArIGludGVudE1hdGNoLmZvbGxvd1VwLmpvaW4oJyAnKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEhhbmRsZSBjaGF0IGhpc3RvcnkgLSBlaXRoZXIgZnJvbSBleGlzdGluZyBoaXN0b3J5IChDTEkpIG9yIGZyb20gc3RvcmFnZSAoTGFtYmRhKVxuICAgICAgbGV0IG1lc3NhZ2VzOiBCYXNlTWVzc2FnZVtdO1xuICAgICAgXG4gICAgICBpZiAoZXhpc3RpbmdIaXN0b3J5KSB7XG4gICAgICAgIC8vIENMSS9Mb2NhbCBtb2RlOiBVc2UgcHJvdmlkZWQgaGlzdG9yeVxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBVc2luZyBwcm92aWRlZCBjaGF0IGhpc3Rvcnk6ICR7ZXhpc3RpbmdIaXN0b3J5Lmxlbmd0aH0gbWVzc2FnZXNgKTtcbiAgICAgICAgbWVzc2FnZXMgPSBleGlzdGluZ0hpc3Rvcnk7XG4gICAgICAgIFxuICAgICAgICAvLyBBZGQgY3VycmVudCBtZXNzYWdlIHRvIHRoZSBwcm92aWRlZCBoaXN0b3J5XG4gICAgICAgIGNvbnN0IGluY29taW5nTWVzc2FnZSA9IG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQ6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogY29udGV4dC5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgICAgICBsZWFkX2lkOiBjb250ZXh0LmxlYWRfaWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIG1lc3NhZ2VzLnB1c2goaW5jb21pbmdNZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIExhbWJkYSBtb2RlOiBMb2FkIGZyb20gRHluYW1vREIgb3IgY3JlYXRlIG5ld1xuICAgICAgICBjb25zdCBzZXNzaW9uS2V5ID0gYCR7Y29udGV4dC50ZW5hbnRJZH06JHtjb250ZXh0LmVtYWlsX2xjfToke2NvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICdkZWZhdWx0LXNlc3Npb24nfWA7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIExhbWJkYSBtb2RlIC0gU2Vzc2lvbiBLZXk6ICR7c2Vzc2lvbktleX1gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNoYXRIaXN0b3J5ID0gdGhpcy5jb25maWcuZHluYW1vU2VydmljZSBcbiAgICAgICAgICA/IG5ldyBLeER5bmFtb0NoYXRIaXN0b3J5KHtcbiAgICAgICAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICAgIGVtYWlsTGM6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgICAgIGR5bmFtb1NlcnZpY2U6IHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UsXG4gICAgICAgICAgICAgIGhpc3RvcnlMaW1pdDogdGhpcy5jb25maWcuaGlzdG9yeUxpbWl0LFxuICAgICAgICAgICAgICBjb252ZXJzYXRpb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIDogbmV3IE1lbW9yeUNoYXRIaXN0b3J5KHNlc3Npb25LZXkpO1xuXG4gICAgICAgIC8vIEFkZCB0aGUgaW5jb21pbmcgbWVzc2FnZSB0byBoaXN0b3J5XG4gICAgICAgIGNvbnN0IGluY29taW5nTWVzc2FnZSA9IG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQ6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogY29udGV4dC5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgICAgICBsZWFkX2lkOiBjb250ZXh0LmxlYWRfaWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGF3YWl0IGNoYXRIaXN0b3J5LmFkZE1lc3NhZ2UoaW5jb21pbmdNZXNzYWdlKTtcblxuICAgICAgICAvLyBHZXQgY29udmVyc2F0aW9uIGhpc3RvcnkgZnJvbSBzdG9yYWdlXG4gICAgICAgIG1lc3NhZ2VzID0gdGhpcy5jb25maWcuZHluYW1vU2VydmljZSBcbiAgICAgICAgICA/IGF3YWl0IChjaGF0SGlzdG9yeSBhcyBLeER5bmFtb0NoYXRIaXN0b3J5KS5nZXRNZXNzYWdlc1dpdGhUb2tlbkVzdGltYXRlKDMwMDApXG4gICAgICAgICAgOiBhd2FpdCAoY2hhdEhpc3RvcnkgYXMgTWVtb3J5Q2hhdEhpc3RvcnkpLmdldFJlY2VudE1lc3NhZ2VzKDMwMDApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBERUJVRzogQ2hlY2sgaWYgaGlzdG9yeSBpcyB3b3JraW5nXG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBDaGF0IEhpc3RvcnkgRGVidWc6YCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgTWVzc2FnZXMgaW4gaGlzdG9yeTogJHttZXNzYWdlcy5sZW5ndGh9YCk7XG4gICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBsYXN0TWVzc2FnZSA9IG1lc3NhZ2VzW21lc3NhZ2VzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdHlwZW9mIGxhc3RNZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbGFzdE1lc3NhZ2UuY29udGVudCA6IEpTT04uc3RyaW5naWZ5KGxhc3RNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgTGFzdCBtZXNzYWdlOiAke2NvbnRlbnQuc3Vic3RyaW5nKDAsIDUwKX0uLi5gKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIG1lbW9yeSB3aXRoIG1lc3NhZ2VzXG4gICAgICBjb25zdCBtZW1vcnkgPSBuZXcgQnVmZmVyTWVtb3J5KHtcbiAgICAgICAgcmV0dXJuTWVzc2FnZXM6IHRydWUsXG4gICAgICAgIG1lbW9yeUtleTogJ2hpc3RvcnknLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIEFkZCBleGlzdGluZyBtZXNzYWdlcyB0byBtZW1vcnkgKGV4Y2x1ZGluZyB0aGUgY3VycmVudCBtZXNzYWdlIHdlIGp1c3QgYWRkZWQpXG4gICAgICBjb25zdCBoaXN0b3J5TWVzc2FnZXMgPSBtZXNzYWdlcy5zbGljZSgwLCAtMSk7IC8vIFJlbW92ZSB0aGUgY3VycmVudCBtZXNzYWdlIHdlIGp1c3QgYWRkZWRcbiAgICAgIGZvciAoY29uc3QgbXNnIG9mIGhpc3RvcnlNZXNzYWdlcykge1xuICAgICAgICBhd2FpdCBtZW1vcnkuY2hhdEhpc3RvcnkuYWRkTWVzc2FnZShtc2cpO1xuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgcHJvbXB0IHRlbXBsYXRlIHdpdGggY3VycmVudCBwZXJzb25hXG4gICAgICBjb25zdCBwcm9tcHQgPSB0aGlzLmNyZWF0ZVByb21wdFRlbXBsYXRlKGNvbnRleHQsIGN1cnJlbnRQZXJzb25hKTtcblxuICAgICAgLy8gQ3JlYXRlIGNvbnZlcnNhdGlvbiBjaGFpblxuICAgICAgY29uc3QgY2hhaW4gPSBuZXcgQ29udmVyc2F0aW9uQ2hhaW4oe1xuICAgICAgICBsbG06IHRoaXMubW9kZWwsXG4gICAgICAgIG1lbW9yeSxcbiAgICAgICAgcHJvbXB0LFxuICAgICAgICB2ZXJib3NlOiBmYWxzZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBMZXQgTGFuZ0NoYWluIGhhbmRsZSB0aGUgY29udmVyc2F0aW9uIG5hdHVyYWxseSAtIG5vIGhhcmRjb2RlZCBsb2dpY1xuXG4gICAgICAvLyBHZW5lcmF0ZSByZXNwb25zZVxuICAgICAgbGV0IHJlc3BvbnNlID0gYXdhaXQgY2hhaW4ucHJlZGljdCh7XG4gICAgICAgIGlucHV0OiBjb250ZXh0LnRleHQsXG4gICAgICB9KTtcblxuICAgICAgLy8gUHJvY2VzcyBhY3Rpb24gdGFncyBpbiB0aGUgcmVzcG9uc2VcbiAgICAgIHJlc3BvbnNlID0gdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IucHJvY2Vzc0FjdGlvblRhZ3MocmVzcG9uc2UpO1xuXG4gICAgICAvLyBFbmhhbmNlIHJlc3BvbnNlIHdpdGggZ29hbC1kcml2ZW4gZm9sbG93LXVwc1xuICAgICAgaWYgKGdvYWxSZXN1bHQgJiYgZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCB1cmdlbnRHb2FsID0gZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMuZmluZChyID0+IHIuc2hvdWxkUHVyc3VlICYmIHIucHJpb3JpdHkgPj0gNCk7XG4gICAgICAgIGlmICh1cmdlbnRHb2FsKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gQWRkaW5nIGdvYWwtZHJpdmVuIGZvbGxvdy11cDogJHt1cmdlbnRHb2FsLmdvYWxJZH1gKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBEZXRlY3QgaWYgdXNlciBpcyBiZWluZyB2YWd1ZS9kaXNlbmdhZ2VkXG4gICAgICAgICAgY29uc3QgaXNWYWd1ZSA9IC9eKHNvdW5kcyBnb29kfGdyZWF0fG9rfG9rYXl8c3VyZXx5ZXN8eWVhaHxjb29sfG5pY2UpXFwuPyQvaS50ZXN0KGNvbnRleHQudGV4dC50cmltKCkpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChpc1ZhZ3VlKSB7XG4gICAgICAgICAgICAvLyBSZS1lbmdhZ2Ugd2l0aCBhIG1vcmUgZGlyZWN0IGFwcHJvYWNoXG4gICAgICAgICAgICByZXNwb25zZSA9IGAke3Jlc3BvbnNlfVxcblxcbiR7dXJnZW50R29hbC5tZXNzYWdlfWA7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEFkZCBuYXR1cmFsIGZvbGxvdy11cFxuICAgICAgICAgICAgcmVzcG9uc2UgPSBgJHtyZXNwb25zZX0gJHt1cmdlbnRHb2FsLm1lc3NhZ2V9YDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQWRkIEFJIHJlc3BvbnNlIHRvIGhpc3RvcnlcbiAgICAgIC8vIEFkZCBBSSBtZXNzYWdlIHRvIGhpc3RvcnkgKG9ubHkgZm9yIExhbWJkYSBtb2RlIHdpdGggcGVyc2lzdGVudCBzdG9yYWdlKVxuICAgICAgaWYgKCFleGlzdGluZ0hpc3RvcnkgJiYgdGhpcy5jb25maWcuZHluYW1vU2VydmljZSkge1xuICAgICAgICAvLyBPbmx5IHNhdmUgdG8gRHluYW1vREIgaW4gTGFtYmRhIG1vZGVcbiAgICAgICAgY29uc3Qgc2Vzc2lvbktleSA9IGAke2NvbnRleHQudGVuYW50SWR9OiR7Y29udGV4dC5lbWFpbF9sY306JHtjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCB8fCAnZGVmYXVsdC1zZXNzaW9uJ31gO1xuICAgICAgICBjb25zdCBjaGF0SGlzdG9yeUZvclNhdmluZyA9IG5ldyBLeER5bmFtb0NoYXRIaXN0b3J5KHtcbiAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICBlbWFpbExjOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgIGR5bmFtb1NlcnZpY2U6IHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UsXG4gICAgICAgICAgaGlzdG9yeUxpbWl0OiB0aGlzLmNvbmZpZy5oaXN0b3J5TGltaXQsXG4gICAgICAgICAgY29udmVyc2F0aW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGFpTWVzc2FnZSA9IG5ldyBBSU1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQ6IHJlc3BvbnNlLFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBzb3VyY2U6ICdhZ2VudCcsXG4gICAgICAgICAgICBtb2RlbDogdGhpcy5jb25maWcuYmVkcm9ja01vZGVsSWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGF3YWl0IGNoYXRIaXN0b3J5Rm9yU2F2aW5nLmFkZE1lc3NhZ2UoYWlNZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIC8vIEZvciBDTEkgbW9kZSwgdGhlIGNhbGxpbmcgY29kZSB3aWxsIGhhbmRsZSBhZGRpbmcgdGhlIHJlc3BvbnNlIHRvIGhpc3RvcnlcblxuICAgICAgLy8gRW1pdCB0cmFjZSBldmVudFxuICAgICAgLy8gRW1pdCB0cmFjZSBldmVudCBmb3Igc3VjY2Vzc2Z1bCBwcm9jZXNzaW5nIChvbmx5IGlmIGV2ZW50QnJpZGdlU2VydmljZSBpcyBhdmFpbGFibGUpXG4gICAgICBpZiAodGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlKSB7XG4gICAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgYXdhaXQgdGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudFRyYWNlKFxuICAgICAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudFRyYWNlRXZlbnQoXG4gICAgICAgICAgICBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgJ2FnZW50Lm1lc3NhZ2UucHJvY2Vzc2VkJyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY29udGFjdFBrOiBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGNvbnRleHQudGVuYW50SWQsIGNvbnRleHQuZW1haWxfbGMpLFxuICAgICAgICAgICAgICBkdXJhdGlvbk1zOiBkdXJhdGlvbixcbiAgICAgICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgICAgIG1vZGVsOiB0aGlzLmNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlX2xlbmd0aDogY29udGV4dC50ZXh0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgICByZXNwb25zZV9sZW5ndGg6IHJlc3BvbnNlLmxlbmd0aCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gRW1pdCBlcnJvciBldmVudCAob25seSBpZiBldmVudEJyaWRnZVNlcnZpY2UgaXMgYXZhaWxhYmxlKVxuICAgICAgaWYgKHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZSkge1xuICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXG4gICAgICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50RXJyb3JFdmVudChcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY29udGFjdFBrOiBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKGNvbnRleHQudGVuYW50SWQsIGNvbnRleHQuZW1haWxfbGMpLFxuICAgICAgICAgICAgICBzdGFjazogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBjb250ZXh0OiB7XG4gICAgICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgICAgICB0ZXh0X2xlbmd0aDogY29udGV4dC50ZXh0Lmxlbmd0aCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIGFuIGFnZW50IGNvbnRleHQgYW5kIGdlbmVyYXRlIGNodW5rZWQgcmVzcG9uc2VzXG4gICAqL1xuICBhc3luYyBwcm9jZXNzTWVzc2FnZUNodW5rZWQoY29udGV4dDogQWdlbnRDb250ZXh0KTogUHJvbWlzZTxSZXNwb25zZUNodW5rW10+IHtcbiAgICAvLyBGaXJzdCBnZXQgdGhlIGZ1bGwgcmVzcG9uc2VcbiAgICBjb25zdCBmdWxsUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnByb2Nlc3NNZXNzYWdlKGNvbnRleHQpO1xuICAgIFxuICAgIC8vIExvYWQgcGVyc29uYSBmb3IgY2h1bmtpbmcgY29uZmlndXJhdGlvblxuICAgIGxldCBjdXJyZW50UGVyc29uYSA9IHRoaXMucGVyc29uYTtcbiAgICBpZiAodGhpcy5wZXJzb25hU2VydmljZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY3VycmVudFBlcnNvbmEgPSBhd2FpdCB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEoXG4gICAgICAgICAgY29udGV4dC50ZW5hbnRJZCwgXG4gICAgICAgICAgdGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnLFxuICAgICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHBlcnNvbmEgZm9yIGNodW5raW5nLCB1c2luZyBmYWxsYmFjazpgLCBlcnJvcik7XG4gICAgICAgIC8vIFVzZSBQZXJzb25hU2VydmljZSBmYWxsYmFjayB0byBlbnN1cmUgZ29hbENvbmZpZ3VyYXRpb24gaXMgbG9hZGVkXG4gICAgICAgIGN1cnJlbnRQZXJzb25hID0gdGhpcy5wZXJzb25hU2VydmljZS5nZXREZWZhdWx0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycsIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaHVuayB0aGUgcmVzcG9uc2UgYmFzZWQgb24gcGVyc29uYSBjb25maWd1cmF0aW9uIGFuZCBjaGFubmVsXG4gICAgcmV0dXJuIFJlc3BvbnNlQ2h1bmtlci5jaHVua1Jlc3BvbnNlKFxuICAgICAgZnVsbFJlc3BvbnNlLFxuICAgICAgY29udGV4dC5zb3VyY2UsXG4gICAgICBjdXJyZW50UGVyc29uYS5yZXNwb25zZUNodW5raW5nXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgcHJvbXB0IHRlbXBsYXRlIGJhc2VkIG9uIHRlbmFudCBhbmQgY29udGV4dFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVQcm9tcHRUZW1wbGF0ZShjb250ZXh0OiBBZ2VudENvbnRleHQsIHBlcnNvbmE/OiBBZ2VudFBlcnNvbmEpOiBQcm9tcHRUZW1wbGF0ZSB7XG4gICAgLy8gVXNlIHRoZSBwcm92aWRlZCBwZXJzb25hIG9yIGZhbGwgYmFjayB0byB0aGUgaW5zdGFuY2UgcGVyc29uYVxuICAgIGNvbnN0IHN5c3RlbVByb21wdCA9IHRoaXMuZ2V0U3lzdGVtUHJvbXB0KGNvbnRleHQsIHBlcnNvbmEgfHwgdGhpcy5wZXJzb25hKTtcbiAgICBcbiAgICByZXR1cm4gUHJvbXB0VGVtcGxhdGUuZnJvbVRlbXBsYXRlKGAke3N5c3RlbVByb21wdH1cblxuQ3VycmVudCBjb252ZXJzYXRpb246XG57aGlzdG9yeX1cblxuSHVtYW46IHtpbnB1dH1cbkFzc2lzdGFudDpgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc3lzdGVtIHByb21wdCBiYXNlZCBvbiBwZXJzb25hIGFuZCBjb250ZXh0XG4gICAqL1xuICBwcml2YXRlIGdldFN5c3RlbVByb21wdChjb250ZXh0OiBBZ2VudENvbnRleHQsIHBlcnNvbmE6IEFnZW50UGVyc29uYSk6IHN0cmluZyB7XG4gICAgLy8gVXNlIHRoZSBwZXJzb25hJ3Mgc3lzdGVtIHByb21wdCBhcyB0aGUgcHJpbWFyeSBpbnN0cnVjdGlvblxuICAgIHJldHVybiBwZXJzb25hLnN5c3RlbVByb21wdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIG1lc3NhZ2UgYW5kIHJldHVybiBzdHJ1Y3R1cmVkIHJlc3BvbnNlIHdpdGggbWV0YWRhdGFcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlU3RydWN0dXJlZChjb250ZXh0OiBBZ2VudENvbnRleHQpOiBQcm9taXNlPEFnZW50UmVzcG9uc2U+IHtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgICBjb25zdCBwcm9jZXNzaW5nVGltZSA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGlmIHdlIGRldGVjdGVkIGFuIGludGVudCBkdXJpbmcgcHJvY2Vzc2luZ1xuICAgICAgbGV0IGludGVudERhdGE6IEFnZW50UmVzcG9uc2VbJ2ludGVudCddIHwgdW5kZWZpbmVkO1xuICAgICAgXG4gICAgICAvLyBSZS1ydW4gaW50ZW50IGRldGVjdGlvbiB0byBnZXQgdGhlIG1ldGFkYXRhICh0aGlzIGlzIGNhY2hlZC9mYXN0KVxuICAgICAgbGV0IGN1cnJlbnRQZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gICAgICBpZiAodGhpcy5wZXJzb25hU2VydmljZSAmJiB0aGlzLmNvbmZpZy5wZXJzb25hSWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjdXJyZW50UGVyc29uYSA9IGF3YWl0IHRoaXMucGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYSgnZGVmYXVsdCcsIHRoaXMuY29uZmlnLnBlcnNvbmFJZCwgdGhpcy5jb25maWcuY29tcGFueUluZm8pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGN1cnJlbnRQZXJzb25hID0gZ2V0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50UGVyc29uYSA9IGdldFBlcnNvbmEodGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW50ZW50TWF0Y2ggPSBhd2FpdCB0aGlzLmludGVudFNlcnZpY2UuZGV0ZWN0SW50ZW50KFxuICAgICAgICBjb250ZXh0LnRleHQsXG4gICAgICAgIGN1cnJlbnRQZXJzb25hLFxuICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyB8fCB7XG4gICAgICAgICAgbmFtZTogJ1BsYW5ldCBGaXRuZXNzJyxcbiAgICAgICAgICBpbmR1c3RyeTogJ0ZpdG5lc3MgJiBXZWxsbmVzcycsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdBbWVyaWNhXFwncyBtb3N0IHBvcHVsYXIgZ3ltIHdpdGggb3ZlciAyLDQwMCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHByb2R1Y3RzOiAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgICAgICAgYmVuZWZpdHM6ICdBZmZvcmRhYmxlIHByaWNpbmcsIGp1ZGdtZW50LWZyZWUgZW52aXJvbm1lbnQsIGNvbnZlbmllbnQgbG9jYXRpb25zJyxcbiAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdQZW9wbGUgb2YgYWxsIGZpdG5lc3MgbGV2ZWxzIGxvb2tpbmcgZm9yIGFuIGFmZm9yZGFibGUsIG5vbi1pbnRpbWlkYXRpbmcgZ3ltIGV4cGVyaWVuY2UnLFxuICAgICAgICAgIGRpZmZlcmVudGlhdG9yczogJ0xvdyBjb3N0LCBuby1qdWRnbWVudCBhdG1vc3BoZXJlLCBiZWdpbm5lci1mcmllbmRseSBlbnZpcm9ubWVudCdcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgIGNoYW5uZWw6IGNvbnRleHQuc291cmNlIGFzIHN0cmluZ1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICBpZiAoaW50ZW50TWF0Y2ggJiYgaW50ZW50TWF0Y2guY29uZmlkZW5jZSA+IDAuNykge1xuICAgICAgICBpbnRlbnREYXRhID0ge1xuICAgICAgICAgIGlkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgbmFtZTogaW50ZW50TWF0Y2guaW50ZW50Lm5hbWUsXG4gICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICBwcmlvcml0eTogaW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5LFxuICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgIG1hdGNoZWRQYXR0ZXJuczogaW50ZW50TWF0Y2gubWF0Y2hlZFBhdHRlcm5zLFxuICAgICAgICAgIGFjdGlvbnM6IGludGVudE1hdGNoLmFjdGlvbnNcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UsXG4gICAgICAgIGludGVudDogaW50ZW50RGF0YSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICB1c2VySWQ6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogcHJvY2Vzc2luZ1RpbWUsXG4gICAgICAgICAgcGVyc29uYUlkOiB0aGlzLmNvbmZpZy5wZXJzb25hSWQsXG4gICAgICAgICAgY29tcGFueU5hbWU6IHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvPy5uYW1lXG4gICAgICAgIH0sXG4gICAgICAgIGZvbGxvd1VwOiBpbnRlbnRNYXRjaD8uZm9sbG93VXBcbiAgICAgIH07XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgcHJvY2Vzc2luZ1RpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogJ0kgYXBvbG9naXplLCBidXQgSSBlbmNvdW50ZXJlZCBhbiBlcnJvciBwcm9jZXNzaW5nIHlvdXIgbWVzc2FnZS4gUGxlYXNlIHRyeSBhZ2Fpbi4nLFxuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBjaGFubmVsOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICBwcm9jZXNzaW5nVGltZU1zOiBwcm9jZXNzaW5nVGltZSxcbiAgICAgICAgICBwZXJzb25hSWQ6IHRoaXMuY29uZmlnLnBlcnNvbmFJZCxcbiAgICAgICAgICBjb21wYW55TmFtZTogdGhpcy5jb25maWcuY29tcGFueUluZm8/Lm5hbWVcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICBjb2RlOiAnUFJPQ0VTU0lOR19FUlJPUicsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgICAgZGV0YWlsczogZXJyb3JcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lIHByZWZlcnJlZCBjaGFubmVsIGZvciByZXNwb25zZSBiYXNlZCBvbiBjb250ZXh0IGFuZCB0ZW5hbnQgcHJlZmVyZW5jZXNcbiAgICovXG4gIGRldGVybWluZVByZWZlcnJlZENoYW5uZWwoY29udGV4dDogQWdlbnRDb250ZXh0LCB0ZW5hbnRQcmVmZXJlbmNlcz86IFJlY29yZDxzdHJpbmcsIGFueT4pOiBNZXNzYWdlU291cmNlIHtcbiAgICAvLyBEZWZhdWx0IHRvIHRoZSBvcmlnaW5hdGluZyBjaGFubmVsXG4gICAgaWYgKHRlbmFudFByZWZlcmVuY2VzPy5wcmVmZXJyZWRDaGFubmVsKSB7XG4gICAgICByZXR1cm4gdGVuYW50UHJlZmVyZW5jZXMucHJlZmVycmVkQ2hhbm5lbCBhcyBNZXNzYWdlU291cmNlO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY29udGV4dC5zb3VyY2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHJvdXRpbmcgaW5mb3JtYXRpb24gZm9yIHRoZSByZXNwb25zZVxuICAgKi9cbiAgY3JlYXRlUm91dGluZ0luZm8oY29udGV4dDogQWdlbnRDb250ZXh0LCBwcmVmZXJyZWRDaGFubmVsOiBNZXNzYWdlU291cmNlKToge1xuICAgIHNtcz86IHsgdG86IHN0cmluZyB9O1xuICAgIGVtYWlsPzogeyB0bzogc3RyaW5nIH07XG4gICAgY2hhdD86IHsgc2Vzc2lvbklkOiBzdHJpbmcgfTtcbiAgfSB7XG4gICAgY29uc3Qgcm91dGluZzogYW55ID0ge307XG4gICAgXG4gICAgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdzbXMnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5zbXMpIHtcbiAgICAgIHJvdXRpbmcuc21zID0geyB0bzogY29udGV4dC5jaGFubmVsX2NvbnRleHQuc21zLmZyb20gfTtcbiAgICB9IGVsc2UgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdlbWFpbCcgJiYgY29udGV4dC5jaGFubmVsX2NvbnRleHQ/LmVtYWlsKSB7XG4gICAgICByb3V0aW5nLmVtYWlsID0geyB0bzogY29udGV4dC5jaGFubmVsX2NvbnRleHQuZW1haWwuZnJvbSB9O1xuICAgIH0gZWxzZSBpZiAocHJlZmVycmVkQ2hhbm5lbCA9PT0gJ2NoYXQnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5jaGF0KSB7XG4gICAgICByb3V0aW5nLmNoYXQgPSB7IHNlc3Npb25JZDogY29udGV4dC5jaGFubmVsX2NvbnRleHQuY2hhdC5zZXNzaW9uSWQgfTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHJvdXRpbmc7XG4gIH1cbn0iXX0=