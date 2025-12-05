"use strict";
/**
 * Contact Info Goal Instructions
 *
 * Smart handling for email and phone collection:
 * - If both required and neither captured: Ask for both in one question
 * - If one captured, ask for the other
 * - If only one required: Ask for it (optionally mention the other)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContactInfoInstruction = getContactInfoInstruction;
function getContactInfoInstruction(context) {
    const { fieldsNeeded, fieldsCaptured, userName, companyInfo, channelState } = context;
    const needsEmail = fieldsNeeded.includes('email');
    const needsPhone = fieldsNeeded.includes('phone');
    const hasEmail = !!fieldsCaptured.email;
    const hasPhone = !!fieldsCaptured.phone;
    const name = userName || 'friend';
    // Check if we have scheduling data captured (date/time)
    // This makes the ask contextual: "To confirm your Tuesday 6pm session..."
    const capturedData = channelState?.capturedData || {};
    const preferredDate = capturedData.preferredDate;
    const preferredTime = capturedData.preferredTime;
    const hasSchedulingContext = preferredDate || preferredTime;
    // Build dynamic scheduling context
    let schedulingContext = '';
    if (preferredDate && preferredTime) {
        schedulingContext = `their ${preferredDate} at ${preferredTime} session`;
    }
    else if (preferredDate) {
        schedulingContext = `their ${preferredDate} session`;
    }
    else if (preferredTime) {
        schedulingContext = `their ${preferredTime} session`;
    }
    // Case 1: Need BOTH, have NEITHER → Ask for both at once
    if (needsEmail && needsPhone && !hasEmail && !hasPhone) {
        // If we have scheduling context, reference it!
        if (hasSchedulingContext) {
            return {
                instruction: `Ask for BOTH email AND phone to CONFIRM ${schedulingContext}.
The user already picked a time - now we need contact info to lock it in and send confirmation.`,
                examples: [
                    `"To lock in ${schedulingContext}, what's your email and phone?"`,
                    `"Perfect! To confirm ${schedulingContext}, drop me your email and number."`,
                    `"${schedulingContext} is yours! Just need your email and phone to send the confirmation."`
                ],
                targetFields: ['email', 'phone']
            };
        }
        // No scheduling context - generic ask
        return {
            instruction: `Ask for BOTH email AND phone in ONE question.
Keep it casual and natural - explain we need it to get them scheduled.`,
            examples: [
                `"What's your email and phone number so I can get you scheduled?"`,
                `"Drop me your email and number so we can lock in your session!"`,
                `"To get you on the calendar, what's your email and phone?"`
            ],
            targetFields: ['email', 'phone']
        };
    }
    // Case 2: Need both, have EMAIL only → Ask for phone
    if (needsPhone && !hasPhone && hasEmail) {
        const context = hasSchedulingContext ? ` for ${schedulingContext}` : '';
        return {
            instruction: `User already gave their email. Now ask for their phone number only${context}.
Acknowledge you have their email and just need the phone to complete the booking.`,
            examples: [
                `"Got your email! What's your phone number so I can confirm${context}?"`,
                `"Perfect on the email! Drop me your number and we're all set${context}."`,
                `"Email locked in! What's the best number to text you the confirmation?"`
            ],
            targetFields: ['phone']
        };
    }
    // Case 3: Need both, have PHONE only → Ask for email
    if (needsEmail && !hasEmail && hasPhone) {
        const context = hasSchedulingContext ? ` for ${schedulingContext}` : '';
        return {
            instruction: `User already gave their phone. Now ask for their email only${context}.
Acknowledge you have their number and just need the email to send confirmation.`,
            examples: [
                `"Got your number! What's your email so I can send the confirmation${context}?"`,
                `"Phone locked in! What email should I send your session details to?"`,
                `"Perfect! And your email for the booking confirmation?"`
            ],
            targetFields: ['email']
        };
    }
    // Case 4: Only PHONE required (email optional)
    if (needsPhone && !needsEmail && !hasPhone) {
        const context = hasSchedulingContext ? ` to confirm ${schedulingContext}` : ' to book your session';
        return {
            instruction: `Ask for their phone number${context}.
If they only give phone, that's fine - goal is met.`,
            examples: [
                `"What's your phone number${context}?"`,
                `"Drop me your number and I'll lock it in!"`,
                `"What's the best number to confirm your session?"`
            ],
            targetFields: ['phone']
        };
    }
    // Case 5: Only EMAIL required (phone optional)
    if (needsEmail && !needsPhone && !hasEmail) {
        const context = hasSchedulingContext ? ` for ${schedulingContext}` : '';
        return {
            instruction: `Ask for their email address to send booking confirmation${context}.
If they only give email, that's fine - goal is met.`,
            examples: [
                `"What's your email so I can send the confirmation${context}?"`,
                `"What email should I send your session details to?"`,
                `"Drop me your email for the booking confirmation!"`
            ],
            targetFields: ['email']
        };
    }
    // Fallback: Just ask for whatever is still needed
    const stillNeeded = fieldsNeeded.filter(f => !fieldsCaptured[f]);
    if (stillNeeded.length > 0) {
        return {
            instruction: `Ask for: ${stillNeeded.join(' and ')}.`,
            targetFields: stillNeeded
        };
    }
    // All captured - shouldn't reach here
    return {
        instruction: `Contact info is complete. No question needed.`,
        targetFields: []
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGFjdC1pbmZvLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xpYi9nb2FsLWluc3RydWN0aW9ucy9jb250YWN0LWluZm8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7O0dBT0c7O0FBSUgsOERBa0lDO0FBbElELFNBQWdCLHlCQUF5QixDQUFDLE9BQStCO0lBQ3ZFLE1BQU0sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBRXRGLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbEQsTUFBTSxVQUFVLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNsRCxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztJQUN4QyxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztJQUV4QyxNQUFNLElBQUksR0FBRyxRQUFRLElBQUksUUFBUSxDQUFDO0lBRWxDLHdEQUF3RDtJQUN4RCwwRUFBMEU7SUFDMUUsTUFBTSxZQUFZLEdBQUcsWUFBWSxFQUFFLFlBQVksSUFBSSxFQUFFLENBQUM7SUFDdEQsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLGFBQWEsQ0FBQztJQUNqRCxNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUMsYUFBYSxDQUFDO0lBQ2pELE1BQU0sb0JBQW9CLEdBQUcsYUFBYSxJQUFJLGFBQWEsQ0FBQztJQUU1RCxtQ0FBbUM7SUFDbkMsSUFBSSxpQkFBaUIsR0FBRyxFQUFFLENBQUM7SUFDM0IsSUFBSSxhQUFhLElBQUksYUFBYSxFQUFFLENBQUM7UUFDbkMsaUJBQWlCLEdBQUcsU0FBUyxhQUFhLE9BQU8sYUFBYSxVQUFVLENBQUM7SUFDM0UsQ0FBQztTQUFNLElBQUksYUFBYSxFQUFFLENBQUM7UUFDekIsaUJBQWlCLEdBQUcsU0FBUyxhQUFhLFVBQVUsQ0FBQztJQUN2RCxDQUFDO1NBQU0sSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUN6QixpQkFBaUIsR0FBRyxTQUFTLGFBQWEsVUFBVSxDQUFDO0lBQ3ZELENBQUM7SUFFRCx5REFBeUQ7SUFDekQsSUFBSSxVQUFVLElBQUksVUFBVSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDdkQsK0NBQStDO1FBQy9DLElBQUksb0JBQW9CLEVBQUUsQ0FBQztZQUN6QixPQUFPO2dCQUNMLFdBQVcsRUFBRSwyQ0FBMkMsaUJBQWlCOytGQUNjO2dCQUN2RixRQUFRLEVBQUU7b0JBQ1IsZUFBZSxpQkFBaUIsaUNBQWlDO29CQUNqRSx3QkFBd0IsaUJBQWlCLG1DQUFtQztvQkFDNUUsSUFBSSxpQkFBaUIsc0VBQXNFO2lCQUM1RjtnQkFDRCxZQUFZLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDO2FBQ2pDLENBQUM7UUFDSixDQUFDO1FBRUQsc0NBQXNDO1FBQ3RDLE9BQU87WUFDTCxXQUFXLEVBQUU7dUVBQ29EO1lBQ2pFLFFBQVEsRUFBRTtnQkFDUixrRUFBa0U7Z0JBQ2xFLGlFQUFpRTtnQkFDakUsNERBQTREO2FBQzdEO1lBQ0QsWUFBWSxFQUFFLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztTQUNqQyxDQUFDO0lBQ0osQ0FBQztJQUVELHFEQUFxRDtJQUNyRCxJQUFJLFVBQVUsSUFBSSxDQUFDLFFBQVEsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUN4QyxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDeEUsT0FBTztZQUNMLFdBQVcsRUFBRSxxRUFBcUUsT0FBTztrRkFDYjtZQUM1RSxRQUFRLEVBQUU7Z0JBQ1IsNkRBQTZELE9BQU8sSUFBSTtnQkFDeEUsK0RBQStELE9BQU8sSUFBSTtnQkFDMUUseUVBQXlFO2FBQzFFO1lBQ0QsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDO1NBQ3hCLENBQUM7SUFDSixDQUFDO0lBRUQscURBQXFEO0lBQ3JELElBQUksVUFBVSxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxRQUFRLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUN4RSxPQUFPO1lBQ0wsV0FBVyxFQUFFLDhEQUE4RCxPQUFPO2dGQUNSO1lBQzFFLFFBQVEsRUFBRTtnQkFDUixxRUFBcUUsT0FBTyxJQUFJO2dCQUNoRixzRUFBc0U7Z0JBQ3RFLHlEQUF5RDthQUMxRDtZQUNELFlBQVksRUFBRSxDQUFDLE9BQU8sQ0FBQztTQUN4QixDQUFDO0lBQ0osQ0FBQztJQUVELCtDQUErQztJQUMvQyxJQUFJLFVBQVUsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzNDLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxlQUFlLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDLHVCQUF1QixDQUFDO1FBQ3BHLE9BQU87WUFDTCxXQUFXLEVBQUUsNkJBQTZCLE9BQU87b0RBQ0g7WUFDOUMsUUFBUSxFQUFFO2dCQUNSLDRCQUE0QixPQUFPLElBQUk7Z0JBQ3ZDLDRDQUE0QztnQkFDNUMsbURBQW1EO2FBQ3BEO1lBQ0QsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDO1NBQ3hCLENBQUM7SUFDSixDQUFDO0lBRUQsK0NBQStDO0lBQy9DLElBQUksVUFBVSxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDM0MsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFFBQVEsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3hFLE9BQU87WUFDTCxXQUFXLEVBQUUsMkRBQTJELE9BQU87b0RBQ2pDO1lBQzlDLFFBQVEsRUFBRTtnQkFDUixvREFBb0QsT0FBTyxJQUFJO2dCQUMvRCxxREFBcUQ7Z0JBQ3JELG9EQUFvRDthQUNyRDtZQUNELFlBQVksRUFBRSxDQUFDLE9BQU8sQ0FBQztTQUN4QixDQUFDO0lBQ0osQ0FBQztJQUVELGtEQUFrRDtJQUNsRCxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDM0IsT0FBTztZQUNMLFdBQVcsRUFBRSxZQUFZLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUc7WUFDckQsWUFBWSxFQUFFLFdBQVc7U0FDMUIsQ0FBQztJQUNKLENBQUM7SUFFRCxzQ0FBc0M7SUFDdEMsT0FBTztRQUNMLFdBQVcsRUFBRSwrQ0FBK0M7UUFDNUQsWUFBWSxFQUFFLEVBQUU7S0FDakIsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQ29udGFjdCBJbmZvIEdvYWwgSW5zdHJ1Y3Rpb25zXHJcbiAqIFxyXG4gKiBTbWFydCBoYW5kbGluZyBmb3IgZW1haWwgYW5kIHBob25lIGNvbGxlY3Rpb246XHJcbiAqIC0gSWYgYm90aCByZXF1aXJlZCBhbmQgbmVpdGhlciBjYXB0dXJlZDogQXNrIGZvciBib3RoIGluIG9uZSBxdWVzdGlvblxyXG4gKiAtIElmIG9uZSBjYXB0dXJlZCwgYXNrIGZvciB0aGUgb3RoZXJcclxuICogLSBJZiBvbmx5IG9uZSByZXF1aXJlZDogQXNrIGZvciBpdCAob3B0aW9uYWxseSBtZW50aW9uIHRoZSBvdGhlcilcclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IEdvYWxJbnN0cnVjdGlvbkNvbnRleHQsIEdvYWxJbnN0cnVjdGlvbiB9IGZyb20gJy4vaW5kZXguanMnO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRhY3RJbmZvSW5zdHJ1Y3Rpb24oY29udGV4dDogR29hbEluc3RydWN0aW9uQ29udGV4dCk6IEdvYWxJbnN0cnVjdGlvbiB7XHJcbiAgY29uc3QgeyBmaWVsZHNOZWVkZWQsIGZpZWxkc0NhcHR1cmVkLCB1c2VyTmFtZSwgY29tcGFueUluZm8sIGNoYW5uZWxTdGF0ZSB9ID0gY29udGV4dDtcclxuICBcclxuICBjb25zdCBuZWVkc0VtYWlsID0gZmllbGRzTmVlZGVkLmluY2x1ZGVzKCdlbWFpbCcpO1xyXG4gIGNvbnN0IG5lZWRzUGhvbmUgPSBmaWVsZHNOZWVkZWQuaW5jbHVkZXMoJ3Bob25lJyk7XHJcbiAgY29uc3QgaGFzRW1haWwgPSAhIWZpZWxkc0NhcHR1cmVkLmVtYWlsO1xyXG4gIGNvbnN0IGhhc1Bob25lID0gISFmaWVsZHNDYXB0dXJlZC5waG9uZTtcclxuICBcclxuICBjb25zdCBuYW1lID0gdXNlck5hbWUgfHwgJ2ZyaWVuZCc7XHJcbiAgXHJcbiAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBzY2hlZHVsaW5nIGRhdGEgY2FwdHVyZWQgKGRhdGUvdGltZSlcclxuICAvLyBUaGlzIG1ha2VzIHRoZSBhc2sgY29udGV4dHVhbDogXCJUbyBjb25maXJtIHlvdXIgVHVlc2RheSA2cG0gc2Vzc2lvbi4uLlwiXHJcbiAgY29uc3QgY2FwdHVyZWREYXRhID0gY2hhbm5lbFN0YXRlPy5jYXB0dXJlZERhdGEgfHwge307XHJcbiAgY29uc3QgcHJlZmVycmVkRGF0ZSA9IGNhcHR1cmVkRGF0YS5wcmVmZXJyZWREYXRlO1xyXG4gIGNvbnN0IHByZWZlcnJlZFRpbWUgPSBjYXB0dXJlZERhdGEucHJlZmVycmVkVGltZTtcclxuICBjb25zdCBoYXNTY2hlZHVsaW5nQ29udGV4dCA9IHByZWZlcnJlZERhdGUgfHwgcHJlZmVycmVkVGltZTtcclxuICBcclxuICAvLyBCdWlsZCBkeW5hbWljIHNjaGVkdWxpbmcgY29udGV4dFxyXG4gIGxldCBzY2hlZHVsaW5nQ29udGV4dCA9ICcnO1xyXG4gIGlmIChwcmVmZXJyZWREYXRlICYmIHByZWZlcnJlZFRpbWUpIHtcclxuICAgIHNjaGVkdWxpbmdDb250ZXh0ID0gYHRoZWlyICR7cHJlZmVycmVkRGF0ZX0gYXQgJHtwcmVmZXJyZWRUaW1lfSBzZXNzaW9uYDtcclxuICB9IGVsc2UgaWYgKHByZWZlcnJlZERhdGUpIHtcclxuICAgIHNjaGVkdWxpbmdDb250ZXh0ID0gYHRoZWlyICR7cHJlZmVycmVkRGF0ZX0gc2Vzc2lvbmA7XHJcbiAgfSBlbHNlIGlmIChwcmVmZXJyZWRUaW1lKSB7XHJcbiAgICBzY2hlZHVsaW5nQ29udGV4dCA9IGB0aGVpciAke3ByZWZlcnJlZFRpbWV9IHNlc3Npb25gO1xyXG4gIH1cclxuICBcclxuICAvLyBDYXNlIDE6IE5lZWQgQk9USCwgaGF2ZSBORUlUSEVSIOKGkiBBc2sgZm9yIGJvdGggYXQgb25jZVxyXG4gIGlmIChuZWVkc0VtYWlsICYmIG5lZWRzUGhvbmUgJiYgIWhhc0VtYWlsICYmICFoYXNQaG9uZSkge1xyXG4gICAgLy8gSWYgd2UgaGF2ZSBzY2hlZHVsaW5nIGNvbnRleHQsIHJlZmVyZW5jZSBpdCFcclxuICAgIGlmIChoYXNTY2hlZHVsaW5nQ29udGV4dCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvciBCT1RIIGVtYWlsIEFORCBwaG9uZSB0byBDT05GSVJNICR7c2NoZWR1bGluZ0NvbnRleHR9LlxyXG5UaGUgdXNlciBhbHJlYWR5IHBpY2tlZCBhIHRpbWUgLSBub3cgd2UgbmVlZCBjb250YWN0IGluZm8gdG8gbG9jayBpdCBpbiBhbmQgc2VuZCBjb25maXJtYXRpb24uYCxcclxuICAgICAgICBleGFtcGxlczogW1xyXG4gICAgICAgICAgYFwiVG8gbG9jayBpbiAke3NjaGVkdWxpbmdDb250ZXh0fSwgd2hhdCdzIHlvdXIgZW1haWwgYW5kIHBob25lP1wiYCxcclxuICAgICAgICAgIGBcIlBlcmZlY3QhIFRvIGNvbmZpcm0gJHtzY2hlZHVsaW5nQ29udGV4dH0sIGRyb3AgbWUgeW91ciBlbWFpbCBhbmQgbnVtYmVyLlwiYCxcclxuICAgICAgICAgIGBcIiR7c2NoZWR1bGluZ0NvbnRleHR9IGlzIHlvdXJzISBKdXN0IG5lZWQgeW91ciBlbWFpbCBhbmQgcGhvbmUgdG8gc2VuZCB0aGUgY29uZmlybWF0aW9uLlwiYFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgdGFyZ2V0RmllbGRzOiBbJ2VtYWlsJywgJ3Bob25lJ11cclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTm8gc2NoZWR1bGluZyBjb250ZXh0IC0gZ2VuZXJpYyBhc2tcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvciBCT1RIIGVtYWlsIEFORCBwaG9uZSBpbiBPTkUgcXVlc3Rpb24uXHJcbktlZXAgaXQgY2FzdWFsIGFuZCBuYXR1cmFsIC0gZXhwbGFpbiB3ZSBuZWVkIGl0IHRvIGdldCB0aGVtIHNjaGVkdWxlZC5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIGVtYWlsIGFuZCBwaG9uZSBudW1iZXIgc28gSSBjYW4gZ2V0IHlvdSBzY2hlZHVsZWQ/XCJgLFxyXG4gICAgICAgIGBcIkRyb3AgbWUgeW91ciBlbWFpbCBhbmQgbnVtYmVyIHNvIHdlIGNhbiBsb2NrIGluIHlvdXIgc2Vzc2lvbiFcImAsXHJcbiAgICAgICAgYFwiVG8gZ2V0IHlvdSBvbiB0aGUgY2FsZW5kYXIsIHdoYXQncyB5b3VyIGVtYWlsIGFuZCBwaG9uZT9cImBcclxuICAgICAgXSxcclxuICAgICAgdGFyZ2V0RmllbGRzOiBbJ2VtYWlsJywgJ3Bob25lJ11cclxuICAgIH07XHJcbiAgfVxyXG4gIFxyXG4gIC8vIENhc2UgMjogTmVlZCBib3RoLCBoYXZlIEVNQUlMIG9ubHkg4oaSIEFzayBmb3IgcGhvbmVcclxuICBpZiAobmVlZHNQaG9uZSAmJiAhaGFzUGhvbmUgJiYgaGFzRW1haWwpIHtcclxuICAgIGNvbnN0IGNvbnRleHQgPSBoYXNTY2hlZHVsaW5nQ29udGV4dCA/IGAgZm9yICR7c2NoZWR1bGluZ0NvbnRleHR9YCA6ICcnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBVc2VyIGFscmVhZHkgZ2F2ZSB0aGVpciBlbWFpbC4gTm93IGFzayBmb3IgdGhlaXIgcGhvbmUgbnVtYmVyIG9ubHkke2NvbnRleHR9LlxyXG5BY2tub3dsZWRnZSB5b3UgaGF2ZSB0aGVpciBlbWFpbCBhbmQganVzdCBuZWVkIHRoZSBwaG9uZSB0byBjb21wbGV0ZSB0aGUgYm9va2luZy5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIkdvdCB5b3VyIGVtYWlsISBXaGF0J3MgeW91ciBwaG9uZSBudW1iZXIgc28gSSBjYW4gY29uZmlybSR7Y29udGV4dH0/XCJgLFxyXG4gICAgICAgIGBcIlBlcmZlY3Qgb24gdGhlIGVtYWlsISBEcm9wIG1lIHlvdXIgbnVtYmVyIGFuZCB3ZSdyZSBhbGwgc2V0JHtjb250ZXh0fS5cImAsXHJcbiAgICAgICAgYFwiRW1haWwgbG9ja2VkIGluISBXaGF0J3MgdGhlIGJlc3QgbnVtYmVyIHRvIHRleHQgeW91IHRoZSBjb25maXJtYXRpb24/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydwaG9uZSddXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBDYXNlIDM6IE5lZWQgYm90aCwgaGF2ZSBQSE9ORSBvbmx5IOKGkiBBc2sgZm9yIGVtYWlsXHJcbiAgaWYgKG5lZWRzRW1haWwgJiYgIWhhc0VtYWlsICYmIGhhc1Bob25lKSB7XHJcbiAgICBjb25zdCBjb250ZXh0ID0gaGFzU2NoZWR1bGluZ0NvbnRleHQgPyBgIGZvciAke3NjaGVkdWxpbmdDb250ZXh0fWAgOiAnJztcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgVXNlciBhbHJlYWR5IGdhdmUgdGhlaXIgcGhvbmUuIE5vdyBhc2sgZm9yIHRoZWlyIGVtYWlsIG9ubHkke2NvbnRleHR9LlxyXG5BY2tub3dsZWRnZSB5b3UgaGF2ZSB0aGVpciBudW1iZXIgYW5kIGp1c3QgbmVlZCB0aGUgZW1haWwgdG8gc2VuZCBjb25maXJtYXRpb24uYCxcclxuICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICBgXCJHb3QgeW91ciBudW1iZXIhIFdoYXQncyB5b3VyIGVtYWlsIHNvIEkgY2FuIHNlbmQgdGhlIGNvbmZpcm1hdGlvbiR7Y29udGV4dH0/XCJgLFxyXG4gICAgICAgIGBcIlBob25lIGxvY2tlZCBpbiEgV2hhdCBlbWFpbCBzaG91bGQgSSBzZW5kIHlvdXIgc2Vzc2lvbiBkZXRhaWxzIHRvP1wiYCxcclxuICAgICAgICBgXCJQZXJmZWN0ISBBbmQgeW91ciBlbWFpbCBmb3IgdGhlIGJvb2tpbmcgY29uZmlybWF0aW9uP1wiYFxyXG4gICAgICBdLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFsnZW1haWwnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSA0OiBPbmx5IFBIT05FIHJlcXVpcmVkIChlbWFpbCBvcHRpb25hbClcclxuICBpZiAobmVlZHNQaG9uZSAmJiAhbmVlZHNFbWFpbCAmJiAhaGFzUGhvbmUpIHtcclxuICAgIGNvbnN0IGNvbnRleHQgPSBoYXNTY2hlZHVsaW5nQ29udGV4dCA/IGAgdG8gY29uZmlybSAke3NjaGVkdWxpbmdDb250ZXh0fWAgOiAnIHRvIGJvb2sgeW91ciBzZXNzaW9uJztcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvciB0aGVpciBwaG9uZSBudW1iZXIke2NvbnRleHR9LlxyXG5JZiB0aGV5IG9ubHkgZ2l2ZSBwaG9uZSwgdGhhdCdzIGZpbmUgLSBnb2FsIGlzIG1ldC5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIHBob25lIG51bWJlciR7Y29udGV4dH0/XCJgLFxyXG4gICAgICAgIGBcIkRyb3AgbWUgeW91ciBudW1iZXIgYW5kIEknbGwgbG9jayBpdCBpbiFcImAsXHJcbiAgICAgICAgYFwiV2hhdCdzIHRoZSBiZXN0IG51bWJlciB0byBjb25maXJtIHlvdXIgc2Vzc2lvbj9cImBcclxuICAgICAgXSxcclxuICAgICAgdGFyZ2V0RmllbGRzOiBbJ3Bob25lJ11cclxuICAgIH07XHJcbiAgfVxyXG4gIFxyXG4gIC8vIENhc2UgNTogT25seSBFTUFJTCByZXF1aXJlZCAocGhvbmUgb3B0aW9uYWwpXHJcbiAgaWYgKG5lZWRzRW1haWwgJiYgIW5lZWRzUGhvbmUgJiYgIWhhc0VtYWlsKSB7XHJcbiAgICBjb25zdCBjb250ZXh0ID0gaGFzU2NoZWR1bGluZ0NvbnRleHQgPyBgIGZvciAke3NjaGVkdWxpbmdDb250ZXh0fWAgOiAnJztcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvciB0aGVpciBlbWFpbCBhZGRyZXNzIHRvIHNlbmQgYm9va2luZyBjb25maXJtYXRpb24ke2NvbnRleHR9LlxyXG5JZiB0aGV5IG9ubHkgZ2l2ZSBlbWFpbCwgdGhhdCdzIGZpbmUgLSBnb2FsIGlzIG1ldC5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIGVtYWlsIHNvIEkgY2FuIHNlbmQgdGhlIGNvbmZpcm1hdGlvbiR7Y29udGV4dH0/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgZW1haWwgc2hvdWxkIEkgc2VuZCB5b3VyIHNlc3Npb24gZGV0YWlscyB0bz9cImAsXHJcbiAgICAgICAgYFwiRHJvcCBtZSB5b3VyIGVtYWlsIGZvciB0aGUgYm9va2luZyBjb25maXJtYXRpb24hXCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydlbWFpbCddXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBGYWxsYmFjazogSnVzdCBhc2sgZm9yIHdoYXRldmVyIGlzIHN0aWxsIG5lZWRlZFxyXG4gIGNvbnN0IHN0aWxsTmVlZGVkID0gZmllbGRzTmVlZGVkLmZpbHRlcihmID0+ICFmaWVsZHNDYXB0dXJlZFtmXSk7XHJcbiAgaWYgKHN0aWxsTmVlZGVkLmxlbmd0aCA+IDApIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvcjogJHtzdGlsbE5lZWRlZC5qb2luKCcgYW5kICcpfS5gLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IHN0aWxsTmVlZGVkXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBBbGwgY2FwdHVyZWQgLSBzaG91bGRuJ3QgcmVhY2ggaGVyZVxyXG4gIHJldHVybiB7XHJcbiAgICBpbnN0cnVjdGlvbjogYENvbnRhY3QgaW5mbyBpcyBjb21wbGV0ZS4gTm8gcXVlc3Rpb24gbmVlZGVkLmAsXHJcbiAgICB0YXJnZXRGaWVsZHM6IFtdXHJcbiAgfTtcclxufVxyXG5cclxuIl19