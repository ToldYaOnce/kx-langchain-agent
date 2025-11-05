import { BaseChatMessageHistory } from '@langchain/core/chat_history';
/**
 * Simple in-memory chat history for development/testing
 * No persistence, no DynamoDB dependencies
 */
export class MemoryChatHistory extends BaseChatMessageHistory {
    sessionId;
    lc_namespace = ["langchain", "stores", "message", "memory"];
    messages = [];
    constructor(sessionId = 'default') {
        super();
        this.sessionId = sessionId;
    }
    async getMessages() {
        return [...this.messages];
    }
    async addMessage(message) {
        this.messages.push(message);
    }
    async addUserMessage(message) {
        const { HumanMessage } = await import('@langchain/core/messages');
        await this.addMessage(new HumanMessage(message));
    }
    async addAIChatMessage(message) {
        const { AIMessage } = await import('@langchain/core/messages');
        await this.addMessage(new AIMessage(message));
    }
    async clear() {
        this.messages = [];
    }
    /**
     * Get recent messages within token budget
     */
    async getRecentMessages(maxTokens = 4000) {
        const messages = await this.getMessages();
        if (messages.length === 0) {
            return [];
        }
        let tokenCount = 0;
        const filteredMessages = [];
        // Process messages in reverse order (most recent first) to stay within budget
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
            const estimatedTokens = Math.ceil(content.length / 4);
            if (tokenCount + estimatedTokens > maxTokens && filteredMessages.length > 0) {
                break;
            }
            filteredMessages.unshift(message);
            tokenCount += estimatedTokens;
        }
        return filteredMessages;
    }
}
//# sourceMappingURL=memory-chat-history.js.map