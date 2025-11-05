import type { ConversationGoalState, GoalCondition } from '../types/goals.js';
export declare class GoalStateManager {
    private states;
    /**
     * Get or create goal state for a conversation
     */
    getGoalState(sessionId: string, userId: string, tenantId: string): ConversationGoalState;
    /**
     * Update goal state
     */
    updateGoalState(state: ConversationGoalState): void;
    /**
     * Increment message count and update conversation context
     */
    incrementMessage(sessionId: string, userId: string, tenantId: string, interestLevel?: 'high' | 'medium' | 'low', urgencyLevel?: 'urgent' | 'normal' | 'casual'): ConversationGoalState;
    /**
     * Mark information as collected
     */
    collectInformation(sessionId: string, userId: string, tenantId: string, field: string, value: any, validated?: boolean): ConversationGoalState;
    /**
     * Mark a goal as completed
     */
    completeGoal(sessionId: string, userId: string, tenantId: string, goalId: string, method?: string): ConversationGoalState;
    /**
     * Mark a goal as declined by user
     */
    declineGoal(sessionId: string, userId: string, tenantId: string, goalId: string): ConversationGoalState;
    /**
     * Activate a goal for pursuit
     */
    activateGoal(sessionId: string, userId: string, tenantId: string, goalId: string): ConversationGoalState;
    /**
     * Check if a goal condition is met
     */
    evaluateCondition(state: ConversationGoalState, condition: GoalCondition): boolean;
    /**
     * Helper method to compare values based on operator
     */
    private compareValues;
    /**
     * Check if user has all required information for lead generation
     */
    isLeadComplete(state: ConversationGoalState, requiredFields?: string[]): boolean;
    /**
     * Get summary of goal state for debugging
     */
    getStateSummary(sessionId: string, userId: string, tenantId: string): any;
    /**
     * Clear state (for testing or session reset)
     */
    clearState(sessionId: string, userId: string, tenantId: string): void;
    /**
     * Get all active states (for monitoring/debugging)
     */
    getAllStates(): ConversationGoalState[];
}
//# sourceMappingURL=goal-state-manager.d.ts.map