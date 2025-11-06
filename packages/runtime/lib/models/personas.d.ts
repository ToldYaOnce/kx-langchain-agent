export interface PersonalityConfig {
    tone: string;
    style: string;
    languageQuirks?: string[];
    specialBehaviors?: string[];
}
export interface GreetingConfig {
    gist: string;
    variations: string[];
}
export interface ResponseChunking {
    enabled: boolean;
    rules: {
        [channel: string]: {
            maxLength: number;
            chunkBy: string;
            delayBetweenChunks: number;
        };
    };
}
export interface GoalConfiguration {
    enabled: boolean;
    goals: Goal[];
    globalSettings: {
        maxActiveGoals: number;
        respectDeclines: boolean;
        adaptToUrgency: boolean;
        interestThreshold: number;
    };
    completionTriggers: {
        allCriticalComplete: string;
        channelSpecific?: {
            [channel: string]: {
                goalIds: string[];
                triggerIntent: string;
                description: string;
            };
        };
        customCombinations?: Array<{
            goalIds: string[];
            triggerIntent: string;
            description: string;
            channels?: string[];
        }>;
    };
}
export interface Goal {
    id: string;
    name: string;
    description: string;
    type: string;
    priority: string;
    target: {
        field: string;
        extractionPatterns?: string[];
        validation?: any;
    };
    timing: {
        approach?: string;
        strategy?: string;
        minMessages: number;
        maxMessages: number;
        conditions?: string[];
        triggers?: any[];
        cooldown?: number;
    };
    messages: {
        request: string;
        followUp: string;
        acknowledgment: string;
    };
    channelRules?: {
        [channel: string]: {
            required: boolean;
            skip?: boolean;
        };
    };
    approach?: {
        directness: string;
        contextual: boolean;
        valueProposition: string;
        fallbackStrategies: string[];
    };
    completion?: {
        markComplete: boolean;
        nextGoals?: string[];
        response: string;
        triggerIntent?: string;
    };
    dependencies?: {
        requires: string[];
    };
    tracking?: {
        attempts: number;
        completed: boolean;
        declinedCount: number;
    };
}
export interface ActionTags {
    enabled: boolean;
    mappings: {
        [key: string]: string;
    };
    fallbackEmoji: string;
}
export interface PersonaMetadata {
    createdAt: string;
    updatedAt: string;
    version: string;
    tags: string[];
}
export declare class Persona {
    tenantId: string;
    personaId: string;
    name: string;
    description: string;
    systemPrompt: string;
    personality: PersonalityConfig;
    responseGuidelines: string[];
    greetings: GreetingConfig;
    responseChunking: ResponseChunking;
    goalConfiguration: GoalConfiguration;
    actionTags: ActionTags;
    metadata: PersonaMetadata;
    createdAt: Date;
    updatedAt: Date;
}
