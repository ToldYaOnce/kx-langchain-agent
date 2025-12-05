"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KxDynamoChatHistory = void 0;
const chat_history_1 = require("@langchain/core/chat_history");
const messages_1 = require("@langchain/core/messages");
/**
 * Custom LangChain chat history implementation that reads/writes from DynamoDB messages table
 */
class KxDynamoChatHistory extends chat_history_1.BaseChatMessageHistory {
    constructor(config) {
        super();
        this.lc_namespace = ["langchain", "stores", "message", "dynamodb"];
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
        // Query in DESCENDING order (newest first) to get the LAST N messages
        const { items } = await this.dynamoService.getMessageHistory(this.tenantId, this.emailLc, {
            limit: this.historyLimit,
            scanIndexForward: false, // DESCENDING order (newest first) to get last N
            conversationId: this.conversationId, // Pass conversation_id for targetKey queries
        });
        console.log(`📚 BEFORE filter: ${items.length} items`);
        console.log(`📚 First item keys: ${JSON.stringify(Object.keys(items[0] || {}))}`);
        console.log(`📚 First item sample: ${JSON.stringify(items[0] || {}).substring(0, 200)}`);
        const filtered = items.filter(item => {
            // Filter by conversation if specified (for backwards compatibility with old schema)
            // Note: When using targetKey queries, this filter is redundant since we already queried by channel
            if (this.conversationId && item.conversation_id && item.conversation_id !== this.conversationId) {
                return false;
            }
            return true;
        });
        console.log(`📚 AFTER filter: ${filtered.length} items`);
        const messages = filtered
            .map(item => this.messageItemToLangChainMessage(item))
            .filter(message => {
            // Filter out empty SystemMessages (used as placeholders for messages without content)
            const isEmpty = message instanceof messages_1.SystemMessage && message.content === '';
            if (isEmpty) {
                console.log(`📚 Filtering out empty SystemMessage`);
            }
            return !isEmpty;
        })
            .reverse(); // Reverse to chronological order (oldest → newest) for LangChain
        console.log(`📚 AFTER map, filter, and reverse: ${messages.length} messages`);
        console.log(`📚 First message type: ${messages[0]?.constructor.name}`);
        console.log(`📚 First message content: ${JSON.stringify(messages[0]?.content).substring(0, 100)}`);
        return messages;
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
        const resetMessage = new messages_1.SystemMessage('Conversation history cleared');
        await this.addMessage(resetMessage);
    }
    /**
     * Add user message (required by BaseChatMessageHistory)
     */
    async addUserMessage(message) {
        await this.addMessage(new messages_1.HumanMessage(message));
    }
    /**
     * Add AI message (required by BaseChatMessageHistory)
     */
    async addAIChatMessage(message) {
        await this.addMessage(new messages_1.AIMessage(message));
    }
    /**
     * Convert DynamoDB message item to LangChain message
     */
    messageItemToLangChainMessage(item) {
        // Support both 'text' (old schema) and 'content' (notifications schema)
        const content = item.text || item.content;
        console.log(`📚 messageItemToLangChainMessage - Processing item:`, {
            hasContent: !!content,
            hasSenderId: !!item.senderId,
            hasDirection: !!item.direction,
            hasUserType: !!item.userType,
            hasSenderType: !!item.senderType,
            messageId: item.messageId,
            contentPreview: content?.substring(0, 50)
        });
        // Skip messages without content
        if (!content) {
            console.warn(`⚠️ Message ${item.messageId} has no content, skipping`);
            return new messages_1.SystemMessage({ content: '' }); // Return empty message to filter out later
        }
        // Check if this is notifications schema (has senderId, userType, senderType)
        const notificationItem = item;
        const isNotificationsSchema = notificationItem.senderId && !item.direction;
        console.log(`📚 Schema detection:`, { isNotificationsSchema });
        if (isNotificationsSchema) {
            // Notifications schema: determine message type by senderType/userType
            const isAgent = notificationItem.userType === 'agent' || notificationItem.senderType === 'agent';
            console.log(`📚 Notifications schema detected:`, {
                userType: notificationItem.userType,
                senderType: notificationItem.senderType,
                isAgent
            });
            if (isAgent) {
                console.log(`📚 Creating AIMessage`);
                return new messages_1.AIMessage({
                    content,
                    additional_kwargs: {
                        messageId: notificationItem.messageId,
                        senderId: notificationItem.senderId,
                        timestamp: notificationItem.dateReceived || notificationItem.createdAt,
                        channelId: notificationItem.channelId,
                    },
                });
            }
            else {
                console.log(`📚 Creating HumanMessage from notifications schema`);
                return new messages_1.HumanMessage({
                    content,
                    additional_kwargs: {
                        messageId: notificationItem.messageId,
                        senderId: notificationItem.senderId,
                        timestamp: notificationItem.dateReceived || notificationItem.createdAt,
                        channelId: notificationItem.channelId,
                    },
                });
            }
        }
        // Old schema: use direction field
        console.log(`📚 Using old schema, checking direction:`, {
            direction: item.direction,
            source: item.source
        });
        if (item.direction === 'inbound') {
            console.log(`📚 Creating HumanMessage from old schema (inbound)`);
            return new messages_1.HumanMessage({
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
            console.log(`📚 Creating AIMessage from old schema (outbound + agent)`);
            return new messages_1.AIMessage({
                content,
                additional_kwargs: {
                    source: item.source,
                    timestamp: item.ts,
                    channel_context: item.channel_context,
                },
            });
        }
        else {
            console.log(`📚 Creating SystemMessage from old schema (fallback)`, {
                direction: item.direction,
                source: item.source
            });
            // For system messages or other types
            return new messages_1.SystemMessage({
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
        if (message instanceof messages_1.HumanMessage) {
            direction = 'inbound';
            source = message.additional_kwargs?.source || 'chat';
        }
        else if (message instanceof messages_1.AIMessage) {
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
exports.KxDynamoChatHistory = KxDynamoChatHistory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC1oaXN0b3J5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9jaGF0LWhpc3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0RBQXNFO0FBQ3RFLHVEQUErRjtBQVkvRjs7R0FFRztBQUNILE1BQWEsbUJBQW9CLFNBQVEscUNBQXNCO0lBUzdELFlBQVksTUFBaUM7UUFDM0MsS0FBSyxFQUFFLENBQUM7UUFUVixpQkFBWSxHQUFHLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFVNUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUM5QixJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7UUFDMUMsSUFBSSxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUM5QyxJQUFJLENBQUMsY0FBYyxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUM7SUFDOUMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFdBQVc7UUFDZixzRUFBc0U7UUFDdEUsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FDMUQsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsT0FBTyxFQUNaO1lBQ0UsS0FBSyxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQ3hCLGdCQUFnQixFQUFFLEtBQUssRUFBRSxnREFBZ0Q7WUFDekUsY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsNkNBQTZDO1NBQ25GLENBQ0YsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEtBQUssQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sQ0FBQyxH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UyxJQUFJLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUUsTUFBTTtZQUNSLENBQUM7WUFFRCxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbEMsVUFBVSxJQUFJLGVBQWUsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQztJQUMxQixDQUFDO0NBQ0Y7QUEzUkQsa0RBMlJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmFzZUNoYXRNZXNzYWdlSGlzdG9yeSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9jaGF0X2hpc3RvcnknO1xuaW1wb3J0IHsgQmFzZU1lc3NhZ2UsIEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlLCBTeXN0ZW1NZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4vZHluYW1vZGIuanMnO1xuaW1wb3J0IHR5cGUgeyBNZXNzYWdlSXRlbSwgTWVzc2FnZURpcmVjdGlvbiwgTWVzc2FnZVNvdXJjZSwgUnVudGltZUNvbmZpZyB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBLeER5bmFtb0NoYXRIaXN0b3J5Q29uZmlnIHtcbiAgdGVuYW50SWQ6IHN0cmluZztcbiAgZW1haWxMYzogc3RyaW5nO1xuICBkeW5hbW9TZXJ2aWNlOiBEeW5hbW9EQlNlcnZpY2U7XG4gIGhpc3RvcnlMaW1pdD86IG51bWJlcjtcbiAgY29udmVyc2F0aW9uSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ3VzdG9tIExhbmdDaGFpbiBjaGF0IGhpc3RvcnkgaW1wbGVtZW50YXRpb24gdGhhdCByZWFkcy93cml0ZXMgZnJvbSBEeW5hbW9EQiBtZXNzYWdlcyB0YWJsZVxuICovXG5leHBvcnQgY2xhc3MgS3hEeW5hbW9DaGF0SGlzdG9yeSBleHRlbmRzIEJhc2VDaGF0TWVzc2FnZUhpc3Rvcnkge1xuICBsY19uYW1lc3BhY2UgPSBbXCJsYW5nY2hhaW5cIiwgXCJzdG9yZXNcIiwgXCJtZXNzYWdlXCIsIFwiZHluYW1vZGJcIl07XG4gIFxuICBwcml2YXRlIHRlbmFudElkOiBzdHJpbmc7XG4gIHByaXZhdGUgZW1haWxMYzogc3RyaW5nO1xuICBwcml2YXRlIGR5bmFtb1NlcnZpY2U6IER5bmFtb0RCU2VydmljZTtcbiAgcHJpdmF0ZSBoaXN0b3J5TGltaXQ6IG51bWJlcjtcbiAgcHJpdmF0ZSBjb252ZXJzYXRpb25JZD86IHN0cmluZztcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IEt4RHluYW1vQ2hhdEhpc3RvcnlDb25maWcpIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMudGVuYW50SWQgPSBjb25maWcudGVuYW50SWQ7XG4gICAgdGhpcy5lbWFpbExjID0gY29uZmlnLmVtYWlsTGM7XG4gICAgdGhpcy5keW5hbW9TZXJ2aWNlID0gY29uZmlnLmR5bmFtb1NlcnZpY2U7XG4gICAgdGhpcy5oaXN0b3J5TGltaXQgPSBjb25maWcuaGlzdG9yeUxpbWl0IHx8IDUwO1xuICAgIHRoaXMuY29udmVyc2F0aW9uSWQgPSBjb25maWcuY29udmVyc2F0aW9uSWQ7XG4gIH1cblxuICAvKipcbiAgICogR2V0IG1lc3NhZ2VzIGZyb20gRHluYW1vREIgYW5kIGNvbnZlcnQgdG8gTGFuZ0NoYWluIG1lc3NhZ2UgZm9ybWF0XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlcygpOiBQcm9taXNlPEJhc2VNZXNzYWdlW10+IHtcbiAgICAvLyBRdWVyeSBpbiBERVNDRU5ESU5HIG9yZGVyIChuZXdlc3QgZmlyc3QpIHRvIGdldCB0aGUgTEFTVCBOIG1lc3NhZ2VzXG4gICAgY29uc3QgeyBpdGVtcyB9ID0gYXdhaXQgdGhpcy5keW5hbW9TZXJ2aWNlLmdldE1lc3NhZ2VIaXN0b3J5KFxuICAgICAgdGhpcy50ZW5hbnRJZCxcbiAgICAgIHRoaXMuZW1haWxMYyxcbiAgICAgIHtcbiAgICAgICAgbGltaXQ6IHRoaXMuaGlzdG9yeUxpbWl0LFxuICAgICAgICBzY2FuSW5kZXhGb3J3YXJkOiBmYWxzZSwgLy8gREVTQ0VORElORyBvcmRlciAobmV3ZXN0IGZpcnN0KSB0byBnZXQgbGFzdCBOXG4gICAgICAgIGNvbnZlcnNhdGlvbklkOiB0aGlzLmNvbnZlcnNhdGlvbklkLCAvLyBQYXNzIGNvbnZlcnNhdGlvbl9pZCBmb3IgdGFyZ2V0S2V5IHF1ZXJpZXNcbiAgICAgIH1cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYPCfk5ogQkVGT1JFIGZpbHRlcjogJHtpdGVtcy5sZW5ndGh9IGl0ZW1zYCk7XG4gICAgY29uc29sZS5sb2coYPCfk5ogRmlyc3QgaXRlbSBrZXlzOiAke0pTT04uc3RyaW5naWZ5KE9iamVjdC5rZXlzKGl0ZW1zWzBdIHx8IHt9KSl9YCk7XG4gICAgY29uc29sZS5sb2coYPCfk5ogRmlyc3QgaXRlbSBzYW1wbGU6ICR7SlNPTi5zdHJpbmdpZnkoaXRlbXNbMF0gfHwge30pLnN1YnN0cmluZygwLCAyMDApfWApO1xuXG4gICAgY29uc3QgZmlsdGVyZWQgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiB7XG4gICAgICAvLyBGaWx0ZXIgYnkgY29udmVyc2F0aW9uIGlmIHNwZWNpZmllZCAoZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IHdpdGggb2xkIHNjaGVtYSlcbiAgICAgIC8vIE5vdGU6IFdoZW4gdXNpbmcgdGFyZ2V0S2V5IHF1ZXJpZXMsIHRoaXMgZmlsdGVyIGlzIHJlZHVuZGFudCBzaW5jZSB3ZSBhbHJlYWR5IHF1ZXJpZWQgYnkgY2hhbm5lbFxuICAgICAgaWYgKHRoaXMuY29udmVyc2F0aW9uSWQgJiYgaXRlbS5jb252ZXJzYXRpb25faWQgJiYgaXRlbS5jb252ZXJzYXRpb25faWQgIT09IHRoaXMuY29udmVyc2F0aW9uSWQpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZyhg8J+TmiBBRlRFUiBmaWx0ZXI6ICR7ZmlsdGVyZWQubGVuZ3RofSBpdGVtc2ApO1xuXG4gICAgY29uc3QgbWVzc2FnZXMgPSBmaWx0ZXJlZFxuICAgICAgLm1hcChpdGVtID0+IHRoaXMubWVzc2FnZUl0ZW1Ub0xhbmdDaGFpbk1lc3NhZ2UoaXRlbSkpXG4gICAgICAuZmlsdGVyKG1lc3NhZ2UgPT4ge1xuICAgICAgICAvLyBGaWx0ZXIgb3V0IGVtcHR5IFN5c3RlbU1lc3NhZ2VzICh1c2VkIGFzIHBsYWNlaG9sZGVycyBmb3IgbWVzc2FnZXMgd2l0aG91dCBjb250ZW50KVxuICAgICAgICBjb25zdCBpc0VtcHR5ID0gbWVzc2FnZSBpbnN0YW5jZW9mIFN5c3RlbU1lc3NhZ2UgJiYgbWVzc2FnZS5jb250ZW50ID09PSAnJztcbiAgICAgICAgaWYgKGlzRW1wdHkpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TmiBGaWx0ZXJpbmcgb3V0IGVtcHR5IFN5c3RlbU1lc3NhZ2VgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gIWlzRW1wdHk7XG4gICAgICB9KVxuICAgICAgLnJldmVyc2UoKTsgLy8gUmV2ZXJzZSB0byBjaHJvbm9sb2dpY2FsIG9yZGVyIChvbGRlc3Qg4oaSIG5ld2VzdCkgZm9yIExhbmdDaGFpblxuXG4gICAgY29uc29sZS5sb2coYPCfk5ogQUZURVIgbWFwLCBmaWx0ZXIsIGFuZCByZXZlcnNlOiAke21lc3NhZ2VzLmxlbmd0aH0gbWVzc2FnZXNgKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TmiBGaXJzdCBtZXNzYWdlIHR5cGU6ICR7bWVzc2FnZXNbMF0/LmNvbnN0cnVjdG9yLm5hbWV9YCk7XG4gICAgY29uc29sZS5sb2coYPCfk5ogRmlyc3QgbWVzc2FnZSBjb250ZW50OiAke0pTT04uc3RyaW5naWZ5KG1lc3NhZ2VzWzBdPy5jb250ZW50KS5zdWJzdHJpbmcoMCwgMTAwKX1gKTtcblxuICAgIHJldHVybiBtZXNzYWdlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBtZXNzYWdlIHRvIHRoZSBjaGF0IGhpc3RvcnlcbiAgICovXG4gIGFzeW5jIGFkZE1lc3NhZ2UobWVzc2FnZTogQmFzZU1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBtZXNzYWdlSXRlbSA9IHRoaXMubGFuZ0NoYWluTWVzc2FnZVRvTWVzc2FnZUl0ZW0obWVzc2FnZSk7XG4gICAgYXdhaXQgdGhpcy5keW5hbW9TZXJ2aWNlLnB1dE1lc3NhZ2UobWVzc2FnZUl0ZW0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFyIGNoYXQgaGlzdG9yeSAob3B0aW9uYWwgaW1wbGVtZW50YXRpb24pXG4gICAqIEluIHByYWN0aWNlLCB5b3UgbWlnaHQgd2FudCB0byBhZGQgYSBib3VuZGFyeSBtYXJrZXIgaW5zdGVhZCBvZiBkZWxldGluZ1xuICAgKi9cbiAgYXN5bmMgY2xlYXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gRm9yIG5vdywgd2UnbGwgYWRkIGEgc3lzdGVtIG1lc3NhZ2UgaW5kaWNhdGluZyBjb252ZXJzYXRpb24gcmVzZXRcbiAgICBjb25zdCByZXNldE1lc3NhZ2UgPSBuZXcgU3lzdGVtTWVzc2FnZSgnQ29udmVyc2F0aW9uIGhpc3RvcnkgY2xlYXJlZCcpO1xuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShyZXNldE1lc3NhZ2UpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCB1c2VyIG1lc3NhZ2UgKHJlcXVpcmVkIGJ5IEJhc2VDaGF0TWVzc2FnZUhpc3RvcnkpXG4gICAqL1xuICBhc3luYyBhZGRVc2VyTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLmFkZE1lc3NhZ2UobmV3IEh1bWFuTWVzc2FnZShtZXNzYWdlKSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIEFJIG1lc3NhZ2UgKHJlcXVpcmVkIGJ5IEJhc2VDaGF0TWVzc2FnZUhpc3RvcnkpXG4gICAqL1xuICBhc3luYyBhZGRBSUNoYXRNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShuZXcgQUlNZXNzYWdlKG1lc3NhZ2UpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IER5bmFtb0RCIG1lc3NhZ2UgaXRlbSB0byBMYW5nQ2hhaW4gbWVzc2FnZVxuICAgKi9cbiAgcHJpdmF0ZSBtZXNzYWdlSXRlbVRvTGFuZ0NoYWluTWVzc2FnZShpdGVtOiBNZXNzYWdlSXRlbSk6IEJhc2VNZXNzYWdlIHtcbiAgICAvLyBTdXBwb3J0IGJvdGggJ3RleHQnIChvbGQgc2NoZW1hKSBhbmQgJ2NvbnRlbnQnIChub3RpZmljYXRpb25zIHNjaGVtYSlcbiAgICBjb25zdCBjb250ZW50ID0gaXRlbS50ZXh0IHx8IChpdGVtIGFzIGFueSkuY29udGVudDtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+TmiBtZXNzYWdlSXRlbVRvTGFuZ0NoYWluTWVzc2FnZSAtIFByb2Nlc3NpbmcgaXRlbTpgLCB7XG4gICAgICBoYXNDb250ZW50OiAhIWNvbnRlbnQsXG4gICAgICBoYXNTZW5kZXJJZDogISEoaXRlbSBhcyBhbnkpLnNlbmRlcklkLFxuICAgICAgaGFzRGlyZWN0aW9uOiAhIWl0ZW0uZGlyZWN0aW9uLFxuICAgICAgaGFzVXNlclR5cGU6ICEhKGl0ZW0gYXMgYW55KS51c2VyVHlwZSxcbiAgICAgIGhhc1NlbmRlclR5cGU6ICEhKGl0ZW0gYXMgYW55KS5zZW5kZXJUeXBlLFxuICAgICAgbWVzc2FnZUlkOiAoaXRlbSBhcyBhbnkpLm1lc3NhZ2VJZCxcbiAgICAgIGNvbnRlbnRQcmV2aWV3OiBjb250ZW50Py5zdWJzdHJpbmcoMCwgNTApXG4gICAgfSk7XG4gICAgXG4gICAgLy8gU2tpcCBtZXNzYWdlcyB3aXRob3V0IGNvbnRlbnRcbiAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIE1lc3NhZ2UgJHsoaXRlbSBhcyBhbnkpLm1lc3NhZ2VJZH0gaGFzIG5vIGNvbnRlbnQsIHNraXBwaW5nYCk7XG4gICAgICByZXR1cm4gbmV3IFN5c3RlbU1lc3NhZ2UoeyBjb250ZW50OiAnJyB9KTsgLy8gUmV0dXJuIGVtcHR5IG1lc3NhZ2UgdG8gZmlsdGVyIG91dCBsYXRlclxuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIG5vdGlmaWNhdGlvbnMgc2NoZW1hIChoYXMgc2VuZGVySWQsIHVzZXJUeXBlLCBzZW5kZXJUeXBlKVxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbkl0ZW0gPSBpdGVtIGFzIGFueTtcbiAgICBjb25zdCBpc05vdGlmaWNhdGlvbnNTY2hlbWEgPSBub3RpZmljYXRpb25JdGVtLnNlbmRlcklkICYmICFpdGVtLmRpcmVjdGlvbjtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhg8J+TmiBTY2hlbWEgZGV0ZWN0aW9uOmAsIHsgaXNOb3RpZmljYXRpb25zU2NoZW1hIH0pO1xuICAgIFxuICAgIGlmIChpc05vdGlmaWNhdGlvbnNTY2hlbWEpIHtcbiAgICAgIC8vIE5vdGlmaWNhdGlvbnMgc2NoZW1hOiBkZXRlcm1pbmUgbWVzc2FnZSB0eXBlIGJ5IHNlbmRlclR5cGUvdXNlclR5cGVcbiAgICAgIGNvbnN0IGlzQWdlbnQgPSBub3RpZmljYXRpb25JdGVtLnVzZXJUeXBlID09PSAnYWdlbnQnIHx8IG5vdGlmaWNhdGlvbkl0ZW0uc2VuZGVyVHlwZSA9PT0gJ2FnZW50JztcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYPCfk5ogTm90aWZpY2F0aW9ucyBzY2hlbWEgZGV0ZWN0ZWQ6YCwge1xuICAgICAgICB1c2VyVHlwZTogbm90aWZpY2F0aW9uSXRlbS51c2VyVHlwZSxcbiAgICAgICAgc2VuZGVyVHlwZTogbm90aWZpY2F0aW9uSXRlbS5zZW5kZXJUeXBlLFxuICAgICAgICBpc0FnZW50XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgaWYgKGlzQWdlbnQpIHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk5ogQ3JlYXRpbmcgQUlNZXNzYWdlYCk7XG4gICAgICAgIHJldHVybiBuZXcgQUlNZXNzYWdlKHtcbiAgICAgICAgICBjb250ZW50LFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBtZXNzYWdlSWQ6IG5vdGlmaWNhdGlvbkl0ZW0ubWVzc2FnZUlkLFxuICAgICAgICAgICAgc2VuZGVySWQ6IG5vdGlmaWNhdGlvbkl0ZW0uc2VuZGVySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5vdGlmaWNhdGlvbkl0ZW0uZGF0ZVJlY2VpdmVkIHx8IG5vdGlmaWNhdGlvbkl0ZW0uY3JlYXRlZEF0LFxuICAgICAgICAgICAgY2hhbm5lbElkOiBub3RpZmljYXRpb25JdGVtLmNoYW5uZWxJZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OaIENyZWF0aW5nIEh1bWFuTWVzc2FnZSBmcm9tIG5vdGlmaWNhdGlvbnMgc2NoZW1hYCk7XG4gICAgICAgIHJldHVybiBuZXcgSHVtYW5NZXNzYWdlKHtcbiAgICAgICAgICBjb250ZW50LFxuICAgICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgICBtZXNzYWdlSWQ6IG5vdGlmaWNhdGlvbkl0ZW0ubWVzc2FnZUlkLFxuICAgICAgICAgICAgc2VuZGVySWQ6IG5vdGlmaWNhdGlvbkl0ZW0uc2VuZGVySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5vdGlmaWNhdGlvbkl0ZW0uZGF0ZVJlY2VpdmVkIHx8IG5vdGlmaWNhdGlvbkl0ZW0uY3JlYXRlZEF0LFxuICAgICAgICAgICAgY2hhbm5lbElkOiBub3RpZmljYXRpb25JdGVtLmNoYW5uZWxJZCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gT2xkIHNjaGVtYTogdXNlIGRpcmVjdGlvbiBmaWVsZFxuICAgIGNvbnNvbGUubG9nKGDwn5OaIFVzaW5nIG9sZCBzY2hlbWEsIGNoZWNraW5nIGRpcmVjdGlvbjpgLCB7XG4gICAgICBkaXJlY3Rpb246IGl0ZW0uZGlyZWN0aW9uLFxuICAgICAgc291cmNlOiBpdGVtLnNvdXJjZVxuICAgIH0pO1xuICAgIFxuICAgIGlmIChpdGVtLmRpcmVjdGlvbiA9PT0gJ2luYm91bmQnKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TmiBDcmVhdGluZyBIdW1hbk1lc3NhZ2UgZnJvbSBvbGQgc2NoZW1hIChpbmJvdW5kKWApO1xuICAgICAgcmV0dXJuIG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICBjb250ZW50LFxuICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgIHNvdXJjZTogaXRlbS5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBpdGVtLnRzLFxuICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogaXRlbS5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgICAgbGVhZF9pZDogaXRlbS5sZWFkX2lkLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChpdGVtLmRpcmVjdGlvbiA9PT0gJ291dGJvdW5kJyAmJiBpdGVtLnNvdXJjZSA9PT0gJ2FnZW50Jykge1xuICAgICAgY29uc29sZS5sb2coYPCfk5ogQ3JlYXRpbmcgQUlNZXNzYWdlIGZyb20gb2xkIHNjaGVtYSAob3V0Ym91bmQgKyBhZ2VudClgKTtcbiAgICAgIHJldHVybiBuZXcgQUlNZXNzYWdlKHtcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgYWRkaXRpb25hbF9rd2FyZ3M6IHtcbiAgICAgICAgICBzb3VyY2U6IGl0ZW0uc291cmNlLFxuICAgICAgICAgIHRpbWVzdGFtcDogaXRlbS50cyxcbiAgICAgICAgICBjaGFubmVsX2NvbnRleHQ6IGl0ZW0uY2hhbm5lbF9jb250ZXh0LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OaIENyZWF0aW5nIFN5c3RlbU1lc3NhZ2UgZnJvbSBvbGQgc2NoZW1hIChmYWxsYmFjaylgLCB7XG4gICAgICAgIGRpcmVjdGlvbjogaXRlbS5kaXJlY3Rpb24sXG4gICAgICAgIHNvdXJjZTogaXRlbS5zb3VyY2VcbiAgICAgIH0pO1xuICAgICAgLy8gRm9yIHN5c3RlbSBtZXNzYWdlcyBvciBvdGhlciB0eXBlc1xuICAgICAgcmV0dXJuIG5ldyBTeXN0ZW1NZXNzYWdlKHtcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgYWRkaXRpb25hbF9rd2FyZ3M6IHtcbiAgICAgICAgICBzb3VyY2U6IGl0ZW0uc291cmNlLFxuICAgICAgICAgIGRpcmVjdGlvbjogaXRlbS5kaXJlY3Rpb24sXG4gICAgICAgICAgdGltZXN0YW1wOiBpdGVtLnRzLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgTGFuZ0NoYWluIG1lc3NhZ2UgdG8gRHluYW1vREIgbWVzc2FnZSBpdGVtXG4gICAqL1xuICBwcml2YXRlIGxhbmdDaGFpbk1lc3NhZ2VUb01lc3NhZ2VJdGVtKG1lc3NhZ2U6IEJhc2VNZXNzYWdlKTogT21pdDxNZXNzYWdlSXRlbSwgJ2NvbnRhY3RfcGsnIHwgJ3RzJyB8ICdHU0kxUEsnIHwgJ0dTSTFTSycgfCAnR1NJMlBLJyB8ICdHU0kyU0snPiB7XG4gICAgbGV0IGRpcmVjdGlvbjogTWVzc2FnZURpcmVjdGlvbjtcbiAgICBsZXQgc291cmNlOiBNZXNzYWdlU291cmNlO1xuXG4gICAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBIdW1hbk1lc3NhZ2UpIHtcbiAgICAgIGRpcmVjdGlvbiA9ICdpbmJvdW5kJztcbiAgICAgIHNvdXJjZSA9IChtZXNzYWdlLmFkZGl0aW9uYWxfa3dhcmdzPy5zb3VyY2UgYXMgTWVzc2FnZVNvdXJjZSkgfHwgJ2NoYXQnO1xuICAgIH0gZWxzZSBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEFJTWVzc2FnZSkge1xuICAgICAgZGlyZWN0aW9uID0gJ291dGJvdW5kJztcbiAgICAgIHNvdXJjZSA9ICdhZ2VudCc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFN5c3RlbU1lc3NhZ2Ugb3Igb3RoZXIgdHlwZXNcbiAgICAgIGRpcmVjdGlvbiA9ICdvdXRib3VuZCc7XG4gICAgICBzb3VyY2UgPSAnYWdlbnQnO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW06IGFueSA9IHtcbiAgICAgIHRlbmFudElkOiB0aGlzLnRlbmFudElkLFxuICAgICAgZW1haWxfbGM6IHRoaXMuZW1haWxMYyxcbiAgICAgIHNvdXJjZSxcbiAgICAgIGRpcmVjdGlvbixcbiAgICAgIHRleHQ6IHR5cGVvZiBtZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5jb250ZW50IDogSlNPTi5zdHJpbmdpZnkobWVzc2FnZS5jb250ZW50KSxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogdGhpcy5jb252ZXJzYXRpb25JZCxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgbGFuZ2NoYWluX3R5cGU6IG1lc3NhZ2UuY29uc3RydWN0b3IubmFtZSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIE9ubHkgYWRkIG9wdGlvbmFsIGZpZWxkcyBpZiB0aGV5IGV4aXN0XG4gICAgaWYgKG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3M/LmNoYW5uZWxfY29udGV4dCkge1xuICAgICAgaXRlbS5jaGFubmVsX2NvbnRleHQgPSBtZXNzYWdlLmFkZGl0aW9uYWxfa3dhcmdzLmNoYW5uZWxfY29udGV4dDtcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3M/LmxlYWRfaWQpIHtcbiAgICAgIGl0ZW0ubGVhZF9pZCA9IG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3MubGVhZF9pZDtcbiAgICB9XG5cbiAgICByZXR1cm4gaXRlbTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcmVjZW50IG1lc3NhZ2UgY291bnQgZm9yIHRva2VuIGJ1ZGdldCBtYW5hZ2VtZW50XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlQ291bnQoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBtZXNzYWdlcyA9IGF3YWl0IHRoaXMuZ2V0TWVzc2FnZXMoKTtcbiAgICByZXR1cm4gbWVzc2FnZXMubGVuZ3RoO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBtZXNzYWdlcyB3aXRoIHRva2VuIGVzdGltYXRpb24gZm9yIGJ1ZGdldCBtYW5hZ2VtZW50XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlc1dpdGhUb2tlbkVzdGltYXRlKG1heFRva2VuczogbnVtYmVyID0gNDAwMCk6IFByb21pc2U8QmFzZU1lc3NhZ2VbXT4ge1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgdGhpcy5nZXRNZXNzYWdlcygpO1xuICAgIFxuICAgIC8vIFNpbXBsZSB0b2tlbiBlc3RpbWF0aW9uIChyb3VnaGx5IDQgY2hhcmFjdGVycyBwZXIgdG9rZW4pXG4gICAgbGV0IHRva2VuQ291bnQgPSAwO1xuICAgIGNvbnN0IGZpbHRlcmVkTWVzc2FnZXM6IEJhc2VNZXNzYWdlW10gPSBbXTtcbiAgICBcbiAgICAvLyBQcm9jZXNzIG1lc3NhZ2VzIGluIHJldmVyc2Ugb3JkZXIgKG1vc3QgcmVjZW50IGZpcnN0KSB0byBzdGF5IHdpdGhpbiBidWRnZXRcbiAgICBmb3IgKGxldCBpID0gbWVzc2FnZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlc1tpXTtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSB0eXBlb2YgbWVzc2FnZS5jb250ZW50ID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UuY29udGVudCA6IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UuY29udGVudCk7XG4gICAgICBjb25zdCBlc3RpbWF0ZWRUb2tlbnMgPSBNYXRoLmNlaWwoY29udGVudC5sZW5ndGggLyA0KTtcbiAgICAgIFxuICAgICAgaWYgKHRva2VuQ291bnQgKyBlc3RpbWF0ZWRUb2tlbnMgPiBtYXhUb2tlbnMgJiYgZmlsdGVyZWRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgXG4gICAgICBmaWx0ZXJlZE1lc3NhZ2VzLnVuc2hpZnQobWVzc2FnZSk7XG4gICAgICB0b2tlbkNvdW50ICs9IGVzdGltYXRlZFRva2VucztcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGZpbHRlcmVkTWVzc2FnZXM7XG4gIH1cbn1cbiJdfQ==