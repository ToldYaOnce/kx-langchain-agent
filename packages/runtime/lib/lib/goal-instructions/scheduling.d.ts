/**
 * Scheduling Goal Instructions
 *
 * Smart handling for appointment scheduling:
 * - Uses businessHours from company info to offer real slots
 * - Asks about time preference first (morning/evening)
 * - Offers specific days/times based on preference
 */
import type { GoalInstructionContext, GoalInstruction } from './index.js';
export declare function getSchedulingInstruction(context: GoalInstructionContext): GoalInstruction;
