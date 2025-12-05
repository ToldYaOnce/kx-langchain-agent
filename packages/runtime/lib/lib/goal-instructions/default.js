"use strict";
/**
 * Default Goal Instructions
 *
 * Fallback for goals that don't have specific instruction generators.
 * Produces generic but sensible prompts based on fields needed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultInstruction = getDefaultInstruction;
function getDefaultInstruction(context) {
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
        }
        else if (motivation) {
            return {
                instruction: `Ask what specific goal they want to achieve, referencing their motivation ("${motivation}").`,
                examples: [
                    `"For this ${motivation}, what's the main goal - weight loss, muscle, toning?"`,
                    `"What specific result are you going for with the ${motivation}?"`,
                    `"So what do you want to achieve for the ${motivation}?"`
                ],
                targetFields: [field]
            };
        }
        else if (timeline) {
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
function humanizeFieldName(field) {
    // Handle common field names
    const fieldMap = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9saWIvZ29hbC1pbnN0cnVjdGlvbnMvZGVmYXVsdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7O0FBSUgsc0RBaUlDO0FBaklELFNBQWdCLHFCQUFxQixDQUFDLE9BQStCO0lBQ25FLE1BQU0sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFFckUsc0NBQXNDO0lBQ3RDLG1HQUFtRztJQUNuRyxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLHNCQUFzQixDQUFDLENBQUM7SUFFakcsSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzdCLE9BQU87WUFDTCxXQUFXLEVBQUUsbUJBQW1CLFFBQVEscUNBQXFDO1lBQzdFLFlBQVksRUFBRSxFQUFFO1NBQ2pCLENBQUM7SUFDSixDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsUUFBUSxJQUFJLFFBQVEsQ0FBQztJQUVsQyxpREFBaUQ7SUFDakQsSUFBSSxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQzNCLCtDQUErQztRQUMvQyxNQUFNLGVBQWUsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuRSxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdDLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzlELE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxLQUFL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biAqIFxyXG4gKiBGYWxsYmFjayBmb3IgZ29hbHMgdGhhdCBkb24ndCBoYXZlIHNwZWNpZmljIGluc3RydWN0aW9uIGdlbmVyYXRvcnMuXHJcbiAqIFByb2R1Y2VzIGdlbmVyaWMgYnV0IHNlbnNpYmxlIHByb21wdHMgYmFzZWQgb24gZmllbGRzIG5lZWRlZC5cclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IEdvYWxJbnN0cnVjdGlvbkNvbnRleHQsIEdvYWxJbnN0cnVjdGlvbiB9IGZyb20gJy4vaW5kZXguanMnO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHRJbnN0cnVjdGlvbihjb250ZXh0OiBHb2FsSW5zdHJ1Y3Rpb25Db250ZXh0KTogR29hbEluc3RydWN0aW9uIHtcclxuICBjb25zdCB7IGZpZWxkc05lZWRlZCwgZmllbGRzQ2FwdHVyZWQsIGdvYWxOYW1lLCB1c2VyTmFtZSB9ID0gY29udGV4dDtcclxuICBcclxuICAvLyBGaWx0ZXIgdG8gb25seSBmaWVsZHMgd2Ugc3RpbGwgbmVlZFxyXG4gIC8vIEV4Y2x1ZGUgbW90aXZhdGlvbkNhdGVnb3JpZXMgLSBpdCdzIGF1dG8tZXh0cmFjdGVkIHdpdGggbW90aXZhdGlvblJlYXNvbiwgbm90IGFza2VkIGZvciBkaXJlY3RseVxyXG4gIGNvbnN0IHN0aWxsTmVlZGVkID0gZmllbGRzTmVlZGVkLmZpbHRlcihmID0+ICFmaWVsZHNDYXB0dXJlZFtmXSAmJiBmICE9PSAnbW90aXZhdGlvbkNhdGVnb3JpZXMnKTtcclxuICBcclxuICBpZiAoc3RpbGxOZWVkZWQubGVuZ3RoID09PSAwKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpbnN0cnVjdGlvbjogYEFsbCBmaWVsZHMgZm9yIFwiJHtnb2FsTmFtZX1cIiBhcmUgY2FwdHVyZWQuIE5vIHF1ZXN0aW9uIG5lZWRlZC5gLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFtdXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICBjb25zdCBuYW1lID0gdXNlck5hbWUgfHwgJ2ZyaWVuZCc7XHJcbiAgXHJcbiAgLy8gSWYgbXVsdGlwbGUgZmllbGRzIG5lZWRlZCwgYXNrIGZvciBhbGwgYXQgb25jZVxyXG4gIGlmIChzdGlsbE5lZWRlZC5sZW5ndGggPiAxKSB7XHJcbiAgICAvLyBDb252ZXJ0IGZpZWxkIG5hbWVzIHRvIGh1bWFuLXJlYWRhYmxlIGxhYmVsc1xyXG4gICAgY29uc3QgaHVtYW5pemVkRmllbGRzID0gc3RpbGxOZWVkZWQubWFwKGYgPT4gaHVtYW5pemVGaWVsZE5hbWUoZikpO1xyXG4gICAgY29uc3QgZmllbGRMaXN0ID0gaHVtYW5pemVkRmllbGRzLmpvaW4oJywgJyk7XHJcbiAgICBjb25zdCBsYXN0RmllbGQgPSBodW1hbml6ZWRGaWVsZHNbaHVtYW5pemVkRmllbGRzLmxlbmd0aCAtIDFdO1xyXG4gICAgY29uc3QgZmlyc3RGaWVsZHMgPSBodW1hbml6ZWRGaWVsZHMuc2xpY2UoMCwgLTEpLmpvaW4oJywgJyk7XHJcbiAgICBjb25zdCBuYXR1cmFsRmllbGRMaXN0ID0gaHVtYW5pemVkRmllbGRzLmxlbmd0aCA+IDEgXHJcbiAgICAgID8gYCR7Zmlyc3RGaWVsZHN9LCBhbmQgJHtsYXN0RmllbGR9YCBcclxuICAgICAgOiBsYXN0RmllbGQ7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGFib3V0IHRoZWlyICR7bmF0dXJhbEZpZWxkTGlzdH0gaW4gYSBuYXR1cmFsLCBjb252ZXJzYXRpb25hbCB3YXkuXHJcbkRvbid0IG1ha2UgaXQgZmVlbCBsaWtlIGEgZm9ybSAtIGtlZXAgaXQgY2FzdWFsIGFuZCBmcmllbmRseS5cclxuRE8gTk9UIHVzZSB0aGUgZmllbGQgbmFtZXMgbGl0ZXJhbGx5IC0gdXNlIG5hdHVyYWwgbGFuZ3VhZ2UhYCxcclxuICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICBgXCJTbyB0ZWxsIG1lIC0gd2hhdCBhcmUgeW91IGhvcGluZyB0byBhY2hpZXZlPyBXaGF0J3MgZHJpdmluZyB5b3UsIGFuZCB3aGVuIGRvIHlvdSB3YW50IHRvIGhpdCB5b3VyIHRhcmdldD9cImAsXHJcbiAgICAgICAgYFwiV2hhdCdzIHlvdXIgbWFpbiBmaXRuZXNzIGdvYWw/IFdoYXQncyBtb3RpdmF0aW5nIHlvdSB0byBtYWtlIHRoaXMgY2hhbmdlLCBhbmQgd2hhdCdzIHlvdXIgdGltZWxpbmU/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgYnJpbmdzIHlvdSBpbiB0b2RheT8gV2hhdCBhcmUgeW91IGxvb2tpbmcgdG8gYWNjb21wbGlzaCBhbmQgYnkgd2hlbj9cImBcclxuICAgICAgXSxcclxuICAgICAgdGFyZ2V0RmllbGRzOiBzdGlsbE5lZWRlZFxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gU2luZ2xlIGZpZWxkIG5lZWRlZFxyXG4gIGNvbnN0IGZpZWxkID0gc3RpbGxOZWVkZWRbMF07XHJcbiAgY29uc3QgZmllbGRMYWJlbCA9IGh1bWFuaXplRmllbGROYW1lKGZpZWxkKTtcclxuICBcclxuICAvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBjb21tb24gc2luZ2xlLWZpZWxkIHNjZW5hcmlvc1xyXG4gIGlmIChmaWVsZCA9PT0gJ21vdGl2YXRpb25SZWFzb24nKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpbnN0cnVjdGlvbjogYEFzayB3aGF0J3MgZHJpdmluZy9tb3RpdmF0aW5nIHRoZW0uIEtlZXAgaXQgY2FzdWFsLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiV2hhdCdzIGRyaXZpbmcgdGhpcyBjaGFuZ2UgZm9yIHlvdT9cImAsXHJcbiAgICAgICAgYFwiV2hhdCdzIHlvdXIgbW90aXZhdGlvbiBiZWhpbmQgdGhpcz9cImAsXHJcbiAgICAgICAgYFwiV2hhdCBtYWRlIHlvdSBkZWNpZGUgbm93IGlzIHRoZSB0aW1lP1wiYFxyXG4gICAgICBdLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFtmaWVsZF1cclxuICAgIH07XHJcbiAgfVxyXG4gIFxyXG4gIGlmIChmaWVsZCA9PT0gJ3RpbWVsaW5lJykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBBc2sgYWJvdXQgdGhlaXIgdGltZWxpbmUvd2hlbiB0aGV5IHdhbnQgdG8gYWNoaWV2ZSB0aGVpciBnb2FsLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiV2hlbiBhcmUgeW91IGxvb2tpbmcgdG8gaGl0IHRoaXMgZ29hbD9cImAsXHJcbiAgICAgICAgYFwiV2hhdCdzIHlvdXIgdGltZWxpbmUgZm9yIHRoaXM/XCJgLFxyXG4gICAgICAgIGBcIkJ5IHdoZW4gZG8geW91IHdhbnQgdG8gc2VlIHJlc3VsdHM/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogW2ZpZWxkXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgaWYgKGZpZWxkID09PSAncHJpbWFyeUdvYWwnKSB7XHJcbiAgICAvLyBCdWlsZCBjb250ZXh0IGZyb20gd2hhdCB3ZSBhbHJlYWR5IGtub3dcclxuICAgIGNvbnN0IG1vdGl2YXRpb24gPSBmaWVsZHNDYXB0dXJlZC5tb3RpdmF0aW9uUmVhc29uO1xyXG4gICAgY29uc3QgdGltZWxpbmUgPSBmaWVsZHNDYXB0dXJlZC50aW1lbGluZTtcclxuICAgIFxyXG4gICAgLy8gSWYgd2UgaGF2ZSBjb250ZXh0LCByZWZlcmVuY2UgaXQgaW4gdGhlIHF1ZXN0aW9uXHJcbiAgICBpZiAobW90aXZhdGlvbiAmJiB0aW1lbGluZSkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGluc3RydWN0aW9uOiBgQXNrIHdoYXQgc3BlY2lmaWMgZ29hbCB0aGV5IHdhbnQgdG8gYWNoaWV2ZS4gXHJcblJlZmVyZW5jZSB3aGF0IHRoZXkgYWxyZWFkeSB0b2xkIHlvdSAobW90aXZhdGlvbjogXCIke21vdGl2YXRpb259XCIsIHRpbWVsaW5lOiBcIiR7dGltZWxpbmV9XCIpIHRvIHNob3cgeW91IHdlcmUgbGlzdGVuaW5nLlxyXG5Bc2sgd2hhdCBTUEVDSUZJQyByZXN1bHQgdGhleSdyZSBsb29raW5nIGZvciAoZS5nLiwgbG9zZSB3ZWlnaHQsIGJ1aWxkIG11c2NsZSwgZ2V0IHN0cm9uZ2VyKS5gLFxyXG4gICAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgICBgXCJMb3ZlIHRoYXQgJHttb3RpdmF0aW9ufSBtb3RpdmF0aW9uISBCeSAke3RpbWVsaW5lfSwgd2hhdCBzcGVjaWZpYyByZXN1bHQgYXJlIHlvdSBnb2luZyBmb3IgLSB3ZWlnaHQgbG9zcywgbXVzY2xlIGdhaW4sIHRvbmluZyB1cD9cImAsXHJcbiAgICAgICAgICBgXCJTbyBmb3IgdGhpcyAke21vdGl2YXRpb259IGRlYWRsaW5lLCB3aGF0J3MgVEhFIGdvYWwgLSBkcm9wcGluZyBwb3VuZHMsIGJ1aWxkaW5nIHN0cmVuZ3RoLCBvciBzb21ldGhpbmcgZWxzZT9cImAsXHJcbiAgICAgICAgICBgXCJHb3QgaXQgLSAke3RpbWVsaW5lfSBpcyB0aGUgdGFyZ2V0LiBXaGF0IGV4YWN0bHkgZG8geW91IHdhbnQgdG8gYWNoaWV2ZSBieSB0aGVuP1wiYFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgdGFyZ2V0RmllbGRzOiBbZmllbGRdXHJcbiAgICAgIH07XHJcbiAgICB9IGVsc2UgaWYgKG1vdGl2YXRpb24pIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpbnN0cnVjdGlvbjogYEFzayB3aGF0IHNwZWNpZmljIGdvYWwgdGhleSB3YW50IHRvIGFjaGlldmUsIHJlZmVyZW5jaW5nIHRoZWlyIG1vdGl2YXRpb24gKFwiJHttb3RpdmF0aW9ufVwiKS5gLFxyXG4gICAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgICBgXCJGb3IgdGhpcyAke21vdGl2YXRpb259LCB3aGF0J3MgdGhlIG1haW4gZ29hbCAtIHdlaWdodCBsb3NzLCBtdXNjbGUsIHRvbmluZz9cImAsXHJcbiAgICAgICAgICBgXCJXaGF0IHNwZWNpZmljIHJlc3VsdCBhcmUgeW91IGdvaW5nIGZvciB3aXRoIHRoZSAke21vdGl2YXRpb259P1wiYCxcclxuICAgICAgICAgIGBcIlNvIHdoYXQgZG8geW91IHdhbnQgdG8gYWNoaWV2ZSBmb3IgdGhlICR7bW90aXZhdGlvbn0/XCJgXHJcbiAgICAgICAgXSxcclxuICAgICAgICB0YXJnZXRGaWVsZHM6IFtmaWVsZF1cclxuICAgICAgfTtcclxuICAgIH0gZWxzZSBpZiAodGltZWxpbmUpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBpbnN0cnVjdGlvbjogYEFzayB3aGF0IHNwZWNpZmljIGdvYWwgdGhleSB3YW50IHRvIGFjaGlldmUgYnkgdGhlaXIgdGltZWxpbmUgKFwiJHt0aW1lbGluZX1cIikuYCxcclxuICAgICAgICBleGFtcGxlczogW1xyXG4gICAgICAgICAgYFwiQnkgJHt0aW1lbGluZX0sIHdoYXQgYXJlIHlvdSBsb29raW5nIHRvIGFjY29tcGxpc2g/XCJgLFxyXG4gICAgICAgICAgYFwiV2hhdCdzIHRoZSBnb2FsIGZvciAke3RpbWVsaW5lfT9cImAsXHJcbiAgICAgICAgICBgXCJXaGF0IGRvIHlvdSB3YW50IHRvIGFjaGlldmUgYnkgJHt0aW1lbGluZX0/XCJgXHJcbiAgICAgICAgXSxcclxuICAgICAgICB0YXJnZXRGaWVsZHM6IFtmaWVsZF1cclxuICAgICAgfTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gTm8gY29udGV4dCAtIGdlbmVyaWMgcXVlc3Rpb25cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIHdoYXQgdGhlaXIgbWFpbiBmaXRuZXNzIGdvYWwgaXMuYCxcclxuICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICBgXCJXaGF0J3MgeW91ciBtYWluIGdvYWw/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgYXJlIHlvdSBsb29raW5nIHRvIGFjaGlldmU/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgYnJpbmdzIHlvdSBpbiB0b2RheT9cImBcclxuICAgICAgXSxcclxuICAgICAgdGFyZ2V0RmllbGRzOiBbZmllbGRdXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICByZXR1cm4ge1xyXG4gICAgaW5zdHJ1Y3Rpb246IGBBc2sgZm9yIHRoZWlyICR7ZmllbGRMYWJlbH0uYCxcclxuICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgIGBcIldoYXQncyB5b3VyICR7ZmllbGRMYWJlbH0/XCJgLFxyXG4gICAgICBgXCJUZWxsIG1lIGFib3V0IHlvdXIgJHtmaWVsZExhYmVsfSFcImBcclxuICAgIF0sXHJcbiAgICB0YXJnZXRGaWVsZHM6IFtmaWVsZF1cclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydCBjYW1lbENhc2UgZmllbGQgbmFtZSB0byBodW1hbi1yZWFkYWJsZSBsYWJlbFxyXG4gKi9cclxuZnVuY3Rpb24gaHVtYW5pemVGaWVsZE5hbWUoZmllbGQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgLy8gSGFuZGxlIGNvbW1vbiBmaWVsZCBuYW1lc1xyXG4gIGNvbnN0IGZpZWxkTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgZmlyc3ROYW1lOiAnZmlyc3QgbmFtZScsXHJcbiAgICBsYXN0TmFtZTogJ2xhc3QgbmFtZScsXHJcbiAgICBlbWFpbDogJ2VtYWlsIGFkZHJlc3MnLFxyXG4gICAgcGhvbmU6ICdwaG9uZSBudW1iZXInLFxyXG4gICAgcHJlZmVycmVkRGF0ZTogJ3ByZWZlcnJlZCBkYXRlJyxcclxuICAgIHByZWZlcnJlZFRpbWU6ICdwcmVmZXJyZWQgdGltZScsXHJcbiAgICBwcmltYXJ5R29hbDogJ21haW4gZ29hbCcsXHJcbiAgICBmaXRuZXNzR29hbHM6ICdmaXRuZXNzIGdvYWxzJyxcclxuICAgIG1vdGl2YXRpb25SZWFzb246ICdtb3RpdmF0aW9uJyxcclxuICAgIHRpbWVsaW5lOiAndGltZWxpbmUnLFxyXG4gICAgaGVpZ2h0OiAnaGVpZ2h0JyxcclxuICAgIHdlaWdodDogJ3dlaWdodCcsXHJcbiAgICBoZWlnaHRXZWlnaHQ6ICdoZWlnaHQgYW5kIHdlaWdodCcsXHJcbiAgICBib2R5RmF0UGVyY2VudGFnZTogJ2JvZHkgZmF0IHBlcmNlbnRhZ2UnLFxyXG4gICAgaW5qdXJpZXM6ICdpbmp1cmllcycsXHJcbiAgICBtZWRpY2FsQ29uZGl0aW9uczogJ21lZGljYWwgY29uZGl0aW9ucycsXHJcbiAgICBwaHlzaWNhbExpbWl0YXRpb25zOiAncGh5c2ljYWwgbGltaXRhdGlvbnMgb3IgaW5qdXJpZXMnLFxyXG4gICAgZG9jdG9yQ2xlYXJhbmNlOiAnZG9jdG9yIGNsZWFyYW5jZSdcclxuICB9O1xyXG4gIFxyXG4gIGlmIChmaWVsZE1hcFtmaWVsZF0pIHtcclxuICAgIHJldHVybiBmaWVsZE1hcFtmaWVsZF07XHJcbiAgfVxyXG4gIFxyXG4gIC8vIENvbnZlcnQgY2FtZWxDYXNlIHRvIHNwYWNlLXNlcGFyYXRlZCB3b3Jkc1xyXG4gIHJldHVybiBmaWVsZFxyXG4gICAgLnJlcGxhY2UoLyhbQS1aXSkvZywgJyAkMScpXHJcbiAgICAudG9Mb3dlckNhc2UoKVxyXG4gICAgLnRyaW0oKTtcclxufVxyXG5cclxuIl19