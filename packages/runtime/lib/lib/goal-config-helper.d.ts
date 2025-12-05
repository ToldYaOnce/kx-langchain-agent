/**
 * Goal Configuration Helper
 *
 * Utilities for managing goal configuration resolution and processing.
 * Handles prioritization between company-level and persona-level goals.
 */
import type { AgentPersona } from '../config/personas.js';
import type { CompanyInfo } from './persona-service.js';
export interface GoalConfig {
    enabled: boolean;
    goals: any[];
    globalSettings: {
        maxActiveGoals: number;
        respectDeclines: boolean;
        adaptToUrgency: boolean;
        interestThreshold: number;
        strictOrdering?: number;
        maxGoalsPerTurn?: number;
    };
    completionTriggers: {
        allCriticalComplete: string;
        channelSpecific?: Record<string, {
            goalIds: string[];
            triggerIntent: string;
            description: string;
        }>;
        customCombinations?: Array<{
            goalIds: string[];
            triggerIntent: string;
            description: string;
        }>;
    };
}
export interface EffectiveGoalConfig extends GoalConfig {
    source: 'company' | 'persona' | 'none';
}
/**
 * Helper for managing goal configuration
 */
export declare class GoalConfigHelper {
    /**
     * Determine which goal configuration to use
     * Priority: Company-level > Persona-level > None
     */
    static getEffectiveConfig(companyInfo: CompanyInfo | undefined, persona: AgentPersona): EffectiveGoalConfig;
    /**
     * Check if goal orchestration is enabled
     */
    static isEnabled(effectiveConfig: EffectiveGoalConfig): boolean;
    /**
     * Get human-readable source description
     */
    static getSourceDescription(effectiveConfig: EffectiveGoalConfig): string;
    /**
     * Find a specific goal by ID (supports both full IDs and short names)
     */
    static findGoal(goalConfig: GoalConfig, goalId: string): any | undefined;
    /**
     * Find multiple goals by IDs
     */
    static findGoals(goalConfig: GoalConfig, goalIds: string[]): any[];
    /**
     * Get the most urgent active goal based on priority and order
     */
    static getMostUrgentGoal(activeGoalIds: string[], goalConfig: GoalConfig): any | undefined;
    /**
     * Convert priority string to numeric value for sorting
     */
    private static getPriorityValue;
    /**
     * Check if a goal requires specific data fields
     */
    static getRequiredFields(goal: any): string[];
    /**
     * Check if all required fields for a goal are captured
     */
    static isGoalComplete(goal: any, capturedData: Record<string, any>): boolean;
    /**
     * Get goal type (data_collection, scheduling, etc.)
     */
    static getGoalType(goal: any): string;
    /**
     * Check if strict ordering is enabled
     */
    static isStrictOrderingEnabled(goalConfig: GoalConfig): boolean;
    /**
     * Check if always-active mode is enabled
     */
    static isAlwaysActiveMode(goalConfig: GoalConfig): boolean;
    /**
     * Get max active goals setting
     */
    static getMaxActiveGoals(goalConfig: GoalConfig): number;
    /**
     * Get max goals per turn setting
     */
    static getMaxGoalsPerTurn(goalConfig: GoalConfig): number;
    /**
     * Format goal for logging (concise representation)
     */
    static formatGoalForLog(goal: any): any;
    /**
     * Format multiple goals for logging
     */
    static formatGoalsForLog(goals: any[]): any[];
}
