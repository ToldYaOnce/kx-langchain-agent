"use strict";
/**
 * Goal Configuration Helper
 *
 * Utilities for managing goal configuration resolution and processing.
 * Handles prioritization between company-level and persona-level goals.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalConfigHelper = void 0;
/**
 * Helper for managing goal configuration
 */
class GoalConfigHelper {
    /**
     * Determine which goal configuration to use
     * Priority: Company-level > Persona-level > None
     */
    static getEffectiveConfig(companyInfo, persona) {
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
        const companyGoalConfig = companyInfo?.goalConfiguration;
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
    static isEnabled(effectiveConfig) {
        return effectiveConfig.enabled && effectiveConfig.goals.length > 0;
    }
    /**
     * Get human-readable source description
     */
    static getSourceDescription(effectiveConfig) {
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
    static findGoal(goalConfig, goalId) {
        return goalConfig.goals.find((g) => g.id === goalId || g.id.startsWith(goalId + '_'));
    }
    /**
     * Find multiple goals by IDs
     */
    static findGoals(goalConfig, goalIds) {
        return goalIds
            .map(id => this.findGoal(goalConfig, id))
            .filter(Boolean);
    }
    /**
     * Get the most urgent active goal based on priority and order
     */
    static getMostUrgentGoal(activeGoalIds, goalConfig) {
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
            return activeGoalDefinitions.sort((a, b) => {
                const priorityOrder = this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority);
                if (priorityOrder !== 0)
                    return priorityOrder;
                return (a.order || 0) - (b.order || 0);
            })[0];
        }
        else {
            // Strict ordering mode: just take the first active goal (lowest order)
            return activeGoalDefinitions.sort((a, b) => (a.order || 0) - (b.order || 0))[0];
        }
    }
    /**
     * Convert priority string to numeric value for sorting
     */
    static getPriorityValue(priority) {
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
    static getRequiredFields(goal) {
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
    static isGoalComplete(goal, capturedData) {
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
    static getGoalType(goal) {
        return goal?.type || 'data_collection';
    }
    /**
     * Check if strict ordering is enabled
     */
    static isStrictOrderingEnabled(goalConfig) {
        const strictOrdering = goalConfig.globalSettings?.strictOrdering ?? 7;
        return strictOrdering >= 7;
    }
    /**
     * Check if always-active mode is enabled
     */
    static isAlwaysActiveMode(goalConfig) {
        const strictOrdering = goalConfig.globalSettings?.strictOrdering ?? 7;
        return strictOrdering === 0;
    }
    /**
     * Get max active goals setting
     */
    static getMaxActiveGoals(goalConfig) {
        return goalConfig.globalSettings?.maxActiveGoals ?? 3;
    }
    /**
     * Get max goals per turn setting
     */
    static getMaxGoalsPerTurn(goalConfig) {
        return goalConfig.globalSettings?.maxGoalsPerTurn ?? 2;
    }
    /**
     * Format goal for logging (concise representation)
     */
    static formatGoalForLog(goal) {
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
    static formatGoalsForLog(goals) {
        return goals.map(g => this.formatGoalForLog(g));
    }
}
exports.GoalConfigHelper = GoalConfigHelper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ29hbC1jb25maWctaGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9nb2FsLWNvbmZpZy1oZWxwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOzs7QUFtQ0g7O0dBRUc7QUFDSCxNQUFhLGdCQUFnQjtJQUMzQjs7O09BR0c7SUFDSCxNQUFNLENBQUMsa0JBQWtCLENBQ3ZCLFdBQW9DLEVBQ3BDLE9BQXFCO1FBRXJCLDBCQUEwQjtRQUMxQixNQUFNLHFCQUFxQixHQUFHO1lBQzVCLGNBQWMsRUFBRSxDQUFDO1lBQ2pCLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsY0FBYyxFQUFFLENBQUM7WUFDakIsZUFBZSxFQUFFLENBQUM7U0FDbkIsQ0FBQztRQUVGLDhCQUE4QjtRQUM5QixNQUFNLHlCQUF5QixHQUFHO1lBQ2hDLG1CQUFtQixFQUFFLGdCQUFnQjtTQUN0QyxDQUFDO1FBRUYsa0NBQWtDO1FBQ2xDLE1BQU0saUJBQWlCLEdBQUksV0FBbUIsRUFBRSxpQkFBaUIsQ0FBQztRQUVsRSxJQUFJLGlCQUFpQixFQUFFLE9BQU8sSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RFLE9BQU87Z0JBQ0wsR0FBRyxpQkFBaUI7Z0JBQ3BCLGNBQWMsRUFBRTtvQkFDZCxHQUFHLHFCQUFxQjtvQkFDeEIsR0FBRyxpQkFBaUIsQ0FBQyxjQUFjO2lCQUNwQztnQkFDRCxrQkFBa0IsRUFBRTtvQkFDbEIsR0FBRyx5QkFBeUI7b0JBQzVCLEdBQUcsaUJBQWlCLENBQUMsa0JBQWtCO2lCQUN4QztnQkFDRCxNQUFNLEVBQUUsU0FBUzthQUNsQixDQUFDO1FBQ0osQ0FBQztRQUVELG1DQUFtQztRQUNuQyxJQUFJLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLElBQUksT0FBTyxD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KipcclxuICogR29hbCBDb25maWd1cmF0aW9uIEhlbHBlclxyXG4gKiBcclxuICogVXRpbGl0aWVzIGZvciBtYW5hZ2luZyBnb2FsIGNvbmZpZ3VyYXRpb24gcmVzb2x1dGlvbiBhbmQgcHJvY2Vzc2luZy5cclxuICogSGFuZGxlcyBwcmlvcml0aXphdGlvbiBiZXR3ZWVuIGNvbXBhbnktbGV2ZWwgYW5kIHBlcnNvbmEtbGV2ZWwgZ29hbHMuXHJcbiAqL1xyXG5cclxuaW1wb3J0IHR5cGUgeyBBZ2VudFBlcnNvbmEgfSBmcm9tICcuLi9jb25maWcvcGVyc29uYXMuanMnO1xyXG5pbXBvcnQgdHlwZSB7IENvbXBhbnlJbmZvIH0gZnJvbSAnLi9wZXJzb25hLXNlcnZpY2UuanMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBHb2FsQ29uZmlnIHtcclxuICBlbmFibGVkOiBib29sZWFuO1xyXG4gIGdvYWxzOiBhbnlbXTtcclxuICBnbG9iYWxTZXR0aW5nczoge1xyXG4gICAgbWF4QWN0aXZlR29hbHM6IG51bWJlcjtcclxuICAgIHJlc3BlY3REZWNsaW5lczogYm9vbGVhbjtcclxuICAgIGFkYXB0VG9VcmdlbmN5OiBib29sZWFuO1xyXG4gICAgaW50ZXJlc3RUaHJlc2hvbGQ6IG51bWJlcjtcclxuICAgIHN0cmljdE9yZGVyaW5nPzogbnVtYmVyO1xyXG4gICAgbWF4R29hbHNQZXJUdXJuPzogbnVtYmVyO1xyXG4gIH07XHJcbiAgY29tcGxldGlvblRyaWdnZXJzOiB7XHJcbiAgICBhbGxDcml0aWNhbENvbXBsZXRlOiBzdHJpbmc7XHJcbiAgICBjaGFubmVsU3BlY2lmaWM/OiBSZWNvcmQ8c3RyaW5nLCB7XHJcbiAgICAgIGdvYWxJZHM6IHN0cmluZ1tdO1xyXG4gICAgICB0cmlnZ2VySW50ZW50OiBzdHJpbmc7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgICB9PjtcclxuICAgIGN1c3RvbUNvbWJpbmF0aW9ucz86IEFycmF5PHtcclxuICAgICAgZ29hbElkczogc3RyaW5nW107XHJcbiAgICAgIHRyaWdnZXJJbnRlbnQ6IHN0cmluZztcclxuICAgICAgZGVzY3JpcHRpb246IHN0cmluZztcclxuICAgIH0+O1xyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRWZmZWN0aXZlR29hbENvbmZpZyBleHRlbmRzIEdvYWxDb25maWcge1xyXG4gIHNvdXJjZTogJ2NvbXBhbnknIHwgJ3BlcnNvbmEnIHwgJ25vbmUnO1xyXG59XHJcblxyXG4vKipcclxuICogSGVscGVyIGZvciBtYW5hZ2luZyBnb2FsIGNvbmZpZ3VyYXRpb25cclxuICovXHJcbmV4cG9ydCBjbGFzcyBHb2FsQ29uZmlnSGVscGVyIHtcclxuICAvKipcclxuICAgKiBEZXRlcm1pbmUgd2hpY2ggZ29hbCBjb25maWd1cmF0aW9uIHRvIHVzZVxyXG4gICAqIFByaW9yaXR5OiBDb21wYW55LWxldmVsID4gUGVyc29uYS1sZXZlbCA+IE5vbmVcclxuICAgKi9cclxuICBzdGF0aWMgZ2V0RWZmZWN0aXZlQ29uZmlnKFxyXG4gICAgY29tcGFueUluZm86IENvbXBhbnlJbmZvIHwgdW5kZWZpbmVkLFxyXG4gICAgcGVyc29uYTogQWdlbnRQZXJzb25hXHJcbiAgKTogRWZmZWN0aXZlR29hbENvbmZpZyB7XHJcbiAgICAvLyBEZWZhdWx0IGdsb2JhbCBzZXR0aW5nc1xyXG4gICAgY29uc3QgZGVmYXVsdEdsb2JhbFNldHRpbmdzID0ge1xyXG4gICAgICBtYXhBY3RpdmVHb2FsczogMyxcclxuICAgICAgcmVzcGVjdERlY2xpbmVzOiB0cnVlLFxyXG4gICAgICBhZGFwdFRvVXJnZW5jeTogdHJ1ZSxcclxuICAgICAgaW50ZXJlc3RUaHJlc2hvbGQ6IDUsXHJcbiAgICAgIHN0cmljdE9yZGVyaW5nOiA3LFxyXG4gICAgICBtYXhHb2Fsc1BlclR1cm46IDJcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIERlZmF1bHQgY29tcGxldGlvbiB0cmlnZ2Vyc1xyXG4gICAgY29uc3QgZGVmYXVsdENvbXBsZXRpb25UcmlnZ2VycyA9IHtcclxuICAgICAgYWxsQ3JpdGljYWxDb21wbGV0ZTogJ2xlYWRfcXVhbGlmaWVkJ1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgY29tcGFueS1sZXZlbCBnb2FscyBmaXJzdFxyXG4gICAgY29uc3QgY29tcGFueUdvYWxDb25maWcgPSAoY29tcGFueUluZm8gYXMgYW55KT8uZ29hbENvbmZpZ3VyYXRpb247XHJcbiAgICBcclxuICAgIGlmIChjb21wYW55R29hbENvbmZpZz8uZW5hYmxlZCAmJiBjb21wYW55R29hbENvbmZpZy5nb2Fscz8ubGVuZ3RoID4gMCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIC4uLmNvbXBhbnlHb2FsQ29uZmlnLFxyXG4gICAgICAgIGdsb2JhbFNldHRpbmdzOiB7XHJcbiAgICAgICAgICAuLi5kZWZhdWx0R2xvYmFsU2V0dGluZ3MsXHJcbiAgICAgICAgICAuLi5jb21wYW55R29hbENvbmZpZy5nbG9iYWxTZXR0aW5nc1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgY29tcGxldGlvblRyaWdnZXJzOiB7XHJcbiAgICAgICAgICAuLi5kZWZhdWx0Q29tcGxldGlvblRyaWdnZXJzLFxyXG4gICAgICAgICAgLi4uY29tcGFueUdvYWxDb25maWcuY29tcGxldGlvblRyaWdnZXJzXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzb3VyY2U6ICdjb21wYW55J1xyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGYWxsIGJhY2sgdG8gcGVyc29uYS1sZXZlbCBnb2Fsc1xyXG4gICAgaWYgKHBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24/LmVuYWJsZWQgJiYgcGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbi5nb2Fscz8ubGVuZ3RoID4gMCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIC4uLnBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24sXHJcbiAgICAgICAgZ2xvYmFsU2V0dGluZ3M6IHtcclxuICAgICAgICAgIC4uLmRlZmF1bHRHbG9iYWxTZXR0aW5ncyxcclxuICAgICAgICAgIC4uLnBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24uZ2xvYmFsU2V0dGluZ3NcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbXBsZXRpb25UcmlnZ2Vyczoge1xyXG4gICAgICAgICAgLi4uZGVmYXVsdENvbXBsZXRpb25UcmlnZ2VycyxcclxuICAgICAgICAgIC4uLnBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24uY29tcGxldGlvblRyaWdnZXJzXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzb3VyY2U6ICdwZXJzb25hJ1xyXG4gICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBObyBnb2FscyBjb25maWd1cmVkXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBlbmFibGVkOiBmYWxzZSxcclxuICAgICAgZ29hbHM6IFtdLFxyXG4gICAgICBnbG9iYWxTZXR0aW5nczogZGVmYXVsdEdsb2JhbFNldHRpbmdzLFxyXG4gICAgICBjb21wbGV0aW9uVHJpZ2dlcnM6IGRlZmF1bHRDb21wbGV0aW9uVHJpZ2dlcnMsXHJcbiAgICAgIHNvdXJjZTogJ25vbmUnXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgZ29hbCBvcmNoZXN0cmF0aW9uIGlzIGVuYWJsZWRcclxuICAgKi9cclxuICBzdGF0aWMgaXNFbmFibGVkKGVmZmVjdGl2ZUNvbmZpZzogRWZmZWN0aXZlR29hbENvbmZpZyk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIGVmZmVjdGl2ZUNvbmZpZy5lbmFibGVkICYmIGVmZmVjdGl2ZUNvbmZpZy5nb2Fscy5sZW5ndGggPiAwO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGh1bWFuLXJlYWRhYmxlIHNvdXJjZSBkZXNjcmlwdGlvblxyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRTb3VyY2VEZXNjcmlwdGlvbihlZmZlY3RpdmVDb25maWc6IEVmZmVjdGl2ZUdvYWxDb25maWcpOiBzdHJpbmcge1xyXG4gICAgc3dpdGNoIChlZmZlY3RpdmVDb25maWcuc291cmNlKSB7XHJcbiAgICAgIGNhc2UgJ2NvbXBhbnknOlxyXG4gICAgICAgIHJldHVybiAnY29tcGFueS1sZXZlbCc7XHJcbiAgICAgIGNhc2UgJ3BlcnNvbmEnOlxyXG4gICAgICAgIHJldHVybiAncGVyc29uYS1sZXZlbCc7XHJcbiAgICAgIGNhc2UgJ25vbmUnOlxyXG4gICAgICAgIHJldHVybiAnbm9uZSc7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgcmV0dXJuICd1bmtub3duJztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZpbmQgYSBzcGVjaWZpYyBnb2FsIGJ5IElEIChzdXBwb3J0cyBib3RoIGZ1bGwgSURzIGFuZCBzaG9ydCBuYW1lcylcclxuICAgKi9cclxuICBzdGF0aWMgZmluZEdvYWwoXHJcbiAgICBnb2FsQ29uZmlnOiBHb2FsQ29uZmlnLFxyXG4gICAgZ29hbElkOiBzdHJpbmdcclxuICApOiBhbnkgfCB1bmRlZmluZWQge1xyXG4gICAgcmV0dXJuIGdvYWxDb25maWcuZ29hbHMuZmluZCgoZzogYW55KSA9PiBcclxuICAgICAgZy5pZCA9PT0gZ29hbElkIHx8IGcuaWQuc3RhcnRzV2l0aChnb2FsSWQgKyAnXycpXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRmluZCBtdWx0aXBsZSBnb2FscyBieSBJRHNcclxuICAgKi9cclxuICBzdGF0aWMgZmluZEdvYWxzKFxyXG4gICAgZ29hbENvbmZpZzogR29hbENvbmZpZyxcclxuICAgIGdvYWxJZHM6IHN0cmluZ1tdXHJcbiAgKTogYW55W10ge1xyXG4gICAgcmV0dXJuIGdvYWxJZHNcclxuICAgICAgLm1hcChpZCA9PiB0aGlzLmZpbmRHb2FsKGdvYWxDb25maWcsIGlkKSlcclxuICAgICAgLmZpbHRlcihCb29sZWFuKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB0aGUgbW9zdCB1cmdlbnQgYWN0aXZlIGdvYWwgYmFzZWQgb24gcHJpb3JpdHkgYW5kIG9yZGVyXHJcbiAgICovXHJcbiAgc3RhdGljIGdldE1vc3RVcmdlbnRHb2FsKFxyXG4gICAgYWN0aXZlR29hbElkczogc3RyaW5nW10sXHJcbiAgICBnb2FsQ29uZmlnOiBHb2FsQ29uZmlnXHJcbiAgKTogYW55IHwgdW5kZWZpbmVkIHtcclxuICAgIGlmIChhY3RpdmVHb2FsSWRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGFjdGl2ZUdvYWxEZWZpbml0aW9ucyA9IHRoaXMuZmluZEdvYWxzKGdvYWxDb25maWcsIGFjdGl2ZUdvYWxJZHMpO1xyXG4gICAgXHJcbiAgICBpZiAoYWN0aXZlR29hbERlZmluaXRpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIHN0cmljdCBvcmRlcmluZyBpcyBlbmFibGVkXHJcbiAgICBjb25zdCBzdHJpY3RPcmRlcmluZyA9IGdvYWxDb25maWcuZ2xvYmFsU2V0dGluZ3M/LnN0cmljdE9yZGVyaW5nID8/IDc7XHJcbiAgICBcclxuICAgIGlmIChzdHJpY3RPcmRlcmluZyA9PT0gMCkge1xyXG4gICAgICAvLyBBbHdheXMtYWN0aXZlIG1vZGU6IHNvcnQgYnkgcHJpb3JpdHkgKGRlc2MpIHRoZW4gb3JkZXIgKGFzYylcclxuICAgICAgcmV0dXJuIGFjdGl2ZUdvYWxEZWZpbml0aW9ucy5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHByaW9yaXR5T3JkZXIgPSB0aGlzLmdldFByaW9yaXR5VmFsdWUoYi5wcmlvcml0eSkgLSB0aGlzLmdldFByaW9yaXR5VmFsdWUoYS5wcmlvcml0eSk7XHJcbiAgICAgICAgaWYgKHByaW9yaXR5T3JkZXIgIT09IDApIHJldHVybiBwcmlvcml0eU9yZGVyO1xyXG4gICAgICAgIHJldHVybiAoYS5vcmRlciB8fCAwKSAtIChiLm9yZGVyIHx8IDApO1xyXG4gICAgICB9KVswXTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIFN0cmljdCBvcmRlcmluZyBtb2RlOiBqdXN0IHRha2UgdGhlIGZpcnN0IGFjdGl2ZSBnb2FsIChsb3dlc3Qgb3JkZXIpXHJcbiAgICAgIHJldHVybiBhY3RpdmVHb2FsRGVmaW5pdGlvbnMuc29ydCgoYTogYW55LCBiOiBhbnkpID0+IFxyXG4gICAgICAgIChhLm9yZGVyIHx8IDApIC0gKGIub3JkZXIgfHwgMClcclxuICAgICAgKVswXTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnZlcnQgcHJpb3JpdHkgc3RyaW5nIHRvIG51bWVyaWMgdmFsdWUgZm9yIHNvcnRpbmdcclxuICAgKi9cclxuICBwcml2YXRlIHN0YXRpYyBnZXRQcmlvcml0eVZhbHVlKHByaW9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBudW1iZXIge1xyXG4gICAgc3dpdGNoIChwcmlvcml0eT8udG9Mb3dlckNhc2UoKSkge1xyXG4gICAgICBjYXNlICdjcml0aWNhbCc6XHJcbiAgICAgICAgcmV0dXJuIDQ7XHJcbiAgICAgIGNhc2UgJ2hpZ2gnOlxyXG4gICAgICAgIHJldHVybiAzO1xyXG4gICAgICBjYXNlICdtZWRpdW0nOlxyXG4gICAgICAgIHJldHVybiAyO1xyXG4gICAgICBjYXNlICdsb3cnOlxyXG4gICAgICAgIHJldHVybiAxO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHJldHVybiAyOyAvLyBEZWZhdWx0IHRvIG1lZGl1bVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgYSBnb2FsIHJlcXVpcmVzIHNwZWNpZmljIGRhdGEgZmllbGRzXHJcbiAgICovXHJcbiAgc3RhdGljIGdldFJlcXVpcmVkRmllbGRzKGdvYWw6IGFueSk6IHN0cmluZ1tdIHtcclxuICAgIGlmICghZ29hbD8uZGF0YVRvQ2FwdHVyZT8uZmllbGRzKSB7XHJcbiAgICAgIHJldHVybiBbXTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZ29hbC5kYXRhVG9DYXB0dXJlLmZpZWxkcykpIHtcclxuICAgICAgcmV0dXJuIGdvYWwuZGF0YVRvQ2FwdHVyZS5maWVsZHM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBbXTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIGFsbCByZXF1aXJlZCBmaWVsZHMgZm9yIGEgZ29hbCBhcmUgY2FwdHVyZWRcclxuICAgKi9cclxuICBzdGF0aWMgaXNHb2FsQ29tcGxldGUoXHJcbiAgICBnb2FsOiBhbnksXHJcbiAgICBjYXB0dXJlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT5cclxuICApOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHJlcXVpcmVkRmllbGRzID0gdGhpcy5nZXRSZXF1aXJlZEZpZWxkcyhnb2FsKTtcclxuICAgIFxyXG4gICAgaWYgKHJlcXVpcmVkRmllbGRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7IC8vIE5vIGZpZWxkcyBkZWZpbmVkLCBjYW4ndCBiZSBjb21wbGV0ZVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIHZhbGlkYXRpb24gcnVsZXMgaWYgdGhleSBleGlzdFxyXG4gICAgY29uc3QgdmFsaWRhdGlvblJ1bGVzID0gZ29hbC5kYXRhVG9DYXB0dXJlPy52YWxpZGF0aW9uUnVsZXMgfHwge307XHJcbiAgICBcclxuICAgIHJldHVybiByZXF1aXJlZEZpZWxkcy5ldmVyeShmaWVsZCA9PiB7XHJcbiAgICAgIGNvbnN0IHJ1bGUgPSB2YWxpZGF0aW9uUnVsZXNbZmllbGRdO1xyXG4gICAgICBjb25zdCB2YWx1ZSA9IGNhcHR1cmVkRGF0YVtmaWVsZF07XHJcbiAgICAgIFxyXG4gICAgICAvLyBJZiBmaWVsZCBpcyBub3QgcmVxdWlyZWQgYW5kIG5vdCBwcmVzZW50LCB0aGF0J3MgT0tcclxuICAgICAgaWYgKHJ1bGU/LnJlcXVpcmVkID09PSBmYWxzZSAmJiAhdmFsdWUpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gT3RoZXJ3aXNlLCBmaWVsZCBtdXN0IGV4aXN0IGFuZCBoYXZlIGEgdmFsdWVcclxuICAgICAgcmV0dXJuIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUgIT09ICcnO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgZ29hbCB0eXBlIChkYXRhX2NvbGxlY3Rpb24sIHNjaGVkdWxpbmcsIGV0Yy4pXHJcbiAgICovXHJcbiAgc3RhdGljIGdldEdvYWxUeXBlKGdvYWw6IGFueSk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gZ29hbD8udHlwZSB8fCAnZGF0YV9jb2xsZWN0aW9uJztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIHN0cmljdCBvcmRlcmluZyBpcyBlbmFibGVkXHJcbiAgICovXHJcbiAgc3RhdGljIGlzU3RyaWN0T3JkZXJpbmdFbmFibGVkKGdvYWxDb25maWc6IEdvYWxDb25maWcpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHN0cmljdE9yZGVyaW5nID0gZ29hbENvbmZpZy5nbG9iYWxTZXR0aW5ncz8uc3RyaWN0T3JkZXJpbmcgPz8gNztcclxuICAgIHJldHVybiBzdHJpY3RPcmRlcmluZyA+PSA3O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgYWx3YXlzLWFjdGl2ZSBtb2RlIGlzIGVuYWJsZWRcclxuICAgKi9cclxuICBzdGF0aWMgaXNBbHdheXNBY3RpdmVNb2RlKGdvYWxDb25maWc6IEdvYWxDb25maWcpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHN0cmljdE9yZGVyaW5nID0gZ29hbENvbmZpZy5nbG9iYWxTZXR0aW5ncz8uc3RyaWN0T3JkZXJpbmcgPz8gNztcclxuICAgIHJldHVybiBzdHJpY3RPcmRlcmluZyA9PT0gMDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBtYXggYWN0aXZlIGdvYWxzIHNldHRpbmdcclxuICAgKi9cclxuICBzdGF0aWMgZ2V0TWF4QWN0aXZlR29hbHMoZ29hbENvbmZpZzogR29hbENvbmZpZyk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gZ29hbENvbmZpZy5nbG9iYWxTZXR0aW5ncz8ubWF4QWN0aXZlR29hbHMgPz8gMztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBtYXggZ29hbHMgcGVyIHR1cm4gc2V0dGluZ1xyXG4gICAqL1xyXG4gIHN0YXRpYyBnZXRNYXhHb2Fsc1BlclR1cm4oZ29hbENvbmZpZzogR29hbENvbmZpZyk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gZ29hbENvbmZpZy5nbG9iYWxTZXR0aW5ncz8ubWF4R29hbHNQZXJUdXJuID8/IDI7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGb3JtYXQgZ29hbCBmb3IgbG9nZ2luZyAoY29uY2lzZSByZXByZXNlbnRhdGlvbilcclxuICAgKi9cclxuICBzdGF0aWMgZm9ybWF0R29hbEZvckxvZyhnb2FsOiBhbnkpOiBhbnkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaWQ6IGdvYWwuaWQsXHJcbiAgICAgIG5hbWU6IGdvYWwubmFtZSxcclxuICAgICAgdHlwZTogdGhpcy5nZXRHb2FsVHlwZShnb2FsKSxcclxuICAgICAgcHJpb3JpdHk6IGdvYWwucHJpb3JpdHkgfHwgJ21lZGl1bScsXHJcbiAgICAgIG9yZGVyOiBnb2FsLm9yZGVyIHx8IDAsXHJcbiAgICAgIGZpZWxkczogdGhpcy5nZXRSZXF1aXJlZEZpZWxkcyhnb2FsKVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEZvcm1hdCBtdWx0aXBsZSBnb2FscyBmb3IgbG9nZ2luZ1xyXG4gICAqL1xyXG4gIHN0YXRpYyBmb3JtYXRHb2Fsc0ZvckxvZyhnb2FsczogYW55W10pOiBhbnlbXSB7XHJcbiAgICByZXR1cm4gZ29hbHMubWFwKGcgPT4gdGhpcy5mb3JtYXRHb2FsRm9yTG9nKGcpKTtcclxuICB9XHJcbn1cclxuXHJcbiJdfQ==