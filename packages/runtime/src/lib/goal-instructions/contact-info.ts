/**
 * Contact Info Goal Instructions
 * 
 * Smart handling for email and phone collection:
 * - If both required and neither captured: Ask for both in one question
 * - If one captured, ask for the other
 * - If only one required: Ask for it (optionally mention the other)
 */

import type { GoalInstructionContext, GoalInstruction } from './index.js';

export function getContactInfoInstruction(context: GoalInstructionContext): GoalInstruction {
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
  } else if (preferredDate) {
    schedulingContext = `their ${preferredDate} session`;
  } else if (preferredTime) {
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

