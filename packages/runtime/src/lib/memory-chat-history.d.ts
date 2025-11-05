import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage } from '@langchain/core/messages';
/**
 * Simple in-memory chat history for development/testing
 * No persistence, no DynamoDB dependencies
 */
export declare class MemoryChatHistory extends BaseChatMessageHistory {
    private sessionId;
    lc_namespace: string[];
    private messages;
    constructor(sessionId?: string);
    getMessages(): Promise<BaseMessage[]>;
    addMessage(message: BaseMessage): Promise<void>;
    addUserMessage(message: string): Promise<void>;
    addAIChatMessage(message: string): Promise<void>;
    clear(): Promise<void>;
    /**
     * Get recent messages within token budget
     */
    getRecentMessages(maxTokens?: number): Promise<BaseMessage[]>;
}
//# sourceMappingURL=memory-chat-history.d.ts.map