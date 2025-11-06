import type { ConversationGoal, GoalConfiguration } from '../types/goals.js';
import { type InterestAnalysis } from './interest-detector.js';
import { type ExtractedInfo } from './info-extractor.js';
export interface GoalRecommendation {
    goalId: string;
    goal: ConversationGoal;
    priority: number;
    reason: string;
    approach: 'direct' | 'contextual' | 'subtle';
    message: string;
    shouldPursue: boolean;
}
export interface GoalOrchestrationResult {
    recommendations: GoalRecommendation[];
    extractedInfo: ExtractedInfo;
    interestAnalysis: InterestAnalysis;
    stateUpdates: {
        newlyCompleted: string[];
        newlyActivated: string[];
        declined: string[];
    };
    triggeredIntents: string[];
}
export declare class GoalOrchestrator {
    private stateManager;
    private interestDetector;
    private infoExtractor;
    constructor();
    /**
     * Main orchestration method - analyzes message and determines goal actions
     */
    orchestrateGoals(message: string, sessionId: string, userId: string, tenantId: string, goalConfig: GoalConfiguration, conversationHistory?: string[]): Promise<GoalOrchestrationResult>;
    /**
     * Process any information extracted from the user's message
     */
    private processExtractedInfo;
    /**
     * Check if user is declining to provide information
     */
    private processInformationDeclines;
    /**
     * Generate recommendations for which goals to pursue
     */
    private generateRecommendations;
    /**
     * Check if goal dependencies are satisfied
     */
    private checkGoalDependencies;
    /**
     * Check if goal timing conditions are met
     */
    private checkGoalTiming;
    /**
     * Evaluate a goal trigger
     */
    private evaluateTrigger;
    /**
     * Sort goals by priority and current context
     */
    private sortGoalsByPriority;
    /**
     * Evaluate a specific goal and create recommendation
     */
    private evaluateGoal;
    /**
     * Generate contextual message for goal pursuit
     */
    private generateGoalMessage;
    /**
     * Determine if we should pursue a goal right now
     */
    private shouldPursueGoal;
    /**
     * Generate reason for goal pursuit decision
     */
    private generatePursuitReason;
    /**
     * Check for goal completion triggers
     */
    private checkCompletionTriggers;
    /**
     * Get current goal state for debugging
     */
    getGoalState(sessionId: string, userId: string, tenantId: string): any;
    /**
     * Reset goal state (for testing)
     */
    resetGoalState(sessionId: string, userId: string, tenantId: string): void;
}
