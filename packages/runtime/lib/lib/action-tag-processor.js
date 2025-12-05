"use strict";
/**
 * Action Tag Processor
 *
 * Processes action tags like [smile] [wave] etc. in agent responses
 * and converts them to emojis or other UI elements based on persona configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ACTION_TAGS = exports.ActionTagProcessor = void 0;
class ActionTagProcessor {
    constructor(config) {
        this.config = config;
    }
    /**
     * Process action tags in a response text
     * Converts [tag] format to emojis or other representations
     */
    processActionTags(text) {
        if (!this.config.enabled) {
            return text;
        }
        // Safety check: ensure mappings exists
        if (!this.config.mappings) {
            return text;
        }
        // Find all action tags in the format [tag]
        const actionTagRegex = /\[([a-zA-Z_]+)\]/g;
        return text.replace(actionTagRegex, (match, tagName) => {
            const fullTag = `[${tagName}]`;
            // Check if we have a mapping for this tag
            if (this.config.mappings[fullTag]) {
                return this.config.mappings[fullTag];
            }
            // If no mapping found, use fallback or remove the tag
            if (this.config.fallbackEmoji) {
                return this.config.fallbackEmoji;
            }
            // Remove unknown tags
            return '';
        });
    }
    /**
     * Get all available action tags
     */
    getAvailableTags() {
        return Object.keys(this.config.mappings);
    }
    /**
     * Add or update an action tag mapping
     */
    addTagMapping(tag, emoji) {
        this.config.mappings[tag] = emoji;
    }
    /**
     * Remove an action tag mapping
     */
    removeTagMapping(tag) {
        delete this.config.mappings[tag];
    }
    /**
     * Check if action tags are enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
    /**
     * Enable or disable action tag processing
     */
    setEnabled(enabled) {
        this.config.enabled = enabled;
    }
}
exports.ActionTagProcessor = ActionTagProcessor;
/**
 * Default action tag mappings
 */
exports.DEFAULT_ACTION_TAGS = {
    '[smile]': '😊',
    '[wave]': '👋',
    '[thumbs_up]': '👍',
    '[thinking]': '🤔',
    '[excited]': '🎉',
    '[welcome]': '🤝',
    '[phone]': '📞',
    '[email]': '📧',
    '[gym]': '💪',
    '[fitness]': '🏋️‍♂️',
    '[heart]': '❤️',
    '[fire]': '🔥',
    '[star]': '⭐',
    '[check]': '✅',
    '[point_right]': '👉',
    '[muscle]': '💪',
    '[trophy]': '🏆',
    '[calendar]': '📅',
    '[location]': '📍',
    '[money]': '💰',
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uLXRhZy1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FjdGlvbi10YWctcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBWUgsTUFBYSxrQkFBa0I7SUFHN0IsWUFBWSxNQUF1QjtRQUNqQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsaUJBQWlCLENBQUMsSUFBWTtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN6QixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFFRCx1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDMUIsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBRUQsMkNBQTJDO1FBQzNDLE1BQU0sY0FBYyxHQUFHLG1CQUFtQixDQUFDO1FBRTNDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7WUFDckQsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEdBQUcsQ0FBQztZQUUvQiwwQ0FBMEM7WUFDMUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7WUFFRCxzREFBc0Q7WUFDdEQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUM5QixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDO1lBQ25DLENBQUM7WUFFRCxzQkFBc0I7WUFDdEIsT0FBTyxFQUFFLENBQUM7UUFDWixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILGdCQUFnQjtRQUNkLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRDs7T0FFRztJQUNILGFBQWEsQ0FBQyxHQUFXLEVBQUUsS0FBYTtRQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZ0JBQWdCLENBQUMsR0FBVztRQUMxQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRDs7T0FFRztJQUNILFNBQVM7UUFDUCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDO0lBQzdCLENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVUsQ0FBQyxPQUFnQjtRQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDaEMsQ0FBQztDQUNGO0FBNUVELGdEQTRFQztBQUVEOztHQUVHO0FBQ1UsUUFBQSxtQkFBbUIsR0FBcUI7SUFDbkQsU0FBUyxFQUFFLElBQUk7SUFDZixRQUFRLEVBQUUsSUFBSTtJQUNkLGFBQWEsRUFBRSxJQUFJO0lBQ25CLFlBQVksRUFBRSxJQUFJO0lBQ2xCLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLFNBQVMsRUFBRSxJQUFJO0lBQ2YsU0FBUyxFQUFFLElBQUk7SUFDZixPQUFPLEVBQUUsSUFBSTtJQUNiLFdBQVcsRUFBRSxRQUFRO0lBQ3JCLFNBQVMsRUFBRSxJQUFJO0lBQ2YsUUFBUSxFQUFFLElBQUk7SUFDZCxRQUFRLEVBQUUsR0FBRztJQUNiLFNBQVMsRUFBRSxHQUFHO0lBQ2QsZUFBZSxFQUFFLElBQUk7SUFDckIsVUFBVSxFQUFFLElBQUk7SUFDaEIsVUFBVSxFQUFFLElBQUk7SUFDaEIsWUFBWSxFQUFFLElBQUk7SUFDbEIsWUFBWSxFQUFFLElBQUk7SUFDbEIsU0FBUyxFQUFFLElBQUk7Q0FDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBBY3Rpb24gVGFnIFByb2Nlc3NvclxyXG4gKiBcclxuICogUHJvY2Vzc2VzIGFjdGlvbiB0YWdzIGxpa2UgW3NtaWxlXSBbd2F2ZV0gZXRjLiBpbiBhZ2VudCByZXNwb25zZXNcclxuICogYW5kIGNvbnZlcnRzIHRoZW0gdG8gZW1vamlzIG9yIG90aGVyIFVJIGVsZW1lbnRzIGJhc2VkIG9uIHBlcnNvbmEgY29uZmlndXJhdGlvblxyXG4gKi9cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQWN0aW9uVGFnTWFwcGluZyB7XHJcbiAgW3RhZzogc3RyaW5nXTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEFjdGlvblRhZ0NvbmZpZyB7XHJcbiAgZW5hYmxlZDogYm9vbGVhbjtcclxuICBtYXBwaW5nczogQWN0aW9uVGFnTWFwcGluZztcclxuICBmYWxsYmFja0Vtb2ppPzogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQWN0aW9uVGFnUHJvY2Vzc29yIHtcclxuICBwcml2YXRlIGNvbmZpZzogQWN0aW9uVGFnQ29uZmlnO1xyXG5cclxuICBjb25zdHJ1Y3Rvcihjb25maWc6IEFjdGlvblRhZ0NvbmZpZykge1xyXG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQcm9jZXNzIGFjdGlvbiB0YWdzIGluIGEgcmVzcG9uc2UgdGV4dFxyXG4gICAqIENvbnZlcnRzIFt0YWddIGZvcm1hdCB0byBlbW9qaXMgb3Igb3RoZXIgcmVwcmVzZW50YXRpb25zXHJcbiAgICovXHJcbiAgcHJvY2Vzc0FjdGlvblRhZ3ModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIGlmICghdGhpcy5jb25maWcuZW5hYmxlZCkge1xyXG4gICAgICByZXR1cm4gdGV4dDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTYWZldHkgY2hlY2s6IGVuc3VyZSBtYXBwaW5ncyBleGlzdHNcclxuICAgIGlmICghdGhpcy5jb25maWcubWFwcGluZ3MpIHtcclxuICAgICAgcmV0dXJuIHRleHQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRmluZCBhbGwgYWN0aW9uIHRhZ3MgaW4gdGhlIGZvcm1hdCBbdGFnXVxyXG4gICAgY29uc3QgYWN0aW9uVGFnUmVnZXggPSAvXFxbKFthLXpBLVpfXSspXFxdL2c7XHJcbiAgICBcclxuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoYWN0aW9uVGFnUmVnZXgsIChtYXRjaCwgdGFnTmFtZSkgPT4ge1xyXG4gICAgICBjb25zdCBmdWxsVGFnID0gYFske3RhZ05hbWV9XWA7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDaGVjayBpZiB3ZSBoYXZlIGEgbWFwcGluZyBmb3IgdGhpcyB0YWdcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLm1hcHBpbmdzW2Z1bGxUYWddKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLm1hcHBpbmdzW2Z1bGxUYWddO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAvLyBJZiBubyBtYXBwaW5nIGZvdW5kLCB1c2UgZmFsbGJhY2sgb3IgcmVtb3ZlIHRoZSB0YWdcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLmZhbGxiYWNrRW1vamkpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZmFsbGJhY2tFbW9qaTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gUmVtb3ZlIHVua25vd24gdGFnc1xyXG4gICAgICByZXR1cm4gJyc7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhbGwgYXZhaWxhYmxlIGFjdGlvbiB0YWdzXHJcbiAgICovXHJcbiAgZ2V0QXZhaWxhYmxlVGFncygpOiBzdHJpbmdbXSB7XHJcbiAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5jb25maWcubWFwcGluZ3MpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQWRkIG9yIHVwZGF0ZSBhbiBhY3Rpb24gdGFnIG1hcHBpbmdcclxuICAgKi9cclxuICBhZGRUYWdNYXBwaW5nKHRhZzogc3RyaW5nLCBlbW9qaTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICB0aGlzLmNvbmZpZy5tYXBwaW5nc1t0YWddID0gZW1vamk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZW1vdmUgYW4gYWN0aW9uIHRhZyBtYXBwaW5nXHJcbiAgICovXHJcbiAgcmVtb3ZlVGFnTWFwcGluZyh0YWc6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgZGVsZXRlIHRoaXMuY29uZmlnLm1hcHBpbmdzW3RhZ107XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDaGVjayBpZiBhY3Rpb24gdGFncyBhcmUgZW5hYmxlZFxyXG4gICAqL1xyXG4gIGlzRW5hYmxlZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5lbmFibGVkO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRW5hYmxlIG9yIGRpc2FibGUgYWN0aW9uIHRhZyBwcm9jZXNzaW5nXHJcbiAgICovXHJcbiAgc2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XHJcbiAgICB0aGlzLmNvbmZpZy5lbmFibGVkID0gZW5hYmxlZDtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEZWZhdWx0IGFjdGlvbiB0YWcgbWFwcGluZ3NcclxuICovXHJcbmV4cG9ydCBjb25zdCBERUZBVUxUX0FDVElPTl9UQUdTOiBBY3Rpb25UYWdNYXBwaW5nID0ge1xyXG4gICdbc21pbGVdJzogJ/CfmIonLFxyXG4gICdbd2F2ZV0nOiAn8J+RiycsXHJcbiAgJ1t0aHVtYnNfdXBdJzogJ/CfkY0nLFxyXG4gICdbdGhpbmtpbmddJzogJ/CfpJQnLFxyXG4gICdbZXhjaXRlZF0nOiAn8J+OiScsXHJcbiAgJ1t3ZWxjb21lXSc6ICfwn6SdJyxcclxuICAnW3Bob25lXSc6ICfwn5OeJyxcclxuICAnW2VtYWlsXSc6ICfwn5OnJyxcclxuICAnW2d5bV0nOiAn8J+SqicsXHJcbiAgJ1tmaXRuZXNzXSc6ICfwn4+L77iP4oCN4pmC77iPJyxcclxuICAnW2hlYXJ0XSc6ICfinaTvuI8nLFxyXG4gICdbZmlyZV0nOiAn8J+UpScsXHJcbiAgJ1tzdGFyXSc6ICfirZAnLFxyXG4gICdbY2hlY2tdJzogJ+KchScsXHJcbiAgJ1twb2ludF9yaWdodF0nOiAn8J+RiScsXHJcbiAgJ1ttdXNjbGVdJzogJ/CfkqonLFxyXG4gICdbdHJvcGh5XSc6ICfwn4+GJyxcclxuICAnW2NhbGVuZGFyXSc6ICfwn5OFJyxcclxuICAnW2xvY2F0aW9uXSc6ICfwn5ONJyxcclxuICAnW21vbmV5XSc6ICfwn5KwJyxcclxufTtcclxuXHJcbiJdfQ==