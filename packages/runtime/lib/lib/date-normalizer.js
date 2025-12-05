"use strict";
/**
 * Date Normalizer Module
 *
 * Provides context and utilities for normalizing relative dates/times
 * into ISO 8601 format. Used by intent detection to convert
 * "Monday at 6" → "2025-12-09T18:00:00"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDateContext = getDateContext;
exports.buildDateNormalizationPrompt = buildDateNormalizationPrompt;
exports.isValidISODateTime = isValidISODateTime;
exports.parseNormalizedDateTime = parseNormalizedDateTime;
exports.formatForDisplay = formatForDisplay;
/**
 * Get current date context for LLM prompts
 */
function getDateContext(timezone) {
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
function buildDateNormalizationPrompt(config) {
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
function getTimeDefaults(context) {
    switch (context) {
        case 'fitness':
            return {
                defaultPeriod: 'PM',
                reason: 'most gym visits are after work',
                morning: '06:00', // Early birds
                afternoon: '14:00',
                evening: '18:00' // Post-work rush
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
function getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
}
/**
 * Build examples section for the prompt
 */
function buildExamples(context) {
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
function getNextDayOfWeek(dayOfWeek) {
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
function isValidISODateTime(dateTimeStr) {
    if (!dateTimeStr)
        return false;
    // Check format: YYYY-MM-DDTHH:MM:SS
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    if (!isoRegex.test(dateTimeStr))
        return false;
    // Check if it's a valid date
    const date = new Date(dateTimeStr);
    return !isNaN(date.getTime());
}
/**
 * Parse a normalized datetime and return a Date object
 */
function parseNormalizedDateTime(dateTimeStr) {
    if (!isValidISODateTime(dateTimeStr))
        return null;
    return new Date(dateTimeStr);
}
/**
 * Format a Date for display
 */
function formatForDisplay(date, options) {
    const includeTime = options?.includeTime ?? true;
    const includeDay = options?.includeDay ?? true;
    const parts = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0ZS1ub3JtYWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9kYXRlLW5vcm1hbGl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7QUFvQkgsd0NBY0M7QUFLRCxvRUF1Q0M7QUFnSEQsZ0RBVUM7QUFLRCwwREFHQztBQUtELDRDQTZCQztBQWpPRDs7R0FFRztBQUNILFNBQWdCLGNBQWMsQ0FBQyxRQUFpQjtJQUM5QyxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO0lBRXZCLHNCQUFzQjtJQUN0QixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTlDLGtCQUFrQjtJQUNsQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFFdkUsT0FBTztRQUNMLEtBQUs7UUFDTCxTQUFTO1FBQ1QsUUFBUTtLQUNULENBQUM7QUFDSixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQiw0QkFBNEIsQ0FBQyxNQUFrQztJQUM3RSxNQUFNLE9BQU8sR0FBRyxjQUFjLEVBQUUsQ0FBQztJQUNqQyxNQUFNLGVBQWUsR0FBRyxNQUFNLEVBQUUsZUFBZSxJQUFJLFNBQVMsQ0FBQztJQUU3RCxrQ0FBa0M7SUFDbEMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBRXRELE1BQU0sTUFBTSxHQUFHOztZQUVMLE9BQU8sQ0FBQyxTQUFTLEtBQUssT0FBTyxDQUFDLEtBQUs7Ozs7OztvQ0FNWCxPQUFPLENBQUMsS0FBSyxpQkFBaUIsT0FBTyxDQUFDLFNBQVM7OztpQkFHbEUsZUFBZSxFQUFFO2NBQ3BCLE9BQU8sQ0FBQyxLQUFLOzs7O3NDQUlXLFlBQVksQ0FBQyxh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O0tBQ2hCLENBQUMsQ0FBQyxDQUFDO0lBRUosSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNoQixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pCLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRTtZQUMxQyxJQUFJLEVBQUUsU0FBUztZQUNmLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLE1BQU0sRUFBRSxJQUFJO1NBQ2IsQ0FBQyxDQUFDLENBQUM7SUFDTixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3pCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogRGF0ZSBOb3JtYWxpemVyIE1vZHVsZVxyXG4gKiBcclxuICogUHJvdmlkZXMgY29udGV4dCBhbmQgdXRpbGl0aWVzIGZvciBub3JtYWxpemluZyByZWxhdGl2ZSBkYXRlcy90aW1lc1xyXG4gKiBpbnRvIElTTyA4NjAxIGZvcm1hdC4gVXNlZCBieSBpbnRlbnQgZGV0ZWN0aW9uIHRvIGNvbnZlcnRcclxuICogXCJNb25kYXkgYXQgNlwiIOKGkiBcIjIwMjUtMTItMDlUMTg6MDA6MDBcIlxyXG4gKi9cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgRGF0ZUNvbnRleHQge1xyXG4gIHRvZGF5OiBzdHJpbmc7ICAgICAgICAgICAvLyBcIjIwMjUtMTItMDRcIlxyXG4gIGRheU9mV2Vlazogc3RyaW5nOyAgICAgICAvLyBcIldlZG5lc2RheVwiXHJcbiAgdGltZXpvbmU/OiBzdHJpbmc7ICAgICAgIC8vIFwiQW1lcmljYS9OZXdfWW9ya1wiXHJcbiAgYnVzaW5lc3NIb3Vycz86IHsgICAgICAgIC8vIEZvciBzbWFydCB0aW1lIGRlZmF1bHRzXHJcbiAgICBvcGVuVGltZT86IHN0cmluZzsgICAgIC8vIFwiMDU6MDBcIlxyXG4gICAgY2xvc2VUaW1lPzogc3RyaW5nOyAgICAvLyBcIjIzOjAwXCJcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE5vcm1hbGl6YXRpb25Qcm9tcHRDb25maWcge1xyXG4gIGluY2x1ZGVFeGFtcGxlcz86IGJvb2xlYW47XHJcbiAgYnVzaW5lc3NDb250ZXh0PzogJ2ZpdG5lc3MnIHwgJ21lZGljYWwnIHwgJ2dlbmVyYWwnO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IGN1cnJlbnQgZGF0ZSBjb250ZXh0IGZvciBMTE0gcHJvbXB0c1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldERhdGVDb250ZXh0KHRpbWV6b25lPzogc3RyaW5nKTogRGF0ZUNvbnRleHQge1xyXG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgXHJcbiAgLy8gRm9ybWF0IHRvZGF5J3MgZGF0ZVxyXG4gIGNvbnN0IHRvZGF5ID0gbm93LnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTtcclxuICBcclxuICAvLyBHZXQgZGF5IG9mIHdlZWtcclxuICBjb25zdCBkYXlPZldlZWsgPSBub3cudG9Mb2NhbGVEYXRlU3RyaW5nKCdlbi1VUycsIHsgd2Vla2RheTogJ2xvbmcnIH0pO1xyXG4gIFxyXG4gIHJldHVybiB7XHJcbiAgICB0b2RheSxcclxuICAgIGRheU9mV2VlayxcclxuICAgIHRpbWV6b25lXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEJ1aWxkIHRoZSBkYXRlIG5vcm1hbGl6YXRpb24gc2VjdGlvbiBmb3IgaW50ZW50IGRldGVjdGlvbiBwcm9tcHRcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBidWlsZERhdGVOb3JtYWxpemF0aW9uUHJvbXB0KGNvbmZpZz86IE5vcm1hbGl6YXRpb25Qcm9tcHRDb25maWcpOiBzdHJpbmcge1xyXG4gIGNvbnN0IGNvbnRleHQgPSBnZXREYXRlQ29udGV4dCgpO1xyXG4gIGNvbnN0IGJ1c2luZXNzQ29udGV4dCA9IGNvbmZpZz8uYnVzaW5lc3NDb250ZXh0IHx8ICdmaXRuZXNzJztcclxuICBcclxuICAvLyBCdXNpbmVzcy1zcGVjaWZpYyB0aW1lIGRlZmF1bHRzXHJcbiAgY29uc3QgdGltZURlZmF1bHRzID0gZ2V0VGltZURlZmF1bHRzKGJ1c2luZXNzQ29udGV4dCk7XHJcbiAgXHJcbiAgY29uc3QgcHJvbXB0ID0gYFxyXG7wn5eT77iPIEFQUE9JTlRNRU5UIERBVEUvVElNRSBOT1JNQUxJWkFUSU9OOlxyXG5UT0RBWSBJUzogJHtjb250ZXh0LmRheU9mV2Vla30sICR7Y29udGV4dC50b2RheX1cclxuXHJcbldoZW4gdXNlciBwcm92aWRlcyBzY2hlZHVsaW5nIGluZm8gKHByZWZlcnJlZERhdGUsIHByZWZlcnJlZFRpbWUpLCBBTFNPIGV4dHJhY3Q6XHJcbi0gbm9ybWFsaXplZERhdGVUaW1lOiBGdWxsIElTTyA4NjAxIGZvcm1hdCAoZS5nLiwgXCIyMDI1LTEyLTA5VDE4OjAwOjAwXCIpXHJcblxyXG5EQVRFIENBTENVTEFUSU9OIFJVTEVTOlxyXG4tIFwiTW9uZGF5XCIgPSBUaGUgTkVYVCBNb25kYXkgZnJvbSAke2NvbnRleHQudG9kYXl9IChpZiB0b2RheSBpcyAke2NvbnRleHQuZGF5T2ZXZWVrfSlcclxuLSBcInRoaXMgTW9uZGF5XCIgPSBUaGlzIHdlZWsncyBNb25kYXkgKHVzZSBuZXh0IHdlZWsgaWYgYWxyZWFkeSBwYXNzZWQpXHJcbi0gXCJuZXh0IE1vbmRheVwiID0gTW9uZGF5IG9mIE5FWFQgd2Vla1xyXG4tIFwidG9tb3Jyb3dcIiA9ICR7Z2V0VG9tb3Jyb3dEYXRlKCl9XHJcbi0gXCJ0b2RheVwiID0gJHtjb250ZXh0LnRvZGF5fVxyXG4tIFNwZWNpZmljIGRhdGVzIGxpa2UgXCIxMi8xNVwiIG9yIFwiMDMvMDMvMjZcIiA9IFBhcnNlIGRpcmVjdGx5XHJcblxyXG5USU1FIElOVEVSUFJFVEFUSU9OIFJVTEVTOlxyXG4tIFNpbmdsZSBudW1iZXIgXCI2XCIgb3IgXCI3XCIgPSBBc3N1bWUgJHt0aW1lRGVmYXVsdHMuZGVmYXVsdFBlcmlvZH0gKCR7dGltZURlZmF1bHRzLnJlYXNvbn0pXHJcbi0gXCI2cG1cIiBvciBcIjY6MDBwbVwiID0gMTg6MDBcclxuLSBcIjZhbVwiIG9yIFwiNjowMGFtXCIgPSAwNjowMFxyXG4tIFwibW9ybmluZ1wiID0gJHt0aW1lRGVmYXVsdHMubW9ybmluZ31cclxuLSBcImFmdGVybm9vblwiID0gJHt0aW1lRGVmYXVsdHMuYWZ0ZXJub29ufVxyXG4tIFwiZXZlbmluZ1wiID0gJHt0aW1lRGVmYXVsdHMuZXZlbmluZ31cclxuLSBcIjc6MzBcIiB3aXRob3V0IEFNL1BNID0gQXNzdW1lICR7dGltZURlZmF1bHRzLmRlZmF1bHRQZXJpb2R9XHJcblxyXG5PVVRQVVQgRk9STUFUOlxyXG4tIEFsd2F5cyB1c2UgMjQtaG91ciB0aW1lIGluIElTTyBmb3JtYXRcclxuLSBJbmNsdWRlIHNlY29uZHMgYXMgOjAwXHJcbi0gRXhhbXBsZTogXCIyMDI1LTEyLTA5VDE4OjAwOjAwXCJcclxuXHJcbiR7Y29uZmlnPy5pbmNsdWRlRXhhbXBsZXMgIT09IGZhbHNlID8gYnVpbGRFeGFtcGxlcyhjb250ZXh0KSA6ICcnfWA7XHJcblxyXG4gIHJldHVybiBwcm9tcHQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdGltZSBkZWZhdWx0cyBiYXNlZCBvbiBidXNpbmVzcyBjb250ZXh0XHJcbiAqL1xyXG5mdW5jdGlvbiBnZXRUaW1lRGVmYXVsdHMoY29udGV4dDogJ2ZpdG5lc3MnIHwgJ21lZGljYWwnIHwgJ2dlbmVyYWwnKToge1xyXG4gIGRlZmF1bHRQZXJpb2Q6IHN0cmluZztcclxuICByZWFzb246IHN0cmluZztcclxuICBtb3JuaW5nOiBzdHJpbmc7XHJcbiAgYWZ0ZXJub29uOiBzdHJpbmc7XHJcbiAgZXZlbmluZzogc3RyaW5nO1xyXG59IHtcclxuICBzd2l0Y2ggKGNvbnRleHQpIHtcclxuICAgIGNhc2UgJ2ZpdG5lc3MnOlxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGRlZmF1bHRQZXJpb2Q6ICdQTScsXHJcbiAgICAgICAgcmVhc29uOiAnbW9zdCBneW0gdmlzaXRzIGFyZSBhZnRlciB3b3JrJyxcclxuICAgICAgICBtb3JuaW5nOiAnMDY6MDAnLCAgLy8gRWFybHkgYmlyZHNcclxuICAgICAgICBhZnRlcm5vb246ICcxNDowMCcsXHJcbiAgICAgICAgZXZlbmluZzogJzE4OjAwJyAgIC8vIFBvc3Qtd29yayBydXNoXHJcbiAgICAgIH07XHJcbiAgICBjYXNlICdtZWRpY2FsJzpcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBkZWZhdWx0UGVyaW9kOiAnQU0nLFxyXG4gICAgICAgIHJlYXNvbjogJ21vc3QgbWVkaWNhbCBhcHBvaW50bWVudHMgYXJlIG1vcm5pbmcnLFxyXG4gICAgICAgIG1vcm5pbmc6ICcwOTowMCcsXHJcbiAgICAgICAgYWZ0ZXJub29uOiAnMTQ6MDAnLFxyXG4gICAgICAgIGV2ZW5pbmc6ICcxNzowMCdcclxuICAgICAgfTtcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgZGVmYXVsdFBlcmlvZDogJ1BNJyxcclxuICAgICAgICByZWFzb246ICdkZWZhdWx0IGFzc3VtcHRpb24nLFxyXG4gICAgICAgIG1vcm5pbmc6ICcwOTowMCcsXHJcbiAgICAgICAgYWZ0ZXJub29uOiAnMTQ6MDAnLFxyXG4gICAgICAgIGV2ZW5pbmc6ICcxODowMCdcclxuICAgICAgfTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdG9tb3Jyb3cncyBkYXRlIHN0cmluZ1xyXG4gKi9cclxuZnVuY3Rpb24gZ2V0VG9tb3Jyb3dEYXRlKCk6IHN0cmluZyB7XHJcbiAgY29uc3QgdG9tb3Jyb3cgPSBuZXcgRGF0ZSgpO1xyXG4gIHRvbW9ycm93LnNldERhdGUodG9tb3Jyb3cuZ2V0RGF0ZSgpICsgMSk7XHJcbiAgcmV0dXJuIHRvbW9ycm93LnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEJ1aWxkIGV4YW1wbGVzIHNlY3Rpb24gZm9yIHRoZSBwcm9tcHRcclxuICovXHJcbmZ1bmN0aW9uIGJ1aWxkRXhhbXBsZXMoY29udGV4dDogRGF0ZUNvbnRleHQpOiBzdHJpbmcge1xyXG4gIC8vIENhbGN1bGF0ZSBhY3R1YWwgZXhhbXBsZSBkYXRlc1xyXG4gIGNvbnN0IG5leHRNb25kYXkgPSBnZXROZXh0RGF5T2ZXZWVrKDEpOyAvLyAxID0gTW9uZGF5XHJcbiAgY29uc3QgbmV4dEZyaWRheSA9IGdldE5leHREYXlPZldlZWsoNSk7IC8vIDUgPSBGcmlkYXlcclxuICBjb25zdCB0b21vcnJvdyA9IGdldFRvbW9ycm93RGF0ZSgpO1xyXG4gIFxyXG4gIHJldHVybiBgXHJcbkVYQU1QTEVTIChiYXNlZCBvbiB0b2RheSBiZWluZyAke2NvbnRleHQuZGF5T2ZXZWVrfSwgJHtjb250ZXh0LnRvZGF5fSk6XHJcblxyXG5Vc2VyOiBcIk1vbmRheSBhdCA2XCJcclxu4oaSIGV4dHJhY3RlZERhdGE6IFtcclxuICAgIHtmaWVsZDogXCJwcmVmZXJyZWREYXRlXCIsIHZhbHVlOiBcIk1vbmRheVwifSxcclxuICAgIHtmaWVsZDogXCJwcmVmZXJyZWRUaW1lXCIsIHZhbHVlOiBcIjZcIn0sXHJcbiAgICB7ZmllbGQ6IFwibm9ybWFsaXplZERhdGVUaW1lXCIsIHZhbHVlOiBcIiR7bmV4dE1vbmRheX1UMTg6MDA6MDBcIn1cclxuICBdXHJcblxyXG5Vc2VyOiBcInRvbW9ycm93IGF0IDc6MzBwbVwiXHJcbuKGkiBleHRyYWN0ZWREYXRhOiBbXHJcbiAgICB7ZmllbGQ6IFwicHJlZmVycmVkRGF0ZVwiLCB2YWx1ZTogXCJ0b21vcnJvd1wifSxcclxuICAgIHtmaWVsZDogXCJwcmVmZXJyZWRUaW1lXCIsIHZhbHVlOiBcIjc6MzBwbVwifSxcclxuICAgIHtmaWVsZDogXCJub3JtYWxpemVkRGF0ZVRpbWVcIiwgdmFsdWU6IFwiJHt0b21vcnJvd31UMTk6MzA6MDBcIn1cclxuICBdXHJcblxyXG5Vc2VyOiBcIm5leHQgRnJpZGF5IG1vcm5pbmdcIlxyXG7ihpIgZXh0cmFjdGVkRGF0YTogW1xyXG4gICAge2ZpZWxkOiBcInByZWZlcnJlZERhdGVcIiwgdmFsdWU6IFwibmV4dCBGcmlkYXlcIn0sXHJcbiAgICB7ZmllbGQ6IFwicHJlZmVycmVkVGltZVwiLCB2YWx1ZTogXCJtb3JuaW5nXCJ9LFxyXG4gICAge2ZpZWxkOiBcIm5vcm1hbGl6ZWREYXRlVGltZVwiLCB2YWx1ZTogXCIke25leHRGcmlkYXl9VDA2OjAwOjAwXCJ9XHJcbiAgXVxyXG5cclxuVXNlcjogXCJIb3cgYWJvdXQgNTozMD9cIlxyXG7ihpIgZXh0cmFjdGVkRGF0YTogW1xyXG4gICAge2ZpZWxkOiBcInByZWZlcnJlZFRpbWVcIiwgdmFsdWU6IFwiNTozMFwifSxcclxuICAgIHtmaWVsZDogXCJub3JtYWxpemVkRGF0ZVRpbWVcIiwgdmFsdWU6IG51bGx9XHJcbiAgXVxyXG4gIChub3JtYWxpemVkRGF0ZVRpbWUgaXMgbnVsbCBiZWNhdXNlIHdlIGRvbid0IGhhdmUgdGhlIGRhdGUgeWV0KWA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgdGhlIG5leHQgb2NjdXJyZW5jZSBvZiBhIHNwZWNpZmljIGRheSBvZiB3ZWVrXHJcbiAqIEBwYXJhbSBkYXlPZldlZWsgMCA9IFN1bmRheSwgMSA9IE1vbmRheSwgLi4uLCA2ID0gU2F0dXJkYXlcclxuICovXHJcbmZ1bmN0aW9uIGdldE5leHREYXlPZldlZWsoZGF5T2ZXZWVrOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKTtcclxuICBjb25zdCB0b2RheURheSA9IHRvZGF5LmdldERheSgpO1xyXG4gIFxyXG4gIGxldCBkYXlzVW50aWwgPSBkYXlPZldlZWsgLSB0b2RheURheTtcclxuICBpZiAoZGF5c1VudGlsIDw9IDApIHtcclxuICAgIGRheXNVbnRpbCArPSA3OyAvLyBOZXh0IHdlZWtcclxuICB9XHJcbiAgXHJcbiAgY29uc3QgdGFyZ2V0RGF0ZSA9IG5ldyBEYXRlKHRvZGF5KTtcclxuICB0YXJnZXREYXRlLnNldERhdGUodG9kYXkuZ2V0RGF0ZSgpICsgZGF5c1VudGlsKTtcclxuICBcclxuICByZXR1cm4gdGFyZ2V0RGF0ZS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZSBhbiBJU08gZGF0ZXRpbWUgc3RyaW5nXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNWYWxpZElTT0RhdGVUaW1lKGRhdGVUaW1lU3RyOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XHJcbiAgaWYgKCFkYXRlVGltZVN0cikgcmV0dXJuIGZhbHNlO1xyXG4gIFxyXG4gIC8vIENoZWNrIGZvcm1hdDogWVlZWS1NTS1ERFRISDpNTTpTU1xyXG4gIGNvbnN0IGlzb1JlZ2V4ID0gL15cXGR7NH0tXFxkezJ9LVxcZHsyfVRcXGR7Mn06XFxkezJ9OlxcZHsyfSQvO1xyXG4gIGlmICghaXNvUmVnZXgudGVzdChkYXRlVGltZVN0cikpIHJldHVybiBmYWxzZTtcclxuICBcclxuICAvLyBDaGVjayBpZiBpdCdzIGEgdmFsaWQgZGF0ZVxyXG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShkYXRlVGltZVN0cik7XHJcbiAgcmV0dXJuICFpc05hTihkYXRlLmdldFRpbWUoKSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQYXJzZSBhIG5vcm1hbGl6ZWQgZGF0ZXRpbWUgYW5kIHJldHVybiBhIERhdGUgb2JqZWN0XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VOb3JtYWxpemVkRGF0ZVRpbWUoZGF0ZVRpbWVTdHI6IHN0cmluZyk6IERhdGUgfCBudWxsIHtcclxuICBpZiAoIWlzVmFsaWRJU09EYXRlVGltZShkYXRlVGltZVN0cikpIHJldHVybiBudWxsO1xyXG4gIHJldHVybiBuZXcgRGF0ZShkYXRlVGltZVN0cik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGb3JtYXQgYSBEYXRlIGZvciBkaXNwbGF5XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Rm9yRGlzcGxheShkYXRlOiBEYXRlLCBvcHRpb25zPzoge1xyXG4gIGluY2x1ZGVUaW1lPzogYm9vbGVhbjtcclxuICBpbmNsdWRlRGF5PzogYm9vbGVhbjtcclxufSk6IHN0cmluZyB7XHJcbiAgY29uc3QgaW5jbHVkZVRpbWUgPSBvcHRpb25zPy5pbmNsdWRlVGltZSA/PyB0cnVlO1xyXG4gIGNvbnN0IGluY2x1ZGVEYXkgPSBvcHRpb25zPy5pbmNsdWRlRGF5ID8/IHRydWU7XHJcbiAgXHJcbiAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XHJcbiAgXHJcbiAgaWYgKGluY2x1ZGVEYXkpIHtcclxuICAgIHBhcnRzLnB1c2goZGF0ZS50b0xvY2FsZURhdGVTdHJpbmcoJ2VuLVVTJywgeyB3ZWVrZGF5OiAnbG9uZycgfSkpO1xyXG4gIH1cclxuICBcclxuICBwYXJ0cy5wdXNoKGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKCdlbi1VUycsIHsgXHJcbiAgICBtb250aDogJ2xvbmcnLCBcclxuICAgIGRheTogJ251bWVyaWMnLFxyXG4gICAgeWVhcjogJ251bWVyaWMnXHJcbiAgfSkpO1xyXG4gIFxyXG4gIGlmIChpbmNsdWRlVGltZSkge1xyXG4gICAgcGFydHMucHVzaCgnYXQnKTtcclxuICAgIHBhcnRzLnB1c2goZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcoJ2VuLVVTJywgeyBcclxuICAgICAgaG91cjogJ251bWVyaWMnLCBcclxuICAgICAgbWludXRlOiAnMi1kaWdpdCcsXHJcbiAgICAgIGhvdXIxMjogdHJ1ZSBcclxuICAgIH0pKTtcclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIHBhcnRzLmpvaW4oJyAnKTtcclxufVxyXG5cclxuIl19