import { ChatBedrockConverse } from '@langchain/aws';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { PromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
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
import type { AgentContext, RuntimeConfig, MessageSource, AgentResponse } from '../types/index.js';

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

  constructor(config: AgentServiceConfig) {
    this.config = config;
    
    // Always initialize persona service for company info substitution
    // Pass null for DynamoDB service if not available
    this.personaService = new PersonaService(config.dynamoService || null);
    
    // Initialize intent service
    this.intentService = new IntentService();
    
    // Initialize goal orchestrator
    this.goalOrchestrator = new GoalOrchestrator();
    
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
    
    // Persona will be loaded per-request with company info substitution
    this.persona = {} as AgentPersona; // Will be loaded per-request
    
    // Model will be initialized per-request with verbosity-aware maxTokens and temperature
    // DO NOT initialize here - wait until we have persona settings in processMessage()!
    this.model = null as any; // Will be created in processMessage() with correct settings
  }

  /**
   * Process an agent context and generate a response
   * @param context - The agent context
   * @param existingHistory - Optional chat history (for CLI/local use)
   */
  async processMessage(context: AgentContext, existingHistory?: BaseMessage[]): Promise<string> {
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
      // Linear progression: start at 40, add 20 per level
      const verbosity = (currentPersona as any)?.personalityTraits?.verbosity || 5;
      let maxTokens: number;
      let temperature: number;
      
      switch (verbosity) {
        case 1:
          maxTokens = 40;   // ~1 sentence
          temperature = 0.3;
          break;
        case 2:
          maxTokens = 60;   // ~1-2 sentences
          temperature = 0.3;
          break;
        case 3:
          maxTokens = 80;   // ~2 sentences
          temperature = 0.4;
          break;
        case 4:
          maxTokens = 100;  // ~2-3 sentences
          temperature = 0.4;
          break;
        case 5:
          maxTokens = 120;  // ~3 sentences
          temperature = 0.5;
          break;
        case 6:
          maxTokens = 140;  // ~3-4 sentences
          temperature = 0.5;
          break;
        case 7:
          maxTokens = 160;  // ~4 sentences
          temperature = 0.6;
          break;
        case 8:
          maxTokens = 180;  // ~4-5 sentences
          temperature = 0.6;
          break;
        case 9:
          maxTokens = 200;  // ~5-6 sentences
          temperature = 0.7;
          break;
        case 10:
          maxTokens = 220;  // ~6-7 sentences ("lecture mode")
          temperature = 0.7;
          break;
        default:
          maxTokens = 120;  // Default to 5
          temperature = 0.5;
      }
      
      // 👉 Decide if we'll add a question via second LLM call
      const questionRatio = (currentPersona as any)?.personalityTraits?.questionRatio;
      let shouldAddQuestion = false;
      const QUESTION_TOKEN_RESERVE = 20; // Reserve 20 tokens for the follow-up question
      
      if (questionRatio !== undefined) {
        const probability = questionRatio / 10;        // 1–10 → 0.1–1.0
        const isAlwaysAsk = questionRatio >= 9;        // 9–10 = always enforce
        shouldAddQuestion = isAlwaysAsk || Math.random() < probability;
        
        console.log(
          `❓ Question behavior for this turn: ratio=${questionRatio}/10, ` +
          `prob=${Math.round(probability * 100)}%, alwaysAsk=${isAlwaysAsk}, ` +
          `willAddQuestion=${shouldAddQuestion}`
        );
        
        // If we'll add a question, reserve 20 tokens from the main response
        if (shouldAddQuestion) {
          maxTokens = Math.max(30, maxTokens - QUESTION_TOKEN_RESERVE); // Don't go below 30
          console.log(`❓ Reserved ${QUESTION_TOKEN_RESERVE} tokens for question, main response maxTokens reduced to ${maxTokens}`);
        }
      }
      
      console.log(`🎚️ Setting maxTokens=${maxTokens}, temperature=${temperature} based on verbosity=${verbosity}`);
      
      // Recreate model with verbosity-aware maxTokens and temperature
      this.model = new ChatBedrockConverse({
        model: this.config.bedrockModelId,
        region: this.config.awsRegion,
        temperature,
        maxTokens,
      } as any);

      // Run goal orchestration to manage lead qualification
      let goalResult: GoalOrchestrationResult | null = null;
      console.log(`🔍 Goal config enabled: ${currentPersona.goalConfiguration?.enabled}, goals: ${currentPersona.goalConfiguration?.goals?.length || 0}`);
      
      if (currentPersona.goalConfiguration?.enabled) {
        try {
          goalResult = await this.goalOrchestrator.orchestrateGoals(
            context.text,
            context.conversation_id || 'default',
            context.email_lc,
            context.tenantId,
            currentPersona.goalConfiguration
          );

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

        } catch (error) {
          console.warn('Goal orchestration error:', error);
        }
      }

      // Check for intent matches before processing with LangChain
      const intentMatch = await this.intentService.detectIntent(
        context.text,
        currentPersona,
        this.config.companyInfo || {
          name: 'Planet Fitness',
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
          
          return response;
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

      // Create memory with messages
      const memory = new BufferMemory({
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
      const chain = new ConversationChain({
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
          const questionModel = new ChatBedrockConverse({
            model: this.config.bedrockModelId,
            region: this.config.awsRegion,
            temperature: 0.7, // More creative for questions
            maxTokens: 20, // TINY - just enough for a question
          } as any);
          
          // Build prompt: Generate ONLY a question, not a response
          const questionPrompt = `Task: Generate ONLY a short follow-up question. Do not respond, explain, or add anything else. Just output the question.

You are ${currentPersona.name}. You just said: "${response.trim()}"

Generate ONE short follow-up question in the same language to keep the conversation flowing. Output ONLY the question text, nothing else:`;
          
          const questionResponse = await questionModel.invoke([
            new HumanMessage(questionPrompt)
          ]);
          
          // Extract question text from response
          let question = '';
          if (typeof questionResponse.content === 'string') {
            question = questionResponse.content.trim();
          } else if (Array.isArray(questionResponse.content)) {
            question = questionResponse.content.map(c => {
              if (typeof c === 'string') return c;
              if (c && typeof c === 'object' && 'text' in c) return (c as any).text || '';
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
        } catch (error) {
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
          } else {
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
        await this.config.eventBridgeService.publishAgentTrace(
          EventBridgeService.createAgentTraceEvent(
            context.tenantId,
            'agent.message.processed',
            {
              contactPk: DynamoDBService.createContactPK(context.tenantId, context.email_lc),
              durationMs: duration,
              metadata: {
                source: context.source,
                model: this.config.bedrockModelId,
                message_length: context.text.length,
                response_length: response.length,
              },
            }
          )
        );
      }

      return response;
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
    // First get the full response
    const fullResponse = await this.processMessage(context);
    
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

    // Chunk the response based on persona configuration and channel
    return ResponseChunker.chunkResponse(
      fullResponse,
      context.source,
      currentPersona.responseChunking
    );
  }

  /**
   * Create prompt template based on tenant and context
   */
  private createPromptTemplate(context: AgentContext, persona?: AgentPersona): PromptTemplate {
    // Use the provided persona or fall back to the instance persona
    const systemPrompt = this.getSystemPrompt(context, persona || this.persona);
    
    return PromptTemplate.fromTemplate(`${systemPrompt}

Current conversation:
{history}

Human: {input}
Assistant:`);
  }

  /**
   * Get system prompt based on persona and context
   */
  private getSystemPrompt(context: AgentContext, persona: AgentPersona): string {
    // CRITICAL: Build verbosity constraint FIRST - this must be the TOP priority
    const verbosity = (persona as any)?.personalityTraits?.verbosity || 5;
    let verbosityRule = '';
    if (verbosity <= 2) {
      verbosityRule = '🚨 CRITICAL RESPONSE CONSTRAINT: EXTREMELY BRIEF - Maximum 1-2 sentences total. NO EXCEPTIONS. Get to the point immediately.\n\n';
    } else if (verbosity <= 4) {
      verbosityRule = '🚨 CRITICAL RESPONSE CONSTRAINT: CONCISE - Maximum 2-3 sentences total. Be direct and avoid rambling.\n\n';
    } else if (verbosity <= 6) {
      verbosityRule = '🚨 CRITICAL RESPONSE CONSTRAINT: BALANCED - Keep to 3-4 sentences maximum. Be thorough but not excessive.\n\n';
    } else if (verbosity <= 8) {
      verbosityRule = '📝 Response guideline: 4-6 sentences maximum. Provide explanations and context.\n\n';
    } else {
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
    
    // Enforce question behavior based on questionRatio
    const questionRatio = (persona as any)?.personalityTraits?.questionRatio;
    
    // If ratio is high (9-10), ALWAYS require a question.
    // Otherwise use probabilistic behavior.
    if (questionRatio !== undefined) {
      const probability = questionRatio / 10;
      const isAlwaysAsk = questionRatio >= 9; // 9-10 = always ask
      const shouldRequireQuestion = isAlwaysAsk || Math.random() < probability;
      
      if (shouldRequireQuestion) {
        console.log(
          `❓ Question enforced: ratio=${questionRatio}/10 (${Math.round(probability * 100)}%), alwaysAsk=${isAlwaysAsk}`
        );
        
        systemPrompt += `

IMPORTANT INSTRUCTION FOR THIS RESPONSE:
You MUST end your response with a natural, contextual question that keeps the conversation engaging. 
Make the question fit naturally with your personality and the conversation flow. 
Match the language the user is speaking.`;
      } else {
        console.log(
          `❓ Question optional this turn: ratio=${questionRatio}/10 (${Math.round(probability * 100)}%)`
        );
      }
    }
    
    return systemPrompt;
  }

  /**
   * Process message and return structured response with metadata
   */
  async processMessageStructured(context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      const response = await this.processMessage(context);
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
          name: 'Planet Fitness',
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
}