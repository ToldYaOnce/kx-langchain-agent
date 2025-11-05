export class GoalStateManager {
    states = new Map();
    /**
     * Get or create goal state for a conversation
     */
    getGoalState(sessionId, userId, tenantId) {
        const key = `${tenantId}:${userId}:${sessionId}`;
        if (!this.states.has(key)) {
            const newState = {
                sessionId,
                userId,
                tenantId,
                collectedData: {},
                activeGoals: [],
                completedGoals: [],
                declinedGoals: [],
                messageCount: 0,
                interestLevel: 'medium',
                urgencyLevel: 'normal',
                startedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
            this.states.set(key, newState);
        }
        return this.states.get(key);
    }
    /**
     * Update goal state
     */
    updateGoalState(state) {
        const key = `${state.tenantId}:${state.userId}:${state.sessionId}`;
        state.lastUpdated = new Date().toISOString();
        this.states.set(key, state);
    }
    /**
     * Increment message count and update conversation context
     */
    incrementMessage(sessionId, userId, tenantId, interestLevel, urgencyLevel) {
        const state = this.getGoalState(sessionId, userId, tenantId);
        state.messageCount++;
        if (interestLevel) {
            state.interestLevel = interestLevel;
        }
        if (urgencyLevel) {
            state.urgencyLevel = urgencyLevel;
        }
        this.updateGoalState(state);
        return state;
    }
    /**
     * Mark information as collected
     */
    collectInformation(sessionId, userId, tenantId, field, value, validated = false) {
        const state = this.getGoalState(sessionId, userId, tenantId);
        state.collectedData[field] = {
            value,
            validated,
            collectedAt: new Date().toISOString()
        };
        this.updateGoalState(state);
        return state;
    }
    /**
     * Mark a goal as completed
     */
    completeGoal(sessionId, userId, tenantId, goalId, method) {
        const state = this.getGoalState(sessionId, userId, tenantId);
        if (!state.completedGoals.includes(goalId)) {
            state.completedGoals.push(goalId);
        }
        // Remove from active goals
        state.activeGoals = state.activeGoals.filter(id => id !== goalId);
        // Track completion
        state.lastGoalAttempt = {
            goalId,
            timestamp: new Date().toISOString(),
            successful: true
        };
        this.updateGoalState(state);
        return state;
    }
    /**
     * Mark a goal as declined by user
     */
    declineGoal(sessionId, userId, tenantId, goalId) {
        const state = this.getGoalState(sessionId, userId, tenantId);
        if (!state.declinedGoals.includes(goalId)) {
            state.declinedGoals.push(goalId);
        }
        // Remove from active goals
        state.activeGoals = state.activeGoals.filter(id => id !== goalId);
        // Track decline
        state.lastGoalAttempt = {
            goalId,
            timestamp: new Date().toISOString(),
            successful: false
        };
        this.updateGoalState(state);
        return state;
    }
    /**
     * Activate a goal for pursuit
     */
    activateGoal(sessionId, userId, tenantId, goalId) {
        const state = this.getGoalState(sessionId, userId, tenantId);
        if (!state.activeGoals.includes(goalId) &&
            !state.completedGoals.includes(goalId)) {
            state.activeGoals.push(goalId);
        }
        this.updateGoalState(state);
        return state;
    }
    /**
     * Check if a goal condition is met
     */
    evaluateCondition(state, condition) {
        switch (condition.type) {
            case 'message_count':
                return this.compareValues(state.messageCount, condition.operator, condition.value);
            case 'interest_level':
                const interestValues = { low: 1, medium: 2, high: 3 };
                const currentInterest = interestValues[state.interestLevel];
                const targetInterest = typeof condition.value === 'string'
                    ? interestValues[condition.value]
                    : condition.value;
                return this.compareValues(currentInterest, condition.operator, targetInterest);
            case 'urgency_level':
                const urgencyValues = { casual: 1, normal: 2, urgent: 3 };
                const currentUrgency = urgencyValues[state.urgencyLevel];
                const targetUrgency = typeof condition.value === 'string'
                    ? urgencyValues[condition.value]
                    : condition.value;
                return this.compareValues(currentUrgency, condition.operator, targetUrgency);
            case 'has_info':
                const hasInfo = String(condition.value) in state.collectedData;
                return condition.operator === 'equals' ? hasInfo : !hasInfo;
            case 'time_elapsed':
                const startTime = new Date(state.startedAt).getTime();
                const now = new Date().getTime();
                const elapsed = (now - startTime) / (1000 * 60); // minutes
                return this.compareValues(elapsed, condition.operator, condition.value);
            default:
                return false;
        }
    }
    /**
     * Helper method to compare values based on operator
     */
    compareValues(actual, operator, expected) {
        switch (operator) {
            case 'equals':
                return actual === expected;
            case 'greater_than':
                return actual > expected;
            case 'less_than':
                return actual < expected;
            case 'contains':
                return String(actual).toLowerCase().includes(String(expected).toLowerCase());
            case 'not_contains':
                return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
            default:
                return false;
        }
    }
    /**
     * Check if user has all required information for lead generation
     */
    isLeadComplete(state, requiredFields = ['email', 'phone', 'fullName']) {
        return requiredFields.every(field => field in state.collectedData &&
            state.collectedData[field].validated !== false);
    }
    /**
     * Get summary of goal state for debugging
     */
    getStateSummary(sessionId, userId, tenantId) {
        const state = this.getGoalState(sessionId, userId, tenantId);
        return {
            messageCount: state.messageCount,
            interestLevel: state.interestLevel,
            urgencyLevel: state.urgencyLevel,
            collectedFields: Object.keys(state.collectedData),
            activeGoals: state.activeGoals,
            completedGoals: state.completedGoals,
            declinedGoals: state.declinedGoals,
            isLeadComplete: this.isLeadComplete(state),
            sessionAge: Math.round((new Date().getTime() - new Date(state.startedAt).getTime()) / (1000 * 60)) + ' minutes'
        };
    }
    /**
     * Clear state (for testing or session reset)
     */
    clearState(sessionId, userId, tenantId) {
        const key = `${tenantId}:${userId}:${sessionId}`;
        this.states.delete(key);
    }
    /**
     * Get all active states (for monitoring/debugging)
     */
    getAllStates() {
        return Array.from(this.states.values());
    }
}
//# sourceMappingURL=goal-state-manager.js.map