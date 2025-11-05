import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
/**
 * Custom LangChain chat history implementation that reads/writes from DynamoDB messages table
 */
export class KxDynamoChatHistory extends BaseChatMessageHistory {
    lc_namespace = ["langchain", "stores", "message", "dynamodb"];
    tenantId;
    emailLc;
    dynamoService;
    historyLimit;
    conversationId;
    constructor(config) {
        super();
        this.tenantId = config.tenantId;
        this.emailLc = config.emailLc;
        this.dynamoService = config.dynamoService;
        this.historyLimit = config.historyLimit || 50;
        this.conversationId = config.conversationId;
    }
    /**
     * Get messages from DynamoDB and convert to LangChain message format
     */
    async getMessages() {
        const { items } = await this.dynamoService.getMessageHistory(this.tenantId, this.emailLc, {
            limit: this.historyLimit,
            scanIndexForward: true, // Chronological order for LangChain
        });
        return items
            .filter(item => {
            // Filter by conversation if specified
            if (this.conversationId && item.conversation_id !== this.conversationId) {
                return false;
            }
            return true;
        })
            .map(item => this.messageItemToLangChainMessage(item));
    }
    /**
     * Add a message to the chat history
     */
    async addMessage(message) {
        const messageItem = this.langChainMessageToMessageItem(message);
        await this.dynamoService.putMessage(messageItem);
    }
    /**
     * Clear chat history (optional implementation)
     * In practice, you might want to add a boundary marker instead of deleting
     */
    async clear() {
        // For now, we'll add a system message indicating conversation reset
        const resetMessage = new SystemMessage('Conversation history cleared');
        await this.addMessage(resetMessage);
    }
    /**
     * Add user message (required by BaseChatMessageHistory)
     */
    async addUserMessage(message) {
        await this.addMessage(new HumanMessage(message));
    }
    /**
     * Add AI message (required by BaseChatMessageHistory)
     */
    async addAIChatMessage(message) {
        await this.addMessage(new AIMessage(message));
    }
    /**
     * Convert DynamoDB message item to LangChain message
     */
    messageItemToLangChainMessage(item) {
        const content = item.text;
        // Determine message type based on direction and source
        if (item.direction === 'inbound') {
            return new HumanMessage({
                content,
                additional_kwargs: {
                    source: item.source,
                    timestamp: item.ts,
                    channel_context: item.channel_context,
                    lead_id: item.lead_id,
                },
            });
        }
        else if (item.direction === 'outbound' && item.source === 'agent') {
            return new AIMessage({
                content,
                additional_kwargs: {
                    source: item.source,
                    timestamp: item.ts,
                    channel_context: item.channel_context,
                },
            });
        }
        else {
            // For system messages or other types
            return new SystemMessage({
                content,
                additional_kwargs: {
                    source: item.source,
                    direction: item.direction,
                    timestamp: item.ts,
                },
            });
        }
    }
    /**
     * Convert LangChain message to DynamoDB message item
     */
    langChainMessageToMessageItem(message) {
        let direction;
        let source;
        if (message instanceof HumanMessage) {
            direction = 'inbound';
            source = message.additional_kwargs?.source || 'chat';
        }
        else if (message instanceof AIMessage) {
            direction = 'outbound';
            source = 'agent';
        }
        else {
            // SystemMessage or other types
            direction = 'outbound';
            source = 'agent';
        }
        const item = {
            tenantId: this.tenantId,
            email_lc: this.emailLc,
            source,
            direction,
            text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            conversation_id: this.conversationId,
            meta: {
                langchain_type: message.constructor.name,
            },
        };
        // Only add optional fields if they exist
        if (message.additional_kwargs?.channel_context) {
            item.channel_context = message.additional_kwargs.channel_context;
        }
        if (message.additional_kwargs?.lead_id) {
            item.lead_id = message.additional_kwargs.lead_id;
        }
        return item;
    }
    /**
     * Get recent message count for token budget management
     */
    async getMessageCount() {
        const messages = await this.getMessages();
        return messages.length;
    }
    /**
     * Get messages with token estimation for budget management
     */
    async getMessagesWithTokenEstimate(maxTokens = 4000) {
        const messages = await this.getMessages();
        // Simple token estimation (roughly 4 characters per token)
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
//# sourceMappingURL=chat-history.js.map