import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Simple in-memory chat history for development/testing
 * No persistence, no DynamoDB dependencies
 */
export class MemoryChatHistory extends BaseChatMessageHistory {
  lc_namespace = ["langchain", "stores", "message", "memory"];
  
  private messages: BaseMessage[] = [];
  
  constructor(
    private sessionId: string = 'default'
  ) {
    super();
  }

  async getMessages(): Promise<BaseMessage[]> {
    return [...this.messages];
  }

  async addMessage(message: BaseMessage): Promise<void> {
    this.messages.push(message);
  }

  async addUserMessage(message: string): Promise<void> {
    const { HumanMessage } = await import('@langchain/core/messages');
    await this.addMessage(new HumanMessage(message));
  }

  async addAIChatMessage(message: string): Promise<void> {
    const { AIMessage } = await import('@langchain/core/messages');
    await this.addMessage(new AIMessage(message));
  }

  async clear(): Promise<void> {
    this.messages = [];
  }

  /**
   * Get recent messages within token budget
   */
  async getRecentMessages(maxTokens: number = 4000): Promise<BaseMessage[]> {
    const messages = await this.getMessages();
    
    if (messages.length === 0) {
      return [];
    }
    
    let tokenCount = 0;
    const filteredMessages: BaseMessage[] = [];
    
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

