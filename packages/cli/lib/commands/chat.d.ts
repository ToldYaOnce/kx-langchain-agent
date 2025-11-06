import { type RuntimeConfig, type MessageSource } from '@toldyaonce/kx-langchain-agent-runtime';
export interface ChatOptions {
    tenantId: string;
    email: string;
    source: MessageSource;
    model?: string;
    persona?: string;
    company?: string;
    industry?: string;
    description?: string;
    products?: string;
    benefits?: string;
    target?: string;
    differentiators?: string;
    rag?: boolean;
    historyLimit: string;
    session?: string;
    debug?: boolean;
}
export declare function chatCommand(options: ChatOptions): Promise<void>;
/**
 * Create configuration for chat command
 */
export declare function createChatConfig(options: ChatOptions): RuntimeConfig & {
    personaId?: string;
    companyInfo?: any;
};
