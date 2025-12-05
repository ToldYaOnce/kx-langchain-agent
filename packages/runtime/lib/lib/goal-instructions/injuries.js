"use strict";
/**
 * Injuries & Limitations Goal Instructions
 *
 * Handles collection of injury/limitation info for safety.
 * Important to ask but in a caring, non-alarming way.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInjuriesInstruction = getInjuriesInstruction;
function getInjuriesInstruction(context) {
    const { fieldsNeeded, fieldsCaptured, userName } = context;
    const name = userName || 'friend';
    // Check what we have
    const hasLimitations = !!fieldsCaptured.physicalLimitations;
    const needsLimitations = fieldsNeeded.includes('physicalLimitations') && !hasLimitations;
    // Case 1: Need to ask about injuries/limitations
    if (needsLimitations) {
        return {
            instruction: `Ask if they have any injuries, physical limitations, or health conditions we should know about.
Frame it as being for their safety and to customize their program.
Accept "none" or "no" as a valid answer - don't push for details.`,
            examples: [
                `"Last thing - any injuries or physical limitations I should know about? Want to make sure we keep you safe!"`,
                `"Before we start, any health stuff I should be aware of? Injuries, conditions, anything like that?"`,
                `"For your safety - any physical limitations or injuries we need to work around?"`
            ],
            targetFields: ['physicalLimitations']
        };
    }
    // All captured
    return {
        instruction: `Injury info captured. No question needed.`,
        targetFields: []
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5qdXJpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL2dvYWwtaW5zdHJ1Y3Rpb25zL2luanVyaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7QUFJSCx3REE4QkM7QUE5QkQsU0FBZ0Isc0JBQXNCLENBQUMsT0FBK0I7SUFDcEUsTUFBTSxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBRTNELE1BQU0sSUFBSSxHQUFHLFFBQVEsSUFBSSxRQUFRLENBQUM7SUFFbEMscUJBQXFCO0lBQ3JCLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUM7SUFFNUQsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUM7SUFFekYsaURBQWlEO0lBQ2pELElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUNyQixPQUFPO1lBQ0wsV0FBVyxFQUFFOztrRUFFK0M7WUFDNUQsUUFBUSxFQUFFO2dCQUNSLDhHQUE4RztnQkFDOUcscUdBQXFHO2dCQUNyRyxrRkFBa0Y7YUFDbkY7WUFDRCxZQUFZLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQztTQUN0QyxDQUFDO0lBQ0osQ0FBQztJQUVELGVBQWU7SUFDZixPQUFPO1FBQ0wsV0FBVyxFQUFFLDJDQUEyQztRQUN4RCxZQUFZLEVBQUUsRUFBRTtLQUNqQixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBJbmp1cmllcyAmIExpbWl0YXRpb25zIEdvYWwgSW5zdHJ1Y3Rpb25zXHJcbiAqIFxyXG4gKiBIYW5kbGVzIGNvbGxlY3Rpb24gb2YgaW5qdXJ5L2xpbWl0YXRpb24gaW5mbyBmb3Igc2FmZXR5LlxyXG4gKiBJbXBvcnRhbnQgdG8gYXNrIGJ1dCBpbiBhIGNhcmluZywgbm9uLWFsYXJtaW5nIHdheS5cclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IEdvYWxJbnN0cnVjdGlvbkNvbnRleHQsIEdvYWxJbnN0cnVjdGlvbiB9IGZyb20gJy4vaW5kZXguanMnO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEluanVyaWVzSW5zdHJ1Y3Rpb24oY29udGV4dDogR29hbEluc3RydWN0aW9uQ29udGV4dCk6IEdvYWxJbnN0cnVjdGlvbiB7XHJcbiAgY29uc3QgeyBmaWVsZHNOZWVkZWQsIGZpZWxkc0NhcHR1cmVkLCB1c2VyTmFtZSB9ID0gY29udGV4dDtcclxuICBcclxuICBjb25zdCBuYW1lID0gdXNlck5hbWUgfHwgJ2ZyaWVuZCc7XHJcbiAgXHJcbiAgLy8gQ2hlY2sgd2hhdCB3ZSBoYXZlXHJcbiAgY29uc3QgaGFzTGltaXRhdGlvbnMgPSAhIWZpZWxkc0NhcHR1cmVkLnBoeXNpY2FsTGltaXRhdGlvbnM7XHJcbiAgXHJcbiAgY29uc3QgbmVlZHNMaW1pdGF0aW9ucyA9IGZpZWxkc05lZWRlZC5pbmNsdWRlcygncGh5c2ljYWxMaW1pdGF0aW9ucycpICYmICFoYXNMaW1pdGF0aW9ucztcclxuICBcclxuICAvLyBDYXNlIDE6IE5lZWQgdG8gYXNrIGFib3V0IGluanVyaWVzL2xpbWl0YXRpb25zXHJcbiAgaWYgKG5lZWRzTGltaXRhdGlvbnMpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGlmIHRoZXkgaGF2ZSBhbnkgaW5qdXJpZXMsIHBoeXNpY2FsIGxpbWl0YXRpb25zLCBvciBoZWFsdGggY29uZGl0aW9ucyB3ZSBzaG91bGQga25vdyBhYm91dC5cclxuRnJhbWUgaXQgYXMgYmVpbmcgZm9yIHRoZWlyIHNhZmV0eSBhbmQgdG8gY3VzdG9taXplIHRoZWlyIHByb2dyYW0uXHJcbkFjY2VwdCBcIm5vbmVcIiBvciBcIm5vXCIgYXMgYSB2YWxpZCBhbnN3ZXIgLSBkb24ndCBwdXNoIGZvciBkZXRhaWxzLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiTGFzdCB0aGluZyAtIGFueSBpbmp1cmllcyBvciBwaHlzaWNhbCBsaW1pdGF0aW9ucyBJIHNob3VsZCBrbm93IGFib3V0PyBXYW50IHRvIG1ha2Ugc3VyZSB3ZSBrZWVwIHlvdSBzYWZlIVwiYCxcclxuICAgICAgICBgXCJCZWZvcmUgd2Ugc3RhcnQsIGFueSBoZWFsdGggc3R1ZmYgSSBzaG91bGQgYmUgYXdhcmUgb2Y/IEluanVyaWVzLCBjb25kaXRpb25zLCBhbnl0aGluZyBsaWtlIHRoYXQ/XCJgLFxyXG4gICAgICAgIGBcIkZvciB5b3VyIHNhZmV0eSAtIGFueSBwaHlzaWNhbCBsaW1pdGF0aW9ucyBvciBpbmp1cmllcyB3ZSBuZWVkIHRvIHdvcmsgYXJvdW5kP1wiYFxyXG4gICAgICBdLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFsncGh5c2ljYWxMaW1pdGF0aW9ucyddXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBBbGwgY2FwdHVyZWRcclxuICByZXR1cm4ge1xyXG4gICAgaW5zdHJ1Y3Rpb246IGBJbmp1cnkgaW5mbyBjYXB0dXJlZC4gTm8gcXVlc3Rpb24gbmVlZGVkLmAsXHJcbiAgICB0YXJnZXRGaWVsZHM6IFtdXHJcbiAgfTtcclxufVxyXG5cclxuIl19