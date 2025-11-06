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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uLXRhZy1wcm9jZXNzb3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2FjdGlvbi10YWctcHJvY2Vzc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBWUgsTUFBYSxrQkFBa0I7SUFHN0IsWUFBWSxNQUF1QjtRQUNqQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsaUJBQWlCLENBQUMsSUFBWTtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN6QixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFFRCwyQ0FBMkM7UUFDM0MsTUFBTSxjQUFjLEdBQUcsbUJBQW1CLENBQUM7UUFFM0MsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRTtZQUNyRCxNQUFNLE9BQU8sR0FBRyxJQUFJLE9BQU8sR0FBRyxDQUFDO1lBRS9CLDBDQUEwQztZQUMxQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUVELHNEQUFzRDtZQUN0RCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUM7WUFDbkMsQ0FBQztZQUVELHNCQUFzQjtZQUN0QixPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZ0JBQWdCO1FBQ2QsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVEOztPQUVHO0lBQ0gsYUFBYSxDQUFDLEdBQVcsRUFBRSxLQUFhO1FBQ3RDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUNwQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxnQkFBZ0IsQ0FBQyxHQUFXO1FBQzFCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsU0FBUztRQUNQLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7SUFDN0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsVUFBVSxDQUFDLE9BQWdCO1FBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUNoQyxDQUFDO0NBQ0Y7QUF2RUQsZ0RBdUVDO0FBRUQ7O0dBRUc7QUFDVSxRQUFBLG1CQUFtQixHQUFxQjtJQUNuRCxTQUFTLEVBQUUsSUFBSTtJQUNmLFFBQVEsRUFBRSxJQUFJO0lBQ2QsYUFBYSxFQUFFLElBQUk7SUFDbkIsWUFBWSxFQUFFLElBQUk7SUFDbEIsV0FBVyxFQUFFLElBQUk7SUFDakIsV0FBVyxFQUFFLElBQUk7SUFDakIsU0FBUyxFQUFFLElBQUk7SUFDZixTQUFTLEVBQUUsSUFBSTtJQUNmLE9BQU8sRUFBRSxJQUFJO0lBQ2IsV0FBVyxFQUFFLFFBQVE7SUFDckIsU0FBUyxFQUFFLElBQUk7SUFDZixRQUFRLEVBQUUsSUFBSTtJQUNkLFFBQVEsRUFBRSxHQUFHO0lBQ2IsU0FBUyxFQUFFLEdBQUc7SUFDZCxlQUFlLEVBQUUsSUFBSTtJQUNyQixVQUFVLEVBQUUsSUFBSTtJQUNoQixVQUFVLEVBQUUsSUFBSTtJQUNoQixZQUFZLEVBQUUsSUFBSTtJQUNsQixZQUFZLEVBQUUsSUFBSTtJQUNsQixTQUFTLEVBQUUsSUFBSTtDQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEFjdGlvbiBUYWcgUHJvY2Vzc29yXHJcbiAqIFxyXG4gKiBQcm9jZXNzZXMgYWN0aW9uIHRhZ3MgbGlrZSBbc21pbGVdIFt3YXZlXSBldGMuIGluIGFnZW50IHJlc3BvbnNlc1xyXG4gKiBhbmQgY29udmVydHMgdGhlbSB0byBlbW9qaXMgb3Igb3RoZXIgVUkgZWxlbWVudHMgYmFzZWQgb24gcGVyc29uYSBjb25maWd1cmF0aW9uXHJcbiAqL1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBBY3Rpb25UYWdNYXBwaW5nIHtcclxuICBbdGFnOiBzdHJpbmddOiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQWN0aW9uVGFnQ29uZmlnIHtcclxuICBlbmFibGVkOiBib29sZWFuO1xyXG4gIG1hcHBpbmdzOiBBY3Rpb25UYWdNYXBwaW5nO1xyXG4gIGZhbGxiYWNrRW1vamk/OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBY3Rpb25UYWdQcm9jZXNzb3Ige1xyXG4gIHByaXZhdGUgY29uZmlnOiBBY3Rpb25UYWdDb25maWc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogQWN0aW9uVGFnQ29uZmlnKSB7XHJcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFByb2Nlc3MgYWN0aW9uIHRhZ3MgaW4gYSByZXNwb25zZSB0ZXh0XHJcbiAgICogQ29udmVydHMgW3RhZ10gZm9ybWF0IHRvIGVtb2ppcyBvciBvdGhlciByZXByZXNlbnRhdGlvbnNcclxuICAgKi9cclxuICBwcm9jZXNzQWN0aW9uVGFncyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgaWYgKCF0aGlzLmNvbmZpZy5lbmFibGVkKSB7XHJcbiAgICAgIHJldHVybiB0ZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmQgYWxsIGFjdGlvbiB0YWdzIGluIHRoZSBmb3JtYXQgW3RhZ11cclxuICAgIGNvbnN0IGFjdGlvblRhZ1JlZ2V4ID0gL1xcWyhbYS16QS1aX10rKVxcXS9nO1xyXG4gICAgXHJcbiAgICByZXR1cm4gdGV4dC5yZXBsYWNlKGFjdGlvblRhZ1JlZ2V4LCAobWF0Y2gsIHRhZ05hbWUpID0+IHtcclxuICAgICAgY29uc3QgZnVsbFRhZyA9IGBbJHt0YWdOYW1lfV1gO1xyXG4gICAgICBcclxuICAgICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBhIG1hcHBpbmcgZm9yIHRoaXMgdGFnXHJcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5tYXBwaW5nc1tmdWxsVGFnXSkge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5tYXBwaW5nc1tmdWxsVGFnXTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gSWYgbm8gbWFwcGluZyBmb3VuZCwgdXNlIGZhbGxiYWNrIG9yIHJlbW92ZSB0aGUgdGFnXHJcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5mYWxsYmFja0Vtb2ppKSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmZhbGxiYWNrRW1vamk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIFJlbW92ZSB1bmtub3duIHRhZ3NcclxuICAgICAgcmV0dXJuICcnO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgYWxsIGF2YWlsYWJsZSBhY3Rpb24gdGFnc1xyXG4gICAqL1xyXG4gIGdldEF2YWlsYWJsZVRhZ3MoKTogc3RyaW5nW10ge1xyXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMuY29uZmlnLm1hcHBpbmdzKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEFkZCBvciB1cGRhdGUgYW4gYWN0aW9uIHRhZyBtYXBwaW5nXHJcbiAgICovXHJcbiAgYWRkVGFnTWFwcGluZyh0YWc6IHN0cmluZywgZW1vamk6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgdGhpcy5jb25maWcubWFwcGluZ3NbdGFnXSA9IGVtb2ppO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVtb3ZlIGFuIGFjdGlvbiB0YWcgbWFwcGluZ1xyXG4gICAqL1xyXG4gIHJlbW92ZVRhZ01hcHBpbmcodGFnOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIGRlbGV0ZSB0aGlzLmNvbmZpZy5tYXBwaW5nc1t0YWddO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgYWN0aW9uIHRhZ3MgYXJlIGVuYWJsZWRcclxuICAgKi9cclxuICBpc0VuYWJsZWQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZW5hYmxlZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEVuYWJsZSBvciBkaXNhYmxlIGFjdGlvbiB0YWcgcHJvY2Vzc2luZ1xyXG4gICAqL1xyXG4gIHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgdGhpcy5jb25maWcuZW5hYmxlZCA9IGVuYWJsZWQ7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRGVmYXVsdCBhY3Rpb24gdGFnIG1hcHBpbmdzXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgREVGQVVMVF9BQ1RJT05fVEFHUzogQWN0aW9uVGFnTWFwcGluZyA9IHtcclxuICAnW3NtaWxlXSc6ICfwn5iKJyxcclxuICAnW3dhdmVdJzogJ/CfkYsnLFxyXG4gICdbdGh1bWJzX3VwXSc6ICfwn5GNJyxcclxuICAnW3RoaW5raW5nXSc6ICfwn6SUJyxcclxuICAnW2V4Y2l0ZWRdJzogJ/CfjoknLFxyXG4gICdbd2VsY29tZV0nOiAn8J+knScsXHJcbiAgJ1twaG9uZV0nOiAn8J+TnicsXHJcbiAgJ1tlbWFpbF0nOiAn8J+TpycsXHJcbiAgJ1tneW1dJzogJ/CfkqonLFxyXG4gICdbZml0bmVzc10nOiAn8J+Pi++4j+KAjeKZgu+4jycsXHJcbiAgJ1toZWFydF0nOiAn4p2k77iPJyxcclxuICAnW2ZpcmVdJzogJ/CflKUnLFxyXG4gICdbc3Rhcl0nOiAn4q2QJyxcclxuICAnW2NoZWNrXSc6ICfinIUnLFxyXG4gICdbcG9pbnRfcmlnaHRdJzogJ/CfkYknLFxyXG4gICdbbXVzY2xlXSc6ICfwn5KqJyxcclxuICAnW3Ryb3BoeV0nOiAn8J+PhicsXHJcbiAgJ1tjYWxlbmRhcl0nOiAn8J+ThScsXHJcbiAgJ1tsb2NhdGlvbl0nOiAn8J+TjScsXHJcbiAgJ1ttb25leV0nOiAn8J+SsCcsXHJcbn07XHJcblxyXG4iXX0=