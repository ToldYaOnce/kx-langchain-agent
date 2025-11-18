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
        const { items } = await this.dynamoService.getMessageHistory(this.tenantId, this.emailLc, {
            limit: this.historyLimit,
            scanIndexForward: true, // Chronological order for LangChain
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
        });
        console.log(`📚 AFTER map and filter: ${messages.length} messages`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC1oaXN0b3J5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9jaGF0LWhpc3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0RBQXNFO0FBQ3RFLHVEQUErRjtBQVkvRjs7R0FFRztBQUNILE1BQWEsbUJBQW9CLFNBQVEscUNBQXNCO0lBUzdELFlBQVksTUFBaUM7UUFDM0MsS0FBSyxFQUFFLENBQUM7UUFUVixpQkFBWSxHQUFHLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFVNUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUM5QixJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7UUFDMUMsSUFBSSxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUM5QyxJQUFJLENBQUMsY0FBYyxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUM7SUFDOUMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFdBQVc7UUFDZixNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUMxRCxJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxPQUFPLEVBQ1o7WUFDRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDeEIsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLG9DQUFvQztZQUM1RCxjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSw2Q0FBNkM7U0FDbkYsQ0FDRixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7UUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFB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QUM7Z0JBQzVFLE1BQU07WUFDUixDQUFDO1lBRUQsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xDLFVBQVUsSUFBSSxlQUFlLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU8sZ0JBQWdCLENBQUM7SUFDMUIsQ0FBQztDQUNGO0FBelJELGtEQXlSQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEJhc2VDaGF0TWVzc2FnZUhpc3RvcnkgfSBmcm9tICdAbGFuZ2NoYWluL2NvcmUvY2hhdF9oaXN0b3J5JztcbmltcG9ydCB7IEJhc2VNZXNzYWdlLCBIdW1hbk1lc3NhZ2UsIEFJTWVzc2FnZSwgU3lzdGVtTWVzc2FnZSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9tZXNzYWdlcyc7XG5pbXBvcnQgeyBEeW5hbW9EQlNlcnZpY2UgfSBmcm9tICcuL2R5bmFtb2RiLmpzJztcbmltcG9ydCB0eXBlIHsgTWVzc2FnZUl0ZW0sIE1lc3NhZ2VEaXJlY3Rpb24sIE1lc3NhZ2VTb3VyY2UsIFJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi90eXBlcy9pbmRleC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgS3hEeW5hbW9DaGF0SGlzdG9yeUNvbmZpZyB7XG4gIHRlbmFudElkOiBzdHJpbmc7XG4gIGVtYWlsTGM6IHN0cmluZztcbiAgZHluYW1vU2VydmljZTogRHluYW1vREJTZXJ2aWNlO1xuICBoaXN0b3J5TGltaXQ/OiBudW1iZXI7XG4gIGNvbnZlcnNhdGlvbklkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEN1c3RvbSBMYW5nQ2hhaW4gY2hhdCBoaXN0b3J5IGltcGxlbWVudGF0aW9uIHRoYXQgcmVhZHMvd3JpdGVzIGZyb20gRHluYW1vREIgbWVzc2FnZXMgdGFibGVcbiAqL1xuZXhwb3J0IGNsYXNzIEt4RHluYW1vQ2hhdEhpc3RvcnkgZXh0ZW5kcyBCYXNlQ2hhdE1lc3NhZ2VIaXN0b3J5IHtcbiAgbGNfbmFtZXNwYWNlID0gW1wibGFuZ2NoYWluXCIsIFwic3RvcmVzXCIsIFwibWVzc2FnZVwiLCBcImR5bmFtb2RiXCJdO1xuICBcbiAgcHJpdmF0ZSB0ZW5hbnRJZDogc3RyaW5nO1xuICBwcml2YXRlIGVtYWlsTGM6IHN0cmluZztcbiAgcHJpdmF0ZSBkeW5hbW9TZXJ2aWNlOiBEeW5hbW9EQlNlcnZpY2U7XG4gIHByaXZhdGUgaGlzdG9yeUxpbWl0OiBudW1iZXI7XG4gIHByaXZhdGUgY29udmVyc2F0aW9uSWQ/OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBLeER5bmFtb0NoYXRIaXN0b3J5Q29uZmlnKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLnRlbmFudElkID0gY29uZmlnLnRlbmFudElkO1xuICAgIHRoaXMuZW1haWxMYyA9IGNvbmZpZy5lbWFpbExjO1xuICAgIHRoaXMuZHluYW1vU2VydmljZSA9IGNvbmZpZy5keW5hbW9TZXJ2aWNlO1xuICAgIHRoaXMuaGlzdG9yeUxpbWl0ID0gY29uZmlnLmhpc3RvcnlMaW1pdCB8fCA1MDtcbiAgICB0aGlzLmNvbnZlcnNhdGlvbklkID0gY29uZmlnLmNvbnZlcnNhdGlvbklkO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBtZXNzYWdlcyBmcm9tIER5bmFtb0RCIGFuZCBjb252ZXJ0IHRvIExhbmdDaGFpbiBtZXNzYWdlIGZvcm1hdFxuICAgKi9cbiAgYXN5bmMgZ2V0TWVzc2FnZXMoKTogUHJvbWlzZTxCYXNlTWVzc2FnZVtdPiB7XG4gICAgY29uc3QgeyBpdGVtcyB9ID0gYXdhaXQgdGhpcy5keW5hbW9TZXJ2aWNlLmdldE1lc3NhZ2VIaXN0b3J5KFxuICAgICAgdGhpcy50ZW5hbnRJZCxcbiAgICAgIHRoaXMuZW1haWxMYyxcbiAgICAgIHtcbiAgICAgICAgbGltaXQ6IHRoaXMuaGlzdG9yeUxpbWl0LFxuICAgICAgICBzY2FuSW5kZXhGb3J3YXJkOiB0cnVlLCAvLyBDaHJvbm9sb2dpY2FsIG9yZGVyIGZvciBMYW5nQ2hhaW5cbiAgICAgICAgY29udmVyc2F0aW9uSWQ6IHRoaXMuY29udmVyc2F0aW9uSWQsIC8vIFBhc3MgY29udmVyc2F0aW9uX2lkIGZvciB0YXJnZXRLZXkgcXVlcmllc1xuICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhg8J+TmiBCRUZPUkUgZmlsdGVyOiAke2l0ZW1zLmxlbmd0aH0gaXRlbXNgKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TmiBGaXJzdCBpdGVtIGtleXM6ICR7SlNPTi5zdHJpbmdpZnkoT2JqZWN0LmtleXMoaXRlbXNbMF0gfHwge30pKX1gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TmiBGaXJzdCBpdGVtIHNhbXBsZTogJHtKU09OLnN0cmluZ2lmeShpdGVtc1swXSB8fCB7fSkuc3Vic3RyaW5nKDAsIDIwMCl9YCk7XG5cbiAgICBjb25zdCBmaWx0ZXJlZCA9IGl0ZW1zLmZpbHRlcihpdGVtID0+IHtcbiAgICAgIC8vIEZpbHRlciBieSBjb252ZXJzYXRpb24gaWYgc3BlY2lmaWVkIChmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgd2l0aCBvbGQgc2NoZW1hKVxuICAgICAgLy8gTm90ZTogV2hlbiB1c2luZyB0YXJnZXRLZXkgcXVlcmllcywgdGhpcyBmaWx0ZXIgaXMgcmVkdW5kYW50IHNpbmNlIHdlIGFscmVhZHkgcXVlcmllZCBieSBjaGFubmVsXG4gICAgICBpZiAodGhpcy5jb252ZXJzYXRpb25JZCAmJiBpdGVtLmNvbnZlcnNhdGlvbl9pZCAmJiBpdGVtLmNvbnZlcnNhdGlvbl9pZCAhPT0gdGhpcy5jb252ZXJzYXRpb25JZCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKGDwn5OaIEFGVEVSIGZpbHRlcjogJHtmaWx0ZXJlZC5sZW5ndGh9IGl0ZW1zYCk7XG5cbiAgICBjb25zdCBtZXNzYWdlcyA9IGZpbHRlcmVkXG4gICAgICAubWFwKGl0ZW0gPT4gdGhpcy5tZXNzYWdlSXRlbVRvTGFuZ0NoYWluTWVzc2FnZShpdGVtKSlcbiAgICAgIC5maWx0ZXIobWVzc2FnZSA9PiB7XG4gICAgICAgIC8vIEZpbHRlciBvdXQgZW1wdHkgU3lzdGVtTWVzc2FnZXMgKHVzZWQgYXMgcGxhY2Vob2xkZXJzIGZvciBtZXNzYWdlcyB3aXRob3V0IGNvbnRlbnQpXG4gICAgICAgIGNvbnN0IGlzRW1wdHkgPSBtZXNzYWdlIGluc3RhbmNlb2YgU3lzdGVtTWVzc2FnZSAmJiBtZXNzYWdlLmNvbnRlbnQgPT09ICcnO1xuICAgICAgICBpZiAoaXNFbXB0eSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5OaIEZpbHRlcmluZyBvdXQgZW1wdHkgU3lzdGVtTWVzc2FnZWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAhaXNFbXB0eTtcbiAgICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coYPCfk5ogQUZURVIgbWFwIGFuZCBmaWx0ZXI6ICR7bWVzc2FnZXMubGVuZ3RofSBtZXNzYWdlc2ApO1xuICAgIGNvbnNvbGUubG9nKGDwn5OaIEZpcnN0IG1lc3NhZ2UgdHlwZTogJHttZXNzYWdlc1swXT8uY29uc3RydWN0b3IubmFtZX1gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TmiBGaXJzdCBtZXNzYWdlIGNvbnRlbnQ6ICR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZXNbMF0/LmNvbnRlbnQpLnN1YnN0cmluZygwLCAxMDApfWApO1xuXG4gICAgcmV0dXJuIG1lc3NhZ2VzO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIG1lc3NhZ2UgdG8gdGhlIGNoYXQgaGlzdG9yeVxuICAgKi9cbiAgYXN5bmMgYWRkTWVzc2FnZShtZXNzYWdlOiBCYXNlTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG1lc3NhZ2VJdGVtID0gdGhpcy5sYW5nQ2hhaW5NZXNzYWdlVG9NZXNzYWdlSXRlbShtZXNzYWdlKTtcbiAgICBhd2FpdCB0aGlzLmR5bmFtb1NlcnZpY2UucHV0TWVzc2FnZShtZXNzYWdlSXRlbSk7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXIgY2hhdCBoaXN0b3J5IChvcHRpb25hbCBpbXBsZW1lbnRhdGlvbilcbiAgICogSW4gcHJhY3RpY2UsIHlvdSBtaWdodCB3YW50IHRvIGFkZCBhIGJvdW5kYXJ5IG1hcmtlciBpbnN0ZWFkIG9mIGRlbGV0aW5nXG4gICAqL1xuICBhc3luYyBjbGVhcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBGb3Igbm93LCB3ZSdsbCBhZGQgYSBzeXN0ZW0gbWVzc2FnZSBpbmRpY2F0aW5nIGNvbnZlcnNhdGlvbiByZXNldFxuICAgIGNvbnN0IHJlc2V0TWVzc2FnZSA9IG5ldyBTeXN0ZW1NZXNzYWdlKCdDb252ZXJzYXRpb24gaGlzdG9yeSBjbGVhcmVkJyk7XG4gICAgYXdhaXQgdGhpcy5hZGRNZXNzYWdlKHJlc2V0TWVzc2FnZSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIHVzZXIgbWVzc2FnZSAocmVxdWlyZWQgYnkgQmFzZUNoYXRNZXNzYWdlSGlzdG9yeSlcbiAgICovXG4gIGFzeW5jIGFkZFVzZXJNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShuZXcgSHVtYW5NZXNzYWdlKG1lc3NhZ2UpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgQUkgbWVzc2FnZSAocmVxdWlyZWQgYnkgQmFzZUNoYXRNZXNzYWdlSGlzdG9yeSlcbiAgICovXG4gIGFzeW5jIGFkZEFJQ2hhdE1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5hZGRNZXNzYWdlKG5ldyBBSU1lc3NhZ2UobWVzc2FnZSkpO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgRHluYW1vREIgbWVzc2FnZSBpdGVtIHRvIExhbmdDaGFpbiBtZXNzYWdlXG4gICAqL1xuICBwcml2YXRlIG1lc3NhZ2VJdGVtVG9MYW5nQ2hhaW5NZXNzYWdlKGl0ZW06IE1lc3NhZ2VJdGVtKTogQmFzZU1lc3NhZ2Uge1xuICAgIC8vIFN1cHBvcnQgYm90aCAndGV4dCcgKG9sZCBzY2hlbWEpIGFuZCAnY29udGVudCcgKG5vdGlmaWNhdGlvbnMgc2NoZW1hKVxuICAgIGNvbnN0IGNvbnRlbnQgPSBpdGVtLnRleHQgfHwgKGl0ZW0gYXMgYW55KS5jb250ZW50O1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5OaIG1lc3NhZ2VJdGVtVG9MYW5nQ2hhaW5NZXNzYWdlIC0gUHJvY2Vzc2luZyBpdGVtOmAsIHtcbiAgICAgIGhhc0NvbnRlbnQ6ICEhY29udGVudCxcbiAgICAgIGhhc1NlbmRlcklkOiAhIShpdGVtIGFzIGFueSkuc2VuZGVySWQsXG4gICAgICBoYXNEaXJlY3Rpb246ICEhaXRlbS5kaXJlY3Rpb24sXG4gICAgICBoYXNVc2VyVHlwZTogISEoaXRlbSBhcyBhbnkpLnVzZXJUeXBlLFxuICAgICAgaGFzU2VuZGVyVHlwZTogISEoaXRlbSBhcyBhbnkpLnNlbmRlclR5cGUsXG4gICAgICBtZXNzYWdlSWQ6IChpdGVtIGFzIGFueSkubWVzc2FnZUlkLFxuICAgICAgY29udGVudFByZXZpZXc6IGNvbnRlbnQ/LnN1YnN0cmluZygwLCA1MClcbiAgICB9KTtcbiAgICBcbiAgICAvLyBTa2lwIG1lc3NhZ2VzIHdpdGhvdXQgY29udGVudFxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gTWVzc2FnZSAkeyhpdGVtIGFzIGFueSkubWVzc2FnZUlkfSBoYXMgbm8gY29udGVudCwgc2tpcHBpbmdgKTtcbiAgICAgIHJldHVybiBuZXcgU3lzdGVtTWVzc2FnZSh7IGNvbnRlbnQ6ICcnIH0pOyAvLyBSZXR1cm4gZW1wdHkgbWVzc2FnZSB0byBmaWx0ZXIgb3V0IGxhdGVyXG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgbm90aWZpY2F0aW9ucyBzY2hlbWEgKGhhcyBzZW5kZXJJZCwgdXNlclR5cGUsIHNlbmRlclR5cGUpXG4gICAgY29uc3Qgbm90aWZpY2F0aW9uSXRlbSA9IGl0ZW0gYXMgYW55O1xuICAgIGNvbnN0IGlzTm90aWZpY2F0aW9uc1NjaGVtYSA9IG5vdGlmaWNhdGlvbkl0ZW0uc2VuZGVySWQgJiYgIWl0ZW0uZGlyZWN0aW9uO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGDwn5OaIFNjaGVtYSBkZXRlY3Rpb246YCwgeyBpc05vdGlmaWNhdGlvbnNTY2hlbWEgfSk7XG4gICAgXG4gICAgaWYgKGlzTm90aWZpY2F0aW9uc1NjaGVtYSkge1xuICAgICAgLy8gTm90aWZpY2F0aW9ucyBzY2hlbWE6IGRldGVybWluZSBtZXNzYWdlIHR5cGUgYnkgc2VuZGVyVHlwZS91c2VyVHlwZVxuICAgICAgY29uc3QgaXNBZ2VudCA9IG5vdGlmaWNhdGlvbkl0ZW0udXNlclR5cGUgPT09ICdhZ2VudCcgfHwgbm90aWZpY2F0aW9uSXRlbS5zZW5kZXJUeXBlID09PSAnYWdlbnQnO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhg8J+TmiBOb3RpZmljYXRpb25zIHNjaGVtYSBkZXRlY3RlZDpgLCB7XG4gICAgICAgIHVzZXJUeXBlOiBub3RpZmljYXRpb25JdGVtLnVzZXJUeXBlLFxuICAgICAgICBzZW5kZXJUeXBlOiBub3RpZmljYXRpb25JdGVtLnNlbmRlclR5cGUsXG4gICAgICAgIGlzQWdlbnRcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBpZiAoaXNBZ2VudCkge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+TmiBDcmVhdGluZyBBSU1lc3NhZ2VgKTtcbiAgICAgICAgcmV0dXJuIG5ldyBBSU1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQsXG4gICAgICAgICAgYWRkaXRpb25hbF9rd2FyZ3M6IHtcbiAgICAgICAgICAgIG1lc3NhZ2VJZDogbm90aWZpY2F0aW9uSXRlbS5tZXNzYWdlSWQsXG4gICAgICAgICAgICBzZW5kZXJJZDogbm90aWZpY2F0aW9uSXRlbS5zZW5kZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbm90aWZpY2F0aW9uSXRlbS5kYXRlUmVjZWl2ZWQgfHwgbm90aWZpY2F0aW9uSXRlbS5jcmVhdGVkQXQsXG4gICAgICAgICAgICBjaGFubmVsSWQ6IG5vdGlmaWNhdGlvbkl0ZW0uY2hhbm5lbElkLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coYPCfk5ogQ3JlYXRpbmcgSHVtYW5NZXNzYWdlIGZyb20gbm90aWZpY2F0aW9ucyBzY2hlbWFgKTtcbiAgICAgICAgcmV0dXJuIG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICAgIGNvbnRlbnQsXG4gICAgICAgICAgYWRkaXRpb25hbF9rd2FyZ3M6IHtcbiAgICAgICAgICAgIG1lc3NhZ2VJZDogbm90aWZpY2F0aW9uSXRlbS5tZXNzYWdlSWQsXG4gICAgICAgICAgICBzZW5kZXJJZDogbm90aWZpY2F0aW9uSXRlbS5zZW5kZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbm90aWZpY2F0aW9uSXRlbS5kYXRlUmVjZWl2ZWQgfHwgbm90aWZpY2F0aW9uSXRlbS5jcmVhdGVkQXQsXG4gICAgICAgICAgICBjaGFubmVsSWQ6IG5vdGlmaWNhdGlvbkl0ZW0uY2hhbm5lbElkLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBPbGQgc2NoZW1hOiB1c2UgZGlyZWN0aW9uIGZpZWxkXG4gICAgY29uc29sZS5sb2coYPCfk5ogVXNpbmcgb2xkIHNjaGVtYSwgY2hlY2tpbmcgZGlyZWN0aW9uOmAsIHtcbiAgICAgIGRpcmVjdGlvbjogaXRlbS5kaXJlY3Rpb24sXG4gICAgICBzb3VyY2U6IGl0ZW0uc291cmNlXG4gICAgfSk7XG4gICAgXG4gICAgaWYgKGl0ZW0uZGlyZWN0aW9uID09PSAnaW5ib3VuZCcpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OaIENyZWF0aW5nIEh1bWFuTWVzc2FnZSBmcm9tIG9sZCBzY2hlbWEgKGluYm91bmQpYCk7XG4gICAgICByZXR1cm4gbmV3IEh1bWFuTWVzc2FnZSh7XG4gICAgICAgIGNvbnRlbnQsXG4gICAgICAgIGFkZGl0aW9uYWxfa3dhcmdzOiB7XG4gICAgICAgICAgc291cmNlOiBpdGVtLnNvdXJjZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IGl0ZW0udHMsXG4gICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiBpdGVtLmNoYW5uZWxfY29udGV4dCxcbiAgICAgICAgICBsZWFkX2lkOiBpdGVtLmxlYWRfaWQsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGl0ZW0uZGlyZWN0aW9uID09PSAnb3V0Ym91bmQnICYmIGl0ZW0uc291cmNlID09PSAnYWdlbnQnKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TmiBDcmVhdGluZyBBSU1lc3NhZ2UgZnJvbSBvbGQgc2NoZW1hIChvdXRib3VuZCArIGFnZW50KWApO1xuICAgICAgcmV0dXJuIG5ldyBBSU1lc3NhZ2Uoe1xuICAgICAgICBjb250ZW50LFxuICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgIHNvdXJjZTogaXRlbS5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBpdGVtLnRzLFxuICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogaXRlbS5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYPCfk5ogQ3JlYXRpbmcgU3lzdGVtTWVzc2FnZSBmcm9tIG9sZCBzY2hlbWEgKGZhbGxiYWNrKWAsIHtcbiAgICAgICAgZGlyZWN0aW9uOiBpdGVtLmRpcmVjdGlvbixcbiAgICAgICAgc291cmNlOiBpdGVtLnNvdXJjZVxuICAgICAgfSk7XG4gICAgICAvLyBGb3Igc3lzdGVtIG1lc3NhZ2VzIG9yIG90aGVyIHR5cGVzXG4gICAgICByZXR1cm4gbmV3IFN5c3RlbU1lc3NhZ2Uoe1xuICAgICAgICBjb250ZW50LFxuICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgIHNvdXJjZTogaXRlbS5zb3VyY2UsXG4gICAgICAgICAgZGlyZWN0aW9uOiBpdGVtLmRpcmVjdGlvbixcbiAgICAgICAgICB0aW1lc3RhbXA6IGl0ZW0udHMsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29udmVydCBMYW5nQ2hhaW4gbWVzc2FnZSB0byBEeW5hbW9EQiBtZXNzYWdlIGl0ZW1cbiAgICovXG4gIHByaXZhdGUgbGFuZ0NoYWluTWVzc2FnZVRvTWVzc2FnZUl0ZW0obWVzc2FnZTogQmFzZU1lc3NhZ2UpOiBPbWl0PE1lc3NhZ2VJdGVtLCAnY29udGFjdF9waycgfCAndHMnIHwgJ0dTSTFQSycgfCAnR1NJMVNLJyB8ICdHU0kyUEsnIHwgJ0dTSTJTSyc+IHtcbiAgICBsZXQgZGlyZWN0aW9uOiBNZXNzYWdlRGlyZWN0aW9uO1xuICAgIGxldCBzb3VyY2U6IE1lc3NhZ2VTb3VyY2U7XG5cbiAgICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEh1bWFuTWVzc2FnZSkge1xuICAgICAgZGlyZWN0aW9uID0gJ2luYm91bmQnO1xuICAgICAgc291cmNlID0gKG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3M/LnNvdXJjZSBhcyBNZXNzYWdlU291cmNlKSB8fCAnY2hhdCc7XG4gICAgfSBlbHNlIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgQUlNZXNzYWdlKSB7XG4gICAgICBkaXJlY3Rpb24gPSAnb3V0Ym91bmQnO1xuICAgICAgc291cmNlID0gJ2FnZW50JztcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3lzdGVtTWVzc2FnZSBvciBvdGhlciB0eXBlc1xuICAgICAgZGlyZWN0aW9uID0gJ291dGJvdW5kJztcbiAgICAgIHNvdXJjZSA9ICdhZ2VudCc7XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbTogYW55ID0ge1xuICAgICAgdGVuYW50SWQ6IHRoaXMudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogdGhpcy5lbWFpbExjLFxuICAgICAgc291cmNlLFxuICAgICAgZGlyZWN0aW9uLFxuICAgICAgdGV4dDogdHlwZW9mIG1lc3NhZ2UuY29udGVudCA9PT0gJ3N0cmluZycgPyBtZXNzYWdlLmNvbnRlbnQgOiBKU09OLnN0cmluZ2lmeShtZXNzYWdlLmNvbnRlbnQpLFxuICAgICAgY29udmVyc2F0aW9uX2lkOiB0aGlzLmNvbnZlcnNhdGlvbklkLFxuICAgICAgbWV0YToge1xuICAgICAgICBsYW5nY2hhaW5fdHlwZTogbWVzc2FnZS5jb25zdHJ1Y3Rvci5uYW1lLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gT25seSBhZGQgb3B0aW9uYWwgZmllbGRzIGlmIHRoZXkgZXhpc3RcbiAgICBpZiAobWVzc2FnZS5hZGRpdGlvbmFsX2t3YXJncz8uY2hhbm5lbF9jb250ZXh0KSB7XG4gICAgICBpdGVtLmNoYW5uZWxfY29udGV4dCA9IG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3MuY2hhbm5lbF9jb250ZXh0O1xuICAgIH1cbiAgICBpZiAobWVzc2FnZS5hZGRpdGlvbmFsX2t3YXJncz8ubGVhZF9pZCkge1xuICAgICAgaXRlbS5sZWFkX2lkID0gbWVzc2FnZS5hZGRpdGlvbmFsX2t3YXJncy5sZWFkX2lkO1xuICAgIH1cblxuICAgIHJldHVybiBpdGVtO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCByZWNlbnQgbWVzc2FnZSBjb3VudCBmb3IgdG9rZW4gYnVkZ2V0IG1hbmFnZW1lbnRcbiAgICovXG4gIGFzeW5jIGdldE1lc3NhZ2VDb3VudCgpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgdGhpcy5nZXRNZXNzYWdlcygpO1xuICAgIHJldHVybiBtZXNzYWdlcy5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogR2V0IG1lc3NhZ2VzIHdpdGggdG9rZW4gZXN0aW1hdGlvbiBmb3IgYnVkZ2V0IG1hbmFnZW1lbnRcbiAgICovXG4gIGFzeW5jIGdldE1lc3NhZ2VzV2l0aFRva2VuRXN0aW1hdGUobWF4VG9rZW5zOiBudW1iZXIgPSA0MDAwKTogUHJvbWlzZTxCYXNlTWVzc2FnZVtdPiB7XG4gICAgY29uc3QgbWVzc2FnZXMgPSBhd2FpdCB0aGlzLmdldE1lc3NhZ2VzKCk7XG4gICAgXG4gICAgLy8gU2ltcGxlIHRva2VuIGVzdGltYXRpb24gKHJvdWdobHkgNCBjaGFyYWN0ZXJzIHBlciB0b2tlbilcbiAgICBsZXQgdG9rZW5Db3VudCA9IDA7XG4gICAgY29uc3QgZmlsdGVyZWRNZXNzYWdlczogQmFzZU1lc3NhZ2VbXSA9IFtdO1xuICAgIFxuICAgIC8vIFByb2Nlc3MgbWVzc2FnZXMgaW4gcmV2ZXJzZSBvcmRlciAobW9zdCByZWNlbnQgZmlyc3QpIHRvIHN0YXkgd2l0aGluIGJ1ZGdldFxuICAgIGZvciAobGV0IGkgPSBtZXNzYWdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IG1lc3NhZ2VzW2ldO1xuICAgICAgY29uc3QgY29udGVudCA9IHR5cGVvZiBtZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5jb250ZW50IDogSlNPTi5zdHJpbmdpZnkobWVzc2FnZS5jb250ZW50KTtcbiAgICAgIGNvbnN0IGVzdGltYXRlZFRva2VucyA9IE1hdGguY2VpbChjb250ZW50Lmxlbmd0aCAvIDQpO1xuICAgICAgXG4gICAgICBpZiAodG9rZW5Db3VudCArIGVzdGltYXRlZFRva2VucyA+IG1heFRva2VucyAmJiBmaWx0ZXJlZE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGZpbHRlcmVkTWVzc2FnZXMudW5zaGlmdChtZXNzYWdlKTtcbiAgICAgIHRva2VuQ291bnQgKz0gZXN0aW1hdGVkVG9rZW5zO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gZmlsdGVyZWRNZXNzYWdlcztcbiAgfVxufVxuIl19