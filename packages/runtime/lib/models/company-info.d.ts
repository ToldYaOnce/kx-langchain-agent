export interface Intent {
    id: string;
    name: string;
    description: string;
    triggers: string[];
    patterns: string[];
    priority: 'high' | 'medium' | 'low';
    response: {
        type: 'template' | 'operational' | 'persona_handled' | 'conversational';
        template: string;
        followUp: string[];
    };
    actions: string[];
}
export interface IntentCapturing {
    enabled: boolean;
    intents: Intent[];
    fallbackIntent: {
        id: string;
        name: string;
        description: string;
        response: {
            type: string;
            template: string;
        };
        actions: string[];
    };
    confidence: {
        threshold: number;
        multipleIntentHandling: string;
    };
}
export declare class CompanyInfo {
    tenantId: string;
    name: string;
    industry: string;
    description: string;
    products: string;
    benefits: string;
    targetCustomers: string;
    differentiators: string;
    intentCapturing: IntentCapturing;
    createdAt: Date;
    updatedAt: Date;
}
