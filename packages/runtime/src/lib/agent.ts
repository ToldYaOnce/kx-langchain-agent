import { ChatBedrockConverse } from '@langchain/aws';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { KxDynamoChatHistory } from './chat-history.js';
import { MemoryChatHistory } from './memory-chat-history.js';
import { DynamoDBService } from './dynamodb.js';
import { EventBridgeService } from './eventbridge.js';
import { getPersona, type AgentPersona } from '../config/personas.js';
import { PersonaService, type CompanyInfo } from './persona-service.js';
import { ResponseChunker, type ResponseChunk } from './response-chunker.js';
import { IntentService, type IntentMatch } from './intent-service.js';
import { GoalOrchestrator, type GoalOrchestrationResult } from './goal-orchestrator.js';
import { ActionTagProcessor, type ActionTagConfig } from './action-tag-processor.js';
import { IntentActionRegistry, type IntentActionContext, type IntentActionResult } from './intent-action-registry.js';
import { PersonaStorage } from './persona-storage.js';
import { ChannelStateService } from './channel-state-service.js';
import { VerbosityHelper } from './verbosity-config.js';
import { GoalConfigHelper, type EffectiveGoalConfig } from './goal-config-helper.js';
import { MessageProcessor, type ProcessingContext, type ProcessingResult } from './message-processor.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AgentContext, RuntimeConfig, MessageSource, AgentResponse, ChannelWorkflowState } from '../types/index.js';

// Zod schema for structured sentence output
const SentenceListSchema = z.object({
  sentences: z.array(z.string().min(1)).describe('Array of complete, standalone sentences')
});

export type SentenceList = z.infer<typeof SentenceListSchema>;

// Zod schema for intent detection (REQUEST #1)
const IntentDetectionSchema = z.object({
  primaryIntent: z.enum([
    'company_info_request',
    'workflow_data_capture',
    'general_conversation',
    'objection',
    'scheduling',
    'complaint',
    'question'
  ]).describe('Primary intent category of the user message'),
  
  detectedWorkflowIntent: z.string().nullable().describe('Specific workflow field detected (e.g., "email", "phone", "firstName") or null if none'),
  
  companyInfoRequested: z.array(z.string()).nullable().describe('Specific company info fields requested (e.g., ["hours", "pricing", "location"]) or null if none'),
  
  requiresDeepContext: z.boolean().describe('True if this conversation needs more than the last 10 messages for proper context'),
  
  conversationComplexity: z.enum(['simple', 'moderate', 'complex']).describe('Overall complexity of the user query'),
  
  detectedEmotionalTone: z.enum(['positive', 'neutral', 'frustrated', 'urgent']).optional().describe('Emotional tone of the message')
});

export type IntentDetectionResult = z.infer<typeof IntentDetectionSchema>;

export interface AgentServiceConfig extends RuntimeConfig {
  dynamoService?: DynamoDBService;
  eventBridgeService?: EventBridgeService;
  personaId?: string; // Agent persona to use (defaults to 'carlos')
  persona?: any; // Pre-loaded persona object (skips persona loading if provided)
  intentActionRegistry?: IntentActionRegistry;
  personaStorage?: PersonaStorage;
  companyInfo?: CompanyInfo; // Company information for persona customization
}

/**
 * LangChain agent service that processes messages and generates responses
 */
export class AgentService {
  private config: AgentServiceConfig;
  private model: ChatBedrockConverse;
  private persona: AgentPersona;
  private personaService?: PersonaService;
  private intentService: IntentService;
  private goalOrchestrator: GoalOrchestrator;
  private actionTagProcessor: ActionTagProcessor;
  private intentActionRegistry: IntentActionRegistry;
  private personaStorage?: PersonaStorage;
  private channelStateService?: ChannelStateService;
  private messageTrackingService?: any; // MessageTrackingService (avoid circular import)

  constructor(config: AgentServiceConfig) {
    this.config = config;
    
    // Always initialize persona service for company info substitution
    // Pass null for DynamoDB service if not available
    this.personaService = new PersonaService(config.dynamoService || null);
    
    // Initialize intent service
    this.intentService = new IntentService();
    
    // Initialize goal orchestrator
    // @ts-ignore - Type definitions outdated, GoalOrchestrator now accepts eventBridgeService
    this.goalOrchestrator = new GoalOrchestrator(config.eventBridgeService);
    
    // Initialize action tag processor with default config (will be updated per persona)
    this.actionTagProcessor = new ActionTagProcessor({
      enabled: false,
      mappings: {},
      fallbackEmoji: '😊'
    });
    
    // Initialize intent action registry (use provided or create new)
    this.intentActionRegistry = config.intentActionRegistry || new IntentActionRegistry();
    
    // Initialize persona storage (use provided or create with fallback)
    this.personaStorage = config.personaStorage;
    
    // Initialize channel state service for workflow tracking
    // Can be injected from CLI (LocalChannelStateService) or created from DynamoDB
    if ((config as any).channelStateService) {
      this.channelStateService = (config as any).channelStateService;
      console.log(`📊 Channel state service initialized (injected - local mode)`);
    } else if (config.dynamoService) {
      const dynamoClient = new DynamoDBClient({ region: config.awsRegion });
      const docClient = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: {
          removeUndefinedValues: true,
        },
      });
      const workflowStateTable = process.env.WORKFLOW_STATE_TABLE || 'KxGen-agent-workflow-state';
      this.channelStateService = new ChannelStateService(docClient, workflowStateTable);
      console.log(`📊 Channel state service initialized (table: ${workflowStateTable})`);
      
      // Initialize message tracking service for interruption handling (lazy loaded)
      // Will be initialized on first use in processMessageChunked
    }
    
    // Persona will be loaded per-request with company info substitution
    this.persona = {} as AgentPersona; // Will be loaded per-request
    
    // Model will be initialized per-request with verbosity-aware maxTokens and temperature
    // DO NOT initialize here - wait until we have persona settings in processMessage()!
    this.model = null as any; // Will be created in processMessage() with correct settings
  }

  /**
   * 🏢 Build selective company info section (only requested fields)
   */
  private buildSelectiveCompanyInfo(
    companyInfo: CompanyInfo | undefined,
    requestedFields: string[] | null
  ): string {
    if (!companyInfo || !requestedFields || requestedFields.length === 0) {
      return '';
    }

    let companyInfoSection = '\n\n📋 COMPANY INFORMATION:\n';
    
    // Map of field names to company info properties
    const fieldMap: Record<string, () => string> = {
      'hours': () => {
        if (!companyInfo.businessHours) return '';
        let hoursText = '\n📅 BUSINESS HOURS (CRITICAL - USE THESE EXACT HOURS):\n';
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        days.forEach(day => {
          const hours = (companyInfo.businessHours as any)?.[day];
          if (hours && hours.length > 0) {
            hoursText += `• ${day.charAt(0).toUpperCase() + day.slice(1)}: ${hours.map((h: any) => `${h.from}-${h.to}`).join(', ')}\n`;
          }
        });
        hoursText += '\n⚠️ IMPORTANT: When asked about hours, ALWAYS use these exact times. Do NOT make up hours or say "24/7" unless explicitly shown above.\n';
        return hoursText;
      },
      'contact': () => {
        let contactText = '\n📞 CONTACT INFORMATION:\n';
        if (companyInfo.phone) contactText += `• Phone: ${companyInfo.phone}\n`;
        if (companyInfo.email) contactText += `• Email: ${companyInfo.email}\n`;
        if (companyInfo.website) contactText += `• Website: ${companyInfo.website}\n`;
        return contactText;
      },
      'location': () => {
        if (!companyInfo.address?.street && !companyInfo.address?.city) return '';
        let locationText = '\n📍 LOCATION:\n';
        if (companyInfo.address.street) locationText += `${companyInfo.address.street}\n`;
        if (companyInfo.address.city && companyInfo.address.state && companyInfo.address.zipCode) {
          locationText += `${companyInfo.address.city}, ${companyInfo.address.state} ${companyInfo.address.zipCode}\n`;
        }
        return locationText;
      },
      'services': () => {
        if (!companyInfo.products) return '';
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
  async processMessage(context: AgentContext, existingHistory?: BaseMessage[]): Promise<{ response: string; followUpQuestion?: string }> {
    const startTime = Date.now();
    
    try {
      // Load persona for this tenant with company info substitution
      let currentPersona = this.persona;
      
      // Use pre-loaded persona if provided (from handler)
      if (this.config.persona) {
        console.log(`👤 Using pre-loaded persona from config`);
        currentPersona = this.config.persona as AgentPersona;
      } else if (this.personaService) {
        try {
          currentPersona = await this.personaService.getPersona(
            context.tenantId, 
            this.config.personaId || 'carlos',
            this.config.companyInfo
          );
        } catch (error) {
          console.warn(`Failed to load persona ${this.config.personaId} for tenant ${context.tenantId}, using fallback:`, error);
          // Use PersonaService fallback to ensure goalConfiguration is loaded
          currentPersona = this.personaService.getDefaultPersona(this.config.personaId || 'carlos', this.config.companyInfo);
        }
      }

      // Configure action tag processor based on persona
      if ((currentPersona as any).actionTags) {
        const actionTagConfig = (currentPersona as any).actionTags as ActionTagConfig;
        this.actionTagProcessor = new ActionTagProcessor(actionTagConfig);
      }

      // Configure model maxTokens based on verbosity trait
      const verbosity = (currentPersona as any)?.personalityTraits?.verbosity || 5;
      console.log(`🎚️ Using verbosity: ${verbosity}`);
      
      // Get verbosity configuration from helper
      const verbosityConfig = VerbosityHelper.getConfig(verbosity);
      const { maxTokens, temperature, maxSentences } = verbosityConfig;
      
      console.log(`🎚️ Verbosity config: ${verbosityConfig.description}`);
      console.log(`🎚️ Setting maxTokens=${maxTokens}, temperature=${temperature}, maxSentences=${maxSentences}`);
      
      // 👉 Question generation disabled - using ONLY goal-driven questions
      // Goals will provide all questions via the workflow
      const shouldAddQuestion = false;
      console.log(`❓ Question generation: DISABLED (using goal-driven questions only)`);
      
      // Recreate model with verbosity-aware maxTokens and temperature
      this.model = new ChatBedrockConverse({
        model: this.config.bedrockModelId,
        region: this.config.awsRegion,
        temperature,
        maxTokens,
        max_tokens: maxTokens, // Also pass snake_case version for Bedrock API
      } as any);

      // ═══════════════════════════════════════════════════════════════════
      // 🎯 THREE-REQUEST ARCHITECTURE
      // ═══════════════════════════════════════════════════════════════════
      // REQUEST #1: Intent Detection & Context Analysis (performed first)
      // REQUEST #2: Conversational Response (uses results from #1)
      // REQUEST #3: Follow-Up Generation (verification or workflow question)
      // ═══════════════════════════════════════════════════════════════════

      // Run goal orchestration to manage lead qualification
      let goalResult: GoalOrchestrationResult | null = null;
      
      // Load channel workflow state (Phase C: Persistent state)
      let channelState: ChannelWorkflowState | undefined;
      if (this.channelStateService && context.conversation_id) {
        try {
          channelState = await this.channelStateService.loadWorkflowState(context.conversation_id, context.tenantId);
          console.log(`📊 Loaded channel state: ${JSON.stringify(channelState, null, 2)}`);
          
          // Increment message count
          channelState = await this.channelStateService.incrementMessageCount(context.conversation_id, context.tenantId);
        } catch (error) {
          console.error('❌ Error loading channel state:', error);
        }
      }

      // Determine effective goal configuration (company-level takes precedence over persona-level)
      const effectiveGoalConfig = GoalConfigHelper.getEffectiveConfig(
        this.config.companyInfo,
        currentPersona
      );
      
      console.log(`🔍 Checking goal config - enabled: ${effectiveGoalConfig.enabled}, goals: ${effectiveGoalConfig.goals?.length || 0}`);
      
      if (GoalConfigHelper.isEnabled(effectiveGoalConfig)) {
        const goalSource = GoalConfigHelper.getSourceDescription(effectiveGoalConfig);
        console.log(`🔍 Goal orchestration enabled (${goalSource}): ${effectiveGoalConfig.goals.length} goals configured`);
      } else {
        console.log(`⚠️ Goal orchestration DISABLED - enabled: ${effectiveGoalConfig.enabled}, goals: ${effectiveGoalConfig.goals?.length || 0}`);
      }
      
      if (GoalConfigHelper.isEnabled(effectiveGoalConfig)) {
        
        try {
          // Pass empty history for now - will be enhanced in Phase C with proper state loading
          const conversationTexts: string[] = [];

          goalResult = await this.goalOrchestrator.orchestrateGoals(
            context.text,
            context.conversation_id || 'default',
            context.email_lc,
            context.tenantId,
            effectiveGoalConfig,
            conversationTexts,
            context.source as any, // channel
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
              const prerequisiteIds = (primaryGoal as any).prerequisites 
                || primaryGoal.triggers?.prerequisiteGoals 
                || [];
              console.log(`🚀 Prerequisites required: ${prerequisiteIds.length > 0 ? prerequisiteIds.join(', ') : 'none'}`);
              
              // 🔥 SORT prerequisites by their workflow ORDER (not by array position)
              const prerequisiteGoals = prerequisiteIds
                .map((id: string) => effectiveGoalConfig.goals.find(g => g.id === id))
                .filter((g: any) => g !== undefined);
              
              const sortedPrerequisites = prerequisiteGoals
                .sort((a: any, b: any) => (a.order || 999) - (b.order || 999))
                .map((g: any) => g.id);
              
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
                  await this.channelStateService.setActiveGoals(
                    context.conversation_id,
                    [nextFastTrackGoal],
                    context.tenantId
                  );
                  await this.channelStateService.updateWorkflowState(
                    context.conversation_id,
                    { fastTrackGoals: fastTrackGoalIds },
                    context.tenantId
                  );
                }
              }
            }
          }

          // Phase C: Save extracted data to channel state
          if (this.channelStateService && context.conversation_id) {
            try {
              // Save each extracted field
              for (const [fieldName, fieldValue] of Object.entries(goalResult.extractedInfo || {})) {
                await this.channelStateService.markFieldCaptured(
                  context.conversation_id,
                  fieldName,
                  fieldValue,
                  context.tenantId
                );
              }
              
              // Update active goals
              console.log(`🎯 Active goals from orchestrator: ${JSON.stringify(goalResult.activeGoals)}`);
              if (goalResult.activeGoals.length > 0) {
                await this.channelStateService.setActiveGoals(
                  context.conversation_id,
                  goalResult.activeGoals,
                  context.tenantId
                );
              }
              
              // Mark completed goals
              console.log(`✅ Newly completed goals: ${JSON.stringify(goalResult.stateUpdates.newlyCompleted)}`);
              for (const completedGoalId of goalResult.stateUpdates.newlyCompleted) {
                await this.channelStateService.markGoalCompleted(
                  context.conversation_id,
                  completedGoalId,
                  context.tenantId
                );
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
                    const { EventBridgeClient, PutEventsCommand } = await import('@aws-sdk/client-eventbridge');
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
            } catch (error) {
              console.error('❌ Error saving channel state:', error);
            }
          }

          // Execute actions for newly completed goals
          if (goalResult.stateUpdates?.newlyCompleted && goalResult.stateUpdates.newlyCompleted.length > 0) {
            console.log(`✅ Newly completed goals: ${goalResult.stateUpdates.newlyCompleted.join(', ')}`);
            
            for (const completedGoalId of goalResult.stateUpdates.newlyCompleted) {
              // Find the goal definition using helper
              const completedGoal = GoalConfigHelper.findGoal(effectiveGoalConfig, completedGoalId);
              
              if (completedGoal && completedGoal.actions?.onComplete) {
                // Execute goal actions (publishes events)
                await (this.goalOrchestrator as any).executeGoalActions(completedGoal, {
                  tenantId: context.tenantId,
                  channelId: context.conversation_id,
                  userId: context.email_lc,
                  sessionId: context.conversation_id || 'default',
                  collectedData: goalResult.extractedInfo || {}
                });
              }
            }
          }

        } catch (error) {
          console.warn('Goal orchestration error:', error);
        }
      }

      // Check sharing permissions BEFORE processing (intercept restricted questions)
      if (this.config.companyInfo?.responseGuidelines) {
        const { normalizeSharingPermissions, canShareInformation } = require('./sharing-permissions-utils');
        const normalized = normalizeSharingPermissions(
          this.config.companyInfo.responseGuidelines.informationCategories,
          this.config.companyInfo.responseGuidelines.sharingPermissions
        );
        
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
      const intentMatch = await this.intentService.detectIntent(
        context.text,
        currentPersona,
        this.config.companyInfo || {
          name: 'Planet Fitness9',
          industry: 'Fitness & Wellness',
          description: 'America\'s most popular gym with over 2,400 locations',
          products: 'Gym memberships, fitness equipment, group classes',
          benefits: 'Affordable pricing, judgment-free environment, convenient locations',
          targetCustomers: 'People of all fitness levels looking for an affordable, non-intimidating gym experience',
          differentiators: 'Low cost, no-judgment atmosphere, beginner-friendly environment'
        },
        {
          tenantId: context.tenantId,
          userId: context.email_lc,
          sessionId: context.conversation_id,
          channel: context.source as string
        }
      );

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
        let intentActionResults: IntentActionResult[] = [];
        if (this.intentActionRegistry) {
          try {
            const actionContext: IntentActionContext = {
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
                } else {
                  console.log(`\x1b[31m   ❌ ${result.metadata?.actionName || 'Unknown'}: Failed\x1b[0m`);
                  if (result.error) {
                    console.log(`\x1b[31m      Error: ${result.error.message}\x1b[0m`);
                  }
                }
              }
            }
          } catch (error) {
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
        } else {
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
      let messages: BaseMessage[];
      
      if (existingHistory) {
        // CLI/Local mode: Use provided history
        console.log(`🔍 Using provided chat history: ${existingHistory.length} messages`);
        messages = existingHistory;
        
        // Add current message to the provided history
        const incomingMessage = new HumanMessage({
          content: context.text,
          additional_kwargs: {
            source: context.source,
            channel_context: context.channel_context,
            lead_id: context.lead_id,
          },
        });
        messages.push(incomingMessage);
      } else {
        // Lambda mode: Load from DynamoDB or create new
        const sessionKey = `${context.tenantId}:${context.email_lc}:${context.conversation_id || 'default-session'}`;
        console.log(`🔍 Lambda mode - Session Key: ${sessionKey}`);
        
        const chatHistory = this.config.dynamoService 
          ? new KxDynamoChatHistory({
              tenantId: context.tenantId,
              emailLc: context.email_lc,
              dynamoService: this.config.dynamoService,
              historyLimit: this.config.historyLimit,
              conversationId: context.conversation_id,
            })
          : new MemoryChatHistory(sessionKey);

        // Add the incoming message to history
        const incomingMessage = new HumanMessage({
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
          ? await (chatHistory as KxDynamoChatHistory).getMessagesWithTokenEstimate(3000)
          : await (chatHistory as MemoryChatHistory).getRecentMessages(3000);
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
      
      const processor = new MessageProcessor({
        model: this.model,
        persona: currentPersona,
        companyInfo: this.config.companyInfo,
        actionTagProcessor: this.actionTagProcessor,
        eventBridgeService: this.config.eventBridgeService
      });

      // Define callback for MessageProcessor to persist data and update goal state
      const onDataExtracted = async (extractedData: Record<string, any>, goalResult: GoalOrchestrationResult | null, userMessage?: string) => {
        if (!goalResult) return;

        // 🔄 HANDLE ERROR RECOVERY: User says contact info was wrong
        if (extractedData.wrong_phone || extractedData.wrong_email) {
          const errorField = extractedData.wrong_phone ? 'wrong_phone' : 'wrong_email';
          const actualField = errorField === 'wrong_phone' ? 'phone' : 'email';
          
          // Get the wrong value from CURRENT workflow state (not from LLM extraction)
          let wrongValue: string | null = null;
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
              await this.channelStateService.clearFieldData(
                context.conversation_id,
                actualField,
                context.tenantId
              );
              console.log(`🗑️ Cleared bad ${actualField} from workflow state`);
              
              // Find and reactivate the contact info goal
              const contactGoal = effectiveGoalConfig?.goals.find(g => 
                g.type === 'data_collection' && 
                g.dataToCapture?.fields.includes(actualField)
              );
              
              if (contactGoal) {
                // Remove from completed goals, add back to active goals
                goalResult.completedGoals = goalResult.completedGoals.filter(id => id !== contactGoal.id);
                if (!goalResult.activeGoals.includes(contactGoal.id)) {
                  goalResult.activeGoals.push(contactGoal.id);
                }
                
                // Mark goal as not complete in DynamoDB
                await this.channelStateService.markGoalIncomplete(
                  context.conversation_id,
                  contactGoal.id,
                  context.tenantId
                );
                
                console.log(`✅ Reactivated goal: ${contactGoal.id} (${contactGoal.name})`);
              }
              
              // Store the wrong value for acknowledgment
              goalResult.extractedInfo[`previous_${actualField}`] = wrongValue;
              
            } catch (error) {
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
          } else if (fieldName === 'phone') {
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
              await this.channelStateService.markFieldCaptured(
                context.conversation_id,
                fieldName,
                value,
                context.tenantId
              );
              console.log(`✅ Persisted ${fieldName} to DynamoDB`);
              
              // Auto-detect and persist gender when firstName is captured
              if (fieldName === 'firstName' && !goalResult.extractedInfo['gender']) {
                const detectedGender = this.detectGenderFromName(value);
                if (detectedGender) {
                  console.log(`🎭 Auto-detected gender from name "${value}": ${detectedGender}`);
                  goalResult.extractedInfo['gender'] = detectedGender;
                  await this.channelStateService.markFieldCaptured(
                    context.conversation_id,
                    'gender',
                    detectedGender,
                    context.tenantId
                  );
                  console.log(`✅ Persisted gender to DynamoDB`);
                }
              }
            } catch (error) {
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
            const completedGoalsThisTurn: string[] = [];
            
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
              const hasValidValue = (field: string): boolean => {
                const value = updatedState.capturedData[field];
                if (!value) return false;
                // Handle objects with { value: null } structure (from LLM extraction)
                if (typeof value === 'object' && 'value' in value) {
                  return value.value !== null && value.value !== undefined && value.value !== '';
                }
                // Handle direct values
                if (value === null || value === undefined || value === '') return false;
                
                // 🕐 SCHEDULING VALIDATION: For scheduling goals, require SPECIFIC date/time
                if (goalDef.type === 'scheduling') {
                  // preferredTime must be a SPECIFIC time (e.g., "6pm", "7:30", "18:00")
                  // NOT vague preferences like "evening", "morning", "later than 6", "after 5"
                  if (field === 'preferredTime') {
                    const timeStr = String(value).trim().toLowerCase();
                    
                    // Check if it's a SPECIFIC time (has a number followed by am/pm, or HH:MM format)
                    const isSpecificTime = /^\d{1,2}\s*(am|pm|:\d{2})$/i.test(timeStr) || // "6pm", "7:30", "18:00"
                                          /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(timeStr);   // "7:30pm", "18:00"
                    
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
              
              const capturedFields = requiredFields.filter((field: string) => hasValidValue(field));
              const missingFields = requiredFields.filter((field: string) => !hasValidValue(field));
              const allFieldsCaptured = missingFields.length === 0;
              
              console.log(`  📋 ${goalDef.name} (order ${goalDef.order}):`);
              console.log(`     Required: ${requiredFields.join(', ') || 'none'}`);
              console.log(`     Captured: ${capturedFields.join(', ') || 'none'}`);
              console.log(`     Missing:  ${missingFields.join(', ') || 'none'}`);
              
              if (allFieldsCaptured) {
                console.log(`  ✅ ${goalDef.name}: All data captured! Marking complete.`);
                
                await this.channelStateService.markGoalCompleted(
                  context.conversation_id,
                  goalDef.id,
                  context.tenantId
                );
                
                // Execute goal actions
                if (goalDef.actions?.onComplete) {
                  await (this.goalOrchestrator as any).executeGoalActions(goalDef, {
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
              } else {
                console.log(`  ❌ ${goalDef.name}: Still missing ${missingFields.length} field(s)`);
              }
            }
            
            console.log(`\n📊 Summary: Completed ${completedGoalsThisTurn.length} goal(s) this turn`);
            if (completedGoalsThisTurn.length > 0) {
              console.log(`   Newly completed: ${completedGoalsThisTurn.join(', ')}`);
            }
            
            // Remove completed goals from activeGoals
            goalResult.activeGoals = goalResult.activeGoals.filter((id: string) => !updatedState.completedGoals.includes(id));
            
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
                const prerequisiteIds = (primaryGoal as any).prerequisites 
                  || primaryGoal.triggers?.prerequisiteGoals 
                  || [];
                console.log(`🚀 Prerequisites required: ${prerequisiteIds.length > 0 ? prerequisiteIds.join(', ') : 'none'}`);
                
                // 🔥 SORT prerequisites by their workflow ORDER (not by array position)
                const prerequisiteGoals = prerequisiteIds
                  .map((id: string) => effectiveGoalConfig.goals.find(g => g.id === id))
                  .filter((g: any) => g !== undefined);
                
                const sortedPrerequisites = prerequisiteGoals
                  .sort((a: any, b: any) => (a.order || 999) - (b.order || 999))
                  .map((g: any) => g.id);
                
                console.log(`🚀 Prerequisites sorted by workflow order: ${sortedPrerequisites.join(' → ')}`);
                
                // Determine which goals to activate (sorted prerequisites + primary)
                const fastTrackGoalIds = [...sortedPrerequisites, primaryGoal.id];
                
                // 🔥 PERSIST fast-track goal sequence for future messages
                await this.channelStateService!.updateWorkflowState(
                  context.conversation_id,
                  { fastTrackGoals: fastTrackGoalIds },
                  context.tenantId
                );
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
                  await this.channelStateService!.setActiveGoals(
                    context.conversation_id,
                    [nextFastTrackGoal],
                    context.tenantId
                  );
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
                await this.channelStateService!.setActiveGoals(
                  context.conversation_id,
                  [nextFastTrackGoal],
                  context.tenantId
                );
              } else {
                // All fast-track goals complete - clear fast-track mode and continue with remaining goals
                console.log(`🎉 All fast-track goals complete! Clearing fast-track mode and continuing with remaining goals.`);
                await this.channelStateService!.updateWorkflowState(
                  context.conversation_id,
                  { fastTrackGoals: [] },
                  context.tenantId
                );
                // 🔥 IMPORTANT: Set fastTrackActivated to false so we continue with remaining goals!
                fastTrackActivated = false;
              }
            }
            
            // 🚀 ACTIVATE NEXT INCOMPLETE GOAL (by order) - runs after fast-track completes OR if not fast-tracked
            if (!fastTrackActivated) {
              // Find the first goal that is NOT complete
              const nextIncompleteGoal = sortedGoals.find(g => 
                !updatedState.completedGoals.includes(g.id) &&
                (g.type === 'data_collection' || g.type === 'scheduling')
              );
              
              if (nextIncompleteGoal) {
                console.log(`\n🎯 Next goal to pursue: ${nextIncompleteGoal.name} (order ${nextIncompleteGoal.order})`);
                
                // Set as active if not already
                if (!goalResult.activeGoals.includes(nextIncompleteGoal.id)) {
                  goalResult.activeGoals = [nextIncompleteGoal.id];
                  
                  // Persist to DynamoDB
                  await this.channelStateService!.setActiveGoals(
                    context.conversation_id,
                    [nextIncompleteGoal.id],
                    context.tenantId
                  );
                }
              } else {
                console.log(`\n🎉 ALL GOALS COMPLETE! No more goals to pursue.`);
                goalResult.activeGoals = [];
              }
            }
            
            console.log(`✅ Final activeGoals: ${goalResult.activeGoals.join(', ') || 'none'}`);
          } catch (error) {
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
        (context as any)._followUpQuestion = processingResult.followUpQuestion;
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
          
          await this.channelStateService.updateConversationAggregates(
            context.conversation_id,
            {
              messageText: context.text, // Store the user's message for matching
              interestLevel,
              conversionLikelihood,
              emotionalTone: intentResult.detectedEmotionalTone || 'neutral',
              languageProfile,
              primaryIntent: intentResult.primaryIntent
            },
            context.tenantId
          );
        } catch (error) {
          // Non-blocking - log but don't fail the response
          console.warn(`⚠️ Failed to update conversation aggregates:`, error);
        }
      }

      console.log('🎯 Message processing complete');
      console.log('🎯'.repeat(32) + '\n');

      // Return the response and follow-up question (if any)
      const followUpQuestion = (context as any)._followUpQuestion;
      return {
        response,
        followUpQuestion
      };
    } catch (error) {
      // Emit error event (only if eventBridgeService is available)
      if (this.config.eventBridgeService) {
        await this.config.eventBridgeService.publishAgentError(
          EventBridgeService.createAgentErrorEvent(
            context.tenantId,
            error instanceof Error ? error.message : 'Unknown error',
            {
              contactPk: DynamoDBService.createContactPK(context.tenantId, context.email_lc),
              stack: error instanceof Error ? error.stack : undefined,
              context: {
                source: context.source,
                text_length: context.text.length,
              },
            }
          )
        );
      }
      
      throw error;
    }
  }

  /**
   * Process an agent context and generate chunked responses
   */
  async processMessageChunked(context: AgentContext): Promise<ResponseChunk[]> {
    // Initialize message tracking service on first use (lazy loading)
    // Uses the same channels table with a special createdAt key
    if (!this.messageTrackingService && this.config.dynamoService && this.channelStateService) {
      const dynamoClient = new DynamoDBClient({ region: this.config.awsRegion });
      const docClient = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: {
          removeUndefinedValues: true,
        },
      });
      const channelsTable = process.env.CHANNELS_TABLE || 'KxGen-channels-v2';
      const { MessageTrackingService } = await import('./message-tracking-service.js');
      this.messageTrackingService = new MessageTrackingService(docClient, channelsTable);
      console.log(`📍 Message tracking service initialized (reusing channels table: ${channelsTable})`);
    }
    
    // STEP 1: Check for previous response and handle rollback if interrupted
    let responseToMessageId: string | undefined;
    
    if (this.messageTrackingService && context.channelId && this.channelStateService) {
      try {
        // Check if there's a previous response still being processed
        const previousMessageId = await this.messageTrackingService.getCurrentMessageId(
          context.tenantId,
          context.channelId
        );
        
        if (previousMessageId) {
          console.log(`⚠️ Previous response ${previousMessageId} was interrupted by new message`);
          
          // Get state snapshot for rollback
          const snapshot = await this.messageTrackingService.getStateSnapshot(
            context.tenantId,
            context.channelId
          );
          
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
        responseToMessageId = await this.messageTrackingService.startTracking(
          context.tenantId,
          context.channelId,
          context.senderId || context.email_lc,
          stateSnapshot
        );
        
        console.log(`📍 Started tracking response: ${responseToMessageId}`);
      } catch (error) {
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
        currentPersona = await this.personaService.getPersona(
          context.tenantId, 
          this.config.personaId || 'carlos',
          this.config.companyInfo
        );
      } catch (error) {
        console.warn(`Failed to load persona for chunking, using fallback:`, error);
        // Use PersonaService fallback to ensure goalConfiguration is loaded
        currentPersona = this.personaService.getDefaultPersona(this.config.personaId || 'carlos', this.config.companyInfo);
      }
    }

    // STEP 5: Chunk the response and attach responseToMessageId
    const chunks = ResponseChunker.chunkResponse(
      fullResponse,
      context.source,
      currentPersona.responseChunking,
      responseToMessageId
    );
    
    // STEP 6: If there's a follow-up question, add it as a separate delayed chunk
    const followUpQuestion = (context as any)._followUpQuestion;
    if (followUpQuestion) {
      console.log(`💬 Adding follow-up question as separate message: "${followUpQuestion}"`);
      
      // Calculate total delay of all main chunks to know when to send the question
      const totalMainDelay = chunks.reduce((sum, chunk) => sum + chunk.delayMs, 0);
      
      // Add extra delay (thinking time) before the question
      const questionDelay = totalMainDelay + 2000; // 2 seconds after last main chunk
      
      // Create a follow-up question chunk
      const questionChunk: ResponseChunk = {
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
  private createPromptTemplate(context: AgentContext, persona?: AgentPersona, goalResult?: any, preExtractedData?: Record<string, any>, intentDetectionResult?: IntentDetectionResult | null): PromptTemplate {
    // Use the provided persona or fall back to the instance persona
    const systemPrompt = this.getSystemPrompt(context, persona || this.persona, goalResult, preExtractedData, intentDetectionResult);
    
    return PromptTemplate.fromTemplate(`${systemPrompt}

Current conversation:
{history}

Human: {input}
Assistant:`);
  }

  /**
   * Get system prompt based on persona and context
   */
  private getSystemPrompt(
    context: AgentContext, 
    persona: AgentPersona, 
    goalResult?: any, 
    preExtractedData?: Record<string, any>,
    intentDetectionResult?: IntentDetectionResult | null
  ): string {
    // CRITICAL: Build verbosity constraint FIRST - this must be the TOP priority
    const verbosity = (persona as any)?.personalityTraits?.verbosity || 5;
    const verbosityRule = VerbosityHelper.getSystemPromptRule(verbosity);
    
    // ❌ REMOVED: Goal rules from conversational prompt
    // Goal-driven questions are now handled by a separate, focused LLM request
    // This allows the conversational response to be natural and not conflicted
    
    // Build CRITICAL information sharing policy (THIRD highest priority)
    let sharingPolicyRule = '';
    if (this.config.companyInfo?.responseGuidelines) {
      const { normalizeSharingPermissions, canShareInformation } = require('./sharing-permissions-utils');
      const normalized = normalizeSharingPermissions(
        this.config.companyInfo.responseGuidelines.informationCategories,
        this.config.companyInfo.responseGuidelines.sharingPermissions
      );
      
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
    if ((persona as any).personalityTraits) {
      const { PersonalityTraitsInterpreter } = require('./personality-traits-interpreter.js');
      const traitsSection = PersonalityTraitsInterpreter.generatePromptSection((persona as any).personalityTraits);
      systemPrompt += traitsSection;
    }
    
    // If personality quirks are defined, inject them as specific behaviors
    if ((persona as any).personalityQuirks && Array.isArray((persona as any).personalityQuirks) && (persona as any).personalityQuirks.length > 0) {
      const quirksSection = `

PERSONALITY QUIRKS & MANNERISMS:
${(persona as any).personalityQuirks.map((quirk: string) => `- ${quirk}`).join('\n')}`;
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
      companyInfoSection = this.buildSelectiveCompanyInfo(
        this.config.companyInfo,
        intentDetectionResult.companyInfoRequested
      );
    } else {
      // Default: Always include hours and contact for context (but condensed)
      if (this.config.companyInfo) {
        companyInfoSection = this.buildSelectiveCompanyInfo(
          this.config.companyInfo,
          ['hours', 'contact', 'location']
        );
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
  async processMessageStructured(context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      const result = await this.processMessage(context);
      const response = result.response;
      const processingTime = Date.now() - startTime;
      
      // Check if we detected an intent during processing
      let intentData: AgentResponse['intent'] | undefined;
      
      // Re-run intent detection to get the metadata (this is cached/fast)
      let currentPersona: AgentPersona;
      if (this.personaService && this.config.personaId) {
        try {
          currentPersona = await this.personaService.getPersona('default', this.config.personaId, this.config.companyInfo);
        } catch (error) {
          currentPersona = getPersona(this.config.personaId || 'carlos');
        }
      } else {
        currentPersona = getPersona(this.config.personaId || 'carlos');
      }

      const intentMatch = await this.intentService.detectIntent(
        context.text,
        currentPersona,
        this.config.companyInfo || {
          name: 'Planet Fitness9',
          industry: 'Fitness & Wellness',
          description: 'America\'s most popular gym with over 2,400 locations',
          products: 'Gym memberships, fitness equipment, group classes',
          benefits: 'Affordable pricing, judgment-free environment, convenient locations',
          targetCustomers: 'People of all fitness levels looking for an affordable, non-intimidating gym experience',
          differentiators: 'Low cost, no-judgment atmosphere, beginner-friendly environment'
        },
        {
          tenantId: context.tenantId,
          userId: context.email_lc,
          sessionId: context.conversation_id,
          channel: context.source as string
        }
      );

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

    } catch (error) {
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
  private getRequiredFieldNames(goal: any): string[] {
    if (!goal.dataToCapture?.fields) return [];
    
    const fields = goal.dataToCapture.fields;
    
    // NEW FORMAT: Array of field objects
    if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
      return fields
        .filter((f: any) => f.required)
        .map((f: any) => f.name);
    }
    
    // OLD FORMAT: Use validationRules
    const rules = goal.dataToCapture.validationRules || {};
    return fields.filter((fieldName: string) => {
      const fieldRules = rules[fieldName];
      return fieldRules?.required !== false; // Default to required
    });
  }

  /**
   * Helper: Get ALL field names from goal (not just required)
   */
  private getFieldNamesForGoal(goal: any): string[] {
    if (!goal.dataToCapture?.fields) return [];
    
    const fields = goal.dataToCapture.fields;
    
    // NEW FORMAT: Array of field objects
    if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
      return fields.map((f: any) => f.name);
    }
    
    // OLD FORMAT: String array
    return fields;
  }

  /**
   * Detect gender from first name
   */
  private detectGenderFromName(firstName: string): 'female' | 'male' | null {
    if (!firstName) return null;
    
    const nameLower = firstName.toLowerCase();
    
    // Common female name patterns
    const femaleNames = ['sara', 'sarah', 'maria', 'jessica', 'jennifer', 'amy', 'emily', 'ashley', 'michelle', 'lisa', 'karen', 'susan', 'donna', 'carol', 'ruth', 'sharon', 'laura', 'angela', 'stephanie', 'rebecca', 'deborah', 'rachel', 'catherine', 'anna', 'emma', 'olivia', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'ella', 'scarlett', 'grace', 'lily', 'chloe', 'victoria', 'madison', 'lucy', 'hannah', 'zoe', 'stella', 'hazel', 'violet', 'aurora', 'savannah', 'audrey', 'brooklyn', 'bella', 'claire', 'skylar', 'lucy', 'paisley', 'everly', 'anna', 'caroline', 'nova', 'genesis', 'emilia', 'kennedy'];
    
    // Common male name patterns
    const maleNames = ['david', 'michael', 'john', 'james', 'robert', 'william', 'richard', 'joseph', 'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'henry', 'nathan', 'douglas', 'zachary', 'peter', 'kyle', 'walter', 'ethan', 'jeremy', 'harold', 'keith', 'christian', 'roger', 'noah', 'gerald', 'carl', 'terry', 'sean', 'austin', 'arthur', 'lawrence', 'jesse', 'dylan', 'bryan', 'joe', 'jordan', 'billy', 'bruce', 'albert', 'willie', 'gabriel', 'logan', 'alan', 'juan', 'wayne', 'roy', 'ralph', 'randy', 'eugene', 'vincent', 'russell', 'elijah', 'louis', 'bobby', 'philip', 'johnny'];
    
    if (femaleNames.includes(nameLower)) {
      return 'female';
    } else if (maleNames.includes(nameLower)) {
      return 'male';
    } else if (nameLower.endsWith('a') || nameLower.endsWith('elle') || nameLower.endsWith('ette')) {
      return 'female'; // Common female name endings
    }
    
    return null;
  }

  /**
   * Determine preferred channel for response based on context and tenant preferences
   */
  determinePreferredChannel(context: AgentContext, tenantPreferences?: Record<string, any>): MessageSource {
    // Default to the originating channel
    if (tenantPreferences?.preferredChannel) {
      return tenantPreferences.preferredChannel as MessageSource;
    }
    
    return context.source;
  }

  /**
   * Create routing information for the response
   */
  createRoutingInfo(context: AgentContext, preferredChannel: MessageSource): {
    sms?: { to: string };
    email?: { to: string };
    chat?: { sessionId: string };
  } {
    const routing: any = {};
    
    if (preferredChannel === 'sms' && context.channel_context?.sms) {
      routing.sms = { to: context.channel_context.sms.from };
    } else if (preferredChannel === 'email' && context.channel_context?.email) {
      routing.email = { to: context.channel_context.email.from };
    } else if (preferredChannel === 'chat' && context.channel_context?.chat) {
      routing.chat = { sessionId: context.channel_context.chat.sessionId };
    }
    
    return routing;
  }

  /**
   * Infer interest level from intent when LLM doesn't provide it
   */
  private inferInterestLevel(intentResult: any): number {
    // Base interest by intent type
    const intentInterest: Record<string, number> = {
      'scheduling': 4,           // High - they want to book
      'workflow_data_capture': 4, // High - providing info
      'company_info_request': 3,  // Medium - curious
      'general_conversation': 3,  // Medium - engaged
      'objection': 2,            // Low - resistance
      'end_conversation': 2,     // Low - leaving
      'unknown': 3               // Default
    };
    
    let interest = intentInterest[intentResult.primaryIntent] || 3;
    
    // Adjust based on emotional tone
    const tone = intentResult.detectedEmotionalTone;
    if (tone === 'positive') interest = Math.min(5, interest + 1);
    if (tone === 'frustrated' || tone === 'negative') interest = Math.max(1, interest - 1);
    
    // Boost if they provided data
    if (intentResult.extractedData && Array.isArray(intentResult.extractedData) && intentResult.extractedData.length > 0) {
      interest = Math.min(5, interest + 0.5);
    }
    
    return Math.round(interest * 10) / 10; // 1 decimal place
  }

  /**
   * Infer conversion likelihood from intent when LLM doesn't provide it
   */
  private inferConversionLikelihood(intentResult: any): number {
    // Base likelihood by intent type
    const intentLikelihood: Record<string, number> = {
      'scheduling': 0.8,          // High - they want to book
      'workflow_data_capture': 0.7, // Good - providing info
      'company_info_request': 0.5,  // Medium - researching
      'general_conversation': 0.4,  // Lower - just chatting
      'objection': 0.3,            // Low - resistance
      'end_conversation': 0.2,     // Low - leaving
      'unknown': 0.4               // Default
    };
    
    let likelihood = intentLikelihood[intentResult.primaryIntent] || 0.4;
    
    // Adjust based on emotional tone
    const tone = intentResult.detectedEmotionalTone;
    if (tone === 'positive') likelihood = Math.min(1, likelihood + 0.1);
    if (tone === 'urgent') likelihood = Math.min(1, likelihood + 0.15);
    if (tone === 'frustrated' || tone === 'negative') likelihood = Math.max(0, likelihood - 0.1);
    
    // Boost if they provided contact info
    if (intentResult.extractedData && Array.isArray(intentResult.extractedData)) {
      const hasContact = intentResult.extractedData.some((d: any) => 
        d.field === 'email' || d.field === 'phone'
      );
      if (hasContact) likelihood = Math.min(1, likelihood + 0.2);
    }
    
    return Math.round(likelihood * 100) / 100; // 2 decimal places
  }
}