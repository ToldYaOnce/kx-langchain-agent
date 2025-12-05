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
export class GoalConfigHelper {
  /**
   * Determine which goal configuration to use
   * Priority: Company-level > Persona-level > None
   */
  static getEffectiveConfig(
    companyInfo: CompanyInfo | undefined,
    persona: AgentPersona
  ): EffectiveGoalConfig {
    // Default global settings
    const defaultGlobalSettings = {
      maxActiveGoals: 3,
      respectDeclines: true,
      adaptToUrgency: true,
      interestThreshold: 5,
      strictOrdering: 7,
      maxGoalsPerTurn: 2
    };
    
    // Default completion triggers
    const defaultCompletionTriggers = {
      allCriticalComplete: 'lead_qualified'
    };
    
    // Check company-level goals first
    const companyGoalConfig = (companyInfo as any)?.goalConfiguration;
    
    if (companyGoalConfig?.enabled && companyGoalConfig.goals?.length > 0) {
      return {
        ...companyGoalConfig,
        globalSettings: {
          ...defaultGlobalSettings,
          ...companyGoalConfig.globalSettings
        },
        completionTriggers: {
          ...defaultCompletionTriggers,
          ...companyGoalConfig.completionTriggers
        },
        source: 'company'
      };
    }
    
    // Fall back to persona-level goals
    if (persona.goalConfiguration?.enabled && persona.goalConfiguration.goals?.length > 0) {
      return {
        ...persona.goalConfiguration,
        globalSettings: {
          ...defaultGlobalSettings,
          ...persona.goalConfiguration.globalSettings
        },
        completionTriggers: {
          ...defaultCompletionTriggers,
          ...persona.goalConfiguration.completionTriggers
        },
        source: 'persona'
      };
    }
    
    // No goals configured
    return {
      enabled: false,
      goals: [],
      globalSettings: defaultGlobalSettings,
      completionTriggers: defaultCompletionTriggers,
      source: 'none'
    };
  }

  /**
   * Check if goal orchestration is enabled
   */
  static isEnabled(effectiveConfig: EffectiveGoalConfig): boolean {
    return effectiveConfig.enabled && effectiveConfig.goals.length > 0;
  }

  /**
   * Get human-readable source description
   */
  static getSourceDescription(effectiveConfig: EffectiveGoalConfig): string {
    switch (effectiveConfig.source) {
      case 'company':
        return 'company-level';
      case 'persona':
        return 'persona-level';
      case 'none':
        return 'none';
      default:
        return 'unknown';
    }
  }

  /**
   * Find a specific goal by ID (supports both full IDs and short names)
   */
  static findGoal(
    goalConfig: GoalConfig,
    goalId: string
  ): any | undefined {
    return goalConfig.goals.find((g: any) => 
      g.id === goalId || g.id.startsWith(goalId + '_')
    );
  }

  /**
   * Find multiple goals by IDs
   */
  static findGoals(
    goalConfig: GoalConfig,
    goalIds: string[]
  ): any[] {
    return goalIds
      .map(id => this.findGoal(goalConfig, id))
      .filter(Boolean);
  }

  /**
   * Get the most urgent active goal based on priority and order
   */
  static getMostUrgentGoal(
    activeGoalIds: string[],
    goalConfig: GoalConfig
  ): any | undefined {
    if (activeGoalIds.length === 0) {
      return undefined;
    }

    const activeGoalDefinitions = this.findGoals(goalConfig, activeGoalIds);
    
    if (activeGoalDefinitions.length === 0) {
      return undefined;
    }

    // Check if strict ordering is enabled
    const strictOrdering = goalConfig.globalSettings?.strictOrdering ?? 7;
    
    if (strictOrdering === 0) {
      // Always-active mode: sort by priority (desc) then order (asc)
      return activeGoalDefinitions.sort((a: any, b: any) => {
        const priorityOrder = this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority);
        if (priorityOrder !== 0) return priorityOrder;
        return (a.order || 0) - (b.order || 0);
      })[0];
    } else {
      // Strict ordering mode: just take the first active goal (lowest order)
      return activeGoalDefinitions.sort((a: any, b: any) => 
        (a.order || 0) - (b.order || 0)
      )[0];
    }
  }

  /**
   * Convert priority string to numeric value for sorting
   */
  private static getPriorityValue(priority: string | undefined): number {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 2; // Default to medium
    }
  }

  /**
   * Check if a goal requires specific data fields
   */
  static getRequiredFields(goal: any): string[] {
    if (!goal?.dataToCapture?.fields) {
      return [];
    }
    
    if (Array.isArray(goal.dataToCapture.fields)) {
      return goal.dataToCapture.fields;
    }
    
    return [];
  }

  /**
   * Check if all required fields for a goal are captured
   */
  static isGoalComplete(
    goal: any,
    capturedData: Record<string, any>
  ): boolean {
    const requiredFields = this.getRequiredFields(goal);
    
    if (requiredFields.length === 0) {
      return false; // No fields defined, can't be complete
    }

    // Check validation rules if they exist
    const validationRules = goal.dataToCapture?.validationRules || {};
    
    return requiredFields.every(field => {
      const rule = validationRules[field];
      const value = capturedData[field];
      
      // If field is not required and not present, that's OK
      if (rule?.required === false && !value) {
        return true;
      }
      
      // Otherwise, field must exist and have a value
      return value !== undefined && value !== null && value !== '';
    });
  }

  /**
   * Get goal type (data_collection, scheduling, etc.)
   */
  static getGoalType(goal: any): string {
    return goal?.type || 'data_collection';
  }

  /**
   * Check if strict ordering is enabled
   */
  static isStrictOrderingEnabled(goalConfig: GoalConfig): boolean {
    const strictOrdering = goalConfig.globalSettings?.strictOrdering ?? 7;
    return strictOrdering >= 7;
  }

  /**
   * Check if always-active mode is enabled
   */
  static isAlwaysActiveMode(goalConfig: GoalConfig): boolean {
    const strictOrdering = goalConfig.globalSettings?.strictOrdering ?? 7;
    return strictOrdering === 0;
  }

  /**
   * Get max active goals setting
   */
  static getMaxActiveGoals(goalConfig: GoalConfig): number {
    return goalConfig.globalSettings?.maxActiveGoals ?? 3;
  }

  /**
   * Get max goals per turn setting
   */
  static getMaxGoalsPerTurn(goalConfig: GoalConfig): number {
    return goalConfig.globalSettings?.maxGoalsPerTurn ?? 2;
  }

  /**
   * Format goal for logging (concise representation)
   */
  static formatGoalForLog(goal: any): any {
    return {
      id: goal.id,
      name: goal.name,
      type: this.getGoalType(goal),
      priority: goal.priority || 'medium',
      order: goal.order || 0,
      fields: this.getRequiredFields(goal)
    };
  }

  /**
   * Format multiple goals for logging
   */
  static formatGoalsForLog(goals: any[]): any[] {
    return goals.map(g => this.formatGoalForLog(g));
  }
}

