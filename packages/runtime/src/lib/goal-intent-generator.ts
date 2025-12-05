/**
 * @fileoverview
 * Automatically generates LangChain intents from goal configurations.
 * Allows the LLM to detect and extract data based on conversation goals.
 */

import { z } from 'zod';

export interface GoalIntent {
  intentId: string;
  goalId: string;
  fieldName: string;
  description: string;
  extractionSchema: z.ZodType<any>;
}

export interface IntentDetectionResult {
  detectedIntents: {
    intentId: string;
    goalId: string;
    fieldName: string;
    extractedValue: any;
    confidence: number;
  }[];
}

/**
 * Generate intents from goal configuration
 */
export function generateIntentsFromGoals(goalConfig: any): GoalIntent[] {
  const intents: GoalIntent[] = [];

  if (!goalConfig?.enabled || !goalConfig?.goals) {
    return intents;
  }

  for (const goal of goalConfig.goals) {
    // Only process data collection goals
    if (!['data_collection', 'collect_info'].includes(goal.type)) {
      continue;
    }

    if (!goal.dataToCapture?.fields) {
      continue;
    }

    // Generate an intent for each field
    for (const fieldName of goal.dataToCapture.fields) {
      const intentId = `${goal.id}_collect_${fieldName}`;
      
      intents.push({
        intentId,
        goalId: goal.id,
        fieldName,
        description: getFieldDescription(fieldName),
        extractionSchema: getFieldSchema(fieldName, goal.dataToCapture.validationRules?.[fieldName])
      });
    }
  }

  return intents;
}

/**
 * Get human-readable description for field
 */
function getFieldDescription(fieldName: string): string {
  const descriptions: Record<string, string> = {
    'email': 'User provides their email address',
    'phone': 'User provides their phone number',
    'name': 'User provides their name',
    'firstName': 'User provides their first name',
    'lastName': 'User provides their last name',
    'goals': 'User describes their fitness or business goals',
    'experienceLevel': 'User indicates their experience level (beginner, intermediate, advanced)',
    'constraints': 'User mentions limitations or constraints',
    'timeline': 'User specifies a timeline or deadline',
    'budget': 'User mentions budget or price range',
    'preferences': 'User states preferences or requirements'
  };

  return descriptions[fieldName] || `User provides ${fieldName}`;
}

/**
 * Get Zod schema for field validation
 */
function getFieldSchema(fieldName: string, validationRules?: any): z.ZodType<any> {
  // Email
  if (fieldName === 'email' || fieldName.includes('email')) {
    return z.string().email().describe('Email address');
  }

  // Phone
  if (fieldName === 'phone' || fieldName.includes('phone')) {
    return z.string().min(10).describe('Phone number in any format');
  }

  // Name
  if (fieldName === 'name' || fieldName.includes('name')) {
    return z.string().min(2).describe('Name');
  }

  // Experience level
  if (fieldName === 'experienceLevel' || fieldName === 'experience') {
    return z.enum(['beginner', 'intermediate', 'advanced', 'expert']).describe('Experience level');
  }

  // Generic text fields
  if (['goals', 'constraints', 'timeline', 'preferences'].includes(fieldName)) {
    return z.string().min(3).describe(`User's ${fieldName}`);
  }

  // Default: any string
  return z.string().optional().describe(fieldName);
}

/**
 * Generate system prompt section for intent monitoring
 */
export function generateIntentMonitoringPrompt(intents: GoalIntent[]): string {
  if (intents.length === 0) {
    return '';
  }

  let prompt = `\n🎯 ACTIVE DATA COLLECTION INTENTS:\n`;
  prompt += `You are monitoring the conversation for the following information:\n\n`;

  for (const intent of intents) {
    prompt += `- ${intent.fieldName}: ${intent.description}\n`;
  }

  prompt += `\nWhen you detect the user providing any of this information, acknowledge it naturally in your response.\n`;

  return prompt;
}

/**
 * Create extraction schema for all active intents
 */
export function createExtractionSchema(intents: GoalIntent[]): z.ZodObject<any> {
  const schemaFields: Record<string, z.ZodType<any>> = {};

  for (const intent of intents) {
    schemaFields[intent.fieldName] = intent.extractionSchema;
  }

  return z.object(schemaFields);
}

/**
 * Build LLM extraction prompt
 */
export function buildExtractionPrompt(
  userMessage: string,
  conversationHistory: string[],
  intents: GoalIntent[]
): string {
  const fields = intents.map(i => i.fieldName).join(', ');
  
  return `Analyze the user's latest message and extract any of these fields if present: ${fields}

Recent conversation:
${conversationHistory.slice(-3).join('\n')}

User's latest message: "${userMessage}"

Extract any detected fields. Return null/undefined for fields not found.`;
}

