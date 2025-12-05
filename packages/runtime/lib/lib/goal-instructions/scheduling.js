"use strict";
/**
 * Scheduling Goal Instructions
 *
 * Smart handling for appointment scheduling:
 * - Uses businessHours from company info to offer real slots
 * - Asks about time preference first (morning/evening)
 * - Offers specific days/times based on preference
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchedulingInstruction = getSchedulingInstruction;
function getSchedulingInstruction(context) {
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
    const getActualValue = (field) => {
        if (field && typeof field === 'object' && 'value' in field) {
            return field.value;
        }
        return field;
    };
    const dateValue = getActualValue(fieldsCaptured.preferredDate);
    const timeValue = getActualValue(fieldsCaptured.preferredTime);
    // Validate that dateValue is actually a date-like string (contains day name or date pattern)
    const isValidDateValue = (val) => {
        if (!val || val === 'null' || val === null)
            return false;
        const str = String(val).toLowerCase();
        // Check for day names
        const dayPatterns = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'today', 'tomorrow', 'next'];
        if (dayPatterns.some(d => str.includes(d)))
            return true;
        // Check for date patterns (numbers that could be dates)
        if (/\d{1,2}(\/|-)\d{1,2}/.test(str))
            return true;
        // Check for ordinals like "5th", "10th"
        if (/\d+(st|nd|rd|th)/.test(str))
            return true;
        return false;
    };
    // Validate that timeValue is a SPECIFIC time (not vague like "evening")
    // This should match the validation in agent.ts for goal completion
    const isSpecificTimeValue = (val) => {
        if (!val || val === 'null' || val === null)
            return false;
        const str = String(val).toLowerCase().trim();
        // SPECIFIC times: "6pm", "7:30", "18:00", "7:30pm"
        const isSpecific = /^\d{1,2}\s*(am|pm|:\d{2})$/i.test(str) ||
            /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(str);
        return isSpecific;
    };
    // Check if we have a time PREFERENCE (vague like "evening" - useful for offering slots)
    const hasTimePreference = (val) => {
        if (!val || val === 'null' || val === null)
            return false;
        const str = String(val).toLowerCase();
        // Basic time patterns
        const timePatterns = ['morning', 'evening', 'afternoon', 'night', 'am', 'pm', ':'];
        if (timePatterns.some(t => str.includes(t)))
            return true;
        // Relative time patterns like "later than 6", "after 5", "before 10"
        if (/later|after|before|around|about/.test(str) && /\d/.test(str))
            return true;
        // Just a number (could be "6" meaning 6pm)
        if (/^\d{1,2}$/.test(str.trim()))
            return true;
        // Handle "mostly" prefix - if it's just "mostly", check if context suggests evening
        // This is a fallback - ideally extraction should get the full "mostly nights"
        if (str === 'mostly')
            return false; // Reject bare "mostly" - need more context
        return false;
    };
    // Normalize time value - convert variations to standard form
    const normalizeTimeValue = (val) => {
        const str = val.toLowerCase();
        if (str.includes('night'))
            return 'evening';
        if (str.includes('evening'))
            return 'evening';
        if (str.includes('morning') || str.includes('early'))
            return 'morning';
        if (str.includes('afternoon'))
            return 'afternoon';
        return val;
    };
    const hasDate = isValidDateValue(dateValue);
    const hasSpecificTime = isSpecificTimeValue(timeValue); // SPECIFIC time like "7pm"
    const hasVagueTime = hasTimePreference(timeValue); // Vague preference like "evening"
    console.log(`📅 Scheduling validation: dateValue="${dateValue}" (valid: ${hasDate}), timeValue="${timeValue}" (specific: ${hasSpecificTime}, vague: ${hasVagueTime})`);
    console.log(`📅 User intent: isRejection=${isRejection}, wantsLater=${wantsLater}, wantsEarlier=${wantsEarlier}, mentionedHour=${mentionedHour}`);
    const businessHours = companyInfo?.businessHours;
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
            }
            else {
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
        }
        else if (wantsEarlier) {
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
        }
        else {
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
            }
            else {
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
        }
        else {
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
function getAvailableSlotsForPreference(businessHours, preference) {
    const slots = [];
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    // Determine time range based on preference
    const isMorning = preference.includes('morning') || preference.includes('am') || preference.includes('early');
    const isEvening = preference.includes('evening') || preference.includes('pm') || preference.includes('after work') || preference.includes('night');
    const isAfternoon = preference.includes('afternoon') || preference.includes('lunch');
    for (const day of dayOrder) {
        const hours = businessHours[day];
        if (!hours || hours.length === 0)
            continue;
        const matchingTimes = [];
        for (const slot of hours) {
            const fromHour = parseInt(slot.from.split(':')[0]);
            const toHour = parseInt(slot.to.split(':')[0]);
            // Generate sample times based on preference
            if (isMorning && fromHour < 12) {
                // Morning slots (before noon)
                for (let h = Math.max(fromHour, 6); h < Math.min(toHour, 12); h += 1) {
                    matchingTimes.push(formatHour(h));
                }
            }
            else if (isEvening && toHour >= 17) {
                // Evening slots (5pm+)
                for (let h = Math.max(fromHour, 17); h < toHour && h <= 21; h += 1) {
                    matchingTimes.push(formatHour(h));
                }
            }
            else if (isAfternoon && fromHour <= 14 && toHour >= 12) {
                // Afternoon slots (12-5pm)
                for (let h = Math.max(fromHour, 12); h < Math.min(toHour, 17); h += 1) {
                    matchingTimes.push(formatHour(h));
                }
            }
            else if (!isMorning && !isEvening && !isAfternoon) {
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
function getTimesForDay(businessHours, dateStr) {
    // Try to parse the day from the date string
    const dayMap = {
        'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday',
        'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday'
    };
    const lowerDate = dateStr.toLowerCase();
    let targetDay;
    for (const [abbrev, full] of Object.entries(dayMap)) {
        if (lowerDate.includes(abbrev) || lowerDate.includes(full)) {
            targetDay = full;
            break;
        }
    }
    if (!targetDay)
        return [];
    const hours = businessHours[targetDay];
    if (!hours || hours.length === 0)
        return [];
    const times = [];
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
function getTimesForDayFiltered(businessHours, dateStr, timePreference) {
    const allTimes = getTimesForDay(businessHours, dateStr);
    if (allTimes.length === 0)
        return allTimes;
    const pref = timePreference.toLowerCase();
    const isEvening = pref.includes('evening') || pref.includes('night') || pref.includes('after');
    const isMorning = pref.includes('morning') || pref.includes('early');
    const isAfternoon = pref.includes('afternoon');
    return allTimes.filter(time => {
        const hour = parseTimeToHour(time);
        if (isEvening)
            return hour >= 17; // 5pm and later
        if (isMorning)
            return hour < 12; // Before noon
        if (isAfternoon)
            return hour >= 12 && hour < 17; // 12pm - 5pm
        return true; // No filter
    });
}
/**
 * Parse a time string like "6pm" or "10am" to 24-hour number
 */
function parseTimeToHour(timeStr) {
    const lower = timeStr.toLowerCase();
    const match = lower.match(/(\d+)\s*(am|pm)?/);
    if (!match)
        return 12;
    let hour = parseInt(match[1]);
    const isPm = match[2] === 'pm';
    if (isPm && hour < 12)
        hour += 12;
    if (!isPm && hour === 12)
        hour = 0;
    return hour;
}
/**
 * Format hour as readable time (e.g., "6pm", "10am")
 */
function formatHour(hour) {
    if (hour === 0)
        return '12am';
    if (hour === 12)
        return '12pm';
    if (hour < 12)
        return `${hour}am`;
    return `${hour - 12}pm`;
}
/**
 * Format slot options as readable string
 */
function formatSlotOptions(slots) {
    return slots.map(s => `${s.day} at ${s.times.slice(0, 2).join(' or ')}`).join(', ');
}
/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
/**
 * Get available slots AFTER a specific hour (for "later than X" requests)
 * @param skipDays - Days to skip (already offered and rejected)
 */
function getAvailableSlotsAfterHour(businessHours, minHour, skipDays = []) {
    const slots = [];
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of dayOrder) {
        // Skip days that were already offered
        if (skipDays.some(d => d.toLowerCase() === day.toLowerCase()))
            continue;
        const hours = businessHours[day];
        if (!hours || hours.length === 0)
            continue;
        const matchingTimes = [];
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
function getAvailableSlotsBeforeHour(businessHours, maxHour) {
    const slots = [];
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of dayOrder) {
        const hours = businessHours[day];
        if (!hours || hours.length === 0)
            continue;
        const matchingTimes = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NoZWR1bGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9saWIvZ29hbC1pbnN0cnVjdGlvbnMvc2NoZWR1bGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7QUFhSCw0REE4U0M7QUE5U0QsU0FBZ0Isd0JBQXdCLENBQUMsT0FBK0I7SUFDdEUsTUFBTSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBRXpHLE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDekQsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUV6RCw2RUFBNkU7SUFDN0UsTUFBTSxXQUFXLEdBQUcsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDMUQsTUFBTSxXQUFXLEdBQUcsY0FBYyxLQUFLLFdBQVc7UUFDaEQsOEhBQThILENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ25KLE1BQU0sVUFBVSxHQUFHLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMxRSxNQUFNLFlBQVksR0FBRyxzQ0FBc0MsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFOUUsbURBQW1EO0lBQ25ELE1BQU0sU0FBUyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsb0ZBQW9GLENBQUMsQ0FBQztJQUMxSCxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBRWhILHNFQUFzRTtJQUN0RSxNQUFNLGNBQWMsR0FBRyxDQUFDLEtBQVUsRUFBTyxFQUFFO1FBQ3pDLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxPQUFPLElBQUksS0FBSyxFQUFFLENBQUM7WUFDM0QsT0FBTyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ3JCLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUMsQ0FBQztJQUVGLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDL0QsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUUvRCw2RkFBNkY7SUFDN0YsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEdBQVEsRUFBVyxFQUFFO1FBQzdDLElBQUksQ0FBQyxHQUFHLElBQUksR0FBRyxLQUFLLE1BQU0sSUFBSSxHQUFHLEtBQUssSUFBSTtZQUFFLE9BQU8sS0FBSyxDQUFDO1FBQ3pELE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUN0QyxzQkFBc0I7UUFDdEIsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNuRyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDeEQsd0RBQXdEO1FBQ3hELElBQUksc0JBQXNCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQ2xELHdDQUF3QztRQUN4QyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7WUFBRSxPQUFPLElBQUksQ0FBQztRQUM5QyxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUMsQ0FBQztJQUVGLHdFQUF3RTtJQUN4RSxtRUFBbUU7SUFDbkUsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLEdBQVEsRUFBVyxFQUFFO1FBQ2hELElBQUksQ0FBQyxHQUFHLElBQUksR0FBRyxLQUFLLE1BQU0sSUFBSSxHQUFHLEtBQUssSUFBSTtZQUFFLE9BQU8sS0FBSyxDQUFDO1FBQ3pELE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUU3QyxtREFBbUQ7UUFDbkQsTUFBTSxVQUFVLEdBQUcsNkJBQTZCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUN2Qyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFM0QsT0FBTyxVQUFVLENBQUM7SUFDcEIsQ0FBQyxDQUFDO0lBRUYsd0ZBQXdGO0lBQ3hGLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxHQUFRLEVBQVcsRUFBRTtRQUM5QyxJQUFJLENBQUMsR0FBRyxJQUFJLEdBQUcsS0FBSyxNQUFNLElBQUksR0FBRyxLQUFLLElBQUk7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUN6RCxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdEMsc0JBQXNCO1FBQ3RCLE1BQU0sWUFBWSxHQUFHLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbkYsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQ3pELHFFQUFxRTtRQUNyRSxJQUFJLGlDQUFpQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQy9FLDJDQUEyQztRQUMzQyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7UUFDOUMsb0ZBQW9GO1FBQ3BGLDhFQUE4RTtRQUM5RSxJQUFJLEdBQUcsS0FBSyxRQUFRO1lBQUUsT0FBTyxLQUFLLENBQUMsQ0FBQywyQ0FBMkM7UUFDL0UsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDLENBQUM7SUFFRiw2REFBNkQ7SUFDN0QsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEdBQVcsRUFBVSxFQUFFO1FBQ2pELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUM5QixJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO1lBQUUsT0FBTyxTQUFTLENBQUM7UUFDNUMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztZQUFFLE9BQU8sU0FBUyxDQUFDO1FBQzlDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztZQUFFLE9BQU8sU0FBUyxDQUFDO1FBQ3ZFLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7WUFBRSxPQUFPLFdBQVcsQ0FBQztRQUNsRCxPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUMsQ0FBQztJQUVGLE1BQU0sT0FBTyxHQUFHLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzVDLE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUUsMkJBQTJCO0lBQ3BGLE1BQU0sWUFBWSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQU8sa0NBQWtDO0lBRTNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0NBQXdDLFNBQVMsYUFBYSxPQUFPLGlCQUFpQixTQUFTLGdCQUFnQixlQUFlLFlBQVksWUFBWSxHQUFHLENBQUMsQ0FBQztJQUN2SyxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixXQUFXLGdCQUFnQixVQUFVLGtCQUFrQixZQUFZLG1CQUFtQixhQUFhLEVBQUUsQ0FBQyxDQUFDO0lBRWxKLE1BQU0sYUFBYSxHQUFJLFdBQW1CLEVBQUUsYUFBMEMsQ0FBQztJQUN2RixNQUFNLElBQUksR0FBRyxRQUFRLElBQUksUUFBUSxDQUFDO0lBRWxDLHdFQUF3RTtJQUN4RSxJQUFJLFdBQVcsSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUNqQyxvQ0FBb0M7UUFDcEMsSUFBSSxPQUFPLEdBQUcsYUFBYSxJQUFJLEVBQUUsQ0FBQyxDQUFDLHNDQUFzQztRQUV6RSx1RkFBdUY7UUFDdkYsSUFBSSxPQUFPLElBQUksQ0FBQyxJQUFJLE9BQU8sSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNsQyxPQUFPLEdBQUcsT0FBTyxHQUFHLEVBQUUsQ0FBQyxDQUFDLHlCQUF5QjtRQUNuRCxDQUFDO1FBRUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLHlCQUF5QjtZQUN6QixNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFdEUsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUMxQixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbEQsT0FBTztvQkFDTCxXQUFXLEVBQUUsOERBQThELFVBQVUsQ0FBQyxPQUFPLENBQUM7K0JBQ3pFLFdBQVc7K0RBQ3FCO29CQUNyRCxRQUFRLEVBQUU7d0JBQ1IsMEJBQTBCLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUk7d0JBQ3ZGLDRCQUE0QixXQUFXLGlCQUFpQjt3QkFDeEQsbUNBQW1DLFdBQVcsSUFBSTtxQkFDbkQ7b0JBQ0QsWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDO2lCQUNoQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU87b0JBQ0wsV0FBVyxFQUFFLHdEQUF3RCxVQUFVLENBQUMsT0FBTyxDQUFDO3FGQUNiO29CQUMzRSxRQUFRLEVBQUU7d0JBQ1IsaUZBQWlGO3dCQUNqRixzREFBc0Q7d0JBQ3RELHlEQUF5RDtxQkFDMUQ7b0JBQ0QsWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDO2lCQUNoQyxDQUFDO1lBQ0osQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ3hCLDJCQUEyQjtZQUMzQixNQUFNLFlBQVksR0FBRywyQkFBMkIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFekUsSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM1QixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDcEQsT0FBTztvQkFDTCxXQUFXLEVBQUUsb0NBQW9DLFVBQVUsQ0FBQyxPQUFPLENBQUM7K0JBQy9DLFdBQVcsRUFBRTtvQkFDbEMsUUFBUSxFQUFFO3dCQUNSLDZCQUE2QixZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxPQUFPLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUk7d0JBQ3JGLHFCQUFxQixXQUFXLHdCQUF3QjtxQkFDekQ7b0JBQ0QsWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDO2lCQUNoQyxDQUFDO1lBQ0osQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ04saURBQWlEO1lBQ2pELE9BQU87Z0JBQ0wsV0FBVyxFQUFFOzhCQUNTO2dCQUN0QixRQUFRLEVBQUU7b0JBQ1IseURBQXlEO29CQUN6RCwwQ0FBMEM7b0JBQzFDLDZEQUE2RDtpQkFDOUQ7Z0JBQ0QsWUFBWSxFQUFFLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQzthQUNqRCxDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFFRCxnRUFBZ0U7SUFDaEUsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzlCLE9BQU87WUFDTCxXQUFXLEVBQUU7d0NBQ3FCO1lBQ2xDLFFBQVEsRUFBRTtnQkFDUix3REFBd0QsSUFBSSxJQUFJO2dCQUNoRSxxREFBcUQ7Z0JBQ3JELDZEQUE2RDthQUM5RDtZQUNELFlBQVksRUFBRSxDQUFDLGVBQWUsQ0FBQztTQUNoQyxDQUFDO0lBQ0osQ0FBQztJQUVELHdGQUF3RjtJQUN4RixJQUFJLFlBQVksSUFBSSxDQUFDLE9BQU8sSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUM5QyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFdkQsd0VBQXdFO1FBQ3hFLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztRQUNuRixJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsSUFBSSxPQUFPLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2RCxtRUFBbUU7WUFDbkUsZ0VBQWdFO1lBQ2hFLElBQUksT0FBTyxJQUFJLENBQUMsSUFBSSxPQUFPLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ2xDLE9BQU8sR0FBRyxPQUFPLEdBQUcsRUFBRSxDQUFDLENBQUMsc0NBQXNDO1lBQ2hFLENBQUM7WUFDRCxNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFdEUsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUMxQixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbEQsT0FBTztvQkFDTCxXQUFXLEVBQUUsK0JBQStCLE9BQU87cUJBQ3hDLFdBQVc7bUNBQ0c7b0JBQ3pCLFFBQVEsRUFBRTt3QkFDUix5QkFBeUIsV0FBVyxpQkFBaUI7d0JBQ3JELDJCQUEyQixXQUFXLElBQUk7d0JBQzFDLGFBQWEsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtxQkFDM0g7b0JBQ0QsWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDO2lCQUNoQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU87b0JBQ0wsV0FBVyxFQUFFLDRCQUE0QixPQUFPLDRCQUE0QjtvQkFDNUUsUUFBUSxFQUFFO3dCQUNSLHFFQUFxRTt3QkFDckUsOENBQThDO3dCQUM5QywwREFBMEQ7cUJBQzNEO29CQUNELFlBQVksRUFBRSxDQUFDLGVBQWUsQ0FBQztpQkFDaEMsQ0FBQztZQUNKLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsOEJBQThCLENBQUMsYUFBYSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBRTVFLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQixNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM3QyxPQUFPO2dCQUNMLFdBQVcsRUFBRSxpQkFBaUIsU0FBUzs2Q0FDRixXQUFXO21DQUNyQjtnQkFDM0IsUUFBUSxFQUFFO29CQUNSLGNBQWMsV0FBVyx5QkFBeUI7b0JBQ2xELGFBQWEsV0FBVyxzQkFBc0I7b0JBQzlDLGNBQWMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxpQ0FBaUM7aUJBQ3RGO2dCQUNELFlBQVksRUFBRSxDQUFDLGVBQWUsQ0FBQzthQUNoQyxDQUFDO1FBQ0osQ0FBQzthQUFNLENBQUM7WUFDTixrREFBa0Q7WUFDbEQsT0FBTztnQkFDTCxXQUFXLEVBQUUsdUNBQXVDO2dCQUNwRCxRQUFRLEVBQUU7b0JBQ1IsMENBQTBDO29CQUMxQywrQ0FBK0M7b0JBQy9DLCtCQUErQjtpQkFDaEM7Z0JBQ0QsWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDO2FBQ2hDLENBQUM7UUFDSixDQUFDO0lBQ0gsQ0FBQztJQUVELG1FQUFtRTtJQUNuRSxrRkFBa0Y7SUFDbEYsSUFBSSxPQUFPLElBQUksQ0FBQyxlQUFlLElBQUksYUFBYSxFQUFFLENBQUM7UUFDakQsdUVBQXVFO1FBQ3ZFLE1BQU0sUUFBUSxHQUFHLFlBQVk7WUFDM0IsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3JFLENBQUMsQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTdDLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsa0JBQWtCLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdkUsT0FBTztnQkFDTCxXQUFXLEVBQUUsZ0JBQWdCLFNBQVMsSUFBSSxXQUFXO21CQUMxQyxXQUFXO3VEQUN5QjtnQkFDL0MsUUFBUSxFQUFFO29CQUNSLE9BQU8sU0FBUyxhQUFhLFdBQVcscUJBQXFCO29CQUM3RCxpQkFBaUIsU0FBUyxlQUFlLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJO29CQUN6RixJQUFJLFNBQVMsb0JBQW9CLFdBQVcsZ0JBQWdCO2lCQUM3RDtnQkFDRCxZQUFZLEVBQUUsQ0FBQyxlQUFlLENBQUM7YUFDaEMsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBRUQscURBQXFEO0lBQ3JELElBQUksT0FBTyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQy9CLE9BQU87WUFDTCxXQUFXLEVBQUUsb0VBQW9FO1lBQ2pGLFFBQVEsRUFBRTtnQkFDUixrQkFBa0IsU0FBUyxPQUFPLFNBQVMsSUFBSTtnQkFDL0MsNkJBQTZCLFNBQVMsT0FBTyxTQUFTLElBQUk7YUFDM0Q7WUFDRCxZQUFZLEVBQUUsRUFBRTtTQUNqQixDQUFDO0lBQ0osQ0FBQztJQUVELDhEQUE4RDtJQUM5RCxJQUFJLFNBQVMsSUFBSSxTQUFTLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUN4RCxPQUFPO1lBQ0wsV0FBVyxFQUFFLHVDQUF1QztZQUNwRCxRQUFRLEVBQUU7Z0JBQ1IsK0NBQStDO2dCQUMvQyx3Q0FBd0M7Z0JBQ3hDLGlDQUFpQzthQUNsQztZQUNELFlBQVksRUFBRSxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUM7U0FDakQsQ0FBQztJQUNKLENBQUM7SUFFRCxtQkFBbUI7SUFDbkIsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakUsT0FBTztRQUNMLFdBQVcsRUFBRSxZQUFZLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUc7UUFDckQsWUFBWSxFQUFFLFdBQVc7S0FDMUIsQ0FBQztBQUNKLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsOEJBQThCLENBQUMsYUFBNEIsRUFBRSxVQUFrQjtJQUN0RixNQUFNLEtBQUssR0FBZSxFQUFFLENBQUM7SUFDN0IsTUFBTSxRQUFRLEdBQUcsQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUVoRywyQ0FBMkM7SUFDM0MsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDOUcsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNuSixNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFFckYsS0FBSyxNQUFNLEdBQUcsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUMzQixNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7WUFBRSxTQUFTO1FBRTNDLE1BQU0sYUFBYSxHQUFhLEVBQUUsQ0FBQztRQUVuQyxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3pCLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9DLDRDQUE0QztZQUM1QyxJQUFJLFNBQVMsSUFBSSxRQUFRLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBQy9CLDhCQUE4QjtnQkFDOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNyRSxhQUFhLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxJQUFJLFNBQVMsSUFBSSxNQUFNLElBQUksRUFBRSxFQUFFLENBQUM7Z0JBQ3JDLHVCQUF1QjtnQkFDdkIsS0FBSyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNuRSxhQUFhLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxJQUFJLFdBQVcsSUFBSSxRQUFRLElBQUksRUFBRSxJQUFJLE1BQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDekQsMkJBQTJCO2dCQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3RFLGFBQWEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BDLENBQUM7WUFDSCxDQUFDO2lCQUFNLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDcEQsbURBQW1EO2dCQUNuRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNyRCxhQUFhLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzdCLG1EQUFtRDtZQUNuRCxLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUNULEdBQUcsRUFBRSxlQUFlLENBQUMsR0FBRyxDQUFDO2dCQUN6QixLQUFLLEVBQUUsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ2pDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDSCxDQUFDO0lBRUQsOERBQThEO0lBQzlELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxjQUFjLENBQUMsYUFBNEIsRUFBRSxPQUFlO0lBQ25FLDRDQUE0QztJQUM1QyxNQUFNLE1BQU0sR0FBMkI7UUFDckMsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxXQUFXO1FBQ3JELEtBQUssRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxRQUFRO0tBQ3ZFLENBQUM7SUFFRixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDeEMsSUFBSSxTQUE2QixDQUFDO0lBRWxDLEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDcEQsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUMzRCxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLE1BQU07UUFDUixDQUFDO0lBQ0gsQ0FBQztJQUVELElBQUksQ0FBQyxTQUFTO1FBQUUsT0FBTyxFQUFFLENBQUM7SUFFMUIsTUFBTSxLQUFLLEdBQUcsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3ZDLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTyxFQUFFLENBQUM7SUFFNUMsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO0lBQzNCLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7UUFDekIsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0MsOEJBQThCO1FBQzlCLEtBQUssSUFBSSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsR0FBRyxNQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzlELEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUIsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsc0JBQXNCLENBQUMsYUFBNEIsRUFBRSxPQUFlLEVBQUUsY0FBc0I7SUFDbkcsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN4RCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQztRQUFFLE9BQU8sUUFBUSxDQUFDO0lBRTNDLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUMxQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMvRixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDckUsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUUvQyxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDNUIsTUFBTSxJQUFJLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25DLElBQUksU0FBUztZQUFFLE9BQU8sSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLGdCQUFnQjtRQUNsRCxJQUFJLFNBQVM7WUFBRSxPQUFPLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBRSxjQUFjO1FBQ2hELElBQUksV0FBVztZQUFFLE9BQU8sSUFBSSxJQUFJLEVBQUUsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUMsYUFBYTtRQUM5RCxPQUFPLElBQUksQ0FBQyxDQUFDLFlBQVk7SUFDM0IsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGVBQWUsQ0FBQyxPQUFlO0lBQ3RDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNwQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDOUMsSUFBSSxDQUFDLEtBQUs7UUFBRSxPQUFPLEVBQUUsQ0FBQztJQUV0QixJQUFJLElBQUksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUIsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQztJQUUvQixJQUFJLElBQUksSUFBSSxJQUFJLEdBQUcsRUFBRTtRQUFFLElBQUksSUFBSSxFQUFFLENBQUM7SUFDbEMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLEtBQUssRUFBRTtRQUFFLElBQUksR0FBRyxDQUFDLENBQUM7SUFFbkMsT0FBTyxJQUFJLENBQUM7QUFDZCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLFVBQVUsQ0FBQyxJQUFZO0lBQzlCLElBQUksSUFBSSxLQUFLLENBQUM7UUFBRSxPQUFPLE1BQU0sQ0FBQztJQUM5QixJQUFJLElBQUksS0FBSyxFQUFFO1FBQUUsT0FBTyxNQUFNLENBQUM7SUFDL0IsSUFBSSxJQUFJLEdBQUcsRUFBRTtRQUFFLE9BQU8sR0FBRyxJQUFJLElBQUksQ0FBQztJQUNsQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsSUFBSSxDQUFDO0FBQzFCLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsaUJBQWlCLENBQUMsS0FBaUI7SUFDMUMsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN0RixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGVBQWUsQ0FBQyxHQUFXO0lBQ2xDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BELENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLDBCQUEwQixDQUFDLGFBQTRCLEVBQUUsT0FBZSxFQUFFLFdBQXFCLEVBQUU7SUFDeEcsTUFBTSxLQUFLLEdBQWUsRUFBRSxDQUFDO0lBQzdCLE1BQU0sUUFBUSxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFFaEcsS0FBSyxNQUFNLEdBQUcsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUMzQixzQ0FBc0M7UUFDdEMsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUFFLFNBQVM7UUFFeEUsTUFBTSxLQUFLLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDO1lBQUUsU0FBUztRQUUzQyxNQUFNLGFBQWEsR0FBYSxFQUFFLENBQUM7UUFFbkMsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUN6QixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUvQyw0Q0FBNEM7WUFDNUMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsMENBQTBDO1lBRTdGLElBQUksU0FBUyxHQUFHLE1BQU0sRUFBRSxDQUFDO2dCQUN2QixLQUFLLElBQUksQ0FBQyxHQUFHLFNBQVMsRUFBRSxDQUFDLEdBQUcsTUFBTSxJQUFJLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDdkUsYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzdCLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ1QsR0FBRyxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUM7Z0JBQ3pCLEtBQUssRUFBRSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDakMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNILENBQUM7SUFFRCw0QkFBNEI7SUFDNUIsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLDJCQUEyQixDQUFDLGFBQTRCLEVBQUUsT0FBZTtJQUNoRixNQUFNLEtBQUssR0FBZSxFQUFFLENBQUM7SUFDN0IsTUFBTSxRQUFRLEdBQUcsQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUVoRyxLQUFLLE1BQU0sR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQzNCLE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQztZQUFFLFNBQVM7UUFFM0MsTUFBTSxhQUFhLEdBQWEsRUFBRSxDQUFDO1FBRW5DLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7WUFDekIsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0MsNkNBQTZDO1lBQzdDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRTFDLElBQUksUUFBUSxHQUFHLE9BQU8sRUFBRSxDQUFDO2dCQUN2QixLQUFLLElBQUksQ0FBQyxHQUFHLFFBQVEsRUFBRSxDQUFDLEdBQUcsT0FBTyxJQUFJLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDdkUsYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBRUQsSUFBSSxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzdCLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ1QsR0FBRyxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUM7Z0JBQ3pCLEtBQUssRUFBRSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDakMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogU2NoZWR1bGluZyBHb2FsIEluc3RydWN0aW9uc1xyXG4gKiBcclxuICogU21hcnQgaGFuZGxpbmcgZm9yIGFwcG9pbnRtZW50IHNjaGVkdWxpbmc6XHJcbiAqIC0gVXNlcyBidXNpbmVzc0hvdXJzIGZyb20gY29tcGFueSBpbmZvIHRvIG9mZmVyIHJlYWwgc2xvdHNcclxuICogLSBBc2tzIGFib3V0IHRpbWUgcHJlZmVyZW5jZSBmaXJzdCAobW9ybmluZy9ldmVuaW5nKVxyXG4gKiAtIE9mZmVycyBzcGVjaWZpYyBkYXlzL3RpbWVzIGJhc2VkIG9uIHByZWZlcmVuY2VcclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IEdvYWxJbnN0cnVjdGlvbkNvbnRleHQsIEdvYWxJbnN0cnVjdGlvbiB9IGZyb20gJy4vaW5kZXguanMnO1xyXG5cclxuaW50ZXJmYWNlIFRpbWVTbG90IHtcclxuICBkYXk6IHN0cmluZztcclxuICB0aW1lczogc3RyaW5nW107XHJcbn1cclxuXHJcbmludGVyZmFjZSBCdXNpbmVzc0hvdXJzIHtcclxuICBbZGF5OiBzdHJpbmddOiBBcnJheTx7IGZyb206IHN0cmluZzsgdG86IHN0cmluZyB9PjtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFNjaGVkdWxpbmdJbnN0cnVjdGlvbihjb250ZXh0OiBHb2FsSW5zdHJ1Y3Rpb25Db250ZXh0KTogR29hbEluc3RydWN0aW9uIHtcclxuICBjb25zdCB7IGZpZWxkc05lZWRlZCwgZmllbGRzQ2FwdHVyZWQsIGNvbXBhbnlJbmZvLCB1c2VyTmFtZSwgbGFzdFVzZXJNZXNzYWdlLCBkZXRlY3RlZEludGVudCB9ID0gY29udGV4dDtcclxuICBcclxuICBjb25zdCBuZWVkc0RhdGUgPSBmaWVsZHNOZWVkZWQuaW5jbHVkZXMoJ3ByZWZlcnJlZERhdGUnKTtcclxuICBjb25zdCBuZWVkc1RpbWUgPSBmaWVsZHNOZWVkZWQuaW5jbHVkZXMoJ3ByZWZlcnJlZFRpbWUnKTtcclxuICBcclxuICAvLyDwn46vIElOVEVOVC1CQVNFRCBMT0dJQzogRGV0ZWN0IGlmIHVzZXIgaXMgcmVqZWN0aW5nL3JlcXVlc3RpbmcgYWx0ZXJuYXRpdmVzXHJcbiAgY29uc3QgdXNlck1lc3NhZ2UgPSAobGFzdFVzZXJNZXNzYWdlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gIGNvbnN0IGlzUmVqZWN0aW9uID0gZGV0ZWN0ZWRJbnRlbnQgPT09ICdvYmplY3Rpb24nIHx8IFxyXG4gICAgL1xcYmxhdGVyXFxifFxcYnRvbyBlYXJseVxcYnxcXGJ0b28gbGF0ZVxcYnxcXGJjYW4ndCBkb1xcYnxcXGJkb2Vzbid0IHdvcmtcXGJ8XFxiZG9uJ3Qgd29ya1xcYnxcXGJub25lIG9mIHRob3NlXFxifFxcYm90aGVyXFxifFxcYmFsdGVybmF0aXZlL2kudGVzdCh1c2VyTWVzc2FnZSk7XHJcbiAgY29uc3Qgd2FudHNMYXRlciA9IC9cXGJsYXRlclxcYnxcXGJ0b28gZWFybHlcXGJ8XFxiYWZ0ZXJcXGIvaS50ZXN0KHVzZXJNZXNzYWdlKTtcclxuICBjb25zdCB3YW50c0VhcmxpZXIgPSAvXFxiZWFybGllclxcYnxcXGJ0b28gbGF0ZVxcYnxcXGJiZWZvcmVcXGIvaS50ZXN0KHVzZXJNZXNzYWdlKTtcclxuICBcclxuICAvLyBFeHRyYWN0IGFueSBob3VyIG1lbnRpb25lZCBpbiB0aGUgdXNlcidzIG1lc3NhZ2VcclxuICBjb25zdCBob3VyTWF0Y2ggPSB1c2VyTWVzc2FnZS5tYXRjaCgvXFxiKFxcZHsxLDJ9KVxccyooPzpwbXxhbSk/fFxcYnVudGlsXFxzKihcXGR7MSwyfSl8XFxiYWZ0ZXJcXHMqKFxcZHsxLDJ9KXxcXGJhdFxccyooXFxkezEsMn0pL2kpO1xyXG4gIGNvbnN0IG1lbnRpb25lZEhvdXIgPSBob3VyTWF0Y2ggPyBwYXJzZUludChob3VyTWF0Y2hbMV0gfHwgaG91ck1hdGNoWzJdIHx8IGhvdXJNYXRjaFszXSB8fCBob3VyTWF0Y2hbNF0pIDogbnVsbDtcclxuICBcclxuICAvLyBIYW5kbGUgYm90aCByYXcgdmFsdWVzIGFuZCB7dmFsdWU6IC4uLn0gb2JqZWN0cyBmcm9tIExMTSBleHRyYWN0aW9uXHJcbiAgY29uc3QgZ2V0QWN0dWFsVmFsdWUgPSAoZmllbGQ6IGFueSk6IGFueSA9PiB7XHJcbiAgICBpZiAoZmllbGQgJiYgdHlwZW9mIGZpZWxkID09PSAnb2JqZWN0JyAmJiAndmFsdWUnIGluIGZpZWxkKSB7XHJcbiAgICAgIHJldHVybiBmaWVsZC52YWx1ZTtcclxuICAgIH1cclxuICAgIHJldHVybiBmaWVsZDtcclxuICB9O1xyXG4gIFxyXG4gIGNvbnN0IGRhdGVWYWx1ZSA9IGdldEFjdHVhbFZhbHVlKGZpZWxkc0NhcHR1cmVkLnByZWZlcnJlZERhdGUpO1xyXG4gIGNvbnN0IHRpbWVWYWx1ZSA9IGdldEFjdHVhbFZhbHVlKGZpZWxkc0NhcHR1cmVkLnByZWZlcnJlZFRpbWUpO1xyXG4gIFxyXG4gIC8vIFZhbGlkYXRlIHRoYXQgZGF0ZVZhbHVlIGlzIGFjdHVhbGx5IGEgZGF0ZS1saWtlIHN0cmluZyAoY29udGFpbnMgZGF5IG5hbWUgb3IgZGF0ZSBwYXR0ZXJuKVxyXG4gIGNvbnN0IGlzVmFsaWREYXRlVmFsdWUgPSAodmFsOiBhbnkpOiBib29sZWFuID0+IHtcclxuICAgIGlmICghdmFsIHx8IHZhbCA9PT0gJ251bGwnIHx8IHZhbCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3Qgc3RyID0gU3RyaW5nKHZhbCkudG9Mb3dlckNhc2UoKTtcclxuICAgIC8vIENoZWNrIGZvciBkYXkgbmFtZXNcclxuICAgIGNvbnN0IGRheVBhdHRlcm5zID0gWydtb24nLCAndHVlJywgJ3dlZCcsICd0aHUnLCAnZnJpJywgJ3NhdCcsICdzdW4nLCAndG9kYXknLCAndG9tb3Jyb3cnLCAnbmV4dCddO1xyXG4gICAgaWYgKGRheVBhdHRlcm5zLnNvbWUoZCA9PiBzdHIuaW5jbHVkZXMoZCkpKSByZXR1cm4gdHJ1ZTtcclxuICAgIC8vIENoZWNrIGZvciBkYXRlIHBhdHRlcm5zIChudW1iZXJzIHRoYXQgY291bGQgYmUgZGF0ZXMpXHJcbiAgICBpZiAoL1xcZHsxLDJ9KFxcL3wtKVxcZHsxLDJ9Ly50ZXN0KHN0cikpIHJldHVybiB0cnVlO1xyXG4gICAgLy8gQ2hlY2sgZm9yIG9yZGluYWxzIGxpa2UgXCI1dGhcIiwgXCIxMHRoXCJcclxuICAgIGlmICgvXFxkKyhzdHxuZHxyZHx0aCkvLnRlc3Qoc3RyKSkgcmV0dXJuIHRydWU7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfTtcclxuICBcclxuICAvLyBWYWxpZGF0ZSB0aGF0IHRpbWVWYWx1ZSBpcyBhIFNQRUNJRklDIHRpbWUgKG5vdCB2YWd1ZSBsaWtlIFwiZXZlbmluZ1wiKVxyXG4gIC8vIFRoaXMgc2hvdWxkIG1hdGNoIHRoZSB2YWxpZGF0aW9uIGluIGFnZW50LnRzIGZvciBnb2FsIGNvbXBsZXRpb25cclxuICBjb25zdCBpc1NwZWNpZmljVGltZVZhbHVlID0gKHZhbDogYW55KTogYm9vbGVhbiA9PiB7XHJcbiAgICBpZiAoIXZhbCB8fCB2YWwgPT09ICdudWxsJyB8fCB2YWwgPT09IG51bGwpIHJldHVybiBmYWxzZTtcclxuICAgIGNvbnN0IHN0ciA9IFN0cmluZyh2YWwpLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG4gICAgXHJcbiAgICAvLyBTUEVDSUZJQyB0aW1lczogXCI2cG1cIiwgXCI3OjMwXCIsIFwiMTg6MDBcIiwgXCI3OjMwcG1cIlxyXG4gICAgY29uc3QgaXNTcGVjaWZpYyA9IC9eXFxkezEsMn1cXHMqKGFtfHBtfDpcXGR7Mn0pJC9pLnRlc3Qoc3RyKSB8fCBcclxuICAgICAgICAgICAgICAgICAgICAgICAvXlxcZHsxLDJ9OlxcZHsyfVxccyooYW18cG0pPyQvaS50ZXN0KHN0cik7XHJcbiAgICBcclxuICAgIHJldHVybiBpc1NwZWNpZmljO1xyXG4gIH07XHJcbiAgXHJcbiAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBhIHRpbWUgUFJFRkVSRU5DRSAodmFndWUgbGlrZSBcImV2ZW5pbmdcIiAtIHVzZWZ1bCBmb3Igb2ZmZXJpbmcgc2xvdHMpXHJcbiAgY29uc3QgaGFzVGltZVByZWZlcmVuY2UgPSAodmFsOiBhbnkpOiBib29sZWFuID0+IHtcclxuICAgIGlmICghdmFsIHx8IHZhbCA9PT0gJ251bGwnIHx8IHZhbCA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgY29uc3Qgc3RyID0gU3RyaW5nKHZhbCkudG9Mb3dlckNhc2UoKTtcclxuICAgIC8vIEJhc2ljIHRpbWUgcGF0dGVybnNcclxuICAgIGNvbnN0IHRpbWVQYXR0ZXJucyA9IFsnbW9ybmluZycsICdldmVuaW5nJywgJ2FmdGVybm9vbicsICduaWdodCcsICdhbScsICdwbScsICc6J107XHJcbiAgICBpZiAodGltZVBhdHRlcm5zLnNvbWUodCA9PiBzdHIuaW5jbHVkZXModCkpKSByZXR1cm4gdHJ1ZTtcclxuICAgIC8vIFJlbGF0aXZlIHRpbWUgcGF0dGVybnMgbGlrZSBcImxhdGVyIHRoYW4gNlwiLCBcImFmdGVyIDVcIiwgXCJiZWZvcmUgMTBcIlxyXG4gICAgaWYgKC9sYXRlcnxhZnRlcnxiZWZvcmV8YXJvdW5kfGFib3V0Ly50ZXN0KHN0cikgJiYgL1xcZC8udGVzdChzdHIpKSByZXR1cm4gdHJ1ZTtcclxuICAgIC8vIEp1c3QgYSBudW1iZXIgKGNvdWxkIGJlIFwiNlwiIG1lYW5pbmcgNnBtKVxyXG4gICAgaWYgKC9eXFxkezEsMn0kLy50ZXN0KHN0ci50cmltKCkpKSByZXR1cm4gdHJ1ZTtcclxuICAgIC8vIEhhbmRsZSBcIm1vc3RseVwiIHByZWZpeCAtIGlmIGl0J3MganVzdCBcIm1vc3RseVwiLCBjaGVjayBpZiBjb250ZXh0IHN1Z2dlc3RzIGV2ZW5pbmdcclxuICAgIC8vIFRoaXMgaXMgYSBmYWxsYmFjayAtIGlkZWFsbHkgZXh0cmFjdGlvbiBzaG91bGQgZ2V0IHRoZSBmdWxsIFwibW9zdGx5IG5pZ2h0c1wiXHJcbiAgICBpZiAoc3RyID09PSAnbW9zdGx5JykgcmV0dXJuIGZhbHNlOyAvLyBSZWplY3QgYmFyZSBcIm1vc3RseVwiIC0gbmVlZCBtb3JlIGNvbnRleHRcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9O1xyXG4gIFxyXG4gIC8vIE5vcm1hbGl6ZSB0aW1lIHZhbHVlIC0gY29udmVydCB2YXJpYXRpb25zIHRvIHN0YW5kYXJkIGZvcm1cclxuICBjb25zdCBub3JtYWxpemVUaW1lVmFsdWUgPSAodmFsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xyXG4gICAgY29uc3Qgc3RyID0gdmFsLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBpZiAoc3RyLmluY2x1ZGVzKCduaWdodCcpKSByZXR1cm4gJ2V2ZW5pbmcnO1xyXG4gICAgaWYgKHN0ci5pbmNsdWRlcygnZXZlbmluZycpKSByZXR1cm4gJ2V2ZW5pbmcnO1xyXG4gICAgaWYgKHN0ci5pbmNsdWRlcygnbW9ybmluZycpIHx8IHN0ci5pbmNsdWRlcygnZWFybHknKSkgcmV0dXJuICdtb3JuaW5nJztcclxuICAgIGlmIChzdHIuaW5jbHVkZXMoJ2FmdGVybm9vbicpKSByZXR1cm4gJ2FmdGVybm9vbic7XHJcbiAgICByZXR1cm4gdmFsO1xyXG4gIH07XHJcbiAgXHJcbiAgY29uc3QgaGFzRGF0ZSA9IGlzVmFsaWREYXRlVmFsdWUoZGF0ZVZhbHVlKTtcclxuICBjb25zdCBoYXNTcGVjaWZpY1RpbWUgPSBpc1NwZWNpZmljVGltZVZhbHVlKHRpbWVWYWx1ZSk7ICAvLyBTUEVDSUZJQyB0aW1lIGxpa2UgXCI3cG1cIlxyXG4gIGNvbnN0IGhhc1ZhZ3VlVGltZSA9IGhhc1RpbWVQcmVmZXJlbmNlKHRpbWVWYWx1ZSk7ICAgICAgIC8vIFZhZ3VlIHByZWZlcmVuY2UgbGlrZSBcImV2ZW5pbmdcIlxyXG4gIFxyXG4gIGNvbnNvbGUubG9nKGDwn5OFIFNjaGVkdWxpbmcgdmFsaWRhdGlvbjogZGF0ZVZhbHVlPVwiJHtkYXRlVmFsdWV9XCIgKHZhbGlkOiAke2hhc0RhdGV9KSwgdGltZVZhbHVlPVwiJHt0aW1lVmFsdWV9XCIgKHNwZWNpZmljOiAke2hhc1NwZWNpZmljVGltZX0sIHZhZ3VlOiAke2hhc1ZhZ3VlVGltZX0pYCk7XHJcbiAgY29uc29sZS5sb2coYPCfk4UgVXNlciBpbnRlbnQ6IGlzUmVqZWN0aW9uPSR7aXNSZWplY3Rpb259LCB3YW50c0xhdGVyPSR7d2FudHNMYXRlcn0sIHdhbnRzRWFybGllcj0ke3dhbnRzRWFybGllcn0sIG1lbnRpb25lZEhvdXI9JHttZW50aW9uZWRIb3VyfWApO1xyXG4gIFxyXG4gIGNvbnN0IGJ1c2luZXNzSG91cnMgPSAoY29tcGFueUluZm8gYXMgYW55KT8uYnVzaW5lc3NIb3VycyBhcyBCdXNpbmVzc0hvdXJzIHwgdW5kZWZpbmVkO1xyXG4gIGNvbnN0IG5hbWUgPSB1c2VyTmFtZSB8fCAnZnJpZW5kJztcclxuICBcclxuICAvLyDwn46vIFBSSU9SSVRZIENBU0U6IFVzZXIgcmVqZWN0ZWQgb2ZmZXJlZCB0aW1lcyAtIG9mZmVyIERJRkZFUkVOVCB0aW1lc1xyXG4gIGlmIChpc1JlamVjdGlvbiAmJiBidXNpbmVzc0hvdXJzKSB7XHJcbiAgICAvLyBEZXRlcm1pbmUgd2hhdCBob3VyIHRvIHN0YXJ0IGZyb21cclxuICAgIGxldCBtaW5Ib3VyID0gbWVudGlvbmVkSG91ciB8fCAxODsgLy8gRGVmYXVsdCB0byA2cG0gaWYgbm8gaG91ciBtZW50aW9uZWRcclxuICAgIFxyXG4gICAgLy8gQ29udmVydCB0byAyNC1ob3VyIGZvcm1hdCBpZiBuZWVkZWQgKGFzc3VtZSBQTSBmb3Igc21hbGwgbnVtYmVycyBpbiBldmVuaW5nIGNvbnRleHQpXHJcbiAgICBpZiAobWluSG91ciA+PSAxICYmIG1pbkhvdXIgPD0gMTIpIHtcclxuICAgICAgbWluSG91ciA9IG1pbkhvdXIgKyAxMjsgLy8gNiAtPiAxOCwgNyAtPiAxOSwgZXRjLlxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAod2FudHNMYXRlcikge1xyXG4gICAgICAvLyBVc2VyIHdhbnRzIExBVEVSIHRpbWVzXHJcbiAgICAgIGNvbnN0IGxhdGVyU2xvdHMgPSBnZXRBdmFpbGFibGVTbG90c0FmdGVySG91cihidXNpbmVzc0hvdXJzLCBtaW5Ib3VyKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChsYXRlclNsb3RzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBzbG90T3B0aW9ucyA9IGZvcm1hdFNsb3RPcHRpb25zKGxhdGVyU2xvdHMpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBpbnN0cnVjdGlvbjogYFVzZXIgcmVqZWN0ZWQgZWFybGllciB0aW1lcyBhbmQgd2FudHMgTEFURVIgb3B0aW9ucyAoYWZ0ZXIgJHtmb3JtYXRIb3VyKG1pbkhvdXIpfSkuXHJcbk9mZmVyIHRoZXNlIGF2YWlsYWJsZSBzbG90czogJHtzbG90T3B0aW9uc31cclxuQmUgaGVscGZ1bCBhbmQgYWNjb21tb2RhdGluZyAtIHRoZXkgaGF2ZSBzY2hlZHVsZSBjb25zdHJhaW50cyFgLFxyXG4gICAgICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICAgICAgYFwiTm8gcHJvYmxlbSEgSG93IGFib3V0ICR7bGF0ZXJTbG90c1swXT8uZGF5fSBhdCAke2xhdGVyU2xvdHNbMF0/LnRpbWVzWzBdIHx8ICc3cG0nfT9cImAsXHJcbiAgICAgICAgICAgIGBcIkkgZ290IHlvdSEgTGF0ZXIgc2xvdHM6ICR7c2xvdE9wdGlvbnN9LiBXaGljaCB3b3Jrcz9cImAsXHJcbiAgICAgICAgICAgIGBcIlRvdGFsbHkgdW5kZXJzdGFuZCEgV2hhdCBhYm91dCAke3Nsb3RPcHRpb25zfT9cImBcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICB0YXJnZXRGaWVsZHM6IFsncHJlZmVycmVkRGF0ZSddXHJcbiAgICAgICAgfTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgaW5zdHJ1Y3Rpb246IGBVc2VyIHdhbnRzIGxhdGVyIHRpbWVzIGJ1dCB3ZSBkb24ndCBoYXZlIHNsb3RzIGFmdGVyICR7Zm9ybWF0SG91cihtaW5Ib3VyKX0uXHJcbkFwb2xvZ2l6ZSBhbmQgYXNrIHdoYXQgZGF5IG1pZ2h0IHdvcmsgYmV0dGVyLCBvciBzdWdnZXN0IG91ciBsYXRlc3QgYXZhaWxhYmxlIHRpbWVzLmAsXHJcbiAgICAgICAgICBleGFtcGxlczogW1xyXG4gICAgICAgICAgICBgXCJPdXIgbGF0ZXN0IGV2ZW5pbmcgc2xvdHMgYXJlIGFyb3VuZCA4LTlwbS4gV291bGQgYSBkaWZmZXJlbnQgZGF5IHdvcmsgYmV0dGVyP1wiYCxcclxuICAgICAgICAgICAgYFwiSSBoZWFyIHlvdSEgV2hhdCBkYXkgaGFzIG1vcmUgZmxleGliaWxpdHkgZm9yIHlvdT9cImAsXHJcbiAgICAgICAgICAgIGBcIkxldCBtZSBzZWUgd2hhdCBlbHNlIHdlIGNhbiBkbyAtIHdoYXQgZGF5IHdvcmtzIGJlc3Q/XCJgXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgdGFyZ2V0RmllbGRzOiBbJ3ByZWZlcnJlZERhdGUnXVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAod2FudHNFYXJsaWVyKSB7XHJcbiAgICAgIC8vIFVzZXIgd2FudHMgRUFSTElFUiB0aW1lc1xyXG4gICAgICBjb25zdCBlYXJsaWVyU2xvdHMgPSBnZXRBdmFpbGFibGVTbG90c0JlZm9yZUhvdXIoYnVzaW5lc3NIb3VycywgbWluSG91cik7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZWFybGllclNsb3RzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBzbG90T3B0aW9ucyA9IGZvcm1hdFNsb3RPcHRpb25zKGVhcmxpZXJTbG90cyk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGluc3RydWN0aW9uOiBgVXNlciB3YW50cyBFQVJMSUVSIHRpbWVzIChiZWZvcmUgJHtmb3JtYXRIb3VyKG1pbkhvdXIpfSkuXHJcbk9mZmVyIHRoZXNlIGF2YWlsYWJsZSBzbG90czogJHtzbG90T3B0aW9uc31gLFxyXG4gICAgICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICAgICAgYFwiRWFybGllciB3b3JrcyEgSG93IGFib3V0ICR7ZWFybGllclNsb3RzWzBdPy5kYXl9IGF0ICR7ZWFybGllclNsb3RzWzBdPy50aW1lc1swXX0/XCJgLFxyXG4gICAgICAgICAgICBgXCJHb3QgaXQhIEkgY2FuIGRvICR7c2xvdE9wdGlvbnN9LiBQaWNrIHlvdXIgZmF2b3JpdGUhXCJgLFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICAgIHRhcmdldEZpZWxkczogWydwcmVmZXJyZWREYXRlJ11cclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBHZW5lcmFsIHJlamVjdGlvbiAtIG9mZmVyIGRpZmZlcmVudCB0aW1lcy9kYXlzXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgaW5zdHJ1Y3Rpb246IGBVc2VyIHJlamVjdGVkIHRoZSBvZmZlcmVkIHRpbWVzLiBBc2sgd2hhdCB0aW1lcy9kYXlzIHdvdWxkIHdvcmsgYmV0dGVyIGZvciB0aGVtLlxyXG5CZSBhY2NvbW1vZGF0aW5nIGFuZCBoZWxwZnVsIWAsXHJcbiAgICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICAgIGBcIk5vIHdvcnJpZXMhIFdoYXQgdGltZXMgd29yayBiZXR0ZXIgZm9yIHlvdXIgc2NoZWR1bGU/XCJgLFxyXG4gICAgICAgICAgYFwiSSBoZWFyIHlvdSEgV2hlbiBhcmUgeW91IHVzdWFsbHkgZnJlZT9cImAsXHJcbiAgICAgICAgICBgXCJMZXQncyBmaW5kIHNvbWV0aGluZyB0aGF0IHdvcmtzIC0gd2hhdCdzIHlvdXIgaWRlYWwgdGltZT9cImAsXHJcbiAgICAgICAgXSxcclxuICAgICAgICB0YXJnZXRGaWVsZHM6IFsncHJlZmVycmVkVGltZScsICdwcmVmZXJyZWREYXRlJ11cclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSAxOiBObyBwcmVmZXJlbmNlIGF0IGFsbCDihpIgQXNrIG1vcm5pbmcvZXZlbmluZyBwcmVmZXJlbmNlXHJcbiAgaWYgKCFoYXNWYWd1ZVRpbWUgJiYgIWhhc0RhdGUpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGFib3V0IHRoZWlyIHRpbWUgcHJlZmVyZW5jZSAtIGFyZSB0aGV5IGEgbW9ybmluZyBwZXJzb24gb3IgZXZlbmluZyBwZXJzb24/XHJcblRoaXMgaGVscHMgbmFycm93IGRvd24gYXZhaWxhYmxlIHNsb3RzLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiQXJlIHlvdSBtb3JlIG9mIGEgbW9ybmluZyBwZXJzb24gb3IgZXZlbmluZyBwZXJzb24sICR7bmFtZX0/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgd29ya3MgYmV0dGVyIGZvciB5b3UgLSBtb3JuaW5ncyBvciBldmVuaW5ncz9cImAsXHJcbiAgICAgICAgYFwiRG8geW91IHByZWZlciBlYXJseSBiaXJkIHNlc3Npb25zIG9yIGFmdGVyLXdvcmsgd29ya291dHM/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydwcmVmZXJyZWRUaW1lJ11cclxuICAgIH07XHJcbiAgfVxyXG4gIFxyXG4gIC8vIENhc2UgMjogSGF2ZSB0aW1lIHByZWZlcmVuY2UgKHZhZ3VlIGxpa2UgXCJldmVuaW5nXCIpLCBuZWVkIGRhdGUg4oaSIE9mZmVyIHNwZWNpZmljIHNsb3RzXHJcbiAgaWYgKGhhc1ZhZ3VlVGltZSAmJiAhaGFzRGF0ZSAmJiBidXNpbmVzc0hvdXJzKSB7XHJcbiAgICBjb25zdCB0aW1lUHJlZmVyZW5jZSA9IFN0cmluZyh0aW1lVmFsdWUpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIGlmIHVzZXIgaXMgYXNraW5nIGZvciBMQVRFUiB0aW1lcyAocmVqZWN0aW9uIG9mIGVhcmxpZXIgb2ZmZXJzKVxyXG4gICAgY29uc3QgbGF0ZXJNYXRjaCA9IHRpbWVQcmVmZXJlbmNlLm1hdGNoKC9sYXRlclxccyooPzp0aGFuKT9cXHMqKFxcZCspfGFmdGVyXFxzKihcXGQrKS8pO1xyXG4gICAgaWYgKGxhdGVyTWF0Y2gpIHtcclxuICAgICAgbGV0IG1pbkhvdXIgPSBwYXJzZUludChsYXRlck1hdGNoWzFdIHx8IGxhdGVyTWF0Y2hbMl0pO1xyXG4gICAgICAvLyBJZiBob3VyIGlzIDEtMTIgYW5kIHdlJ3JlIGluIGV2ZW5pbmcgY29udGV4dCwgYXNzdW1lIFBNIChhZGQgMTIpXHJcbiAgICAgIC8vIFwiYWZ0ZXIgNlwiIGluIGV2ZW5pbmcgY29udGV4dCBtZWFucyBhZnRlciA2cG0gKDE4OjAwKSwgbm90IDZhbVxyXG4gICAgICBpZiAobWluSG91ciA+PSAxICYmIG1pbkhvdXIgPD0gMTIpIHtcclxuICAgICAgICBtaW5Ib3VyID0gbWluSG91ciArIDEyOyAvLyBDb252ZXJ0IHRvIDI0LWhvdXIgZm9ybWF0ICg2IC0+IDE4KVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGxhdGVyU2xvdHMgPSBnZXRBdmFpbGFibGVTbG90c0FmdGVySG91cihidXNpbmVzc0hvdXJzLCBtaW5Ib3VyKTtcclxuICAgICAgXHJcbiAgICAgIGlmIChsYXRlclNsb3RzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCBzbG90T3B0aW9ucyA9IGZvcm1hdFNsb3RPcHRpb25zKGxhdGVyU2xvdHMpO1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBpbnN0cnVjdGlvbjogYFVzZXIgd2FudHMgdGltZXMgTEFURVIgdGhhbiAke21pbkhvdXJ9LiBPZmZlciBhdmFpbGFibGUgc2xvdHMgYWZ0ZXIgdGhhdCB0aW1lLlxyXG5BdmFpbGFibGUgb3B0aW9uczogJHtzbG90T3B0aW9uc31cclxuQXNrIHdoaWNoIGRheS90aW1lIHdvcmtzIGZvciB0aGVtLmAsXHJcbiAgICAgICAgICBleGFtcGxlczogW1xyXG4gICAgICAgICAgICBgXCJObyBwcm9ibGVtISBJJ3ZlIGdvdCAke3Nsb3RPcHRpb25zfS4gV2hpY2ggd29ya3M/XCJgLFxyXG4gICAgICAgICAgICBgXCJMYXRlciB3b3JrcyEgSG93IGFib3V0ICR7c2xvdE9wdGlvbnN9P1wiYCxcclxuICAgICAgICAgICAgYFwiR290IGl0IC0gJHtsYXRlclNsb3RzWzBdPy5kYXl9IGF0ICR7bGF0ZXJTbG90c1swXT8udGltZXNbMF19IG9yICR7bGF0ZXJTbG90c1swXT8udGltZXNbMV0gfHwgbGF0ZXJTbG90c1swXT8udGltZXNbMF19P1wiYFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICAgIHRhcmdldEZpZWxkczogWydwcmVmZXJyZWREYXRlJ11cclxuICAgICAgICB9O1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBpbnN0cnVjdGlvbjogYE5vIHNsb3RzIGF2YWlsYWJsZSBhZnRlciAke21pbkhvdXJ9LiBBc2sgd2hhdCBkYXkgd29ya3MgYmVzdC5gLFxyXG4gICAgICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICAgICAgYFwiSG1tLCB3ZSBjbG9zZSBiZWZvcmUgdGhlbiBtb3N0IGRheXMuIFdoYXQgZGF5IHdvcmtzIGJlc3QgZm9yIHlvdT9cImAsXHJcbiAgICAgICAgICAgIGBcIkxldCBtZSBjaGVjayAtIHdoYXQgZGF5IHdlcmUgeW91IHRoaW5raW5nP1wiYCxcclxuICAgICAgICAgICAgYFwiT3VyIGxhdGVzdCBzbG90cyB2YXJ5IGJ5IGRheS4gV2hpY2ggZGF5IHdvcmtzIGZvciB5b3U/XCJgXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgdGFyZ2V0RmllbGRzOiBbJ3ByZWZlcnJlZERhdGUnXVxyXG4gICAgICAgIH07XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3Qgc2xvdHMgPSBnZXRBdmFpbGFibGVTbG90c0ZvclByZWZlcmVuY2UoYnVzaW5lc3NIb3VycywgdGltZVByZWZlcmVuY2UpO1xyXG4gICAgXHJcbiAgICBpZiAoc2xvdHMubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb25zdCBzbG90T3B0aW9ucyA9IGZvcm1hdFNsb3RPcHRpb25zKHNsb3RzKTtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpbnN0cnVjdGlvbjogYFVzZXIgcHJlZmVycyBcIiR7dGltZVZhbHVlfVwiLiBPZmZlciBzcGVjaWZpYyBhdmFpbGFibGUgc2xvdHMuXHJcbkF2YWlsYWJsZSBvcHRpb25zIGJhc2VkIG9uIGJ1c2luZXNzIGhvdXJzOiAke3Nsb3RPcHRpb25zfVxyXG5Bc2sgd2hpY2ggZGF5L3RpbWUgd29ya3MgZm9yIHRoZW0uYCxcclxuICAgICAgICBleGFtcGxlczogW1xyXG4gICAgICAgICAgYFwiV2UndmUgZ290ICR7c2xvdE9wdGlvbnN9LiBXaGljaCB3b3JrcyBmb3IgeW91P1wiYCxcclxuICAgICAgICAgIGBcIkkgY2FuIGRvICR7c2xvdE9wdGlvbnN9LiBXaGF0J3MgeW91ciBwaWNrP1wiYCxcclxuICAgICAgICAgIGBcIkhvdyBhYm91dCAke3Nsb3RzWzBdPy5kYXl9IGF0ICR7c2xvdHNbMF0/LnRpbWVzWzBdfT8gT3IgSSd2ZSBnb3Qgb3RoZXIgdGltZXMgdG9vIVwiYFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgdGFyZ2V0RmllbGRzOiBbJ3ByZWZlcnJlZERhdGUnXVxyXG4gICAgICB9O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gTm8gc2xvdHMgbWF0Y2ggcHJlZmVyZW5jZSwgYXNrIGZvciBzcGVjaWZpYyBkYXlcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpbnN0cnVjdGlvbjogYEFzayB3aGF0IHNwZWNpZmljIGRheSB3b3JrcyBmb3IgdGhlbS5gLFxyXG4gICAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgICBgXCJXaGF0IGRheSB3b3JrcyBiZXN0IGZvciB5b3UgdGhpcyB3ZWVrP1wiYCxcclxuICAgICAgICAgIGBcIldoZW4gd2VyZSB5b3UgdGhpbmtpbmcgLSB0aGlzIHdlZWsgb3IgbmV4dD9cImAsXHJcbiAgICAgICAgICBgXCJXaGF0IGRheSBzaG91bGQgd2UgbG9jayBpbj9cImBcclxuICAgICAgICBdLFxyXG4gICAgICAgIHRhcmdldEZpZWxkczogWydwcmVmZXJyZWREYXRlJ11cclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSAzOiBIYXZlIGRhdGUsIG5lZWQgU1BFQ0lGSUMgdGltZSDihpIgT2ZmZXIgdGltZXMgZm9yIHRoYXQgZGF5XHJcbiAgLy8gVGhpcyB0cmlnZ2VycyB3aGVuIHdlIGhhdmUgYSBkYXRlIGJ1dCBvbmx5IGEgdmFndWUgdGltZSBwcmVmZXJlbmNlIChvciBubyB0aW1lKVxyXG4gIGlmIChoYXNEYXRlICYmICFoYXNTcGVjaWZpY1RpbWUgJiYgYnVzaW5lc3NIb3Vycykge1xyXG4gICAgLy8gSWYgdGhleSBoYXZlIGEgdmFndWUgcHJlZmVyZW5jZSBsaWtlIFwiZXZlbmluZ1wiLCBmaWx0ZXIgc2xvdHMgYnkgdGhhdFxyXG4gICAgY29uc3QgZGF5U2xvdHMgPSBoYXNWYWd1ZVRpbWUgXHJcbiAgICAgID8gZ2V0VGltZXNGb3JEYXlGaWx0ZXJlZChidXNpbmVzc0hvdXJzLCBkYXRlVmFsdWUsIFN0cmluZyh0aW1lVmFsdWUpKVxyXG4gICAgICA6IGdldFRpbWVzRm9yRGF5KGJ1c2luZXNzSG91cnMsIGRhdGVWYWx1ZSk7XHJcbiAgICBcclxuICAgIGlmIChkYXlTbG90cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IHRpbWVPcHRpb25zID0gZGF5U2xvdHMuam9pbignLCAnKTtcclxuICAgICAgY29uc3QgY29udGV4dE5vdGUgPSBoYXNWYWd1ZVRpbWUgPyBgIChmaWx0ZXJlZCBmb3IgJHt0aW1lVmFsdWV9KWAgOiAnJztcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpbnN0cnVjdGlvbjogYFVzZXIgcGlja2VkIFwiJHtkYXRlVmFsdWV9XCIke2NvbnRleHROb3RlfS4gVGhleSBuZWVkIGEgU1BFQ0lGSUMgdGltZSAtIG9mZmVyIGF2YWlsYWJsZSBzbG90cy5cclxuQXZhaWxhYmxlIHRpbWVzOiAke3RpbWVPcHRpb25zfVxyXG5Bc2sgdGhlbSB0byBwaWNrIGEgc3BlY2lmaWMgdGltZSBsaWtlIFwiN3BtXCIgb3IgXCI3OjMwXCIuYCxcclxuICAgICAgICBleGFtcGxlczogW1xyXG4gICAgICAgICAgYFwiT24gJHtkYXRlVmFsdWV9IEkndmUgZ290ICR7dGltZU9wdGlvbnN9LiBXaGF0IHRpbWUgd29ya3M/XCJgLFxyXG4gICAgICAgICAgYFwiUGVyZmVjdCEgRm9yICR7ZGF0ZVZhbHVlfSwgaG93IGFib3V0ICR7ZGF5U2xvdHNbMF19IG9yICR7ZGF5U2xvdHNbMV0gfHwgZGF5U2xvdHNbMF19P1wiYCxcclxuICAgICAgICAgIGBcIiR7ZGF0ZVZhbHVlfSB3b3JrcyEgSSBjYW4gZG8gJHt0aW1lT3B0aW9uc30gLSB3aGljaCBvbmU/XCJgXHJcbiAgICAgICAgXSxcclxuICAgICAgICB0YXJnZXRGaWVsZHM6IFsncHJlZmVycmVkVGltZSddXHJcbiAgICAgIH07XHJcbiAgICB9XHJcbiAgfVxyXG4gIFxyXG4gIC8vIENhc2UgNDogSGF2ZSBib3RoIGRhdGUgQU5EIFNQRUNJRklDIHRpbWUg4oaSIENvbmZpcm1cclxuICBpZiAoaGFzRGF0ZSAmJiBoYXNTcGVjaWZpY1RpbWUpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQm90aCBkYXRlIGFuZCBTUEVDSUZJQyB0aW1lIGFyZSBjYXB0dXJlZC4gQ29uZmlybSB0aGUgYXBwb2ludG1lbnQuYCxcclxuICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICBgXCJMb2NrZWQgaW4gZm9yICR7ZGF0ZVZhbHVlfSBhdCAke3RpbWVWYWx1ZX0hXCJgLFxyXG4gICAgICAgIGBcIllvdSdyZSBhbGwgc2V0IC0gc2VlIHlvdSAke2RhdGVWYWx1ZX0gYXQgJHt0aW1lVmFsdWV9IVwiYFxyXG4gICAgICBdLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFtdXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBGYWxsYmFjazogTm8gYnVzaW5lc3MgaG91cnMgYXZhaWxhYmxlLCBqdXN0IGFzayBnZW5lcmljYWxseVxyXG4gIGlmIChuZWVkc0RhdGUgJiYgbmVlZHNUaW1lICYmICFoYXNEYXRlICYmICFoYXNWYWd1ZVRpbWUpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvciBib3RoIHByZWZlcnJlZCBkYXRlIGFuZCB0aW1lLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiV2hlbiB3b3JrcyBmb3IgeW91PyBHaXZlIG1lIGEgZGF5IGFuZCB0aW1lIVwiYCxcclxuICAgICAgICBgXCJXaGF0IGRheSBhbmQgdGltZSBzaG91bGQgd2UgbG9jayBpbj9cImAsXHJcbiAgICAgICAgYFwiV2hlbiBhcmUgeW91IGZyZWUgdG8gY29tZSBpbj9cImBcclxuICAgICAgXSxcclxuICAgICAgdGFyZ2V0RmllbGRzOiBbJ3ByZWZlcnJlZERhdGUnLCAncHJlZmVycmVkVGltZSddXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBHZW5lcmljIGZhbGxiYWNrXHJcbiAgY29uc3Qgc3RpbGxOZWVkZWQgPSBmaWVsZHNOZWVkZWQuZmlsdGVyKGYgPT4gIWZpZWxkc0NhcHR1cmVkW2ZdKTtcclxuICByZXR1cm4ge1xyXG4gICAgaW5zdHJ1Y3Rpb246IGBBc2sgZm9yOiAke3N0aWxsTmVlZGVkLmpvaW4oJyBhbmQgJyl9LmAsXHJcbiAgICB0YXJnZXRGaWVsZHM6IHN0aWxsTmVlZGVkXHJcbiAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhdmFpbGFibGUgc2xvdHMgYmFzZWQgb24gdGltZSBwcmVmZXJlbmNlIChtb3JuaW5nL2V2ZW5pbmcpXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXRBdmFpbGFibGVTbG90c0ZvclByZWZlcmVuY2UoYnVzaW5lc3NIb3VyczogQnVzaW5lc3NIb3VycywgcHJlZmVyZW5jZTogc3RyaW5nKTogVGltZVNsb3RbXSB7XHJcbiAgY29uc3Qgc2xvdHM6IFRpbWVTbG90W10gPSBbXTtcclxuICBjb25zdCBkYXlPcmRlciA9IFsnbW9uZGF5JywgJ3R1ZXNkYXknLCAnd2VkbmVzZGF5JywgJ3RodXJzZGF5JywgJ2ZyaWRheScsICdzYXR1cmRheScsICdzdW5kYXknXTtcclxuICBcclxuICAvLyBEZXRlcm1pbmUgdGltZSByYW5nZSBiYXNlZCBvbiBwcmVmZXJlbmNlXHJcbiAgY29uc3QgaXNNb3JuaW5nID0gcHJlZmVyZW5jZS5pbmNsdWRlcygnbW9ybmluZycpIHx8IHByZWZlcmVuY2UuaW5jbHVkZXMoJ2FtJykgfHwgcHJlZmVyZW5jZS5pbmNsdWRlcygnZWFybHknKTtcclxuICBjb25zdCBpc0V2ZW5pbmcgPSBwcmVmZXJlbmNlLmluY2x1ZGVzKCdldmVuaW5nJykgfHwgcHJlZmVyZW5jZS5pbmNsdWRlcygncG0nKSB8fCBwcmVmZXJlbmNlLmluY2x1ZGVzKCdhZnRlciB3b3JrJykgfHwgcHJlZmVyZW5jZS5pbmNsdWRlcygnbmlnaHQnKTtcclxuICBjb25zdCBpc0FmdGVybm9vbiA9IHByZWZlcmVuY2UuaW5jbHVkZXMoJ2FmdGVybm9vbicpIHx8IHByZWZlcmVuY2UuaW5jbHVkZXMoJ2x1bmNoJyk7XHJcbiAgXHJcbiAgZm9yIChjb25zdCBkYXkgb2YgZGF5T3JkZXIpIHtcclxuICAgIGNvbnN0IGhvdXJzID0gYnVzaW5lc3NIb3Vyc1tkYXldO1xyXG4gICAgaWYgKCFob3VycyB8fCBob3Vycy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICBjb25zdCBtYXRjaGluZ1RpbWVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHNsb3Qgb2YgaG91cnMpIHtcclxuICAgICAgY29uc3QgZnJvbUhvdXIgPSBwYXJzZUludChzbG90LmZyb20uc3BsaXQoJzonKVswXSk7XHJcbiAgICAgIGNvbnN0IHRvSG91ciA9IHBhcnNlSW50KHNsb3QudG8uc3BsaXQoJzonKVswXSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBHZW5lcmF0ZSBzYW1wbGUgdGltZXMgYmFzZWQgb24gcHJlZmVyZW5jZVxyXG4gICAgICBpZiAoaXNNb3JuaW5nICYmIGZyb21Ib3VyIDwgMTIpIHtcclxuICAgICAgICAvLyBNb3JuaW5nIHNsb3RzIChiZWZvcmUgbm9vbilcclxuICAgICAgICBmb3IgKGxldCBoID0gTWF0aC5tYXgoZnJvbUhvdXIsIDYpOyBoIDwgTWF0aC5taW4odG9Ib3VyLCAxMik7IGggKz0gMSkge1xyXG4gICAgICAgICAgbWF0Y2hpbmdUaW1lcy5wdXNoKGZvcm1hdEhvdXIoaCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIGlmIChpc0V2ZW5pbmcgJiYgdG9Ib3VyID49IDE3KSB7XHJcbiAgICAgICAgLy8gRXZlbmluZyBzbG90cyAoNXBtKylcclxuICAgICAgICBmb3IgKGxldCBoID0gTWF0aC5tYXgoZnJvbUhvdXIsIDE3KTsgaCA8IHRvSG91ciAmJiBoIDw9IDIxOyBoICs9IDEpIHtcclxuICAgICAgICAgIG1hdGNoaW5nVGltZXMucHVzaChmb3JtYXRIb3VyKGgpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSBpZiAoaXNBZnRlcm5vb24gJiYgZnJvbUhvdXIgPD0gMTQgJiYgdG9Ib3VyID49IDEyKSB7XHJcbiAgICAgICAgLy8gQWZ0ZXJub29uIHNsb3RzICgxMi01cG0pXHJcbiAgICAgICAgZm9yIChsZXQgaCA9IE1hdGgubWF4KGZyb21Ib3VyLCAxMik7IGggPCBNYXRoLm1pbih0b0hvdXIsIDE3KTsgaCArPSAxKSB7XHJcbiAgICAgICAgICBtYXRjaGluZ1RpbWVzLnB1c2goZm9ybWF0SG91cihoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2UgaWYgKCFpc01vcm5pbmcgJiYgIWlzRXZlbmluZyAmJiAhaXNBZnRlcm5vb24pIHtcclxuICAgICAgICAvLyBObyBzcGVjaWZpYyBwcmVmZXJlbmNlIC0ganVzdCBzaG93IGEgZmV3IG9wdGlvbnNcclxuICAgICAgICBjb25zdCBtaWRwb2ludCA9IE1hdGguZmxvb3IoKGZyb21Ib3VyICsgdG9Ib3VyKSAvIDIpO1xyXG4gICAgICAgIG1hdGNoaW5nVGltZXMucHVzaChmb3JtYXRIb3VyKG1pZHBvaW50KSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKG1hdGNoaW5nVGltZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAvLyBMaW1pdCB0byAyLTMgdGltZXMgcGVyIGRheSB0byBhdm9pZCBvdmVyd2hlbG1pbmdcclxuICAgICAgc2xvdHMucHVzaCh7XHJcbiAgICAgICAgZGF5OiBjYXBpdGFsaXplRmlyc3QoZGF5KSxcclxuICAgICAgICB0aW1lczogbWF0Y2hpbmdUaW1lcy5zbGljZSgwLCAzKVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgLy8gUmV0dXJuIGFsbCBhdmFpbGFibGUgZGF5cyAobGV0IHVzZXIgcGljayBmcm9tIG1vcmUgb3B0aW9ucylcclxuICByZXR1cm4gc2xvdHM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBHZXQgYXZhaWxhYmxlIHRpbWVzIGZvciBhIHNwZWNpZmljIGRheVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0VGltZXNGb3JEYXkoYnVzaW5lc3NIb3VyczogQnVzaW5lc3NIb3VycywgZGF0ZVN0cjogc3RyaW5nKTogc3RyaW5nW10ge1xyXG4gIC8vIFRyeSB0byBwYXJzZSB0aGUgZGF5IGZyb20gdGhlIGRhdGUgc3RyaW5nXHJcbiAgY29uc3QgZGF5TWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgJ21vbic6ICdtb25kYXknLCAndHVlJzogJ3R1ZXNkYXknLCAnd2VkJzogJ3dlZG5lc2RheScsXHJcbiAgICAndGh1JzogJ3RodXJzZGF5JywgJ2ZyaSc6ICdmcmlkYXknLCAnc2F0JzogJ3NhdHVyZGF5JywgJ3N1bic6ICdzdW5kYXknXHJcbiAgfTtcclxuICBcclxuICBjb25zdCBsb3dlckRhdGUgPSBkYXRlU3RyLnRvTG93ZXJDYXNlKCk7XHJcbiAgbGV0IHRhcmdldERheTogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG4gIFxyXG4gIGZvciAoY29uc3QgW2FiYnJldiwgZnVsbF0gb2YgT2JqZWN0LmVudHJpZXMoZGF5TWFwKSkge1xyXG4gICAgaWYgKGxvd2VyRGF0ZS5pbmNsdWRlcyhhYmJyZXYpIHx8IGxvd2VyRGF0ZS5pbmNsdWRlcyhmdWxsKSkge1xyXG4gICAgICB0YXJnZXREYXkgPSBmdWxsO1xyXG4gICAgICBicmVhaztcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgaWYgKCF0YXJnZXREYXkpIHJldHVybiBbXTtcclxuICBcclxuICBjb25zdCBob3VycyA9IGJ1c2luZXNzSG91cnNbdGFyZ2V0RGF5XTtcclxuICBpZiAoIWhvdXJzIHx8IGhvdXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdO1xyXG4gIFxyXG4gIGNvbnN0IHRpbWVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gIGZvciAoY29uc3Qgc2xvdCBvZiBob3Vycykge1xyXG4gICAgY29uc3QgZnJvbUhvdXIgPSBwYXJzZUludChzbG90LmZyb20uc3BsaXQoJzonKVswXSk7XHJcbiAgICBjb25zdCB0b0hvdXIgPSBwYXJzZUludChzbG90LnRvLnNwbGl0KCc6JylbMF0pO1xyXG4gICAgXHJcbiAgICAvLyBHZW5lcmF0ZSBhIGZldyBzYW1wbGUgdGltZXNcclxuICAgIGZvciAobGV0IGggPSBmcm9tSG91cjsgaCA8IHRvSG91ciAmJiB0aW1lcy5sZW5ndGggPCA1OyBoICs9IDIpIHtcclxuICAgICAgdGltZXMucHVzaChmb3JtYXRIb3VyKGgpKTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIHRpbWVzO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IGF2YWlsYWJsZSB0aW1lcyBmb3IgYSBzcGVjaWZpYyBkYXksIGZpbHRlcmVkIGJ5IHRpbWUgcHJlZmVyZW5jZSAobW9ybmluZy9ldmVuaW5nKVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0VGltZXNGb3JEYXlGaWx0ZXJlZChidXNpbmVzc0hvdXJzOiBCdXNpbmVzc0hvdXJzLCBkYXRlU3RyOiBzdHJpbmcsIHRpbWVQcmVmZXJlbmNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XHJcbiAgY29uc3QgYWxsVGltZXMgPSBnZXRUaW1lc0ZvckRheShidXNpbmVzc0hvdXJzLCBkYXRlU3RyKTtcclxuICBpZiAoYWxsVGltZXMubGVuZ3RoID09PSAwKSByZXR1cm4gYWxsVGltZXM7XHJcbiAgXHJcbiAgY29uc3QgcHJlZiA9IHRpbWVQcmVmZXJlbmNlLnRvTG93ZXJDYXNlKCk7XHJcbiAgY29uc3QgaXNFdmVuaW5nID0gcHJlZi5pbmNsdWRlcygnZXZlbmluZycpIHx8IHByZWYuaW5jbHVkZXMoJ25pZ2h0JykgfHwgcHJlZi5pbmNsdWRlcygnYWZ0ZXInKTtcclxuICBjb25zdCBpc01vcm5pbmcgPSBwcmVmLmluY2x1ZGVzKCdtb3JuaW5nJykgfHwgcHJlZi5pbmNsdWRlcygnZWFybHknKTtcclxuICBjb25zdCBpc0FmdGVybm9vbiA9IHByZWYuaW5jbHVkZXMoJ2FmdGVybm9vbicpO1xyXG4gIFxyXG4gIHJldHVybiBhbGxUaW1lcy5maWx0ZXIodGltZSA9PiB7XHJcbiAgICBjb25zdCBob3VyID0gcGFyc2VUaW1lVG9Ib3VyKHRpbWUpO1xyXG4gICAgaWYgKGlzRXZlbmluZykgcmV0dXJuIGhvdXIgPj0gMTc7IC8vIDVwbSBhbmQgbGF0ZXJcclxuICAgIGlmIChpc01vcm5pbmcpIHJldHVybiBob3VyIDwgMTI7ICAvLyBCZWZvcmUgbm9vblxyXG4gICAgaWYgKGlzQWZ0ZXJub29uKSByZXR1cm4gaG91ciA+PSAxMiAmJiBob3VyIDwgMTc7IC8vIDEycG0gLSA1cG1cclxuICAgIHJldHVybiB0cnVlOyAvLyBObyBmaWx0ZXJcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFBhcnNlIGEgdGltZSBzdHJpbmcgbGlrZSBcIjZwbVwiIG9yIFwiMTBhbVwiIHRvIDI0LWhvdXIgbnVtYmVyXHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZVRpbWVUb0hvdXIodGltZVN0cjogc3RyaW5nKTogbnVtYmVyIHtcclxuICBjb25zdCBsb3dlciA9IHRpbWVTdHIudG9Mb3dlckNhc2UoKTtcclxuICBjb25zdCBtYXRjaCA9IGxvd2VyLm1hdGNoKC8oXFxkKylcXHMqKGFtfHBtKT8vKTtcclxuICBpZiAoIW1hdGNoKSByZXR1cm4gMTI7XHJcbiAgXHJcbiAgbGV0IGhvdXIgPSBwYXJzZUludChtYXRjaFsxXSk7XHJcbiAgY29uc3QgaXNQbSA9IG1hdGNoWzJdID09PSAncG0nO1xyXG4gIFxyXG4gIGlmIChpc1BtICYmIGhvdXIgPCAxMikgaG91ciArPSAxMjtcclxuICBpZiAoIWlzUG0gJiYgaG91ciA9PT0gMTIpIGhvdXIgPSAwO1xyXG4gIFxyXG4gIHJldHVybiBob3VyO1xyXG59XHJcblxyXG4vKipcclxuICogRm9ybWF0IGhvdXIgYXMgcmVhZGFibGUgdGltZSAoZS5nLiwgXCI2cG1cIiwgXCIxMGFtXCIpXHJcbiAqL1xyXG5mdW5jdGlvbiBmb3JtYXRIb3VyKGhvdXI6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgaWYgKGhvdXIgPT09IDApIHJldHVybiAnMTJhbSc7XHJcbiAgaWYgKGhvdXIgPT09IDEyKSByZXR1cm4gJzEycG0nO1xyXG4gIGlmIChob3VyIDwgMTIpIHJldHVybiBgJHtob3VyfWFtYDtcclxuICByZXR1cm4gYCR7aG91ciAtIDEyfXBtYDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZvcm1hdCBzbG90IG9wdGlvbnMgYXMgcmVhZGFibGUgc3RyaW5nXHJcbiAqL1xyXG5mdW5jdGlvbiBmb3JtYXRTbG90T3B0aW9ucyhzbG90czogVGltZVNsb3RbXSk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIHNsb3RzLm1hcChzID0+IGAke3MuZGF5fSBhdCAke3MudGltZXMuc2xpY2UoMCwgMikuam9pbignIG9yICcpfWApLmpvaW4oJywgJyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDYXBpdGFsaXplIGZpcnN0IGxldHRlclxyXG4gKi9cclxuZnVuY3Rpb24gY2FwaXRhbGl6ZUZpcnN0KHN0cjogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gc3RyLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc3RyLnNsaWNlKDEpO1xyXG59XHJcblxyXG4vKipcclxuICogR2V0IGF2YWlsYWJsZSBzbG90cyBBRlRFUiBhIHNwZWNpZmljIGhvdXIgKGZvciBcImxhdGVyIHRoYW4gWFwiIHJlcXVlc3RzKVxyXG4gKiBAcGFyYW0gc2tpcERheXMgLSBEYXlzIHRvIHNraXAgKGFscmVhZHkgb2ZmZXJlZCBhbmQgcmVqZWN0ZWQpXHJcbiAqL1xyXG5mdW5jdGlvbiBnZXRBdmFpbGFibGVTbG90c0FmdGVySG91cihidXNpbmVzc0hvdXJzOiBCdXNpbmVzc0hvdXJzLCBtaW5Ib3VyOiBudW1iZXIsIHNraXBEYXlzOiBzdHJpbmdbXSA9IFtdKTogVGltZVNsb3RbXSB7XHJcbiAgY29uc3Qgc2xvdHM6IFRpbWVTbG90W10gPSBbXTtcclxuICBjb25zdCBkYXlPcmRlciA9IFsnbW9uZGF5JywgJ3R1ZXNkYXknLCAnd2VkbmVzZGF5JywgJ3RodXJzZGF5JywgJ2ZyaWRheScsICdzYXR1cmRheScsICdzdW5kYXknXTtcclxuICBcclxuICBmb3IgKGNvbnN0IGRheSBvZiBkYXlPcmRlcikge1xyXG4gICAgLy8gU2tpcCBkYXlzIHRoYXQgd2VyZSBhbHJlYWR5IG9mZmVyZWRcclxuICAgIGlmIChza2lwRGF5cy5zb21lKGQgPT4gZC50b0xvd2VyQ2FzZSgpID09PSBkYXkudG9Mb3dlckNhc2UoKSkpIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICBjb25zdCBob3VycyA9IGJ1c2luZXNzSG91cnNbZGF5XTtcclxuICAgIGlmICghaG91cnMgfHwgaG91cnMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcclxuICAgIFxyXG4gICAgY29uc3QgbWF0Y2hpbmdUaW1lczogc3RyaW5nW10gPSBbXTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCBzbG90IG9mIGhvdXJzKSB7XHJcbiAgICAgIGNvbnN0IGZyb21Ib3VyID0gcGFyc2VJbnQoc2xvdC5mcm9tLnNwbGl0KCc6JylbMF0pO1xyXG4gICAgICBjb25zdCB0b0hvdXIgPSBwYXJzZUludChzbG90LnRvLnNwbGl0KCc6JylbMF0pO1xyXG4gICAgICBcclxuICAgICAgLy8gT25seSBpbmNsdWRlIHRpbWVzIEFGVEVSIHRoZSBtaW5pbXVtIGhvdXJcclxuICAgICAgY29uc3Qgc3RhcnRIb3VyID0gTWF0aC5tYXgoZnJvbUhvdXIsIG1pbkhvdXIgKyAxKTsgLy8gKzEgYmVjYXVzZSBcImxhdGVyIHRoYW4gNlwiIG1lYW5zIGFmdGVyIDZcclxuICAgICAgXHJcbiAgICAgIGlmIChzdGFydEhvdXIgPCB0b0hvdXIpIHtcclxuICAgICAgICBmb3IgKGxldCBoID0gc3RhcnRIb3VyOyBoIDwgdG9Ib3VyICYmIG1hdGNoaW5nVGltZXMubGVuZ3RoIDwgMzsgaCArPSAxKSB7XHJcbiAgICAgICAgICBtYXRjaGluZ1RpbWVzLnB1c2goZm9ybWF0SG91cihoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChtYXRjaGluZ1RpbWVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgc2xvdHMucHVzaCh7XHJcbiAgICAgICAgZGF5OiBjYXBpdGFsaXplRmlyc3QoZGF5KSxcclxuICAgICAgICB0aW1lczogbWF0Y2hpbmdUaW1lcy5zbGljZSgwLCAzKVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgLy8gUmV0dXJuIGFsbCBhdmFpbGFibGUgZGF5c1xyXG4gIHJldHVybiBzbG90cztcclxufVxyXG5cclxuLyoqXHJcbiAqIEdldCBhdmFpbGFibGUgc2xvdHMgQkVGT1JFIGEgc3BlY2lmaWMgaG91ciAoZm9yIFwiZWFybGllclwiIHJlcXVlc3RzKVxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0QXZhaWxhYmxlU2xvdHNCZWZvcmVIb3VyKGJ1c2luZXNzSG91cnM6IEJ1c2luZXNzSG91cnMsIG1heEhvdXI6IG51bWJlcik6IFRpbWVTbG90W10ge1xyXG4gIGNvbnN0IHNsb3RzOiBUaW1lU2xvdFtdID0gW107XHJcbiAgY29uc3QgZGF5T3JkZXIgPSBbJ21vbmRheScsICd0dWVzZGF5JywgJ3dlZG5lc2RheScsICd0aHVyc2RheScsICdmcmlkYXknLCAnc2F0dXJkYXknLCAnc3VuZGF5J107XHJcbiAgXHJcbiAgZm9yIChjb25zdCBkYXkgb2YgZGF5T3JkZXIpIHtcclxuICAgIGNvbnN0IGhvdXJzID0gYnVzaW5lc3NIb3Vyc1tkYXldO1xyXG4gICAgaWYgKCFob3VycyB8fCBob3Vycy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xyXG4gICAgXHJcbiAgICBjb25zdCBtYXRjaGluZ1RpbWVzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IHNsb3Qgb2YgaG91cnMpIHtcclxuICAgICAgY29uc3QgZnJvbUhvdXIgPSBwYXJzZUludChzbG90LmZyb20uc3BsaXQoJzonKVswXSk7XHJcbiAgICAgIGNvbnN0IHRvSG91ciA9IHBhcnNlSW50KHNsb3QudG8uc3BsaXQoJzonKVswXSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBPbmx5IGluY2x1ZGUgdGltZXMgQkVGT1JFIHRoZSBtYXhpbXVtIGhvdXJcclxuICAgICAgY29uc3QgZW5kSG91ciA9IE1hdGgubWluKHRvSG91ciwgbWF4SG91cik7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZnJvbUhvdXIgPCBlbmRIb3VyKSB7XHJcbiAgICAgICAgZm9yIChsZXQgaCA9IGZyb21Ib3VyOyBoIDwgZW5kSG91ciAmJiBtYXRjaGluZ1RpbWVzLmxlbmd0aCA8IDM7IGggKz0gMSkge1xyXG4gICAgICAgICAgbWF0Y2hpbmdUaW1lcy5wdXNoKGZvcm1hdEhvdXIoaCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAobWF0Y2hpbmdUaW1lcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHNsb3RzLnB1c2goe1xyXG4gICAgICAgIGRheTogY2FwaXRhbGl6ZUZpcnN0KGRheSksXHJcbiAgICAgICAgdGltZXM6IG1hdGNoaW5nVGltZXMuc2xpY2UoMCwgMylcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIFxyXG4gIHJldHVybiBzbG90cztcclxufVxyXG5cclxuIl19