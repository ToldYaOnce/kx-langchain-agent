/**
 * Agent persona configurations
 */
import type { GoalConfiguration } from '../types/goals.js';
import type { ActionTagConfig } from '../lib/action-tag-processor.js';
export interface ResponseChunkingRule {
    maxLength: number;
    chunkBy: 'sentence' | 'paragraph' | 'none';
    delayBetweenChunks: number;
}
export interface ResponseChunking {
    enabled: boolean;
    rules: {
        sms: ResponseChunkingRule;
        chat: ResponseChunkingRule;
        email: ResponseChunkingRule;
        api: ResponseChunkingRule;
        agent: ResponseChunkingRule;
    };
}
export interface GreetingConfig {
    gist: string;
    variations: string[];
}
export interface IntentTrigger {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    patterns: string[];
    priority: 'high' | 'medium' | 'low';
    response: {
        type: 'template' | 'conversational';
        template: string;
        followUp?: string[];
    };
    actions: string[];
}
export interface IntentCapturing {
    enabled: boolean;
    intents: IntentTrigger[];
    fallbackIntent: {
        id: string;
        name: string;
        description: string;
        response: {
            type: 'template' | 'conversational';
            template: string;
        };
        actions: string[];
    };
    confidence: {
        threshold: number;
        multipleIntentHandling: 'highest_confidence' | 'all' | 'first_match';
    };
}
/**
 * Core personality trait scales (1-10)
 * These are universal, cross-industry dimensions that define persona behavior
 */
export interface PersonalityTraits {
    enthusiasm: number;
    warmth: number;
    professionalism: number;
    assertiveness: number;
    empathy: number;
    humor: number;
    confidence: number;
    salesAggression: number;
    verbosity: number;
    technicality: number;
    empathicEmotionality: number;
    humorStyle: number;
    responsePace?: number;
    directness?: number;
    riskAversion?: number;
    brandedLanguageDensity?: number;
    characterActing?: number;
    emojiFrequency?: number;
    formality?: number;
    questionRatio?: number;
    leadConversionDrive?: number;
    supportiveness?: number;
    educationDepth?: number;
    personalizationLevel?: number;
}
export interface AgentPersona {
    name: string;
    description: string;
    systemPrompt: string;
    personalityTraits?: PersonalityTraits;
    personalityQuirks?: string[];
    /** Old format - kept for backward compatibility */
    personality?: {
        tone?: string;
        style?: string;
        languageQuirks?: string[];
        specialBehaviors?: string[];
        communicationStyle?: string;
        expertise?: string[];
        nickname?: string;
        personalityQuirks?: string[];
        terminology?: Record<string, string>;
        traits?: string[];
    };
    responseGuidelines?: string[] | {
        conversationRules?: {
            aiDisclosure?: boolean;
            casualGreetingResponse?: string;
            reintroductionPolicy?: string;
            useStageDirections?: boolean;
        };
    };
    greetings?: GreetingConfig | {
        gist?: string;
        variations?: string[];
    };
    greetingConfig?: GreetingConfig;
    responseChunking?: ResponseChunking;
    intentCapturing?: IntentCapturing;
    goalConfiguration?: GoalConfiguration;
    actionTags?: ActionTagConfig;
}
export declare const AGENT_PERSONAS: Record<string, AgentPersona>;
export declare function getPersona(personaId: string): AgentPersona;
export declare function listPersonas(): Array<{
    id: string;
    name: string;
    description: string;
}>;
