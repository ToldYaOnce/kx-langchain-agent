import type { 
  GoalConfiguration, 
  GoalDefinition,
  ActionTrigger,
  MessageSource,
  ChannelWorkflowState
} from '../types/dynamodb-schemas.js';

export interface GoalRecommendation {
  goalId: string;
  goal: GoalDefinition;
  priority: number;
  reason: string;
  approach: 'direct' | 'contextual' | 'subtle';
  message: string;
  shouldPursue: boolean;
  adherenceLevel: number; // 1-10 scale
  attemptCount?: number; // Number of times this goal has been pursued
}

export interface GoalOrchestrationResult {
  recommendations: GoalRecommendation[];
  extractedInfo: Record<string, any>;
  stateUpdates: {
    newlyCompleted: string[];
    newlyActivated: string[];
    declined: string[];
  };
  triggeredIntents: string[];
  activeGoals: string[];
  completedGoals: string[];
}

export interface GoalState {
  sessionId: string;
  userId: string;
  tenantId: string;
  messageCount: number;
  completedGoals: string[];
  activeGoals: string[];
  declinedGoals: string[];
  attemptCounts: Record<string, number>;
  collectedData: Record<string, any>;
  lastMessage?: string;
}

/**
 * Enhanced Goal Orchestrator with Phase A features:
 * - Goal ordering based on `order` field
 * - Adherence-based prompting (1-10 scale)
 * - Trigger evaluation (prerequisiteGoals, userSignals, messageCount)
 * - Strict ordering mode
 * - Max goals per turn
 */
export class GoalOrchestrator {
  private eventBridgeService?: any;
  private goalStates: Map<string, GoalState> = new Map();

  constructor(eventBridgeService?: any) {
    this.eventBridgeService = eventBridgeService;
  }

  /**
   * Main orchestration method - analyzes message and determines goal actions
   */
  async orchestrateGoals(
    message: string,
    sessionId: string,
    userId: string,
    tenantId: string,
    goalConfig: GoalConfiguration,
    conversationHistory?: string[],
    channel?: MessageSource,
    channelState?: ChannelWorkflowState
  ): Promise<GoalOrchestrationResult> {
    console.log(`🎯 Goal Orchestration START - Session: ${sessionId}`);

    // Get or initialize state (now using channel state if available)
    const state = this.getOrInitState(sessionId, userId, tenantId, channelState);
    
    // If we have channel state, use it as the source of truth
    if (channelState) {
      console.log(`📊 Using channel state: ${channelState.messageCount} messages, ${channelState.completedGoals.length} completed`);
      state.messageCount = channelState.messageCount;
      state.completedGoals = [...channelState.completedGoals];
      state.activeGoals = [...channelState.activeGoals];
      state.collectedData = { ...channelState.capturedData };
    } else {
      // Legacy behavior: increment message count
      state.messageCount++;
    }
    
    // CRITICAL: Sanitize state - remove goals that no longer exist in current config
    const validGoalIds = new Set(goalConfig.goals.map(g => g.id));
    const invalidActiveGoals = state.activeGoals.filter(id => !validGoalIds.has(id));
    const invalidCompletedGoals = state.completedGoals.filter(id => !validGoalIds.has(id));
    
    if (invalidActiveGoals.length > 0) {
      console.log(`⚠️ Removing ${invalidActiveGoals.length} invalid active goals: ${invalidActiveGoals.join(', ')}`);
      state.activeGoals = state.activeGoals.filter(id => validGoalIds.has(id));
    }
    
    if (invalidCompletedGoals.length > 0) {
      console.log(`⚠️ Removing ${invalidCompletedGoals.length} invalid completed goals: ${invalidCompletedGoals.join(', ')}`);
      state.completedGoals = state.completedGoals.filter(id => validGoalIds.has(id));
    }
    
    state.lastMessage = message;

    console.log(`📊 State: ${state.messageCount} messages, ${state.completedGoals.length} completed, ${state.activeGoals.length} active`);

    const result: GoalOrchestrationResult = {
      recommendations: [],
      extractedInfo: {},
      stateUpdates: {
        newlyCompleted: [],
        newlyActivated: [],
        declined: []
      },
      triggeredIntents: [],
      activeGoals: [...state.activeGoals],
      completedGoals: [...state.completedGoals]
    };

    if (!goalConfig.enabled) {
      console.log('⚠️ Goal orchestration disabled');
      return result;
    }

    // Phase A: Filter eligible goals based on triggers (MOVED BEFORE extraction!)
    const eligibleGoals = this.filterEligibleGoals(goalConfig.goals, state, message, channel);
    console.log(`✅ ${eligibleGoals.length} eligible goals (from ${goalConfig.goals.length} total)`);

    // Phase B: Extract information from message (dynamic fields) - NOW includes eligible goals!
    await this.extractInformation(message, goalConfig, state, result, eligibleGoals);

    // Check for information declines
    this.processInformationDeclines(message, state, result);

    // Phase A: Sort by order and importance
    const sortedGoals = this.sortGoalsByOrderAndImportance(eligibleGoals, goalConfig);
    
    // Phase A: Apply strict ordering and max goals per turn
    const goalsToActivate = this.applyGlobalConstraints(sortedGoals, goalConfig, state);
    console.log(`🎯 ${goalsToActivate.length} goals to activate (after constraints)`);

    // Generate recommendations for each goal
    for (const goal of goalsToActivate) {
      const recommendation = this.generateRecommendation(goal, state, goalConfig);
      if (recommendation) {
        result.recommendations.push(recommendation);
        
        // Mark as active if not already
        if (!state.activeGoals.includes(goal.id)) {
          state.activeGoals.push(goal.id);
          result.stateUpdates.newlyActivated.push(goal.id);
        }
      }
    }

    console.log(`📋 Generated ${result.recommendations.length} recommendations`);

    // Update activeGoals: merge NEW recommendations with EXISTING active goals
    const newlyRecommendedGoals = result.recommendations
      .filter(r => r.shouldPursue)
      .map(r => r.goalId);
    
    // Combine existing active goals with newly recommended ones (dedupe)
    const allActiveGoals = [...new Set([...state.activeGoals, ...newlyRecommendedGoals])];
    
    // Remove any that were just completed
    result.activeGoals = allActiveGoals.filter(
      goalId => !result.stateUpdates.newlyCompleted.includes(goalId)
    );
    
    console.log(`🎯 Updated result.activeGoals: ${JSON.stringify(result.activeGoals)} (from ${state.activeGoals.length} existing + ${newlyRecommendedGoals.length} new)`);

    // Check for completion triggers
    this.checkCompletionTriggers(goalConfig, state, result);

    return result;
  }

  /**
   * PHASE B: Extract information from message based on goal dataToCapture
   */
  private async extractInformation(
    message: string,
    goalConfig: GoalConfiguration,
    state: GoalState,
    result: GoalOrchestrationResult,
    eligibleGoals?: GoalDefinition[]  // NEW: Also check goals that are ABOUT to be activated
  ): Promise<void> {
    // Find active data collection goals PLUS eligible goals (that might be activated this turn)
    // Include 'scheduling' type because it also captures data (preferredDate, preferredTime)
    const goalsToCheck = eligibleGoals || goalConfig.goals;
    const dataCollectionGoals = goalsToCheck.filter(
      g => (g.type === 'data_collection' || g.type === 'collect_info' || g.type === 'scheduling') && 
           (state.activeGoals.includes(g.id) || (eligibleGoals && eligibleGoals.includes(g)))
    );

    console.log(`🔍 Checking data extraction for ${dataCollectionGoals.length} active/eligible data collection goals`);
    
    for (const goal of dataCollectionGoals) {
      if (!goal.dataToCapture?.fields) continue;

      const fieldNames = this.getFieldNames(goal);
      console.log(`🔍 Goal ${goal.id} needs: ${fieldNames.join(', ')}`);
      console.log(`📊 Currently collected: ${Object.keys(state.collectedData).join(', ') || 'NONE'}`);

      for (const fieldName of fieldNames) {
        // Skip if already collected
        if (state.collectedData[fieldName]) {
          console.log(`✓ Field ${fieldName} already collected: ${state.collectedData[fieldName]}`);
          continue;
        }
        
        // Use simple extraction patterns (Phase B will enhance this with LLM)
        const extractedValue = this.extractFieldValue(message, fieldName, goal.dataToCapture.validationRules);
        
        if (extractedValue) {
          // HIGHLIGHT: Data extracted from user message
          console.log('\n' + '💎'.repeat(32));
          console.log(`💎 DATA CAPTURED: ${fieldName}`);
          console.log(`💾 Value: ${extractedValue}`);
          console.log('💎'.repeat(32) + '\n');
          
          state.collectedData[fieldName] = extractedValue;
          result.extractedInfo[fieldName] = extractedValue;
        } else {
          console.log(`❌ Failed to extract ${fieldName} from: "${message.substring(0, 50)}..."`);
        }
      }

      // Check if goal is complete (all required fields collected)
      const isComplete = this.checkDataCollectionComplete(goal, state);
      console.log(`🎯 Goal ${goal.id} completion check: ${isComplete ? 'COMPLETE ✅' : 'INCOMPLETE ❌'}`);
      
      if (isComplete && !state.completedGoals.includes(goal.id)) {
        console.log(`✅ Goal completed: ${goal.id}`);
        state.completedGoals.push(goal.id);
        state.activeGoals = state.activeGoals.filter(id => id !== goal.id);
        result.stateUpdates.newlyCompleted.push(goal.id);

        // Execute goal actions
        if (goal.actions?.onComplete) {
          await this.executeGoalActions(goal, {
            tenantId: state.tenantId,
            userId: state.userId,
            sessionId: state.sessionId,
            collectedData: state.collectedData
          });
        }
      }
    }
  }

  /**
   * Extract a single field value from message
   * DISABLED: All regex extraction disabled - trusting LLM via intent detection
   */
  private extractFieldValue(
    message: string,
    fieldName: string,
    validationRules?: Record<string, any>
  ): string | null {
    console.log(`🔍 EXTRACTION DISABLED: Relying on LLM intent detection for field="${fieldName}"`);
    
    // ALL REGEX EXTRACTION DISABLED - LET THE LLM HANDLE IT
    // The LLM in REQUEST #1 (Intent Detection) should extract all data
    // This method is now a no-op placeholder
    
    return null;
  }

  /**
   * Validate extracted field against rules
   * NOTE: Pattern validation disabled - trusting LLM to extract correct data types
   */
  private validateField(value: string, rules?: any): boolean {
    if (!rules) return true;

    // DISABLED: Let the LLM handle format validation
    // The LLM is smart enough to know what's an email vs phone vs name
    // if (rules.pattern) {
    //   const regex = new RegExp(rules.pattern);
    //   if (!regex.test(value)) {
    //     console.log(`❌ Validation failed for "${value}" - pattern: ${rules.pattern}`);
    //     return false;
    //   }
    // }

    return true;
  }

  /**
   * Helper: Get field names from goal (supports both old and new formats)
   */
  private getFieldNames(goal: GoalDefinition): string[] {
    if (!goal.dataToCapture?.fields) return [];
    
    const fields = goal.dataToCapture.fields;
    
    // NEW FORMAT: Array of field objects
    if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
      return (fields as Array<{ name: string }>).map(f => f.name);
    }
    
    // OLD FORMAT: String array
    return fields as string[];
  }

  /**
   * Helper: Get required field names from goal
   */
  private getRequiredFieldNames(goal: GoalDefinition): string[] {
    if (!goal.dataToCapture?.fields) return [];
    
    const fields = goal.dataToCapture.fields;
    
    // NEW FORMAT: Array of field objects
    if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
      return (fields as Array<{ name: string; required: boolean }>)
        .filter(f => f.required)
        .map(f => f.name);
    }
    
    // OLD FORMAT: Use validationRules
    const rules = goal.dataToCapture.validationRules || {};
    return (fields as string[]).filter(fieldName => {
      const fieldRules = rules[fieldName];
      return fieldRules?.required !== false; // Default to required
    });
  }

  /**
   * Check if a data collection goal is complete
   */
  private checkDataCollectionComplete(goal: GoalDefinition, state: GoalState): boolean {
    if (!goal.dataToCapture?.fields) return false;

    // Get required field names (works with both old and new formats)
    const requiredFields = this.getRequiredFieldNames(goal);
    
    // Check if all REQUIRED fields are captured
    for (const fieldName of requiredFields) {
      if (!state.collectedData[fieldName]) {
        console.log(`❌ Required field missing: ${fieldName}`);
        return false;
      }
    }
    
    console.log(`✅ All required fields captured for goal: ${requiredFields.join(', ')}`);
    return true;
  }

  /**
   * Check for information decline signals
   */
  private processInformationDeclines(
    message: string,
    state: GoalState,
    result: GoalOrchestrationResult
  ): void {
    const declinePatterns = [
      /no\s+thanks?/i,
      /not\s+right\s+now/i,
      /maybe\s+later/i,
      /skip/i,
      /don'?t\s+want\s+to/i,
      /prefer\s+not\s+to/i
    ];

    const isDecline = declinePatterns.some(pattern => pattern.test(message));

    if (isDecline && state.activeGoals.length > 0) {
      // User is declining current goal(s)
      const declinedGoal = state.activeGoals[0]; // Decline the first active goal
      console.log(`❌ User declined goal: ${declinedGoal}`);
      state.declinedGoals.push(declinedGoal);
      state.activeGoals = state.activeGoals.filter(id => id !== declinedGoal);
      result.stateUpdates.declined.push(declinedGoal);
    }
  }

  /**
   * PHASE A: Filter eligible goals based on triggers
   */
  private filterEligibleGoals(
    goals: GoalDefinition[],
    state: GoalState,
    message: string,
    channel?: MessageSource
  ): GoalDefinition[] {
    return goals.filter(goal => {
      // Skip if already completed or declined
      if (state.completedGoals.includes(goal.id)) {
        return false;
      }
      if (state.declinedGoals.includes(goal.id)) {
        return false;
      }

      // Check channel rules
      if (channel && goal.channelRules?.[channel]?.skip) {
        console.log(`⏭️ Skipping goal ${goal.id} for channel ${channel}`);
        return false;
      }

      // Check triggers
      if (goal.triggers) {
        return this.evaluateTriggers(goal.triggers, state, message);
      }

      // Check legacy timing (if no triggers)
      if (goal.timing) {
        return this.evaluateLegacyTiming(goal.timing, state);
      }

      // No triggers, always eligible
      return true;
    });
  }

  /**
   * PHASE A: Evaluate goal triggers (prerequisiteGoals, userSignals, messageCount)
   */
  private evaluateTriggers(
    triggers: NonNullable<GoalDefinition['triggers']>,
    state: GoalState,
    message: string
  ): boolean {
    const results: boolean[] = [];

    // Check prerequisiteGoals dependency (with backward compatibility for afterGoals)
    const prerequisites = triggers.prerequisiteGoals || triggers.afterGoals;
    if (prerequisites && prerequisites.length > 0) {
      const dependenciesMet = prerequisites.every(requiredGoalId => {
        // Support both full IDs and short name prefixes
        // E.g., "collect_identity" matches "collect_identity_1764033358437"
        return state.completedGoals.some(completedId => 
          completedId === requiredGoalId || completedId.startsWith(requiredGoalId + '_')
        );
      });
      console.log(`🔗 prerequisiteGoals check: ${dependenciesMet} (requires: ${prerequisites.join(', ')})`);
      results.push(dependenciesMet);
    }

    // Check messageCount threshold
    if (triggers.messageCount !== undefined) {
      const thresholdMet = state.messageCount >= triggers.messageCount;
      console.log(`📊 messageCount check: ${thresholdMet} (${state.messageCount} >= ${triggers.messageCount})`);
      results.push(thresholdMet);
    }

    // Check userSignals (keywords)
    if (triggers.userSignals && triggers.userSignals.length > 0) {
      const lowerMessage = message.toLowerCase();
      const signalDetected = triggers.userSignals.some(signal => 
        lowerMessage.includes(signal.toLowerCase())
      );
      console.log(`🔍 userSignals check: ${signalDetected} (looking for: ${triggers.userSignals.join(', ')})`);
      results.push(signalDetected);
    }

    // All conditions must be met (AND logic)
    const allMet = results.length === 0 || results.every(r => r);
    return allMet;
  }

  /**
   * Evaluate legacy timing configuration (for backwards compatibility)
   */
  private evaluateLegacyTiming(
    timing: NonNullable<GoalDefinition['timing']>,
    state: GoalState
  ): boolean {
    if (timing.minMessages && state.messageCount < timing.minMessages) {
      return false;
    }
    if (timing.maxMessages && state.messageCount > timing.maxMessages) {
      return false;
    }
    return true;
  }

  /**
   * PHASE A: Sort goals by order field and importance
   */
  private sortGoalsByOrderAndImportance(
    goals: GoalDefinition[],
    goalConfig: GoalConfiguration
  ): GoalDefinition[] {
    const importanceValues = { critical: 10, high: 7, medium: 4, low: 1 };

    return goals.sort((a, b) => {
      // Primary sort: order field (lower numbers first)
      const orderA = a.order ?? 9999;
      const orderB = b.order ?? 9999;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Secondary sort: importance (from priority field)
      const importanceA = importanceValues[a.priority];
      const importanceB = importanceValues[b.priority];
      
      return importanceB - importanceA;
    });
  }

  /**
   * PHASE A: Apply global constraints (strict ordering, max goals per turn)
   */
  private applyGlobalConstraints(
    sortedGoals: GoalDefinition[],
    goalConfig: GoalConfiguration,
    state: GoalState
  ): GoalDefinition[] {
    let goalsToActivate = sortedGoals;

    // Apply strict ordering
    const strictOrdering = goalConfig.globalSettings.strictOrdering;
    
    if (strictOrdering === 0) {
      // ✨ NEW: strictOrdering = 0 means "always active" mode
      // All eligible goals are active for opportunistic data capture
      console.log(`🌐 Always-active mode (strictOrdering = 0) - all eligible goals active`);
      return goalsToActivate;
    }
    
    if (strictOrdering && strictOrdering >= 7) {
      // Strict mode: only activate the first goal (in order)
      console.log(`🔒 Strict ordering enabled (${strictOrdering}/10) - limiting to 1 goal`);
      
      if (state.activeGoals.length > 0) {
        // Continue with active goal, don't activate new ones
        return [];
      }
      
      goalsToActivate = sortedGoals.slice(0, 1);
    }

    // Apply max goals per turn
    const maxGoalsPerTurn = goalConfig.globalSettings.maxGoalsPerTurn;
    if (maxGoalsPerTurn && maxGoalsPerTurn > 0 && strictOrdering !== 0) {
      console.log(`📏 Max goals per turn: ${maxGoalsPerTurn}`);
      goalsToActivate = goalsToActivate.slice(0, maxGoalsPerTurn);
    }

    return goalsToActivate;
  }

  /**
   * Generate a recommendation for a goal
   */
  private generateRecommendation(
    goal: GoalDefinition,
    state: GoalState,
    goalConfig: GoalConfiguration
  ): GoalRecommendation | null {
    const importanceValues = { critical: 10, high: 7, medium: 4, low: 1 };
    const priority = importanceValues[goal.priority];

    // PHASE A: Use adherence level (1-10) to control persistence
    const adherenceLevel = goal.adherence ?? 5; // Default to medium adherence
    
    // Increment attempt count
    state.attemptCounts[goal.id] = (state.attemptCounts[goal.id] || 0) + 1;
    const attemptCount = state.attemptCounts[goal.id];

    console.log(`🎯 Goal ${goal.id}: adherence=${adherenceLevel}/10, attempts=${attemptCount}`);

    // Check max attempts (if defined)
    const maxAttempts = goal.behavior?.maxAttempts;
    if (maxAttempts && attemptCount > maxAttempts) {
      console.log(`⏸️ Max attempts reached for ${goal.id} (${attemptCount}/${maxAttempts})`);
      
      // Mark as declined to stop pursuing
      if (!state.declinedGoals.includes(goal.id)) {
        state.declinedGoals.push(goal.id);
      }
      
      return null;
    }

    // Determine approach based on adherence and attempt count
    let approach: 'direct' | 'contextual' | 'subtle' = 'contextual';
    
    if (adherenceLevel >= 8) {
      approach = 'direct'; // High adherence = direct approach
    } else if (adherenceLevel <= 3) {
      approach = 'subtle'; // Low adherence = subtle approach
    }

    // Adjust tone based on backoff strategy and attempt count
    if (attemptCount > 1 && goal.behavior?.backoffStrategy) {
      approach = this.adjustApproachForBackoff(
        approach,
        goal.behavior.backoffStrategy,
        attemptCount
      );
    }

    // Generate message
    const message = this.generateGoalMessage(goal, approach, state, attemptCount);

    return {
      goalId: goal.id,
      goal,
      priority,
      adherenceLevel,
      reason: this.generatePursuitReason(goal, attemptCount, adherenceLevel),
      approach,
      message,
      shouldPursue: true,
      attemptCount
    };
  }

  /**
   * PHASE E: Adjust approach based on backoff strategy
   */
  private adjustApproachForBackoff(
    baseApproach: 'direct' | 'contextual' | 'subtle',
    backoffStrategy: 'gentle' | 'persistent' | 'aggressive',
    attemptCount: number
  ): 'direct' | 'contextual' | 'subtle' {
    if (backoffStrategy === 'gentle') {
      // Get softer with each attempt
      if (attemptCount >= 3) return 'subtle';
      if (attemptCount >= 2) return 'contextual';
    } else if (backoffStrategy === 'aggressive') {
      // Get more direct with each attempt
      if (attemptCount >= 2) return 'direct';
    }
    // 'persistent' keeps the same approach
    return baseApproach;
  }

  /**
   * Generate contextual message for goal pursuit
   */
  private generateGoalMessage(
    goal: GoalDefinition,
    approach: 'direct' | 'contextual' | 'subtle',
    state: GoalState,
    attemptCount: number
  ): string {
    // Use custom messages if defined
    if (goal.messages) {
      if (attemptCount === 1 && goal.messages.request) {
        return goal.messages.request;
      } else if (attemptCount > 1 && goal.messages.followUp) {
        return goal.messages.followUp;
      }
    }

    // Use behavior message if defined
    if (goal.behavior?.message) {
      return goal.behavior.message;
    }

    // Fallback: describe what we need
    if (goal.dataToCapture?.fields) {
      const fieldNames = this.getFieldNames(goal);
      const fields = fieldNames.join(', ');
      
      if (approach === 'direct') {
        return `I need your ${fields} to continue.`;
      } else if (approach === 'contextual') {
        return `To help you better, could you share your ${fields}?`;
      } else {
        return `By the way, it would be helpful to know your ${fields}.`;
      }
    }

    return `Let's work on: ${goal.description}`;
  }

  /**
   * Generate reason for pursuing goal
   */
  private generatePursuitReason(
    goal: GoalDefinition,
    attemptCount: number,
    adherenceLevel: number
  ): string {
    const reasons = [];
    
    if (goal.priority === 'critical') reasons.push('critical priority');
    if (adherenceLevel >= 8) reasons.push('high adherence');
    if (attemptCount === 1) reasons.push('first attempt');
    if (attemptCount > 1) reasons.push(`attempt ${attemptCount}`);
    
    return reasons.join(', ') || 'standard goal progression';
  }

  /**
   * Check for goal completion triggers (combos, etc.)
   */
  private checkCompletionTriggers(
    goalConfig: GoalConfiguration,
    state: GoalState,
    result: GoalOrchestrationResult
  ): void {
    // Safety check: ensure completionTriggers exists
    if (!goalConfig.completionTriggers) {
      return;
    }

    // Check custom combinations
    if (goalConfig.completionTriggers.customCombinations) {
      for (const combo of goalConfig.completionTriggers.customCombinations) {
        const allCompleted = combo.goalIds.every(goalId => 
          state.completedGoals.includes(goalId)
        );
        
        if (allCompleted && !result.triggeredIntents.includes(combo.triggerIntent)) {
          console.log(`🎉 Goal combo triggered: ${combo.triggerIntent}`);
          result.triggeredIntents.push(combo.triggerIntent);
        }
      }
    }

    // Check all critical complete
    if (goalConfig.completionTriggers.allCriticalComplete) {
      const criticalGoals = goalConfig.goals.filter(g => g.priority === 'critical');
      const allCriticalComplete = criticalGoals.every(goal => 
        state.completedGoals.includes(goal.id)
      );
      
      if (allCriticalComplete && !result.triggeredIntents.includes(goalConfig.completionTriggers.allCriticalComplete)) {
        console.log(`🎉 All critical goals complete!`);
        result.triggeredIntents.push(goalConfig.completionTriggers.allCriticalComplete);
      }
    }
  }

  /**
   * Execute actions when a goal completes
   */
  async executeGoalActions(
    goal: GoalDefinition,
    context: {
      tenantId: string;
      channelId?: string;
      userId: string;
      sessionId: string;
      collectedData: Record<string, any>;
    }
  ): Promise<void> {
    if (!goal.actions?.onComplete || !this.eventBridgeService) {
      return;
    }

    console.log(`🎯 Executing ${goal.actions.onComplete.length} actions for goal: ${goal.id}`);

    for (const action of goal.actions.onComplete) {
      try {
        await this.executeAction(action, goal.id, context);
      } catch (error) {
        console.error(`❌ Failed to execute action ${action.type} for goal ${goal.id}:`, error);
      }
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: ActionTrigger,
    goalId: string,
    context: {
      tenantId: string;
      channelId?: string;
      userId: string;
      sessionId: string;
      collectedData: Record<string, any>;
    }
  ): Promise<void> {
    console.log('\x1b[33m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[33m║  🎯 GOAL ACTION TRIGGERED                                    ║\x1b[0m');
    console.log('\x1b[33m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log(`\x1b[36m📌 Goal ID:     \x1b[0m${goalId}`);
    console.log(`\x1b[36m⚡ Action Type: \x1b[0m${action.type}`);
    console.log(`\x1b[36m🏷️  Event Name:  \x1b[0m${action.eventName || this.getDefaultEventName(action.type)}`);

    const eventName = action.eventName || this.getDefaultEventName(action.type);
    const payload = {
      tenantId: context.tenantId,
      channelId: context.channelId,
      userId: context.userId,
      sessionId: context.sessionId,
      goalId,
      timestamp: new Date().toISOString(),
      ...action.payload,
      // Include collected data for relevant actions
      ...(action.type === 'convert_anonymous_to_lead' && { contactInfo: context.collectedData })
    };

    console.log(`\x1b[36m📦 Action Payload:\x1b[0m`);
    console.log(JSON.stringify(action.payload, null, 2));
    
    if (action.type === 'convert_anonymous_to_lead') {
      console.log(`\x1b[36m👤 Collected Contact Info:\x1b[0m`);
      console.log(JSON.stringify(context.collectedData, null, 2));
    }

    await this.eventBridgeService.publishCustomEvent(
      'kxgen.agent.goals',
      eventName,
      payload
    );

    console.log(`\x1b[32m✅ Goal action completed: ${eventName}\x1b[0m`);
    console.log('\x1b[33m══════════════════════════════════════════════════════════════\x1b[0m\n');
  }

  /**
   * Get default event name for action type
   */
  private getDefaultEventName(actionType: string): string {
    const defaults: Record<string, string> = {
      'convert_anonymous_to_lead': 'lead.contact_captured',
      'trigger_scheduling_flow': 'appointment.requested',
      'send_notification': 'notification.send',
      'update_crm': 'crm.update_requested',
      'custom': 'custom.action'
    };
    return defaults[actionType] || 'goal.action';
  }

  /**
   * Get or initialize goal state
   * Now supports channel state for persistent tracking
   */
  private getOrInitState(
    sessionId: string, 
    userId: string, 
    tenantId: string,
    channelState?: ChannelWorkflowState
  ): GoalState {
    const key = `${tenantId}:${sessionId}:${userId}`;
    
    if (!this.goalStates.has(key)) {
      // Initialize from channel state if available
      if (channelState) {
        this.goalStates.set(key, {
          sessionId,
          userId,
          tenantId,
          messageCount: channelState.messageCount,
          completedGoals: [...channelState.completedGoals],
          activeGoals: [...channelState.activeGoals],
          declinedGoals: [],
          attemptCounts: {},
          collectedData: { ...channelState.capturedData }
        });
        console.log(`📊 Initialized state from channel state: ${channelState.completedGoals.length} completed goals`);
      } else {
        // Legacy: fresh state
        this.goalStates.set(key, {
          sessionId,
          userId,
          tenantId,
          messageCount: 0,
          completedGoals: [],
          activeGoals: [],
          declinedGoals: [],
          attemptCounts: {},
          collectedData: {}
        });
      }
    }
    
    return this.goalStates.get(key)!;
  }

  /**
   * Get current goal state for debugging
   */
  getGoalState(sessionId: string, userId: string, tenantId: string): GoalState | undefined {
    const key = `${tenantId}:${sessionId}:${userId}`;
    return this.goalStates.get(key);
  }

  /**
   * Reset goal state (for testing)
   */
  resetGoalState(sessionId: string, userId: string, tenantId: string): void {
    const key = `${tenantId}:${sessionId}:${userId}`;
    this.goalStates.delete(key);
  }
}
