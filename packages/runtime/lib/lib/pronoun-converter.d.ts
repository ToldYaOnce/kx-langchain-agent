/**
 * Converts first-person pronouns to second-person for AI system prompts
 * Allows users to write naturally ("I am...") while sending proper format to AI ("You are...")
 */
export declare class PronounConverter {
    /**
     * Convert first-person text to second-person with proper capitalization
     */
    static firstToSecondPerson(input: string): string;
    /**
     * Check if text appears to be in first person
     */
    static isFirstPerson(text: string): boolean;
    /**
     * Check if text appears to be in second person
     */
    static isSecondPerson(text: string): boolean;
}
