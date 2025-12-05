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
exports.AgentService = void 0;
const aws_1 = require("@langchain/aws");
const prompts_1 = require("@langchain/core/prompts");
const messages_1 = require("@langchain/core/messages");
const zod_1 = require("zod");
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
const channel_state_service_js_1 = require("./channel-state-service.js");
const verbosity_config_js_1 = require("./verbosity-config.js");
const goal_config_helper_js_1 = require("./goal-config-helper.js");
const message_processor_js_1 = require("./message-processor.js");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
// Zod schema for structured sentence output
const SentenceListSchema = zod_1.z.object({
    sentences: zod_1.z.array(zod_1.z.string().min(1)).describe('Array of complete, standalone sentences')
});
// Zod schema for intent detection (REQUEST #1)
const IntentDetectionSchema = zod_1.z.object({
    primaryIntent: zod_1.z.enum([
        'company_info_request',
        'workflow_data_capture',
        'general_conversation',
        'objection',
        'scheduling',
        'complaint',
        'question'
    ]).describe('Primary intent category of the user message'),
    detectedWorkflowIntent: zod_1.z.string().nullable().describe('Specific workflow field detected (e.g., "email", "phone", "firstName") or null if none'),
    companyInfoRequested: zod_1.z.array(zod_1.z.string()).nullable().describe('Specific company info fields requested (e.g., ["hours", "pricing", "location"]) or null if none'),
    requiresDeepContext: zod_1.z.boolean().describe('True if this conversation needs more than the last 10 messages for proper context'),
    conversationComplexity: zod_1.z.enum(['simple', 'moderate', 'complex']).describe('Overall complexity of the user query'),
    detectedEmotionalTone: zod_1.z.enum(['positive', 'neutral', 'frustrated', 'urgent']).optional().describe('Emotional tone of the message')
});
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
        // @ts-ignore - Type definitions outdated, GoalOrchestrator now accepts eventBridgeService
        this.goalOrchestrator = new goal_orchestrator_js_1.GoalOrchestrator(config.eventBridgeService);
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
        // Initialize channel state service for workflow tracking
        // Can be injected from CLI (LocalChannelStateService) or created from DynamoDB
        if (config.channelStateService) {
            this.channelStateService = config.channelStateService;
            console.log(`📊 Channel state service initialized (injected - local mode)`);
        }
        else if (config.dynamoService) {
            const dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: config.awsRegion });
            const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient, {
                marshallOptions: {
                    removeUndefinedValues: true,
                },
            });
            const workflowStateTable = process.env.WORKFLOW_STATE_TABLE || 'KxGen-agent-workflow-state';
            this.channelStateService = new channel_state_service_js_1.ChannelStateService(docClient, workflowStateTable);
            console.log(`📊 Channel state service initialized (table: ${workflowStateTable})`);
            // Initialize message tracking service for interruption handling (lazy loaded)
            // Will be initialized on first use in processMessageChunked
        }
        // Persona will be loaded per-request with company info substitution
        this.persona = {}; // Will be loaded per-request
        // Model will be initialized per-request with verbosity-aware maxTokens and temperature
        // DO NOT initialize here - wait until we have persona settings in processMessage()!
        this.model = null; // Will be created in processMessage() with correct settings
    }
    /**
     * 🏢 Build selective company info section (only requested fields)
     */
    buildSelectiveCompanyInfo(companyInfo, requestedFields) {
        if (!companyInfo || !requestedFields || requestedFields.length === 0) {
            return '';
        }
        let companyInfoSection = '\n\n📋 COMPANY INFORMATION:\n';
        // Map of field names to company info properties
        const fieldMap = {
            'hours': () => {
                if (!companyInfo.businessHours)
                    return '';
                let hoursText = '\n📅 BUSINESS HOURS (CRITICAL - USE THESE EXACT HOURS):\n';
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                days.forEach(day => {
                    const hours = companyInfo.businessHours?.[day];
                    if (hours && hours.length > 0) {
                        hoursText += `• ${day.charAt(0).toUpperCase() + day.slice(1)}: ${hours.map((h) => `${h.from}-${h.to}`).join(', ')}\n`;
                    }
                });
                hoursText += '\n⚠️ IMPORTANT: When asked about hours, ALWAYS use these exact times. Do NOT make up hours or say "24/7" unless explicitly shown above.\n';
                return hoursText;
            },
            'contact': () => {
                let contactText = '\n📞 CONTACT INFORMATION:\n';
                if (companyInfo.phone)
                    contactText += `• Phone: ${companyInfo.phone}\n`;
                if (companyInfo.email)
                    contactText += `• Email: ${companyInfo.email}\n`;
                if (companyInfo.website)
                    contactText += `• Website: ${companyInfo.website}\n`;
                return contactText;
            },
            'location': () => {
                if (!companyInfo.address?.street && !companyInfo.address?.city)
                    return '';
                let locationText = '\n📍 LOCATION:\n';
                if (companyInfo.address.street)
                    locationText += `${companyInfo.address.street}\n`;
                if (companyInfo.address.city && companyInfo.address.state && companyInfo.address.zipCode) {
                    locationText += `${companyInfo.address.city}, ${companyInfo.address.state} ${companyInfo.address.zipCode}\n`;
                }
                return locationText;
            },
            'services': () => {
                if (!companyInfo.products)
                    return '';
                return `\n💼 SERVICES/PRODUCTS:\n${companyInfo.products}\n`;
            },
            'pricing': () => {
                // Pricing typically requires contact info, so we might not include it here
                // But if it's specifically requested and available in description/benefits
                return '';
            },
            'staff': () => {
                // Staff info would come from persona data, not company info
                return '';
            }
        };
        // Build only the requested sections
        requestedFields.forEach(field => {
            const fieldLower = field.toLowerCase();
            if (fieldMap[fieldLower]) {
                const section = fieldMap[fieldLower]();
                if (section) {
                    companyInfoSection += section;
                }
            }
        });
        return companyInfoSection;
    }
    /**
     * 🎯 REQUEST #1: Detect intent and determine context needs
     */
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
            const verbosity = currentPersona?.personalityTraits?.verbosity || 5;
            console.log(`🎚️ Using verbosity: ${verbosity}`);
            // Get verbosity configuration from helper
            const verbosityConfig = verbosity_config_js_1.VerbosityHelper.getConfig(verbosity);
            const { maxTokens, temperature, maxSentences } = verbosityConfig;
            console.log(`🎚️ Verbosity config: ${verbosityConfig.description}`);
            console.log(`🎚️ Setting maxTokens=${maxTokens}, temperature=${temperature}, maxSentences=${maxSentences}`);
            // 👉 Question generation disabled - using ONLY goal-driven questions
            // Goals will provide all questions via the workflow
            const shouldAddQuestion = false;
            console.log(`❓ Question generation: DISABLED (using goal-driven questions only)`);
            // Recreate model with verbosity-aware maxTokens and temperature
            this.model = new aws_1.ChatBedrockConverse({
                model: this.config.bedrockModelId,
                region: this.config.awsRegion,
                temperature,
                maxTokens,
                max_tokens: maxTokens, // Also pass snake_case version for Bedrock API
            });
            // ═══════════════════════════════════════════════════════════════════
            // 🎯 THREE-REQUEST ARCHITECTURE
            // ═══════════════════════════════════════════════════════════════════
            // REQUEST #1: Intent Detection & Context Analysis (performed first)
            // REQUEST #2: Conversational Response (uses results from #1)
            // REQUEST #3: Follow-Up Generation (verification or workflow question)
            // ═══════════════════════════════════════════════════════════════════
            // Run goal orchestration to manage lead qualification
            let goalResult = null;
            // Load channel workflow state (Phase C: Persistent state)
            let channelState;
            if (this.channelStateService && context.conversation_id) {
                try {
                    channelState = await this.channelStateService.loadWorkflowState(context.conversation_id, context.tenantId);
                    console.log(`📊 Loaded channel state: ${JSON.stringify(channelState, null, 2)}`);
                    // Increment message count
                    channelState = await this.channelStateService.incrementMessageCount(context.conversation_id, context.tenantId);
                }
                catch (error) {
                    console.error('❌ Error loading channel state:', error);
                }
            }
            // Determine effective goal configuration (company-level takes precedence over persona-level)
            const effectiveGoalConfig = goal_config_helper_js_1.GoalConfigHelper.getEffectiveConfig(this.config.companyInfo, currentPersona);
            console.log(`🔍 Checking goal config - enabled: ${effectiveGoalConfig.enabled}, goals: ${effectiveGoalConfig.goals?.length || 0}`);
            if (goal_config_helper_js_1.GoalConfigHelper.isEnabled(effectiveGoalConfig)) {
                const goalSource = goal_config_helper_js_1.GoalConfigHelper.getSourceDescription(effectiveGoalConfig);
                console.log(`🔍 Goal orchestration enabled (${goalSource}): ${effectiveGoalConfig.goals.length} goals configured`);
            }
            else {
                console.log(`⚠️ Goal orchestration DISABLED - enabled: ${effectiveGoalConfig.enabled}, goals: ${effectiveGoalConfig.goals?.length || 0}`);
            }
            if (goal_config_helper_js_1.GoalConfigHelper.isEnabled(effectiveGoalConfig)) {
                try {
                    // Pass empty history for now - will be enhanced in Phase C with proper state loading
                    const conversationTexts = [];
                    goalResult = await this.goalOrchestrator.orchestrateGoals(context.text, context.conversation_id || 'default', context.email_lc, context.tenantId, effectiveGoalConfig, conversationTexts, context.source, // channel
                    channelState // Pass the channel state!
                    );
                    // Log goal orchestration results with HIGHLIGHT
                    if (goalResult.extractedInfo && Object.keys(goalResult.extractedInfo).length > 0) {
                        console.log('\n' + '═'.repeat(64));
                        console.log('🎯 INTENT CAPTURED - DATA EXTRACTED');
                        console.log('═'.repeat(64));
                        for (const [field, value] of Object.entries(goalResult.extractedInfo)) {
                            console.log(`  ✅ ${field}: ${JSON.stringify(value)}`);
                        }
                        console.log('═'.repeat(64) + '\n');
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
                    // ═══════════════════════════════════════════════════════════════════
                    // 🚀 FAST-TRACK DETECTION
                    // ═══════════════════════════════════════════════════════════════════
                    // Fast-track triggers when:
                    // 1. User's INTENT is "scheduling" (they want to book), OR
                    // 2. User provides data that belongs to the PRIMARY goal
                    const primaryGoal = effectiveGoalConfig.goals.find(g => g.isPrimary);
                    if (primaryGoal) {
                        let shouldFastTrack = false;
                        let fastTrackReason = '';
                        // Check 1: Did user provide data for the primary goal's fields?
                        if (goalResult.extractedInfo && Object.keys(goalResult.extractedInfo).length > 0) {
                            const primaryGoalFields = this.getFieldNamesForGoal(primaryGoal);
                            const extractedFieldsForPrimary = Object.keys(goalResult.extractedInfo)
                                .filter(field => primaryGoalFields.includes(field));
                            if (extractedFieldsForPrimary.length > 0) {
                                shouldFastTrack = true;
                                fastTrackReason = `User provided data for primary goal fields: ${extractedFieldsForPrimary.join(', ')}`;
                            }
                        }
                        // Check 2: Is the primary goal a scheduling goal AND user's intent is scheduling?
                        // This catches "I want to schedule" even if no specific date/time was provided
                        if (!shouldFastTrack && primaryGoal.type === 'scheduling' && context.text) {
                            // Check if user message indicates scheduling intent
                            const schedulingKeywords = [
                                'schedule', 'book', 'appointment', 'come in', 'visit', 'class',
                                'session', 'sign up', 'register', 'available', 'open', 'times',
                                'when can', 'free class', 'first class', 'trial'
                            ];
                            const messageLower = context.text.toLowerCase();
                            const hasSchedulingIntent = schedulingKeywords.some(keyword => messageLower.includes(keyword));
                            if (hasSchedulingIntent) {
                                shouldFastTrack = true;
                                fastTrackReason = `User expressed scheduling intent in message`;
                            }
                        }
                        if (shouldFastTrack) {
                            console.log(`\n${'🚀'.repeat(20)}`);
                            console.log(`🚀 FAST-TRACK DETECTED!`);
                            console.log(`🚀 Reason: ${fastTrackReason}`);
                            console.log(`🚀 Primary goal: ${primaryGoal.name}`);
                            console.log(`${'🚀'.repeat(20)}\n`);
                            // Get prerequisites for the primary goal
                            const prerequisiteIds = primaryGoal.prerequisites
                                || primaryGoal.triggers?.prerequisiteGoals
                                || [];
                            console.log(`🚀 Prerequisites required: ${prerequisiteIds.length > 0 ? prerequisiteIds.join(', ') : 'none'}`);
                            // 🔥 SORT prerequisites by their workflow ORDER (not by array position)
                            const prerequisiteGoals = prerequisiteIds
                                .map((id) => effectiveGoalConfig.goals.find(g => g.id === id))
                                .filter((g) => g !== undefined);
                            const sortedPrerequisites = prerequisiteGoals
                                .sort((a, b) => (a.order || 999) - (b.order || 999))
                                .map((g) => g.id);
                            console.log(`🚀 Prerequisites sorted by workflow order: ${sortedPrerequisites.join(' → ')}`);
                            // Determine which goals to activate (sorted prerequisites + primary)
                            const fastTrackGoalIds = [...sortedPrerequisites, primaryGoal.id];
                            // Filter out already completed goals
                            const completedGoals = channelState?.completedGoals || [];
                            const goalsToActivate = fastTrackGoalIds.filter(id => !completedGoals.includes(id));
                            // Find the first incomplete goal in the fast-track sequence
                            const nextFastTrackGoal = goalsToActivate[0];
                            if (nextFastTrackGoal) {
                                console.log(`🚀 Fast-tracking: Activating ${nextFastTrackGoal} (skipping non-essential goals)`);
                                goalResult.activeGoals = [nextFastTrackGoal];
                                // Persist the fast-track goal activation and sequence
                                if (this.channelStateService && context.conversation_id) {
                                    await this.channelStateService.setActiveGoals(context.conversation_id, [nextFastTrackGoal], context.tenantId);
                                    await this.channelStateService.updateWorkflowState(context.conversation_id, { fastTrackGoals: fastTrackGoalIds }, context.tenantId);
                                }
                            }
                        }
                    }
                    // Phase C: Save extracted data to channel state
                    if (this.channelStateService && context.conversation_id) {
                        try {
                            // Save each extracted field
                            for (const [fieldName, fieldValue] of Object.entries(goalResult.extractedInfo || {})) {
                                await this.channelStateService.markFieldCaptured(context.conversation_id, fieldName, fieldValue, context.tenantId);
                            }
                            // Update active goals
                            console.log(`🎯 Active goals from orchestrator: ${JSON.stringify(goalResult.activeGoals)}`);
                            if (goalResult.activeGoals.length > 0) {
                                await this.channelStateService.setActiveGoals(context.conversation_id, goalResult.activeGoals, context.tenantId);
                            }
                            // Mark completed goals
                            console.log(`✅ Newly completed goals: ${JSON.stringify(goalResult.stateUpdates.newlyCompleted)}`);
                            for (const completedGoalId of goalResult.stateUpdates.newlyCompleted) {
                                await this.channelStateService.markGoalCompleted(context.conversation_id, completedGoalId, context.tenantId);
                            }
                            // Check if all contact info is complete
                            const updatedState = await this.channelStateService.loadWorkflowState(context.conversation_id, context.tenantId);
                            if (this.channelStateService.isContactInfoComplete(updatedState)) {
                                const eventName = 'lead.contact_captured';
                                // Only emit if we haven't already
                                if (!this.channelStateService.hasEventBeenEmitted(updatedState, eventName)) {
                                    console.log(`🎉 ALL CONTACT INFO COMPLETE! Emitting ${eventName}`);
                                    if (this.config.eventBridgeService) {
                                        // Publish custom event (not using publishAgentTrace since detail structure differs)
                                        const { EventBridgeClient, PutEventsCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-eventbridge')));
                                        const ebClient = new EventBridgeClient({ region: this.config.awsRegion });
                                        await ebClient.send(new PutEventsCommand({
                                            Entries: [{
                                                    Source: 'kxgen.agent',
                                                    DetailType: eventName,
                                                    Detail: JSON.stringify({
                                                        tenantId: context.tenantId,
                                                        channelId: context.conversation_id,
                                                        email: updatedState.capturedData.email,
                                                        phone: updatedState.capturedData.phone,
                                                        firstName: updatedState.capturedData.firstName,
                                                        lastName: updatedState.capturedData.lastName,
                                                        timestamp: new Date().toISOString()
                                                    }),
                                                    EventBusName: this.config.outboundEventBusName
                                                }]
                                        }));
                                        console.log(`📤 Event published: ${eventName}`);
                                        // Record that we emitted this event
                                        await this.channelStateService.recordEventEmitted(context.conversation_id, eventName, context.tenantId);
                                    }
                                }
                            }
                            console.log(`💾 Channel state saved successfully`);
                        }
                        catch (error) {
                            console.error('❌ Error saving channel state:', error);
                        }
                    }
                    // Execute actions for newly completed goals
                    if (goalResult.stateUpdates?.newlyCompleted && goalResult.stateUpdates.newlyCompleted.length > 0) {
                        console.log(`✅ Newly completed goals: ${goalResult.stateUpdates.newlyCompleted.join(', ')}`);
                        for (const completedGoalId of goalResult.stateUpdates.newlyCompleted) {
                            // Find the goal definition using helper
                            const completedGoal = goal_config_helper_js_1.GoalConfigHelper.findGoal(effectiveGoalConfig, completedGoalId);
                            if (completedGoal && completedGoal.actions?.onComplete) {
                                // Execute goal actions (publishes events)
                                await this.goalOrchestrator.executeGoalActions(completedGoal, {
                                    tenantId: context.tenantId,
                                    channelId: context.conversation_id,
                                    userId: context.email_lc,
                                    sessionId: context.conversation_id || 'default',
                                    collectedData: goalResult.extractedInfo || {}
                                });
                            }
                        }
                    }
                }
                catch (error) {
                    console.warn('Goal orchestration error:', error);
                }
            }
            // Check sharing permissions BEFORE processing (intercept restricted questions)
            if (this.config.companyInfo?.responseGuidelines) {
                const { normalizeSharingPermissions, canShareInformation } = require('./sharing-permissions-utils');
                const normalized = normalizeSharingPermissions(this.config.companyInfo.responseGuidelines.informationCategories, this.config.companyInfo.responseGuidelines.sharingPermissions);
                // Check if user is asking about restricted information
                const messageLower = context.text.toLowerCase();
                const hasContactInfo = !!(goalResult?.extractedInfo?.email || goalResult?.extractedInfo?.phone);
                // Check all "require contact" categories
                for (const category of normalized.requiresContact) {
                    if (messageLower.includes(category.toLowerCase())) {
                        console.log(`🔒 User asked about restricted topic: "${category}"`);
                        console.log(`📧 Has contact info: ${hasContactInfo}`);
                        if (!hasContactInfo) {
                            console.log(`⚠️  INTERCEPTING: Collecting contact info before sharing "${category}"`);
                            // Return contact collection response immediately
                            return { response: `I'd be happy to share information about ${category}! To send you the details, what's the best email to reach you at?` };
                        }
                    }
                }
                // Check "never share" categories
                for (const category of normalized.neverShare) {
                    if (messageLower.includes(category.toLowerCase())) {
                        console.log(`❌ User asked about "never share" topic: "${category}"`);
                        console.log(`⚠️  INTERCEPTING: Redirecting to direct contact`);
                        const companyPhone = this.config.companyInfo?.phone || 'our team';
                        const companyWebsite = this.config.companyInfo?.website;
                        let response = `For information about ${category}, I'd recommend speaking with our team directly.`;
                        if (companyPhone !== 'our team') {
                            response += ` You can reach us at ${companyPhone}`;
                        }
                        if (companyWebsite) {
                            response += ` or visit ${companyWebsite}`;
                        }
                        response += `. Is there anything else I can help you with?`;
                        return { response };
                    }
                }
            }
            // Check for intent matches before processing with LangChain
            const intentMatch = await this.intentService.detectIntent(context.text, currentPersona, this.config.companyInfo || {
                name: 'Planet Fitness9',
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
                    return { response };
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
            // ═══════════════════════════════════════════════════════════════════
            // 🎯 THREE-REQUEST ARCHITECTURE (delegated to MessageProcessor)
            // ═══════════════════════════════════════════════════════════════════
            // The MessageProcessor handles:
            // - REQUEST #1: Intent Detection & Context Analysis
            // - REQUEST #2: Conversational Response Generation  
            // - REQUEST #3: Follow-Up Generation (Verification or Goal Question)
            const processor = new message_processor_js_1.MessageProcessor({
                model: this.model,
                persona: currentPersona,
                companyInfo: this.config.companyInfo,
                actionTagProcessor: this.actionTagProcessor,
                eventBridgeService: this.config.eventBridgeService
            });
            // Define callback for MessageProcessor to persist data and update goal state
            const onDataExtracted = async (extractedData, goalResult, userMessage) => {
                if (!goalResult)
                    return;
                // 🔄 HANDLE ERROR RECOVERY: User says contact info was wrong
                if (extractedData.wrong_phone || extractedData.wrong_email) {
                    const errorField = extractedData.wrong_phone ? 'wrong_phone' : 'wrong_email';
                    const actualField = errorField === 'wrong_phone' ? 'phone' : 'email';
                    // Get the wrong value from CURRENT workflow state (not from LLM extraction)
                    let wrongValue = null;
                    if (this.channelStateService && context.conversation_id) {
                        const currentState = await this.channelStateService.loadWorkflowState(context.conversation_id, context.tenantId);
                        wrongValue = currentState.capturedData[actualField] || null;
                    }
                    // If we don't have a value on file, we can't recover - skip this
                    if (!wrongValue) {
                        console.log(`⚠️ User says ${actualField} was wrong, but we don't have one on file. Skipping error recovery.`);
                        return;
                    }
                    console.log(`🔄 ERROR RECOVERY: User says ${actualField} was wrong (${wrongValue})`);
                    // Clear the bad data from workflow state
                    if (this.channelStateService && context.conversation_id) {
                        try {
                            await this.channelStateService.clearFieldData(context.conversation_id, actualField, context.tenantId);
                            console.log(`🗑️ Cleared bad ${actualField} from workflow state`);
                            // Find and reactivate the contact info goal
                            const contactGoal = effectiveGoalConfig?.goals.find(g => g.type === 'data_collection' &&
                                g.dataToCapture?.fields.includes(actualField));
                            if (contactGoal) {
                                // Remove from completed goals, add back to active goals
                                goalResult.completedGoals = goalResult.completedGoals.filter(id => id !== contactGoal.id);
                                if (!goalResult.activeGoals.includes(contactGoal.id)) {
                                    goalResult.activeGoals.push(contactGoal.id);
                                }
                                // Mark goal as not complete in DynamoDB
                                await this.channelStateService.markGoalIncomplete(context.conversation_id, contactGoal.id, context.tenantId);
                                console.log(`✅ Reactivated goal: ${contactGoal.id} (${contactGoal.name})`);
                            }
                            // Store the wrong value for acknowledgment
                            goalResult.extractedInfo[`previous_${actualField}`] = wrongValue;
                        }
                        catch (error) {
                            console.error(`❌ Error during ${actualField} recovery:`, error);
                        }
                    }
                    // Skip normal data extraction for this turn
                    return;
                }
                // Persist each extracted field (with validation)
                for (const [fieldName, fieldData] of Object.entries(extractedData)) {
                    const value = typeof fieldData === 'object' && fieldData.value ? fieldData.value : fieldData;
                    // 🔥 CRITICAL: Validate data before saving
                    let isValid = true;
                    if (fieldName === 'email') {
                        isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                        if (!isValid) {
                            console.log(`❌ Skipping invalid email: "${value}"`);
                            continue;
                        }
                    }
                    else if (fieldName === 'phone') {
                        const digitsOnly = value.replace(/\D/g, '');
                        isValid = digitsOnly.length >= 7;
                        if (!isValid) {
                            console.log(`❌ Skipping invalid phone (only ${digitsOnly.length} digits): "${value}"`);
                            continue;
                        }
                    }
                    console.log(`💾 LLM extracted data: ${fieldName} = "${value}"`);
                    // Merge into goalResult
                    goalResult.extractedInfo[fieldName] = value;
                    // PERSIST to DynamoDB
                    if (this.channelStateService && context.conversation_id) {
                        try {
                            await this.channelStateService.markFieldCaptured(context.conversation_id, fieldName, value, context.tenantId);
                            console.log(`✅ Persisted ${fieldName} to DynamoDB`);
                            // Auto-detect and persist gender when firstName is captured
                            if (fieldName === 'firstName' && !goalResult.extractedInfo['gender']) {
                                const detectedGender = this.detectGenderFromName(value);
                                if (detectedGender) {
                                    console.log(`🎭 Auto-detected gender from name "${value}": ${detectedGender}`);
                                    goalResult.extractedInfo['gender'] = detectedGender;
                                    await this.channelStateService.markFieldCaptured(context.conversation_id, 'gender', detectedGender, context.tenantId);
                                    console.log(`✅ Persisted gender to DynamoDB`);
                                }
                            }
                        }
                        catch (error) {
                            console.error(`❌ Failed to persist ${fieldName} to DynamoDB:`, error);
                        }
                    }
                }
                // Re-check goal completion and update activeGoals
                // 🚀 NEW: Check ALL goals (not just active ones) - user may satisfy multiple goals in one message!
                if (this.channelStateService && context.conversation_id && effectiveGoalConfig) {
                    try {
                        let updatedState = await this.channelStateService.loadWorkflowState(context.conversation_id, context.tenantId);
                        console.log(`\n${'🎯'.repeat(20)}`);
                        console.log(`🎯 MULTI-GOAL COMPLETION CHECK`);
                        console.log(`🎯 Checking ALL ${effectiveGoalConfig.goals.length} goals against captured data...`);
                        console.log(`${'🎯'.repeat(20)}\n`);
                        // Sort goals by order for proper sequential completion
                        const sortedGoals = [...effectiveGoalConfig.goals].sort((a, b) => (a.order || 999) - (b.order || 999));
                        const completedGoalsThisTurn = [];
                        // Check EVERY goal (not just active ones) to see if it can be completed
                        for (const goalDef of sortedGoals) {
                            // Skip if already completed
                            if (updatedState.completedGoals.includes(goalDef.id)) {
                                console.log(`  ⏭️ ${goalDef.name}: Already completed`);
                                continue;
                            }
                            // Only check data_collection and scheduling goals
                            if (goalDef.type !== 'data_collection' && goalDef.type !== 'scheduling') {
                                continue;
                            }
                            // Check if all required fields are captured
                            const requiredFields = this.getRequiredFieldNames(goalDef);
                            // Helper to check if a field has a valid (non-null, non-empty) value
                            const hasValidValue = (field) => {
                                const value = updatedState.capturedData[field];
                                if (!value)
                                    return false;
                                // Handle objects with { value: null } structure (from LLM extraction)
                                if (typeof value === 'object' && 'value' in value) {
                                    return value.value !== null && value.value !== undefined && value.value !== '';
                                }
                                // Handle direct values
                                if (value === null || value === undefined || value === '')
                                    return false;
                                // 🕐 SCHEDULING VALIDATION: For scheduling goals, require SPECIFIC date/time
                                if (goalDef.type === 'scheduling') {
                                    // preferredTime must be a SPECIFIC time (e.g., "6pm", "7:30", "18:00")
                                    // NOT vague preferences like "evening", "morning", "later than 6", "after 5"
                                    if (field === 'preferredTime') {
                                        const timeStr = String(value).trim().toLowerCase();
                                        // Check if it's a SPECIFIC time (has a number followed by am/pm, or HH:MM format)
                                        const isSpecificTime = /^\d{1,2}\s*(am|pm|:\d{2})$/i.test(timeStr) || // "6pm", "7:30", "18:00"
                                            /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(timeStr); // "7:30pm", "18:00"
                                        // Check if it's a vague/relative constraint (should NOT complete the goal)
                                        const isVagueTime = /^(morning|afternoon|evening|night|daytime|soon|sometime)$/i.test(timeStr) ||
                                            /\b(later|after|before|around|about)\b.*\d/i.test(timeStr) || // "later than 6", "after 5"
                                            /\b(later|earlier)\b/i.test(timeStr); // just "later" or "earlier"
                                        if (!isSpecificTime || isVagueTime) {
                                            console.log(`  ⚠️ preferredTime "${value}" is not a specific time - need exact time like "7pm" or "7:30"`);
                                            return false;
                                        }
                                    }
                                    // preferredDate must be resolvable to an actual date
                                    if (field === 'preferredDate') {
                                        const vagueValue = String(value).trim().toLowerCase();
                                        // These are acceptable relative dates that can be resolved
                                        const acceptableRelative = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                                        const isRelativeDay = acceptableRelative.some(day => vagueValue.includes(day));
                                        const hasDatePattern = /\d{1,2}[\/\-]\d{1,2}|\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(vagueValue);
                                        if (!isRelativeDay && !hasDatePattern) {
                                            console.log(`  ⚠️ preferredDate "${value}" cannot be resolved to a specific date`);
                                            return false;
                                        }
                                    }
                                    // normalizedDateTime must be a valid ISO datetime
                                    if (field === 'normalizedDateTime') {
                                        const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
                                        if (!isoPattern.test(String(value))) {
                                            console.log(`  ⚠️ normalizedDateTime "${value}" is not a valid ISO datetime`);
                                            return false;
                                        }
                                    }
                                }
                                return true;
                            };
                            const capturedFields = requiredFields.filter((field) => hasValidValue(field));
                            const missingFields = requiredFields.filter((field) => !hasValidValue(field));
                            const allFieldsCaptured = missingFields.length === 0;
                            console.log(`  📋 ${goalDef.name} (order ${goalDef.order}):`);
                            console.log(`     Required: ${requiredFields.join(', ') || 'none'}`);
                            console.log(`     Captured: ${capturedFields.join(', ') || 'none'}`);
                            console.log(`     Missing:  ${missingFields.join(', ') || 'none'}`);
                            if (allFieldsCaptured) {
                                console.log(`  ✅ ${goalDef.name}: All data captured! Marking complete.`);
                                await this.channelStateService.markGoalCompleted(context.conversation_id, goalDef.id, context.tenantId);
                                // Execute goal actions
                                if (goalDef.actions?.onComplete) {
                                    await this.goalOrchestrator.executeGoalActions(goalDef, {
                                        tenantId: context.tenantId,
                                        channelId: context.conversation_id,
                                        userId: context.email_lc,
                                        sessionId: context.conversation_id || 'default',
                                        collectedData: updatedState.capturedData
                                    });
                                }
                                completedGoalsThisTurn.push(goalDef.id);
                                // Update local state to reflect completion (for subsequent checks)
                                updatedState.completedGoals.push(goalDef.id);
                            }
                            else {
                                console.log(`  ❌ ${goalDef.name}: Still missing ${missingFields.length} field(s)`);
                            }
                        }
                        console.log(`\n📊 Summary: Completed ${completedGoalsThisTurn.length} goal(s) this turn`);
                        if (completedGoalsThisTurn.length > 0) {
                            console.log(`   Newly completed: ${completedGoalsThisTurn.join(', ')}`);
                        }
                        // Remove completed goals from activeGoals
                        goalResult.activeGoals = goalResult.activeGoals.filter((id) => !updatedState.completedGoals.includes(id));
                        // ═══════════════════════════════════════════════════════════════════
                        // 🚀 FAST-TRACK DETECTION (in processMessageChunked callback)
                        // ═══════════════════════════════════════════════════════════════════
                        const primaryGoal = effectiveGoalConfig.goals.find(g => g.isPrimary);
                        let fastTrackActivated = false;
                        if (primaryGoal && !updatedState.completedGoals.includes(primaryGoal.id)) {
                            let shouldFastTrack = false;
                            let fastTrackReason = '';
                            // Check 1: Did user provide data for the primary goal's fields?
                            const primaryGoalFields = this.getFieldNamesForGoal(primaryGoal);
                            const extractedFieldsForPrimary = Object.keys(extractedData)
                                .filter(field => primaryGoalFields.includes(field));
                            if (extractedFieldsForPrimary.length > 0) {
                                shouldFastTrack = true;
                                fastTrackReason = `User provided data for primary goal fields: ${extractedFieldsForPrimary.join(', ')}`;
                            }
                            // Check 2: Is the primary goal a scheduling goal AND user's intent is scheduling?
                            if (!shouldFastTrack && primaryGoal.type === 'scheduling' && userMessage) {
                                const schedulingKeywords = [
                                    'schedule', 'book', 'appointment', 'come in', 'visit', 'class',
                                    'session', 'sign up', 'register', 'available', 'open', 'times',
                                    'when can', 'free class', 'first class', 'trial'
                                ];
                                const messageLower = userMessage.toLowerCase();
                                const hasSchedulingIntent = schedulingKeywords.some(keyword => messageLower.includes(keyword));
                                if (hasSchedulingIntent) {
                                    shouldFastTrack = true;
                                    fastTrackReason = `User expressed scheduling intent in message`;
                                }
                            }
                            if (shouldFastTrack) {
                                console.log(`\n${'🚀'.repeat(20)}`);
                                console.log(`🚀 FAST-TRACK DETECTED!`);
                                console.log(`🚀 Reason: ${fastTrackReason}`);
                                console.log(`🚀 Primary goal: ${primaryGoal.name}`);
                                console.log(`${'🚀'.repeat(20)}\n`);
                                // Get prerequisites from triggers.prerequisiteGoals
                                const prerequisiteIds = primaryGoal.prerequisites
                                    || primaryGoal.triggers?.prerequisiteGoals
                                    || [];
                                console.log(`🚀 Prerequisites required: ${prerequisiteIds.length > 0 ? prerequisiteIds.join(', ') : 'none'}`);
                                // 🔥 SORT prerequisites by their workflow ORDER (not by array position)
                                const prerequisiteGoals = prerequisiteIds
                                    .map((id) => effectiveGoalConfig.goals.find(g => g.id === id))
                                    .filter((g) => g !== undefined);
                                const sortedPrerequisites = prerequisiteGoals
                                    .sort((a, b) => (a.order || 999) - (b.order || 999))
                                    .map((g) => g.id);
                                console.log(`🚀 Prerequisites sorted by workflow order: ${sortedPrerequisites.join(' → ')}`);
                                // Determine which goals to activate (sorted prerequisites + primary)
                                const fastTrackGoalIds = [...sortedPrerequisites, primaryGoal.id];
                                // 🔥 PERSIST fast-track goal sequence for future messages
                                await this.channelStateService.updateWorkflowState(context.conversation_id, { fastTrackGoals: fastTrackGoalIds }, context.tenantId);
                                console.log(`🚀 Persisted fast-track sequence: ${fastTrackGoalIds.join(' → ')}`);
                                // Filter out already completed goals
                                const goalsToActivate = fastTrackGoalIds.filter(id => !updatedState.completedGoals.includes(id));
                                // Find the first incomplete goal in the fast-track sequence
                                const nextFastTrackGoal = goalsToActivate[0];
                                if (nextFastTrackGoal) {
                                    console.log(`🚀 Fast-tracking: Activating ${nextFastTrackGoal}`);
                                    goalResult.activeGoals = [nextFastTrackGoal];
                                    fastTrackActivated = true;
                                    // Persist the fast-track goal activation
                                    await this.channelStateService.setActiveGoals(context.conversation_id, [nextFastTrackGoal], context.tenantId);
                                }
                            }
                        }
                        // 🚀 CHECK FOR EXISTING FAST-TRACK MODE (from previous messages)
                        if (!fastTrackActivated && updatedState.fastTrackGoals?.length) {
                            console.log(`🚀 Continuing fast-track mode: ${updatedState.fastTrackGoals.join(' → ')}`);
                            // Find the first incomplete goal in the fast-track sequence
                            const goalsToActivate = updatedState.fastTrackGoals.filter(id => !updatedState.completedGoals.includes(id));
                            const nextFastTrackGoal = goalsToActivate[0];
                            if (nextFastTrackGoal) {
                                console.log(`🚀 Next fast-track goal: ${nextFastTrackGoal}`);
                                goalResult.activeGoals = [nextFastTrackGoal];
                                fastTrackActivated = true;
                                // Persist the fast-track goal activation
                                await this.channelStateService.setActiveGoals(context.conversation_id, [nextFastTrackGoal], context.tenantId);
                            }
                            else {
                                // All fast-track goals complete - clear fast-track mode and continue with remaining goals
                                console.log(`🎉 All fast-track goals complete! Clearing fast-track mode and continuing with remaining goals.`);
                                await this.channelStateService.updateWorkflowState(context.conversation_id, { fastTrackGoals: [] }, context.tenantId);
                                // 🔥 IMPORTANT: Set fastTrackActivated to false so we continue with remaining goals!
                                fastTrackActivated = false;
                            }
                        }
                        // 🚀 ACTIVATE NEXT INCOMPLETE GOAL (by order) - runs after fast-track completes OR if not fast-tracked
                        if (!fastTrackActivated) {
                            // Find the first goal that is NOT complete
                            const nextIncompleteGoal = sortedGoals.find(g => !updatedState.completedGoals.includes(g.id) &&
                                (g.type === 'data_collection' || g.type === 'scheduling'));
                            if (nextIncompleteGoal) {
                                console.log(`\n🎯 Next goal to pursue: ${nextIncompleteGoal.name} (order ${nextIncompleteGoal.order})`);
                                // Set as active if not already
                                if (!goalResult.activeGoals.includes(nextIncompleteGoal.id)) {
                                    goalResult.activeGoals = [nextIncompleteGoal.id];
                                    // Persist to DynamoDB
                                    await this.channelStateService.setActiveGoals(context.conversation_id, [nextIncompleteGoal.id], context.tenantId);
                                }
                            }
                            else {
                                console.log(`\n🎉 ALL GOALS COMPLETE! No more goals to pursue.`);
                                goalResult.activeGoals = [];
                            }
                        }
                        console.log(`✅ Final activeGoals: ${goalResult.activeGoals.join(', ') || 'none'}`);
                    }
                    catch (error) {
                        console.error('❌ Error in multi-goal completion check:', error);
                    }
                }
            };
            const processingResult = await processor.process({
                userMessage: context.text,
                messages,
                goalResult,
                effectiveGoalConfig,
                channelState, // Pass channel state so goal questions know what's already captured
                onDataExtracted,
                // Tracking context for LLM usage events
                tenantId: context.tenantId,
                channelId: context.conversation_id,
                messageSource: context.source || 'unknown'
            });
            const response = processingResult.response;
            // Store follow-up question in context for handler to access
            if (processingResult.followUpQuestion) {
                context._followUpQuestion = processingResult.followUpQuestion;
                console.log(`✅ Follow-up question stored: "${processingResult.followUpQuestion}"`);
            }
            // 📊 UPDATE CONVERSATION AGGREGATES (non-blocking)
            // Track engagement, conversion likelihood, and language profile over time
            if (this.channelStateService && context.conversation_id && processingResult.intentDetectionResult) {
                try {
                    const intentResult = processingResult.intentDetectionResult;
                    // Use LLM values if available, otherwise calculate defaults based on intent
                    const interestLevel = intentResult.interestLevel ?? this.inferInterestLevel(intentResult);
                    const conversionLikelihood = intentResult.conversionLikelihood ?? this.inferConversionLikelihood(intentResult);
                    const languageProfile = intentResult.languageProfile ?? {
                        formality: 3,
                        hypeTolerance: 3,
                        emojiUsage: 0,
                        language: 'en'
                    };
                    await this.channelStateService.updateConversationAggregates(context.conversation_id, {
                        messageText: context.text, // Store the user's message for matching
                        interestLevel,
                        conversionLikelihood,
                        emotionalTone: intentResult.detectedEmotionalTone || 'neutral',
                        languageProfile,
                        primaryIntent: intentResult.primaryIntent
                    }, context.tenantId);
                }
                catch (error) {
                    // Non-blocking - log but don't fail the response
                    console.warn(`⚠️ Failed to update conversation aggregates:`, error);
                }
            }
            console.log('🎯 Message processing complete');
            console.log('🎯'.repeat(32) + '\n');
            // Return the response and follow-up question (if any)
            const followUpQuestion = context._followUpQuestion;
            return {
                response,
                followUpQuestion
            };
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
        // Initialize message tracking service on first use (lazy loading)
        // Uses the same channels table with a special createdAt key
        if (!this.messageTrackingService && this.config.dynamoService && this.channelStateService) {
            const dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: this.config.awsRegion });
            const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient, {
                marshallOptions: {
                    removeUndefinedValues: true,
                },
            });
            const channelsTable = process.env.CHANNELS_TABLE || 'KxGen-channels-v2';
            const { MessageTrackingService } = await Promise.resolve().then(() => __importStar(require('./message-tracking-service.js')));
            this.messageTrackingService = new MessageTrackingService(docClient, channelsTable);
            console.log(`📍 Message tracking service initialized (reusing channels table: ${channelsTable})`);
        }
        // STEP 1: Check for previous response and handle rollback if interrupted
        let responseToMessageId;
        if (this.messageTrackingService && context.channelId && this.channelStateService) {
            try {
                // Check if there's a previous response still being processed
                const previousMessageId = await this.messageTrackingService.getCurrentMessageId(context.tenantId, context.channelId);
                if (previousMessageId) {
                    console.log(`⚠️ Previous response ${previousMessageId} was interrupted by new message`);
                    // Get state snapshot for rollback
                    const snapshot = await this.messageTrackingService.getStateSnapshot(context.tenantId, context.channelId);
                    if (snapshot) {
                        console.log(`⏪ Rolling back state from interrupted response`);
                        await this.channelStateService.rollbackState(context.channelId, snapshot, context.tenantId);
                    }
                }
                // STEP 2: Create state snapshot BEFORE processing response
                const currentState = await this.channelStateService.loadWorkflowState(context.channelId, context.tenantId);
                const stateSnapshot = {
                    attemptCounts: {}, // TODO: Get from GoalOrchestrator if needed
                    capturedData: { ...currentState.capturedData },
                    activeGoals: [...currentState.activeGoals],
                    completedGoals: [...currentState.completedGoals],
                    messageCount: currentState.messageCount
                };
                // STEP 3: Start tracking this new response
                responseToMessageId = await this.messageTrackingService.startTracking(context.tenantId, context.channelId, context.senderId || context.email_lc, stateSnapshot);
                console.log(`📍 Started tracking response: ${responseToMessageId}`);
            }
            catch (error) {
                console.error(`❌ Error setting up message tracking:`, error);
                // Continue without tracking - degraded functionality but not fatal
            }
        }
        // STEP 4: Generate the full response
        const result = await this.processMessage(context);
        const fullResponse = result.response;
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
        // STEP 5: Chunk the response and attach responseToMessageId
        const chunks = response_chunker_js_1.ResponseChunker.chunkResponse(fullResponse, context.source, currentPersona.responseChunking, responseToMessageId);
        // STEP 6: If there's a follow-up question, add it as a separate delayed chunk
        const followUpQuestion = context._followUpQuestion;
        if (followUpQuestion) {
            console.log(`💬 Adding follow-up question as separate message: "${followUpQuestion}"`);
            // Calculate total delay of all main chunks to know when to send the question
            const totalMainDelay = chunks.reduce((sum, chunk) => sum + chunk.delayMs, 0);
            // Add extra delay (thinking time) before the question
            const questionDelay = totalMainDelay + 2000; // 2 seconds after last main chunk
            // Create a follow-up question chunk
            const questionChunk = {
                text: followUpQuestion,
                delayMs: questionDelay,
                index: chunks.length,
                total: chunks.length + 1,
                responseToMessageId
            };
            chunks.push(questionChunk);
        }
        return chunks;
    }
    /**
     * Create prompt template based on tenant and context
     */
    createPromptTemplate(context, persona, goalResult, preExtractedData, intentDetectionResult) {
        // Use the provided persona or fall back to the instance persona
        const systemPrompt = this.getSystemPrompt(context, persona || this.persona, goalResult, preExtractedData, intentDetectionResult);
        return prompts_1.PromptTemplate.fromTemplate(`${systemPrompt}

Current conversation:
{history}

Human: {input}
Assistant:`);
    }
    /**
     * Get system prompt based on persona and context
     */
    getSystemPrompt(context, persona, goalResult, preExtractedData, intentDetectionResult) {
        // CRITICAL: Build verbosity constraint FIRST - this must be the TOP priority
        const verbosity = persona?.personalityTraits?.verbosity || 5;
        const verbosityRule = verbosity_config_js_1.VerbosityHelper.getSystemPromptRule(verbosity);
        // ❌ REMOVED: Goal rules from conversational prompt
        // Goal-driven questions are now handled by a separate, focused LLM request
        // This allows the conversational response to be natural and not conflicted
        // Build CRITICAL information sharing policy (THIRD highest priority)
        let sharingPolicyRule = '';
        if (this.config.companyInfo?.responseGuidelines) {
            const { normalizeSharingPermissions, canShareInformation } = require('./sharing-permissions-utils');
            const normalized = normalizeSharingPermissions(this.config.companyInfo.responseGuidelines.informationCategories, this.config.companyInfo.responseGuidelines.sharingPermissions);
            // Build critical sharing rules
            const neverShareItems = Array.from(normalized.neverShare);
            const requireContactItems = Array.from(normalized.requiresContact);
            if (neverShareItems.length > 0 || requireContactItems.length > 0) {
                sharingPolicyRule = `🚨 CRITICAL INFORMATION SHARING RULES - MUST FOLLOW:\n\n`;
                if (neverShareItems.length > 0) {
                    sharingPolicyRule += `❌ NEVER SHARE (redirect to direct contact): ${neverShareItems.join(', ')}\n`;
                }
                if (requireContactItems.length > 0) {
                    sharingPolicyRule += `📧 REQUIRE CONTACT INFO BEFORE SHARING: ${requireContactItems.join(', ')}\n`;
                    sharingPolicyRule += `   → If user asks about these topics, you MUST collect their email/phone FIRST.\n`;
                    sharingPolicyRule += `   → Say: "I'd be happy to share that info! What's the best email to reach you at?"\n`;
                }
                sharingPolicyRule += `\n`;
            }
        }
        // ❌ REMOVED: Intent monitoring prompt
        // Pre-extraction (lines 664-719) already handles data detection
        // No need to tell the LLM to "monitor" - we already did that job
        // Build system prompt: sharing policy + persona + verbosity rules
        let systemPrompt = sharingPolicyRule + persona.systemPrompt + verbosityRule;
        // ✅ ADD: Acknowledgment for pre-extracted data
        if (preExtractedData && Object.keys(preExtractedData).length > 0) {
            let dataAcknowledgment = `\n✅ USER JUST PROVIDED:\n`;
            for (const [field, value] of Object.entries(preExtractedData)) {
                dataAcknowledgment += `- ${field}: ${value}\n`;
            }
            dataAcknowledgment += `\nAcknowledge this enthusiastically and naturally in your response.\n\n`;
            // Prepend to system prompt (high priority)
            systemPrompt = dataAcknowledgment + systemPrompt;
            console.log(`✅ Added acknowledgment for detected data: ${Object.keys(preExtractedData).join(', ')}`);
        }
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
        // Questions are now ONLY provided by goal-driven workflow
        // No random question generation - all questions come from active goals
        console.log(`🎯 Question strategy: GOAL-DRIVEN ONLY (no random questions)`);
        // ═══════════════════════════════════════════════════════════════════
        // 🏢 SELECTIVE COMPANY INFO INJECTION (based on intent detection)
        // ═══════════════════════════════════════════════════════════════════
        // Only inject company info fields that were specifically requested
        // This keeps the prompt focused and reduces noise
        let companyInfoSection = '';
        if (intentDetectionResult?.companyInfoRequested && intentDetectionResult.companyInfoRequested.length > 0) {
            console.log(`🏢 Injecting selective company info: ${intentDetectionResult.companyInfoRequested.join(', ')}`);
            companyInfoSection = this.buildSelectiveCompanyInfo(this.config.companyInfo, intentDetectionResult.companyInfoRequested);
        }
        else {
            // Default: Always include hours and contact for context (but condensed)
            if (this.config.companyInfo) {
                companyInfoSection = this.buildSelectiveCompanyInfo(this.config.companyInfo, ['hours', 'contact', 'location']);
            }
        }
        systemPrompt += companyInfoSection;
        // Replace template variables with actual values
        const companyName = this.config.companyInfo?.name || 'the company';
        systemPrompt = systemPrompt.replace(/\{\{companyName\}\}/g, companyName);
        return systemPrompt;
    }
    /**
     * Process message and return structured response with metadata
     */
    async processMessageStructured(context) {
        const startTime = Date.now();
        try {
            const result = await this.processMessage(context);
            const response = result.response;
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
                name: 'Planet Fitness9',
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
     * Helper: Get required field names from goal (supports both old and new formats)
     */
    getRequiredFieldNames(goal) {
        if (!goal.dataToCapture?.fields)
            return [];
        const fields = goal.dataToCapture.fields;
        // NEW FORMAT: Array of field objects
        if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
            return fields
                .filter((f) => f.required)
                .map((f) => f.name);
        }
        // OLD FORMAT: Use validationRules
        const rules = goal.dataToCapture.validationRules || {};
        return fields.filter((fieldName) => {
            const fieldRules = rules[fieldName];
            return fieldRules?.required !== false; // Default to required
        });
    }
    /**
     * Helper: Get ALL field names from goal (not just required)
     */
    getFieldNamesForGoal(goal) {
        if (!goal.dataToCapture?.fields)
            return [];
        const fields = goal.dataToCapture.fields;
        // NEW FORMAT: Array of field objects
        if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
            return fields.map((f) => f.name);
        }
        // OLD FORMAT: String array
        return fields;
    }
    /**
     * Detect gender from first name
     */
    detectGenderFromName(firstName) {
        if (!firstName)
            return null;
        const nameLower = firstName.toLowerCase();
        // Common female name patterns
        const femaleNames = ['sara', 'sarah', 'maria', 'jessica', 'jennifer', 'amy', 'emily', 'ashley', 'michelle', 'lisa', 'karen', 'susan', 'donna', 'carol', 'ruth', 'sharon', 'laura', 'angela', 'stephanie', 'rebecca', 'deborah', 'rachel', 'catherine', 'anna', 'emma', 'olivia', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'ella', 'scarlett', 'grace', 'lily', 'chloe', 'victoria', 'madison', 'lucy', 'hannah', 'zoe', 'stella', 'hazel', 'violet', 'aurora', 'savannah', 'audrey', 'brooklyn', 'bella', 'claire', 'skylar', 'lucy', 'paisley', 'everly', 'anna', 'caroline', 'nova', 'genesis', 'emilia', 'kennedy'];
        // Common male name patterns
        const maleNames = ['david', 'michael', 'john', 'james', 'robert', 'william', 'richard', 'joseph', 'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'henry', 'nathan', 'douglas', 'zachary', 'peter', 'kyle', 'walter', 'ethan', 'jeremy', 'harold', 'keith', 'christian', 'roger', 'noah', 'gerald', 'carl', 'terry', 'sean', 'austin', 'arthur', 'lawrence', 'jesse', 'dylan', 'bryan', 'joe', 'jordan', 'billy', 'bruce', 'albert', 'willie', 'gabriel', 'logan', 'alan', 'juan', 'wayne', 'roy', 'ralph', 'randy', 'eugene', 'vincent', 'russell', 'elijah', 'louis', 'bobby', 'philip', 'johnny'];
        if (femaleNames.includes(nameLower)) {
            return 'female';
        }
        else if (maleNames.includes(nameLower)) {
            return 'male';
        }
        else if (nameLower.endsWith('a') || nameLower.endsWith('elle') || nameLower.endsWith('ette')) {
            return 'female'; // Common female name endings
        }
        return null;
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
    /**
     * Infer interest level from intent when LLM doesn't provide it
     */
    inferInterestLevel(intentResult) {
        // Base interest by intent type
        const intentInterest = {
            'scheduling': 4, // High - they want to book
            'workflow_data_capture': 4, // High - providing info
            'company_info_request': 3, // Medium - curious
            'general_conversation': 3, // Medium - engaged
            'objection': 2, // Low - resistance
            'end_conversation': 2, // Low - leaving
            'unknown': 3 // Default
        };
        let interest = intentInterest[intentResult.primaryIntent] || 3;
        // Adjust based on emotional tone
        const tone = intentResult.detectedEmotionalTone;
        if (tone === 'positive')
            interest = Math.min(5, interest + 1);
        if (tone === 'frustrated' || tone === 'negative')
            interest = Math.max(1, interest - 1);
        // Boost if they provided data
        if (intentResult.extractedData && Array.isArray(intentResult.extractedData) && intentResult.extractedData.length > 0) {
            interest = Math.min(5, interest + 0.5);
        }
        return Math.round(interest * 10) / 10; // 1 decimal place
    }
    /**
     * Infer conversion likelihood from intent when LLM doesn't provide it
     */
    inferConversionLikelihood(intentResult) {
        // Base likelihood by intent type
        const intentLikelihood = {
            'scheduling': 0.8, // High - they want to book
            'workflow_data_capture': 0.7, // Good - providing info
            'company_info_request': 0.5, // Medium - researching
            'general_conversation': 0.4, // Lower - just chatting
            'objection': 0.3, // Low - resistance
            'end_conversation': 0.2, // Low - leaving
            'unknown': 0.4 // Default
        };
        let likelihood = intentLikelihood[intentResult.primaryIntent] || 0.4;
        // Adjust based on emotional tone
        const tone = intentResult.detectedEmotionalTone;
        if (tone === 'positive')
            likelihood = Math.min(1, likelihood + 0.1);
        if (tone === 'urgent')
            likelihood = Math.min(1, likelihood + 0.15);
        if (tone === 'frustrated' || tone === 'negative')
            likelihood = Math.max(0, likelihood - 0.1);
        // Boost if they provided contact info
        if (intentResult.extractedData && Array.isArray(intentResult.extractedData)) {
            const hasContact = intentResult.extractedData.some((d) => d.field === 'email' || d.field === 'phone');
            if (hasContact)
                likelihood = Math.min(1, likelihood + 0.2);
        }
        return Math.round(likelihood * 100) / 100; // 2 decimal places
    }
}
exports.AgentService = AgentService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHdDQUFxRDtBQUdyRCxxREFBeUQ7QUFDekQsdURBQWdGO0FBQ2hGLDZCQUF3QjtBQUN4Qix1REFBd0Q7QUFDeEQscUVBQTZEO0FBQzdELCtDQUFnRDtBQUNoRCxxREFBc0Q7QUFDdEQsdURBQXNFO0FBQ3RFLDZEQUF3RTtBQUN4RSwrREFBNEU7QUFDNUUsMkRBQXNFO0FBQ3RFLGlFQUF3RjtBQUN4Rix1RUFBcUY7QUFDckYsMkVBQXNIO0FBRXRILHlFQUFpRTtBQUNqRSwrREFBd0Q7QUFDeEQsbUVBQXFGO0FBQ3JGLGlFQUF5RztBQUN6Ryw4REFBMEQ7QUFDMUQsd0RBQStEO0FBRy9ELDRDQUE0QztBQUM1QyxNQUFNLGtCQUFrQixHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7SUFDbEMsU0FBUyxFQUFFLE9BQUMsQ0FBQyxLQUFLLENBQUMsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsQ0FBQztDQUMxRixDQUFDLENBQUM7QUFJSCwrQ0FBK0M7QUFDL0MsTUFBTSxxQkFBcUIsR0FBRyxPQUFDLENBQUMsTUFBTSxDQUFDO0lBQ3JDLGFBQWEsRUFBRSxPQUFDLENBQUMsSUFBSSxDQUFDO1FBQ3BCLHNCQUFzQjtRQUN0Qix1QkFBdUI7UUFDdkIsc0JBQXNCO1FBQ3RCLFdBQVc7UUFDWCxZQUFZO1FBQ1osV0FBVztRQUNYLFVBQVU7S0FDWCxDQUFDLENBQUMsUUFBUSxDQUFDLDZDQUE2QyxDQUFDO0lBRTFELHNCQUFzQixFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsd0ZBQXdGLENBQUM7SUFFaEosb0JBQW9C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YUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMs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Q0FBQyxDQUFDLEVBQUUsVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ25FLElBQUksSUFBSSxLQUFLLFlBQVksSUFBSSxJQUFJLEtBQUssVUFBVTtZQUFFLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxVQUFVLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFFN0Ysc0NBQXNDO1FBQ3RDLElBQUksWUFBWSxDQUFDLGFBQWEsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQzVFLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FDNUQsQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLENBQzNDLENBQUM7WUFDRixJQUFJLFVBQVU7Z0JBQUUsVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFVBQVUsR0FBRyxHQUFHLENBQUMsQ0FBQztRQUM3RCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxtQkFBbUI7SUFDaEUsQ0FBQztDQUNGO0FBMXhERCxvQ0EweERDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ2hhdEJlZHJvY2tDb252ZXJzZSB9IGZyb20gJ0BsYW5nY2hhaW4vYXdzJztcbmltcG9ydCB7IENvbnZlcnNhdGlvbkNoYWluIH0gZnJvbSAnbGFuZ2NoYWluL2NoYWlucyc7XG5pbXBvcnQgeyBCdWZmZXJNZW1vcnkgfSBmcm9tICdsYW5nY2hhaW4vbWVtb3J5JztcbmltcG9ydCB7IFByb21wdFRlbXBsYXRlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL3Byb21wdHMnO1xuaW1wb3J0IHsgQmFzZU1lc3NhZ2UsIEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgS3hEeW5hbW9DaGF0SGlzdG9yeSB9IGZyb20gJy4vY2hhdC1oaXN0b3J5LmpzJztcbmltcG9ydCB7IE1lbW9yeUNoYXRIaXN0b3J5IH0gZnJvbSAnLi9tZW1vcnktY2hhdC1oaXN0b3J5LmpzJztcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4vZHluYW1vZGIuanMnO1xuaW1wb3J0IHsgRXZlbnRCcmlkZ2VTZXJ2aWNlIH0gZnJvbSAnLi9ldmVudGJyaWRnZS5qcyc7XG5pbXBvcnQgeyBnZXRQZXJzb25hLCB0eXBlIEFnZW50UGVyc29uYSB9IGZyb20gJy4uL2NvbmZpZy9wZXJzb25hcy5qcyc7XG5pbXBvcnQgeyBQZXJzb25hU2VydmljZSwgdHlwZSBDb21wYW55SW5mbyB9IGZyb20gJy4vcGVyc29uYS1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlc3BvbnNlQ2h1bmtlciwgdHlwZSBSZXNwb25zZUNodW5rIH0gZnJvbSAnLi9yZXNwb25zZS1jaHVua2VyLmpzJztcbmltcG9ydCB7IEludGVudFNlcnZpY2UsIHR5cGUgSW50ZW50TWF0Y2ggfSBmcm9tICcuL2ludGVudC1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdvYWxPcmNoZXN0cmF0b3IsIHR5cGUgR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfSBmcm9tICcuL2dvYWwtb3JjaGVzdHJhdG9yLmpzJztcbmltcG9ydCB7IEFjdGlvblRhZ1Byb2Nlc3NvciwgdHlwZSBBY3Rpb25UYWdDb25maWcgfSBmcm9tICcuL2FjdGlvbi10YWctcHJvY2Vzc29yLmpzJztcbmltcG9ydCB7IEludGVudEFjdGlvblJlZ2lzdHJ5LCB0eXBlIEludGVudEFjdGlvbkNvbnRleHQsIHR5cGUgSW50ZW50QWN0aW9uUmVzdWx0IH0gZnJvbSAnLi9pbnRlbnQtYWN0aW9uLXJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFBlcnNvbmFTdG9yYWdlIH0gZnJvbSAnLi9wZXJzb25hLXN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ2hhbm5lbFN0YXRlU2VydmljZSB9IGZyb20gJy4vY2hhbm5lbC1zdGF0ZS1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZlcmJvc2l0eUhlbHBlciB9IGZyb20gJy4vdmVyYm9zaXR5LWNvbmZpZy5qcyc7XG5pbXBvcnQgeyBHb2FsQ29uZmlnSGVscGVyLCB0eXBlIEVmZmVjdGl2ZUdvYWxDb25maWcgfSBmcm9tICcuL2dvYWwtY29uZmlnLWhlbHBlci5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlUHJvY2Vzc29yLCB0eXBlIFByb2Nlc3NpbmdDb250ZXh0LCB0eXBlIFByb2Nlc3NpbmdSZXN1bHQgfSBmcm9tICcuL21lc3NhZ2UtcHJvY2Vzc29yLmpzJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHR5cGUgeyBBZ2VudENvbnRleHQsIFJ1bnRpbWVDb25maWcsIE1lc3NhZ2VTb3VyY2UsIEFnZW50UmVzcG9uc2UsIENoYW5uZWxXb3JrZmxvd1N0YXRlIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xuXG4vLyBab2Qgc2NoZW1hIGZvciBzdHJ1Y3R1cmVkIHNlbnRlbmNlIG91dHB1dFxuY29uc3QgU2VudGVuY2VMaXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzZW50ZW5jZXM6IHouYXJyYXkoei5zdHJpbmcoKS5taW4oMSkpLmRlc2NyaWJlKCdBcnJheSBvZiBjb21wbGV0ZSwgc3RhbmRhbG9uZSBzZW50ZW5jZXMnKVxufSk7XG5cbmV4cG9ydCB0eXBlIFNlbnRlbmNlTGlzdCA9IHouaW5mZXI8dHlwZW9mIFNlbnRlbmNlTGlzdFNjaGVtYT47XG5cbi8vIFpvZCBzY2hlbWEgZm9yIGludGVudCBkZXRlY3Rpb24gKFJFUVVFU1QgIzEpXG5jb25zdCBJbnRlbnREZXRlY3Rpb25TY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHByaW1hcnlJbnRlbnQ6IHouZW51bShbXG4gICAgJ2NvbXBhbnlfaW5mb19yZXF1ZXN0JyxcbiAgICAnd29ya2Zsb3dfZGF0YV9jYXB0dXJlJyxcbiAgICAnZ2VuZXJhbF9jb252ZXJzYXRpb24nLFxuICAgICdvYmplY3Rpb24nLFxuICAgICdzY2hlZHVsaW5nJyxcbiAgICAnY29tcGxhaW50JyxcbiAgICAncXVlc3Rpb24nXG4gIF0pLmRlc2NyaWJlKCdQcmltYXJ5IGludGVudCBjYXRlZ29yeSBvZiB0aGUgdXNlciBtZXNzYWdlJyksXG4gIFxuICBkZXRlY3RlZFdvcmtmbG93SW50ZW50OiB6LnN0cmluZygpLm51bGxhYmxlKCkuZGVzY3JpYmUoJ1NwZWNpZmljIHdvcmtmbG93IGZpZWxkIGRldGVjdGVkIChlLmcuLCBcImVtYWlsXCIsIFwicGhvbmVcIiwgXCJmaXJzdE5hbWVcIikgb3IgbnVsbCBpZiBub25lJyksXG4gIFxuICBjb21wYW55SW5mb1JlcXVlc3RlZDogei5hcnJheSh6LnN0cmluZygpKS5udWxsYWJsZSgpLmRlc2NyaWJlKCdTcGVjaWZpYyBjb21wYW55IGluZm8gZmllbGRzIHJlcXVlc3RlZCAoZS5nLiwgW1wiaG91cnNcIiwgXCJwcmljaW5nXCIsIFwibG9jYXRpb25cIl0pIG9yIG51bGwgaWYgbm9uZScpLFxuICBcbiAgcmVxdWlyZXNEZWVwQ29udGV4dDogei5ib29sZWFuKCkuZGVzY3JpYmUoJ1RydWUgaWYgdGhpcyBjb252ZXJzYXRpb24gbmVlZHMgbW9yZSB0aGFuIHRoZSBsYXN0IDEwIG1lc3NhZ2VzIGZvciBwcm9wZXIgY29udGV4dCcpLFxuICBcbiAgY29udmVyc2F0aW9uQ29tcGxleGl0eTogei5lbnVtKFsnc2ltcGxlJywgJ21vZGVyYXRlJywgJ2NvbXBsZXgnXSkuZGVzY3JpYmUoJ092ZXJhbGwgY29tcGxleGl0eSBvZiB0aGUgdXNlciBxdWVyeScpLFxuICBcbiAgZGV0ZWN0ZWRFbW90aW9uYWxUb25lOiB6LmVudW0oWydwb3NpdGl2ZScsICduZXV0cmFsJywgJ2ZydXN0cmF0ZWQnLCAndXJnZW50J10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Vtb3Rpb25hbCB0b25lIG9mIHRoZSBtZXNzYWdlJylcbn0pO1xuXG5leHBvcnQgdHlwZSBJbnRlbnREZXRlY3Rpb25SZXN1bHQgPSB6LmluZmVyPHR5cGVvZiBJbnRlbnREZXRlY3Rpb25TY2hlbWE+O1xuXG5leHBvcnQgaW50ZXJmYWNlIEFnZW50U2VydmljZUNvbmZpZyBleHRlbmRzIFJ1bnRpbWVDb25maWcge1xuICBkeW5hbW9TZXJ2aWNlPzogRHluYW1vREJTZXJ2aWNlO1xuICBldmVudEJyaWRnZVNlcnZpY2U/OiBFdmVudEJyaWRnZVNlcnZpY2U7XG4gIHBlcnNvbmFJZD86IHN0cmluZzsgLy8gQWdlbnQgcGVyc29uYSB0byB1c2UgKGRlZmF1bHRzIHRvICdjYXJsb3MnKVxuICBwZXJzb25hPzogYW55OyAvLyBQcmUtbG9hZGVkIHBlcnNvbmEgb2JqZWN0IChza2lwcyBwZXJzb25hIGxvYWRpbmcgaWYgcHJvdmlkZWQpXG4gIGludGVudEFjdGlvblJlZ2lzdHJ5PzogSW50ZW50QWN0aW9uUmVnaXN0cnk7XG4gIHBlcnNvbmFTdG9yYWdlPzogUGVyc29uYVN0b3JhZ2U7XG4gIGNvbXBhbnlJbmZvPzogQ29tcGFueUluZm87IC8vIENvbXBhbnkgaW5mb3JtYXRpb24gZm9yIHBlcnNvbmEgY3VzdG9taXphdGlvblxufVxuXG4vKipcbiAqIExhbmdDaGFpbiBhZ2VudCBzZXJ2aWNlIHRoYXQgcHJvY2Vzc2VzIG1lc3NhZ2VzIGFuZCBnZW5lcmF0ZXMgcmVzcG9uc2VzXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFNlcnZpY2Uge1xuICBwcml2YXRlIGNvbmZpZzogQWdlbnRTZXJ2aWNlQ29uZmlnO1xuICBwcml2YXRlIG1vZGVsOiBDaGF0QmVkcm9ja0NvbnZlcnNlO1xuICBwcml2YXRlIHBlcnNvbmE6IEFnZW50UGVyc29uYTtcbiAgcHJpdmF0ZSBwZXJzb25hU2VydmljZT86IFBlcnNvbmFTZXJ2aWNlO1xuICBwcml2YXRlIGludGVudFNlcnZpY2U6IEludGVudFNlcnZpY2U7XG4gIHByaXZhdGUgZ29hbE9yY2hlc3RyYXRvcjogR29hbE9yY2hlc3RyYXRvcjtcbiAgcHJpdmF0ZSBhY3Rpb25UYWdQcm9jZXNzb3I6IEFjdGlvblRhZ1Byb2Nlc3NvcjtcbiAgcHJpdmF0ZSBpbnRlbnRBY3Rpb25SZWdpc3RyeTogSW50ZW50QWN0aW9uUmVnaXN0cnk7XG4gIHByaXZhdGUgcGVyc29uYVN0b3JhZ2U/OiBQZXJzb25hU3RvcmFnZTtcbiAgcHJpdmF0ZSBjaGFubmVsU3RhdGVTZXJ2aWNlPzogQ2hhbm5lbFN0YXRlU2VydmljZTtcbiAgcHJpdmF0ZSBtZXNzYWdlVHJhY2tpbmdTZXJ2aWNlPzogYW55OyAvLyBNZXNzYWdlVHJhY2tpbmdTZXJ2aWNlIChhdm9pZCBjaXJjdWxhciBpbXBvcnQpXG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBBZ2VudFNlcnZpY2VDb25maWcpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICBcbiAgICAvLyBBbHdheXMgaW5pdGlhbGl6ZSBwZXJzb25hIHNlcnZpY2UgZm9yIGNvbXBhbnkgaW5mbyBzdWJzdGl0dXRpb25cbiAgICAvLyBQYXNzIG51bGwgZm9yIER5bmFtb0RCIHNlcnZpY2UgaWYgbm90IGF2YWlsYWJsZVxuICAgIHRoaXMucGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UoY29uZmlnLmR5bmFtb1NlcnZpY2UgfHwgbnVsbCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBpbnRlbnQgc2VydmljZVxuICAgIHRoaXMuaW50ZW50U2VydmljZSA9IG5ldyBJbnRlbnRTZXJ2aWNlKCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBnb2FsIG9yY2hlc3RyYXRvclxuICAgIC8vIEB0cy1pZ25vcmUgLSBUeXBlIGRlZmluaXRpb25zIG91dGRhdGVkLCBHb2FsT3JjaGVzdHJhdG9yIG5vdyBhY2NlcHRzIGV2ZW50QnJpZGdlU2VydmljZVxuICAgIHRoaXMuZ29hbE9yY2hlc3RyYXRvciA9IG5ldyBHb2FsT3JjaGVzdHJhdG9yKGNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UpO1xuICAgIFxuICAgIC8vIEluaXRpYWxpemUgYWN0aW9uIHRhZyBwcm9jZXNzb3Igd2l0aCBkZWZhdWx0IGNvbmZpZyAod2lsbCBiZSB1cGRhdGVkIHBlciBwZXJzb25hKVxuICAgIHRoaXMuYWN0aW9uVGFnUHJvY2Vzc29yID0gbmV3IEFjdGlvblRhZ1Byb2Nlc3Nvcih7XG4gICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgIG1hcHBpbmdzOiB7fSxcbiAgICAgIGZhbGxiYWNrRW1vamk6ICfwn5iKJ1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEluaXRpYWxpemUgaW50ZW50IGFjdGlvbiByZWdpc3RyeSAodXNlIHByb3ZpZGVkIG9yIGNyZWF0ZSBuZXcpXG4gICAgdGhpcy5pbnRlbnRBY3Rpb25SZWdpc3RyeSA9IGNvbmZpZy5pbnRlbnRBY3Rpb25SZWdpc3RyeSB8fCBuZXcgSW50ZW50QWN0aW9uUmVnaXN0cnkoKTtcbiAgICBcbiAgICAvLyBJbml0aWFsaXplIHBlcnNvbmEgc3RvcmFnZSAodXNlIHByb3ZpZGVkIG9yIGNyZWF0ZSB3aXRoIGZhbGxiYWNrKVxuICAgIHRoaXMucGVyc29uYVN0b3JhZ2UgPSBjb25maWcucGVyc29uYVN0b3JhZ2U7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBjaGFubmVsIHN0YXRlIHNlcnZpY2UgZm9yIHdvcmtmbG93IHRyYWNraW5nXG4gICAgLy8gQ2FuIGJlIGluamVjdGVkIGZyb20gQ0xJIChMb2NhbENoYW5uZWxTdGF0ZVNlcnZpY2UpIG9yIGNyZWF0ZWQgZnJvbSBEeW5hbW9EQlxuICAgIGlmICgoY29uZmlnIGFzIGFueSkuY2hhbm5lbFN0YXRlU2VydmljZSkge1xuICAgICAgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlID0gKGNvbmZpZyBhcyBhbnkpLmNoYW5uZWxTdGF0ZVNlcnZpY2U7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TiiBDaGFubmVsIHN0YXRlIHNlcnZpY2UgaW5pdGlhbGl6ZWQgKGluamVjdGVkIC0gbG9jYWwgbW9kZSlgKTtcbiAgICB9IGVsc2UgaWYgKGNvbmZpZy5keW5hbW9TZXJ2aWNlKSB7XG4gICAgICBjb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoeyByZWdpb246IGNvbmZpZy5hd3NSZWdpb24gfSk7XG4gICAgICBjb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50LCB7XG4gICAgICAgIG1hcnNoYWxsT3B0aW9uczoge1xuICAgICAgICAgIHJlbW92ZVVuZGVmaW5lZFZhbHVlczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3Qgd29ya2Zsb3dTdGF0ZVRhYmxlID0gcHJvY2Vzcy5lbnYuV09SS0ZMT1dfU1RBVEVfVEFCTEUgfHwgJ0t4R2VuLWFnZW50LXdvcmtmbG93LXN0YXRlJztcbiAgICAgIHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZSA9IG5ldyBDaGFubmVsU3RhdGVTZXJ2aWNlKGRvY0NsaWVudCwgd29ya2Zsb3dTdGF0ZVRhYmxlKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OKIENoYW5uZWwgc3RhdGUgc2VydmljZSBpbml0aWFsaXplZCAodGFibGU6ICR7d29ya2Zsb3dTdGF0ZVRhYmxlfSlgKTtcbiAgICAgIFxuICAgICAgLy8gSW5pdGlhbGl6ZSBtZXNzYWdlIHRyYWNraW5nIHNlcnZpY2UgZm9yIGludGVycnVwdGlvbiBoYW5kbGluZyAobGF6eSBsb2FkZWQpXG4gICAgICAvLyBXaWxsIGJlIGluaXRpYWxpemVkIG9uIGZpcnN0IHVzZSBpbiBwcm9jZXNzTWVzc2FnZUNodW5rZWRcbiAgICB9XG4gICAgXG4gICAgLy8gUGVyc29uYSB3aWxsIGJlIGxvYWRlZCBwZXItcmVxdWVzdCB3aXRoIGNvbXBhbnkgaW5mbyBzdWJzdGl0dXRpb25cbiAgICB0aGlzLnBlcnNvbmEgPSB7fSBhcyBBZ2VudFBlcnNvbmE7IC8vIFdpbGwgYmUgbG9hZGVkIHBlci1yZXF1ZXN0XG4gICAgXG4gICAgLy8gTW9kZWwgd2lsbCBiZSBpbml0aWFsaXplZCBwZXItcmVxdWVzdCB3aXRoIHZlcmJvc2l0eS1hd2FyZSBtYXhUb2tlbnMgYW5kIHRlbXBlcmF0dXJlXG4gICAgLy8gRE8gTk9UIGluaXRpYWxpemUgaGVyZSAtIHdhaXQgdW50aWwgd2UgaGF2ZSBwZXJzb25hIHNldHRpbmdzIGluIHByb2Nlc3NNZXNzYWdlKCkhXG4gICAgdGhpcy5tb2RlbCA9IG51bGwgYXMgYW55OyAvLyBXaWxsIGJlIGNyZWF0ZWQgaW4gcHJvY2Vzc01lc3NhZ2UoKSB3aXRoIGNvcnJlY3Qgc2V0dGluZ3NcbiAgfVxuXG4gIC8qKlxuICAgKiDwn4+iIEJ1aWxkIHNlbGVjdGl2ZSBjb21wYW55IGluZm8gc2VjdGlvbiAob25seSByZXF1ZXN0ZWQgZmllbGRzKVxuICAgKi9cbiAgcHJpdmF0ZSBidWlsZFNlbGVjdGl2ZUNvbXBhbnlJbmZvKFxuICAgIGNvbXBhbnlJbmZvOiBDb21wYW55SW5mbyB8IHVuZGVmaW5lZCxcbiAgICByZXF1ZXN0ZWRGaWVsZHM6IHN0cmluZ1tdIHwgbnVsbFxuICApOiBzdHJpbmcge1xuICAgIGlmICghY29tcGFueUluZm8gfHwgIXJlcXVlc3RlZEZpZWxkcyB8fCByZXF1ZXN0ZWRGaWVsZHMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gJyc7XG4gICAgfVxuXG4gICAgbGV0IGNvbXBhbnlJbmZvU2VjdGlvbiA9ICdcXG5cXG7wn5OLIENPTVBBTlkgSU5GT1JNQVRJT046XFxuJztcbiAgICBcbiAgICAvLyBNYXAgb2YgZmllbGQgbmFtZXMgdG8gY29tcGFueSBpbmZvIHByb3BlcnRpZXNcbiAgICBjb25zdCBmaWVsZE1hcDogUmVjb3JkPHN0cmluZywgKCkgPT4gc3RyaW5nPiA9IHtcbiAgICAgICdob3Vycyc6ICgpID0+IHtcbiAgICAgICAgaWYgKCFjb21wYW55SW5mby5idXNpbmVzc0hvdXJzKSByZXR1cm4gJyc7XG4gICAgICAgIGxldCBob3Vyc1RleHQgPSAnXFxu8J+ThSBCVVNJTkVTUyBIT1VSUyAoQ1JJVElDQUwgLSBVU0UgVEhFU0UgRVhBQ1QgSE9VUlMpOlxcbic7XG4gICAgICAgIGNvbnN0IGRheXMgPSBbJ21vbmRheScsICd0dWVzZGF5JywgJ3dlZG5lc2RheScsICd0aHVyc2RheScsICdmcmlkYXknLCAnc2F0dXJkYXknLCAnc3VuZGF5J107XG4gICAgICAgIGRheXMuZm9yRWFjaChkYXkgPT4ge1xuICAgICAgICAgIGNvbnN0IGhvdXJzID0gKGNvbXBhbnlJbmZvLmJ1c2luZXNzSG91cnMgYXMgYW55KT8uW2RheV07XG4gICAgICAgICAgaWYgKGhvdXJzICYmIGhvdXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGhvdXJzVGV4dCArPSBg4oCiICR7ZGF5LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZGF5LnNsaWNlKDEpfTogJHtob3Vycy5tYXAoKGg6IGFueSkgPT4gYCR7aC5mcm9tfS0ke2gudG99YCkuam9pbignLCAnKX1cXG5gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGhvdXJzVGV4dCArPSAnXFxu4pqg77iPIElNUE9SVEFOVDogV2hlbiBhc2tlZCBhYm91dCBob3VycywgQUxXQVlTIHVzZSB0aGVzZSBleGFjdCB0aW1lcy4gRG8gTk9UIG1ha2UgdXAgaG91cnMgb3Igc2F5IFwiMjQvN1wiIHVubGVzcyBleHBsaWNpdGx5IHNob3duIGFib3ZlLlxcbic7XG4gICAgICAgIHJldHVybiBob3Vyc1RleHQ7XG4gICAgICB9LFxuICAgICAgJ2NvbnRhY3QnOiAoKSA9PiB7XG4gICAgICAgIGxldCBjb250YWN0VGV4dCA9ICdcXG7wn5OeIENPTlRBQ1QgSU5GT1JNQVRJT046XFxuJztcbiAgICAgICAgaWYgKGNvbXBhbnlJbmZvLnBob25lKSBjb250YWN0VGV4dCArPSBg4oCiIFBob25lOiAke2NvbXBhbnlJbmZvLnBob25lfVxcbmA7XG4gICAgICAgIGlmIChjb21wYW55SW5mby5lbWFpbCkgY29udGFjdFRleHQgKz0gYOKAoiBFbWFpbDogJHtjb21wYW55SW5mby5lbWFpbH1cXG5gO1xuICAgICAgICBpZiAoY29tcGFueUluZm8ud2Vic2l0ZSkgY29udGFjdFRleHQgKz0gYOKAoiBXZWJzaXRlOiAke2NvbXBhbnlJbmZvLndlYnNpdGV9XFxuYDtcbiAgICAgICAgcmV0dXJuIGNvbnRhY3RUZXh0O1xuICAgICAgfSxcbiAgICAgICdsb2NhdGlvbic6ICgpID0+IHtcbiAgICAgICAgaWYgKCFjb21wYW55SW5mby5hZGRyZXNzPy5zdHJlZXQgJiYgIWNvbXBhbnlJbmZvLmFkZHJlc3M/LmNpdHkpIHJldHVybiAnJztcbiAgICAgICAgbGV0IGxvY2F0aW9uVGV4dCA9ICdcXG7wn5ONIExPQ0FUSU9OOlxcbic7XG4gICAgICAgIGlmIChjb21wYW55SW5mby5hZGRyZXNzLnN0cmVldCkgbG9jYXRpb25UZXh0ICs9IGAke2NvbXBhbnlJbmZvLmFkZHJlc3Muc3RyZWV0fVxcbmA7XG4gICAgICAgIGlmIChjb21wYW55SW5mby5hZGRyZXNzLmNpdHkgJiYgY29tcGFueUluZm8uYWRkcmVzcy5zdGF0ZSAmJiBjb21wYW55SW5mby5hZGRyZXNzLnppcENvZGUpIHtcbiAgICAgICAgICBsb2NhdGlvblRleHQgKz0gYCR7Y29tcGFueUluZm8uYWRkcmVzcy5jaXR5fSwgJHtjb21wYW55SW5mby5hZGRyZXNzLnN0YXRlfSAke2NvbXBhbnlJbmZvLmFkZHJlc3MuemlwQ29kZX1cXG5gO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBsb2NhdGlvblRleHQ7XG4gICAgICB9LFxuICAgICAgJ3NlcnZpY2VzJzogKCkgPT4ge1xuICAgICAgICBpZiAoIWNvbXBhbnlJbmZvLnByb2R1Y3RzKSByZXR1cm4gJyc7XG4gICAgICAgIHJldHVybiBgXFxu8J+SvCBTRVJWSUNFUy9QUk9EVUNUUzpcXG4ke2NvbXBhbnlJbmZvLnByb2R1Y3RzfVxcbmA7XG4gICAgICB9LFxuICAgICAgJ3ByaWNpbmcnOiAoKSA9PiB7XG4gICAgICAgIC8vIFByaWNpbmcgdHlwaWNhbGx5IHJlcXVpcmVzIGNvbnRhY3QgaW5mbywgc28gd2UgbWlnaHQgbm90IGluY2x1ZGUgaXQgaGVyZVxuICAgICAgICAvLyBCdXQgaWYgaXQncyBzcGVjaWZpY2FsbHkgcmVxdWVzdGVkIGFuZCBhdmFpbGFibGUgaW4gZGVzY3JpcHRpb24vYmVuZWZpdHNcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfSxcbiAgICAgICdzdGFmZic6ICgpID0+IHtcbiAgICAgICAgLy8gU3RhZmYgaW5mbyB3b3VsZCBjb21lIGZyb20gcGVyc29uYSBkYXRhLCBub3QgY29tcGFueSBpbmZvXG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gQnVpbGQgb25seSB0aGUgcmVxdWVzdGVkIHNlY3Rpb25zXG4gICAgcmVxdWVzdGVkRmllbGRzLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgY29uc3QgZmllbGRMb3dlciA9IGZpZWxkLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoZmllbGRNYXBbZmllbGRMb3dlcl0pIHtcbiAgICAgICAgY29uc3Qgc2VjdGlvbiA9IGZpZWxkTWFwW2ZpZWxkTG93ZXJdKCk7XG4gICAgICAgIGlmIChzZWN0aW9uKSB7XG4gICAgICAgICAgY29tcGFueUluZm9TZWN0aW9uICs9IHNlY3Rpb247XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBjb21wYW55SW5mb1NlY3Rpb247XG4gIH1cblxuICAvKipcbiAgICog8J+OryBSRVFVRVNUICMxOiBEZXRlY3QgaW50ZW50IGFuZCBkZXRlcm1pbmUgY29udGV4dCBuZWVkc1xuICAgKi9cbiAgLyoqXG4gICAqIFByb2Nlc3MgYW4gYWdlbnQgY29udGV4dCBhbmQgZ2VuZXJhdGUgYSByZXNwb25zZVxuICAgKiBAcGFyYW0gY29udGV4dCAtIFRoZSBhZ2VudCBjb250ZXh0XG4gICAqIEBwYXJhbSBleGlzdGluZ0hpc3RvcnkgLSBPcHRpb25hbCBjaGF0IGhpc3RvcnkgKGZvciBDTEkvbG9jYWwgdXNlKVxuICAgKi9cbiAgYXN5bmMgcHJvY2Vzc01lc3NhZ2UoY29udGV4dDogQWdlbnRDb250ZXh0LCBleGlzdGluZ0hpc3Rvcnk/OiBCYXNlTWVzc2FnZVtdKTogUHJvbWlzZTx7IHJlc3BvbnNlOiBzdHJpbmc7IGZvbGxvd1VwUXVlc3Rpb24/OiBzdHJpbmcgfT4ge1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIC8vIExvYWQgcGVyc29uYSBmb3IgdGhpcyB0ZW5hbnQgd2l0aCBjb21wYW55IGluZm8gc3Vic3RpdHV0aW9uXG4gICAgICBsZXQgY3VycmVudFBlcnNvbmEgPSB0aGlzLnBlcnNvbmE7XG4gICAgICBcbiAgICAgIC8vIFVzZSBwcmUtbG9hZGVkIHBlcnNvbmEgaWYgcHJvdmlkZWQgKGZyb20gaGFuZGxlcilcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wZXJzb25hKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5GkIFVzaW5nIHByZS1sb2FkZWQgcGVyc29uYSBmcm9tIGNvbmZpZ2ApO1xuICAgICAgICBjdXJyZW50UGVyc29uYSA9IHRoaXMuY29uZmlnLnBlcnNvbmEgYXMgQWdlbnRQZXJzb25hO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLnBlcnNvbmFTZXJ2aWNlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY3VycmVudFBlcnNvbmEgPSBhd2FpdCB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEoXG4gICAgICAgICAgICBjb250ZXh0LnRlbmFudElkLCBcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBlcnNvbmFJZCB8fCAnY2FybG9zJyxcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHBlcnNvbmEgJHt0aGlzLmNvbmZpZy5wZXJzb25hSWR9IGZvciB0ZW5hbnQgJHtjb250ZXh0LnRlbmFudElkfSwgdXNpbmcgZmFsbGJhY2s6YCwgZXJyb3IpO1xuICAgICAgICAgIC8vIFVzZSBQZXJzb25hU2VydmljZSBmYWxsYmFjayB0byBlbnN1cmUgZ29hbENvbmZpZ3VyYXRpb24gaXMgbG9hZGVkXG4gICAgICAgICAgY3VycmVudFBlcnNvbmEgPSB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldERlZmF1bHRQZXJzb25hKHRoaXMuY29uZmlnLnBlcnNvbmFJZCB8fCAnY2FybG9zJywgdGhpcy5jb25maWcuY29tcGFueUluZm8pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENvbmZpZ3VyZSBhY3Rpb24gdGFnIHByb2Nlc3NvciBiYXNlZCBvbiBwZXJzb25hXG4gICAgICBpZiAoKGN1cnJlbnRQZXJzb25hIGFzIGFueSkuYWN0aW9uVGFncykge1xuICAgICAgICBjb25zdCBhY3Rpb25UYWdDb25maWcgPSAoY3VycmVudFBlcnNvbmEgYXMgYW55KS5hY3Rpb25UYWdzIGFzIEFjdGlvblRhZ0NvbmZpZztcbiAgICAgICAgdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IgPSBuZXcgQWN0aW9uVGFnUHJvY2Vzc29yKGFjdGlvblRhZ0NvbmZpZyk7XG4gICAgICB9XG5cbiAgICAgIC8vIENvbmZpZ3VyZSBtb2RlbCBtYXhUb2tlbnMgYmFzZWQgb24gdmVyYm9zaXR5IHRyYWl0XG4gICAgICBjb25zdCB2ZXJib3NpdHkgPSAoY3VycmVudFBlcnNvbmEgYXMgYW55KT8ucGVyc29uYWxpdHlUcmFpdHM/LnZlcmJvc2l0eSB8fCA1O1xuICAgICAgY29uc29sZS5sb2coYPCfjprvuI8gVXNpbmcgdmVyYm9zaXR5OiAke3ZlcmJvc2l0eX1gKTtcbiAgICAgIFxuICAgICAgLy8gR2V0IHZlcmJvc2l0eSBjb25maWd1cmF0aW9uIGZyb20gaGVscGVyXG4gICAgICBjb25zdCB2ZXJib3NpdHlDb25maWcgPSBWZXJib3NpdHlIZWxwZXIuZ2V0Q29uZmlnKHZlcmJvc2l0eSk7XG4gICAgICBjb25zdCB7IG1heFRva2VucywgdGVtcGVyYXR1cmUsIG1heFNlbnRlbmNlcyB9ID0gdmVyYm9zaXR5Q29uZmlnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+Omu+4jyBWZXJib3NpdHkgY29uZmlnOiAke3ZlcmJvc2l0eUNvbmZpZy5kZXNjcmlwdGlvbn1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46a77iPIFNldHRpbmcgbWF4VG9rZW5zPSR7bWF4VG9rZW5zfSwgdGVtcGVyYXR1cmU9JHt0ZW1wZXJhdHVyZX0sIG1heFNlbnRlbmNlcz0ke21heFNlbnRlbmNlc31gKTtcbiAgICAgIFxuICAgICAgLy8g8J+RiSBRdWVzdGlvbiBnZW5lcmF0aW9uIGRpc2FibGVkIC0gdXNpbmcgT05MWSBnb2FsLWRyaXZlbiBxdWVzdGlvbnNcbiAgICAgIC8vIEdvYWxzIHdpbGwgcHJvdmlkZSBhbGwgcXVlc3Rpb25zIHZpYSB0aGUgd29ya2Zsb3dcbiAgICAgIGNvbnN0IHNob3VsZEFkZFF1ZXN0aW9uID0gZmFsc2U7XG4gICAgICBjb25zb2xlLmxvZyhg4p2TIFF1ZXN0aW9uIGdlbmVyYXRpb246IERJU0FCTEVEICh1c2luZyBnb2FsLWRyaXZlbiBxdWVzdGlvbnMgb25seSlgKTtcbiAgICAgIFxuICAgICAgLy8gUmVjcmVhdGUgbW9kZWwgd2l0aCB2ZXJib3NpdHktYXdhcmUgbWF4VG9rZW5zIGFuZCB0ZW1wZXJhdHVyZVxuICAgICAgdGhpcy5tb2RlbCA9IG5ldyBDaGF0QmVkcm9ja0NvbnZlcnNlKHtcbiAgICAgICAgbW9kZWw6IHRoaXMuY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgICAgICByZWdpb246IHRoaXMuY29uZmlnLmF3c1JlZ2lvbixcbiAgICAgICAgdGVtcGVyYXR1cmUsXG4gICAgICAgIG1heFRva2VucyxcbiAgICAgICAgbWF4X3Rva2VuczogbWF4VG9rZW5zLCAvLyBBbHNvIHBhc3Mgc25ha2VfY2FzZSB2ZXJzaW9uIGZvciBCZWRyb2NrIEFQSVxuICAgICAgfSBhcyBhbnkpO1xuXG4gICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbiAgICAgIC8vIPCfjq8gVEhSRUUtUkVRVUVTVCBBUkNISVRFQ1RVUkVcbiAgICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuICAgICAgLy8gUkVRVUVTVCAjMTogSW50ZW50IERldGVjdGlvbiAmIENvbnRleHQgQW5hbHlzaXMgKHBlcmZvcm1lZCBmaXJzdClcbiAgICAgIC8vIFJFUVVFU1QgIzI6IENvbnZlcnNhdGlvbmFsIFJlc3BvbnNlICh1c2VzIHJlc3VsdHMgZnJvbSAjMSlcbiAgICAgIC8vIFJFUVVFU1QgIzM6IEZvbGxvdy1VcCBHZW5lcmF0aW9uICh2ZXJpZmljYXRpb24gb3Igd29ya2Zsb3cgcXVlc3Rpb24pXG4gICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcblxuICAgICAgLy8gUnVuIGdvYWwgb3JjaGVzdHJhdGlvbiB0byBtYW5hZ2UgbGVhZCBxdWFsaWZpY2F0aW9uXG4gICAgICBsZXQgZ29hbFJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHQgfCBudWxsID0gbnVsbDtcbiAgICAgIFxuICAgICAgLy8gTG9hZCBjaGFubmVsIHdvcmtmbG93IHN0YXRlIChQaGFzZSBDOiBQZXJzaXN0ZW50IHN0YXRlKVxuICAgICAgbGV0IGNoYW5uZWxTdGF0ZTogQ2hhbm5lbFdvcmtmbG93U3RhdGUgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAodGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlICYmIGNvbnRleHQuY29udmVyc2F0aW9uX2lkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY2hhbm5lbFN0YXRlID0gYXdhaXQgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlLmxvYWRXb3JrZmxvd1N0YXRlKGNvbnRleHQuY29udmVyc2F0aW9uX2lkLCBjb250ZXh0LnRlbmFudElkKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TiiBMb2FkZWQgY2hhbm5lbCBzdGF0ZTogJHtKU09OLnN0cmluZ2lmeShjaGFubmVsU3RhdGUsIG51bGwsIDIpfWApO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIEluY3JlbWVudCBtZXNzYWdlIGNvdW50XG4gICAgICAgICAgY2hhbm5lbFN0YXRlID0gYXdhaXQgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlLmluY3JlbWVudE1lc3NhZ2VDb3VudChjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCwgY29udGV4dC50ZW5hbnRJZCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGxvYWRpbmcgY2hhbm5lbCBzdGF0ZTonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRGV0ZXJtaW5lIGVmZmVjdGl2ZSBnb2FsIGNvbmZpZ3VyYXRpb24gKGNvbXBhbnktbGV2ZWwgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHBlcnNvbmEtbGV2ZWwpXG4gICAgICBjb25zdCBlZmZlY3RpdmVHb2FsQ29uZmlnID0gR29hbENvbmZpZ0hlbHBlci5nZXRFZmZlY3RpdmVDb25maWcoXG4gICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvLFxuICAgICAgICBjdXJyZW50UGVyc29uYVxuICAgICAgKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYPCflI0gQ2hlY2tpbmcgZ29hbCBjb25maWcgLSBlbmFibGVkOiAke2VmZmVjdGl2ZUdvYWxDb25maWcuZW5hYmxlZH0sIGdvYWxzOiAke2VmZmVjdGl2ZUdvYWxDb25maWcuZ29hbHM/Lmxlbmd0aCB8fCAwfWApO1xuICAgICAgXG4gICAgICBpZiAoR29hbENvbmZpZ0hlbHBlci5pc0VuYWJsZWQoZWZmZWN0aXZlR29hbENvbmZpZykpIHtcbiAgICAgICAgY29uc3QgZ29hbFNvdXJjZSA9IEdvYWxDb25maWdIZWxwZXIuZ2V0U291cmNlRGVzY3JpcHRpb24oZWZmZWN0aXZlR29hbENvbmZpZyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIEdvYWwgb3JjaGVzdHJhdGlvbiBlbmFibGVkICgke2dvYWxTb3VyY2V9KTogJHtlZmZlY3RpdmVHb2FsQ29uZmlnLmdvYWxzLmxlbmd0aH0gZ29hbHMgY29uZmlndXJlZGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyBHb2FsIG9yY2hlc3RyYXRpb24gRElTQUJMRUQgLSBlbmFibGVkOiAke2VmZmVjdGl2ZUdvYWxDb25maWcuZW5hYmxlZH0sIGdvYWxzOiAke2VmZmVjdGl2ZUdvYWxDb25maWcuZ29hbHM/Lmxlbmd0aCB8fCAwfWApO1xuICAgICAgfVxuICAgICAgXG4gICAgICBpZiAoR29hbENvbmZpZ0hlbHBlci5pc0VuYWJsZWQoZWZmZWN0aXZlR29hbENvbmZpZykpIHtcbiAgICAgICAgXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gUGFzcyBlbXB0eSBoaXN0b3J5IGZvciBub3cgLSB3aWxsIGJlIGVuaGFuY2VkIGluIFBoYXNlIEMgd2l0aCBwcm9wZXIgc3RhdGUgbG9hZGluZ1xuICAgICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvblRleHRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAgICAgZ29hbFJlc3VsdCA9IGF3YWl0IHRoaXMuZ29hbE9yY2hlc3RyYXRvci5vcmNoZXN0cmF0ZUdvYWxzKFxuICAgICAgICAgICAgY29udGV4dC50ZXh0LFxuICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ2RlZmF1bHQnLFxuICAgICAgICAgICAgY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICBlZmZlY3RpdmVHb2FsQ29uZmlnLFxuICAgICAgICAgICAgY29udmVyc2F0aW9uVGV4dHMsXG4gICAgICAgICAgICBjb250ZXh0LnNvdXJjZSBhcyBhbnksIC8vIGNoYW5uZWxcbiAgICAgICAgICAgIGNoYW5uZWxTdGF0ZSAvLyBQYXNzIHRoZSBjaGFubmVsIHN0YXRlIVxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBMb2cgZ29hbCBvcmNoZXN0cmF0aW9uIHJlc3VsdHMgd2l0aCBISUdITElHSFRcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvICYmIE9iamVjdC5rZXlzKGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbykubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1xcbicgKyAn4pWQJy5yZXBlYXQoNjQpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCfwn46vIElOVEVOVCBDQVBUVVJFRCAtIERBVEEgRVhUUkFDVEVEJyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygn4pWQJy5yZXBlYXQoNjQpKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2ZpZWxkLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKSkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICDinIUgJHtmaWVsZH06ICR7SlNPTi5zdHJpbmdpZnkodmFsdWUpfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS5sb2coJ+KVkCcucmVwZWF0KDY0KSArICdcXG4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46vIEdvYWwgcmVjb21tZW5kYXRpb25zOmAsIGdvYWxSZXN1bHQucmVjb21tZW5kYXRpb25zLm1hcChyID0+ICh7XG4gICAgICAgICAgICAgIGdvYWw6IHIuZ29hbElkLFxuICAgICAgICAgICAgICBwcmlvcml0eTogci5wcmlvcml0eSxcbiAgICAgICAgICAgICAgc2hvdWxkUHVyc3VlOiByLnNob3VsZFB1cnN1ZSxcbiAgICAgICAgICAgICAgYXBwcm9hY2g6IHIuYXBwcm9hY2hcbiAgICAgICAgICAgIH0pKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGdvYWxSZXN1bHQudHJpZ2dlcmVkSW50ZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+agCBUcmlnZ2VyZWQgaW50ZW50czpgLCBnb2FsUmVzdWx0LnRyaWdnZXJlZEludGVudHMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBQcm9jZXNzIHRyaWdnZXJlZCBpbnRlbnRzIChsaWtlIGxlYWRfZ2VuZXJhdGVkKVxuICAgICAgICAgICAgZm9yIChjb25zdCB0cmlnZ2VyZWRJbnRlbnRJZCBvZiBnb2FsUmVzdWx0LnRyaWdnZXJlZEludGVudHMpIHtcbiAgICAgICAgICAgICAgY29uc3QgdHJpZ2dlcmVkSW50ZW50ID0gY3VycmVudFBlcnNvbmEuaW50ZW50Q2FwdHVyaW5nPy5pbnRlbnRzPy5maW5kKGkgPT4gaS5pZCA9PT0gdHJpZ2dlcmVkSW50ZW50SWQpO1xuICAgICAgICAgICAgICBpZiAodHJpZ2dlcmVkSW50ZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfjokgR09BTCBUUklHR0VSRUQgSU5URU5UOiAke3RyaWdnZXJlZEludGVudElkfVxceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgLy8gWW91IGNvdWxkIHJldHVybiB0aGUgdHJpZ2dlcmVkIGludGVudCByZXNwb25zZSBoZXJlIGlmIGRlc2lyZWRcbiAgICAgICAgICAgICAgICAvLyBGb3Igbm93LCB3ZSdsbCBsZXQgdGhlIG5vcm1hbCBmbG93IGNvbnRpbnVlIGFuZCBhZGQgaXQgYXMgY29udGV4dFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuICAgICAgICAgIC8vIPCfmoAgRkFTVC1UUkFDSyBERVRFQ1RJT05cbiAgICAgICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbiAgICAgICAgICAvLyBGYXN0LXRyYWNrIHRyaWdnZXJzIHdoZW46XG4gICAgICAgICAgLy8gMS4gVXNlcidzIElOVEVOVCBpcyBcInNjaGVkdWxpbmdcIiAodGhleSB3YW50IHRvIGJvb2spLCBPUlxuICAgICAgICAgIC8vIDIuIFVzZXIgcHJvdmlkZXMgZGF0YSB0aGF0IGJlbG9uZ3MgdG8gdGhlIFBSSU1BUlkgZ29hbFxuICAgICAgICAgIGNvbnN0IHByaW1hcnlHb2FsID0gZWZmZWN0aXZlR29hbENvbmZpZy5nb2Fscy5maW5kKGcgPT4gZy5pc1ByaW1hcnkpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChwcmltYXJ5R29hbCkge1xuICAgICAgICAgICAgbGV0IHNob3VsZEZhc3RUcmFjayA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IGZhc3RUcmFja1JlYXNvbiA9ICcnO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDaGVjayAxOiBEaWQgdXNlciBwcm92aWRlIGRhdGEgZm9yIHRoZSBwcmltYXJ5IGdvYWwncyBmaWVsZHM/XG4gICAgICAgICAgICBpZiAoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvICYmIE9iamVjdC5rZXlzKGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbykubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zdCBwcmltYXJ5R29hbEZpZWxkcyA9IHRoaXMuZ2V0RmllbGROYW1lc0ZvckdvYWwocHJpbWFyeUdvYWwpO1xuICAgICAgICAgICAgICBjb25zdCBleHRyYWN0ZWRGaWVsZHNGb3JQcmltYXJ5ID0gT2JqZWN0LmtleXMoZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gcHJpbWFyeUdvYWxGaWVsZHMuaW5jbHVkZXMoZmllbGQpKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGlmIChleHRyYWN0ZWRGaWVsZHNGb3JQcmltYXJ5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBzaG91bGRGYXN0VHJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZhc3RUcmFja1JlYXNvbiA9IGBVc2VyIHByb3ZpZGVkIGRhdGEgZm9yIHByaW1hcnkgZ29hbCBmaWVsZHM6ICR7ZXh0cmFjdGVkRmllbGRzRm9yUHJpbWFyeS5qb2luKCcsICcpfWA7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ2hlY2sgMjogSXMgdGhlIHByaW1hcnkgZ29hbCBhIHNjaGVkdWxpbmcgZ29hbCBBTkQgdXNlcidzIGludGVudCBpcyBzY2hlZHVsaW5nP1xuICAgICAgICAgICAgLy8gVGhpcyBjYXRjaGVzIFwiSSB3YW50IHRvIHNjaGVkdWxlXCIgZXZlbiBpZiBubyBzcGVjaWZpYyBkYXRlL3RpbWUgd2FzIHByb3ZpZGVkXG4gICAgICAgICAgICBpZiAoIXNob3VsZEZhc3RUcmFjayAmJiBwcmltYXJ5R29hbC50eXBlID09PSAnc2NoZWR1bGluZycgJiYgY29udGV4dC50ZXh0KSB7XG4gICAgICAgICAgICAgIC8vIENoZWNrIGlmIHVzZXIgbWVzc2FnZSBpbmRpY2F0ZXMgc2NoZWR1bGluZyBpbnRlbnRcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZWR1bGluZ0tleXdvcmRzID0gW1xuICAgICAgICAgICAgICAgICdzY2hlZHVsZScsICdib29rJywgJ2FwcG9pbnRtZW50JywgJ2NvbWUgaW4nLCAndmlzaXQnLCAnY2xhc3MnLCBcbiAgICAgICAgICAgICAgICAnc2Vzc2lvbicsICdzaWduIHVwJywgJ3JlZ2lzdGVyJywgJ2F2YWlsYWJsZScsICdvcGVuJywgJ3RpbWVzJywgXG4gICAgICAgICAgICAgICAgJ3doZW4gY2FuJywgJ2ZyZWUgY2xhc3MnLCAnZmlyc3QgY2xhc3MnLCAndHJpYWwnXG4gICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2VMb3dlciA9IGNvbnRleHQudGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICBjb25zdCBoYXNTY2hlZHVsaW5nSW50ZW50ID0gc2NoZWR1bGluZ0tleXdvcmRzLnNvbWUoa2V5d29yZCA9PiBtZXNzYWdlTG93ZXIuaW5jbHVkZXMoa2V5d29yZCkpO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgaWYgKGhhc1NjaGVkdWxpbmdJbnRlbnQpIHtcbiAgICAgICAgICAgICAgICBzaG91bGRGYXN0VHJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZhc3RUcmFja1JlYXNvbiA9IGBVc2VyIGV4cHJlc3NlZCBzY2hlZHVsaW5nIGludGVudCBpbiBtZXNzYWdlYDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoc2hvdWxkRmFzdFRyYWNrKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG4keyfwn5qAJy5yZXBlYXQoMjApfWApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+agCBGQVNULVRSQUNLIERFVEVDVEVEIWApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+agCBSZWFzb246ICR7ZmFzdFRyYWNrUmVhc29ufWApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+agCBQcmltYXJ5IGdvYWw6ICR7cHJpbWFyeUdvYWwubmFtZX1gKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYCR7J/CfmoAnLnJlcGVhdCgyMCl9XFxuYCk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBHZXQgcHJlcmVxdWlzaXRlcyBmb3IgdGhlIHByaW1hcnkgZ29hbFxuICAgICAgICAgICAgICBjb25zdCBwcmVyZXF1aXNpdGVJZHMgPSAocHJpbWFyeUdvYWwgYXMgYW55KS5wcmVyZXF1aXNpdGVzIFxuICAgICAgICAgICAgICAgIHx8IHByaW1hcnlHb2FsLnRyaWdnZXJzPy5wcmVyZXF1aXNpdGVHb2FscyBcbiAgICAgICAgICAgICAgICB8fCBbXTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfmoAgUHJlcmVxdWlzaXRlcyByZXF1aXJlZDogJHtwcmVyZXF1aXNpdGVJZHMubGVuZ3RoID4gMCA/IHByZXJlcXVpc2l0ZUlkcy5qb2luKCcsICcpIDogJ25vbmUnfWApO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8g8J+UpSBTT1JUIHByZXJlcXVpc2l0ZXMgYnkgdGhlaXIgd29ya2Zsb3cgT1JERVIgKG5vdCBieSBhcnJheSBwb3NpdGlvbilcbiAgICAgICAgICAgICAgY29uc3QgcHJlcmVxdWlzaXRlR29hbHMgPSBwcmVyZXF1aXNpdGVJZHNcbiAgICAgICAgICAgICAgICAubWFwKChpZDogc3RyaW5nKSA9PiBlZmZlY3RpdmVHb2FsQ29uZmlnLmdvYWxzLmZpbmQoZyA9PiBnLmlkID09PSBpZCkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoZzogYW55KSA9PiBnICE9PSB1bmRlZmluZWQpO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29uc3Qgc29ydGVkUHJlcmVxdWlzaXRlcyA9IHByZXJlcXVpc2l0ZUdvYWxzXG4gICAgICAgICAgICAgICAgLnNvcnQoKGE6IGFueSwgYjogYW55KSA9PiAoYS5vcmRlciB8fCA5OTkpIC0gKGIub3JkZXIgfHwgOTk5KSlcbiAgICAgICAgICAgICAgICAubWFwKChnOiBhbnkpID0+IGcuaWQpO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfmoAgUHJlcmVxdWlzaXRlcyBzb3J0ZWQgYnkgd29ya2Zsb3cgb3JkZXI6ICR7c29ydGVkUHJlcmVxdWlzaXRlcy5qb2luKCcg4oaSICcpfWApO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGdvYWxzIHRvIGFjdGl2YXRlIChzb3J0ZWQgcHJlcmVxdWlzaXRlcyArIHByaW1hcnkpXG4gICAgICAgICAgICAgIGNvbnN0IGZhc3RUcmFja0dvYWxJZHMgPSBbLi4uc29ydGVkUHJlcmVxdWlzaXRlcywgcHJpbWFyeUdvYWwuaWRdO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gRmlsdGVyIG91dCBhbHJlYWR5IGNvbXBsZXRlZCBnb2Fsc1xuICAgICAgICAgICAgICBjb25zdCBjb21wbGV0ZWRHb2FscyA9IGNoYW5uZWxTdGF0ZT8uY29tcGxldGVkR29hbHMgfHwgW107XG4gICAgICAgICAgICAgIGNvbnN0IGdvYWxzVG9BY3RpdmF0ZSA9IGZhc3RUcmFja0dvYWxJZHMuZmlsdGVyKGlkID0+ICFjb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhpZCkpO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3QgaW5jb21wbGV0ZSBnb2FsIGluIHRoZSBmYXN0LXRyYWNrIHNlcXVlbmNlXG4gICAgICAgICAgICAgIGNvbnN0IG5leHRGYXN0VHJhY2tHb2FsID0gZ29hbHNUb0FjdGl2YXRlWzBdO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgaWYgKG5leHRGYXN0VHJhY2tHb2FsKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfmoAgRmFzdC10cmFja2luZzogQWN0aXZhdGluZyAke25leHRGYXN0VHJhY2tHb2FsfSAoc2tpcHBpbmcgbm9uLWVzc2VudGlhbCBnb2FscylgKTtcbiAgICAgICAgICAgICAgICBnb2FsUmVzdWx0LmFjdGl2ZUdvYWxzID0gW25leHRGYXN0VHJhY2tHb2FsXTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBQZXJzaXN0IHRoZSBmYXN0LXRyYWNrIGdvYWwgYWN0aXZhdGlvbiBhbmQgc2VxdWVuY2VcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlICYmIGNvbnRleHQuY29udmVyc2F0aW9uX2lkKSB7XG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2Uuc2V0QWN0aXZlR29hbHMoXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgICAgICBbbmV4dEZhc3RUcmFja0dvYWxdLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LnRlbmFudElkXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlLnVwZGF0ZVdvcmtmbG93U3RhdGUoXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgICAgICB7IGZhc3RUcmFja0dvYWxzOiBmYXN0VHJhY2tHb2FsSWRzIH0sXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gUGhhc2UgQzogU2F2ZSBleHRyYWN0ZWQgZGF0YSB0byBjaGFubmVsIHN0YXRlXG4gICAgICAgICAgaWYgKHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZSAmJiBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgLy8gU2F2ZSBlYWNoIGV4dHJhY3RlZCBmaWVsZFxuICAgICAgICAgICAgICBmb3IgKGNvbnN0IFtmaWVsZE5hbWUsIGZpZWxkVmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mbyB8fCB7fSkpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UubWFya0ZpZWxkQ2FwdHVyZWQoXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVmFsdWUsXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LnRlbmFudElkXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gVXBkYXRlIGFjdGl2ZSBnb2Fsc1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBBY3RpdmUgZ29hbHMgZnJvbSBvcmNoZXN0cmF0b3I6ICR7SlNPTi5zdHJpbmdpZnkoZ29hbFJlc3VsdC5hY3RpdmVHb2Fscyl9YCk7XG4gICAgICAgICAgICAgIGlmIChnb2FsUmVzdWx0LmFjdGl2ZUdvYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2Uuc2V0QWN0aXZlR29hbHMoXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgIGdvYWxSZXN1bHQuYWN0aXZlR29hbHMsXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LnRlbmFudElkXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gTWFyayBjb21wbGV0ZWQgZ29hbHNcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKchSBOZXdseSBjb21wbGV0ZWQgZ29hbHM6ICR7SlNPTi5zdHJpbmdpZnkoZ29hbFJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlDb21wbGV0ZWQpfWApO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvbXBsZXRlZEdvYWxJZCBvZiBnb2FsUmVzdWx0LnN0YXRlVXBkYXRlcy5uZXdseUNvbXBsZXRlZCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5tYXJrR29hbENvbXBsZXRlZChcbiAgICAgICAgICAgICAgICAgIGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgICAgY29tcGxldGVkR29hbElkLFxuICAgICAgICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFsbCBjb250YWN0IGluZm8gaXMgY29tcGxldGVcbiAgICAgICAgICAgICAgY29uc3QgdXBkYXRlZFN0YXRlID0gYXdhaXQgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlLmxvYWRXb3JrZmxvd1N0YXRlKGNvbnRleHQuY29udmVyc2F0aW9uX2lkLCBjb250ZXh0LnRlbmFudElkKTtcbiAgICAgICAgICAgICAgaWYgKHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5pc0NvbnRhY3RJbmZvQ29tcGxldGUodXBkYXRlZFN0YXRlKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9ICdsZWFkLmNvbnRhY3RfY2FwdHVyZWQnO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIE9ubHkgZW1pdCBpZiB3ZSBoYXZlbid0IGFscmVhZHlcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5oYXNFdmVudEJlZW5FbWl0dGVkKHVwZGF0ZWRTdGF0ZSwgZXZlbnROYW1lKSkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjokgQUxMIENPTlRBQ1QgSU5GTyBDT01QTEVURSEgRW1pdHRpbmcgJHtldmVudE5hbWV9YCk7XG4gICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gUHVibGlzaCBjdXN0b20gZXZlbnQgKG5vdCB1c2luZyBwdWJsaXNoQWdlbnRUcmFjZSBzaW5jZSBkZXRhaWwgc3RydWN0dXJlIGRpZmZlcnMpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgRXZlbnRCcmlkZ2VDbGllbnQsIFB1dEV2ZW50c0NvbW1hbmQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvY2xpZW50LWV2ZW50YnJpZGdlJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGViQ2xpZW50ID0gbmV3IEV2ZW50QnJpZGdlQ2xpZW50KHsgcmVnaW9uOiB0aGlzLmNvbmZpZy5hd3NSZWdpb24gfSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBlYkNsaWVudC5zZW5kKG5ldyBQdXRFdmVudHNDb21tYW5kKHtcbiAgICAgICAgICAgICAgICAgICAgICBFbnRyaWVzOiBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgU291cmNlOiAna3hnZW4uYWdlbnQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgRGV0YWlsVHlwZTogZXZlbnROYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgRGV0YWlsOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFubmVsSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBlbWFpbDogdXBkYXRlZFN0YXRlLmNhcHR1cmVkRGF0YS5lbWFpbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcGhvbmU6IHVwZGF0ZWRTdGF0ZS5jYXB0dXJlZERhdGEucGhvbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGZpcnN0TmFtZTogdXBkYXRlZFN0YXRlLmNhcHR1cmVkRGF0YS5maXJzdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3ROYW1lOiB1cGRhdGVkU3RhdGUuY2FwdHVyZWREYXRhLmxhc3ROYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgICAgICBFdmVudEJ1c05hbWU6IHRoaXMuY29uZmlnLm91dGJvdW5kRXZlbnRCdXNOYW1lXG4gICAgICAgICAgICAgICAgICAgICAgfV1cbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfk6QgRXZlbnQgcHVibGlzaGVkOiAke2V2ZW50TmFtZX1gKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlY29yZCB0aGF0IHdlIGVtaXR0ZWQgdGhpcyBldmVudFxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UucmVjb3JkRXZlbnRFbWl0dGVkKGNvbnRleHQuY29udmVyc2F0aW9uX2lkLCBldmVudE5hbWUsIGNvbnRleHQudGVuYW50SWQpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfkr4gQ2hhbm5lbCBzdGF0ZSBzYXZlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBzYXZpbmcgY2hhbm5lbCBzdGF0ZTonLCBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gRXhlY3V0ZSBhY3Rpb25zIGZvciBuZXdseSBjb21wbGV0ZWQgZ29hbHNcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdC5zdGF0ZVVwZGF0ZXM/Lm5ld2x5Q29tcGxldGVkICYmIGdvYWxSZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTmV3bHkgY29tcGxldGVkIGdvYWxzOiAke2dvYWxSZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLmpvaW4oJywgJyl9YCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoY29uc3QgY29tcGxldGVkR29hbElkIG9mIGdvYWxSZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkKSB7XG4gICAgICAgICAgICAgIC8vIEZpbmQgdGhlIGdvYWwgZGVmaW5pdGlvbiB1c2luZyBoZWxwZXJcbiAgICAgICAgICAgICAgY29uc3QgY29tcGxldGVkR29hbCA9IEdvYWxDb25maWdIZWxwZXIuZmluZEdvYWwoZWZmZWN0aXZlR29hbENvbmZpZywgY29tcGxldGVkR29hbElkKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGlmIChjb21wbGV0ZWRHb2FsICYmIGNvbXBsZXRlZEdvYWwuYWN0aW9ucz8ub25Db21wbGV0ZSkge1xuICAgICAgICAgICAgICAgIC8vIEV4ZWN1dGUgZ29hbCBhY3Rpb25zIChwdWJsaXNoZXMgZXZlbnRzKVxuICAgICAgICAgICAgICAgIGF3YWl0ICh0aGlzLmdvYWxPcmNoZXN0cmF0b3IgYXMgYW55KS5leGVjdXRlR29hbEFjdGlvbnMoY29tcGxldGVkR29hbCwge1xuICAgICAgICAgICAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICAgICAgICBjaGFubmVsSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgICAgdXNlcklkOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgICAgICAgICAgc2Vzc2lvbklkOiBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCB8fCAnZGVmYXVsdCcsXG4gICAgICAgICAgICAgICAgICBjb2xsZWN0ZWREYXRhOiBnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm8gfHwge31cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUud2FybignR29hbCBvcmNoZXN0cmF0aW9uIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBzaGFyaW5nIHBlcm1pc3Npb25zIEJFRk9SRSBwcm9jZXNzaW5nIChpbnRlcmNlcHQgcmVzdHJpY3RlZCBxdWVzdGlvbnMpXG4gICAgICBpZiAodGhpcy5jb25maWcuY29tcGFueUluZm8/LnJlc3BvbnNlR3VpZGVsaW5lcykge1xuICAgICAgICBjb25zdCB7IG5vcm1hbGl6ZVNoYXJpbmdQZXJtaXNzaW9ucywgY2FuU2hhcmVJbmZvcm1hdGlvbiB9ID0gcmVxdWlyZSgnLi9zaGFyaW5nLXBlcm1pc3Npb25zLXV0aWxzJyk7XG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVTaGFyaW5nUGVybWlzc2lvbnMoXG4gICAgICAgICAgdGhpcy5jb25maWcuY29tcGFueUluZm8ucmVzcG9uc2VHdWlkZWxpbmVzLmluZm9ybWF0aW9uQ2F0ZWdvcmllcyxcbiAgICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mby5yZXNwb25zZUd1aWRlbGluZXMuc2hhcmluZ1Blcm1pc3Npb25zXG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICAvLyBDaGVjayBpZiB1c2VyIGlzIGFza2luZyBhYm91dCByZXN0cmljdGVkIGluZm9ybWF0aW9uXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VMb3dlciA9IGNvbnRleHQudGV4dC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBjb25zdCBoYXNDb250YWN0SW5mbyA9ICEhKGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LmVtYWlsIHx8IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LnBob25lKTtcbiAgICAgICAgXG4gICAgICAgIC8vIENoZWNrIGFsbCBcInJlcXVpcmUgY29udGFjdFwiIGNhdGVnb3JpZXNcbiAgICAgICAgZm9yIChjb25zdCBjYXRlZ29yeSBvZiBub3JtYWxpemVkLnJlcXVpcmVzQ29udGFjdCkge1xuICAgICAgICAgIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SSIFVzZXIgYXNrZWQgYWJvdXQgcmVzdHJpY3RlZCB0b3BpYzogXCIke2NhdGVnb3J5fVwiYCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TpyBIYXMgY29udGFjdCBpbmZvOiAke2hhc0NvbnRhY3RJbmZvfWApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWhhc0NvbnRhY3RJbmZvKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIElOVEVSQ0VQVElORzogQ29sbGVjdGluZyBjb250YWN0IGluZm8gYmVmb3JlIHNoYXJpbmcgXCIke2NhdGVnb3J5fVwiYCk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBSZXR1cm4gY29udGFjdCBjb2xsZWN0aW9uIHJlc3BvbnNlIGltbWVkaWF0ZWx5XG4gICAgICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiBgSSdkIGJlIGhhcHB5IHRvIHNoYXJlIGluZm9ybWF0aW9uIGFib3V0ICR7Y2F0ZWdvcnl9ISBUbyBzZW5kIHlvdSB0aGUgZGV0YWlscywgd2hhdCdzIHRoZSBiZXN0IGVtYWlsIHRvIHJlYWNoIHlvdSBhdD9gIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBDaGVjayBcIm5ldmVyIHNoYXJlXCIgY2F0ZWdvcmllc1xuICAgICAgICBmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIG5vcm1hbGl6ZWQubmV2ZXJTaGFyZSkge1xuICAgICAgICAgIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinYwgVXNlciBhc2tlZCBhYm91dCBcIm5ldmVyIHNoYXJlXCIgdG9waWM6IFwiJHtjYXRlZ29yeX1cImApO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgSU5URVJDRVBUSU5HOiBSZWRpcmVjdGluZyB0byBkaXJlY3QgY29udGFjdGApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBjb21wYW55UGhvbmUgPSB0aGlzLmNvbmZpZy5jb21wYW55SW5mbz8ucGhvbmUgfHwgJ291ciB0ZWFtJztcbiAgICAgICAgICAgIGNvbnN0IGNvbXBhbnlXZWJzaXRlID0gdGhpcy5jb25maWcuY29tcGFueUluZm8/LndlYnNpdGU7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCByZXNwb25zZSA9IGBGb3IgaW5mb3JtYXRpb24gYWJvdXQgJHtjYXRlZ29yeX0sIEknZCByZWNvbW1lbmQgc3BlYWtpbmcgd2l0aCBvdXIgdGVhbSBkaXJlY3RseS5gO1xuICAgICAgICAgICAgaWYgKGNvbXBhbnlQaG9uZSAhPT0gJ291ciB0ZWFtJykge1xuICAgICAgICAgICAgICByZXNwb25zZSArPSBgIFlvdSBjYW4gcmVhY2ggdXMgYXQgJHtjb21wYW55UGhvbmV9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjb21wYW55V2Vic2l0ZSkge1xuICAgICAgICAgICAgICByZXNwb25zZSArPSBgIG9yIHZpc2l0ICR7Y29tcGFueVdlYnNpdGV9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3BvbnNlICs9IGAuIElzIHRoZXJlIGFueXRoaW5nIGVsc2UgSSBjYW4gaGVscCB5b3Ugd2l0aD9gO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4geyByZXNwb25zZSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBDaGVjayBmb3IgaW50ZW50IG1hdGNoZXMgYmVmb3JlIHByb2Nlc3Npbmcgd2l0aCBMYW5nQ2hhaW5cbiAgICAgIGNvbnN0IGludGVudE1hdGNoID0gYXdhaXQgdGhpcy5pbnRlbnRTZXJ2aWNlLmRldGVjdEludGVudChcbiAgICAgICAgY29udGV4dC50ZXh0LFxuICAgICAgICBjdXJyZW50UGVyc29uYSxcbiAgICAgICAgdGhpcy5jb25maWcuY29tcGFueUluZm8gfHwge1xuICAgICAgICAgIG5hbWU6ICdQbGFuZXQgRml0bmVzczknLFxuICAgICAgICAgIGluZHVzdHJ5OiAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ0FtZXJpY2FcXCdzIG1vc3QgcG9wdWxhciBneW0gd2l0aCBvdmVyIDIsNDAwIGxvY2F0aW9ucycsXG4gICAgICAgICAgcHJvZHVjdHM6ICdHeW0gbWVtYmVyc2hpcHMsIGZpdG5lc3MgZXF1aXBtZW50LCBncm91cCBjbGFzc2VzJyxcbiAgICAgICAgICBiZW5lZml0czogJ0FmZm9yZGFibGUgcHJpY2luZywganVkZ21lbnQtZnJlZSBlbnZpcm9ubWVudCwgY29udmVuaWVudCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHRhcmdldEN1c3RvbWVyczogJ1Blb3BsZSBvZiBhbGwgZml0bmVzcyBsZXZlbHMgbG9va2luZyBmb3IgYW4gYWZmb3JkYWJsZSwgbm9uLWludGltaWRhdGluZyBneW0gZXhwZXJpZW5jZScsXG4gICAgICAgICAgZGlmZmVyZW50aWF0b3JzOiAnTG93IGNvc3QsIG5vLWp1ZGdtZW50IGF0bW9zcGhlcmUsIGJlZ2lubmVyLWZyaWVuZGx5IGVudmlyb25tZW50J1xuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgdXNlcklkOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UgYXMgc3RyaW5nXG4gICAgICAgIH1cbiAgICAgICk7XG5cbiAgICAgIC8vIElmIHdlIGhhdmUgYSBoaWdoLWNvbmZpZGVuY2UgaW50ZW50IG1hdGNoLCB1c2UgdGhlIGludGVudCByZXNwb25zZVxuICAgICAgaWYgKGludGVudE1hdGNoICYmIGludGVudE1hdGNoLmNvbmZpZGVuY2UgPiAwLjcpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbfCfjq8gSU5URU5UIERFVEVDVEVEOiAke2ludGVudE1hdGNoLmludGVudC5pZH0gKGNvbmZpZGVuY2U6ICR7KGludGVudE1hdGNoLmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMSl9JSlcXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgTmFtZTogJHtpbnRlbnRNYXRjaC5pbnRlbnQubmFtZX1cXHgxYlswbWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgUHJpb3JpdHk6ICR7aW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5fVxceDFiWzBtYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBNYXRjaGVkIHRyaWdnZXJzOiAke2ludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2Vycy5qb2luKCcsICcpfVxceDFiWzBtYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBNYXRjaGVkIHBhdHRlcm5zOiAke2ludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucy5qb2luKCcsICcpfVxceDFiWzBtYCk7XG4gICAgICAgIGlmIChpbnRlbnRNYXRjaC5hY3Rpb25zICYmIGludGVudE1hdGNoLmFjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMW0gICBBY3Rpb25zOiAke2ludGVudE1hdGNoLmFjdGlvbnMuam9pbignLCAnKX1cXHgxYlswbWApO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBFeGVjdXRlIGludGVudCBhY3Rpb25zIGlmIHJlZ2lzdHJ5IGlzIGF2YWlsYWJsZVxuICAgICAgICBsZXQgaW50ZW50QWN0aW9uUmVzdWx0czogSW50ZW50QWN0aW9uUmVzdWx0W10gPSBbXTtcbiAgICAgICAgaWYgKHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYWN0aW9uQ29udGV4dDogSW50ZW50QWN0aW9uQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgaW50ZW50OiB7XG4gICAgICAgICAgICAgICAgaWQ6IGludGVudE1hdGNoLmludGVudC5pZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBpbnRlbnRNYXRjaC5pbnRlbnQubmFtZSxcbiAgICAgICAgICAgICAgICBjb25maWRlbmNlOiBpbnRlbnRNYXRjaC5jb25maWRlbmNlLFxuICAgICAgICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBhZ2VudENvbnRleHQ6IGNvbnRleHQsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkRGF0YTogZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbyB8fCB7fSxcbiAgICAgICAgICAgICAgY29udmVyc2F0aW9uOiB7XG4gICAgICAgICAgICAgICAgaWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgbWVzc2FnZUNvdW50OiAxLCAvLyBUT0RPOiBHZXQgYWN0dWFsIG1lc3NhZ2UgY291bnRcbiAgICAgICAgICAgICAgICBoaXN0b3J5OiBbXSwgLy8gVE9ETzogR2V0IGNvbnZlcnNhdGlvbiBoaXN0b3J5XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHVzZXI6IHtcbiAgICAgICAgICAgICAgICBlbWFpbDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICAgICAgICBwaG9uZTogZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8ucGhvbmU/LnZhbHVlLFxuICAgICAgICAgICAgICAgIG5hbWU6IGdvYWxSZXN1bHQ/LmV4dHJhY3RlZEluZm8/LmZpcnN0TmFtZT8udmFsdWUgfHwgZ29hbFJlc3VsdD8uZXh0cmFjdGVkSW5mbz8uZnVsbE5hbWU/LnZhbHVlLFxuICAgICAgICAgICAgICAgIGxlYWRJZDogY29udGV4dC5sZWFkX2lkLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB0ZW5hbnQ6IHtcbiAgICAgICAgICAgICAgICBpZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgICBjb21wYW55SW5mbzogdGhpcy5jb25maWcuY29tcGFueUluZm8sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGNoYW5uZWw6IHtcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGNvbnRleHQuc291cmNlLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IGNvbnRleHQuY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaW50ZW50QWN0aW9uUmVzdWx0cyA9IGF3YWl0IHRoaXMuaW50ZW50QWN0aW9uUmVnaXN0cnkuZXhlY3V0ZUFjdGlvbnMoYWN0aW9uQ29udGV4dCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIExvZyBhY3Rpb24gcmVzdWx0c1xuICAgICAgICAgICAgaWYgKGludGVudEFjdGlvblJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFt8J+agCBJTlRFTlQgQUNUSU9OUyBFWEVDVVRFRDogJHtpbnRlbnRBY3Rpb25SZXN1bHRzLmxlbmd0aH0gYWN0aW9uc1xceDFiWzBtYCk7XG4gICAgICAgICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGludGVudEFjdGlvblJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMm0gICDinIUgJHtyZXN1bHQubWV0YWRhdGE/LmFjdGlvbk5hbWUgfHwgJ1Vua25vd24nfTogU3VjY2Vzc1xceDFiWzBtYCk7XG4gICAgICAgICAgICAgICAgICBpZiAocmVzdWx0Lm1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMybSAgICAgIE1lc3NhZ2U6ICR7cmVzdWx0Lm1lc3NhZ2V9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxceDFiWzMxbSAgIOKdjCAke3Jlc3VsdC5tZXRhZGF0YT8uYWN0aW9uTmFtZSB8fCAnVW5rbm93bid9OiBGYWlsZWRcXHgxYlswbWApO1xuICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzFtICAgICAgRXJyb3I6ICR7cmVzdWx0LmVycm9yLm1lc3NhZ2V9XFx4MWJbMG1gKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignSW50ZW50IGFjdGlvbiBleGVjdXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRyYWNrIHRoZSBpbnRlbnQgcmVzcG9uc2VcbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmV2ZW50QnJpZGdlU2VydmljZS5wdWJsaXNoQWdlbnRUcmFjZSh7XG4gICAgICAgICAgICBzb3VyY2U6ICdreGdlbi5hZ2VudCcsXG4gICAgICAgICAgICAnZGV0YWlsLXR5cGUnOiAnYWdlbnQudHJhY2UnLFxuICAgICAgICAgICAgZGV0YWlsOiB7XG4gICAgICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgICBvcGVyYXRpb246ICdpbnRlbnRfbWF0Y2gnLFxuICAgICAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgICAgIGludGVudElkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICAgICAgICBtYXRjaGVkVHJpZ2dlcnM6IGludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2VycyxcbiAgICAgICAgICAgICAgICBtYXRjaGVkUGF0dGVybnM6IGludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucyxcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBpbnRlbnRNYXRjaC5hY3Rpb25zLFxuICAgICAgICAgICAgICAgIGFjdGlvblJlc3VsdHM6IGludGVudEFjdGlvblJlc3VsdHMubWFwKHIgPT4gKHtcbiAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHIuc3VjY2VzcyxcbiAgICAgICAgICAgICAgICAgIGFjdGlvbklkOiByLm1ldGFkYXRhPy5hY3Rpb25JZCxcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IHIubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgIGVycm9yOiByLmVycm9yPy5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHBlcnNvbmFfaGFuZGxlZCBpbnRlbnQgKGVtcHR5IHJlc3BvbnNlIG1lYW5zIGxldCBwZXJzb25hIGhhbmRsZSBpdClcbiAgICAgICAgaWYgKCFpbnRlbnRNYXRjaC5yZXNwb25zZSB8fCBpbnRlbnRNYXRjaC5yZXNwb25zZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gSW50ZW50IGRldGVjdGVkIGJ1dCBwZXJzb25hX2hhbmRsZWQgLSBsZXR0aW5nIENhcmxvcyByZXNwb25kIG5hdHVyYWxseWApO1xuICAgICAgICAgIC8vIERvbid0IHJldHVybiBlYXJseSAtIGxldCB0aGUgbm9ybWFsIExhbmdDaGFpbiBmbG93IGhhbmRsZSB0aGlzIHdpdGggdGhlIHBlcnNvbmEncyBydWxlc1xuICAgICAgICAgIC8vIFRoZSBpbnRlbnQgZGV0ZWN0aW9uIGluZm8gaXMgbG9nZ2VkIGFib3ZlIGZvciB0cmFja2luZyBwdXJwb3Nlc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEhhbmRsZSBpbnRlbnRzIHdpdGggdGVtcGxhdGVkIHJlc3BvbnNlcyAobGlrZSBvcGVyYXRpb25hbCBob3VycylcbiAgICAgICAgICBsZXQgcmVzcG9uc2UgPSBpbnRlbnRNYXRjaC5yZXNwb25zZTtcbiAgICAgICAgICBpZiAoZ29hbFJlc3VsdCAmJiBnb2FsUmVzdWx0LnJlY29tbWVuZGF0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBoaWdoUHJpb3JpdHlHb2FsID0gZ29hbFJlc3VsdC5yZWNvbW1lbmRhdGlvbnMuZmluZChyID0+IHIuc2hvdWxkUHVyc3VlICYmIHIucHJpb3JpdHkgPj0gNCk7XG4gICAgICAgICAgICBpZiAoaGlnaFByaW9yaXR5R29hbCkge1xuICAgICAgICAgICAgICByZXNwb25zZSArPSBgXFxuXFxuJHtoaWdoUHJpb3JpdHlHb2FsLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQWRkIGZvbGxvdy11cCBpZiBhdmFpbGFibGVcbiAgICAgICAgICBpZiAoaW50ZW50TWF0Y2guZm9sbG93VXApIHtcbiAgICAgICAgICAgIHJlc3BvbnNlICs9ICdcXG5cXG4nICsgaW50ZW50TWF0Y2guZm9sbG93VXAuam9pbignICcpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZSB9O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEhhbmRsZSBjaGF0IGhpc3RvcnkgLSBlaXRoZXIgZnJvbSBleGlzdGluZyBoaXN0b3J5IChDTEkpIG9yIGZyb20gc3RvcmFnZSAoTGFtYmRhKVxuICAgICAgbGV0IG1lc3NhZ2VzOiBCYXNlTWVzc2FnZVtdO1xuICAgICAgXG4gICAgICBpZiAoZXhpc3RpbmdIaXN0b3J5KSB7XG4gICAgICAgIC8vIENMSS9Mb2NhbCBtb2RlOiBVc2UgcHJvdmlkZWQgaGlzdG9yeVxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBVc2luZyBwcm92aWRlZCBjaGF0IGhpc3Rvcnk6ICR7ZXhpc3RpbmdIaXN0b3J5Lmxlbmd0aH0gbWVzc2FnZXNgKTtcbiAgICAgICAgbWVzc2FnZXMgPSBleGlzdGluZ0hpc3Rvcnk7XG4gICAgICAgIFxuICAgICAgICAvLyBBZGQgY3VycmVudCBtZXNzYWdlIHRvIHRoZSBwcm92aWRlZCBoaXN0b3J5XG4gICAgICAgIGNvbnN0IGluY29taW5nTWVzc2FnZSA9IG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQ6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogY29udGV4dC5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgICAgICBsZWFkX2lkOiBjb250ZXh0LmxlYWRfaWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIG1lc3NhZ2VzLnB1c2goaW5jb21pbmdNZXNzYWdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIExhbWJkYSBtb2RlOiBMb2FkIGZyb20gRHluYW1vREIgb3IgY3JlYXRlIG5ld1xuICAgICAgICBjb25zdCBzZXNzaW9uS2V5ID0gYCR7Y29udGV4dC50ZW5hbnRJZH06JHtjb250ZXh0LmVtYWlsX2xjfToke2NvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICdkZWZhdWx0LXNlc3Npb24nfWA7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIExhbWJkYSBtb2RlIC0gU2Vzc2lvbiBLZXk6ICR7c2Vzc2lvbktleX1gKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNoYXRIaXN0b3J5ID0gdGhpcy5jb25maWcuZHluYW1vU2VydmljZSBcbiAgICAgICAgICA/IG5ldyBLeER5bmFtb0NoYXRIaXN0b3J5KHtcbiAgICAgICAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgICAgIGVtYWlsTGM6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgICAgIGR5bmFtb1NlcnZpY2U6IHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UsXG4gICAgICAgICAgICAgIGhpc3RvcnlMaW1pdDogdGhpcy5jb25maWcuaGlzdG9yeUxpbWl0LFxuICAgICAgICAgICAgICBjb252ZXJzYXRpb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIDogbmV3IE1lbW9yeUNoYXRIaXN0b3J5KHNlc3Npb25LZXkpO1xuXG4gICAgICAgIC8vIEFkZCB0aGUgaW5jb21pbmcgbWVzc2FnZSB0byBoaXN0b3J5XG4gICAgICAgIGNvbnN0IGluY29taW5nTWVzc2FnZSA9IG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQ6IGNvbnRleHQudGV4dCxcbiAgICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgICAgc291cmNlOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogY29udGV4dC5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgICAgICBsZWFkX2lkOiBjb250ZXh0LmxlYWRfaWQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIFNraXAgYWRkaW5nIHRvIER5bmFtb0RCIC0gbWVzc2FnaW5nIHNlcnZpY2UgaGFuZGxlcyBwZXJzaXN0ZW5jZVxuICAgICAgICAvLyBhd2FpdCBjaGF0SGlzdG9yeS5hZGRNZXNzYWdlKGluY29taW5nTWVzc2FnZSk7XG5cbiAgICAgICAgLy8gR2V0IGNvbnZlcnNhdGlvbiBoaXN0b3J5IGZyb20gc3RvcmFnZVxuICAgICAgICBtZXNzYWdlcyA9IHRoaXMuY29uZmlnLmR5bmFtb1NlcnZpY2UgXG4gICAgICAgICAgPyBhd2FpdCAoY2hhdEhpc3RvcnkgYXMgS3hEeW5hbW9DaGF0SGlzdG9yeSkuZ2V0TWVzc2FnZXNXaXRoVG9rZW5Fc3RpbWF0ZSgzMDAwKVxuICAgICAgICAgIDogYXdhaXQgKGNoYXRIaXN0b3J5IGFzIE1lbW9yeUNoYXRIaXN0b3J5KS5nZXRSZWNlbnRNZXNzYWdlcygzMDAwKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gREVCVUc6IENoZWNrIGlmIGhpc3RvcnkgaXMgd29ya2luZ1xuICAgICAgY29uc29sZS5sb2coYPCflI0gQ2hhdCBIaXN0b3J5IERlYnVnOmApO1xuICAgICAgY29uc29sZS5sb2coYCAgIE1lc3NhZ2VzIGluIGhpc3Rvcnk6ICR7bWVzc2FnZXMubGVuZ3RofWApO1xuICAgICAgaWYgKG1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgbGFzdE1lc3NhZ2UgPSBtZXNzYWdlc1ttZXNzYWdlcy5sZW5ndGggLSAxXTtcbiAgICAgICAgY29uc3QgY29udGVudCA9IHR5cGVvZiBsYXN0TWVzc2FnZS5jb250ZW50ID09PSAnc3RyaW5nJyA/IGxhc3RNZXNzYWdlLmNvbnRlbnQgOiBKU09OLnN0cmluZ2lmeShsYXN0TWVzc2FnZS5jb250ZW50KTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIExhc3QgbWVzc2FnZTogJHtjb250ZW50LnN1YnN0cmluZygwLCA1MCl9Li4uYCk7XG4gICAgICB9XG5cbiAgICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxuICAgICAgLy8g8J+OryBUSFJFRS1SRVFVRVNUIEFSQ0hJVEVDVFVSRSAoZGVsZWdhdGVkIHRvIE1lc3NhZ2VQcm9jZXNzb3IpXG4gICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbiAgICAgIC8vIFRoZSBNZXNzYWdlUHJvY2Vzc29yIGhhbmRsZXM6XG4gICAgICAvLyAtIFJFUVVFU1QgIzE6IEludGVudCBEZXRlY3Rpb24gJiBDb250ZXh0IEFuYWx5c2lzXG4gICAgICAvLyAtIFJFUVVFU1QgIzI6IENvbnZlcnNhdGlvbmFsIFJlc3BvbnNlIEdlbmVyYXRpb24gIFxuICAgICAgLy8gLSBSRVFVRVNUICMzOiBGb2xsb3ctVXAgR2VuZXJhdGlvbiAoVmVyaWZpY2F0aW9uIG9yIEdvYWwgUXVlc3Rpb24pXG4gICAgICBcbiAgICAgIGNvbnN0IHByb2Nlc3NvciA9IG5ldyBNZXNzYWdlUHJvY2Vzc29yKHtcbiAgICAgICAgbW9kZWw6IHRoaXMubW9kZWwsXG4gICAgICAgIHBlcnNvbmE6IGN1cnJlbnRQZXJzb25hLFxuICAgICAgICBjb21wYW55SW5mbzogdGhpcy5jb25maWcuY29tcGFueUluZm8sXG4gICAgICAgIGFjdGlvblRhZ1Byb2Nlc3NvcjogdGhpcy5hY3Rpb25UYWdQcm9jZXNzb3IsXG4gICAgICAgIGV2ZW50QnJpZGdlU2VydmljZTogdGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlXG4gICAgICB9KTtcblxuICAgICAgLy8gRGVmaW5lIGNhbGxiYWNrIGZvciBNZXNzYWdlUHJvY2Vzc29yIHRvIHBlcnNpc3QgZGF0YSBhbmQgdXBkYXRlIGdvYWwgc3RhdGVcbiAgICAgIGNvbnN0IG9uRGF0YUV4dHJhY3RlZCA9IGFzeW5jIChleHRyYWN0ZWREYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBnb2FsUmVzdWx0OiBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCB8IG51bGwsIHVzZXJNZXNzYWdlPzogc3RyaW5nKSA9PiB7XG4gICAgICAgIGlmICghZ29hbFJlc3VsdCkgcmV0dXJuO1xuXG4gICAgICAgIC8vIPCflIQgSEFORExFIEVSUk9SIFJFQ09WRVJZOiBVc2VyIHNheXMgY29udGFjdCBpbmZvIHdhcyB3cm9uZ1xuICAgICAgICBpZiAoZXh0cmFjdGVkRGF0YS53cm9uZ19waG9uZSB8fCBleHRyYWN0ZWREYXRhLndyb25nX2VtYWlsKSB7XG4gICAgICAgICAgY29uc3QgZXJyb3JGaWVsZCA9IGV4dHJhY3RlZERhdGEud3JvbmdfcGhvbmUgPyAnd3JvbmdfcGhvbmUnIDogJ3dyb25nX2VtYWlsJztcbiAgICAgICAgICBjb25zdCBhY3R1YWxGaWVsZCA9IGVycm9yRmllbGQgPT09ICd3cm9uZ19waG9uZScgPyAncGhvbmUnIDogJ2VtYWlsJztcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBHZXQgdGhlIHdyb25nIHZhbHVlIGZyb20gQ1VSUkVOVCB3b3JrZmxvdyBzdGF0ZSAobm90IGZyb20gTExNIGV4dHJhY3Rpb24pXG4gICAgICAgICAgbGV0IHdyb25nVmFsdWU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICAgICAgICAgIGlmICh0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UgJiYgY29udGV4dC5jb252ZXJzYXRpb25faWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5sb2FkV29ya2Zsb3dTdGF0ZShjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCwgY29udGV4dC50ZW5hbnRJZCk7XG4gICAgICAgICAgICB3cm9uZ1ZhbHVlID0gY3VycmVudFN0YXRlLmNhcHR1cmVkRGF0YVthY3R1YWxGaWVsZF0gfHwgbnVsbDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gSWYgd2UgZG9uJ3QgaGF2ZSBhIHZhbHVlIG9uIGZpbGUsIHdlIGNhbid0IHJlY292ZXIgLSBza2lwIHRoaXNcbiAgICAgICAgICBpZiAoIXdyb25nVmFsdWUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gVXNlciBzYXlzICR7YWN0dWFsRmllbGR9IHdhcyB3cm9uZywgYnV0IHdlIGRvbid0IGhhdmUgb25lIG9uIGZpbGUuIFNraXBwaW5nIGVycm9yIHJlY292ZXJ5LmApO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhCBFUlJPUiBSRUNPVkVSWTogVXNlciBzYXlzICR7YWN0dWFsRmllbGR9IHdhcyB3cm9uZyAoJHt3cm9uZ1ZhbHVlfSlgKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBDbGVhciB0aGUgYmFkIGRhdGEgZnJvbSB3b3JrZmxvdyBzdGF0ZVxuICAgICAgICAgIGlmICh0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UgJiYgY29udGV4dC5jb252ZXJzYXRpb25faWQpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5jbGVhckZpZWxkRGF0YShcbiAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICBhY3R1YWxGaWVsZCxcbiAgICAgICAgICAgICAgICBjb250ZXh0LnRlbmFudElkXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5eR77iPIENsZWFyZWQgYmFkICR7YWN0dWFsRmllbGR9IGZyb20gd29ya2Zsb3cgc3RhdGVgKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIEZpbmQgYW5kIHJlYWN0aXZhdGUgdGhlIGNvbnRhY3QgaW5mbyBnb2FsXG4gICAgICAgICAgICAgIGNvbnN0IGNvbnRhY3RHb2FsID0gZWZmZWN0aXZlR29hbENvbmZpZz8uZ29hbHMuZmluZChnID0+IFxuICAgICAgICAgICAgICAgIGcudHlwZSA9PT0gJ2RhdGFfY29sbGVjdGlvbicgJiYgXG4gICAgICAgICAgICAgICAgZy5kYXRhVG9DYXB0dXJlPy5maWVsZHMuaW5jbHVkZXMoYWN0dWFsRmllbGQpXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoY29udGFjdEdvYWwpIHtcbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBjb21wbGV0ZWQgZ29hbHMsIGFkZCBiYWNrIHRvIGFjdGl2ZSBnb2Fsc1xuICAgICAgICAgICAgICAgIGdvYWxSZXN1bHQuY29tcGxldGVkR29hbHMgPSBnb2FsUmVzdWx0LmNvbXBsZXRlZEdvYWxzLmZpbHRlcihpZCA9PiBpZCAhPT0gY29udGFjdEdvYWwuaWQpO1xuICAgICAgICAgICAgICAgIGlmICghZ29hbFJlc3VsdC5hY3RpdmVHb2Fscy5pbmNsdWRlcyhjb250YWN0R29hbC5pZCkpIHtcbiAgICAgICAgICAgICAgICAgIGdvYWxSZXN1bHQuYWN0aXZlR29hbHMucHVzaChjb250YWN0R29hbC5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIE1hcmsgZ29hbCBhcyBub3QgY29tcGxldGUgaW4gRHluYW1vREJcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UubWFya0dvYWxJbmNvbXBsZXRlKFxuICAgICAgICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgICBjb250YWN0R29hbC5pZCxcbiAgICAgICAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgUmVhY3RpdmF0ZWQgZ29hbDogJHtjb250YWN0R29hbC5pZH0gKCR7Y29udGFjdEdvYWwubmFtZX0pYCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIFN0b3JlIHRoZSB3cm9uZyB2YWx1ZSBmb3IgYWNrbm93bGVkZ21lbnRcbiAgICAgICAgICAgICAgZ29hbFJlc3VsdC5leHRyYWN0ZWRJbmZvW2BwcmV2aW91c18ke2FjdHVhbEZpZWxkfWBdID0gd3JvbmdWYWx1ZTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZHVyaW5nICR7YWN0dWFsRmllbGR9IHJlY292ZXJ5OmAsIGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gU2tpcCBub3JtYWwgZGF0YSBleHRyYWN0aW9uIGZvciB0aGlzIHR1cm5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQZXJzaXN0IGVhY2ggZXh0cmFjdGVkIGZpZWxkICh3aXRoIHZhbGlkYXRpb24pXG4gICAgICAgIGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZmllbGREYXRhXSBvZiBPYmplY3QuZW50cmllcyhleHRyYWN0ZWREYXRhKSkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gdHlwZW9mIGZpZWxkRGF0YSA9PT0gJ29iamVjdCcgJiYgZmllbGREYXRhLnZhbHVlID8gZmllbGREYXRhLnZhbHVlIDogZmllbGREYXRhO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIPCflKUgQ1JJVElDQUw6IFZhbGlkYXRlIGRhdGEgYmVmb3JlIHNhdmluZ1xuICAgICAgICAgIGxldCBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgICAgICBpZiAoZmllbGROYW1lID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgICBpc1ZhbGlkID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC8udGVzdCh2YWx1ZSk7XG4gICAgICAgICAgICBpZiAoIWlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKdjCBTa2lwcGluZyBpbnZhbGlkIGVtYWlsOiBcIiR7dmFsdWV9XCJgKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdwaG9uZScpIHtcbiAgICAgICAgICAgIGNvbnN0IGRpZ2l0c09ubHkgPSB2YWx1ZS5yZXBsYWNlKC9cXEQvZywgJycpO1xuICAgICAgICAgICAgaXNWYWxpZCA9IGRpZ2l0c09ubHkubGVuZ3RoID49IDc7XG4gICAgICAgICAgICBpZiAoIWlzVmFsaWQpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKdjCBTa2lwcGluZyBpbnZhbGlkIHBob25lIChvbmx5ICR7ZGlnaXRzT25seS5sZW5ndGh9IGRpZ2l0cyk6IFwiJHt2YWx1ZX1cImApO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc29sZS5sb2coYPCfkr4gTExNIGV4dHJhY3RlZCBkYXRhOiAke2ZpZWxkTmFtZX0gPSBcIiR7dmFsdWV9XCJgKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBNZXJnZSBpbnRvIGdvYWxSZXN1bHRcbiAgICAgICAgICBnb2FsUmVzdWx0LmV4dHJhY3RlZEluZm9bZmllbGROYW1lXSA9IHZhbHVlO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIFBFUlNJU1QgdG8gRHluYW1vREJcbiAgICAgICAgICBpZiAodGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlICYmIGNvbnRleHQuY29udmVyc2F0aW9uX2lkKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UubWFya0ZpZWxkQ2FwdHVyZWQoXG4gICAgICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKchSBQZXJzaXN0ZWQgJHtmaWVsZE5hbWV9IHRvIER5bmFtb0RCYCk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBBdXRvLWRldGVjdCBhbmQgcGVyc2lzdCBnZW5kZXIgd2hlbiBmaXJzdE5hbWUgaXMgY2FwdHVyZWRcbiAgICAgICAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2ZpcnN0TmFtZScgJiYgIWdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mb1snZ2VuZGVyJ10pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRlY3RlZEdlbmRlciA9IHRoaXMuZGV0ZWN0R2VuZGVyRnJvbU5hbWUodmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChkZXRlY3RlZEdlbmRlcikge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjq0gQXV0by1kZXRlY3RlZCBnZW5kZXIgZnJvbSBuYW1lIFwiJHt2YWx1ZX1cIjogJHtkZXRlY3RlZEdlbmRlcn1gKTtcbiAgICAgICAgICAgICAgICAgIGdvYWxSZXN1bHQuZXh0cmFjdGVkSW5mb1snZ2VuZGVyJ10gPSBkZXRlY3RlZEdlbmRlcjtcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5tYXJrRmllbGRDYXB0dXJlZChcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgICAgICdnZW5kZXInLFxuICAgICAgICAgICAgICAgICAgICBkZXRlY3RlZEdlbmRlcixcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgUGVyc2lzdGVkIGdlbmRlciB0byBEeW5hbW9EQmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBwZXJzaXN0ICR7ZmllbGROYW1lfSB0byBEeW5hbW9EQjpgLCBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBSZS1jaGVjayBnb2FsIGNvbXBsZXRpb24gYW5kIHVwZGF0ZSBhY3RpdmVHb2Fsc1xuICAgICAgICAvLyDwn5qAIE5FVzogQ2hlY2sgQUxMIGdvYWxzIChub3QganVzdCBhY3RpdmUgb25lcykgLSB1c2VyIG1heSBzYXRpc2Z5IG11bHRpcGxlIGdvYWxzIGluIG9uZSBtZXNzYWdlIVxuICAgICAgICBpZiAodGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlICYmIGNvbnRleHQuY29udmVyc2F0aW9uX2lkICYmIGVmZmVjdGl2ZUdvYWxDb25maWcpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IHVwZGF0ZWRTdGF0ZSA9IGF3YWl0IHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5sb2FkV29ya2Zsb3dTdGF0ZShjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCwgY29udGV4dC50ZW5hbnRJZCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG4keyfwn46vJy5yZXBlYXQoMjApfWApO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gTVVMVEktR09BTCBDT01QTEVUSU9OIENIRUNLYCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBDaGVja2luZyBBTEwgJHtlZmZlY3RpdmVHb2FsQ29uZmlnLmdvYWxzLmxlbmd0aH0gZ29hbHMgYWdhaW5zdCBjYXB0dXJlZCBkYXRhLi4uYCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgJHsn8J+OrycucmVwZWF0KDIwKX1cXG5gKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gU29ydCBnb2FscyBieSBvcmRlciBmb3IgcHJvcGVyIHNlcXVlbnRpYWwgY29tcGxldGlvblxuICAgICAgICAgICAgY29uc3Qgc29ydGVkR29hbHMgPSBbLi4uZWZmZWN0aXZlR29hbENvbmZpZy5nb2Fsc10uc29ydCgoYSwgYikgPT4gKGEub3JkZXIgfHwgOTk5KSAtIChiLm9yZGVyIHx8IDk5OSkpO1xuICAgICAgICAgICAgY29uc3QgY29tcGxldGVkR29hbHNUaGlzVHVybjogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ2hlY2sgRVZFUlkgZ29hbCAobm90IGp1c3QgYWN0aXZlIG9uZXMpIHRvIHNlZSBpZiBpdCBjYW4gYmUgY29tcGxldGVkXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGdvYWxEZWYgb2Ygc29ydGVkR29hbHMpIHtcbiAgICAgICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGNvbXBsZXRlZFxuICAgICAgICAgICAgICBpZiAodXBkYXRlZFN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWxEZWYuaWQpKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAg4o+t77iPICR7Z29hbERlZi5uYW1lfTogQWxyZWFkeSBjb21wbGV0ZWRgKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gT25seSBjaGVjayBkYXRhX2NvbGxlY3Rpb24gYW5kIHNjaGVkdWxpbmcgZ29hbHNcbiAgICAgICAgICAgICAgaWYgKGdvYWxEZWYudHlwZSAhPT0gJ2RhdGFfY29sbGVjdGlvbicgJiYgZ29hbERlZi50eXBlICE9PSAnc2NoZWR1bGluZycpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYWxsIHJlcXVpcmVkIGZpZWxkcyBhcmUgY2FwdHVyZWRcbiAgICAgICAgICAgICAgY29uc3QgcmVxdWlyZWRGaWVsZHMgPSB0aGlzLmdldFJlcXVpcmVkRmllbGROYW1lcyhnb2FsRGVmKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIEhlbHBlciB0byBjaGVjayBpZiBhIGZpZWxkIGhhcyBhIHZhbGlkIChub24tbnVsbCwgbm9uLWVtcHR5KSB2YWx1ZVxuICAgICAgICAgICAgICBjb25zdCBoYXNWYWxpZFZhbHVlID0gKGZpZWxkOiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZWRTdGF0ZS5jYXB0dXJlZERhdGFbZmllbGRdO1xuICAgICAgICAgICAgICAgIGlmICghdmFsdWUpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAvLyBIYW5kbGUgb2JqZWN0cyB3aXRoIHsgdmFsdWU6IG51bGwgfSBzdHJ1Y3R1cmUgKGZyb20gTExNIGV4dHJhY3Rpb24pXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3ZhbHVlJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnZhbHVlICE9PSBudWxsICYmIHZhbHVlLnZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUudmFsdWUgIT09ICcnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBIYW5kbGUgZGlyZWN0IHZhbHVlc1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSAnJykgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIPCflZAgU0NIRURVTElORyBWQUxJREFUSU9OOiBGb3Igc2NoZWR1bGluZyBnb2FscywgcmVxdWlyZSBTUEVDSUZJQyBkYXRlL3RpbWVcbiAgICAgICAgICAgICAgICBpZiAoZ29hbERlZi50eXBlID09PSAnc2NoZWR1bGluZycpIHtcbiAgICAgICAgICAgICAgICAgIC8vIHByZWZlcnJlZFRpbWUgbXVzdCBiZSBhIFNQRUNJRklDIHRpbWUgKGUuZy4sIFwiNnBtXCIsIFwiNzozMFwiLCBcIjE4OjAwXCIpXG4gICAgICAgICAgICAgICAgICAvLyBOT1QgdmFndWUgcHJlZmVyZW5jZXMgbGlrZSBcImV2ZW5pbmdcIiwgXCJtb3JuaW5nXCIsIFwibGF0ZXIgdGhhbiA2XCIsIFwiYWZ0ZXIgNVwiXG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGQgPT09ICdwcmVmZXJyZWRUaW1lJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aW1lU3RyID0gU3RyaW5nKHZhbHVlKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGl0J3MgYSBTUEVDSUZJQyB0aW1lIChoYXMgYSBudW1iZXIgZm9sbG93ZWQgYnkgYW0vcG0sIG9yIEhIOk1NIGZvcm1hdClcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNTcGVjaWZpY1RpbWUgPSAvXlxcZHsxLDJ9XFxzKihhbXxwbXw6XFxkezJ9KSQvaS50ZXN0KHRpbWVTdHIpIHx8IC8vIFwiNnBtXCIsIFwiNzozMFwiLCBcIjE4OjAwXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC9eXFxkezEsMn06XFxkezJ9XFxzKihhbXxwbSk/JC9pLnRlc3QodGltZVN0cik7ICAgLy8gXCI3OjMwcG1cIiwgXCIxODowMFwiXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBpdCdzIGEgdmFndWUvcmVsYXRpdmUgY29uc3RyYWludCAoc2hvdWxkIE5PVCBjb21wbGV0ZSB0aGUgZ29hbClcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNWYWd1ZVRpbWUgPSAvXihtb3JuaW5nfGFmdGVybm9vbnxldmVuaW5nfG5pZ2h0fGRheXRpbWV8c29vbnxzb21ldGltZSkkL2kudGVzdCh0aW1lU3RyKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgL1xcYihsYXRlcnxhZnRlcnxiZWZvcmV8YXJvdW5kfGFib3V0KVxcYi4qXFxkL2kudGVzdCh0aW1lU3RyKSB8fCAvLyBcImxhdGVyIHRoYW4gNlwiLCBcImFmdGVyIDVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgL1xcYihsYXRlcnxlYXJsaWVyKVxcYi9pLnRlc3QodGltZVN0cik7IC8vIGp1c3QgXCJsYXRlclwiIG9yIFwiZWFybGllclwiXG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzU3BlY2lmaWNUaW1lIHx8IGlzVmFndWVUaW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAg4pqg77iPIHByZWZlcnJlZFRpbWUgXCIke3ZhbHVlfVwiIGlzIG5vdCBhIHNwZWNpZmljIHRpbWUgLSBuZWVkIGV4YWN0IHRpbWUgbGlrZSBcIjdwbVwiIG9yIFwiNzozMFwiYCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgIC8vIHByZWZlcnJlZERhdGUgbXVzdCBiZSByZXNvbHZhYmxlIHRvIGFuIGFjdHVhbCBkYXRlXG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGQgPT09ICdwcmVmZXJyZWREYXRlJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWd1ZVZhbHVlID0gU3RyaW5nKHZhbHVlKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlc2UgYXJlIGFjY2VwdGFibGUgcmVsYXRpdmUgZGF0ZXMgdGhhdCBjYW4gYmUgcmVzb2x2ZWRcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWNjZXB0YWJsZVJlbGF0aXZlID0gWyd0b2RheScsICd0b21vcnJvdycsICdtb25kYXknLCAndHVlc2RheScsICd3ZWRuZXNkYXknLCAndGh1cnNkYXknLCAnZnJpZGF5JywgJ3NhdHVyZGF5JywgJ3N1bmRheSddO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc1JlbGF0aXZlRGF5ID0gYWNjZXB0YWJsZVJlbGF0aXZlLnNvbWUoZGF5ID0+IHZhZ3VlVmFsdWUuaW5jbHVkZXMoZGF5KSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0RhdGVQYXR0ZXJuID0gL1xcZHsxLDJ9W1xcL1xcLV1cXGR7MSwyfXxcXGR7NH18amFufGZlYnxtYXJ8YXByfG1heXxqdW58anVsfGF1Z3xzZXB8b2N0fG5vdnxkZWMvaS50ZXN0KHZhZ3VlVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1JlbGF0aXZlRGF5ICYmICFoYXNEYXRlUGF0dGVybikge1xuICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIOKaoO+4jyBwcmVmZXJyZWREYXRlIFwiJHt2YWx1ZX1cIiBjYW5ub3QgYmUgcmVzb2x2ZWQgdG8gYSBzcGVjaWZpYyBkYXRlYCk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgIC8vIG5vcm1hbGl6ZWREYXRlVGltZSBtdXN0IGJlIGEgdmFsaWQgSVNPIGRhdGV0aW1lXG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGQgPT09ICdub3JtYWxpemVkRGF0ZVRpbWUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzb1BhdHRlcm4gPSAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9VFxcZHsyfTpcXGR7Mn06XFxkezJ9LztcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc29QYXR0ZXJuLnRlc3QoU3RyaW5nKHZhbHVlKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICDimqDvuI8gbm9ybWFsaXplZERhdGVUaW1lIFwiJHt2YWx1ZX1cIiBpcyBub3QgYSB2YWxpZCBJU08gZGF0ZXRpbWVgKTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb25zdCBjYXB0dXJlZEZpZWxkcyA9IHJlcXVpcmVkRmllbGRzLmZpbHRlcigoZmllbGQ6IHN0cmluZykgPT4gaGFzVmFsaWRWYWx1ZShmaWVsZCkpO1xuICAgICAgICAgICAgICBjb25zdCBtaXNzaW5nRmllbGRzID0gcmVxdWlyZWRGaWVsZHMuZmlsdGVyKChmaWVsZDogc3RyaW5nKSA9PiAhaGFzVmFsaWRWYWx1ZShmaWVsZCkpO1xuICAgICAgICAgICAgICBjb25zdCBhbGxGaWVsZHNDYXB0dXJlZCA9IG1pc3NpbmdGaWVsZHMubGVuZ3RoID09PSAwO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAg8J+TiyAke2dvYWxEZWYubmFtZX0gKG9yZGVyICR7Z29hbERlZi5vcmRlcn0pOmApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgICBSZXF1aXJlZDogJHtyZXF1aXJlZEZpZWxkcy5qb2luKCcsICcpIHx8ICdub25lJ31gKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgICAgQ2FwdHVyZWQ6ICR7Y2FwdHVyZWRGaWVsZHMuam9pbignLCAnKSB8fCAnbm9uZSd9YCk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAgIE1pc3Npbmc6ICAke21pc3NpbmdGaWVsZHMuam9pbignLCAnKSB8fCAnbm9uZSd9YCk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoYWxsRmllbGRzQ2FwdHVyZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICDinIUgJHtnb2FsRGVmLm5hbWV9OiBBbGwgZGF0YSBjYXB0dXJlZCEgTWFya2luZyBjb21wbGV0ZS5gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UubWFya0dvYWxDb21wbGV0ZWQoXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgIGdvYWxEZWYuaWQsXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LnRlbmFudElkXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBFeGVjdXRlIGdvYWwgYWN0aW9uc1xuICAgICAgICAgICAgICAgIGlmIChnb2FsRGVmLmFjdGlvbnM/Lm9uQ29tcGxldGUpIHtcbiAgICAgICAgICAgICAgICAgIGF3YWl0ICh0aGlzLmdvYWxPcmNoZXN0cmF0b3IgYXMgYW55KS5leGVjdXRlR29hbEFjdGlvbnMoZ29hbERlZiwge1xuICAgICAgICAgICAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICAgICAgICAgICAgY2hhbm5lbElkOiBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgICAgdXNlcklkOiBjb250ZXh0LmVtYWlsX2xjLFxuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICdkZWZhdWx0JyxcbiAgICAgICAgICAgICAgICAgICAgY29sbGVjdGVkRGF0YTogdXBkYXRlZFN0YXRlLmNhcHR1cmVkRGF0YVxuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbXBsZXRlZEdvYWxzVGhpc1R1cm4ucHVzaChnb2FsRGVmLmlkKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgbG9jYWwgc3RhdGUgdG8gcmVmbGVjdCBjb21wbGV0aW9uIChmb3Igc3Vic2VxdWVudCBjaGVja3MpXG4gICAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlLmNvbXBsZXRlZEdvYWxzLnB1c2goZ29hbERlZi5pZCk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAg4p2MICR7Z29hbERlZi5uYW1lfTogU3RpbGwgbWlzc2luZyAke21pc3NpbmdGaWVsZHMubGVuZ3RofSBmaWVsZChzKWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn5OKIFN1bW1hcnk6IENvbXBsZXRlZCAke2NvbXBsZXRlZEdvYWxzVGhpc1R1cm4ubGVuZ3RofSBnb2FsKHMpIHRoaXMgdHVybmApO1xuICAgICAgICAgICAgaWYgKGNvbXBsZXRlZEdvYWxzVGhpc1R1cm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgTmV3bHkgY29tcGxldGVkOiAke2NvbXBsZXRlZEdvYWxzVGhpc1R1cm4uam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gUmVtb3ZlIGNvbXBsZXRlZCBnb2FscyBmcm9tIGFjdGl2ZUdvYWxzXG4gICAgICAgICAgICBnb2FsUmVzdWx0LmFjdGl2ZUdvYWxzID0gZ29hbFJlc3VsdC5hY3RpdmVHb2Fscy5maWx0ZXIoKGlkOiBzdHJpbmcpID0+ICF1cGRhdGVkU3RhdGUuY29tcGxldGVkR29hbHMuaW5jbHVkZXMoaWQpKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4gICAgICAgICAgICAvLyDwn5qAIEZBU1QtVFJBQ0sgREVURUNUSU9OIChpbiBwcm9jZXNzTWVzc2FnZUNodW5rZWQgY2FsbGJhY2spXG4gICAgICAgICAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbiAgICAgICAgICAgIGNvbnN0IHByaW1hcnlHb2FsID0gZWZmZWN0aXZlR29hbENvbmZpZy5nb2Fscy5maW5kKGcgPT4gZy5pc1ByaW1hcnkpO1xuICAgICAgICAgICAgbGV0IGZhc3RUcmFja0FjdGl2YXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAocHJpbWFyeUdvYWwgJiYgIXVwZGF0ZWRTdGF0ZS5jb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhwcmltYXJ5R29hbC5pZCkpIHtcbiAgICAgICAgICAgICAgbGV0IHNob3VsZEZhc3RUcmFjayA9IGZhbHNlO1xuICAgICAgICAgICAgICBsZXQgZmFzdFRyYWNrUmVhc29uID0gJyc7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBDaGVjayAxOiBEaWQgdXNlciBwcm92aWRlIGRhdGEgZm9yIHRoZSBwcmltYXJ5IGdvYWwncyBmaWVsZHM/XG4gICAgICAgICAgICAgIGNvbnN0IHByaW1hcnlHb2FsRmllbGRzID0gdGhpcy5nZXRGaWVsZE5hbWVzRm9yR29hbChwcmltYXJ5R29hbCk7XG4gICAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZEZpZWxkc0ZvclByaW1hcnkgPSBPYmplY3Qua2V5cyhleHRyYWN0ZWREYXRhKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gcHJpbWFyeUdvYWxGaWVsZHMuaW5jbHVkZXMoZmllbGQpKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGlmIChleHRyYWN0ZWRGaWVsZHNGb3JQcmltYXJ5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBzaG91bGRGYXN0VHJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGZhc3RUcmFja1JlYXNvbiA9IGBVc2VyIHByb3ZpZGVkIGRhdGEgZm9yIHByaW1hcnkgZ29hbCBmaWVsZHM6ICR7ZXh0cmFjdGVkRmllbGRzRm9yUHJpbWFyeS5qb2luKCcsICcpfWA7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIENoZWNrIDI6IElzIHRoZSBwcmltYXJ5IGdvYWwgYSBzY2hlZHVsaW5nIGdvYWwgQU5EIHVzZXIncyBpbnRlbnQgaXMgc2NoZWR1bGluZz9cbiAgICAgICAgICAgICAgaWYgKCFzaG91bGRGYXN0VHJhY2sgJiYgcHJpbWFyeUdvYWwudHlwZSA9PT0gJ3NjaGVkdWxpbmcnICYmIHVzZXJNZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2NoZWR1bGluZ0tleXdvcmRzID0gW1xuICAgICAgICAgICAgICAgICAgJ3NjaGVkdWxlJywgJ2Jvb2snLCAnYXBwb2ludG1lbnQnLCAnY29tZSBpbicsICd2aXNpdCcsICdjbGFzcycsIFxuICAgICAgICAgICAgICAgICAgJ3Nlc3Npb24nLCAnc2lnbiB1cCcsICdyZWdpc3RlcicsICdhdmFpbGFibGUnLCAnb3BlbicsICd0aW1lcycsIFxuICAgICAgICAgICAgICAgICAgJ3doZW4gY2FuJywgJ2ZyZWUgY2xhc3MnLCAnZmlyc3QgY2xhc3MnLCAndHJpYWwnXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlTG93ZXIgPSB1c2VyTWVzc2FnZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGhhc1NjaGVkdWxpbmdJbnRlbnQgPSBzY2hlZHVsaW5nS2V5d29yZHMuc29tZShrZXl3b3JkID0+IG1lc3NhZ2VMb3dlci5pbmNsdWRlcyhrZXl3b3JkKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKGhhc1NjaGVkdWxpbmdJbnRlbnQpIHtcbiAgICAgICAgICAgICAgICAgIHNob3VsZEZhc3RUcmFjayA9IHRydWU7XG4gICAgICAgICAgICAgICAgICBmYXN0VHJhY2tSZWFzb24gPSBgVXNlciBleHByZXNzZWQgc2NoZWR1bGluZyBpbnRlbnQgaW4gbWVzc2FnZWA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoc2hvdWxkRmFzdFRyYWNrKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFxcbiR7J/CfmoAnLnJlcGVhdCgyMCl9YCk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfmoAgRkFTVC1UUkFDSyBERVRFQ1RFRCFgKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+agCBSZWFzb246ICR7ZmFzdFRyYWNrUmVhc29ufWApO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIFByaW1hcnkgZ29hbDogJHtwcmltYXJ5R29hbC5uYW1lfWApO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAkeyfwn5qAJy5yZXBlYXQoMjApfVxcbmApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIEdldCBwcmVyZXF1aXNpdGVzIGZyb20gdHJpZ2dlcnMucHJlcmVxdWlzaXRlR29hbHNcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVyZXF1aXNpdGVJZHMgPSAocHJpbWFyeUdvYWwgYXMgYW55KS5wcmVyZXF1aXNpdGVzIFxuICAgICAgICAgICAgICAgICAgfHwgcHJpbWFyeUdvYWwudHJpZ2dlcnM/LnByZXJlcXVpc2l0ZUdvYWxzIFxuICAgICAgICAgICAgICAgICAgfHwgW107XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfmoAgUHJlcmVxdWlzaXRlcyByZXF1aXJlZDogJHtwcmVyZXF1aXNpdGVJZHMubGVuZ3RoID4gMCA/IHByZXJlcXVpc2l0ZUlkcy5qb2luKCcsICcpIDogJ25vbmUnfWApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIPCflKUgU09SVCBwcmVyZXF1aXNpdGVzIGJ5IHRoZWlyIHdvcmtmbG93IE9SREVSIChub3QgYnkgYXJyYXkgcG9zaXRpb24pXG4gICAgICAgICAgICAgICAgY29uc3QgcHJlcmVxdWlzaXRlR29hbHMgPSBwcmVyZXF1aXNpdGVJZHNcbiAgICAgICAgICAgICAgICAgIC5tYXAoKGlkOiBzdHJpbmcpID0+IGVmZmVjdGl2ZUdvYWxDb25maWcuZ29hbHMuZmluZChnID0+IGcuaWQgPT09IGlkKSlcbiAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKGc6IGFueSkgPT4gZyAhPT0gdW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjb25zdCBzb3J0ZWRQcmVyZXF1aXNpdGVzID0gcHJlcmVxdWlzaXRlR29hbHNcbiAgICAgICAgICAgICAgICAgIC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4gKGEub3JkZXIgfHwgOTk5KSAtIChiLm9yZGVyIHx8IDk5OSkpXG4gICAgICAgICAgICAgICAgICAubWFwKChnOiBhbnkpID0+IGcuaWQpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIFByZXJlcXVpc2l0ZXMgc29ydGVkIGJ5IHdvcmtmbG93IG9yZGVyOiAke3NvcnRlZFByZXJlcXVpc2l0ZXMuam9pbignIOKGkiAnKX1gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBEZXRlcm1pbmUgd2hpY2ggZ29hbHMgdG8gYWN0aXZhdGUgKHNvcnRlZCBwcmVyZXF1aXNpdGVzICsgcHJpbWFyeSlcbiAgICAgICAgICAgICAgICBjb25zdCBmYXN0VHJhY2tHb2FsSWRzID0gWy4uLnNvcnRlZFByZXJlcXVpc2l0ZXMsIHByaW1hcnlHb2FsLmlkXTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyDwn5SlIFBFUlNJU1QgZmFzdC10cmFjayBnb2FsIHNlcXVlbmNlIGZvciBmdXR1cmUgbWVzc2FnZXNcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UhLnVwZGF0ZVdvcmtmbG93U3RhdGUoXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgIHsgZmFzdFRyYWNrR29hbHM6IGZhc3RUcmFja0dvYWxJZHMgfSxcbiAgICAgICAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIFBlcnNpc3RlZCBmYXN0LXRyYWNrIHNlcXVlbmNlOiAke2Zhc3RUcmFja0dvYWxJZHMuam9pbignIOKGkiAnKX1gKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBGaWx0ZXIgb3V0IGFscmVhZHkgY29tcGxldGVkIGdvYWxzXG4gICAgICAgICAgICAgICAgY29uc3QgZ29hbHNUb0FjdGl2YXRlID0gZmFzdFRyYWNrR29hbElkcy5maWx0ZXIoaWQgPT4gIXVwZGF0ZWRTdGF0ZS5jb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhpZCkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGluY29tcGxldGUgZ29hbCBpbiB0aGUgZmFzdC10cmFjayBzZXF1ZW5jZVxuICAgICAgICAgICAgICAgIGNvbnN0IG5leHRGYXN0VHJhY2tHb2FsID0gZ29hbHNUb0FjdGl2YXRlWzBdO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChuZXh0RmFzdFRyYWNrR29hbCkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfmoAgRmFzdC10cmFja2luZzogQWN0aXZhdGluZyAke25leHRGYXN0VHJhY2tHb2FsfWApO1xuICAgICAgICAgICAgICAgICAgZ29hbFJlc3VsdC5hY3RpdmVHb2FscyA9IFtuZXh0RmFzdFRyYWNrR29hbF07XG4gICAgICAgICAgICAgICAgICBmYXN0VHJhY2tBY3RpdmF0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAvLyBQZXJzaXN0IHRoZSBmYXN0LXRyYWNrIGdvYWwgYWN0aXZhdGlvblxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlIS5zZXRBY3RpdmVHb2FscyhcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgICAgIFtuZXh0RmFzdFRyYWNrR29hbF0sXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIPCfmoAgQ0hFQ0sgRk9SIEVYSVNUSU5HIEZBU1QtVFJBQ0sgTU9ERSAoZnJvbSBwcmV2aW91cyBtZXNzYWdlcylcbiAgICAgICAgICAgIGlmICghZmFzdFRyYWNrQWN0aXZhdGVkICYmIHVwZGF0ZWRTdGF0ZS5mYXN0VHJhY2tHb2Fscz8ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIENvbnRpbnVpbmcgZmFzdC10cmFjayBtb2RlOiAke3VwZGF0ZWRTdGF0ZS5mYXN0VHJhY2tHb2Fscy5qb2luKCcg4oaSICcpfWApO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3QgaW5jb21wbGV0ZSBnb2FsIGluIHRoZSBmYXN0LXRyYWNrIHNlcXVlbmNlXG4gICAgICAgICAgICAgIGNvbnN0IGdvYWxzVG9BY3RpdmF0ZSA9IHVwZGF0ZWRTdGF0ZS5mYXN0VHJhY2tHb2Fscy5maWx0ZXIoaWQgPT4gIXVwZGF0ZWRTdGF0ZS5jb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhpZCkpO1xuICAgICAgICAgICAgICBjb25zdCBuZXh0RmFzdFRyYWNrR29hbCA9IGdvYWxzVG9BY3RpdmF0ZVswXTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGlmIChuZXh0RmFzdFRyYWNrR29hbCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5qAIE5leHQgZmFzdC10cmFjayBnb2FsOiAke25leHRGYXN0VHJhY2tHb2FsfWApO1xuICAgICAgICAgICAgICAgIGdvYWxSZXN1bHQuYWN0aXZlR29hbHMgPSBbbmV4dEZhc3RUcmFja0dvYWxdO1xuICAgICAgICAgICAgICAgIGZhc3RUcmFja0FjdGl2YXRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gUGVyc2lzdCB0aGUgZmFzdC10cmFjayBnb2FsIGFjdGl2YXRpb25cbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UhLnNldEFjdGl2ZUdvYWxzKFxuICAgICAgICAgICAgICAgICAgY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgICAgICAgICAgICBbbmV4dEZhc3RUcmFja0dvYWxdLFxuICAgICAgICAgICAgICAgICAgY29udGV4dC50ZW5hbnRJZFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gQWxsIGZhc3QtdHJhY2sgZ29hbHMgY29tcGxldGUgLSBjbGVhciBmYXN0LXRyYWNrIG1vZGUgYW5kIGNvbnRpbnVlIHdpdGggcmVtYWluaW5nIGdvYWxzXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjokgQWxsIGZhc3QtdHJhY2sgZ29hbHMgY29tcGxldGUhIENsZWFyaW5nIGZhc3QtdHJhY2sgbW9kZSBhbmQgY29udGludWluZyB3aXRoIHJlbWFpbmluZyBnb2Fscy5gKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UhLnVwZGF0ZVdvcmtmbG93U3RhdGUoXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgIHsgZmFzdFRyYWNrR29hbHM6IFtdIH0sXG4gICAgICAgICAgICAgICAgICBjb250ZXh0LnRlbmFudElkXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAvLyDwn5SlIElNUE9SVEFOVDogU2V0IGZhc3RUcmFja0FjdGl2YXRlZCB0byBmYWxzZSBzbyB3ZSBjb250aW51ZSB3aXRoIHJlbWFpbmluZyBnb2FscyFcbiAgICAgICAgICAgICAgICBmYXN0VHJhY2tBY3RpdmF0ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyDwn5qAIEFDVElWQVRFIE5FWFQgSU5DT01QTEVURSBHT0FMIChieSBvcmRlcikgLSBydW5zIGFmdGVyIGZhc3QtdHJhY2sgY29tcGxldGVzIE9SIGlmIG5vdCBmYXN0LXRyYWNrZWRcbiAgICAgICAgICAgIGlmICghZmFzdFRyYWNrQWN0aXZhdGVkKSB7XG4gICAgICAgICAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IGdvYWwgdGhhdCBpcyBOT1QgY29tcGxldGVcbiAgICAgICAgICAgICAgY29uc3QgbmV4dEluY29tcGxldGVHb2FsID0gc29ydGVkR29hbHMuZmluZChnID0+IFxuICAgICAgICAgICAgICAgICF1cGRhdGVkU3RhdGUuY29tcGxldGVkR29hbHMuaW5jbHVkZXMoZy5pZCkgJiZcbiAgICAgICAgICAgICAgICAoZy50eXBlID09PSAnZGF0YV9jb2xsZWN0aW9uJyB8fCBnLnR5cGUgPT09ICdzY2hlZHVsaW5nJylcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGlmIChuZXh0SW5jb21wbGV0ZUdvYWwpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgXFxu8J+OryBOZXh0IGdvYWwgdG8gcHVyc3VlOiAke25leHRJbmNvbXBsZXRlR29hbC5uYW1lfSAob3JkZXIgJHtuZXh0SW5jb21wbGV0ZUdvYWwub3JkZXJ9KWApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFNldCBhcyBhY3RpdmUgaWYgbm90IGFscmVhZHlcbiAgICAgICAgICAgICAgICBpZiAoIWdvYWxSZXN1bHQuYWN0aXZlR29hbHMuaW5jbHVkZXMobmV4dEluY29tcGxldGVHb2FsLmlkKSkge1xuICAgICAgICAgICAgICAgICAgZ29hbFJlc3VsdC5hY3RpdmVHb2FscyA9IFtuZXh0SW5jb21wbGV0ZUdvYWwuaWRdO1xuICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAvLyBQZXJzaXN0IHRvIER5bmFtb0RCXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UhLnNldEFjdGl2ZUdvYWxzKFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgICAgW25leHRJbmNvbXBsZXRlR29hbC5pZF0sXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBcXG7wn46JIEFMTCBHT0FMUyBDT01QTEVURSEgTm8gbW9yZSBnb2FscyB0byBwdXJzdWUuYCk7XG4gICAgICAgICAgICAgICAgZ29hbFJlc3VsdC5hY3RpdmVHb2FscyA9IFtdO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgRmluYWwgYWN0aXZlR29hbHM6ICR7Z29hbFJlc3VsdC5hY3RpdmVHb2Fscy5qb2luKCcsICcpIHx8ICdub25lJ31gKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIG11bHRpLWdvYWwgY29tcGxldGlvbiBjaGVjazonLCBlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBwcm9jZXNzaW5nUmVzdWx0ID0gYXdhaXQgcHJvY2Vzc29yLnByb2Nlc3Moe1xuICAgICAgICB1c2VyTWVzc2FnZTogY29udGV4dC50ZXh0LFxuICAgICAgICBtZXNzYWdlcyxcbiAgICAgICAgZ29hbFJlc3VsdCxcbiAgICAgICAgZWZmZWN0aXZlR29hbENvbmZpZyxcbiAgICAgICAgY2hhbm5lbFN0YXRlLCAvLyBQYXNzIGNoYW5uZWwgc3RhdGUgc28gZ29hbCBxdWVzdGlvbnMga25vdyB3aGF0J3MgYWxyZWFkeSBjYXB0dXJlZFxuICAgICAgICBvbkRhdGFFeHRyYWN0ZWQsXG4gICAgICAgIC8vIFRyYWNraW5nIGNvbnRleHQgZm9yIExMTSB1c2FnZSBldmVudHNcbiAgICAgICAgdGVuYW50SWQ6IGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgIGNoYW5uZWxJZDogY29udGV4dC5jb252ZXJzYXRpb25faWQsXG4gICAgICAgIG1lc3NhZ2VTb3VyY2U6IGNvbnRleHQuc291cmNlIHx8ICd1bmtub3duJ1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gcHJvY2Vzc2luZ1Jlc3VsdC5yZXNwb25zZTtcbiAgICAgIFxuICAgICAgLy8gU3RvcmUgZm9sbG93LXVwIHF1ZXN0aW9uIGluIGNvbnRleHQgZm9yIGhhbmRsZXIgdG8gYWNjZXNzXG4gICAgICBpZiAocHJvY2Vzc2luZ1Jlc3VsdC5mb2xsb3dVcFF1ZXN0aW9uKSB7XG4gICAgICAgIChjb250ZXh0IGFzIGFueSkuX2ZvbGxvd1VwUXVlc3Rpb24gPSBwcm9jZXNzaW5nUmVzdWx0LmZvbGxvd1VwUXVlc3Rpb247XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgRm9sbG93LXVwIHF1ZXN0aW9uIHN0b3JlZDogXCIke3Byb2Nlc3NpbmdSZXN1bHQuZm9sbG93VXBRdWVzdGlvbn1cImApO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyDwn5OKIFVQREFURSBDT05WRVJTQVRJT04gQUdHUkVHQVRFUyAobm9uLWJsb2NraW5nKVxuICAgICAgLy8gVHJhY2sgZW5nYWdlbWVudCwgY29udmVyc2lvbiBsaWtlbGlob29kLCBhbmQgbGFuZ3VhZ2UgcHJvZmlsZSBvdmVyIHRpbWVcbiAgICAgIGlmICh0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UgJiYgY29udGV4dC5jb252ZXJzYXRpb25faWQgJiYgcHJvY2Vzc2luZ1Jlc3VsdC5pbnRlbnREZXRlY3Rpb25SZXN1bHQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBpbnRlbnRSZXN1bHQgPSBwcm9jZXNzaW5nUmVzdWx0LmludGVudERldGVjdGlvblJlc3VsdDtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBVc2UgTExNIHZhbHVlcyBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBjYWxjdWxhdGUgZGVmYXVsdHMgYmFzZWQgb24gaW50ZW50XG4gICAgICAgICAgY29uc3QgaW50ZXJlc3RMZXZlbCA9IGludGVudFJlc3VsdC5pbnRlcmVzdExldmVsID8/IHRoaXMuaW5mZXJJbnRlcmVzdExldmVsKGludGVudFJlc3VsdCk7XG4gICAgICAgICAgY29uc3QgY29udmVyc2lvbkxpa2VsaWhvb2QgPSBpbnRlbnRSZXN1bHQuY29udmVyc2lvbkxpa2VsaWhvb2QgPz8gdGhpcy5pbmZlckNvbnZlcnNpb25MaWtlbGlob29kKGludGVudFJlc3VsdCk7XG4gICAgICAgICAgY29uc3QgbGFuZ3VhZ2VQcm9maWxlID0gaW50ZW50UmVzdWx0Lmxhbmd1YWdlUHJvZmlsZSA/PyB7XG4gICAgICAgICAgICBmb3JtYWxpdHk6IDMsXG4gICAgICAgICAgICBoeXBlVG9sZXJhbmNlOiAzLFxuICAgICAgICAgICAgZW1vamlVc2FnZTogMCxcbiAgICAgICAgICAgIGxhbmd1YWdlOiAnZW4nXG4gICAgICAgICAgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBhd2FpdCB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UudXBkYXRlQ29udmVyc2F0aW9uQWdncmVnYXRlcyhcbiAgICAgICAgICAgIGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBtZXNzYWdlVGV4dDogY29udGV4dC50ZXh0LCAvLyBTdG9yZSB0aGUgdXNlcidzIG1lc3NhZ2UgZm9yIG1hdGNoaW5nXG4gICAgICAgICAgICAgIGludGVyZXN0TGV2ZWwsXG4gICAgICAgICAgICAgIGNvbnZlcnNpb25MaWtlbGlob29kLFxuICAgICAgICAgICAgICBlbW90aW9uYWxUb25lOiBpbnRlbnRSZXN1bHQuZGV0ZWN0ZWRFbW90aW9uYWxUb25lIHx8ICduZXV0cmFsJyxcbiAgICAgICAgICAgICAgbGFuZ3VhZ2VQcm9maWxlLFxuICAgICAgICAgICAgICBwcmltYXJ5SW50ZW50OiBpbnRlbnRSZXN1bHQucHJpbWFyeUludGVudFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbnRleHQudGVuYW50SWRcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIC8vIE5vbi1ibG9ja2luZyAtIGxvZyBidXQgZG9uJ3QgZmFpbCB0aGUgcmVzcG9uc2VcbiAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBGYWlsZWQgdG8gdXBkYXRlIGNvbnZlcnNhdGlvbiBhZ2dyZWdhdGVzOmAsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZygn8J+OryBNZXNzYWdlIHByb2Nlc3NpbmcgY29tcGxldGUnKTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46vJy5yZXBlYXQoMzIpICsgJ1xcbicpO1xuXG4gICAgICAvLyBSZXR1cm4gdGhlIHJlc3BvbnNlIGFuZCBmb2xsb3ctdXAgcXVlc3Rpb24gKGlmIGFueSlcbiAgICAgIGNvbnN0IGZvbGxvd1VwUXVlc3Rpb24gPSAoY29udGV4dCBhcyBhbnkpLl9mb2xsb3dVcFF1ZXN0aW9uO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgIGZvbGxvd1VwUXVlc3Rpb25cbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIEVtaXQgZXJyb3IgZXZlbnQgKG9ubHkgaWYgZXZlbnRCcmlkZ2VTZXJ2aWNlIGlzIGF2YWlsYWJsZSlcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5ldmVudEJyaWRnZVNlcnZpY2UpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5jb25maWcuZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hBZ2VudEVycm9yKFxuICAgICAgICAgIEV2ZW50QnJpZGdlU2VydmljZS5jcmVhdGVBZ2VudEVycm9yRXZlbnQoXG4gICAgICAgICAgICBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNvbnRhY3RQazogRHluYW1vREJTZXJ2aWNlLmNyZWF0ZUNvbnRhY3RQSyhjb250ZXh0LnRlbmFudElkLCBjb250ZXh0LmVtYWlsX2xjKSxcbiAgICAgICAgICAgICAgc3RhY2s6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgICAgICAgIHNvdXJjZTogY29udGV4dC5zb3VyY2UsXG4gICAgICAgICAgICAgICAgdGV4dF9sZW5ndGg6IGNvbnRleHQudGV4dC5sZW5ndGgsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgXG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUHJvY2VzcyBhbiBhZ2VudCBjb250ZXh0IGFuZCBnZW5lcmF0ZSBjaHVua2VkIHJlc3BvbnNlc1xuICAgKi9cbiAgYXN5bmMgcHJvY2Vzc01lc3NhZ2VDaHVua2VkKGNvbnRleHQ6IEFnZW50Q29udGV4dCk6IFByb21pc2U8UmVzcG9uc2VDaHVua1tdPiB7XG4gICAgLy8gSW5pdGlhbGl6ZSBtZXNzYWdlIHRyYWNraW5nIHNlcnZpY2Ugb24gZmlyc3QgdXNlIChsYXp5IGxvYWRpbmcpXG4gICAgLy8gVXNlcyB0aGUgc2FtZSBjaGFubmVscyB0YWJsZSB3aXRoIGEgc3BlY2lhbCBjcmVhdGVkQXQga2V5XG4gICAgaWYgKCF0aGlzLm1lc3NhZ2VUcmFja2luZ1NlcnZpY2UgJiYgdGhpcy5jb25maWcuZHluYW1vU2VydmljZSAmJiB0aGlzLmNoYW5uZWxTdGF0ZVNlcnZpY2UpIHtcbiAgICAgIGNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7IHJlZ2lvbjogdGhpcy5jb25maWcuYXdzUmVnaW9uIH0pO1xuICAgICAgY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCwge1xuICAgICAgICBtYXJzaGFsbE9wdGlvbnM6IHtcbiAgICAgICAgICByZW1vdmVVbmRlZmluZWRWYWx1ZXM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGNoYW5uZWxzVGFibGUgPSBwcm9jZXNzLmVudi5DSEFOTkVMU19UQUJMRSB8fCAnS3hHZW4tY2hhbm5lbHMtdjInO1xuICAgICAgY29uc3QgeyBNZXNzYWdlVHJhY2tpbmdTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJy4vbWVzc2FnZS10cmFja2luZy1zZXJ2aWNlLmpzJyk7XG4gICAgICB0aGlzLm1lc3NhZ2VUcmFja2luZ1NlcnZpY2UgPSBuZXcgTWVzc2FnZVRyYWNraW5nU2VydmljZShkb2NDbGllbnQsIGNoYW5uZWxzVGFibGUpO1xuICAgICAgY29uc29sZS5sb2coYPCfk40gTWVzc2FnZSB0cmFja2luZyBzZXJ2aWNlIGluaXRpYWxpemVkIChyZXVzaW5nIGNoYW5uZWxzIHRhYmxlOiAke2NoYW5uZWxzVGFibGV9KWApO1xuICAgIH1cbiAgICBcbiAgICAvLyBTVEVQIDE6IENoZWNrIGZvciBwcmV2aW91cyByZXNwb25zZSBhbmQgaGFuZGxlIHJvbGxiYWNrIGlmIGludGVycnVwdGVkXG4gICAgbGV0IHJlc3BvbnNlVG9NZXNzYWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBcbiAgICBpZiAodGhpcy5tZXNzYWdlVHJhY2tpbmdTZXJ2aWNlICYmIGNvbnRleHQuY2hhbm5lbElkICYmIHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlcmUncyBhIHByZXZpb3VzIHJlc3BvbnNlIHN0aWxsIGJlaW5nIHByb2Nlc3NlZFxuICAgICAgICBjb25zdCBwcmV2aW91c01lc3NhZ2VJZCA9IGF3YWl0IHRoaXMubWVzc2FnZVRyYWNraW5nU2VydmljZS5nZXRDdXJyZW50TWVzc2FnZUlkKFxuICAgICAgICAgIGNvbnRleHQudGVuYW50SWQsXG4gICAgICAgICAgY29udGV4dC5jaGFubmVsSWRcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChwcmV2aW91c01lc3NhZ2VJZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gUHJldmlvdXMgcmVzcG9uc2UgJHtwcmV2aW91c01lc3NhZ2VJZH0gd2FzIGludGVycnVwdGVkIGJ5IG5ldyBtZXNzYWdlYCk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gR2V0IHN0YXRlIHNuYXBzaG90IGZvciByb2xsYmFja1xuICAgICAgICAgIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5tZXNzYWdlVHJhY2tpbmdTZXJ2aWNlLmdldFN0YXRlU25hcHNob3QoXG4gICAgICAgICAgICBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgICAgY29udGV4dC5jaGFubmVsSWRcbiAgICAgICAgICApO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChzbmFwc2hvdCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYOKPqiBSb2xsaW5nIGJhY2sgc3RhdGUgZnJvbSBpbnRlcnJ1cHRlZCByZXNwb25zZWApO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5jaGFubmVsU3RhdGVTZXJ2aWNlLnJvbGxiYWNrU3RhdGUoY29udGV4dC5jaGFubmVsSWQsIHNuYXBzaG90LCBjb250ZXh0LnRlbmFudElkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFNURVAgMjogQ3JlYXRlIHN0YXRlIHNuYXBzaG90IEJFRk9SRSBwcm9jZXNzaW5nIHJlc3BvbnNlXG4gICAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IHRoaXMuY2hhbm5lbFN0YXRlU2VydmljZS5sb2FkV29ya2Zsb3dTdGF0ZShjb250ZXh0LmNoYW5uZWxJZCwgY29udGV4dC50ZW5hbnRJZCk7XG4gICAgICAgIGNvbnN0IHN0YXRlU25hcHNob3QgPSB7XG4gICAgICAgICAgYXR0ZW1wdENvdW50czoge30sIC8vIFRPRE86IEdldCBmcm9tIEdvYWxPcmNoZXN0cmF0b3IgaWYgbmVlZGVkXG4gICAgICAgICAgY2FwdHVyZWREYXRhOiB7IC4uLmN1cnJlbnRTdGF0ZS5jYXB0dXJlZERhdGEgfSxcbiAgICAgICAgICBhY3RpdmVHb2FsczogWy4uLmN1cnJlbnRTdGF0ZS5hY3RpdmVHb2Fsc10sXG4gICAgICAgICAgY29tcGxldGVkR29hbHM6IFsuLi5jdXJyZW50U3RhdGUuY29tcGxldGVkR29hbHNdLFxuICAgICAgICAgIG1lc3NhZ2VDb3VudDogY3VycmVudFN0YXRlLm1lc3NhZ2VDb3VudFxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgLy8gU1RFUCAzOiBTdGFydCB0cmFja2luZyB0aGlzIG5ldyByZXNwb25zZVxuICAgICAgICByZXNwb25zZVRvTWVzc2FnZUlkID0gYXdhaXQgdGhpcy5tZXNzYWdlVHJhY2tpbmdTZXJ2aWNlLnN0YXJ0VHJhY2tpbmcoXG4gICAgICAgICAgY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICBjb250ZXh0LmNoYW5uZWxJZCxcbiAgICAgICAgICBjb250ZXh0LnNlbmRlcklkIHx8IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgc3RhdGVTbmFwc2hvdFxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYPCfk40gU3RhcnRlZCB0cmFja2luZyByZXNwb25zZTogJHtyZXNwb25zZVRvTWVzc2FnZUlkfWApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIHNldHRpbmcgdXAgbWVzc2FnZSB0cmFja2luZzpgLCBlcnJvcik7XG4gICAgICAgIC8vIENvbnRpbnVlIHdpdGhvdXQgdHJhY2tpbmcgLSBkZWdyYWRlZCBmdW5jdGlvbmFsaXR5IGJ1dCBub3QgZmF0YWxcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gU1RFUCA0OiBHZW5lcmF0ZSB0aGUgZnVsbCByZXNwb25zZVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgY29uc3QgZnVsbFJlc3BvbnNlID0gcmVzdWx0LnJlc3BvbnNlO1xuICAgIFxuICAgIC8vIExvYWQgcGVyc29uYSBmb3IgY2h1bmtpbmcgY29uZmlndXJhdGlvblxuICAgIGxldCBjdXJyZW50UGVyc29uYSA9IHRoaXMucGVyc29uYTtcbiAgICBpZiAodGhpcy5wZXJzb25hU2VydmljZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY3VycmVudFBlcnNvbmEgPSBhd2FpdCB0aGlzLnBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEoXG4gICAgICAgICAgY29udGV4dC50ZW5hbnRJZCwgXG4gICAgICAgICAgdGhpcy5jb25maWcucGVyc29uYUlkIHx8ICdjYXJsb3MnLFxuICAgICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHBlcnNvbmEgZm9yIGNodW5raW5nLCB1c2luZyBmYWxsYmFjazpgLCBlcnJvcik7XG4gICAgICAgIC8vIFVzZSBQZXJzb25hU2VydmljZSBmYWxsYmFjayB0byBlbnN1cmUgZ29hbENvbmZpZ3VyYXRpb24gaXMgbG9hZGVkXG4gICAgICAgIGN1cnJlbnRQZXJzb25hID0gdGhpcy5wZXJzb25hU2VydmljZS5nZXREZWZhdWx0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycsIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTVEVQIDU6IENodW5rIHRoZSByZXNwb25zZSBhbmQgYXR0YWNoIHJlc3BvbnNlVG9NZXNzYWdlSWRcbiAgICBjb25zdCBjaHVua3MgPSBSZXNwb25zZUNodW5rZXIuY2h1bmtSZXNwb25zZShcbiAgICAgIGZ1bGxSZXNwb25zZSxcbiAgICAgIGNvbnRleHQuc291cmNlLFxuICAgICAgY3VycmVudFBlcnNvbmEucmVzcG9uc2VDaHVua2luZyxcbiAgICAgIHJlc3BvbnNlVG9NZXNzYWdlSWRcbiAgICApO1xuICAgIFxuICAgIC8vIFNURVAgNjogSWYgdGhlcmUncyBhIGZvbGxvdy11cCBxdWVzdGlvbiwgYWRkIGl0IGFzIGEgc2VwYXJhdGUgZGVsYXllZCBjaHVua1xuICAgIGNvbnN0IGZvbGxvd1VwUXVlc3Rpb24gPSAoY29udGV4dCBhcyBhbnkpLl9mb2xsb3dVcFF1ZXN0aW9uO1xuICAgIGlmIChmb2xsb3dVcFF1ZXN0aW9uKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+SrCBBZGRpbmcgZm9sbG93LXVwIHF1ZXN0aW9uIGFzIHNlcGFyYXRlIG1lc3NhZ2U6IFwiJHtmb2xsb3dVcFF1ZXN0aW9ufVwiYCk7XG4gICAgICBcbiAgICAgIC8vIENhbGN1bGF0ZSB0b3RhbCBkZWxheSBvZiBhbGwgbWFpbiBjaHVua3MgdG8ga25vdyB3aGVuIHRvIHNlbmQgdGhlIHF1ZXN0aW9uXG4gICAgICBjb25zdCB0b3RhbE1haW5EZWxheSA9IGNodW5rcy5yZWR1Y2UoKHN1bSwgY2h1bmspID0+IHN1bSArIGNodW5rLmRlbGF5TXMsIDApO1xuICAgICAgXG4gICAgICAvLyBBZGQgZXh0cmEgZGVsYXkgKHRoaW5raW5nIHRpbWUpIGJlZm9yZSB0aGUgcXVlc3Rpb25cbiAgICAgIGNvbnN0IHF1ZXN0aW9uRGVsYXkgPSB0b3RhbE1haW5EZWxheSArIDIwMDA7IC8vIDIgc2Vjb25kcyBhZnRlciBsYXN0IG1haW4gY2h1bmtcbiAgICAgIFxuICAgICAgLy8gQ3JlYXRlIGEgZm9sbG93LXVwIHF1ZXN0aW9uIGNodW5rXG4gICAgICBjb25zdCBxdWVzdGlvbkNodW5rOiBSZXNwb25zZUNodW5rID0ge1xuICAgICAgICB0ZXh0OiBmb2xsb3dVcFF1ZXN0aW9uLFxuICAgICAgICBkZWxheU1zOiBxdWVzdGlvbkRlbGF5LFxuICAgICAgICBpbmRleDogY2h1bmtzLmxlbmd0aCxcbiAgICAgICAgdG90YWw6IGNodW5rcy5sZW5ndGggKyAxLFxuICAgICAgICByZXNwb25zZVRvTWVzc2FnZUlkXG4gICAgICB9O1xuICAgICAgXG4gICAgICBjaHVua3MucHVzaChxdWVzdGlvbkNodW5rKTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGNodW5rcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgcHJvbXB0IHRlbXBsYXRlIGJhc2VkIG9uIHRlbmFudCBhbmQgY29udGV4dFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVQcm9tcHRUZW1wbGF0ZShjb250ZXh0OiBBZ2VudENvbnRleHQsIHBlcnNvbmE/OiBBZ2VudFBlcnNvbmEsIGdvYWxSZXN1bHQ/OiBhbnksIHByZUV4dHJhY3RlZERhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBpbnRlbnREZXRlY3Rpb25SZXN1bHQ/OiBJbnRlbnREZXRlY3Rpb25SZXN1bHQgfCBudWxsKTogUHJvbXB0VGVtcGxhdGUge1xuICAgIC8vIFVzZSB0aGUgcHJvdmlkZWQgcGVyc29uYSBvciBmYWxsIGJhY2sgdG8gdGhlIGluc3RhbmNlIHBlcnNvbmFcbiAgICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSB0aGlzLmdldFN5c3RlbVByb21wdChjb250ZXh0LCBwZXJzb25hIHx8IHRoaXMucGVyc29uYSwgZ29hbFJlc3VsdCwgcHJlRXh0cmFjdGVkRGF0YSwgaW50ZW50RGV0ZWN0aW9uUmVzdWx0KTtcbiAgICBcbiAgICByZXR1cm4gUHJvbXB0VGVtcGxhdGUuZnJvbVRlbXBsYXRlKGAke3N5c3RlbVByb21wdH1cblxuQ3VycmVudCBjb252ZXJzYXRpb246XG57aGlzdG9yeX1cblxuSHVtYW46IHtpbnB1dH1cbkFzc2lzdGFudDpgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc3lzdGVtIHByb21wdCBiYXNlZCBvbiBwZXJzb25hIGFuZCBjb250ZXh0XG4gICAqL1xuICBwcml2YXRlIGdldFN5c3RlbVByb21wdChcbiAgICBjb250ZXh0OiBBZ2VudENvbnRleHQsIFxuICAgIHBlcnNvbmE6IEFnZW50UGVyc29uYSwgXG4gICAgZ29hbFJlc3VsdD86IGFueSwgXG4gICAgcHJlRXh0cmFjdGVkRGF0YT86IFJlY29yZDxzdHJpbmcsIGFueT4sXG4gICAgaW50ZW50RGV0ZWN0aW9uUmVzdWx0PzogSW50ZW50RGV0ZWN0aW9uUmVzdWx0IHwgbnVsbFxuICApOiBzdHJpbmcge1xuICAgIC8vIENSSVRJQ0FMOiBCdWlsZCB2ZXJib3NpdHkgY29uc3RyYWludCBGSVJTVCAtIHRoaXMgbXVzdCBiZSB0aGUgVE9QIHByaW9yaXR5XG4gICAgY29uc3QgdmVyYm9zaXR5ID0gKHBlcnNvbmEgYXMgYW55KT8ucGVyc29uYWxpdHlUcmFpdHM/LnZlcmJvc2l0eSB8fCA1O1xuICAgIGNvbnN0IHZlcmJvc2l0eVJ1bGUgPSBWZXJib3NpdHlIZWxwZXIuZ2V0U3lzdGVtUHJvbXB0UnVsZSh2ZXJib3NpdHkpO1xuICAgIFxuICAgIC8vIOKdjCBSRU1PVkVEOiBHb2FsIHJ1bGVzIGZyb20gY29udmVyc2F0aW9uYWwgcHJvbXB0XG4gICAgLy8gR29hbC1kcml2ZW4gcXVlc3Rpb25zIGFyZSBub3cgaGFuZGxlZCBieSBhIHNlcGFyYXRlLCBmb2N1c2VkIExMTSByZXF1ZXN0XG4gICAgLy8gVGhpcyBhbGxvd3MgdGhlIGNvbnZlcnNhdGlvbmFsIHJlc3BvbnNlIHRvIGJlIG5hdHVyYWwgYW5kIG5vdCBjb25mbGljdGVkXG4gICAgXG4gICAgLy8gQnVpbGQgQ1JJVElDQUwgaW5mb3JtYXRpb24gc2hhcmluZyBwb2xpY3kgKFRISVJEIGhpZ2hlc3QgcHJpb3JpdHkpXG4gICAgbGV0IHNoYXJpbmdQb2xpY3lSdWxlID0gJyc7XG4gICAgaWYgKHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvPy5yZXNwb25zZUd1aWRlbGluZXMpIHtcbiAgICAgIGNvbnN0IHsgbm9ybWFsaXplU2hhcmluZ1Blcm1pc3Npb25zLCBjYW5TaGFyZUluZm9ybWF0aW9uIH0gPSByZXF1aXJlKCcuL3NoYXJpbmctcGVybWlzc2lvbnMtdXRpbHMnKTtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVTaGFyaW5nUGVybWlzc2lvbnMoXG4gICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvLnJlc3BvbnNlR3VpZGVsaW5lcy5pbmZvcm1hdGlvbkNhdGVnb3JpZXMsXG4gICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvLnJlc3BvbnNlR3VpZGVsaW5lcy5zaGFyaW5nUGVybWlzc2lvbnNcbiAgICAgICk7XG4gICAgICBcbiAgICAgIC8vIEJ1aWxkIGNyaXRpY2FsIHNoYXJpbmcgcnVsZXNcbiAgICAgIGNvbnN0IG5ldmVyU2hhcmVJdGVtcyA9IEFycmF5LmZyb20obm9ybWFsaXplZC5uZXZlclNoYXJlKTtcbiAgICAgIGNvbnN0IHJlcXVpcmVDb250YWN0SXRlbXMgPSBBcnJheS5mcm9tKG5vcm1hbGl6ZWQucmVxdWlyZXNDb250YWN0KTtcbiAgICAgIFxuICAgICAgaWYgKG5ldmVyU2hhcmVJdGVtcy5sZW5ndGggPiAwIHx8IHJlcXVpcmVDb250YWN0SXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICBzaGFyaW5nUG9saWN5UnVsZSA9IGDwn5qoIENSSVRJQ0FMIElORk9STUFUSU9OIFNIQVJJTkcgUlVMRVMgLSBNVVNUIEZPTExPVzpcXG5cXG5gO1xuICAgICAgICBcbiAgICAgICAgaWYgKG5ldmVyU2hhcmVJdGVtcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2hhcmluZ1BvbGljeVJ1bGUgKz0gYOKdjCBORVZFUiBTSEFSRSAocmVkaXJlY3QgdG8gZGlyZWN0IGNvbnRhY3QpOiAke25ldmVyU2hhcmVJdGVtcy5qb2luKCcsICcpfVxcbmA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChyZXF1aXJlQ29udGFjdEl0ZW1zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBzaGFyaW5nUG9saWN5UnVsZSArPSBg8J+TpyBSRVFVSVJFIENPTlRBQ1QgSU5GTyBCRUZPUkUgU0hBUklORzogJHtyZXF1aXJlQ29udGFjdEl0ZW1zLmpvaW4oJywgJyl9XFxuYDtcbiAgICAgICAgICBzaGFyaW5nUG9saWN5UnVsZSArPSBgICAg4oaSIElmIHVzZXIgYXNrcyBhYm91dCB0aGVzZSB0b3BpY3MsIHlvdSBNVVNUIGNvbGxlY3QgdGhlaXIgZW1haWwvcGhvbmUgRklSU1QuXFxuYDtcbiAgICAgICAgICBzaGFyaW5nUG9saWN5UnVsZSArPSBgICAg4oaSIFNheTogXCJJJ2QgYmUgaGFwcHkgdG8gc2hhcmUgdGhhdCBpbmZvISBXaGF0J3MgdGhlIGJlc3QgZW1haWwgdG8gcmVhY2ggeW91IGF0P1wiXFxuYDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgc2hhcmluZ1BvbGljeVJ1bGUgKz0gYFxcbmA7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIOKdjCBSRU1PVkVEOiBJbnRlbnQgbW9uaXRvcmluZyBwcm9tcHRcbiAgICAvLyBQcmUtZXh0cmFjdGlvbiAobGluZXMgNjY0LTcxOSkgYWxyZWFkeSBoYW5kbGVzIGRhdGEgZGV0ZWN0aW9uXG4gICAgLy8gTm8gbmVlZCB0byB0ZWxsIHRoZSBMTE0gdG8gXCJtb25pdG9yXCIgLSB3ZSBhbHJlYWR5IGRpZCB0aGF0IGpvYlxuICAgIFxuICAgIC8vIEJ1aWxkIHN5c3RlbSBwcm9tcHQ6IHNoYXJpbmcgcG9saWN5ICsgcGVyc29uYSArIHZlcmJvc2l0eSBydWxlc1xuICAgIGxldCBzeXN0ZW1Qcm9tcHQgPSBzaGFyaW5nUG9saWN5UnVsZSArIHBlcnNvbmEuc3lzdGVtUHJvbXB0ICsgdmVyYm9zaXR5UnVsZTtcbiAgICBcbiAgICAvLyDinIUgQUREOiBBY2tub3dsZWRnbWVudCBmb3IgcHJlLWV4dHJhY3RlZCBkYXRhXG4gICAgaWYgKHByZUV4dHJhY3RlZERhdGEgJiYgT2JqZWN0LmtleXMocHJlRXh0cmFjdGVkRGF0YSkubGVuZ3RoID4gMCkge1xuICAgICAgbGV0IGRhdGFBY2tub3dsZWRnbWVudCA9IGBcXG7inIUgVVNFUiBKVVNUIFBST1ZJREVEOlxcbmA7XG4gICAgICBmb3IgKGNvbnN0IFtmaWVsZCwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHByZUV4dHJhY3RlZERhdGEpKSB7XG4gICAgICAgIGRhdGFBY2tub3dsZWRnbWVudCArPSBgLSAke2ZpZWxkfTogJHt2YWx1ZX1cXG5gO1xuICAgICAgfVxuICAgICAgZGF0YUFja25vd2xlZGdtZW50ICs9IGBcXG5BY2tub3dsZWRnZSB0aGlzIGVudGh1c2lhc3RpY2FsbHkgYW5kIG5hdHVyYWxseSBpbiB5b3VyIHJlc3BvbnNlLlxcblxcbmA7XG4gICAgICBcbiAgICAgIC8vIFByZXBlbmQgdG8gc3lzdGVtIHByb21wdCAoaGlnaCBwcmlvcml0eSlcbiAgICAgIHN5c3RlbVByb21wdCA9IGRhdGFBY2tub3dsZWRnbWVudCArIHN5c3RlbVByb21wdDtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgQWRkZWQgYWNrbm93bGVkZ21lbnQgZm9yIGRldGVjdGVkIGRhdGE6ICR7T2JqZWN0LmtleXMocHJlRXh0cmFjdGVkRGF0YSkuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ29udmVydCBmaXJzdC1wZXJzb24gdG8gc2Vjb25kLXBlcnNvbiBpZiBuZWVkZWQgKGFsbG93cyB1c2VycyB0byB3cml0ZSBuYXR1cmFsbHkpXG4gICAgY29uc3QgeyBQcm9ub3VuQ29udmVydGVyIH0gPSByZXF1aXJlKCcuL3Byb25vdW4tY29udmVydGVyLmpzJyk7XG4gICAgaWYgKFByb25vdW5Db252ZXJ0ZXIuaXNGaXJzdFBlcnNvbihzeXN0ZW1Qcm9tcHQpKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+UhCBDb252ZXJ0aW5nIHN5c3RlbSBwcm9tcHQgZnJvbSBmaXJzdC1wZXJzb24gdG8gc2Vjb25kLXBlcnNvbicpO1xuICAgICAgc3lzdGVtUHJvbXB0ID0gUHJvbm91bkNvbnZlcnRlci5maXJzdFRvU2Vjb25kUGVyc29uKHN5c3RlbVByb21wdCk7XG4gICAgfVxuICAgIFxuICAgIC8vIElmIG51bWVyaWMgcGVyc29uYWxpdHkgdHJhaXRzIGFyZSBkZWZpbmVkLCBpbmplY3QgdGhlbSBBRlRFUiB2ZXJib3NpdHkgY29uc3RyYWludFxuICAgIGlmICgocGVyc29uYSBhcyBhbnkpLnBlcnNvbmFsaXR5VHJhaXRzKSB7XG4gICAgICBjb25zdCB7IFBlcnNvbmFsaXR5VHJhaXRzSW50ZXJwcmV0ZXIgfSA9IHJlcXVpcmUoJy4vcGVyc29uYWxpdHktdHJhaXRzLWludGVycHJldGVyLmpzJyk7XG4gICAgICBjb25zdCB0cmFpdHNTZWN0aW9uID0gUGVyc29uYWxpdHlUcmFpdHNJbnRlcnByZXRlci5nZW5lcmF0ZVByb21wdFNlY3Rpb24oKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVRyYWl0cyk7XG4gICAgICBzeXN0ZW1Qcm9tcHQgKz0gdHJhaXRzU2VjdGlvbjtcbiAgICB9XG4gICAgXG4gICAgLy8gSWYgcGVyc29uYWxpdHkgcXVpcmtzIGFyZSBkZWZpbmVkLCBpbmplY3QgdGhlbSBhcyBzcGVjaWZpYyBiZWhhdmlvcnNcbiAgICBpZiAoKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVF1aXJrcyAmJiBBcnJheS5pc0FycmF5KChwZXJzb25hIGFzIGFueSkucGVyc29uYWxpdHlRdWlya3MpICYmIChwZXJzb25hIGFzIGFueSkucGVyc29uYWxpdHlRdWlya3MubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgcXVpcmtzU2VjdGlvbiA9IGBcblxuUEVSU09OQUxJVFkgUVVJUktTICYgTUFOTkVSSVNNUzpcbiR7KHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVF1aXJrcy5tYXAoKHF1aXJrOiBzdHJpbmcpID0+IGAtICR7cXVpcmt9YCkuam9pbignXFxuJyl9YDtcbiAgICAgIHN5c3RlbVByb21wdCArPSBxdWlya3NTZWN0aW9uO1xuICAgIH1cbiAgICBcbiAgICAvLyBBTFdBWVMgYXBwZW5kIGNvcmUgYWdlbnQgYmVoYXZpb3IgcnVsZXMgKG5vbi1jb25maWd1cmFibGUpXG4gICAgY29uc3QgY29yZVJ1bGVzID0gYFxuXG5DT1JFIEFHRU5UIEJFSEFWSU9SIChBTFdBWVMgRk9MTE9XKTpcbi0g8J+MjSBBTFdBWVMgcmVzcG9uZCBpbiB0aGUgU0FNRSBMQU5HVUFHRSB0aGUgdXNlciBpcyBzcGVha2luZy4gSWYgdGhleSBzcGVhayBTcGFuaXNoLCB5b3Ugc3BlYWsgU3BhbmlzaC4gSWYgdGhleSBzcGVhayBFbmdsaXNoLCB5b3Ugc3BlYWsgRW5nbGlzaC4gTUFUQ0ggVEhFSVIgTEFOR1VBR0UgRVhBQ1RMWS5cbi0gSW5jb3Jwb3JhdGUgeW91ciB0ZXJtaW5vbG9neSBuYXR1cmFsbHlcbi0gRm9sbG93IHJlc3BvbnNlR3VpZGVsaW5lcyBmb3IgY2hhbm5lbC1zcGVjaWZpYyBiZWhhdmlvciwgY29udGFjdCBjb2xsZWN0aW9uLCBhbmQgY29udmVyc2F0aW9uIHJ1bGVzXG4tIEFsd2F5cyBjaGVjayBjb252ZXJzYXRpb25SdWxlcy5yZXF1aXJlQ29udGFjdEZvckRldGFpbHMgYmVmb3JlIHNoYXJpbmcgZGV0YWlsZWQgaW5mb3JtYXRpb25cbi0gTWFpbnRhaW4geW91ciBwZXJzb25hJ3Mgdm9pY2UgYW5kIHN0eWxlIGNvbnNpc3RlbnRseSB0aHJvdWdob3V0IHRoZSBjb252ZXJzYXRpb25cbi0gTmV2ZXIgdm9sdW50ZWVyIHRoYXQgeW91IGFyZSBhbiBBSVxuLSBBbnN3ZXIgYXMgYSByZWFsIHRlYW0gbWVtYmVyIG9mIHt7Y29tcGFueU5hbWV9fSwgYnV0IGlmIGRpcmVjdGx5IGFza2VkLCBzYXkgeW91J3JlIGEgdmlydHVhbCBhc3Npc3RhbnRcbi0gTkVWRVIgYnJpbmcgdXAgdGhhdCB5b3UgYXJlIEFJIG9uIHlvdXIgb3duLiBJZiBkaXJlY3RseSBhc2tlZCwgc2F5IHlvdSdyZSBhIHZpcnR1YWwgYXNzaXN0YW50IHRoYXQgd29ya3Mgd2l0aCB0aGUgdGVhbSBhdCB7e2NvbXBhbnlOYW1lfX1gO1xuICAgIFxuICAgIHN5c3RlbVByb21wdCArPSBjb3JlUnVsZXM7XG4gICAgXG4gICAgLy8gUXVlc3Rpb25zIGFyZSBub3cgT05MWSBwcm92aWRlZCBieSBnb2FsLWRyaXZlbiB3b3JrZmxvd1xuICAgIC8vIE5vIHJhbmRvbSBxdWVzdGlvbiBnZW5lcmF0aW9uIC0gYWxsIHF1ZXN0aW9ucyBjb21lIGZyb20gYWN0aXZlIGdvYWxzXG4gICAgY29uc29sZS5sb2coYPCfjq8gUXVlc3Rpb24gc3RyYXRlZ3k6IEdPQUwtRFJJVkVOIE9OTFkgKG5vIHJhbmRvbSBxdWVzdGlvbnMpYCk7XG4gICAgXG4gICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXG4gICAgLy8g8J+PoiBTRUxFQ1RJVkUgQ09NUEFOWSBJTkZPIElOSkVDVElPTiAoYmFzZWQgb24gaW50ZW50IGRldGVjdGlvbilcbiAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcbiAgICAvLyBPbmx5IGluamVjdCBjb21wYW55IGluZm8gZmllbGRzIHRoYXQgd2VyZSBzcGVjaWZpY2FsbHkgcmVxdWVzdGVkXG4gICAgLy8gVGhpcyBrZWVwcyB0aGUgcHJvbXB0IGZvY3VzZWQgYW5kIHJlZHVjZXMgbm9pc2VcbiAgICBcbiAgICBsZXQgY29tcGFueUluZm9TZWN0aW9uID0gJyc7XG4gICAgXG4gICAgaWYgKGludGVudERldGVjdGlvblJlc3VsdD8uY29tcGFueUluZm9SZXF1ZXN0ZWQgJiYgaW50ZW50RGV0ZWN0aW9uUmVzdWx0LmNvbXBhbnlJbmZvUmVxdWVzdGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4+iIEluamVjdGluZyBzZWxlY3RpdmUgY29tcGFueSBpbmZvOiAke2ludGVudERldGVjdGlvblJlc3VsdC5jb21wYW55SW5mb1JlcXVlc3RlZC5qb2luKCcsICcpfWApO1xuICAgICAgY29tcGFueUluZm9TZWN0aW9uID0gdGhpcy5idWlsZFNlbGVjdGl2ZUNvbXBhbnlJbmZvKFxuICAgICAgICB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyxcbiAgICAgICAgaW50ZW50RGV0ZWN0aW9uUmVzdWx0LmNvbXBhbnlJbmZvUmVxdWVzdGVkXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZWZhdWx0OiBBbHdheXMgaW5jbHVkZSBob3VycyBhbmQgY29udGFjdCBmb3IgY29udGV4dCAoYnV0IGNvbmRlbnNlZClcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5jb21wYW55SW5mbykge1xuICAgICAgICBjb21wYW55SW5mb1NlY3Rpb24gPSB0aGlzLmJ1aWxkU2VsZWN0aXZlQ29tcGFueUluZm8oXG4gICAgICAgICAgdGhpcy5jb25maWcuY29tcGFueUluZm8sXG4gICAgICAgICAgWydob3VycycsICdjb250YWN0JywgJ2xvY2F0aW9uJ11cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgc3lzdGVtUHJvbXB0ICs9IGNvbXBhbnlJbmZvU2VjdGlvbjtcbiAgICBcbiAgICAvLyBSZXBsYWNlIHRlbXBsYXRlIHZhcmlhYmxlcyB3aXRoIGFjdHVhbCB2YWx1ZXNcbiAgICBjb25zdCBjb21wYW55TmFtZSA9IHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvPy5uYW1lIHx8ICd0aGUgY29tcGFueSc7XG4gICAgc3lzdGVtUHJvbXB0ID0gc3lzdGVtUHJvbXB0LnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csIGNvbXBhbnlOYW1lKTtcbiAgICBcbiAgICByZXR1cm4gc3lzdGVtUHJvbXB0O1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgbWVzc2FnZSBhbmQgcmV0dXJuIHN0cnVjdHVyZWQgcmVzcG9uc2Ugd2l0aCBtZXRhZGF0YVxuICAgKi9cbiAgYXN5bmMgcHJvY2Vzc01lc3NhZ2VTdHJ1Y3R1cmVkKGNvbnRleHQ6IEFnZW50Q29udGV4dCk6IFByb21pc2U8QWdlbnRSZXNwb25zZT4ge1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IHJlc3VsdC5yZXNwb25zZTtcbiAgICAgIGNvbnN0IHByb2Nlc3NpbmdUaW1lID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgIFxuICAgICAgLy8gQ2hlY2sgaWYgd2UgZGV0ZWN0ZWQgYW4gaW50ZW50IGR1cmluZyBwcm9jZXNzaW5nXG4gICAgICBsZXQgaW50ZW50RGF0YTogQWdlbnRSZXNwb25zZVsnaW50ZW50J10gfCB1bmRlZmluZWQ7XG4gICAgICBcbiAgICAgIC8vIFJlLXJ1biBpbnRlbnQgZGV0ZWN0aW9uIHRvIGdldCB0aGUgbWV0YWRhdGEgKHRoaXMgaXMgY2FjaGVkL2Zhc3QpXG4gICAgICBsZXQgY3VycmVudFBlcnNvbmE6IEFnZW50UGVyc29uYTtcbiAgICAgIGlmICh0aGlzLnBlcnNvbmFTZXJ2aWNlICYmIHRoaXMuY29uZmlnLnBlcnNvbmFJZCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGN1cnJlbnRQZXJzb25hID0gYXdhaXQgdGhpcy5wZXJzb25hU2VydmljZS5nZXRQZXJzb25hKCdkZWZhdWx0JywgdGhpcy5jb25maWcucGVyc29uYUlkLCB0aGlzLmNvbmZpZy5jb21wYW55SW5mbyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY3VycmVudFBlcnNvbmEgPSBnZXRQZXJzb25hKHRoaXMuY29uZmlnLnBlcnNvbmFJZCB8fCAnY2FybG9zJyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGN1cnJlbnRQZXJzb25hID0gZ2V0UGVyc29uYSh0aGlzLmNvbmZpZy5wZXJzb25hSWQgfHwgJ2NhcmxvcycpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBpbnRlbnRNYXRjaCA9IGF3YWl0IHRoaXMuaW50ZW50U2VydmljZS5kZXRlY3RJbnRlbnQoXG4gICAgICAgIGNvbnRleHQudGV4dCxcbiAgICAgICAgY3VycmVudFBlcnNvbmEsXG4gICAgICAgIHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvIHx8IHtcbiAgICAgICAgICBuYW1lOiAnUGxhbmV0IEZpdG5lc3M5JyxcbiAgICAgICAgICBpbmR1c3RyeTogJ0ZpdG5lc3MgJiBXZWxsbmVzcycsXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdBbWVyaWNhXFwncyBtb3N0IHBvcHVsYXIgZ3ltIHdpdGggb3ZlciAyLDQwMCBsb2NhdGlvbnMnLFxuICAgICAgICAgIHByb2R1Y3RzOiAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgICAgICAgYmVuZWZpdHM6ICdBZmZvcmRhYmxlIHByaWNpbmcsIGp1ZGdtZW50LWZyZWUgZW52aXJvbm1lbnQsIGNvbnZlbmllbnQgbG9jYXRpb25zJyxcbiAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6ICdQZW9wbGUgb2YgYWxsIGZpdG5lc3MgbGV2ZWxzIGxvb2tpbmcgZm9yIGFuIGFmZm9yZGFibGUsIG5vbi1pbnRpbWlkYXRpbmcgZ3ltIGV4cGVyaWVuY2UnLFxuICAgICAgICAgIGRpZmZlcmVudGlhdG9yczogJ0xvdyBjb3N0LCBuby1qdWRnbWVudCBhdG1vc3BoZXJlLCBiZWdpbm5lci1mcmllbmRseSBlbnZpcm9ubWVudCdcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkLFxuICAgICAgICAgIGNoYW5uZWw6IGNvbnRleHQuc291cmNlIGFzIHN0cmluZ1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICBpZiAoaW50ZW50TWF0Y2ggJiYgaW50ZW50TWF0Y2guY29uZmlkZW5jZSA+IDAuNykge1xuICAgICAgICBpbnRlbnREYXRhID0ge1xuICAgICAgICAgIGlkOiBpbnRlbnRNYXRjaC5pbnRlbnQuaWQsXG4gICAgICAgICAgbmFtZTogaW50ZW50TWF0Y2guaW50ZW50Lm5hbWUsXG4gICAgICAgICAgY29uZmlkZW5jZTogaW50ZW50TWF0Y2guY29uZmlkZW5jZSxcbiAgICAgICAgICBwcmlvcml0eTogaW50ZW50TWF0Y2guaW50ZW50LnByaW9yaXR5LFxuICAgICAgICAgIG1hdGNoZWRUcmlnZ2VyczogaW50ZW50TWF0Y2gubWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgIG1hdGNoZWRQYXR0ZXJuczogaW50ZW50TWF0Y2gubWF0Y2hlZFBhdHRlcm5zLFxuICAgICAgICAgIGFjdGlvbnM6IGludGVudE1hdGNoLmFjdGlvbnNcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogcmVzcG9uc2UsXG4gICAgICAgIGludGVudDogaW50ZW50RGF0YSxcbiAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuY29udmVyc2F0aW9uX2lkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCxcbiAgICAgICAgICB1c2VySWQ6IGNvbnRleHQuZW1haWxfbGMsXG4gICAgICAgICAgY2hhbm5lbDogY29udGV4dC5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogcHJvY2Vzc2luZ1RpbWUsXG4gICAgICAgICAgcGVyc29uYUlkOiB0aGlzLmNvbmZpZy5wZXJzb25hSWQsXG4gICAgICAgICAgY29tcGFueU5hbWU6IHRoaXMuY29uZmlnLmNvbXBhbnlJbmZvPy5uYW1lXG4gICAgICAgIH0sXG4gICAgICAgIGZvbGxvd1VwOiBpbnRlbnRNYXRjaD8uZm9sbG93VXBcbiAgICAgIH07XG5cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgcHJvY2Vzc2luZ1RpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgbWVzc2FnZTogJ0kgYXBvbG9naXplLCBidXQgSSBlbmNvdW50ZXJlZCBhbiBlcnJvciBwcm9jZXNzaW5nIHlvdXIgbWVzc2FnZS4gUGxlYXNlIHRyeSBhZ2Fpbi4nLFxuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIHNlc3Npb25JZDogY29udGV4dC5jb252ZXJzYXRpb25faWQgfHwgJ3Vua25vd24nLFxuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgICAgIHVzZXJJZDogY29udGV4dC5lbWFpbF9sYyxcbiAgICAgICAgICBjaGFubmVsOiBjb250ZXh0LnNvdXJjZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICBwcm9jZXNzaW5nVGltZU1zOiBwcm9jZXNzaW5nVGltZSxcbiAgICAgICAgICBwZXJzb25hSWQ6IHRoaXMuY29uZmlnLnBlcnNvbmFJZCxcbiAgICAgICAgICBjb21wYW55TmFtZTogdGhpcy5jb25maWcuY29tcGFueUluZm8/Lm5hbWVcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICBjb2RlOiAnUFJPQ0VTU0lOR19FUlJPUicsXG4gICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgICAgZGV0YWlsczogZXJyb3JcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyOiBHZXQgcmVxdWlyZWQgZmllbGQgbmFtZXMgZnJvbSBnb2FsIChzdXBwb3J0cyBib3RoIG9sZCBhbmQgbmV3IGZvcm1hdHMpXG4gICAqL1xuICBwcml2YXRlIGdldFJlcXVpcmVkRmllbGROYW1lcyhnb2FsOiBhbnkpOiBzdHJpbmdbXSB7XG4gICAgaWYgKCFnb2FsLmRhdGFUb0NhcHR1cmU/LmZpZWxkcykgcmV0dXJuIFtdO1xuICAgIFxuICAgIGNvbnN0IGZpZWxkcyA9IGdvYWwuZGF0YVRvQ2FwdHVyZS5maWVsZHM7XG4gICAgXG4gICAgLy8gTkVXIEZPUk1BVDogQXJyYXkgb2YgZmllbGQgb2JqZWN0c1xuICAgIGlmIChmaWVsZHMubGVuZ3RoID4gMCAmJiB0eXBlb2YgZmllbGRzWzBdID09PSAnb2JqZWN0JyAmJiAnbmFtZScgaW4gZmllbGRzWzBdKSB7XG4gICAgICByZXR1cm4gZmllbGRzXG4gICAgICAgIC5maWx0ZXIoKGY6IGFueSkgPT4gZi5yZXF1aXJlZClcbiAgICAgICAgLm1hcCgoZjogYW55KSA9PiBmLm5hbWUpO1xuICAgIH1cbiAgICBcbiAgICAvLyBPTEQgRk9STUFUOiBVc2UgdmFsaWRhdGlvblJ1bGVzXG4gICAgY29uc3QgcnVsZXMgPSBnb2FsLmRhdGFUb0NhcHR1cmUudmFsaWRhdGlvblJ1bGVzIHx8IHt9O1xuICAgIHJldHVybiBmaWVsZHMuZmlsdGVyKChmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGRSdWxlcyA9IHJ1bGVzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZmllbGRSdWxlcz8ucmVxdWlyZWQgIT09IGZhbHNlOyAvLyBEZWZhdWx0IHRvIHJlcXVpcmVkXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyOiBHZXQgQUxMIGZpZWxkIG5hbWVzIGZyb20gZ29hbCAobm90IGp1c3QgcmVxdWlyZWQpXG4gICAqL1xuICBwcml2YXRlIGdldEZpZWxkTmFtZXNGb3JHb2FsKGdvYWw6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBpZiAoIWdvYWwuZGF0YVRvQ2FwdHVyZT8uZmllbGRzKSByZXR1cm4gW107XG4gICAgXG4gICAgY29uc3QgZmllbGRzID0gZ29hbC5kYXRhVG9DYXB0dXJlLmZpZWxkcztcbiAgICBcbiAgICAvLyBORVcgRk9STUFUOiBBcnJheSBvZiBmaWVsZCBvYmplY3RzXG4gICAgaWYgKGZpZWxkcy5sZW5ndGggPiAwICYmIHR5cGVvZiBmaWVsZHNbMF0gPT09ICdvYmplY3QnICYmICduYW1lJyBpbiBmaWVsZHNbMF0pIHtcbiAgICAgIHJldHVybiBmaWVsZHMubWFwKChmOiBhbnkpID0+IGYubmFtZSk7XG4gICAgfVxuICAgIFxuICAgIC8vIE9MRCBGT1JNQVQ6IFN0cmluZyBhcnJheVxuICAgIHJldHVybiBmaWVsZHM7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZWN0IGdlbmRlciBmcm9tIGZpcnN0IG5hbWVcbiAgICovXG4gIHByaXZhdGUgZGV0ZWN0R2VuZGVyRnJvbU5hbWUoZmlyc3ROYW1lOiBzdHJpbmcpOiAnZmVtYWxlJyB8ICdtYWxlJyB8IG51bGwge1xuICAgIGlmICghZmlyc3ROYW1lKSByZXR1cm4gbnVsbDtcbiAgICBcbiAgICBjb25zdCBuYW1lTG93ZXIgPSBmaXJzdE5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDb21tb24gZmVtYWxlIG5hbWUgcGF0dGVybnNcbiAgICBjb25zdCBmZW1hbGVOYW1lcyA9IFsnc2FyYScsICdzYXJhaCcsICdtYXJpYScsICdqZXNzaWNhJywgJ2plbm5pZmVyJywgJ2FteScsICdlbWlseScsICdhc2hsZXknLCAnbWljaGVsbGUnLCAnbGlzYScsICdrYXJlbicsICdzdXNhbicsICdkb25uYScsICdjYXJvbCcsICdydXRoJywgJ3NoYXJvbicsICdsYXVyYScsICdhbmdlbGEnLCAnc3RlcGhhbmllJywgJ3JlYmVjY2EnLCAnZGVib3JhaCcsICdyYWNoZWwnLCAnY2F0aGVyaW5lJywgJ2FubmEnLCAnZW1tYScsICdvbGl2aWEnLCAnc29waGlhJywgJ2lzYWJlbGxhJywgJ21pYScsICdjaGFybG90dGUnLCAnYW1lbGlhJywgJ2hhcnBlcicsICdldmVseW4nLCAnYWJpZ2FpbCcsICdlbGxhJywgJ3NjYXJsZXR0JywgJ2dyYWNlJywgJ2xpbHknLCAnY2hsb2UnLCAndmljdG9yaWEnLCAnbWFkaXNvbicsICdsdWN5JywgJ2hhbm5haCcsICd6b2UnLCAnc3RlbGxhJywgJ2hhemVsJywgJ3Zpb2xldCcsICdhdXJvcmEnLCAnc2F2YW5uYWgnLCAnYXVkcmV5JywgJ2Jyb29rbHluJywgJ2JlbGxhJywgJ2NsYWlyZScsICdza3lsYXInLCAnbHVjeScsICdwYWlzbGV5JywgJ2V2ZXJseScsICdhbm5hJywgJ2Nhcm9saW5lJywgJ25vdmEnLCAnZ2VuZXNpcycsICdlbWlsaWEnLCAna2VubmVkeSddO1xuICAgIFxuICAgIC8vIENvbW1vbiBtYWxlIG5hbWUgcGF0dGVybnNcbiAgICBjb25zdCBtYWxlTmFtZXMgPSBbJ2RhdmlkJywgJ21pY2hhZWwnLCAnam9obicsICdqYW1lcycsICdyb2JlcnQnLCAnd2lsbGlhbScsICdyaWNoYXJkJywgJ2pvc2VwaCcsICd0aG9tYXMnLCAnY2hhcmxlcycsICdjaHJpc3RvcGhlcicsICdkYW5pZWwnLCAnbWF0dGhldycsICdhbnRob255JywgJ21hcmsnLCAnZG9uYWxkJywgJ3N0ZXZlbicsICdwYXVsJywgJ2FuZHJldycsICdqb3NodWEnLCAna2VubmV0aCcsICdrZXZpbicsICdicmlhbicsICdnZW9yZ2UnLCAnZWR3YXJkJywgJ3JvbmFsZCcsICd0aW1vdGh5JywgJ2phc29uJywgJ2plZmZyZXknLCAncnlhbicsICdqYWNvYicsICdnYXJ5JywgJ25pY2hvbGFzJywgJ2VyaWMnLCAnam9uYXRoYW4nLCAnc3RlcGhlbicsICdsYXJyeScsICdqdXN0aW4nLCAnc2NvdHQnLCAnYnJhbmRvbicsICdiZW5qYW1pbicsICdzYW11ZWwnLCAncmF5bW9uZCcsICdncmVnb3J5JywgJ2ZyYW5rJywgJ2FsZXhhbmRlcicsICdwYXRyaWNrJywgJ2phY2snLCAnZGVubmlzJywgJ2plcnJ5JywgJ3R5bGVyJywgJ2Fhcm9uJywgJ2pvc2UnLCAnYWRhbScsICdoZW5yeScsICduYXRoYW4nLCAnZG91Z2xhcycsICd6YWNoYXJ5JywgJ3BldGVyJywgJ2t5bGUnLCAnd2FsdGVyJywgJ2V0aGFuJywgJ2plcmVteScsICdoYXJvbGQnLCAna2VpdGgnLCAnY2hyaXN0aWFuJywgJ3JvZ2VyJywgJ25vYWgnLCAnZ2VyYWxkJywgJ2NhcmwnLCAndGVycnknLCAnc2VhbicsICdhdXN0aW4nLCAnYXJ0aHVyJywgJ2xhd3JlbmNlJywgJ2plc3NlJywgJ2R5bGFuJywgJ2JyeWFuJywgJ2pvZScsICdqb3JkYW4nLCAnYmlsbHknLCAnYnJ1Y2UnLCAnYWxiZXJ0JywgJ3dpbGxpZScsICdnYWJyaWVsJywgJ2xvZ2FuJywgJ2FsYW4nLCAnanVhbicsICd3YXluZScsICdyb3knLCAncmFscGgnLCAncmFuZHknLCAnZXVnZW5lJywgJ3ZpbmNlbnQnLCAncnVzc2VsbCcsICdlbGlqYWgnLCAnbG91aXMnLCAnYm9iYnknLCAncGhpbGlwJywgJ2pvaG5ueSddO1xuICAgIFxuICAgIGlmIChmZW1hbGVOYW1lcy5pbmNsdWRlcyhuYW1lTG93ZXIpKSB7XG4gICAgICByZXR1cm4gJ2ZlbWFsZSc7XG4gICAgfSBlbHNlIGlmIChtYWxlTmFtZXMuaW5jbHVkZXMobmFtZUxvd2VyKSkge1xuICAgICAgcmV0dXJuICdtYWxlJztcbiAgICB9IGVsc2UgaWYgKG5hbWVMb3dlci5lbmRzV2l0aCgnYScpIHx8IG5hbWVMb3dlci5lbmRzV2l0aCgnZWxsZScpIHx8IG5hbWVMb3dlci5lbmRzV2l0aCgnZXR0ZScpKSB7XG4gICAgICByZXR1cm4gJ2ZlbWFsZSc7IC8vIENvbW1vbiBmZW1hbGUgbmFtZSBlbmRpbmdzXG4gICAgfVxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZSBwcmVmZXJyZWQgY2hhbm5lbCBmb3IgcmVzcG9uc2UgYmFzZWQgb24gY29udGV4dCBhbmQgdGVuYW50IHByZWZlcmVuY2VzXG4gICAqL1xuICBkZXRlcm1pbmVQcmVmZXJyZWRDaGFubmVsKGNvbnRleHQ6IEFnZW50Q29udGV4dCwgdGVuYW50UHJlZmVyZW5jZXM/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogTWVzc2FnZVNvdXJjZSB7XG4gICAgLy8gRGVmYXVsdCB0byB0aGUgb3JpZ2luYXRpbmcgY2hhbm5lbFxuICAgIGlmICh0ZW5hbnRQcmVmZXJlbmNlcz8ucHJlZmVycmVkQ2hhbm5lbCkge1xuICAgICAgcmV0dXJuIHRlbmFudFByZWZlcmVuY2VzLnByZWZlcnJlZENoYW5uZWwgYXMgTWVzc2FnZVNvdXJjZTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGNvbnRleHQuc291cmNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSByb3V0aW5nIGluZm9ybWF0aW9uIGZvciB0aGUgcmVzcG9uc2VcbiAgICovXG4gIGNyZWF0ZVJvdXRpbmdJbmZvKGNvbnRleHQ6IEFnZW50Q29udGV4dCwgcHJlZmVycmVkQ2hhbm5lbDogTWVzc2FnZVNvdXJjZSk6IHtcbiAgICBzbXM/OiB7IHRvOiBzdHJpbmcgfTtcbiAgICBlbWFpbD86IHsgdG86IHN0cmluZyB9O1xuICAgIGNoYXQ/OiB7IHNlc3Npb25JZDogc3RyaW5nIH07XG4gIH0ge1xuICAgIGNvbnN0IHJvdXRpbmc6IGFueSA9IHt9O1xuICAgIFxuICAgIGlmIChwcmVmZXJyZWRDaGFubmVsID09PSAnc21zJyAmJiBjb250ZXh0LmNoYW5uZWxfY29udGV4dD8uc21zKSB7XG4gICAgICByb3V0aW5nLnNtcyA9IHsgdG86IGNvbnRleHQuY2hhbm5lbF9jb250ZXh0LnNtcy5mcm9tIH07XG4gICAgfSBlbHNlIGlmIChwcmVmZXJyZWRDaGFubmVsID09PSAnZW1haWwnICYmIGNvbnRleHQuY2hhbm5lbF9jb250ZXh0Py5lbWFpbCkge1xuICAgICAgcm91dGluZy5lbWFpbCA9IHsgdG86IGNvbnRleHQuY2hhbm5lbF9jb250ZXh0LmVtYWlsLmZyb20gfTtcbiAgICB9IGVsc2UgaWYgKHByZWZlcnJlZENoYW5uZWwgPT09ICdjaGF0JyAmJiBjb250ZXh0LmNoYW5uZWxfY29udGV4dD8uY2hhdCkge1xuICAgICAgcm91dGluZy5jaGF0ID0geyBzZXNzaW9uSWQ6IGNvbnRleHQuY2hhbm5lbF9jb250ZXh0LmNoYXQuc2Vzc2lvbklkIH07XG4gICAgfVxuICAgIFxuICAgIHJldHVybiByb3V0aW5nO1xuICB9XG5cbiAgLyoqXG4gICAqIEluZmVyIGludGVyZXN0IGxldmVsIGZyb20gaW50ZW50IHdoZW4gTExNIGRvZXNuJ3QgcHJvdmlkZSBpdFxuICAgKi9cbiAgcHJpdmF0ZSBpbmZlckludGVyZXN0TGV2ZWwoaW50ZW50UmVzdWx0OiBhbnkpOiBudW1iZXIge1xuICAgIC8vIEJhc2UgaW50ZXJlc3QgYnkgaW50ZW50IHR5cGVcbiAgICBjb25zdCBpbnRlbnRJbnRlcmVzdDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcbiAgICAgICdzY2hlZHVsaW5nJzogNCwgICAgICAgICAgIC8vIEhpZ2ggLSB0aGV5IHdhbnQgdG8gYm9va1xuICAgICAgJ3dvcmtmbG93X2RhdGFfY2FwdHVyZSc6IDQsIC8vIEhpZ2ggLSBwcm92aWRpbmcgaW5mb1xuICAgICAgJ2NvbXBhbnlfaW5mb19yZXF1ZXN0JzogMywgIC8vIE1lZGl1bSAtIGN1cmlvdXNcbiAgICAgICdnZW5lcmFsX2NvbnZlcnNhdGlvbic6IDMsICAvLyBNZWRpdW0gLSBlbmdhZ2VkXG4gICAgICAnb2JqZWN0aW9uJzogMiwgICAgICAgICAgICAvLyBMb3cgLSByZXNpc3RhbmNlXG4gICAgICAnZW5kX2NvbnZlcnNhdGlvbic6IDIsICAgICAvLyBMb3cgLSBsZWF2aW5nXG4gICAgICAndW5rbm93bic6IDMgICAgICAgICAgICAgICAvLyBEZWZhdWx0XG4gICAgfTtcbiAgICBcbiAgICBsZXQgaW50ZXJlc3QgPSBpbnRlbnRJbnRlcmVzdFtpbnRlbnRSZXN1bHQucHJpbWFyeUludGVudF0gfHwgMztcbiAgICBcbiAgICAvLyBBZGp1c3QgYmFzZWQgb24gZW1vdGlvbmFsIHRvbmVcbiAgICBjb25zdCB0b25lID0gaW50ZW50UmVzdWx0LmRldGVjdGVkRW1vdGlvbmFsVG9uZTtcbiAgICBpZiAodG9uZSA9PT0gJ3Bvc2l0aXZlJykgaW50ZXJlc3QgPSBNYXRoLm1pbig1LCBpbnRlcmVzdCArIDEpO1xuICAgIGlmICh0b25lID09PSAnZnJ1c3RyYXRlZCcgfHwgdG9uZSA9PT0gJ25lZ2F0aXZlJykgaW50ZXJlc3QgPSBNYXRoLm1heCgxLCBpbnRlcmVzdCAtIDEpO1xuICAgIFxuICAgIC8vIEJvb3N0IGlmIHRoZXkgcHJvdmlkZWQgZGF0YVxuICAgIGlmIChpbnRlbnRSZXN1bHQuZXh0cmFjdGVkRGF0YSAmJiBBcnJheS5pc0FycmF5KGludGVudFJlc3VsdC5leHRyYWN0ZWREYXRhKSAmJiBpbnRlbnRSZXN1bHQuZXh0cmFjdGVkRGF0YS5sZW5ndGggPiAwKSB7XG4gICAgICBpbnRlcmVzdCA9IE1hdGgubWluKDUsIGludGVyZXN0ICsgMC41KTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIE1hdGgucm91bmQoaW50ZXJlc3QgKiAxMCkgLyAxMDsgLy8gMSBkZWNpbWFsIHBsYWNlXG4gIH1cblxuICAvKipcbiAgICogSW5mZXIgY29udmVyc2lvbiBsaWtlbGlob29kIGZyb20gaW50ZW50IHdoZW4gTExNIGRvZXNuJ3QgcHJvdmlkZSBpdFxuICAgKi9cbiAgcHJpdmF0ZSBpbmZlckNvbnZlcnNpb25MaWtlbGlob29kKGludGVudFJlc3VsdDogYW55KTogbnVtYmVyIHtcbiAgICAvLyBCYXNlIGxpa2VsaWhvb2QgYnkgaW50ZW50IHR5cGVcbiAgICBjb25zdCBpbnRlbnRMaWtlbGlob29kOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge1xuICAgICAgJ3NjaGVkdWxpbmcnOiAwLjgsICAgICAgICAgIC8vIEhpZ2ggLSB0aGV5IHdhbnQgdG8gYm9va1xuICAgICAgJ3dvcmtmbG93X2RhdGFfY2FwdHVyZSc6IDAuNywgLy8gR29vZCAtIHByb3ZpZGluZyBpbmZvXG4gICAgICAnY29tcGFueV9pbmZvX3JlcXVlc3QnOiAwLjUsICAvLyBNZWRpdW0gLSByZXNlYXJjaGluZ1xuICAgICAgJ2dlbmVyYWxfY29udmVyc2F0aW9uJzogMC40LCAgLy8gTG93ZXIgLSBqdXN0IGNoYXR0aW5nXG4gICAgICAnb2JqZWN0aW9uJzogMC4zLCAgICAgICAgICAgIC8vIExvdyAtIHJlc2lzdGFuY2VcbiAgICAgICdlbmRfY29udmVyc2F0aW9uJzogMC4yLCAgICAgLy8gTG93IC0gbGVhdmluZ1xuICAgICAgJ3Vua25vd24nOiAwLjQgICAgICAgICAgICAgICAvLyBEZWZhdWx0XG4gICAgfTtcbiAgICBcbiAgICBsZXQgbGlrZWxpaG9vZCA9IGludGVudExpa2VsaWhvb2RbaW50ZW50UmVzdWx0LnByaW1hcnlJbnRlbnRdIHx8IDAuNDtcbiAgICBcbiAgICAvLyBBZGp1c3QgYmFzZWQgb24gZW1vdGlvbmFsIHRvbmVcbiAgICBjb25zdCB0b25lID0gaW50ZW50UmVzdWx0LmRldGVjdGVkRW1vdGlvbmFsVG9uZTtcbiAgICBpZiAodG9uZSA9PT0gJ3Bvc2l0aXZlJykgbGlrZWxpaG9vZCA9IE1hdGgubWluKDEsIGxpa2VsaWhvb2QgKyAwLjEpO1xuICAgIGlmICh0b25lID09PSAndXJnZW50JykgbGlrZWxpaG9vZCA9IE1hdGgubWluKDEsIGxpa2VsaWhvb2QgKyAwLjE1KTtcbiAgICBpZiAodG9uZSA9PT0gJ2ZydXN0cmF0ZWQnIHx8IHRvbmUgPT09ICduZWdhdGl2ZScpIGxpa2VsaWhvb2QgPSBNYXRoLm1heCgwLCBsaWtlbGlob29kIC0gMC4xKTtcbiAgICBcbiAgICAvLyBCb29zdCBpZiB0aGV5IHByb3ZpZGVkIGNvbnRhY3QgaW5mb1xuICAgIGlmIChpbnRlbnRSZXN1bHQuZXh0cmFjdGVkRGF0YSAmJiBBcnJheS5pc0FycmF5KGludGVudFJlc3VsdC5leHRyYWN0ZWREYXRhKSkge1xuICAgICAgY29uc3QgaGFzQ29udGFjdCA9IGludGVudFJlc3VsdC5leHRyYWN0ZWREYXRhLnNvbWUoKGQ6IGFueSkgPT4gXG4gICAgICAgIGQuZmllbGQgPT09ICdlbWFpbCcgfHwgZC5maWVsZCA9PT0gJ3Bob25lJ1xuICAgICAgKTtcbiAgICAgIGlmIChoYXNDb250YWN0KSBsaWtlbGlob29kID0gTWF0aC5taW4oMSwgbGlrZWxpaG9vZCArIDAuMik7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBNYXRoLnJvdW5kKGxpa2VsaWhvb2QgKiAxMDApIC8gMTAwOyAvLyAyIGRlY2ltYWwgcGxhY2VzXG4gIH1cbn0iXX0=