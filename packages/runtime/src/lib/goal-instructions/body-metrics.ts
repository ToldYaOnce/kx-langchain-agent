/**
 * Body Metrics Goal Instructions
 * 
 * Handles collection of height, weight, and body composition data.
 * Keeps it casual and non-judgmental - this is sensitive info!
 */

import type { GoalInstructionContext, GoalInstruction } from './index.js';

export function getBodyMetricsInstruction(context: GoalInstructionContext): GoalInstruction {
  const { fieldsNeeded, fieldsCaptured, userName } = context;
  
  const name = userName || 'friend';
  
  // Check what we have - LLM extracts height and weight as separate fields
  const hasHeight = !!fieldsCaptured.height;
  const hasWeight = !!fieldsCaptured.weight;
  const hasBodyFat = !!fieldsCaptured.bodyFatPercentage;
  
  const needsHeight = fieldsNeeded.includes('height') && !hasHeight;
  const needsWeight = fieldsNeeded.includes('weight') && !hasWeight;
  const needsBodyFat = fieldsNeeded.includes('bodyFatPercentage') && !hasBodyFat;
  
  // Case 1: Need both height AND weight - ask together
  if (needsHeight && needsWeight) {
    return {
      instruction: `Ask for their height and weight together in a casual, non-judgmental way.
This helps you understand their starting point. Keep it light and supportive.
Make it clear there's no judgment - just getting a baseline.`,
      examples: [
        `"Quick question - what's your height and weight right now? Just so I know where you're starting from!"`,
        `"No judgment zone here - what are we working with height and weight-wise?"`,
        `"To customize your program, what's your current height and weight?"`
      ],
      targetFields: ['height', 'weight']
    };
  }
  
  // Case 2: Have one but not the other (rare - usually given together)
  if (needsHeight && !needsWeight) {
    return {
      instruction: `Ask for their height. Keep it casual.`,
      examples: [
        `"And how tall are you?"`,
        `"What's your height?"`
      ],
      targetFields: ['height']
    };
  }
  
  if (needsWeight && !needsHeight) {
    return {
      instruction: `Ask for their weight. Keep it casual and non-judgmental.`,
      examples: [
        `"And what's your current weight?"`,
        `"What are you weighing in at these days?"`
      ],
      targetFields: ['weight']
    };
  }
  
  // Case 3: Have height/weight, optionally ask about body fat
  if (hasHeight && hasWeight && needsBodyFat) {
    return {
      instruction: `Optionally ask if they know their body fat percentage. Don't push if they don't know.`,
      examples: [
        `"Do you happen to know your body fat percentage? No worries if not!"`,
        `"Any idea what your body fat is at? Totally fine if you're not sure."`
      ],
      targetFields: ['bodyFatPercentage']
    };
  }
  
  // All captured
  return {
    instruction: `Body metrics captured. No question needed.`,
    targetFields: []
  };
}

