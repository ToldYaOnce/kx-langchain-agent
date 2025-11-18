export type GoalType = 'collect_info' | 'validate_info' | 'schedule_appointment' | 'trigger_intent' | 'custom';
export type GoalPriority = 'critical' | 'high' | 'medium' | 'low';
export type GoalTiming = 'immediate' | 'early' | 'mid_conversation' | 'late' | 'conditional';
export interface GoalCondition {
    type: 'message_count' | 'interest_level' | 'urgency_level' | 'has_info' | 'time_elapsed' | 'intent_detected';
    operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains';
    value: string | number | boolean;
}
export interface GoalTrigger {
    conditions: GoalCondition[];
    logic: 'AND' | 'OR';
}
export interface ConversationGoal {
    id: string;
    name: string;
    description: string;
    type: GoalType;
    priority: GoalPriority;
    target: {
        field?: string;
        intent?: string;
        action?: string;
        validation?: {
            pattern?: string;
            required?: boolean;
            format?: 'email' | 'phone' | 'name' | 'date' | 'custom';
        };
    };
    timing: {
        strategy: GoalTiming;
        minMessages?: number;
        maxMessages?: number;
        triggers?: GoalTrigger[];
        cooldown?: number;
    };
    approach: {
        directness: 'subtle' | 'moderate' | 'direct';
        contextual: boolean;
        valueProposition?: string;
        fallbackStrategies?: string[];
    };
    completion: {
        markComplete: boolean;
        triggerIntent?: string;
        nextGoals?: string[];
        response?: string;
    };
    dependencies?: {
        requires?: string[];
        blocks?: string[];
        mutuallyExclusive?: string[];
    };
    tracking: {
        attempts: number;
        lastAttempt?: string;
        completed: boolean;
        completedAt?: string;
        declinedCount: number;
        method?: string;
    };
}
export interface GoalConfiguration {
    enabled: boolean;
    goals: ConversationGoal[];
    globalSettings: {
        maxActiveGoals: number;
        respectDeclines: boolean;
        adaptToUrgency: boolean;
        interestThreshold: number;
    };
    completionTriggers: {
        allCriticalComplete?: string;
        allHighComplete?: string;
        customCombinations?: Array<{
            goalIds: string[];
            triggerIntent: string;
            description: string;
        }>;
    };
}
export interface ConversationGoalState {
    sessionId: string;
    userId: string;
    tenantId: string;
    collectedData: Record<string, any>;
    activeGoals: string[];
    completedGoals: string[];
    declinedGoals: string[];
    messageCount: number;
    interestLevel: 'high' | 'medium' | 'low';
    urgencyLevel: 'urgent' | 'normal' | 'casual';
    lastGoalAttempt?: {
        goalId: string;
        timestamp: string;
        successful: boolean;
    };
    startedAt: string;
    lastUpdated: string;
}
//# sourceMappingURL=goals.d.ts.map