"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseChunker = void 0;
/**
 * Service for chunking agent responses based on channel and persona configuration
 */
class ResponseChunker {
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
exports.ResponseChunker = ResponseChunker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzcG9uc2UtY2h1bmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvcmVzcG9uc2UtY2h1bmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFVQTs7R0FFRztBQUNILE1BQWEsZUFBZTtJQUMxQjs7T0FFRztJQUNILE1BQU0sQ0FBQyxhQUFhLENBQ2xCLFFBQWdCLEVBQ2hCLE9BQXNCLEVBQ3RCLGNBQWlDO1FBRWpDLGlFQUFpRTtRQUNqRSxJQUFJLENBQUMsY0FBYyxFQUFFLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMvRCxPQUFPLENBQUM7b0JBQ04sSUFBSSxFQUFFLFFBQVE7b0JBQ2QsS0FBSyxFQUFFLENBQUM7b0JBQ1IsS0FBSyxFQUFFLENBQUM7b0JBQ1IsT0FBTyxFQUFFLENBQUM7aUJBQ1gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFM0MsdURBQXVEO1FBQ3ZELElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sQ0FBQztvQkFDTixJQUFJLEVBQUUsUUFBUTtvQkFDZCxLQUFLLEVBQUUsQ0FBQztvQkFDUixLQUFLLEVBQUUsQ0FBQztvQkFDUixPQUFPLEVBQUUsQ0FBQztpQkFDWCxDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsSUFBSSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBRTFCLFFBQVEsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3JCLEtBQUssVUFBVTtnQkFDYixNQUFNLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN4RCxNQUFNO1lBQ1IsS0FBSyxXQUFX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QUF5QixHQUFHO1FBQ3BFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLE1BQU0sWUFBWSxHQUFHLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDMUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsd0JBQXdCO0lBQzlFLENBQUM7Q0FDRjtBQWxKRCwwQ0FrSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFJlc3BvbnNlQ2h1bmtpbmcsIFJlc3BvbnNlQ2h1bmtpbmdSdWxlIH0gZnJvbSAnLi4vY29uZmlnL3BlcnNvbmFzLmpzJztcclxuaW1wb3J0IHR5cGUgeyBNZXNzYWdlU291cmNlIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBSZXNwb25zZUNodW5rIHtcclxuICB0ZXh0OiBzdHJpbmc7XHJcbiAgaW5kZXg6IG51bWJlcjtcclxuICB0b3RhbDogbnVtYmVyO1xyXG4gIGRlbGF5TXM6IG51bWJlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNlcnZpY2UgZm9yIGNodW5raW5nIGFnZW50IHJlc3BvbnNlcyBiYXNlZCBvbiBjaGFubmVsIGFuZCBwZXJzb25hIGNvbmZpZ3VyYXRpb25cclxuICovXHJcbmV4cG9ydCBjbGFzcyBSZXNwb25zZUNodW5rZXIge1xyXG4gIC8qKlxyXG4gICAqIENodW5rIGEgcmVzcG9uc2UgYmFzZWQgb24gcGVyc29uYSBjb25maWd1cmF0aW9uIGFuZCBjaGFubmVsXHJcbiAgICovXHJcbiAgc3RhdGljIGNodW5rUmVzcG9uc2UoXHJcbiAgICByZXNwb25zZTogc3RyaW5nLFxyXG4gICAgY2hhbm5lbDogTWVzc2FnZVNvdXJjZSxcclxuICAgIGNodW5raW5nQ29uZmlnPzogUmVzcG9uc2VDaHVua2luZ1xyXG4gICk6IFJlc3BvbnNlQ2h1bmtbXSB7XHJcbiAgICAvLyBJZiBjaHVua2luZyBpcyBkaXNhYmxlZCBvciBub3QgY29uZmlndXJlZCwgcmV0dXJuIHNpbmdsZSBjaHVua1xyXG4gICAgaWYgKCFjaHVua2luZ0NvbmZpZz8uZW5hYmxlZCB8fCAhY2h1bmtpbmdDb25maWcucnVsZXNbY2hhbm5lbF0pIHtcclxuICAgICAgcmV0dXJuIFt7XHJcbiAgICAgICAgdGV4dDogcmVzcG9uc2UsXHJcbiAgICAgICAgaW5kZXg6IDAsXHJcbiAgICAgICAgdG90YWw6IDEsXHJcbiAgICAgICAgZGVsYXlNczogMFxyXG4gICAgICB9XTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBydWxlID0gY2h1bmtpbmdDb25maWcucnVsZXNbY2hhbm5lbF07XHJcbiAgICBcclxuICAgIC8vIElmIG5vIGNodW5raW5nIGZvciB0aGlzIGNoYW5uZWwsIHJldHVybiBzaW5nbGUgY2h1bmtcclxuICAgIGlmIChydWxlLmNodW5rQnkgPT09ICdub25lJyB8fCBydWxlLm1heExlbmd0aCA9PT0gLTEpIHtcclxuICAgICAgcmV0dXJuIFt7XHJcbiAgICAgICAgdGV4dDogcmVzcG9uc2UsXHJcbiAgICAgICAgaW5kZXg6IDAsXHJcbiAgICAgICAgdG90YWw6IDEsXHJcbiAgICAgICAgZGVsYXlNczogMFxyXG4gICAgICB9XTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIHN3aXRjaCAocnVsZS5jaHVua0J5KSB7XHJcbiAgICAgIGNhc2UgJ3NlbnRlbmNlJzpcclxuICAgICAgICBjaHVua3MgPSB0aGlzLmNodW5rQnlTZW50ZW5jZShyZXNwb25zZSwgcnVsZS5tYXhMZW5ndGgpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdwYXJhZ3JhcGgnOlxyXG4gICAgICAgIGNodW5rcyA9IHRoaXMuY2h1bmtCeVBhcmFncmFwaChyZXNwb25zZSwgcnVsZS5tYXhMZW5ndGgpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIGNodW5rcyA9IFtyZXNwb25zZV07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ29udmVydCB0byBSZXNwb25zZUNodW5rIG9iamVjdHNcclxuICAgIHJldHVybiBjaHVua3MubWFwKCh0ZXh0LCBpbmRleCkgPT4gKHtcclxuICAgICAgdGV4dDogdGV4dC50cmltKCksXHJcbiAgICAgIGluZGV4LFxyXG4gICAgICB0b3RhbDogY2h1bmtzLmxlbmd0aCxcclxuICAgICAgZGVsYXlNczogaW5kZXggPT09IDAgPyAwIDogcnVsZS5kZWxheUJldHdlZW5DaHVua3NcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENodW5rIHJlc3BvbnNlIGJ5IHNlbnRlbmNlcywgcmVzcGVjdGluZyBtYXggbGVuZ3RoXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzdGF0aWMgY2h1bmtCeVNlbnRlbmNlKHRleHQ6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCBzZW50ZW5jZXMgPSB0ZXh0LnNwbGl0KC8oPzw9Wy4hP10pXFxzKy8pO1xyXG4gICAgY29uc3QgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgbGV0IGN1cnJlbnRDaHVuayA9ICcnO1xyXG5cclxuICAgIGZvciAoY29uc3Qgc2VudGVuY2Ugb2Ygc2VudGVuY2VzKSB7XHJcbiAgICAgIGNvbnN0IHRlc3RDaHVuayA9IGN1cnJlbnRDaHVuayA/IGAke2N1cnJlbnRDaHVua30gJHtzZW50ZW5jZX1gIDogc2VudGVuY2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodGVzdENodW5rLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcclxuICAgICAgICBjdXJyZW50Q2h1bmsgPSB0ZXN0Q2h1bms7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gSWYgY3VycmVudCBjaHVuayBoYXMgY29udGVudCwgc2F2ZSBpdFxyXG4gICAgICAgIGlmIChjdXJyZW50Q2h1bmspIHtcclxuICAgICAgICAgIGNodW5rcy5wdXNoKGN1cnJlbnRDaHVuayk7XHJcbiAgICAgICAgICBjdXJyZW50Q2h1bmsgPSBzZW50ZW5jZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gU2luZ2xlIHNlbnRlbmNlIGlzIHRvbyBsb25nLCBzcGxpdCBieSB3b3Jkc1xyXG4gICAgICAgICAgY29uc3Qgd29yZENodW5rcyA9IHRoaXMuY2h1bmtCeVdvcmRzKHNlbnRlbmNlLCBtYXhMZW5ndGgpO1xyXG4gICAgICAgICAgY2h1bmtzLnB1c2goLi4ud29yZENodW5rcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRkIHJlbWFpbmluZyBjaHVua1xyXG4gICAgaWYgKGN1cnJlbnRDaHVuaykge1xyXG4gICAgICBjaHVua3MucHVzaChjdXJyZW50Q2h1bmspO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjaHVua3MuZmlsdGVyKGNodW5rID0+IGNodW5rLnRyaW0oKS5sZW5ndGggPiAwKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENodW5rIHJlc3BvbnNlIGJ5IHBhcmFncmFwaHMsIHJlc3BlY3RpbmcgbWF4IGxlbmd0aFxyXG4gICAqL1xyXG4gIHByaXZhdGUgc3RhdGljIGNodW5rQnlQYXJhZ3JhcGgodGV4dDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZ1tdIHtcclxuICAgIGNvbnN0IHBhcmFncmFwaHMgPSB0ZXh0LnNwbGl0KC9cXG5cXHMqXFxuLyk7XHJcbiAgICBjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgZm9yIChjb25zdCBwYXJhZ3JhcGggb2YgcGFyYWdyYXBocykge1xyXG4gICAgICBpZiAocGFyYWdyYXBoLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcclxuICAgICAgICBjaHVua3MucHVzaChwYXJhZ3JhcGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFBhcmFncmFwaCBpcyB0b28gbG9uZywgY2h1bmsgYnkgc2VudGVuY2VzXHJcbiAgICAgICAgY29uc3Qgc2VudGVuY2VDaHVua3MgPSB0aGlzLmNodW5rQnlTZW50ZW5jZShwYXJhZ3JhcGgsIG1heExlbmd0aCk7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goLi4uc2VudGVuY2VDaHVua3MpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNodW5rcy5maWx0ZXIoY2h1bmsgPT4gY2h1bmsudHJpbSgpLmxlbmd0aCA+IDApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2h1bmsgYnkgd29yZHMgd2hlbiBzZW50ZW5jZXMgYXJlIHRvbyBsb25nXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzdGF0aWMgY2h1bmtCeVdvcmRzKHRleHQ6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCB3b3JkcyA9IHRleHQuc3BsaXQoL1xccysvKTtcclxuICAgIGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcclxuICAgIGxldCBjdXJyZW50Q2h1bmsgPSAnJztcclxuXHJcbiAgICBmb3IgKGNvbnN0IHdvcmQgb2Ygd29yZHMpIHtcclxuICAgICAgY29uc3QgdGVzdENodW5rID0gY3VycmVudENodW5rID8gYCR7Y3VycmVudENodW5rfSAke3dvcmR9YCA6IHdvcmQ7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodGVzdENodW5rLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcclxuICAgICAgICBjdXJyZW50Q2h1bmsgPSB0ZXN0Q2h1bms7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRDaHVuaykge1xyXG4gICAgICAgICAgY2h1bmtzLnB1c2goY3VycmVudENodW5rKTtcclxuICAgICAgICAgIGN1cnJlbnRDaHVuayA9IHdvcmQ7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIFNpbmdsZSB3b3JkIGlzIHRvbyBsb25nLCBqdXN0IGFkZCBpdFxyXG4gICAgICAgICAgY2h1bmtzLnB1c2god29yZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGN1cnJlbnRDaHVuaykge1xyXG4gICAgICBjaHVua3MucHVzaChjdXJyZW50Q2h1bmspO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjaHVua3MuZmlsdGVyKGNodW5rID0+IGNodW5rLnRyaW0oKS5sZW5ndGggPiAwKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNpbXVsYXRlIHR5cGluZyBkZWxheSBmb3IgY2hhdCBpbnRlcmZhY2VzXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIHNpbXVsYXRlVHlwaW5nKHRleHQ6IHN0cmluZywgd29yZHNQZXJNaW51dGU6IG51bWJlciA9IDIwMCk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgICBjb25zdCB3b3JkcyA9IHRleHQuc3BsaXQoL1xccysvKS5sZW5ndGg7XHJcbiAgICBjb25zdCB0eXBpbmdUaW1lTXMgPSAod29yZHMgLyB3b3Jkc1Blck1pbnV0ZSkgKiA2MCAqIDEwMDA7XHJcbiAgICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodHlwaW5nVGltZU1zLCA1MDApLCAzMDAwKTsgLy8gQmV0d2VlbiAwLjUtMyBzZWNvbmRzXHJcbiAgfVxyXG59XHJcblxyXG4iXX0=