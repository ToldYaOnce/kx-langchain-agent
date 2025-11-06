"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryChatHistory = void 0;
const chat_history_1 = require("@langchain/core/chat_history");
/**
 * Simple in-memory chat history for development/testing
 * No persistence, no DynamoDB dependencies
 */
class MemoryChatHistory extends chat_history_1.BaseChatMessageHistory {
    constructor(sessionId = 'default') {
        super();
        this.sessionId = sessionId;
        this.lc_namespace = ["langchain", "stores", "message", "memory"];
        this.messages = [];
    }
    async getMessages() {
        return [...this.messages];
    }
    async addMessage(message) {
        this.messages.push(message);
    }
    async addUserMessage(message) {
        const { HumanMessage } = await Promise.resolve().then(() => __importStar(require('@langchain/core/messages')));
        await this.addMessage(new HumanMessage(message));
    }
    async addAIChatMessage(message) {
        const { AIMessage } = await Promise.resolve().then(() => __importStar(require('@langchain/core/messages')));
        await this.addMessage(new AIMessage(message));
    }
    async clear() {
        this.messages = [];
    }
    /**
     * Get recent messages within token budget
     */
    async getRecentMessages(maxTokens = 4000) {
        const messages = await this.getMessages();
        if (messages.length === 0) {
            return [];
        }
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
exports.MemoryChatHistory = MemoryChatHistory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVtb3J5LWNoYXQtaGlzdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvbWVtb3J5LWNoYXQtaGlzdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrREFBc0U7QUFHdEU7OztHQUdHO0FBQ0gsTUFBYSxpQkFBa0IsU0FBUSxxQ0FBc0I7SUFLM0QsWUFDVSxZQUFvQixTQUFTO1FBRXJDLEtBQUssRUFBRSxDQUFDO1FBRkEsY0FBUyxHQUFULFNBQVMsQ0FBb0I7UUFMdkMsaUJBQVksR0FBRyxDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXBELGFBQVEsR0FBa0IsRUFBRSxDQUFDO0lBTXJDLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVztRQUNmLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFvQjtRQUNuQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FBQyxPQUFlO1FBQ2xDLE1BQU0sRUFBRSxZQUFZLEVBQUUsR0FBRyx3REFBYSwwQkFBMEIsR0FBQyxDQUFDO1FBQ2xFLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBZTtRQUNwQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsd0RBQWEsMEJBQTBCLEdBQUMsQ0FBQztRQUMvRCxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUs7UUFDVCxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztJQUNyQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsaUJBQWlCLENBQUMsWUFBb0IsSUFBSTtRQUM5QyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUUxQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsT0FBTyxFQUFFLENBQUM7UUFDWixDQUFDO1FBRUQsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLE1BQU0sZ0JBQWdCLEdBQWtCLEVBQUUsQ0FBQztRQUUzQyw4RUFBOEU7UUFDOUUsS0FBSyxJQUFJLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDOUMsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLE1BQU0sT0FBTyxHQUFHLE9BQU8sT0FBTyxDQUFDLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3hHLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUV0RCxJQUFJLFVBQVUsR0FBRyxlQUFlLEdBQUcsU0FBUyxJQUFJLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUUsTUFBTTtZQUNSLENBQUM7WUFFRCxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbEMsVUFBVSxJQUFJLGVBQWUsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQztJQUMxQixDQUFDO0NBQ0Y7QUE5REQsOENBOERDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQmFzZUNoYXRNZXNzYWdlSGlzdG9yeSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9jaGF0X2hpc3RvcnknO1xyXG5pbXBvcnQgeyBCYXNlTWVzc2FnZSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9tZXNzYWdlcyc7XHJcblxyXG4vKipcclxuICogU2ltcGxlIGluLW1lbW9yeSBjaGF0IGhpc3RvcnkgZm9yIGRldmVsb3BtZW50L3Rlc3RpbmdcclxuICogTm8gcGVyc2lzdGVuY2UsIG5vIER5bmFtb0RCIGRlcGVuZGVuY2llc1xyXG4gKi9cclxuZXhwb3J0IGNsYXNzIE1lbW9yeUNoYXRIaXN0b3J5IGV4dGVuZHMgQmFzZUNoYXRNZXNzYWdlSGlzdG9yeSB7XHJcbiAgbGNfbmFtZXNwYWNlID0gW1wibGFuZ2NoYWluXCIsIFwic3RvcmVzXCIsIFwibWVzc2FnZVwiLCBcIm1lbW9yeVwiXTtcclxuICBcclxuICBwcml2YXRlIG1lc3NhZ2VzOiBCYXNlTWVzc2FnZVtdID0gW107XHJcbiAgXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIHNlc3Npb25JZDogc3RyaW5nID0gJ2RlZmF1bHQnXHJcbiAgKSB7XHJcbiAgICBzdXBlcigpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgZ2V0TWVzc2FnZXMoKTogUHJvbWlzZTxCYXNlTWVzc2FnZVtdPiB7XHJcbiAgICByZXR1cm4gWy4uLnRoaXMubWVzc2FnZXNdO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgYWRkTWVzc2FnZShtZXNzYWdlOiBCYXNlTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5tZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgYWRkVXNlck1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCB7IEh1bWFuTWVzc2FnZSB9ID0gYXdhaXQgaW1wb3J0KCdAbGFuZ2NoYWluL2NvcmUvbWVzc2FnZXMnKTtcclxuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShuZXcgSHVtYW5NZXNzYWdlKG1lc3NhZ2UpKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGFkZEFJQ2hhdE1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCB7IEFJTWVzc2FnZSB9ID0gYXdhaXQgaW1wb3J0KCdAbGFuZ2NoYWluL2NvcmUvbWVzc2FnZXMnKTtcclxuICAgIGF3YWl0IHRoaXMuYWRkTWVzc2FnZShuZXcgQUlNZXNzYWdlKG1lc3NhZ2UpKTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGNsZWFyKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5tZXNzYWdlcyA9IFtdO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IHJlY2VudCBtZXNzYWdlcyB3aXRoaW4gdG9rZW4gYnVkZ2V0XHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0UmVjZW50TWVzc2FnZXMobWF4VG9rZW5zOiBudW1iZXIgPSA0MDAwKTogUHJvbWlzZTxCYXNlTWVzc2FnZVtdPiB7XHJcbiAgICBjb25zdCBtZXNzYWdlcyA9IGF3YWl0IHRoaXMuZ2V0TWVzc2FnZXMoKTtcclxuICAgIFxyXG4gICAgaWYgKG1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCB0b2tlbkNvdW50ID0gMDtcclxuICAgIGNvbnN0IGZpbHRlcmVkTWVzc2FnZXM6IEJhc2VNZXNzYWdlW10gPSBbXTtcclxuICAgIFxyXG4gICAgLy8gUHJvY2VzcyBtZXNzYWdlcyBpbiByZXZlcnNlIG9yZGVyIChtb3N0IHJlY2VudCBmaXJzdCkgdG8gc3RheSB3aXRoaW4gYnVkZ2V0XHJcbiAgICBmb3IgKGxldCBpID0gbWVzc2FnZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgY29uc3QgbWVzc2FnZSA9IG1lc3NhZ2VzW2ldO1xyXG4gICAgICBjb25zdCBjb250ZW50ID0gdHlwZW9mIG1lc3NhZ2UuY29udGVudCA9PT0gJ3N0cmluZycgPyBtZXNzYWdlLmNvbnRlbnQgOiBKU09OLnN0cmluZ2lmeShtZXNzYWdlLmNvbnRlbnQpO1xyXG4gICAgICBjb25zdCBlc3RpbWF0ZWRUb2tlbnMgPSBNYXRoLmNlaWwoY29udGVudC5sZW5ndGggLyA0KTtcclxuICAgICAgXHJcbiAgICAgIGlmICh0b2tlbkNvdW50ICsgZXN0aW1hdGVkVG9rZW5zID4gbWF4VG9rZW5zICYmIGZpbHRlcmVkTWVzc2FnZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICBmaWx0ZXJlZE1lc3NhZ2VzLnVuc2hpZnQobWVzc2FnZSk7XHJcbiAgICAgIHRva2VuQ291bnQgKz0gZXN0aW1hdGVkVG9rZW5zO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gZmlsdGVyZWRNZXNzYWdlcztcclxuICB9XHJcbn1cclxuXHJcbiJdfQ==