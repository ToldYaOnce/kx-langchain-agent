import type { ResponseChunking } from '../config/personas.js';
import type { MessageSource } from '../types/index.js';
export interface ResponseChunk {
    text: string;
    index: number;
    total: number;
    delayMs: number;
}
/**
 * Service for chunking agent responses based on channel and persona configuration
 */
export declare class ResponseChunker {
    /**
     * Chunk a response based on persona configuration and channel
     */
    static chunkResponse(response: string, channel: MessageSource, chunkingConfig?: ResponseChunking): ResponseChunk[];
    /**
     * Chunk response by sentences, respecting max length
     */
    private static chunkBySentence;
    /**
     * Chunk response by paragraphs, respecting max length
     */
    private static chunkByParagraph;
    /**
     * Chunk by words when sentences are too long
     */
    private static chunkByWords;
    /**
     * Simulate typing delay for chat interfaces
     */
    static simulateTyping(text: string, wordsPerMinute?: number): Promise<number>;
}
