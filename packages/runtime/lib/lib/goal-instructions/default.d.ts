/**
 * Default Goal Instructions
 *
 * Fallback for goals that don't have specific instruction generators.
 * Produces generic but sensible prompts based on fields needed.
 */
import type { GoalInstructionContext, GoalInstruction } from './index.js';
export declare function getDefaultInstruction(context: GoalInstructionContext): GoalInstruction;
