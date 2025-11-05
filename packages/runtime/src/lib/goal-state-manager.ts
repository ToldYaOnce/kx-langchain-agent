import type { 
  ConversationGoalState, 
  ConversationGoal, 
  GoalConfiguration,
  GoalCondition 
} from '../types/goals.js';

export class GoalStateManager {
  private states: Map<string, ConversationGoalState> = new Map();

  /**
   * Get or create goal state for a conversation
   */
  getGoalState(sessionId: string, userId: string, tenantId: string): ConversationGoalState {
    const key = `${tenantId}:${userId}:${sessionId}`;
    
    if (!this.states.has(key)) {
      const newState: ConversationGoalState = {
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

    return this.states.get(key)!;
  }

  /**
   * Update goal state
   */
  updateGoalState(state: ConversationGoalState): void {
    const key = `${state.tenantId}:${state.userId}:${state.sessionId}`;
    state.lastUpdated = new Date().toISOString();
    this.states.set(key, state);
  }

  /**
   * Increment message count and update conversation context
   */
  incrementMessage(
    sessionId: string, 
    userId: string, 
    tenantId: string,
    interestLevel?: 'high' | 'medium' | 'low',
    urgencyLevel?: 'urgent' | 'normal' | 'casual'
  ): ConversationGoalState {
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
  collectInformation(
    sessionId: string,
    userId: string, 
    tenantId: string,
    field: string,
    value: any,
    validated: boolean = false
  ): ConversationGoalState {
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
  completeGoal(
    sessionId: string,
    userId: string,
    tenantId: string,
    goalId: string,
    method?: string
  ): ConversationGoalState {
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
  declineGoal(
    sessionId: string,
    userId: string,
    tenantId: string,
    goalId: string
  ): ConversationGoalState {
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
  activateGoal(
    sessionId: string,
    userId: string,
    tenantId: string,
    goalId: string
  ): ConversationGoalState {
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
  evaluateCondition(state: ConversationGoalState, condition: GoalCondition): boolean {
    switch (condition.type) {
      case 'message_count':
        return this.compareValues(state.messageCount, condition.operator, condition.value);
        
      case 'interest_level':
        const interestValues = { low: 1, medium: 2, high: 3 };
        const currentInterest = interestValues[state.interestLevel];
        const targetInterest = typeof condition.value === 'string' 
          ? interestValues[condition.value as keyof typeof interestValues]
          : condition.value;
        return this.compareValues(currentInterest, condition.operator, targetInterest);
        
      case 'urgency_level':
        const urgencyValues = { casual: 1, normal: 2, urgent: 3 };
        const currentUrgency = urgencyValues[state.urgencyLevel];
        const targetUrgency = typeof condition.value === 'string'
          ? urgencyValues[condition.value as keyof typeof urgencyValues]
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
  private compareValues(actual: any, operator: string, expected: any): boolean {
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
  isLeadComplete(state: ConversationGoalState, requiredFields: string[] = ['email', 'phone', 'fullName']): boolean {
    return requiredFields.every(field => 
      field in state.collectedData && 
      state.collectedData[field].validated !== false
    );
  }

  /**
   * Get summary of goal state for debugging
   */
  getStateSummary(sessionId: string, userId: string, tenantId: string): any {
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
  clearState(sessionId: string, userId: string, tenantId: string): void {
    const key = `${tenantId}:${userId}:${sessionId}`;
    this.states.delete(key);
  }

  /**
   * Get all active states (for monitoring/debugging)
   */
  getAllStates(): ConversationGoalState[] {
    return Array.from(this.states.values());
  }
}
