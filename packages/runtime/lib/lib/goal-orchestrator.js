"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalOrchestrator = void 0;
/**
 * Enhanced Goal Orchestrator with Phase A features:
 * - Goal ordering based on `order` field
 * - Adherence-based prompting (1-10 scale)
 * - Trigger evaluation (prerequisiteGoals, userSignals, messageCount)
 * - Strict ordering mode
 * - Max goals per turn
 */
class GoalOrchestrator {
    constructor(eventBridgeService) {
        this.goalStates = new Map();
        this.eventBridgeService = eventBridgeService;
    }
    /**
     * Main orchestration method - analyzes message and determines goal actions
     */
    async orchestrateGoals(message, sessionId, userId, tenantId, goalConfig, conversationHistory, channel, channelState) {
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
        }
        else {
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
        const result = {
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
        result.activeGoals = allActiveGoals.filter(goalId => !result.stateUpdates.newlyCompleted.includes(goalId));
        console.log(`🎯 Updated result.activeGoals: ${JSON.stringify(result.activeGoals)} (from ${state.activeGoals.length} existing + ${newlyRecommendedGoals.length} new)`);
        // Check for completion triggers
        this.checkCompletionTriggers(goalConfig, state, result);
        return result;
    }
    /**
     * PHASE B: Extract information from message based on goal dataToCapture
     */
    async extractInformation(message, goalConfig, state, result, eligibleGoals // NEW: Also check goals that are ABOUT to be activated
    ) {
        // Find active data collection goals PLUS eligible goals (that might be activated this turn)
        // Include 'scheduling' type because it also captures data (preferredDate, preferredTime)
        const goalsToCheck = eligibleGoals || goalConfig.goals;
        const dataCollectionGoals = goalsToCheck.filter(g => (g.type === 'data_collection' || g.type === 'collect_info' || g.type === 'scheduling') &&
            (state.activeGoals.includes(g.id) || (eligibleGoals && eligibleGoals.includes(g))));
        console.log(`🔍 Checking data extraction for ${dataCollectionGoals.length} active/eligible data collection goals`);
        for (const goal of dataCollectionGoals) {
            if (!goal.dataToCapture?.fields)
                continue;
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
                }
                else {
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
    extractFieldValue(message, fieldName, validationRules) {
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
    validateField(value, rules) {
        if (!rules)
            return true;
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
    getFieldNames(goal) {
        if (!goal.dataToCapture?.fields)
            return [];
        const fields = goal.dataToCapture.fields;
        // NEW FORMAT: Array of field objects
        if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
            return fields.map(f => f.name);
        }
        // OLD FORMAT: String array
        return fields;
    }
    /**
     * Helper: Get required field names from goal
     */
    getRequiredFieldNames(goal) {
        if (!goal.dataToCapture?.fields)
            return [];
        const fields = goal.dataToCapture.fields;
        // NEW FORMAT: Array of field objects
        if (fields.length > 0 && typeof fields[0] === 'object' && 'name' in fields[0]) {
            return fields
                .filter(f => f.required)
                .map(f => f.name);
        }
        // OLD FORMAT: Use validationRules
        const rules = goal.dataToCapture.validationRules || {};
        return fields.filter(fieldName => {
            const fieldRules = rules[fieldName];
            return fieldRules?.required !== false; // Default to required
        });
    }
    /**
     * Check if a data collection goal is complete
     */
    checkDataCollectionComplete(goal, state) {
        if (!goal.dataToCapture?.fields)
            return false;
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
    processInformationDeclines(message, state, result) {
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
    filterEligibleGoals(goals, state, message, channel) {
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
    evaluateTriggers(triggers, state, message) {
        const results = [];
        // Check prerequisiteGoals dependency (with backward compatibility for afterGoals)
        const prerequisites = triggers.prerequisiteGoals || triggers.afterGoals;
        if (prerequisites && prerequisites.length > 0) {
            const dependenciesMet = prerequisites.every(requiredGoalId => {
                // Support both full IDs and short name prefixes
                // E.g., "collect_identity" matches "collect_identity_1764033358437"
                return state.completedGoals.some(completedId => completedId === requiredGoalId || completedId.startsWith(requiredGoalId + '_'));
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
            const signalDetected = triggers.userSignals.some(signal => lowerMessage.includes(signal.toLowerCase()));
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
    evaluateLegacyTiming(timing, state) {
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
    sortGoalsByOrderAndImportance(goals, goalConfig) {
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
    applyGlobalConstraints(sortedGoals, goalConfig, state) {
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
    generateRecommendation(goal, state, goalConfig) {
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
        let approach = 'contextual';
        if (adherenceLevel >= 8) {
            approach = 'direct'; // High adherence = direct approach
        }
        else if (adherenceLevel <= 3) {
            approach = 'subtle'; // Low adherence = subtle approach
        }
        // Adjust tone based on backoff strategy and attempt count
        if (attemptCount > 1 && goal.behavior?.backoffStrategy) {
            approach = this.adjustApproachForBackoff(approach, goal.behavior.backoffStrategy, attemptCount);
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
    adjustApproachForBackoff(baseApproach, backoffStrategy, attemptCount) {
        if (backoffStrategy === 'gentle') {
            // Get softer with each attempt
            if (attemptCount >= 3)
                return 'subtle';
            if (attemptCount >= 2)
                return 'contextual';
        }
        else if (backoffStrategy === 'aggressive') {
            // Get more direct with each attempt
            if (attemptCount >= 2)
                return 'direct';
        }
        // 'persistent' keeps the same approach
        return baseApproach;
    }
    /**
     * Generate contextual message for goal pursuit
     */
    generateGoalMessage(goal, approach, state, attemptCount) {
        // Use custom messages if defined
        if (goal.messages) {
            if (attemptCount === 1 && goal.messages.request) {
                return goal.messages.request;
            }
            else if (attemptCount > 1 && goal.messages.followUp) {
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
            }
            else if (approach === 'contextual') {
                return `To help you better, could you share your ${fields}?`;
            }
            else {
                return `By the way, it would be helpful to know your ${fields}.`;
            }
        }
        return `Let's work on: ${goal.description}`;
    }
    /**
     * Generate reason for pursuing goal
     */
    generatePursuitReason(goal, attemptCount, adherenceLevel) {
        const reasons = [];
        if (goal.priority === 'critical')
            reasons.push('critical priority');
        if (adherenceLevel >= 8)
            reasons.push('high adherence');
        if (attemptCount === 1)
            reasons.push('first attempt');
        if (attemptCount > 1)
            reasons.push(`attempt ${attemptCount}`);
        return reasons.join(', ') || 'standard goal progression';
    }
    /**
     * Check for goal completion triggers (combos, etc.)
     */
    checkCompletionTriggers(goalConfig, state, result) {
        // Safety check: ensure completionTriggers exists
        if (!goalConfig.completionTriggers) {
            return;
        }
        // Check custom combinations
        if (goalConfig.completionTriggers.customCombinations) {
            for (const combo of goalConfig.completionTriggers.customCombinations) {
                const allCompleted = combo.goalIds.every(goalId => state.completedGoals.includes(goalId));
                if (allCompleted && !result.triggeredIntents.includes(combo.triggerIntent)) {
                    console.log(`🎉 Goal combo triggered: ${combo.triggerIntent}`);
                    result.triggeredIntents.push(combo.triggerIntent);
                }
            }
        }
        // Check all critical complete
        if (goalConfig.completionTriggers.allCriticalComplete) {
            const criticalGoals = goalConfig.goals.filter(g => g.priority === 'critical');
            const allCriticalComplete = criticalGoals.every(goal => state.completedGoals.includes(goal.id));
            if (allCriticalComplete && !result.triggeredIntents.includes(goalConfig.completionTriggers.allCriticalComplete)) {
                console.log(`🎉 All critical goals complete!`);
                result.triggeredIntents.push(goalConfig.completionTriggers.allCriticalComplete);
            }
        }
    }
    /**
     * Execute actions when a goal completes
     */
    async executeGoalActions(goal, context) {
        if (!goal.actions?.onComplete || !this.eventBridgeService) {
            return;
        }
        console.log(`🎯 Executing ${goal.actions.onComplete.length} actions for goal: ${goal.id}`);
        for (const action of goal.actions.onComplete) {
            try {
                await this.executeAction(action, goal.id, context);
            }
            catch (error) {
                console.error(`❌ Failed to execute action ${action.type} for goal ${goal.id}:`, error);
            }
        }
    }
    /**
     * Execute a single action
     */
    async executeAction(action, goalId, context) {
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
        await this.eventBridgeService.publishCustomEvent('kxgen.agent.goals', eventName, payload);
        console.log(`\x1b[32m✅ Goal action completed: ${eventName}\x1b[0m`);
        console.log('\x1b[33m══════════════════════════════════════════════════════════════\x1b[0m\n');
    }
    /**
     * Get default event name for action type
     */
    getDefaultEventName(actionType) {
        const defaults = {
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
    getOrInitState(sessionId, userId, tenantId, channelState) {
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
            }
            else {
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
        return this.goalStates.get(key);
    }
    /**
     * Get current goal state for debugging
     */
    getGoalState(sessionId, userId, tenantId) {
        const key = `${tenantId}:${sessionId}:${userId}`;
        return this.goalStates.get(key);
    }
    /**
     * Reset goal state (for testing)
     */
    resetGoalState(sessionId, userId, tenantId) {
        const key = `${tenantId}:${sessionId}:${userId}`;
        this.goalStates.delete(key);
    }
}
exports.GoalOrchestrator = GoalOrchestrator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ29hbC1vcmNoZXN0cmF0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2dvYWwtb3JjaGVzdHJhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQThDQTs7Ozs7OztHQU9HO0FBQ0gsTUFBYSxnQkFBZ0I7SUFJM0IsWUFBWSxrQkFBd0I7UUFGNUIsZUFBVSxHQUEyQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBR3JELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxrQkFBa0IsQ0FBQztJQUMvQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsZ0JBQWdCLENBQ3BCLE9BQWUsRUFDZixTQUFpQixFQUNqQixNQUFjLEVBQ2QsUUFBZ0IsRUFDaEIsVUFBNkIsRUFDN0IsbUJBQThCLEVBQzlCLE9BQXVCLEVBQ3ZCLFlBQW1DO1FBRW5DLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFbkUsaUVBQWlFO1FBQ2pFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFN0UsMERBQTBEO1FBQzFELElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsWUFBWSxDQUFDLFlBQVksY0FBYyxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sWUFBWSxDQUFDLENBQUM7WUFDOUgsS0FBSyxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUMsWUFBWSxDQUFDO1lBQy9DLEtBQUssQ0FBQyxjQUFjLEdBQUcsQ0FBQyxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUN4RCxLQUFLLENBQUMsV0FBVyxHQUFHLENBQUMsR0FBRyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDbEQsS0FBSyxDQUFDLGFBQWEsR0FBRyxFQUFFLEdBQUcsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3pELENBQUM7YUFBTSxDQUFDO1lBQ04sMkNBQTJDO1lBQzNDLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUN2QixDQUFDO1FBRUQsaUZBQWlGO1FBQ2pGLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLE1BQU0scUJBQXFCLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2RixJQUFJLGtCQUFrQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsa0JBQWtCLENBQUMsTUFBTSwwQkFBMEIsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvRyxLQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUM7UUFFRCxJQUFJLHFCQUFxQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUscUJBQXFCLENBQUMsTUFBTSw2QkFBNkIscUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4SCxLQUFLLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7UUFFRCxLQUFLLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQztRQUU1QixPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsS0FBSyxDQUFDLFlBQVksY0FBYyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sZUFBZSxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sU0FBUyxDQUFDLENBQUM7UUFFdEksTUFBTSxNQUFNLEdBQTRCO1lBQ3RDLGVBQWUsRUFBRSxFQUFFO1lBQ25CLGFBQWEsRUFBRSxFQUFFO1lBQ2pCLFlBQVksRUFBRTtnQkFDWixjQUFjLEVBQUUsRUFBRTtnQkFDbEIsY0FBYyxFQUFFLEVBQUU7Z0JBQ2xCLFFBQVEsRUFBRSxFQUFFO2FBQ2I7WUFDRCxnQkFBZ0IsRUFBRSxFQUFFO1lBQ3BCLFdBQVcsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQztZQUNuQyxjQUFjLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUM7U0FDMUMsQ0FBQztRQUVGLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDeEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQzlDLE9BQU8sTUFBTSxDQUFDO1FBQ2hCLENBQUM7UUFFRCw4RUFBOEU7UUFDOUUsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMxRixPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssYUFBYSxDQUFDLE1BQU0seUJBQXlCLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxTQUFTLENBQUMsQ0FBQztRQUVoRyw0RkFBNEY7UUFDNUYsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRWpGLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztRQUV4RCx3Q0FBd0M7UUFDeEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUVsRix3REFBd0Q7UUFDeEQsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLGVBQWUsQ0FBQyxNQUFNLHdDQUF3QyxDQUFDLENBQUM7UUFFbEYseUNBQXlDO1FBQ3pDLEtBQUssTUFBTSxJQUFJLElBQUksZUFBZSxFQUFFLENBQUM7WUFDbkMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDNUUsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDbkIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7Z0JBRTVDLGdDQUFnQztnQkFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUN6QyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQ2hDLE1BQU0sQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ25ELENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxrQkFBa0IsQ0FBQyxDQUFDO1FBRTdFLDJFQUEyRTtRQUMzRSxNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxlQUFlO2FBQ2pELE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUM7YUFDM0IsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRCLHFFQUFxRTtRQUNyRSxNQUFNLGNBQWMsR0FBRyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0RixzQ0FBc0M7UUFDdEMsTUFBTSxDQUFDLFdBQVcsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUN4QyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUMvRCxDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLGVBQWUscUJBQXFCLENBQUMsTUFBTSxPQUFPLENBQUMsQ0FBQztRQUV0SyxnQ0FBZ0M7UUFDaEMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFeEQsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLGtCQUFrQixDQUM5QixPQUFlLEVBQ2YsVUFBNkIsRUFDN0IsS0FBZ0IsRUFDaEIsTUFBK0IsRUFDL0IsYUFBZ0MsQ0FBRSx1REFBdUQ7O1FBRXpGLDRGQUE0RjtRQUM1Rix5RkFBeUY7UUFDekYsTUFBTSxZQUFZLEdBQUcsYUFBYSxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUM7UUFDdkQsTUFBTSxtQkFBbUIsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUM3QyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxpQkFBaUIsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLGNBQWMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQztZQUN0RixDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsSUFBSSxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FDeEYsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLG1CQUFtQixDQUFDLE1BQU0sd0NBQXdDLENBQUMsQ0FBQztRQUVuSCxLQUFLLE1BQU0sSUFBSSxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTTtnQkFBRSxTQUFTO1lBRTFDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksQ0FBQyxFQUFFLFdBQVcsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbEUsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFFaEcsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDbkMsNEJBQTRCO2dCQUM1QixJQUFJLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztvQkFDbkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLFNBQVMsdUJBQXVCLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUN6RixTQUFTO2dCQUNYLENBQUM7Z0JBRUQsc0VBQXNFO2dCQUN0RSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxDQUFDO2dCQUV0RyxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNuQiw4Q0FBOEM7b0JBQzlDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDcEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsU0FBUyxFQUFFLENBQUMsQ0FBQztvQkFDOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLGNBQWMsRUFBRSxDQUFDLENBQUM7b0JBQzNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztvQkFFcEMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxjQUFjLENBQUM7b0JBQ2hELE1BQU0sQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsY0FBYyxDQUFDO2dCQUNuRCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsU0FBUyxXQUFXLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDekYsQ0FBQztZQUNILENBQUM7WUFFRCw0REFBNEQ7WUFDNUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxDQUFDLEVBQUUsc0JBQXNCLFVBQVUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO1lBRWxHLElBQUksVUFBVSxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxLQUFLLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ25DLEtBQUssQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRSxNQUFNLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUVqRCx1QkFBdUI7Z0JBQ3ZCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztvQkFDN0IsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFO3dCQUNsQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7d0JBQ3hCLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTt3QkFDcEIsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO3dCQUMxQixhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWE7cUJBQ25DLENBQUMsQ0FBQztnQkFDTCxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssaUJBQWlCLENBQ3ZCLE9BQWUsRUFDZixTQUFpQixFQUNqQixlQUFxQztRQUVyQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNFQUFzRSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBRWhHLHdEQUF3RDtRQUN4RCxtRUFBbUU7UUFDbkUseUNBQXlDO1FBRXpDLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVEOzs7T0FHRztJQUNLLGFBQWEsQ0FBQyxLQUFhLEVBQUUsS0FBVztRQUM5QyxJQUFJLENBQUMsS0FBSztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBRXhCLGlEQUFpRDtRQUNqRCxtRUFBbUU7UUFDbkUsdUJBQXVCO1FBQ3ZCLDZDQUE2QztRQUM3Qyw4QkFBOEI7UUFDOUIscUZBQXFGO1FBQ3JGLG9CQUFvQjtRQUNwQixNQUFNO1FBQ04sSUFBSTtRQUVKLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVEOztPQUVHO0lBQ0ssYUFBYSxDQUFDLElBQW9CO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLE1BQU07WUFBRSxPQUFPLEVBQUUsQ0FBQztRQUUzQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQztRQUV6QyxxQ0FBcUM7UUFDckMsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxPQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzlFLE9BQVEsTUFBa0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUVELDJCQUEyQjtRQUMzQixPQUFPLE1BQWtCLENBQUM7SUFDNUIsQ0FBQztJQUVEOztPQUVHO0lBQ0sscUJBQXFCLENBQUMsSUFBb0I7UUFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsTUFBTTtZQUFFLE9BQU8sRUFBRSxDQUFDO1FBRTNDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBRXpDLHFDQUFxQztRQUNyQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLE9BQU8sTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDOUUsT0FBUSxNQUFxRDtpQkFDMUQsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztpQkFDdkIsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RCLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDO1FBQ3ZELE9BQVEsTUFBbUIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDN0MsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3BDLE9BQU8sVUFBVSxFQUFFLFFBQVEsS0FBSyxLQUFLLENBQUMsQ0FBQyxzQkFBc0I7UUFDL0QsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSywyQkFBMkIsQ0FBQyxJQUFvQixFQUFFLEtBQWdCO1FBQ3hFLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLE1BQU07WUFBRSxPQUFPLEtBQUssQ0FBQztRQUU5QyxpRUFBaUU7UUFDakUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXhELDRDQUE0QztRQUM1QyxLQUFLLE1BQU0sU0FBUyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLFNBQVMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RELE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyRixPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNLLDBCQUEwQixDQUNoQyxPQUFlLEVBQ2YsS0FBZ0IsRUFDaEIsTUFBK0I7UUFFL0IsTUFBTSxlQUFlLEdBQUc7WUFDdEIsZUFBZTtZQUNmLG9CQUFvQjtZQUNwQixnQkFBZ0I7WUFDaEIsT0FBTztZQUNQLHFCQUFxQjtZQUNyQixvQkFBb0I7U0FDckIsQ0FBQztRQUVGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFekUsSUFBSSxTQUFTLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUMsb0NBQW9DO1lBQ3BDLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQ0FBZ0M7WUFDM0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsWUFBWSxFQUFFLENBQUMsQ0FBQztZQUNyRCxLQUFLLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUN2QyxLQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLFlBQVksQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNsRCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQ3pCLEtBQXVCLEVBQ3ZCLEtBQWdCLEVBQ2hCLE9BQWUsRUFDZixPQUF1QjtRQUV2QixPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDekIsd0NBQXdDO1lBQ3hDLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQzNDLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUNELElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQzFDLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUVELHNCQUFzQjtZQUN0QixJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLElBQUksQ0FBQyxFQUFFLGdCQUFnQixPQUFPLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRSxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFFRCxpQkFBaUI7WUFDakIsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2xCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzlELENBQUM7WUFFRCx1Q0FBdUM7WUFDdkMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2hCLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkQsQ0FBQztZQUVELCtCQUErQjtZQUMvQixPQUFPLElBQUksQ0FBQztRQUNkLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0ssZ0JBQWdCLENBQ3RCLFFBQWlELEVBQ2pELEtBQWdCLEVBQ2hCLE9BQWU7UUFFZixNQUFNLE9BQU8sR0FBYyxFQUFFLENBQUM7UUFFOUIsa0ZBQWtGO1FBQ2xGLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDO1FBQ3hFLElBQUksYUFBYSxJQUFJLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUMsTUFBTSxlQUFlLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsRUFBRTtnQkFDM0QsZ0RBQWdEO2dCQUNoRCxvRUFBb0U7Z0JBQ3BFLE9BQU8sS0FBSyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FDN0MsV0FBVyxLQUFLLGNBQWMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUMsQ0FDL0UsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsZUFBZSxlQUFlLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RHLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELCtCQUErQjtRQUMvQixJQUFJLFFBQVEsQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDeEMsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFlBQVksSUFBSSxRQUFRLENBQUMsWUFBWSxDQUFDO1lBQ2pFLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLFlBQVksS0FBSyxLQUFLLENBQUMsWUFBWSxPQUFPLFFBQVEsQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBQzFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0IsQ0FBQztRQUVELCtCQUErQjtRQUMvQixJQUFJLFFBQVEsQ0FBQyxXQUFXLElBQUksUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDNUQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQzNDLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ3hELFlBQVksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQzVDLENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixjQUFjLGtCQUFrQixRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekcsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQ7O09BRUc7SUFDSyxvQkFBb0IsQ0FDMUIsTUFBNkMsRUFDN0MsS0FBZ0I7UUFFaEIsSUFBSSxNQUFNLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xFLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUNELElBQUksTUFBTSxDQUFDLFdBQVcsSUFBSSxLQUFLLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNsRSxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNLLDZCQUE2QixDQUNuQyxLQUF1QixFQUN2QixVQUE2QjtRQUU3QixNQUFNLGdCQUFnQixHQUFHLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBRXRFLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN6QixrREFBa0Q7WUFDbEQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUM7WUFDL0IsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUM7WUFFL0IsSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ3RCLE9BQU8sTUFBTSxHQUFHLE1BQU0sQ0FBQztZQUN6QixDQUFDO1lBRUQsbURBQW1EO1lBQ25ELE1BQU0sV0FBVyxHQUFHLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNqRCxNQUFNLFdBQVcsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFakQsT0FBTyxXQUFXLEdBQUcsV0FBVyxDQUFDO1FBQ25DLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0ssc0JBQXNCLENBQzVCLFdBQTZCLEVBQzdCLFVBQTZCLEVBQzdCLEtBQWdCO1FBRWhCLElBQUksZUFBZSxHQUFHLFdBQVcsQ0FBQztRQUVsQyx3QkFBd0I7UUFDeEIsTUFBTSxjQUFjLEdBQUcsVUFBVSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUM7UUFFaEUsSUFBSSxjQUFjLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDekIsdURBQXVEO1lBQ3ZELCtEQUErRDtZQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdFQUF3RSxDQUFDLENBQUM7WUFDdEYsT0FBTyxlQUFlLENBQUM7UUFDekIsQ0FBQztRQUVELElBQUksY0FBYyxJQUFJLGNBQWMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUMxQyx1REFBdUQ7WUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsY0FBYywyQkFBMkIsQ0FBQyxDQUFDO1lBRXRGLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLHFEQUFxRDtnQkFDckQsT0FBTyxFQUFFLENBQUM7WUFDWixDQUFDO1lBRUQsZUFBZSxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFRCwyQkFBMkI7UUFDM0IsTUFBTSxlQUFlLEdBQUcsVUFBVSxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUM7UUFDbEUsSUFBSSxlQUFlLElBQUksZUFBZSxHQUFHLENBQUMsSUFBSSxjQUFjLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsZUFBZSxFQUFFLENBQUMsQ0FBQztZQUN6RCxlQUFlLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUVELE9BQU8sZUFBZSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNLLHNCQUFzQixDQUM1QixJQUFvQixFQUNwQixLQUFnQixFQUNoQixVQUE2QjtRQUU3QixNQUFNLGdCQUFnQixHQUFHLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3RFLE1BQU0sUUFBUSxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVqRCw2REFBNkQ7UUFDN0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsQ0FBQyw4QkFBOEI7UUFFMUUsMEJBQTBCO1FBQzFCLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWxELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLENBQUMsRUFBRSxlQUFlLGNBQWMsaUJBQWlCLFlBQVksRUFBRSxDQUFDLENBQUM7UUFFNUYsa0NBQWtDO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDO1FBQy9DLElBQUksV0FBVyxJQUFJLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQztZQUM5QyxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixJQUFJLENBQUMsRUFBRSxLQUFLLFlBQVksSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1lBRXZGLG9DQUFvQztZQUNwQyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQzNDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwQyxDQUFDO1lBRUQsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBRUQsMERBQTBEO1FBQzFELElBQUksUUFBUSxHQUF1QyxZQUFZLENBQUM7UUFFaEUsSUFBSSxjQUFjLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDeEIsUUFBUSxHQUFHLFFBQVEsQ0FBQyxDQUFDLG1DQUFtQztRQUMxRCxDQUFDO2FBQU0sSUFBSSxjQUFjLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0IsUUFBUSxHQUFHLFFBQVEsQ0FBQyxDQUFDLGtDQUFrQztRQUN6RCxDQUFDO1FBRUQsMERBQTBEO1FBQzFELElBQUksWUFBWSxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLGVBQWUsRUFBRSxDQUFDO1lBQ3ZELFFBQVEsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQ3RDLFFBQVEsRUFDUixJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFDN0IsWUFBWSxDQUNiLENBQUM7UUFDSixDQUFDO1FBRUQsbUJBQW1CO1FBQ25CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQztRQUU5RSxPQUFPO1lBQ0wsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFO1lBQ2YsSUFBSTtZQUNKLFFBQVE7WUFDUixjQUFjO1lBQ2QsTUFBTSxFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLGNBQWMsQ0FBQztZQUN0RSxRQUFRO1lBQ1IsT0FBTztZQUNQLFlBQVksRUFBRSxJQUFJO1lBQ2xCLFlBQVk7U0FDYixDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0ssd0JBQXdCLENBQzlCLFlBQWdELEVBQ2hELGVBQXVELEVBQ3ZELFlBQW9CO1FBRXBCLElBQUksZUFBZSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2pDLCtCQUErQjtZQUMvQixJQUFJLFlBQVksSUFBSSxDQUFDO2dCQUFFLE9BQU8sUUFBUSxDQUFDO1lBQ3ZDLElBQUksWUFBWSxJQUFJLENBQUM7Z0JBQUUsT0FBTyxZQUFZLENBQUM7UUFDN0MsQ0FBQzthQUFNLElBQUksZUFBZSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQzVDLG9DQUFvQztZQUNwQyxJQUFJLFlBQVksSUFBSSxDQUFDO2dCQUFFLE9BQU8sUUFBUSxDQUFDO1FBQ3pDLENBQUM7UUFDRCx1Q0FBdUM7UUFDdkMsT0FBTyxZQUFZLENBQUM7SUFDdEIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQ3pCLElBQW9CLEVBQ3BCLFFBQTRDLEVBQzVDLEtBQWdCLEVBQ2hCLFlBQW9CO1FBRXBCLGlDQUFpQztRQUNqQyxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNsQixJQUFJLFlBQVksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDaEQsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztZQUMvQixDQUFDO2lCQUFNLElBQUksWUFBWSxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUN0RCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDO1lBQ2hDLENBQUM7UUFDSCxDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUMzQixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO1FBQy9CLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLE1BQU0sRUFBRSxDQUFDO1lBQy9CLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDNUMsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVyQyxJQUFJLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDMUIsT0FBTyxlQUFlLE1BQU0sZUFBZSxDQUFDO1lBQzlDLENBQUM7aUJBQU0sSUFBSSxRQUFRLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQ3JDLE9BQU8sNENBQTRDLE1BQU0sR0FBRyxDQUFDO1lBQy9ELENBQUM7aUJBQU0sQ0FBQztnQkFDTixPQUFPLGdEQUFnRCxNQUFNLEdBQUcsQ0FBQztZQUNuRSxDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sa0JBQWtCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM5QyxDQUFDO0lBRUQ7O09BRUc7SUFDSyxxQkFBcUIsQ0FDM0IsSUFBb0IsRUFDcEIsWUFBb0IsRUFDcEIsY0FBc0I7UUFFdEIsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBRW5CLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxVQUFVO1lBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3BFLElBQUksY0FBYyxJQUFJLENBQUM7WUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDeEQsSUFBSSxZQUFZLEtBQUssQ0FBQztZQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdEQsSUFBSSxZQUFZLEdBQUcsQ0FBQztZQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBRTlELE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSwyQkFBMkIsQ0FBQztJQUMzRCxDQUFDO0lBRUQ7O09BRUc7SUFDSyx1QkFBdUIsQ0FDN0IsVUFBNkIsRUFDN0IsS0FBZ0IsRUFDaEIsTUFBK0I7UUFFL0IsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxVQUFVLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNuQyxPQUFPO1FBQ1QsQ0FBQztRQUVELDRCQUE0QjtRQUM1QixJQUFJLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3JELEtBQUssTUFBTSxLQUFLLElBQUksVUFBVSxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQ3JFLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ2hELEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUN0QyxDQUFDO2dCQUVGLElBQUksWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztvQkFDM0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7b0JBQy9ELE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUNwRCxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFFRCw4QkFBOEI7UUFDOUIsSUFBSSxVQUFVLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUN0RCxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssVUFBVSxDQUFDLENBQUM7WUFDOUUsTUFBTSxtQkFBbUIsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQ3JELEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FDdkMsQ0FBQztZQUVGLElBQUksbUJBQW1CLElBQUksQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hILE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUNsRixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxrQkFBa0IsQ0FDdEIsSUFBb0IsRUFDcEIsT0FNQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzFELE9BQU87UUFDVCxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxzQkFBc0IsSUFBSSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFM0YsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzdDLElBQUksQ0FBQztnQkFDSCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDckQsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsTUFBTSxDQUFDLElBQUksYUFBYSxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekYsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxLQUFLLENBQUMsYUFBYSxDQUN6QixNQUFxQixFQUNyQixNQUFjLEVBQ2QsT0FNQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUZBQWlGLENBQUMsQ0FBQztRQUMvRixPQUFPLENBQUMsR0FBRyxDQUFDLGlGQUFpRixDQUFDLENBQUM7UUFDL0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpRkFBaUYsQ0FBQyxDQUFDO1FBQy9GLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDeEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDNUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsTUFBTSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU3RyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUUsTUFBTSxPQUFPLEdBQUc7WUFDZCxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7WUFDMUIsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQzVCLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTTtZQUN0QixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDNUIsTUFBTTtZQUNOLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNuQyxHQUFHLE1BQU0sQ0FBQyxPQUFPO1lBQ2pCLDhDQUE4QztZQUM5QyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSywyQkFBMkIsSUFBSSxFQUFFLFdBQVcsRUFBRSxPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7U0FDM0YsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRCxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVyRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssMkJBQTJCLEVBQUUsQ0FBQztZQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJDQUEyQyxDQUFDLENBQUM7WUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUVELE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUM5QyxtQkFBbUIsRUFDbkIsU0FBUyxFQUNULE9BQU8sQ0FDUixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsU0FBUyxTQUFTLENBQUMsQ0FBQztRQUNwRSxPQUFPLENBQUMsR0FBRyxDQUFDLGlGQUFpRixDQUFDLENBQUM7SUFDakcsQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQUMsVUFBa0I7UUFDNUMsTUFBTSxRQUFRLEdBQTJCO1lBQ3ZDLDJCQUEyQixFQUFFLHVCQUF1QjtZQUNwRCx5QkFBeUIsRUFBRSx1QkFBdUI7WUFDbEQsbUJBQW1CLEVBQUUsbUJBQW1CO1lBQ3hDLFlBQVksRUFBRSxzQkFBc0I7WUFDcEMsUUFBUSxFQUFFLGVBQWU7U0FDMUIsQ0FBQztRQUNGLE9BQU8sUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLGFBQWEsQ0FBQztJQUMvQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssY0FBYyxDQUNwQixTQUFpQixFQUNqQixNQUFjLEVBQ2QsUUFBZ0IsRUFDaEIsWUFBbUM7UUFFbkMsTUFBTSxHQUFHLEdBQUcsR0FBRyxRQUFRLElBQUksU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBRWpELElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzlCLDZDQUE2QztZQUM3QyxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQixJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUU7b0JBQ3ZCLFNBQVM7b0JBQ1QsTUFBTTtvQkFDTixRQUFRO29CQUNSLFlBQVksRUFBRSxZQUFZLENBQUMsWUFBWTtvQkFDdkMsY0FBYyxFQUFFLENBQUMsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDO29CQUNoRCxXQUFXLEVBQUUsQ0FBQyxHQUFHLFlBQVksQ0FBQyxXQUFXLENBQUM7b0JBQzFDLGFBQWEsRUFBRSxFQUFFO29CQUNqQixhQUFhLEVBQUUsRUFBRTtvQkFDakIsYUFBYSxFQUFFLEVBQUUsR0FBRyxZQUFZLENBQUMsWUFBWSxFQUFFO2lCQUNoRCxDQUFDLENBQUM7Z0JBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0Q0FBNEMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxNQUFNLGtCQUFrQixDQUFDLENBQUM7WUFDaEgsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLHNCQUFzQjtnQkFDdEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFO29CQUN2QixTQUFTO29CQUNULE1BQU07b0JBQ04sUUFBUTtvQkFDUixZQUFZLEVBQUUsQ0FBQztvQkFDZixjQUFjLEVBQUUsRUFBRTtvQkFDbEIsV0FBVyxFQUFFLEVBQUU7b0JBQ2YsYUFBYSxFQUFFLEVBQUU7b0JBQ2pCLGFBQWEsRUFBRSxFQUFFO29CQUNqQixhQUFhLEVBQUUsRUFBRTtpQkFDbEIsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBRSxDQUFDO0lBQ25DLENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVksQ0FBQyxTQUFpQixFQUFFLE1BQWMsRUFBRSxRQUFnQjtRQUM5RCxNQUFNLEdBQUcsR0FBRyxHQUFHLFFBQVEsSUFBSSxTQUFTLElBQUksTUFBTSxFQUFFLENBQUM7UUFDakQsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxjQUFjLENBQUMsU0FBaUIsRUFBRSxNQUFjLEVBQUUsUUFBZ0I7UUFDaEUsTUFBTSxHQUFHLEdBQUcsR0FBRyxRQUFRLElBQUksU0FBUyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQ2pELElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLENBQUM7Q0FDRjtBQXowQkQsNENBeTBCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgXG4gIEdvYWxDb25maWd1cmF0aW9uLCBcbiAgR29hbERlZmluaXRpb24sXG4gIEFjdGlvblRyaWdnZXIsXG4gIE1lc3NhZ2VTb3VyY2UsXG4gIENoYW5uZWxXb3JrZmxvd1N0YXRlXG59IGZyb20gJy4uL3R5cGVzL2R5bmFtb2RiLXNjaGVtYXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdvYWxSZWNvbW1lbmRhdGlvbiB7XG4gIGdvYWxJZDogc3RyaW5nO1xuICBnb2FsOiBHb2FsRGVmaW5pdGlvbjtcbiAgcHJpb3JpdHk6IG51bWJlcjtcbiAgcmVhc29uOiBzdHJpbmc7XG4gIGFwcHJvYWNoOiAnZGlyZWN0JyB8ICdjb250ZXh0dWFsJyB8ICdzdWJ0bGUnO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIHNob3VsZFB1cnN1ZTogYm9vbGVhbjtcbiAgYWRoZXJlbmNlTGV2ZWw6IG51bWJlcjsgLy8gMS0xMCBzY2FsZVxuICBhdHRlbXB0Q291bnQ/OiBudW1iZXI7IC8vIE51bWJlciBvZiB0aW1lcyB0aGlzIGdvYWwgaGFzIGJlZW4gcHVyc3VlZFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0IHtcbiAgcmVjb21tZW5kYXRpb25zOiBHb2FsUmVjb21tZW5kYXRpb25bXTtcbiAgZXh0cmFjdGVkSW5mbzogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgc3RhdGVVcGRhdGVzOiB7XG4gICAgbmV3bHlDb21wbGV0ZWQ6IHN0cmluZ1tdO1xuICAgIG5ld2x5QWN0aXZhdGVkOiBzdHJpbmdbXTtcbiAgICBkZWNsaW5lZDogc3RyaW5nW107XG4gIH07XG4gIHRyaWdnZXJlZEludGVudHM6IHN0cmluZ1tdO1xuICBhY3RpdmVHb2Fsczogc3RyaW5nW107XG4gIGNvbXBsZXRlZEdvYWxzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHb2FsU3RhdGUge1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRlbmFudElkOiBzdHJpbmc7XG4gIG1lc3NhZ2VDb3VudDogbnVtYmVyO1xuICBjb21wbGV0ZWRHb2Fsczogc3RyaW5nW107XG4gIGFjdGl2ZUdvYWxzOiBzdHJpbmdbXTtcbiAgZGVjbGluZWRHb2Fsczogc3RyaW5nW107XG4gIGF0dGVtcHRDb3VudHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIGNvbGxlY3RlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIGxhc3RNZXNzYWdlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEVuaGFuY2VkIEdvYWwgT3JjaGVzdHJhdG9yIHdpdGggUGhhc2UgQSBmZWF0dXJlczpcbiAqIC0gR29hbCBvcmRlcmluZyBiYXNlZCBvbiBgb3JkZXJgIGZpZWxkXG4gKiAtIEFkaGVyZW5jZS1iYXNlZCBwcm9tcHRpbmcgKDEtMTAgc2NhbGUpXG4gKiAtIFRyaWdnZXIgZXZhbHVhdGlvbiAocHJlcmVxdWlzaXRlR29hbHMsIHVzZXJTaWduYWxzLCBtZXNzYWdlQ291bnQpXG4gKiAtIFN0cmljdCBvcmRlcmluZyBtb2RlXG4gKiAtIE1heCBnb2FscyBwZXIgdHVyblxuICovXG5leHBvcnQgY2xhc3MgR29hbE9yY2hlc3RyYXRvciB7XG4gIHByaXZhdGUgZXZlbnRCcmlkZ2VTZXJ2aWNlPzogYW55O1xuICBwcml2YXRlIGdvYWxTdGF0ZXM6IE1hcDxzdHJpbmcsIEdvYWxTdGF0ZT4gPSBuZXcgTWFwKCk7XG5cbiAgY29uc3RydWN0b3IoZXZlbnRCcmlkZ2VTZXJ2aWNlPzogYW55KSB7XG4gICAgdGhpcy5ldmVudEJyaWRnZVNlcnZpY2UgPSBldmVudEJyaWRnZVNlcnZpY2U7XG4gIH1cblxuICAvKipcbiAgICogTWFpbiBvcmNoZXN0cmF0aW9uIG1ldGhvZCAtIGFuYWx5emVzIG1lc3NhZ2UgYW5kIGRldGVybWluZXMgZ29hbCBhY3Rpb25zXG4gICAqL1xuICBhc3luYyBvcmNoZXN0cmF0ZUdvYWxzKFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgICBzZXNzaW9uSWQ6IHN0cmluZyxcbiAgICB1c2VySWQ6IHN0cmluZyxcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxuICAgIGdvYWxDb25maWc6IEdvYWxDb25maWd1cmF0aW9uLFxuICAgIGNvbnZlcnNhdGlvbkhpc3Rvcnk/OiBzdHJpbmdbXSxcbiAgICBjaGFubmVsPzogTWVzc2FnZVNvdXJjZSxcbiAgICBjaGFubmVsU3RhdGU/OiBDaGFubmVsV29ya2Zsb3dTdGF0ZVxuICApOiBQcm9taXNlPEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0PiB7XG4gICAgY29uc29sZS5sb2coYPCfjq8gR29hbCBPcmNoZXN0cmF0aW9uIFNUQVJUIC0gU2Vzc2lvbjogJHtzZXNzaW9uSWR9YCk7XG5cbiAgICAvLyBHZXQgb3IgaW5pdGlhbGl6ZSBzdGF0ZSAobm93IHVzaW5nIGNoYW5uZWwgc3RhdGUgaWYgYXZhaWxhYmxlKVxuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5nZXRPckluaXRTdGF0ZShzZXNzaW9uSWQsIHVzZXJJZCwgdGVuYW50SWQsIGNoYW5uZWxTdGF0ZSk7XG4gICAgXG4gICAgLy8gSWYgd2UgaGF2ZSBjaGFubmVsIHN0YXRlLCB1c2UgaXQgYXMgdGhlIHNvdXJjZSBvZiB0cnV0aFxuICAgIGlmIChjaGFubmVsU3RhdGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OKIFVzaW5nIGNoYW5uZWwgc3RhdGU6ICR7Y2hhbm5lbFN0YXRlLm1lc3NhZ2VDb3VudH0gbWVzc2FnZXMsICR7Y2hhbm5lbFN0YXRlLmNvbXBsZXRlZEdvYWxzLmxlbmd0aH0gY29tcGxldGVkYCk7XG4gICAgICBzdGF0ZS5tZXNzYWdlQ291bnQgPSBjaGFubmVsU3RhdGUubWVzc2FnZUNvdW50O1xuICAgICAgc3RhdGUuY29tcGxldGVkR29hbHMgPSBbLi4uY2hhbm5lbFN0YXRlLmNvbXBsZXRlZEdvYWxzXTtcbiAgICAgIHN0YXRlLmFjdGl2ZUdvYWxzID0gWy4uLmNoYW5uZWxTdGF0ZS5hY3RpdmVHb2Fsc107XG4gICAgICBzdGF0ZS5jb2xsZWN0ZWREYXRhID0geyAuLi5jaGFubmVsU3RhdGUuY2FwdHVyZWREYXRhIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIExlZ2FjeSBiZWhhdmlvcjogaW5jcmVtZW50IG1lc3NhZ2UgY291bnRcbiAgICAgIHN0YXRlLm1lc3NhZ2VDb3VudCsrO1xuICAgIH1cbiAgICBcbiAgICAvLyBDUklUSUNBTDogU2FuaXRpemUgc3RhdGUgLSByZW1vdmUgZ29hbHMgdGhhdCBubyBsb25nZXIgZXhpc3QgaW4gY3VycmVudCBjb25maWdcbiAgICBjb25zdCB2YWxpZEdvYWxJZHMgPSBuZXcgU2V0KGdvYWxDb25maWcuZ29hbHMubWFwKGcgPT4gZy5pZCkpO1xuICAgIGNvbnN0IGludmFsaWRBY3RpdmVHb2FscyA9IHN0YXRlLmFjdGl2ZUdvYWxzLmZpbHRlcihpZCA9PiAhdmFsaWRHb2FsSWRzLmhhcyhpZCkpO1xuICAgIGNvbnN0IGludmFsaWRDb21wbGV0ZWRHb2FscyA9IHN0YXRlLmNvbXBsZXRlZEdvYWxzLmZpbHRlcihpZCA9PiAhdmFsaWRHb2FsSWRzLmhhcyhpZCkpO1xuICAgIFxuICAgIGlmIChpbnZhbGlkQWN0aXZlR29hbHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYOKaoO+4jyBSZW1vdmluZyAke2ludmFsaWRBY3RpdmVHb2Fscy5sZW5ndGh9IGludmFsaWQgYWN0aXZlIGdvYWxzOiAke2ludmFsaWRBY3RpdmVHb2Fscy5qb2luKCcsICcpfWApO1xuICAgICAgc3RhdGUuYWN0aXZlR29hbHMgPSBzdGF0ZS5hY3RpdmVHb2Fscy5maWx0ZXIoaWQgPT4gdmFsaWRHb2FsSWRzLmhhcyhpZCkpO1xuICAgIH1cbiAgICBcbiAgICBpZiAoaW52YWxpZENvbXBsZXRlZEdvYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gUmVtb3ZpbmcgJHtpbnZhbGlkQ29tcGxldGVkR29hbHMubGVuZ3RofSBpbnZhbGlkIGNvbXBsZXRlZCBnb2FsczogJHtpbnZhbGlkQ29tcGxldGVkR29hbHMuam9pbignLCAnKX1gKTtcbiAgICAgIHN0YXRlLmNvbXBsZXRlZEdvYWxzID0gc3RhdGUuY29tcGxldGVkR29hbHMuZmlsdGVyKGlkID0+IHZhbGlkR29hbElkcy5oYXMoaWQpKTtcbiAgICB9XG4gICAgXG4gICAgc3RhdGUubGFzdE1lc3NhZ2UgPSBtZXNzYWdlO1xuXG4gICAgY29uc29sZS5sb2coYPCfk4ogU3RhdGU6ICR7c3RhdGUubWVzc2FnZUNvdW50fSBtZXNzYWdlcywgJHtzdGF0ZS5jb21wbGV0ZWRHb2Fscy5sZW5ndGh9IGNvbXBsZXRlZCwgJHtzdGF0ZS5hY3RpdmVHb2Fscy5sZW5ndGh9IGFjdGl2ZWApO1xuXG4gICAgY29uc3QgcmVzdWx0OiBHb2FsT3JjaGVzdHJhdGlvblJlc3VsdCA9IHtcbiAgICAgIHJlY29tbWVuZGF0aW9uczogW10sXG4gICAgICBleHRyYWN0ZWRJbmZvOiB7fSxcbiAgICAgIHN0YXRlVXBkYXRlczoge1xuICAgICAgICBuZXdseUNvbXBsZXRlZDogW10sXG4gICAgICAgIG5ld2x5QWN0aXZhdGVkOiBbXSxcbiAgICAgICAgZGVjbGluZWQ6IFtdXG4gICAgICB9LFxuICAgICAgdHJpZ2dlcmVkSW50ZW50czogW10sXG4gICAgICBhY3RpdmVHb2FsczogWy4uLnN0YXRlLmFjdGl2ZUdvYWxzXSxcbiAgICAgIGNvbXBsZXRlZEdvYWxzOiBbLi4uc3RhdGUuY29tcGxldGVkR29hbHNdXG4gICAgfTtcblxuICAgIGlmICghZ29hbENvbmZpZy5lbmFibGVkKSB7XG4gICAgICBjb25zb2xlLmxvZygn4pqg77iPIEdvYWwgb3JjaGVzdHJhdGlvbiBkaXNhYmxlZCcpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBQaGFzZSBBOiBGaWx0ZXIgZWxpZ2libGUgZ29hbHMgYmFzZWQgb24gdHJpZ2dlcnMgKE1PVkVEIEJFRk9SRSBleHRyYWN0aW9uISlcbiAgICBjb25zdCBlbGlnaWJsZUdvYWxzID0gdGhpcy5maWx0ZXJFbGlnaWJsZUdvYWxzKGdvYWxDb25maWcuZ29hbHMsIHN0YXRlLCBtZXNzYWdlLCBjaGFubmVsKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFICR7ZWxpZ2libGVHb2Fscy5sZW5ndGh9IGVsaWdpYmxlIGdvYWxzIChmcm9tICR7Z29hbENvbmZpZy5nb2Fscy5sZW5ndGh9IHRvdGFsKWApO1xuXG4gICAgLy8gUGhhc2UgQjogRXh0cmFjdCBpbmZvcm1hdGlvbiBmcm9tIG1lc3NhZ2UgKGR5bmFtaWMgZmllbGRzKSAtIE5PVyBpbmNsdWRlcyBlbGlnaWJsZSBnb2FscyFcbiAgICBhd2FpdCB0aGlzLmV4dHJhY3RJbmZvcm1hdGlvbihtZXNzYWdlLCBnb2FsQ29uZmlnLCBzdGF0ZSwgcmVzdWx0LCBlbGlnaWJsZUdvYWxzKTtcblxuICAgIC8vIENoZWNrIGZvciBpbmZvcm1hdGlvbiBkZWNsaW5lc1xuICAgIHRoaXMucHJvY2Vzc0luZm9ybWF0aW9uRGVjbGluZXMobWVzc2FnZSwgc3RhdGUsIHJlc3VsdCk7XG5cbiAgICAvLyBQaGFzZSBBOiBTb3J0IGJ5IG9yZGVyIGFuZCBpbXBvcnRhbmNlXG4gICAgY29uc3Qgc29ydGVkR29hbHMgPSB0aGlzLnNvcnRHb2Fsc0J5T3JkZXJBbmRJbXBvcnRhbmNlKGVsaWdpYmxlR29hbHMsIGdvYWxDb25maWcpO1xuICAgIFxuICAgIC8vIFBoYXNlIEE6IEFwcGx5IHN0cmljdCBvcmRlcmluZyBhbmQgbWF4IGdvYWxzIHBlciB0dXJuXG4gICAgY29uc3QgZ29hbHNUb0FjdGl2YXRlID0gdGhpcy5hcHBseUdsb2JhbENvbnN0cmFpbnRzKHNvcnRlZEdvYWxzLCBnb2FsQ29uZmlnLCBzdGF0ZSk7XG4gICAgY29uc29sZS5sb2coYPCfjq8gJHtnb2Fsc1RvQWN0aXZhdGUubGVuZ3RofSBnb2FscyB0byBhY3RpdmF0ZSAoYWZ0ZXIgY29uc3RyYWludHMpYCk7XG5cbiAgICAvLyBHZW5lcmF0ZSByZWNvbW1lbmRhdGlvbnMgZm9yIGVhY2ggZ29hbFxuICAgIGZvciAoY29uc3QgZ29hbCBvZiBnb2Fsc1RvQWN0aXZhdGUpIHtcbiAgICAgIGNvbnN0IHJlY29tbWVuZGF0aW9uID0gdGhpcy5nZW5lcmF0ZVJlY29tbWVuZGF0aW9uKGdvYWwsIHN0YXRlLCBnb2FsQ29uZmlnKTtcbiAgICAgIGlmIChyZWNvbW1lbmRhdGlvbikge1xuICAgICAgICByZXN1bHQucmVjb21tZW5kYXRpb25zLnB1c2gocmVjb21tZW5kYXRpb24pO1xuICAgICAgICBcbiAgICAgICAgLy8gTWFyayBhcyBhY3RpdmUgaWYgbm90IGFscmVhZHlcbiAgICAgICAgaWYgKCFzdGF0ZS5hY3RpdmVHb2Fscy5pbmNsdWRlcyhnb2FsLmlkKSkge1xuICAgICAgICAgIHN0YXRlLmFjdGl2ZUdvYWxzLnB1c2goZ29hbC5pZCk7XG4gICAgICAgICAgcmVzdWx0LnN0YXRlVXBkYXRlcy5uZXdseUFjdGl2YXRlZC5wdXNoKGdvYWwuaWQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYPCfk4sgR2VuZXJhdGVkICR7cmVzdWx0LnJlY29tbWVuZGF0aW9ucy5sZW5ndGh9IHJlY29tbWVuZGF0aW9uc2ApO1xuXG4gICAgLy8gVXBkYXRlIGFjdGl2ZUdvYWxzOiBtZXJnZSBORVcgcmVjb21tZW5kYXRpb25zIHdpdGggRVhJU1RJTkcgYWN0aXZlIGdvYWxzXG4gICAgY29uc3QgbmV3bHlSZWNvbW1lbmRlZEdvYWxzID0gcmVzdWx0LnJlY29tbWVuZGF0aW9uc1xuICAgICAgLmZpbHRlcihyID0+IHIuc2hvdWxkUHVyc3VlKVxuICAgICAgLm1hcChyID0+IHIuZ29hbElkKTtcbiAgICBcbiAgICAvLyBDb21iaW5lIGV4aXN0aW5nIGFjdGl2ZSBnb2FscyB3aXRoIG5ld2x5IHJlY29tbWVuZGVkIG9uZXMgKGRlZHVwZSlcbiAgICBjb25zdCBhbGxBY3RpdmVHb2FscyA9IFsuLi5uZXcgU2V0KFsuLi5zdGF0ZS5hY3RpdmVHb2FscywgLi4ubmV3bHlSZWNvbW1lbmRlZEdvYWxzXSldO1xuICAgIFxuICAgIC8vIFJlbW92ZSBhbnkgdGhhdCB3ZXJlIGp1c3QgY29tcGxldGVkXG4gICAgcmVzdWx0LmFjdGl2ZUdvYWxzID0gYWxsQWN0aXZlR29hbHMuZmlsdGVyKFxuICAgICAgZ29hbElkID0+ICFyZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLmluY2x1ZGVzKGdvYWxJZClcbiAgICApO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn46vIFVwZGF0ZWQgcmVzdWx0LmFjdGl2ZUdvYWxzOiAke0pTT04uc3RyaW5naWZ5KHJlc3VsdC5hY3RpdmVHb2Fscyl9IChmcm9tICR7c3RhdGUuYWN0aXZlR29hbHMubGVuZ3RofSBleGlzdGluZyArICR7bmV3bHlSZWNvbW1lbmRlZEdvYWxzLmxlbmd0aH0gbmV3KWApO1xuXG4gICAgLy8gQ2hlY2sgZm9yIGNvbXBsZXRpb24gdHJpZ2dlcnNcbiAgICB0aGlzLmNoZWNrQ29tcGxldGlvblRyaWdnZXJzKGdvYWxDb25maWcsIHN0YXRlLCByZXN1bHQpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQSEFTRSBCOiBFeHRyYWN0IGluZm9ybWF0aW9uIGZyb20gbWVzc2FnZSBiYXNlZCBvbiBnb2FsIGRhdGFUb0NhcHR1cmVcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZXh0cmFjdEluZm9ybWF0aW9uKFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgICBnb2FsQ29uZmlnOiBHb2FsQ29uZmlndXJhdGlvbixcbiAgICBzdGF0ZTogR29hbFN0YXRlLFxuICAgIHJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHQsXG4gICAgZWxpZ2libGVHb2Fscz86IEdvYWxEZWZpbml0aW9uW10gIC8vIE5FVzogQWxzbyBjaGVjayBnb2FscyB0aGF0IGFyZSBBQk9VVCB0byBiZSBhY3RpdmF0ZWRcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gRmluZCBhY3RpdmUgZGF0YSBjb2xsZWN0aW9uIGdvYWxzIFBMVVMgZWxpZ2libGUgZ29hbHMgKHRoYXQgbWlnaHQgYmUgYWN0aXZhdGVkIHRoaXMgdHVybilcbiAgICAvLyBJbmNsdWRlICdzY2hlZHVsaW5nJyB0eXBlIGJlY2F1c2UgaXQgYWxzbyBjYXB0dXJlcyBkYXRhIChwcmVmZXJyZWREYXRlLCBwcmVmZXJyZWRUaW1lKVxuICAgIGNvbnN0IGdvYWxzVG9DaGVjayA9IGVsaWdpYmxlR29hbHMgfHwgZ29hbENvbmZpZy5nb2FscztcbiAgICBjb25zdCBkYXRhQ29sbGVjdGlvbkdvYWxzID0gZ29hbHNUb0NoZWNrLmZpbHRlcihcbiAgICAgIGcgPT4gKGcudHlwZSA9PT0gJ2RhdGFfY29sbGVjdGlvbicgfHwgZy50eXBlID09PSAnY29sbGVjdF9pbmZvJyB8fCBnLnR5cGUgPT09ICdzY2hlZHVsaW5nJykgJiYgXG4gICAgICAgICAgIChzdGF0ZS5hY3RpdmVHb2Fscy5pbmNsdWRlcyhnLmlkKSB8fCAoZWxpZ2libGVHb2FscyAmJiBlbGlnaWJsZUdvYWxzLmluY2x1ZGVzKGcpKSlcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYPCflI0gQ2hlY2tpbmcgZGF0YSBleHRyYWN0aW9uIGZvciAke2RhdGFDb2xsZWN0aW9uR29hbHMubGVuZ3RofSBhY3RpdmUvZWxpZ2libGUgZGF0YSBjb2xsZWN0aW9uIGdvYWxzYCk7XG4gICAgXG4gICAgZm9yIChjb25zdCBnb2FsIG9mIGRhdGFDb2xsZWN0aW9uR29hbHMpIHtcbiAgICAgIGlmICghZ29hbC5kYXRhVG9DYXB0dXJlPy5maWVsZHMpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBmaWVsZE5hbWVzID0gdGhpcy5nZXRGaWVsZE5hbWVzKGdvYWwpO1xuICAgICAgY29uc29sZS5sb2coYPCflI0gR29hbCAke2dvYWwuaWR9IG5lZWRzOiAke2ZpZWxkTmFtZXMuam9pbignLCAnKX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OKIEN1cnJlbnRseSBjb2xsZWN0ZWQ6ICR7T2JqZWN0LmtleXMoc3RhdGUuY29sbGVjdGVkRGF0YSkuam9pbignLCAnKSB8fCAnTk9ORSd9YCk7XG5cbiAgICAgIGZvciAoY29uc3QgZmllbGROYW1lIG9mIGZpZWxkTmFtZXMpIHtcbiAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGNvbGxlY3RlZFxuICAgICAgICBpZiAoc3RhdGUuY29sbGVjdGVkRGF0YVtmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKckyBGaWVsZCAke2ZpZWxkTmFtZX0gYWxyZWFkeSBjb2xsZWN0ZWQ6ICR7c3RhdGUuY29sbGVjdGVkRGF0YVtmaWVsZE5hbWVdfWApO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBVc2Ugc2ltcGxlIGV4dHJhY3Rpb24gcGF0dGVybnMgKFBoYXNlIEIgd2lsbCBlbmhhbmNlIHRoaXMgd2l0aCBMTE0pXG4gICAgICAgIGNvbnN0IGV4dHJhY3RlZFZhbHVlID0gdGhpcy5leHRyYWN0RmllbGRWYWx1ZShtZXNzYWdlLCBmaWVsZE5hbWUsIGdvYWwuZGF0YVRvQ2FwdHVyZS52YWxpZGF0aW9uUnVsZXMpO1xuICAgICAgICBcbiAgICAgICAgaWYgKGV4dHJhY3RlZFZhbHVlKSB7XG4gICAgICAgICAgLy8gSElHSExJR0hUOiBEYXRhIGV4dHJhY3RlZCBmcm9tIHVzZXIgbWVzc2FnZVxuICAgICAgICAgIGNvbnNvbGUubG9nKCdcXG4nICsgJ/Cfko4nLnJlcGVhdCgzMikpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5KOIERBVEEgQ0FQVFVSRUQ6ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5K+IFZhbHVlOiAke2V4dHJhY3RlZFZhbHVlfWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfwn5KOJy5yZXBlYXQoMzIpICsgJ1xcbicpO1xuICAgICAgICAgIFxuICAgICAgICAgIHN0YXRlLmNvbGxlY3RlZERhdGFbZmllbGROYW1lXSA9IGV4dHJhY3RlZFZhbHVlO1xuICAgICAgICAgIHJlc3VsdC5leHRyYWN0ZWRJbmZvW2ZpZWxkTmFtZV0gPSBleHRyYWN0ZWRWYWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4p2MIEZhaWxlZCB0byBleHRyYWN0ICR7ZmllbGROYW1lfSBmcm9tOiBcIiR7bWVzc2FnZS5zdWJzdHJpbmcoMCwgNTApfS4uLlwiYCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgZ29hbCBpcyBjb21wbGV0ZSAoYWxsIHJlcXVpcmVkIGZpZWxkcyBjb2xsZWN0ZWQpXG4gICAgICBjb25zdCBpc0NvbXBsZXRlID0gdGhpcy5jaGVja0RhdGFDb2xsZWN0aW9uQ29tcGxldGUoZ29hbCwgc3RhdGUpO1xuICAgICAgY29uc29sZS5sb2coYPCfjq8gR29hbCAke2dvYWwuaWR9IGNvbXBsZXRpb24gY2hlY2s6ICR7aXNDb21wbGV0ZSA/ICdDT01QTEVURSDinIUnIDogJ0lOQ09NUExFVEUg4p2MJ31gKTtcbiAgICAgIFxuICAgICAgaWYgKGlzQ29tcGxldGUgJiYgIXN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWwuaWQpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgR29hbCBjb21wbGV0ZWQ6ICR7Z29hbC5pZH1gKTtcbiAgICAgICAgc3RhdGUuY29tcGxldGVkR29hbHMucHVzaChnb2FsLmlkKTtcbiAgICAgICAgc3RhdGUuYWN0aXZlR29hbHMgPSBzdGF0ZS5hY3RpdmVHb2Fscy5maWx0ZXIoaWQgPT4gaWQgIT09IGdvYWwuaWQpO1xuICAgICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLnB1c2goZ29hbC5pZCk7XG5cbiAgICAgICAgLy8gRXhlY3V0ZSBnb2FsIGFjdGlvbnNcbiAgICAgICAgaWYgKGdvYWwuYWN0aW9ucz8ub25Db21wbGV0ZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZUdvYWxBY3Rpb25zKGdvYWwsIHtcbiAgICAgICAgICAgIHRlbmFudElkOiBzdGF0ZS50ZW5hbnRJZCxcbiAgICAgICAgICAgIHVzZXJJZDogc3RhdGUudXNlcklkLFxuICAgICAgICAgICAgc2Vzc2lvbklkOiBzdGF0ZS5zZXNzaW9uSWQsXG4gICAgICAgICAgICBjb2xsZWN0ZWREYXRhOiBzdGF0ZS5jb2xsZWN0ZWREYXRhXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdCBhIHNpbmdsZSBmaWVsZCB2YWx1ZSBmcm9tIG1lc3NhZ2VcbiAgICogRElTQUJMRUQ6IEFsbCByZWdleCBleHRyYWN0aW9uIGRpc2FibGVkIC0gdHJ1c3RpbmcgTExNIHZpYSBpbnRlbnQgZGV0ZWN0aW9uXG4gICAqL1xuICBwcml2YXRlIGV4dHJhY3RGaWVsZFZhbHVlKFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB2YWxpZGF0aW9uUnVsZXM/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+XG4gICk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnNvbGUubG9nKGDwn5SNIEVYVFJBQ1RJT04gRElTQUJMRUQ6IFJlbHlpbmcgb24gTExNIGludGVudCBkZXRlY3Rpb24gZm9yIGZpZWxkPVwiJHtmaWVsZE5hbWV9XCJgKTtcbiAgICBcbiAgICAvLyBBTEwgUkVHRVggRVhUUkFDVElPTiBESVNBQkxFRCAtIExFVCBUSEUgTExNIEhBTkRMRSBJVFxuICAgIC8vIFRoZSBMTE0gaW4gUkVRVUVTVCAjMSAoSW50ZW50IERldGVjdGlvbikgc2hvdWxkIGV4dHJhY3QgYWxsIGRhdGFcbiAgICAvLyBUaGlzIG1ldGhvZCBpcyBub3cgYSBuby1vcCBwbGFjZWhvbGRlclxuICAgIFxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIGV4dHJhY3RlZCBmaWVsZCBhZ2FpbnN0IHJ1bGVzXG4gICAqIE5PVEU6IFBhdHRlcm4gdmFsaWRhdGlvbiBkaXNhYmxlZCAtIHRydXN0aW5nIExMTSB0byBleHRyYWN0IGNvcnJlY3QgZGF0YSB0eXBlc1xuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZUZpZWxkKHZhbHVlOiBzdHJpbmcsIHJ1bGVzPzogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFydWxlcykgcmV0dXJuIHRydWU7XG5cbiAgICAvLyBESVNBQkxFRDogTGV0IHRoZSBMTE0gaGFuZGxlIGZvcm1hdCB2YWxpZGF0aW9uXG4gICAgLy8gVGhlIExMTSBpcyBzbWFydCBlbm91Z2ggdG8ga25vdyB3aGF0J3MgYW4gZW1haWwgdnMgcGhvbmUgdnMgbmFtZVxuICAgIC8vIGlmIChydWxlcy5wYXR0ZXJuKSB7XG4gICAgLy8gICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAocnVsZXMucGF0dGVybik7XG4gICAgLy8gICBpZiAoIXJlZ2V4LnRlc3QodmFsdWUpKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKGDinYwgVmFsaWRhdGlvbiBmYWlsZWQgZm9yIFwiJHt2YWx1ZX1cIiAtIHBhdHRlcm46ICR7cnVsZXMucGF0dGVybn1gKTtcbiAgICAvLyAgICAgcmV0dXJuIGZhbHNlO1xuICAgIC8vICAgfVxuICAgIC8vIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlcjogR2V0IGZpZWxkIG5hbWVzIGZyb20gZ29hbCAoc3VwcG9ydHMgYm90aCBvbGQgYW5kIG5ldyBmb3JtYXRzKVxuICAgKi9cbiAgcHJpdmF0ZSBnZXRGaWVsZE5hbWVzKGdvYWw6IEdvYWxEZWZpbml0aW9uKTogc3RyaW5nW10ge1xuICAgIGlmICghZ29hbC5kYXRhVG9DYXB0dXJlPy5maWVsZHMpIHJldHVybiBbXTtcbiAgICBcbiAgICBjb25zdCBmaWVsZHMgPSBnb2FsLmRhdGFUb0NhcHR1cmUuZmllbGRzO1xuICAgIFxuICAgIC8vIE5FVyBGT1JNQVQ6IEFycmF5IG9mIGZpZWxkIG9iamVjdHNcbiAgICBpZiAoZmllbGRzLmxlbmd0aCA+IDAgJiYgdHlwZW9mIGZpZWxkc1swXSA9PT0gJ29iamVjdCcgJiYgJ25hbWUnIGluIGZpZWxkc1swXSkge1xuICAgICAgcmV0dXJuIChmaWVsZHMgYXMgQXJyYXk8eyBuYW1lOiBzdHJpbmcgfT4pLm1hcChmID0+IGYubmFtZSk7XG4gICAgfVxuICAgIFxuICAgIC8vIE9MRCBGT1JNQVQ6IFN0cmluZyBhcnJheVxuICAgIHJldHVybiBmaWVsZHMgYXMgc3RyaW5nW107XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyOiBHZXQgcmVxdWlyZWQgZmllbGQgbmFtZXMgZnJvbSBnb2FsXG4gICAqL1xuICBwcml2YXRlIGdldFJlcXVpcmVkRmllbGROYW1lcyhnb2FsOiBHb2FsRGVmaW5pdGlvbik6IHN0cmluZ1tdIHtcbiAgICBpZiAoIWdvYWwuZGF0YVRvQ2FwdHVyZT8uZmllbGRzKSByZXR1cm4gW107XG4gICAgXG4gICAgY29uc3QgZmllbGRzID0gZ29hbC5kYXRhVG9DYXB0dXJlLmZpZWxkcztcbiAgICBcbiAgICAvLyBORVcgRk9STUFUOiBBcnJheSBvZiBmaWVsZCBvYmplY3RzXG4gICAgaWYgKGZpZWxkcy5sZW5ndGggPiAwICYmIHR5cGVvZiBmaWVsZHNbMF0gPT09ICdvYmplY3QnICYmICduYW1lJyBpbiBmaWVsZHNbMF0pIHtcbiAgICAgIHJldHVybiAoZmllbGRzIGFzIEFycmF5PHsgbmFtZTogc3RyaW5nOyByZXF1aXJlZDogYm9vbGVhbiB9PilcbiAgICAgICAgLmZpbHRlcihmID0+IGYucmVxdWlyZWQpXG4gICAgICAgIC5tYXAoZiA9PiBmLm5hbWUpO1xuICAgIH1cbiAgICBcbiAgICAvLyBPTEQgRk9STUFUOiBVc2UgdmFsaWRhdGlvblJ1bGVzXG4gICAgY29uc3QgcnVsZXMgPSBnb2FsLmRhdGFUb0NhcHR1cmUudmFsaWRhdGlvblJ1bGVzIHx8IHt9O1xuICAgIHJldHVybiAoZmllbGRzIGFzIHN0cmluZ1tdKS5maWx0ZXIoZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkUnVsZXMgPSBydWxlc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGZpZWxkUnVsZXM/LnJlcXVpcmVkICE9PSBmYWxzZTsgLy8gRGVmYXVsdCB0byByZXF1aXJlZFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGEgZGF0YSBjb2xsZWN0aW9uIGdvYWwgaXMgY29tcGxldGVcbiAgICovXG4gIHByaXZhdGUgY2hlY2tEYXRhQ29sbGVjdGlvbkNvbXBsZXRlKGdvYWw6IEdvYWxEZWZpbml0aW9uLCBzdGF0ZTogR29hbFN0YXRlKTogYm9vbGVhbiB7XG4gICAgaWYgKCFnb2FsLmRhdGFUb0NhcHR1cmU/LmZpZWxkcykgcmV0dXJuIGZhbHNlO1xuXG4gICAgLy8gR2V0IHJlcXVpcmVkIGZpZWxkIG5hbWVzICh3b3JrcyB3aXRoIGJvdGggb2xkIGFuZCBuZXcgZm9ybWF0cylcbiAgICBjb25zdCByZXF1aXJlZEZpZWxkcyA9IHRoaXMuZ2V0UmVxdWlyZWRGaWVsZE5hbWVzKGdvYWwpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIGFsbCBSRVFVSVJFRCBmaWVsZHMgYXJlIGNhcHR1cmVkXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2YgcmVxdWlyZWRGaWVsZHMpIHtcbiAgICAgIGlmICghc3RhdGUuY29sbGVjdGVkRGF0YVtmaWVsZE5hbWVdKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinYwgUmVxdWlyZWQgZmllbGQgbWlzc2luZzogJHtmaWVsZE5hbWV9YCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYOKchSBBbGwgcmVxdWlyZWQgZmllbGRzIGNhcHR1cmVkIGZvciBnb2FsOiAke3JlcXVpcmVkRmllbGRzLmpvaW4oJywgJyl9YCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgZm9yIGluZm9ybWF0aW9uIGRlY2xpbmUgc2lnbmFsc1xuICAgKi9cbiAgcHJpdmF0ZSBwcm9jZXNzSW5mb3JtYXRpb25EZWNsaW5lcyhcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgc3RhdGU6IEdvYWxTdGF0ZSxcbiAgICByZXN1bHQ6IEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IGRlY2xpbmVQYXR0ZXJucyA9IFtcbiAgICAgIC9ub1xccyt0aGFua3M/L2ksXG4gICAgICAvbm90XFxzK3JpZ2h0XFxzK25vdy9pLFxuICAgICAgL21heWJlXFxzK2xhdGVyL2ksXG4gICAgICAvc2tpcC9pLFxuICAgICAgL2Rvbic/dFxccyt3YW50XFxzK3RvL2ksXG4gICAgICAvcHJlZmVyXFxzK25vdFxccyt0by9pXG4gICAgXTtcblxuICAgIGNvbnN0IGlzRGVjbGluZSA9IGRlY2xpbmVQYXR0ZXJucy5zb21lKHBhdHRlcm4gPT4gcGF0dGVybi50ZXN0KG1lc3NhZ2UpKTtcblxuICAgIGlmIChpc0RlY2xpbmUgJiYgc3RhdGUuYWN0aXZlR29hbHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gVXNlciBpcyBkZWNsaW5pbmcgY3VycmVudCBnb2FsKHMpXG4gICAgICBjb25zdCBkZWNsaW5lZEdvYWwgPSBzdGF0ZS5hY3RpdmVHb2Fsc1swXTsgLy8gRGVjbGluZSB0aGUgZmlyc3QgYWN0aXZlIGdvYWxcbiAgICAgIGNvbnNvbGUubG9nKGDinYwgVXNlciBkZWNsaW5lZCBnb2FsOiAke2RlY2xpbmVkR29hbH1gKTtcbiAgICAgIHN0YXRlLmRlY2xpbmVkR29hbHMucHVzaChkZWNsaW5lZEdvYWwpO1xuICAgICAgc3RhdGUuYWN0aXZlR29hbHMgPSBzdGF0ZS5hY3RpdmVHb2Fscy5maWx0ZXIoaWQgPT4gaWQgIT09IGRlY2xpbmVkR29hbCk7XG4gICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLmRlY2xpbmVkLnB1c2goZGVjbGluZWRHb2FsKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUEhBU0UgQTogRmlsdGVyIGVsaWdpYmxlIGdvYWxzIGJhc2VkIG9uIHRyaWdnZXJzXG4gICAqL1xuICBwcml2YXRlIGZpbHRlckVsaWdpYmxlR29hbHMoXG4gICAgZ29hbHM6IEdvYWxEZWZpbml0aW9uW10sXG4gICAgc3RhdGU6IEdvYWxTdGF0ZSxcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgY2hhbm5lbD86IE1lc3NhZ2VTb3VyY2VcbiAgKTogR29hbERlZmluaXRpb25bXSB7XG4gICAgcmV0dXJuIGdvYWxzLmZpbHRlcihnb2FsID0+IHtcbiAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBjb21wbGV0ZWQgb3IgZGVjbGluZWRcbiAgICAgIGlmIChzdGF0ZS5jb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhnb2FsLmlkKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoc3RhdGUuZGVjbGluZWRHb2Fscy5pbmNsdWRlcyhnb2FsLmlkKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGNoYW5uZWwgcnVsZXNcbiAgICAgIGlmIChjaGFubmVsICYmIGdvYWwuY2hhbm5lbFJ1bGVzPy5bY2hhbm5lbF0/LnNraXApIHtcbiAgICAgICAgY29uc29sZS5sb2coYOKPre+4jyBTa2lwcGluZyBnb2FsICR7Z29hbC5pZH0gZm9yIGNoYW5uZWwgJHtjaGFubmVsfWApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIHRyaWdnZXJzXG4gICAgICBpZiAoZ29hbC50cmlnZ2Vycykge1xuICAgICAgICByZXR1cm4gdGhpcy5ldmFsdWF0ZVRyaWdnZXJzKGdvYWwudHJpZ2dlcnMsIHN0YXRlLCBtZXNzYWdlKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgbGVnYWN5IHRpbWluZyAoaWYgbm8gdHJpZ2dlcnMpXG4gICAgICBpZiAoZ29hbC50aW1pbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZXZhbHVhdGVMZWdhY3lUaW1pbmcoZ29hbC50aW1pbmcsIHN0YXRlKTtcbiAgICAgIH1cblxuICAgICAgLy8gTm8gdHJpZ2dlcnMsIGFsd2F5cyBlbGlnaWJsZVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUEhBU0UgQTogRXZhbHVhdGUgZ29hbCB0cmlnZ2VycyAocHJlcmVxdWlzaXRlR29hbHMsIHVzZXJTaWduYWxzLCBtZXNzYWdlQ291bnQpXG4gICAqL1xuICBwcml2YXRlIGV2YWx1YXRlVHJpZ2dlcnMoXG4gICAgdHJpZ2dlcnM6IE5vbk51bGxhYmxlPEdvYWxEZWZpbml0aW9uWyd0cmlnZ2VycyddPixcbiAgICBzdGF0ZTogR29hbFN0YXRlLFxuICAgIG1lc3NhZ2U6IHN0cmluZ1xuICApOiBib29sZWFuIHtcbiAgICBjb25zdCByZXN1bHRzOiBib29sZWFuW10gPSBbXTtcblxuICAgIC8vIENoZWNrIHByZXJlcXVpc2l0ZUdvYWxzIGRlcGVuZGVuY3kgKHdpdGggYmFja3dhcmQgY29tcGF0aWJpbGl0eSBmb3IgYWZ0ZXJHb2FscylcbiAgICBjb25zdCBwcmVyZXF1aXNpdGVzID0gdHJpZ2dlcnMucHJlcmVxdWlzaXRlR29hbHMgfHwgdHJpZ2dlcnMuYWZ0ZXJHb2FscztcbiAgICBpZiAocHJlcmVxdWlzaXRlcyAmJiBwcmVyZXF1aXNpdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGRlcGVuZGVuY2llc01ldCA9IHByZXJlcXVpc2l0ZXMuZXZlcnkocmVxdWlyZWRHb2FsSWQgPT4ge1xuICAgICAgICAvLyBTdXBwb3J0IGJvdGggZnVsbCBJRHMgYW5kIHNob3J0IG5hbWUgcHJlZml4ZXNcbiAgICAgICAgLy8gRS5nLiwgXCJjb2xsZWN0X2lkZW50aXR5XCIgbWF0Y2hlcyBcImNvbGxlY3RfaWRlbnRpdHlfMTc2NDAzMzM1ODQzN1wiXG4gICAgICAgIHJldHVybiBzdGF0ZS5jb21wbGV0ZWRHb2Fscy5zb21lKGNvbXBsZXRlZElkID0+IFxuICAgICAgICAgIGNvbXBsZXRlZElkID09PSByZXF1aXJlZEdvYWxJZCB8fCBjb21wbGV0ZWRJZC5zdGFydHNXaXRoKHJlcXVpcmVkR29hbElkICsgJ18nKVxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UlyBwcmVyZXF1aXNpdGVHb2FscyBjaGVjazogJHtkZXBlbmRlbmNpZXNNZXR9IChyZXF1aXJlczogJHtwcmVyZXF1aXNpdGVzLmpvaW4oJywgJyl9KWApO1xuICAgICAgcmVzdWx0cy5wdXNoKGRlcGVuZGVuY2llc01ldCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgbWVzc2FnZUNvdW50IHRocmVzaG9sZFxuICAgIGlmICh0cmlnZ2Vycy5tZXNzYWdlQ291bnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgdGhyZXNob2xkTWV0ID0gc3RhdGUubWVzc2FnZUNvdW50ID49IHRyaWdnZXJzLm1lc3NhZ2VDb3VudDtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OKIG1lc3NhZ2VDb3VudCBjaGVjazogJHt0aHJlc2hvbGRNZXR9ICgke3N0YXRlLm1lc3NhZ2VDb3VudH0gPj0gJHt0cmlnZ2Vycy5tZXNzYWdlQ291bnR9KWApO1xuICAgICAgcmVzdWx0cy5wdXNoKHRocmVzaG9sZE1ldCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgdXNlclNpZ25hbHMgKGtleXdvcmRzKVxuICAgIGlmICh0cmlnZ2Vycy51c2VyU2lnbmFscyAmJiB0cmlnZ2Vycy51c2VyU2lnbmFscy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBsb3dlck1lc3NhZ2UgPSBtZXNzYWdlLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBzaWduYWxEZXRlY3RlZCA9IHRyaWdnZXJzLnVzZXJTaWduYWxzLnNvbWUoc2lnbmFsID0+IFxuICAgICAgICBsb3dlck1lc3NhZ2UuaW5jbHVkZXMoc2lnbmFsLnRvTG93ZXJDYXNlKCkpXG4gICAgICApO1xuICAgICAgY29uc29sZS5sb2coYPCflI0gdXNlclNpZ25hbHMgY2hlY2s6ICR7c2lnbmFsRGV0ZWN0ZWR9IChsb29raW5nIGZvcjogJHt0cmlnZ2Vycy51c2VyU2lnbmFscy5qb2luKCcsICcpfSlgKTtcbiAgICAgIHJlc3VsdHMucHVzaChzaWduYWxEZXRlY3RlZCk7XG4gICAgfVxuXG4gICAgLy8gQWxsIGNvbmRpdGlvbnMgbXVzdCBiZSBtZXQgKEFORCBsb2dpYylcbiAgICBjb25zdCBhbGxNZXQgPSByZXN1bHRzLmxlbmd0aCA9PT0gMCB8fCByZXN1bHRzLmV2ZXJ5KHIgPT4gcik7XG4gICAgcmV0dXJuIGFsbE1ldDtcbiAgfVxuXG4gIC8qKlxuICAgKiBFdmFsdWF0ZSBsZWdhY3kgdGltaW5nIGNvbmZpZ3VyYXRpb24gKGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSlcbiAgICovXG4gIHByaXZhdGUgZXZhbHVhdGVMZWdhY3lUaW1pbmcoXG4gICAgdGltaW5nOiBOb25OdWxsYWJsZTxHb2FsRGVmaW5pdGlvblsndGltaW5nJ10+LFxuICAgIHN0YXRlOiBHb2FsU3RhdGVcbiAgKTogYm9vbGVhbiB7XG4gICAgaWYgKHRpbWluZy5taW5NZXNzYWdlcyAmJiBzdGF0ZS5tZXNzYWdlQ291bnQgPCB0aW1pbmcubWluTWVzc2FnZXMpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKHRpbWluZy5tYXhNZXNzYWdlcyAmJiBzdGF0ZS5tZXNzYWdlQ291bnQgPiB0aW1pbmcubWF4TWVzc2FnZXMpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogUEhBU0UgQTogU29ydCBnb2FscyBieSBvcmRlciBmaWVsZCBhbmQgaW1wb3J0YW5jZVxuICAgKi9cbiAgcHJpdmF0ZSBzb3J0R29hbHNCeU9yZGVyQW5kSW1wb3J0YW5jZShcbiAgICBnb2FsczogR29hbERlZmluaXRpb25bXSxcbiAgICBnb2FsQ29uZmlnOiBHb2FsQ29uZmlndXJhdGlvblxuICApOiBHb2FsRGVmaW5pdGlvbltdIHtcbiAgICBjb25zdCBpbXBvcnRhbmNlVmFsdWVzID0geyBjcml0aWNhbDogMTAsIGhpZ2g6IDcsIG1lZGl1bTogNCwgbG93OiAxIH07XG5cbiAgICByZXR1cm4gZ29hbHMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgLy8gUHJpbWFyeSBzb3J0OiBvcmRlciBmaWVsZCAobG93ZXIgbnVtYmVycyBmaXJzdClcbiAgICAgIGNvbnN0IG9yZGVyQSA9IGEub3JkZXIgPz8gOTk5OTtcbiAgICAgIGNvbnN0IG9yZGVyQiA9IGIub3JkZXIgPz8gOTk5OTtcbiAgICAgIFxuICAgICAgaWYgKG9yZGVyQSAhPT0gb3JkZXJCKSB7XG4gICAgICAgIHJldHVybiBvcmRlckEgLSBvcmRlckI7XG4gICAgICB9XG5cbiAgICAgIC8vIFNlY29uZGFyeSBzb3J0OiBpbXBvcnRhbmNlIChmcm9tIHByaW9yaXR5IGZpZWxkKVxuICAgICAgY29uc3QgaW1wb3J0YW5jZUEgPSBpbXBvcnRhbmNlVmFsdWVzW2EucHJpb3JpdHldO1xuICAgICAgY29uc3QgaW1wb3J0YW5jZUIgPSBpbXBvcnRhbmNlVmFsdWVzW2IucHJpb3JpdHldO1xuICAgICAgXG4gICAgICByZXR1cm4gaW1wb3J0YW5jZUIgLSBpbXBvcnRhbmNlQTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQSEFTRSBBOiBBcHBseSBnbG9iYWwgY29uc3RyYWludHMgKHN0cmljdCBvcmRlcmluZywgbWF4IGdvYWxzIHBlciB0dXJuKVxuICAgKi9cbiAgcHJpdmF0ZSBhcHBseUdsb2JhbENvbnN0cmFpbnRzKFxuICAgIHNvcnRlZEdvYWxzOiBHb2FsRGVmaW5pdGlvbltdLFxuICAgIGdvYWxDb25maWc6IEdvYWxDb25maWd1cmF0aW9uLFxuICAgIHN0YXRlOiBHb2FsU3RhdGVcbiAgKTogR29hbERlZmluaXRpb25bXSB7XG4gICAgbGV0IGdvYWxzVG9BY3RpdmF0ZSA9IHNvcnRlZEdvYWxzO1xuXG4gICAgLy8gQXBwbHkgc3RyaWN0IG9yZGVyaW5nXG4gICAgY29uc3Qgc3RyaWN0T3JkZXJpbmcgPSBnb2FsQ29uZmlnLmdsb2JhbFNldHRpbmdzLnN0cmljdE9yZGVyaW5nO1xuICAgIFxuICAgIGlmIChzdHJpY3RPcmRlcmluZyA9PT0gMCkge1xuICAgICAgLy8g4pyoIE5FVzogc3RyaWN0T3JkZXJpbmcgPSAwIG1lYW5zIFwiYWx3YXlzIGFjdGl2ZVwiIG1vZGVcbiAgICAgIC8vIEFsbCBlbGlnaWJsZSBnb2FscyBhcmUgYWN0aXZlIGZvciBvcHBvcnR1bmlzdGljIGRhdGEgY2FwdHVyZVxuICAgICAgY29uc29sZS5sb2coYPCfjJAgQWx3YXlzLWFjdGl2ZSBtb2RlIChzdHJpY3RPcmRlcmluZyA9IDApIC0gYWxsIGVsaWdpYmxlIGdvYWxzIGFjdGl2ZWApO1xuICAgICAgcmV0dXJuIGdvYWxzVG9BY3RpdmF0ZTtcbiAgICB9XG4gICAgXG4gICAgaWYgKHN0cmljdE9yZGVyaW5nICYmIHN0cmljdE9yZGVyaW5nID49IDcpIHtcbiAgICAgIC8vIFN0cmljdCBtb2RlOiBvbmx5IGFjdGl2YXRlIHRoZSBmaXJzdCBnb2FsIChpbiBvcmRlcilcbiAgICAgIGNvbnNvbGUubG9nKGDwn5SSIFN0cmljdCBvcmRlcmluZyBlbmFibGVkICgke3N0cmljdE9yZGVyaW5nfS8xMCkgLSBsaW1pdGluZyB0byAxIGdvYWxgKTtcbiAgICAgIFxuICAgICAgaWYgKHN0YXRlLmFjdGl2ZUdvYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gQ29udGludWUgd2l0aCBhY3RpdmUgZ29hbCwgZG9uJ3QgYWN0aXZhdGUgbmV3IG9uZXNcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgICAgXG4gICAgICBnb2Fsc1RvQWN0aXZhdGUgPSBzb3J0ZWRHb2Fscy5zbGljZSgwLCAxKTtcbiAgICB9XG5cbiAgICAvLyBBcHBseSBtYXggZ29hbHMgcGVyIHR1cm5cbiAgICBjb25zdCBtYXhHb2Fsc1BlclR1cm4gPSBnb2FsQ29uZmlnLmdsb2JhbFNldHRpbmdzLm1heEdvYWxzUGVyVHVybjtcbiAgICBpZiAobWF4R29hbHNQZXJUdXJuICYmIG1heEdvYWxzUGVyVHVybiA+IDAgJiYgc3RyaWN0T3JkZXJpbmcgIT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OPIE1heCBnb2FscyBwZXIgdHVybjogJHttYXhHb2Fsc1BlclR1cm59YCk7XG4gICAgICBnb2Fsc1RvQWN0aXZhdGUgPSBnb2Fsc1RvQWN0aXZhdGUuc2xpY2UoMCwgbWF4R29hbHNQZXJUdXJuKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZ29hbHNUb0FjdGl2YXRlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIGEgcmVjb21tZW5kYXRpb24gZm9yIGEgZ29hbFxuICAgKi9cbiAgcHJpdmF0ZSBnZW5lcmF0ZVJlY29tbWVuZGF0aW9uKFxuICAgIGdvYWw6IEdvYWxEZWZpbml0aW9uLFxuICAgIHN0YXRlOiBHb2FsU3RhdGUsXG4gICAgZ29hbENvbmZpZzogR29hbENvbmZpZ3VyYXRpb25cbiAgKTogR29hbFJlY29tbWVuZGF0aW9uIHwgbnVsbCB7XG4gICAgY29uc3QgaW1wb3J0YW5jZVZhbHVlcyA9IHsgY3JpdGljYWw6IDEwLCBoaWdoOiA3LCBtZWRpdW06IDQsIGxvdzogMSB9O1xuICAgIGNvbnN0IHByaW9yaXR5ID0gaW1wb3J0YW5jZVZhbHVlc1tnb2FsLnByaW9yaXR5XTtcblxuICAgIC8vIFBIQVNFIEE6IFVzZSBhZGhlcmVuY2UgbGV2ZWwgKDEtMTApIHRvIGNvbnRyb2wgcGVyc2lzdGVuY2VcbiAgICBjb25zdCBhZGhlcmVuY2VMZXZlbCA9IGdvYWwuYWRoZXJlbmNlID8/IDU7IC8vIERlZmF1bHQgdG8gbWVkaXVtIGFkaGVyZW5jZVxuICAgIFxuICAgIC8vIEluY3JlbWVudCBhdHRlbXB0IGNvdW50XG4gICAgc3RhdGUuYXR0ZW1wdENvdW50c1tnb2FsLmlkXSA9IChzdGF0ZS5hdHRlbXB0Q291bnRzW2dvYWwuaWRdIHx8IDApICsgMTtcbiAgICBjb25zdCBhdHRlbXB0Q291bnQgPSBzdGF0ZS5hdHRlbXB0Q291bnRzW2dvYWwuaWRdO1xuXG4gICAgY29uc29sZS5sb2coYPCfjq8gR29hbCAke2dvYWwuaWR9OiBhZGhlcmVuY2U9JHthZGhlcmVuY2VMZXZlbH0vMTAsIGF0dGVtcHRzPSR7YXR0ZW1wdENvdW50fWApO1xuXG4gICAgLy8gQ2hlY2sgbWF4IGF0dGVtcHRzIChpZiBkZWZpbmVkKVxuICAgIGNvbnN0IG1heEF0dGVtcHRzID0gZ29hbC5iZWhhdmlvcj8ubWF4QXR0ZW1wdHM7XG4gICAgaWYgKG1heEF0dGVtcHRzICYmIGF0dGVtcHRDb3VudCA+IG1heEF0dGVtcHRzKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4o+477iPIE1heCBhdHRlbXB0cyByZWFjaGVkIGZvciAke2dvYWwuaWR9ICgke2F0dGVtcHRDb3VudH0vJHttYXhBdHRlbXB0c30pYCk7XG4gICAgICBcbiAgICAgIC8vIE1hcmsgYXMgZGVjbGluZWQgdG8gc3RvcCBwdXJzdWluZ1xuICAgICAgaWYgKCFzdGF0ZS5kZWNsaW5lZEdvYWxzLmluY2x1ZGVzKGdvYWwuaWQpKSB7XG4gICAgICAgIHN0YXRlLmRlY2xpbmVkR29hbHMucHVzaChnb2FsLmlkKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gRGV0ZXJtaW5lIGFwcHJvYWNoIGJhc2VkIG9uIGFkaGVyZW5jZSBhbmQgYXR0ZW1wdCBjb3VudFxuICAgIGxldCBhcHByb2FjaDogJ2RpcmVjdCcgfCAnY29udGV4dHVhbCcgfCAnc3VidGxlJyA9ICdjb250ZXh0dWFsJztcbiAgICBcbiAgICBpZiAoYWRoZXJlbmNlTGV2ZWwgPj0gOCkge1xuICAgICAgYXBwcm9hY2ggPSAnZGlyZWN0JzsgLy8gSGlnaCBhZGhlcmVuY2UgPSBkaXJlY3QgYXBwcm9hY2hcbiAgICB9IGVsc2UgaWYgKGFkaGVyZW5jZUxldmVsIDw9IDMpIHtcbiAgICAgIGFwcHJvYWNoID0gJ3N1YnRsZSc7IC8vIExvdyBhZGhlcmVuY2UgPSBzdWJ0bGUgYXBwcm9hY2hcbiAgICB9XG5cbiAgICAvLyBBZGp1c3QgdG9uZSBiYXNlZCBvbiBiYWNrb2ZmIHN0cmF0ZWd5IGFuZCBhdHRlbXB0IGNvdW50XG4gICAgaWYgKGF0dGVtcHRDb3VudCA+IDEgJiYgZ29hbC5iZWhhdmlvcj8uYmFja29mZlN0cmF0ZWd5KSB7XG4gICAgICBhcHByb2FjaCA9IHRoaXMuYWRqdXN0QXBwcm9hY2hGb3JCYWNrb2ZmKFxuICAgICAgICBhcHByb2FjaCxcbiAgICAgICAgZ29hbC5iZWhhdmlvci5iYWNrb2ZmU3RyYXRlZ3ksXG4gICAgICAgIGF0dGVtcHRDb3VudFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSBtZXNzYWdlXG4gICAgY29uc3QgbWVzc2FnZSA9IHRoaXMuZ2VuZXJhdGVHb2FsTWVzc2FnZShnb2FsLCBhcHByb2FjaCwgc3RhdGUsIGF0dGVtcHRDb3VudCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ29hbElkOiBnb2FsLmlkLFxuICAgICAgZ29hbCxcbiAgICAgIHByaW9yaXR5LFxuICAgICAgYWRoZXJlbmNlTGV2ZWwsXG4gICAgICByZWFzb246IHRoaXMuZ2VuZXJhdGVQdXJzdWl0UmVhc29uKGdvYWwsIGF0dGVtcHRDb3VudCwgYWRoZXJlbmNlTGV2ZWwpLFxuICAgICAgYXBwcm9hY2gsXG4gICAgICBtZXNzYWdlLFxuICAgICAgc2hvdWxkUHVyc3VlOiB0cnVlLFxuICAgICAgYXR0ZW1wdENvdW50XG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQSEFTRSBFOiBBZGp1c3QgYXBwcm9hY2ggYmFzZWQgb24gYmFja29mZiBzdHJhdGVneVxuICAgKi9cbiAgcHJpdmF0ZSBhZGp1c3RBcHByb2FjaEZvckJhY2tvZmYoXG4gICAgYmFzZUFwcHJvYWNoOiAnZGlyZWN0JyB8ICdjb250ZXh0dWFsJyB8ICdzdWJ0bGUnLFxuICAgIGJhY2tvZmZTdHJhdGVneTogJ2dlbnRsZScgfCAncGVyc2lzdGVudCcgfCAnYWdncmVzc2l2ZScsXG4gICAgYXR0ZW1wdENvdW50OiBudW1iZXJcbiAgKTogJ2RpcmVjdCcgfCAnY29udGV4dHVhbCcgfCAnc3VidGxlJyB7XG4gICAgaWYgKGJhY2tvZmZTdHJhdGVneSA9PT0gJ2dlbnRsZScpIHtcbiAgICAgIC8vIEdldCBzb2Z0ZXIgd2l0aCBlYWNoIGF0dGVtcHRcbiAgICAgIGlmIChhdHRlbXB0Q291bnQgPj0gMykgcmV0dXJuICdzdWJ0bGUnO1xuICAgICAgaWYgKGF0dGVtcHRDb3VudCA+PSAyKSByZXR1cm4gJ2NvbnRleHR1YWwnO1xuICAgIH0gZWxzZSBpZiAoYmFja29mZlN0cmF0ZWd5ID09PSAnYWdncmVzc2l2ZScpIHtcbiAgICAgIC8vIEdldCBtb3JlIGRpcmVjdCB3aXRoIGVhY2ggYXR0ZW1wdFxuICAgICAgaWYgKGF0dGVtcHRDb3VudCA+PSAyKSByZXR1cm4gJ2RpcmVjdCc7XG4gICAgfVxuICAgIC8vICdwZXJzaXN0ZW50JyBrZWVwcyB0aGUgc2FtZSBhcHByb2FjaFxuICAgIHJldHVybiBiYXNlQXBwcm9hY2g7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgY29udGV4dHVhbCBtZXNzYWdlIGZvciBnb2FsIHB1cnN1aXRcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVHb2FsTWVzc2FnZShcbiAgICBnb2FsOiBHb2FsRGVmaW5pdGlvbixcbiAgICBhcHByb2FjaDogJ2RpcmVjdCcgfCAnY29udGV4dHVhbCcgfCAnc3VidGxlJyxcbiAgICBzdGF0ZTogR29hbFN0YXRlLFxuICAgIGF0dGVtcHRDb3VudDogbnVtYmVyXG4gICk6IHN0cmluZyB7XG4gICAgLy8gVXNlIGN1c3RvbSBtZXNzYWdlcyBpZiBkZWZpbmVkXG4gICAgaWYgKGdvYWwubWVzc2FnZXMpIHtcbiAgICAgIGlmIChhdHRlbXB0Q291bnQgPT09IDEgJiYgZ29hbC5tZXNzYWdlcy5yZXF1ZXN0KSB7XG4gICAgICAgIHJldHVybiBnb2FsLm1lc3NhZ2VzLnJlcXVlc3Q7XG4gICAgICB9IGVsc2UgaWYgKGF0dGVtcHRDb3VudCA+IDEgJiYgZ29hbC5tZXNzYWdlcy5mb2xsb3dVcCkge1xuICAgICAgICByZXR1cm4gZ29hbC5tZXNzYWdlcy5mb2xsb3dVcDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBVc2UgYmVoYXZpb3IgbWVzc2FnZSBpZiBkZWZpbmVkXG4gICAgaWYgKGdvYWwuYmVoYXZpb3I/Lm1lc3NhZ2UpIHtcbiAgICAgIHJldHVybiBnb2FsLmJlaGF2aW9yLm1lc3NhZ2U7XG4gICAgfVxuXG4gICAgLy8gRmFsbGJhY2s6IGRlc2NyaWJlIHdoYXQgd2UgbmVlZFxuICAgIGlmIChnb2FsLmRhdGFUb0NhcHR1cmU/LmZpZWxkcykge1xuICAgICAgY29uc3QgZmllbGROYW1lcyA9IHRoaXMuZ2V0RmllbGROYW1lcyhnb2FsKTtcbiAgICAgIGNvbnN0IGZpZWxkcyA9IGZpZWxkTmFtZXMuam9pbignLCAnKTtcbiAgICAgIFxuICAgICAgaWYgKGFwcHJvYWNoID09PSAnZGlyZWN0Jykge1xuICAgICAgICByZXR1cm4gYEkgbmVlZCB5b3VyICR7ZmllbGRzfSB0byBjb250aW51ZS5gO1xuICAgICAgfSBlbHNlIGlmIChhcHByb2FjaCA9PT0gJ2NvbnRleHR1YWwnKSB7XG4gICAgICAgIHJldHVybiBgVG8gaGVscCB5b3UgYmV0dGVyLCBjb3VsZCB5b3Ugc2hhcmUgeW91ciAke2ZpZWxkc30/YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBgQnkgdGhlIHdheSwgaXQgd291bGQgYmUgaGVscGZ1bCB0byBrbm93IHlvdXIgJHtmaWVsZHN9LmA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGBMZXQncyB3b3JrIG9uOiAke2dvYWwuZGVzY3JpcHRpb259YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSByZWFzb24gZm9yIHB1cnN1aW5nIGdvYWxcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVQdXJzdWl0UmVhc29uKFxuICAgIGdvYWw6IEdvYWxEZWZpbml0aW9uLFxuICAgIGF0dGVtcHRDb3VudDogbnVtYmVyLFxuICAgIGFkaGVyZW5jZUxldmVsOiBudW1iZXJcbiAgKTogc3RyaW5nIHtcbiAgICBjb25zdCByZWFzb25zID0gW107XG4gICAgXG4gICAgaWYgKGdvYWwucHJpb3JpdHkgPT09ICdjcml0aWNhbCcpIHJlYXNvbnMucHVzaCgnY3JpdGljYWwgcHJpb3JpdHknKTtcbiAgICBpZiAoYWRoZXJlbmNlTGV2ZWwgPj0gOCkgcmVhc29ucy5wdXNoKCdoaWdoIGFkaGVyZW5jZScpO1xuICAgIGlmIChhdHRlbXB0Q291bnQgPT09IDEpIHJlYXNvbnMucHVzaCgnZmlyc3QgYXR0ZW1wdCcpO1xuICAgIGlmIChhdHRlbXB0Q291bnQgPiAxKSByZWFzb25zLnB1c2goYGF0dGVtcHQgJHthdHRlbXB0Q291bnR9YCk7XG4gICAgXG4gICAgcmV0dXJuIHJlYXNvbnMuam9pbignLCAnKSB8fCAnc3RhbmRhcmQgZ29hbCBwcm9ncmVzc2lvbic7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgZm9yIGdvYWwgY29tcGxldGlvbiB0cmlnZ2VycyAoY29tYm9zLCBldGMuKVxuICAgKi9cbiAgcHJpdmF0ZSBjaGVja0NvbXBsZXRpb25UcmlnZ2VycyhcbiAgICBnb2FsQ29uZmlnOiBHb2FsQ29uZmlndXJhdGlvbixcbiAgICBzdGF0ZTogR29hbFN0YXRlLFxuICAgIHJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHRcbiAgKTogdm9pZCB7XG4gICAgLy8gU2FmZXR5IGNoZWNrOiBlbnN1cmUgY29tcGxldGlvblRyaWdnZXJzIGV4aXN0c1xuICAgIGlmICghZ29hbENvbmZpZy5jb21wbGV0aW9uVHJpZ2dlcnMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBjdXN0b20gY29tYmluYXRpb25zXG4gICAgaWYgKGdvYWxDb25maWcuY29tcGxldGlvblRyaWdnZXJzLmN1c3RvbUNvbWJpbmF0aW9ucykge1xuICAgICAgZm9yIChjb25zdCBjb21ibyBvZiBnb2FsQ29uZmlnLmNvbXBsZXRpb25UcmlnZ2Vycy5jdXN0b21Db21iaW5hdGlvbnMpIHtcbiAgICAgICAgY29uc3QgYWxsQ29tcGxldGVkID0gY29tYm8uZ29hbElkcy5ldmVyeShnb2FsSWQgPT4gXG4gICAgICAgICAgc3RhdGUuY29tcGxldGVkR29hbHMuaW5jbHVkZXMoZ29hbElkKVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgaWYgKGFsbENvbXBsZXRlZCAmJiAhcmVzdWx0LnRyaWdnZXJlZEludGVudHMuaW5jbHVkZXMoY29tYm8udHJpZ2dlckludGVudCkpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+OiSBHb2FsIGNvbWJvIHRyaWdnZXJlZDogJHtjb21iby50cmlnZ2VySW50ZW50fWApO1xuICAgICAgICAgIHJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLnB1c2goY29tYm8udHJpZ2dlckludGVudCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBhbGwgY3JpdGljYWwgY29tcGxldGVcbiAgICBpZiAoZ29hbENvbmZpZy5jb21wbGV0aW9uVHJpZ2dlcnMuYWxsQ3JpdGljYWxDb21wbGV0ZSkge1xuICAgICAgY29uc3QgY3JpdGljYWxHb2FscyA9IGdvYWxDb25maWcuZ29hbHMuZmlsdGVyKGcgPT4gZy5wcmlvcml0eSA9PT0gJ2NyaXRpY2FsJyk7XG4gICAgICBjb25zdCBhbGxDcml0aWNhbENvbXBsZXRlID0gY3JpdGljYWxHb2Fscy5ldmVyeShnb2FsID0+IFxuICAgICAgICBzdGF0ZS5jb21wbGV0ZWRHb2Fscy5pbmNsdWRlcyhnb2FsLmlkKVxuICAgICAgKTtcbiAgICAgIFxuICAgICAgaWYgKGFsbENyaXRpY2FsQ29tcGxldGUgJiYgIXJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLmluY2x1ZGVzKGdvYWxDb25maWcuY29tcGxldGlvblRyaWdnZXJzLmFsbENyaXRpY2FsQ29tcGxldGUpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn46JIEFsbCBjcml0aWNhbCBnb2FscyBjb21wbGV0ZSFgKTtcbiAgICAgICAgcmVzdWx0LnRyaWdnZXJlZEludGVudHMucHVzaChnb2FsQ29uZmlnLmNvbXBsZXRpb25UcmlnZ2Vycy5hbGxDcml0aWNhbENvbXBsZXRlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBhY3Rpb25zIHdoZW4gYSBnb2FsIGNvbXBsZXRlc1xuICAgKi9cbiAgYXN5bmMgZXhlY3V0ZUdvYWxBY3Rpb25zKFxuICAgIGdvYWw6IEdvYWxEZWZpbml0aW9uLFxuICAgIGNvbnRleHQ6IHtcbiAgICAgIHRlbmFudElkOiBzdHJpbmc7XG4gICAgICBjaGFubmVsSWQ/OiBzdHJpbmc7XG4gICAgICB1c2VySWQ6IHN0cmluZztcbiAgICAgIHNlc3Npb25JZDogc3RyaW5nO1xuICAgICAgY29sbGVjdGVkRGF0YTogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICB9XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghZ29hbC5hY3Rpb25zPy5vbkNvbXBsZXRlIHx8ICF0aGlzLmV2ZW50QnJpZGdlU2VydmljZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGDwn46vIEV4ZWN1dGluZyAke2dvYWwuYWN0aW9ucy5vbkNvbXBsZXRlLmxlbmd0aH0gYWN0aW9ucyBmb3IgZ29hbDogJHtnb2FsLmlkfWApO1xuXG4gICAgZm9yIChjb25zdCBhY3Rpb24gb2YgZ29hbC5hY3Rpb25zLm9uQ29tcGxldGUpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZUFjdGlvbihhY3Rpb24sIGdvYWwuaWQsIGNvbnRleHQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBleGVjdXRlIGFjdGlvbiAke2FjdGlvbi50eXBlfSBmb3IgZ29hbCAke2dvYWwuaWR9OmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBhIHNpbmdsZSBhY3Rpb25cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgZXhlY3V0ZUFjdGlvbihcbiAgICBhY3Rpb246IEFjdGlvblRyaWdnZXIsXG4gICAgZ29hbElkOiBzdHJpbmcsXG4gICAgY29udGV4dDoge1xuICAgICAgdGVuYW50SWQ6IHN0cmluZztcbiAgICAgIGNoYW5uZWxJZD86IHN0cmluZztcbiAgICAgIHVzZXJJZDogc3RyaW5nO1xuICAgICAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgICBjb2xsZWN0ZWREYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICAgIH1cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coJ1xceDFiWzMzbeKVlOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVl1xceDFiWzBtJyk7XG4gICAgY29uc29sZS5sb2coJ1xceDFiWzMzbeKVkSAg8J+OryBHT0FMIEFDVElPTiBUUklHR0VSRUQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDilZFcXHgxYlswbScpO1xuICAgIGNvbnNvbGUubG9nKCdcXHgxYlszM23ilZrilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZ1cXHgxYlswbScpO1xuICAgIGNvbnNvbGUubG9nKGBcXHgxYlszNm3wn5OMIEdvYWwgSUQ6ICAgICBcXHgxYlswbSR7Z29hbElkfWApO1xuICAgIGNvbnNvbGUubG9nKGBcXHgxYlszNm3imqEgQWN0aW9uIFR5cGU6IFxceDFiWzBtJHthY3Rpb24udHlwZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzZt8J+Pt++4jyAgRXZlbnQgTmFtZTogIFxceDFiWzBtJHthY3Rpb24uZXZlbnROYW1lIHx8IHRoaXMuZ2V0RGVmYXVsdEV2ZW50TmFtZShhY3Rpb24udHlwZSl9YCk7XG5cbiAgICBjb25zdCBldmVudE5hbWUgPSBhY3Rpb24uZXZlbnROYW1lIHx8IHRoaXMuZ2V0RGVmYXVsdEV2ZW50TmFtZShhY3Rpb24udHlwZSk7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkLFxuICAgICAgY2hhbm5lbElkOiBjb250ZXh0LmNoYW5uZWxJZCxcbiAgICAgIHVzZXJJZDogY29udGV4dC51c2VySWQsXG4gICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuc2Vzc2lvbklkLFxuICAgICAgZ29hbElkLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAuLi5hY3Rpb24ucGF5bG9hZCxcbiAgICAgIC8vIEluY2x1ZGUgY29sbGVjdGVkIGRhdGEgZm9yIHJlbGV2YW50IGFjdGlvbnNcbiAgICAgIC4uLihhY3Rpb24udHlwZSA9PT0gJ2NvbnZlcnRfYW5vbnltb3VzX3RvX2xlYWQnICYmIHsgY29udGFjdEluZm86IGNvbnRleHQuY29sbGVjdGVkRGF0YSB9KVxuICAgIH07XG5cbiAgICBjb25zb2xlLmxvZyhgXFx4MWJbMzZt8J+TpiBBY3Rpb24gUGF5bG9hZDpcXHgxYlswbWApO1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGFjdGlvbi5wYXlsb2FkLCBudWxsLCAyKSk7XG4gICAgXG4gICAgaWYgKGFjdGlvbi50eXBlID09PSAnY29udmVydF9hbm9ueW1vdXNfdG9fbGVhZCcpIHtcbiAgICAgIGNvbnNvbGUubG9nKGBcXHgxYlszNm3wn5GkIENvbGxlY3RlZCBDb250YWN0IEluZm86XFx4MWJbMG1gKTtcbiAgICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGNvbnRleHQuY29sbGVjdGVkRGF0YSwgbnVsbCwgMikpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZXZlbnRCcmlkZ2VTZXJ2aWNlLnB1Ymxpc2hDdXN0b21FdmVudChcbiAgICAgICdreGdlbi5hZ2VudC5nb2FscycsXG4gICAgICBldmVudE5hbWUsXG4gICAgICBwYXlsb2FkXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKGBcXHgxYlszMm3inIUgR29hbCBhY3Rpb24gY29tcGxldGVkOiAke2V2ZW50TmFtZX1cXHgxYlswbWApO1xuICAgIGNvbnNvbGUubG9nKCdcXHgxYlszM23ilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcXHgxYlswbVxcbicpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBkZWZhdWx0IGV2ZW50IG5hbWUgZm9yIGFjdGlvbiB0eXBlXG4gICAqL1xuICBwcml2YXRlIGdldERlZmF1bHRFdmVudE5hbWUoYWN0aW9uVHlwZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBkZWZhdWx0czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICdjb252ZXJ0X2Fub255bW91c190b19sZWFkJzogJ2xlYWQuY29udGFjdF9jYXB0dXJlZCcsXG4gICAgICAndHJpZ2dlcl9zY2hlZHVsaW5nX2Zsb3cnOiAnYXBwb2ludG1lbnQucmVxdWVzdGVkJyxcbiAgICAgICdzZW5kX25vdGlmaWNhdGlvbic6ICdub3RpZmljYXRpb24uc2VuZCcsXG4gICAgICAndXBkYXRlX2NybSc6ICdjcm0udXBkYXRlX3JlcXVlc3RlZCcsXG4gICAgICAnY3VzdG9tJzogJ2N1c3RvbS5hY3Rpb24nXG4gICAgfTtcbiAgICByZXR1cm4gZGVmYXVsdHNbYWN0aW9uVHlwZV0gfHwgJ2dvYWwuYWN0aW9uJztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgb3IgaW5pdGlhbGl6ZSBnb2FsIHN0YXRlXG4gICAqIE5vdyBzdXBwb3J0cyBjaGFubmVsIHN0YXRlIGZvciBwZXJzaXN0ZW50IHRyYWNraW5nXG4gICAqL1xuICBwcml2YXRlIGdldE9ySW5pdFN0YXRlKFxuICAgIHNlc3Npb25JZDogc3RyaW5nLCBcbiAgICB1c2VySWQ6IHN0cmluZywgXG4gICAgdGVuYW50SWQ6IHN0cmluZyxcbiAgICBjaGFubmVsU3RhdGU/OiBDaGFubmVsV29ya2Zsb3dTdGF0ZVxuICApOiBHb2FsU3RhdGUge1xuICAgIGNvbnN0IGtleSA9IGAke3RlbmFudElkfToke3Nlc3Npb25JZH06JHt1c2VySWR9YDtcbiAgICBcbiAgICBpZiAoIXRoaXMuZ29hbFN0YXRlcy5oYXMoa2V5KSkge1xuICAgICAgLy8gSW5pdGlhbGl6ZSBmcm9tIGNoYW5uZWwgc3RhdGUgaWYgYXZhaWxhYmxlXG4gICAgICBpZiAoY2hhbm5lbFN0YXRlKSB7XG4gICAgICAgIHRoaXMuZ29hbFN0YXRlcy5zZXQoa2V5LCB7XG4gICAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICB0ZW5hbnRJZCxcbiAgICAgICAgICBtZXNzYWdlQ291bnQ6IGNoYW5uZWxTdGF0ZS5tZXNzYWdlQ291bnQsXG4gICAgICAgICAgY29tcGxldGVkR29hbHM6IFsuLi5jaGFubmVsU3RhdGUuY29tcGxldGVkR29hbHNdLFxuICAgICAgICAgIGFjdGl2ZUdvYWxzOiBbLi4uY2hhbm5lbFN0YXRlLmFjdGl2ZUdvYWxzXSxcbiAgICAgICAgICBkZWNsaW5lZEdvYWxzOiBbXSxcbiAgICAgICAgICBhdHRlbXB0Q291bnRzOiB7fSxcbiAgICAgICAgICBjb2xsZWN0ZWREYXRhOiB7IC4uLmNoYW5uZWxTdGF0ZS5jYXB0dXJlZERhdGEgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4ogSW5pdGlhbGl6ZWQgc3RhdGUgZnJvbSBjaGFubmVsIHN0YXRlOiAke2NoYW5uZWxTdGF0ZS5jb21wbGV0ZWRHb2Fscy5sZW5ndGh9IGNvbXBsZXRlZCBnb2Fsc2ApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTGVnYWN5OiBmcmVzaCBzdGF0ZVxuICAgICAgICB0aGlzLmdvYWxTdGF0ZXMuc2V0KGtleSwge1xuICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgdGVuYW50SWQsXG4gICAgICAgICAgbWVzc2FnZUNvdW50OiAwLFxuICAgICAgICAgIGNvbXBsZXRlZEdvYWxzOiBbXSxcbiAgICAgICAgICBhY3RpdmVHb2FsczogW10sXG4gICAgICAgICAgZGVjbGluZWRHb2FsczogW10sXG4gICAgICAgICAgYXR0ZW1wdENvdW50czoge30sXG4gICAgICAgICAgY29sbGVjdGVkRGF0YToge31cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIHJldHVybiB0aGlzLmdvYWxTdGF0ZXMuZ2V0KGtleSkhO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjdXJyZW50IGdvYWwgc3RhdGUgZm9yIGRlYnVnZ2luZ1xuICAgKi9cbiAgZ2V0R29hbFN0YXRlKHNlc3Npb25JZDogc3RyaW5nLCB1c2VySWQ6IHN0cmluZywgdGVuYW50SWQ6IHN0cmluZyk6IEdvYWxTdGF0ZSB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3Qga2V5ID0gYCR7dGVuYW50SWR9OiR7c2Vzc2lvbklkfToke3VzZXJJZH1gO1xuICAgIHJldHVybiB0aGlzLmdvYWxTdGF0ZXMuZ2V0KGtleSk7XG4gIH1cblxuICAvKipcbiAgICogUmVzZXQgZ29hbCBzdGF0ZSAoZm9yIHRlc3RpbmcpXG4gICAqL1xuICByZXNldEdvYWxTdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcsIHRlbmFudElkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBrZXkgPSBgJHt0ZW5hbnRJZH06JHtzZXNzaW9uSWR9OiR7dXNlcklkfWA7XG4gICAgdGhpcy5nb2FsU3RhdGVzLmRlbGV0ZShrZXkpO1xuICB9XG59XG4iXX0=