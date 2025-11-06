"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalOrchestrator = void 0;
const goal_state_manager_js_1 = require("./goal-state-manager.js");
const interest_detector_js_1 = require("./interest-detector.js");
const info_extractor_js_1 = require("./info-extractor.js");
class GoalOrchestrator {
    constructor() {
        this.stateManager = new goal_state_manager_js_1.GoalStateManager();
        this.interestDetector = new interest_detector_js_1.InterestDetector();
        this.infoExtractor = new info_extractor_js_1.InfoExtractor();
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
exports.GoalOrchestrator = GoalOrchestrator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ29hbC1vcmNoZXN0cmF0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2dvYWwtb3JjaGVzdHJhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQU1BLG1FQUEyRDtBQUMzRCxpRUFBaUY7QUFDakYsMkRBQXdFO0FBd0J4RSxNQUFhLGdCQUFnQjtJQUszQjtRQUNFLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSx3Q0FBZ0IsRUFBRSxDQUFDO1FBQzNDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLHVDQUFnQixFQUFFLENBQUM7UUFDL0MsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLGlDQUFhLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsZ0JBQWdCLENBQ3BCLE9BQWUsRUFDZixTQUFpQixFQUNqQixNQUFjLEVBQ2QsUUFBZ0IsRUFDaEIsVUFBNkIsRUFDN0IsbUJBQThCO1FBRzlCLG9CQUFvQjtRQUNwQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFOUUsMkNBQTJDO1FBQzNDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUM1RixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5RCxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FDaEMsU0FBUyxFQUNULE1BQU0sRUFDTixRQUFRLEVBQ1IsZ0JBQWdCLENBQUMsYUFBYSxFQUM5QixnQkFBZ0IsQ0FBQyxZQUFZLENBQzlCLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBNEI7WUFDdEMsZUFBZSxFQUFFLEVBQUU7WUFDbkIsYUFBYTtZQUNiLGdCQUFnQjtZQUNoQixZQUFZLEVBQUU7Z0JBQ1osY0FBYyxFQUFFLEVBQUU7Z0JBQ2xCLGNBQWMsRUFBRSxFQUFFO2dCQUNsQixRQUFRLEVBQUUsRUFBRTthQUNiO1lBQ0QsZ0JBQWdCLEVBQUUsRUFBRTtTQUNyQixDQUFDO1FBRUYsZ0NBQWdDO1FBQ2hDLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGFBQWEsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFOUQsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRXhELGdDQUFnQztRQUNoQyxJQUFJLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN2QixNQUFNLENBQUMsZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixDQUN6RCxVQUFVLEVBQ1YsS0FBSyxFQUNMLGdCQUFnQixFQUNoQixPQUFPLENBQ1IsQ0FBQztRQUNKLENBQUM7UUFFRCxnQ0FBZ0M7UUFDaEMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFeEQsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLG9CQUFvQixDQUNoQyxhQUE0QixFQUM1QixLQUE0QixFQUM1QixNQUErQjtRQUcvQixnQkFBZ0I7UUFDaEIsSUFBSSxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDeEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FDbEMsS0FBSyxDQUFDLFNBQVMsRUFDZixLQUFLLENBQUMsTUFBTSxFQUNaLEtBQUssQ0FBQyxRQUFRLEVBQ2QsT0FBTyxFQUNQLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUN6QixhQUFhLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FDOUIsQ0FBQztZQUVGLGlDQUFpQztZQUNqQyxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hELElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUM1QixLQUFLLENBQUMsU0FBUyxFQUNmLEtBQUssQ0FBQyxNQUFNLEVBQ1osS0FBSyxDQUFDLFFBQVEsRUFDZCxlQUFlLEVBQ2Ysd0JBQXdCLENBQ3pCLENBQUM7Z0JBQ0YsTUFBTSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQzNELENBQUM7UUFDSCxDQUFDO1FBRUQsZ0JBQWdCO1FBQ2hCLElBQUksYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxZQUFZLENBQUMsa0JBQWtCLENBQ2xDLEtBQUssQ0FBQyxTQUFTLEVBQ2YsS0FBSyxDQUFDLE1BQU0sRUFDWixLQUFLLENBQUMsUUFBUSxFQUNkLE9BQU8sRUFDUCxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssRUFDekIsYUFBYSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQzlCLENBQUM7WUFFRixpQ0FBaUM7WUFDakMsSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDO2dCQUNoRCxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FDNUIsS0FBSyxDQUFDLFNBQVMsRUFDZixLQUFLLENBQUMsTUFBTSxFQUNaLEtBQUssQ0FBQyxRQUFRLEVBQ2QsZUFBZSxFQUNmLHdCQUF3QixDQUN6QixDQUFDO2dCQUNGLE1BQU0sQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUMzRCxDQUFDO1FBQ0gsQ0FBQztRQUVELGdCQUFnQjtRQUNoQixJQUFJLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUNsQyxLQUFLLENBQUMsU0FBUyxFQUNmLEtBQUssQ0FBQyxNQUFNLEVBQ1osS0FBSyxDQUFDLFFBQVEsRUFDZCxXQUFXLEVBQ1gsYUFBYSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQzdCLElBQUksQ0FDTCxDQUFDO1lBRUYsZ0NBQWdDO1lBQ2hDLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDO2dCQUNyRCxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FDNUIsS0FBSyxDQUFDLFNBQVMsRUFDZixLQUFLLENBQUMsTUFBTSxFQUNaLEtBQUssQ0FBQyxRQUFRLEVBQ2Qsb0JBQW9CLEVBQ3BCLHdCQUF3QixDQUN6QixDQUFDO2dCQUNGLE1BQU0sQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FDbEMsS0FBSyxDQUFDLFNBQVMsRUFDZixLQUFLLENBQUMsTUFBTSxFQUNaLEtBQUssQ0FBQyxRQUFRLEVBQ2QsVUFBVSxFQUNWLGFBQWEsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUM1QixJQUFJLENBQ0wsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUNsQyxLQUFLLENBQUMsU0FBUyxFQUNmLEtBQUssQ0FBQyxNQUFNLEVBQ1osS0FBSyxDQUFDLFFBQVEsRUFDZCxVQUFVLEVBQ1YsYUFBYSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQzVCLElBQUksQ0FDTCxDQUFDO1lBRUYsZ0NBQWdDO1lBQ2hDLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztnQkFDL0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQzVCLEtBQUssQ0FBQyxTQUFTLEVBQ2YsS0FBSyxDQUFDLE1BQU0sRUFDWixLQUFLLENBQUMsUUFBUSxFQUNkLGNBQWMsRUFDZCx3QkFBd0IsQ0FDekIsQ0FBQztnQkFDRixNQUFNLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDMUQsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSywwQkFBMEIsQ0FDaEMsT0FBZSxFQUNmLEtBQTRCLEVBQzVCLE1BQStCO1FBRS9CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFckUsSUFBSSxPQUFPLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxVQUFVLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDakQsMENBQTBDO1lBQzFDLE1BQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ3hELE1BQU0sQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQzlCLENBQUM7WUFFRixJQUFJLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLG1EQUFtRDtnQkFDNUYsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQzNCLEtBQUssQ0FBQyxTQUFTLEVBQ2YsS0FBSyxDQUFDLE1BQU0sRUFDWixLQUFLLENBQUMsUUFBUSxFQUNkLFlBQVksQ0FDYixDQUFDO2dCQUNGLE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNsRCxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyx1QkFBdUIsQ0FDbkMsVUFBNkIsRUFDN0IsS0FBNEIsRUFDNUIsZ0JBQWtDLEVBQ2xDLE9BQWU7UUFFZixNQUFNLGVBQWUsR0FBeUIsRUFBRSxDQUFDO1FBRWpELGdEQUFnRDtRQUNoRCxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUNuRCxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdkMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUNwRCxDQUFDO1FBRUYsMENBQTBDO1FBQzFDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUU5RSxLQUFLLE1BQU0sSUFBSSxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQy9CLE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZGLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ25CLGVBQWUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUVELCtCQUErQjtZQUMvQixJQUFJLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ25HLE1BQU07WUFDUixDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU8sZUFBZSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7T0FFRztJQUNLLHFCQUFxQixDQUFDLElBQXNCLEVBQUUsS0FBNEI7UUFDaEYsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsUUFBUTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBRTlDLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQ3ZELEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUM5QyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0ssZUFBZSxDQUNyQixJQUFzQixFQUN0QixLQUE0QixFQUM1QixnQkFBa0M7UUFFbEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUUzQiw2QkFBNkI7UUFDN0IsSUFBSSxNQUFNLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDLFdBQVc7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUNoRixJQUFJLE1BQU0sQ0FBQyxXQUFXLElBQUksS0FBSyxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsV0FBVztZQUFFLE9BQU8sS0FBSyxDQUFDO1FBRWhGLHdCQUF3QjtRQUN4QixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNqRCxNQUFNLGVBQWUsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RFLE1BQU0sR0FBRyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDakMsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLEdBQUcsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQztZQUV0RSxJQUFJLHVCQUF1QixHQUFHLE1BQU0sQ0FBQyxRQUFRO2dCQUFFLE9BQU8sS0FBSyxDQUFDO1FBQzlELENBQUM7UUFFRCwrQkFBK0I7UUFDL0IsSUFBSSxNQUFNLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ2xELE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNLLGVBQWUsQ0FDckIsT0FBb0IsRUFDcEIsS0FBNEIsRUFDNUIsZ0JBQWtDO1FBRWxDLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQ2pELElBQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUN0RCxDQUFDO1FBRUYsT0FBTyxPQUFPLENBQUMsS0FBSyxLQUFLLEtBQUs7WUFDNUIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBRUQ7O09BRUc7SUFDSyxtQkFBbUIsQ0FDekIsS0FBeUIsRUFDekIsZ0JBQWtDO1FBRWxDLE1BQU0sY0FBYyxHQUFHLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBRW5FLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUN6QixNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFN0Msd0JBQXdCO1lBQ3hCLElBQUksU0FBUyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUM1QixPQUFPLFNBQVMsR0FBRyxTQUFTLENBQUM7WUFDL0IsQ0FBQztZQUVELDRDQUE0QztZQUM1QyxJQUFJLGdCQUFnQixDQUFDLGFBQWEsS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDOUMsbURBQW1EO2dCQUNuRCxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssY0FBYyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssY0FBYztvQkFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUN0RSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssY0FBYyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssY0FBYztvQkFBRSxPQUFPLENBQUMsQ0FBQztZQUN2RSxDQUFDO1lBRUQsT0FBTyxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxZQUFZLENBQ3hCLElBQXNCLEVBQ3RCLEtBQTRCLEVBQzVCLGdCQUFrQyxFQUNsQyxPQUFlO1FBR2YsMkJBQTJCO1FBQzNCLE1BQU0sY0FBYyxHQUFHLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ25FLElBQUksUUFBUSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFN0MsZ0RBQWdEO1FBQ2hELElBQUksZ0JBQWdCLENBQUMsYUFBYSxLQUFLLE1BQU07WUFBRSxRQUFRLElBQUksQ0FBQyxDQUFDO1FBQzdELElBQUksZ0JBQWdCLENBQUMsWUFBWSxLQUFLLFFBQVE7WUFBRSxRQUFRLElBQUksR0FBRyxDQUFDO1FBQ2hFLElBQUksZ0JBQWdCLENBQUMsYUFBYSxLQUFLLEtBQUs7WUFBRSxRQUFRLElBQUksQ0FBQyxDQUFDO1FBRTVELHFCQUFxQjtRQUNyQixJQUFJLFFBQVEsR0FBdUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFpQixDQUFDO1FBQ25GLElBQUksZ0JBQWdCLENBQUMsWUFBWSxLQUFLLFFBQVE7WUFBRSxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3BFLElBQUksZ0JBQWdCLENBQUMsYUFBYSxLQUFLLEtBQUs7WUFBRSxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBRWxFLDhCQUE4QjtRQUM5QixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVuRiwyQ0FBMkM7UUFDM0MsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFcEYsT0FBTztZQUNMLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRTtZQUNmLElBQUk7WUFDSixRQUFRO1lBQ1IsTUFBTSxFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixDQUFDO1lBQ2pFLFFBQVE7WUFDUixPQUFPLEVBQUUsaUJBQWlCO1lBQzFCLFlBQVk7U0FDYixDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQ3pCLElBQXNCLEVBQ3RCLFFBQTRDLEVBQzVDLFdBQW1CLEVBQ25CLEtBQTRCO1FBRTVCLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUM7UUFFOUQsUUFBUSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDaEIsS0FBSyxvQkFBb0I7Z0JBQ3ZCLElBQUksUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMxQixPQUFPLHFCQUFxQixnQkFBZ0IsRUFBRSxDQUFDO2dCQUNqRCxDQUFDO3FCQUFNLElBQUksUUFBUSxLQUFLLFlBQVksRUFBRSxDQUFDO29CQUNyQyxPQUFPLEdBQUcsZ0JBQWdCLDRCQUE0QixDQUFDO2dCQUN6RCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyx1RUFBdUUsQ0FBQztnQkFDakYsQ0FBQztZQUVILEtBQUssZUFBZTtnQkFDbEIsSUFBSSxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzFCLE9BQU8sOEJBQThCLGdCQUFnQixFQUFFLENBQUM7Z0JBQzFELENBQUM7cUJBQU0sSUFBSSxRQUFRLEtBQUssWUFBWSxFQUFFLENBQUM7b0JBQ3JDLE9BQU8sR0FBRyxnQkFBZ0IsMkNBQTJDLENBQUM7Z0JBQ3hFLENBQUM7cUJBQU0sQ0FBQztvQkFDTixPQUFPLGVBQWUsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLDBDQUEwQyxDQUFDO2dCQUNqRyxDQUFDO1lBRUgsS0FBSyxlQUFlO2dCQUNsQixJQUFJLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDMUIsT0FBTyw2QkFBNkIsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDekQsQ0FBQztxQkFBTSxJQUFJLFFBQVEsS0FBSyxZQUFZLEVBQUUsQ0FBQztvQkFDckMsT0FBTyxHQUFHLGdCQUFnQiw4QkFBOEIsQ0FBQztnQkFDM0QsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE9BQU8sdURBQXVELENBQUM7Z0JBQ2pFLENBQUM7WUFFSCxLQUFLLGNBQWM7Z0JBQ2pCLElBQUksUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMxQixPQUFPLHFCQUFxQixnQkFBZ0IsRUFBRSxDQUFDO2dCQUNqRCxDQUFDO3FCQUFNLElBQUksUUFBUSxLQUFLLFlBQVksRUFBRSxDQUFDO29CQUNyQyxPQUFPLEdBQUcsZ0JBQWdCLDRCQUE0QixDQUFDO2dCQUN6RCxDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxnRUFBZ0UsQ0FBQztnQkFDMUUsQ0FBQztZQUVILEtBQUssZ0JBQWdCO2dCQUNuQixJQUFJLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDMUIsT0FBTyx1Q0FBdUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDbkUsQ0FBQztxQkFBTSxJQUFJLFFBQVEsS0FBSyxZQUFZLEVBQUUsQ0FBQztvQkFDckMsT0FBTyxHQUFHLGdCQUFnQixtQ0FBbUMsQ0FBQztnQkFDaEUsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE9BQU8sOEVBQThFLENBQUM7Z0JBQ3hGLENBQUM7WUFFSDtnQkFDRSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLElBQUksd0JBQXdCLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQztRQUNoRyxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0ssZ0JBQWdCLENBQ3RCLElBQXNCLEVBQ3RCLEtBQTRCLEVBQzVCLGdCQUFrQyxFQUNsQyxRQUFnQjtRQUVoQixpQ0FBaUM7UUFDakMsSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQUUsT0FBTyxLQUFLLENBQUM7UUFFdEQscURBQXFEO1FBQ3JELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxVQUFVLElBQUksUUFBUSxJQUFJLENBQUM7WUFBRSxPQUFPLElBQUksQ0FBQztRQUUvRCw4QkFBOEI7UUFDOUIsTUFBTSxjQUFjLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQ3RELE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN2RSxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQyw4Q0FBOEM7UUFFckUsSUFBSSxlQUFlLEdBQUcsV0FBVyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssVUFBVTtZQUFFLE9BQU8sS0FBSyxDQUFDO1FBRWhGLG9DQUFvQztRQUNwQyxPQUFPLFFBQVEsSUFBSSxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVEOztPQUVHO0lBQ0sscUJBQXFCLENBQzNCLElBQXNCLEVBQ3RCLEtBQTRCLEVBQzVCLGdCQUFrQztRQUVsQyxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFFbkIsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFVBQVU7WUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDcEUsSUFBSSxnQkFBZ0IsQ0FBQyxhQUFhLEtBQUssTUFBTTtZQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNsRixJQUFJLGdCQUFnQixDQUFDLFlBQVksS0FBSyxRQUFRO1lBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3RGLElBQUksS0FBSyxDQUFDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQztZQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUVoRyxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksMkJBQTJCLENBQUM7SUFDM0QsQ0FBQztJQUVEOztPQUVHO0lBQ0ssdUJBQXVCLENBQzdCLFVBQTZCLEVBQzdCLEtBQTRCLEVBQzVCLE1BQStCO1FBRy9CLDRCQUE0QjtRQUM1QixJQUFJLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3JELEtBQUssTUFBTSxLQUFLLElBQUksVUFBVSxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQ3JFLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQ2hELEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUN0QyxDQUFDO2dCQUVGLElBQUksWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztvQkFDM0UsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ3BELENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUVELDhCQUE4QjtRQUM5QixJQUFJLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ3RELE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxVQUFVLENBQUMsQ0FBQztZQUM5RSxNQUFNLG1CQUFtQixHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDckQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUN2QyxDQUFDO1lBRUYsSUFBSSxtQkFBbUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztnQkFDaEgsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUNsRixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILFlBQVksQ0FBQyxTQUFpQixFQUFFLE1BQWMsRUFBRSxRQUFnQjtRQUM5RCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsY0FBYyxDQUFDLFNBQWlCLEVBQUUsTUFBYyxFQUFFLFFBQWdCO1FBQ2hFLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDNUQsQ0FBQztDQUNGO0FBMWhCRCw0Q0EwaEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBcbiAgQ29udmVyc2F0aW9uR29hbCwgXG4gIEdvYWxDb25maWd1cmF0aW9uLCBcbiAgQ29udmVyc2F0aW9uR29hbFN0YXRlLFxuICBHb2FsVHJpZ2dlciBcbn0gZnJvbSAnLi4vdHlwZXMvZ29hbHMuanMnO1xuaW1wb3J0IHsgR29hbFN0YXRlTWFuYWdlciB9IGZyb20gJy4vZ29hbC1zdGF0ZS1tYW5hZ2VyLmpzJztcbmltcG9ydCB7IEludGVyZXN0RGV0ZWN0b3IsIHR5cGUgSW50ZXJlc3RBbmFseXNpcyB9IGZyb20gJy4vaW50ZXJlc3QtZGV0ZWN0b3IuanMnO1xuaW1wb3J0IHsgSW5mb0V4dHJhY3RvciwgdHlwZSBFeHRyYWN0ZWRJbmZvIH0gZnJvbSAnLi9pbmZvLWV4dHJhY3Rvci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgR29hbFJlY29tbWVuZGF0aW9uIHtcbiAgZ29hbElkOiBzdHJpbmc7XG4gIGdvYWw6IENvbnZlcnNhdGlvbkdvYWw7XG4gIHByaW9yaXR5OiBudW1iZXI7XG4gIHJlYXNvbjogc3RyaW5nO1xuICBhcHByb2FjaDogJ2RpcmVjdCcgfCAnY29udGV4dHVhbCcgfCAnc3VidGxlJztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBzaG91bGRQdXJzdWU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR29hbE9yY2hlc3RyYXRpb25SZXN1bHQge1xuICByZWNvbW1lbmRhdGlvbnM6IEdvYWxSZWNvbW1lbmRhdGlvbltdO1xuICBleHRyYWN0ZWRJbmZvOiBFeHRyYWN0ZWRJbmZvO1xuICBpbnRlcmVzdEFuYWx5c2lzOiBJbnRlcmVzdEFuYWx5c2lzO1xuICBzdGF0ZVVwZGF0ZXM6IHtcbiAgICBuZXdseUNvbXBsZXRlZDogc3RyaW5nW107XG4gICAgbmV3bHlBY3RpdmF0ZWQ6IHN0cmluZ1tdO1xuICAgIGRlY2xpbmVkOiBzdHJpbmdbXTtcbiAgfTtcbiAgdHJpZ2dlcmVkSW50ZW50czogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBHb2FsT3JjaGVzdHJhdG9yIHtcbiAgcHJpdmF0ZSBzdGF0ZU1hbmFnZXI6IEdvYWxTdGF0ZU1hbmFnZXI7XG4gIHByaXZhdGUgaW50ZXJlc3REZXRlY3RvcjogSW50ZXJlc3REZXRlY3RvcjtcbiAgcHJpdmF0ZSBpbmZvRXh0cmFjdG9yOiBJbmZvRXh0cmFjdG9yO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuc3RhdGVNYW5hZ2VyID0gbmV3IEdvYWxTdGF0ZU1hbmFnZXIoKTtcbiAgICB0aGlzLmludGVyZXN0RGV0ZWN0b3IgPSBuZXcgSW50ZXJlc3REZXRlY3RvcigpO1xuICAgIHRoaXMuaW5mb0V4dHJhY3RvciA9IG5ldyBJbmZvRXh0cmFjdG9yKCk7XG4gIH1cblxuICAvKipcbiAgICogTWFpbiBvcmNoZXN0cmF0aW9uIG1ldGhvZCAtIGFuYWx5emVzIG1lc3NhZ2UgYW5kIGRldGVybWluZXMgZ29hbCBhY3Rpb25zXG4gICAqL1xuICBhc3luYyBvcmNoZXN0cmF0ZUdvYWxzKFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgICBzZXNzaW9uSWQ6IHN0cmluZyxcbiAgICB1c2VySWQ6IHN0cmluZyxcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxuICAgIGdvYWxDb25maWc6IEdvYWxDb25maWd1cmF0aW9uLFxuICAgIGNvbnZlcnNhdGlvbkhpc3Rvcnk/OiBzdHJpbmdbXVxuICApOiBQcm9taXNlPEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0PiB7XG4gICAgXG4gICAgLy8gR2V0IGN1cnJlbnQgc3RhdGVcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGVNYW5hZ2VyLmluY3JlbWVudE1lc3NhZ2Uoc2Vzc2lvbklkLCB1c2VySWQsIHRlbmFudElkKTtcbiAgICBcbiAgICAvLyBBbmFseXplIGludGVyZXN0IGFuZCBleHRyYWN0IGluZm9ybWF0aW9uXG4gICAgY29uc3QgaW50ZXJlc3RBbmFseXNpcyA9IHRoaXMuaW50ZXJlc3REZXRlY3Rvci5hbmFseXplTWVzc2FnZShtZXNzYWdlLCBjb252ZXJzYXRpb25IaXN0b3J5KTtcbiAgICBjb25zdCBleHRyYWN0ZWRJbmZvID0gdGhpcy5pbmZvRXh0cmFjdG9yLmV4dHJhY3RJbmZvKG1lc3NhZ2UpO1xuICAgIFxuICAgIC8vIFVwZGF0ZSBzdGF0ZSB3aXRoIGFuYWx5c2lzIHJlc3VsdHNcbiAgICB0aGlzLnN0YXRlTWFuYWdlci5pbmNyZW1lbnRNZXNzYWdlKFxuICAgICAgc2Vzc2lvbklkLCBcbiAgICAgIHVzZXJJZCwgXG4gICAgICB0ZW5hbnRJZCwgXG4gICAgICBpbnRlcmVzdEFuYWx5c2lzLmludGVyZXN0TGV2ZWwsXG4gICAgICBpbnRlcmVzdEFuYWx5c2lzLnVyZ2VuY3lMZXZlbFxuICAgICk7XG5cbiAgICBjb25zdCByZXN1bHQ6IEdvYWxPcmNoZXN0cmF0aW9uUmVzdWx0ID0ge1xuICAgICAgcmVjb21tZW5kYXRpb25zOiBbXSxcbiAgICAgIGV4dHJhY3RlZEluZm8sXG4gICAgICBpbnRlcmVzdEFuYWx5c2lzLFxuICAgICAgc3RhdGVVcGRhdGVzOiB7XG4gICAgICAgIG5ld2x5Q29tcGxldGVkOiBbXSxcbiAgICAgICAgbmV3bHlBY3RpdmF0ZWQ6IFtdLFxuICAgICAgICBkZWNsaW5lZDogW11cbiAgICAgIH0sXG4gICAgICB0cmlnZ2VyZWRJbnRlbnRzOiBbXVxuICAgIH07XG5cbiAgICAvLyBQcm9jZXNzIGV4dHJhY3RlZCBpbmZvcm1hdGlvblxuICAgIGF3YWl0IHRoaXMucHJvY2Vzc0V4dHJhY3RlZEluZm8oZXh0cmFjdGVkSW5mbywgc3RhdGUsIHJlc3VsdCk7XG5cbiAgICAvLyBDaGVjayBmb3IgaW5mb3JtYXRpb24gZGVjbGluZXNcbiAgICB0aGlzLnByb2Nlc3NJbmZvcm1hdGlvbkRlY2xpbmVzKG1lc3NhZ2UsIHN0YXRlLCByZXN1bHQpO1xuXG4gICAgLy8gR2VuZXJhdGUgZ29hbCByZWNvbW1lbmRhdGlvbnNcbiAgICBpZiAoZ29hbENvbmZpZy5lbmFibGVkKSB7XG4gICAgICByZXN1bHQucmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5nZW5lcmF0ZVJlY29tbWVuZGF0aW9ucyhcbiAgICAgICAgZ29hbENvbmZpZyxcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIGludGVyZXN0QW5hbHlzaXMsXG4gICAgICAgIG1lc3NhZ2VcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZm9yIGNvbXBsZXRpb24gdHJpZ2dlcnNcbiAgICB0aGlzLmNoZWNrQ29tcGxldGlvblRyaWdnZXJzKGdvYWxDb25maWcsIHN0YXRlLCByZXN1bHQpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIGFueSBpbmZvcm1hdGlvbiBleHRyYWN0ZWQgZnJvbSB0aGUgdXNlcidzIG1lc3NhZ2VcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcHJvY2Vzc0V4dHJhY3RlZEluZm8oXG4gICAgZXh0cmFjdGVkSW5mbzogRXh0cmFjdGVkSW5mbyxcbiAgICBzdGF0ZTogQ29udmVyc2F0aW9uR29hbFN0YXRlLFxuICAgIHJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHRcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgXG4gICAgLy8gUHJvY2VzcyBlbWFpbFxuICAgIGlmIChleHRyYWN0ZWRJbmZvLmVtYWlsKSB7XG4gICAgICB0aGlzLnN0YXRlTWFuYWdlci5jb2xsZWN0SW5mb3JtYXRpb24oXG4gICAgICAgIHN0YXRlLnNlc3Npb25JZCxcbiAgICAgICAgc3RhdGUudXNlcklkLFxuICAgICAgICBzdGF0ZS50ZW5hbnRJZCxcbiAgICAgICAgJ2VtYWlsJyxcbiAgICAgICAgZXh0cmFjdGVkSW5mby5lbWFpbC52YWx1ZSxcbiAgICAgICAgZXh0cmFjdGVkSW5mby5lbWFpbC52YWxpZGF0ZWRcbiAgICAgICk7XG5cbiAgICAgIC8vIENvbXBsZXRlIGVtYWlsIGNvbGxlY3Rpb24gZ29hbFxuICAgICAgaWYgKHN0YXRlLmFjdGl2ZUdvYWxzLmluY2x1ZGVzKCdjb2xsZWN0X2VtYWlsJykpIHtcbiAgICAgICAgdGhpcy5zdGF0ZU1hbmFnZXIuY29tcGxldGVHb2FsKFxuICAgICAgICAgIHN0YXRlLnNlc3Npb25JZCxcbiAgICAgICAgICBzdGF0ZS51c2VySWQsXG4gICAgICAgICAgc3RhdGUudGVuYW50SWQsXG4gICAgICAgICAgJ2NvbGxlY3RfZW1haWwnLFxuICAgICAgICAgICdleHRyYWN0ZWRfZnJvbV9tZXNzYWdlJ1xuICAgICAgICApO1xuICAgICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLnB1c2goJ2NvbGxlY3RfZW1haWwnKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHBob25lXG4gICAgaWYgKGV4dHJhY3RlZEluZm8ucGhvbmUpIHtcbiAgICAgIHRoaXMuc3RhdGVNYW5hZ2VyLmNvbGxlY3RJbmZvcm1hdGlvbihcbiAgICAgICAgc3RhdGUuc2Vzc2lvbklkLFxuICAgICAgICBzdGF0ZS51c2VySWQsXG4gICAgICAgIHN0YXRlLnRlbmFudElkLFxuICAgICAgICAncGhvbmUnLFxuICAgICAgICBleHRyYWN0ZWRJbmZvLnBob25lLnZhbHVlLFxuICAgICAgICBleHRyYWN0ZWRJbmZvLnBob25lLnZhbGlkYXRlZFxuICAgICAgKTtcblxuICAgICAgLy8gQ29tcGxldGUgcGhvbmUgY29sbGVjdGlvbiBnb2FsXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlR29hbHMuaW5jbHVkZXMoJ2NvbGxlY3RfcGhvbmUnKSkge1xuICAgICAgICB0aGlzLnN0YXRlTWFuYWdlci5jb21wbGV0ZUdvYWwoXG4gICAgICAgICAgc3RhdGUuc2Vzc2lvbklkLFxuICAgICAgICAgIHN0YXRlLnVzZXJJZCxcbiAgICAgICAgICBzdGF0ZS50ZW5hbnRJZCxcbiAgICAgICAgICAnY29sbGVjdF9waG9uZScsXG4gICAgICAgICAgJ2V4dHJhY3RlZF9mcm9tX21lc3NhZ2UnXG4gICAgICAgICk7XG4gICAgICAgIHJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlDb21wbGV0ZWQucHVzaCgnY29sbGVjdF9waG9uZScpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgbmFtZXNcbiAgICBpZiAoZXh0cmFjdGVkSW5mby5maXJzdE5hbWUpIHtcbiAgICAgIHRoaXMuc3RhdGVNYW5hZ2VyLmNvbGxlY3RJbmZvcm1hdGlvbihcbiAgICAgICAgc3RhdGUuc2Vzc2lvbklkLFxuICAgICAgICBzdGF0ZS51c2VySWQsXG4gICAgICAgIHN0YXRlLnRlbmFudElkLFxuICAgICAgICAnZmlyc3ROYW1lJyxcbiAgICAgICAgZXh0cmFjdGVkSW5mby5maXJzdE5hbWUudmFsdWUsXG4gICAgICAgIHRydWVcbiAgICAgICk7XG5cbiAgICAgIC8vIENvbXBsZXRlIG5hbWUgY29sbGVjdGlvbiBnb2FsXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlR29hbHMuaW5jbHVkZXMoJ2NvbGxlY3RfbmFtZV9maXJzdCcpKSB7XG4gICAgICAgIHRoaXMuc3RhdGVNYW5hZ2VyLmNvbXBsZXRlR29hbChcbiAgICAgICAgICBzdGF0ZS5zZXNzaW9uSWQsXG4gICAgICAgICAgc3RhdGUudXNlcklkLFxuICAgICAgICAgIHN0YXRlLnRlbmFudElkLFxuICAgICAgICAgICdjb2xsZWN0X25hbWVfZmlyc3QnLFxuICAgICAgICAgICdleHRyYWN0ZWRfZnJvbV9tZXNzYWdlJ1xuICAgICAgICApO1xuICAgICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLnB1c2goJ2NvbGxlY3RfbmFtZV9maXJzdCcpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHRyYWN0ZWRJbmZvLmxhc3ROYW1lKSB7XG4gICAgICB0aGlzLnN0YXRlTWFuYWdlci5jb2xsZWN0SW5mb3JtYXRpb24oXG4gICAgICAgIHN0YXRlLnNlc3Npb25JZCxcbiAgICAgICAgc3RhdGUudXNlcklkLFxuICAgICAgICBzdGF0ZS50ZW5hbnRJZCxcbiAgICAgICAgJ2xhc3ROYW1lJyxcbiAgICAgICAgZXh0cmFjdGVkSW5mby5sYXN0TmFtZS52YWx1ZSxcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoZXh0cmFjdGVkSW5mby5mdWxsTmFtZSkge1xuICAgICAgdGhpcy5zdGF0ZU1hbmFnZXIuY29sbGVjdEluZm9ybWF0aW9uKFxuICAgICAgICBzdGF0ZS5zZXNzaW9uSWQsXG4gICAgICAgIHN0YXRlLnVzZXJJZCxcbiAgICAgICAgc3RhdGUudGVuYW50SWQsXG4gICAgICAgICdmdWxsTmFtZScsXG4gICAgICAgIGV4dHJhY3RlZEluZm8uZnVsbE5hbWUudmFsdWUsXG4gICAgICAgIHRydWVcbiAgICAgICk7XG5cbiAgICAgIC8vIENvbXBsZXRlIG5hbWUgY29sbGVjdGlvbiBnb2FsXG4gICAgICBpZiAoc3RhdGUuYWN0aXZlR29hbHMuaW5jbHVkZXMoJ2NvbGxlY3RfbmFtZScpKSB7XG4gICAgICAgIHRoaXMuc3RhdGVNYW5hZ2VyLmNvbXBsZXRlR29hbChcbiAgICAgICAgICBzdGF0ZS5zZXNzaW9uSWQsXG4gICAgICAgICAgc3RhdGUudXNlcklkLFxuICAgICAgICAgIHN0YXRlLnRlbmFudElkLFxuICAgICAgICAgICdjb2xsZWN0X25hbWUnLFxuICAgICAgICAgICdleHRyYWN0ZWRfZnJvbV9tZXNzYWdlJ1xuICAgICAgICApO1xuICAgICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLnB1c2goJ2NvbGxlY3RfbmFtZScpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiB1c2VyIGlzIGRlY2xpbmluZyB0byBwcm92aWRlIGluZm9ybWF0aW9uXG4gICAqL1xuICBwcml2YXRlIHByb2Nlc3NJbmZvcm1hdGlvbkRlY2xpbmVzKFxuICAgIG1lc3NhZ2U6IHN0cmluZyxcbiAgICBzdGF0ZTogQ29udmVyc2F0aW9uR29hbFN0YXRlLFxuICAgIHJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHRcbiAgKTogdm9pZCB7XG4gICAgY29uc3QgZGVjbGluZSA9IHRoaXMuaW5mb0V4dHJhY3Rvci5kZXRlY3RJbmZvcm1hdGlvbkRlY2xpbmUobWVzc2FnZSk7XG4gICAgXG4gICAgaWYgKGRlY2xpbmUuZGVjbGluZWQgJiYgZGVjbGluZS5jb25maWRlbmNlID4gMC43KSB7XG4gICAgICAvLyBGaW5kIHdoaWNoIGdvYWwgdGhleSBtaWdodCBiZSBkZWNsaW5pbmdcbiAgICAgIGNvbnN0IGFjdGl2ZUluZm9Hb2FscyA9IHN0YXRlLmFjdGl2ZUdvYWxzLmZpbHRlcihnb2FsSWQgPT4gXG4gICAgICAgIGdvYWxJZC5zdGFydHNXaXRoKCdjb2xsZWN0XycpXG4gICAgICApO1xuXG4gICAgICBpZiAoYWN0aXZlSW5mb0dvYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZGVjbGluZWRHb2FsID0gYWN0aXZlSW5mb0dvYWxzWzBdOyAvLyBBc3N1bWUgdGhleSdyZSBkZWNsaW5pbmcgdGhlIG1vc3QgcmVjZW50IHJlcXVlc3RcbiAgICAgICAgdGhpcy5zdGF0ZU1hbmFnZXIuZGVjbGluZUdvYWwoXG4gICAgICAgICAgc3RhdGUuc2Vzc2lvbklkLFxuICAgICAgICAgIHN0YXRlLnVzZXJJZCxcbiAgICAgICAgICBzdGF0ZS50ZW5hbnRJZCxcbiAgICAgICAgICBkZWNsaW5lZEdvYWxcbiAgICAgICAgKTtcbiAgICAgICAgcmVzdWx0LnN0YXRlVXBkYXRlcy5kZWNsaW5lZC5wdXNoKGRlY2xpbmVkR29hbCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHJlY29tbWVuZGF0aW9ucyBmb3Igd2hpY2ggZ29hbHMgdG8gcHVyc3VlXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlUmVjb21tZW5kYXRpb25zKFxuICAgIGdvYWxDb25maWc6IEdvYWxDb25maWd1cmF0aW9uLFxuICAgIHN0YXRlOiBDb252ZXJzYXRpb25Hb2FsU3RhdGUsXG4gICAgaW50ZXJlc3RBbmFseXNpczogSW50ZXJlc3RBbmFseXNpcyxcbiAgICBtZXNzYWdlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxHb2FsUmVjb21tZW5kYXRpb25bXT4ge1xuICAgIGNvbnN0IHJlY29tbWVuZGF0aW9uczogR29hbFJlY29tbWVuZGF0aW9uW10gPSBbXTtcblxuICAgIC8vIEZpbHRlciBnb2FscyB0aGF0IGFyZSBlbGlnaWJsZSBmb3IgYWN0aXZhdGlvblxuICAgIGNvbnN0IGVsaWdpYmxlR29hbHMgPSBnb2FsQ29uZmlnLmdvYWxzLmZpbHRlcihnb2FsID0+IFxuICAgICAgIXN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWwuaWQpICYmXG4gICAgICAhc3RhdGUuZGVjbGluZWRHb2Fscy5pbmNsdWRlcyhnb2FsLmlkKSAmJlxuICAgICAgdGhpcy5jaGVja0dvYWxEZXBlbmRlbmNpZXMoZ29hbCwgc3RhdGUpICYmXG4gICAgICB0aGlzLmNoZWNrR29hbFRpbWluZyhnb2FsLCBzdGF0ZSwgaW50ZXJlc3RBbmFseXNpcylcbiAgICApO1xuXG4gICAgLy8gU29ydCBieSBwcmlvcml0eSBhbmQgZXZhbHVhdGUgZWFjaCBnb2FsXG4gICAgY29uc3Qgc29ydGVkR29hbHMgPSB0aGlzLnNvcnRHb2Fsc0J5UHJpb3JpdHkoZWxpZ2libGVHb2FscywgaW50ZXJlc3RBbmFseXNpcyk7XG5cbiAgICBmb3IgKGNvbnN0IGdvYWwgb2Ygc29ydGVkR29hbHMpIHtcbiAgICAgIGNvbnN0IHJlY29tbWVuZGF0aW9uID0gYXdhaXQgdGhpcy5ldmFsdWF0ZUdvYWwoZ29hbCwgc3RhdGUsIGludGVyZXN0QW5hbHlzaXMsIG1lc3NhZ2UpO1xuICAgICAgaWYgKHJlY29tbWVuZGF0aW9uKSB7XG4gICAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKHJlY29tbWVuZGF0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVzcGVjdCBtYXhBY3RpdmVHb2FscyBsaW1pdFxuICAgICAgaWYgKHJlY29tbWVuZGF0aW9ucy5maWx0ZXIociA9PiByLnNob3VsZFB1cnN1ZSkubGVuZ3RoID49IGdvYWxDb25maWcuZ2xvYmFsU2V0dGluZ3MubWF4QWN0aXZlR29hbHMpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlY29tbWVuZGF0aW9ucztcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBnb2FsIGRlcGVuZGVuY2llcyBhcmUgc2F0aXNmaWVkXG4gICAqL1xuICBwcml2YXRlIGNoZWNrR29hbERlcGVuZGVuY2llcyhnb2FsOiBDb252ZXJzYXRpb25Hb2FsLCBzdGF0ZTogQ29udmVyc2F0aW9uR29hbFN0YXRlKTogYm9vbGVhbiB7XG4gICAgaWYgKCFnb2FsLmRlcGVuZGVuY2llcz8ucmVxdWlyZXMpIHJldHVybiB0cnVlO1xuICAgIFxuICAgIHJldHVybiBnb2FsLmRlcGVuZGVuY2llcy5yZXF1aXJlcy5ldmVyeShyZXF1aXJlZEdvYWxJZCA9PiBcbiAgICAgIHN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKHJlcXVpcmVkR29hbElkKVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgZ29hbCB0aW1pbmcgY29uZGl0aW9ucyBhcmUgbWV0XG4gICAqL1xuICBwcml2YXRlIGNoZWNrR29hbFRpbWluZyhcbiAgICBnb2FsOiBDb252ZXJzYXRpb25Hb2FsLFxuICAgIHN0YXRlOiBDb252ZXJzYXRpb25Hb2FsU3RhdGUsXG4gICAgaW50ZXJlc3RBbmFseXNpczogSW50ZXJlc3RBbmFseXNpc1xuICApOiBib29sZWFuIHtcbiAgICBjb25zdCB0aW1pbmcgPSBnb2FsLnRpbWluZztcblxuICAgIC8vIENoZWNrIG1lc3NhZ2UgY291bnQgYm91bmRzXG4gICAgaWYgKHRpbWluZy5taW5NZXNzYWdlcyAmJiBzdGF0ZS5tZXNzYWdlQ291bnQgPCB0aW1pbmcubWluTWVzc2FnZXMpIHJldHVybiBmYWxzZTtcbiAgICBpZiAodGltaW5nLm1heE1lc3NhZ2VzICYmIHN0YXRlLm1lc3NhZ2VDb3VudCA+IHRpbWluZy5tYXhNZXNzYWdlcykgcmV0dXJuIGZhbHNlO1xuXG4gICAgLy8gQ2hlY2sgY29vbGRvd24gcGVyaW9kXG4gICAgaWYgKGdvYWwudHJhY2tpbmcubGFzdEF0dGVtcHQgJiYgdGltaW5nLmNvb2xkb3duKSB7XG4gICAgICBjb25zdCBsYXN0QXR0ZW1wdFRpbWUgPSBuZXcgRGF0ZShnb2FsLnRyYWNraW5nLmxhc3RBdHRlbXB0KS5nZXRUaW1lKCk7XG4gICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgIGNvbnN0IG1pbnV0ZXNTaW5jZUxhc3RBdHRlbXB0ID0gKG5vdyAtIGxhc3RBdHRlbXB0VGltZSkgLyAoMTAwMCAqIDYwKTtcbiAgICAgIFxuICAgICAgaWYgKG1pbnV0ZXNTaW5jZUxhc3RBdHRlbXB0IDwgdGltaW5nLmNvb2xkb3duKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgdHJpZ2dlcnMgaWYgdGhleSBleGlzdFxuICAgIGlmICh0aW1pbmcudHJpZ2dlcnMgJiYgdGltaW5nLnRyaWdnZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB0aW1pbmcudHJpZ2dlcnMuc29tZSh0cmlnZ2VyID0+IHRoaXMuZXZhbHVhdGVUcmlnZ2VyKHRyaWdnZXIsIHN0YXRlLCBpbnRlcmVzdEFuYWx5c2lzKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogRXZhbHVhdGUgYSBnb2FsIHRyaWdnZXJcbiAgICovXG4gIHByaXZhdGUgZXZhbHVhdGVUcmlnZ2VyKFxuICAgIHRyaWdnZXI6IEdvYWxUcmlnZ2VyLFxuICAgIHN0YXRlOiBDb252ZXJzYXRpb25Hb2FsU3RhdGUsXG4gICAgaW50ZXJlc3RBbmFseXNpczogSW50ZXJlc3RBbmFseXNpc1xuICApOiBib29sZWFuIHtcbiAgICBjb25zdCByZXN1bHRzID0gdHJpZ2dlci5jb25kaXRpb25zLm1hcChjb25kaXRpb24gPT4gXG4gICAgICB0aGlzLnN0YXRlTWFuYWdlci5ldmFsdWF0ZUNvbmRpdGlvbihzdGF0ZSwgY29uZGl0aW9uKVxuICAgICk7XG5cbiAgICByZXR1cm4gdHJpZ2dlci5sb2dpYyA9PT0gJ0FORCcgXG4gICAgICA/IHJlc3VsdHMuZXZlcnkociA9PiByKVxuICAgICAgOiByZXN1bHRzLnNvbWUociA9PiByKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTb3J0IGdvYWxzIGJ5IHByaW9yaXR5IGFuZCBjdXJyZW50IGNvbnRleHRcbiAgICovXG4gIHByaXZhdGUgc29ydEdvYWxzQnlQcmlvcml0eShcbiAgICBnb2FsczogQ29udmVyc2F0aW9uR29hbFtdLFxuICAgIGludGVyZXN0QW5hbHlzaXM6IEludGVyZXN0QW5hbHlzaXNcbiAgKTogQ29udmVyc2F0aW9uR29hbFtdIHtcbiAgICBjb25zdCBwcmlvcml0eVZhbHVlcyA9IHsgY3JpdGljYWw6IDQsIGhpZ2g6IDMsIG1lZGl1bTogMiwgbG93OiAxIH07XG4gICAgXG4gICAgcmV0dXJuIGdvYWxzLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGNvbnN0IGFQcmlvcml0eSA9IHByaW9yaXR5VmFsdWVzW2EucHJpb3JpdHldO1xuICAgICAgY29uc3QgYlByaW9yaXR5ID0gcHJpb3JpdHlWYWx1ZXNbYi5wcmlvcml0eV07XG4gICAgICBcbiAgICAgIC8vIEhpZ2hlciBwcmlvcml0eSBmaXJzdFxuICAgICAgaWYgKGFQcmlvcml0eSAhPT0gYlByaW9yaXR5KSB7XG4gICAgICAgIHJldHVybiBiUHJpb3JpdHkgLSBhUHJpb3JpdHk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIElmIHNhbWUgcHJpb3JpdHksIGNvbnNpZGVyIGludGVyZXN0IGxldmVsXG4gICAgICBpZiAoaW50ZXJlc3RBbmFseXNpcy5pbnRlcmVzdExldmVsID09PSAnaGlnaCcpIHtcbiAgICAgICAgLy8gUHJpb3JpdGl6ZSBpbmZvIGNvbGxlY3Rpb24gd2hlbiBpbnRlcmVzdCBpcyBoaWdoXG4gICAgICAgIGlmIChhLnR5cGUgPT09ICdjb2xsZWN0X2luZm8nICYmIGIudHlwZSAhPT0gJ2NvbGxlY3RfaW5mbycpIHJldHVybiAtMTtcbiAgICAgICAgaWYgKGIudHlwZSA9PT0gJ2NvbGxlY3RfaW5mbycgJiYgYS50eXBlICE9PSAnY29sbGVjdF9pbmZvJykgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHJldHVybiAwO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEV2YWx1YXRlIGEgc3BlY2lmaWMgZ29hbCBhbmQgY3JlYXRlIHJlY29tbWVuZGF0aW9uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGV2YWx1YXRlR29hbChcbiAgICBnb2FsOiBDb252ZXJzYXRpb25Hb2FsLFxuICAgIHN0YXRlOiBDb252ZXJzYXRpb25Hb2FsU3RhdGUsXG4gICAgaW50ZXJlc3RBbmFseXNpczogSW50ZXJlc3RBbmFseXNpcyxcbiAgICBtZXNzYWdlOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxHb2FsUmVjb21tZW5kYXRpb24gfCBudWxsPiB7XG4gICAgXG4gICAgLy8gQ2FsY3VsYXRlIHByaW9yaXR5IHNjb3JlXG4gICAgY29uc3QgcHJpb3JpdHlWYWx1ZXMgPSB7IGNyaXRpY2FsOiA0LCBoaWdoOiAzLCBtZWRpdW06IDIsIGxvdzogMSB9O1xuICAgIGxldCBwcmlvcml0eSA9IHByaW9yaXR5VmFsdWVzW2dvYWwucHJpb3JpdHldO1xuICAgIFxuICAgIC8vIEFkanVzdCBwcmlvcml0eSBiYXNlZCBvbiBpbnRlcmVzdCBhbmQgdXJnZW5jeVxuICAgIGlmIChpbnRlcmVzdEFuYWx5c2lzLmludGVyZXN0TGV2ZWwgPT09ICdoaWdoJykgcHJpb3JpdHkgKz0gMTtcbiAgICBpZiAoaW50ZXJlc3RBbmFseXNpcy51cmdlbmN5TGV2ZWwgPT09ICd1cmdlbnQnKSBwcmlvcml0eSArPSAwLjU7XG4gICAgaWYgKGludGVyZXN0QW5hbHlzaXMuaW50ZXJlc3RMZXZlbCA9PT0gJ2xvdycpIHByaW9yaXR5IC09IDE7XG4gICAgXG4gICAgLy8gRGV0ZXJtaW5lIGFwcHJvYWNoXG4gICAgbGV0IGFwcHJvYWNoOiAnZGlyZWN0JyB8ICdjb250ZXh0dWFsJyB8ICdzdWJ0bGUnID0gZ29hbC5hcHByb2FjaC5kaXJlY3RuZXNzIGFzIGFueTtcbiAgICBpZiAoaW50ZXJlc3RBbmFseXNpcy51cmdlbmN5TGV2ZWwgPT09ICd1cmdlbnQnKSBhcHByb2FjaCA9ICdkaXJlY3QnO1xuICAgIGlmIChpbnRlcmVzdEFuYWx5c2lzLmludGVyZXN0TGV2ZWwgPT09ICdsb3cnKSBhcHByb2FjaCA9ICdzdWJ0bGUnO1xuXG4gICAgLy8gR2VuZXJhdGUgY29udGV4dHVhbCBtZXNzYWdlXG4gICAgY29uc3QgY29udGV4dHVhbE1lc3NhZ2UgPSB0aGlzLmdlbmVyYXRlR29hbE1lc3NhZ2UoZ29hbCwgYXBwcm9hY2gsIG1lc3NhZ2UsIHN0YXRlKTtcbiAgICBcbiAgICAvLyBEZWNpZGUgaWYgd2Ugc2hvdWxkIHB1cnN1ZSB0aGlzIGdvYWwgbm93XG4gICAgY29uc3Qgc2hvdWxkUHVyc3VlID0gdGhpcy5zaG91bGRQdXJzdWVHb2FsKGdvYWwsIHN0YXRlLCBpbnRlcmVzdEFuYWx5c2lzLCBwcmlvcml0eSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIGdvYWxJZDogZ29hbC5pZCxcbiAgICAgIGdvYWwsXG4gICAgICBwcmlvcml0eSxcbiAgICAgIHJlYXNvbjogdGhpcy5nZW5lcmF0ZVB1cnN1aXRSZWFzb24oZ29hbCwgc3RhdGUsIGludGVyZXN0QW5hbHlzaXMpLFxuICAgICAgYXBwcm9hY2gsXG4gICAgICBtZXNzYWdlOiBjb250ZXh0dWFsTWVzc2FnZSxcbiAgICAgIHNob3VsZFB1cnN1ZVxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgY29udGV4dHVhbCBtZXNzYWdlIGZvciBnb2FsIHB1cnN1aXRcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVHb2FsTWVzc2FnZShcbiAgICBnb2FsOiBDb252ZXJzYXRpb25Hb2FsLFxuICAgIGFwcHJvYWNoOiAnZGlyZWN0JyB8ICdjb250ZXh0dWFsJyB8ICdzdWJ0bGUnLFxuICAgIHVzZXJNZXNzYWdlOiBzdHJpbmcsXG4gICAgc3RhdGU6IENvbnZlcnNhdGlvbkdvYWxTdGF0ZVxuICApOiBzdHJpbmcge1xuICAgIGNvbnN0IHZhbHVlUHJvcG9zaXRpb24gPSBnb2FsLmFwcHJvYWNoLnZhbHVlUHJvcG9zaXRpb24gfHwgJyc7XG4gICAgXG4gICAgc3dpdGNoIChnb2FsLmlkKSB7XG4gICAgICBjYXNlICdjb2xsZWN0X25hbWVfZmlyc3QnOlxuICAgICAgICBpZiAoYXBwcm9hY2ggPT09ICdkaXJlY3QnKSB7XG4gICAgICAgICAgcmV0dXJuIGBXaGF0J3MgeW91ciBuYW1lPyAke3ZhbHVlUHJvcG9zaXRpb259YDtcbiAgICAgICAgfSBlbHNlIGlmIChhcHByb2FjaCA9PT0gJ2NvbnRleHR1YWwnKSB7XG4gICAgICAgICAgcmV0dXJuIGAke3ZhbHVlUHJvcG9zaXRpb259IC0gd2hhdCBzaG91bGQgSSBjYWxsIHlvdT9gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgQnkgdGhlIHdheSwgd2hhdCdzIHlvdXIgZmlyc3QgbmFtZSBzbyBJIGNhbiBwZXJzb25hbGl6ZSB0aGlzIGZvciB5b3U/YDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgIGNhc2UgJ2NvbGxlY3RfZW1haWwnOlxuICAgICAgICBpZiAoYXBwcm9hY2ggPT09ICdkaXJlY3QnKSB7XG4gICAgICAgICAgcmV0dXJuIGBXaGF0J3MgeW91ciBlbWFpbCBhZGRyZXNzPyAke3ZhbHVlUHJvcG9zaXRpb259YDtcbiAgICAgICAgfSBlbHNlIGlmIChhcHByb2FjaCA9PT0gJ2NvbnRleHR1YWwnKSB7XG4gICAgICAgICAgcmV0dXJuIGAke3ZhbHVlUHJvcG9zaXRpb259IC0gd2hhdCdzIHRoZSBiZXN0IGVtYWlsIHRvIHNlbmQgdGhhdCB0bz9gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgQnkgdGhlIHdheSwgJHt2YWx1ZVByb3Bvc2l0aW9uLnRvTG93ZXJDYXNlKCl9IGlmIHlvdSdkIGxpa2UuIFdoYXQgZW1haWwgc2hvdWxkIEkgdXNlP2A7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICBjYXNlICdjb2xsZWN0X3Bob25lJzpcbiAgICAgICAgaWYgKGFwcHJvYWNoID09PSAnZGlyZWN0Jykge1xuICAgICAgICAgIHJldHVybiBgV2hhdCdzIHlvdXIgcGhvbmUgbnVtYmVyPyAke3ZhbHVlUHJvcG9zaXRpb259YDtcbiAgICAgICAgfSBlbHNlIGlmIChhcHByb2FjaCA9PT0gJ2NvbnRleHR1YWwnKSB7XG4gICAgICAgICAgcmV0dXJuIGAke3ZhbHVlUHJvcG9zaXRpb259IC0gd2hhdCdzIHlvdXIgcGhvbmUgbnVtYmVyP2A7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGBJZiB5b3UnZCBsaWtlIHRleHQgdXBkYXRlcywgd2hhdCdzIHlvdXIgcGhvbmUgbnVtYmVyP2A7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICBjYXNlICdjb2xsZWN0X25hbWUnOlxuICAgICAgICBpZiAoYXBwcm9hY2ggPT09ICdkaXJlY3QnKSB7XG4gICAgICAgICAgcmV0dXJuIGBXaGF0J3MgeW91ciBuYW1lPyAke3ZhbHVlUHJvcG9zaXRpb259YDtcbiAgICAgICAgfSBlbHNlIGlmIChhcHByb2FjaCA9PT0gJ2NvbnRleHR1YWwnKSB7XG4gICAgICAgICAgcmV0dXJuIGAke3ZhbHVlUHJvcG9zaXRpb259IC0gd2hhdCBzaG91bGQgSSBjYWxsIHlvdT9gO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBgSSdkIGxvdmUgdG8gcGVyc29uYWxpemUgdGhpcyBmb3IgeW91IC0gd2hhdCdzIHlvdXIgZmlyc3QgbmFtZT9gO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgY2FzZSAnc2NoZWR1bGVfY2xhc3MnOlxuICAgICAgICBpZiAoYXBwcm9hY2ggPT09ICdkaXJlY3QnKSB7XG4gICAgICAgICAgcmV0dXJuIGBXb3VsZCB5b3UgbGlrZSB0byBzY2hlZHVsZSBhIGNsYXNzPyAke3ZhbHVlUHJvcG9zaXRpb259YDtcbiAgICAgICAgfSBlbHNlIGlmIChhcHByb2FjaCA9PT0gJ2NvbnRleHR1YWwnKSB7XG4gICAgICAgICAgcmV0dXJuIGAke3ZhbHVlUHJvcG9zaXRpb259IC0gd2FudCB0byBib29rIHlvdXIgZmlyc3QgY2xhc3M/YDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gYFdlIGhhdmUgc29tZSBncmVhdCBjbGFzc2VzIGNvbWluZyB1cCBpZiB5b3UncmUgaW50ZXJlc3RlZCBpbiB0cnlpbmcgb25lIG91dC5gO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIGdvYWwuYXBwcm9hY2gudmFsdWVQcm9wb3NpdGlvbiB8fCBgTGV0IG1lIGhlbHAgeW91IHdpdGggJHtnb2FsLm5hbWUudG9Mb3dlckNhc2UoKX0uYDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lIGlmIHdlIHNob3VsZCBwdXJzdWUgYSBnb2FsIHJpZ2h0IG5vd1xuICAgKi9cbiAgcHJpdmF0ZSBzaG91bGRQdXJzdWVHb2FsKFxuICAgIGdvYWw6IENvbnZlcnNhdGlvbkdvYWwsXG4gICAgc3RhdGU6IENvbnZlcnNhdGlvbkdvYWxTdGF0ZSxcbiAgICBpbnRlcmVzdEFuYWx5c2lzOiBJbnRlcmVzdEFuYWx5c2lzLFxuICAgIHByaW9yaXR5OiBudW1iZXJcbiAgKTogYm9vbGVhbiB7XG4gICAgLy8gRG9uJ3QgcHVyc3VlIGlmIGFscmVhZHkgYWN0aXZlXG4gICAgaWYgKHN0YXRlLmFjdGl2ZUdvYWxzLmluY2x1ZGVzKGdvYWwuaWQpKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgLy8gQWx3YXlzIHB1cnN1ZSBjcml0aWNhbCBnb2FscyBpZiBjb25kaXRpb25zIGFyZSBtZXRcbiAgICBpZiAoZ29hbC5wcmlvcml0eSA9PT0gJ2NyaXRpY2FsJyAmJiBwcmlvcml0eSA+PSA0KSByZXR1cm4gdHJ1ZTtcbiAgICBcbiAgICAvLyBDb25zaWRlciBpbnRlcmVzdCB0aHJlc2hvbGRcbiAgICBjb25zdCBpbnRlcmVzdFZhbHVlcyA9IHsgbG93OiAxLCBtZWRpdW06IDIsIGhpZ2g6IDMgfTtcbiAgICBjb25zdCBjdXJyZW50SW50ZXJlc3QgPSBpbnRlcmVzdFZhbHVlc1tpbnRlcmVzdEFuYWx5c2lzLmludGVyZXN0TGV2ZWxdO1xuICAgIGNvbnN0IG1pbkludGVyZXN0ID0gMzsgLy8gUmVxdWlyZSBhdCBsZWFzdCBtZWRpdW0gaW50ZXJlc3QgYnkgZGVmYXVsdFxuICAgIFxuICAgIGlmIChjdXJyZW50SW50ZXJlc3QgPCBtaW5JbnRlcmVzdCAmJiBnb2FsLnByaW9yaXR5ICE9PSAnY3JpdGljYWwnKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgLy8gUHVyc3VlIGlmIHByaW9yaXR5IGlzIGhpZ2ggZW5vdWdoXG4gICAgcmV0dXJuIHByaW9yaXR5ID49IDM7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgcmVhc29uIGZvciBnb2FsIHB1cnN1aXQgZGVjaXNpb25cbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVQdXJzdWl0UmVhc29uKFxuICAgIGdvYWw6IENvbnZlcnNhdGlvbkdvYWwsXG4gICAgc3RhdGU6IENvbnZlcnNhdGlvbkdvYWxTdGF0ZSxcbiAgICBpbnRlcmVzdEFuYWx5c2lzOiBJbnRlcmVzdEFuYWx5c2lzXG4gICk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVhc29ucyA9IFtdO1xuICAgIFxuICAgIGlmIChnb2FsLnByaW9yaXR5ID09PSAnY3JpdGljYWwnKSByZWFzb25zLnB1c2goJ2NyaXRpY2FsIHByaW9yaXR5Jyk7XG4gICAgaWYgKGludGVyZXN0QW5hbHlzaXMuaW50ZXJlc3RMZXZlbCA9PT0gJ2hpZ2gnKSByZWFzb25zLnB1c2goJ2hpZ2ggdXNlciBpbnRlcmVzdCcpO1xuICAgIGlmIChpbnRlcmVzdEFuYWx5c2lzLnVyZ2VuY3lMZXZlbCA9PT0gJ3VyZ2VudCcpIHJlYXNvbnMucHVzaCgndXNlciB1cmdlbmN5IGRldGVjdGVkJyk7XG4gICAgaWYgKHN0YXRlLm1lc3NhZ2VDb3VudCA+PSAoZ29hbC50aW1pbmcubWluTWVzc2FnZXMgfHwgMCkpIHJlYXNvbnMucHVzaCgndGltaW5nIGNvbmRpdGlvbnMgbWV0Jyk7XG4gICAgXG4gICAgcmV0dXJuIHJlYXNvbnMuam9pbignLCAnKSB8fCAnc3RhbmRhcmQgZ29hbCBwcm9ncmVzc2lvbic7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgZm9yIGdvYWwgY29tcGxldGlvbiB0cmlnZ2Vyc1xuICAgKi9cbiAgcHJpdmF0ZSBjaGVja0NvbXBsZXRpb25UcmlnZ2VycyhcbiAgICBnb2FsQ29uZmlnOiBHb2FsQ29uZmlndXJhdGlvbixcbiAgICBzdGF0ZTogQ29udmVyc2F0aW9uR29hbFN0YXRlLFxuICAgIHJlc3VsdDogR29hbE9yY2hlc3RyYXRpb25SZXN1bHRcbiAgKTogdm9pZCB7XG4gICAgXG4gICAgLy8gQ2hlY2sgY3VzdG9tIGNvbWJpbmF0aW9uc1xuICAgIGlmIChnb2FsQ29uZmlnLmNvbXBsZXRpb25UcmlnZ2Vycy5jdXN0b21Db21iaW5hdGlvbnMpIHtcbiAgICAgIGZvciAoY29uc3QgY29tYm8gb2YgZ29hbENvbmZpZy5jb21wbGV0aW9uVHJpZ2dlcnMuY3VzdG9tQ29tYmluYXRpb25zKSB7XG4gICAgICAgIGNvbnN0IGFsbENvbXBsZXRlZCA9IGNvbWJvLmdvYWxJZHMuZXZlcnkoZ29hbElkID0+IFxuICAgICAgICAgIHN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWxJZClcbiAgICAgICAgKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChhbGxDb21wbGV0ZWQgJiYgIXJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLmluY2x1ZGVzKGNvbWJvLnRyaWdnZXJJbnRlbnQpKSB7XG4gICAgICAgICAgcmVzdWx0LnRyaWdnZXJlZEludGVudHMucHVzaChjb21iby50cmlnZ2VySW50ZW50KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIGFsbCBjcml0aWNhbCBjb21wbGV0ZVxuICAgIGlmIChnb2FsQ29uZmlnLmNvbXBsZXRpb25UcmlnZ2Vycy5hbGxDcml0aWNhbENvbXBsZXRlKSB7XG4gICAgICBjb25zdCBjcml0aWNhbEdvYWxzID0gZ29hbENvbmZpZy5nb2Fscy5maWx0ZXIoZyA9PiBnLnByaW9yaXR5ID09PSAnY3JpdGljYWwnKTtcbiAgICAgIGNvbnN0IGFsbENyaXRpY2FsQ29tcGxldGUgPSBjcml0aWNhbEdvYWxzLmV2ZXJ5KGdvYWwgPT4gXG4gICAgICAgIHN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWwuaWQpXG4gICAgICApO1xuICAgICAgXG4gICAgICBpZiAoYWxsQ3JpdGljYWxDb21wbGV0ZSAmJiAhcmVzdWx0LnRyaWdnZXJlZEludGVudHMuaW5jbHVkZXMoZ29hbENvbmZpZy5jb21wbGV0aW9uVHJpZ2dlcnMuYWxsQ3JpdGljYWxDb21wbGV0ZSkpIHtcbiAgICAgICAgcmVzdWx0LnRyaWdnZXJlZEludGVudHMucHVzaChnb2FsQ29uZmlnLmNvbXBsZXRpb25UcmlnZ2Vycy5hbGxDcml0aWNhbENvbXBsZXRlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IGN1cnJlbnQgZ29hbCBzdGF0ZSBmb3IgZGVidWdnaW5nXG4gICAqL1xuICBnZXRHb2FsU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHVzZXJJZDogc3RyaW5nLCB0ZW5hbnRJZDogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZU1hbmFnZXIuZ2V0U3RhdGVTdW1tYXJ5KHNlc3Npb25JZCwgdXNlcklkLCB0ZW5hbnRJZCk7XG4gIH1cblxuICAvKipcbiAgICogUmVzZXQgZ29hbCBzdGF0ZSAoZm9yIHRlc3RpbmcpXG4gICAqL1xuICByZXNldEdvYWxTdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcsIHRlbmFudElkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnN0YXRlTWFuYWdlci5jbGVhclN0YXRlKHNlc3Npb25JZCwgdXNlcklkLCB0ZW5hbnRJZCk7XG4gIH1cbn1cbiJdfQ==