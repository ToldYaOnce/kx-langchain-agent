/**
 * Default Goal Instructions
 * 
 * Fallback for goals that don't have specific instruction generators.
 * Produces generic but sensible prompts based on fields needed.
 */

import type { GoalInstructionContext, GoalInstruction } from './index.js';

export function getDefaultInstruction(context: GoalInstructionContext): GoalInstruction {
  const { fieldsNeeded, fieldsCaptured, goalName, userName } = context;
  
  // Filter to only fields we still need
  // Exclude motivationCategories - it's auto-extracted with motivationReason, not asked for directly
  const stillNeeded = fieldsNeeded.filter(f => !fieldsCaptured[f] && f !== 'motivationCategories');
  
  if (stillNeeded.length === 0) {
    return {
      instruction: `All fields for "${goalName}" are captured. No question needed.`,
      targetFields: []
    };
  }
  
  const name = userName || 'friend';
  
  // If multiple fields needed, ask for all at once
  if (stillNeeded.length > 1) {
    // Convert field names to human-readable labels
    const humanizedFields = stillNeeded.map(f => humanizeFieldName(f));
    const fieldList = humanizedFields.join(', ');
    const lastField = humanizedFields[humanizedFields.length - 1];
    const firstFields = humanizedFields.slice(0, -1).join(', ');
    const naturalFieldList = humanizedFields.length > 1 
      ? `${firstFields}, and ${lastField}` 
      : lastField;
    
    return {
      instruction: `Ask about their ${naturalFieldList} in a natural, conversational way.
Don't make it feel like a form - keep it casual and friendly.
DO NOT use the field names literally - use natural language!`,
      examples: [
        `"So tell me - what are you hoping to achieve? What's driving you, and when do you want to hit your target?"`,
        `"What's your main fitness goal? What's motivating you to make this change, and what's your timeline?"`,
        `"What brings you in today? What are you looking to accomplish and by when?"`
      ],
      targetFields: stillNeeded
    };
  }
  
  // Single field needed
  const field = stillNeeded[0];
  const fieldLabel = humanizeFieldName(field);
  
  // Special handling for common single-field scenarios
  if (field === 'motivationReason') {
    return {
      instruction: `Ask what's driving/motivating them. Keep it casual.`,
      examples: [
        `"What's driving this change for you?"`,
        `"What's your motivation behind this?"`,
        `"What made you decide now is the time?"`
      ],
      targetFields: [field]
    };
  }
  
  if (field === 'timeline') {
    return {
      instruction: `Ask about their timeline/when they want to achieve their goal.`,
      examples: [
        `"When are you looking to hit this goal?"`,
        `"What's your timeline for this?"`,
        `"By when do you want to see results?"`
      ],
      targetFields: [field]
    };
  }
  
  if (field === 'primaryGoal') {
    // Build context from what we already know
    const motivation = fieldsCaptured.motivationReason;
    const timeline = fieldsCaptured.timeline;
    
    // If we have context, reference it in the question
    if (motivation && timeline) {
      return {
        instruction: `Ask what specific goal they want to achieve. 
Reference what they already told you (motivation: "${motivation}", timeline: "${timeline}") to show you were listening.
Ask what SPECIFIC result they're looking for (e.g., lose weight, build muscle, get stronger).`,
        examples: [
          `"Love that ${motivation} motivation! By ${timeline}, what specific result are you going for - weight loss, muscle gain, toning up?"`,
          `"So for this ${motivation} deadline, what's THE goal - dropping pounds, building strength, or something else?"`,
          `"Got it - ${timeline} is the target. What exactly do you want to achieve by then?"`
        ],
        targetFields: [field]
      };
    } else if (motivation) {
      return {
        instruction: `Ask what specific goal they want to achieve, referencing their motivation ("${motivation}").`,
        examples: [
          `"For this ${motivation}, what's the main goal - weight loss, muscle, toning?"`,
          `"What specific result are you going for with the ${motivation}?"`,
          `"So what do you want to achieve for the ${motivation}?"`
        ],
        targetFields: [field]
      };
    } else if (timeline) {
      return {
        instruction: `Ask what specific goal they want to achieve by their timeline ("${timeline}").`,
        examples: [
          `"By ${timeline}, what are you looking to accomplish?"`,
          `"What's the goal for ${timeline}?"`,
          `"What do you want to achieve by ${timeline}?"`
        ],
        targetFields: [field]
      };
    }
    
    // No context - generic question
    return {
      instruction: `Ask what their main fitness goal is.`,
      examples: [
        `"What's your main goal?"`,
        `"What are you looking to achieve?"`,
        `"What brings you in today?"`
      ],
      targetFields: [field]
    };
  }
  
  return {
    instruction: `Ask for their ${fieldLabel}.`,
    examples: [
      `"What's your ${fieldLabel}?"`,
      `"Tell me about your ${fieldLabel}!"`
    ],
    targetFields: [field]
  };
}

/**
 * Convert camelCase field name to human-readable label
 */
function humanizeFieldName(field: string): string {
  // Handle common field names
  const fieldMap: Record<string, string> = {
    firstName: 'first name',
    lastName: 'last name',
    email: 'email address',
    phone: 'phone number',
    preferredDate: 'preferred date',
    preferredTime: 'preferred time',
    primaryGoal: 'main goal',
    fitnessGoals: 'fitness goals',
    motivationReason: 'motivation',
    timeline: 'timeline',
    height: 'height',
    weight: 'weight',
    heightWeight: 'height and weight',
    bodyFatPercentage: 'body fat percentage',
    injuries: 'injuries',
    medicalConditions: 'medical conditions',
    physicalLimitations: 'physical limitations or injuries',
    doctorClearance: 'doctor clearance'
  };
  
  if (fieldMap[field]) {
    return fieldMap[field];
  }
  
  // Convert camelCase to space-separated words
  return field
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
}

