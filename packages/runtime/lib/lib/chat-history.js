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
        const content = item.text;
        // Determine message type based on direction and source
        if (item.direction === 'inbound') {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC1oaXN0b3J5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9jaGF0LWhpc3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0RBQXNFO0FBQ3RFLHVEQUErRjtBQVkvRjs7R0FFRztBQUNILE1BQWEsbUJBQW9CLFNBQVEscUNBQXNCO0lBUzdELFlBQVksTUFBaUM7UUFDM0MsS0FBSyxFQUFFLENBQUM7UUFUVixpQkFBWSxHQUFHLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFVNUQsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUM5QixJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7UUFDMUMsSUFBSSxDQUFDLFlBQVksR0FBRyxNQUFNLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUM5QyxJQUFJLENBQUMsY0FBYyxHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUM7SUFDOUMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFdBQVc7UUFDZixNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUMxRCxJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxPQUFPLEVBQ1o7WUFDRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDeEIsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLG9DQUFvQztTQUM3RCxDQUNGLENBQUM7UUFFRixPQUFPLEtBQUs7YUFDVCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDYixzQ0FBc0M7WUFDdEMsSUFBSSxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxlQUFlLEtBQUssSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN4RSxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNkLENBQUMsQ0FBQzthQUNELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxVQUFVLENBQUMsT0FBb0I7UUFDbkMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxLQUFLO1FBQ1Qsb0VBQW9FO1FBQ3BFLE1BQU0sWUFBWSxHQUFHLElBQUksd0JBQWEsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQWU7UUFDbEMsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksdUJBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFlO1FBQ3BDLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLG9CQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQ7O09BRUc7SUFDSyw2QkFBNkIsQ0FBQyxJQUFpQjtRQUNyRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBRTFCLHVEQUF1RDtRQUN2RCxJQUFJLElBQUksQ0FBQyxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDakMsT0FBTyxJQUFJLHVCQUFZLENBQUM7Z0JBQ3RCLE9BQU87Z0JBQ1AsaUJBQWlCLEVBQUU7b0JBQ2pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtvQkFDbkIsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFO29CQUNsQixlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQWU7b0JBQ3JDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztpQkFDdEI7YUFDRixDQUFDLENBQUM7UUFDTCxDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsU0FBUyxLQUFLLFVBQVUsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3BFLE9BQU8sSUFBSSxvQkFBUyxDQUFDO2dCQUNuQixPQUFPO2dCQUNQLGlCQUFpQixFQUFFO29CQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07b0JBQ25CLFNBQVMsRUFBRSxJQUFJLENBQUMsRUFBRTtvQkFDbEIsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlO2lCQUN0QzthQUNGLENBQUMsQ0FBQztRQUNMLENBQUM7YUFBTSxDQUFDO1lBQ04scUNBQXFDO1lBQ3JDLE9BQU8sSUFBSSx3QkFBYSxDQUFDO2dCQUN2QixPQUFPO2dCQUNQLGlCQUFpQixFQUFFO29CQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07b0JBQ25CLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztvQkFDekIsU0FBUyxFQUFFLElBQUksQ0FBQyxFQUFFO2lCQUNuQjthQUNGLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSyw2QkFBNkIsQ0FBQyxPQUFvQjtRQUN4RCxJQUFJLFNBQTJCLENBQUM7UUFDaEMsSUFBSSxNQUFxQixDQUFDO1FBRTFCLElBQUksT0FBTyxZQUFZLHVCQUFZLEVBQUUsQ0FBQztZQUNwQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1lBQ3RCLE1BQU0sR0FBSSxPQUFPLENBQUMsaUJBQWlCLEVBQUUsTUFBd0IsSUFBSSxNQUFNLENBQUM7UUFDMUUsQ0FBQzthQUFNLElBQUksT0FBTyxZQUFZLG9CQUFTLEVBQUUsQ0FBQztZQUN4QyxTQUFTLEdBQUcsVUFBVSxDQUFDO1lBQ3ZCLE1BQU0sR0FBRyxPQUFPLENBQUM7UUFDbkIsQ0FBQzthQUFNLENBQUM7WUFDTiwrQkFBK0I7WUFDL0IsU0FBUyxHQUFHLFVBQVUsQ0FBQztZQUN2QixNQUFNLEdBQUcsT0FBTyxDQUFDO1FBQ25CLENBQUM7UUFFRCxNQUFNLElBQUksR0FBUTtZQUNoQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsUUFBUSxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3RCLE1BQU07WUFDTixTQUFTO1lBQ1QsSUFBSSxFQUFFLE9BQU8sT0FBTyxDQUFDLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQztZQUM3RixlQUFlLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDcEMsSUFBSSxFQUFFO2dCQUNKLGNBQWMsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUk7YUFDekM7U0FDRixDQUFDO1FBRUYseUNBQXlDO1FBQ3pDLElBQUksT0FBTyxDQUFDLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQyxlQUFlLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQztRQUNuRSxDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDO1FBQ25ELENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxlQUFlO1FBQ25CLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzFDLE9BQU8sUUFBUSxDQUFDLE1BQU0sQ0FBQztJQUN6QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsNEJBQTRCLENBQUMsWUFBb0IsSUFBSTtRQUN6RCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUUxQywyREFBMkQ7UUFDM0QsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLE1BQU0sZ0JBQWdCLEdBQWtCLEVBQUUsQ0FBQztRQUUzQyw4RUFBOEU7UUFDOUUsS0FBSyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDOUMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLE1BQU0sT0FBTyxHQUFHLE9BQU8sT0FBTyxDQUFDLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hHLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV0RCxJQUFJLFVBQVUsR0FBRyxlQUFlLEdBQUcsU0FBUyxJQUFJLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUUsTUFBTTtZQUNSLENBQUM7WUFFRCxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbEMsVUFBVSxJQUFJLGVBQWUsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQztJQUMxQixDQUFDO0NBQ0Y7QUE3TEQsa0RBNkxDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmFzZUNoYXRNZXNzYWdlSGlzdG9yeSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9jaGF0X2hpc3RvcnknO1xuaW1wb3J0IHsgQmFzZU1lc3NhZ2UsIEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlLCBTeXN0ZW1NZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IER5bmFtb0RCU2VydmljZSB9IGZyb20gJy4vZHluYW1vZGIuanMnO1xuaW1wb3J0IHR5cGUgeyBNZXNzYWdlSXRlbSwgTWVzc2FnZURpcmVjdGlvbiwgTWVzc2FnZVNvdXJjZSwgUnVudGltZUNvbmZpZyB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBLeER5bmFtb0NoYXRIaXN0b3J5Q29uZmlnIHtcbiAgdGVuYW50SWQ6IHN0cmluZztcbiAgZW1haWxMYzogc3RyaW5nO1xuICBkeW5hbW9TZXJ2aWNlOiBEeW5hbW9EQlNlcnZpY2U7XG4gIGhpc3RvcnlMaW1pdD86IG51bWJlcjtcbiAgY29udmVyc2F0aW9uSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ3VzdG9tIExhbmdDaGFpbiBjaGF0IGhpc3RvcnkgaW1wbGVtZW50YXRpb24gdGhhdCByZWFkcy93cml0ZXMgZnJvbSBEeW5hbW9EQiBtZXNzYWdlcyB0YWJsZVxuICovXG5leHBvcnQgY2xhc3MgS3hEeW5hbW9DaGF0SGlzdG9yeSBleHRlbmRzIEJhc2VDaGF0TWVzc2FnZUhpc3Rvcnkge1xuICBsY19uYW1lc3BhY2UgPSBbXCJsYW5nY2hhaW5cIiwgXCJzdG9yZXNcIiwgXCJtZXNzYWdlXCIsIFwiZHluYW1vZGJcIl07XG4gIFxuICBwcml2YXRlIHRlbmFudElkOiBzdHJpbmc7XG4gIHByaXZhdGUgZW1haWxMYzogc3RyaW5nO1xuICBwcml2YXRlIGR5bmFtb1NlcnZpY2U6IER5bmFtb0RCU2VydmljZTtcbiAgcHJpdmF0ZSBoaXN0b3J5TGltaXQ6IG51bWJlcjtcbiAgcHJpdmF0ZSBjb252ZXJzYXRpb25JZD86IHN0cmluZztcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IEt4RHluYW1vQ2hhdEhpc3RvcnlDb25maWcpIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMudGVuYW50SWQgPSBjb25maWcudGVuYW50SWQ7XG4gICAgdGhpcy5lbWFpbExjID0gY29uZmlnLmVtYWlsTGM7XG4gICAgdGhpcy5keW5hbW9TZXJ2aWNlID0gY29uZmlnLmR5bmFtb1NlcnZpY2U7XG4gICAgdGhpcy5oaXN0b3J5TGltaXQgPSBjb25maWcuaGlzdG9yeUxpbWl0IHx8IDUwO1xuICAgIHRoaXMuY29udmVyc2F0aW9uSWQgPSBjb25maWcuY29udmVyc2F0aW9uSWQ7XG4gIH1cblxuICAvKipcbiAgICogR2V0IG1lc3NhZ2VzIGZyb20gRHluYW1vREIgYW5kIGNvbnZlcnQgdG8gTGFuZ0NoYWluIG1lc3NhZ2UgZm9ybWF0XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlcygpOiBQcm9taXNlPEJhc2VNZXNzYWdlW10+IHtcbiAgICBjb25zdCB7IGl0ZW1zIH0gPSBhd2FpdCB0aGlzLmR5bmFtb1NlcnZpY2UuZ2V0TWVzc2FnZUhpc3RvcnkoXG4gICAgICB0aGlzLnRlbmFudElkLFxuICAgICAgdGhpcy5lbWFpbExjLFxuICAgICAge1xuICAgICAgICBsaW1pdDogdGhpcy5oaXN0b3J5TGltaXQsXG4gICAgICAgIHNjYW5JbmRleEZvcndhcmQ6IHRydWUsIC8vIENocm9ub2xvZ2ljYWwgb3JkZXIgZm9yIExhbmdDaGFpblxuICAgICAgfVxuICAgICk7XG5cbiAgICByZXR1cm4gaXRlbXNcbiAgICAgIC5maWx0ZXIoaXRlbSA9PiB7XG4gICAgICAgIC8vIEZpbHRlciBieSBjb252ZXJzYXRpb24gaWYgc3BlY2lmaWVkXG4gICAgICAgIGlmICh0aGlzLmNvbnZlcnNhdGlvbklkICYmIGl0ZW0uY29udmVyc2F0aW9uX2lkICE9PSB0aGlzLmNvbnZlcnNhdGlvbklkKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSlcbiAgICAgIC5tYXAoaXRlbSA9PiB0aGlzLm1lc3NhZ2VJdGVtVG9MYW5nQ2hhaW5NZXNzYWdlKGl0ZW0pKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBtZXNzYWdlIHRvIHRoZSBjaGF0IGhpc3RvcnlcbiAgICovXG4gIGFzeW5jIGFkZE1lc3NhZ2UobWVzc2FnZTogQmFzZU1lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBtZXNzYWdlSXRlbSA9IHRoaXMubGFuZ0NoYWluTWVzc2FnZVRvTWVzc2FnZUl0ZW0obWVzc2FnZSk7XG4gICAgYXdhaXQgdGhpcy5keW5hbW9TZXJ2aWNlLnB1dE1lc3NhZ2UobWVzc2FnZUl0ZW0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFyIGNoYXQgaGlzdG9yeSAob3B0aW9uYWwgaW1wbGVtZW50YXRpb24pXG4gICAqIEluIHByYWN0aWNlLCB5b3UgbWlnaHQgd2FudCB0byBhZGQgYSBib3VuZGFyeSBtYXJrZXIgaW5zdGVhZCBvZiBkZWxldGluZ1xuICAgKi9cbiAgYXN5bmMgY2xlYXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gRm9yIG5vdywgd2UnbGwgYWRkIGEgc3lzdGVtIG1lc3NhZ2UgaW5kaWNhdGluZyBjb252ZXJzYXRpb24gcmVzZXRcbiAgICBjb25zdCByZXNldE1lc3NhZ2UgPSBuZXcgU3lzdGVtTWVzc2FnZSgnQ29udmVyc2F0aW9uIGhpc3RvcnkgY2xlYXJlZCcpO1xuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShyZXNldE1lc3NhZ2UpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCB1c2VyIG1lc3NhZ2UgKHJlcXVpcmVkIGJ5IEJhc2VDaGF0TWVzc2FnZUhpc3RvcnkpXG4gICAqL1xuICBhc3luYyBhZGRVc2VyTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLmFkZE1lc3NhZ2UobmV3IEh1bWFuTWVzc2FnZShtZXNzYWdlKSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIEFJIG1lc3NhZ2UgKHJlcXVpcmVkIGJ5IEJhc2VDaGF0TWVzc2FnZUhpc3RvcnkpXG4gICAqL1xuICBhc3luYyBhZGRBSUNoYXRNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShuZXcgQUlNZXNzYWdlKG1lc3NhZ2UpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IER5bmFtb0RCIG1lc3NhZ2UgaXRlbSB0byBMYW5nQ2hhaW4gbWVzc2FnZVxuICAgKi9cbiAgcHJpdmF0ZSBtZXNzYWdlSXRlbVRvTGFuZ0NoYWluTWVzc2FnZShpdGVtOiBNZXNzYWdlSXRlbSk6IEJhc2VNZXNzYWdlIHtcbiAgICBjb25zdCBjb250ZW50ID0gaXRlbS50ZXh0O1xuICAgIFxuICAgIC8vIERldGVybWluZSBtZXNzYWdlIHR5cGUgYmFzZWQgb24gZGlyZWN0aW9uIGFuZCBzb3VyY2VcbiAgICBpZiAoaXRlbS5kaXJlY3Rpb24gPT09ICdpbmJvdW5kJykge1xuICAgICAgcmV0dXJuIG5ldyBIdW1hbk1lc3NhZ2Uoe1xuICAgICAgICBjb250ZW50LFxuICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgIHNvdXJjZTogaXRlbS5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBpdGVtLnRzLFxuICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogaXRlbS5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgICAgbGVhZF9pZDogaXRlbS5sZWFkX2lkLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChpdGVtLmRpcmVjdGlvbiA9PT0gJ291dGJvdW5kJyAmJiBpdGVtLnNvdXJjZSA9PT0gJ2FnZW50Jykge1xuICAgICAgcmV0dXJuIG5ldyBBSU1lc3NhZ2Uoe1xuICAgICAgICBjb250ZW50LFxuICAgICAgICBhZGRpdGlvbmFsX2t3YXJnczoge1xuICAgICAgICAgIHNvdXJjZTogaXRlbS5zb3VyY2UsXG4gICAgICAgICAgdGltZXN0YW1wOiBpdGVtLnRzLFxuICAgICAgICAgIGNoYW5uZWxfY29udGV4dDogaXRlbS5jaGFubmVsX2NvbnRleHQsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRm9yIHN5c3RlbSBtZXNzYWdlcyBvciBvdGhlciB0eXBlc1xuICAgICAgcmV0dXJuIG5ldyBTeXN0ZW1NZXNzYWdlKHtcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgYWRkaXRpb25hbF9rd2FyZ3M6IHtcbiAgICAgICAgICBzb3VyY2U6IGl0ZW0uc291cmNlLFxuICAgICAgICAgIGRpcmVjdGlvbjogaXRlbS5kaXJlY3Rpb24sXG4gICAgICAgICAgdGltZXN0YW1wOiBpdGVtLnRzLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgTGFuZ0NoYWluIG1lc3NhZ2UgdG8gRHluYW1vREIgbWVzc2FnZSBpdGVtXG4gICAqL1xuICBwcml2YXRlIGxhbmdDaGFpbk1lc3NhZ2VUb01lc3NhZ2VJdGVtKG1lc3NhZ2U6IEJhc2VNZXNzYWdlKTogT21pdDxNZXNzYWdlSXRlbSwgJ2NvbnRhY3RfcGsnIHwgJ3RzJyB8ICdHU0kxUEsnIHwgJ0dTSTFTSycgfCAnR1NJMlBLJyB8ICdHU0kyU0snPiB7XG4gICAgbGV0IGRpcmVjdGlvbjogTWVzc2FnZURpcmVjdGlvbjtcbiAgICBsZXQgc291cmNlOiBNZXNzYWdlU291cmNlO1xuXG4gICAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBIdW1hbk1lc3NhZ2UpIHtcbiAgICAgIGRpcmVjdGlvbiA9ICdpbmJvdW5kJztcbiAgICAgIHNvdXJjZSA9IChtZXNzYWdlLmFkZGl0aW9uYWxfa3dhcmdzPy5zb3VyY2UgYXMgTWVzc2FnZVNvdXJjZSkgfHwgJ2NoYXQnO1xuICAgIH0gZWxzZSBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEFJTWVzc2FnZSkge1xuICAgICAgZGlyZWN0aW9uID0gJ291dGJvdW5kJztcbiAgICAgIHNvdXJjZSA9ICdhZ2VudCc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFN5c3RlbU1lc3NhZ2Ugb3Igb3RoZXIgdHlwZXNcbiAgICAgIGRpcmVjdGlvbiA9ICdvdXRib3VuZCc7XG4gICAgICBzb3VyY2UgPSAnYWdlbnQnO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW06IGFueSA9IHtcbiAgICAgIHRlbmFudElkOiB0aGlzLnRlbmFudElkLFxuICAgICAgZW1haWxfbGM6IHRoaXMuZW1haWxMYyxcbiAgICAgIHNvdXJjZSxcbiAgICAgIGRpcmVjdGlvbixcbiAgICAgIHRleHQ6IHR5cGVvZiBtZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5jb250ZW50IDogSlNPTi5zdHJpbmdpZnkobWVzc2FnZS5jb250ZW50KSxcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogdGhpcy5jb252ZXJzYXRpb25JZCxcbiAgICAgIG1ldGE6IHtcbiAgICAgICAgbGFuZ2NoYWluX3R5cGU6IG1lc3NhZ2UuY29uc3RydWN0b3IubmFtZSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIE9ubHkgYWRkIG9wdGlvbmFsIGZpZWxkcyBpZiB0aGV5IGV4aXN0XG4gICAgaWYgKG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3M/LmNoYW5uZWxfY29udGV4dCkge1xuICAgICAgaXRlbS5jaGFubmVsX2NvbnRleHQgPSBtZXNzYWdlLmFkZGl0aW9uYWxfa3dhcmdzLmNoYW5uZWxfY29udGV4dDtcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3M/LmxlYWRfaWQpIHtcbiAgICAgIGl0ZW0ubGVhZF9pZCA9IG1lc3NhZ2UuYWRkaXRpb25hbF9rd2FyZ3MubGVhZF9pZDtcbiAgICB9XG5cbiAgICByZXR1cm4gaXRlbTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcmVjZW50IG1lc3NhZ2UgY291bnQgZm9yIHRva2VuIGJ1ZGdldCBtYW5hZ2VtZW50XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlQ291bnQoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBtZXNzYWdlcyA9IGF3YWl0IHRoaXMuZ2V0TWVzc2FnZXMoKTtcbiAgICByZXR1cm4gbWVzc2FnZXMubGVuZ3RoO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBtZXNzYWdlcyB3aXRoIHRva2VuIGVzdGltYXRpb24gZm9yIGJ1ZGdldCBtYW5hZ2VtZW50XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlc1dpdGhUb2tlbkVzdGltYXRlKG1heFRva2VuczogbnVtYmVyID0gNDAwMCk6IFByb21pc2U8QmFzZU1lc3NhZ2VbXT4ge1xuICAgIGNvbnN0IG1lc3NhZ2VzID0gYXdhaXQgdGhpcy5nZXRNZXNzYWdlcygpO1xuICAgIFxuICAgIC8vIFNpbXBsZSB0b2tlbiBlc3RpbWF0aW9uIChyb3VnaGx5IDQgY2hhcmFjdGVycyBwZXIgdG9rZW4pXG4gICAgbGV0IHRva2VuQ291bnQgPSAwO1xuICAgIGNvbnN0IGZpbHRlcmVkTWVzc2FnZXM6IEJhc2VNZXNzYWdlW10gPSBbXTtcbiAgICBcbiAgICAvLyBQcm9jZXNzIG1lc3NhZ2VzIGluIHJldmVyc2Ugb3JkZXIgKG1vc3QgcmVjZW50IGZpcnN0KSB0byBzdGF5IHdpdGhpbiBidWRnZXRcbiAgICBmb3IgKGxldCBpID0gbWVzc2FnZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlc1tpXTtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSB0eXBlb2YgbWVzc2FnZS5jb250ZW50ID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UuY29udGVudCA6IEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UuY29udGVudCk7XG4gICAgICBjb25zdCBlc3RpbWF0ZWRUb2tlbnMgPSBNYXRoLmNlaWwoY29udGVudC5sZW5ndGggLyA0KTtcbiAgICAgIFxuICAgICAgaWYgKHRva2VuQ291bnQgKyBlc3RpbWF0ZWRUb2tlbnMgPiBtYXhUb2tlbnMgJiYgZmlsdGVyZWRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgXG4gICAgICBmaWx0ZXJlZE1lc3NhZ2VzLnVuc2hpZnQobWVzc2FnZSk7XG4gICAgICB0b2tlbkNvdW50ICs9IGVzdGltYXRlZFRva2VucztcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIGZpbHRlcmVkTWVzc2FnZXM7XG4gIH1cbn1cbiJdfQ==