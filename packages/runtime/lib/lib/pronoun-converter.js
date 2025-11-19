"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PronounConverter = void 0;
/**
 * Converts first-person pronouns to second-person for AI system prompts
 * Allows users to write naturally ("I am...") while sending proper format to AI ("You are...")
 */
class PronounConverter {
    /**
     * Convert first-person text to second-person with proper capitalization
     */
    static firstToSecondPerson(input) {
        let text = input;
        // Step 1: Handle contractions & multi-word forms
        const replacements = [
            [/\bI'm\b/g, "you're"],
            [/\bI am\b/g, "you are"],
            [/\bI've\b/g, "you've"],
            [/\bI'd\b/g, "you'd"],
            [/\bI'll\b/g, "you'll"],
            [/\bme\b/g, "you"],
            [/\bmy\b/g, "your"],
            [/\bmine\b/g, "yours"],
            [/\bmyself\b/g, "yourself"],
            [/\bI\b/g, "you"]
        ];
        for (const [pattern, replacement] of replacements) {
            text = text.replace(pattern, replacement);
        }
        // Step 2: Fix capitalization at sentence starts
        // Capitalize "you" at the very beginning
        text = text.replace(/^you\b/, 'You');
        // Capitalize "you" after sentence-ending punctuation (. ! ? followed by space)
        text = text.replace(/([.!?]\s+)you\b/g, '$1You');
        // Capitalize "you" after newlines
        text = text.replace(/(\n\s*)you\b/g, '$1You');
        return text;
    }
    /**
     * Check if text appears to be in first person
     */
    static isFirstPerson(text) {
        const firstPersonPattern = /\b(I am|I'm|I've|I'd|I'll|I\b|me\b|my\b|mine\b|myself\b)/i;
        return firstPersonPattern.test(text);
    }
    /**
     * Check if text appears to be in second person
     */
    static isSecondPerson(text) {
        const secondPersonPattern = /\b(You are|You're|You've|You'd|You'll|You\b|your\b|yours\b|yourself\b)/i;
        return secondPersonPattern.test(text);
    }
}
exports.PronounConverter = PronounConverter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbm91bi1jb252ZXJ0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL3Byb25vdW4tY29udmVydGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOzs7R0FHRztBQUNILE1BQWEsZ0JBQWdCO0lBQzNCOztPQUVHO0lBQ0gsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEtBQWE7UUFDdEMsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDO1FBRWpCLGlEQUFpRDtRQUNqRCxNQUFNLFlBQVksR0FBdUI7WUFDdkMsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDO1lBQ3RCLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQztZQUN4QixDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUM7WUFDdkIsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDO1lBQ3JCLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQztZQUN2QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUM7WUFDbEIsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDO1lBQ25CLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQztZQUN0QixDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUM7WUFDM0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDO1NBQ2xCLENBQUM7UUFFRixLQUFLLE1BQU0sQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEQsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFRCxnREFBZ0Q7UUFDaEQseUNBQXlDO1FBQ3pDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVyQywrRUFBK0U7UUFDL0UsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFakQsa0NBQWtDO1FBQ2xDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUU5QyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBWTtRQUMvQixNQUFNLGtCQUFrQixHQUFHLDJEQUEyRCxDQUFDO1FBQ3ZGLE9BQU8sa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBWTtRQUNoQyxNQUFNLG1CQUFtQixHQUFHLHlFQUF5RSxDQUFDO1FBQ3RHLE9BQU8sbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hDLENBQUM7Q0FDRjtBQXJERCw0Q0FxREMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQ29udmVydHMgZmlyc3QtcGVyc29uIHByb25vdW5zIHRvIHNlY29uZC1wZXJzb24gZm9yIEFJIHN5c3RlbSBwcm9tcHRzXHJcbiAqIEFsbG93cyB1c2VycyB0byB3cml0ZSBuYXR1cmFsbHkgKFwiSSBhbS4uLlwiKSB3aGlsZSBzZW5kaW5nIHByb3BlciBmb3JtYXQgdG8gQUkgKFwiWW91IGFyZS4uLlwiKVxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIFByb25vdW5Db252ZXJ0ZXIge1xyXG4gIC8qKlxyXG4gICAqIENvbnZlcnQgZmlyc3QtcGVyc29uIHRleHQgdG8gc2Vjb25kLXBlcnNvbiB3aXRoIHByb3BlciBjYXBpdGFsaXphdGlvblxyXG4gICAqL1xyXG4gIHN0YXRpYyBmaXJzdFRvU2Vjb25kUGVyc29uKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgbGV0IHRleHQgPSBpbnB1dDtcclxuXHJcbiAgICAvLyBTdGVwIDE6IEhhbmRsZSBjb250cmFjdGlvbnMgJiBtdWx0aS13b3JkIGZvcm1zXHJcbiAgICBjb25zdCByZXBsYWNlbWVudHM6IFtSZWdFeHAsIHN0cmluZ11bXSA9IFtcclxuICAgICAgWy9cXGJJJ21cXGIvZywgXCJ5b3UncmVcIl0sXHJcbiAgICAgIFsvXFxiSSBhbVxcYi9nLCBcInlvdSBhcmVcIl0sXHJcbiAgICAgIFsvXFxiSSd2ZVxcYi9nLCBcInlvdSd2ZVwiXSxcclxuICAgICAgWy9cXGJJJ2RcXGIvZywgXCJ5b3UnZFwiXSxcclxuICAgICAgWy9cXGJJJ2xsXFxiL2csIFwieW91J2xsXCJdLFxyXG4gICAgICBbL1xcYm1lXFxiL2csIFwieW91XCJdLFxyXG4gICAgICBbL1xcYm15XFxiL2csIFwieW91clwiXSxcclxuICAgICAgWy9cXGJtaW5lXFxiL2csIFwieW91cnNcIl0sXHJcbiAgICAgIFsvXFxibXlzZWxmXFxiL2csIFwieW91cnNlbGZcIl0sXHJcbiAgICAgIFsvXFxiSVxcYi9nLCBcInlvdVwiXVxyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCByZXBsYWNlbWVudF0gb2YgcmVwbGFjZW1lbnRzKSB7XHJcbiAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UocGF0dGVybiwgcmVwbGFjZW1lbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFN0ZXAgMjogRml4IGNhcGl0YWxpemF0aW9uIGF0IHNlbnRlbmNlIHN0YXJ0c1xyXG4gICAgLy8gQ2FwaXRhbGl6ZSBcInlvdVwiIGF0IHRoZSB2ZXJ5IGJlZ2lubmluZ1xyXG4gICAgdGV4dCA9IHRleHQucmVwbGFjZSgvXnlvdVxcYi8sICdZb3UnKTtcclxuICAgIFxyXG4gICAgLy8gQ2FwaXRhbGl6ZSBcInlvdVwiIGFmdGVyIHNlbnRlbmNlLWVuZGluZyBwdW5jdHVhdGlvbiAoLiAhID8gZm9sbG93ZWQgYnkgc3BhY2UpXHJcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC8oWy4hP11cXHMrKXlvdVxcYi9nLCAnJDFZb3UnKTtcclxuICAgIFxyXG4gICAgLy8gQ2FwaXRhbGl6ZSBcInlvdVwiIGFmdGVyIG5ld2xpbmVzXHJcbiAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC8oXFxuXFxzKil5b3VcXGIvZywgJyQxWW91Jyk7XHJcblxyXG4gICAgcmV0dXJuIHRleHQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVjayBpZiB0ZXh0IGFwcGVhcnMgdG8gYmUgaW4gZmlyc3QgcGVyc29uXHJcbiAgICovXHJcbiAgc3RhdGljIGlzRmlyc3RQZXJzb24odGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBmaXJzdFBlcnNvblBhdHRlcm4gPSAvXFxiKEkgYW18SSdtfEkndmV8SSdkfEknbGx8SVxcYnxtZVxcYnxteVxcYnxtaW5lXFxifG15c2VsZlxcYikvaTtcclxuICAgIHJldHVybiBmaXJzdFBlcnNvblBhdHRlcm4udGVzdCh0ZXh0KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIHRleHQgYXBwZWFycyB0byBiZSBpbiBzZWNvbmQgcGVyc29uXHJcbiAgICovXHJcbiAgc3RhdGljIGlzU2Vjb25kUGVyc29uKHRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3Qgc2Vjb25kUGVyc29uUGF0dGVybiA9IC9cXGIoWW91IGFyZXxZb3UncmV8WW91J3ZlfFlvdSdkfFlvdSdsbHxZb3VcXGJ8eW91clxcYnx5b3Vyc1xcYnx5b3Vyc2VsZlxcYikvaTtcclxuICAgIHJldHVybiBzZWNvbmRQZXJzb25QYXR0ZXJuLnRlc3QodGV4dCk7XHJcbiAgfVxyXG59XHJcblxyXG4iXX0=