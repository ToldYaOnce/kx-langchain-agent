/**
 * Action Tag Processor
 *
 * Processes action tags like [smile] [wave] etc. in agent responses
 * and converts them to emojis or other UI elements based on persona configuration
 */
export interface ActionTagMapping {
    [tag: string]: string;
}
export interface ActionTagConfig {
    enabled: boolean;
    mappings: ActionTagMapping;
    fallbackEmoji?: string;
}
export declare class ActionTagProcessor {
    private config;
    constructor(config: ActionTagConfig);
    /**
     * Process action tags in a response text
     * Converts [tag] format to emojis or other representations
     */
    processActionTags(text: string): string;
    /**
     * Get all available action tags
     */
    getAvailableTags(): string[];
    /**
     * Add or update an action tag mapping
     */
    addTagMapping(tag: string, emoji: string): void;
    /**
     * Remove an action tag mapping
     */
    removeTagMapping(tag: string): void;
    /**
     * Check if action tags are enabled
     */
    isEnabled(): boolean;
    /**
     * Enable or disable action tag processing
     */
    setEnabled(enabled: boolean): void;
}
/**
 * Default action tag mappings
 */
export declare const DEFAULT_ACTION_TAGS: ActionTagMapping;
//# sourceMappingURL=action-tag-processor.d.ts.map