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
exports.LocalSessionStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const messages_1 = require("@langchain/core/messages");
class LocalSessionStore {
    constructor(sessionDir = '.local-sessions') {
        this.currentLogFile = null;
        this.sessionDir = sessionDir;
        this.logDir = path.join(sessionDir, 'logs');
        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    getSessionPath(sessionId) {
        return path.join(this.sessionDir, `${sessionId}.json`);
    }
    loadSession(sessionId) {
        const sessionPath = this.getSessionPath(sessionId);
        if (!fs.existsSync(sessionPath)) {
            return null;
        }
        try {
            const data = fs.readFileSync(sessionPath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error(`Failed to load session ${sessionId}:`, error);
            return null;
        }
    }
    saveSession(sessionId, session) {
        const sessionPath = this.getSessionPath(sessionId);
        try {
            fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
        }
        catch (error) {
            console.error(`Failed to save session ${sessionId}:`, error);
        }
    }
    clearSession(sessionId) {
        const sessionPath = this.getSessionPath(sessionId);
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
        }
    }
    getMessages(sessionId) {
        const session = this.loadSession(sessionId);
        if (!session) {
            return [];
        }
        return session.messages.map(msg => msg.type === 'human'
            ? new messages_1.HumanMessage(msg.content)
            : new messages_1.AIMessage(msg.content));
    }
    addMessage(sessionId, message) {
        let session = this.loadSession(sessionId) || { messages: [] };
        session.messages.push({
            type: message._getType(),
            content: message.content.toString()
        });
        this.saveSession(sessionId, session);
    }
    getWorkflowState(sessionId) {
        const session = this.loadSession(sessionId);
        return session?.workflowState || null;
    }
    updateWorkflowState(sessionId, workflowState) {
        let session = this.loadSession(sessionId) || { messages: [] };
        session.workflowState = {
            ...workflowState,
            lastUpdated: new Date().toISOString()
        };
        this.saveSession(sessionId, session);
    }
    /**
     * Start logging to a file for this session (LOCAL DEV ONLY)
     */
    startLogging(sessionId) {
        // Delete ALL previous log files before starting a new session
        if (fs.existsSync(this.logDir)) {
            const files = fs.readdirSync(this.logDir);
            for (const file of files) {
                if (file.endsWith('.log')) {
                    fs.unlinkSync(path.join(this.logDir, file));
                }
            }
        }
        // Use simple filename: session.log (no timestamp)
        this.currentLogFile = path.join(this.logDir, `session.log`);
        // Write header
        this.appendLog(`\n${'='.repeat(80)}\n`);
        this.appendLog(`🎯 LOCAL DEV SESSION LOG\n`);
        this.appendLog(`Session: ${sessionId}\n`);
        this.appendLog(`Started: ${new Date().toISOString()}\n`);
        this.appendLog(`${'='.repeat(80)}\n\n`);
    }
    /**
     * Append a log entry (LOCAL DEV ONLY)
     */
    appendLog(message) {
        if (!this.currentLogFile)
            return;
        try {
            // Strip ANSI color codes for cleaner file logs
            const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
            fs.appendFileSync(this.currentLogFile, cleanMessage);
        }
        catch (error) {
            // Fail silently - don't break the app if logging fails
        }
    }
    /**
     * Get the current log file path
     */
    getLogFilePath() {
        return this.currentLogFile;
    }
}
exports.LocalSessionStore = LocalSessionStore;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWwtc2Vzc2lvbi1zdG9yZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvbG9jYWwtc2Vzc2lvbi1zdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLHVEQUFnRjtBQWFoRixNQUFhLGlCQUFpQjtJQUs1QixZQUFZLGFBQXFCLGlCQUFpQjtRQUYxQyxtQkFBYyxHQUFrQixJQUFJLENBQUM7UUFHM0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNwQyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNyRCxDQUFDO1FBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDaEMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNILENBQUM7SUFFTyxjQUFjLENBQUMsU0FBaUI7UUFDdEMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsR0FBRyxTQUFTLE9BQU8sQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRCxXQUFXLENBQUMsU0FBaUI7UUFDM0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ2hDLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdELE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRCxXQUFXLENBQUMsU0FBaUIsRUFBRSxPQUFxQjtRQUNsRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQztZQUNILEVBQUUsQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMzRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsWUFBWSxDQUFDLFNBQWlCO1FBQzVCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkQsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDL0IsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3QixDQUFDO0lBQ0gsQ0FBQztJQUVELFdBQVcsQ0FBQyxTQUFpQjtRQUMzQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU8sRUFBRSxDQUFDO1FBQ1osQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FDaEMsR0FBRyxDQUFDLElBQUksS0FBSyxPQUFPO1lBQ2xCLENBQUMsQ0FBQyxJQUFJLHVCQUFZLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQztZQUMvQixDQUFDLENBQUMsSUFBSSxvQkFBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FDL0IsQ0FBQztJQUNKLENBQUM7SUFFRCxVQUFVLENBQUMsU0FBaUIsRUFBRSxPQUFvQjtRQUNoRCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBRTlELE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQ3BCLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFvQjtZQUMxQyxPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUU7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVELGdCQUFnQixDQUFDLFNBQWlCO1FBQ2hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUMsT0FBTyxPQUFPLEVBQUUsYUFBYSxJQUFJLElBQUksQ0FBQztJQUN4QyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsU0FBaUIsRUFBRSxhQUFrQjtRQUN2RCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzlELE9BQU8sQ0FBQyxhQUFhLEdBQUc7WUFDdEIsR0FBRyxhQUFhO1lBQ2hCLFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUN0QyxDQUFDO1FBQ0YsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsWUFBWSxDQUFDLFNBQWlCO1FBQzVCLDhEQUE4RDtRQUM5RCxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDL0IsTUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUMsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDekIsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7b0JBQzFCLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUVELGtEQUFrRDtRQUNsRCxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQztRQUU1RCxlQUFlO1FBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxTQUFTLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksU0FBUyxJQUFJLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDekQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7T0FFRztJQUNILFNBQVMsQ0FBQyxPQUFlO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYztZQUFFLE9BQU87UUFFakMsSUFBSSxDQUFDO1lBQ0gsK0NBQStDO1lBQy9DLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDNUQsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsdURBQXVEO1FBQ3pELENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxjQUFjO1FBQ1osT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQzdCLENBQUM7Q0FDRjtBQXZJRCw4Q0F1SUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IEJhc2VNZXNzYWdlLCBIdW1hbk1lc3NhZ2UsIEFJTWVzc2FnZSB9IGZyb20gJ0BsYW5nY2hhaW4vY29yZS9tZXNzYWdlcyc7XHJcblxyXG5pbnRlcmZhY2UgTG9jYWxTZXNzaW9uIHtcclxuICBtZXNzYWdlczogQXJyYXk8eyB0eXBlOiAnaHVtYW4nIHwgJ2FpJzsgY29udGVudDogc3RyaW5nIH0+O1xyXG4gIHdvcmtmbG93U3RhdGU/OiB7XHJcbiAgICBhY3RpdmVHb2Fsczogc3RyaW5nW107XHJcbiAgICBjb21wbGV0ZWRHb2Fsczogc3RyaW5nW107XHJcbiAgICBjYXB0dXJlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICBtZXNzYWdlQ291bnQ6IG51bWJlcjtcclxuICAgIGxhc3RVcGRhdGVkOiBzdHJpbmc7XHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIExvY2FsU2Vzc2lvblN0b3JlIHtcclxuICBwcml2YXRlIHNlc3Npb25EaXI6IHN0cmluZztcclxuICBwcml2YXRlIGxvZ0Rpcjogc3RyaW5nO1xyXG4gIHByaXZhdGUgY3VycmVudExvZ0ZpbGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzZXNzaW9uRGlyOiBzdHJpbmcgPSAnLmxvY2FsLXNlc3Npb25zJykge1xyXG4gICAgdGhpcy5zZXNzaW9uRGlyID0gc2Vzc2lvbkRpcjtcclxuICAgIHRoaXMubG9nRGlyID0gcGF0aC5qb2luKHNlc3Npb25EaXIsICdsb2dzJyk7XHJcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5zZXNzaW9uRGlyKSkge1xyXG4gICAgICBmcy5ta2RpclN5bmModGhpcy5zZXNzaW9uRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuICAgIH1cclxuICAgIGlmICghZnMuZXhpc3RzU3luYyh0aGlzLmxvZ0RpcikpIHtcclxuICAgICAgZnMubWtkaXJTeW5jKHRoaXMubG9nRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0U2Vzc2lvblBhdGgoc2Vzc2lvbklkOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHBhdGguam9pbih0aGlzLnNlc3Npb25EaXIsIGAke3Nlc3Npb25JZH0uanNvbmApO1xyXG4gIH1cclxuXHJcbiAgbG9hZFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBMb2NhbFNlc3Npb24gfCBudWxsIHtcclxuICAgIGNvbnN0IHNlc3Npb25QYXRoID0gdGhpcy5nZXRTZXNzaW9uUGF0aChzZXNzaW9uSWQpO1xyXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHNlc3Npb25QYXRoKSkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBkYXRhID0gZnMucmVhZEZpbGVTeW5jKHNlc3Npb25QYXRoLCAndXRmLTgnKTtcclxuICAgICAgcmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgc2F2ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb246IExvY2FsU2Vzc2lvbik6IHZvaWQge1xyXG4gICAgY29uc3Qgc2Vzc2lvblBhdGggPSB0aGlzLmdldFNlc3Npb25QYXRoKHNlc3Npb25JZCk7XHJcbiAgICB0cnkge1xyXG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHNlc3Npb25QYXRoLCBKU09OLnN0cmluZ2lmeShzZXNzaW9uLCBudWxsLCAyKSwgJ3V0Zi04Jyk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gc2F2ZSBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjbGVhclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIGNvbnN0IHNlc3Npb25QYXRoID0gdGhpcy5nZXRTZXNzaW9uUGF0aChzZXNzaW9uSWQpO1xyXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoc2Vzc2lvblBhdGgpKSB7XHJcbiAgICAgIGZzLnVubGlua1N5bmMoc2Vzc2lvblBhdGgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0TWVzc2FnZXMoc2Vzc2lvbklkOiBzdHJpbmcpOiBCYXNlTWVzc2FnZVtdIHtcclxuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLmxvYWRTZXNzaW9uKHNlc3Npb25JZCk7XHJcbiAgICBpZiAoIXNlc3Npb24pIHtcclxuICAgICAgcmV0dXJuIFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBzZXNzaW9uLm1lc3NhZ2VzLm1hcChtc2cgPT4gXHJcbiAgICAgIG1zZy50eXBlID09PSAnaHVtYW4nIFxyXG4gICAgICAgID8gbmV3IEh1bWFuTWVzc2FnZShtc2cuY29udGVudClcclxuICAgICAgICA6IG5ldyBBSU1lc3NhZ2UobXNnLmNvbnRlbnQpXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgYWRkTWVzc2FnZShzZXNzaW9uSWQ6IHN0cmluZywgbWVzc2FnZTogQmFzZU1lc3NhZ2UpOiB2b2lkIHtcclxuICAgIGxldCBzZXNzaW9uID0gdGhpcy5sb2FkU2Vzc2lvbihzZXNzaW9uSWQpIHx8IHsgbWVzc2FnZXM6IFtdIH07XHJcbiAgICBcclxuICAgIHNlc3Npb24ubWVzc2FnZXMucHVzaCh7XHJcbiAgICAgIHR5cGU6IG1lc3NhZ2UuX2dldFR5cGUoKSBhcyAnaHVtYW4nIHwgJ2FpJyxcclxuICAgICAgY29udGVudDogbWVzc2FnZS5jb250ZW50LnRvU3RyaW5nKClcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc2F2ZVNlc3Npb24oc2Vzc2lvbklkLCBzZXNzaW9uKTtcclxuICB9XHJcblxyXG4gIGdldFdvcmtmbG93U3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcpOiBhbnkge1xyXG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMubG9hZFNlc3Npb24oc2Vzc2lvbklkKTtcclxuICAgIHJldHVybiBzZXNzaW9uPy53b3JrZmxvd1N0YXRlIHx8IG51bGw7XHJcbiAgfVxyXG5cclxuICB1cGRhdGVXb3JrZmxvd1N0YXRlKHNlc3Npb25JZDogc3RyaW5nLCB3b3JrZmxvd1N0YXRlOiBhbnkpOiB2b2lkIHtcclxuICAgIGxldCBzZXNzaW9uID0gdGhpcy5sb2FkU2Vzc2lvbihzZXNzaW9uSWQpIHx8IHsgbWVzc2FnZXM6IFtdIH07XHJcbiAgICBzZXNzaW9uLndvcmtmbG93U3RhdGUgPSB7XHJcbiAgICAgIC4uLndvcmtmbG93U3RhdGUsXHJcbiAgICAgIGxhc3RVcGRhdGVkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcclxuICAgIH07XHJcbiAgICB0aGlzLnNhdmVTZXNzaW9uKHNlc3Npb25JZCwgc2Vzc2lvbik7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdGFydCBsb2dnaW5nIHRvIGEgZmlsZSBmb3IgdGhpcyBzZXNzaW9uIChMT0NBTCBERVYgT05MWSlcclxuICAgKi9cclxuICBzdGFydExvZ2dpbmcoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIC8vIERlbGV0ZSBBTEwgcHJldmlvdXMgbG9nIGZpbGVzIGJlZm9yZSBzdGFydGluZyBhIG5ldyBzZXNzaW9uXHJcbiAgICBpZiAoZnMuZXhpc3RzU3luYyh0aGlzLmxvZ0RpcikpIHtcclxuICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyh0aGlzLmxvZ0Rpcik7XHJcbiAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgIGlmIChmaWxlLmVuZHNXaXRoKCcubG9nJykpIHtcclxuICAgICAgICAgIGZzLnVubGlua1N5bmMocGF0aC5qb2luKHRoaXMubG9nRGlyLCBmaWxlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVXNlIHNpbXBsZSBmaWxlbmFtZTogc2Vzc2lvbi5sb2cgKG5vIHRpbWVzdGFtcClcclxuICAgIHRoaXMuY3VycmVudExvZ0ZpbGUgPSBwYXRoLmpvaW4odGhpcy5sb2dEaXIsIGBzZXNzaW9uLmxvZ2ApO1xyXG4gICAgXHJcbiAgICAvLyBXcml0ZSBoZWFkZXJcclxuICAgIHRoaXMuYXBwZW5kTG9nKGBcXG4keyc9Jy5yZXBlYXQoODApfVxcbmApO1xyXG4gICAgdGhpcy5hcHBlbmRMb2coYPCfjq8gTE9DQUwgREVWIFNFU1NJT04gTE9HXFxuYCk7XHJcbiAgICB0aGlzLmFwcGVuZExvZyhgU2Vzc2lvbjogJHtzZXNzaW9uSWR9XFxuYCk7XHJcbiAgICB0aGlzLmFwcGVuZExvZyhgU3RhcnRlZDogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCl9XFxuYCk7XHJcbiAgICB0aGlzLmFwcGVuZExvZyhgJHsnPScucmVwZWF0KDgwKX1cXG5cXG5gKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEFwcGVuZCBhIGxvZyBlbnRyeSAoTE9DQUwgREVWIE9OTFkpXHJcbiAgICovXHJcbiAgYXBwZW5kTG9nKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgaWYgKCF0aGlzLmN1cnJlbnRMb2dGaWxlKSByZXR1cm47XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIFN0cmlwIEFOU0kgY29sb3IgY29kZXMgZm9yIGNsZWFuZXIgZmlsZSBsb2dzXHJcbiAgICAgIGNvbnN0IGNsZWFuTWVzc2FnZSA9IG1lc3NhZ2UucmVwbGFjZSgvXFx4MWJcXFtbMC05O10qbS9nLCAnJyk7XHJcbiAgICAgIGZzLmFwcGVuZEZpbGVTeW5jKHRoaXMuY3VycmVudExvZ0ZpbGUsIGNsZWFuTWVzc2FnZSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAvLyBGYWlsIHNpbGVudGx5IC0gZG9uJ3QgYnJlYWsgdGhlIGFwcCBpZiBsb2dnaW5nIGZhaWxzXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgdGhlIGN1cnJlbnQgbG9nIGZpbGUgcGF0aFxyXG4gICAqL1xyXG4gIGdldExvZ0ZpbGVQYXRoKCk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgcmV0dXJuIHRoaXMuY3VycmVudExvZ0ZpbGU7XHJcbiAgfVxyXG59XHJcblxyXG4iXX0=