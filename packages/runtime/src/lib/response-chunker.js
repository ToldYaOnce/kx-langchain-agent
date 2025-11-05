/**
 * Service for chunking agent responses based on channel and persona configuration
 */
export class ResponseChunker {
    /**
     * Chunk a response based on persona configuration and channel
     */
    static chunkResponse(response, channel, chunkingConfig) {
        // If chunking is disabled or not configured, return single chunk
        if (!chunkingConfig?.enabled || !chunkingConfig.rules[channel]) {
            return [{
                    text: response,
                    index: 0,
                    total: 1,
                    delayMs: 0
                }];
        }
        const rule = chunkingConfig.rules[channel];
        // If no chunking for this channel, return single chunk
        if (rule.chunkBy === 'none' || rule.maxLength === -1) {
            return [{
                    text: response,
                    index: 0,
                    total: 1,
                    delayMs: 0
                }];
        }
        let chunks = [];
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
            delayMs: index === 0 ? 0 : rule.delayBetweenChunks
        }));
    }
    /**
     * Chunk response by sentences, respecting max length
     */
    static chunkBySentence(text, maxLength) {
        const sentences = text.split(/(?<=[.!?])\s+/);
        const chunks = [];
        let currentChunk = '';
        for (const sentence of sentences) {
            const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
            if (testChunk.length <= maxLength) {
                currentChunk = testChunk;
            }
            else {
                // If current chunk has content, save it
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = sentence;
                }
                else {
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
    static chunkByParagraph(text, maxLength) {
        const paragraphs = text.split(/\n\s*\n/);
        const chunks = [];
        for (const paragraph of paragraphs) {
            if (paragraph.length <= maxLength) {
                chunks.push(paragraph);
            }
            else {
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
    static chunkByWords(text, maxLength) {
        const words = text.split(/\s+/);
        const chunks = [];
        let currentChunk = '';
        for (const word of words) {
            const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
            if (testChunk.length <= maxLength) {
                currentChunk = testChunk;
            }
            else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = word;
                }
                else {
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
    static async simulateTyping(text, wordsPerMinute = 200) {
        const words = text.split(/\s+/).length;
        const typingTimeMs = (words / wordsPerMinute) * 60 * 1000;
        return Math.min(Math.max(typingTimeMs, 500), 3000); // Between 0.5-3 seconds
    }
}
//# sourceMappingURL=response-chunker.js.map