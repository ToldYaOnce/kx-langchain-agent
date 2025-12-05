/**
 * Injuries & Limitations Goal Instructions
 * 
 * Handles collection of injury/limitation info for safety.
 * Important to ask but in a caring, non-alarming way.
 */

import type { GoalInstructionContext, GoalInstruction } from './index.js';

export function getInjuriesInstruction(context: GoalInstructionContext): GoalInstruction {
  const { fieldsNeeded, fieldsCaptured, userName } = context;
  
  const name = userName || 'friend';
  
  // Check what we have
  const hasLimitations = !!fieldsCaptured.physicalLimitations;
  
  const needsLimitations = fieldsNeeded.includes('physicalLimitations') && !hasLimitations;
  
  // Case 1: Need to ask about injuries/limitations
  if (needsLimitations) {
    return {
      instruction: `Ask if they have any injuries, physical limitations, or health conditions we should know about.
Frame it as being for their safety and to customize their program.
Accept "none" or "no" as a valid answer - don't push for details.`,
      examples: [
        `"Last thing - any injuries or physical limitations I should know about? Want to make sure we keep you safe!"`,
        `"Before we start, any health stuff I should be aware of? Injuries, conditions, anything like that?"`,
        `"For your safety - any physical limitations or injuries we need to work around?"`
      ],
      targetFields: ['physicalLimitations']
    };
  }
  
  // All captured
  return {
    instruction: `Injury info captured. No question needed.`,
    targetFields: []
  };
}

