/**
 * Goal-Specific Instructions
 * 
 * Smart instruction generators for each goal type.
 * These produce context-aware prompts that:
 * - Ask for multiple fields at once when appropriate
 * - Use company info (like businessHours) when relevant
 * - Handle partial responses intelligently
 */

import type { CompanyInfo } from '../persona-service.js';
import { getContactInfoInstruction } from './contact-info.js';
import { getSchedulingInstruction } from './scheduling.js';
import { getIdentityInstruction } from './identity.js';
import { getBodyMetricsInstruction } from './body-metrics.js';
import { getInjuriesInstruction } from './injuries.js';
import { getDefaultInstruction } from './default.js';

/**
 * Context passed to goal instruction generators
 */
export interface GoalInstructionContext {
  /** Goal ID (e.g., "collect_contact_info_1234") */
  goalId: string;
  /** Goal type (e.g., "data_collection", "scheduling") */
  goalType: string;
  /** Goal name for display (e.g., "Contact Info") */
  goalName: string;
  /** Fields still needed for this goal */
  fieldsNeeded: string[];
  /** Fields already captured (with values) */
  fieldsCaptured: Record<string, any>;
  /** Company info (for businessHours, etc.) */
  companyInfo?: CompanyInfo;
  /** Channel state (for additional context) */
  channelState?: any;
  /** User's first name if known */
  userName?: string;
  /** The user's last message (for understanding context) */
  lastUserMessage?: string;
  /** Detected intent from intent detection (e.g., "objection", "scheduling") */
  detectedIntent?: string;
}

/**
 * Result from goal instruction generator
 */
export interface GoalInstruction {
  /** The instruction to inject into the LLM prompt */
  instruction: string;
  /** Optional: Specific examples to include */
  examples?: string[];
  /** Optional: Fields this instruction is asking for (for logging) */
  targetFields?: string[];
}

/**
 * Get smart instruction for a goal based on its type and current state
 */
export function getGoalInstruction(context: GoalInstructionContext): GoalInstruction {
  const goalIdLower = context.goalId.toLowerCase();
  const goalTypeLower = context.goalType.toLowerCase();
  
  // Route to specific instruction generator based on goal ID pattern or type
  
  // Contact Info (email, phone)
  if (goalIdLower.includes('contact_info') || goalIdLower.includes('contact-info')) {
    return getContactInfoInstruction(context);
  }
  
  // Scheduling (preferredDate, preferredTime)
  if (goalIdLower.includes('schedule') || goalTypeLower === 'scheduling') {
    return getSchedulingInstruction(context);
  }
  
  // Identity (firstName, lastName)
  if (goalIdLower.includes('identity') || goalIdLower.includes('name') || goalIdLower.includes('get_name')) {
    return getIdentityInstruction(context);
  }
  
  // Body Metrics (height, weight, body fat)
  if (goalIdLower.includes('body_metrics') || goalIdLower.includes('body-metrics')) {
    return getBodyMetricsInstruction(context);
  }
  
  // Injuries & Limitations
  if (goalIdLower.includes('injuries') || goalIdLower.includes('limitations')) {
    return getInjuriesInstruction(context);
  }
  
  // Default fallback for other goals
  return getDefaultInstruction(context);
}

// Re-export individual generators for direct use if needed
export { getContactInfoInstruction } from './contact-info.js';
export { getSchedulingInstruction } from './scheduling.js';
export { getIdentityInstruction } from './identity.js';
export { getBodyMetricsInstruction } from './body-metrics.js';
export { getInjuriesInstruction } from './injuries.js';
export { getDefaultInstruction } from './default.js';

