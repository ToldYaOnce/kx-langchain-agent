"use strict";
/**
 * Identity Goal Instructions
 *
 * Smart handling for name collection:
 * - If both first and last required: Ask for full name
 * - If user provides full name, extract both
 * - If only one provided, ask for the other
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIdentityInstruction = getIdentityInstruction;
function getIdentityInstruction(context) {
    const { fieldsNeeded, fieldsCaptured } = context;
    const needsFirst = fieldsNeeded.includes('firstName');
    const needsLast = fieldsNeeded.includes('lastName');
    const hasFirst = !!fieldsCaptured.firstName;
    const hasLast = !!fieldsCaptured.lastName;
    const firstName = fieldsCaptured.firstName || '';
    // Case 1: Need BOTH, have NEITHER → Ask for full name
    if (needsFirst && needsLast && !hasFirst && !hasLast) {
        return {
            instruction: `Ask for their name. They can give first name only or full name - either works.
Don't make it feel like a form. Keep it natural.`,
            examples: [
                `"What's your name?"`,
                `"Who am I talking to?"`,
                `"What should I call you?"`,
                `"What's your name, warrior?"`
            ],
            targetFields: ['firstName', 'lastName']
        };
    }
    // Case 2: Have first name, need last name
    if (needsLast && !hasLast && hasFirst) {
        return {
            instruction: `You have their first name (${firstName}). Now ask for their last name.
Be casual about it - don't make it feel like paperwork.`,
            examples: [
                `"And your last name, ${firstName}?"`,
                `"${firstName} what? What's the last name?"`,
                `"Got it, ${firstName}! Last name?"`
            ],
            targetFields: ['lastName']
        };
    }
    // Case 3: Have last name, need first name (rare, but possible)
    if (needsFirst && !hasFirst && hasLast) {
        return {
            instruction: `You have their last name. Ask for their first name.`,
            examples: [
                `"And your first name?"`,
                `"What's your first name?"`
            ],
            targetFields: ['firstName']
        };
    }
    // Case 4: Only first name required
    if (needsFirst && !needsLast && !hasFirst) {
        return {
            instruction: `Ask for their first name only.`,
            examples: [
                `"What's your first name?"`,
                `"What should I call you?"`,
                `"Who am I talking to?"`
            ],
            targetFields: ['firstName']
        };
    }
    // Case 5: Only last name required (unusual)
    if (needsLast && !needsFirst && !hasLast) {
        return {
            instruction: `Ask for their last name.`,
            examples: [
                `"What's your last name?"`,
                `"And your surname?"`
            ],
            targetFields: ['lastName']
        };
    }
    // All captured
    if (hasFirst && hasLast) {
        return {
            instruction: `Name is complete (${firstName} ${fieldsCaptured.lastName}). No question needed.`,
            targetFields: []
        };
    }
    // Fallback
    const stillNeeded = fieldsNeeded.filter(f => !fieldsCaptured[f]);
    return {
        instruction: `Ask for: ${stillNeeded.join(' and ')}.`,
        targetFields: stillNeeded
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWRlbnRpdHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL2dvYWwtaW5zdHJ1Y3Rpb25zL2lkZW50aXR5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7OztHQU9HOztBQUlILHdEQTBGQztBQTFGRCxTQUFnQixzQkFBc0IsQ0FBQyxPQUErQjtJQUNwRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxHQUFHLE9BQU8sQ0FBQztJQUVqRCxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ3RELE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDcEQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7SUFDNUMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUM7SUFFMUMsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLFNBQVMsSUFBSSxFQUFFLENBQUM7SUFFakQsc0RBQXNEO0lBQ3RELElBQUksVUFBVSxJQUFJLFNBQVMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JELE9BQU87WUFDTCxXQUFXLEVBQUU7aURBQzhCO1lBQzNDLFFBQVEsRUFBRTtnQkFDUixxQkFBcUI7Z0JBQ3JCLHdCQUF3QjtnQkFDeEIsMkJBQTJCO2dCQUMzQiw4QkFBOEI7YUFDL0I7WUFDRCxZQUFZLEVBQUUsQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFDO1NBQ3hDLENBQUM7SUFDSixDQUFDO0lBRUQsMENBQTBDO0lBQzFDLElBQUksU0FBUyxJQUFJLENBQUMsT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ3RDLE9BQU87WUFDTCxXQUFXLEVBQUUsOEJBQThCLFNBQVM7d0RBQ0Y7WUFDbEQsUUFBUSxFQUFFO2dCQUNSLHdCQUF3QixTQUFTLElBQUk7Z0JBQ3JDLElBQUksU0FBUywrQkFBK0I7Z0JBQzVDLFlBQVksU0FBUyxlQUFlO2FBQ3JDO1lBQ0QsWUFBWSxFQUFFLENBQUMsVUFBVSxDQUFDO1NBQzNCLENBQUM7SUFDSixDQUFDO0lBRUQsK0RBQStEO0lBQy9ELElBQUksVUFBVSxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ3ZDLE9BQU87WUFDTCxXQUFXLEVBQUUscURBQXFEO1lBQ2xFLFFBQVEsRUFBRTtnQkFDUix3QkFBd0I7Z0JBQ3hCLDJCQUEyQjthQUM1QjtZQUNELFlBQVksRUFBRSxDQUFDLFdBQVcsQ0FBQztTQUM1QixDQUFDO0lBQ0osQ0FBQztJQUVELG1DQUFtQztJQUNuQyxJQUFJLFVBQVUsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzFDLE9BQU87WUFDTCxXQUFXLEVBQUUsZ0NBQWdDO1lBQzdDLFFBQVEsRUFBRTtnQkFDUiwyQkFBMkI7Z0JBQzNCLDJCQUEyQjtnQkFDM0Isd0JBQXdCO2FBQ3pCO1lBQ0QsWUFBWSxFQUFFLENBQUMsV0FBVyxDQUFDO1NBQzVCLENBQUM7SUFDSixDQUFDO0lBRUQsNENBQTRDO0lBQzVDLElBQUksU0FBUyxJQUFJLENBQUMsVUFBVSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDekMsT0FBTztZQUNMLFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsUUFBUSxFQUFFO2dCQUNSLDBCQUEwQjtnQkFDMUIscUJBQXFCO2FBQ3RCO1lBQ0QsWUFBWSxFQUFFLENBQUMsVUFBVSxDQUFDO1NBQzNCLENBQUM7SUFDSixDQUFDO0lBRUQsZUFBZTtJQUNmLElBQUksUUFBUSxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ3hCLE9BQU87WUFDTCxXQUFXLEVBQUUscUJBQXFCLFNBQVMsSUFBSSxjQUFjLENBQUMsUUFBUSx3QkFBd0I7WUFDOUYsWUFBWSxFQUFFLEVBQUU7U0FDakIsQ0FBQztJQUNKLENBQUM7SUFFRCxXQUFXO0lBQ1gsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakUsT0FBTztRQUNMLFdBQVcsRUFBRSxZQUFZLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUc7UUFDckQsWUFBWSxFQUFFLFdBQVc7S0FDMUIsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogSWRlbnRpdHkgR29hbCBJbnN0cnVjdGlvbnNcclxuICogXHJcbiAqIFNtYXJ0IGhhbmRsaW5nIGZvciBuYW1lIGNvbGxlY3Rpb246XHJcbiAqIC0gSWYgYm90aCBmaXJzdCBhbmQgbGFzdCByZXF1aXJlZDogQXNrIGZvciBmdWxsIG5hbWVcclxuICogLSBJZiB1c2VyIHByb3ZpZGVzIGZ1bGwgbmFtZSwgZXh0cmFjdCBib3RoXHJcbiAqIC0gSWYgb25seSBvbmUgcHJvdmlkZWQsIGFzayBmb3IgdGhlIG90aGVyXHJcbiAqL1xyXG5cclxuaW1wb3J0IHR5cGUgeyBHb2FsSW5zdHJ1Y3Rpb25Db250ZXh0LCBHb2FsSW5zdHJ1Y3Rpb24gfSBmcm9tICcuL2luZGV4LmpzJztcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRJZGVudGl0eUluc3RydWN0aW9uKGNvbnRleHQ6IEdvYWxJbnN0cnVjdGlvbkNvbnRleHQpOiBHb2FsSW5zdHJ1Y3Rpb24ge1xyXG4gIGNvbnN0IHsgZmllbGRzTmVlZGVkLCBmaWVsZHNDYXB0dXJlZCB9ID0gY29udGV4dDtcclxuICBcclxuICBjb25zdCBuZWVkc0ZpcnN0ID0gZmllbGRzTmVlZGVkLmluY2x1ZGVzKCdmaXJzdE5hbWUnKTtcclxuICBjb25zdCBuZWVkc0xhc3QgPSBmaWVsZHNOZWVkZWQuaW5jbHVkZXMoJ2xhc3ROYW1lJyk7XHJcbiAgY29uc3QgaGFzRmlyc3QgPSAhIWZpZWxkc0NhcHR1cmVkLmZpcnN0TmFtZTtcclxuICBjb25zdCBoYXNMYXN0ID0gISFmaWVsZHNDYXB0dXJlZC5sYXN0TmFtZTtcclxuICBcclxuICBjb25zdCBmaXJzdE5hbWUgPSBmaWVsZHNDYXB0dXJlZC5maXJzdE5hbWUgfHwgJyc7XHJcbiAgXHJcbiAgLy8gQ2FzZSAxOiBOZWVkIEJPVEgsIGhhdmUgTkVJVEhFUiDihpIgQXNrIGZvciBmdWxsIG5hbWVcclxuICBpZiAobmVlZHNGaXJzdCAmJiBuZWVkc0xhc3QgJiYgIWhhc0ZpcnN0ICYmICFoYXNMYXN0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpbnN0cnVjdGlvbjogYEFzayBmb3IgdGhlaXIgbmFtZS4gVGhleSBjYW4gZ2l2ZSBmaXJzdCBuYW1lIG9ubHkgb3IgZnVsbCBuYW1lIC0gZWl0aGVyIHdvcmtzLlxyXG5Eb24ndCBtYWtlIGl0IGZlZWwgbGlrZSBhIGZvcm0uIEtlZXAgaXQgbmF0dXJhbC5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIG5hbWU/XCJgLFxyXG4gICAgICAgIGBcIldobyBhbSBJIHRhbGtpbmcgdG8/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgc2hvdWxkIEkgY2FsbCB5b3U/XCJgLFxyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIG5hbWUsIHdhcnJpb3I/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydmaXJzdE5hbWUnLCAnbGFzdE5hbWUnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSAyOiBIYXZlIGZpcnN0IG5hbWUsIG5lZWQgbGFzdCBuYW1lXHJcbiAgaWYgKG5lZWRzTGFzdCAmJiAhaGFzTGFzdCAmJiBoYXNGaXJzdCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBZb3UgaGF2ZSB0aGVpciBmaXJzdCBuYW1lICgke2ZpcnN0TmFtZX0pLiBOb3cgYXNrIGZvciB0aGVpciBsYXN0IG5hbWUuXHJcbkJlIGNhc3VhbCBhYm91dCBpdCAtIGRvbid0IG1ha2UgaXQgZmVlbCBsaWtlIHBhcGVyd29yay5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIkFuZCB5b3VyIGxhc3QgbmFtZSwgJHtmaXJzdE5hbWV9P1wiYCxcclxuICAgICAgICBgXCIke2ZpcnN0TmFtZX0gd2hhdD8gV2hhdCdzIHRoZSBsYXN0IG5hbWU/XCJgLFxyXG4gICAgICAgIGBcIkdvdCBpdCwgJHtmaXJzdE5hbWV9ISBMYXN0IG5hbWU/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydsYXN0TmFtZSddXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBDYXNlIDM6IEhhdmUgbGFzdCBuYW1lLCBuZWVkIGZpcnN0IG5hbWUgKHJhcmUsIGJ1dCBwb3NzaWJsZSlcclxuICBpZiAobmVlZHNGaXJzdCAmJiAhaGFzRmlyc3QgJiYgaGFzTGFzdCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBZb3UgaGF2ZSB0aGVpciBsYXN0IG5hbWUuIEFzayBmb3IgdGhlaXIgZmlyc3QgbmFtZS5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIkFuZCB5b3VyIGZpcnN0IG5hbWU/XCJgLFxyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIGZpcnN0IG5hbWU/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydmaXJzdE5hbWUnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSA0OiBPbmx5IGZpcnN0IG5hbWUgcmVxdWlyZWRcclxuICBpZiAobmVlZHNGaXJzdCAmJiAhbmVlZHNMYXN0ICYmICFoYXNGaXJzdCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBBc2sgZm9yIHRoZWlyIGZpcnN0IG5hbWUgb25seS5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIldoYXQncyB5b3VyIGZpcnN0IG5hbWU/XCJgLFxyXG4gICAgICAgIGBcIldoYXQgc2hvdWxkIEkgY2FsbCB5b3U/XCJgLFxyXG4gICAgICAgIGBcIldobyBhbSBJIHRhbGtpbmcgdG8/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydmaXJzdE5hbWUnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSA1OiBPbmx5IGxhc3QgbmFtZSByZXF1aXJlZCAodW51c3VhbClcclxuICBpZiAobmVlZHNMYXN0ICYmICFuZWVkc0ZpcnN0ICYmICFoYXNMYXN0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpbnN0cnVjdGlvbjogYEFzayBmb3IgdGhlaXIgbGFzdCBuYW1lLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiV2hhdCdzIHlvdXIgbGFzdCBuYW1lP1wiYCxcclxuICAgICAgICBgXCJBbmQgeW91ciBzdXJuYW1lP1wiYFxyXG4gICAgICBdLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFsnbGFzdE5hbWUnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQWxsIGNhcHR1cmVkXHJcbiAgaWYgKGhhc0ZpcnN0ICYmIGhhc0xhc3QpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgTmFtZSBpcyBjb21wbGV0ZSAoJHtmaXJzdE5hbWV9ICR7ZmllbGRzQ2FwdHVyZWQubGFzdE5hbWV9KS4gTm8gcXVlc3Rpb24gbmVlZGVkLmAsXHJcbiAgICAgIHRhcmdldEZpZWxkczogW11cclxuICAgIH07XHJcbiAgfVxyXG4gIFxyXG4gIC8vIEZhbGxiYWNrXHJcbiAgY29uc3Qgc3RpbGxOZWVkZWQgPSBmaWVsZHNOZWVkZWQuZmlsdGVyKGYgPT4gIWZpZWxkc0NhcHR1cmVkW2ZdKTtcclxuICByZXR1cm4ge1xyXG4gICAgaW5zdHJ1Y3Rpb246IGBBc2sgZm9yOiAke3N0aWxsTmVlZGVkLmpvaW4oJyBhbmQgJyl9LmAsXHJcbiAgICB0YXJnZXRGaWVsZHM6IHN0aWxsTmVlZGVkXHJcbiAgfTtcclxufVxyXG5cclxuIl19