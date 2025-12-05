import type { GoalConfiguration, GoalDefinition, MessageSource, ChannelWorkflowState } from '../types/dynamodb-schemas.js';
export interface GoalRecommendation {
    goalId: string;
    goal: GoalDefinition;
    priority: number;
    reason: string;
    approach: 'direct' | 'contextual' | 'subtle';
    message: string;
    shouldPursue: boolean;
    adherenceLevel: number;
    attemptCount?: number;
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
export declare class GoalOrchestrator {
    private eventBridgeService?;
    private goalStates;
    constructor(eventBridgeService?: any);
    /**
     * Main orchestration method - analyzes message and determines goal actions
     */
    orchestrateGoals(message: string, sessionId: string, userId: string, tenantId: string, goalConfig: GoalConfiguration, conversationHistory?: string[], channel?: MessageSource, channelState?: ChannelWorkflowState): Promise<GoalOrchestrationResult>;
    /**
     * PHASE B: Extract information from message based on goal dataToCapture
     */
    private extractInformation;
    /**
     * Extract a single field value from message
     * DISABLED: All regex extraction disabled - trusting LLM via intent detection
     */
    private extractFieldValue;
    /**
     * Validate extracted field against rules
     * NOTE: Pattern validation disabled - trusting LLM to extract correct data types
     */
    private validateField;
    /**
     * Helper: Get field names from goal (supports both old and new formats)
     */
    private getFieldNames;
    /**
     * Helper: Get required field names from goal
     */
    private getRequiredFieldNames;
    /**
     * Check if a data collection goal is complete
     */
    private checkDataCollectionComplete;
    /**
     * Check for information decline signals
     */
    private processInformationDeclines;
    /**
     * PHASE A: Filter eligible goals based on triggers
     */
    private filterEligibleGoals;
    /**
     * PHASE A: Evaluate goal triggers (prerequisiteGoals, userSignals, messageCount)
     */
    private evaluateTriggers;
    /**
     * Evaluate legacy timing configuration (for backwards compatibility)
     */
    private evaluateLegacyTiming;
    /**
     * PHASE A: Sort goals by order field and importance
     */
    private sortGoalsByOrderAndImportance;
    /**
     * PHASE A: Apply global constraints (strict ordering, max goals per turn)
     */
    private applyGlobalConstraints;
    /**
     * Generate a recommendation for a goal
     */
    private generateRecommendation;
    /**
     * PHASE E: Adjust approach based on backoff strategy
     */
    private adjustApproachForBackoff;
    /**
     * Generate contextual message for goal pursuit
     */
    private generateGoalMessage;
    /**
     * Generate reason for pursuing goal
     */
    private generatePursuitReason;
    /**
     * Check for goal completion triggers (combos, etc.)
     */
    private checkCompletionTriggers;
    /**
     * Execute actions when a goal completes
     */
    executeGoalActions(goal: GoalDefinition, context: {
        tenantId: string;
        channelId?: string;
        userId: string;
        sessionId: string;
        collectedData: Record<string, any>;
    }): Promise<void>;
    /**
     * Execute a single action
     */
    private executeAction;
    /**
     * Get default event name for action type
     */
    private getDefaultEventName;
    /**
     * Get or initialize goal state
     * Now supports channel state for persistent tracking
     */
    private getOrInitState;
    /**
     * Get current goal state for debugging
     */
    getGoalState(sessionId: string, userId: string, tenantId: string): GoalState | undefined;
    /**
     * Reset goal state (for testing)
     */
    resetGoalState(sessionId: string, userId: string, tenantId: string): void;
}
