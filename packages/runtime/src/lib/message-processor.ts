/**
 * Message Processor
 * 
 * Handles the three-request architecture for processing user messages:
 * 1. Intent Detection & Context Analysis
 * 2. Conversational Response Generation
 * 3. Follow-Up Generation (Verification or Goal Question)
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { AgentPersona } from '../config/personas.js';
import type { CompanyInfo } from './persona-service.js';
import type { GoalOrchestrationResult } from './goal-orchestrator.js';
import { VerbosityHelper } from './verbosity-config.js';
import { GoalConfigHelper, type EffectiveGoalConfig } from './goal-config-helper.js';
import { ActionTagProcessor } from './action-tag-processor.js';
import { buildDateNormalizationPrompt } from './date-normalizer.js';
import { EventBridgeService, type LLMUsageEvent } from './eventbridge.js';

// Zod schema for sentence list (structured output)
const SentenceListSchema = z.object({
  sentences: z.array(z.string().min(1)).describe('An array of complete, standalone sentences.'),
});

// Zod schema for intent detection
const IntentDetectionSchema = z.object({
  primaryIntent: z.enum([
    "company_info_request",
    "workflow_data_capture",
    "general_conversation",
    "objection",
    "scheduling",
    "end_conversation",
    "unknown"
  ]).describe("The primary intent of the user's message."),
  
  // NEW: Array of extracted data (supports multiple fields in one message)
  extractedData: z.array(z.object({
    field: z.enum([
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
    value: z.string().describe("The actual extracted value (e.g., 'Sara', 'david@example.com', '(954) 123-4567')")
  })).nullable().describe("Array of extracted workflow data. If user provides multiple pieces of data (e.g., 'Sara Chocron' or 'email and phone'), extract ALL of them as separate objects. Otherwise, null."),
  
  // DEPRECATED: Keep for backward compatibility
  detectedWorkflowIntent: z.union([
    z.literal("email"),
    z.literal("phone"),
    z.literal("firstName"),
    z.literal("lastName"),
    z.literal("gender"),
    z.literal("primaryGoal"),
    z.literal("motivationReason"),
    z.literal("motivationCategories"),
    z.literal("timeline"),
    z.literal("height"),
    z.literal("weight"),
    z.literal("bodyFatPercentage"),
    z.literal("injuries"),
    z.literal("medicalConditions"),
    z.literal("physicalLimitations"),
    z.literal("doctorClearance"),
    z.literal("preferredDate"),
    z.literal("preferredTime"),
    z.literal("normalizedDateTime"),
    z.literal("wrong_phone"),
    z.literal("wrong_email"),
    z.null()
  ]).nullable().describe("DEPRECATED: Use extractedData instead. Single field extraction."),
  extractedValue: z.string().nullable().describe("DEPRECATED: Use extractedData instead."),
  
  companyInfoRequested: z.array(z.enum([
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
  requiresDeepContext: z.boolean().describe("True if the conversation requires more than the last 10 messages for full context."),
  conversationComplexity: z.enum(["simple", "moderate", "complex"]).describe("The complexity of the current conversation turn."),
  detectedEmotionalTone: z.enum(["positive", "neutral", "negative", "frustrated", "urgent"]).nullable().describe("The detected emotional tone of the user's message."),
  
  // 🎯 NEW: Engagement & Conversion Metrics
  interestLevel: z.number().min(1).max(5).describe("User's interest level 1-5. 1=disengaged/cold, 3=neutral/curious, 5=highly engaged/eager."),
  conversionLikelihood: z.number().min(0).max(1).describe("Likelihood user will convert (0.0-1.0). Based on buying signals, urgency, specificity of questions."),
  
  // 🎯 NEW: Language Profile (for personalization)
  languageProfile: z.object({
    formality: z.number().min(1).max(5).describe("1=very casual/slang, 3=neutral, 5=very formal/professional"),
    hypeTolerance: z.number().min(1).max(5).describe("1=prefers calm/factual, 3=neutral, 5=loves energy/hype/enthusiasm"),
    emojiUsage: z.number().min(0).max(5).describe("0=no emojis used, 5=heavy emoji usage"),
    language: z.string().describe("Detected language code (e.g., 'en', 'es', 'fr')")
  }).describe("Analysis of user's communication style for personalization.")
});

export type IntentDetectionResult = z.infer<typeof IntentDetectionSchema>;

export interface MessageProcessorConfig {
  model: ChatBedrockConverse;
  persona: AgentPersona;
  companyInfo?: CompanyInfo;
  actionTagProcessor: ActionTagProcessor;
}

export interface ProcessingContext {
  userMessage: string;
  messages: BaseMessage[];
  goalResult: GoalOrchestrationResult | null;
  effectiveGoalConfig: EffectiveGoalConfig;
  channelState?: any; // Add channel state to know what's already captured
  onDataExtracted?: (extractedData: Record<string, any>, goalResult: GoalOrchestrationResult | null, userMessage?: string) => Promise<void>;
  // Tracking context for LLM usage events
  tenantId?: string;
  channelId?: string;
  messageSource?: string; // 'chat', 'sms', 'email', etc.
}

export interface ProcessingResult {
  response: string;
  followUpQuestion?: string;
  intentDetectionResult: IntentDetectionResult | null;
  preExtractedData: Record<string, any>;
}

/**
 * Processes user messages through a three-request architecture
 */
// Force reload - v2.0
export class MessageProcessor {
  private model: ChatBedrockConverse;
  private persona: AgentPersona;
  private companyInfo?: CompanyInfo;
  private actionTagProcessor: ActionTagProcessor;
  private eventBridgeService?: EventBridgeService;
  
  // Tracking context
  private tenantId?: string;
  private channelId?: string;
  private messageSource?: string;

  constructor(config: MessageProcessorConfig & { eventBridgeService?: EventBridgeService }) {
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
  private getIdentityEnforcement(): string {
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
  private async emitPresenceEvent(
    eventType: 'chat.received' | 'chat.read' | 'chat.typing' | 'chat.stoppedTyping'
  ): Promise<void> {
    if (!this.eventBridgeService) {
      console.log(`📡 Presence event [${eventType}]: (no EventBridge configured)`);
      return;
    }
    
    try {
      await this.eventBridgeService.publishCustomEvent(
        'kxgen.agent',
        eventType,
        {
          channelId: this.channelId,
          tenantId: this.tenantId,
          personaId: undefined, // Will be set by handler context if needed
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      // Don't let presence events break the flow
      console.error(`❌ Error emitting presence event ${eventType}:`, error);
    }
  }
  
  /**
   * Extract and emit token usage from LLM response
   */
  private async emitTokenUsage(
    response: any,
    requestType: LLMUsageEvent['requestType']
  ): Promise<void> {
    try {
      // LangChain provides usage_metadata on AIMessage responses
      const usageMetadata = response?.usage_metadata;
      
      if (usageMetadata) {
        const inputTokens = usageMetadata.input_tokens || 0;
        const outputTokens = usageMetadata.output_tokens || 0;
        const totalTokens = usageMetadata.total_tokens || (inputTokens + outputTokens);
        
        // Calculate estimated cost based on model pricing
        const estimatedCostUsd = this.calculateTokenCost(
          (this.model as any).model || 'unknown',
          inputTokens,
          outputTokens
        );
        
        const usageEvent: LLMUsageEvent = {
          tenantId: this.tenantId || 'unknown',
          channelId: this.channelId,
          source: this.messageSource || 'unknown',
          requestType,
          model: (this.model as any).model || 'unknown',
          inputTokens,
          outputTokens,
          totalTokens,
          timestamp: new Date().toISOString(),
          estimatedCostUsd,
        };
        
        // Emit to EventBridge (will also console.log)
        if (this.eventBridgeService) {
          await this.eventBridgeService.publishLLMUsage(usageEvent);
        } else {
          // Just log if no EventBridge configured
          console.log(`📊 LLM Usage [${requestType}]: Input=${inputTokens}, Output=${outputTokens}, Total=${totalTokens}, Cost=$${estimatedCostUsd.toFixed(6)}`);
        }
      } else {
        console.log(`⚠️ No usage_metadata in response for ${requestType}`);
      }
    } catch (error) {
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
  private calculateTokenCost(model: string, inputTokens: number, outputTokens: number): number {
    // Pricing per 1K tokens (USD)
    const pricing: Record<string, { input: number; output: number }> = {
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
  async process(context: ProcessingContext): Promise<ProcessingResult> {
    const { userMessage, messages, goalResult, effectiveGoalConfig, channelState, onDataExtracted } = context;
    
    // Set tracking context for token usage events
    this.tenantId = context.tenantId;
    this.channelId = context.channelId;
    this.messageSource = context.messageSource;

    // REQUEST #1: Intent Detection (must happen FIRST to extract data)
    const intentDetectionResult = await this.performIntentDetection(
      userMessage,
      messages,
      goalResult,
      effectiveGoalConfig,
      channelState
    );
    
    // 👁️ Emit chat.read - we've "read" and understood the message
    await this.emitPresenceEvent('chat.read');

    // Extract data from BOTH goal orchestrator AND intent detection
    const preExtractedData: Record<string, any> = goalResult?.extractedInfo || {};
    
    // 🔥 PRE-LLM EXTRACTION: Handle simple single-word time answers that LLM keeps misinterpreting as greetings
    // If we're asking for preferredTime and user says "evening", "morning", etc., extract it directly!
    const activeGoals = goalResult?.activeGoals || [];
    const isAskingForTime = activeGoals.some(goalId => {
      const goalDef = GoalConfigHelper.findGoal(effectiveGoalConfig, goalId);
      const fields = goalDef?.dataToCapture?.fields || [];
      const fieldNames = Array.isArray(fields) 
        ? fields.map((f: any) => typeof f === 'string' ? f : f.name).filter(Boolean)
        : [];
      return fieldNames.includes('preferredTime');
    });
    
    if (isAskingForTime) {
      const messageLowerForTime = userMessage.toLowerCase();
      
      // Check if message CONTAINS time preference keywords (not exact match)
      // This handles "I like the night", "evening works", "prefer mornings", etc.
      const timeKeywordPatterns: Array<{pattern: RegExp, value: string}> = [
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
    const motivationPatterns: Array<{pattern: RegExp, reason: string, categories: string}> = [
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
    const response = await this.generateConversationalResponse(
      userMessage,
      messages,
      intentDetectionResult,
      preExtractedData,
      goalResult,
      effectiveGoalConfig,
      channelState
    );
    
    // ⌨️ Emit chat.typing - we're now "typing" the response
    await this.emitPresenceEvent('chat.typing');

    // REQUEST #3: Follow-Up Generation (now uses updated goalResult.activeGoals)
    const followUpQuestion = await this.generateFollowUp(
      preExtractedData,
      goalResult,
      effectiveGoalConfig,
      channelState,
      messages,
      intentDetectionResult,
      userMessage
    );

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
  private async performIntentDetection(
    userMessage: string,
    messages: BaseMessage[],
    goalResult: GoalOrchestrationResult | null,
    effectiveGoalConfig: EffectiveGoalConfig,
    channelState?: any
  ): Promise<IntentDetectionResult | null> {
    console.log('\n' + '🎯'.repeat(32));
    console.log('🎯 REQUEST #1: Intent Detection & Context Analysis');
    console.log('🎯'.repeat(32) + '\n');

    // Get the last 5 messages for intent detection (minimal context)
    const recentMessagesForIntent = messages.slice(-5);
    
    // Build intent detection prompt
    const activeGoalsForIntent = goalResult?.activeGoals || [];
    const activeGoalDefinitions = GoalConfigHelper.findGoals(effectiveGoalConfig, activeGoalsForIntent);
    const completedGoals = goalResult?.completedGoals || [];
    
    // 🔥 IMPORTANT: Use PERSISTENT captured data from channelState, not just current turn's extractedInfo
    // This ensures the LLM knows what's already been captured across ALL previous messages
    const persistentCapturedData = channelState?.capturedData || {};
    const currentTurnData = goalResult?.extractedInfo || {};
    const capturedData = { ...persistentCapturedData, ...currentTurnData };
    
    const intentDetectionPrompt = this.buildIntentDetectionPrompt(
      userMessage,
      recentMessagesForIntent,
      activeGoalDefinitions,
      completedGoals,
      capturedData
    );
    
    // Call LLM for intent detection
    try {
      const intentDetectionModel = (this.model as any).withStructuredOutput(IntentDetectionSchema);
      
      const result = await intentDetectionModel.invoke([
        new HumanMessage(intentDetectionPrompt)
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
    } catch (error) {
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
  private async generateConversationalResponse(
    userMessage: string,
    messages: BaseMessage[],
    intentDetectionResult: IntentDetectionResult | null,
    preExtractedData: Record<string, any>,
    goalResult: GoalOrchestrationResult | null,
    effectiveGoalConfig: EffectiveGoalConfig,
    channelState?: any
  ): Promise<string> {
    console.log('\n' + '💬'.repeat(32));
    console.log('💬 REQUEST #2: Generating Conversational Response');
    console.log('💬'.repeat(32) + '\n');

    const verbosity = (this.persona as any)?.personalityTraits?.verbosity || 5;
    const verbosityConfig = VerbosityHelper.getConfig(verbosity);
    const { maxSentences } = verbosityConfig;

    // Determine history limit based on intent detection
    const historyLimit = intentDetectionResult?.requiresDeepContext === true 
      ? Math.min(messages.length - 1, 30)  // Deep context: up to 30 messages
      : Math.min(messages.length - 1, 10); // Normal: last 10 messages
    
    console.log(`📚 Loading ${historyLimit} messages for conversational response (deep context: ${intentDetectionResult?.requiresDeepContext})`);
    
    // Create memory with messages
    const memory = new BufferMemory({
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
    const systemPrompt = this.buildSystemPrompt(
      goalResult,
      preExtractedData,
      intentDetectionResult,
      channelState
    );

    // 🚨 DISABLED: Structured output is unreliable with Bedrock (30% failure rate)
    console.log(`🎯 Using PLAIN TEXT mode (withStructuredOutput is unreliable)`);
    
    // Get conversation history
    const historyMessagesForPrompt = await memory.chatHistory.getMessages();
    const historyText = historyMessagesForPrompt
      .map((msg: BaseMessage) => `${msg._getType() === 'human' ? 'Human' : 'AI'}: ${msg.content}`)
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
      new HumanMessage(`${companyIdentityReminder}${systemPrompt}\n\nConversation history:\n${historyText}\n\nHuman: ${userMessage}\n\nAI:`)
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
  private async generateFollowUp(
    preExtractedData: Record<string, any>,
    goalResult: GoalOrchestrationResult | null,
    effectiveGoalConfig: EffectiveGoalConfig,
    channelState: any,
    messages: BaseMessage[],
    intentDetectionResult?: IntentDetectionResult | null,
    userMessage?: string
  ): Promise<string | undefined> {
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
      } else {
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
      const nextActiveGoals = goalResult?.activeGoals?.filter(
        goalId => goalId !== 'collect_contact_info' && !goalId.includes('contact_info')
      ) || [];
      
      if (nextActiveGoals.length > 0) {
        console.log(`🎯 After contact capture, next goals: ${nextActiveGoals.join(', ')}`);
        // Generate a follow-up question for the next goal
        const nextGoalResult: GoalOrchestrationResult = {
          ...goalResult!,
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
      const effectiveGoalResult: GoalOrchestrationResult = goalResult || {
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
    } else if (channelState?.messageCount === 0) {
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
  private async generateEngagementQuestion(recentMessages?: BaseMessage[], channelState?: any): Promise<string> {
    console.log(`💬 Generating engagement question for first message`);
    
    const companyName = this.companyInfo?.name || 'our company';
    
    // Get last 2 messages for context
    const contextMessages = recentMessages ? recentMessages.slice(-2) : [];
    const conversationContext = contextMessages.length > 0
      ? contextMessages.map((msg: BaseMessage) => 
          `${msg._getType() === 'human' ? 'User' : 'You'}: ${msg.content}`
        ).join('\n')
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

    const questionModel = new ChatBedrockConverse({
      model: this.model.model,
      region: this.model.region,
      temperature: 0.7,
      maxTokens: 100,
      max_tokens: 100,
    } as any);
    
    const questionResponse = await questionModel.invoke([
      new HumanMessage(questionPrompt)
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
  private async generateErrorRecoveryMessage(fieldType: 'phone' | 'email', wrongValue: string, channelState?: any): Promise<string> {
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
      const response = await this.model.invoke([new HumanMessage(errorPrompt)]);
      
      // Emit token usage for error recovery
      await this.emitTokenUsage(response, 'error_recovery');
      
      const errorRecoveryMessage = response.content.toString().trim();
      
      console.log(`✅ Generated error recovery message: "${errorRecoveryMessage}"`);
      return errorRecoveryMessage;
    } catch (error) {
      console.error('❌ Error generating error recovery message:', error);
      return `Oh damn, my bad! Let me double-check that ${fieldType}. I have ${wrongValue} on file - is that correct?`;
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: any): boolean {
    if (!email) return false;
    const value = typeof email === 'object' && (email as any).value ? (email as any).value : email;
    if (typeof value !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  /**
   * Validate phone format (must contain digits)
   */
  private isValidPhone(phone: any): boolean {
    if (!phone) return false;
    const value = typeof phone === 'object' && (phone as any).value ? (phone as any).value : phone;
    if (typeof value !== 'string') return false;
    // Must contain at least 7 digits (to avoid "I think by phone")
    const digitsOnly = value.replace(/\D/g, '');
    return digitsOnly.length >= 7;
  }

  /**
   * Generate verification message when contact info is captured
   */
  private async generateVerificationMessage(preExtractedData: Record<string, any>, channelState?: any): Promise<string> {
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
    
    const personaRole = (this.persona as any).role || 'team member';
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

    const verificationModel = new ChatBedrockConverse({
      model: this.model.model,
      region: this.model.region,
      temperature: 0.7,
      maxTokens: 50,
      max_tokens: 50,
    } as any);
    
    const verificationResponse = await verificationModel.invoke([
      new HumanMessage(verificationPrompt)
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
  private async generateExitMessage(
    effectiveGoalConfig: EffectiveGoalConfig,
    channelState: any,
    messages: BaseMessage[]
  ): Promise<string> {
    console.log('👋 Generating exit message...');
    
    const companyName = this.companyInfo?.name || 'our company';
    const capturedData = channelState?.capturedData || {};
    const completedGoals = channelState?.completedGoals || [];
    
    // Find the primary goal
    const primaryGoal = effectiveGoalConfig.goals.find(g => (g as any).isPrimary);
    
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
    
    let exitPrompt: string;
    
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
    } else {
      // 🎯 Primary goal NOT achieved - gentle last-ditch attempt
      console.log('⚠️ Primary goal NOT achieved - generating last-ditch attempt');
      
      // Figure out what's missing for the primary goal
      let missingForPrimary: string[] = [];
      if (primaryGoal) {
        // Check both root-level 'prerequisites' AND 'triggers.prerequisiteGoals'
        const prerequisites = (primaryGoal as any).prerequisites 
          || primaryGoal.triggers?.prerequisiteGoals 
          || [];
        const allNeeded = [...prerequisites, primaryGoal.id];
        
        for (const goalId of allNeeded) {
          const goalDef = effectiveGoalConfig.goals.find(g => g.id === goalId);
          if (goalDef && !completedGoals.includes(goalId)) {
            // Get fields for this goal
            const fields = (goalDef as any).dataToCapture?.fields || [];
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
    
    const exitModel = new ChatBedrockConverse({
      model: this.model.model,
      region: this.model.region,
      temperature: 0.7,
      maxTokens: 150,
      max_tokens: 150,
    } as any);
    
    const exitResponse = await exitModel.invoke([
      new HumanMessage(exitPrompt)
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
  private async generateGoalQuestion(
    goalResult: GoalOrchestrationResult,
    effectiveGoalConfig: EffectiveGoalConfig,
    channelState: any,
    recentMessages?: BaseMessage[],
    userMessage?: string,
    detectedIntent?: string
  ): Promise<string | undefined> {
    console.log(`🎯 Active goals for question generation: ${goalResult.activeGoals.join(', ')}`);
    
    // Find the most urgent active goal
    const mostUrgentGoal = GoalConfigHelper.getMostUrgentGoal(
      goalResult.activeGoals,
      effectiveGoalConfig
    );
    
    if (!mostUrgentGoal) {
      console.log('ℹ️ No urgent goal found for question generation');
      return undefined;
    }
    
    const activeGoalId = mostUrgentGoal.id;
    const goalConfig = mostUrgentGoal;
    const recommendation = goalResult.recommendations.find((r: any) => r.goalId === activeGoalId);
    
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
      ? contextMessages.map((msg: BaseMessage) => 
          `${msg._getType() === 'human' ? 'User' : 'You'}: ${msg.content}`
        ).join('\n')
      : 'No recent context';
    
    // Determine what specific data we need for this goal
    // CRITICAL FIX: Use channelState.capturedData (persistent) AND goalResult.extractedInfo (current turn)
    const rawFields = goalConfig.dataToCapture?.fields || [];
    
    // Handle both old format (string array) and new format (object array)
    const dataNeeded: string[] = rawFields.map((field: any) => 
      typeof field === 'string' ? field : field.name
    );
    
    // Combine persistent captured data with data extracted THIS TURN
    // CRITICAL: Filter out fields that have null values or {value: null} objects
    const hasActualValue = (val: any): boolean => {
      if (val === null || val === undefined || val === 'null') return false;
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
    
    const stillNeeded = dataNeeded.filter((field: string) => !alreadyCaptured.includes(field));
    
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
    const capturedDataMap: Record<string, any> = {};
    for (const field of alreadyCaptured) {
      // Check goalResult.extractedInfo FIRST (new data from this turn)
      const newValue = goalResult.extractedInfo?.[field];
      const persistedValue = channelState?.capturedData?.[field];
      
      // Use new value if it exists and is not empty, otherwise fall back to persisted
      if (newValue !== undefined && newValue !== null && newValue !== '') {
        capturedDataMap[field] = newValue;
      } else {
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
      ? `\nEXAMPLES:\n${goalInstruction.examples.map((e: string) => `- ${e}`).join('\n')}`
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

    const questionModel = new ChatBedrockConverse({
      model: this.model.model,
      region: this.model.region,
      temperature: 0.4, // Slight creativity for personality
      maxTokens: 60, // Slightly more room for multi-field questions
      max_tokens: 60,
    } as any);
    
    const questionResponse = await questionModel.invoke([
      new HumanMessage(questionPrompt)
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
  private buildIntentDetectionPrompt(
    userMessage: string,
    recentMessages: BaseMessage[],
    activeGoals: any[],
    completedGoals: string[] = [],
    capturedData: Record<string, any> = {}
  ): string {
    const recentHistory = recentMessages
      .map((msg: BaseMessage) => `${msg._getType() === 'human' ? 'Human' : 'AI'}: ${msg.content}`)
      .join('\n');
    
    // Build detailed goal info including fields still needed
    const goalsList = activeGoals.length > 0
      ? activeGoals.map(g => {
          const fields = g.dataToCapture?.fields || [];
          const fieldNames = Array.isArray(fields) 
            ? fields.map((f: any) => typeof f === 'string' ? f : f.name).filter(Boolean)
            : [];
          // Filter out already captured fields
          const stillNeeded = fieldNames.filter((f: string) => !capturedData[f]);
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
          (this.companyInfo as any).address && `- Address`,
          this.companyInfo.services && `- Services Offered`,
          this.companyInfo.products && `- Products`,
          (this.companyInfo as any).pricing && `- Pricing & Plans`,
          (this.companyInfo as any).promotions && `- Current Promotions`
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
   
${buildDateNormalizationPrompt({ businessContext: 'fitness' })}

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
  private detectGenderFromName(firstName: string): 'female' | 'male' | null {
    if (!firstName) return null;
    
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
  private getGenderLanguageRule(channelState?: any): string {
    const capturedGender = channelState?.capturedData?.gender;
    const capturedFirstName = channelState?.capturedData?.firstName;
    
    if (capturedGender === 'female') {
      return `🎭 GENDER: This user (${capturedFirstName || 'unknown'}) is FEMALE. Use: "queen", "sis", "girl", "lady". NEVER use "bro", "dude", "king", "my man".`;
    } else if (capturedGender === 'male') {
      return `🎭 GENDER: This user (${capturedFirstName || 'unknown'}) is MALE. Use: "bro", "dude", "king", "my man". NEVER use "queen", "sis", "girl", "lady".`;
    } else {
      return `🎭 GENDER: Unknown - use GENDER-NEUTRAL terms only: "friend", "champion", "warrior", "boss". NEVER assume male (no "bro", "dude", "my man", "king").`;
    }
  }

  /**
   * Build system prompt for conversational response
   */
  private buildSystemPrompt(
    goalResult: GoalOrchestrationResult | null,
    preExtractedData: Record<string, any>,
    intentDetectionResult: IntentDetectionResult | null,
    channelState?: any
  ): string {
    const verbosity = (this.persona as any)?.personalityTraits?.verbosity || 5;
    const verbosityRule = VerbosityHelper.getSystemPromptRule(verbosity);
    
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
    } else if (capturedGender === 'male') {
      const nameRef = capturedFirstName ? ` (${capturedFirstName})` : '';
      genderAwareRule += `
- ✅ THIS USER${nameRef} IS MALE - Use: "bro", "dude", "my man", "king", "homie"
- ❌ NEVER use: "queen", "miss", "lady", "sis", "girl" (those are for females only)
- ⚠️ CRITICAL: Do NOT switch to female terms mid-conversation!`;
    } else {
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
          const pricing = (this.companyInfo as any)?.pricing;
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
          const promotions = (this.companyInfo as any)?.promotions;
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
              const dayHours = (hours as any)[day];
              if (dayHours && dayHours.length > 0) {
                const formattedHours = dayHours.map((slot: any) => `${slot.from} - ${slot.to}`).join(', ');
                companyInfoSection += `  ${day.charAt(0).toUpperCase() + day.slice(1)}: ${formattedHours}\n`;
              }
            }
          }
        }
        
        if (requestedInfo === 'location' || requestedInfo === 'address') {
          const address = (this.companyInfo as any)?.address;
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

