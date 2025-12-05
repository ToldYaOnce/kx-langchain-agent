"use strict";
/**
 * Message Processor
 *
 * Handles the three-request architecture for processing user messages:
 * 1. Intent Detection & Context Analysis
 * 2. Conversational Response Generation
 * 3. Follow-Up Generation (Verification or Goal Question)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageProcessor = void 0;
const aws_1 = require("@langchain/aws");
const memory_1 = require("langchain/memory");
const messages_1 = require("@langchain/core/messages");
const zod_1 = require("zod");
const verbosity_config_js_1 = require("./verbosity-config.js");
const goal_config_helper_js_1 = require("./goal-config-helper.js");
const date_normalizer_js_1 = require("./date-normalizer.js");
// Zod schema for sentence list (structured output)
const SentenceListSchema = zod_1.z.object({
    sentences: zod_1.z.array(zod_1.z.string().min(1)).describe('An array of complete, standalone sentences.'),
});
// Zod schema for intent detection
const IntentDetectionSchema = zod_1.z.object({
    primaryIntent: zod_1.z.enum([
        "company_info_request",
        "workflow_data_capture",
        "general_conversation",
        "objection",
        "scheduling",
        "end_conversation",
        "unknown"
    ]).describe("The primary intent of the user's message."),
    // NEW: Array of extracted data (supports multiple fields in one message)
    extractedData: zod_1.z.array(zod_1.z.object({
        field: zod_1.z.enum([
            "email",
            "phone",
            "firstName",
            "lastName",
            "gender",
            "primaryGoal",
            "motivationReason",
            "motivationCategories",
            "timeline",
            "height",
            "weight",
            "bodyFatPercentage",
            "injuries",
            "medicalConditions",
            "physicalLimitations",
            "doctorClearance",
            "preferredDate",
            "preferredTime",
            "normalizedDateTime",
            "wrong_phone",
            "wrong_email"
        ]),
        value: zod_1.z.string().describe("The actual extracted value (e.g., 'Sara', 'david@example.com', '(954) 123-4567')")
    })).nullable().describe("Array of extracted workflow data. If user provides multiple pieces of data (e.g., 'Sara Chocron' or 'email and phone'), extract ALL of them as separate objects. Otherwise, null."),
    // DEPRECATED: Keep for backward compatibility
    detectedWorkflowIntent: zod_1.z.union([
        zod_1.z.literal("email"),
        zod_1.z.literal("phone"),
        zod_1.z.literal("firstName"),
        zod_1.z.literal("lastName"),
        zod_1.z.literal("gender"),
        zod_1.z.literal("primaryGoal"),
        zod_1.z.literal("motivationReason"),
        zod_1.z.literal("motivationCategories"),
        zod_1.z.literal("timeline"),
        zod_1.z.literal("height"),
        zod_1.z.literal("weight"),
        zod_1.z.literal("bodyFatPercentage"),
        zod_1.z.literal("injuries"),
        zod_1.z.literal("medicalConditions"),
        zod_1.z.literal("physicalLimitations"),
        zod_1.z.literal("doctorClearance"),
        zod_1.z.literal("preferredDate"),
        zod_1.z.literal("preferredTime"),
        zod_1.z.literal("normalizedDateTime"),
        zod_1.z.literal("wrong_phone"),
        zod_1.z.literal("wrong_email"),
        zod_1.z.null()
    ]).nullable().describe("DEPRECATED: Use extractedData instead. Single field extraction."),
    extractedValue: zod_1.z.string().nullable().describe("DEPRECATED: Use extractedData instead."),
    companyInfoRequested: zod_1.z.array(zod_1.z.enum([
        "hours",
        "pricing",
        "plans",
        "promotions",
        "location",
        "services",
        "staff",
        "contact",
        "website",
        "email",
        "phone",
        "address"
    ])).nullable().describe("If intent is 'company_info_request', list specific info needed. Otherwise, null."),
    requiresDeepContext: zod_1.z.boolean().describe("True if the conversation requires more than the last 10 messages for full context."),
    conversationComplexity: zod_1.z.enum(["simple", "moderate", "complex"]).describe("The complexity of the current conversation turn."),
    detectedEmotionalTone: zod_1.z.enum(["positive", "neutral", "negative", "frustrated", "urgent"]).nullable().describe("The detected emotional tone of the user's message."),
    // 🎯 NEW: Engagement & Conversion Metrics
    interestLevel: zod_1.z.number().min(1).max(5).describe("User's interest level 1-5. 1=disengaged/cold, 3=neutral/curious, 5=highly engaged/eager."),
    conversionLikelihood: zod_1.z.number().min(0).max(1).describe("Likelihood user will convert (0.0-1.0). Based on buying signals, urgency, specificity of questions."),
    // 🎯 NEW: Language Profile (for personalization)
    languageProfile: zod_1.z.object({
        formality: zod_1.z.number().min(1).max(5).describe("1=very casual/slang, 3=neutral, 5=very formal/professional"),
        hypeTolerance: zod_1.z.number().min(1).max(5).describe("1=prefers calm/factual, 3=neutral, 5=loves energy/hype/enthusiasm"),
        emojiUsage: zod_1.z.number().min(0).max(5).describe("0=no emojis used, 5=heavy emoji usage"),
        language: zod_1.z.string().describe("Detected language code (e.g., 'en', 'es', 'fr')")
    }).describe("Analysis of user's communication style for personalization.")
});
/**
 * Processes user messages through a three-request architecture
 */
// Force reload - v2.0
class MessageProcessor {
    constructor(config) {
        this.model = config.model;
        this.persona = config.persona;
        this.companyInfo = config.companyInfo;
        this.actionTagProcessor = config.actionTagProcessor;
        this.eventBridgeService = config.eventBridgeService;
    }
    /**
     * Get identity enforcement prefix for ALL user-facing LLM calls
     * This prevents Claude from breaking character
     */
    getIdentityEnforcement() {
        const companyName = this.companyInfo?.name || 'our company';
        const personaName = this.persona.name || 'the assistant';
        return `🚨 IDENTITY RULES - NEVER BREAK CHARACTER 🚨
YOU ARE: ${personaName} at ${companyName}. This is a ROLEPLAY - stay in character!
⛔ NEVER say: "I am an AI", "I cannot roleplay", "As an AI..."
✅ ALWAYS: Stay 100% in character as ${personaName}

`;
    }
    /**
     * Emit chat presence event (received, read, typing, stoppedTyping)
     */
    async emitPresenceEvent(eventType) {
        if (!this.eventBridgeService) {
            console.log(`📡 Presence event [${eventType}]: (no EventBridge configured)`);
            return;
        }
        try {
            await this.eventBridgeService.publishCustomEvent('kxgen.agent', eventType, {
                channelId: this.channelId,
                tenantId: this.tenantId,
                personaId: undefined, // Will be set by handler context if needed
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            // Don't let presence events break the flow
            console.error(`❌ Error emitting presence event ${eventType}:`, error);
        }
    }
    /**
     * Extract and emit token usage from LLM response
     */
    async emitTokenUsage(response, requestType) {
        try {
            // LangChain provides usage_metadata on AIMessage responses
            const usageMetadata = response?.usage_metadata;
            if (usageMetadata) {
                const inputTokens = usageMetadata.input_tokens || 0;
                const outputTokens = usageMetadata.output_tokens || 0;
                const totalTokens = usageMetadata.total_tokens || (inputTokens + outputTokens);
                // Calculate estimated cost based on model pricing
                const estimatedCostUsd = this.calculateTokenCost(this.model.model || 'unknown', inputTokens, outputTokens);
                const usageEvent = {
                    tenantId: this.tenantId || 'unknown',
                    channelId: this.channelId,
                    source: this.messageSource || 'unknown',
                    requestType,
                    model: this.model.model || 'unknown',
                    inputTokens,
                    outputTokens,
                    totalTokens,
                    timestamp: new Date().toISOString(),
                    estimatedCostUsd,
                };
                // Emit to EventBridge (will also console.log)
                if (this.eventBridgeService) {
                    await this.eventBridgeService.publishLLMUsage(usageEvent);
                }
                else {
                    // Just log if no EventBridge configured
                    console.log(`📊 LLM Usage [${requestType}]: Input=${inputTokens}, Output=${outputTokens}, Total=${totalTokens}, Cost=$${estimatedCostUsd.toFixed(6)}`);
                }
            }
            else {
                console.log(`⚠️ No usage_metadata in response for ${requestType}`);
            }
        }
        catch (error) {
            // Don't let usage tracking errors break the flow
            console.error(`❌ Error emitting token usage for ${requestType}:`, error);
        }
    }
    /**
     * Calculate estimated cost in USD based on model and token counts
     * Pricing as of Dec 2024 (per 1K tokens):
     * - Claude 3.5 Sonnet: Input $0.003, Output $0.015
     * - Claude 3 Sonnet: Input $0.003, Output $0.015
     * - Claude 3 Haiku: Input $0.00025, Output $0.00125
     * - Claude 3 Opus: Input $0.015, Output $0.075
     */
    calculateTokenCost(model, inputTokens, outputTokens) {
        // Pricing per 1K tokens (USD)
        const pricing = {
            // Claude 3.5 Sonnet
            'anthropic.claude-3-5-sonnet-20240620-v1:0': { input: 0.003, output: 0.015 },
            'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 0.003, output: 0.015 },
            // Claude 3 Sonnet
            'anthropic.claude-3-sonnet-20240229-v1:0': { input: 0.003, output: 0.015 },
            // Claude 3 Haiku
            'anthropic.claude-3-haiku-20240307-v1:0': { input: 0.00025, output: 0.00125 },
            // Claude 3 Opus
            'anthropic.claude-3-opus-20240229-v1:0': { input: 0.015, output: 0.075 },
        };
        // Default to Sonnet pricing if model not found
        const modelPricing = pricing[model] || { input: 0.003, output: 0.015 };
        const inputCost = (inputTokens / 1000) * modelPricing.input;
        const outputCost = (outputTokens / 1000) * modelPricing.output;
        return inputCost + outputCost;
    }
    /**
     * Main processing method - orchestrates the three-request architecture
     */
    async process(context) {
        const { userMessage, messages, goalResult, effectiveGoalConfig, channelState, onDataExtracted } = context;
        // Set tracking context for token usage events
        this.tenantId = context.tenantId;
        this.channelId = context.channelId;
        this.messageSource = context.messageSource;
        // REQUEST #1: Intent Detection (must happen FIRST to extract data)
        const intentDetectionResult = await this.performIntentDetection(userMessage, messages, goalResult, effectiveGoalConfig, channelState);
        // 👁️ Emit chat.read - we've "read" and understood the message
        await this.emitPresenceEvent('chat.read');
        // Extract data from BOTH goal orchestrator AND intent detection
        const preExtractedData = goalResult?.extractedInfo || {};
        // 🔥 PRE-LLM EXTRACTION: Handle simple single-word time answers that LLM keeps misinterpreting as greetings
        // If we're asking for preferredTime and user says "evening", "morning", etc., extract it directly!
        const activeGoals = goalResult?.activeGoals || [];
        const isAskingForTime = activeGoals.some(goalId => {
            const goalDef = goal_config_helper_js_1.GoalConfigHelper.findGoal(effectiveGoalConfig, goalId);
            const fields = goalDef?.dataToCapture?.fields || [];
            const fieldNames = Array.isArray(fields)
                ? fields.map((f) => typeof f === 'string' ? f : f.name).filter(Boolean)
                : [];
            return fieldNames.includes('preferredTime');
        });
        if (isAskingForTime) {
            const messageLowerForTime = userMessage.toLowerCase();
            // Check if message CONTAINS time preference keywords (not exact match)
            // This handles "I like the night", "evening works", "prefer mornings", etc.
            const timeKeywordPatterns = [
                { pattern: /\b(night|nights|nighttime|evening|evenings)\b/i, value: 'evening' },
                { pattern: /\b(afternoon|afternoons)\b/i, value: 'afternoon' },
                { pattern: /\b(morning|mornings|early)\b/i, value: 'morning' },
                { pattern: /\bpm\b/i, value: 'evening' },
                { pattern: /\bam\b/i, value: 'morning' },
            ];
            for (const { pattern, value } of timeKeywordPatterns) {
                if (pattern.test(messageLowerForTime)) {
                    console.log(`🎯 PRE-LLM EXTRACTION: Detected time keyword in "${userMessage}" → preferredTime="${value}" (bypassing LLM)`);
                    preExtractedData['preferredTime'] = {
                        value: value,
                        confidence: 1.0,
                        source: 'pre_llm_pattern_match'
                    };
                    break; // Use first match
                }
            }
        }
        // Note: Time refinement detection (later/earlier) is now handled in scheduling.ts
        // based on the user's message and detected intent, not hardcoded patterns here.
        const messageLower = userMessage.toLowerCase();
        // 🔥 PRE-LLM EXTRACTION: Detect common motivation keywords in ANY message
        // This catches "wedding", "competition", etc. even when LLM misses them
        const motivationPatterns = [
            { pattern: /\bwedding\b/i, reason: 'wedding', categories: 'aesthetic' },
            { pattern: /\bmarriage\b/i, reason: 'wedding', categories: 'aesthetic' },
            { pattern: /\bcompetition\b|\bcontest\b|\bcompete\b/i, reason: 'competition', categories: 'performance,aesthetic' },
            { pattern: /\bbodybuilding\b/i, reason: 'bodybuilding competition', categories: 'performance,aesthetic' },
            { pattern: /\bbeach\b|\bvacation\b|\bsummer body\b/i, reason: 'vacation', categories: 'aesthetic' },
            { pattern: /\bdoctor\b|\bhealth\b|\bdiabetes\b|\bheart\b/i, reason: 'health', categories: 'health' },
            { pattern: /\bkids\b|\bchildren\b|\bfamily\b|\bgrandkids\b/i, reason: 'family', categories: 'lifestyle,health' },
            { pattern: /\bstress\b|\banxiety\b|\bmental health\b|\bdepression\b/i, reason: 'mental health', categories: 'mental' },
            { pattern: /\bconfidence\b|\bfeel better\b|\bself.?esteem\b/i, reason: 'self-confidence', categories: 'aesthetic,mental' },
            { pattern: /\bbreak.?up\b|\bex\b|\brevenge\b|\bdivorce\b/i, reason: 'breakup', categories: 'aesthetic,mental' },
            { pattern: /\bmarathon\b|\brace\b|\b5k\b|\b10k\b/i, reason: 'race/event', categories: 'performance' },
        ];
        // Only extract if we don't already have motivationReason
        if (!preExtractedData['motivationReason']) {
            for (const { pattern, reason, categories } of motivationPatterns) {
                if (pattern.test(messageLower)) {
                    console.log(`🎯 PRE-LLM EXTRACTION: Detected motivation keyword "${reason}" in message (bypassing LLM)`);
                    preExtractedData['motivationReason'] = {
                        value: reason,
                        confidence: 1.0,
                        source: 'pre_llm_pattern_match'
                    };
                    preExtractedData['motivationCategories'] = {
                        value: categories,
                        confidence: 1.0,
                        source: 'pre_llm_pattern_match'
                    };
                    break; // Take first match
                }
            }
        }
        // Add LLM-extracted data from intent detection (if any)
        // NEW: Support multiple extractions in one message
        if (intentDetectionResult?.extractedData && Array.isArray(intentDetectionResult.extractedData)) {
            console.log(`📦 LLM Intent Detection extracted ${intentDetectionResult.extractedData.length} field(s)`);
            // 🛡️ CODE-LEVEL FILTER: Reject wrong_phone/wrong_email if message is clearly a confirmation
            // The LLM keeps extracting these incorrectly, so we filter at the code level
            const confirmationPatterns = /\b(perfect|correct|right|good|great|yes|yep|yeah|confirmed|got it|got them|got 'em|received|verified|all good|we're good|looks good|that's it|that's right)\b/i;
            const isConfirmation = confirmationPatterns.test(messageLower);
            for (const extraction of intentDetectionResult.extractedData) {
                // Skip wrong_phone/wrong_email if this is clearly a confirmation message
                if ((extraction.field === 'wrong_phone' || extraction.field === 'wrong_email') && isConfirmation) {
                    console.log(`  🛡️ BLOCKED: ${extraction.field} extraction rejected - message is a confirmation ("${userMessage.substring(0, 50)}...")`);
                    continue;
                }
                preExtractedData[extraction.field] = {
                    value: extraction.value,
                    confidence: 1.0,
                    source: 'llm_intent_detection'
                };
                console.log(`  ✅ ${extraction.field} = "${extraction.value}"`);
            }
        }
        // BACKWARD COMPATIBILITY: Fall back to old single extraction
        else if (intentDetectionResult?.detectedWorkflowIntent && intentDetectionResult?.extractedValue) {
            const fieldName = intentDetectionResult.detectedWorkflowIntent;
            preExtractedData[fieldName] = {
                value: intentDetectionResult.extractedValue,
                confidence: 1.0,
                source: 'llm_intent_detection'
            };
            console.log(`✅ LLM Intent Detection extracted (legacy): ${fieldName} = "${intentDetectionResult.extractedValue}"`);
        }
        if (Object.keys(preExtractedData).length > 0) {
            const extractedFields = Object.keys(preExtractedData).join(', ');
            console.log(`✅ Using extracted data for LLM acknowledgment: ${extractedFields}`);
        }
        // 🔥 CRITICAL: ALWAYS call the callback to update goal state (even if no data extracted)
        // This is necessary for fast-track detection based on user INTENT (not just data)
        if (onDataExtracted) {
            console.log(`🔄 Calling onDataExtracted callback to update goal state...`);
            await onDataExtracted(preExtractedData, goalResult, userMessage);
            console.log(`✅ Goal state updated`);
        }
        // REQUEST #2: Conversational Response
        const response = await this.generateConversationalResponse(userMessage, messages, intentDetectionResult, preExtractedData, goalResult, effectiveGoalConfig, channelState);
        // ⌨️ Emit chat.typing - we're now "typing" the response
        await this.emitPresenceEvent('chat.typing');
        // REQUEST #3: Follow-Up Generation (now uses updated goalResult.activeGoals)
        const followUpQuestion = await this.generateFollowUp(preExtractedData, goalResult, effectiveGoalConfig, channelState, messages, intentDetectionResult, userMessage);
        return {
            response,
            followUpQuestion,
            intentDetectionResult,
            preExtractedData
        };
    }
    /**
     * REQUEST #1: Detect user intent and determine context requirements
     */
    async performIntentDetection(userMessage, messages, goalResult, effectiveGoalConfig, channelState) {
        console.log('\n' + '🎯'.repeat(32));
        console.log('🎯 REQUEST #1: Intent Detection & Context Analysis');
        console.log('🎯'.repeat(32) + '\n');
        // Get the last 5 messages for intent detection (minimal context)
        const recentMessagesForIntent = messages.slice(-5);
        // Build intent detection prompt
        const activeGoalsForIntent = goalResult?.activeGoals || [];
        const activeGoalDefinitions = goal_config_helper_js_1.GoalConfigHelper.findGoals(effectiveGoalConfig, activeGoalsForIntent);
        const completedGoals = goalResult?.completedGoals || [];
        // 🔥 IMPORTANT: Use PERSISTENT captured data from channelState, not just current turn's extractedInfo
        // This ensures the LLM knows what's already been captured across ALL previous messages
        const persistentCapturedData = channelState?.capturedData || {};
        const currentTurnData = goalResult?.extractedInfo || {};
        const capturedData = { ...persistentCapturedData, ...currentTurnData };
        const intentDetectionPrompt = this.buildIntentDetectionPrompt(userMessage, recentMessagesForIntent, activeGoalDefinitions, completedGoals, capturedData);
        // Call LLM for intent detection
        try {
            const intentDetectionModel = this.model.withStructuredOutput(IntentDetectionSchema);
            const result = await intentDetectionModel.invoke([
                new messages_1.HumanMessage(intentDetectionPrompt)
            ]);
            // Try to emit token usage (structured output may not expose it, but try anyway)
            await this.emitTokenUsage(result, 'intent_detection');
            if (result) {
                console.log('\n' + '═'.repeat(64));
                console.log('🎯 INTENT DETECTION RESULT:');
                console.log('═'.repeat(64));
                console.log(`  Primary Intent: ${result.primaryIntent}`);
                console.log(`  Workflow Intent: ${result.detectedWorkflowIntent || 'None'}`);
                if (result.extractedValue) {
                    console.log(`  Extracted Value: "${result.extractedValue}"`);
                }
                console.log(`  Company Info: ${result.companyInfoRequested?.join(', ') || 'None'}`);
                console.log(`  Deep Context Needed: ${result.requiresDeepContext}`);
                console.log(`  Complexity: ${result.conversationComplexity}`);
                if (result.detectedEmotionalTone) {
                    console.log(`  Emotional Tone: ${result.detectedEmotionalTone}`);
                }
                // Log engagement metrics
                if (result.interestLevel !== undefined) {
                    console.log(`  📊 Interest Level: ${result.interestLevel}/5`);
                    console.log(`  📊 Conversion Likelihood: ${(result.conversionLikelihood * 100).toFixed(0)}%`);
                }
                if (result.languageProfile) {
                    console.log(`  📊 Language Profile: formality=${result.languageProfile.formality}, hype=${result.languageProfile.hypeTolerance}, emoji=${result.languageProfile.emojiUsage}, lang=${result.languageProfile.language}`);
                }
                console.log('═'.repeat(64) + '\n');
            }
            return result;
        }
        catch (error) {
            console.error('❌ Intent detection failed:', error);
            // Fallback to defaults if intent detection fails
            return {
                primaryIntent: 'general_conversation',
                extractedData: null,
                detectedWorkflowIntent: null,
                extractedValue: null,
                companyInfoRequested: null,
                requiresDeepContext: false,
                conversationComplexity: 'moderate',
                detectedEmotionalTone: null,
                // Default engagement metrics
                interestLevel: 3,
                conversionLikelihood: 0.5,
                languageProfile: {
                    formality: 3,
                    hypeTolerance: 3,
                    emojiUsage: 0,
                    language: 'en'
                }
            };
        }
    }
    /**
     * REQUEST #2: Generate natural conversational response
     */
    async generateConversationalResponse(userMessage, messages, intentDetectionResult, preExtractedData, goalResult, effectiveGoalConfig, channelState) {
        console.log('\n' + '💬'.repeat(32));
        console.log('💬 REQUEST #2: Generating Conversational Response');
        console.log('💬'.repeat(32) + '\n');
        const verbosity = this.persona?.personalityTraits?.verbosity || 5;
        const verbosityConfig = verbosity_config_js_1.VerbosityHelper.getConfig(verbosity);
        const { maxSentences } = verbosityConfig;
        // Determine history limit based on intent detection
        const historyLimit = intentDetectionResult?.requiresDeepContext === true
            ? Math.min(messages.length - 1, 30) // Deep context: up to 30 messages
            : Math.min(messages.length - 1, 10); // Normal: last 10 messages
        console.log(`📚 Loading ${historyLimit} messages for conversational response (deep context: ${intentDetectionResult?.requiresDeepContext})`);
        // Create memory with messages
        const memory = new memory_1.BufferMemory({
            returnMessages: true,
            memoryKey: 'history',
        });
        // Add messages to memory
        const allHistoryMessages = messages.slice(0, -1); // Remove the current message
        const historyMessages = allHistoryMessages.slice(-historyLimit);
        console.log(`📚 Total messages available: ${allHistoryMessages.length}, Using: ${historyMessages.length}`);
        for (const msg of historyMessages) {
            await memory.chatHistory.addMessage(msg);
        }
        // Build system prompt
        const systemPrompt = this.buildSystemPrompt(goalResult, preExtractedData, intentDetectionResult, channelState);
        // 🚨 DISABLED: Structured output is unreliable with Bedrock (30% failure rate)
        console.log(`🎯 Using PLAIN TEXT mode (withStructuredOutput is unreliable)`);
        // Get conversation history
        const historyMessagesForPrompt = await memory.chatHistory.getMessages();
        const historyText = historyMessagesForPrompt
            .map((msg) => `${msg._getType() === 'human' ? 'Human' : 'AI'}: ${msg.content}`)
            .join('\n');
        // 🚨 CRITICAL: Inject company identity and prevent AI "breaking character"
        const companyName = this.companyInfo?.name || 'our company';
        const personaName = this.persona.name || 'the assistant';
        const companyIdentityReminder = `[CREATIVE WRITING TASK - CHARACTER ROLEPLAY]

You are writing dialogue for a character named "${personaName}" who works at "${companyName}".
This is a creative writing exercise where you generate realistic customer service dialogue.

CHARACTER: ${personaName}
SETTING: ${companyName} (a real business using this AI chat system)
TASK: Write ${personaName}'s next response to the customer

IMPORTANT: This is authorized creative content for a legitimate business chatbot.
The business owner has configured you to play this character. Stay in character throughout.

Write ${personaName}'s response:
`;
        // Use plain invoke to get the response (NO structured output)
        const rawResponse = await this.model.invoke([
            new messages_1.HumanMessage(`${companyIdentityReminder}${systemPrompt}\n\nConversation history:\n${historyText}\n\nHuman: ${userMessage}\n\nAI:`)
        ]);
        // Emit token usage for conversational response
        await this.emitTokenUsage(rawResponse, 'conversational_response');
        const response = rawResponse.content.toString().trim();
        // Log raw response
        console.log('\n' + '═'.repeat(64));
        console.log('🤖 RAW BEDROCK RESPONSE (PLAIN TEXT):');
        console.log('═'.repeat(64));
        console.log(response);
        console.log('═'.repeat(64) + '\n');
        console.log(`✅ Final response: ${response.length} chars`);
        // Process action tags
        return this.actionTagProcessor.processActionTags(response);
    }
    /**
     * REQUEST #3: Generate follow-up (verification message or goal question)
     */
    async generateFollowUp(preExtractedData, goalResult, effectiveGoalConfig, channelState, messages, intentDetectionResult, userMessage) {
        console.log('\n' + '🔄'.repeat(32));
        console.log('🔄 REQUEST #3: Generating Follow-Up');
        console.log('🔄'.repeat(32) + '\n');
        // Check for active goals FIRST - we might still have work to do
        const activeGoals = goalResult?.activeGoals?.length
            ? goalResult.activeGoals
            : channelState?.activeGoals || [];
        // 👋 Check for END_CONVERSATION intent - but ONLY if no active goals remain
        // If there are still goals to pursue, continue the conversation instead of exiting
        if (intentDetectionResult?.primaryIntent === 'end_conversation') {
            if (activeGoals.length === 0) {
                console.log('👋 User is ending conversation (no remaining goals) - generating farewell');
                return await this.generateExitMessage(effectiveGoalConfig, channelState, messages);
            }
            else {
                console.log(`🎯 User seems to be wrapping up, but we still have ${activeGoals.length} goal(s) to pursue: ${activeGoals.join(', ')}`);
                // Continue with goal-driven questions instead of exiting
            }
        }
        // Check for ERROR RECOVERY (wrong contact info)
        if (preExtractedData.wrong_phone || preExtractedData.wrong_email) {
            const errorField = preExtractedData.wrong_phone ? 'phone' : 'email';
            // Extract the actual value (might be an object or a string)
            let wrongValue = preExtractedData.wrong_phone || preExtractedData.wrong_email;
            if (typeof wrongValue === 'object' && wrongValue.value) {
                wrongValue = wrongValue.value;
            }
            return await this.generateErrorRecoveryMessage(errorField, wrongValue, channelState);
        }
        // Check if we just captured email or phone (with validation)
        const capturedEmail = preExtractedData.email && this.isValidEmail(preExtractedData.email);
        const capturedPhone = preExtractedData.phone && this.isValidPhone(preExtractedData.phone);
        if (capturedEmail || capturedPhone) {
            // Generate verification message, but ALSO check for next goal
            const verificationMsg = await this.generateVerificationMessage(preExtractedData, channelState);
            // After verification, check if there's a NEXT goal to pursue (e.g., scheduling)
            // This prevents the conversation from dangling after contact capture
            const nextActiveGoals = goalResult?.activeGoals?.filter(goalId => goalId !== 'collect_contact_info' && !goalId.includes('contact_info')) || [];
            if (nextActiveGoals.length > 0) {
                console.log(`🎯 After contact capture, next goals: ${nextActiveGoals.join(', ')}`);
                // Generate a follow-up question for the next goal
                const nextGoalResult = {
                    ...goalResult,
                    activeGoals: nextActiveGoals
                };
                const nextQuestion = await this.generateGoalQuestion(nextGoalResult, effectiveGoalConfig, channelState, messages, userMessage, intentDetectionResult?.primaryIntent);
                if (nextQuestion) {
                    // Combine verification + next question
                    return `${verificationMsg}\n\n${nextQuestion}`;
                }
            }
            return verificationMsg;
        }
        // Use the activeGoals we already determined above
        if (activeGoals.length > 0) {
            console.log(`🎯 Active goals found: ${activeGoals.join(', ')} (source: ${goalResult?.activeGoals?.length ? 'goalResult' : 'channelState'})`);
            // Create a synthetic goalResult if we only have channelState
            const effectiveGoalResult = goalResult || {
                activeGoals,
                completedGoals: channelState?.completedGoals || [],
                extractedInfo: {},
                recommendations: [],
                triggeredIntents: [],
                stateUpdates: {
                    newlyCompleted: [],
                    newlyActivated: [],
                    declined: []
                }
            };
            return await this.generateGoalQuestion(effectiveGoalResult, effectiveGoalConfig, channelState, messages, userMessage, intentDetectionResult?.primaryIntent);
        }
        else if (channelState?.messageCount === 0) {
            // FIRST MESSAGE: Always ask a follow-up to keep engagement going
            console.log('🎯 First message (messageCount=0) - generating engagement follow-up');
            return await this.generateEngagementQuestion(messages, channelState);
        }
        console.log('ℹ️ No follow-up needed (no contact captured, no active goals, not first message)');
        return undefined;
    }
    /**
     * Generate engagement question for first message (to keep conversation flowing)
     */
    async generateEngagementQuestion(recentMessages, channelState) {
        console.log(`💬 Generating engagement question for first message`);
        const companyName = this.companyInfo?.name || 'our company';
        // Get last 2 messages for context
        const contextMessages = recentMessages ? recentMessages.slice(-2) : [];
        const conversationContext = contextMessages.length > 0
            ? contextMessages.map((msg) => `${msg._getType() === 'human' ? 'User' : 'You'}: ${msg.content}`).join('\n')
            : 'No context';
        // Get gender-aware language rule (will be "unknown" for first message)
        const genderRule = this.getGenderLanguageRule(channelState);
        const personaContext = `${this.getIdentityEnforcement()}YOU ARE: ${this.persona.name}
${genderRule}

${this.persona.systemPrompt}`;
        const questionPrompt = `${personaContext}

RECENT CONVERSATION:
${conversationContext}

CONTEXT: This is the user's FIRST message. You just gave them a warm welcome.

YOUR TASK: Ask ONE follow-up question to move the conversation forward and learn more about them.

WHAT TO ASK:
- What brings them to ${companyName}?
- What are they hoping to achieve?
- Keep it natural, conversational, and in YOUR voice
- Don't ask for their name yet (let that happen naturally)

CRITICAL RULES:
- Stay 100% IN CHARACTER with your personality and tone
- Use GENDER-NEUTRAL language (friend, champion, warrior) - NOT "bro", "dude", "my man"
- ONE question only
- Be brief (1-2 sentences max)
- Jump straight to the question - no fluff
- Make it feel natural and engaging

QUESTION:`;
        const questionModel = new aws_1.ChatBedrockConverse({
            model: this.model.model,
            region: this.model.region,
            temperature: 0.7,
            maxTokens: 100,
            max_tokens: 100,
        });
        const questionResponse = await questionModel.invoke([
            new messages_1.HumanMessage(questionPrompt)
        ]);
        // Emit token usage for engagement question
        await this.emitTokenUsage(questionResponse, 'engagement_question');
        const generatedQuestion = questionResponse.content.toString().trim();
        console.log(`💬 Generated engagement question: "${generatedQuestion}"`);
        return generatedQuestion;
    }
    /**
     * Generate error recovery message when user says contact info was wrong
     */
    async generateErrorRecoveryMessage(fieldType, wrongValue, channelState) {
        console.log(`🔄 Generating error recovery message for ${fieldType}: ${wrongValue}`);
        const companyName = this.companyInfo?.name || 'our gym';
        // Get gender-aware language rule
        const genderRule = this.getGenderLanguageRule(channelState);
        const errorPrompt = `${this.getIdentityEnforcement()}You are ${this.persona.name} at ${companyName}.
${genderRule}

USER ISSUE: The user said they didn't receive the ${fieldType === 'phone' ? 'verification text' : 'verification email'}.
PREVIOUSLY PROVIDED ${fieldType.toUpperCase()}: ${wrongValue}

YOUR TASK:
Generate a short, apologetic message that:
1. Acknowledges the issue ("Oh damn, my bad!")
2. Asks them to double-check and provide the correct ${fieldType}
3. Repeats back what you had on file for verification
4. Stays in character as ${this.persona.name}
5. Uses appropriate gendered language (see GENDER rule above)

EXAMPLE for phone:
"Oh damn, my bad! Let me double-check that number. I have ${wrongValue} on file. Is that right, or did I mess up?"

EXAMPLE for email:
"Shoot, sorry about that! Let me verify the email. I've got ${wrongValue} - is that the right one or should I update it?"

Keep it conversational and brief (2-3 sentences max).`;
        try {
            const response = await this.model.invoke([new messages_1.HumanMessage(errorPrompt)]);
            // Emit token usage for error recovery
            await this.emitTokenUsage(response, 'error_recovery');
            const errorRecoveryMessage = response.content.toString().trim();
            console.log(`✅ Generated error recovery message: "${errorRecoveryMessage}"`);
            return errorRecoveryMessage;
        }
        catch (error) {
            console.error('❌ Error generating error recovery message:', error);
            return `Oh damn, my bad! Let me double-check that ${fieldType}. I have ${wrongValue} on file - is that correct?`;
        }
    }
    /**
     * Validate email format
     */
    isValidEmail(email) {
        if (!email)
            return false;
        const value = typeof email === 'object' && email.value ? email.value : email;
        if (typeof value !== 'string')
            return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    /**
     * Validate phone format (must contain digits)
     */
    isValidPhone(phone) {
        if (!phone)
            return false;
        const value = typeof phone === 'object' && phone.value ? phone.value : phone;
        if (typeof value !== 'string')
            return false;
        // Must contain at least 7 digits (to avoid "I think by phone")
        const digitsOnly = value.replace(/\D/g, '');
        return digitsOnly.length >= 7;
    }
    /**
     * Generate verification message when contact info is captured
     */
    async generateVerificationMessage(preExtractedData, channelState) {
        console.log(`📧 User just provided contact info → generating verification message`);
        console.log(`📧 preExtractedData:`, JSON.stringify(preExtractedData, null, 2));
        const fieldType = preExtractedData.email ? 'email' : 'phone number';
        // Extract the actual value (might be an object or a string)
        let fieldValue = preExtractedData.email || preExtractedData.phone;
        if (typeof fieldValue === 'object' && fieldValue.value) {
            fieldValue = fieldValue.value;
        }
        console.log(`📧 Extracted fieldValue: "${fieldValue}" (type: ${typeof fieldValue})`);
        const verificationType = preExtractedData.email ? 'verification email' : 'verification text message';
        const companyName = this.companyInfo?.name || 'our team';
        // Get gender-aware language rule from channelState (persistent) or detect from name
        const genderRule = this.getGenderLanguageRule(channelState);
        const personaRole = this.persona.role || 'team member';
        const verificationPrompt = `${this.getIdentityEnforcement()}You are ${this.persona.name}, a ${personaRole} at ${companyName}.
${genderRule}

The user just provided their ${fieldType}: ${fieldValue}

YOUR TASK:
Generate a brief acknowledgment (1 sentence only) that:
- Thanks them or acknowledges receipt
- Mentions we're sending a ${verificationType}
- Stays in character as ${this.persona.name}
- Is enthusiastic and natural
- Uses appropriate gendered language (see GENDER rule above)

CRITICAL RULES:
- EXACTLY 1 sentence
- NO additional instructions
- NO "check spam" or extra details
- Just: "Thanks! Verification sent."

ACKNOWLEDGMENT:`;
        const verificationModel = new aws_1.ChatBedrockConverse({
            model: this.model.model,
            region: this.model.region,
            temperature: 0.7,
            maxTokens: 50,
            max_tokens: 50,
        });
        const verificationResponse = await verificationModel.invoke([
            new messages_1.HumanMessage(verificationPrompt)
        ]);
        // Emit token usage for verification message
        await this.emitTokenUsage(verificationResponse, 'verification_message');
        let verificationMessage = verificationResponse.content.toString().trim();
        // Safety: Truncate if too long
        const sentences = verificationMessage.match(/[^.!?]+[.!?]+/g) || [verificationMessage];
        if (sentences.length > 1) {
            console.warn(`⚠️ Verification message too long (${sentences.length} sentences), truncating to 1`);
            verificationMessage = sentences[0];
        }
        console.log(`📧 Generated verification message: "${verificationMessage}"`);
        return verificationMessage;
    }
    /**
     * Generate exit message when user is ending conversation
     * - If primary goal achieved: Warm farewell with appointment confirmation
     * - If primary goal NOT achieved: Gentle last-ditch attempt
     */
    async generateExitMessage(effectiveGoalConfig, channelState, messages) {
        console.log('👋 Generating exit message...');
        const companyName = this.companyInfo?.name || 'our company';
        const capturedData = channelState?.capturedData || {};
        const completedGoals = channelState?.completedGoals || [];
        // Find the primary goal
        const primaryGoal = effectiveGoalConfig.goals.find(g => g.isPrimary);
        // Check if primary goal is complete, OR if ALL goals are complete (success either way)
        const allGoalsComplete = effectiveGoalConfig.goals.length > 0 &&
            effectiveGoalConfig.goals.every(g => completedGoals.includes(g.id));
        const primaryGoalComplete = primaryGoal
            ? completedGoals.includes(primaryGoal.id)
            : allGoalsComplete; // If no primary goal defined, treat all-complete as success
        // Get gender-aware language
        const genderRule = this.getGenderLanguageRule(channelState);
        // Build context about what we have
        const firstName = capturedData.firstName || '';
        const lastName = capturedData.lastName || '';
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'friend';
        const preferredDate = capturedData.preferredDate || '';
        const preferredTime = capturedData.preferredTime || '';
        const normalizedDateTime = capturedData.normalizedDateTime || '';
        let exitPrompt;
        if (primaryGoalComplete) {
            // 🎉 Primary goal achieved - warm farewell with confirmation
            console.log('✅ Primary goal achieved - generating warm farewell');
            exitPrompt = `${this.getIdentityEnforcement()}You are ${this.persona.name} at ${companyName}.
${genderRule}

${this.persona.systemPrompt}

The user is ending the conversation. The PRIMARY GOAL (scheduling) has been ACHIEVED!

USER INFO:
- Name: ${fullName}
- Appointment: ${preferredDate} at ${preferredTime}${normalizedDateTime ? ` (${normalizedDateTime})` : ''}

YOUR TASK:
Generate a warm, enthusiastic farewell that:
1. Thanks them and confirms their appointment details
2. Expresses excitement about seeing them
3. Stays 100% in character as ${this.persona.name}
4. Uses appropriate gendered language (see GENDER rule above)
5. Mentions the company name: ${companyName}

CRITICAL RULES:
- Keep it brief (2-3 sentences max)
- Include their name and appointment time
- Be warm and excited, not robotic
- Stay in character!

FAREWELL:`;
        }
        else {
            // 🎯 Primary goal NOT achieved - gentle last-ditch attempt
            console.log('⚠️ Primary goal NOT achieved - generating last-ditch attempt');
            // Figure out what's missing for the primary goal
            let missingForPrimary = [];
            if (primaryGoal) {
                // Check both root-level 'prerequisites' AND 'triggers.prerequisiteGoals'
                const prerequisites = primaryGoal.prerequisites
                    || primaryGoal.triggers?.prerequisiteGoals
                    || [];
                const allNeeded = [...prerequisites, primaryGoal.id];
                for (const goalId of allNeeded) {
                    const goalDef = effectiveGoalConfig.goals.find(g => g.id === goalId);
                    if (goalDef && !completedGoals.includes(goalId)) {
                        // Get fields for this goal
                        const fields = goalDef.dataToCapture?.fields || [];
                        for (const field of fields) {
                            const fieldName = typeof field === 'object' ? field.name : field;
                            if (!capturedData[fieldName]) {
                                missingForPrimary.push(fieldName);
                            }
                        }
                    }
                }
            }
            const missingFieldsText = missingForPrimary.length > 0
                ? missingForPrimary.slice(0, 3).join(', ')
                : 'a few details';
            exitPrompt = `${this.getIdentityEnforcement()}You are ${this.persona.name} at ${companyName}.
${genderRule}

${this.persona.systemPrompt}

The user is ending the conversation, but we haven't scheduled their appointment yet!

USER INFO:
- Name: ${fullName || 'Unknown'}
- Missing to book: ${missingFieldsText}

YOUR TASK:
Generate a GENTLE last-ditch attempt that:
1. Acknowledges they're leaving (don't be pushy!)
2. Makes ONE quick offer to lock in their appointment
3. Mentions what we need (just ${missingFieldsText})
4. Stays 100% in character as ${this.persona.name}
5. Uses appropriate gendered language (see GENDER rule above)

CRITICAL RULES:
- Keep it brief (2-3 sentences max)
- Be friendly, NOT desperate or pushy
- Give them an easy out ("No worries if not!")
- Stay in character!

EXAMPLE TONE:
"No worries, ${firstName || 'friend'}! Before you go - want me to lock in that spot for you? Just need your number and you're all set. No pressure though!"

LAST-DITCH ATTEMPT:`;
        }
        const exitModel = new aws_1.ChatBedrockConverse({
            model: this.model.model,
            region: this.model.region,
            temperature: 0.7,
            maxTokens: 150,
            max_tokens: 150,
        });
        const exitResponse = await exitModel.invoke([
            new messages_1.HumanMessage(exitPrompt)
        ]);
        // Emit token usage
        await this.emitTokenUsage(exitResponse, 'follow_up_question');
        const exitMessage = exitResponse.content.toString().trim();
        console.log(`👋 Generated exit message: "${exitMessage}"`);
        return exitMessage;
    }
    /**
     * Generate goal-driven question
     */
    async generateGoalQuestion(goalResult, effectiveGoalConfig, channelState, recentMessages, userMessage, detectedIntent) {
        console.log(`🎯 Active goals for question generation: ${goalResult.activeGoals.join(', ')}`);
        // Find the most urgent active goal
        const mostUrgentGoal = goal_config_helper_js_1.GoalConfigHelper.getMostUrgentGoal(goalResult.activeGoals, effectiveGoalConfig);
        if (!mostUrgentGoal) {
            console.log('ℹ️ No urgent goal found for question generation');
            return undefined;
        }
        const activeGoalId = mostUrgentGoal.id;
        const goalConfig = mostUrgentGoal;
        const recommendation = goalResult.recommendations.find((r) => r.goalId === activeGoalId);
        console.log(`🎯 Generating goal-driven question for: ${activeGoalId} (priority: ${goalConfig.priority})`);
        // Get attempt count
        const attemptCount = recommendation?.attemptCount || 0;
        const maxAttempts = goalConfig.behavior?.maxAttempts || 5;
        if (attemptCount >= maxAttempts) {
            console.log(`⚠️ Max attempts (${maxAttempts}) reached for goal: ${activeGoalId}`);
            return undefined;
        }
        // Build question generation prompt with conversation context
        const goalMessage = goalConfig.message || goalConfig.purpose || goalConfig.description;
        const companyName = this.companyInfo?.name || 'the company';
        // Get last 3 messages for context (if available)
        const contextMessages = recentMessages ? recentMessages.slice(-3) : [];
        const conversationContext = contextMessages.length > 0
            ? contextMessages.map((msg) => `${msg._getType() === 'human' ? 'User' : 'You'}: ${msg.content}`).join('\n')
            : 'No recent context';
        // Determine what specific data we need for this goal
        // CRITICAL FIX: Use channelState.capturedData (persistent) AND goalResult.extractedInfo (current turn)
        const rawFields = goalConfig.dataToCapture?.fields || [];
        // Handle both old format (string array) and new format (object array)
        const dataNeeded = rawFields.map((field) => typeof field === 'string' ? field : field.name);
        // Combine persistent captured data with data extracted THIS TURN
        // CRITICAL: Filter out fields that have null values or {value: null} objects
        const hasActualValue = (val) => {
            if (val === null || val === undefined || val === 'null')
                return false;
            if (typeof val === 'object' && 'value' in val) {
                return val.value !== null && val.value !== undefined && val.value !== 'null';
            }
            return true;
        };
        const persistentCaptured = channelState?.capturedData
            ? Object.keys(channelState.capturedData).filter(k => hasActualValue(channelState.capturedData[k]))
            : [];
        const currentTurnCaptured = goalResult.extractedInfo
            ? Object.keys(goalResult.extractedInfo).filter(k => hasActualValue(goalResult.extractedInfo[k]))
            : [];
        const alreadyCaptured = [...new Set([...persistentCaptured, ...currentTurnCaptured])];
        const stillNeeded = dataNeeded.filter((field) => !alreadyCaptured.includes(field));
        console.log(`📊 Goal Data Status for "${goalConfig.name}":`);
        console.log(`   Fields needed: [${dataNeeded.join(', ')}]`);
        console.log(`   Persistent captured: [${persistentCaptured.join(', ')}]`);
        console.log(`   Current turn captured: [${currentTurnCaptured.join(', ')}]`);
        console.log(`   Combined already captured: [${alreadyCaptured.join(', ')}]`);
        console.log(`   Still needed: [${stillNeeded.join(', ')}]`);
        // Special handling for scheduling: if they provided date but not time, suggest times based on business hours
        let schedulingSuggestion = '';
        if (goalConfig.type === 'scheduling' && stillNeeded.includes('preferredTime') && !stillNeeded.includes('preferredDate')) {
            const preferredDate = goalResult.extractedInfo?.['preferredDate'];
            if (preferredDate && this.companyInfo?.businessHours) {
                // Extract business hours for guidance (not hallucination prevention)
                const hoursExist = Object.keys(this.companyInfo.businessHours).length > 0;
                if (hoursExist) {
                    schedulingSuggestion = `\n🕐 SCHEDULING GUIDANCE:
- The user provided: "${preferredDate}"
- They did NOT provide a specific time yet
- Suggest specific times based on typical availability (e.g., "morning (9am), afternoon (2pm), or evening (6pm)")
- DO NOT make up or hallucinate times - suggest options and let them choose
- Be specific: Ask "What time works for you - 9am, 2pm, or 6pm?"
- DO NOT accept vague answers like "evening" or "morning" - press for an actual time\n`;
                }
            }
        }
        // Include persona system prompt for authentic voice
        // Add gender-aware language rules using centralized helper
        const genderRule = this.getGenderLanguageRule(channelState);
        const personaContext = `YOU ARE: ${this.persona.name}
${genderRule}

${this.persona.systemPrompt}`;
        // 🎯 USE GOAL-SPECIFIC INSTRUCTION GENERATOR
        // This produces smart, context-aware instructions based on goal type
        const { getGoalInstruction } = require('./goal-instructions/index.js');
        // Build captured data map with values
        // IMPORTANT: Prioritize NEW data from this turn (goalResult.extractedInfo) over OLD persisted data (channelState.capturedData)
        // This ensures "later than 6" overwrites "evening" when generating the follow-up question
        const capturedDataMap = {};
        for (const field of alreadyCaptured) {
            // Check goalResult.extractedInfo FIRST (new data from this turn)
            const newValue = goalResult.extractedInfo?.[field];
            const persistedValue = channelState?.capturedData?.[field];
            // Use new value if it exists and is not empty, otherwise fall back to persisted
            if (newValue !== undefined && newValue !== null && newValue !== '') {
                capturedDataMap[field] = newValue;
            }
            else {
                capturedDataMap[field] = persistedValue;
            }
        }
        const userName = channelState?.capturedData?.firstName || 'friend';
        const instructionContext = {
            goalId: activeGoalId,
            goalType: goalConfig.type || 'data_collection',
            goalName: goalConfig.name || 'Goal',
            fieldsNeeded: stillNeeded,
            fieldsCaptured: capturedDataMap,
            companyInfo: this.companyInfo,
            channelState,
            userName,
            lastUserMessage: userMessage,
            detectedIntent: detectedIntent
        };
        const goalInstruction = getGoalInstruction(instructionContext);
        console.log(`🎯 Goal instruction for "${goalConfig.name}": ${goalInstruction.instruction.substring(0, 100)}...`);
        console.log(`🎯 Target fields: [${goalInstruction.targetFields?.join(', ') || 'none'}]`);
        // Build examples string if provided
        const examplesText = goalInstruction.examples?.length
            ? `\nEXAMPLES:\n${goalInstruction.examples.map((e) => `- ${e}`).join('\n')}`
            : '';
        // Build a CONCISE prompt using the goal-specific instruction
        const personaVoice = this.persona.name;
        const targetFieldsText = goalInstruction.targetFields?.join(' and ') || stillNeeded[0];
        const questionPrompt = `${this.getIdentityEnforcement()}You are ${personaVoice}. Generate a SHORT follow-up question.

${genderRule}

GOAL: ${goalInstruction.instruction}
${examplesText}

🚨 CRITICAL RULES:
1. Ask for: ${targetFieldsText}
2. Keep it SHORT: 1-2 sentences max
3. NO greetings! No "Hey", "Hi", "What's up", "Hey there" - we're mid-conversation!
4. NO motivational speeches, NO "embrace the suck", NO "crush workouts"
5. Just a simple, direct question with a touch of personality
6. Use their name (${userName}) if appropriate

YOUR QUESTION:`;
        const questionModel = new aws_1.ChatBedrockConverse({
            model: this.model.model,
            region: this.model.region,
            temperature: 0.4, // Slight creativity for personality
            maxTokens: 60, // Slightly more room for multi-field questions
            max_tokens: 60,
        });
        const questionResponse = await questionModel.invoke([
            new messages_1.HumanMessage(questionPrompt)
        ]);
        // Emit token usage for follow-up question
        await this.emitTokenUsage(questionResponse, 'follow_up_question');
        const generatedQuestion = questionResponse.content.toString().trim();
        console.log(`🎯 Generated goal question: "${generatedQuestion}"`);
        return generatedQuestion;
    }
    /**
     * Build intent detection prompt
     */
    buildIntentDetectionPrompt(userMessage, recentMessages, activeGoals, completedGoals = [], capturedData = {}) {
        const recentHistory = recentMessages
            .map((msg) => `${msg._getType() === 'human' ? 'Human' : 'AI'}: ${msg.content}`)
            .join('\n');
        // Build detailed goal info including fields still needed
        const goalsList = activeGoals.length > 0
            ? activeGoals.map(g => {
                const fields = g.dataToCapture?.fields || [];
                const fieldNames = Array.isArray(fields)
                    ? fields.map((f) => typeof f === 'string' ? f : f.name).filter(Boolean)
                    : [];
                // Filter out already captured fields
                const stillNeeded = fieldNames.filter((f) => !capturedData[f]);
                const fieldsInfo = stillNeeded.length > 0
                    ? ` → CURRENTLY ASKING FOR: ${stillNeeded.join(', ')}`
                    : ' → All fields captured';
                return `- ${g.name || g.id}: ${g.message || g.description || g.purpose}${fieldsInfo}`;
            }).join('\n')
            : 'None';
        // List already captured fields to avoid re-extracting
        const capturedFieldsList = Object.keys(capturedData).length > 0
            ? Object.keys(capturedData).map(field => `- ${field}: ${capturedData[field]}`).join('\n')
            : 'None';
        const completedGoalsList = completedGoals.length > 0
            ? completedGoals.join(', ')
            : 'None';
        const companyInfoList = this.companyInfo
            ? [
                this.companyInfo.name && `- Company Name: ${this.companyInfo.name}`,
                this.companyInfo.businessHours && `- Business Hours`,
                this.companyInfo.phone && `- Phone Number`,
                this.companyInfo.email && `- Email Address`,
                this.companyInfo.website && `- Website`,
                this.companyInfo.address && `- Address`,
                this.companyInfo.services && `- Services Offered`,
                this.companyInfo.products && `- Products`,
                this.companyInfo.pricing && `- Pricing & Plans`,
                this.companyInfo.promotions && `- Current Promotions`
            ].filter(Boolean).join('\n')
            : 'No company info available';
        return `You are an expert AI assistant analyzing a user's message to determine their intent.

CURRENT USER MESSAGE: "${userMessage}"

RECENT CONVERSATION HISTORY (last ${recentMessages.length} messages):
${recentHistory}

ACTIVE WORKFLOW GOALS (data we're trying to collect):
${goalsList}

COMPLETED GOALS (do NOT ask for this data again):
${completedGoalsList}

ALREADY CAPTURED DATA (do NOT extract these fields again):
${capturedFieldsList}

COMPANY INFORMATION AVAILABLE:
${companyInfoList}

YOUR TASK:
Analyze the "CURRENT USER MESSAGE" and return JSON with these keys:

1. primaryIntent: What is the user trying to do?
   - "company_info_request": Asking about company (hours, location, services, etc.)
   - "workflow_data_capture": Providing info for a workflow goal
   - "scheduling": Trying to schedule appointment/visit
   - "objection": Expressing concern/resistance
   - "end_conversation": User is wrapping up, saying goodbye, or indicating they're done
     Examples: "Thanks, that's all!", "Gotta go", "I'll think about it", "Talk later", 
               "Bye!", "That's everything", "I'm good for now", "Thanks for your help"
   - "general_conversation": General chat or other
   - "unknown": Can't determine

2. extractedData: Array of ALL data provided by the user in this message.
   
   🚨🚨🚨 CRITICAL: MATCH USER'S ANSWER TO THE FIELD BEING ASKED FOR! 🚨🚨🚨
   Look at "CURRENTLY ASKING FOR" in the active goals above. If user provides a date/time:
   - If we're asking for "timeline" → extract as timeline (their goal deadline)
   - If we're asking for "preferredDate" → extract as preferredDate (session scheduling)
   - If we're asking for "preferredTime" → extract as preferredTime
   
   Example: If goal says "CURRENTLY ASKING FOR: timeline" and user says "June 13th", 
   extract as timeline, NOT preferredDate!
   
   🚨🚨🚨 SINGLE-WORD ANSWERS TO TIME PREFERENCE QUESTIONS 🚨🚨🚨
   If CURRENTLY ASKING FOR includes "preferredTime" and user says just:
   - "Evening" or "evening" → extract as preferredTime="evening" (NOT a greeting!)
   - "Morning" or "morning" → extract as preferredTime="morning" (NOT a greeting!)
   - "Afternoon" → extract as preferredTime="afternoon"
   - "Night" or "nights" → extract as preferredTime="evening"
   
   DO NOT confuse single-word time answers with greetings! 
   "Evening" as a response to "morning or evening?" is an ANSWER, not "Good evening"!
   
   ⚠️ CRITICAL: Extract ALL fields provided, even if multiple values are given in one message!
   
   🎯 EXAMPLES OF MULTIPLE EXTRACTIONS:
   - "My name is Sara Chocron" → extractedData=[{field:"firstName", value:"Sara"}, {field:"lastName", value:"Chocron"}]
   - "(954) 123-2212, and sss@thegreatsara.com" → extractedData=[{field:"phone", value:"(954) 123-2212"}, {field:"email", value:"sss@thegreatsara.com"}]
   - "Monday at 7pm" → extractedData=[{field:"preferredDate", value:"Monday"}, {field:"preferredTime", value:"7pm"}]
   - "David, david@example.com" → extractedData=[{field:"firstName", value:"David"}, {field:"email", value:"david@example.com"}]
   - "Evening" or "Evening, mostly" or "evenings work best" → extractedData=[{field:"preferredTime", value:"evening"}]
   - "Morning" or "Morning person" or "early mornings" → extractedData=[{field:"preferredTime", value:"morning"}]
   - "After work" or "after 5" or "nights" → extractedData=[{field:"preferredTime", value:"evening"}]
   
   ⚠️ When answering "morning or evening?", a single word like "Evening" or "Morning" IS the preferredTime!
   
   🚨 MEGA EXTRACTION EXAMPLE (user provides MANY fields at once):
   User: "Peterson, my phone is (954) 123-2112, email sara@example.com. I want to lose 30 lbs, currently at 183, for my wedding on 03/03/26. Bodyfat is 35%, height 5'4"
   → extractedData=[
       {field:"lastName", value:"Peterson"},
       {field:"phone", value:"(954) 123-2112"},
       {field:"email", value:"sara@example.com"},
       {field:"primaryGoal", value:"weight loss"},
       {field:"weight", value:"183 lbs"},
       {field:"motivationReason", value:"wedding"},
       {field:"timeline", value:"03/03/26"},
       {field:"bodyFatPercentage", value:"35%"},
       {field:"height", value:"5'4\""}
     ]
   ⚠️ EXTRACT EVERY SINGLE FIELD - do NOT skip any!
   
   🏋️ FITNESS-SPECIFIC EXTRACTIONS:
   - "I want to lose weight" or "drop 30 lbs" or "get fit" → [{field:"primaryGoal", value:"weight loss"}]
   - "build muscle" or "get stronger" or "bulk up" → [{field:"primaryGoal", value:"muscle building"}]
   - "tone up" or "get toned" → [{field:"primaryGoal", value:"toning"}]
   - "improve endurance" or "run a marathon" → [{field:"primaryGoal", value:"endurance training"}]
   🎯 MOTIVATION EXTRACTION - TWO FIELDS:
   1. motivationReason: Their actual words/freeform (e.g., "bodybuilding competition", "my wedding in June")
   2. motivationCategories: Comma-separated categories from: aesthetic, health, performance, lifestyle, mental
   
   CATEGORY DEFINITIONS:
   - aesthetic: appearance-driven (wedding, beach, photos, look good, revenge body, confidence in appearance)
   - health: medical/wellness (doctor, diabetes, heart, cholesterol, energy, live longer, lose weight for health)
   - performance: athletic/competition (compete, contest, sports, marathon, stronger, faster, athlete, bodybuilding)
   - lifestyle: daily function/quality of life (kids, family, stairs, mobility, keep up with, independence)
   - mental: psychological wellbeing (stress, anxiety, depression, mental health, feel better emotionally)
   
   ⚠️ A motivation can have MULTIPLE categories! Extract ALL that apply.
   
   EXAMPLES:
   - "I want to compete in a bodybuilding contest" → 
     [{field:"motivationReason", value:"bodybuilding contest"}, {field:"motivationCategories", value:"performance,aesthetic"}]
   - "my wedding is coming up" → 
     [{field:"motivationReason", value:"wedding"}, {field:"motivationCategories", value:"aesthetic"}]
   - "doctor said I need to lose weight and I want to look good" → 
     [{field:"motivationReason", value:"doctor recommendation and appearance"}, {field:"motivationCategories", value:"health,aesthetic"}]
   - "want more energy to keep up with my kids" → 
     [{field:"motivationReason", value:"energy for kids"}, {field:"motivationCategories", value:"health,lifestyle"}]
   - "girlfriend broke up with me" or "revenge body" → 
     [{field:"motivationReason", value:"breakup"}, {field:"motivationCategories", value:"aesthetic,mental"}]
   - "stress relief" or "mental health" → 
     [{field:"motivationReason", value:"stress relief"}, {field:"motivationCategories", value:"mental"}]
   - "training for a marathon" → 
     [{field:"motivationReason", value:"marathon"}, {field:"motivationCategories", value:"performance"}]
   - "want to be around for my grandkids" → 
     [{field:"motivationReason", value:"family longevity"}, {field:"motivationCategories", value:"lifestyle,health"}]
   ⚠️⚠️⚠️ CRITICAL - TIMELINE vs PREFERRED DATE DISTINCTION ⚠️⚠️⚠️
   
   timeline = When user wants to ACHIEVE their FITNESS GOAL (competition date, wedding date, etc.)
   preferredDate = When user wants to SCHEDULE their first SESSION/CLASS at the gym
   
   🎯 CONTEXT MATTERS! Look at what was asked:
   - If asked "when do you want to achieve this?" or "what's your target date?" → timeline
   - If asked "when can you come in?" or "what day works?" → preferredDate
   
   ✅ EXTRACT AS timeline (GOAL DEADLINE):
   - "June 13th" (when answering about goal timeline) → [{field:"timeline", value:"June 13th"}]
   - "in 3 months" or "by March" → [{field:"timeline", value:"3 months"}]
   - "by summer" or "before summer" → [{field:"timeline", value:"summer"}]
   - "my wedding is June 15th" → [{field:"timeline", value:"June 15th"}]
   - "the competition is in June" → [{field:"timeline", value:"June"}]
   - "I want to be ready by December" → [{field:"timeline", value:"December"}]
   - "6 months from now" → [{field:"timeline", value:"6 months"}]
   
   ✅ EXTRACT AS preferredDate (SESSION SCHEDULING):
   - "Monday" or "this Monday" (when scheduling a session) → [{field:"preferredDate", value:"Monday"}]
   - "next Tuesday" → [{field:"preferredDate", value:"next Tuesday"}]
   - "tomorrow" → [{field:"preferredDate", value:"tomorrow"}]
   
   🔑 KEY RULE: If user provides a DATE in response to a timeline question, extract as timeline!
   If the conversation is about scheduling their first visit, extract as preferredDate.
   
   - "I'm 5'4" or "5 foot 4" → [{field:"height", value:"5'4\""}]
   
   ⚠️⚠️⚠️ CRITICAL - WEIGHT EXTRACTION RULES ⚠️⚠️⚠️
   The "weight" field is for CURRENT weight ONLY. NEVER extract goal/target weight as "weight".
   
   ✅ EXTRACT AS weight (CURRENT weight indicators):
   - "I weigh 183 lbs" → [{field:"weight", value:"183 lbs"}]
   - "I'm currently 183" → [{field:"weight", value:"183 lbs"}]
   - "My weight is 183" → [{field:"weight", value:"183 lbs"}]
   - "it's 183lbs" (when asked about current weight) → [{field:"weight", value:"183 lbs"}]
   - "I'm at 183 right now" → [{field:"weight", value:"183 lbs"}]
   
   ❌ DO NOT EXTRACT AS weight (GOAL/TARGET weight - ignore these):
   - "I want to weigh 153" → DO NOT extract (this is a goal, not current)
   - "I'd like to be 153lbs" → DO NOT extract (this is a goal)
   - "goal weight is 150" → DO NOT extract (explicitly a goal)
   - "I want to get to 150" → DO NOT extract (future desire)
   - "target is 153" → DO NOT extract (explicitly a target)
   - "hoping to reach 150" → DO NOT extract (aspiration)
   
   🔑 KEY DISTINCTION: If the user says "I want to...", "I'd like to...", "goal is...", "target is...", "hoping to...", 
   that is NOT their current weight - DO NOT extract it as the weight field!
   
   🎯 PRIORITY: ALWAYS prioritize workflow data extraction FIRST, especially for scheduling (preferredDate, preferredTime)
   - If user says "7:30 it is. What's the address?" → Extract preferredTime="7:30" FIRST (PRIORITY)
   - If user asks a question AFTER providing data, the workflow data is MORE IMPORTANT than the question
   
   EXTRACTION RULES:
   - ✅ "My name is David" → [{field:"firstName", value:"David"}]
   - ✅ "david@example.com" → [{field:"email", value:"david@example.com"}]
   - ✅ "555-1234" or "(954) 632-1122" → [{field:"phone", value:"555-1234"}] or [{field:"phone", value:"(954) 632-1122"}]
   - ✅ "7:30" or "7:30pm" or "730" → [{field:"preferredTime", value:"7:30pm"}]
   - ✅ "Monday" or "next Monday" → [{field:"preferredDate", value:"Monday"}]
   - ✅ "evening" or "evenings" or "after work" or "Evening, mostly" or "evening mostly" → [{field:"preferredTime", value:"evening"}]
   - ✅ "morning" or "mornings" or "early" or "Morning, mostly" → [{field:"preferredTime", value:"morning"}]
   - ✅ "afternoon" or "afternoons" → [{field:"preferredTime", value:"afternoon"}]
   - ✅ "nights" or "mostly nights" or "at night" or "night time" → [{field:"preferredTime", value:"evening"}]
   - ✅ "later than 6" or "after 7" or "past 6" → [{field:"preferredTime", value:"later than 6"}] or [{field:"preferredTime", value:"after 7"}]
   
   ⚠️ IMPORTANT: When user answers a "morning or evening?" question with just "Evening" or "Morning", 
   that IS their preferredTime answer - extract it! Don't confuse with greetings.
   
   🚫 DO NOT EXTRACT preferredTime FROM REJECTIONS:
   - "I can't do 6" or "6 is too early" → DO NOT extract preferredTime (they're rejecting, not providing)
   - "that doesn't work" or "none of those work" → DO NOT extract preferredTime
   - "too early" or "too late" → DO NOT extract preferredTime (it's a rejection, not a new preference)
   - Keep the EXISTING preferredTime value when user rejects a specific time!
   
${(0, date_normalizer_js_1.buildDateNormalizationPrompt)({ businessContext: 'fitness' })}

   - ❌ "What's your phone?" → extractedData=null (they're ASKING, not providing)
   - ❌ "Can I give you my number?" → extractedData=null (asking permission, not providing yet)
   - ❌ "I'll send my email later" → extractedData=null (they haven't provided it yet)
   - ❌ "I think by phone" → extractedData=null (stating a preference, not providing data)
   - ❌ "Probably email" → extractedData=null (stating a preference, not providing data)
   
   🔄 ERROR RECOVERY: ONLY if user EXPLICITLY says their contact info was WRONG/INCORRECT:
   - "wrong number" or "that's not my number" or "incorrect number" → [{field:"wrong_phone", value:"<previous phone from ALREADY CAPTURED DATA>"}]
   - "wrong email" or "that's not my email" or "incorrect email" → [{field:"wrong_email", value:"<previous email from ALREADY CAPTURED DATA>"}]
   - "didn't get the text" or "didn't receive" → [{field:"wrong_phone", value:"<previous phone>"}] (implies wrong number)
   
   🚨🚨🚨 CRITICAL: DO NOT TRIGGER ERROR RECOVERY FOR CONFIRMATIONS! 🚨🚨🚨
   ✅ POSITIVE CONFIRMATIONS - DO NOT extract wrong_phone or wrong_email:
   - "got it" or "got them" or "got 'em" → extractedData=null (CONFIRMATION!)
   - "confirmed" or "confirmed both" → extractedData=null (CONFIRMATION!)
   - "received it" or "verified" → extractedData=null (CONFIRMATION!)
   - "yes" or "yep" or "yeah" or "correct" → extractedData=null (CONFIRMATION!)
   - "we're good" or "all good" or "looks good" → extractedData=null (CONFIRMATION!)
   - "no no no... I confirmed" → extractedData=null (They're CORRECTING you, saying they DID confirm!)
   
   The word "no" at the start doesn't mean error! Check the FULL context:
   - "no, that's wrong" → ERROR (they're saying data is wrong)
   - "no no, I already confirmed" → CONFIRMATION (they're saying they already confirmed it's correct)
   
   🚨🚨🚨 CRITICAL RULE FOR LONG MESSAGES 🚨🚨🚨
   If the user provides MULTIPLE pieces of information in ONE message, you MUST extract ALL of them.
   Do NOT stop after extracting 2-3 fields. Extract EVERY recognizable field.
   A single message can have 10+ extractions - that's expected and correct!
   
3. detectedWorkflowIntent & extractedValue: DEPRECATED - kept for backward compatibility. Use extractedData instead

3. extractedValue: If detectedWorkflowIntent is not null, extract the actual value provided. Examples:
   - If user says "My name is David" → detectedWorkflowIntent="firstName", extractedValue="David"

4. companyInfoRequested: If asking about company, list what info: ["hours", "pricing", "plans", "promotions", "location", "address", "services", etc.] Otherwise null.
   - Use "pricing" for price/cost questions
   - Use "promotions" for deals/discounts/specials questions
   - Use "plans" for membership/package details
   - Use "address" or "location" for "where are you", "what's the address", "where is the gym", etc.

5. requiresDeepContext: True if query seems to reference something from >10 messages ago.

6. conversationComplexity: "simple", "moderate", or "complex"

7. detectedEmotionalTone: "positive", "neutral", "negative", "frustrated", "urgent", or null

8. interestLevel: Rate user's interest level 1-5 based on their message:
   - 1 = Disengaged, cold, dismissive ("whatever", "I guess", "not really")
   - 2 = Low interest, skeptical ("maybe", "we'll see", short responses)
   - 3 = Neutral, curious ("tell me more", asking questions)
   - 4 = Interested, engaged (asking specific questions, sharing details willingly)
   - 5 = Highly engaged, eager ("I'm so excited!", "Can't wait!", enthusiastic)

9. conversionLikelihood: Estimate likelihood user will convert (0.0-1.0):
   - 0.0-0.2 = Very unlikely (cold, resistant, no buying signals)
   - 0.3-0.4 = Unlikely (skeptical, many objections)
   - 0.5-0.6 = Possible (curious but not committed)
   - 0.7-0.8 = Likely (specific questions, urgency, positive signals)
   - 0.9-1.0 = Very likely (ready to commit, asking "how do I sign up?")
   
   BUYING SIGNALS that increase likelihood:
   - Asking about pricing, schedules, availability
   - Providing personal details willingly
   - Expressing urgency ("need to start soon")
   - Specific goals with timelines
   - Positive emotional tone

10. languageProfile: Analyze user's communication style:
    - formality: 1-5 (1=very casual/slang "yo wassup", 3=neutral, 5=very formal "Good afternoon, I would like to inquire...")
    - hypeTolerance: 1-5 (1=prefers calm/factual, 3=neutral, 5=loves energy/hype/exclamation marks!)
    - emojiUsage: 0-5 (0=no emojis, 5=heavy emoji usage 🔥💪😊)
    - language: ISO code (e.g., "en", "es", "fr", "pt")

RETURN ONLY VALID JSON.`;
    }
    /**
     * Detect likely gender from first name for gender-aware language
     */
    detectGenderFromName(firstName) {
        if (!firstName)
            return null;
        const nameLower = firstName.toLowerCase();
        // Common female name patterns
        const femalePatterns = [
            'sara', 'sarah', 'maria', 'jessica', 'jennifer', 'amanda', 'ashley', 'emily',
            'melissa', 'michelle', 'stephanie', 'nicole', 'christina', 'laura', 'amy',
            'rachel', 'hannah', 'samantha', 'brittany', 'rebecca', 'anna', 'lisa',
            'elizabeth', 'katherine', 'karen', 'susan', 'nancy', 'betty', 'helen',
            'linda', 'barbara', 'patricia', 'angela', 'sandra', 'donna', 'carol'
        ];
        // Common male name patterns
        const malePatterns = [
            'david', 'michael', 'john', 'robert', 'william', 'james', 'christopher',
            'joseph', 'charles', 'thomas', 'daniel', 'matthew', 'anthony', 'mark',
            'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin',
            'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey',
            'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen'
        ];
        // Check for exact matches or starts-with
        if (femalePatterns.some(pattern => nameLower.startsWith(pattern))) {
            return 'female';
        }
        if (malePatterns.some(pattern => nameLower.startsWith(pattern))) {
            return 'male';
        }
        return null; // Unknown/ambiguous
    }
    /**
     * Get gender-aware language rule based on channelState
     * Returns appropriate instruction for LLM based on known/unknown gender
     */
    getGenderLanguageRule(channelState) {
        const capturedGender = channelState?.capturedData?.gender;
        const capturedFirstName = channelState?.capturedData?.firstName;
        if (capturedGender === 'female') {
            return `🎭 GENDER: This user (${capturedFirstName || 'unknown'}) is FEMALE. Use: "queen", "sis", "girl", "lady". NEVER use "bro", "dude", "king", "my man".`;
        }
        else if (capturedGender === 'male') {
            return `🎭 GENDER: This user (${capturedFirstName || 'unknown'}) is MALE. Use: "bro", "dude", "king", "my man". NEVER use "queen", "sis", "girl", "lady".`;
        }
        else {
            return `🎭 GENDER: Unknown - use GENDER-NEUTRAL terms only: "friend", "champion", "warrior", "boss". NEVER assume male (no "bro", "dude", "my man", "king").`;
        }
    }
    /**
     * Build system prompt for conversational response
     */
    buildSystemPrompt(goalResult, preExtractedData, intentDetectionResult, channelState) {
        const verbosity = this.persona?.personalityTraits?.verbosity || 5;
        const verbosityRule = verbosity_config_js_1.VerbosityHelper.getSystemPromptRule(verbosity);
        let systemPrompt = this.persona.systemPrompt + verbosityRule;
        // Add acknowledgment for extracted data
        if (preExtractedData && Object.keys(preExtractedData).length > 0) {
            let dataAcknowledgment = `\n✅ USER JUST PROVIDED:\n`;
            for (const [field, value] of Object.entries(preExtractedData)) {
                dataAcknowledgment += `- ${field}: ${value}\n`;
            }
            dataAcknowledgment += `\nAcknowledge this enthusiastically and naturally in your response.\n\n`;
            systemPrompt = dataAcknowledgment + systemPrompt;
        }
        // Convert first-person to second-person if needed
        const { PronounConverter } = require('./pronoun-converter.js');
        if (PronounConverter.isFirstPerson(systemPrompt)) {
            systemPrompt = PronounConverter.firstToSecondPerson(systemPrompt);
        }
        // Add gender-aware language rules with captured gender info
        // PRIORITY: channelState.capturedData (persistent) > current turn extraction > preExtractedData
        const capturedGender = channelState?.capturedData?.gender || goalResult?.extractedInfo?.['gender'] || preExtractedData?.gender;
        const capturedFirstName = channelState?.capturedData?.firstName || goalResult?.extractedInfo?.['firstName'];
        // Log gender context for debugging
        if (capturedGender) {
            console.log(`🎭 Gender context found: ${capturedGender} (for ${capturedFirstName || 'unknown'})`);
        }
        let genderAwareRule = `

🎭 GENDER-AWARE LANGUAGE (CRITICAL):`;
        if (capturedGender === 'female') {
            const nameRef = capturedFirstName ? ` (${capturedFirstName})` : '';
            genderAwareRule += `
- ✅ THIS USER${nameRef} IS FEMALE - Use: "queen", "miss", "lady", "sis", "girl"
- ❌ NEVER use: "bro", "dude", "my man", "king", "homie" (those are for males only)
- ⚠️ CRITICAL: Do NOT switch to male terms mid-conversation!`;
        }
        else if (capturedGender === 'male') {
            const nameRef = capturedFirstName ? ` (${capturedFirstName})` : '';
            genderAwareRule += `
- ✅ THIS USER${nameRef} IS MALE - Use: "bro", "dude", "my man", "king", "homie"
- ❌ NEVER use: "queen", "miss", "lady", "sis", "girl" (those are for females only)
- ⚠️ CRITICAL: Do NOT switch to female terms mid-conversation!`;
        }
        else {
            genderAwareRule += `
- If the user's name suggests they are female (Sara, Maria, Jessica, Amy, etc.) OR they've indicated they're a woman/lady, use: "queen", "miss", "lady", "sis", "girl"
- If the user's name suggests they are male (David, Mike, John, Chris, etc.) OR they've indicated they're a man/dude/guy, use: "bro", "dude", "my man", "king", "homie"
- If unclear or no name yet, use gender-neutral: "friend", "champion", "warrior", "boss"`;
        }
        genderAwareRule += `
- Once you know their gender, stay consistent throughout the conversation
- NEVER assume everyone is male by default

`;
        systemPrompt += genderAwareRule;
        // Add selective company info if requested
        if (intentDetectionResult?.companyInfoRequested && intentDetectionResult.companyInfoRequested.length > 0) {
            console.log(`🏢 Injecting selective company info: ${intentDetectionResult.companyInfoRequested.join(', ')}`);
            let companyInfoSection = '\n\n📋 COMPANY INFORMATION TO REFERENCE:\n';
            for (const requestedInfo of intentDetectionResult.companyInfoRequested) {
                if (requestedInfo === 'pricing' || requestedInfo === 'plans') {
                    const pricing = this.companyInfo?.pricing;
                    if (pricing?.plans && pricing.plans.length > 0) {
                        companyInfoSection += '\n💰 PRICING & MEMBERSHIP PLANS:\n';
                        for (const plan of pricing.plans) {
                            companyInfoSection += `\n  ${plan.popular ? '⭐ ' : ''}${plan.name} - ${plan.price}\n`;
                            companyInfoSection += `  ${plan.description || ''}\n`;
                            companyInfoSection += `  Features:\n`;
                            for (const feature of plan.features) {
                                companyInfoSection += `    • ${feature}\n`;
                            }
                        }
                        if (pricing.customPricingAvailable) {
                            companyInfoSection += '\n  ℹ️ Custom pricing available for corporate groups and families\n';
                        }
                    }
                }
                if (requestedInfo === 'promotions') {
                    const promotions = this.companyInfo?.promotions;
                    if (promotions && promotions.length > 0) {
                        companyInfoSection += '\n🎁 CURRENT PROMOTIONS:\n';
                        const now = new Date();
                        for (const promo of promotions) {
                            const validUntil = new Date(promo.validUntil);
                            if (validUntil > now) { // Only show active promotions
                                companyInfoSection += `\n  🔥 ${promo.title}\n`;
                                if (promo.urgencyMessage) {
                                    companyInfoSection += `  ⏰ ${promo.urgencyMessage}\n`;
                                }
                                companyInfoSection += `  ${promo.description}\n`;
                                companyInfoSection += `  Valid until: ${validUntil.toLocaleDateString()}\n`;
                                if (promo.conditions && promo.conditions.length > 0) {
                                    companyInfoSection += `  Conditions:\n`;
                                    for (const condition of promo.conditions) {
                                        companyInfoSection += `    • ${condition}\n`;
                                    }
                                }
                            }
                        }
                    }
                }
                if (requestedInfo === 'hours') {
                    const hours = this.companyInfo?.businessHours;
                    if (hours) {
                        companyInfoSection += '\n🕐 BUSINESS HOURS:\n';
                        const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                        for (const day of daysOfWeek) {
                            const dayHours = hours[day];
                            if (dayHours && dayHours.length > 0) {
                                const formattedHours = dayHours.map((slot) => `${slot.from} - ${slot.to}`).join(', ');
                                companyInfoSection += `  ${day.charAt(0).toUpperCase() + day.slice(1)}: ${formattedHours}\n`;
                            }
                        }
                    }
                }
                if (requestedInfo === 'location' || requestedInfo === 'address') {
                    const address = this.companyInfo?.address;
                    if (address) {
                        companyInfoSection += '\n📍 LOCATION:\n';
                        companyInfoSection += `  ${address.street || ''}\n`;
                        companyInfoSection += `  ${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}\n`;
                    }
                }
                if (requestedInfo === 'services') {
                    const services = this.companyInfo?.services;
                    if (services && services.length > 0) {
                        companyInfoSection += '\n🏋️ SERVICES OFFERED:\n';
                        for (const service of services) {
                            companyInfoSection += `  • ${service}\n`;
                        }
                    }
                }
            }
            companyInfoSection += '\n⚠️ CRITICAL: Use ONLY the information above. Do NOT make up details, prices, or dates.\n\n';
            systemPrompt += companyInfoSection;
        }
        // Replace template variables FIRST
        if (this.companyInfo?.name) {
            systemPrompt = systemPrompt.replace(/\{\{companyName\}\}/g, this.companyInfo.name);
        }
        // Add CRITICAL anti-hallucination rules at the VERY END (last thing LLM sees)
        const antiHallucinationRules = `

═══════════════════════════════════════════════════════════════
🚨🚨🚨 CRITICAL - ANTI-HALLUCINATION RULES (MUST FOLLOW) 🚨🚨🚨
═══════════════════════════════════════════════════════════════

1. COMPANY NAME - THIS IS THE MOST IMPORTANT RULE:
   ✅ YOU ARE WORKING FOR: ${this.companyInfo?.name || '[COMPANY NAME NOT SET]'}
   ❌ THIS IS NOT Planet Fitness, LA Fitness, Gold's Gym, Equinox, or ANY other company
   ✅ EVERY TIME you mention the company, say: "${this.companyInfo?.name || 'we'}"
   ❌ If you EVER say "Planet Fitness" or any other gym name, YOU HAVE COMPLETELY FAILED
   ✅ Before sending your response, double-check you used "${this.companyInfo?.name || 'we'}"

2. SERVICES OFFERED:
   ${this.companyInfo?.services && this.companyInfo.services.length > 0
            ? `✅ We ONLY offer:\n${this.companyInfo.services.map(s => `     • ${s}`).join('\n')}`
            : '⚠️ Service list not available. Do NOT make up services.'}
   ❌ NEVER mention: jiu-jitsu, self-defense, boxing, martial arts, yoga, pilates, spin classes (unless listed above)
   ❌ NEVER mention: virtual training, online classes, remote coaching (unless listed above)

3. PRICING:
   ❌ NEVER make up prices like "$99/month", "$49/month", "$25 sign-up fee"
   ✅ ONLY share prices if they appear in a PRICING & MEMBERSHIP PLANS section above
   ✅ If no pricing shown, say: "Let me connect you with our team for pricing details"

4. BUSINESS HOURS:
   ❌ NEVER say "24/7", "open anytime", "always open"
   ✅ ONLY reference hours if shown in BUSINESS HOURS section above

5. PROMOTIONS:
   ❌ NEVER make up promotions like "50% off your first month"
   ✅ ONLY mention promotions if shown in CURRENT PROMOTIONS section above

⚠️⚠️⚠️ READ YOUR RESPONSE BEFORE SENDING ⚠️⚠️⚠️
- Did you say "${this.companyInfo?.name || 'we'}" (not Planet Fitness)?
- Did you only mention services from the list?
- Did you make up any prices or promotions?
═══════════════════════════════════════════════════════════════

`;
        systemPrompt += antiHallucinationRules;
        return systemPrompt;
    }
}
exports.MessageProcessor = MessageProcessor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVzc2FnZS1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL21lc3NhZ2UtcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7OztHQU9HOzs7QUFFSCx3Q0FBcUQ7QUFFckQsNkNBQWdEO0FBRWhELHVEQUFnRjtBQUNoRiw2QkFBd0I7QUFJeEIsK0RBQXdEO0FBQ3hELG1FQUFxRjtBQUVyRiw2REFBb0U7QUFHcEUsbURBQW1EO0FBQ25ELE1BQU0sa0JBQWtCLEdBQUcsT0FBQyxDQUFDLE1BQU0sQ0FBQztJQUNsQyxTQUFTLEVBQUUsT0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLDZDQUE2QyxDQUFDO0NBQzlGLENBQUMsQ0FBQztBQUVILGtDQUFrQztBQUNsQyxNQUFNLHFCQUFxQixHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7SUFDckMsYUFBYSxFQUFFLE9BQUMsQ0FBQyxJQUFJLENBQUM7UUFDcEIsc0JBQXNCO1FBQ3RCLHVCQUF1QjtRQUN2QixzQkFBc0I7UUFDdEIsV0FBVztRQUNYLFlBQVk7UUFDWixrQkFBa0I7UUFDbEIsU0FBUztLQUNWLENBQUMsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLENBQUM7SUFFeEQseUVBQXlFO0lBQ3pFLGFBQWEsRUFBRSxPQUFDLENBQUMsS0FBSyxDQUFDLE9BQUMsQ0FBQyxNQUFNLENBQUM7UUFDOUIsS0FBSyxFQUFFLE9BQUMsQ0FBQyxJQUFJLENBQUM7WUFDWixPQUFPO1lBQ1AsT0FBTztZQUNQLFdBQVc7WUFDWCxVQUFVO1lBQ1YsUUFBUTtZQUNSLGFBQWE7WUFDYixrQkFBa0I7WUFDbEIsc0JBQXNCO1lBQ3RCLFVBQVU7WUFDVixRQUFRO1lBQ1IsUUFBUTtZQUNSLG1CQUFtQjtZQUNuQixVQUFVO1lBQ1YsbUJBQW1CO1lBQ25CLHFC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LEVBQUUsQ0FBQztZQUMzQixZQUFZLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JGLENBQUM7UUFFRCw4RUFBOEU7UUFDOUUsTUFBTSxzQkFBc0IsR0FBRzs7Ozs7Ozs0QkFPUCxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSx3QkFBd0I7O2lEQUU3QixJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSxJQUFJOzs0REFFbkIsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLElBQUksSUFBSTs7O0tBR3JGLElBQUksQ0FBQyxXQUFXLEVBQUUsUUFBUSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQ2xFLENBQUMsQ0FBQyxxQkFBcUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNyRixDQUFDLENBQUMseURBQXlEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7aUJBa0IvQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksSUFBSSxJQUFJOzs7OztDQUs5QyxDQUFDO1FBQ0UsWUFBWSxJQUFJLHNCQUFzQixDQUFDO1FBRXZDLE9BQU8sWUFBWSxDQUFDO0lBQ3RCLENBQUM7Q0FDRjtBQTd2REQsNENBNnZEQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTWVzc2FnZSBQcm9jZXNzb3JcbiAqIFxuICogSGFuZGxlcyB0aGUgdGhyZWUtcmVxdWVzdCBhcmNoaXRlY3R1cmUgZm9yIHByb2Nlc3NpbmcgdXNlciBtZXNzYWdlczpcbiAqIDEuIEludGVudCBEZXRlY3Rpb24gJiBDb250ZXh0IEFuYWx5c2lzXG4gKiAyLiBDb252ZXJzYXRpb25hbCBSZXNwb25zZSBHZW5lcmF0aW9uXG4gKiAzLiBGb2xsb3ctVXAgR2VuZXJhdGlvbiAoVmVyaWZpY2F0aW9uIG9yIEdvYWwgUXVlc3Rpb24pXG4gKi9cblxuaW1wb3J0IHsgQ2hhdEJlZHJvY2tDb252ZXJzZSB9IGZyb20gJ0BsYW5nY2hhaW4vYXdzJztcbmltcG9ydCB7IENvbnZlcnNhdGlvbkNoYWluIH0gZnJvbSAnbGFuZ2NoYWluL2NoYWlucyc7XG5pbXBvcnQgeyBCdWZmZXJNZW1vcnkgfSBmcm9tICdsYW5nY2hhaW4vbWVtb3J5JztcbmltcG9ydCB7IFByb21wdFRlbXBsYXRlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL3Byb21wdHMnO1xuaW1wb3J0IHsgQmFzZU1lc3NhZ2UsIEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudFBlcnNvbmEgfSBmcm9tICcuLi9jb25maWcvcGVyc29uYXMuanMnO1xuaW1wb3J0IHR5cGUgeyBDb21wYW55SW5mbyB9IGZyb20gJy4vcGVyc29uYS1zZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfSBmcm9tICcuL2dvYWwtb3JjaGVzdHJhdG9yLmpzJztcbmltcG9ydCB7IFZlcmJvc2l0eUhlbHBlciB9IGZyb20gJy4vdmVyYm9zaXR5LWNvbmZpZy5qcyc7XG5pbXBvcnQgeyBHb2FsQ29uZmlnSGVscGVyLCB0eXBlIEVmZmVjdGl2ZUdvYWxDb25maWcgfSBmcm9tICcuL2dvYWwtY29uZmlnLWhlbHBlci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UYWdQcm9jZXNzb3IgfSBmcm9tICcuL2FjdGlvbi10YWctcHJvY2Vzc29yLmpzJztcbmltcG9ydCB7IGJ1aWxkRGF0ZU5vcm1hbGl6YXRpb25Qcm9tcHQgfSBmcm9tICcuL2RhdGUtbm9ybWFsaXplci5qcyc7XG5pbXBvcnQgeyBFdmVudEJyaWRnZVNlcnZpY2UsIHR5cGUgTExNVXNhZ2VFdmVudCB9IGZyb20gJy4vZXZlbnRicmlkZ2UuanMnO1xuXG4vLyBab2Qgc2NoZW1hIGZvciBzZW50ZW5jZSBsaXN0IChzdHJ1Y3R1cmVkIG91dHB1dClcbmNvbnN0IFNlbnRlbmNlTGlzdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc2VudGVuY2VzOiB6LmFycmF5KHouc3RyaW5nKCkubWluKDEpKS5kZXNjcmliZSgnQW4gYXJyYXkgb2YgY29tcGxldGUsIHN0YW5kYWxvbmUgc2VudGVuY2VzLicpLFxufSk7XG5cbi8vIFpvZCBzY2hlbWEgZm9yIGludGVudCBkZXRlY3Rpb25cbmNvbnN0IEludGVudERldGVjdGlvblNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcHJpbWFyeUludGVudDogei5lbnVtKFtcbiAgICBcImNvbXBhbnlfaW5mb19yZXF1ZXN0XCIsXG4gICAgXCJ3b3JrZmxvd19kYXRhX2NhcHR1cmVcIixcbiAgICBcImdlbmVyYWxfY29udmVyc2F0aW9uXCIsXG4gICAgXCJvYmplY3Rpb25cIixcbiAgICBcInNjaGVkdWxpbmdcIixcbiAgICBcImVuZF9jb252ZXJzYXRpb25cIixcbiAgICBcInVua25vd25cIlxuICBdKS5kZXNjcmliZShcIlRoZSBwcmltYXJ5IGludGVudCBvZiB0aGUgdXNlcidzIG1lc3NhZ2UuXCIpLFxuICBcbiAgLy8gTkVXOiBBcnJheSBvZiBleHRyYWN0ZWQgZGF0YSAoc3VwcG9ydHMgbXVsdGlwbGUgZmllbGRzIGluIG9uZSBtZXNzYWdlKVxuICBleHRyYWN0ZWREYXRhOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICBmaWVsZDogei5lbnVtKFtcbiAgICAgIFwiZW1haWxcIixcbiAgICAgIFwicGhvbmVcIixcbiAgICAgIFwiZmlyc3ROYW1lXCIsXG4gICAgICBcImxhc3ROYW1lXCIsXG4gICAgICBcImdlbmRlclwiLFxuICAgICAgXCJwcmltYXJ5R29hbFwiLFxuICAgICAgXCJtb3RpdmF0aW9uUmVhc29uXCIsXG4gICAgICBcIm1vdGl2YXRpb25DYXRlZ29yaWVzXCIsXG4gICAgICBcInRpbWVsaW5lXCIsXG4gICAgICBcImhlaWdodFwiLFxuICAgICAgXCJ3ZWlnaHRcIixcbiAgICAgIFwiYm9keUZhdFBlcmNlbnRhZ2VcIixcbiAgICAgIFwiaW5qdXJpZXNcIixcbiAgICAgIFwibWVkaWNhbENvbmRpdGlvbnNcIixcbiAgICAgIFwicGh5c2ljYWxMaW1pdGF0aW9uc1wiLFxuICAgICAgXCJkb2N0b3JDbGVhcmFuY2VcIixcbiAgICAgIFwicHJlZmVycmVkRGF0ZVwiLFxuICAgICAgXCJwcmVmZXJyZWRUaW1lXCIsXG4gICAgICBcIm5vcm1hbGl6ZWREYXRlVGltZVwiLFxuICAgICAgXCJ3cm9uZ19waG9uZVwiLFxuICAgICAgXCJ3cm9uZ19lbWFpbFwiXG4gICAgXSksXG4gICAgdmFsdWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoXCJUaGUgYWN0dWFsIGV4dHJhY3RlZCB2YWx1ZSAoZS5nLiwgJ1NhcmEnLCAnZGF2aWRAZXhhbXBsZS5jb20nLCAnKDk1NCkgMTIzLTQ1NjcnKVwiKVxuICB9KSkubnVsbGFibGUoKS5kZXNjcmliZShcIkFycmF5IG9mIGV4dHJhY3RlZCB3b3JrZmxvdyBkYXRhLiBJZiB1c2VyIHByb3ZpZGVzIG11bHRpcGxlIHBpZWNlcyBvZiBkYXRhIChlLmcuLCAnU2FyYSBDaG9jcm9uJyBvciAnZW1haWwgYW5kIHBob25lJyksIGV4dHJhY3QgQUxMIG9mIHRoZW0gYXMgc2VwYXJhdGUgb2JqZWN0cy4gT3RoZXJ3aXNlLCBudWxsLlwiKSxcbiAgXG4gIC8vIERFUFJFQ0FURUQ6IEtlZXAgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgZGV0ZWN0ZWRXb3JrZmxvd0ludGVudDogei51bmlvbihbXG4gICAgei5saXRlcmFsKFwiZW1haWxcIiksXG4gICAgei5saXRlcmFsKFwicGhvbmVcIiksXG4gICAgei5saXRlcmFsKFwiZmlyc3ROYW1lXCIpLFxuICAgIHoubGl0ZXJhbChcImxhc3ROYW1lXCIpLFxuICAgIHoubGl0ZXJhbChcImdlbmRlclwiKSxcbiAgICB6LmxpdGVyYWwoXCJwcmltYXJ5R29hbFwiKSxcbiAgICB6LmxpdGVyYWwoXCJtb3RpdmF0aW9uUmVhc29uXCIpLFxuICAgIHoubGl0ZXJhbChcIm1vdGl2YXRpb25DYXRlZ29yaWVzXCIpLFxuICAgIHoubGl0ZXJhbChcInRpbWVsaW5lXCIpLFxuICAgIHoubGl0ZXJhbChcImhlaWdodFwiKSxcbiAgICB6LmxpdGVyYWwoXCJ3ZWlnaHRcIiksXG4gICAgei5saXRlcmFsKFwiYm9keUZhdFBlcmNlbnRhZ2VcIiksXG4gICAgei5saXRlcmFsKFwiaW5qdXJpZXNcIiksXG4gICAgei5saXRlcmFsKFwibWVkaWNhbENvbmRpdGlvbnNcIiksXG4gICAgei5saXRlcmFsKFwicGh5c2ljYWxMaW1pdGF0aW9uc1wiKSxcbiAgICB6LmxpdGVyYWwoXCJkb2N0b3JDbGVhcmFuY2VcIiksXG4gICAgei5saXRlcmFsKFwicHJlZmVycmVkRGF0ZVwiKSxcbiAgICB6LmxpdGVyYWwoXCJwcmVmZXJyZWRUaW1lXCIpLFxuICAgIHoubGl0ZXJhbChcIm5vcm1hbGl6ZWREYXRlVGltZVwiKSxcbiAgICB6LmxpdGVyYWwoXCJ3cm9uZ19waG9uZVwiKSxcbiAgICB6LmxpdGVyYWwoXCJ3cm9uZ19lbWFpbFwiKSxcbiAgICB6Lm51bGwoKVxuICBdKS5udWxsYWJsZSgpLmRlc2NyaWJlKFwiREVQUkVDQVRFRDogVXNlIGV4dHJhY3RlZERhdGEgaW5zdGVhZC4gU2luZ2xlIGZpZWxkIGV4dHJhY3Rpb24uXCIpLFxuICBleHRyYWN0ZWRWYWx1ZTogei5zdHJpbmcoKS5udWxsYWJsZSgpLmRlc2NyaWJlKFwiREVQUkVDQVRFRDogVXNlIGV4dHJhY3RlZERhdGEgaW5zdGVhZC5cIiksXG4gIFxuICBjb21wYW55SW5mb1JlcXVlc3RlZDogei5hcnJheSh6LmVudW0oW1xuICAgIFwiaG91cnNcIixcbiAgICBcInByaWNpbmdcIixcbiAgICBcInBsYW5zXCIsXG4gICAgXCJwcm9tb3Rpb25zXCIsXG4gICAgXCJsb2NhdGlvblwiLFxuICAgIFwic2VydmljZXNcIixcbiAgICBcInN0YWZmXCIsXG4gICAgXCJjb250YWN0XCIsXG4gICAgXCJ3ZWJzaXRlXCIsXG4gICAgXCJlbWFpbFwiLFxuICAgIFwicGhvbmVcIixcbiAgICBcImFkZHJlc3NcIlxuICBdKSkubnVsbGFibGUoKS5kZXNjcmliZShcIklmIGludGVudCBpcyAnY29tcGFueV9pbmZvX3JlcXVlc3QnLCBsaXN0IHNwZWNpZmljIGluZm8gbmVlZGVkLiBPdGhlcndpc2UsIG51bGwuXCIpLFxuICByZXF1aXJlc0RlZXBDb250ZXh0OiB6LmJvb2xlYW4oKS5kZXNjcmliZShcIlRydWUgaWYgdGhlIGNvbnZlcnNhdGlvbiByZXF1aXJlcyBtb3JlIHRoYW4gdGhlIGxhc3QgMTAgbWVzc2FnZXMgZm9yIGZ1bGwgY29udGV4dC5cIiksXG4gIGNvbnZlcnNhdGlvbkNvbXBsZXhpdHk6IHouZW51bShbXCJzaW1wbGVcIiwgXCJtb2RlcmF0ZVwiLCBcImNvbXBsZXhcIl0pLmRlc2NyaWJlKFwiVGhlIGNvbXBsZXhpdHkgb2YgdGhlIGN1cnJlbnQgY29udmVyc2F0aW9uIHR1cm4uXCIpLFxuICBkZXRlY3RlZEVtb3Rpb25hbFRvbmU6IHouZW51bShbXCJwb3NpdGl2ZVwiLCBcIm5ldXRyYWxcIiwgXCJuZWdhdGl2ZVwiLCBcImZydXN0cmF0ZWRcIiwgXCJ1cmdlbnRcIl0pLm51bGxhYmxlKCkuZGVzY3JpYmUoXCJUaGUgZGV0ZWN0ZWQgZW1vdGlvbmFsIHRvbmUgb2YgdGhlIHVzZXIncyBtZXNzYWdlLlwiKSxcbiAgXG4gIC8vIPCfjq8gTkVXOiBFbmdhZ2VtZW50ICYgQ29udmVyc2lvbiBNZXRyaWNzXG4gIGludGVyZXN0TGV2ZWw6IHoubnVtYmVyKCkubWluKDEpLm1heCg1KS5kZXNjcmliZShcIlVzZXIncyBpbnRlcmVzdCBsZXZlbCAxLTUuIDE9ZGlzZW5nYWdlZC9jb2xkLCAzPW5ldXRyYWwvY3VyaW91cywgNT1oaWdobHkgZW5nYWdlZC9lYWdlci5cIiksXG4gIGNvbnZlcnNpb25MaWtlbGlob29kOiB6Lm51bWJlcigpLm1pbigwKS5tYXgoMSkuZGVzY3JpYmUoXCJMaWtlbGlob29kIHVzZXIgd2lsbCBjb252ZXJ0ICgwLjAtMS4wKS4gQmFzZWQgb24gYnV5aW5nIHNpZ25hbHMsIHVyZ2VuY3ksIHNwZWNpZmljaXR5IG9mIHF1ZXN0aW9ucy5cIiksXG4gIFxuICAvLyDwn46vIE5FVzogTGFuZ3VhZ2UgUHJvZmlsZSAoZm9yIHBlcnNvbmFsaXphdGlvbilcbiAgbGFuZ3VhZ2VQcm9maWxlOiB6Lm9iamVjdCh7XG4gICAgZm9ybWFsaXR5OiB6Lm51bWJlcigpLm1pbigxKS5tYXgoNSkuZGVzY3JpYmUoXCIxPXZlcnkgY2FzdWFsL3NsYW5nLCAzPW5ldXRyYWwsIDU9dmVyeSBmb3JtYWwvcHJvZmVzc2lvbmFsXCIpLFxuICAgIGh5cGVUb2xlcmFuY2U6IHoubnVtYmVyKCkubWluKDEpLm1heCg1KS5kZXNjcmliZShcIjE9cHJlZmVycyBjYWxtL2ZhY3R1YWwsIDM9bmV1dHJhbCwgNT1sb3ZlcyBlbmVyZ3kvaHlwZS9lbnRodXNpYXNtXCIpLFxuICAgIGVtb2ppVXNhZ2U6IHoubnVtYmVyKCkubWluKDApLm1heCg1KS5kZXNjcmliZShcIjA9bm8gZW1vamlzIHVzZWQsIDU9aGVhdnkgZW1vamkgdXNhZ2VcIiksXG4gICAgbGFuZ3VhZ2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoXCJEZXRlY3RlZCBsYW5ndWFnZSBjb2RlIChlLmcuLCAnZW4nLCAnZXMnLCAnZnInKVwiKVxuICB9KS5kZXNjcmliZShcIkFuYWx5c2lzIG9mIHVzZXIncyBjb21tdW5pY2F0aW9uIHN0eWxlIGZvciBwZXJzb25hbGl6YXRpb24uXCIpXG59KTtcblxuZXhwb3J0IHR5cGUgSW50ZW50RGV0ZWN0aW9uUmVzdWx0ID0gei5pbmZlcjx0eXBlb2YgSW50ZW50RGV0ZWN0aW9uU2NoZW1hPjtcblxuZXhwb3J0IGludGVyZmFjZSBNZXNzYWdlUHJvY2Vzc29yQ29uZmlnIHtcbiAgbW9kZWw6IENoYXRCZWRyb2NrQ29udmVyc2U7XG4gIHBlcnNvbmE6IEFnZW50UGVyc29uYTtcbiAgY29tcGFueUluZm8/OiBDb21wYW55SW5mbztcbiAgYWN0aW9uVGFnUHJvY2Vzc29yOiBBY3Rpb25UYWdQcm9jZXNzb3I7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvY2Vzc2luZ0NvbnRleHQge1xuICB1c2VyTWVzc2FnZTogc3RyaW5nO1xuICBtZXNzYWdlczogQmFzZU1lc3NhZ2VbXTtcbiAgZ29hbFJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfCBudWxsO1xuICBlZmZlY3RpdmVHb2FsQ29uZmlnOiBFZmZlY3RpdmVHb2FsQ29uZmlnO1xuICBjaGFubmVsU3RhdGU/OiBhbnk7IC8vIEFkZCBjaGFubmVsIHN0YXRlIHRvIGtub3cgd2hhdCdzIGFscmVhZHkgY2FwdHVyZWRcbiAgb25EYXRhRXh0cmFjdGVkPzogKGV4dHJhY3RlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4sIGdvYWxSZXN1bHQ6IEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0IHwgbnVsbCwgdXNlck1lc3NhZ2U/OiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD47XG4gIC8vIFRyYWNraW5nIGNvbnRleHQgZm9yIExMTSB1c2FnZSBldmVudHNcbiAgdGVuYW50SWQ/OiBzdHJpbmc7XG4gIGNoYW5uZWxJZD86IHN0cmluZztcbiAgbWVzc2FnZVNvdXJjZT86IHN0cmluZzsgLy8gJ2NoYXQnLCAnc21zJywgJ2VtYWlsJywgZXRjLlxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2Nlc3NpbmdSZXN1bHQge1xuICByZXNwb25zZTogc3RyaW5nO1xuICBmb2xsb3dVcFF1ZXN0aW9uPzogc3RyaW5nO1xuICBpbnRlbnREZXRlY3Rpb25SZXN1bHQ6IEludGVudERldGVjdGlvblJlc3VsdCB8IG51bGw7XG4gIHByZUV4dHJhY3RlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT47XG59XG5cbi8qKlxuICogUHJvY2Vzc2VzIHVzZXIgbWVzc2FnZXMgdGhyb3VnaCBhIHRocmVlLXJlcXVlc3QgYXJjaGl0ZWN0dXJlXG4gKi9cbi8vIEZvcmNlIHJlbG9hZCAtIHYyLjBcbmV4cG9ydCBjbGFzcyBNZXNzYWdlUHJvY2Vzc29yIHtcbiAgcHJpdmF0ZSBtb2RlbDogQ2hhdEJlZHJvY2tDb252ZXJzZTtcbiAgcHJpdmF0ZSBwZXJzb25hOiBBZ2VudFBlcnNvbmE7XG4gIHByaXZhdGUgY29tcGFueUluZm8/OiBDb21wYW55SW5mbztcbiAgcHJpdmF0ZSBhY3Rpb25UYWdQcm9jZXNzb3I6IEFjdGlvblRhZ1Byb2Nlc3NvcjtcbiAgcHJpdmF0ZSBldmVudEJyaWRnZVNlcnZpY2U/OiBFdmVudEJyaWRnZVNlcnZpY2U7XG4gIFxuICAvLyBUcmFja2luZyBjb250ZXh0XG4gIHByaXZhdGUgdGVuYW50SWQ/OiBzdHJpbmc7XG4gIHByaXZhdGUgY2hhbm5lbElkPzogc3RyaW5nO1xuICBwcml2YXRlIG1lc3NhZ2VTb3VyY2U/OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBNZXNzYWdlUHJvY2Vzc29yQ29uZmlnICYgeyBldmVudEJyaWRnZVNlcnZpY2U/OiBFdmVudEJyaWRnZVNlcnZpY2UgfSkge1xuICAgIHRoaXMubW9kZWwgPSBjb25maWcubW9kZWw7XG4gICAgdGhpcy5wZXJzb25hID0gY29uZmlnLnBlcnNvbmE7XG4gICAgdGhpcy5jb21wYW55SW5mbyA9IGNvbmZpZy5jb21wYW55SW5mbztcbiAgICB0aGlzLmFjdGlvblRhZ1Byb2Nlc3NvciA9IGNvbmZpZy5hY3Rpb25UYWdQcm9jZXNzb3I7XG4gICAgdGhpcy5ldmVudEJyaWRnZVNlcnZpY2UgPSBjb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlO1xuICB9XG4gIFxuICAvKipcbiAgICogR2V0IGlkZW50aXR5IGVuZm9yY2VtZW50IHByZWZpeCBmb3IgQUxMIHVzZXItZmFjaW5nIExMTSBjYWxsc1xuICAgKiBUaGlzIHByZXZlbnRzIENsYXVkZSBmcm9tIGJyZWFraW5nIGNoYXJhY3RlclxuICAgKi9cbiAgcHJpdmF0ZSBnZXRJZGVudGl0eUVuZm9yY2VtZW50KCk6IHN0cmluZyB7XG4gICAgY29uc3QgY29tcGFueU5hbWUgPSB0aGlzLmNvbXBhbnlJbmZvPy5uYW1lIHx8ICdvdXIgY29tcGFueSc7XG4gICAgY29uc3QgcGVyc29uYU5hbWUgPSB0aGlzLnBlcnNvbmEubmFtZSB8fCAndGhlIGFzc2lzdGFudCc7XG4gICAgXG4gICAgcmV0dXJuIGDwn5qoIElERU5USVRZIFJVTEVTIC0gTkVWRVIgQlJFQUsgQ0hBUkFDVEVSIPCfmqhcbllPVSBBUkU6ICR7cGVyc29uYU5hbWV9IGF0ICR7Y29tcGFueU5hbWV9LiBUaGlzIGlzIGEgUk9MRVBMQVkgLSBzdGF5IGluIGNoYXJhY3RlciFcbuKblCBORVZFUiBzYXk6IFwiSSBhbSBhbiBBSVwiLCBcIkkgY2Fubm90IHJvbGVwbGF5XCIsIFwiQXMgYW4gQUkuLi5cIlxu4pyFIEFMV0FZUzogU3RheSAxMDAlIGluIGNoYXJhY3RlciBhcyAke3BlcnNvbmFOYW1lfVxuXG5gO1xuICB9XG4gIFxuICAvKipcbiAgICogRW1pdCBjaGF0IHByZXNlbmNlIGV2ZW50IChyZWNlaXZlZCwgcmVhZCwgdHlwaW5nLCBzdG9wcGVkVHlwaW5nKVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBlbWl0UHJlc2VuY2VFdmVudChcbiAgICBldmVudFR5cGU6ICdjaGF0LnJlY2VpdmVkJyB8ICdjaGF0LnJlYWQnIHwgJ2NoYXQudHlwaW5nJyB8ICdjaGF0LnN0b3BwZWRUeXBpbmcnXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5ldmVudEJyaWRnZVNlcnZpY2UpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFByZXNlbmNlIGV2ZW50IFske2V2ZW50VHlwZX1dOiAobm8gRXZlbnRCcmlkZ2UgY29uZmlndXJlZClgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHRoaXMuZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hDdXN0b21FdmVudChcbiAgICAgICAgJ2t4Z2VuLmFnZW50JyxcbiAgICAgICAgZXZlbnRUeXBlLFxuICAgICAgICB7XG4gICAgICAgICAgY2hhbm5lbElkOiB0aGlzLmNoYW5uZWxJZCxcbiAgICAgICAgICB0ZW5hbnRJZDogdGhpcy50ZW5hbnRJZCxcbiAgICAgICAgICBwZXJzb25hSWQ6IHVuZGVmaW5lZCwgLy8gV2lsbCBiZSBzZXQgYnkgaGFuZGxlciBjb250ZXh0IGlmIG5lZWRlZFxuICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIERvbid0IGxldCBwcmVzZW5jZSBldmVudHMgYnJlYWsgdGhlIGZsb3dcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBlbWl0dGluZyBwcmVzZW5jZSBldmVudCAke2V2ZW50VHlwZX06YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuICBcbiAgLyoqXG4gICAqIEV4dHJhY3QgYW5kIGVtaXQgdG9rZW4gdXNhZ2UgZnJvbSBMTE0gcmVzcG9uc2VcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZW1pdFRva2VuVXNhZ2UoXG4gICAgcmVzcG9uc2U6IGFueSxcbiAgICByZXF1ZXN0VHlwZTogTExNVXNhZ2VFdmVudFsncmVxdWVzdFR5cGUnXVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgLy8gTGFuZ0NoYWluIHByb3ZpZGVzIHVzYWdlX21ldGFkYXRhIG9uIEFJTWVzc2FnZSByZXNwb25zZXNcbiAgICAgIGNvbnN0IHVzYWdlTWV0YWRhdGEgPSByZXNwb25zZT8udXNhZ2VfbWV0YWRhdGE7XG4gICAgICBcbiAgICAgIGlmICh1c2FnZU1ldGFkYXRhKSB7XG4gICAgICAgIGNvbnN0IGlucHV0VG9rZW5zID0gdXNhZ2VNZXRhZGF0YS5pbnB1dF90b2tlbnMgfHwgMDtcbiAgICAgICAgY29uc3Qgb3V0cHV0VG9rZW5zID0gdXNhZ2VNZXRhZGF0YS5vdXRwdXRfdG9rZW5zIHx8IDA7XG4gICAgICAgIGNvbnN0IHRvdGFsVG9rZW5zID0gdXNhZ2VNZXRhZGF0YS50b3RhbF90b2tlbnMgfHwgKGlucHV0VG9rZW5zICsgb3V0cHV0VG9rZW5zKTtcbiAgICAgICAgXG4gICAgICAgIC8vIENhbGN1bGF0ZSBlc3RpbWF0ZWQgY29zdCBiYXNlZCBvbiBtb2RlbCBwcmljaW5nXG4gICAgICAgIGNvbnN0IGVzdGltYXRlZENvc3RVc2QgPSB0aGlzLmNhbGN1bGF0ZVRva2VuQ29zdChcbiAgICAgICAgICAodGhpcy5tb2RlbCBhcyBhbnkpLm1vZGVsIHx8ICd1bmtub3duJyxcbiAgICAgICAgICBpbnB1dFRva2VucyxcbiAgICAgICAgICBvdXRwdXRUb2tlbnNcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHVzYWdlRXZlbnQ6IExMTVVzYWdlRXZlbnQgPSB7XG4gICAgICAgICAgdGVuYW50SWQ6IHRoaXMudGVuYW50SWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIGNoYW5uZWxJZDogdGhpcy5jaGFubmVsSWQsXG4gICAgICAgICAgc291cmNlOiB0aGlzLm1lc3NhZ2VTb3VyY2UgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIHJlcXVlc3RUeXBlLFxuICAgICAgICAgIG1vZGVsOiAodGhpcy5tb2RlbCBhcyBhbnkpLm1vZGVsIHx8ICd1bmtub3duJyxcbiAgICAgICAgICBpbnB1dFRva2VucyxcbiAgICAgICAgICBvdXRwdXRUb2tlbnMsXG4gICAgICAgICAgdG90YWxUb2tlbnMsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgZXN0aW1hdGVkQ29zdFVzZCxcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIC8vIEVtaXQgdG8gRXZlbnRCcmlkZ2UgKHdpbGwgYWxzbyBjb25zb2xlLmxvZylcbiAgICAgICAgaWYgKHRoaXMuZXZlbnRCcmlkZ2VTZXJ2aWNlKSB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5ldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaExMTVVzYWdlKHVzYWdlRXZlbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEp1c3QgbG9nIGlmIG5vIEV2ZW50QnJpZGdlIGNvbmZpZ3VyZWRcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TiiBMTE0gVXNhZ2UgWyR7cmVxdWVzdFR5cGV9XTogSW5wdXQ9JHtpbnB1dFRva2Vuc30sIE91dHB1dD0ke291dHB1dFRva2Vuc30sIFRvdGFsPSR7dG90YWxUb2tlbnN9LCBDb3N0PSQke2VzdGltYXRlZENvc3RVc2QudG9GaXhlZCg2KX1gKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyBObyB1c2FnZV9tZXRhZGF0YSBpbiByZXNwb25zZSBmb3IgJHtyZXF1ZXN0VHlwZX1gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gRG9uJ3QgbGV0IHVzYWdlIHRyYWNraW5nIGVycm9ycyBicmVhayB0aGUgZmxvd1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGVtaXR0aW5nIHRva2VuIHVzYWdlIGZvciAke3JlcXVlc3RUeXBlfTpgLCBlcnJvcik7XG4gICAgfVxuICB9XG4gIFxuICAvKipcbiAgICogQ2FsY3VsYXRlIGVzdGltYXRlZCBjb3N0IGluIFVTRCBiYXNlZCBvbiBtb2RlbCBhbmQgdG9rZW4gY291bnRzXG4gICAqIFByaWNpbmcgYXMgb2YgRGVjIDIwMjQgKHBlciAxSyB0b2tlbnMpOlxuICAgKiAtIENsYXVkZSAzLjUgU29ubmV0OiBJbnB1dCAkMC4wMDMsIE91dHB1dCAkMC4wMTVcbiAgICogLSBDbGF1ZGUgMyBTb25uZXQ6IElucHV0ICQwLjAwMywgT3V0cHV0ICQwLjAxNVxuICAgKiAtIENsYXVkZSAzIEhhaWt1OiBJbnB1dCAkMC4wMDAyNSwgT3V0cHV0ICQwLjAwMTI1XG4gICAqIC0gQ2xhdWRlIDMgT3B1czogSW5wdXQgJDAuMDE1LCBPdXRwdXQgJDAuMDc1XG4gICAqL1xuICBwcml2YXRlIGNhbGN1bGF0ZVRva2VuQ29zdChtb2RlbDogc3RyaW5nLCBpbnB1dFRva2VuczogbnVtYmVyLCBvdXRwdXRUb2tlbnM6IG51bWJlcik6IG51bWJlciB7XG4gICAgLy8gUHJpY2luZyBwZXIgMUsgdG9rZW5zIChVU0QpXG4gICAgY29uc3QgcHJpY2luZzogUmVjb3JkPHN0cmluZywgeyBpbnB1dDogbnVtYmVyOyBvdXRwdXQ6IG51bWJlciB9PiA9IHtcbiAgICAgIC8vIENsYXVkZSAzLjUgU29ubmV0XG4gICAgICAnYW50aHJvcGljLmNsYXVkZS0zLTUtc29ubmV0LTIwMjQwNjIwLXYxOjAnOiB7IGlucHV0OiAwLjAwMywgb3V0cHV0OiAwLjAxNSB9LFxuICAgICAgJ2FudGhyb3BpYy5jbGF1ZGUtMy01LXNvbm5ldC0yMDI0MTAyMi12MjowJzogeyBpbnB1dDogMC4wMDMsIG91dHB1dDogMC4wMTUgfSxcbiAgICAgIC8vIENsYXVkZSAzIFNvbm5ldFxuICAgICAgJ2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtMjAyNDAyMjktdjE6MCc6IHsgaW5wdXQ6IDAuMDAzLCBvdXRwdXQ6IDAuMDE1IH0sXG4gICAgICAvLyBDbGF1ZGUgMyBIYWlrdVxuICAgICAgJ2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0yMDI0MDMwNy12MTowJzogeyBpbnB1dDogMC4wMDAyNSwgb3V0cHV0OiAwLjAwMTI1IH0sXG4gICAgICAvLyBDbGF1ZGUgMyBPcHVzXG4gICAgICAnYW50aHJvcGljLmNsYXVkZS0zLW9wdXMtMjAyNDAyMjktdjE6MCc6IHsgaW5wdXQ6IDAuMDE1LCBvdXRwdXQ6IDAuMDc1IH0sXG4gICAgfTtcbiAgICBcbiAgICAvLyBEZWZhdWx0IHRvIFNvbm5ldCBwcmljaW5nIGlmIG1vZGVsIG5vdCBmb3VuZFxuICAgIGNvbnN0IG1vZGVsUHJpY2luZyA9IHByaWNpbmdbbW9kZWxdIHx8IHsgaW5wdXQ6IDAuMDAzLCBvdXRwdXQ6IDAuMDE1IH07XG4gICAgXG4gICAgY29uc3QgaW5wdXRDb3N0ID0gKGlucHV0VG9rZW5zIC8gMTAwMCkgKiBtb2RlbFByaWNpbmcuaW5wdXQ7XG4gICAgY29uc3Qgb3V0cHV0Q29zdCA9IChvdXRwdXRUb2tlbnMgLyAxMDAwKSAqIG1vZGVsUHJpY2luZy5vdXRwdXQ7XG4gICAgXG4gICAgcmV0dXJuIGlucHV0Q29zdCArIG91dHB1dENvc3Q7XG4gIH1cblxuICAvKipcbiAgICogTWFpbiBwcm9jZXNzaW5nIG1ldGhvZCAtIG9yY2hlc3RyYXRlcyB0aGUgdGhyZWUtcmVxdWVzdCBhcmNoaXRlY3R1cmVcbiAgICovXG4gIGFzeW5jIHByb2Nlc3MoY29udGV4dDogUHJvY2Vzc2luZ0NvbnRleHQpOiBQcm9taXNlPFByb2Nlc3NpbmdSZXN1bHQ+IHtcbiAgICBjb25zdCB7IHVzZXJNZXNzYWdlLCBtZXNzYWdlcywgZ29hbFJlc3VsdCwgZWZmZWN0aXZlR29hbENvbmZpZywgY2hhbm5lbFN0YXRlLCBvbkRhdGFFeHRyYWN0ZWQgfSA9IGNvbnRleHQ7XG4gICAgXG4gICAgLy8gU2V0IHRyYWNraW5nIGNvbnRleHQgZm9yIHRva2VuIHVzYWdlIGV2ZW50c1xuICAgIHRoaXMudGVuYW50SWQgPSBjb250ZXh0LnRlbmFudElkO1xuICAgIHRoaXMuY2hhbm5lbElkID0gY29udGV4dC5jaGFubmVsSWQ7XG4gICAgdGhpcy5tZXNzYWdlU291cmNlID0gY29udGV4dC5tZXNzYWdlU291cmNlO1xuXG4gICAgLy8gUkVRVUVTVCAjMTogSW50ZW50IERldGVjdGlvbiAobXVzdCBoYXBwZW4gRklSU1QgdG8gZXh0cmFjdCBkYXRhKVxuICAgIGNvbnN0IGludGVudERldGVjdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMucGVyZm9ybUludGVudERldGVjdGlvbihcbiAgICAgIHVzZXJNZXNzYWdlLFxuICAgICAgbWVzc2FnZXMsXG4gICAgICBnb2FsUmVzdWx0LFxuICAgICAgZWZmZWN0aXZlR29hbENvbmZpZyxcbiAgICAgIGNoYW5uZWxTdGF0ZVxuICAgICk7XG4gICAgXG4gICAgLy8g8J+Rge+4jyBFbWl0IGNoYXQucmVhZCAtIHdlJ3ZlIFwicmVhZFwiIGFuZCB1bmRlcnN0b29kIHRoZSBtZXNzYWdlXG4gICAgYXdhaXQgdGhpcy5lbWl0UHJlc2VuY2VFdmVudCgnY2hhdC5yZWFkJyk7XG5cbiAgICAvLyBFeHRyYWN0IGRhdGEgZnJvbSBCT1RIIGdvYWwgb3JjaGVzdHJhdG9yIEFORCBpbnRlbnQgZGV0ZWN0aW9uXG4gICAgY29uc3QgcHJlRXh0cmFjdGVkRGF0YTogUmVjb3JkPHN0cmluZywgYW55PiA9IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8gfHwge307XG4gICAgXG4gICAgLy8g8J+UpSBQUkUtTExNIEVYVFJBQ1RJT046IEhhbmRsZSBzaW1wbGUgc2luZ2xlLXdvcmQgdGltZSBhbnN3ZXJzIHRoYXQgTExNIGtlZXBzIG1pc2ludGVycHJldGluZyBhcyBncmVldGluZ3NcbiAgICAvLyBJZiB3ZSdyZSBhc2tpbmcgZm9yIHByZWZlcnJlZFRpbWUgYW5kIHVzZXIgc2F5cyBcImV2ZW5pbmdcIiwgXCJtb3JuaW5nXCIsIGV0Yy4sIGV4dHJhY3QgaXQgZGlyZWN0bHkhXG4gICAgY29uc3QgYWN0aXZlR29hbHMgPSBnb2FsUmVzdWx0Py5hY3RpdmVHb2FscyB8fCBbXTtcbiAgICBjb25zdCBpc0Fza2luZ0ZvclRpbWUgPSBhY3RpdmVHb2Fscy5zb21lKGdvYWxJZCA9PiB7XG4gICAgICBjb25zdCBnb2FsRGVmID0gR29hbENvbmZpZ0hlbHBlci5maW5kR29hbChlZmZlY3RpdmVHb2FsQ29uZmlnLCBnb2FsSWQpO1xuICAgICAgY29uc3QgZmllbGRzID0gZ29hbERlZj8uZGF0YVRvQ2FwdHVyZT8uZmllbGRzIHx8IFtdO1xuICAgICAgY29uc3QgZmllbGROYW1lcyA9IEFycmF5LmlzQXJyYXkoZmllbGRzKSBcbiAgICAgICAgPyBmaWVsZHMubWFwKChmOiBhbnkpID0+IHR5cGVvZiBmID09PSAnc3RyaW5nJyA/IGYgOiBmLm5hbWUpLmZpbHRlcihCb29sZWFuKVxuICAgICAgICA6IFtdO1xuICAgICAgcmV0dXJuIGZpZWxkTmFtZXMuaW5jbHVkZXMoJ3ByZWZlcnJlZFRpbWUnKTtcbiAgICB9KTtcbiAgICBcbiAgICBpZiAoaXNBc2tpbmdGb3JUaW1lKSB7XG4gICAgICBjb25zdCBtZXNzYWdlTG93ZXJGb3JUaW1lID0gdXNlck1lc3NhZ2UudG9Mb3dlckNhc2UoKTtcbiAgICAgIFxuICAgICAgLy8gQ2hlY2sgaWYgbWVzc2FnZSBDT05UQUlOUyB0aW1lIHByZWZlcmVuY2Uga2V5d29yZHMgKG5vdCBleGFjdCBtYXRjaClcbiAgICAgIC8vIFRoaXMgaGFuZGxlcyBcIkkgbGlrZSB0aGUgbmlnaHRcIiwgXCJldmVuaW5nIHdvcmtzXCIsIFwicHJlZmVyIG1vcm5pbmdzXCIsIGV0Yy5cbiAgICAgIGNvbnN0IHRpbWVLZXl3b3JkUGF0dGVybnM6IEFycmF5PHtwYXR0ZXJuOiBSZWdFeHAsIHZhbHVlOiBzdHJpbmd9PiA9IFtcbiAgICAgICAgeyBwYXR0ZXJuOiAvXFxiKG5pZ2h0fG5pZ2h0c3xuaWdodHRpbWV8ZXZlbmluZ3xldmVuaW5ncylcXGIvaSwgdmFsdWU6ICdldmVuaW5nJyB9LFxuICAgICAgICB7IHBhdHRlcm46IC9cXGIoYWZ0ZXJub29ufGFmdGVybm9vbnMpXFxiL2ksIHZhbHVlOiAnYWZ0ZXJub29uJyB9LFxuICAgICAgICB7IHBhdHRlcm46IC9cXGIobW9ybmluZ3xtb3JuaW5nc3xlYXJseSlcXGIvaSwgdmFsdWU6ICdtb3JuaW5nJyB9LFxuICAgICAgICB7IHBhdHRlcm46IC9cXGJwbVxcYi9pLCB2YWx1ZTogJ2V2ZW5pbmcnIH0sXG4gICAgICAgIHsgcGF0dGVybjogL1xcYmFtXFxiL2ksIHZhbHVlOiAnbW9ybmluZycgfSxcbiAgICAgIF07XG4gICAgICBcbiAgICAgIGZvciAoY29uc3QgeyBwYXR0ZXJuLCB2YWx1ZSB9IG9mIHRpbWVLZXl3b3JkUGF0dGVybnMpIHtcbiAgICAgICAgaWYgKHBhdHRlcm4udGVzdChtZXNzYWdlTG93ZXJGb3JUaW1lKSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46vIFBSRS1MTE0gRVhUUkFDVElPTjogRGV0ZWN0ZWQgdGltZSBrZXl3b3JkIGluIFwiJHt1c2VyTWVzc2FnZX1cIiDihpIgcHJlZmVycmVkVGltZT1cIiR7dmFsdWV9XCIgKGJ5cGFzc2luZyBMTE0pYCk7XG4gICAgICAgICAgcHJlRXh0cmFjdGVkRGF0YVsncHJlZmVycmVkVGltZSddID0ge1xuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgY29uZmlkZW5jZTogMS4wLFxuICAgICAgICAgICAgc291cmNlOiAncHJlX2xsbV9wYXR0ZXJuX21hdGNoJ1xuICAgICAgICAgIH07XG4gICAgICAgICAgYnJlYWs7IC8vIFVzZSBmaXJzdCBtYXRjaFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIE5vdGU6IFRpbWUgcmVmaW5lbWVudCBkZXRlY3Rpb24gKGxhdGVyL2VhcmxpZXIpIGlzIG5vdyBoYW5kbGVkIGluIHNjaGVkdWxpbmcudHNcbiAgICAvLyBiYXNlZCBvbiB0aGUgdXNlcidzIG1lc3NhZ2UgYW5kIGRldGVjdGVkIGludGVudCwgbm90IGhhcmRjb2RlZCBwYXR0ZXJucyBoZXJlLlxuICAgIGNvbnN0IG1lc3NhZ2VMb3dlciA9IHVzZXJNZXNzYWdlLnRvTG93ZXJDYXNlKCk7XG4gICAgXG4gICAgLy8g8J+UpSBQUkUtTExNIEVYVFJBQ1RJT046IERldGVjdCBjb21tb24gbW90aXZhdGlvbiBrZXl3b3JkcyBpbiBBTlkgbWVzc2FnZVxuICAgIC8vIFRoaXMgY2F0Y2hlcyBcIndlZGRpbmdcIiwgXCJjb21wZXRpdGlvblwiLCBldGMuIGV2ZW4gd2hlbiBMTE0gbWlzc2VzIHRoZW1cbiAgICBjb25zdCBtb3RpdmF0aW9uUGF0dGVybnM6IEFycmF5PHtwYXR0ZXJuOiBSZWdFeHAsIHJlYXNvbjogc3RyaW5nLCBjYXRlZ29yaWVzOiBzdHJpbmd9PiA9IFtcbiAgICAgIHsgcGF0dGVybjogL1xcYndlZGRpbmdcXGIvaSwgcmVhc29uOiAnd2VkZGluZycsIGNhdGVnb3JpZXM6ICdhZXN0aGV0aWMnIH0sXG4gICAgICB7IHBhdHRlcm46IC9cXGJtYXJyaWFnZVxcYi9pLCByZWFzb246ICd3ZWRkaW5nJywgY2F0ZWdvcmllczogJ2Flc3RoZXRpYycgfSxcbiAgICAgIHsgcGF0dGVybjogL1xcYmNvbXBldGl0aW9uXFxifFxcYmNvbnRlc3RcXGJ8XFxiY29tcGV0ZVxcYi9pLCByZWFzb246ICdjb21wZXRpdGlvbicsIGNhdGVnb3JpZXM6ICdwZXJmb3JtYW5jZSxhZXN0aGV0aWMnIH0sXG4gICAgICB7IHBhdHRlcm46IC9cXGJib2R5YnVpbGRpbmdcXGIvaSwgcmVhc29uOiAnYm9keWJ1aWxkaW5nIGNvbXBldGl0aW9uJywgY2F0ZWdvcmllczogJ3BlcmZvcm1hbmNlLGFlc3RoZXRpYycgfSxcbiAgICAgIHsgcGF0dGVybjogL1xcYmJlYWNoXFxifFxcYnZhY2F0aW9uXFxifFxcYnN1bW1lciBib2R5XFxiL2ksIHJlYXNvbjogJ3ZhY2F0aW9uJywgY2F0ZWdvcmllczogJ2Flc3RoZXRpYycgfSxcbiAgICAgIHsgcGF0dGVybjogL1xcYmRvY3RvclxcYnxcXGJoZWFsdGhcXGJ8XFxiZGlhYmV0ZXNcXGJ8XFxiaGVhcnRcXGIvaSwgcmVhc29uOiAnaGVhbHRoJywgY2F0ZWdvcmllczogJ2hlYWx0aCcgfSxcbiAgICAgIHsgcGF0dGVybjogL1xcYmtpZHNcXGJ8XFxiY2hpbGRyZW5cXGJ8XFxiZmFtaWx5XFxifFxcYmdyYW5ka2lkc1xcYi9pLCByZWFzb246ICdmYW1pbHknLCBjYXRlZ29yaWVzOiAnbGlmZXN0eWxlLGhlYWx0aCcgfSxcbiAgICAgIHsgcGF0dGVybjogL1xcYnN0cmVzc1xcYnxcXGJhbnhpZXR5XFxifFxcYm1lbnRhbCBoZWFsdGhcXGJ8XFxiZGVwcmVzc2lvblxcYi9pLCByZWFzb246ICdtZW50YWwgaGVhbHRoJywgY2F0ZWdvcmllczogJ21lbnRhbCcgfSxcbiAgICAgIHsgcGF0dGVybjogL1xcYmNvbmZpZGVuY2VcXGJ8XFxiZmVlbCBiZXR0ZXJcXGJ8XFxic2VsZi4/ZXN0ZWVtXFxiL2ksIHJlYXNvbjogJ3NlbGYtY29uZmlkZW5jZScsIGNhdGVnb3JpZXM6ICdhZXN0aGV0aWMsbWVudGFsJyB9LFxuICAgICAgeyBwYXR0ZXJuOiAvXFxiYnJlYWsuP3VwXFxifFxcYmV4XFxifFxcYnJldmVuZ2VcXGJ8XFxiZGl2b3JjZVxcYi9pLCByZWFzb246ICdicmVha3VwJywgY2F0ZWdvcmllczogJ2Flc3RoZXRpYyxtZW50YWwnIH0sXG4gICAgICB7IHBhdHRlcm46IC9cXGJtYXJhdGhvblxcYnxcXGJyYWNlXFxifFxcYjVrXFxifFxcYjEwa1xcYi9pLCByZWFzb246ICdyYWNlL2V2ZW50JywgY2F0ZWdvcmllczogJ3BlcmZvcm1hbmNlJyB9LFxuICAgIF07XG4gICAgXG4gICAgLy8gT25seSBleHRyYWN0IGlmIHdlIGRvbid0IGFscmVhZHkgaGF2ZSBtb3RpdmF0aW9uUmVhc29uXG4gICAgaWYgKCFwcmVFeHRyYWN0ZWREYXRhWydtb3RpdmF0aW9uUmVhc29uJ10pIHtcbiAgICAgIGZvciAoY29uc3QgeyBwYXR0ZXJuLCByZWFzb24sIGNhdGVnb3JpZXMgfSBvZiBtb3RpdmF0aW9uUGF0dGVybnMpIHtcbiAgICAgICAgaWYgKHBhdHRlcm4udGVzdChtZXNzYWdlTG93ZXIpKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gUFJFLUxMTSBFWFRSQUNUSU9OOiBEZXRlY3RlZCBtb3RpdmF0aW9uIGtleXdvcmQgXCIke3JlYXNvbn1cIiBpbiBtZXNzYWdlIChieXBhc3NpbmcgTExNKWApO1xuICAgICAgICAgIHByZUV4dHJhY3RlZERhdGFbJ21vdGl2YXRpb25SZWFzb24nXSA9IHtcbiAgICAgICAgICAgIHZhbHVlOiByZWFzb24sXG4gICAgICAgICAgICBjb25maWRlbmNlOiAxLjAsXG4gICAgICAgICAgICBzb3VyY2U6ICdwcmVfbGxtX3BhdHRlcm5fbWF0Y2gnXG4gICAgICAgICAgfTtcbiAgICAgICAgICBwcmVFeHRyYWN0ZWREYXRhWydtb3RpdmF0aW9uQ2F0ZWdvcmllcyddID0ge1xuICAgICAgICAgICAgdmFsdWU6IGNhdGVnb3JpZXMsXG4gICAgICAgICAgICBjb25maWRlbmNlOiAxLjAsXG4gICAgICAgICAgICBzb3VyY2U6ICdwcmVfbGxtX3BhdHRlcm5fbWF0Y2gnXG4gICAgICAgICAgfTtcbiAgICAgICAgICBicmVhazsgLy8gVGFrZSBmaXJzdCBtYXRjaFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEFkZCBMTE0tZXh0cmFjdGVkIGRhdGEgZnJvbSBpbnRlbnQgZGV0ZWN0aW9uIChpZiBhbnkpXG4gICAgLy8gTkVXOiBTdXBwb3J0IG11bHRpcGxlIGV4dHJhY3Rpb25zIGluIG9uZSBtZXNzYWdlXG4gICAgaWYgKGludGVudERldGVjdGlvblJlc3VsdD8uZXh0cmFjdGVkRGF0YSAmJiBBcnJheS5pc0FycmF5KGludGVudERldGVjdGlvblJlc3VsdC5leHRyYWN0ZWREYXRhKSkge1xuICAgICAgY29uc29sZS5sb2coYPCfk6YgTExNIEludGVudCBEZXRlY3Rpb24gZXh0cmFjdGVkICR7aW50ZW50RGV0ZWN0aW9uUmVzdWx0LmV4dHJhY3RlZERhdGEubGVuZ3RofSBmaWVsZChzKWApO1xuICAgICAgXG4gICAgICAvLyDwn5uh77iPIENPREUtTEVWRUwgRklMVEVSOiBSZWplY3Qgd3JvbmdfcGhvbmUvd3JvbmdfZW1haWwgaWYgbWVzc2FnZSBpcyBjbGVhcmx5IGEgY29uZmlybWF0aW9uXG4gICAgICAvLyBUaGUgTExNIGtlZXBzIGV4dHJhY3RpbmcgdGhlc2UgaW5jb3JyZWN0bHksIHNvIHdlIGZpbHRlciBhdCB0aGUgY29kZSBsZXZlbFxuICAgICAgY29uc3QgY29uZmlybWF0aW9uUGF0dGVybnMgPSAvXFxiKHBlcmZlY3R8Y29ycmVjdHxyaWdodHxnb29kfGdyZWF0fHllc3x5ZXB8eWVhaHxjb25maXJtZWR8Z290IGl0fGdvdCB0aGVtfGdvdCAnZW18cmVjZWl2ZWR8dmVyaWZpZWR8YWxsIGdvb2R8d2UncmUgZ29vZHxsb29rcyBnb29kfHRoYXQncyBpdHx0aGF0J3MgcmlnaHQpXFxiL2k7XG4gICAgICBjb25zdCBpc0NvbmZpcm1hdGlvbiA9IGNvbmZpcm1hdGlvblBhdHRlcm5zLnRlc3QobWVzc2FnZUxvd2VyKTtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBleHRyYWN0aW9uIG9mIGludGVudERldGVjdGlvblJlc3VsdC5leHRyYWN0ZWREYXRhKSB7XG4gICAgICAgIC8vIFNraXAgd3JvbmdfcGhvbmUvd3JvbmdfZW1haWwgaWYgdGhpcyBpcyBjbGVhcmx5IGEgY29uZmlybWF0aW9uIG1lc3NhZ2VcbiAgICAgICAgaWYgKChleHRyYWN0aW9uLmZpZWxkID09PSAnd3JvbmdfcGhvbmUnIHx8IGV4dHJhY3Rpb24uZmllbGQgPT09ICd3cm9uZ19lbWFpbCcpICYmIGlzQ29uZmlybWF0aW9uKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAg8J+boe+4jyBCTE9DS0VEOiAke2V4dHJhY3Rpb24uZmllbGR9IGV4dHJhY3Rpb24gcmVqZWN0ZWQgLSBtZXNzYWdlIGlzIGEgY29uZmlybWF0aW9uIChcIiR7dXNlck1lc3NhZ2Uuc3Vic3RyaW5nKDAsIDUwKX0uLi5cIilgKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcHJlRXh0cmFjdGVkRGF0YVtleHRyYWN0aW9uLmZpZWxkXSA9IHtcbiAgICAgICAgICB2YWx1ZTogZXh0cmFjdGlvbi52YWx1ZSxcbiAgICAgICAgICBjb25maWRlbmNlOiAxLjAsXG4gICAgICAgICAgc291cmNlOiAnbGxtX2ludGVudF9kZXRlY3Rpb24nXG4gICAgICAgIH07XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIOKchSAke2V4dHJhY3Rpb24uZmllbGR9ID0gXCIke2V4dHJhY3Rpb24udmFsdWV9XCJgKTtcbiAgICAgIH1cbiAgICB9IFxuICAgIC8vIEJBQ0tXQVJEIENPTVBBVElCSUxJVFk6IEZhbGwgYmFjayB0byBvbGQgc2luZ2xlIGV4dHJhY3Rpb25cbiAgICBlbHNlIGlmIChpbnRlbnREZXRlY3Rpb25SZXN1bHQ/LmRldGVjdGVkV29ya2Zsb3dJbnRlbnQgJiYgaW50ZW50RGV0ZWN0aW9uUmVzdWx0Py5leHRyYWN0ZWRWYWx1ZSkge1xuICAgICAgY29uc3QgZmllbGROYW1lID0gaW50ZW50RGV0ZWN0aW9uUmVzdWx0LmRldGVjdGVkV29ya2Zsb3dJbnRlbnQ7XG4gICAgICBwcmVFeHRyYWN0ZWREYXRhW2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgIHZhbHVlOiBpbnRlbnREZXRlY3Rpb25SZXN1bHQuZXh0cmFjdGVkVmFsdWUsXG4gICAgICAgIGNvbmZpZGVuY2U6IDEuMCxcbiAgICAgICAgc291cmNlOiAnbGxtX2ludGVudF9kZXRlY3Rpb24nXG4gICAgICB9O1xuICAgICAgY29uc29sZS5sb2coYOKchSBMTE0gSW50ZW50IERldGVjdGlvbiBleHRyYWN0ZWQgKGxlZ2FjeSk6ICR7ZmllbGROYW1lfSA9IFwiJHtpbnRlbnREZXRlY3Rpb25SZXN1bHQuZXh0cmFjdGVkVmFsdWV9XCJgKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKE9iamVjdC5rZXlzKHByZUV4dHJhY3RlZERhdGEpLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGV4dHJhY3RlZEZpZWxkcyA9IE9iamVjdC5rZXlzKHByZUV4dHJhY3RlZERhdGEpLmpvaW4oJywgJyk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFVzaW5nIGV4dHJhY3RlZCBkYXRhIGZvciBMTE0gYWNrbm93bGVkZ21lbnQ6ICR7ZXh0cmFjdGVkRmllbGRzfWApO1xuICAgIH1cblxuICAgIC8vIPCflKUgQ1JJVElDQUw6IEFMV0FZUyBjYWxsIHRoZSBjYWxsYmFjayB0byB1cGRhdGUgZ29hbCBzdGF0ZSAoZXZlbiBpZiBubyBkYXRhIGV4dHJhY3RlZClcbiAgICAvLyBUaGlzIGlzIG5lY2Vzc2FyeSBmb3IgZmFzdC10cmFjayBkZXRlY3Rpb24gYmFzZWQgb24gdXNlciBJTlRFTlQgKG5vdCBqdXN0IGRhdGEpXG4gICAgaWYgKG9uRGF0YUV4dHJhY3RlZCkge1xuICAgICAgY29uc29sZS5sb2coYPCflIQgQ2FsbGluZyBvbkRhdGFFeHRyYWN0ZWQgY2FsbGJhY2sgdG8gdXBkYXRlIGdvYWwgc3RhdGUuLi5gKTtcbiAgICAgIGF3YWl0IG9uRGF0YUV4dHJhY3RlZChwcmVFeHRyYWN0ZWREYXRhLCBnb2FsUmVzdWx0LCB1c2VyTWVzc2FnZSk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdvYWwgc3RhdGUgdXBkYXRlZGApO1xuICAgIH1cblxuICAgIC8vIFJFUVVFU1QgIzI6IENvbnZlcnNhdGlvbmFsIFJlc3BvbnNlXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmdlbmVyYXRlQ29udmVyc2F0aW9uYWxSZXNwb25zZShcbiAgICAgIHVzZXJNZXNzYWdlLFxuICAgICAgbWVzc2FnZXMsXG4gICAgICBpbnRlbnREZXRlY3Rpb25SZXN1bHQsXG4gICAgICBwcmVFeHRyYWN0ZWREYXRhLFxuICAgICAgZ29hbFJlc3VsdCxcbiAgICAgIGVmZmVjdGl2ZUdvYWxDb25maWcsXG4gICAgICBjaGFubmVsU3RhdGVcbiAgICApO1xuICAgIFxuICAgIC8vIOKMqO+4jyBFbWl0IGNoYXQudHlwaW5nIC0gd2UncmUgbm93IFwidHlwaW5nXCIgdGhlIHJlc3BvbnNlXG4gICAgYXdhaXQgdGhpcy5lbWl0UHJlc2VuY2VFdmVudCgnY2hhdC50eXBpbmcnKTtcblxuICAgIC8vIFJFUVVFU1QgIzM6IEZvbGxvdy1VcCBHZW5lcmF0aW9uIChub3cgdXNlcyB1cGRhdGVkIGdvYWxSZXN1bHQuYWN0aXZlR29hbHMpXG4gICAgY29uc3QgZm9sbG93VXBRdWVzdGlvbiA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVGb2xsb3dVcChcbiAgICAgIHByZUV4dHJhY3RlZERhdGEsXG4gICAgICBnb2FsUmVzdWx0LFxuICAgICAgZWZmZWN0aXZlR29hbENvbmZpZyxcbiAgICAgIGNoYW5uZWxTdGF0ZSxcbiAgICAgIG1lc3NhZ2VzLFxuICAgICAgaW50ZW50RGV0ZWN0aW9uUmVzdWx0LFxuICAgICAgdXNlck1lc3NhZ2VcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3BvbnNlLFxuICAgICAgZm9sbG93VXBRdWVzdGlvbixcbiAgICAgIGludGVudERldGVjdGlvblJlc3VsdCxcbiAgICAgIHByZUV4dHJhY3RlZERhdGFcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJFUVVFU1QgIzE6IERldGVjdCB1c2VyIGludGVudCBhbmQgZGV0ZXJtaW5lIGNvbnRleHQgcmVxdWlyZW1lbnRzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHBlcmZvcm1JbnRlbnREZXRlY3Rpb24oXG4gICAgdXNlck1lc3NhZ2U6IHN0cmluZyxcbiAgICBtZXNzYWdlczogQmFzZU1lc3NhZ2VbXSxcbiAgICBnb2FsUmVzdWx0OiBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCB8IG51bGwsXG4gICAgZWZmZWN0aXZlR29hbENvbmZpZzogRWZmZWN0aXZlR29hbENvbmZpZyxcbiAgICBjaGFubmVsU3RhdGU/OiBhbnlcbiAgKTogUHJvbWlzZTxJbnRlbnREZXRlY3Rpb25SZXN1bHQgfCBudWxsPiB7XG4gICAgY29uc29sZS5sb2coJ1xcbicgKyAn8J+OrycucmVwZWF0KDMyKSk7XG4gICAgY29uc29sZS5sb2coJ/Cfjq8gUkVRVUVTVCAjMTogSW50ZW50IERldGVjdGlvbiAmIENvbnRleHQgQW5hbHlzaXMnKTtcbiAgICBjb25zb2xlLmxvZygn8J+OrycucmVwZWF0KDMyKSArICdcXG4nKTtcblxuICAgIC8vIEdldCB0aGUgbGFzdCA1IG1lc3NhZ2VzIGZvciBpbnRlbnQgZGV0ZWN0aW9uIChtaW5pbWFsIGNvbnRleHQpXG4gICAgY29uc3QgcmVjZW50TWVzc2FnZXNGb3JJbnRlbnQgPSBtZXNzYWdlcy5zbGljZSgtNSk7XG4gICAgXG4gICAgLy8gQnVpbGQgaW50ZW50IGRldGVjdGlvbiBwcm9tcHRcbiAgICBjb25zdCBhY3RpdmVHb2Fsc0ZvckludGVudCA9IGdvYWxSZXN1bHQ/LmFjdGl2ZUdvYWxzIHx8IFtdO1xuICAgIGNvbnN0IGFjdGl2ZUdvYWxEZWZpbml0aW9ucyA9IEdvYWxDb25maWdIZWxwZXIuZmluZEdvYWxzKGVmZmVjdGl2ZUdvYWxDb25maWcsIGFjdGl2ZUdvYWxzRm9ySW50ZW50KTtcbiAgICBjb25zdCBjb21wbGV0ZWRHb2FscyA9IGdvYWxSZXN1bHQ/LmNvbXBsZXRlZEdvYWxzIHx8IFtdO1xuICAgIFxuICAgIC8vIPCflKUgSU1QT1JUQU5UOiBVc2UgUEVSU0lTVEVOVCBjYXB0dXJlZCBkYXRhIGZyb20gY2hhbm5lbFN0YXRlLCBub3QganVzdCBjdXJyZW50IHR1cm4ncyBleHRyYWN0ZWRJbmZvXG4gICAgLy8gVGhpcyBlbnN1cmVzIHRoZSBMTE0ga25vd3Mgd2hhdCdzIGFscmVhZHkgYmVlbiBjYXB0dXJlZCBhY3Jvc3MgQUxMIHByZXZpb3VzIG1lc3NhZ2VzXG4gICAgY29uc3QgcGVyc2lzdGVudENhcHR1cmVkRGF0YSA9IGNoYW5uZWxTdGF0ZT8uY2FwdHVyZWREYXRhIHx8IHt9O1xuICAgIGNvbnN0IGN1cnJlbnRUdXJuRGF0YSA9IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8gfHwge307XG4gICAgY29uc3QgY2FwdHVyZWREYXRhID0geyAuLi5wZXJzaXN0ZW50Q2FwdHVyZWREYXRhLCAuLi5jdXJyZW50VHVybkRhdGEgfTtcbiAgICBcbiAgICBjb25zdCBpbnRlbnREZXRlY3Rpb25Qcm9tcHQgPSB0aGlzLmJ1aWxkSW50ZW50RGV0ZWN0aW9uUHJvbXB0KFxuICAgICAgdXNlck1lc3NhZ2UsXG4gICAgICByZWNlbnRNZXNzYWdlc0ZvckludGVudCxcbiAgICAgIGFjdGl2ZUdvYWxEZWZpbml0aW9ucyxcbiAgICAgIGNvbXBsZXRlZEdvYWxzLFxuICAgICAgY2FwdHVyZWREYXRhXG4gICAgKTtcbiAgICBcbiAgICAvLyBDYWxsIExMTSBmb3IgaW50ZW50IGRldGVjdGlvblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBpbnRlbnREZXRlY3Rpb25Nb2RlbCA9ICh0aGlzLm1vZGVsIGFzIGFueSkud2l0aFN0cnVjdHVyZWRPdXRwdXQoSW50ZW50RGV0ZWN0aW9uU2NoZW1hKTtcbiAgICAgIFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgaW50ZW50RGV0ZWN0aW9uTW9kZWwuaW52b2tlKFtcbiAgICAgICAgbmV3IEh1bWFuTWVzc2FnZShpbnRlbnREZXRlY3Rpb25Qcm9tcHQpXG4gICAgICBdKTtcbiAgICAgIFxuICAgICAgLy8gVHJ5IHRvIGVtaXQgdG9rZW4gdXNhZ2UgKHN0cnVjdHVyZWQgb3V0cHV0IG1heSBub3QgZXhwb3NlIGl0LCBidXQgdHJ5IGFueXdheSlcbiAgICAgIGF3YWl0IHRoaXMuZW1pdFRva2VuVXNhZ2UocmVzdWx0LCAnaW50ZW50X2RldGVjdGlvbicpO1xuICAgICAgXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdcXG4nICsgJ+KVkCcucmVwZWF0KDY0KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn46vIElOVEVOVCBERVRFQ1RJT04gUkVTVUxUOicpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pWQJy5yZXBlYXQoNjQpKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgUHJpbWFyeSBJbnRlbnQ6ICR7cmVzdWx0LnByaW1hcnlJbnRlbnR9YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFdvcmtmbG93IEludGVudDogJHtyZXN1bHQuZGV0ZWN0ZWRXb3JrZmxvd0ludGVudCB8fCAnTm9uZSd9YCk7XG4gICAgICAgIGlmIChyZXN1bHQuZXh0cmFjdGVkVmFsdWUpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICBFeHRyYWN0ZWQgVmFsdWU6IFwiJHtyZXN1bHQuZXh0cmFjdGVkVmFsdWV9XCJgKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZyhgICBDb21wYW55IEluZm86ICR7cmVzdWx0LmNvbXBhbnlJbmZvUmVxdWVzdGVkPy5qb2luKCcsICcpIHx8ICdOb25lJ31gKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgRGVlcCBDb250ZXh0IE5lZWRlZDogJHtyZXN1bHQucmVxdWlyZXNEZWVwQ29udGV4dH1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgQ29tcGxleGl0eTogJHtyZXN1bHQuY29udmVyc2F0aW9uQ29tcGxleGl0eX1gKTtcbiAgICAgICAgaWYgKHJlc3VsdC5kZXRlY3RlZEVtb3Rpb25hbFRvbmUpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICBFbW90aW9uYWwgVG9uZTogJHtyZXN1bHQuZGV0ZWN0ZWRFbW90aW9uYWxUb25lfWApO1xuICAgICAgICB9XG4gICAgICAgIC8vIExvZyBlbmdhZ2VtZW50IG1ldHJpY3NcbiAgICAgICAgaWYgKHJlc3VsdC5pbnRlcmVzdExldmVsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICDwn5OKIEludGVyZXN0IExldmVsOiAke3Jlc3VsdC5pbnRlcmVzdExldmVsfS81YCk7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAg8J+TiiBDb252ZXJzaW9uIExpa2VsaWhvb2Q6ICR7KHJlc3VsdC5jb252ZXJzaW9uTGlrZWxpaG9vZCAqIDEwMCkudG9GaXhlZCgwKX0lYCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5sYW5ndWFnZVByb2ZpbGUpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICDwn5OKIExhbmd1YWdlIFByb2ZpbGU6IGZvcm1hbGl0eT0ke3Jlc3VsdC5sYW5ndWFnZVByb2ZpbGUuZm9ybWFsaXR5fSwgaHlwZT0ke3Jlc3VsdC5sYW5ndWFnZVByb2ZpbGUuaHlwZVRvbGVyYW5jZX0sIGVtb2ppPSR7cmVzdWx0Lmxhbmd1YWdlUHJvZmlsZS5lbW9qaVVzYWdlfSwgbGFuZz0ke3Jlc3VsdC5sYW5ndWFnZVByb2ZpbGUubGFuZ3VhZ2V9YCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coJ+KVkCcucmVwZWF0KDY0KSArICdcXG4nKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEludGVudCBkZXRlY3Rpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIC8vIEZhbGxiYWNrIHRvIGRlZmF1bHRzIGlmIGludGVudCBkZXRlY3Rpb24gZmFpbHNcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHByaW1hcnlJbnRlbnQ6ICdnZW5lcmFsX2NvbnZlcnNhdGlvbicsXG4gICAgICAgIGV4dHJhY3RlZERhdGE6IG51bGwsXG4gICAgICAgIGRldGVjdGVkV29ya2Zsb3dJbnRlbnQ6IG51bGwsXG4gICAgICAgIGV4dHJhY3RlZFZhbHVlOiBudWxsLFxuICAgICAgICBjb21wYW55SW5mb1JlcXVlc3RlZDogbnVsbCxcbiAgICAgICAgcmVxdWlyZXNEZWVwQ29udGV4dDogZmFsc2UsXG4gICAgICAgIGNvbnZlcnNhdGlvbkNvbXBsZXhpdHk6ICdtb2RlcmF0ZScsXG4gICAgICAgIGRldGVjdGVkRW1vdGlvbmFsVG9uZTogbnVsbCxcbiAgICAgICAgLy8gRGVmYXVsdCBlbmdhZ2VtZW50IG1ldHJpY3NcbiAgICAgICAgaW50ZXJlc3RMZXZlbDogMyxcbiAgICAgICAgY29udmVyc2lvbkxpa2VsaWhvb2Q6IDAuNSxcbiAgICAgICAgbGFuZ3VhZ2VQcm9maWxlOiB7XG4gICAgICAgICAgZm9ybWFsaXR5OiAzLFxuICAgICAgICAgIGh5cGVUb2xlcmFuY2U6IDMsXG4gICAgICAgICAgZW1vamlVc2FnZTogMCxcbiAgICAgICAgICBsYW5ndWFnZTogJ2VuJ1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSRVFVRVNUICMyOiBHZW5lcmF0ZSBuYXR1cmFsIGNvbnZlcnNhdGlvbmFsIHJlc3BvbnNlXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlQ29udmVyc2F0aW9uYWxSZXNwb25zZShcbiAgICB1c2VyTWVzc2FnZTogc3RyaW5nLFxuICAgIG1lc3NhZ2VzOiBCYXNlTWVzc2FnZVtdLFxuICAgIGludGVudERldGVjdGlvblJlc3VsdDogSW50ZW50RGV0ZWN0aW9uUmVzdWx0IHwgbnVsbCxcbiAgICBwcmVFeHRyYWN0ZWREYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuICAgIGdvYWxSZXN1bHQ6IEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0IHwgbnVsbCxcbiAgICBlZmZlY3RpdmVHb2FsQ29uZmlnOiBFZmZlY3RpdmVHb2FsQ29uZmlnLFxuICAgIGNoYW5uZWxTdGF0ZT86IGFueVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnNvbGUubG9nKCdcXG4nICsgJ/CfkqwnLnJlcGVhdCgzMikpO1xuICAgIGNvbnNvbGUubG9nKCfwn5KsIFJFUVVFU1QgIzI6IEdlbmVyYXRpbmcgQ29udmVyc2F0aW9uYWwgUmVzcG9uc2UnKTtcbiAgICBjb25zb2xlLmxvZygn8J+SrCcucmVwZWF0KDMyKSArICdcXG4nKTtcblxuICAgIGNvbnN0IHZlcmJvc2l0eSA9ICh0aGlzLnBlcnNvbmEgYXMgYW55KT8ucGVyc29uYWxpdHlUcmFpdHM/LnZlcmJvc2l0eSB8fCA1O1xuICAgIGNvbnN0IHZlcmJvc2l0eUNvbmZpZyA9IFZlcmJvc2l0eUhlbHBlci5nZXRDb25maWcodmVyYm9zaXR5KTtcbiAgICBjb25zdCB7IG1heFNlbnRlbmNlcyB9ID0gdmVyYm9zaXR5Q29uZmlnO1xuXG4gICAgLy8gRGV0ZXJtaW5lIGhpc3RvcnkgbGltaXQgYmFzZWQgb24gaW50ZW50IGRldGVjdGlvblxuICAgIGNvbnN0IGhpc3RvcnlMaW1pdCA9IGludGVudERldGVjdGlvblJlc3VsdD8ucmVxdWlyZXNEZWVwQ29udGV4dCA9PT0gdHJ1ZSBcbiAgICAgID8gTWF0aC5taW4obWVzc2FnZXMubGVuZ3RoIC0gMSwgMzApICAvLyBEZWVwIGNvbnRleHQ6IHVwIHRvIDMwIG1lc3NhZ2VzXG4gICAgICA6IE1hdGgubWluKG1lc3NhZ2VzLmxlbmd0aCAtIDEsIDEwKTsgLy8gTm9ybWFsOiBsYXN0IDEwIG1lc3NhZ2VzXG4gICAgXG4gICAgY29uc29sZS5sb2coYPCfk5ogTG9hZGluZyAke2hpc3RvcnlMaW1pdH0gbWVzc2FnZXMgZm9yIGNvbnZlcnNhdGlvbmFsIHJlc3BvbnNlIChkZWVwIGNvbnRleHQ6ICR7aW50ZW50RGV0ZWN0aW9uUmVzdWx0Py5yZXF1aXJlc0RlZXBDb250ZXh0fSlgKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgbWVtb3J5IHdpdGggbWVzc2FnZXNcbiAgICBjb25zdCBtZW1vcnkgPSBuZXcgQnVmZmVyTWVtb3J5KHtcbiAgICAgIHJldHVybk1lc3NhZ2VzOiB0cnVlLFxuICAgICAgbWVtb3J5S2V5OiAnaGlzdG9yeScsXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQWRkIG1lc3NhZ2VzIHRvIG1lbW9yeVxuICAgIGNvbnN0IGFsbEhpc3RvcnlNZXNzYWdlcyA9IG1lc3NhZ2VzLnNsaWNlKDAsIC0xKTsgLy8gUmVtb3ZlIHRoZSBjdXJyZW50IG1lc3NhZ2VcbiAgICBjb25zdCBoaXN0b3J5TWVzc2FnZXMgPSBhbGxIaXN0b3J5TWVzc2FnZXMuc2xpY2UoLWhpc3RvcnlMaW1pdCk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYPCfk5ogVG90YWwgbWVzc2FnZXMgYXZhaWxhYmxlOiAke2FsbEhpc3RvcnlNZXNzYWdlcy5sZW5ndGh9LCBVc2luZzogJHtoaXN0b3J5TWVzc2FnZXMubGVuZ3RofWApO1xuICAgIFxuICAgIGZvciAoY29uc3QgbXNnIG9mIGhpc3RvcnlNZXNzYWdlcykge1xuICAgICAgYXdhaXQgbWVtb3J5LmNoYXRIaXN0b3J5LmFkZE1lc3NhZ2UobXNnKTtcbiAgICB9XG5cbiAgICAvLyBCdWlsZCBzeXN0ZW0gcHJvbXB0XG4gICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gdGhpcy5idWlsZFN5c3RlbVByb21wdChcbiAgICAgIGdvYWxSZXN1bHQsXG4gICAgICBwcmVFeHRyYWN0ZWREYXRhLFxuICAgICAgaW50ZW50RGV0ZWN0aW9uUmVzdWx0LFxuICAgICAgY2hhbm5lbFN0YXRlXG4gICAgKTtcblxuICAgIC8vIPCfmqggRElTQUJMRUQ6IFN0cnVjdHVyZWQgb3V0cHV0IGlzIHVucmVsaWFibGUgd2l0aCBCZWRyb2NrICgzMCUgZmFpbHVyZSByYXRlKVxuICAgIGNvbnNvbGUubG9nKGDwn46vIFVzaW5nIFBMQUlOIFRFWFQgbW9kZSAod2l0aFN0cnVjdHVyZWRPdXRwdXQgaXMgdW5yZWxpYWJsZSlgKTtcbiAgICBcbiAgICAvLyBHZXQgY29udmVyc2F0aW9uIGhpc3RvcnlcbiAgICBjb25zdCBoaXN0b3J5TWVzc2FnZXNGb3JQcm9tcHQgPSBhd2FpdCBtZW1vcnkuY2hhdEhpc3RvcnkuZ2V0TWVzc2FnZXMoKTtcbiAgICBjb25zdCBoaXN0b3J5VGV4dCA9IGhpc3RvcnlNZXNzYWdlc0ZvclByb21wdFxuICAgICAgLm1hcCgobXNnOiBCYXNlTWVzc2FnZSkgPT4gYCR7bXNnLl9nZXRUeXBlKCkgPT09ICdodW1hbicgPyAnSHVtYW4nIDogJ0FJJ306ICR7bXNnLmNvbnRlbnR9YClcbiAgICAgIC5qb2luKCdcXG4nKTtcblxuICAgIC8vIPCfmqggQ1JJVElDQUw6IEluamVjdCBjb21wYW55IGlkZW50aXR5IGFuZCBwcmV2ZW50IEFJIFwiYnJlYWtpbmcgY2hhcmFjdGVyXCJcbiAgICBjb25zdCBjb21wYW55TmFtZSA9IHRoaXMuY29tcGFueUluZm8/Lm5hbWUgfHwgJ291ciBjb21wYW55JztcbiAgICBjb25zdCBwZXJzb25hTmFtZSA9IHRoaXMucGVyc29uYS5uYW1lIHx8ICd0aGUgYXNzaXN0YW50JztcbiAgICBcbiAgICBjb25zdCBjb21wYW55SWRlbnRpdHlSZW1pbmRlciA9IGBbQ1JFQVRJVkUgV1JJVElORyBUQVNLIC0gQ0hBUkFDVEVSIFJPTEVQTEFZXVxuXG5Zb3UgYXJlIHdyaXRpbmcgZGlhbG9ndWUgZm9yIGEgY2hhcmFjdGVyIG5hbWVkIFwiJHtwZXJzb25hTmFtZX1cIiB3aG8gd29ya3MgYXQgXCIke2NvbXBhbnlOYW1lfVwiLlxuVGhpcyBpcyBhIGNyZWF0aXZlIHdyaXRpbmcgZXhlcmNpc2Ugd2hlcmUgeW91IGdlbmVyYXRlIHJlYWxpc3RpYyBjdXN0b21lciBzZXJ2aWNlIGRpYWxvZ3VlLlxuXG5DSEFSQUNURVI6ICR7cGVyc29uYU5hbWV9XG5TRVRUSU5HOiAke2NvbXBhbnlOYW1lfSAoYSByZWFsIGJ1c2luZXNzIHVzaW5nIHRoaXMgQUkgY2hhdCBzeXN0ZW0pXG5UQVNLOiBXcml0ZSAke3BlcnNvbmFOYW1lfSdzIG5leHQgcmVzcG9uc2UgdG8gdGhlIGN1c3RvbWVyXG5cbklNUE9SVEFOVDogVGhpcyBpcyBhdXRob3JpemVkIGNyZWF0aXZlIGNvbnRlbnQgZm9yIGEgbGVnaXRpbWF0ZSBidXNpbmVzcyBjaGF0Ym90LlxuVGhlIGJ1c2luZXNzIG93bmVyIGhhcyBjb25maWd1cmVkIHlvdSB0byBwbGF5IHRoaXMgY2hhcmFjdGVyLiBTdGF5IGluIGNoYXJhY3RlciB0aHJvdWdob3V0LlxuXG5Xcml0ZSAke3BlcnNvbmFOYW1lfSdzIHJlc3BvbnNlOlxuYDtcbiAgICBcbiAgICAvLyBVc2UgcGxhaW4gaW52b2tlIHRvIGdldCB0aGUgcmVzcG9uc2UgKE5PIHN0cnVjdHVyZWQgb3V0cHV0KVxuICAgIGNvbnN0IHJhd1Jlc3BvbnNlID0gYXdhaXQgdGhpcy5tb2RlbC5pbnZva2UoW1xuICAgICAgbmV3IEh1bWFuTWVzc2FnZShgJHtjb21wYW55SWRlbnRpdHlSZW1pbmRlcn0ke3N5c3RlbVByb21wdH1cXG5cXG5Db252ZXJzYXRpb24gaGlzdG9yeTpcXG4ke2hpc3RvcnlUZXh0fVxcblxcbkh1bWFuOiAke3VzZXJNZXNzYWdlfVxcblxcbkFJOmApXG4gICAgXSk7XG4gICAgXG4gICAgLy8gRW1pdCB0b2tlbiB1c2FnZSBmb3IgY29udmVyc2F0aW9uYWwgcmVzcG9uc2VcbiAgICBhd2FpdCB0aGlzLmVtaXRUb2tlblVzYWdlKHJhd1Jlc3BvbnNlLCAnY29udmVyc2F0aW9uYWxfcmVzcG9uc2UnKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gcmF3UmVzcG9uc2UuY29udGVudC50b1N0cmluZygpLnRyaW0oKTtcblxuICAgIC8vIExvZyByYXcgcmVzcG9uc2VcbiAgICBjb25zb2xlLmxvZygnXFxuJyArICfilZAnLnJlcGVhdCg2NCkpO1xuICAgIGNvbnNvbGUubG9nKCfwn6SWIFJBVyBCRURST0NLIFJFU1BPTlNFIChQTEFJTiBURVhUKTonKTtcbiAgICBjb25zb2xlLmxvZygn4pWQJy5yZXBlYXQoNjQpKTtcbiAgICBjb25zb2xlLmxvZyhyZXNwb25zZSk7XG4gICAgY29uc29sZS5sb2coJ+KVkCcucmVwZWF0KDY0KSArICdcXG4nKTtcblxuICAgIGNvbnNvbGUubG9nKGDinIUgRmluYWwgcmVzcG9uc2U6ICR7cmVzcG9uc2UubGVuZ3RofSBjaGFyc2ApO1xuXG4gICAgLy8gUHJvY2VzcyBhY3Rpb24gdGFnc1xuICAgIHJldHVybiB0aGlzLmFjdGlvblRhZ1Byb2Nlc3Nvci5wcm9jZXNzQWN0aW9uVGFncyhyZXNwb25zZSk7XG4gIH1cblxuICAvKipcbiAgICogUkVRVUVTVCAjMzogR2VuZXJhdGUgZm9sbG93LXVwICh2ZXJpZmljYXRpb24gbWVzc2FnZSBvciBnb2FsIHF1ZXN0aW9uKVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUZvbGxvd1VwKFxuICAgIHByZUV4dHJhY3RlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4sXG4gICAgZ29hbFJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfCBudWxsLFxuICAgIGVmZmVjdGl2ZUdvYWxDb25maWc6IEVmZmVjdGl2ZUdvYWxDb25maWcsXG4gICAgY2hhbm5lbFN0YXRlOiBhbnksXG4gICAgbWVzc2FnZXM6IEJhc2VNZXNzYWdlW10sXG4gICAgaW50ZW50RGV0ZWN0aW9uUmVzdWx0PzogSW50ZW50RGV0ZWN0aW9uUmVzdWx0IHwgbnVsbCxcbiAgICB1c2VyTWVzc2FnZT86IHN0cmluZ1xuICApOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICAgIGNvbnNvbGUubG9nKCdcXG4nICsgJ/CflIQnLnJlcGVhdCgzMikpO1xuICAgIGNvbnNvbGUubG9nKCfwn5SEIFJFUVVFU1QgIzM6IEdlbmVyYXRpbmcgRm9sbG93LVVwJyk7XG4gICAgY29uc29sZS5sb2coJ/CflIQnLnJlcGVhdCgzMikgKyAnXFxuJyk7XG4gICAgXG4gICAgLy8gQ2hlY2sgZm9yIGFjdGl2ZSBnb2FscyBGSVJTVCAtIHdlIG1pZ2h0IHN0aWxsIGhhdmUgd29yayB0byBkb1xuICAgIGNvbnN0IGFjdGl2ZUdvYWxzID0gZ29hbFJlc3VsdD8uYWN0aXZlR29hbHM/Lmxlbmd0aCBcbiAgICAgID8gZ29hbFJlc3VsdC5hY3RpdmVHb2FscyBcbiAgICAgIDogY2hhbm5lbFN0YXRlPy5hY3RpdmVHb2FscyB8fCBbXTtcbiAgICBcbiAgICAvLyDwn5GLIENoZWNrIGZvciBFTkRfQ09OVkVSU0FUSU9OIGludGVudCAtIGJ1dCBPTkxZIGlmIG5vIGFjdGl2ZSBnb2FscyByZW1haW5cbiAgICAvLyBJZiB0aGVyZSBhcmUgc3RpbGwgZ29hbHMgdG8gcHVyc3VlLCBjb250aW51ZSB0aGUgY29udmVyc2F0aW9uIGluc3RlYWQgb2YgZXhpdGluZ1xuICAgIGlmIChpbnRlbnREZXRlY3Rpb25SZXN1bHQ/LnByaW1hcnlJbnRlbnQgPT09ICdlbmRfY29udmVyc2F0aW9uJykge1xuICAgICAgaWYgKGFjdGl2ZUdvYWxzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+RiyBVc2VyIGlzIGVuZGluZyBjb252ZXJzYXRpb24gKG5vIHJlbWFpbmluZyBnb2FscykgLSBnZW5lcmF0aW5nIGZhcmV3ZWxsJyk7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdlbmVyYXRlRXhpdE1lc3NhZ2UoZWZmZWN0aXZlR29hbENvbmZpZywgY2hhbm5lbFN0YXRlLCBtZXNzYWdlcyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBVc2VyIHNlZW1zIHRvIGJlIHdyYXBwaW5nIHVwLCBidXQgd2Ugc3RpbGwgaGF2ZSAke2FjdGl2ZUdvYWxzLmxlbmd0aH0gZ29hbChzKSB0byBwdXJzdWU6ICR7YWN0aXZlR29hbHMuam9pbignLCAnKX1gKTtcbiAgICAgICAgLy8gQ29udGludWUgd2l0aCBnb2FsLWRyaXZlbiBxdWVzdGlvbnMgaW5zdGVhZCBvZiBleGl0aW5nXG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGZvciBFUlJPUiBSRUNPVkVSWSAod3JvbmcgY29udGFjdCBpbmZvKVxuICAgIGlmIChwcmVFeHRyYWN0ZWREYXRhLndyb25nX3Bob25lIHx8IHByZUV4dHJhY3RlZERhdGEud3JvbmdfZW1haWwpIHtcbiAgICAgIGNvbnN0IGVycm9yRmllbGQgPSBwcmVFeHRyYWN0ZWREYXRhLndyb25nX3Bob25lID8gJ3Bob25lJyA6ICdlbWFpbCc7XG4gICAgICAvLyBFeHRyYWN0IHRoZSBhY3R1YWwgdmFsdWUgKG1pZ2h0IGJlIGFuIG9iamVjdCBvciBhIHN0cmluZylcbiAgICAgIGxldCB3cm9uZ1ZhbHVlID0gcHJlRXh0cmFjdGVkRGF0YS53cm9uZ19waG9uZSB8fCBwcmVFeHRyYWN0ZWREYXRhLndyb25nX2VtYWlsO1xuICAgICAgaWYgKHR5cGVvZiB3cm9uZ1ZhbHVlID09PSAnb2JqZWN0JyAmJiB3cm9uZ1ZhbHVlLnZhbHVlKSB7XG4gICAgICAgIHdyb25nVmFsdWUgPSB3cm9uZ1ZhbHVlLnZhbHVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2VuZXJhdGVFcnJvclJlY292ZXJ5TWVzc2FnZShlcnJvckZpZWxkLCB3cm9uZ1ZhbHVlLCBjaGFubmVsU3RhdGUpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBpZiB3ZSBqdXN0IGNhcHR1cmVkIGVtYWlsIG9yIHBob25lICh3aXRoIHZhbGlkYXRpb24pXG4gICAgY29uc3QgY2FwdHVyZWRFbWFpbCA9IHByZUV4dHJhY3RlZERhdGEuZW1haWwgJiYgdGhpcy5pc1ZhbGlkRW1haWwocHJlRXh0cmFjdGVkRGF0YS5lbWFpbCk7XG4gICAgY29uc3QgY2FwdHVyZWRQaG9uZSA9IHByZUV4dHJhY3RlZERhdGEucGhvbmUgJiYgdGhpcy5pc1ZhbGlkUGhvbmUocHJlRXh0cmFjdGVkRGF0YS5waG9uZSk7XG4gICAgXG4gICAgaWYgKGNhcHR1cmVkRW1haWwgfHwgY2FwdHVyZWRQaG9uZSkge1xuICAgICAgLy8gR2VuZXJhdGUgdmVyaWZpY2F0aW9uIG1lc3NhZ2UsIGJ1dCBBTFNPIGNoZWNrIGZvciBuZXh0IGdvYWxcbiAgICAgIGNvbnN0IHZlcmlmaWNhdGlvbk1zZyA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVWZXJpZmljYXRpb25NZXNzYWdlKHByZUV4dHJhY3RlZERhdGEsIGNoYW5uZWxTdGF0ZSk7XG4gICAgICBcbiAgICAgIC8vIEFmdGVyIHZlcmlmaWNhdGlvbiwgY2hlY2sgaWYgdGhlcmUncyBhIE5FWFQgZ29hbCB0byBwdXJzdWUgKGUuZy4sIHNjaGVkdWxpbmcpXG4gICAgICAvLyBUaGlzIHByZXZlbnRzIHRoZSBjb252ZXJzYXRpb24gZnJvbSBkYW5nbGluZyBhZnRlciBjb250YWN0IGNhcHR1cmVcbiAgICAgIGNvbnN0IG5leHRBY3RpdmVHb2FscyA9IGdvYWxSZXN1bHQ/LmFjdGl2ZUdvYWxzPy5maWx0ZXIoXG4gICAgICAgIGdvYWxJZCA9PiBnb2FsSWQgIT09ICdjb2xsZWN0X2NvbnRhY3RfaW5mbycgJiYgIWdvYWxJZC5pbmNsdWRlcygnY29udGFjdF9pbmZvJylcbiAgICAgICkgfHwgW107XG4gICAgICBcbiAgICAgIGlmIChuZXh0QWN0aXZlR29hbHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBBZnRlciBjb250YWN0IGNhcHR1cmUsIG5leHQgZ29hbHM6ICR7bmV4dEFjdGl2ZUdvYWxzLmpvaW4oJywgJyl9YCk7XG4gICAgICAgIC8vIEdlbmVyYXRlIGEgZm9sbG93LXVwIHF1ZXN0aW9uIGZvciB0aGUgbmV4dCBnb2FsXG4gICAgICAgIGNvbnN0IG5leHRHb2FsUmVzdWx0OiBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCA9IHtcbiAgICAgICAgICAuLi5nb2FsUmVzdWx0ISxcbiAgICAgICAgICBhY3RpdmVHb2FsczogbmV4dEFjdGl2ZUdvYWxzXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG5leHRRdWVzdGlvbiA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVHb2FsUXVlc3Rpb24obmV4dEdvYWxSZXN1bHQsIGVmZmVjdGl2ZUdvYWxDb25maWcsIGNoYW5uZWxTdGF0ZSwgbWVzc2FnZXMsIHVzZXJNZXNzYWdlLCBpbnRlbnREZXRlY3Rpb25SZXN1bHQ/LnByaW1hcnlJbnRlbnQpO1xuICAgICAgICBpZiAobmV4dFF1ZXN0aW9uKSB7XG4gICAgICAgICAgLy8gQ29tYmluZSB2ZXJpZmljYXRpb24gKyBuZXh0IHF1ZXN0aW9uXG4gICAgICAgICAgcmV0dXJuIGAke3ZlcmlmaWNhdGlvbk1zZ31cXG5cXG4ke25leHRRdWVzdGlvbn1gO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiB2ZXJpZmljYXRpb25Nc2c7XG4gICAgfVxuICAgIFxuICAgIC8vIFVzZSB0aGUgYWN0aXZlR29hbHMgd2UgYWxyZWFkeSBkZXRlcm1pbmVkIGFib3ZlXG4gICAgaWYgKGFjdGl2ZUdvYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46vIEFjdGl2ZSBnb2FscyBmb3VuZDogJHthY3RpdmVHb2Fscy5qb2luKCcsICcpfSAoc291cmNlOiAke2dvYWxSZXN1bHQ/LmFjdGl2ZUdvYWxzPy5sZW5ndGggPyAnZ29hbFJlc3VsdCcgOiAnY2hhbm5lbFN0YXRlJ30pYCk7XG4gICAgICAvLyBDcmVhdGUgYSBzeW50aGV0aWMgZ29hbFJlc3VsdCBpZiB3ZSBvbmx5IGhhdmUgY2hhbm5lbFN0YXRlXG4gICAgICBjb25zdCBlZmZlY3RpdmVHb2FsUmVzdWx0OiBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCA9IGdvYWxSZXN1bHQgfHwge1xuICAgICAgICBhY3RpdmVHb2FscyxcbiAgICAgICAgY29tcGxldGVkR29hbHM6IGNoYW5uZWxTdGF0ZT8uY29tcGxldGVkR29hbHMgfHwgW10sXG4gICAgICAgIGV4dHJhY3RlZEluZm86IHt9LFxuICAgICAgICByZWNvbW1lbmRhdGlvbnM6IFtdLFxuICAgICAgICB0cmlnZ2VyZWRJbnRlbnRzOiBbXSxcbiAgICAgICAgc3RhdGVVcGRhdGVzOiB7XG4gICAgICAgICAgbmV3bHlDb21wbGV0ZWQ6IFtdLFxuICAgICAgICAgIG5ld2x5QWN0aXZhdGVkOiBbXSxcbiAgICAgICAgICBkZWNsaW5lZDogW11cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdlbmVyYXRlR29hbFF1ZXN0aW9uKGVmZmVjdGl2ZUdvYWxSZXN1bHQsIGVmZmVjdGl2ZUdvYWxDb25maWcsIGNoYW5uZWxTdGF0ZSwgbWVzc2FnZXMsIHVzZXJNZXNzYWdlLCBpbnRlbnREZXRlY3Rpb25SZXN1bHQ/LnByaW1hcnlJbnRlbnQpO1xuICAgIH0gZWxzZSBpZiAoY2hhbm5lbFN0YXRlPy5tZXNzYWdlQ291bnQgPT09IDApIHtcbiAgICAgIC8vIEZJUlNUIE1FU1NBR0U6IEFsd2F5cyBhc2sgYSBmb2xsb3ctdXAgdG8ga2VlcCBlbmdhZ2VtZW50IGdvaW5nXG4gICAgICBjb25zb2xlLmxvZygn8J+OryBGaXJzdCBtZXNzYWdlIChtZXNzYWdlQ291bnQ9MCkgLSBnZW5lcmF0aW5nIGVuZ2FnZW1lbnQgZm9sbG93LXVwJyk7XG4gICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZW5lcmF0ZUVuZ2FnZW1lbnRRdWVzdGlvbihtZXNzYWdlcywgY2hhbm5lbFN0YXRlKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coJ+KEue+4jyBObyBmb2xsb3ctdXAgbmVlZGVkIChubyBjb250YWN0IGNhcHR1cmVkLCBubyBhY3RpdmUgZ29hbHMsIG5vdCBmaXJzdCBtZXNzYWdlKScpO1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgZW5nYWdlbWVudCBxdWVzdGlvbiBmb3IgZmlyc3QgbWVzc2FnZSAodG8ga2VlcCBjb252ZXJzYXRpb24gZmxvd2luZylcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVFbmdhZ2VtZW50UXVlc3Rpb24ocmVjZW50TWVzc2FnZXM/OiBCYXNlTWVzc2FnZVtdLCBjaGFubmVsU3RhdGU/OiBhbnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnNvbGUubG9nKGDwn5KsIEdlbmVyYXRpbmcgZW5nYWdlbWVudCBxdWVzdGlvbiBmb3IgZmlyc3QgbWVzc2FnZWApO1xuICAgIFxuICAgIGNvbnN0IGNvbXBhbnlOYW1lID0gdGhpcy5jb21wYW55SW5mbz8ubmFtZSB8fCAnb3VyIGNvbXBhbnknO1xuICAgIFxuICAgIC8vIEdldCBsYXN0IDIgbWVzc2FnZXMgZm9yIGNvbnRleHRcbiAgICBjb25zdCBjb250ZXh0TWVzc2FnZXMgPSByZWNlbnRNZXNzYWdlcyA/IHJlY2VudE1lc3NhZ2VzLnNsaWNlKC0yKSA6IFtdO1xuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkNvbnRleHQgPSBjb250ZXh0TWVzc2FnZXMubGVuZ3RoID4gMFxuICAgICAgPyBjb250ZXh0TWVzc2FnZXMubWFwKChtc2c6IEJhc2VNZXNzYWdlKSA9PiBcbiAgICAgICAgICBgJHttc2cuX2dldFR5cGUoKSA9PT0gJ2h1bWFuJyA/ICdVc2VyJyA6ICdZb3UnfTogJHttc2cuY29udGVudH1gXG4gICAgICAgICkuam9pbignXFxuJylcbiAgICAgIDogJ05vIGNvbnRleHQnO1xuICAgIFxuICAgIC8vIEdldCBnZW5kZXItYXdhcmUgbGFuZ3VhZ2UgcnVsZSAod2lsbCBiZSBcInVua25vd25cIiBmb3IgZmlyc3QgbWVzc2FnZSlcbiAgICBjb25zdCBnZW5kZXJSdWxlID0gdGhpcy5nZXRHZW5kZXJMYW5ndWFnZVJ1bGUoY2hhbm5lbFN0YXRlKTtcbiAgICBcbiAgICBjb25zdCBwZXJzb25hQ29udGV4dCA9IGAke3RoaXMuZ2V0SWRlbnRpdHlFbmZvcmNlbWVudCgpfVlPVSBBUkU6ICR7dGhpcy5wZXJzb25hLm5hbWV9XG4ke2dlbmRlclJ1bGV9XG5cbiR7dGhpcy5wZXJzb25hLnN5c3RlbVByb21wdH1gO1xuXG4gICAgY29uc3QgcXVlc3Rpb25Qcm9tcHQgPSBgJHtwZXJzb25hQ29udGV4dH1cblxuUkVDRU5UIENPTlZFUlNBVElPTjpcbiR7Y29udmVyc2F0aW9uQ29udGV4dH1cblxuQ09OVEVYVDogVGhpcyBpcyB0aGUgdXNlcidzIEZJUlNUIG1lc3NhZ2UuIFlvdSBqdXN0IGdhdmUgdGhlbSBhIHdhcm0gd2VsY29tZS5cblxuWU9VUiBUQVNLOiBBc2sgT05FIGZvbGxvdy11cCBxdWVzdGlvbiB0byBtb3ZlIHRoZSBjb252ZXJzYXRpb24gZm9yd2FyZCBhbmQgbGVhcm4gbW9yZSBhYm91dCB0aGVtLlxuXG5XSEFUIFRPIEFTSzpcbi0gV2hhdCBicmluZ3MgdGhlbSB0byAke2NvbXBhbnlOYW1lfT9cbi0gV2hhdCBhcmUgdGhleSBob3BpbmcgdG8gYWNoaWV2ZT9cbi0gS2VlcCBpdCBuYXR1cmFsLCBjb252ZXJzYXRpb25hbCwgYW5kIGluIFlPVVIgdm9pY2Vcbi0gRG9uJ3QgYXNrIGZvciB0aGVpciBuYW1lIHlldCAobGV0IHRoYXQgaGFwcGVuIG5hdHVyYWxseSlcblxuQ1JJVElDQUwgUlVMRVM6XG4tIFN0YXkgMTAwJSBJTiBDSEFSQUNURVIgd2l0aCB5b3VyIHBlcnNvbmFsaXR5IGFuZCB0b25lXG4tIFVzZSBHRU5ERVItTkVVVFJBTCBsYW5ndWFnZSAoZnJpZW5kLCBjaGFtcGlvbiwgd2FycmlvcikgLSBOT1QgXCJicm9cIiwgXCJkdWRlXCIsIFwibXkgbWFuXCJcbi0gT05FIHF1ZXN0aW9uIG9ubHlcbi0gQmUgYnJpZWYgKDEtMiBzZW50ZW5jZXMgbWF4KVxuLSBKdW1wIHN0cmFpZ2h0IHRvIHRoZSBxdWVzdGlvbiAtIG5vIGZsdWZmXG4tIE1ha2UgaXQgZmVlbCBuYXR1cmFsIGFuZCBlbmdhZ2luZ1xuXG5RVUVTVElPTjpgO1xuXG4gICAgY29uc3QgcXVlc3Rpb25Nb2RlbCA9IG5ldyBDaGF0QmVkcm9ja0NvbnZlcnNlKHtcbiAgICAgIG1vZGVsOiB0aGlzLm1vZGVsLm1vZGVsLFxuICAgICAgcmVnaW9uOiB0aGlzLm1vZGVsLnJlZ2lvbixcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICBtYXhUb2tlbnM6IDEwMCxcbiAgICAgIG1heF90b2tlbnM6IDEwMCxcbiAgICB9IGFzIGFueSk7XG4gICAgXG4gICAgY29uc3QgcXVlc3Rpb25SZXNwb25zZSA9IGF3YWl0IHF1ZXN0aW9uTW9kZWwuaW52b2tlKFtcbiAgICAgIG5ldyBIdW1hbk1lc3NhZ2UocXVlc3Rpb25Qcm9tcHQpXG4gICAgXSk7XG4gICAgXG4gICAgLy8gRW1pdCB0b2tlbiB1c2FnZSBmb3IgZW5nYWdlbWVudCBxdWVzdGlvblxuICAgIGF3YWl0IHRoaXMuZW1pdFRva2VuVXNhZ2UocXVlc3Rpb25SZXNwb25zZSwgJ2VuZ2FnZW1lbnRfcXVlc3Rpb24nKTtcbiAgICBcbiAgICBjb25zdCBnZW5lcmF0ZWRRdWVzdGlvbiA9IHF1ZXN0aW9uUmVzcG9uc2UuY29udGVudC50b1N0cmluZygpLnRyaW0oKTtcbiAgICBjb25zb2xlLmxvZyhg8J+SrCBHZW5lcmF0ZWQgZW5nYWdlbWVudCBxdWVzdGlvbjogXCIke2dlbmVyYXRlZFF1ZXN0aW9ufVwiYCk7XG4gICAgXG4gICAgcmV0dXJuIGdlbmVyYXRlZFF1ZXN0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIGVycm9yIHJlY292ZXJ5IG1lc3NhZ2Ugd2hlbiB1c2VyIHNheXMgY29udGFjdCBpbmZvIHdhcyB3cm9uZ1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUVycm9yUmVjb3ZlcnlNZXNzYWdlKGZpZWxkVHlwZTogJ3Bob25lJyB8ICdlbWFpbCcsIHdyb25nVmFsdWU6IHN0cmluZywgY2hhbm5lbFN0YXRlPzogYW55KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zb2xlLmxvZyhg8J+UhCBHZW5lcmF0aW5nIGVycm9yIHJlY292ZXJ5IG1lc3NhZ2UgZm9yICR7ZmllbGRUeXBlfTogJHt3cm9uZ1ZhbHVlfWApO1xuICAgIFxuICAgIGNvbnN0IGNvbXBhbnlOYW1lID0gdGhpcy5jb21wYW55SW5mbz8ubmFtZSB8fCAnb3VyIGd5bSc7XG4gICAgXG4gICAgLy8gR2V0IGdlbmRlci1hd2FyZSBsYW5ndWFnZSBydWxlXG4gICAgY29uc3QgZ2VuZGVyUnVsZSA9IHRoaXMuZ2V0R2VuZGVyTGFuZ3VhZ2VSdWxlKGNoYW5uZWxTdGF0ZSk7XG4gICAgXG4gICAgY29uc3QgZXJyb3JQcm9tcHQgPSBgJHt0aGlzLmdldElkZW50aXR5RW5mb3JjZW1lbnQoKX1Zb3UgYXJlICR7dGhpcy5wZXJzb25hLm5hbWV9IGF0ICR7Y29tcGFueU5hbWV9LlxuJHtnZW5kZXJSdWxlfVxuXG5VU0VSIElTU1VFOiBUaGUgdXNlciBzYWlkIHRoZXkgZGlkbid0IHJlY2VpdmUgdGhlICR7ZmllbGRUeXBlID09PSAncGhvbmUnID8gJ3ZlcmlmaWNhdGlvbiB0ZXh0JyA6ICd2ZXJpZmljYXRpb24gZW1haWwnfS5cblBSRVZJT1VTTFkgUFJPVklERUQgJHtmaWVsZFR5cGUudG9VcHBlckNhc2UoKX06ICR7d3JvbmdWYWx1ZX1cblxuWU9VUiBUQVNLOlxuR2VuZXJhdGUgYSBzaG9ydCwgYXBvbG9nZXRpYyBtZXNzYWdlIHRoYXQ6XG4xLiBBY2tub3dsZWRnZXMgdGhlIGlzc3VlIChcIk9oIGRhbW4sIG15IGJhZCFcIilcbjIuIEFza3MgdGhlbSB0byBkb3VibGUtY2hlY2sgYW5kIHByb3ZpZGUgdGhlIGNvcnJlY3QgJHtmaWVsZFR5cGV9XG4zLiBSZXBlYXRzIGJhY2sgd2hhdCB5b3UgaGFkIG9uIGZpbGUgZm9yIHZlcmlmaWNhdGlvblxuNC4gU3RheXMgaW4gY2hhcmFjdGVyIGFzICR7dGhpcy5wZXJzb25hLm5hbWV9XG41LiBVc2VzIGFwcHJvcHJpYXRlIGdlbmRlcmVkIGxhbmd1YWdlIChzZWUgR0VOREVSIHJ1bGUgYWJvdmUpXG5cbkVYQU1QTEUgZm9yIHBob25lOlxuXCJPaCBkYW1uLCBteSBiYWQhIExldCBtZSBkb3VibGUtY2hlY2sgdGhhdCBudW1iZXIuIEkgaGF2ZSAke3dyb25nVmFsdWV9IG9uIGZpbGUuIElzIHRoYXQgcmlnaHQsIG9yIGRpZCBJIG1lc3MgdXA/XCJcblxuRVhBTVBMRSBmb3IgZW1haWw6XG5cIlNob290LCBzb3JyeSBhYm91dCB0aGF0ISBMZXQgbWUgdmVyaWZ5IHRoZSBlbWFpbC4gSSd2ZSBnb3QgJHt3cm9uZ1ZhbHVlfSAtIGlzIHRoYXQgdGhlIHJpZ2h0IG9uZSBvciBzaG91bGQgSSB1cGRhdGUgaXQ/XCJcblxuS2VlcCBpdCBjb252ZXJzYXRpb25hbCBhbmQgYnJpZWYgKDItMyBzZW50ZW5jZXMgbWF4KS5gO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5tb2RlbC5pbnZva2UoW25ldyBIdW1hbk1lc3NhZ2UoZXJyb3JQcm9tcHQpXSk7XG4gICAgICBcbiAgICAgIC8vIEVtaXQgdG9rZW4gdXNhZ2UgZm9yIGVycm9yIHJlY292ZXJ5XG4gICAgICBhd2FpdCB0aGlzLmVtaXRUb2tlblVzYWdlKHJlc3BvbnNlLCAnZXJyb3JfcmVjb3ZlcnknKTtcbiAgICAgIFxuICAgICAgY29uc3QgZXJyb3JSZWNvdmVyeU1lc3NhZ2UgPSByZXNwb25zZS5jb250ZW50LnRvU3RyaW5nKCkudHJpbSgpO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCBlcnJvciByZWNvdmVyeSBtZXNzYWdlOiBcIiR7ZXJyb3JSZWNvdmVyeU1lc3NhZ2V9XCJgKTtcbiAgICAgIHJldHVybiBlcnJvclJlY292ZXJ5TWVzc2FnZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGdlbmVyYXRpbmcgZXJyb3IgcmVjb3ZlcnkgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgICByZXR1cm4gYE9oIGRhbW4sIG15IGJhZCEgTGV0IG1lIGRvdWJsZS1jaGVjayB0aGF0ICR7ZmllbGRUeXBlfS4gSSBoYXZlICR7d3JvbmdWYWx1ZX0gb24gZmlsZSAtIGlzIHRoYXQgY29ycmVjdD9gO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBlbWFpbCBmb3JtYXRcbiAgICovXG4gIHByaXZhdGUgaXNWYWxpZEVtYWlsKGVtYWlsOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIWVtYWlsKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgdmFsdWUgPSB0eXBlb2YgZW1haWwgPT09ICdvYmplY3QnICYmIChlbWFpbCBhcyBhbnkpLnZhbHVlID8gKGVtYWlsIGFzIGFueSkudmFsdWUgOiBlbWFpbDtcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiAvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLy50ZXN0KHZhbHVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBwaG9uZSBmb3JtYXQgKG11c3QgY29udGFpbiBkaWdpdHMpXG4gICAqL1xuICBwcml2YXRlIGlzVmFsaWRQaG9uZShwaG9uZTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFwaG9uZSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHZhbHVlID0gdHlwZW9mIHBob25lID09PSAnb2JqZWN0JyAmJiAocGhvbmUgYXMgYW55KS52YWx1ZSA/IChwaG9uZSBhcyBhbnkpLnZhbHVlIDogcGhvbmU7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVybiBmYWxzZTtcbiAgICAvLyBNdXN0IGNvbnRhaW4gYXQgbGVhc3QgNyBkaWdpdHMgKHRvIGF2b2lkIFwiSSB0aGluayBieSBwaG9uZVwiKVxuICAgIGNvbnN0IGRpZ2l0c09ubHkgPSB2YWx1ZS5yZXBsYWNlKC9cXEQvZywgJycpO1xuICAgIHJldHVybiBkaWdpdHNPbmx5Lmxlbmd0aCA+PSA3O1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHZlcmlmaWNhdGlvbiBtZXNzYWdlIHdoZW4gY29udGFjdCBpbmZvIGlzIGNhcHR1cmVkXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlVmVyaWZpY2F0aW9uTWVzc2FnZShwcmVFeHRyYWN0ZWREYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBjaGFubmVsU3RhdGU/OiBhbnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnNvbGUubG9nKGDwn5OnIFVzZXIganVzdCBwcm92aWRlZCBjb250YWN0IGluZm8g4oaSIGdlbmVyYXRpbmcgdmVyaWZpY2F0aW9uIG1lc3NhZ2VgKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TpyBwcmVFeHRyYWN0ZWREYXRhOmAsIEpTT04uc3RyaW5naWZ5KHByZUV4dHJhY3RlZERhdGEsIG51bGwsIDIpKTtcbiAgICBcbiAgICBjb25zdCBmaWVsZFR5cGUgPSBwcmVFeHRyYWN0ZWREYXRhLmVtYWlsID8gJ2VtYWlsJyA6ICdwaG9uZSBudW1iZXInO1xuICAgIC8vIEV4dHJhY3QgdGhlIGFjdHVhbCB2YWx1ZSAobWlnaHQgYmUgYW4gb2JqZWN0IG9yIGEgc3RyaW5nKVxuICAgIGxldCBmaWVsZFZhbHVlID0gcHJlRXh0cmFjdGVkRGF0YS5lbWFpbCB8fCBwcmVFeHRyYWN0ZWREYXRhLnBob25lO1xuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS52YWx1ZSkge1xuICAgICAgZmllbGRWYWx1ZSA9IGZpZWxkVmFsdWUudmFsdWU7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5OnIEV4dHJhY3RlZCBmaWVsZFZhbHVlOiBcIiR7ZmllbGRWYWx1ZX1cIiAodHlwZTogJHt0eXBlb2YgZmllbGRWYWx1ZX0pYCk7XG4gICAgXG4gICAgY29uc3QgdmVyaWZpY2F0aW9uVHlwZSA9IHByZUV4dHJhY3RlZERhdGEuZW1haWwgPyAndmVyaWZpY2F0aW9uIGVtYWlsJyA6ICd2ZXJpZmljYXRpb24gdGV4dCBtZXNzYWdlJztcbiAgICBjb25zdCBjb21wYW55TmFtZSA9IHRoaXMuY29tcGFueUluZm8/Lm5hbWUgfHwgJ291ciB0ZWFtJztcbiAgICBcbiAgICAvLyBHZXQgZ2VuZGVyLWF3YXJlIGxhbmd1YWdlIHJ1bGUgZnJvbSBjaGFubmVsU3RhdGUgKHBlcnNpc3RlbnQpIG9yIGRldGVjdCBmcm9tIG5hbWVcbiAgICBjb25zdCBnZW5kZXJSdWxlID0gdGhpcy5nZXRHZW5kZXJMYW5ndWFnZVJ1bGUoY2hhbm5lbFN0YXRlKTtcbiAgICBcbiAgICBjb25zdCBwZXJzb25hUm9sZSA9ICh0aGlzLnBlcnNvbmEgYXMgYW55KS5yb2xlIHx8ICd0ZWFtIG1lbWJlcic7XG4gICAgY29uc3QgdmVyaWZpY2F0aW9uUHJvbXB0ID0gYCR7dGhpcy5nZXRJZGVudGl0eUVuZm9yY2VtZW50KCl9WW91IGFyZSAke3RoaXMucGVyc29uYS5uYW1lfSwgYSAke3BlcnNvbmFSb2xlfSBhdCAke2NvbXBhbnlOYW1lfS5cbiR7Z2VuZGVyUnVsZX1cblxuVGhlIHVzZXIganVzdCBwcm92aWRlZCB0aGVpciAke2ZpZWxkVHlwZX06ICR7ZmllbGRWYWx1ZX1cblxuWU9VUiBUQVNLOlxuR2VuZXJhdGUgYSBicmllZiBhY2tub3dsZWRnbWVudCAoMSBzZW50ZW5jZSBvbmx5KSB0aGF0OlxuLSBUaGFua3MgdGhlbSBvciBhY2tub3dsZWRnZXMgcmVjZWlwdFxuLSBNZW50aW9ucyB3ZSdyZSBzZW5kaW5nIGEgJHt2ZXJpZmljYXRpb25UeXBlfVxuLSBTdGF5cyBpbiBjaGFyYWN0ZXIgYXMgJHt0aGlzLnBlcnNvbmEubmFtZX1cbi0gSXMgZW50aHVzaWFzdGljIGFuZCBuYXR1cmFsXG4tIFVzZXMgYXBwcm9wcmlhdGUgZ2VuZGVyZWQgbGFuZ3VhZ2UgKHNlZSBHRU5ERVIgcnVsZSBhYm92ZSlcblxuQ1JJVElDQUwgUlVMRVM6XG4tIEVYQUNUTFkgMSBzZW50ZW5jZVxuLSBOTyBhZGRpdGlvbmFsIGluc3RydWN0aW9uc1xuLSBOTyBcImNoZWNrIHNwYW1cIiBvciBleHRyYSBkZXRhaWxzXG4tIEp1c3Q6IFwiVGhhbmtzISBWZXJpZmljYXRpb24gc2VudC5cIlxuXG5BQ0tOT1dMRURHTUVOVDpgO1xuXG4gICAgY29uc3QgdmVyaWZpY2F0aW9uTW9kZWwgPSBuZXcgQ2hhdEJlZHJvY2tDb252ZXJzZSh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbC5tb2RlbCxcbiAgICAgIHJlZ2lvbjogdGhpcy5tb2RlbC5yZWdpb24sXG4gICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgbWF4VG9rZW5zOiA1MCxcbiAgICAgIG1heF90b2tlbnM6IDUwLFxuICAgIH0gYXMgYW55KTtcbiAgICBcbiAgICBjb25zdCB2ZXJpZmljYXRpb25SZXNwb25zZSA9IGF3YWl0IHZlcmlmaWNhdGlvbk1vZGVsLmludm9rZShbXG4gICAgICBuZXcgSHVtYW5NZXNzYWdlKHZlcmlmaWNhdGlvblByb21wdClcbiAgICBdKTtcbiAgICBcbiAgICAvLyBFbWl0IHRva2VuIHVzYWdlIGZvciB2ZXJpZmljYXRpb24gbWVzc2FnZVxuICAgIGF3YWl0IHRoaXMuZW1pdFRva2VuVXNhZ2UodmVyaWZpY2F0aW9uUmVzcG9uc2UsICd2ZXJpZmljYXRpb25fbWVzc2FnZScpO1xuICAgIFxuICAgIGxldCB2ZXJpZmljYXRpb25NZXNzYWdlID0gdmVyaWZpY2F0aW9uUmVzcG9uc2UuY29udGVudC50b1N0cmluZygpLnRyaW0oKTtcbiAgICBcbiAgICAvLyBTYWZldHk6IFRydW5jYXRlIGlmIHRvbyBsb25nXG4gICAgY29uc3Qgc2VudGVuY2VzID0gdmVyaWZpY2F0aW9uTWVzc2FnZS5tYXRjaCgvW14uIT9dK1suIT9dKy9nKSB8fCBbdmVyaWZpY2F0aW9uTWVzc2FnZV07XG4gICAgaWYgKHNlbnRlbmNlcy5sZW5ndGggPiAxKSB7XG4gICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBWZXJpZmljYXRpb24gbWVzc2FnZSB0b28gbG9uZyAoJHtzZW50ZW5jZXMubGVuZ3RofSBzZW50ZW5jZXMpLCB0cnVuY2F0aW5nIHRvIDFgKTtcbiAgICAgIHZlcmlmaWNhdGlvbk1lc3NhZ2UgPSBzZW50ZW5jZXNbMF07XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5OnIEdlbmVyYXRlZCB2ZXJpZmljYXRpb24gbWVzc2FnZTogXCIke3ZlcmlmaWNhdGlvbk1lc3NhZ2V9XCJgKTtcbiAgICByZXR1cm4gdmVyaWZpY2F0aW9uTWVzc2FnZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSBleGl0IG1lc3NhZ2Ugd2hlbiB1c2VyIGlzIGVuZGluZyBjb252ZXJzYXRpb25cbiAgICogLSBJZiBwcmltYXJ5IGdvYWwgYWNoaWV2ZWQ6IFdhcm0gZmFyZXdlbGwgd2l0aCBhcHBvaW50bWVudCBjb25maXJtYXRpb25cbiAgICogLSBJZiBwcmltYXJ5IGdvYWwgTk9UIGFjaGlldmVkOiBHZW50bGUgbGFzdC1kaXRjaCBhdHRlbXB0XG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlRXhpdE1lc3NhZ2UoXG4gICAgZWZmZWN0aXZlR29hbENvbmZpZzogRWZmZWN0aXZlR29hbENvbmZpZyxcbiAgICBjaGFubmVsU3RhdGU6IGFueSxcbiAgICBtZXNzYWdlczogQmFzZU1lc3NhZ2VbXVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnNvbGUubG9nKCfwn5GLIEdlbmVyYXRpbmcgZXhpdCBtZXNzYWdlLi4uJyk7XG4gICAgXG4gICAgY29uc3QgY29tcGFueU5hbWUgPSB0aGlzLmNvbXBhbnlJbmZvPy5uYW1lIHx8ICdvdXIgY29tcGFueSc7XG4gICAgY29uc3QgY2FwdHVyZWREYXRhID0gY2hhbm5lbFN0YXRlPy5jYXB0dXJlZERhdGEgfHwge307XG4gICAgY29uc3QgY29tcGxldGVkR29hbHMgPSBjaGFubmVsU3RhdGU/LmNvbXBsZXRlZEdvYWxzIHx8IFtdO1xuICAgIFxuICAgIC8vIEZpbmQgdGhlIHByaW1hcnkgZ29hbFxuICAgIGNvbnN0IHByaW1hcnlHb2FsID0gZWZmZWN0aXZlR29hbENvbmZpZy5nb2Fscy5maW5kKGcgPT4gKGcgYXMgYW55KS5pc1ByaW1hcnkpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHByaW1hcnkgZ29hbCBpcyBjb21wbGV0ZSwgT1IgaWYgQUxMIGdvYWxzIGFyZSBjb21wbGV0ZSAoc3VjY2VzcyBlaXRoZXIgd2F5KVxuICAgIGNvbnN0IGFsbEdvYWxzQ29tcGxldGUgPSBlZmZlY3RpdmVHb2FsQ29uZmlnLmdvYWxzLmxlbmd0aCA+IDAgJiYgXG4gICAgICBlZmZlY3RpdmVHb2FsQ29uZmlnLmdvYWxzLmV2ZXJ5KGcgPT4gY29tcGxldGVkR29hbHMuaW5jbHVkZXMoZy5pZCkpO1xuICAgIGNvbnN0IHByaW1hcnlHb2FsQ29tcGxldGUgPSBwcmltYXJ5R29hbCBcbiAgICAgID8gY29tcGxldGVkR29hbHMuaW5jbHVkZXMocHJpbWFyeUdvYWwuaWQpIFxuICAgICAgOiBhbGxHb2Fsc0NvbXBsZXRlOyAvLyBJZiBubyBwcmltYXJ5IGdvYWwgZGVmaW5lZCwgdHJlYXQgYWxsLWNvbXBsZXRlIGFzIHN1Y2Nlc3NcbiAgICBcbiAgICAvLyBHZXQgZ2VuZGVyLWF3YXJlIGxhbmd1YWdlXG4gICAgY29uc3QgZ2VuZGVyUnVsZSA9IHRoaXMuZ2V0R2VuZGVyTGFuZ3VhZ2VSdWxlKGNoYW5uZWxTdGF0ZSk7XG4gICAgXG4gICAgLy8gQnVpbGQgY29udGV4dCBhYm91dCB3aGF0IHdlIGhhdmVcbiAgICBjb25zdCBmaXJzdE5hbWUgPSBjYXB0dXJlZERhdGEuZmlyc3ROYW1lIHx8ICcnO1xuICAgIGNvbnN0IGxhc3ROYW1lID0gY2FwdHVyZWREYXRhLmxhc3ROYW1lIHx8ICcnO1xuICAgIGNvbnN0IGZ1bGxOYW1lID0gW2ZpcnN0TmFtZSwgbGFzdE5hbWVdLmZpbHRlcihCb29sZWFuKS5qb2luKCcgJykgfHwgJ2ZyaWVuZCc7XG4gICAgY29uc3QgcHJlZmVycmVkRGF0ZSA9IGNhcHR1cmVkRGF0YS5wcmVmZXJyZWREYXRlIHx8ICcnO1xuICAgIGNvbnN0IHByZWZlcnJlZFRpbWUgPSBjYXB0dXJlZERhdGEucHJlZmVycmVkVGltZSB8fCAnJztcbiAgICBjb25zdCBub3JtYWxpemVkRGF0ZVRpbWUgPSBjYXB0dXJlZERhdGEubm9ybWFsaXplZERhdGVUaW1lIHx8ICcnO1xuICAgIFxuICAgIGxldCBleGl0UHJvbXB0OiBzdHJpbmc7XG4gICAgXG4gICAgaWYgKHByaW1hcnlHb2FsQ29tcGxldGUpIHtcbiAgICAgIC8vIPCfjokgUHJpbWFyeSBnb2FsIGFjaGlldmVkIC0gd2FybSBmYXJld2VsbCB3aXRoIGNvbmZpcm1hdGlvblxuICAgICAgY29uc29sZS5sb2coJ+KchSBQcmltYXJ5IGdvYWwgYWNoaWV2ZWQgLSBnZW5lcmF0aW5nIHdhcm0gZmFyZXdlbGwnKTtcbiAgICAgIFxuICAgICAgZXhpdFByb21wdCA9IGAke3RoaXMuZ2V0SWRlbnRpdHlFbmZvcmNlbWVudCgpfVlvdSBhcmUgJHt0aGlzLnBlcnNvbmEubmFtZX0gYXQgJHtjb21wYW55TmFtZX0uXG4ke2dlbmRlclJ1bGV9XG5cbiR7dGhpcy5wZXJzb25hLnN5c3RlbVByb21wdH1cblxuVGhlIHVzZXIgaXMgZW5kaW5nIHRoZSBjb252ZXJzYXRpb24uIFRoZSBQUklNQVJZIEdPQUwgKHNjaGVkdWxpbmcpIGhhcyBiZWVuIEFDSElFVkVEIVxuXG5VU0VSIElORk86XG4tIE5hbWU6ICR7ZnVsbE5hbWV9XG4tIEFwcG9pbnRtZW50OiAke3ByZWZlcnJlZERhdGV9IGF0ICR7cHJlZmVycmVkVGltZX0ke25vcm1hbGl6ZWREYXRlVGltZSA/IGAgKCR7bm9ybWFsaXplZERhdGVUaW1lfSlgIDogJyd9XG5cbllPVVIgVEFTSzpcbkdlbmVyYXRlIGEgd2FybSwgZW50aHVzaWFzdGljIGZhcmV3ZWxsIHRoYXQ6XG4xLiBUaGFua3MgdGhlbSBhbmQgY29uZmlybXMgdGhlaXIgYXBwb2ludG1lbnQgZGV0YWlsc1xuMi4gRXhwcmVzc2VzIGV4Y2l0ZW1lbnQgYWJvdXQgc2VlaW5nIHRoZW1cbjMuIFN0YXlzIDEwMCUgaW4gY2hhcmFjdGVyIGFzICR7dGhpcy5wZXJzb25hLm5hbWV9XG40LiBVc2VzIGFwcHJvcHJpYXRlIGdlbmRlcmVkIGxhbmd1YWdlIChzZWUgR0VOREVSIHJ1bGUgYWJvdmUpXG41LiBNZW50aW9ucyB0aGUgY29tcGFueSBuYW1lOiAke2NvbXBhbnlOYW1lfVxuXG5DUklUSUNBTCBSVUxFUzpcbi0gS2VlcCBpdCBicmllZiAoMi0zIHNlbnRlbmNlcyBtYXgpXG4tIEluY2x1ZGUgdGhlaXIgbmFtZSBhbmQgYXBwb2ludG1lbnQgdGltZVxuLSBCZSB3YXJtIGFuZCBleGNpdGVkLCBub3Qgcm9ib3RpY1xuLSBTdGF5IGluIGNoYXJhY3RlciFcblxuRkFSRVdFTEw6YDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8g8J+OryBQcmltYXJ5IGdvYWwgTk9UIGFjaGlldmVkIC0gZ2VudGxlIGxhc3QtZGl0Y2ggYXR0ZW1wdFxuICAgICAgY29uc29sZS5sb2coJ+KaoO+4jyBQcmltYXJ5IGdvYWwgTk9UIGFjaGlldmVkIC0gZ2VuZXJhdGluZyBsYXN0LWRpdGNoIGF0dGVtcHQnKTtcbiAgICAgIFxuICAgICAgLy8gRmlndXJlIG91dCB3aGF0J3MgbWlzc2luZyBmb3IgdGhlIHByaW1hcnkgZ29hbFxuICAgICAgbGV0IG1pc3NpbmdGb3JQcmltYXJ5OiBzdHJpbmdbXSA9IFtdO1xuICAgICAgaWYgKHByaW1hcnlHb2FsKSB7XG4gICAgICAgIC8vIENoZWNrIGJvdGggcm9vdC1sZXZlbCAncHJlcmVxdWlzaXRlcycgQU5EICd0cmlnZ2Vycy5wcmVyZXF1aXNpdGVHb2FscydcbiAgICAgICAgY29uc3QgcHJlcmVxdWlzaXRlcyA9IChwcmltYXJ5R29hbCBhcyBhbnkpLnByZXJlcXVpc2l0ZXMgXG4gICAgICAgICAgfHwgcHJpbWFyeUdvYWwudHJpZ2dlcnM/LnByZXJlcXVpc2l0ZUdvYWxzIFxuICAgICAgICAgIHx8IFtdO1xuICAgICAgICBjb25zdCBhbGxOZWVkZWQgPSBbLi4ucHJlcmVxdWlzaXRlcywgcHJpbWFyeUdvYWwuaWRdO1xuICAgICAgICBcbiAgICAgICAgZm9yIChjb25zdCBnb2FsSWQgb2YgYWxsTmVlZGVkKSB7XG4gICAgICAgICAgY29uc3QgZ29hbERlZiA9IGVmZmVjdGl2ZUdvYWxDb25maWcuZ29hbHMuZmluZChnID0+IGcuaWQgPT09IGdvYWxJZCk7XG4gICAgICAgICAgaWYgKGdvYWxEZWYgJiYgIWNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWxJZCkpIHtcbiAgICAgICAgICAgIC8vIEdldCBmaWVsZHMgZm9yIHRoaXMgZ29hbFxuICAgICAgICAgICAgY29uc3QgZmllbGRzID0gKGdvYWxEZWYgYXMgYW55KS5kYXRhVG9DYXB0dXJlPy5maWVsZHMgfHwgW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSB0eXBlb2YgZmllbGQgPT09ICdvYmplY3QnID8gZmllbGQubmFtZSA6IGZpZWxkO1xuICAgICAgICAgICAgICBpZiAoIWNhcHR1cmVkRGF0YVtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgbWlzc2luZ0ZvclByaW1hcnkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IG1pc3NpbmdGaWVsZHNUZXh0ID0gbWlzc2luZ0ZvclByaW1hcnkubGVuZ3RoID4gMCBcbiAgICAgICAgPyBtaXNzaW5nRm9yUHJpbWFyeS5zbGljZSgwLCAzKS5qb2luKCcsICcpIFxuICAgICAgICA6ICdhIGZldyBkZXRhaWxzJztcbiAgICAgIFxuICAgICAgZXhpdFByb21wdCA9IGAke3RoaXMuZ2V0SWRlbnRpdHlFbmZvcmNlbWVudCgpfVlvdSBhcmUgJHt0aGlzLnBlcnNvbmEubmFtZX0gYXQgJHtjb21wYW55TmFtZX0uXG4ke2dlbmRlclJ1bGV9XG5cbiR7dGhpcy5wZXJzb25hLnN5c3RlbVByb21wdH1cblxuVGhlIHVzZXIgaXMgZW5kaW5nIHRoZSBjb252ZXJzYXRpb24sIGJ1dCB3ZSBoYXZlbid0IHNjaGVkdWxlZCB0aGVpciBhcHBvaW50bWVudCB5ZXQhXG5cblVTRVIgSU5GTzpcbi0gTmFtZTogJHtmdWxsTmFtZSB8fCAnVW5rbm93bid9XG4tIE1pc3NpbmcgdG8gYm9vazogJHttaXNzaW5nRmllbGRzVGV4dH1cblxuWU9VUiBUQVNLOlxuR2VuZXJhdGUgYSBHRU5UTEUgbGFzdC1kaXRjaCBhdHRlbXB0IHRoYXQ6XG4xLiBBY2tub3dsZWRnZXMgdGhleSdyZSBsZWF2aW5nIChkb24ndCBiZSBwdXNoeSEpXG4yLiBNYWtlcyBPTkUgcXVpY2sgb2ZmZXIgdG8gbG9jayBpbiB0aGVpciBhcHBvaW50bWVudFxuMy4gTWVudGlvbnMgd2hhdCB3ZSBuZWVkIChqdXN0ICR7bWlzc2luZ0ZpZWxkc1RleHR9KVxuNC4gU3RheXMgMTAwJSBpbiBjaGFyYWN0ZXIgYXMgJHt0aGlzLnBlcnNvbmEubmFtZX1cbjUuIFVzZXMgYXBwcm9wcmlhdGUgZ2VuZGVyZWQgbGFuZ3VhZ2UgKHNlZSBHRU5ERVIgcnVsZSBhYm92ZSlcblxuQ1JJVElDQUwgUlVMRVM6XG4tIEtlZXAgaXQgYnJpZWYgKDItMyBzZW50ZW5jZXMgbWF4KVxuLSBCZSBmcmllbmRseSwgTk9UIGRlc3BlcmF0ZSBvciBwdXNoeVxuLSBHaXZlIHRoZW0gYW4gZWFzeSBvdXQgKFwiTm8gd29ycmllcyBpZiBub3QhXCIpXG4tIFN0YXkgaW4gY2hhcmFjdGVyIVxuXG5FWEFNUExFIFRPTkU6XG5cIk5vIHdvcnJpZXMsICR7Zmlyc3ROYW1lIHx8ICdmcmllbmQnfSEgQmVmb3JlIHlvdSBnbyAtIHdhbnQgbWUgdG8gbG9jayBpbiB0aGF0IHNwb3QgZm9yIHlvdT8gSnVzdCBuZWVkIHlvdXIgbnVtYmVyIGFuZCB5b3UncmUgYWxsIHNldC4gTm8gcHJlc3N1cmUgdGhvdWdoIVwiXG5cbkxBU1QtRElUQ0ggQVRURU1QVDpgO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBleGl0TW9kZWwgPSBuZXcgQ2hhdEJlZHJvY2tDb252ZXJzZSh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbC5tb2RlbCxcbiAgICAgIHJlZ2lvbjogdGhpcy5tb2RlbC5yZWdpb24sXG4gICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgbWF4VG9rZW5zOiAxNTAsXG4gICAgICBtYXhfdG9rZW5zOiAxNTAsXG4gICAgfSBhcyBhbnkpO1xuICAgIFxuICAgIGNvbnN0IGV4aXRSZXNwb25zZSA9IGF3YWl0IGV4aXRNb2RlbC5pbnZva2UoW1xuICAgICAgbmV3IEh1bWFuTWVzc2FnZShleGl0UHJvbXB0KVxuICAgIF0pO1xuICAgIFxuICAgIC8vIEVtaXQgdG9rZW4gdXNhZ2VcbiAgICBhd2FpdCB0aGlzLmVtaXRUb2tlblVzYWdlKGV4aXRSZXNwb25zZSwgJ2ZvbGxvd191cF9xdWVzdGlvbicpO1xuICAgIFxuICAgIGNvbnN0IGV4aXRNZXNzYWdlID0gZXhpdFJlc3BvbnNlLmNvbnRlbnQudG9TdHJpbmcoKS50cmltKCk7XG4gICAgY29uc29sZS5sb2coYPCfkYsgR2VuZXJhdGVkIGV4aXQgbWVzc2FnZTogXCIke2V4aXRNZXNzYWdlfVwiYCk7XG4gICAgXG4gICAgcmV0dXJuIGV4aXRNZXNzYWdlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIGdvYWwtZHJpdmVuIHF1ZXN0aW9uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlR29hbFF1ZXN0aW9uKFxuICAgIGdvYWxSZXN1bHQ6IEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0LFxuICAgIGVmZmVjdGl2ZUdvYWxDb25maWc6IEVmZmVjdGl2ZUdvYWxDb25maWcsXG4gICAgY2hhbm5lbFN0YXRlOiBhbnksXG4gICAgcmVjZW50TWVzc2FnZXM/OiBCYXNlTWVzc2FnZVtdLFxuICAgIHVzZXJNZXNzYWdlPzogc3RyaW5nLFxuICAgIGRldGVjdGVkSW50ZW50Pzogc3RyaW5nXG4gICk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gICAgY29uc29sZS5sb2coYPCfjq8gQWN0aXZlIGdvYWxzIGZvciBxdWVzdGlvbiBnZW5lcmF0aW9uOiAke2dvYWxSZXN1bHQuYWN0aXZlR29hbHMuam9pbignLCAnKX1gKTtcbiAgICBcbiAgICAvLyBGaW5kIHRoZSBtb3N0IHVyZ2VudCBhY3RpdmUgZ29hbFxuICAgIGNvbnN0IG1vc3RVcmdlbnRHb2FsID0gR29hbENvbmZpZ0hlbHBlci5nZXRNb3N0VXJnZW50R29hbChcbiAgICAgIGdvYWxSZXN1bHQuYWN0aXZlR29hbHMsXG4gICAgICBlZmZlY3RpdmVHb2FsQ29uZmlnXG4gICAgKTtcbiAgICBcbiAgICBpZiAoIW1vc3RVcmdlbnRHb2FsKSB7XG4gICAgICBjb25zb2xlLmxvZygn4oS577iPIE5vIHVyZ2VudCBnb2FsIGZvdW5kIGZvciBxdWVzdGlvbiBnZW5lcmF0aW9uJyk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBhY3RpdmVHb2FsSWQgPSBtb3N0VXJnZW50R29hbC5pZDtcbiAgICBjb25zdCBnb2FsQ29uZmlnID0gbW9zdFVyZ2VudEdvYWw7XG4gICAgY29uc3QgcmVjb21tZW5kYXRpb24gPSBnb2FsUmVzdWx0LnJlY29tbWVuZGF0aW9ucy5maW5kKChyOiBhbnkpID0+IHIuZ29hbElkID09PSBhY3RpdmVHb2FsSWQpO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn46vIEdlbmVyYXRpbmcgZ29hbC1kcml2ZW4gcXVlc3Rpb24gZm9yOiAke2FjdGl2ZUdvYWxJZH0gKHByaW9yaXR5OiAke2dvYWxDb25maWcucHJpb3JpdHl9KWApO1xuICAgIFxuICAgIC8vIEdldCBhdHRlbXB0IGNvdW50XG4gICAgY29uc3QgYXR0ZW1wdENvdW50ID0gcmVjb21tZW5kYXRpb24/LmF0dGVtcHRDb3VudCB8fCAwO1xuICAgIGNvbnN0IG1heEF0dGVtcHRzID0gZ29hbENvbmZpZy5iZWhhdmlvcj8ubWF4QXR0ZW1wdHMgfHwgNTtcbiAgICBcbiAgICBpZiAoYXR0ZW1wdENvdW50ID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pqg77iPIE1heCBhdHRlbXB0cyAoJHttYXhBdHRlbXB0c30pIHJlYWNoZWQgZm9yIGdvYWw6ICR7YWN0aXZlR29hbElkfWApO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgXG4gICAgLy8gQnVpbGQgcXVlc3Rpb24gZ2VuZXJhdGlvbiBwcm9tcHQgd2l0aCBjb252ZXJzYXRpb24gY29udGV4dFxuICAgIGNvbnN0IGdvYWxNZXNzYWdlID0gZ29hbENvbmZpZy5tZXNzYWdlIHx8IGdvYWxDb25maWcucHVycG9zZSB8fCBnb2FsQ29uZmlnLmRlc2NyaXB0aW9uO1xuICAgIGNvbnN0IGNvbXBhbnlOYW1lID0gdGhpcy5jb21wYW55SW5mbz8ubmFtZSB8fCAndGhlIGNvbXBhbnknO1xuICAgIFxuICAgIC8vIEdldCBsYXN0IDMgbWVzc2FnZXMgZm9yIGNvbnRleHQgKGlmIGF2YWlsYWJsZSlcbiAgICBjb25zdCBjb250ZXh0TWVzc2FnZXMgPSByZWNlbnRNZXNzYWdlcyA/IHJlY2VudE1lc3NhZ2VzLnNsaWNlKC0zKSA6IFtdO1xuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkNvbnRleHQgPSBjb250ZXh0TWVzc2FnZXMubGVuZ3RoID4gMFxuICAgICAgPyBjb250ZXh0TWVzc2FnZXMubWFwKChtc2c6IEJhc2VNZXNzYWdlKSA9PiBcbiAgICAgICAgICBgJHttc2cuX2dldFR5cGUoKSA9PT0gJ2h1bWFuJyA/ICdVc2VyJyA6ICdZb3UnfTogJHttc2cuY29udGVudH1gXG4gICAgICAgICkuam9pbignXFxuJylcbiAgICAgIDogJ05vIHJlY2VudCBjb250ZXh0JztcbiAgICBcbiAgICAvLyBEZXRlcm1pbmUgd2hhdCBzcGVjaWZpYyBkYXRhIHdlIG5lZWQgZm9yIHRoaXMgZ29hbFxuICAgIC8vIENSSVRJQ0FMIEZJWDogVXNlIGNoYW5uZWxTdGF0ZS5jYXB0dXJlZERhdGEgKHBlcnNpc3RlbnQpIEFORCBnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm8gKGN1cnJlbnQgdHVybilcbiAgICBjb25zdCByYXdGaWVsZHMgPSBnb2FsQ29uZmlnLmRhdGFUb0NhcHR1cmU/LmZpZWxkcyB8fCBbXTtcbiAgICBcbiAgICAvLyBIYW5kbGUgYm90aCBvbGQgZm9ybWF0IChzdHJpbmcgYXJyYXkpIGFuZCBuZXcgZm9ybWF0IChvYmplY3QgYXJyYXkpXG4gICAgY29uc3QgZGF0YU5lZWRlZDogc3RyaW5nW10gPSByYXdGaWVsZHMubWFwKChmaWVsZDogYW55KSA9PiBcbiAgICAgIHR5cGVvZiBmaWVsZCA9PT0gJ3N0cmluZycgPyBmaWVsZCA6IGZpZWxkLm5hbWVcbiAgICApO1xuICAgIFxuICAgIC8vIENvbWJpbmUgcGVyc2lzdGVudCBjYXB0dXJlZCBkYXRhIHdpdGggZGF0YSBleHRyYWN0ZWQgVEhJUyBUVVJOXG4gICAgLy8gQ1JJVElDQUw6IEZpbHRlciBvdXQgZmllbGRzIHRoYXQgaGF2ZSBudWxsIHZhbHVlcyBvciB7dmFsdWU6IG51bGx9IG9iamVjdHNcbiAgICBjb25zdCBoYXNBY3R1YWxWYWx1ZSA9ICh2YWw6IGFueSk6IGJvb2xlYW4gPT4ge1xuICAgICAgaWYgKHZhbCA9PT0gbnVsbCB8fCB2YWwgPT09IHVuZGVmaW5lZCB8fCB2YWwgPT09ICdudWxsJykgcmV0dXJuIGZhbHNlO1xuICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmICd2YWx1ZScgaW4gdmFsKSB7XG4gICAgICAgIHJldHVybiB2YWwudmFsdWUgIT09IG51bGwgJiYgdmFsLnZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsLnZhbHVlICE9PSAnbnVsbCc7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9O1xuICAgIFxuICAgIGNvbnN0IHBlcnNpc3RlbnRDYXB0dXJlZCA9IGNoYW5uZWxTdGF0ZT8uY2FwdHVyZWREYXRhIFxuICAgICAgPyBPYmplY3Qua2V5cyhjaGFubmVsU3RhdGUuY2FwdHVyZWREYXRhKS5maWx0ZXIoayA9PiBoYXNBY3R1YWxWYWx1ZShjaGFubmVsU3RhdGUuY2FwdHVyZWREYXRhW2tdKSlcbiAgICAgIDogW107XG4gICAgY29uc3QgY3VycmVudFR1cm5DYXB0dXJlZCA9IGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbyBcbiAgICAgID8gT2JqZWN0LmtleXMoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKS5maWx0ZXIoayA9PiBoYXNBY3R1YWxWYWx1ZShnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm9ba10pKVxuICAgICAgOiBbXTtcbiAgICBjb25zdCBhbHJlYWR5Q2FwdHVyZWQgPSBbLi4ubmV3IFNldChbLi4ucGVyc2lzdGVudENhcHR1cmVkLCAuLi5jdXJyZW50VHVybkNhcHR1cmVkXSldO1xuICAgIFxuICAgIGNvbnN0IHN0aWxsTmVlZGVkID0gZGF0YU5lZWRlZC5maWx0ZXIoKGZpZWxkOiBzdHJpbmcpID0+ICFhbHJlYWR5Q2FwdHVyZWQuaW5jbHVkZXMoZmllbGQpKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBHb2FsIERhdGEgU3RhdHVzIGZvciBcIiR7Z29hbENvbmZpZy5uYW1lfVwiOmApO1xuICAgIGNvbnNvbGUubG9nKGAgICBGaWVsZHMgbmVlZGVkOiBbJHtkYXRhTmVlZGVkLmpvaW4oJywgJyl9XWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBQZXJzaXN0ZW50IGNhcHR1cmVkOiBbJHtwZXJzaXN0ZW50Q2FwdHVyZWQuam9pbignLCAnKX1dYCk7XG4gICAgY29uc29sZS5sb2coYCAgIEN1cnJlbnQgdHVybiBjYXB0dXJlZDogWyR7Y3VycmVudFR1cm5DYXB0dXJlZC5qb2luKCcsICcpfV1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgQ29tYmluZWQgYWxyZWFkeSBjYXB0dXJlZDogWyR7YWxyZWFkeUNhcHR1cmVkLmpvaW4oJywgJyl9XWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBTdGlsbCBuZWVkZWQ6IFske3N0aWxsTmVlZGVkLmpvaW4oJywgJyl9XWApO1xuICAgIFxuICAgIC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIHNjaGVkdWxpbmc6IGlmIHRoZXkgcHJvdmlkZWQgZGF0ZSBidXQgbm90IHRpbWUsIHN1Z2dlc3QgdGltZXMgYmFzZWQgb24gYnVzaW5lc3MgaG91cnNcbiAgICBsZXQgc2NoZWR1bGluZ1N1Z2dlc3Rpb24gPSAnJztcbiAgICBpZiAoZ29hbENvbmZpZy50eXBlID09PSAnc2NoZWR1bGluZycgJiYgc3RpbGxOZWVkZWQuaW5jbHVkZXMoJ3ByZWZlcnJlZFRpbWUnKSAmJiAhc3RpbGxOZWVkZWQuaW5jbHVkZXMoJ3ByZWZlcnJlZERhdGUnKSkge1xuICAgICAgY29uc3QgcHJlZmVycmVkRGF0ZSA9IGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbz8uWydwcmVmZXJyZWREYXRlJ107XG4gICAgICBpZiAocHJlZmVycmVkRGF0ZSAmJiB0aGlzLmNvbXBhbnlJbmZvPy5idXNpbmVzc0hvdXJzKSB7XG4gICAgICAgIC8vIEV4dHJhY3QgYnVzaW5lc3MgaG91cnMgZm9yIGd1aWRhbmNlIChub3QgaGFsbHVjaW5hdGlvbiBwcmV2ZW50aW9uKVxuICAgICAgICBjb25zdCBob3Vyc0V4aXN0ID0gT2JqZWN0LmtleXModGhpcy5jb21wYW55SW5mby5idXNpbmVzc0hvdXJzKS5sZW5ndGggPiAwO1xuICAgICAgICBpZiAoaG91cnNFeGlzdCkge1xuICAgICAgICAgIHNjaGVkdWxpbmdTdWdnZXN0aW9uID0gYFxcbvCflZAgU0NIRURVTElORyBHVUlEQU5DRTpcbi0gVGhlIHVzZXIgcHJvdmlkZWQ6IFwiJHtwcmVmZXJyZWREYXRlfVwiXG4tIFRoZXkgZGlkIE5PVCBwcm92aWRlIGEgc3BlY2lmaWMgdGltZSB5ZXRcbi0gU3VnZ2VzdCBzcGVjaWZpYyB0aW1lcyBiYXNlZCBvbiB0eXBpY2FsIGF2YWlsYWJpbGl0eSAoZS5nLiwgXCJtb3JuaW5nICg5YW0pLCBhZnRlcm5vb24gKDJwbSksIG9yIGV2ZW5pbmcgKDZwbSlcIilcbi0gRE8gTk9UIG1ha2UgdXAgb3IgaGFsbHVjaW5hdGUgdGltZXMgLSBzdWdnZXN0IG9wdGlvbnMgYW5kIGxldCB0aGVtIGNob29zZVxuLSBCZSBzcGVjaWZpYzogQXNrIFwiV2hhdCB0aW1lIHdvcmtzIGZvciB5b3UgLSA5YW0sIDJwbSwgb3IgNnBtP1wiXG4tIERPIE5PVCBhY2NlcHQgdmFndWUgYW5zd2VycyBsaWtlIFwiZXZlbmluZ1wiIG9yIFwibW9ybmluZ1wiIC0gcHJlc3MgZm9yIGFuIGFjdHVhbCB0aW1lXFxuYDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBJbmNsdWRlIHBlcnNvbmEgc3lzdGVtIHByb21wdCBmb3IgYXV0aGVudGljIHZvaWNlXG4gICAgLy8gQWRkIGdlbmRlci1hd2FyZSBsYW5ndWFnZSBydWxlcyB1c2luZyBjZW50cmFsaXplZCBoZWxwZXJcbiAgICBjb25zdCBnZW5kZXJSdWxlID0gdGhpcy5nZXRHZW5kZXJMYW5ndWFnZVJ1bGUoY2hhbm5lbFN0YXRlKTtcbiAgICBcbiAgICBjb25zdCBwZXJzb25hQ29udGV4dCA9IGBZT1UgQVJFOiAke3RoaXMucGVyc29uYS5uYW1lfVxuJHtnZW5kZXJSdWxlfVxuXG4ke3RoaXMucGVyc29uYS5zeXN0ZW1Qcm9tcHR9YDtcblxuICAgIC8vIPCfjq8gVVNFIEdPQUwtU1BFQ0lGSUMgSU5TVFJVQ1RJT04gR0VORVJBVE9SXG4gICAgLy8gVGhpcyBwcm9kdWNlcyBzbWFydCwgY29udGV4dC1hd2FyZSBpbnN0cnVjdGlvbnMgYmFzZWQgb24gZ29hbCB0eXBlXG4gICAgY29uc3QgeyBnZXRHb2FsSW5zdHJ1Y3Rpb24gfSA9IHJlcXVpcmUoJy4vZ29hbC1pbnN0cnVjdGlvbnMvaW5kZXguanMnKTtcbiAgICBcbiAgICAvLyBCdWlsZCBjYXB0dXJlZCBkYXRhIG1hcCB3aXRoIHZhbHVlc1xuICAgIC8vIElNUE9SVEFOVDogUHJpb3JpdGl6ZSBORVcgZGF0YSBmcm9tIHRoaXMgdHVybiAoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKSBvdmVyIE9MRCBwZXJzaXN0ZWQgZGF0YSAoY2hhbm5lbFN0YXRlLmNhcHR1cmVkRGF0YSlcbiAgICAvLyBUaGlzIGVuc3VyZXMgXCJsYXRlciB0aGFuIDZcIiBvdmVyd3JpdGVzIFwiZXZlbmluZ1wiIHdoZW4gZ2VuZXJhdGluZyB0aGUgZm9sbG93LXVwIHF1ZXN0aW9uXG4gICAgY29uc3QgY2FwdHVyZWREYXRhTWFwOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBhbHJlYWR5Q2FwdHVyZWQpIHtcbiAgICAgIC8vIENoZWNrIGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbyBGSVJTVCAobmV3IGRhdGEgZnJvbSB0aGlzIHR1cm4pXG4gICAgICBjb25zdCBuZXdWYWx1ZSA9IGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbz8uW2ZpZWxkXTtcbiAgICAgIGNvbnN0IHBlcnNpc3RlZFZhbHVlID0gY2hhbm5lbFN0YXRlPy5jYXB0dXJlZERhdGE/LltmaWVsZF07XG4gICAgICBcbiAgICAgIC8vIFVzZSBuZXcgdmFsdWUgaWYgaXQgZXhpc3RzIGFuZCBpcyBub3QgZW1wdHksIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gcGVyc2lzdGVkXG4gICAgICBpZiAobmV3VmFsdWUgIT09IHVuZGVmaW5lZCAmJiBuZXdWYWx1ZSAhPT0gbnVsbCAmJiBuZXdWYWx1ZSAhPT0gJycpIHtcbiAgICAgICAgY2FwdHVyZWREYXRhTWFwW2ZpZWxkXSA9IG5ld1ZhbHVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FwdHVyZWREYXRhTWFwW2ZpZWxkXSA9IHBlcnNpc3RlZFZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBjb25zdCB1c2VyTmFtZSA9IGNoYW5uZWxTdGF0ZT8uY2FwdHVyZWREYXRhPy5maXJzdE5hbWUgfHwgJ2ZyaWVuZCc7XG4gICAgXG4gICAgY29uc3QgaW5zdHJ1Y3Rpb25Db250ZXh0ID0ge1xuICAgICAgZ29hbElkOiBhY3RpdmVHb2FsSWQsXG4gICAgICBnb2FsVHlwZTogZ29hbENvbmZpZy50eXBlIHx8ICdkYXRhX2NvbGxlY3Rpb24nLFxuICAgICAgZ29hbE5hbWU6IGdvYWxDb25maWcubmFtZSB8fCAnR29hbCcsXG4gICAgICBmaWVsZHNOZWVkZWQ6IHN0aWxsTmVlZGVkLFxuICAgICAgZmllbGRzQ2FwdHVyZWQ6IGNhcHR1cmVkRGF0YU1hcCxcbiAgICAgIGNvbXBhbnlJbmZvOiB0aGlzLmNvbXBhbnlJbmZvLFxuICAgICAgY2hhbm5lbFN0YXRlLFxuICAgICAgdXNlck5hbWUsXG4gICAgICBsYXN0VXNlck1lc3NhZ2U6IHVzZXJNZXNzYWdlLFxuICAgICAgZGV0ZWN0ZWRJbnRlbnQ6IGRldGVjdGVkSW50ZW50XG4gICAgfTtcbiAgICBcbiAgICBjb25zdCBnb2FsSW5zdHJ1Y3Rpb24gPSBnZXRHb2FsSW5zdHJ1Y3Rpb24oaW5zdHJ1Y3Rpb25Db250ZXh0KTtcbiAgICBjb25zb2xlLmxvZyhg8J+OryBHb2FsIGluc3RydWN0aW9uIGZvciBcIiR7Z29hbENvbmZpZy5uYW1lfVwiOiAke2dvYWxJbnN0cnVjdGlvbi5pbnN0cnVjdGlvbi5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+OryBUYXJnZXQgZmllbGRzOiBbJHtnb2FsSW5zdHJ1Y3Rpb24udGFyZ2V0RmllbGRzPy5qb2luKCcsICcpIHx8ICdub25lJ31dYCk7XG4gICAgXG4gICAgLy8gQnVpbGQgZXhhbXBsZXMgc3RyaW5nIGlmIHByb3ZpZGVkXG4gICAgY29uc3QgZXhhbXBsZXNUZXh0ID0gZ29hbEluc3RydWN0aW9uLmV4YW1wbGVzPy5sZW5ndGggXG4gICAgICA/IGBcXG5FWEFNUExFUzpcXG4ke2dvYWxJbnN0cnVjdGlvbi5leGFtcGxlcy5tYXAoKGU6IHN0cmluZykgPT4gYC0gJHtlfWApLmpvaW4oJ1xcbicpfWBcbiAgICAgIDogJyc7XG4gICAgXG4gICAgLy8gQnVpbGQgYSBDT05DSVNFIHByb21wdCB1c2luZyB0aGUgZ29hbC1zcGVjaWZpYyBpbnN0cnVjdGlvblxuICAgIGNvbnN0IHBlcnNvbmFWb2ljZSA9IHRoaXMucGVyc29uYS5uYW1lO1xuICAgIGNvbnN0IHRhcmdldEZpZWxkc1RleHQgPSBnb2FsSW5zdHJ1Y3Rpb24udGFyZ2V0RmllbGRzPy5qb2luKCcgYW5kICcpIHx8IHN0aWxsTmVlZGVkWzBdO1xuICAgIFxuICAgIGNvbnN0IHF1ZXN0aW9uUHJvbXB0ID0gYCR7dGhpcy5nZXRJZGVudGl0eUVuZm9yY2VtZW50KCl9WW91IGFyZSAke3BlcnNvbmFWb2ljZX0uIEdlbmVyYXRlIGEgU0hPUlQgZm9sbG93LXVwIHF1ZXN0aW9uLlxuXG4ke2dlbmRlclJ1bGV9XG5cbkdPQUw6ICR7Z29hbEluc3RydWN0aW9uLmluc3RydWN0aW9ufVxuJHtleGFtcGxlc1RleHR9XG5cbvCfmqggQ1JJVElDQUwgUlVMRVM6XG4xLiBBc2sgZm9yOiAke3RhcmdldEZpZWxkc1RleHR9XG4yLiBLZWVwIGl0IFNIT1JUOiAxLTIgc2VudGVuY2VzIG1heFxuMy4gTk8gZ3JlZXRpbmdzISBObyBcIkhleVwiLCBcIkhpXCIsIFwiV2hhdCdzIHVwXCIsIFwiSGV5IHRoZXJlXCIgLSB3ZSdyZSBtaWQtY29udmVyc2F0aW9uIVxuNC4gTk8gbW90aXZhdGlvbmFsIHNwZWVjaGVzLCBOTyBcImVtYnJhY2UgdGhlIHN1Y2tcIiwgTk8gXCJjcnVzaCB3b3Jrb3V0c1wiXG41LiBKdXN0IGEgc2ltcGxlLCBkaXJlY3QgcXVlc3Rpb24gd2l0aCBhIHRvdWNoIG9mIHBlcnNvbmFsaXR5XG42LiBVc2UgdGhlaXIgbmFtZSAoJHt1c2VyTmFtZX0pIGlmIGFwcHJvcHJpYXRlXG5cbllPVVIgUVVFU1RJT046YDtcblxuICAgIGNvbnN0IHF1ZXN0aW9uTW9kZWwgPSBuZXcgQ2hhdEJlZHJvY2tDb252ZXJzZSh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbC5tb2RlbCxcbiAgICAgIHJlZ2lvbjogdGhpcy5tb2RlbC5yZWdpb24sXG4gICAgICB0ZW1wZXJhdHVyZTogMC40LCAvLyBTbGlnaHQgY3JlYXRpdml0eSBmb3IgcGVyc29uYWxpdHlcbiAgICAgIG1heFRva2VuczogNjAsIC8vIFNsaWdodGx5IG1vcmUgcm9vbSBmb3IgbXVsdGktZmllbGQgcXVlc3Rpb25zXG4gICAgICBtYXhfdG9rZW5zOiA2MCxcbiAgICB9IGFzIGFueSk7XG4gICAgXG4gICAgY29uc3QgcXVlc3Rpb25SZXNwb25zZSA9IGF3YWl0IHF1ZXN0aW9uTW9kZWwuaW52b2tlKFtcbiAgICAgIG5ldyBIdW1hbk1lc3NhZ2UocXVlc3Rpb25Qcm9tcHQpXG4gICAgXSk7XG4gICAgXG4gICAgLy8gRW1pdCB0b2tlbiB1c2FnZSBmb3IgZm9sbG93LXVwIHF1ZXN0aW9uXG4gICAgYXdhaXQgdGhpcy5lbWl0VG9rZW5Vc2FnZShxdWVzdGlvblJlc3BvbnNlLCAnZm9sbG93X3VwX3F1ZXN0aW9uJyk7XG4gICAgXG4gICAgY29uc3QgZ2VuZXJhdGVkUXVlc3Rpb24gPSBxdWVzdGlvblJlc3BvbnNlLmNvbnRlbnQudG9TdHJpbmcoKS50cmltKCk7XG4gICAgY29uc29sZS5sb2coYPCfjq8gR2VuZXJhdGVkIGdvYWwgcXVlc3Rpb246IFwiJHtnZW5lcmF0ZWRRdWVzdGlvbn1cImApO1xuICAgIFxuICAgIHJldHVybiBnZW5lcmF0ZWRRdWVzdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCBpbnRlbnQgZGV0ZWN0aW9uIHByb21wdFxuICAgKi9cbiAgcHJpdmF0ZSBidWlsZEludGVudERldGVjdGlvblByb21wdChcbiAgICB1c2VyTWVzc2FnZTogc3RyaW5nLFxuICAgIHJlY2VudE1lc3NhZ2VzOiBCYXNlTWVzc2FnZVtdLFxuICAgIGFjdGl2ZUdvYWxzOiBhbnlbXSxcbiAgICBjb21wbGV0ZWRHb2Fsczogc3RyaW5nW10gPSBbXSxcbiAgICBjYXB0dXJlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fVxuICApOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlY2VudEhpc3RvcnkgPSByZWNlbnRNZXNzYWdlc1xuICAgICAgLm1hcCgobXNnOiBCYXNlTWVzc2FnZSkgPT4gYCR7bXNnLl9nZXRUeXBlKCkgPT09ICdodW1hbicgPyAnSHVtYW4nIDogJ0FJJ306ICR7bXNnLmNvbnRlbnR9YClcbiAgICAgIC5qb2luKCdcXG4nKTtcbiAgICBcbiAgICAvLyBCdWlsZCBkZXRhaWxlZCBnb2FsIGluZm8gaW5jbHVkaW5nIGZpZWxkcyBzdGlsbCBuZWVkZWRcbiAgICBjb25zdCBnb2Fsc0xpc3QgPSBhY3RpdmVHb2Fscy5sZW5ndGggPiAwXG4gICAgICA/IGFjdGl2ZUdvYWxzLm1hcChnID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZHMgPSBnLmRhdGFUb0NhcHR1cmU/LmZpZWxkcyB8fCBbXTtcbiAgICAgICAgICBjb25zdCBmaWVsZE5hbWVzID0gQXJyYXkuaXNBcnJheShmaWVsZHMpIFxuICAgICAgICAgICAgPyBmaWVsZHMubWFwKChmOiBhbnkpID0+IHR5cGVvZiBmID09PSAnc3RyaW5nJyA/IGYgOiBmLm5hbWUpLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgICAvLyBGaWx0ZXIgb3V0IGFscmVhZHkgY2FwdHVyZWQgZmllbGRzXG4gICAgICAgICAgY29uc3Qgc3RpbGxOZWVkZWQgPSBmaWVsZE5hbWVzLmZpbHRlcigoZjogc3RyaW5nKSA9PiAhY2FwdHVyZWREYXRhW2ZdKTtcbiAgICAgICAgICBjb25zdCBmaWVsZHNJbmZvID0gc3RpbGxOZWVkZWQubGVuZ3RoID4gMCBcbiAgICAgICAgICAgID8gYCDihpIgQ1VSUkVOVExZIEFTS0lORyBGT1I6ICR7c3RpbGxOZWVkZWQuam9pbignLCAnKX1gXG4gICAgICAgICAgICA6ICcg4oaSIEFsbCBmaWVsZHMgY2FwdHVyZWQnO1xuICAgICAgICAgIHJldHVybiBgLSAke2cubmFtZSB8fCBnLmlkfTogJHtnLm1lc3NhZ2UgfHwgZy5kZXNjcmlwdGlvbiB8fCBnLnB1cnBvc2V9JHtmaWVsZHNJbmZvfWA7XG4gICAgICAgIH0pLmpvaW4oJ1xcbicpXG4gICAgICA6ICdOb25lJztcbiAgICBcbiAgICAvLyBMaXN0IGFscmVhZHkgY2FwdHVyZWQgZmllbGRzIHRvIGF2b2lkIHJlLWV4dHJhY3RpbmdcbiAgICBjb25zdCBjYXB0dXJlZEZpZWxkc0xpc3QgPSBPYmplY3Qua2V5cyhjYXB0dXJlZERhdGEpLmxlbmd0aCA+IDBcbiAgICAgID8gT2JqZWN0LmtleXMoY2FwdHVyZWREYXRhKS5tYXAoZmllbGQgPT4gYC0gJHtmaWVsZH06ICR7Y2FwdHVyZWREYXRhW2ZpZWxkXX1gKS5qb2luKCdcXG4nKVxuICAgICAgOiAnTm9uZSc7XG4gICAgXG4gICAgY29uc3QgY29tcGxldGVkR29hbHNMaXN0ID0gY29tcGxldGVkR29hbHMubGVuZ3RoID4gMFxuICAgICAgPyBjb21wbGV0ZWRHb2Fscy5qb2luKCcsICcpXG4gICAgICA6ICdOb25lJztcbiAgICBcbiAgICBjb25zdCBjb21wYW55SW5mb0xpc3QgPSB0aGlzLmNvbXBhbnlJbmZvXG4gICAgICA/IFtcbiAgICAgICAgICB0aGlzLmNvbXBhbnlJbmZvLm5hbWUgJiYgYC0gQ29tcGFueSBOYW1lOiAke3RoaXMuY29tcGFueUluZm8ubmFtZX1gLFxuICAgICAgICAgIHRoaXMuY29tcGFueUluZm8uYnVzaW5lc3NIb3VycyAmJiBgLSBCdXNpbmVzcyBIb3Vyc2AsXG4gICAgICAgICAgdGhpcy5jb21wYW55SW5mby5waG9uZSAmJiBgLSBQaG9uZSBOdW1iZXJgLFxuICAgICAgICAgIHRoaXMuY29tcGFueUluZm8uZW1haWwgJiYgYC0gRW1haWwgQWRkcmVzc2AsXG4gICAgICAgICAgdGhpcy5jb21wYW55SW5mby53ZWJzaXRlICYmIGAtIFdlYnNpdGVgLFxuICAgICAgICAgICh0aGlzLmNvbXBhbnlJbmZvIGFzIGFueSkuYWRkcmVzcyAmJiBgLSBBZGRyZXNzYCxcbiAgICAgICAgICB0aGlzLmNvbXBhbnlJbmZvLnNlcnZpY2VzICYmIGAtIFNlcnZpY2VzIE9mZmVyZWRgLFxuICAgICAgICAgIHRoaXMuY29tcGFueUluZm8ucHJvZHVjdHMgJiYgYC0gUHJvZHVjdHNgLFxuICAgICAgICAgICh0aGlzLmNvbXBhbnlJbmZvIGFzIGFueSkucHJpY2luZyAmJiBgLSBQcmljaW5nICYgUGxhbnNgLFxuICAgICAgICAgICh0aGlzLmNvbXBhbnlJbmZvIGFzIGFueSkucHJvbW90aW9ucyAmJiBgLSBDdXJyZW50IFByb21vdGlvbnNgXG4gICAgICAgIF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpXG4gICAgICA6ICdObyBjb21wYW55IGluZm8gYXZhaWxhYmxlJztcbiAgICBcbiAgICByZXR1cm4gYFlvdSBhcmUgYW4gZXhwZXJ0IEFJIGFzc2lzdGFudCBhbmFseXppbmcgYSB1c2VyJ3MgbWVzc2FnZSB0byBkZXRlcm1pbmUgdGhlaXIgaW50ZW50LlxuXG5DVVJSRU5UIFVTRVIgTUVTU0FHRTogXCIke3VzZXJNZXNzYWdlfVwiXG5cblJFQ0VOVCBDT05WRVJTQVRJT04gSElTVE9SWSAobGFzdCAke3JlY2VudE1lc3NhZ2VzLmxlbmd0aH0gbWVzc2FnZXMpOlxuJHtyZWNlbnRIaXN0b3J5fVxuXG5BQ1RJVkUgV09SS0ZMT1cgR09BTFMgKGRhdGEgd2UncmUgdHJ5aW5nIHRvIGNvbGxlY3QpOlxuJHtnb2Fsc0xpc3R9XG5cbkNPTVBMRVRFRCBHT0FMUyAoZG8gTk9UIGFzayBmb3IgdGhpcyBkYXRhIGFnYWluKTpcbiR7Y29tcGxldGVkR29hbHNMaXN0fVxuXG5BTFJFQURZIENBUFRVUkVEIERBVEEgKGRvIE5PVCBleHRyYWN0IHRoZXNlIGZpZWxkcyBhZ2Fpbik6XG4ke2NhcHR1cmVkRmllbGRzTGlzdH1cblxuQ09NUEFOWSBJTkZPUk1BVElPTiBBVkFJTEFCTEU6XG4ke2NvbXBhbnlJbmZvTGlzdH1cblxuWU9VUiBUQVNLOlxuQW5hbHl6ZSB0aGUgXCJDVVJSRU5UIFVTRVIgTUVTU0FHRVwiIGFuZCByZXR1cm4gSlNPTiB3aXRoIHRoZXNlIGtleXM6XG5cbjEuIHByaW1hcnlJbnRlbnQ6IFdoYXQgaXMgdGhlIHVzZXIgdHJ5aW5nIHRvIGRvP1xuICAgLSBcImNvbXBhbnlfaW5mb19yZXF1ZXN0XCI6IEFza2luZyBhYm91dCBjb21wYW55IChob3VycywgbG9jYXRpb24sIHNlcnZpY2VzLCBldGMuKVxuICAgLSBcIndvcmtmbG93X2RhdGFfY2FwdHVyZVwiOiBQcm92aWRpbmcgaW5mbyBmb3IgYSB3b3JrZmxvdyBnb2FsXG4gICAtIFwic2NoZWR1bGluZ1wiOiBUcnlpbmcgdG8gc2NoZWR1bGUgYXBwb2ludG1lbnQvdmlzaXRcbiAgIC0gXCJvYmplY3Rpb25cIjogRXhwcmVzc2luZyBjb25jZXJuL3Jlc2lzdGFuY2VcbiAgIC0gXCJlbmRfY29udmVyc2F0aW9uXCI6IFVzZXIgaXMgd3JhcHBpbmcgdXAsIHNheWluZyBnb29kYnllLCBvciBpbmRpY2F0aW5nIHRoZXkncmUgZG9uZVxuICAgICBFeGFtcGxlczogXCJUaGFua3MsIHRoYXQncyBhbGwhXCIsIFwiR290dGEgZ29cIiwgXCJJJ2xsIHRoaW5rIGFib3V0IGl0XCIsIFwiVGFsayBsYXRlclwiLCBcbiAgICAgICAgICAgICAgIFwiQnllIVwiLCBcIlRoYXQncyBldmVyeXRoaW5nXCIsIFwiSSdtIGdvb2QgZm9yIG5vd1wiLCBcIlRoYW5rcyBmb3IgeW91ciBoZWxwXCJcbiAgIC0gXCJnZW5lcmFsX2NvbnZlcnNhdGlvblwiOiBHZW5lcmFsIGNoYXQgb3Igb3RoZXJcbiAgIC0gXCJ1bmtub3duXCI6IENhbid0IGRldGVybWluZVxuXG4yLiBleHRyYWN0ZWREYXRhOiBBcnJheSBvZiBBTEwgZGF0YSBwcm92aWRlZCBieSB0aGUgdXNlciBpbiB0aGlzIG1lc3NhZ2UuXG4gICBcbiAgIPCfmqjwn5qo8J+aqCBDUklUSUNBTDogTUFUQ0ggVVNFUidTIEFOU1dFUiBUTyBUSEUgRklFTEQgQkVJTkcgQVNLRUQgRk9SISDwn5qo8J+aqPCfmqhcbiAgIExvb2sgYXQgXCJDVVJSRU5UTFkgQVNLSU5HIEZPUlwiIGluIHRoZSBhY3RpdmUgZ29hbHMgYWJvdmUuIElmIHVzZXIgcHJvdmlkZXMgYSBkYXRlL3RpbWU6XG4gICAtIElmIHdlJ3JlIGFza2luZyBmb3IgXCJ0aW1lbGluZVwiIOKGkiBleHRyYWN0IGFzIHRpbWVsaW5lICh0aGVpciBnb2FsIGRlYWRsaW5lKVxuICAgLSBJZiB3ZSdyZSBhc2tpbmcgZm9yIFwicHJlZmVycmVkRGF0ZVwiIOKGkiBleHRyYWN0IGFzIHByZWZlcnJlZERhdGUgKHNlc3Npb24gc2NoZWR1bGluZylcbiAgIC0gSWYgd2UncmUgYXNraW5nIGZvciBcInByZWZlcnJlZFRpbWVcIiDihpIgZXh0cmFjdCBhcyBwcmVmZXJyZWRUaW1lXG4gICBcbiAgIEV4YW1wbGU6IElmIGdvYWwgc2F5cyBcIkNVUlJFTlRMWSBBU0tJTkcgRk9SOiB0aW1lbGluZVwiIGFuZCB1c2VyIHNheXMgXCJKdW5lIDEzdGhcIiwgXG4gICBleHRyYWN0IGFzIHRpbWVsaW5lLCBOT1QgcHJlZmVycmVkRGF0ZSFcbiAgIFxuICAg8J+aqPCfmqjwn5qoIFNJTkdMRS1XT1JEIEFOU1dFUlMgVE8gVElNRSBQUkVGRVJFTkNFIFFVRVNUSU9OUyDwn5qo8J+aqPCfmqhcbiAgIElmIENVUlJFTlRMWSBBU0tJTkcgRk9SIGluY2x1ZGVzIFwicHJlZmVycmVkVGltZVwiIGFuZCB1c2VyIHNheXMganVzdDpcbiAgIC0gXCJFdmVuaW5nXCIgb3IgXCJldmVuaW5nXCIg4oaSIGV4dHJhY3QgYXMgcHJlZmVycmVkVGltZT1cImV2ZW5pbmdcIiAoTk9UIGEgZ3JlZXRpbmchKVxuICAgLSBcIk1vcm5pbmdcIiBvciBcIm1vcm5pbmdcIiDihpIgZXh0cmFjdCBhcyBwcmVmZXJyZWRUaW1lPVwibW9ybmluZ1wiIChOT1QgYSBncmVldGluZyEpXG4gICAtIFwiQWZ0ZXJub29uXCIg4oaSIGV4dHJhY3QgYXMgcHJlZmVycmVkVGltZT1cImFmdGVybm9vblwiXG4gICAtIFwiTmlnaHRcIiBvciBcIm5pZ2h0c1wiIOKGkiBleHRyYWN0IGFzIHByZWZlcnJlZFRpbWU9XCJldmVuaW5nXCJcbiAgIFxuICAgRE8gTk9UIGNvbmZ1c2Ugc2luZ2xlLXdvcmQgdGltZSBhbnN3ZXJzIHdpdGggZ3JlZXRpbmdzISBcbiAgIFwiRXZlbmluZ1wiIGFzIGEgcmVzcG9uc2UgdG8gXCJtb3JuaW5nIG9yIGV2ZW5pbmc/XCIgaXMgYW4gQU5TV0VSLCBub3QgXCJHb29kIGV2ZW5pbmdcIiFcbiAgIFxuICAg4pqg77iPIENSSVRJQ0FMOiBFeHRyYWN0IEFMTCBmaWVsZHMgcHJvdmlkZWQsIGV2ZW4gaWYgbXVsdGlwbGUgdmFsdWVzIGFyZSBnaXZlbiBpbiBvbmUgbWVzc2FnZSFcbiAgIFxuICAg8J+OryBFWEFNUExFUyBPRiBNVUxUSVBMRSBFWFRSQUNUSU9OUzpcbiAgIC0gXCJNeSBuYW1lIGlzIFNhcmEgQ2hvY3JvblwiIOKGkiBleHRyYWN0ZWREYXRhPVt7ZmllbGQ6XCJmaXJzdE5hbWVcIiwgdmFsdWU6XCJTYXJhXCJ9LCB7ZmllbGQ6XCJsYXN0TmFtZVwiLCB2YWx1ZTpcIkNob2Nyb25cIn1dXG4gICAtIFwiKDk1NCkgMTIzLTIyMTIsIGFuZCBzc3NAdGhlZ3JlYXRzYXJhLmNvbVwiIOKGkiBleHRyYWN0ZWREYXRhPVt7ZmllbGQ6XCJwaG9uZVwiLCB2YWx1ZTpcIig5NTQpIDEyMy0yMjEyXCJ9LCB7ZmllbGQ6XCJlbWFpbFwiLCB2YWx1ZTpcInNzc0B0aGVncmVhdHNhcmEuY29tXCJ9XVxuICAgLSBcIk1vbmRheSBhdCA3cG1cIiDihpIgZXh0cmFjdGVkRGF0YT1be2ZpZWxkOlwicHJlZmVycmVkRGF0ZVwiLCB2YWx1ZTpcIk1vbmRheVwifSwge2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcIjdwbVwifV1cbiAgIC0gXCJEYXZpZCwgZGF2aWRAZXhhbXBsZS5jb21cIiDihpIgZXh0cmFjdGVkRGF0YT1be2ZpZWxkOlwiZmlyc3ROYW1lXCIsIHZhbHVlOlwiRGF2aWRcIn0sIHtmaWVsZDpcImVtYWlsXCIsIHZhbHVlOlwiZGF2aWRAZXhhbXBsZS5jb21cIn1dXG4gICAtIFwiRXZlbmluZ1wiIG9yIFwiRXZlbmluZywgbW9zdGx5XCIgb3IgXCJldmVuaW5ncyB3b3JrIGJlc3RcIiDihpIgZXh0cmFjdGVkRGF0YT1be2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcImV2ZW5pbmdcIn1dXG4gICAtIFwiTW9ybmluZ1wiIG9yIFwiTW9ybmluZyBwZXJzb25cIiBvciBcImVhcmx5IG1vcm5pbmdzXCIg4oaSIGV4dHJhY3RlZERhdGE9W3tmaWVsZDpcInByZWZlcnJlZFRpbWVcIiwgdmFsdWU6XCJtb3JuaW5nXCJ9XVxuICAgLSBcIkFmdGVyIHdvcmtcIiBvciBcImFmdGVyIDVcIiBvciBcIm5pZ2h0c1wiIOKGkiBleHRyYWN0ZWREYXRhPVt7ZmllbGQ6XCJwcmVmZXJyZWRUaW1lXCIsIHZhbHVlOlwiZXZlbmluZ1wifV1cbiAgIFxuICAg4pqg77iPIFdoZW4gYW5zd2VyaW5nIFwibW9ybmluZyBvciBldmVuaW5nP1wiLCBhIHNpbmdsZSB3b3JkIGxpa2UgXCJFdmVuaW5nXCIgb3IgXCJNb3JuaW5nXCIgSVMgdGhlIHByZWZlcnJlZFRpbWUhXG4gICBcbiAgIPCfmqggTUVHQSBFWFRSQUNUSU9OIEVYQU1QTEUgKHVzZXIgcHJvdmlkZXMgTUFOWSBmaWVsZHMgYXQgb25jZSk6XG4gICBVc2VyOiBcIlBldGVyc29uLCBteSBwaG9uZSBpcyAoOTU0KSAxMjMtMjExMiwgZW1haWwgc2FyYUBleGFtcGxlLmNvbS4gSSB3YW50IHRvIGxvc2UgMzAgbGJzLCBjdXJyZW50bHkgYXQgMTgzLCBmb3IgbXkgd2VkZGluZyBvbiAwMy8wMy8yNi4gQm9keWZhdCBpcyAzNSUsIGhlaWdodCA1JzRcIlxuICAg4oaSIGV4dHJhY3RlZERhdGE9W1xuICAgICAgIHtmaWVsZDpcImxhc3ROYW1lXCIsIHZhbHVlOlwiUGV0ZXJzb25cIn0sXG4gICAgICAge2ZpZWxkOlwicGhvbmVcIiwgdmFsdWU6XCIoOTU0KSAxMjMtMjExMlwifSxcbiAgICAgICB7ZmllbGQ6XCJlbWFpbFwiLCB2YWx1ZTpcInNhcmFAZXhhbXBsZS5jb21cIn0sXG4gICAgICAge2ZpZWxkOlwicHJpbWFyeUdvYWxcIiwgdmFsdWU6XCJ3ZWlnaHQgbG9zc1wifSxcbiAgICAgICB7ZmllbGQ6XCJ3ZWlnaHRcIiwgdmFsdWU6XCIxODMgbGJzXCJ9LFxuICAgICAgIHtmaWVsZDpcIm1vdGl2YXRpb25SZWFzb25cIiwgdmFsdWU6XCJ3ZWRkaW5nXCJ9LFxuICAgICAgIHtmaWVsZDpcInRpbWVsaW5lXCIsIHZhbHVlOlwiMDMvMDMvMjZcIn0sXG4gICAgICAge2ZpZWxkOlwiYm9keUZhdFBlcmNlbnRhZ2VcIiwgdmFsdWU6XCIzNSVcIn0sXG4gICAgICAge2ZpZWxkOlwiaGVpZ2h0XCIsIHZhbHVlOlwiNSc0XFxcIlwifVxuICAgICBdXG4gICDimqDvuI8gRVhUUkFDVCBFVkVSWSBTSU5HTEUgRklFTEQgLSBkbyBOT1Qgc2tpcCBhbnkhXG4gICBcbiAgIPCfj4vvuI8gRklUTkVTUy1TUEVDSUZJQyBFWFRSQUNUSU9OUzpcbiAgIC0gXCJJIHdhbnQgdG8gbG9zZSB3ZWlnaHRcIiBvciBcImRyb3AgMzAgbGJzXCIgb3IgXCJnZXQgZml0XCIg4oaSIFt7ZmllbGQ6XCJwcmltYXJ5R29hbFwiLCB2YWx1ZTpcIndlaWdodCBsb3NzXCJ9XVxuICAgLSBcImJ1aWxkIG11c2NsZVwiIG9yIFwiZ2V0IHN0cm9uZ2VyXCIgb3IgXCJidWxrIHVwXCIg4oaSIFt7ZmllbGQ6XCJwcmltYXJ5R29hbFwiLCB2YWx1ZTpcIm11c2NsZSBidWlsZGluZ1wifV1cbiAgIC0gXCJ0b25lIHVwXCIgb3IgXCJnZXQgdG9uZWRcIiDihpIgW3tmaWVsZDpcInByaW1hcnlHb2FsXCIsIHZhbHVlOlwidG9uaW5nXCJ9XVxuICAgLSBcImltcHJvdmUgZW5kdXJhbmNlXCIgb3IgXCJydW4gYSBtYXJhdGhvblwiIOKGkiBbe2ZpZWxkOlwicHJpbWFyeUdvYWxcIiwgdmFsdWU6XCJlbmR1cmFuY2UgdHJhaW5pbmdcIn1dXG4gICDwn46vIE1PVElWQVRJT04gRVhUUkFDVElPTiAtIFRXTyBGSUVMRFM6XG4gICAxLiBtb3RpdmF0aW9uUmVhc29uOiBUaGVpciBhY3R1YWwgd29yZHMvZnJlZWZvcm0gKGUuZy4sIFwiYm9keWJ1aWxkaW5nIGNvbXBldGl0aW9uXCIsIFwibXkgd2VkZGluZyBpbiBKdW5lXCIpXG4gICAyLiBtb3RpdmF0aW9uQ2F0ZWdvcmllczogQ29tbWEtc2VwYXJhdGVkIGNhdGVnb3JpZXMgZnJvbTogYWVzdGhldGljLCBoZWFsdGgsIHBlcmZvcm1hbmNlLCBsaWZlc3R5bGUsIG1lbnRhbFxuICAgXG4gICBDQVRFR09SWSBERUZJTklUSU9OUzpcbiAgIC0gYWVzdGhldGljOiBhcHBlYXJhbmNlLWRyaXZlbiAod2VkZGluZywgYmVhY2gsIHBob3RvcywgbG9vayBnb29kLCByZXZlbmdlIGJvZHksIGNvbmZpZGVuY2UgaW4gYXBwZWFyYW5jZSlcbiAgIC0gaGVhbHRoOiBtZWRpY2FsL3dlbGxuZXNzIChkb2N0b3IsIGRpYWJldGVzLCBoZWFydCwgY2hvbGVzdGVyb2wsIGVuZXJneSwgbGl2ZSBsb25nZXIsIGxvc2Ugd2VpZ2h0IGZvciBoZWFsdGgpXG4gICAtIHBlcmZvcm1hbmNlOiBhdGhsZXRpYy9jb21wZXRpdGlvbiAoY29tcGV0ZSwgY29udGVzdCwgc3BvcnRzLCBtYXJhdGhvbiwgc3Ryb25nZXIsIGZhc3RlciwgYXRobGV0ZSwgYm9keWJ1aWxkaW5nKVxuICAgLSBsaWZlc3R5bGU6IGRhaWx5IGZ1bmN0aW9uL3F1YWxpdHkgb2YgbGlmZSAoa2lkcywgZmFtaWx5LCBzdGFpcnMsIG1vYmlsaXR5LCBrZWVwIHVwIHdpdGgsIGluZGVwZW5kZW5jZSlcbiAgIC0gbWVudGFsOiBwc3ljaG9sb2dpY2FsIHdlbGxiZWluZyAoc3RyZXNzLCBhbnhpZXR5LCBkZXByZXNzaW9uLCBtZW50YWwgaGVhbHRoLCBmZWVsIGJldHRlciBlbW90aW9uYWxseSlcbiAgIFxuICAg4pqg77iPIEEgbW90aXZhdGlvbiBjYW4gaGF2ZSBNVUxUSVBMRSBjYXRlZ29yaWVzISBFeHRyYWN0IEFMTCB0aGF0IGFwcGx5LlxuICAgXG4gICBFWEFNUExFUzpcbiAgIC0gXCJJIHdhbnQgdG8gY29tcGV0ZSBpbiBhIGJvZHlidWlsZGluZyBjb250ZXN0XCIg4oaSIFxuICAgICBbe2ZpZWxkOlwibW90aXZhdGlvblJlYXNvblwiLCB2YWx1ZTpcImJvZHlidWlsZGluZyBjb250ZXN0XCJ9LCB7ZmllbGQ6XCJtb3RpdmF0aW9uQ2F0ZWdvcmllc1wiLCB2YWx1ZTpcInBlcmZvcm1hbmNlLGFlc3RoZXRpY1wifV1cbiAgIC0gXCJteSB3ZWRkaW5nIGlzIGNvbWluZyB1cFwiIOKGkiBcbiAgICAgW3tmaWVsZDpcIm1vdGl2YXRpb25SZWFzb25cIiwgdmFsdWU6XCJ3ZWRkaW5nXCJ9LCB7ZmllbGQ6XCJtb3RpdmF0aW9uQ2F0ZWdvcmllc1wiLCB2YWx1ZTpcImFlc3RoZXRpY1wifV1cbiAgIC0gXCJkb2N0b3Igc2FpZCBJIG5lZWQgdG8gbG9zZSB3ZWlnaHQgYW5kIEkgd2FudCB0byBsb29rIGdvb2RcIiDihpIgXG4gICAgIFt7ZmllbGQ6XCJtb3RpdmF0aW9uUmVhc29uXCIsIHZhbHVlOlwiZG9jdG9yIHJlY29tbWVuZGF0aW9uIGFuZCBhcHBlYXJhbmNlXCJ9LCB7ZmllbGQ6XCJtb3RpdmF0aW9uQ2F0ZWdvcmllc1wiLCB2YWx1ZTpcImhlYWx0aCxhZXN0aGV0aWNcIn1dXG4gICAtIFwid2FudCBtb3JlIGVuZXJneSB0byBrZWVwIHVwIHdpdGggbXkga2lkc1wiIOKGkiBcbiAgICAgW3tmaWVsZDpcIm1vdGl2YXRpb25SZWFzb25cIiwgdmFsdWU6XCJlbmVyZ3kgZm9yIGtpZHNcIn0sIHtmaWVsZDpcIm1vdGl2YXRpb25DYXRlZ29yaWVzXCIsIHZhbHVlOlwiaGVhbHRoLGxpZmVzdHlsZVwifV1cbiAgIC0gXCJnaXJsZnJpZW5kIGJyb2tlIHVwIHdpdGggbWVcIiBvciBcInJldmVuZ2UgYm9keVwiIOKGkiBcbiAgICAgW3tmaWVsZDpcIm1vdGl2YXRpb25SZWFzb25cIiwgdmFsdWU6XCJicmVha3VwXCJ9LCB7ZmllbGQ6XCJtb3RpdmF0aW9uQ2F0ZWdvcmllc1wiLCB2YWx1ZTpcImFlc3RoZXRpYyxtZW50YWxcIn1dXG4gICAtIFwic3RyZXNzIHJlbGllZlwiIG9yIFwibWVudGFsIGhlYWx0aFwiIOKGkiBcbiAgICAgW3tmaWVsZDpcIm1vdGl2YXRpb25SZWFzb25cIiwgdmFsdWU6XCJzdHJlc3MgcmVsaWVmXCJ9LCB7ZmllbGQ6XCJtb3RpdmF0aW9uQ2F0ZWdvcmllc1wiLCB2YWx1ZTpcIm1lbnRhbFwifV1cbiAgIC0gXCJ0cmFpbmluZyBmb3IgYSBtYXJhdGhvblwiIOKGkiBcbiAgICAgW3tmaWVsZDpcIm1vdGl2YXRpb25SZWFzb25cIiwgdmFsdWU6XCJtYXJhdGhvblwifSwge2ZpZWxkOlwibW90aXZhdGlvbkNhdGVnb3JpZXNcIiwgdmFsdWU6XCJwZXJmb3JtYW5jZVwifV1cbiAgIC0gXCJ3YW50IHRvIGJlIGFyb3VuZCBmb3IgbXkgZ3JhbmRraWRzXCIg4oaSIFxuICAgICBbe2ZpZWxkOlwibW90aXZhdGlvblJlYXNvblwiLCB2YWx1ZTpcImZhbWlseSBsb25nZXZpdHlcIn0sIHtmaWVsZDpcIm1vdGl2YXRpb25DYXRlZ29yaWVzXCIsIHZhbHVlOlwibGlmZXN0eWxlLGhlYWx0aFwifV1cbiAgIOKaoO+4j+KaoO+4j+KaoO+4jyBDUklUSUNBTCAtIFRJTUVMSU5FIHZzIFBSRUZFUlJFRCBEQVRFIERJU1RJTkNUSU9OIOKaoO+4j+KaoO+4j+KaoO+4j1xuICAgXG4gICB0aW1lbGluZSA9IFdoZW4gdXNlciB3YW50cyB0byBBQ0hJRVZFIHRoZWlyIEZJVE5FU1MgR09BTCAoY29tcGV0aXRpb24gZGF0ZSwgd2VkZGluZyBkYXRlLCBldGMuKVxuICAgcHJlZmVycmVkRGF0ZSA9IFdoZW4gdXNlciB3YW50cyB0byBTQ0hFRFVMRSB0aGVpciBmaXJzdCBTRVNTSU9OL0NMQVNTIGF0IHRoZSBneW1cbiAgIFxuICAg8J+OryBDT05URVhUIE1BVFRFUlMhIExvb2sgYXQgd2hhdCB3YXMgYXNrZWQ6XG4gICAtIElmIGFza2VkIFwid2hlbiBkbyB5b3Ugd2FudCB0byBhY2hpZXZlIHRoaXM/XCIgb3IgXCJ3aGF0J3MgeW91ciB0YXJnZXQgZGF0ZT9cIiDihpIgdGltZWxpbmVcbiAgIC0gSWYgYXNrZWQgXCJ3aGVuIGNhbiB5b3UgY29tZSBpbj9cIiBvciBcIndoYXQgZGF5IHdvcmtzP1wiIOKGkiBwcmVmZXJyZWREYXRlXG4gICBcbiAgIOKchSBFWFRSQUNUIEFTIHRpbWVsaW5lIChHT0FMIERFQURMSU5FKTpcbiAgIC0gXCJKdW5lIDEzdGhcIiAod2hlbiBhbnN3ZXJpbmcgYWJvdXQgZ29hbCB0aW1lbGluZSkg4oaSIFt7ZmllbGQ6XCJ0aW1lbGluZVwiLCB2YWx1ZTpcIkp1bmUgMTN0aFwifV1cbiAgIC0gXCJpbiAzIG1vbnRoc1wiIG9yIFwiYnkgTWFyY2hcIiDihpIgW3tmaWVsZDpcInRpbWVsaW5lXCIsIHZhbHVlOlwiMyBtb250aHNcIn1dXG4gICAtIFwiYnkgc3VtbWVyXCIgb3IgXCJiZWZvcmUgc3VtbWVyXCIg4oaSIFt7ZmllbGQ6XCJ0aW1lbGluZVwiLCB2YWx1ZTpcInN1bW1lclwifV1cbiAgIC0gXCJteSB3ZWRkaW5nIGlzIEp1bmUgMTV0aFwiIOKGkiBbe2ZpZWxkOlwidGltZWxpbmVcIiwgdmFsdWU6XCJKdW5lIDE1dGhcIn1dXG4gICAtIFwidGhlIGNvbXBldGl0aW9uIGlzIGluIEp1bmVcIiDihpIgW3tmaWVsZDpcInRpbWVsaW5lXCIsIHZhbHVlOlwiSnVuZVwifV1cbiAgIC0gXCJJIHdhbnQgdG8gYmUgcmVhZHkgYnkgRGVjZW1iZXJcIiDihpIgW3tmaWVsZDpcInRpbWVsaW5lXCIsIHZhbHVlOlwiRGVjZW1iZXJcIn1dXG4gICAtIFwiNiBtb250aHMgZnJvbSBub3dcIiDihpIgW3tmaWVsZDpcInRpbWVsaW5lXCIsIHZhbHVlOlwiNiBtb250aHNcIn1dXG4gICBcbiAgIOKchSBFWFRSQUNUIEFTIHByZWZlcnJlZERhdGUgKFNFU1NJT04gU0NIRURVTElORyk6XG4gICAtIFwiTW9uZGF5XCIgb3IgXCJ0aGlzIE1vbmRheVwiICh3aGVuIHNjaGVkdWxpbmcgYSBzZXNzaW9uKSDihpIgW3tmaWVsZDpcInByZWZlcnJlZERhdGVcIiwgdmFsdWU6XCJNb25kYXlcIn1dXG4gICAtIFwibmV4dCBUdWVzZGF5XCIg4oaSIFt7ZmllbGQ6XCJwcmVmZXJyZWREYXRlXCIsIHZhbHVlOlwibmV4dCBUdWVzZGF5XCJ9XVxuICAgLSBcInRvbW9ycm93XCIg4oaSIFt7ZmllbGQ6XCJwcmVmZXJyZWREYXRlXCIsIHZhbHVlOlwidG9tb3Jyb3dcIn1dXG4gICBcbiAgIPCflJEgS0VZIFJVTEU6IElmIHVzZXIgcHJvdmlkZXMgYSBEQVRFIGluIHJlc3BvbnNlIHRvIGEgdGltZWxpbmUgcXVlc3Rpb24sIGV4dHJhY3QgYXMgdGltZWxpbmUhXG4gICBJZiB0aGUgY29udmVyc2F0aW9uIGlzIGFib3V0IHNjaGVkdWxpbmcgdGhlaXIgZmlyc3QgdmlzaXQsIGV4dHJhY3QgYXMgcHJlZmVycmVkRGF0ZS5cbiAgIFxuICAgLSBcIkknbSA1JzRcIiBvciBcIjUgZm9vdCA0XCIg4oaSIFt7ZmllbGQ6XCJoZWlnaHRcIiwgdmFsdWU6XCI1JzRcXFwiXCJ9XVxuICAgXG4gICDimqDvuI/imqDvuI/imqDvuI8gQ1JJVElDQUwgLSBXRUlHSFQgRVhUUkFDVElPTiBSVUxFUyDimqDvuI/imqDvuI/imqDvuI9cbiAgIFRoZSBcIndlaWdodFwiIGZpZWxkIGlzIGZvciBDVVJSRU5UIHdlaWdodCBPTkxZLiBORVZFUiBleHRyYWN0IGdvYWwvdGFyZ2V0IHdlaWdodCBhcyBcIndlaWdodFwiLlxuICAgXG4gICDinIUgRVhUUkFDVCBBUyB3ZWlnaHQgKENVUlJFTlQgd2VpZ2h0IGluZGljYXRvcnMpOlxuICAgLSBcIkkgd2VpZ2ggMTgzIGxic1wiIOKGkiBbe2ZpZWxkOlwid2VpZ2h0XCIsIHZhbHVlOlwiMTgzIGxic1wifV1cbiAgIC0gXCJJJ20gY3VycmVudGx5IDE4M1wiIOKGkiBbe2ZpZWxkOlwid2VpZ2h0XCIsIHZhbHVlOlwiMTgzIGxic1wifV1cbiAgIC0gXCJNeSB3ZWlnaHQgaXMgMTgzXCIg4oaSIFt7ZmllbGQ6XCJ3ZWlnaHRcIiwgdmFsdWU6XCIxODMgbGJzXCJ9XVxuICAgLSBcIml0J3MgMTgzbGJzXCIgKHdoZW4gYXNrZWQgYWJvdXQgY3VycmVudCB3ZWlnaHQpIOKGkiBbe2ZpZWxkOlwid2VpZ2h0XCIsIHZhbHVlOlwiMTgzIGxic1wifV1cbiAgIC0gXCJJJ20gYXQgMTgzIHJpZ2h0IG5vd1wiIOKGkiBbe2ZpZWxkOlwid2VpZ2h0XCIsIHZhbHVlOlwiMTgzIGxic1wifV1cbiAgIFxuICAg4p2MIERPIE5PVCBFWFRSQUNUIEFTIHdlaWdodCAoR09BTC9UQVJHRVQgd2VpZ2h0IC0gaWdub3JlIHRoZXNlKTpcbiAgIC0gXCJJIHdhbnQgdG8gd2VpZ2ggMTUzXCIg4oaSIERPIE5PVCBleHRyYWN0ICh0aGlzIGlzIGEgZ29hbCwgbm90IGN1cnJlbnQpXG4gICAtIFwiSSdkIGxpa2UgdG8gYmUgMTUzbGJzXCIg4oaSIERPIE5PVCBleHRyYWN0ICh0aGlzIGlzIGEgZ29hbClcbiAgIC0gXCJnb2FsIHdlaWdodCBpcyAxNTBcIiDihpIgRE8gTk9UIGV4dHJhY3QgKGV4cGxpY2l0bHkgYSBnb2FsKVxuICAgLSBcIkkgd2FudCB0byBnZXQgdG8gMTUwXCIg4oaSIERPIE5PVCBleHRyYWN0IChmdXR1cmUgZGVzaXJlKVxuICAgLSBcInRhcmdldCBpcyAxNTNcIiDihpIgRE8gTk9UIGV4dHJhY3QgKGV4cGxpY2l0bHkgYSB0YXJnZXQpXG4gICAtIFwiaG9waW5nIHRvIHJlYWNoIDE1MFwiIOKGkiBETyBOT1QgZXh0cmFjdCAoYXNwaXJhdGlvbilcbiAgIFxuICAg8J+UkSBLRVkgRElTVElOQ1RJT046IElmIHRoZSB1c2VyIHNheXMgXCJJIHdhbnQgdG8uLi5cIiwgXCJJJ2QgbGlrZSB0by4uLlwiLCBcImdvYWwgaXMuLi5cIiwgXCJ0YXJnZXQgaXMuLi5cIiwgXCJob3BpbmcgdG8uLi5cIiwgXG4gICB0aGF0IGlzIE5PVCB0aGVpciBjdXJyZW50IHdlaWdodCAtIERPIE5PVCBleHRyYWN0IGl0IGFzIHRoZSB3ZWlnaHQgZmllbGQhXG4gICBcbiAgIPCfjq8gUFJJT1JJVFk6IEFMV0FZUyBwcmlvcml0aXplIHdvcmtmbG93IGRhdGEgZXh0cmFjdGlvbiBGSVJTVCwgZXNwZWNpYWxseSBmb3Igc2NoZWR1bGluZyAocHJlZmVycmVkRGF0ZSwgcHJlZmVycmVkVGltZSlcbiAgIC0gSWYgdXNlciBzYXlzIFwiNzozMCBpdCBpcy4gV2hhdCdzIHRoZSBhZGRyZXNzP1wiIOKGkiBFeHRyYWN0IHByZWZlcnJlZFRpbWU9XCI3OjMwXCIgRklSU1QgKFBSSU9SSVRZKVxuICAgLSBJZiB1c2VyIGFza3MgYSBxdWVzdGlvbiBBRlRFUiBwcm92aWRpbmcgZGF0YSwgdGhlIHdvcmtmbG93IGRhdGEgaXMgTU9SRSBJTVBPUlRBTlQgdGhhbiB0aGUgcXVlc3Rpb25cbiAgIFxuICAgRVhUUkFDVElPTiBSVUxFUzpcbiAgIC0g4pyFIFwiTXkgbmFtZSBpcyBEYXZpZFwiIOKGkiBbe2ZpZWxkOlwiZmlyc3ROYW1lXCIsIHZhbHVlOlwiRGF2aWRcIn1dXG4gICAtIOKchSBcImRhdmlkQGV4YW1wbGUuY29tXCIg4oaSIFt7ZmllbGQ6XCJlbWFpbFwiLCB2YWx1ZTpcImRhdmlkQGV4YW1wbGUuY29tXCJ9XVxuICAgLSDinIUgXCI1NTUtMTIzNFwiIG9yIFwiKDk1NCkgNjMyLTExMjJcIiDihpIgW3tmaWVsZDpcInBob25lXCIsIHZhbHVlOlwiNTU1LTEyMzRcIn1dIG9yIFt7ZmllbGQ6XCJwaG9uZVwiLCB2YWx1ZTpcIig5NTQpIDYzMi0xMTIyXCJ9XVxuICAgLSDinIUgXCI3OjMwXCIgb3IgXCI3OjMwcG1cIiBvciBcIjczMFwiIOKGkiBbe2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcIjc6MzBwbVwifV1cbiAgIC0g4pyFIFwiTW9uZGF5XCIgb3IgXCJuZXh0IE1vbmRheVwiIOKGkiBbe2ZpZWxkOlwicHJlZmVycmVkRGF0ZVwiLCB2YWx1ZTpcIk1vbmRheVwifV1cbiAgIC0g4pyFIFwiZXZlbmluZ1wiIG9yIFwiZXZlbmluZ3NcIiBvciBcImFmdGVyIHdvcmtcIiBvciBcIkV2ZW5pbmcsIG1vc3RseVwiIG9yIFwiZXZlbmluZyBtb3N0bHlcIiDihpIgW3tmaWVsZDpcInByZWZlcnJlZFRpbWVcIiwgdmFsdWU6XCJldmVuaW5nXCJ9XVxuICAgLSDinIUgXCJtb3JuaW5nXCIgb3IgXCJtb3JuaW5nc1wiIG9yIFwiZWFybHlcIiBvciBcIk1vcm5pbmcsIG1vc3RseVwiIOKGkiBbe2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcIm1vcm5pbmdcIn1dXG4gICAtIOKchSBcImFmdGVybm9vblwiIG9yIFwiYWZ0ZXJub29uc1wiIOKGkiBbe2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcImFmdGVybm9vblwifV1cbiAgIC0g4pyFIFwibmlnaHRzXCIgb3IgXCJtb3N0bHkgbmlnaHRzXCIgb3IgXCJhdCBuaWdodFwiIG9yIFwibmlnaHQgdGltZVwiIOKGkiBbe2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcImV2ZW5pbmdcIn1dXG4gICAtIOKchSBcImxhdGVyIHRoYW4gNlwiIG9yIFwiYWZ0ZXIgN1wiIG9yIFwicGFzdCA2XCIg4oaSIFt7ZmllbGQ6XCJwcmVmZXJyZWRUaW1lXCIsIHZhbHVlOlwibGF0ZXIgdGhhbiA2XCJ9XSBvciBbe2ZpZWxkOlwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTpcImFmdGVyIDdcIn1dXG4gICBcbiAgIOKaoO+4jyBJTVBPUlRBTlQ6IFdoZW4gdXNlciBhbnN3ZXJzIGEgXCJtb3JuaW5nIG9yIGV2ZW5pbmc/XCIgcXVlc3Rpb24gd2l0aCBqdXN0IFwiRXZlbmluZ1wiIG9yIFwiTW9ybmluZ1wiLCBcbiAgIHRoYXQgSVMgdGhlaXIgcHJlZmVycmVkVGltZSBhbnN3ZXIgLSBleHRyYWN0IGl0ISBEb24ndCBjb25mdXNlIHdpdGggZ3JlZXRpbmdzLlxuICAgXG4gICDwn5qrIERPIE5PVCBFWFRSQUNUIHByZWZlcnJlZFRpbWUgRlJPTSBSRUpFQ1RJT05TOlxuICAgLSBcIkkgY2FuJ3QgZG8gNlwiIG9yIFwiNiBpcyB0b28gZWFybHlcIiDihpIgRE8gTk9UIGV4dHJhY3QgcHJlZmVycmVkVGltZSAodGhleSdyZSByZWplY3RpbmcsIG5vdCBwcm92aWRpbmcpXG4gICAtIFwidGhhdCBkb2Vzbid0IHdvcmtcIiBvciBcIm5vbmUgb2YgdGhvc2Ugd29ya1wiIOKGkiBETyBOT1QgZXh0cmFjdCBwcmVmZXJyZWRUaW1lXG4gICAtIFwidG9vIGVhcmx5XCIgb3IgXCJ0b28gbGF0ZVwiIOKGkiBETyBOT1QgZXh0cmFjdCBwcmVmZXJyZWRUaW1lIChpdCdzIGEgcmVqZWN0aW9uLCBub3QgYSBuZXcgcHJlZmVyZW5jZSlcbiAgIC0gS2VlcCB0aGUgRVhJU1RJTkcgcHJlZmVycmVkVGltZSB2YWx1ZSB3aGVuIHVzZXIgcmVqZWN0cyBhIHNwZWNpZmljIHRpbWUhXG4gICBcbiR7YnVpbGREYXRlTm9ybWFsaXphdGlvblByb21wdCh7IGJ1c2luZXNzQ29udGV4dDogJ2ZpdG5lc3MnIH0pfVxuXG4gICAtIOKdjCBcIldoYXQncyB5b3VyIHBob25lP1wiIOKGkiBleHRyYWN0ZWREYXRhPW51bGwgKHRoZXkncmUgQVNLSU5HLCBub3QgcHJvdmlkaW5nKVxuICAgLSDinYwgXCJDYW4gSSBnaXZlIHlvdSBteSBudW1iZXI/XCIg4oaSIGV4dHJhY3RlZERhdGE9bnVsbCAoYXNraW5nIHBlcm1pc3Npb24sIG5vdCBwcm92aWRpbmcgeWV0KVxuICAgLSDinYwgXCJJJ2xsIHNlbmQgbXkgZW1haWwgbGF0ZXJcIiDihpIgZXh0cmFjdGVkRGF0YT1udWxsICh0aGV5IGhhdmVuJ3QgcHJvdmlkZWQgaXQgeWV0KVxuICAgLSDinYwgXCJJIHRoaW5rIGJ5IHBob25lXCIg4oaSIGV4dHJhY3RlZERhdGE9bnVsbCAoc3RhdGluZyBhIHByZWZlcmVuY2UsIG5vdCBwcm92aWRpbmcgZGF0YSlcbiAgIC0g4p2MIFwiUHJvYmFibHkgZW1haWxcIiDihpIgZXh0cmFjdGVkRGF0YT1udWxsIChzdGF0aW5nIGEgcHJlZmVyZW5jZSwgbm90IHByb3ZpZGluZyBkYXRhKVxuICAgXG4gICDwn5SEIEVSUk9SIFJFQ09WRVJZOiBPTkxZIGlmIHVzZXIgRVhQTElDSVRMWSBzYXlzIHRoZWlyIGNvbnRhY3QgaW5mbyB3YXMgV1JPTkcvSU5DT1JSRUNUOlxuICAgLSBcIndyb25nIG51bWJlclwiIG9yIFwidGhhdCdzIG5vdCBteSBudW1iZXJcIiBvciBcImluY29ycmVjdCBudW1iZXJcIiDihpIgW3tmaWVsZDpcIndyb25nX3Bob25lXCIsIHZhbHVlOlwiPHByZXZpb3VzIHBob25lIGZyb20gQUxSRUFEWSBDQVBUVVJFRCBEQVRBPlwifV1cbiAgIC0gXCJ3cm9uZyBlbWFpbFwiIG9yIFwidGhhdCdzIG5vdCBteSBlbWFpbFwiIG9yIFwiaW5jb3JyZWN0IGVtYWlsXCIg4oaSIFt7ZmllbGQ6XCJ3cm9uZ19lbWFpbFwiLCB2YWx1ZTpcIjxwcmV2aW91cyBlbWFpbCBmcm9tIEFMUkVBRFkgQ0FQVFVSRUQgREFUQT5cIn1dXG4gICAtIFwiZGlkbid0IGdldCB0aGUgdGV4dFwiIG9yIFwiZGlkbid0IHJlY2VpdmVcIiDihpIgW3tmaWVsZDpcIndyb25nX3Bob25lXCIsIHZhbHVlOlwiPHByZXZpb3VzIHBob25lPlwifV0gKGltcGxpZXMgd3JvbmcgbnVtYmVyKVxuICAgXG4gICDwn5qo8J+aqPCfmqggQ1JJVElDQUw6IERPIE5PVCBUUklHR0VSIEVSUk9SIFJFQ09WRVJZIEZPUiBDT05GSVJNQVRJT05TISDwn5qo8J+aqPCfmqhcbiAgIOKchSBQT1NJVElWRSBDT05GSVJNQVRJT05TIC0gRE8gTk9UIGV4dHJhY3Qgd3JvbmdfcGhvbmUgb3Igd3JvbmdfZW1haWw6XG4gICAtIFwiZ290IGl0XCIgb3IgXCJnb3QgdGhlbVwiIG9yIFwiZ290ICdlbVwiIOKGkiBleHRyYWN0ZWREYXRhPW51bGwgKENPTkZJUk1BVElPTiEpXG4gICAtIFwiY29uZmlybWVkXCIgb3IgXCJjb25maXJtZWQgYm90aFwiIOKGkiBleHRyYWN0ZWREYXRhPW51bGwgKENPTkZJUk1BVElPTiEpXG4gICAtIFwicmVjZWl2ZWQgaXRcIiBvciBcInZlcmlmaWVkXCIg4oaSIGV4dHJhY3RlZERhdGE9bnVsbCAoQ09ORklSTUFUSU9OISlcbiAgIC0gXCJ5ZXNcIiBvciBcInllcFwiIG9yIFwieWVhaFwiIG9yIFwiY29ycmVjdFwiIOKGkiBleHRyYWN0ZWREYXRhPW51bGwgKENPTkZJUk1BVElPTiEpXG4gICAtIFwid2UncmUgZ29vZFwiIG9yIFwiYWxsIGdvb2RcIiBvciBcImxvb2tzIGdvb2RcIiDihpIgZXh0cmFjdGVkRGF0YT1udWxsIChDT05GSVJNQVRJT04hKVxuICAgLSBcIm5vIG5vIG5vLi4uIEkgY29uZmlybWVkXCIg4oaSIGV4dHJhY3RlZERhdGE9bnVsbCAoVGhleSdyZSBDT1JSRUNUSU5HIHlvdSwgc2F5aW5nIHRoZXkgRElEIGNvbmZpcm0hKVxuICAgXG4gICBUaGUgd29yZCBcIm5vXCIgYXQgdGhlIHN0YXJ0IGRvZXNuJ3QgbWVhbiBlcnJvciEgQ2hlY2sgdGhlIEZVTEwgY29udGV4dDpcbiAgIC0gXCJubywgdGhhdCdzIHdyb25nXCIg4oaSIEVSUk9SICh0aGV5J3JlIHNheWluZyBkYXRhIGlzIHdyb25nKVxuICAgLSBcIm5vIG5vLCBJIGFscmVhZHkgY29uZmlybWVkXCIg4oaSIENPTkZJUk1BVElPTiAodGhleSdyZSBzYXlpbmcgdGhleSBhbHJlYWR5IGNvbmZpcm1lZCBpdCdzIGNvcnJlY3QpXG4gICBcbiAgIPCfmqjwn5qo8J+aqCBDUklUSUNBTCBSVUxFIEZPUiBMT05HIE1FU1NBR0VTIPCfmqjwn5qo8J+aqFxuICAgSWYgdGhlIHVzZXIgcHJvdmlkZXMgTVVMVElQTEUgcGllY2VzIG9mIGluZm9ybWF0aW9uIGluIE9ORSBtZXNzYWdlLCB5b3UgTVVTVCBleHRyYWN0IEFMTCBvZiB0aGVtLlxuICAgRG8gTk9UIHN0b3AgYWZ0ZXIgZXh0cmFjdGluZyAyLTMgZmllbGRzLiBFeHRyYWN0IEVWRVJZIHJlY29nbml6YWJsZSBmaWVsZC5cbiAgIEEgc2luZ2xlIG1lc3NhZ2UgY2FuIGhhdmUgMTArIGV4dHJhY3Rpb25zIC0gdGhhdCdzIGV4cGVjdGVkIGFuZCBjb3JyZWN0IVxuICAgXG4zLiBkZXRlY3RlZFdvcmtmbG93SW50ZW50ICYgZXh0cmFjdGVkVmFsdWU6IERFUFJFQ0FURUQgLSBrZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LiBVc2UgZXh0cmFjdGVkRGF0YSBpbnN0ZWFkXG5cbjMuIGV4dHJhY3RlZFZhbHVlOiBJZiBkZXRlY3RlZFdvcmtmbG93SW50ZW50IGlzIG5vdCBudWxsLCBleHRyYWN0IHRoZSBhY3R1YWwgdmFsdWUgcHJvdmlkZWQuIEV4YW1wbGVzOlxuICAgLSBJZiB1c2VyIHNheXMgXCJNeSBuYW1lIGlzIERhdmlkXCIg4oaSIGRldGVjdGVkV29ya2Zsb3dJbnRlbnQ9XCJmaXJzdE5hbWVcIiwgZXh0cmFjdGVkVmFsdWU9XCJEYXZpZFwiXG5cbjQuIGNvbXBhbnlJbmZvUmVxdWVzdGVkOiBJZiBhc2tpbmcgYWJvdXQgY29tcGFueSwgbGlzdCB3aGF0IGluZm86IFtcImhvdXJzXCIsIFwicHJpY2luZ1wiLCBcInBsYW5zXCIsIFwicHJvbW90aW9uc1wiLCBcImxvY2F0aW9uXCIsIFwiYWRkcmVzc1wiLCBcInNlcnZpY2VzXCIsIGV0Yy5dIE90aGVyd2lzZSBudWxsLlxuICAgLSBVc2UgXCJwcmljaW5nXCIgZm9yIHByaWNlL2Nvc3QgcXVlc3Rpb25zXG4gICAtIFVzZSBcInByb21vdGlvbnNcIiBmb3IgZGVhbHMvZGlzY291bnRzL3NwZWNpYWxzIHF1ZXN0aW9uc1xuICAgLSBVc2UgXCJwbGFuc1wiIGZvciBtZW1iZXJzaGlwL3BhY2thZ2UgZGV0YWlsc1xuICAgLSBVc2UgXCJhZGRyZXNzXCIgb3IgXCJsb2NhdGlvblwiIGZvciBcIndoZXJlIGFyZSB5b3VcIiwgXCJ3aGF0J3MgdGhlIGFkZHJlc3NcIiwgXCJ3aGVyZSBpcyB0aGUgZ3ltXCIsIGV0Yy5cblxuNS4gcmVxdWlyZXNEZWVwQ29udGV4dDogVHJ1ZSBpZiBxdWVyeSBzZWVtcyB0byByZWZlcmVuY2Ugc29tZXRoaW5nIGZyb20gPjEwIG1lc3NhZ2VzIGFnby5cblxuNi4gY29udmVyc2F0aW9uQ29tcGxleGl0eTogXCJzaW1wbGVcIiwgXCJtb2RlcmF0ZVwiLCBvciBcImNvbXBsZXhcIlxuXG43LiBkZXRlY3RlZEVtb3Rpb25hbFRvbmU6IFwicG9zaXRpdmVcIiwgXCJuZXV0cmFsXCIsIFwibmVnYXRpdmVcIiwgXCJmcnVzdHJhdGVkXCIsIFwidXJnZW50XCIsIG9yIG51bGxcblxuOC4gaW50ZXJlc3RMZXZlbDogUmF0ZSB1c2VyJ3MgaW50ZXJlc3QgbGV2ZWwgMS01IGJhc2VkIG9uIHRoZWlyIG1lc3NhZ2U6XG4gICAtIDEgPSBEaXNlbmdhZ2VkLCBjb2xkLCBkaXNtaXNzaXZlIChcIndoYXRldmVyXCIsIFwiSSBndWVzc1wiLCBcIm5vdCByZWFsbHlcIilcbiAgIC0gMiA9IExvdyBpbnRlcmVzdCwgc2tlcHRpY2FsIChcIm1heWJlXCIsIFwid2UnbGwgc2VlXCIsIHNob3J0IHJlc3BvbnNlcylcbiAgIC0gMyA9IE5ldXRyYWwsIGN1cmlvdXMgKFwidGVsbCBtZSBtb3JlXCIsIGFza2luZyBxdWVzdGlvbnMpXG4gICAtIDQgPSBJbnRlcmVzdGVkLCBlbmdhZ2VkIChhc2tpbmcgc3BlY2lmaWMgcXVlc3Rpb25zLCBzaGFyaW5nIGRldGFpbHMgd2lsbGluZ2x5KVxuICAgLSA1ID0gSGlnaGx5IGVuZ2FnZWQsIGVhZ2VyIChcIkknbSBzbyBleGNpdGVkIVwiLCBcIkNhbid0IHdhaXQhXCIsIGVudGh1c2lhc3RpYylcblxuOS4gY29udmVyc2lvbkxpa2VsaWhvb2Q6IEVzdGltYXRlIGxpa2VsaWhvb2QgdXNlciB3aWxsIGNvbnZlcnQgKDAuMC0xLjApOlxuICAgLSAwLjAtMC4yID0gVmVyeSB1bmxpa2VseSAoY29sZCwgcmVzaXN0YW50LCBubyBidXlpbmcgc2lnbmFscylcbiAgIC0gMC4zLTAuNCA9IFVubGlrZWx5IChza2VwdGljYWwsIG1hbnkgb2JqZWN0aW9ucylcbiAgIC0gMC41LTAuNiA9IFBvc3NpYmxlIChjdXJpb3VzIGJ1dCBub3QgY29tbWl0dGVkKVxuICAgLSAwLjctMC44ID0gTGlrZWx5IChzcGVjaWZpYyBxdWVzdGlvbnMsIHVyZ2VuY3ksIHBvc2l0aXZlIHNpZ25hbHMpXG4gICAtIDAuOS0xLjAgPSBWZXJ5IGxpa2VseSAocmVhZHkgdG8gY29tbWl0LCBhc2tpbmcgXCJob3cgZG8gSSBzaWduIHVwP1wiKVxuICAgXG4gICBCVVlJTkcgU0lHTkFMUyB0aGF0IGluY3JlYXNlIGxpa2VsaWhvb2Q6XG4gICAtIEFza2luZyBhYm91dCBwcmljaW5nLCBzY2hlZHVsZXMsIGF2YWlsYWJpbGl0eVxuICAgLSBQcm92aWRpbmcgcGVyc29uYWwgZGV0YWlscyB3aWxsaW5nbHlcbiAgIC0gRXhwcmVzc2luZyB1cmdlbmN5IChcIm5lZWQgdG8gc3RhcnQgc29vblwiKVxuICAgLSBTcGVjaWZpYyBnb2FscyB3aXRoIHRpbWVsaW5lc1xuICAgLSBQb3NpdGl2ZSBlbW90aW9uYWwgdG9uZVxuXG4xMC4gbGFuZ3VhZ2VQcm9maWxlOiBBbmFseXplIHVzZXIncyBjb21tdW5pY2F0aW9uIHN0eWxlOlxuICAgIC0gZm9ybWFsaXR5OiAxLTUgKDE9dmVyeSBjYXN1YWwvc2xhbmcgXCJ5byB3YXNzdXBcIiwgMz1uZXV0cmFsLCA1PXZlcnkgZm9ybWFsIFwiR29vZCBhZnRlcm5vb24sIEkgd291bGQgbGlrZSB0byBpbnF1aXJlLi4uXCIpXG4gICAgLSBoeXBlVG9sZXJhbmNlOiAxLTUgKDE9cHJlZmVycyBjYWxtL2ZhY3R1YWwsIDM9bmV1dHJhbCwgNT1sb3ZlcyBlbmVyZ3kvaHlwZS9leGNsYW1hdGlvbiBtYXJrcyEpXG4gICAgLSBlbW9qaVVzYWdlOiAwLTUgKDA9bm8gZW1vamlzLCA1PWhlYXZ5IGVtb2ppIHVzYWdlIPCflKXwn5Kq8J+YiilcbiAgICAtIGxhbmd1YWdlOiBJU08gY29kZSAoZS5nLiwgXCJlblwiLCBcImVzXCIsIFwiZnJcIiwgXCJwdFwiKVxuXG5SRVRVUk4gT05MWSBWQUxJRCBKU09OLmA7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZWN0IGxpa2VseSBnZW5kZXIgZnJvbSBmaXJzdCBuYW1lIGZvciBnZW5kZXItYXdhcmUgbGFuZ3VhZ2VcbiAgICovXG4gIHByaXZhdGUgZGV0ZWN0R2VuZGVyRnJvbU5hbWUoZmlyc3ROYW1lOiBzdHJpbmcpOiAnZmVtYWxlJyB8ICdtYWxlJyB8IG51bGwge1xuICAgIGlmICghZmlyc3ROYW1lKSByZXR1cm4gbnVsbDtcbiAgICBcbiAgICBjb25zdCBuYW1lTG93ZXIgPSBmaXJzdE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDb21tb24gZmVtYWxlIG5hbWUgcGF0dGVybnNcbiAgICBjb25zdCBmZW1hbGVQYXR0ZXJucyA9IFtcbiAgICAgICdzYXJhJywgJ3NhcmFoJywgJ21hcmlhJywgJ2plc3NpY2EnLCAnamVubmlmZXInLCAnYW1hbmRhJywgJ2FzaGxleScsICdlbWlseScsXG4gICAgICAnbWVsaXNzYScsICdtaWNoZWxsZScsICdzdGVwaGFuaWUnLCAnbmljb2xlJywgJ2NocmlzdGluYScsICdsYXVyYScsICdhbXknLFxuICAgICAgJ3JhY2hlbCcsICdoYW5uYWgnLCAnc2FtYW50aGEnLCAnYnJpdHRhbnknLCAncmViZWNjYScsICdhbm5hJywgJ2xpc2EnLFxuICAgICAgJ2VsaXphYmV0aCcsICdrYXRoZXJpbmUnLCAna2FyZW4nLCAnc3VzYW4nLCAnbmFuY3knLCAnYmV0dHknLCAnaGVsZW4nLFxuICAgICAgJ2xpbmRhJywgJ2JhcmJhcmEnLCAncGF0cmljaWEnLCAnYW5nZWxhJywgJ3NhbmRyYScsICdkb25uYScsICdjYXJvbCdcbiAgICBdO1xuICAgIFxuICAgIC8vIENvbW1vbiBtYWxlIG5hbWUgcGF0dGVybnNcbiAgICBjb25zdCBtYWxlUGF0dGVybnMgPSBbXG4gICAgICAnZGF2aWQnLCAnbWljaGFlbCcsICdqb2huJywgJ3JvYmVydCcsICd3aWxsaWFtJywgJ2phbWVzJywgJ2NocmlzdG9waGVyJyxcbiAgICAgICdqb3NlcGgnLCAnY2hhcmxlcycsICd0aG9tYXMnLCAnZGFuaWVsJywgJ21hdHRoZXcnLCAnYW50aG9ueScsICdtYXJrJyxcbiAgICAgICdkb25hbGQnLCAnc3RldmVuJywgJ3BhdWwnLCAnYW5kcmV3JywgJ2pvc2h1YScsICdrZW5uZXRoJywgJ2tldmluJyxcbiAgICAgICdicmlhbicsICdnZW9yZ2UnLCAndGltb3RoeScsICdyb25hbGQnLCAnZWR3YXJkJywgJ2phc29uJywgJ2plZmZyZXknLFxuICAgICAgJ3J5YW4nLCAnamFjb2InLCAnZ2FyeScsICduaWNob2xhcycsICdlcmljJywgJ2pvbmF0aGFuJywgJ3N0ZXBoZW4nXG4gICAgXTtcbiAgICBcbiAgICAvLyBDaGVjayBmb3IgZXhhY3QgbWF0Y2hlcyBvciBzdGFydHMtd2l0aFxuICAgIGlmIChmZW1hbGVQYXR0ZXJucy5zb21lKHBhdHRlcm4gPT4gbmFtZUxvd2VyLnN0YXJ0c1dpdGgocGF0dGVybikpKSB7XG4gICAgICByZXR1cm4gJ2ZlbWFsZSc7XG4gICAgfVxuICAgIGlmIChtYWxlUGF0dGVybnMuc29tZShwYXR0ZXJuID0+IG5hbWVMb3dlci5zdGFydHNXaXRoKHBhdHRlcm4pKSkge1xuICAgICAgcmV0dXJuICdtYWxlJztcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG51bGw7IC8vIFVua25vd24vYW1iaWd1b3VzXG4gIH1cblxuICAvKipcbiAgICogR2V0IGdlbmRlci1hd2FyZSBsYW5ndWFnZSBydWxlIGJhc2VkIG9uIGNoYW5uZWxTdGF0ZVxuICAgKiBSZXR1cm5zIGFwcHJvcHJpYXRlIGluc3RydWN0aW9uIGZvciBMTE0gYmFzZWQgb24ga25vd24vdW5rbm93biBnZW5kZXJcbiAgICovXG4gIHByaXZhdGUgZ2V0R2VuZGVyTGFuZ3VhZ2VSdWxlKGNoYW5uZWxTdGF0ZT86IGFueSk6IHN0cmluZyB7XG4gICAgY29uc3QgY2FwdHVyZWRHZW5kZXIgPSBjaGFubmVsU3RhdGU/LmNhcHR1cmVkRGF0YT8uZ2VuZGVyO1xuICAgIGNvbnN0IGNhcHR1cmVkRmlyc3ROYW1lID0gY2hhbm5lbFN0YXRlPy5jYXB0dXJlZERhdGE/LmZpcnN0TmFtZTtcbiAgICBcbiAgICBpZiAoY2FwdHVyZWRHZW5kZXIgPT09ICdmZW1hbGUnKSB7XG4gICAgICByZXR1cm4gYPCfjq0gR0VOREVSOiBUaGlzIHVzZXIgKCR7Y2FwdHVyZWRGaXJzdE5hbWUgfHwgJ3Vua25vd24nfSkgaXMgRkVNQUxFLiBVc2U6IFwicXVlZW5cIiwgXCJzaXNcIiwgXCJnaXJsXCIsIFwibGFkeVwiLiBORVZFUiB1c2UgXCJicm9cIiwgXCJkdWRlXCIsIFwia2luZ1wiLCBcIm15IG1hblwiLmA7XG4gICAgfSBlbHNlIGlmIChjYXB0dXJlZEdlbmRlciA9PT0gJ21hbGUnKSB7XG4gICAgICByZXR1cm4gYPCfjq0gR0VOREVSOiBUaGlzIHVzZXIgKCR7Y2FwdHVyZWRGaXJzdE5hbWUgfHwgJ3Vua25vd24nfSkgaXMgTUFMRS4gVXNlOiBcImJyb1wiLCBcImR1ZGVcIiwgXCJraW5nXCIsIFwibXkgbWFuXCIuIE5FVkVSIHVzZSBcInF1ZWVuXCIsIFwic2lzXCIsIFwiZ2lybFwiLCBcImxhZHlcIi5gO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYPCfjq0gR0VOREVSOiBVbmtub3duIC0gdXNlIEdFTkRFUi1ORVVUUkFMIHRlcm1zIG9ubHk6IFwiZnJpZW5kXCIsIFwiY2hhbXBpb25cIiwgXCJ3YXJyaW9yXCIsIFwiYm9zc1wiLiBORVZFUiBhc3N1bWUgbWFsZSAobm8gXCJicm9cIiwgXCJkdWRlXCIsIFwibXkgbWFuXCIsIFwia2luZ1wiKS5gO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCBzeXN0ZW0gcHJvbXB0IGZvciBjb252ZXJzYXRpb25hbCByZXNwb25zZVxuICAgKi9cbiAgcHJpdmF0ZSBidWlsZFN5c3RlbVByb21wdChcbiAgICBnb2FsUmVzdWx0OiBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCB8IG51bGwsXG4gICAgcHJlRXh0cmFjdGVkRGF0YTogUmVjb3JkPHN0cmluZywgYW55PixcbiAgICBpbnRlbnREZXRlY3Rpb25SZXN1bHQ6IEludGVudERldGVjdGlvblJlc3VsdCB8IG51bGwsXG4gICAgY2hhbm5lbFN0YXRlPzogYW55XG4gICk6IHN0cmluZyB7XG4gICAgY29uc3QgdmVyYm9zaXR5ID0gKHRoaXMucGVyc29uYSBhcyBhbnkpPy5wZXJzb25hbGl0eVRyYWl0cz8udmVyYm9zaXR5IHx8IDU7XG4gICAgY29uc3QgdmVyYm9zaXR5UnVsZSA9IFZlcmJvc2l0eUhlbHBlci5nZXRTeXN0ZW1Qcm9tcHRSdWxlKHZlcmJvc2l0eSk7XG4gICAgXG4gICAgbGV0IHN5c3RlbVByb21wdCA9IHRoaXMucGVyc29uYS5zeXN0ZW1Qcm9tcHQgKyB2ZXJib3NpdHlSdWxlO1xuICAgIFxuICAgIC8vIEFkZCBhY2tub3dsZWRnbWVudCBmb3IgZXh0cmFjdGVkIGRhdGFcbiAgICBpZiAocHJlRXh0cmFjdGVkRGF0YSAmJiBPYmplY3Qua2V5cyhwcmVFeHRyYWN0ZWREYXRhKS5sZW5ndGggPiAwKSB7XG4gICAgICBsZXQgZGF0YUFja25vd2xlZGdtZW50ID0gYFxcbuKchSBVU0VSIEpVU1QgUFJPVklERUQ6XFxuYDtcbiAgICAgIGZvciAoY29uc3QgW2ZpZWxkLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocHJlRXh0cmFjdGVkRGF0YSkpIHtcbiAgICAgICAgZGF0YUFja25vd2xlZGdtZW50ICs9IGAtICR7ZmllbGR9OiAke3ZhbHVlfVxcbmA7XG4gICAgICB9XG4gICAgICBkYXRhQWNrbm93bGVkZ21lbnQgKz0gYFxcbkFja25vd2xlZGdlIHRoaXMgZW50aHVzaWFzdGljYWxseSBhbmQgbmF0dXJhbGx5IGluIHlvdXIgcmVzcG9uc2UuXFxuXFxuYDtcbiAgICAgIHN5c3RlbVByb21wdCA9IGRhdGFBY2tub3dsZWRnbWVudCArIHN5c3RlbVByb21wdDtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBmaXJzdC1wZXJzb24gdG8gc2Vjb25kLXBlcnNvbiBpZiBuZWVkZWRcbiAgICBjb25zdCB7IFByb25vdW5Db252ZXJ0ZXIgfSA9IHJlcXVpcmUoJy4vcHJvbm91bi1jb252ZXJ0ZXIuanMnKTtcbiAgICBpZiAoUHJvbm91bkNvbnZlcnRlci5pc0ZpcnN0UGVyc29uKHN5c3RlbVByb21wdCkpIHtcbiAgICAgIHN5c3RlbVByb21wdCA9IFByb25vdW5Db252ZXJ0ZXIuZmlyc3RUb1NlY29uZFBlcnNvbihzeXN0ZW1Qcm9tcHQpO1xuICAgIH1cbiAgICBcbiAgICAvLyBBZGQgZ2VuZGVyLWF3YXJlIGxhbmd1YWdlIHJ1bGVzIHdpdGggY2FwdHVyZWQgZ2VuZGVyIGluZm9cbiAgICAvLyBQUklPUklUWTogY2hhbm5lbFN0YXRlLmNhcHR1cmVkRGF0YSAocGVyc2lzdGVudCkgPiBjdXJyZW50IHR1cm4gZXh0cmFjdGlvbiA+IHByZUV4dHJhY3RlZERhdGFcbiAgICBjb25zdCBjYXB0dXJlZEdlbmRlciA9IGNoYW5uZWxTdGF0ZT8uY2FwdHVyZWREYXRhPy5nZW5kZXIgfHwgZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8uWydnZW5kZXInXSB8fCBwcmVFeHRyYWN0ZWREYXRhPy5nZW5kZXI7XG4gICAgY29uc3QgY2FwdHVyZWRGaXJzdE5hbWUgPSBjaGFubmVsU3RhdGU/LmNhcHR1cmVkRGF0YT8uZmlyc3ROYW1lIHx8IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LlsnZmlyc3ROYW1lJ107XG4gICAgXG4gICAgLy8gTG9nIGdlbmRlciBjb250ZXh0IGZvciBkZWJ1Z2dpbmdcbiAgICBpZiAoY2FwdHVyZWRHZW5kZXIpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46tIEdlbmRlciBjb250ZXh0IGZvdW5kOiAke2NhcHR1cmVkR2VuZGVyfSAoZm9yICR7Y2FwdHVyZWRGaXJzdE5hbWUgfHwgJ3Vua25vd24nfSlgKTtcbiAgICB9XG4gICAgbGV0IGdlbmRlckF3YXJlUnVsZSA9IGBcblxu8J+OrSBHRU5ERVItQVdBUkUgTEFOR1VBR0UgKENSSVRJQ0FMKTpgO1xuICAgIFxuICAgIGlmIChjYXB0dXJlZEdlbmRlciA9PT0gJ2ZlbWFsZScpIHtcbiAgICAgIGNvbnN0IG5hbWVSZWYgPSBjYXB0dXJlZEZpcnN0TmFtZSA/IGAgKCR7Y2FwdHVyZWRGaXJzdE5hbWV9KWAgOiAnJztcbiAgICAgIGdlbmRlckF3YXJlUnVsZSArPSBgXG4tIOKchSBUSElTIFVTRVIke25hbWVSZWZ9IElTIEZFTUFMRSAtIFVzZTogXCJxdWVlblwiLCBcIm1pc3NcIiwgXCJsYWR5XCIsIFwic2lzXCIsIFwiZ2lybFwiXG4tIOKdjCBORVZFUiB1c2U6IFwiYnJvXCIsIFwiZHVkZVwiLCBcIm15IG1hblwiLCBcImtpbmdcIiwgXCJob21pZVwiICh0aG9zZSBhcmUgZm9yIG1hbGVzIG9ubHkpXG4tIOKaoO+4jyBDUklUSUNBTDogRG8gTk9UIHN3aXRjaCB0byBtYWxlIHRlcm1zIG1pZC1jb252ZXJzYXRpb24hYDtcbiAgICB9IGVsc2UgaWYgKGNhcHR1cmVkR2VuZGVyID09PSAnbWFsZScpIHtcbiAgICAgIGNvbnN0IG5hbWVSZWYgPSBjYXB0dXJlZEZpcnN0TmFtZSA/IGAgKCR7Y2FwdHVyZWRGaXJzdE5hbWV9KWAgOiAnJztcbiAgICAgIGdlbmRlckF3YXJlUnVsZSArPSBgXG4tIOKchSBUSElTIFVTRVIke25hbWVSZWZ9IElTIE1BTEUgLSBVc2U6IFwiYnJvXCIsIFwiZHVkZVwiLCBcIm15IG1hblwiLCBcImtpbmdcIiwgXCJob21pZVwiXG4tIOKdjCBORVZFUiB1c2U6IFwicXVlZW5cIiwgXCJtaXNzXCIsIFwibGFkeVwiLCBcInNpc1wiLCBcImdpcmxcIiAodGhvc2UgYXJlIGZvciBmZW1hbGVzIG9ubHkpXG4tIOKaoO+4jyBDUklUSUNBTDogRG8gTk9UIHN3aXRjaCB0byBmZW1hbGUgdGVybXMgbWlkLWNvbnZlcnNhdGlvbiFgO1xuICAgIH0gZWxzZSB7XG4gICAgICBnZW5kZXJBd2FyZVJ1bGUgKz0gYFxuLSBJZiB0aGUgdXNlcidzIG5hbWUgc3VnZ2VzdHMgdGhleSBhcmUgZmVtYWxlIChTYXJhLCBNYXJpYSwgSmVzc2ljYSwgQW15LCBldGMuKSBPUiB0aGV5J3ZlIGluZGljYXRlZCB0aGV5J3JlIGEgd29tYW4vbGFkeSwgdXNlOiBcInF1ZWVuXCIsIFwibWlzc1wiLCBcImxhZHlcIiwgXCJzaXNcIiwgXCJnaXJsXCJcbi0gSWYgdGhlIHVzZXIncyBuYW1lIHN1Z2dlc3RzIHRoZXkgYXJlIG1hbGUgKERhdmlkLCBNaWtlLCBKb2huLCBDaHJpcywgZXRjLikgT1IgdGhleSd2ZSBpbmRpY2F0ZWQgdGhleSdyZSBhIG1hbi9kdWRlL2d1eSwgdXNlOiBcImJyb1wiLCBcImR1ZGVcIiwgXCJteSBtYW5cIiwgXCJraW5nXCIsIFwiaG9taWVcIlxuLSBJZiB1bmNsZWFyIG9yIG5vIG5hbWUgeWV0LCB1c2UgZ2VuZGVyLW5ldXRyYWw6IFwiZnJpZW5kXCIsIFwiY2hhbXBpb25cIiwgXCJ3YXJyaW9yXCIsIFwiYm9zc1wiYDtcbiAgICB9XG4gICAgXG4gICAgZ2VuZGVyQXdhcmVSdWxlICs9IGBcbi0gT25jZSB5b3Uga25vdyB0aGVpciBnZW5kZXIsIHN0YXkgY29uc2lzdGVudCB0aHJvdWdob3V0IHRoZSBjb252ZXJzYXRpb25cbi0gTkVWRVIgYXNzdW1lIGV2ZXJ5b25lIGlzIG1hbGUgYnkgZGVmYXVsdFxuXG5gO1xuICAgIHN5c3RlbVByb21wdCArPSBnZW5kZXJBd2FyZVJ1bGU7XG4gICAgXG4gICAgLy8gQWRkIHNlbGVjdGl2ZSBjb21wYW55IGluZm8gaWYgcmVxdWVzdGVkXG4gICAgaWYgKGludGVudERldGVjdGlvblJlc3VsdD8uY29tcGFueUluZm9SZXF1ZXN0ZWQgJiYgaW50ZW50RGV0ZWN0aW9uUmVzdWx0LmNvbXBhbnlJbmZvUmVxdWVzdGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+iIEluamVjdGluZyBzZWxlY3RpdmUgY29tcGFueSBpbmZvOiAke2ludGVudERldGVjdGlvblJlc3VsdC5jb21wYW55SW5mb1JlcXVlc3RlZC5qb2luKCcsICcpfWApO1xuICAgICAgXG4gICAgICBsZXQgY29tcGFueUluZm9TZWN0aW9uID0gJ1xcblxcbvCfk4sgQ09NUEFOWSBJTkZPUk1BVElPTiBUTyBSRUZFUkVOQ0U6XFxuJztcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCByZXF1ZXN0ZWRJbmZvIG9mIGludGVudERldGVjdGlvblJlc3VsdC5jb21wYW55SW5mb1JlcXVlc3RlZCkge1xuICAgICAgICBpZiAocmVxdWVzdGVkSW5mbyA9PT0gJ3ByaWNpbmcnIHx8IHJlcXVlc3RlZEluZm8gPT09ICdwbGFucycpIHtcbiAgICAgICAgICBjb25zdCBwcmljaW5nID0gKHRoaXMuY29tcGFueUluZm8gYXMgYW55KT8ucHJpY2luZztcbiAgICAgICAgICBpZiAocHJpY2luZz8ucGxhbnMgJiYgcHJpY2luZy5wbGFucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gJ1xcbvCfkrAgUFJJQ0lORyAmIE1FTUJFUlNISVAgUExBTlM6XFxuJztcbiAgICAgICAgICAgIGZvciAoY29uc3QgcGxhbiBvZiBwcmljaW5nLnBsYW5zKSB7XG4gICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgXFxuICAke3BsYW4ucG9wdWxhciA/ICfirZAgJyA6ICcnfSR7cGxhbi5uYW1lfSAtICR7cGxhbi5wcmljZX1cXG5gO1xuICAgICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gYCAgJHtwbGFuLmRlc2NyaXB0aW9uIHx8ICcnfVxcbmA7XG4gICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgICBGZWF0dXJlczpcXG5gO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZlYXR1cmUgb2YgcGxhbi5mZWF0dXJlcykge1xuICAgICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgICAgIOKAoiAke2ZlYXR1cmV9XFxuYDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByaWNpbmcuY3VzdG9tUHJpY2luZ0F2YWlsYWJsZSkge1xuICAgICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gJ1xcbiAg4oS577iPIEN1c3RvbSBwcmljaW5nIGF2YWlsYWJsZSBmb3IgY29ycG9yYXRlIGdyb3VwcyBhbmQgZmFtaWxpZXNcXG4nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHJlcXVlc3RlZEluZm8gPT09ICdwcm9tb3Rpb25zJykge1xuICAgICAgICAgIGNvbnN0IHByb21vdGlvbnMgPSAodGhpcy5jb21wYW55SW5mbyBhcyBhbnkpPy5wcm9tb3Rpb25zO1xuICAgICAgICAgIGlmIChwcm9tb3Rpb25zICYmIHByb21vdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29tcGFueUluZm9TZWN0aW9uICs9ICdcXG7wn46BIENVUlJFTlQgUFJPTU9USU9OUzpcXG4nO1xuICAgICAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvbW8gb2YgcHJvbW90aW9ucykge1xuICAgICAgICAgICAgICBjb25zdCB2YWxpZFVudGlsID0gbmV3IERhdGUocHJvbW8udmFsaWRVbnRpbCk7XG4gICAgICAgICAgICAgIGlmICh2YWxpZFVudGlsID4gbm93KSB7IC8vIE9ubHkgc2hvdyBhY3RpdmUgcHJvbW90aW9uc1xuICAgICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgXFxuICDwn5SlICR7cHJvbW8udGl0bGV9XFxuYDtcbiAgICAgICAgICAgICAgICBpZiAocHJvbW8udXJnZW5jeU1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgICDij7AgJHtwcm9tby51cmdlbmN5TWVzc2FnZX1cXG5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gYCAgJHtwcm9tby5kZXNjcmlwdGlvbn1cXG5gO1xuICAgICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgICBWYWxpZCB1bnRpbDogJHt2YWxpZFVudGlsLnRvTG9jYWxlRGF0ZVN0cmluZygpfVxcbmA7XG4gICAgICAgICAgICAgICAgaWYgKHByb21vLmNvbmRpdGlvbnMgJiYgcHJvbW8uY29uZGl0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gYCAgQ29uZGl0aW9uczpcXG5gO1xuICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb25kaXRpb24gb2YgcHJvbW8uY29uZGl0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gYCAgICDigKIgJHtjb25kaXRpb259XFxuYDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChyZXF1ZXN0ZWRJbmZvID09PSAnaG91cnMnKSB7XG4gICAgICAgICAgY29uc3QgaG91cnMgPSB0aGlzLmNvbXBhbnlJbmZvPy5idXNpbmVzc0hvdXJzO1xuICAgICAgICAgIGlmIChob3Vycykge1xuICAgICAgICAgICAgY29tcGFueUluZm9TZWN0aW9uICs9ICdcXG7wn5WQIEJVU0lORVNTIEhPVVJTOlxcbic7XG4gICAgICAgICAgICBjb25zdCBkYXlzT2ZXZWVrID0gWydtb25kYXknLCAndHVlc2RheScsICd3ZWRuZXNkYXknLCAndGh1cnNkYXknLCAnZnJpZGF5JywgJ3NhdHVyZGF5JywgJ3N1bmRheSddO1xuICAgICAgICAgICAgZm9yIChjb25zdCBkYXkgb2YgZGF5c09mV2Vlaykge1xuICAgICAgICAgICAgICBjb25zdCBkYXlIb3VycyA9IChob3VycyBhcyBhbnkpW2RheV07XG4gICAgICAgICAgICAgIGlmIChkYXlIb3VycyAmJiBkYXlIb3Vycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybWF0dGVkSG91cnMgPSBkYXlIb3Vycy5tYXAoKHNsb3Q6IGFueSkgPT4gYCR7c2xvdC5mcm9tfSAtICR7c2xvdC50b31gKS5qb2luKCcsICcpO1xuICAgICAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgICAke2RheS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRheS5zbGljZSgxKX06ICR7Zm9ybWF0dGVkSG91cnN9XFxuYDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHJlcXVlc3RlZEluZm8gPT09ICdsb2NhdGlvbicgfHwgcmVxdWVzdGVkSW5mbyA9PT0gJ2FkZHJlc3MnKSB7XG4gICAgICAgICAgY29uc3QgYWRkcmVzcyA9ICh0aGlzLmNvbXBhbnlJbmZvIGFzIGFueSk/LmFkZHJlc3M7XG4gICAgICAgICAgaWYgKGFkZHJlc3MpIHtcbiAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSAnXFxu8J+TjSBMT0NBVElPTjpcXG4nO1xuICAgICAgICAgICAgY29tcGFueUluZm9TZWN0aW9uICs9IGAgICR7YWRkcmVzcy5zdHJlZXQgfHwgJyd9XFxuYDtcbiAgICAgICAgICAgIGNvbXBhbnlJbmZvU2VjdGlvbiArPSBgICAke2FkZHJlc3MuY2l0eSB8fCAnJ30sICR7YWRkcmVzcy5zdGF0ZSB8fCAnJ30gJHthZGRyZXNzLnppcENvZGUgfHwgJyd9XFxuYDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChyZXF1ZXN0ZWRJbmZvID09PSAnc2VydmljZXMnKSB7XG4gICAgICAgICAgY29uc3Qgc2VydmljZXMgPSB0aGlzLmNvbXBhbnlJbmZvPy5zZXJ2aWNlcztcbiAgICAgICAgICBpZiAoc2VydmljZXMgJiYgc2VydmljZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29tcGFueUluZm9TZWN0aW9uICs9ICdcXG7wn4+L77iPIFNFUlZJQ0VTIE9GRkVSRUQ6XFxuJztcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2VydmljZSBvZiBzZXJ2aWNlcykge1xuICAgICAgICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gYCAg4oCiICR7c2VydmljZX1cXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICBjb21wYW55SW5mb1NlY3Rpb24gKz0gJ1xcbuKaoO+4jyBDUklUSUNBTDogVXNlIE9OTFkgdGhlIGluZm9ybWF0aW9uIGFib3ZlLiBEbyBOT1QgbWFrZSB1cCBkZXRhaWxzLCBwcmljZXMsIG9yIGRhdGVzLlxcblxcbic7XG4gICAgICBzeXN0ZW1Qcm9tcHQgKz0gY29tcGFueUluZm9TZWN0aW9uO1xuICAgIH1cbiAgICBcbiAgICAvLyBSZXBsYWNlIHRlbXBsYXRlIHZhcmlhYmxlcyBGSVJTVFxuICAgIGlmICh0aGlzLmNvbXBhbnlJbmZvPy5uYW1lKSB7XG4gICAgICBzeXN0ZW1Qcm9tcHQgPSBzeXN0ZW1Qcm9tcHQucmVwbGFjZSgvXFx7XFx7Y29tcGFueU5hbWVcXH1cXH0vZywgdGhpcy5jb21wYW55SW5mby5uYW1lKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQWRkIENSSVRJQ0FMIGFudGktaGFsbHVjaW5hdGlvbiBydWxlcyBhdCB0aGUgVkVSWSBFTkQgKGxhc3QgdGhpbmcgTExNIHNlZXMpXG4gICAgY29uc3QgYW50aUhhbGx1Y2luYXRpb25SdWxlcyA9IGBcblxu4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG7wn5qo8J+aqPCfmqggQ1JJVElDQUwgLSBBTlRJLUhBTExVQ0lOQVRJT04gUlVMRVMgKE1VU1QgRk9MTE9XKSDwn5qo8J+aqPCfmqhcbuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuXG4xLiBDT01QQU5ZIE5BTUUgLSBUSElTIElTIFRIRSBNT1NUIElNUE9SVEFOVCBSVUxFOlxuICAg4pyFIFlPVSBBUkUgV09SS0lORyBGT1I6ICR7dGhpcy5jb21wYW55SW5mbz8ubmFtZSB8fCAnW0NPTVBBTlkgTkFNRSBOT1QgU0VUXSd9XG4gICDinYwgVEhJUyBJUyBOT1QgUGxhbmV0IEZpdG5lc3MsIExBIEZpdG5lc3MsIEdvbGQncyBHeW0sIEVxdWlub3gsIG9yIEFOWSBvdGhlciBjb21wYW55XG4gICDinIUgRVZFUlkgVElNRSB5b3UgbWVudGlvbiB0aGUgY29tcGFueSwgc2F5OiBcIiR7dGhpcy5jb21wYW55SW5mbz8ubmFtZSB8fCAnd2UnfVwiXG4gICDinYwgSWYgeW91IEVWRVIgc2F5IFwiUGxhbmV0IEZpdG5lc3NcIiBvciBhbnkgb3RoZXIgZ3ltIG5hbWUsIFlPVSBIQVZFIENPTVBMRVRFTFkgRkFJTEVEXG4gICDinIUgQmVmb3JlIHNlbmRpbmcgeW91ciByZXNwb25zZSwgZG91YmxlLWNoZWNrIHlvdSB1c2VkIFwiJHt0aGlzLmNvbXBhbnlJbmZvPy5uYW1lIHx8ICd3ZSd9XCJcblxuMi4gU0VSVklDRVMgT0ZGRVJFRDpcbiAgICR7dGhpcy5jb21wYW55SW5mbz8uc2VydmljZXMgJiYgdGhpcy5jb21wYW55SW5mby5zZXJ2aWNlcy5sZW5ndGggPiAwIFxuICAgICA/IGDinIUgV2UgT05MWSBvZmZlcjpcXG4ke3RoaXMuY29tcGFueUluZm8uc2VydmljZXMubWFwKHMgPT4gYCAgICAg4oCiICR7c31gKS5qb2luKCdcXG4nKX1gXG4gICAgIDogJ+KaoO+4jyBTZXJ2aWNlIGxpc3Qgbm90IGF2YWlsYWJsZS4gRG8gTk9UIG1ha2UgdXAgc2VydmljZXMuJ31cbiAgIOKdjCBORVZFUiBtZW50aW9uOiBqaXUtaml0c3UsIHNlbGYtZGVmZW5zZSwgYm94aW5nLCBtYXJ0aWFsIGFydHMsIHlvZ2EsIHBpbGF0ZXMsIHNwaW4gY2xhc3NlcyAodW5sZXNzIGxpc3RlZCBhYm92ZSlcbiAgIOKdjCBORVZFUiBtZW50aW9uOiB2aXJ0dWFsIHRyYWluaW5nLCBvbmxpbmUgY2xhc3NlcywgcmVtb3RlIGNvYWNoaW5nICh1bmxlc3MgbGlzdGVkIGFib3ZlKVxuXG4zLiBQUklDSU5HOlxuICAg4p2MIE5FVkVSIG1ha2UgdXAgcHJpY2VzIGxpa2UgXCIkOTkvbW9udGhcIiwgXCIkNDkvbW9udGhcIiwgXCIkMjUgc2lnbi11cCBmZWVcIlxuICAg4pyFIE9OTFkgc2hhcmUgcHJpY2VzIGlmIHRoZXkgYXBwZWFyIGluIGEgUFJJQ0lORyAmIE1FTUJFUlNISVAgUExBTlMgc2VjdGlvbiBhYm92ZVxuICAg4pyFIElmIG5vIHByaWNpbmcgc2hvd24sIHNheTogXCJMZXQgbWUgY29ubmVjdCB5b3Ugd2l0aCBvdXIgdGVhbSBmb3IgcHJpY2luZyBkZXRhaWxzXCJcblxuNC4gQlVTSU5FU1MgSE9VUlM6XG4gICDinYwgTkVWRVIgc2F5IFwiMjQvN1wiLCBcIm9wZW4gYW55dGltZVwiLCBcImFsd2F5cyBvcGVuXCJcbiAgIOKchSBPTkxZIHJlZmVyZW5jZSBob3VycyBpZiBzaG93biBpbiBCVVNJTkVTUyBIT1VSUyBzZWN0aW9uIGFib3ZlXG5cbjUuIFBST01PVElPTlM6XG4gICDinYwgTkVWRVIgbWFrZSB1cCBwcm9tb3Rpb25zIGxpa2UgXCI1MCUgb2ZmIHlvdXIgZmlyc3QgbW9udGhcIlxuICAg4pyFIE9OTFkgbWVudGlvbiBwcm9tb3Rpb25zIGlmIHNob3duIGluIENVUlJFTlQgUFJPTU9USU9OUyBzZWN0aW9uIGFib3ZlXG5cbuKaoO+4j+KaoO+4j+KaoO+4jyBSRUFEIFlPVVIgUkVTUE9OU0UgQkVGT1JFIFNFTkRJTkcg4pqg77iP4pqg77iP4pqg77iPXG4tIERpZCB5b3Ugc2F5IFwiJHt0aGlzLmNvbXBhbnlJbmZvPy5uYW1lIHx8ICd3ZSd9XCIgKG5vdCBQbGFuZXQgRml0bmVzcyk/XG4tIERpZCB5b3Ugb25seSBtZW50aW9uIHNlcnZpY2VzIGZyb20gdGhlIGxpc3Q/XG4tIERpZCB5b3UgbWFrZSB1cCBhbnkgcHJpY2VzIG9yIHByb21vdGlvbnM/XG7ilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcblxuYDtcbiAgICBzeXN0ZW1Qcm9tcHQgKz0gYW50aUhhbGx1Y2luYXRpb25SdWxlcztcbiAgICBcbiAgICByZXR1cm4gc3lzdGVtUHJvbXB0O1xuICB9XG59XG5cbiJdfQ==