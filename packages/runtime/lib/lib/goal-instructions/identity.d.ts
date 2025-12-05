/**
 * Identity Goal Instructions
 *
 * Smart handling for name collection:
 * - If both first and last required: Ask for full name
 * - If user provides full name, extract both
 * - If only one provided, ask for the other
 */
import type { GoalInstructionContext, GoalInstruction } from './index.js';
export declare function getIdentityInstruction(context: GoalInstructionContext): GoalInstruction;
