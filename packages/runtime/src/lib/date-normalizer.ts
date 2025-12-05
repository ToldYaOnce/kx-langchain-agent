/**
 * Date Normalizer Module
 * 
 * Provides context and utilities for normalizing relative dates/times
 * into ISO 8601 format. Used by intent detection to convert
 * "Monday at 6" → "2025-12-09T18:00:00"
 */

export interface DateContext {
  today: string;           // "2025-12-04"
  dayOfWeek: string;       // "Wednesday"
  timezone?: string;       // "America/New_York"
  businessHours?: {        // For smart time defaults
    openTime?: string;     // "05:00"
    closeTime?: string;    // "23:00"
  };
}

export interface NormalizationPromptConfig {
  includeExamples?: boolean;
  businessContext?: 'fitness' | 'medical' | 'general';
}

/**
 * Get current date context for LLM prompts
 */
export function getDateContext(timezone?: string): DateContext {
  const now = new Date();
  
  // Format today's date
  const today = now.toISOString().split('T')[0];
  
  // Get day of week
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  
  return {
    today,
    dayOfWeek,
    timezone
  };
}

/**
 * Build the date normalization section for intent detection prompt
 */
export function buildDateNormalizationPrompt(config?: NormalizationPromptConfig): string {
  const context = getDateContext();
  const businessContext = config?.businessContext || 'fitness';
  
  // Business-specific time defaults
  const timeDefaults = getTimeDefaults(businessContext);
  
  const prompt = `
🗓️ APPOINTMENT DATE/TIME NORMALIZATION:
TODAY IS: ${context.dayOfWeek}, ${context.today}

When user provides scheduling info (preferredDate, preferredTime), ALSO extract:
- normalizedDateTime: Full ISO 8601 format (e.g., "2025-12-09T18:00:00")

DATE CALCULATION RULES:
- "Monday" = The NEXT Monday from ${context.today} (if today is ${context.dayOfWeek})
- "this Monday" = This week's Monday (use next week if already passed)
- "next Monday" = Monday of NEXT week
- "tomorrow" = ${getTomorrowDate()}
- "today" = ${context.today}
- Specific dates like "12/15" or "03/03/26" = Parse directly

TIME INTERPRETATION RULES:
- Single number "6" or "7" = Assume ${timeDefaults.defaultPeriod} (${timeDefaults.reason})
- "6pm" or "6:00pm" = 18:00
- "6am" or "6:00am" = 06:00
- "morning" = ${timeDefaults.morning}
- "afternoon" = ${timeDefaults.afternoon}
- "evening" = ${timeDefaults.evening}
- "7:30" without AM/PM = Assume ${timeDefaults.defaultPeriod}

OUTPUT FORMAT:
- Always use 24-hour time in ISO format
- Include seconds as :00
- Example: "2025-12-09T18:00:00"

${config?.includeExamples !== false ? buildExamples(context) : ''}`;

  return prompt;
}

/**
 * Get time defaults based on business context
 */
function getTimeDefaults(context: 'fitness' | 'medical' | 'general'): {
  defaultPeriod: string;
  reason: string;
  morning: string;
  afternoon: string;
  evening: string;
} {
  switch (context) {
    case 'fitness':
      return {
        defaultPeriod: 'PM',
        reason: 'most gym visits are after work',
        morning: '06:00',  // Early birds
        afternoon: '14:00',
        evening: '18:00'   // Post-work rush
      };
    case 'medical':
      return {
        defaultPeriod: 'AM',
        reason: 'most medical appointments are morning',
        morning: '09:00',
        afternoon: '14:00',
        evening: '17:00'
      };
    default:
      return {
        defaultPeriod: 'PM',
        reason: 'default assumption',
        morning: '09:00',
        afternoon: '14:00',
        evening: '18:00'
      };
  }
}

/**
 * Get tomorrow's date string
 */
function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

/**
 * Build examples section for the prompt
 */
function buildExamples(context: DateContext): string {
  // Calculate actual example dates
  const nextMonday = getNextDayOfWeek(1); // 1 = Monday
  const nextFriday = getNextDayOfWeek(5); // 5 = Friday
  const tomorrow = getTomorrowDate();
  
  return `
EXAMPLES (based on today being ${context.dayOfWeek}, ${context.today}):

User: "Monday at 6"
→ extractedData: [
    {field: "preferredDate", value: "Monday"},
    {field: "preferredTime", value: "6"},
    {field: "normalizedDateTime", value: "${nextMonday}T18:00:00"}
  ]

User: "tomorrow at 7:30pm"
→ extractedData: [
    {field: "preferredDate", value: "tomorrow"},
    {field: "preferredTime", value: "7:30pm"},
    {field: "normalizedDateTime", value: "${tomorrow}T19:30:00"}
  ]

User: "next Friday morning"
→ extractedData: [
    {field: "preferredDate", value: "next Friday"},
    {field: "preferredTime", value: "morning"},
    {field: "normalizedDateTime", value: "${nextFriday}T06:00:00"}
  ]

User: "How about 5:30?"
→ extractedData: [
    {field: "preferredTime", value: "5:30"},
    {field: "normalizedDateTime", value: null}
  ]
  (normalizedDateTime is null because we don't have the date yet)`;
}

/**
 * Get the next occurrence of a specific day of week
 * @param dayOfWeek 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
function getNextDayOfWeek(dayOfWeek: number): string {
  const today = new Date();
  const todayDay = today.getDay();
  
  let daysUntil = dayOfWeek - todayDay;
  if (daysUntil <= 0) {
    daysUntil += 7; // Next week
  }
  
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);
  
  return targetDate.toISOString().split('T')[0];
}

/**
 * Validate an ISO datetime string
 */
export function isValidISODateTime(dateTimeStr: string | null | undefined): boolean {
  if (!dateTimeStr) return false;
  
  // Check format: YYYY-MM-DDTHH:MM:SS
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (!isoRegex.test(dateTimeStr)) return false;
  
  // Check if it's a valid date
  const date = new Date(dateTimeStr);
  return !isNaN(date.getTime());
}

/**
 * Parse a normalized datetime and return a Date object
 */
export function parseNormalizedDateTime(dateTimeStr: string): Date | null {
  if (!isValidISODateTime(dateTimeStr)) return null;
  return new Date(dateTimeStr);
}

/**
 * Format a Date for display
 */
export function formatForDisplay(date: Date, options?: {
  includeTime?: boolean;
  includeDay?: boolean;
}): string {
  const includeTime = options?.includeTime ?? true;
  const includeDay = options?.includeDay ?? true;
  
  const parts: string[] = [];
  
  if (includeDay) {
    parts.push(date.toLocaleDateString('en-US', { weekday: 'long' }));
  }
  
  parts.push(date.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  }));
  
  if (includeTime) {
    parts.push('at');
    parts.push(date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    }));
  }
  
  return parts.join(' ');
}

