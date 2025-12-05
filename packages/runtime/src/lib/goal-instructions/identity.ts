/**
 * Identity Goal Instructions
 * 
 * Smart handling for name collection:
 * - If both first and last required: Ask for full name
 * - If user provides full name, extract both
 * - If only one provided, ask for the other
 */

import type { GoalInstructionContext, GoalInstruction } from './index.js';

export function getIdentityInstruction(context: GoalInstructionContext): GoalInstruction {
  const { fieldsNeeded, fieldsCaptured } = context;
  
  const needsFirst = fieldsNeeded.includes('firstName');
  const needsLast = fieldsNeeded.includes('lastName');
  const hasFirst = !!fieldsCaptured.firstName;
  const hasLast = !!fieldsCaptured.lastName;
  
  const firstName = fieldsCaptured.firstName || '';
  
  // Case 1: Need BOTH, have NEITHER → Ask for full name
  if (needsFirst && needsLast && !hasFirst && !hasLast) {
    return {
      instruction: `Ask for their name. They can give first name only or full name - either works.
Don't make it feel like a form. Keep it natural.`,
      examples: [
        `"What's your name?"`,
        `"Who am I talking to?"`,
        `"What should I call you?"`,
        `"What's your name, warrior?"`
      ],
      targetFields: ['firstName', 'lastName']
    };
  }
  
  // Case 2: Have first name, need last name
  if (needsLast && !hasLast && hasFirst) {
    return {
      instruction: `You have their first name (${firstName}). Now ask for their last name.
Be casual about it - don't make it feel like paperwork.`,
      examples: [
        `"And your last name, ${firstName}?"`,
        `"${firstName} what? What's the last name?"`,
        `"Got it, ${firstName}! Last name?"`
      ],
      targetFields: ['lastName']
    };
  }
  
  // Case 3: Have last name, need first name (rare, but possible)
  if (needsFirst && !hasFirst && hasLast) {
    return {
      instruction: `You have their last name. Ask for their first name.`,
      examples: [
        `"And your first name?"`,
        `"What's your first name?"`
      ],
      targetFields: ['firstName']
    };
  }
  
  // Case 4: Only first name required
  if (needsFirst && !needsLast && !hasFirst) {
    return {
      instruction: `Ask for their first name only.`,
      examples: [
        `"What's your first name?"`,
        `"What should I call you?"`,
        `"Who am I talking to?"`
      ],
      targetFields: ['firstName']
    };
  }
  
  // Case 5: Only last name required (unusual)
  if (needsLast && !needsFirst && !hasLast) {
    return {
      instruction: `Ask for their last name.`,
      examples: [
        `"What's your last name?"`,
        `"And your surname?"`
      ],
      targetFields: ['lastName']
    };
  }
  
  // All captured
  if (hasFirst && hasLast) {
    return {
      instruction: `Name is complete (${firstName} ${fieldsCaptured.lastName}). No question needed.`,
      targetFields: []
    };
  }
  
  // Fallback
  const stillNeeded = fieldsNeeded.filter(f => !fieldsCaptured[f]);
  return {
    instruction: `Ask for: ${stillNeeded.join(' and ')}.`,
    targetFields: stillNeeded
  };
}

