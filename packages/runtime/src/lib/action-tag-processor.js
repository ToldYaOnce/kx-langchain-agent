/**
 * Action Tag Processor
 *
 * Processes action tags like [smile] [wave] etc. in agent responses
 * and converts them to emojis or other UI elements based on persona configuration
 */
export class ActionTagProcessor {
    config;
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
/**
 * Default action tag mappings
 */
export const DEFAULT_ACTION_TAGS = {
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
//# sourceMappingURL=action-tag-processor.js.map