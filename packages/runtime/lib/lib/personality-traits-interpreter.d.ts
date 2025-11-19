import type { PersonalityTraits } from '../config/personas.js';
/**
 * Converts numeric personality trait scales (1-10) into natural language
 * instructions that Claude can interpret and follow consistently.
 */
export declare class PersonalityTraitsInterpreter {
    /**
     * Generate a system prompt section from personality traits
     */
    static generatePromptSection(traits: PersonalityTraits): string;
    private static interpretEnthusiasm;
    private static interpretWarmth;
    private static interpretProfessionalism;
    private static interpretAssertiveness;
    private static interpretEmpathy;
    private static interpretHumor;
    private static interpretConfidence;
    private static interpretSalesAggression;
    private static interpretVerbosity;
    private static interpretTechnicality;
    private static interpretEmpathicEmotionality;
    private static interpretHumorStyle;
    private static interpretDirectness;
    private static interpretBrandedLanguage;
    private static interpretCharacterActing;
    private static interpretEmojiFrequency;
    private static interpretQuestionRatio;
    private static interpretLeadConversion;
    private static interpretSupportiveness;
    private static interpretEducationDepth;
    private static interpretPersonalization;
}
