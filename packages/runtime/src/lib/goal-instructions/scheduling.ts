/**
 * Scheduling Goal Instructions
 * 
 * Smart handling for appointment scheduling:
 * - Uses businessHours from company info to offer real slots
 * - Asks about time preference first (morning/evening)
 * - Offers specific days/times based on preference
 */

import type { GoalInstructionContext, GoalInstruction } from './index.js';

interface TimeSlot {
  day: string;
  times: string[];
}

interface BusinessHours {
  [day: string]: Array<{ from: string; to: string }>;
}

export function getSchedulingInstruction(context: GoalInstructionContext): GoalInstruction {
  const { fieldsNeeded, fieldsCaptured, companyInfo, userName, lastUserMessage, detectedIntent } = context;
  
  const needsDate = fieldsNeeded.includes('preferredDate');
  const needsTime = fieldsNeeded.includes('preferredTime');
  
  // 🎯 INTENT-BASED LOGIC: Detect if user is rejecting/requesting alternatives
  const userMessage = (lastUserMessage || '').toLowerCase();
  const isRejection = detectedIntent === 'objection' || 
    /\blater\b|\btoo early\b|\btoo late\b|\bcan't do\b|\bdoesn't work\b|\bdon't work\b|\bnone of those\b|\bother\b|\balternative/i.test(userMessage);
  const wantsLater = /\blater\b|\btoo early\b|\bafter\b/i.test(userMessage);
  const wantsEarlier = /\bearlier\b|\btoo late\b|\bbefore\b/i.test(userMessage);
  
  // Extract any hour mentioned in the user's message
  const hourMatch = userMessage.match(/\b(\d{1,2})\s*(?:pm|am)?|\buntil\s*(\d{1,2})|\bafter\s*(\d{1,2})|\bat\s*(\d{1,2})/i);
  const mentionedHour = hourMatch ? parseInt(hourMatch[1] || hourMatch[2] || hourMatch[3] || hourMatch[4]) : null;
  
  // Handle both raw values and {value: ...} objects from LLM extraction
  const getActualValue = (field: any): any => {
    if (field && typeof field === 'object' && 'value' in field) {
      return field.value;
    }
    return field;
  };
  
  const dateValue = getActualValue(fieldsCaptured.preferredDate);
  const timeValue = getActualValue(fieldsCaptured.preferredTime);
  
  // Validate that dateValue is actually a date-like string (contains day name or date pattern)
  const isValidDateValue = (val: any): boolean => {
    if (!val || val === 'null' || val === null) return false;
    const str = String(val).toLowerCase();
    // Check for day names
    const dayPatterns = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'today', 'tomorrow', 'next'];
    if (dayPatterns.some(d => str.includes(d))) return true;
    // Check for date patterns (numbers that could be dates)
    if (/\d{1,2}(\/|-)\d{1,2}/.test(str)) return true;
    // Check for ordinals like "5th", "10th"
    if (/\d+(st|nd|rd|th)/.test(str)) return true;
    return false;
  };
  
  // Validate that timeValue is a SPECIFIC time (not vague like "evening")
  // This should match the validation in agent.ts for goal completion
  const isSpecificTimeValue = (val: any): boolean => {
    if (!val || val === 'null' || val === null) return false;
    const str = String(val).toLowerCase().trim();
    
    // SPECIFIC times: "6pm", "7:30", "18:00", "7:30pm"
    const isSpecific = /^\d{1,2}\s*(am|pm|:\d{2})$/i.test(str) || 
                       /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(str);
    
    return isSpecific;
  };
  
  // Check if we have a time PREFERENCE (vague like "evening" - useful for offering slots)
  const hasTimePreference = (val: any): boolean => {
    if (!val || val === 'null' || val === null) return false;
    const str = String(val).toLowerCase();
    // Basic time patterns
    const timePatterns = ['morning', 'evening', 'afternoon', 'night', 'am', 'pm', ':'];
    if (timePatterns.some(t => str.includes(t))) return true;
    // Relative time patterns like "later than 6", "after 5", "before 10"
    if (/later|after|before|around|about/.test(str) && /\d/.test(str)) return true;
    // Just a number (could be "6" meaning 6pm)
    if (/^\d{1,2}$/.test(str.trim())) return true;
    // Handle "mostly" prefix - if it's just "mostly", check if context suggests evening
    // This is a fallback - ideally extraction should get the full "mostly nights"
    if (str === 'mostly') return false; // Reject bare "mostly" - need more context
    return false;
  };
  
  // Normalize time value - convert variations to standard form
  const normalizeTimeValue = (val: string): string => {
    const str = val.toLowerCase();
    if (str.includes('night')) return 'evening';
    if (str.includes('evening')) return 'evening';
    if (str.includes('morning') || str.includes('early')) return 'morning';
    if (str.includes('afternoon')) return 'afternoon';
    return val;
  };
  
  const hasDate = isValidDateValue(dateValue);
  const hasSpecificTime = isSpecificTimeValue(timeValue);  // SPECIFIC time like "7pm"
  const hasVagueTime = hasTimePreference(timeValue);       // Vague preference like "evening"
  
  console.log(`📅 Scheduling validation: dateValue="${dateValue}" (valid: ${hasDate}), timeValue="${timeValue}" (specific: ${hasSpecificTime}, vague: ${hasVagueTime})`);
  console.log(`📅 User intent: isRejection=${isRejection}, wantsLater=${wantsLater}, wantsEarlier=${wantsEarlier}, mentionedHour=${mentionedHour}`);
  
  const businessHours = (companyInfo as any)?.businessHours as BusinessHours | undefined;
  const name = userName || 'friend';
  
  // 🎯 PRIORITY CASE: User rejected offered times - offer DIFFERENT times
  if (isRejection && businessHours) {
    // Determine what hour to start from
    let minHour = mentionedHour || 18; // Default to 6pm if no hour mentioned
    
    // Convert to 24-hour format if needed (assume PM for small numbers in evening context)
    if (minHour >= 1 && minHour <= 12) {
      minHour = minHour + 12; // 6 -> 18, 7 -> 19, etc.
    }
    
    if (wantsLater) {
      // User wants LATER times
      const laterSlots = getAvailableSlotsAfterHour(businessHours, minHour);
      
      if (laterSlots.length > 0) {
        const slotOptions = formatSlotOptions(laterSlots);
        return {
          instruction: `User rejected earlier times and wants LATER options (after ${formatHour(minHour)}).
Offer these available slots: ${slotOptions}
Be helpful and accommodating - they have schedule constraints!`,
          examples: [
            `"No problem! How about ${laterSlots[0]?.day} at ${laterSlots[0]?.times[0] || '7pm'}?"`,
            `"I got you! Later slots: ${slotOptions}. Which works?"`,
            `"Totally understand! What about ${slotOptions}?"`
          ],
          targetFields: ['preferredDate']
        };
      } else {
        return {
          instruction: `User wants later times but we don't have slots after ${formatHour(minHour)}.
Apologize and ask what day might work better, or suggest our latest available times.`,
          examples: [
            `"Our latest evening slots are around 8-9pm. Would a different day work better?"`,
            `"I hear you! What day has more flexibility for you?"`,
            `"Let me see what else we can do - what day works best?"`
          ],
          targetFields: ['preferredDate']
        };
      }
    } else if (wantsEarlier) {
      // User wants EARLIER times
      const earlierSlots = getAvailableSlotsBeforeHour(businessHours, minHour);
      
      if (earlierSlots.length > 0) {
        const slotOptions = formatSlotOptions(earlierSlots);
        return {
          instruction: `User wants EARLIER times (before ${formatHour(minHour)}).
Offer these available slots: ${slotOptions}`,
          examples: [
            `"Earlier works! How about ${earlierSlots[0]?.day} at ${earlierSlots[0]?.times[0]}?"`,
            `"Got it! I can do ${slotOptions}. Pick your favorite!"`,
          ],
          targetFields: ['preferredDate']
        };
      }
    } else {
      // General rejection - offer different times/days
      return {
        instruction: `User rejected the offered times. Ask what times/days would work better for them.
Be accommodating and helpful!`,
        examples: [
          `"No worries! What times work better for your schedule?"`,
          `"I hear you! When are you usually free?"`,
          `"Let's find something that works - what's your ideal time?"`,
        ],
        targetFields: ['preferredTime', 'preferredDate']
      };
    }
  }
  
  // Case 1: No preference at all → Ask morning/evening preference
  if (!hasVagueTime && !hasDate) {
    return {
      instruction: `Ask about their time preference - are they a morning person or evening person?
This helps narrow down available slots.`,
      examples: [
        `"Are you more of a morning person or evening person, ${name}?"`,
        `"What works better for you - mornings or evenings?"`,
        `"Do you prefer early bird sessions or after-work workouts?"`
      ],
      targetFields: ['preferredTime']
    };
  }
  
  // Case 2: Have time preference (vague like "evening"), need date → Offer specific slots
  if (hasVagueTime && !hasDate && businessHours) {
    const timePreference = String(timeValue).toLowerCase();
    
    // Check if user is asking for LATER times (rejection of earlier offers)
    const laterMatch = timePreference.match(/later\s*(?:than)?\s*(\d+)|after\s*(\d+)/);
    if (laterMatch) {
      let minHour = parseInt(laterMatch[1] || laterMatch[2]);
      // If hour is 1-12 and we're in evening context, assume PM (add 12)
      // "after 6" in evening context means after 6pm (18:00), not 6am
      if (minHour >= 1 && minHour <= 12) {
        minHour = minHour + 12; // Convert to 24-hour format (6 -> 18)
      }
      const laterSlots = getAvailableSlotsAfterHour(businessHours, minHour);
      
      if (laterSlots.length > 0) {
        const slotOptions = formatSlotOptions(laterSlots);
        return {
          instruction: `User wants times LATER than ${minHour}. Offer available slots after that time.
Available options: ${slotOptions}
Ask which day/time works for them.`,
          examples: [
            `"No problem! I've got ${slotOptions}. Which works?"`,
            `"Later works! How about ${slotOptions}?"`,
            `"Got it - ${laterSlots[0]?.day} at ${laterSlots[0]?.times[0]} or ${laterSlots[0]?.times[1] || laterSlots[0]?.times[0]}?"`
          ],
          targetFields: ['preferredDate']
        };
      } else {
        return {
          instruction: `No slots available after ${minHour}. Ask what day works best.`,
          examples: [
            `"Hmm, we close before then most days. What day works best for you?"`,
            `"Let me check - what day were you thinking?"`,
            `"Our latest slots vary by day. Which day works for you?"`
          ],
          targetFields: ['preferredDate']
        };
      }
    }
    
    const slots = getAvailableSlotsForPreference(businessHours, timePreference);
    
    if (slots.length > 0) {
      const slotOptions = formatSlotOptions(slots);
      return {
        instruction: `User prefers "${timeValue}". Offer specific available slots.
Available options based on business hours: ${slotOptions}
Ask which day/time works for them.`,
        examples: [
          `"We've got ${slotOptions}. Which works for you?"`,
          `"I can do ${slotOptions}. What's your pick?"`,
          `"How about ${slots[0]?.day} at ${slots[0]?.times[0]}? Or I've got other times too!"`
        ],
        targetFields: ['preferredDate']
      };
    } else {
      // No slots match preference, ask for specific day
      return {
        instruction: `Ask what specific day works for them.`,
        examples: [
          `"What day works best for you this week?"`,
          `"When were you thinking - this week or next?"`,
          `"What day should we lock in?"`
        ],
        targetFields: ['preferredDate']
      };
    }
  }
  
  // Case 3: Have date, need SPECIFIC time → Offer times for that day
  // This triggers when we have a date but only a vague time preference (or no time)
  if (hasDate && !hasSpecificTime && businessHours) {
    // If they have a vague preference like "evening", filter slots by that
    const daySlots = hasVagueTime 
      ? getTimesForDayFiltered(businessHours, dateValue, String(timeValue))
      : getTimesForDay(businessHours, dateValue);
    
    if (daySlots.length > 0) {
      const timeOptions = daySlots.join(', ');
      const contextNote = hasVagueTime ? ` (filtered for ${timeValue})` : '';
      return {
        instruction: `User picked "${dateValue}"${contextNote}. They need a SPECIFIC time - offer available slots.
Available times: ${timeOptions}
Ask them to pick a specific time like "7pm" or "7:30".`,
        examples: [
          `"On ${dateValue} I've got ${timeOptions}. What time works?"`,
          `"Perfect! For ${dateValue}, how about ${daySlots[0]} or ${daySlots[1] || daySlots[0]}?"`,
          `"${dateValue} works! I can do ${timeOptions} - which one?"`
        ],
        targetFields: ['preferredTime']
      };
    }
  }
  
  // Case 4: Have both date AND SPECIFIC time → Confirm
  if (hasDate && hasSpecificTime) {
    return {
      instruction: `Both date and SPECIFIC time are captured. Confirm the appointment.`,
      examples: [
        `"Locked in for ${dateValue} at ${timeValue}!"`,
        `"You're all set - see you ${dateValue} at ${timeValue}!"`
      ],
      targetFields: []
    };
  }
  
  // Fallback: No business hours available, just ask generically
  if (needsDate && needsTime && !hasDate && !hasVagueTime) {
    return {
      instruction: `Ask for both preferred date and time.`,
      examples: [
        `"When works for you? Give me a day and time!"`,
        `"What day and time should we lock in?"`,
        `"When are you free to come in?"`
      ],
      targetFields: ['preferredDate', 'preferredTime']
    };
  }
  
  // Generic fallback
  const stillNeeded = fieldsNeeded.filter(f => !fieldsCaptured[f]);
  return {
    instruction: `Ask for: ${stillNeeded.join(' and ')}.`,
    targetFields: stillNeeded
  };
}

/**
 * Get available slots based on time preference (morning/evening)
 */
function getAvailableSlotsForPreference(businessHours: BusinessHours, preference: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  // Determine time range based on preference
  const isMorning = preference.includes('morning') || preference.includes('am') || preference.includes('early');
  const isEvening = preference.includes('evening') || preference.includes('pm') || preference.includes('after work') || preference.includes('night');
  const isAfternoon = preference.includes('afternoon') || preference.includes('lunch');
  
  for (const day of dayOrder) {
    const hours = businessHours[day];
    if (!hours || hours.length === 0) continue;
    
    const matchingTimes: string[] = [];
    
    for (const slot of hours) {
      const fromHour = parseInt(slot.from.split(':')[0]);
      const toHour = parseInt(slot.to.split(':')[0]);
      
      // Generate sample times based on preference
      if (isMorning && fromHour < 12) {
        // Morning slots (before noon)
        for (let h = Math.max(fromHour, 6); h < Math.min(toHour, 12); h += 1) {
          matchingTimes.push(formatHour(h));
        }
      } else if (isEvening && toHour >= 17) {
        // Evening slots (5pm+)
        for (let h = Math.max(fromHour, 17); h < toHour && h <= 21; h += 1) {
          matchingTimes.push(formatHour(h));
        }
      } else if (isAfternoon && fromHour <= 14 && toHour >= 12) {
        // Afternoon slots (12-5pm)
        for (let h = Math.max(fromHour, 12); h < Math.min(toHour, 17); h += 1) {
          matchingTimes.push(formatHour(h));
        }
      } else if (!isMorning && !isEvening && !isAfternoon) {
        // No specific preference - just show a few options
        const midpoint = Math.floor((fromHour + toHour) / 2);
        matchingTimes.push(formatHour(midpoint));
      }
    }
    
    if (matchingTimes.length > 0) {
      // Limit to 2-3 times per day to avoid overwhelming
      slots.push({
        day: capitalizeFirst(day),
        times: matchingTimes.slice(0, 3)
      });
    }
  }
  
  // Return all available days (let user pick from more options)
  return slots;
}

/**
 * Get available times for a specific day
 */
function getTimesForDay(businessHours: BusinessHours, dateStr: string): string[] {
  // Try to parse the day from the date string
  const dayMap: Record<string, string> = {
    'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday',
    'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday'
  };
  
  const lowerDate = dateStr.toLowerCase();
  let targetDay: string | undefined;
  
  for (const [abbrev, full] of Object.entries(dayMap)) {
    if (lowerDate.includes(abbrev) || lowerDate.includes(full)) {
      targetDay = full;
      break;
    }
  }
  
  if (!targetDay) return [];
  
  const hours = businessHours[targetDay];
  if (!hours || hours.length === 0) return [];
  
  const times: string[] = [];
  for (const slot of hours) {
    const fromHour = parseInt(slot.from.split(':')[0]);
    const toHour = parseInt(slot.to.split(':')[0]);
    
    // Generate a few sample times
    for (let h = fromHour; h < toHour && times.length < 5; h += 2) {
      times.push(formatHour(h));
    }
  }
  
  return times;
}

/**
 * Get available times for a specific day, filtered by time preference (morning/evening)
 */
function getTimesForDayFiltered(businessHours: BusinessHours, dateStr: string, timePreference: string): string[] {
  const allTimes = getTimesForDay(businessHours, dateStr);
  if (allTimes.length === 0) return allTimes;
  
  const pref = timePreference.toLowerCase();
  const isEvening = pref.includes('evening') || pref.includes('night') || pref.includes('after');
  const isMorning = pref.includes('morning') || pref.includes('early');
  const isAfternoon = pref.includes('afternoon');
  
  return allTimes.filter(time => {
    const hour = parseTimeToHour(time);
    if (isEvening) return hour >= 17; // 5pm and later
    if (isMorning) return hour < 12;  // Before noon
    if (isAfternoon) return hour >= 12 && hour < 17; // 12pm - 5pm
    return true; // No filter
  });
}

/**
 * Parse a time string like "6pm" or "10am" to 24-hour number
 */
function parseTimeToHour(timeStr: string): number {
  const lower = timeStr.toLowerCase();
  const match = lower.match(/(\d+)\s*(am|pm)?/);
  if (!match) return 12;
  
  let hour = parseInt(match[1]);
  const isPm = match[2] === 'pm';
  
  if (isPm && hour < 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  
  return hour;
}

/**
 * Format hour as readable time (e.g., "6pm", "10am")
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Format slot options as readable string
 */
function formatSlotOptions(slots: TimeSlot[]): string {
  return slots.map(s => `${s.day} at ${s.times.slice(0, 2).join(' or ')}`).join(', ');
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get available slots AFTER a specific hour (for "later than X" requests)
 * @param skipDays - Days to skip (already offered and rejected)
 */
function getAvailableSlotsAfterHour(businessHours: BusinessHours, minHour: number, skipDays: string[] = []): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  for (const day of dayOrder) {
    // Skip days that were already offered
    if (skipDays.some(d => d.toLowerCase() === day.toLowerCase())) continue;
    
    const hours = businessHours[day];
    if (!hours || hours.length === 0) continue;
    
    const matchingTimes: string[] = [];
    
    for (const slot of hours) {
      const fromHour = parseInt(slot.from.split(':')[0]);
      const toHour = parseInt(slot.to.split(':')[0]);
      
      // Only include times AFTER the minimum hour
      const startHour = Math.max(fromHour, minHour + 1); // +1 because "later than 6" means after 6
      
      if (startHour < toHour) {
        for (let h = startHour; h < toHour && matchingTimes.length < 3; h += 1) {
          matchingTimes.push(formatHour(h));
        }
      }
    }
    
    if (matchingTimes.length > 0) {
      slots.push({
        day: capitalizeFirst(day),
        times: matchingTimes.slice(0, 3)
      });
    }
  }
  
  // Return all available days
  return slots;
}

/**
 * Get available slots BEFORE a specific hour (for "earlier" requests)
 */
function getAvailableSlotsBeforeHour(businessHours: BusinessHours, maxHour: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  for (const day of dayOrder) {
    const hours = businessHours[day];
    if (!hours || hours.length === 0) continue;
    
    const matchingTimes: string[] = [];
    
    for (const slot of hours) {
      const fromHour = parseInt(slot.from.split(':')[0]);
      const toHour = parseInt(slot.to.split(':')[0]);
      
      // Only include times BEFORE the maximum hour
      const endHour = Math.min(toHour, maxHour);
      
      if (fromHour < endHour) {
        for (let h = fromHour; h < endHour && matchingTimes.length < 3; h += 1) {
          matchingTimes.push(formatHour(h));
        }
      }
    }
    
    if (matchingTimes.length > 0) {
      slots.push({
        day: capitalizeFirst(day),
        times: matchingTimes.slice(0, 3)
      });
    }
  }
  
  return slots;
}

