import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage } from '@langchain/core/messages';
import { DynamoDBService } from './dynamodb.js';
export interface KxDynamoChatHistoryConfig {
    tenantId: string;
    emailLc: string;
    dynamoService: DynamoDBService;
    historyLimit?: number;
    conversationId?: string;
}
/**
 * Custom LangChain chat history implementation that reads/writes from DynamoDB messages table
 */
export declare class KxDynamoChatHistory extends BaseChatMessageHistory {
    lc_namespace: string[];
    private tenantId;
    private emailLc;
    private dynamoService;
    private historyLimit;
    private conversationId?;
    constructor(config: KxDynamoChatHistoryConfig);
    /**
     * Get messages from DynamoDB and convert to LangChain message format
     */
    getMessages(): Promise<BaseMessage[]>;
    /**
     * Add a message to the chat history
     */
    addMessage(message: BaseMessage): Promise<void>;
    /**
     * Clear chat history (optional implementation)
     * In practice, you might want to add a boundary marker instead of deleting
     */
    clear(): Promise<void>;
    /**
     * Add user message (required by BaseChatMessageHistory)
     */
    addUserMessage(message: string): Promise<void>;
    /**
     * Add AI message (required by BaseChatMessageHistory)
     */
    addAIChatMessage(message: string): Promise<void>;
    /**
     * Convert DynamoDB message item to LangChain message
     */
    private messageItemToLangChainMessage;
    /**
     * Convert LangChain message to DynamoDB message item
     */
    private langChainMessageToMessageItem;
    /**
     * Get recent message count for token budget management
     */
    getMessageCount(): Promise<number>;
    /**
     * Get messages with token estimation for budget management
     */
    getMessagesWithTokenEstimate(maxTokens?: number): Promise<BaseMessage[]>;
}
