import type { ResponseChunking, ResponseChunkingRule } from '../config/personas.js';
import type { MessageSource } from '../types/index.js';

export interface ResponseChunk {
  text: string;
  index: number;
  total: number;
  delayMs: number;
  responseToMessageId?: string; // For interruption tracking
}

/**
 * Service for chunking agent responses based on channel and persona configuration
 */
export class ResponseChunker {
  /**
   * Chunk a response based on persona configuration and channel
   */
  static chunkResponse(
    response: string,
    channel: MessageSource,
    chunkingConfig?: ResponseChunking,
    responseToMessageId?: string
  ): ResponseChunk[] {
    // If chunking is disabled or not configured, return single chunk
    if (!chunkingConfig?.enabled || !chunkingConfig.rules[channel]) {
      return [{
        text: response,
        index: 0,
        total: 1,
        delayMs: 0,
        responseToMessageId
      }];
    }

    const rule = chunkingConfig.rules[channel];
    
    // If no chunking for this channel, return single chunk
    if (rule.chunkBy === 'none' || rule.maxLength === -1) {
      return [{
        text: response,
        index: 0,
        total: 1,
        delayMs: 0,
        responseToMessageId
      }];
    }

    let chunks: string[] = [];

    switch (rule.chunkBy) {
      case 'sentence':
        chunks = this.chunkBySentence(response, rule.maxLength);
        break;
      case 'paragraph':
        chunks = this.chunkByParagraph(response, rule.maxLength);
        break;
      default:
        chunks = [response];
    }

    // Convert to ResponseChunk objects
    return chunks.map((text, index) => ({
      text: text.trim(),
      index,
      total: chunks.length,
      delayMs: index === 0 ? 0 : rule.delayBetweenChunks,
      responseToMessageId
    }));
  }

  /**
   * Chunk response by sentences, respecting max length
   */
  private static chunkBySentence(text: string, maxLength: number): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      
      if (testChunk.length <= maxLength) {
        currentChunk = testChunk;
      } else {
        // If current chunk has content, save it
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = sentence;
        } else {
          // Single sentence is too long, split by words
          const wordChunks = this.chunkByWords(sentence, maxLength);
          chunks.push(...wordChunks);
        }
      }
    }

    // Add remaining chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  /**
   * Chunk response by paragraphs, respecting max length
   */
  private static chunkByParagraph(text: string, maxLength: number): string[] {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxLength) {
        chunks.push(paragraph);
      } else {
        // Paragraph is too long, chunk by sentences
        const sentenceChunks = this.chunkBySentence(paragraph, maxLength);
        chunks.push(...sentenceChunks);
      }
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  /**
   * Chunk by words when sentences are too long
   */
  private static chunkByWords(text: string, maxLength: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
      
      if (testChunk.length <= maxLength) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = word;
        } else {
          // Single word is too long, just add it
          chunks.push(word);
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  }

  /**
   * Simulate typing delay for chat interfaces
   */
  static async simulateTyping(text: string, wordsPerMinute: number = 200): Promise<number> {
    const words = text.split(/\s+/).length;
    const typingTimeMs = (words / wordsPerMinute) * 60 * 1000;
    return Math.min(Math.max(typingTimeMs, 500), 3000); // Between 0.5-3 seconds
  }
}

