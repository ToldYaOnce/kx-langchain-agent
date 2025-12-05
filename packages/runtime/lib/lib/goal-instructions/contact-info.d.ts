/**
 * Contact Info Goal Instructions
 *
 * Smart handling for email and phone collection:
 * - If both required and neither captured: Ask for both in one question
 * - If one captured, ask for the other
 * - If only one required: Ask for it (optionally mention the other)
 */
import type { GoalInstructionContext, GoalInstruction } from './index.js';
export declare function getContactInfoInstruction(context: GoalInstructionContext): GoalInstruction;
