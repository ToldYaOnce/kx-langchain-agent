import { GoalStateManager } from './goal-state-manager.js';
import { InterestDetector } from './interest-detector.js';
import { InfoExtractor } from './info-extractor.js';
export class GoalOrchestrator {
    stateManager;
    interestDetector;
    infoExtractor;
    constructor() {
        this.stateManager = new GoalStateManager();
        this.interestDetector = new InterestDetector();
        this.infoExtractor = new InfoExtractor();
    }
    /**
     * Main orchestration method - analyzes message and determines goal actions
     */
    async orchestrateGoals(message, sessionId, userId, tenantId, goalConfig, conversationHistory) {
        // Get current state
        const state = this.stateManager.incrementMessage(sessionId, userId, tenantId);
        // Analyze interest and extract information
        const interestAnalysis = this.interestDetector.analyzeMessage(message, conversationHistory);
        const extractedInfo = this.infoExtractor.extractInfo(message);
        // Update state with analysis results
        this.stateManager.incrementMessage(sessionId, userId, tenantId, interestAnalysis.interestLevel, interestAnalysis.urgencyLevel);
        const result = {
            recommendations: [],
            extractedInfo,
            interestAnalysis,
            stateUpdates: {
                newlyCompleted: [],
                newlyActivated: [],
                declined: []
            },
            triggeredIntents: []
        };
        // Process extracted information
        await this.processExtractedInfo(extractedInfo, state, result);
        // Check for information declines
        this.processInformationDeclines(message, state, result);
        // Generate goal recommendations
        if (goalConfig.enabled) {
            result.recommendations = await this.generateRecommendations(goalConfig, state, interestAnalysis, message);
        }
        // Check for completion triggers
        this.checkCompletionTriggers(goalConfig, state, result);
        return result;
    }
    /**
     * Process any information extracted from the user's message
     */
    async processExtractedInfo(extractedInfo, state, result) {
        // Process email
        if (extractedInfo.email) {
            this.stateManager.collectInformation(state.sessionId, state.userId, state.tenantId, 'email', extractedInfo.email.value, extractedInfo.email.validated);
            // Complete email collection goal
            if (state.activeGoals.includes('collect_email')) {
                this.stateManager.completeGoal(state.sessionId, state.userId, state.tenantId, 'collect_email', 'extracted_from_message');
                result.stateUpdates.newlyCompleted.push('collect_email');
            }
        }
        // Process phone
        if (extractedInfo.phone) {
            this.stateManager.collectInformation(state.sessionId, state.userId, state.tenantId, 'phone', extractedInfo.phone.value, extractedInfo.phone.validated);
            // Complete phone collection goal
            if (state.activeGoals.includes('collect_phone')) {
                this.stateManager.completeGoal(state.sessionId, state.userId, state.tenantId, 'collect_phone', 'extracted_from_message');
                result.stateUpdates.newlyCompleted.push('collect_phone');
            }
        }
        // Process names
        if (extractedInfo.firstName) {
            this.stateManager.collectInformation(state.sessionId, state.userId, state.tenantId, 'firstName', extractedInfo.firstName.value, true);
            // Complete name collection goal
            if (state.activeGoals.includes('collect_name_first')) {
                this.stateManager.completeGoal(state.sessionId, state.userId, state.tenantId, 'collect_name_first', 'extracted_from_message');
                result.stateUpdates.newlyCompleted.push('collect_name_first');
            }
        }
        if (extractedInfo.lastName) {
            this.stateManager.collectInformation(state.sessionId, state.userId, state.tenantId, 'lastName', extractedInfo.lastName.value, true);
        }
        if (extractedInfo.fullName) {
            this.stateManager.collectInformation(state.sessionId, state.userId, state.tenantId, 'fullName', extractedInfo.fullName.value, true);
            // Complete name collection goal
            if (state.activeGoals.includes('collect_name')) {
                this.stateManager.completeGoal(state.sessionId, state.userId, state.tenantId, 'collect_name', 'extracted_from_message');
                result.stateUpdates.newlyCompleted.push('collect_name');
            }
        }
    }
    /**
     * Check if user is declining to provide information
     */
    processInformationDeclines(message, state, result) {
        const decline = this.infoExtractor.detectInformationDecline(message);
        if (decline.declined && decline.confidence > 0.7) {
            // Find which goal they might be declining
            const activeInfoGoals = state.activeGoals.filter(goalId => goalId.startsWith('collect_'));
            if (activeInfoGoals.length > 0) {
                const declinedGoal = activeInfoGoals[0]; // Assume they're declining the most recent request
                this.stateManager.declineGoal(state.sessionId, state.userId, state.tenantId, declinedGoal);
                result.stateUpdates.declined.push(declinedGoal);
            }
        }
    }
    /**
     * Generate recommendations for which goals to pursue
     */
    async generateRecommendations(goalConfig, state, interestAnalysis, message) {
        const recommendations = [];
        // Filter goals that are eligible for activation
        const eligibleGoals = goalConfig.goals.filter(goal => !state.completedGoals.includes(goal.id) &&
            !state.declinedGoals.includes(goal.id) &&
            this.checkGoalDependencies(goal, state) &&
            this.checkGoalTiming(goal, state, interestAnalysis));
        // Sort by priority and evaluate each goal
        const sortedGoals = this.sortGoalsByPriority(eligibleGoals, interestAnalysis);
        for (const goal of sortedGoals) {
            const recommendation = await this.evaluateGoal(goal, state, interestAnalysis, message);
            if (recommendation) {
                recommendations.push(recommendation);
            }
            // Respect maxActiveGoals limit
            if (recommendations.filter(r => r.shouldPursue).length >= goalConfig.globalSettings.maxActiveGoals) {
                break;
            }
        }
        return recommendations;
    }
    /**
     * Check if goal dependencies are satisfied
     */
    checkGoalDependencies(goal, state) {
        if (!goal.dependencies?.requires)
            return true;
        return goal.dependencies.requires.every(requiredGoalId => state.completedGoals.includes(requiredGoalId));
    }
    /**
     * Check if goal timing conditions are met
     */
    checkGoalTiming(goal, state, interestAnalysis) {
        const timing = goal.timing;
        // Check message count bounds
        if (timing.minMessages && state.messageCount < timing.minMessages)
            return false;
        if (timing.maxMessages && state.messageCount > timing.maxMessages)
            return false;
        // Check cooldown period
        if (goal.tracking.lastAttempt && timing.cooldown) {
            const lastAttemptTime = new Date(goal.tracking.lastAttempt).getTime();
            const now = new Date().getTime();
            const minutesSinceLastAttempt = (now - lastAttemptTime) / (1000 * 60);
            if (minutesSinceLastAttempt < timing.cooldown)
                return false;
        }
        // Check triggers if they exist
        if (timing.triggers && timing.triggers.length > 0) {
            return timing.triggers.some(trigger => this.evaluateTrigger(trigger, state, interestAnalysis));
        }
        return true;
    }
    /**
     * Evaluate a goal trigger
     */
    evaluateTrigger(trigger, state, interestAnalysis) {
        const results = trigger.conditions.map(condition => this.stateManager.evaluateCondition(state, condition));
        return trigger.logic === 'AND'
            ? results.every(r => r)
            : results.some(r => r);
    }
    /**
     * Sort goals by priority and current context
     */
    sortGoalsByPriority(goals, interestAnalysis) {
        const priorityValues = { critical: 4, high: 3, medium: 2, low: 1 };
        return goals.sort((a, b) => {
            const aPriority = priorityValues[a.priority];
            const bPriority = priorityValues[b.priority];
            // Higher priority first
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            // If same priority, consider interest level
            if (interestAnalysis.interestLevel === 'high') {
                // Prioritize info collection when interest is high
                if (a.type === 'collect_info' && b.type !== 'collect_info')
                    return -1;
                if (b.type === 'collect_info' && a.type !== 'collect_info')
                    return 1;
            }
            return 0;
        });
    }
    /**
     * Evaluate a specific goal and create recommendation
     */
    async evaluateGoal(goal, state, interestAnalysis, message) {
        // Calculate priority score
        const priorityValues = { critical: 4, high: 3, medium: 2, low: 1 };
        let priority = priorityValues[goal.priority];
        // Adjust priority based on interest and urgency
        if (interestAnalysis.interestLevel === 'high')
            priority += 1;
        if (interestAnalysis.urgencyLevel === 'urgent')
            priority += 0.5;
        if (interestAnalysis.interestLevel === 'low')
            priority -= 1;
        // Determine approach
        let approach = goal.approach.directness;
        if (interestAnalysis.urgencyLevel === 'urgent')
            approach = 'direct';
        if (interestAnalysis.interestLevel === 'low')
            approach = 'subtle';
        // Generate contextual message
        const contextualMessage = this.generateGoalMessage(goal, approach, message, state);
        // Decide if we should pursue this goal now
        const shouldPursue = this.shouldPursueGoal(goal, state, interestAnalysis, priority);
        return {
            goalId: goal.id,
            goal,
            priority,
            reason: this.generatePursuitReason(goal, state, interestAnalysis),
            approach,
            message: contextualMessage,
            shouldPursue
        };
    }
    /**
     * Generate contextual message for goal pursuit
     */
    generateGoalMessage(goal, approach, userMessage, state) {
        const valueProposition = goal.approach.valueProposition || '';
        switch (goal.id) {
            case 'collect_name_first':
                if (approach === 'direct') {
                    return `What's your name? ${valueProposition}`;
                }
                else if (approach === 'contextual') {
                    return `${valueProposition} - what should I call you?`;
                }
                else {
                    return `By the way, what's your first name so I can personalize this for you?`;
                }
            case 'collect_email':
                if (approach === 'direct') {
                    return `What's your email address? ${valueProposition}`;
                }
                else if (approach === 'contextual') {
                    return `${valueProposition} - what's the best email to send that to?`;
                }
                else {
                    return `By the way, ${valueProposition.toLowerCase()} if you'd like. What email should I use?`;
                }
            case 'collect_phone':
                if (approach === 'direct') {
                    return `What's your phone number? ${valueProposition}`;
                }
                else if (approach === 'contextual') {
                    return `${valueProposition} - what's your phone number?`;
                }
                else {
                    return `If you'd like text updates, what's your phone number?`;
                }
            case 'collect_name':
                if (approach === 'direct') {
                    return `What's your name? ${valueProposition}`;
                }
                else if (approach === 'contextual') {
                    return `${valueProposition} - what should I call you?`;
                }
                else {
                    return `I'd love to personalize this for you - what's your first name?`;
                }
            case 'schedule_class':
                if (approach === 'direct') {
                    return `Would you like to schedule a class? ${valueProposition}`;
                }
                else if (approach === 'contextual') {
                    return `${valueProposition} - want to book your first class?`;
                }
                else {
                    return `We have some great classes coming up if you're interested in trying one out.`;
                }
            default:
                return goal.approach.valueProposition || `Let me help you with ${goal.name.toLowerCase()}.`;
        }
    }
    /**
     * Determine if we should pursue a goal right now
     */
    shouldPursueGoal(goal, state, interestAnalysis, priority) {
        // Don't pursue if already active
        if (state.activeGoals.includes(goal.id))
            return false;
        // Always pursue critical goals if conditions are met
        if (goal.priority === 'critical' && priority >= 4)
            return true;
        // Consider interest threshold
        const interestValues = { low: 1, medium: 2, high: 3 };
        const currentInterest = interestValues[interestAnalysis.interestLevel];
        const minInterest = 3; // Require at least medium interest by default
        if (currentInterest < minInterest && goal.priority !== 'critical')
            return false;
        // Pursue if priority is high enough
        return priority >= 3;
    }
    /**
     * Generate reason for goal pursuit decision
     */
    generatePursuitReason(goal, state, interestAnalysis) {
        const reasons = [];
        if (goal.priority === 'critical')
            reasons.push('critical priority');
        if (interestAnalysis.interestLevel === 'high')
            reasons.push('high user interest');
        if (interestAnalysis.urgencyLevel === 'urgent')
            reasons.push('user urgency detected');
        if (state.messageCount >= (goal.timing.minMessages || 0))
            reasons.push('timing conditions met');
        return reasons.join(', ') || 'standard goal progression';
    }
    /**
     * Check for goal completion triggers
     */
    checkCompletionTriggers(goalConfig, state, result) {
        // Check custom combinations
        if (goalConfig.completionTriggers.customCombinations) {
            for (const combo of goalConfig.completionTriggers.customCombinations) {
                const allCompleted = combo.goalIds.every(goalId => state.completedGoals.includes(goalId));
                if (allCompleted && !result.triggeredIntents.includes(combo.triggerIntent)) {
                    result.triggeredIntents.push(combo.triggerIntent);
                }
            }
        }
        // Check all critical complete
        if (goalConfig.completionTriggers.allCriticalComplete) {
            const criticalGoals = goalConfig.goals.filter(g => g.priority === 'critical');
            const allCriticalComplete = criticalGoals.every(goal => state.completedGoals.includes(goal.id));
            if (allCriticalComplete && !result.triggeredIntents.includes(goalConfig.completionTriggers.allCriticalComplete)) {
                result.triggeredIntents.push(goalConfig.completionTriggers.allCriticalComplete);
            }
        }
    }
    /**
     * Get current goal state for debugging
     */
    getGoalState(sessionId, userId, tenantId) {
        return this.stateManager.getStateSummary(sessionId, userId, tenantId);
    }
    /**
     * Reset goal state (for testing)
     */
    resetGoalState(sessionId, userId, tenantId) {
        this.stateManager.clearState(sessionId, userId, tenantId);
    }
}
//# sourceMappingURL=goal-orchestrator.js.map