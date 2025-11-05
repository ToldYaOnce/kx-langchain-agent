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
  logic: 'AND' | 'OR'; // How to combine multiple conditions
}

export interface ConversationGoal {
  id: string;
  name: string;
  description: string;
  type: GoalType;
  priority: GoalPriority;
  
  // What information to collect or action to take
  target: {
    field?: string; // For collect_info: 'email', 'phone', 'firstName', etc.
    intent?: string; // For trigger_intent: 'lead_generated', 'schedule_class', etc.
    action?: string; // For custom goals
    validation?: {
      pattern?: string; // Regex pattern for validation
      required?: boolean;
      format?: 'email' | 'phone' | 'name' | 'date' | 'custom';
    };
  };
  
  // When to pursue this goal
  timing: {
    strategy: GoalTiming;
    minMessages?: number; // Don't ask before this many messages
    maxMessages?: number; // Must ask by this many messages
    triggers?: GoalTrigger[]; // Conditional triggers
    cooldown?: number; // Minutes to wait before asking again if declined
  };
  
  // How to pursue this goal
  approach: {
    directness: 'subtle' | 'moderate' | 'direct';
    contextual: boolean; // Tie request to current conversation context
    valueProposition?: string; // Why they should provide this info
    fallbackStrategies?: string[]; // Alternative approaches if first attempt fails
  };
  
  // What happens when goal is completed
  completion: {
    markComplete: boolean;
    triggerIntent?: string; // Intent to trigger when this goal is met
    nextGoals?: string[]; // Goal IDs to activate after this one
    response?: string; // Optional response template when goal is achieved
  };
  
  // Dependencies and prerequisites
  dependencies?: {
    requires?: string[]; // Goal IDs that must be completed first
    blocks?: string[]; // Goal IDs that this goal prevents
    mutuallyExclusive?: string[]; // Goal IDs that can't be active at same time
  };
  
  // Tracking and analytics
  tracking: {
    attempts: number;
    lastAttempt?: string; // ISO timestamp
    completed: boolean;
    completedAt?: string; // ISO timestamp
    declinedCount: number;
    method?: string; // How the goal was achieved
  };
}

export interface GoalConfiguration {
  enabled: boolean;
  goals: ConversationGoal[];
  globalSettings: {
    maxActiveGoals: number; // How many goals to pursue simultaneously
    respectDeclines: boolean; // Stop asking if user declines
    adaptToUrgency: boolean; // Adjust timing based on user urgency
    interestThreshold: number; // 0-1 scale, minimum interest to pursue goals
  };
  completionTriggers: {
    allCriticalComplete?: string; // Intent to trigger when all critical goals done
    allHighComplete?: string; // Intent to trigger when all high priority goals done
    customCombinations?: Array<{
      goalIds: string[];
      triggerIntent: string;
      description: string;
    }>;
  };
}

// State tracking for active conversation
export interface ConversationGoalState {
  sessionId: string;
  userId: string;
  tenantId: string;
  
  // Collected information
  collectedData: Record<string, any>;
  
  // Goal tracking
  activeGoals: string[]; // Currently pursuing these goal IDs
  completedGoals: string[]; // Successfully completed goal IDs
  declinedGoals: string[]; // User declined these goal IDs
  
  // Conversation context
  messageCount: number;
  interestLevel: 'high' | 'medium' | 'low';
  urgencyLevel: 'urgent' | 'normal' | 'casual';
  lastGoalAttempt?: {
    goalId: string;
    timestamp: string;
    successful: boolean;
  };
  
  // Session metadata
  startedAt: string;
  lastUpdated: string;
}
