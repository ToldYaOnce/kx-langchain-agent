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
    static chunkResponse(response, channel, chunkingConfig, responseToMessageId) {
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
            delayMs: index === 0 ? 0 : rule.delayBetweenChunks,
            responseToMessageId
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzcG9uc2UtY2h1bmtlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvcmVzcG9uc2UtY2h1bmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFXQTs7R0FFRztBQUNILE1BQWEsZUFBZTtJQUMxQjs7T0FFRztJQUNILE1BQU0sQ0FBQyxhQUFhLENBQ2xCLFFBQWdCLEVBQ2hCLE9BQXNCLEVBQ3RCLGNBQWlDLEVBQ2pDLG1CQUE0QjtRQUU1QixpRUFBaUU7UUFDakUsSUFBSSxDQUFDLGNBQWMsRUFBRSxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDL0QsT0FBTyxDQUFDO29CQUNOLElBQUksRUFBRSxRQUFRO29CQUNkLEtBQUssRUFBRSxDQUFDO29CQUNSLEtBQUssRUFBRSxDQUFDO29CQUNSLE9BQU8sRUFBRSxDQUFDO29CQUNWLG1CQUFtQjtpQkFDcEIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFM0MsdURBQXVEO1FBQ3ZELElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxNQUFNLElBQUksSUFBSSxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3JELE9BQU8sQ0FBQztvQkFDTixJQUFJLEVBQUUsUUFBUTtvQkFDZCxLQUFLLEVBQUUsQ0FBQztvQkFDUixLQUFLLEVBQUUsQ0FBQztvQkFDUixPQUFPLEVBQUUsQ0FBQztvQkFDVixtQkFBbUI7aUJBQ3BCLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLE1BQU0sR0FBYSxFQUFFLENBQUM7UUFFMUIsUUFBUSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDckIsS0FBSyxVQUFVO2dCQUNiLE1BQU0sR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMs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OztPQUVHO0lBQ0gsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBWSxFQUFFLGlCQUF5QixHQUFHO1FBQ3BFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLE1BQU0sWUFBWSxHQUFHLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDMUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsd0JBQXdCO0lBQzlFLENBQUM7Q0FDRjtBQXRKRCwwQ0FzSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFJlc3BvbnNlQ2h1bmtpbmcsIFJlc3BvbnNlQ2h1bmtpbmdSdWxlIH0gZnJvbSAnLi4vY29uZmlnL3BlcnNvbmFzLmpzJztcclxuaW1wb3J0IHR5cGUgeyBNZXNzYWdlU291cmNlIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBSZXNwb25zZUNodW5rIHtcclxuICB0ZXh0OiBzdHJpbmc7XHJcbiAgaW5kZXg6IG51bWJlcjtcclxuICB0b3RhbDogbnVtYmVyO1xyXG4gIGRlbGF5TXM6IG51bWJlcjtcclxuICByZXNwb25zZVRvTWVzc2FnZUlkPzogc3RyaW5nOyAvLyBGb3IgaW50ZXJydXB0aW9uIHRyYWNraW5nXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTZXJ2aWNlIGZvciBjaHVua2luZyBhZ2VudCByZXNwb25zZXMgYmFzZWQgb24gY2hhbm5lbCBhbmQgcGVyc29uYSBjb25maWd1cmF0aW9uXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgUmVzcG9uc2VDaHVua2VyIHtcclxuICAvKipcclxuICAgKiBDaHVuayBhIHJlc3BvbnNlIGJhc2VkIG9uIHBlcnNvbmEgY29uZmlndXJhdGlvbiBhbmQgY2hhbm5lbFxyXG4gICAqL1xyXG4gIHN0YXRpYyBjaHVua1Jlc3BvbnNlKFxyXG4gICAgcmVzcG9uc2U6IHN0cmluZyxcclxuICAgIGNoYW5uZWw6IE1lc3NhZ2VTb3VyY2UsXHJcbiAgICBjaHVua2luZ0NvbmZpZz86IFJlc3BvbnNlQ2h1bmtpbmcsXHJcbiAgICByZXNwb25zZVRvTWVzc2FnZUlkPzogc3RyaW5nXHJcbiAgKTogUmVzcG9uc2VDaHVua1tdIHtcclxuICAgIC8vIElmIGNodW5raW5nIGlzIGRpc2FibGVkIG9yIG5vdCBjb25maWd1cmVkLCByZXR1cm4gc2luZ2xlIGNodW5rXHJcbiAgICBpZiAoIWNodW5raW5nQ29uZmlnPy5lbmFibGVkIHx8ICFjaHVua2luZ0NvbmZpZy5ydWxlc1tjaGFubmVsXSkge1xyXG4gICAgICByZXR1cm4gW3tcclxuICAgICAgICB0ZXh0OiByZXNwb25zZSxcclxuICAgICAgICBpbmRleDogMCxcclxuICAgICAgICB0b3RhbDogMSxcclxuICAgICAgICBkZWxheU1zOiAwLFxyXG4gICAgICAgIHJlc3BvbnNlVG9NZXNzYWdlSWRcclxuICAgICAgfV07XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcnVsZSA9IGNodW5raW5nQ29uZmlnLnJ1bGVzW2NoYW5uZWxdO1xyXG4gICAgXHJcbiAgICAvLyBJZiBubyBjaHVua2luZyBmb3IgdGhpcyBjaGFubmVsLCByZXR1cm4gc2luZ2xlIGNodW5rXHJcbiAgICBpZiAocnVsZS5jaHVua0J5ID09PSAnbm9uZScgfHwgcnVsZS5tYXhMZW5ndGggPT09IC0xKSB7XHJcbiAgICAgIHJldHVybiBbe1xyXG4gICAgICAgIHRleHQ6IHJlc3BvbnNlLFxyXG4gICAgICAgIGluZGV4OiAwLFxyXG4gICAgICAgIHRvdGFsOiAxLFxyXG4gICAgICAgIGRlbGF5TXM6IDAsXHJcbiAgICAgICAgcmVzcG9uc2VUb01lc3NhZ2VJZFxyXG4gICAgICB9XTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIHN3aXRjaCAocnVsZS5jaHVua0J5KSB7XHJcbiAgICAgIGNhc2UgJ3NlbnRlbmNlJzpcclxuICAgICAgICBjaHVua3MgPSB0aGlzLmNodW5rQnlTZW50ZW5jZShyZXNwb25zZSwgcnVsZS5tYXhMZW5ndGgpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdwYXJhZ3JhcGgnOlxyXG4gICAgICAgIGNodW5rcyA9IHRoaXMuY2h1bmtCeVBhcmFncmFwaChyZXNwb25zZSwgcnVsZS5tYXhMZW5ndGgpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIGNodW5rcyA9IFtyZXNwb25zZV07XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ29udmVydCB0byBSZXNwb25zZUNodW5rIG9iamVjdHNcclxuICAgIHJldHVybiBjaHVua3MubWFwKCh0ZXh0LCBpbmRleCkgPT4gKHtcclxuICAgICAgdGV4dDogdGV4dC50cmltKCksXHJcbiAgICAgIGluZGV4LFxyXG4gICAgICB0b3RhbDogY2h1bmtzLmxlbmd0aCxcclxuICAgICAgZGVsYXlNczogaW5kZXggPT09IDAgPyAwIDogcnVsZS5kZWxheUJldHdlZW5DaHVua3MsXHJcbiAgICAgIHJlc3BvbnNlVG9NZXNzYWdlSWRcclxuICAgIH0pKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENodW5rIHJlc3BvbnNlIGJ5IHNlbnRlbmNlcywgcmVzcGVjdGluZyBtYXggbGVuZ3RoXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzdGF0aWMgY2h1bmtCeVNlbnRlbmNlKHRleHQ6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCBzZW50ZW5jZXMgPSB0ZXh0LnNwbGl0KC8oPzw9Wy4hP10pXFxzKy8pO1xyXG4gICAgY29uc3QgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgbGV0IGN1cnJlbnRDaHVuayA9ICcnO1xyXG5cclxuICAgIGZvciAoY29uc3Qgc2VudGVuY2Ugb2Ygc2VudGVuY2VzKSB7XHJcbiAgICAgIGNvbnN0IHRlc3RDaHVuayA9IGN1cnJlbnRDaHVuayA/IGAke2N1cnJlbnRDaHVua30gJHtzZW50ZW5jZX1gIDogc2VudGVuY2U7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodGVzdENodW5rLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcclxuICAgICAgICBjdXJyZW50Q2h1bmsgPSB0ZXN0Q2h1bms7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gSWYgY3VycmVudCBjaHVuayBoYXMgY29udGVudCwgc2F2ZSBpdFxyXG4gICAgICAgIGlmIChjdXJyZW50Q2h1bmspIHtcclxuICAgICAgICAgIGNodW5rcy5wdXNoKGN1cnJlbnRDaHVuayk7XHJcbiAgICAgICAgICBjdXJyZW50Q2h1bmsgPSBzZW50ZW5jZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgLy8gU2luZ2xlIHNlbnRlbmNlIGlzIHRvbyBsb25nLCBzcGxpdCBieSB3b3Jkc1xyXG4gICAgICAgICAgY29uc3Qgd29yZENodW5rcyA9IHRoaXMuY2h1bmtCeVdvcmRzKHNlbnRlbmNlLCBtYXhMZW5ndGgpO1xyXG4gICAgICAgICAgY2h1bmtzLnB1c2goLi4ud29yZENodW5rcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRkIHJlbWFpbmluZyBjaHVua1xyXG4gICAgaWYgKGN1cnJlbnRDaHVuaykge1xyXG4gICAgICBjaHVua3MucHVzaChjdXJyZW50Q2h1bmspO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjaHVua3MuZmlsdGVyKGNodW5rID0+IGNodW5rLnRyaW0oKS5sZW5ndGggPiAwKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENodW5rIHJlc3BvbnNlIGJ5IHBhcmFncmFwaHMsIHJlc3BlY3RpbmcgbWF4IGxlbmd0aFxyXG4gICAqL1xyXG4gIHByaXZhdGUgc3RhdGljIGNodW5rQnlQYXJhZ3JhcGgodGV4dDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZ1tdIHtcclxuICAgIGNvbnN0IHBhcmFncmFwaHMgPSB0ZXh0LnNwbGl0KC9cXG5cXHMqXFxuLyk7XHJcbiAgICBjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgZm9yIChjb25zdCBwYXJhZ3JhcGggb2YgcGFyYWdyYXBocykge1xyXG4gICAgICBpZiAocGFyYWdyYXBoLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcclxuICAgICAgICBjaHVua3MucHVzaChwYXJhZ3JhcGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIFBhcmFncmFwaCBpcyB0b28gbG9uZywgY2h1bmsgYnkgc2VudGVuY2VzXHJcbiAgICAgICAgY29uc3Qgc2VudGVuY2VDaHVua3MgPSB0aGlzLmNodW5rQnlTZW50ZW5jZShwYXJhZ3JhcGgsIG1heExlbmd0aCk7XHJcbiAgICAgICAgY2h1bmtzLnB1c2goLi4uc2VudGVuY2VDaHVua3MpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNodW5rcy5maWx0ZXIoY2h1bmsgPT4gY2h1bmsudHJpbSgpLmxlbmd0aCA+IDApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2h1bmsgYnkgd29yZHMgd2hlbiBzZW50ZW5jZXMgYXJlIHRvbyBsb25nXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBzdGF0aWMgY2h1bmtCeVdvcmRzKHRleHQ6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCB3b3JkcyA9IHRleHQuc3BsaXQoL1xccysvKTtcclxuICAgIGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcclxuICAgIGxldCBjdXJyZW50Q2h1bmsgPSAnJztcclxuXHJcbiAgICBmb3IgKGNvbnN0IHdvcmQgb2Ygd29yZHMpIHtcclxuICAgICAgY29uc3QgdGVzdENodW5rID0gY3VycmVudENodW5rID8gYCR7Y3VycmVudENodW5rfSAke3dvcmR9YCA6IHdvcmQ7XHJcbiAgICAgIFxyXG4gICAgICBpZiAodGVzdENodW5rLmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcclxuICAgICAgICBjdXJyZW50Q2h1bmsgPSB0ZXN0Q2h1bms7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRDaHVuaykge1xyXG4gICAgICAgICAgY2h1bmtzLnB1c2goY3VycmVudENodW5rKTtcclxuICAgICAgICAgIGN1cnJlbnRDaHVuayA9IHdvcmQ7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIFNpbmdsZSB3b3JkIGlzIHRvbyBsb25nLCBqdXN0IGFkZCBpdFxyXG4gICAgICAgICAgY2h1bmtzLnB1c2god29yZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGN1cnJlbnRDaHVuaykge1xyXG4gICAgICBjaHVua3MucHVzaChjdXJyZW50Q2h1bmspO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjaHVua3MuZmlsdGVyKGNodW5rID0+IGNodW5rLnRyaW0oKS5sZW5ndGggPiAwKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFNpbXVsYXRlIHR5cGluZyBkZWxheSBmb3IgY2hhdCBpbnRlcmZhY2VzXHJcbiAgICovXHJcbiAgc3RhdGljIGFzeW5jIHNpbXVsYXRlVHlwaW5nKHRleHQ6IHN0cmluZywgd29yZHNQZXJNaW51dGU6IG51bWJlciA9IDIwMCk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgICBjb25zdCB3b3JkcyA9IHRleHQuc3BsaXQoL1xccysvKS5sZW5ndGg7XHJcbiAgICBjb25zdCB0eXBpbmdUaW1lTXMgPSAod29yZHMgLyB3b3Jkc1Blck1pbnV0ZSkgKiA2MCAqIDEwMDA7XHJcbiAgICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodHlwaW5nVGltZU1zLCA1MDApLCAzMDAwKTsgLy8gQmV0d2VlbiAwLjUtMyBzZWNvbmRzXHJcbiAgfVxyXG59XHJcblxyXG4iXX0=