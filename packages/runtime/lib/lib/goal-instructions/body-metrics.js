"use strict";
/**
 * Body Metrics Goal Instructions
 *
 * Handles collection of height, weight, and body composition data.
 * Keeps it casual and non-judgmental - this is sensitive info!
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBodyMetricsInstruction = getBodyMetricsInstruction;
function getBodyMetricsInstruction(context) {
    const { fieldsNeeded, fieldsCaptured, userName } = context;
    const name = userName || 'friend';
    // Check what we have - LLM extracts height and weight as separate fields
    const hasHeight = !!fieldsCaptured.height;
    const hasWeight = !!fieldsCaptured.weight;
    const hasBodyFat = !!fieldsCaptured.bodyFatPercentage;
    const needsHeight = fieldsNeeded.includes('height') && !hasHeight;
    const needsWeight = fieldsNeeded.includes('weight') && !hasWeight;
    const needsBodyFat = fieldsNeeded.includes('bodyFatPercentage') && !hasBodyFat;
    // Case 1: Need both height AND weight - ask together
    if (needsHeight && needsWeight) {
        return {
            instruction: `Ask for their height and weight together in a casual, non-judgmental way.
This helps you understand their starting point. Keep it light and supportive.
Make it clear there's no judgment - just getting a baseline.`,
            examples: [
                `"Quick question - what's your height and weight right now? Just so I know where you're starting from!"`,
                `"No judgment zone here - what are we working with height and weight-wise?"`,
                `"To customize your program, what's your current height and weight?"`
            ],
            targetFields: ['height', 'weight']
        };
    }
    // Case 2: Have one but not the other (rare - usually given together)
    if (needsHeight && !needsWeight) {
        return {
            instruction: `Ask for their height. Keep it casual.`,
            examples: [
                `"And how tall are you?"`,
                `"What's your height?"`
            ],
            targetFields: ['height']
        };
    }
    if (needsWeight && !needsHeight) {
        return {
            instruction: `Ask for their weight. Keep it casual and non-judgmental.`,
            examples: [
                `"And what's your current weight?"`,
                `"What are you weighing in at these days?"`
            ],
            targetFields: ['weight']
        };
    }
    // Case 3: Have height/weight, optionally ask about body fat
    if (hasHeight && hasWeight && needsBodyFat) {
        return {
            instruction: `Optionally ask if they know their body fat percentage. Don't push if they don't know.`,
            examples: [
                `"Do you happen to know your body fat percentage? No worries if not!"`,
                `"Any idea what your body fat is at? Totally fine if you're not sure."`
            ],
            targetFields: ['bodyFatPercentage']
        };
    }
    // All captured
    return {
        instruction: `Body metrics captured. No question needed.`,
        targetFields: []
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9keS1tZXRyaWNzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xpYi9nb2FsLWluc3RydWN0aW9ucy9ib2R5LW1ldHJpY3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOztBQUlILDhEQXFFQztBQXJFRCxTQUFnQix5QkFBeUIsQ0FBQyxPQUErQjtJQUN2RSxNQUFNLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFFM0QsTUFBTSxJQUFJLEdBQUcsUUFBUSxJQUFJLFFBQVEsQ0FBQztJQUVsQyx5RUFBeUU7SUFDekUsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7SUFDMUMsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUM7SUFDMUMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQztJQUV0RCxNQUFNLFdBQVcsR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO0lBQ2xFLE1BQU0sV0FBVyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDbEUsTUFBTSxZQUFZLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBRS9FLHFEQUFxRDtJQUNyRCxJQUFJLFdBQVcsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUMvQixPQUFPO1lBQ0wsV0FBVyxFQUFFOzs2REFFMEM7WUFDdkQsUUFBUSxFQUFFO2dCQUNSLHdHQUF3RztnQkFDeEcsNEVBQTRFO2dCQUM1RSxxRUFBcUU7YUFDdEU7WUFDRCxZQUFZLEVBQUUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDO1NBQ25DLENBQUM7SUFDSixDQUFDO0lBRUQscUVBQXFFO0lBQ3JFLElBQUksV0FBVyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDaEMsT0FBTztZQUNMLFdBQVcsRUFBRSx1Q0FBdUM7WUFDcEQsUUFBUSxFQUFFO2dCQUNSLHlCQUF5QjtnQkFDekIsdUJBQXVCO2FBQ3hCO1lBQ0QsWUFBWSxFQUFFLENBQUMsUUFBUSxDQUFDO1NBQ3pCLENBQUM7SUFDSixDQUFDO0lBRUQsSUFBSSxXQUFXLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNoQyxPQUFPO1lBQ0wsV0FBVyxFQUFFLDBEQUEwRDtZQUN2RSxRQUFRLEVBQUU7Z0JBQ1IsbUNBQW1DO2dCQUNuQywyQ0FBMkM7YUFDNUM7WUFDRCxZQUFZLEVBQUUsQ0FBQyxRQUFRLENBQUM7U0FDekIsQ0FBQztJQUNKLENBQUM7SUFFRCw0REFBNEQ7SUFDNUQsSUFBSSxTQUFTLElBQUksU0FBUyxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQzNDLE9BQU87WUFDTCxXQUFXLEVBQUUsdUZBQXVGO1lBQ3BHLFFBQVEsRUFBRTtnQkFDUixzRUFBc0U7Z0JBQ3RFLHVFQUF1RTthQUN4RTtZQUNELFlBQVksRUFBRSxDQUFDLG1CQUFtQixDQUFDO1NBQ3BDLENBQUM7SUFDSixDQUFDO0lBRUQsZUFBZTtJQUNmLE9BQU87UUFDTCxXQUFXLEVBQUUsNENBQTRDO1FBQ3pELFlBQVksRUFBRSxFQUFFO0tBQ2pCLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEJvZHkgTWV0cmljcyBHb2FsIEluc3RydWN0aW9uc1xyXG4gKiBcclxuICogSGFuZGxlcyBjb2xsZWN0aW9uIG9mIGhlaWdodCwgd2VpZ2h0LCBhbmQgYm9keSBjb21wb3NpdGlvbiBkYXRhLlxyXG4gKiBLZWVwcyBpdCBjYXN1YWwgYW5kIG5vbi1qdWRnbWVudGFsIC0gdGhpcyBpcyBzZW5zaXRpdmUgaW5mbyFcclxuICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IEdvYWxJbnN0cnVjdGlvbkNvbnRleHQsIEdvYWxJbnN0cnVjdGlvbiB9IGZyb20gJy4vaW5kZXguanMnO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEJvZHlNZXRyaWNzSW5zdHJ1Y3Rpb24oY29udGV4dDogR29hbEluc3RydWN0aW9uQ29udGV4dCk6IEdvYWxJbnN0cnVjdGlvbiB7XHJcbiAgY29uc3QgeyBmaWVsZHNOZWVkZWQsIGZpZWxkc0NhcHR1cmVkLCB1c2VyTmFtZSB9ID0gY29udGV4dDtcclxuICBcclxuICBjb25zdCBuYW1lID0gdXNlck5hbWUgfHwgJ2ZyaWVuZCc7XHJcbiAgXHJcbiAgLy8gQ2hlY2sgd2hhdCB3ZSBoYXZlIC0gTExNIGV4dHJhY3RzIGhlaWdodCBhbmQgd2VpZ2h0IGFzIHNlcGFyYXRlIGZpZWxkc1xyXG4gIGNvbnN0IGhhc0hlaWdodCA9ICEhZmllbGRzQ2FwdHVyZWQuaGVpZ2h0O1xyXG4gIGNvbnN0IGhhc1dlaWdodCA9ICEhZmllbGRzQ2FwdHVyZWQud2VpZ2h0O1xyXG4gIGNvbnN0IGhhc0JvZHlGYXQgPSAhIWZpZWxkc0NhcHR1cmVkLmJvZHlGYXRQZXJjZW50YWdlO1xyXG4gIFxyXG4gIGNvbnN0IG5lZWRzSGVpZ2h0ID0gZmllbGRzTmVlZGVkLmluY2x1ZGVzKCdoZWlnaHQnKSAmJiAhaGFzSGVpZ2h0O1xyXG4gIGNvbnN0IG5lZWRzV2VpZ2h0ID0gZmllbGRzTmVlZGVkLmluY2x1ZGVzKCd3ZWlnaHQnKSAmJiAhaGFzV2VpZ2h0O1xyXG4gIGNvbnN0IG5lZWRzQm9keUZhdCA9IGZpZWxkc05lZWRlZC5pbmNsdWRlcygnYm9keUZhdFBlcmNlbnRhZ2UnKSAmJiAhaGFzQm9keUZhdDtcclxuICBcclxuICAvLyBDYXNlIDE6IE5lZWQgYm90aCBoZWlnaHQgQU5EIHdlaWdodCAtIGFzayB0b2dldGhlclxyXG4gIGlmIChuZWVkc0hlaWdodCAmJiBuZWVkc1dlaWdodCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBBc2sgZm9yIHRoZWlyIGhlaWdodCBhbmQgd2VpZ2h0IHRvZ2V0aGVyIGluIGEgY2FzdWFsLCBub24tanVkZ21lbnRhbCB3YXkuXHJcblRoaXMgaGVscHMgeW91IHVuZGVyc3RhbmQgdGhlaXIgc3RhcnRpbmcgcG9pbnQuIEtlZXAgaXQgbGlnaHQgYW5kIHN1cHBvcnRpdmUuXHJcbk1ha2UgaXQgY2xlYXIgdGhlcmUncyBubyBqdWRnbWVudCAtIGp1c3QgZ2V0dGluZyBhIGJhc2VsaW5lLmAsXHJcbiAgICAgIGV4YW1wbGVzOiBbXHJcbiAgICAgICAgYFwiUXVpY2sgcXVlc3Rpb24gLSB3aGF0J3MgeW91ciBoZWlnaHQgYW5kIHdlaWdodCByaWdodCBub3c/IEp1c3Qgc28gSSBrbm93IHdoZXJlIHlvdSdyZSBzdGFydGluZyBmcm9tIVwiYCxcclxuICAgICAgICBgXCJObyBqdWRnbWVudCB6b25lIGhlcmUgLSB3aGF0IGFyZSB3ZSB3b3JraW5nIHdpdGggaGVpZ2h0IGFuZCB3ZWlnaHQtd2lzZT9cImAsXHJcbiAgICAgICAgYFwiVG8gY3VzdG9taXplIHlvdXIgcHJvZ3JhbSwgd2hhdCdzIHlvdXIgY3VycmVudCBoZWlnaHQgYW5kIHdlaWdodD9cImBcclxuICAgICAgXSxcclxuICAgICAgdGFyZ2V0RmllbGRzOiBbJ2hlaWdodCcsICd3ZWlnaHQnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSAyOiBIYXZlIG9uZSBidXQgbm90IHRoZSBvdGhlciAocmFyZSAtIHVzdWFsbHkgZ2l2ZW4gdG9nZXRoZXIpXHJcbiAgaWYgKG5lZWRzSGVpZ2h0ICYmICFuZWVkc1dlaWdodCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW5zdHJ1Y3Rpb246IGBBc2sgZm9yIHRoZWlyIGhlaWdodC4gS2VlcCBpdCBjYXN1YWwuYCxcclxuICAgICAgZXhhbXBsZXM6IFtcclxuICAgICAgICBgXCJBbmQgaG93IHRhbGwgYXJlIHlvdT9cImAsXHJcbiAgICAgICAgYFwiV2hhdCdzIHlvdXIgaGVpZ2h0P1wiYFxyXG4gICAgICBdLFxyXG4gICAgICB0YXJnZXRGaWVsZHM6IFsnaGVpZ2h0J11cclxuICAgIH07XHJcbiAgfVxyXG4gIFxyXG4gIGlmIChuZWVkc1dlaWdodCAmJiAhbmVlZHNIZWlnaHQpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGluc3RydWN0aW9uOiBgQXNrIGZvciB0aGVpciB3ZWlnaHQuIEtlZXAgaXQgY2FzdWFsIGFuZCBub24tanVkZ21lbnRhbC5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIkFuZCB3aGF0J3MgeW91ciBjdXJyZW50IHdlaWdodD9cImAsXHJcbiAgICAgICAgYFwiV2hhdCBhcmUgeW91IHdlaWdoaW5nIGluIGF0IHRoZXNlIGRheXM/XCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWyd3ZWlnaHQnXVxyXG4gICAgfTtcclxuICB9XHJcbiAgXHJcbiAgLy8gQ2FzZSAzOiBIYXZlIGhlaWdodC93ZWlnaHQsIG9wdGlvbmFsbHkgYXNrIGFib3V0IGJvZHkgZmF0XHJcbiAgaWYgKGhhc0hlaWdodCAmJiBoYXNXZWlnaHQgJiYgbmVlZHNCb2R5RmF0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBpbnN0cnVjdGlvbjogYE9wdGlvbmFsbHkgYXNrIGlmIHRoZXkga25vdyB0aGVpciBib2R5IGZhdCBwZXJjZW50YWdlLiBEb24ndCBwdXNoIGlmIHRoZXkgZG9uJ3Qga25vdy5gLFxyXG4gICAgICBleGFtcGxlczogW1xyXG4gICAgICAgIGBcIkRvIHlvdSBoYXBwZW4gdG8ga25vdyB5b3VyIGJvZHkgZmF0IHBlcmNlbnRhZ2U/IE5vIHdvcnJpZXMgaWYgbm90IVwiYCxcclxuICAgICAgICBgXCJBbnkgaWRlYSB3aGF0IHlvdXIgYm9keSBmYXQgaXMgYXQ/IFRvdGFsbHkgZmluZSBpZiB5b3UncmUgbm90IHN1cmUuXCJgXHJcbiAgICAgIF0sXHJcbiAgICAgIHRhcmdldEZpZWxkczogWydib2R5RmF0UGVyY2VudGFnZSddXHJcbiAgICB9O1xyXG4gIH1cclxuICBcclxuICAvLyBBbGwgY2FwdHVyZWRcclxuICByZXR1cm4ge1xyXG4gICAgaW5zdHJ1Y3Rpb246IGBCb2R5IG1ldHJpY3MgY2FwdHVyZWQuIE5vIHF1ZXN0aW9uIG5lZWRlZC5gLFxyXG4gICAgdGFyZ2V0RmllbGRzOiBbXVxyXG4gIH07XHJcbn1cclxuXHJcbiJdfQ==