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
        // Model will be initialized per-request with verbosity-aware maxTokens and temperature
        // DO NOT initialize here - wait until we have persona settings in processMessage()!
        this.model = null; // Will be created in processMessage() with correct settings
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
            // Configure model maxTokens based on verbosity trait
            // Linear progression: start at 40, add 20 per level
            const verbosity = currentPersona?.personalityTraits?.verbosity || 5;
            let maxTokens;
            let temperature;
            switch (verbosity) {
                case 1:
                    maxTokens = 40; // ~1 sentence
                    temperature = 0.3;
                    break;
                case 2:
                    maxTokens = 60; // ~1-2 sentences
                    temperature = 0.3;
                    break;
                case 3:
                    maxTokens = 80; // ~2 sentences
                    temperature = 0.4;
                    break;
                case 4:
                    maxTokens = 100; // ~2-3 sentences
                    temperature = 0.4;
                    break;
                case 5:
                    maxTokens = 120; // ~3 sentences
                    temperature = 0.5;
                    break;
                case 6:
                    maxTokens = 140; // ~3-4 sentences
                    temperature = 0.5;
                    break;
                case 7:
                    maxTokens = 160; // ~4 sentences
                    temperature = 0.6;
                    break;
                case 8:
                    maxTokens = 180; // ~4-5 sentences
                    temperature = 0.6;
                    break;
                case 9:
                    maxTokens = 200; // ~5-6 sentences
                    temperature = 0.7;
                    break;
                case 10:
                    maxTokens = 220; // ~6-7 sentences ("lecture mode")
                    temperature = 0.7;
                    break;
                default:
                    maxTokens = 120; // Default to 5
                    temperature = 0.5;
            }
            // 👉 Decide if we'll add a question via second LLM call
            const questionRatio = currentPersona?.personalityTraits?.questionRatio;
            let shouldAddQuestion = false;
            const QUESTION_TOKEN_RESERVE = 20; // Reserve 20 tokens for the follow-up question
            if (questionRatio !== undefined) {
                const probability = questionRatio / 10; // 1–10 → 0.1–1.0
                const isAlwaysAsk = questionRatio >= 9; // 9–10 = always enforce
                shouldAddQuestion = isAlwaysAsk || Math.random() < probability;
                console.log(`❓ Question behavior for this turn: ratio=${questionRatio}/10, ` +
                    `prob=${Math.round(probability * 100)}%, alwaysAsk=${isAlwaysAsk}, ` +
                    `willAddQuestion=${shouldAddQuestion}`);
                // If we'll add a question, reserve 20 tokens from the main response
                if (shouldAddQuestion) {
                    maxTokens = Math.max(30, maxTokens - QUESTION_TOKEN_RESERVE); // Don't go below 30
                    console.log(`❓ Reserved ${QUESTION_TOKEN_RESERVE} tokens for question, main response maxTokens reduced to ${maxTokens}`);
                }
            }
            console.log(`🎚️ Setting maxTokens=${maxTokens}, temperature=${temperature} based on verbosity=${verbosity}`);
            // Recreate model with verbosity-aware maxTokens and temperature
            this.model = new aws_1.ChatBedrockConverse({
                model: this.config.bedrockModelId,
                region: this.config.awsRegion,
                temperature,
                maxTokens,
            });
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
            // Log response length for monitoring
            const sentences = response.match(/[^.!?]+[.!?]+/g) || [response];
            console.log(`📊 Claude generated: ${sentences.length} sentences (verbosity: ${verbosity}, maxTokens: ${maxTokens})`);
            // 👉 SECOND LLM CALL: Generate follow-up question if needed
            if (shouldAddQuestion) {
                console.log(`❓ Generating follow-up question via second LLM call...`);
                try {
                    // Create a tiny model for question generation only
                    const questionModel = new aws_1.ChatBedrockConverse({
                        model: this.config.bedrockModelId,
                        region: this.config.awsRegion,
                        temperature: 0.7, // More creative for questions
                        maxTokens: 20, // TINY - just enough for a question
                    });
                    // Build prompt: Generate ONLY a question, not a response
                    const questionPrompt = `Task: Generate ONLY a short follow-up question. Do not respond, explain, or add anything else. Just output the question.

You are ${currentPersona.name}. You just said: "${response.trim()}"

Generate ONE short follow-up question in the same language to keep the conversation flowing. Output ONLY the question text, nothing else:`;
                    const questionResponse = await questionModel.invoke([
                        new messages_1.HumanMessage(questionPrompt)
                    ]);
                    // Extract question text from response
                    let question = '';
                    if (typeof questionResponse.content === 'string') {
                        question = questionResponse.content.trim();
                    }
                    else if (Array.isArray(questionResponse.content)) {
                        question = questionResponse.content.map(c => {
                            if (typeof c === 'string')
                                return c;
                            if (c && typeof c === 'object' && 'text' in c)
                                return c.text || '';
                            return '';
                        }).join('').trim();
                    }
                    // Clean up - remove quotes if present
                    question = question.replace(/^["']|["']$/g, '').trim();
                    console.log(`❓ Generated question: ${question}`);
                    // Append question to main response
                    if (question) {
                        response = `${response} ${question}`;
                    }
                }
                catch (error) {
                    console.error('❌ Failed to generate question:', error);
                    // Continue without question - don't block the response
                }
            }
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
        // CRITICAL: Build verbosity constraint FIRST - this must be the TOP priority
        const verbosity = persona?.personalityTraits?.verbosity || 5;
        let verbosityRule = '';
        if (verbosity <= 2) {
            verbosityRule = '🚨 CRITICAL RESPONSE CONSTRAINT: EXTREMELY BRIEF - Maximum 1-2 sentences total. NO EXCEPTIONS. Get to the point immediately.\n\n';
        }
        else if (verbosity <= 4) {
            verbosityRule = '🚨 CRITICAL RESPONSE CONSTRAINT: CONCISE - Maximum 2-3 sentences total. Be direct and avoid rambling.\n\n';
        }
        else if (verbosity <= 6) {
            verbosityRule = '🚨 CRITICAL RESPONSE CONSTRAINT: BALANCED - Keep to 3-4 sentences maximum. Be thorough but not excessive.\n\n';
        }
        else if (verbosity <= 8) {
            verbosityRule = '📝 Response guideline: 4-6 sentences maximum. Provide explanations and context.\n\n';
        }
        else {
            verbosityRule = '📝 Response guideline: 6-10 sentences when needed. Be thorough and educational.\n\n';
        }
        // Start with verbosity rule, THEN add persona's system prompt
        let systemPrompt = verbosityRule + persona.systemPrompt;
        // Convert first-person to second-person if needed (allows users to write naturally)
        const { PronounConverter } = require('./pronoun-converter.js');
        if (PronounConverter.isFirstPerson(systemPrompt)) {
            console.log('🔄 Converting system prompt from first-person to second-person');
            systemPrompt = PronounConverter.firstToSecondPerson(systemPrompt);
        }
        // If numeric personality traits are defined, inject them AFTER verbosity constraint
        if (persona.personalityTraits) {
            const { PersonalityTraitsInterpreter } = require('./personality-traits-interpreter.js');
            const traitsSection = PersonalityTraitsInterpreter.generatePromptSection(persona.personalityTraits);
            systemPrompt += traitsSection;
        }
        // If personality quirks are defined, inject them as specific behaviors
        if (persona.personalityQuirks && Array.isArray(persona.personalityQuirks) && persona.personalityQuirks.length > 0) {
            const quirksSection = `

PERSONALITY QUIRKS & MANNERISMS:
${persona.personalityQuirks.map((quirk) => `- ${quirk}`).join('\n')}`;
            systemPrompt += quirksSection;
        }
        // ALWAYS append core agent behavior rules (non-configurable)
        const coreRules = `

CORE AGENT BEHAVIOR (ALWAYS FOLLOW):
- 🌍 ALWAYS respond in the SAME LANGUAGE the user is speaking. If they speak Spanish, you speak Spanish. If they speak English, you speak English. MATCH THEIR LANGUAGE EXACTLY.
- Incorporate your terminology naturally
- Follow responseGuidelines for channel-specific behavior, contact collection, and conversation rules
- Always check conversationRules.requireContactForDetails before sharing detailed information
- Maintain your persona's voice and style consistently throughout the conversation
- Never volunteer that you are an AI
- Answer as a real team member of {{companyName}}, but if directly asked, say you're a virtual assistant
- NEVER bring up that you are AI on your own. If directly asked, say you're a virtual assistant that works with the team at {{companyName}}`;
        systemPrompt += coreRules;
        // Enforce question behavior based on questionRatio
        const questionRatio = persona?.personalityTraits?.questionRatio;
        // If ratio is high (9-10), ALWAYS require a question.
        // Otherwise use probabilistic behavior.
        if (questionRatio !== undefined) {
            const probability = questionRatio / 10;
            const isAlwaysAsk = questionRatio >= 9; // 9-10 = always ask
            const shouldRequireQuestion = isAlwaysAsk || Math.random() < probability;
            if (shouldRequireQuestion) {
                console.log(`❓ Question enforced: ratio=${questionRatio}/10 (${Math.round(probability * 100)}%), alwaysAsk=${isAlwaysAsk}`);
                systemPrompt += `

IMPORTANT INSTRUCTION FOR THIS RESPONSE:
You MUST end your response with a natural, contextual question that keeps the conversation engaging. 
Make the question fit naturally with your personality and the conversation flow. 
Match the language the user is speaking.`;
            }
            else {
                console.log(`❓ Question optional this turn: ratio=${questionRatio}/10 (${Math.round(probability * 100)}%)`);
            }
        }
        return systemPrompt;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdDQUFxRDtBQUNyRCw2Q0FBcUQ7QUFDckQsNkNBQWdEO0FBQ2hELHFEQUF5RDtBQUN6RCx1REFBZ0Y7QUFDaEYsdURBQXdEO0FBQ3hELHFFQUE2RDtBQUM3RCwrQ0FBZ0Q7QUFDaEQscURBQXNEO0FBQ3RELHVEQUFzRTtBQUN0RSw2REFBd0U7QUFDeEUsK0RBQTRFO0FBQzVFLDJEQUFzRTtBQUN0RSxpRUFBd0Y7QUFDeEYsdUVBQXFGO0FBQ3JGLDJFQUFzSDtBQWN0SDs7R0FFRztBQUNILE1BQWEsWUFBWTtJQVd2QixZQUFZLE1BQTBCO1FBQ3BDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLGtFQUFrRTtRQUNsRSxrREFBa0Q7UUFDbEQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLG1DQUFjLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsQ0FBQztRQUV2RSw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLGlDQUFhLEVBQUUsQ0FBQztRQUV6QywrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksdUNBQWdCLEVBQUUsQ0FBQztRQUUvQyxvRkFBb0Y7UUFDcEYsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksNENBQWtCLENBQUM7WUFDL0MsT0FBTyxFQUFFLEtBQUs7WUFDZCxRQUFRLEVBQUUsRUFBRTtZQUNaLGFBQWEsRUFBRSxJQUFJO1NBQ3BCLENBQUMsQ0FBQztRQUVILGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLG9CQUFvQixJQUFJLElBQUksZ0RBQW9CLEVBQUUsQ0FBQztRQUV0RixvRUFBb0U7UUFDcEUsSUFBSSxDQUFDLGNBQWMsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFD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O1FBQzdELENBQUM7YUFBTSxJQUFJLGdCQUFnQixLQUFLLE1BQU0sSUFBSSxPQUFPLENBQUMsZUFBZSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ3hFLE9BQU8sQ0FBQyxJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDdkUsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7Q0FDRjtBQTMxQkQsb0NBMjFCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENoYXRCZWRyb2NrQ29udmVyc2UgfSBmcm9tICdAbGFuZ2NoYWluL2F3cyc7XG5pbXBvcnQgeyBDb252ZXJzYXRpb25DaGFpbiB9IGZyb20gJ2xhbmdjaGFpbi9jaGFpbnMnO1xuaW1wb3J0IHsgQnVmZmVyTWVtb3J5IH0gZnJvbSAnbGFuZ2NoYWluL21lbW9yeSc7XG5pbXBvcnQgeyBQcm9tcHRUZW1wbGF0ZSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9wcm9tcHRzJztcbmltcG9ydCB7IEJhc2VNZXNzYWdlLCBIdW1hbk1lc3NhZ2UsIEFJTWVzc2FnZSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9tZXNzYWdlcyc7XG5pbXBvcnQgeyBLeER5bmFtb0NoYXRIaXN0b3J5IH0gZnJvbSAnLi9jaGF0LWhpc3RvcnkuanMnO1xuaW1wb3J0IHsgTWVtb3J5Q2hhdEhpc3RvcnkgfSBmcm9tICcuL21lbW9yeS1jaGF0LWhpc3RvcnkuanMnO1xuaW1wb3J0IHsgRHluYW1vREJTZXJ2aWNlIH0gZnJvbSAnLi9keW5hbW9kYi5qcyc7XG5pbXBvcnQgeyBFdmVudEJyaWRnZVNlcnZpY2UgfSBmcm9tICcuL2V2ZW50YnJpZGdlLmpzJztcbmltcG9ydCB7IGdldFBlcnNvbmEsIHR5cGUgQWdlbnRQZXJzb25hIH0gZnJvbSAnLi4vY29uZmlnL3BlcnNvbmFzLmpzJztcbmltcG9ydCB7IFBlcnNvbmFTZXJ2aWNlLCB0eXBlIENvbXBhbnlJbmZvIH0gZnJvbSAnLi9wZXJzb25hLXNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VDaHVua2VyLCB0eXBlIFJlc3BvbnNlQ2h1bmsgfSBmcm9tICcuL3Jlc3BvbnNlLWNodW5rZXIuanMnO1xuaW1wb3J0IHsgSW50ZW50U2VydmljZSwgdHlwZSBJbnRlbnRNYXRjaCB9IGZyb20gJy4vaW50ZW50LXNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR29hbE9yY2hlc3RyYXRvciwgdHlwZSBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCB9IGZyb20gJy4vZ29hbC1vcmNoZXN0cmF0b3IuanMnO1xuaW1wb3J0IHsgQWN0aW9uVGFnUHJvY2Vzc29yLCB0eXBlIEFjdGlvblRhZ0NvbmZpZyB9IGZyb20gJy4vYWN0aW9uLXRhZy1wcm9jZXNzb3IuanMnO1xuaW1wb3J0IHsgSW50ZW50QWN0aW9uUmVnaXN0cnksIHR5cGUgSW50ZW50QWN0aW9uQ29udGV4dCwgdHlwZSBJbnRlbnRBY3Rpb25SZXN1bHQgfSBmcm9tICcuL2ludGVudC1hY3Rpb24tcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUGVyc29uYVN0b3JhZ2UgfSBmcm9tICcuL3BlcnNvbmEtc3RvcmFnZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50Q29udGV4dCwgUnVudGltZUNvbmZpZywgTWVzc2FnZVNvdXJjZSwgQWdlbnRSZXNwb25zZSB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBBZ2VudFNlcnZpY2VDb25maWcgZXh0ZW5kcyBSdW50aW1lQ29uZmlnIHtcbiAgZHluYW1vU2VydmljZT86IER5bmFtb0RCU2VydmljZTtcbiAgZXZlbnRCcmlkZ2VTZXJ2aWNlPzogRXZlbnRCcmlkZ2VTZXJ2aWNlO1xuICBwZXJzb25hSWQ/OiBzdHJpbmc7IC8vIEFnZW50IHBlcnNvbmEgdG8gdXNlIChkZWZhdWx0cyB0byAnY2FybG9zJylcbiAgcGVyc29uYT86IGFueTsgLy8gUHJlLWxvYWRlZCBwZXJzb25hIG9iamVjdCAoc2tpcHMgcGVyc29uYSBsb2FkaW5nIGlmIHByb3ZpZGVkKVxuICBpbnRlbnRBY3Rpb25SZWdpc3RyeT86IEludGVudEFjdGlvblJlZ2lzdHJ5O1xuICBwZXJzb25hU3RvcmFnZT86IFBlcnNvbmFTdG9yYWdlO1xuICBjb21wYW55SW5mbz86IENvbXBhbnlJbmZvOyAvLyBDb21wYW55IGluZm9ybWF0aW9uIGZvciBwZXJzb25hIGN1c3RvbWl6YXRpb25cbn1cblxuLyoqXG4gKiBMYW5nQ2hhaW4gYWdlbnQgc2VydmljZSB0aGF0IHByb2Nlc3NlcyBtZXNzYWdlcyBhbmQgZ2VuZXJhdGVzIHJlc3BvbnNlc1xuICovXG5leHBvcnQgY2xhc3MgQWdlbnRTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBjb25maWc6IEFnZW50U2VydmljZUNvbmZpZztcbiAgcHJpdmF0ZSBtb2RlbDogQ2hhdEJlZHJvY2tDb252ZXJzZTtcbiAgcHJpdmF0ZSBwZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gIHByaXZhdGUgcGVyc29uYVNlcnZpY2U/OiBQZXJzb25hU2VydmljZTtcbiAgcHJpdmF0ZSBpbnRlbnRTZXJ2aWNlOiBJbnRlbnRTZXJ2aWNlO1xuICBwcml2YXRlIGdvYWxPcmNoZXN0cmF0b3I6IEdvYWxPcmNoZXN0cmF0b3I7XG4gIHByaXZhdGUgYWN0aW9uVGFnUHJvY2Vzc29yOiBBY3Rpb25UYWdQcm9jZXNzb3I7XG4gIHByaXZhdGUgaW50ZW50QWN0aW9uUmVnaXN0cnk6IEludGVudEFjdGlvblJlZ2lzdHJ5O1xuICBwcml2YXRlIHBlcnNvbmFTdG9yYWdlPzogUGVyc29uYVN0b3JhZ2U7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBBZ2VudFNlcnZpY2VDb25maWcpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICBcbiAgICAvLyBBbHdheXMgaW5pdGlhbGl6ZSBwZXJzb25hIHNlcnZpY2UgZm9yIGNvbXBhbnkgaW5mbyBzdWJzdGl0dXRpb25cbiAgICAvLyBQYXNzIG51bGwgZm9yIER5bmFtb0RCIHNlcnZpY2UgaWYgbm90IGF2YWlsYWJsZVxuICAgIHRoaXMucGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UoY29uZmlnLmR5bmFtb1NlcnZpY2UgfHwgbnVsbCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBpbnRlbnQgc2VydmljZVxuICAgIHRoaXMuaW50ZW50U2VydmljZSA9IG5ldyBJbnRlbnRTZXJ2aWNlKCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBnb2FsIG9yY2hlc3RyYXRvclxuICAgIHRoaXMuZ29hbE9yY2hlc3RyYXRvciA9IG5ldyBHb2FsT3JjaGVzdHJhdG9yKCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBhY3Rpb24gdGFnIHByb2Nlc3NvciB3aXRoIGRlZmF1bHQgY29uZmlnICh3aWxsIGJlIHVwZGF0ZWQgcGVyIHBlcnNvbmEpXG4gICAgdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IgPSBuZXcgQWN0aW9uVGFnUHJvY2Vzc29yKHtcbiAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgbWFwcGluZ3M6IHt9LFxuICAgICAgZmFsbGJhY2tFbW9qaTogJ/CfmIonXG4gICAgfSk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBpbnRlbnQgYWN0aW9uIHJlZ2lzdHJ5ICh1c2UgcHJvdmlkZWQgb3IgY3JlYXRlIG5ldylcbiAgICB0aGlzLmludGVudEFjdGlvblJlZ2lzdHJ5ID0gY29uZmlnLmludGVudEFjdGlvblJlZ2lzdHJ5IHx8IG5ldyBJbnRlbnRBY3Rpb25SZWdpc3RyeSgpO1xuICAgIFxuICAgIC8vIEluaXRpYWxpemUgcGVyc29uYSBzdG9yYWdlICh1c2UgcHJvdmlkZWQgb3IgY3JlYXRlIHdpdGggZmFsbGJhY2spXG4gICAgdGhpcy5wZXJzb25hU3RvcmFnZSA9IGNvbmZpZy5wZXJzb25hU3RvcmFnZTtcbiAgICBcbiAgICAvLyBQZXJzb25hIHdpbGwgYmUgbG9hZGVkIHBlci1yZXF1ZXN0IHdpdGggY29tcGFueSBpbmZvIHN1YnN0aXR1dGlvblxuICAgIHRoaXMucGVyc29uYSA9IHt9IGFzIEFnZW50UGVyc29uYTsgLy8gV2lsbCBiZSBsb2FkZWQgcGVyLXJlcXVlc3RcbiAgICBcbiAgICAvLyBNb2RlbCB3aWxsIGJlIGluaXRpYWxpemVkIHBlci1yZXF1ZXN0IHdpdGggdmVyYm9zaXR5LWF3YXJlIG1heFRva2VucyBhbmQgdGVtcGVyYXR1cmVcbiAgICAvLyBETyBOT1QgaW5pdGlhbGl6ZSBoZXJlIC0gd2FpdCB1bnRpbCB3ZSBoYXZlIHBlcnNvbmEgc2V0dGluZ3MgaW4gcHJvY2Vzc01lc3NhZ2UoKSFcbiAgICB0aGlzLm1vZGVsID0gbnVsbCBhcyBhbnk7IC8vIFdpbGwgYmUgY3JlYXRlZCBpbiBwcm9jZXNzTWVzc2FnZSgpIHdpdGggY29ycmVjdCBzZXR0aW5nc1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgYW4gYWdlbnQgY29udGV4dCBhbmQgZ2VuZXJhdGUgYSByZXNwb25zZVxuICAgKiBAcGFyYW0gY29udGV4dCAtIFRoZSBhZ2VudCBjb250ZXh0XG4gICAqIEBwYXJhbSBleGlzdGluZ0hpc3RvcnkgLSBPcHRpb25hbCBjaGF0IGhpc3RvcnkgKGZvciBDTEkvbG9jYWwgdXNlKVxuICAgKi9cbiAgYXN5bmMgcHJvY2Vzc01lc3NhZ2UoY29udGV4dDogQWdlbnRDb250ZXh0LCBleGlzdGluZ0hpc3Rvcnk/OiBCYXNlTWVzc2FnZVtdKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICAvLyBMb2FkIHBlcnNvbmEgZm9yIHRoaXMgdGVuYW50IHdpdGggY29tcGFueSBpbmZvIHN1YnN0aXR1dGlvblxuICAgICAgbGV0IGN1cnJlbnRQZXJzb25hID0gdGhpcy5wZXJzb25hO1xuICAgICAgXG4gICAgICAvLyBVc2UgcHJlLWxvYWRlZCBwZXJzb25hIGlmIHByb3ZpZGVkIChmcm9tIGhhbmRsZXIpXG4gICAgICBpZiAodGhpcy5jb25maWcucGVyc29uYSkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+RpCBVc2luZyBwcmUtbG9hZGVkIHBlcnNvbmEgZnJvbSBjb25maWdgKTtcbiAgICAgICAgY3VycmVudFBlcnNvbmEgPSB0aGlzLmNvbmZpZy5wZXJzb25hIGFzIEFnZW50UGVyc29uYTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wZXJzb25hU2VydmljZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGN1cnJlbnRQZXJzb25hID0gYXdhaXQgdGhpcy5wZXJzb25hU2VydmljZS5nZXRQZXJzb25hKFxuICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZCwgXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycsXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mb1xuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gbG9hZCBwZXJzb25hICR7dGhpcy5jb25maWcucGVyc29uYUlkfSBmb3IgdGVuYW50ICR7Y29udGV4dC50ZW5hbnRJZH0sIHVzaW5nIGZhbGxiYWNrOmAsIGVycm9yKTtcbiAgICAgICAgICAvLyBVc2UgUGVyc29uYVNlcnZpY2UgZmFsbGJhY2sgdG8gZW5zdXJlIGdvYWxDb25maWd1cmF0aW9uIGlzIGxvYWRlZFxuICAgICAgICAgIGN1cnJlbnRQZXJzb25hID0gdGhpcy5wZXJzb25hU2VydmljZS5nZXREZWZhdWx0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycsIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDb25maWd1cmUgYWN0aW9uIHRhZyBwcm9jZXNzb3IgYmFzZWQgb24gcGVyc29uYVxuICAgICAgaWYgKChjdXJyZW50UGVyc29uYSBhcyBhbnkpLmFjdGlvblRhZ3MpIHtcbiAgICAgICAgY29uc3QgYWN0aW9uVGFnQ29uZmlnID0gKGN1cnJlbnRQZXJzb25hIGFzIGFueSkuYWN0aW9uVGFncyBhcyBBY3Rpb25UYWdDb25maWc7XG4gICAgICAgIHRoaXMuYWN0aW9uVGFnUHJvY2Vzc29yID0gbmV3IEFjdGlvblRhZ1Byb2Nlc3NvcihhY3Rpb25UYWdDb25maWcpO1xuICAgICAgfVxuXG4gICAgICAvLyBDb25maWd1cmUgbW9kZWwgbWF4VG9rZW5zIGJhc2VkIG9uIHZlcmJvc2l0eSB0cmFpdFxuICAgICAgLy8gTGluZWFyIHByb2dyZXNzaW9uOiBzdGFydCBhdCA0MCwgYWRkIDIwIHBlciBsZXZlbFxuICAgICAgY29uc3QgdmVyYm9zaXR5ID0gKGN1cnJlbnRQZXJzb25hIGFzIGFueSk/LnBlcnNvbmFsaXR5VHJhaXRzPy52ZXJib3NpdHkgfHwgNTtcbiAgICAgIGxldCBtYXhUb2tlbnM6IG51bWJlcjtcbiAgICAgIGxldCB0ZW1wZXJhdHVyZTogbnVtYmVyO1xuICAgICAgXG4gICAgICBzd2l0Y2ggKHZlcmJvc2l0eSkge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgbWF4VG9rZW5zID0gNDA7ICAgLy8gfjEgc2VudGVuY2VcbiAgICAgICAgICB0ZW1wZXJhdHVyZSA9IDAuMztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIG1heFRva2VucyA9IDYwOyAgIC8vIH4xLTIgc2VudGVuY2VzXG4gICAgICAgICAgdGVtcGVyYXR1cmUgPSAwLjM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICBtYXhUb2tlbnMgPSA4MDsgICAvLyB+MiBzZW50ZW5jZXNcbiAgICAgICAgICB0ZW1wZXJhdHVyZSA9IDAuNDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OlxuICAgICAgICAgIG1heFRva2VucyA9IDEwMDsgIC8vIH4yLTMgc2VudGVuY2VzXG4gICAgICAgICAgdGVtcGVyYXR1cmUgPSAwLjQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNTpcbiAgICAgICAgICBtYXhUb2tlbnMgPSAxMjA7ICAvLyB+MyBzZW50ZW5jZXNcbiAgICAgICAgICB0ZW1wZXJhdHVyZSA9IDAuNTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA2OlxuICAgICAgICAgIG1heFRva2VucyA9IDE0MDsgIC8vIH4zLTQgc2VudGVuY2VzXG4gICAgICAgICAgdGVtcGVyYXR1cmUgPSAwLjU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNzpcbiAgICAgICAgICBtYXhUb2tlbnMgPSAxNjA7ICAvLyB+NCBzZW50ZW5jZXNcbiAgICAgICAgICB0ZW1wZXJhdHVyZSA9IDAuNjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA4OlxuICAgICAgICAgIG1heFRva2VucyA9IDE4MDsgIC8vIH40LTUgc2VudGVuY2VzXG4gICAgICAgICAgdGVtcGVyYXR1cmUgPSAwLjY7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgOTpcbiAgICAgICAgICBtYXhUb2tlbnMgPSAyMDA7ICAvLyB+NS02IHNlbnRlbmNlc1xuICAgICAgICAgIHRlbXBlcmF0dXJlID0gMC43O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDEwOlxuICAgICAgICAgIG1heFRva2VucyA9IDIyMDsgIC8vIH42LTcgc2VudGVuY2VzIChcImxlY3R1cmUgbW9kZVwiKVxuICAgICAgICAgIHRlbXBlcmF0dXJlID0gMC43O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIG1heFRva2VucyA9IDEyMDsgIC8vIERlZmF1bHQgdG8gNVxuICAgICAgICAgIHRlbXBlcmF0dXJlID0gMC41O1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyDwn5GJIERlY2lkZSBpZiB3ZSdsbCBhZGQgYSBxdWVzdGlvbiB2aWEgc2Vjb25kIExMTSBjYWxsXG4gICAgICBjb25zdCBxdWVzdGlvblJhdGlvID0gKGN1cnJlbnRQZXJzb25hIGFzIGFueSk/LnBlcnNvbmFsaXR5VHJhaXRzPy5xdWVzdGlvblJhdGlvO1xuICAgICAgbGV0IHNob3VsZEFkZFF1ZXN0aW9uID0gZmFsc2U7XG4gICAgICBjb25zdCBRVUVTVElPTl9UT0tFTl9SRVNFUlZFID0gMjA7IC8vIFJlc2VydmUgMjAgdG9rZW5zIGZvciB0aGUgZm9sbG93LXVwIHF1ZXN0aW9uXG4gICAgICBcbiAgICAgIGlmIChxdWVzdGlvblJhdGlvICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBxdWVzdGlvblJhdGlvIC8gMTA7ICAgICAgICAvLyAx4oCTMTAg4oaSIDAuMeKAkzEuMFxuICAgICAgICBjb25zdCBpc0Fsd2F5c0FzayA9IHF1ZXN0aW9uUmF0aW8gPj0gOTsgICAgICAgIC8vIDnigJMxMCA9IGFsd2F5cyBlbmZvcmNlXG4gICAgICAgIHNob3VsZEFkZFF1ZXN0aW9uID0gaXNBbHdheXNBc2sgfHwgTWF0aC5yYW5kb20oKSA8IHByb2JhYmlsaXR5O1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYOKdkyBRdWVzdGlvbiBiZWhhdmlvciBmb3IgdGhpcyB0dXJuOiByYXRpbz0ke3F1ZXN0aW9uUmF0aW99LzEwLCBgICtcbiAgICAgICAgICBgcHJvYj0ke01hdGgucm91bmQocHJvYmFiaWxpdHkgKiAxMDApfSUsIGFsd2F5c0Fzaz0ke2lzQWx3YXlzQXNrfSwgYCArXG4gICAgICAgICAgYHdpbGxBZGRRdWVzdGlvbj0ke3Nob3VsZEFkZFF1ZXN0aW9ufWBcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIC8vIElmIHdlJ2xsIGFkZCBhIHF1ZXN0aW9uLCByZXNlcnZlIDIwIHRva2VucyBmcm9tIHRoZSBtYWluIHJlc3BvbnNlXG4gICAgICAgIGlmIChzaG91bGRBZGRRdWVzdGlvbikge1xuICAgICAgICAgIG1heFRva2VucyA9IE1hdGgubWF4KDMwLCBtYXhUb2tlbnMgLSBRVUVTVElPTl9UT0tFTl9SRVNFUlZFKTsgLy8gRG9uJ3QgZ28gYmVsb3cgMzBcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4p2TIFJlc2VydmVkICR7UVVFU1RJT05fVE9LRU5fUkVTRVJWRX0gdG9rZW5zIGZvciBxdWVzdGlvbiwgbWFpbiByZXNwb25zZSBtYXhUb2tlbnMgcmVkdWNlZCB0byAke21heFRva2Vuc31gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+Omu+4jyBTZXR0aW5nIG1heFRva2Vucz0ke21heFRva2Vuc30sIHRlbXBlcmF0dXJlPSR7dGVtcGVyYXR1cmV9IGJhc2VkIG9uIHZlcmJvc2l0eT0ke3ZlcmJvc2l0eX1gKTtcbiAgICAgIFxuICAgICAgLy8gUmVjcmVhdGUgbW9kZWwgd2l0aCB2ZXJib3NpdHktYXdhcmUgbWF4VG9rZW5zIGFuZCB0ZW1wZXJhdHVyZVxuICAgICAgdGhpcy5tb2RlbCA9IG5ldyBDaGF0QmVkcm9ja0NvbnZlcnNlKHtcbiAgICAgICAgbW9kZWw6IHRoaXMuY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICByZWdpb246IHRoaXMuY29uZmlnLmF3c1JlZ2lvbixcbiAgICAgICAgdGVtcGVyYXR1cmUsXG4gICAgICAgIG1heFRva2VucyxcbiAgICAgIH0gYXMgYW55KTtcblxuICAgICAgLy8gUnVuIGdvYWwgb3JjaGVzdHJhdGlvbiB0byBtYW5hZ2UgbGVhZCBxdWFsaWZpY2F0aW9uXG4gICAgICBsZXQgZ29hbFJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfCBudWxsID0gbnVsbDtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SNIEdvYWwgY29uZmlnIGVuYWJsZWQ6ICR7Y3VycmVudFBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24/LmVuYWJsZWR9LCBnb2FsczogJHtjdXJyZW50UGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbj8uZ29hbHM/Lmxlbmd0aCB8fCAwfWApO1xuICAgICAgXG4gICAgICBpZiAoY3VycmVudFBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24/LmVuYWJsZWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBnb2FsUmVzdWx0ID0gYXdhaXQgdGhpcy5nb2FsT3JjaGVzdHJhdG9yLm9yY2hlc3RyYXRlR29hbHMoXG4gICAgICAgICAgICBjb250ZXh0LnRleHQsXG4gICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCB8fCAnZGVmYXVsdCcsXG4gICAgICAgICAgICBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgIGN1cnJlbnRQZXJzb25hLmdvYWxDb25maWd1cmF0aW9uXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIC8vIExvZyBnb2FsIG9yY2hlc3RyYXRpb24gcmVzdWx0c1xuICAgICAgICAgIGlmIChnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm8gJiYgT2JqZWN0LmtleXMoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TpyBFeHRyYWN0ZWQgaW5mbzpgLCBnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm8pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gR29hbCByZWNvbW1lbmRhdGlvbnM6YCwgZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubWFwKHIgPT4gKHtcbiAgICAgICAgICAgICAgZ29hbDogci5nb2FsSWQsXG4gICAgICAgICAgICAgIHByaW9yaXR5OiByLnByaW9yaXR5LFxuICAgICAgICAgICAgICBzaG91bGRQdXJzdWU6IHIuc2hvdWxkUHVyc3VlLFxuICAgICAgICAgICAgICBhcHByb2FjaDogci5hcHByb2FjaFxuICAgICAgICAgICAgfSkpKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIFRyaWdnZXJlZCBpbnRlbnRzOmAsIGdvYWxSZXN1bHQudHJpZ2dlcmVkSW50ZW50cyk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFByb2Nlc3MgdHJpZ2dlcmVkIGludGVudHMgKGxpa2UgbGVhZF9nZW5lcmF0ZWQpXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRyaWdnZXJlZEludGVudElkIG9mIGdvYWxSZXN1bHQudHJpZ2dlcmVkSW50ZW50cykge1xuICAgICAgICAgICAgICBjb25zdCB0cmlnZ2VyZWRJbnRlbnQgPSBjdXJyZW50UGVyc29uYS5pbnRlbnRDYXB0dXJpbmc/LmludGVudHM/LmZpbmQoaSA9PiBpLmlkID09PSB0cmlnZ2VyZWRJbnRlbnRJZCk7XG4gICAgICAgICAgICAgIGlmICh0cmlnZ2VyZWRJbnRlbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+OiSBHT0FMIFRSSUdHRVJFRCBJTlRFTlQ6ICR7dHJpZ2dlcmVkSW50ZW50SWR9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAvLyBZb3UgY291bGQgcmV0dXJuIHRoZSB0cmlnZ2VyZWQgaW50ZW50IHJlc3BvbnNlIGhlcmUgaWYgZGVzaXJlZFxuICAgICAgICAgICAgICAgIC8vIEZvciBub3csIHdlJ2xsIGxldCB0aGUgbm9ybWFsIGZsb3cgY29udGludWUgYW5kIGFkZCBpdCBhcyBjb250ZXh0XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oJ0dvYWwgb3JjaGVzdHJhdGlvbiBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgZm9yIGludGVudCBtYXRjaGVzIGJlZm9yZSBwcm9jZXNzaW5nIHdpdGggTGFuZ0NoYWluXG4gICAgICBjb25zdCBpbnRlbnRNYXRjaCA9IGF3YWl0IHRoaXMuaW50ZW50U2VydmljZS5kZXRlY3RJbnRlbnQoXG4gICAgICAgIGNvbnRleHQudGV4dCxcbiAgICAgICAgY3VycmVudFBlcnNvbmEsXG4gICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvIHx8IHtcbiAgICAgICAgICBuYW1lOiAnUGxhbmV0IEZpdG5lc3MnLFxuICAgICAgICAgIGluZHVzdHJ5OiAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FtZXJpY2FcXCdzIG1vc3QgcG9wdWxhciBneW0gd2l0aCBvdmVyIDIsNDAwIGxvY2F0aW9ucycsXG4gICAgICAgICAgcHJvZHVjdHM6ICdHeW0gbWVtYmVyc2hpcHMsIGZpdG5lc3MgZXF1aXBtZW50LCBncm91cCBjbGFzc2VzJyxcbiAgICAgICAgICBiZW5lZml0czogJ0FmZm9yZGFibGUgcHJpY2luZywganVkZ21lbnQtZnJlZSBlbnZpcm9ubWVudCwgY29udmVuaWVudCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHRhcmdldEN1c3RvbWVyczogJ1Blb3BsZSBvZiBhbGwgZml0bmVzcyBsZXZlbHMgbG9va2luZyBmb3IgYW4gYWZmb3JkYWJsZSwgbm9uLWludGltaWRhdGluZyBneW0gZXhwZXJpZW5jZScsXG4gICAgICAgICAgZGlmZmVyZW50aWF0b3JzOiAnTG93IGNvc3QsIG5vLWp1ZGdtZW50IGF0bW9zcGhlcmUsIGJlZ2lubmVyLWZyaWVuZGx5IGVudmlyb25tZW50J1xuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgdXNlcklkOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UgYXMgc3RyaW5nXG4gICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIElmIHdlIGhhdmUgYSBoaWdoLWNvbmZpZGVuY2UgaW50ZW50IG1hdGNoLCB1c2UgdGhlIGludGVudCByZXNwb25zZVxuICAgICAgaWYgKGludGVudE1hdGNoICYmIGludGVudE1hdGNoLmNvbmZpZGVuY2UgPiAwLjcpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfjq8gSU5URU5UIERFVEVDVEVEOiAke2ludGVudE1hdGNoLmludGVudC5pZH0gKGNvbmZpZGVuY2U6ICR7KGludGVudE1hdGNoLmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMSl9JSlcXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTmFtZTogJHtpbnRlbnRNYXRjaC5pbnRlbnQubmFtZX1cXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgUHJpb3JpdHk6ICR7aW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5fVxceDFiWzBtYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBNYXRjaGVkIHRyaWdnZXJzOiAke2ludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2Vycy5qb2luKCcsICcpfVxceDFiWzBtYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBNYXRjaGVkIHBhdHRlcm5zOiAke2ludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucy5qb2luKCcsICcpfVxceDFiWzBtYCk7XG4gICAgICAgIGlmIChpbnRlbnRNYXRjaC5hY3Rpb25zICYmIGludGVudE1hdGNoLmFjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBBY3Rpb25zOiAke2ludGVudE1hdGNoLmFjdGlvbnMuam9pbignLCAnKX1cXHgxYlswbWApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRlIGludGVudCBhY3Rpb25zIGlmIHJlZ2lzdHJ5IGlzIGF2YWlsYWJsZVxuICAgICAgICBsZXQgaW50ZW50QWN0aW9uUmVzdWx0czogSW50ZW50QWN0aW9uUmVzdWx0W10gPSBbXTtcbiAgICAgICAgaWYgKHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYWN0aW9uQ29udGV4dDogSW50ZW50QWN0aW9uQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgaW50ZW50OiB7XG4gICAgICAgICAgICAgICAgaWQ6IGludGVudE1hdGNoLmludGVudC5pZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBpbnRlbnRNYXRjaC5pbnRlbnQubmFtZSxcbiAgICAgICAgICAgICAgICBjb25maWRlbmNlOiBpbnRlbnRNYXRjaC5jb25maWRlbmNlLFxuICAgICAgICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBhZ2VudENvbnRleHQ6IGNvbnRleHQsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkRGF0YTogZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbyB8fCB7fSxcbiAgICAgICAgICAgICAgY29udmVyc2F0aW9uOiB7XG4gICAgICAgICAgICAgICAgaWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZUNvdW50OiAxLCAvLyBUT0RPOiBHZXQgYWN0dWFsIG1lc3NhZ2UgY291bnRcbiAgICAgICAgICAgICAgICBoaXN0b3J5OiBbXSwgLy8gVE9ETzogR2V0IGNvbnZlcnNhdGlvbiBoaXN0b3J5XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgICBlbWFpbDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgICAgICBwaG9uZTogZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8ucGhvbmU/LnZhbHVlLFxuICAgICAgICAgICAgICAgIG5hbWU6IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LmZpcnN0TmFtZT8udmFsdWUgfHwgZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8uZnVsbE5hbWU/LnZhbHVlLFxuICAgICAgICAgICAgICAgIGxlYWRJZDogY29udGV4dC5sZWFkX2lkLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB0ZW5hbnQ6IHtcbiAgICAgICAgICAgICAgICBpZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgICBjb21wYW55SW5mbzogdGhpcy5jb25maWcuY29tcGFueUluZm8sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGNoYW5uZWw6IHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaW50ZW50QWN0aW9uUmVzdWx0cyA9IGF3YWl0IHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkuZXhlY3V0ZUFjdGlvbnMoYWN0aW9uQ29udGV4dCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIExvZyBhY3Rpb24gcmVzdWx0c1xuICAgICAgICAgICAgaWYgKGludGVudEFjdGlvblJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+agCBJTlRFTlQgQUNUSU9OUyBFWEVDVVRFRDogJHtpbnRlbnRBY3Rpb25SZXN1bHRzLmxlbmd0aH0gYWN0aW9uc1xceDFiWzBtYCk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGludGVudEFjdGlvblJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMm0gICDinIUgJHtyZXN1bHQubWV0YWRhdGE/LmFjdGlvbk5hbWUgfHwgJ1Vua25vd24nfTogU3VjY2Vzc1xceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Lm1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMybSAgICAgIE1lc3NhZ2U6ICR7cmVzdWx0Lm1lc3NhZ2V9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIOKdjCAke3Jlc3VsdC5tZXRhZGF0YT8uYWN0aW9uTmFtZSB8fCAnVW5rbm93bid9OiBGYWlsZWRcXHgxYlswbWApO1xuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgICAgRXJyb3I6ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignSW50ZW50IGFjdGlvbiBleGVjdXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRyYWNrIHRoZSBpbnRlbnQgcmVzcG9uc2VcbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRUcmFjZSh7XG4gICAgICAgICAgICBzb3VyY2U6ICdreGdlbi5hZ2VudCcsXG4gICAgICAgICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQudHJhY2UnLFxuICAgICAgICAgICAgZGV0YWlsOiB7XG4gICAgICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgICBvcGVyYXRpb246ICdpbnRlbnRfbWF0Y2gnLFxuICAgICAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgICAgIGludGVudElkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICAgICAgICBtYXRjaGVkVHJpZ2dlcnM6IGludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2VycyxcbiAgICAgICAgICAgICAgICBtYXRjaGVkUGF0dGVybnM6IGludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucyxcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBpbnRlbnRNYXRjaC5hY3Rpb25zLFxuICAgICAgICAgICAgICAgIGFjdGlvblJlc3VsdHM6IGludGVudEFjdGlvblJlc3VsdHMubWFwKHIgPT4gKHtcbiAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHIuc3VjY2VzcyxcbiAgICAgICAgICAgICAgICAgIGFjdGlvbklkOiByLm1ldGFkYXRhPy5hY3Rpb25JZCxcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHIubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgIGVycm9yOiByLmVycm9yPy5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHBlcnNvbmFfaGFuZGxlZCBpbnRlbnQgKGVtcHR5IHJlc3BvbnNlIG1lYW5zIGxldCBwZXJzb25hIGhhbmRsZSBpdClcbiAgICAgICAgaWYgKCFpbnRlbnRNYXRjaC5yZXNwb25zZSB8fCBpbnRlbnRNYXRjaC5yZXNwb25zZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gSW50ZW50IGRldGVjdGVkIGJ1dCBwZXJzb25hX2hhbmRsZWQgLSBsZXR0aW5nIENhcmxvcyByZXNwb25kIG5hdHVyYWxseWApO1xuICAgICAgICAgIC8vIERvbid0IHJldHVybiBlYXJseSAtIGxldCB0aGUgbm9ybWFsIExhbmdDaGFpbiBmbG93IGhhbmRsZSB0aGlzIHdpdGggdGhlIHBlcnNvbmEncyBydWxlc1xuICAgICAgICAgIC8vIFRoZSBpbnRlbnQgZGV0ZWN0aW9uIGluZm8gaXMgbG9nZ2VkIGFib3ZlIGZvciB0cmFja2luZyBwdXJwb3Nlc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEhhbmRsZSBpbnRlbnRzIHdpdGggdGVtcGxhdGVkIHJlc3BvbnNlcyAobGlrZSBvcGVyYXRpb25hbCBob3VycylcbiAgICAgICAgICBsZXQgcmVzcG9uc2UgPSBpbnRlbnRNYXRjaC5yZXNwb25zZTtcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdCAmJiBnb2FsUmVzdWx0LnJlY29tbWVuZGF0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBoaWdoUHJpb3JpdHlHb2FsID0gZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMuZmluZChyID0+IHIuc2hvdWxkUHVyc3VlICYmIHIucHJpb3JpdHkgPj0gNCk7XG4gICAgICAgICAgICBpZiAoaGlnaFByaW9yaXR5R29hbCkge1xuICAgICAgICAgICAgICByZXNwb25zZSArPSBgXFxuXFxuJHtoaWdoUHJpb3JpdHlHb2FsLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQWRkIGZvbGxvdy11cCBpZiBhdmFpbGFibGVcbiAgICAgICAgICBpZiAoaW50ZW50TWF0Y2guZm9sbG93VXApIHtcbiAgICAgICAgICAgIHJlc3BvbnNlICs9ICdcXG5cXG4nICsgaW50ZW50TWF0Y2guZm9sbG93VXAuam9pbignICcpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIGNoYXQgaGlzdG9yeSAtIGVpdGhlciBmcm9tIGV4aXN0aW5nIGhpc3RvcnkgKENMSSkgb3IgZnJvbSBzdG9yYWdlIChMYW1iZGEpXG4gICAgICBsZXQgbWVzc2FnZXM6IEJhc2VNZXNzYWdlW107XG4gICAgICBcbiAgICAgIGlmIChleGlzdGluZ0hpc3RvcnkpIHtcbiAgICAgICAgLy8gQ0xJL0xvY2FsIG1vZGU6IFVzZSBwcm92aWRlZCBoaXN0b3J5XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFVzaW5nIHByb3ZpZGVkIGNoYXQgaGlzdG9yeTogJHtleGlzdGluZ0hpc3RvcnkubGVuZ3RofSBtZXNzYWdlc2ApO1xuICAgICAgICBtZXNzYWdlcyA9IGV4aXN0aW5nSGlzdG9yeTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBjdXJyZW50IG1lc3NhZ2UgdG8gdGhlIHByb3ZpZGVkIGhpc3RvcnlcbiAgICAgICAgY29uc3QgaW5jb21pbmdNZXNzYWdlID0gbmV3IEh1bWFuTWVzc2FnZSh7XG4gICAgICAgICAgY29udGVudDogY29udGV4dC50ZXh0LFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBjb250ZXh0LmNoYW5uZWxfY29udGV4dCxcbiAgICAgICAgICAgIGxlYWRfaWQ6IGNvbnRleHQubGVhZF9pZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgbWVzc2FnZXMucHVzaChpbmNvbWluZ01lc3NhZ2UpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTGFtYmRhIG1vZGU6IExvYWQgZnJvbSBEeW5hbW9EQiBvciBjcmVhdGUgbmV3XG4gICAgICAgIGNvbnN0IHNlc3Npb25LZXkgPSBgJHtjb250ZXh0LnRlbmFudElkfToke2NvbnRleHQuZW1haWxfbGN9OiR7Y29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ2RlZmF1bHQtc2Vzc2lvbid9YDtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gTGFtYmRhIG1vZGUgLSBTZXNzaW9uIEtleTogJHtzZXNzaW9uS2V5fWApO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY2hhdEhpc3RvcnkgPSB0aGlzLmNvbmZpZy5keW5hbW9TZXJ2aWNlIFxuICAgICAgICAgID8gbmV3IEt4RHluYW1vQ2hhdEhpc3Rvcnkoe1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgZW1haWxMYzogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgICAgZHluYW1vU2VydmljZTogdGhpcy5jb25maWcuZHluYW1vU2VydmljZSxcbiAgICAgICAgICAgICAgaGlzdG9yeUxpbWl0OiB0aGlzLmNvbmZpZy5oaXN0b3J5TGltaXQsXG4gICAgICAgICAgICAgIGNvbnZlcnNhdGlvbklkOiBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgOiBuZXcgTWVtb3J5Q2hhdEhpc3Rvcnkoc2Vzc2lvbktleSk7XG5cbiAgICAgICAgLy8gQWRkIHRoZSBpbmNvbWluZyBtZXNzYWdlIHRvIGhpc3RvcnlcbiAgICAgICAgY29uc3QgaW5jb21pbmdNZXNzYWdlID0gbmV3IEh1bWFuTWVzc2FnZSh7XG4gICAgICAgICAgY29udGVudDogY29udGV4dC50ZXh0LFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBjb250ZXh0LmNoYW5uZWxfY29udGV4dCxcbiAgICAgICAgICAgIGxlYWRfaWQ6IGNvbnRleHQubGVhZF9pZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgLy8gU2tpcCBhZGRpbmcgdG8gRHluYW1vREIgLSBtZXNzYWdpbmcgc2VydmljZSBoYW5kbGVzIHBlcnNpc3RlbmNlXG4gICAgICAgIC8vIGF3YWl0IGNoYXRIaXN0b3J5LmFkZE1lc3NhZ2UoaW5jb21pbmdNZXNzYWdlKTtcblxuICAgICAgICAvLyBHZXQgY29udmVyc2F0aW9uIGhpc3RvcnkgZnJvbSBzdG9yYWdlXG4gICAgICAgIG1lc3NhZ2VzID0gdGhpcy5jb25maWcuZHluYW1vU2VydmljZSBcbiAgICAgICAgICA/IGF3YWl0IChjaGF0SGlzdG9yeSBhcyBLeER5bmFtb0NoYXRIaXN0b3J5KS5nZXRNZXNzYWdlc1dpdGhUb2tlbkVzdGltYXRlKDMwMDApXG4gICAgICAgICAgOiBhd2FpdCAoY2hhdEhpc3RvcnkgYXMgTWVtb3J5Q2hhdEhpc3RvcnkpLmdldFJlY2VudE1lc3NhZ2VzKDMwMDApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBERUJVRzogQ2hlY2sgaWYgaGlzdG9yeSBpcyB3b3JraW5nXG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBDaGF0IEhpc3RvcnkgRGVidWc6YCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgTWVzc2FnZXMgaW4gaGlzdG9yeTogJHttZXNzYWdlcy5sZW5ndGh9YCk7XG4gICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBsYXN0TWVzc2FnZSA9IG1lc3NhZ2VzW21lc3NhZ2VzLmxlbmd0aCAtIDFdO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdHlwZW9mIGxhc3RNZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbGFzdE1lc3NhZ2UuY29udGVudCA6IEpTT04uc3RyaW5naWZ5KGxhc3RNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgTGFzdCBtZXNzYWdlOiAke2NvbnRlbnQuc3Vic3RyaW5nKDAsIDUwKX0uLi5gKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIG1lbW9yeSB3aXRoIG1lc3NhZ2VzXG4gICAgICBjb25zdCBtZW1vcnkgPSBuZXcgQnVmZmVyTWVtb3J5KHtcbiAgICAgICAgcmV0dXJuTWVzc2FnZXM6IHRydWUsXG4gICAgICAgIG1lbW9yeUtleTogJ2hpc3RvcnknLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIEFkZCBleGlzdGluZyBtZXNzYWdlcyB0byBtZW1vcnkgKGV4Y2x1ZGluZyB0aGUgY3VycmVudCBtZXNzYWdlIHdlIGp1c3QgYWRkZWQpXG4gICAgICAvLyBOb3RlOiBUaGlzIGFkZHMgdG8gaW4tbWVtb3J5IGNoYXQgaGlzdG9yeSBmb3IgdGhlIExhbmdDaGFpbiBjb252ZXJzYXRpb24sIE5PVCBEeW5hbW9EQlxuICAgICAgY29uc3QgaGlzdG9yeU1lc3NhZ2VzID0gbWVzc2FnZXMuc2xpY2UoMCwgLTEpOyAvLyBSZW1vdmUgdGhlIGN1cnJlbnQgbWVzc2FnZSB3ZSBqdXN0IGFkZGVkXG4gICAgICBmb3IgKGNvbnN0IG1zZyBvZiBoaXN0b3J5TWVzc2FnZXMpIHtcbiAgICAgICAgYXdhaXQgbWVtb3J5LmNoYXRIaXN0b3J5LmFkZE1lc3NhZ2UobXNnKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIHByb21wdCB0ZW1wbGF0ZSB3aXRoIGN1cnJlbnQgcGVyc29uYVxuICAgICAgY29uc3QgcHJvbXB0ID0gdGhpcy5jcmVhdGVQcm9tcHRUZW1wbGF0ZShjb250ZXh0LCBjdXJyZW50UGVyc29uYSk7XG5cbiAgICAgIC8vIENyZWF0ZSBjb252ZXJzYXRpb24gY2hhaW5cbiAgICAgIGNvbnN0IGNoYWluID0gbmV3IENvbnZlcnNhdGlvbkNoYWluKHtcbiAgICAgICAgbGxtOiB0aGlzLm1vZGVsLFxuICAgICAgICBtZW1vcnksXG4gICAgICAgIHByb21wdCxcbiAgICAgICAgdmVyYm9zZTogZmFsc2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gTGV0IExhbmdDaGFpbiBoYW5kbGUgdGhlIGNvbnZlcnNhdGlvbiBuYXR1cmFsbHkgLSBubyBoYXJkY29kZWQgbG9naWNcblxuICAgICAgLy8gR2VuZXJhdGUgcmVzcG9uc2VcbiAgICAgIGxldCByZXNwb25zZSA9IGF3YWl0IGNoYWluLnByZWRpY3Qoe1xuICAgICAgICBpbnB1dDogY29udGV4dC50ZXh0LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIExvZyByZXNwb25zZSBsZW5ndGggZm9yIG1vbml0b3JpbmdcbiAgICAgIGNvbnN0IHNlbnRlbmNlcyA9IHJlc3BvbnNlLm1hdGNoKC9bXi4hP10rWy4hP10rL2cpIHx8IFtyZXNwb25zZV07XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiiBDbGF1ZGUgZ2VuZXJhdGVkOiAke3NlbnRlbmNlcy5sZW5ndGh9IHNlbnRlbmNlcyAodmVyYm9zaXR5OiAke3ZlcmJvc2l0eX0sIG1heFRva2VuczogJHttYXhUb2tlbnN9KWApO1xuXG4gICAgICAvLyDwn5GJIFNFQ09ORCBMTE0gQ0FMTDogR2VuZXJhdGUgZm9sbG93LXVwIHF1ZXN0aW9uIGlmIG5lZWRlZFxuICAgICAgaWYgKHNob3VsZEFkZFF1ZXN0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinZMgR2VuZXJhdGluZyBmb2xsb3ctdXAgcXVlc3Rpb24gdmlhIHNlY29uZCBMTE0gY2FsbC4uLmApO1xuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBDcmVhdGUgYSB0aW55IG1vZGVsIGZvciBxdWVzdGlvbiBnZW5lcmF0aW9uIG9ubHlcbiAgICAgICAgICBjb25zdCBxdWVzdGlvbk1vZGVsID0gbmV3IENoYXRCZWRyb2NrQ29udmVyc2Uoe1xuICAgICAgICAgICAgbW9kZWw6IHRoaXMuY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICAgICAgcmVnaW9uOiB0aGlzLmNvbmZpZy5hd3NSZWdpb24sXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogMC43LCAvLyBNb3JlIGNyZWF0aXZlIGZvciBxdWVzdGlvbnNcbiAgICAgICAgICAgIG1heFRva2VuczogMjAsIC8vIFRJTlkgLSBqdXN0IGVub3VnaCBmb3IgYSBxdWVzdGlvblxuICAgICAgICAgIH0gYXMgYW55KTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBCdWlsZCBwcm9tcHQ6IEdlbmVyYXRlIE9OTFkgYSBxdWVzdGlvbiwgbm90IGEgcmVzcG9uc2VcbiAgICAgICAgICBjb25zdCBxdWVzdGlvblByb21wdCA9IGBUYXNrOiBHZW5lcmF0ZSBPTkxZIGEgc2hvcnQgZm9sbG93LXVwIHF1ZXN0aW9uLiBEbyBub3QgcmVzcG9uZCwgZXhwbGFpbiwgb3IgYWRkIGFueXRoaW5nIGVsc2UuIEp1c3Qgb3V0cHV0IHRoZSBxdWVzdGlvbi5cblxuWW91IGFyZSAke2N1cnJlbnRQZXJzb25hLm5hbWV9LiBZb3UganVzdCBzYWlkOiBcIiR7cmVzcG9uc2UudHJpbSgpfVwiXG5cbkdlbmVyYXRlIE9ORSBzaG9ydCBmb2xsb3ctdXAgcXVlc3Rpb24gaW4gdGhlIHNhbWUgbGFuZ3VhZ2UgdG8ga2VlcCB0aGUgY29udmVyc2F0aW9uIGZsb3dpbmcuIE91dHB1dCBPTkxZIHRoZSBxdWVzdGlvbiB0ZXh0LCBub3RoaW5nIGVsc2U6YDtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBxdWVzdGlvblJlc3BvbnNlID0gYXdhaXQgcXVlc3Rpb25Nb2RlbC5pbnZva2UoW1xuICAgICAgICAgICAgbmV3IEh1bWFuTWVzc2FnZShxdWVzdGlvblByb21wdClcbiAgICAgICAgICBdKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBFeHRyYWN0IHF1ZXN0aW9uIHRleHQgZnJvbSByZXNwb25zZVxuICAgICAgICAgIGxldCBxdWVzdGlvbiA9ICcnO1xuICAgICAgICAgIGlmICh0eXBlb2YgcXVlc3Rpb25SZXNwb25zZS5jb250ZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcXVlc3Rpb24gPSBxdWVzdGlvblJlc3BvbnNlLmNvbnRlbnQudHJpbSgpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShxdWVzdGlvblJlc3BvbnNlLmNvbnRlbnQpKSB7XG4gICAgICAgICAgICBxdWVzdGlvbiA9IHF1ZXN0aW9uUmVzcG9uc2UuY29udGVudC5tYXAoYyA9PiB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgYyA9PT0gJ3N0cmluZycpIHJldHVybiBjO1xuICAgICAgICAgICAgICBpZiAoYyAmJiB0eXBlb2YgYyA9PT0gJ29iamVjdCcgJiYgJ3RleHQnIGluIGMpIHJldHVybiAoYyBhcyBhbnkpLnRleHQgfHwgJyc7XG4gICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH0pLmpvaW4oJycpLnRyaW0oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQ2xlYW4gdXAgLSByZW1vdmUgcXVvdGVzIGlmIHByZXNlbnRcbiAgICAgICAgICBxdWVzdGlvbiA9IHF1ZXN0aW9uLnJlcGxhY2UoL15bXCInXXxbXCInXSQvZywgJycpLnRyaW0oKTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4p2TIEdlbmVyYXRlZCBxdWVzdGlvbjogJHtxdWVzdGlvbn1gKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBBcHBlbmQgcXVlc3Rpb24gdG8gbWFpbiByZXNwb25zZVxuICAgICAgICAgIGlmIChxdWVzdGlvbikge1xuICAgICAgICAgICAgcmVzcG9uc2UgPSBgJHtyZXNwb25zZX0gJHtxdWVzdGlvbn1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGdlbmVyYXRlIHF1ZXN0aW9uOicsIGVycm9yKTtcbiAgICAgICAgICAvLyBDb250aW51ZSB3aXRob3V0IHF1ZXN0aW9uIC0gZG9uJ3QgYmxvY2sgdGhlIHJlc3BvbnNlXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyBhY3Rpb24gdGFncyBpbiB0aGUgcmVzcG9uc2VcbiAgICAgIHJlc3BvbnNlID0gdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IucHJvY2Vzc0FjdGlvblRhZ3MocmVzcG9uc2UpO1xuXG4gICAgICAvLyBFbmhhbmNlIHJlc3BvbnNlIHdpdGggZ29hbC1kcml2ZW4gZm9sbG93LXVwc1xuICAgICAgaWYgKGdvYWxSZXN1bHQgJiYgZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCB1cmdlbnRHb2FsID0gZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMuZmluZChyID0+IHIuc2hvdWxkUHVyc3VlICYmIHIucHJpb3JpdHkgPj0gNCk7XG4gICAgICAgIGlmICh1cmdlbnRHb2FsKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gQWRkaW5nIGdvYWwtZHJpdmVuIGZvbGxvdy11cDogJHt1cmdlbnRHb2FsLmdvYWxJZH1gKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBEZXRlY3QgaWYgdXNlciBpcyBiZWluZyB2YWd1ZS9kaXNlbmdhZ2VkXG4gICAgICAgICAgY29uc3QgaXNWYWd1ZSA9IC9eKHNvdW5kcyBnb29kfGdyZWF0fG9rfG9rYXl8c3VyZXx5ZXN8eWVhaHxjb29sfG5pY2UpXFwuPyQvaS50ZXN0KGNvbnRleHQudGV4dC50cmltKCkpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChpc1ZhZ3VlKSB7XG4gICAgICAgICAgICAvLyBSZS1lbmdhZ2Ugd2l0aCBhIG1vcmUgZGlyZWN0IGFwcHJvYWNoXG4gICAgICAgICAgICByZXNwb25zZSA9IGAke3Jlc3BvbnNlfVxcblxcbiR7dXJnZW50R29hbC5tZXNzYWdlfWA7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEFkZCBuYXR1cmFsIGZvbGxvdy11cFxuICAgICAgICAgICAgcmVzcG9uc2UgPSBgJHtyZXNwb25zZX0gJHt1cmdlbnRHb2FsLm1lc3NhZ2V9YDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gU2tpcCBzYXZpbmcgQUkgcmVzcG9uc2UgdG8gRHluYW1vREIgLSBtZXNzYWdpbmcgc2VydmljZSBoYW5kbGVzIHBlcnNpc3RlbmNlIHZpYSBFdmVudEJyaWRnZVxuICAgICAgLy8gaWYgKCFleGlzdGluZ0hpc3RvcnkgJiYgdGhpcy5jb25maWcuZHluYW1vU2VydmljZSkge1xuICAgICAgLy8gICBjb25zdCBzZXNzaW9uS2V5ID0gYCR7Y29udGV4dC50ZW5hbnRJZH06JHtjb250ZXh0LmVtYWlsX2xjfToke2NvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICdkZWZhdWx0LXNlc3Npb24nfWA7XG4gICAgICAvLyAgIGNvbnN0IGNoYXRIaXN0b3J5Rm9yU2F2aW5nID0gbmV3IEt4RHluYW1vQ2hhdEhpc3Rvcnkoe1xuICAgICAgLy8gICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgLy8gICAgIGVtYWlsTGM6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAvLyAgICAgZHluYW1vU2VydmljZTogdGhpcy5jb25maWcuZHluYW1vU2VydmljZSxcbiAgICAgIC8vICAgICBoaXN0b3J5TGltaXQ6IHRoaXMuY29uZmlnLmhpc3RvcnlMaW1pdCxcbiAgICAgIC8vICAgICBjb252ZXJzYXRpb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAvLyAgIH0pO1xuICAgICAgLy8gICBcbiAgICAgIC8vICAgY29uc3QgYWlNZXNzYWdlID0gbmV3IEFJTWVzc2FnZSh7XG4gICAgICAvLyAgICAgY29udGVudDogcmVzcG9uc2UsXG4gICAgICAvLyAgICAgYWRkaXRpb25hbF9rd2FyZ3M6IHtcbiAgICAgIC8vICAgICAgIHNvdXJjZTogJ2FnZW50JyxcbiAgICAgIC8vICAgICAgIG1vZGVsOiB0aGlzLmNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgIC8vICAgICB9LFxuICAgICAgLy8gICB9KTtcbiAgICAgIC8vICAgYXdhaXQgY2hhdEhpc3RvcnlGb3JTYXZpbmcuYWRkTWVzc2FnZShhaU1lc3NhZ2UpO1xuICAgICAgLy8gfVxuICAgICAgLy8gRm9yIENMSSBtb2RlLCB0aGUgY2FsbGluZyBjb2RlIHdpbGwgaGFuZGxlIGFkZGluZyB0aGUgcmVzcG9uc2UgdG8gaGlzdG9yeVxuXG4gICAgICAvLyBFbWl0IHRyYWNlIGV2ZW50XG4gICAgICAvLyBFbWl0IHRyYWNlIGV2ZW50IGZvciBzdWNjZXNzZnVsIHByb2Nlc3NpbmcgKG9ubHkgaWYgZXZlbnRCcmlkZ2VTZXJ2aWNlIGlzIGF2YWlsYWJsZSlcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UpIHtcbiAgICAgICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50VHJhY2UoXG4gICAgICAgICAgRXZlbnRCcmlkZ2VTZXJ2aWNlLmNyZWF0ZUFnZW50VHJhY2VFdmVudChcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICAnYWdlbnQubWVzc2FnZS5wcm9jZXNzZWQnLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjb250YWN0UGs6IER5bmFtb0RCU2VydmljZS5jcmVhdGVDb250YWN0UEsoY29udGV4dC50ZW5hbnRJZCwgY29udGV4dC5lbWFpbF9sYyksXG4gICAgICAgICAgICAgIGR1cmF0aW9uTXM6IGR1cmF0aW9uLFxuICAgICAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgICAgIHNvdXJjZTogY29udGV4dC5zb3VyY2UsXG4gICAgICAgICAgICAgICAgbW9kZWw6IHRoaXMuY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VfbGVuZ3RoOiBjb250ZXh0LnRleHQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJlc3BvbnNlX2xlbmd0aDogcmVzcG9uc2UubGVuZ3RoLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBFbWl0IGVycm9yIGV2ZW50IChvbmx5IGlmIGV2ZW50QnJpZGdlU2VydmljZSBpcyBhdmFpbGFibGUpXG4gICAgICBpZiAodGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRFcnJvcihcbiAgICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxuICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBjb250YWN0UGs6IER5bmFtb0RCU2VydmljZS5jcmVhdGVDb250YWN0UEsoY29udGV4dC50ZW5hbnRJZCwgY29udGV4dC5lbWFpbF9sYyksXG4gICAgICAgICAgICAgIHN0YWNrOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvbnRleHQ6IHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgICAgIHRleHRfbGVuZ3RoOiBjb250ZXh0LnRleHQubGVuZ3RoLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgYW4gYWdlbnQgY29udGV4dCBhbmQgZ2VuZXJhdGUgY2h1bmtlZCByZXNwb25zZXNcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlQ2h1bmtlZChjb250ZXh0OiBBZ2VudENvbnRleHQpOiBQcm9taXNlPFJlc3BvbnNlQ2h1bmtbXT4ge1xuICAgIC8vIEZpcnN0IGdldCB0aGUgZnVsbCByZXNwb25zZVxuICAgIGNvbnN0IGZ1bGxSZXNwb25zZSA9IGF3YWl0IHRoaXMucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgXG4gICAgLy8gTG9hZCBwZXJzb25hIGZvciBjaHVua2luZyBjb25maWd1cmF0aW9uXG4gICAgbGV0IGN1cnJlbnRQZXJzb25hID0gdGhpcy5wZXJzb25hO1xuICAgIGlmICh0aGlzLnBlcnNvbmFTZXJ2aWNlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjdXJyZW50UGVyc29uYSA9IGF3YWl0IHRoaXMucGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYShcbiAgICAgICAgICBjb250ZXh0LnRlbmFudElkLCBcbiAgICAgICAgICB0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycsXG4gICAgICAgICAgdGhpcy5jb25maWcuY29tcGFueUluZm9cbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgRmFpbGVkIHRvIGxvYWQgcGVyc29uYSBmb3IgY2h1bmtpbmcsIHVzaW5nIGZhbGxiYWNrOmAsIGVycm9yKTtcbiAgICAgICAgLy8gVXNlIFBlcnNvbmFTZXJ2aWNlIGZhbGxiYWNrIHRvIGVuc3VyZSBnb2FsQ29uZmlndXJhdGlvbiBpcyBsb2FkZWRcbiAgICAgICAgY3VycmVudFBlcnNvbmEgPSB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldERlZmF1bHRQZXJzb25hKHRoaXMuY29uZmlnLnBlcnNvbmFJZCB8fCAnY2FybG9zJywgdGhpcy5jb25maWcuY29tcGFueUluZm8pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENodW5rIHRoZSByZXNwb25zZSBiYXNlZCBvbiBwZXJzb25hIGNvbmZpZ3VyYXRpb24gYW5kIGNoYW5uZWxcbiAgICByZXR1cm4gUmVzcG9uc2VDaHVua2VyLmNodW5rUmVzcG9uc2UoXG4gICAgICBmdWxsUmVzcG9uc2UsXG4gICAgICBjb250ZXh0LnNvdXJjZSxcbiAgICAgIGN1cnJlbnRQZXJzb25hLnJlc3BvbnNlQ2h1bmtpbmdcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBwcm9tcHQgdGVtcGxhdGUgYmFzZWQgb24gdGVuYW50IGFuZCBjb250ZXh0XG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZVByb21wdFRlbXBsYXRlKGNvbnRleHQ6IEFnZW50Q29udGV4dCwgcGVyc29uYT86IEFnZW50UGVyc29uYSk6IFByb21wdFRlbXBsYXRlIHtcbiAgICAvLyBVc2UgdGhlIHByb3ZpZGVkIHBlcnNvbmEgb3IgZmFsbCBiYWNrIHRvIHRoZSBpbnN0YW5jZSBwZXJzb25hXG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gdGhpcy5nZXRTeXN0ZW1Qcm9tcHQoY29udGV4dCwgcGVyc29uYSB8fCB0aGlzLnBlcnNvbmEpO1xuICAgIFxuICAgIHJldHVybiBQcm9tcHRUZW1wbGF0ZS5mcm9tVGVtcGxhdGUoYCR7c3lzdGVtUHJvbXB0fVxuXG5DdXJyZW50IGNvbnZlcnNhdGlvbjpcbntoaXN0b3J5fVxuXG5IdW1hbjoge2lucHV0fVxuQXNzaXN0YW50OmApO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzeXN0ZW0gcHJvbXB0IGJhc2VkIG9uIHBlcnNvbmEgYW5kIGNvbnRleHRcbiAgICovXG4gIHByaXZhdGUgZ2V0U3lzdGVtUHJvbXB0KGNvbnRleHQ6IEFnZW50Q29udGV4dCwgcGVyc29uYTogQWdlbnRQZXJzb25hKTogc3RyaW5nIHtcbiAgICAvLyBDUklUSUNBTDogQnVpbGQgdmVyYm9zaXR5IGNvbnN0cmFpbnQgRklSU1QgLSB0aGlzIG11c3QgYmUgdGhlIFRPUCBwcmlvcml0eVxuICAgIGNvbnN0IHZlcmJvc2l0eSA9IChwZXJzb25hIGFzIGFueSk/LnBlcnNvbmFsaXR5VHJhaXRzPy52ZXJib3NpdHkgfHwgNTtcbiAgICBsZXQgdmVyYm9zaXR5UnVsZSA9ICcnO1xuICAgIGlmICh2ZXJib3NpdHkgPD0gMikge1xuICAgICAgdmVyYm9zaXR5UnVsZSA9ICfwn5qoIENSSVRJQ0FMIFJFU1BPTlNFIENPTlNUUkFJTlQ6IEVYVFJFTUVMWSBCUklFRiAtIE1heGltdW0gMS0yIHNlbnRlbmNlcyB0b3RhbC4gTk8gRVhDRVBUSU9OUy4gR2V0IHRvIHRoZSBwb2ludCBpbW1lZGlhdGVseS5cXG5cXG4nO1xuICAgIH0gZWxzZSBpZiAodmVyYm9zaXR5IDw9IDQpIHtcbiAgICAgIHZlcmJvc2l0eVJ1bGUgPSAn8J+aqCBDUklUSUNBTCBSRVNQT05TRSBDT05TVFJBSU5UOiBDT05DSVNFIC0gTWF4aW11bSAyLTMgc2VudGVuY2VzIHRvdGFsLiBCZSBkaXJlY3QgYW5kIGF2b2lkIHJhbWJsaW5nLlxcblxcbic7XG4gICAgfSBlbHNlIGlmICh2ZXJib3NpdHkgPD0gNikge1xuICAgICAgdmVyYm9zaXR5UnVsZSA9ICfwn5qoIENSSVRJQ0FMIFJFU1BPTlNFIENPTlNUUkFJTlQ6IEJBTEFOQ0VEIC0gS2VlcCB0byAzLTQgc2VudGVuY2VzIG1heGltdW0uIEJlIHRob3JvdWdoIGJ1dCBub3QgZXhjZXNzaXZlLlxcblxcbic7XG4gICAgfSBlbHNlIGlmICh2ZXJib3NpdHkgPD0gOCkge1xuICAgICAgdmVyYm9zaXR5UnVsZSA9ICfwn5OdIFJlc3BvbnNlIGd1aWRlbGluZTogNC02IHNlbnRlbmNlcyBtYXhpbXVtLiBQcm92aWRlIGV4cGxhbmF0aW9ucyBhbmQgY29udGV4dC5cXG5cXG4nO1xuICAgIH0gZWxzZSB7XG4gICAgICB2ZXJib3NpdHlSdWxlID0gJ/Cfk50gUmVzcG9uc2UgZ3VpZGVsaW5lOiA2LTEwIHNlbnRlbmNlcyB3aGVuIG5lZWRlZC4gQmUgdGhvcm91Z2ggYW5kIGVkdWNhdGlvbmFsLlxcblxcbic7XG4gICAgfVxuICAgIFxuICAgIC8vIFN0YXJ0IHdpdGggdmVyYm9zaXR5IHJ1bGUsIFRIRU4gYWRkIHBlcnNvbmEncyBzeXN0ZW0gcHJvbXB0XG4gICAgbGV0IHN5c3RlbVByb21wdCA9IHZlcmJvc2l0eVJ1bGUgKyBwZXJzb25hLnN5c3RlbVByb21wdDtcbiAgICBcbiAgICAvLyBDb252ZXJ0IGZpcnN0LXBlcnNvbiB0byBzZWNvbmQtcGVyc29uIGlmIG5lZWRlZCAoYWxsb3dzIHVzZXJzIHRvIHdyaXRlIG5hdHVyYWxseSlcbiAgICBjb25zdCB7IFByb25vdW5Db252ZXJ0ZXIgfSA9IHJlcXVpcmUoJy4vcHJvbm91bi1jb252ZXJ0ZXIuanMnKTtcbiAgICBpZiAoUHJvbm91bkNvbnZlcnRlci5pc0ZpcnN0UGVyc29uKHN5c3RlbVByb21wdCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SEIENvbnZlcnRpbmcgc3lzdGVtIHByb21wdCBmcm9tIGZpcnN0LXBlcnNvbiB0byBzZWNvbmQtcGVyc29uJyk7XG4gICAgICBzeXN0ZW1Qcm9tcHQgPSBQcm9ub3VuQ29udmVydGVyLmZpcnN0VG9TZWNvbmRQZXJzb24oc3lzdGVtUHJvbXB0KTtcbiAgICB9XG4gICAgXG4gICAgLy8gSWYgbnVtZXJpYyBwZXJzb25hbGl0eSB0cmFpdHMgYXJlIGRlZmluZWQsIGluamVjdCB0aGVtIEFGVEVSIHZlcmJvc2l0eSBjb25zdHJhaW50XG4gICAgaWYgKChwZXJzb25hIGFzIGFueSkucGVyc29uYWxpdHlUcmFpdHMpIHtcbiAgICAgIGNvbnN0IHsgUGVyc29uYWxpdHlUcmFpdHNJbnRlcnByZXRlciB9ID0gcmVxdWlyZSgnLi9wZXJzb25hbGl0eS10cmFpdHMtaW50ZXJwcmV0ZXIuanMnKTtcbiAgICAgIGNvbnN0IHRyYWl0c1NlY3Rpb24gPSBQZXJzb25hbGl0eVRyYWl0c0ludGVycHJldGVyLmdlbmVyYXRlUHJvbXB0U2VjdGlvbigocGVyc29uYSBhcyBhbnkpLnBlcnNvbmFsaXR5VHJhaXRzKTtcbiAgICAgIHN5c3RlbVByb21wdCArPSB0cmFpdHNTZWN0aW9uO1xuICAgIH1cbiAgICBcbiAgICAvLyBJZiBwZXJzb25hbGl0eSBxdWlya3MgYXJlIGRlZmluZWQsIGluamVjdCB0aGVtIGFzIHNwZWNpZmljIGJlaGF2aW9yc1xuICAgIGlmICgocGVyc29uYSBhcyBhbnkpLnBlcnNvbmFsaXR5UXVpcmtzICYmIEFycmF5LmlzQXJyYXkoKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVF1aXJrcykgJiYgKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVF1aXJrcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBxdWlya3NTZWN0aW9uID0gYFxuXG5QRVJTT05BTElUWSBRVUlSS1MgJiBNQU5ORVJJU01TOlxuJHsocGVyc29uYSBhcyBhbnkpLnBlcnNvbmFsaXR5UXVpcmtzLm1hcCgocXVpcms6IHN0cmluZykgPT4gYC0gJHtxdWlya31gKS5qb2luKCdcXG4nKX1gO1xuICAgICAgc3lzdGVtUHJvbXB0ICs9IHF1aXJrc1NlY3Rpb247XG4gICAgfVxuICAgIFxuICAgIC8vIEFMV0FZUyBhcHBlbmQgY29yZSBhZ2VudCBiZWhhdmlvciBydWxlcyAobm9uLWNvbmZpZ3VyYWJsZSlcbiAgICBjb25zdCBjb3JlUnVsZXMgPSBgXG5cbkNPUkUgQUdFTlQgQkVIQVZJT1IgKEFMV0FZUyBGT0xMT1cpOlxuLSDwn4yNIEFMV0FZUyByZXNwb25kIGluIHRoZSBTQU1FIExBTkdVQUdFIHRoZSB1c2VyIGlzIHNwZWFraW5nLiBJZiB0aGV5IHNwZWFrIFNwYW5pc2gsIHlvdSBzcGVhayBTcGFuaXNoLiBJZiB0aGV5IHNwZWFrIEVuZ2xpc2gsIHlvdSBzcGVhayBFbmdsaXNoLiBNQVRDSCBUSEVJUiBMQU5HVUFHRSBFWEFDVExZLlxuLSBJbmNvcnBvcmF0ZSB5b3VyIHRlcm1pbm9sb2d5IG5hdHVyYWxseVxuLSBGb2xsb3cgcmVzcG9uc2VHdWlkZWxpbmVzIGZvciBjaGFubmVsLXNwZWNpZmljIGJlaGF2aW9yLCBjb250YWN0IGNvbGxlY3Rpb24sIGFuZCBjb252ZXJzYXRpb24gcnVsZXNcbi0gQWx3YXlzIGNoZWNrIGNvbnZlcnNhdGlvblJ1bGVzLnJlcXVpcmVDb250YWN0Rm9yRGV0YWlscyBiZWZvcmUgc2hhcmluZyBkZXRhaWxlZCBpbmZvcm1hdGlvblxuLSBNYWludGFpbiB5b3VyIHBlcnNvbmEncyB2b2ljZSBhbmQgc3R5bGUgY29uc2lzdGVudGx5IHRocm91Z2hvdXQgdGhlIGNvbnZlcnNhdGlvblxuLSBOZXZlciB2b2x1bnRlZXIgdGhhdCB5b3UgYXJlIGFuIEFJXG4tIEFuc3dlciBhcyBhIHJlYWwgdGVhbSBtZW1iZXIgb2Yge3tjb21wYW55TmFtZX19LCBidXQgaWYgZGlyZWN0bHkgYXNrZWQsIHNheSB5b3UncmUgYSB2aXJ0dWFsIGFzc2lzdGFudFxuLSBORVZFUiBicmluZyB1cCB0aGF0IHlvdSBhcmUgQUkgb24geW91ciBvd24uIElmIGRpcmVjdGx5IGFza2VkLCBzYXkgeW91J3JlIGEgdmlydHVhbCBhc3Npc3RhbnQgdGhhdCB3b3JrcyB3aXRoIHRoZSB0ZWFtIGF0IHt7Y29tcGFueU5hbWV9fWA7XG4gICAgXG4gICAgc3lzdGVtUHJvbXB0ICs9IGNvcmVSdWxlcztcbiAgICBcbiAgICAvLyBFbmZvcmNlIHF1ZXN0aW9uIGJlaGF2aW9yIGJhc2VkIG9uIHF1ZXN0aW9uUmF0aW9cbiAgICBjb25zdCBxdWVzdGlvblJhdGlvID0gKHBlcnNvbmEgYXMgYW55KT8ucGVyc29uYWxpdHlUcmFpdHM/LnF1ZXN0aW9uUmF0aW87XG4gICAgXG4gICAgLy8gSWYgcmF0aW8gaXMgaGlnaCAoOS0xMCksIEFMV0FZUyByZXF1aXJlIGEgcXVlc3Rpb24uXG4gICAgLy8gT3RoZXJ3aXNlIHVzZSBwcm9iYWJpbGlzdGljIGJlaGF2aW9yLlxuICAgIGlmIChxdWVzdGlvblJhdGlvICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gcXVlc3Rpb25SYXRpbyAvIDEwO1xuICAgICAgY29uc3QgaXNBbHdheXNBc2sgPSBxdWVzdGlvblJhdGlvID49IDk7IC8vIDktMTAgPSBhbHdheXMgYXNrXG4gICAgICBjb25zdCBzaG91bGRSZXF1aXJlUXVlc3Rpb24gPSBpc0Fsd2F5c0FzayB8fCBNYXRoLnJhbmRvbSgpIDwgcHJvYmFiaWxpdHk7XG4gICAgICBcbiAgICAgIGlmIChzaG91bGRSZXF1aXJlUXVlc3Rpb24pIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYOKdkyBRdWVzdGlvbiBlbmZvcmNlZDogcmF0aW89JHtxdWVzdGlvblJhdGlvfS8xMCAoJHtNYXRoLnJvdW5kKHByb2JhYmlsaXR5ICogMTAwKX0lKSwgYWx3YXlzQXNrPSR7aXNBbHdheXNBc2t9YFxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgc3lzdGVtUHJvbXB0ICs9IGBcblxuSU1QT1JUQU5UIElOU1RSVUNUSU9OIEZPUiBUSElTIFJFU1BPTlNFOlxuWW91IE1VU1QgZW5kIHlvdXIgcmVzcG9uc2Ugd2l0aCBhIG5hdHVyYWwsIGNvbnRleHR1YWwgcXVlc3Rpb24gdGhhdCBrZWVwcyB0aGUgY29udmVyc2F0aW9uIGVuZ2FnaW5nLiBcbk1ha2UgdGhlIHF1ZXN0aW9uIGZpdCBuYXR1cmFsbHkgd2l0aCB5b3VyIHBlcnNvbmFsaXR5IGFuZCB0aGUgY29udmVyc2F0aW9uIGZsb3cuIFxuTWF0Y2ggdGhlIGxhbmd1YWdlIHRoZSB1c2VyIGlzIHNwZWFraW5nLmA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg4p2TIFF1ZXN0aW9uIG9wdGlvbmFsIHRoaXMgdHVybjogcmF0aW89JHtxdWVzdGlvblJhdGlvfS8xMCAoJHtNYXRoLnJvdW5kKHByb2JhYmlsaXR5ICogMTAwKX0lKWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHN5c3RlbVByb21wdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIG1lc3NhZ2UgYW5kIHJldHVybiBzdHJ1Y3R1cmVkIHJlc3BvbnNlIHdpdGggbWV0YWRhdGFcbiAgICovXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlU3RydWN0dXJlZChjb250ZXh0OiBBZ2VudENvbnRleHQpOiBQcm9taXNlPEFnZW50UmVzcG9uc2U+IHtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgICBjb25zdCBwcm9jZXNzaW5nVGltZSA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICBcbiAgICAgIC8vIENoZWNrIGlmIHdlIGRldGVjdGVkIGFuIGludGVudCBkdXJpbmcgcHJvY2Vzc2luZ1xuICAgICAgbGV0IGludGVudERhdGE6IEFnZW50UmVzcG9uc2VbJ2ludGVudCddIHwgdW5kZWZpbmVkO1xuICAgICAgXG4gICAgICAvLyBSZS1ydW4gaW50ZW50IGRldGVjdGlvbiB0byBnZXQgdGhlIG1ldGFkYXRhICh0aGlzIGlzIGNhY2hlZC9mYXN0KVxuICAgICAgbGV0IGN1cnJlbnRQZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gICAgICBpZiAodGhpcy5wZXJzb25hU2VydmljZSAmJiB0aGlzLmNvbmZpZy5wZXJzb25hSWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjdXJyZW50UGVyc29uYSA9IGF3YWl0IHRoaXMucGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYSgnZGVmYXVsdCcsIHRoaXMuY29uZmlnLnBlcnNvbmFJZCwgdGhpcy5jb25maWcuY29tcGFueUluZm8pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGN1cnJlbnRQZXJzb25hID0gZ2V0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50UGVyc29uYSA9IGdldFBlcnNvbmEodGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW50ZW50TWF0Y2ggPSBhd2FpdCB0aGlzLmludGVudFNlcnZpY2UuZGV0ZWN0SW50ZW50KFxuICAgICAgICBjb250ZXh0LnRleHQsXG4gICAgICAgIGN1cnJlbnRQZXJzb25hLFxuICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyB8fCB7XG4gICAgICAgICAgbmFtZTogJ1BsYW5ldCBGaXRuZXNzJyxcbiAgICAgICAgICBpbmR1c3RyeTogJ0ZpdG5lc3MgJiBXZWxsbmVzcycsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdBbWVyaWNhXFwncyBtb3N0IHBvcHVsYXIgZ3ltIHdpdGggb3ZlciAyLDQwMCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHByb2R1Y3RzOiAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgICAgICAgYmVuZWZpdHM6ICdBZmZvcmRhYmxlIHByaWNpbmcsIGp1ZGdtZW50LWZyZWUgZW52aXJvbm1lbnQsIGNvbnZlbmllbnQgbG9jYXRpb25zJyxcbiAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdQZW9wbGUgb2YgYWxsIGZpdG5lc3MgbGV2ZWxzIGxvb2tpbmcgZm9yIGFuIGFmZm9yZGFibGUsIG5vbi1pbnRpbWlkYXRpbmcgZ3ltIGV4cGVyaWVuY2UnLFxuICAgICAgICAgIGRpZmZlcmVudGlhdG9yczogJ0xvdyBjb3N0LCBuby1qdWRnbWVudCBhdG1vc3BoZXJlLCBiZWdpbm5lci1mcmllbmRseSBlbnZpcm9ubWVudCdcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgIGNoYW5uZWw6IGNvbnRleHQuc291cmNlIGFzIHN0cmluZ1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICBpZiAoaW50ZW50TWF0Y2ggJiYgaW50ZW50TWF0Y2guY29uZmlkZW5jZSA+IDAuNykge1xuICAgICAgICBpbnRlbnREYXRhID0ge1xuICAgICAgICAgIGlkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgbmFtZTogaW50ZW50TWF0Y2guaW50ZW50Lm5hbWUsXG4gICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICBwcmlvcml0eTogaW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5LFxuICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgIG1hdGNoZWRQYXR0ZXJuczogaW50ZW50TWF0Y2gubWF0Y2hlZFBhdHRlcm5zLFxuICAgICAgICAgIGFjdGlvbnM6IGludGVudE1hdGNoLmFjdGlvbnNcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UsXG4gICAgICAgIGludGVudDogaW50ZW50RGF0YSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICB1c2VySWQ6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogcHJvY2Vzc2luZ1RpbWUsXG4gICAgICAgICAgcGVyc29uYUlkOiB0aGlzLmNvbmZpZy5wZXJzb25hSWQsXG4gICAgICAgICAgY29tcGFueU5hbWU6IHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvPy5uYW1lXG4gICAgICAgIH0sXG4gICAgICAgIGZvbGxvd1VwOiBpbnRlbnRNYXRjaD8uZm9sbG93VXBcbiAgICAgIH07XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgcHJvY2Vzc2luZ1RpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogJ0kgYXBvbG9naXplLCBidXQgSSBlbmNvdW50ZXJlZCBhbiBlcnJvciBwcm9jZXNzaW5nIHlvdXIgbWVzc2FnZS4gUGxlYXNlIHRyeSBhZ2Fpbi4nLFxuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBjaGFubmVsOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICBwcm9jZXNzaW5nVGltZU1zOiBwcm9jZXNzaW5nVGltZSxcbiAgICAgICAgICBwZXJzb25hSWQ6IHRoaXMuY29uZmlnLnBlcnNvbmFJZCxcbiAgICAgICAgICBjb21wYW55TmFtZTogdGhpcy5jb25maWcuY29tcGFueUluZm8/Lm5hbWVcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICBjb2RlOiAnUFJPQ0VTU0lOR19FUlJPUicsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgICAgZGV0YWlsczogZXJyb3JcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lIHByZWZlcnJlZCBjaGFubmVsIGZvciByZXNwb25zZSBiYXNlZCBvbiBjb250ZXh0IGFuZCB0ZW5hbnQgcHJlZmVyZW5jZXNcbiAgICovXG4gIGRldGVybWluZVByZWZlcnJlZENoYW5uZWwoY29udGV4dDogQWdlbnRDb250ZXh0LCB0ZW5hbnRQcmVmZXJlbmNlcz86IFJlY29yZDxzdHJpbmcsIGFueT4pOiBNZXNzYWdlU291cmNlIHtcbiAgICAvLyBEZWZhdWx0IHRvIHRoZSBvcmlnaW5hdGluZyBjaGFubmVsXG4gICAgaWYgKHRlbmFudFByZWZlcmVuY2VzPy5wcmVmZXJyZWRDaGFubmVsKSB7XG4gICAgICByZXR1cm4gdGVuYW50UHJlZmVyZW5jZXMucHJlZmVycmVkQ2hhbm5lbCBhcyBNZXNzYWdlU291cmNlO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gY29udGV4dC5zb3VyY2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHJvdXRpbmcgaW5mb3JtYXRpb24gZm9yIHRoZSByZXNwb25zZVxuICAgKi9cbiAgY3JlYXRlUm91dGluZ0luZm8oY29udGV4dDogQWdlbnRDb250ZXh0LCBwcmVmZXJyZWRDaGFubmVsOiBNZXNzYWdlU291cmNlKToge1xuICAgIHNtcz86IHsgdG86IHN0cmluZyB9O1xuICAgIGVtYWlsPzogeyB0bzogc3RyaW5nIH07XG4gICAgY2hhdD86IHsgc2Vzc2lvbklkOiBzdHJpbmcgfTtcbiAgfSB7XG4gICAgY29uc3Qgcm91dGluZzogYW55ID0ge307XG4gICAgXG4gICAgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdzbXMnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5zbXMpIHtcbiAgICAgIHJvdXRpbmcuc21zID0geyB0bzogY29udGV4dC5jaGFubmVsX2NvbnRleHQuc21zLmZyb20gfTtcbiAgICB9IGVsc2UgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdlbWFpbCcgJiYgY29udGV4dC5jaGFubmVsX2NvbnRleHQ/LmVtYWlsKSB7XG4gICAgICByb3V0aW5nLmVtYWlsID0geyB0bzogY29udGV4dC5jaGFubmVsX2NvbnRleHQuZW1haWwuZnJvbSB9O1xuICAgIH0gZWxzZSBpZiAocHJlZmVycmVkQ2hhbm5lbCA9PT0gJ2NoYXQnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5jaGF0KSB7XG4gICAgICByb3V0aW5nLmNoYXQgPSB7IHNlc3Npb25JZDogY29udGV4dC5jaGFubmVsX2NvbnRleHQuY2hhdC5zZXNzaW9uSWQgfTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHJvdXRpbmc7XG4gIH1cbn0iXX0=