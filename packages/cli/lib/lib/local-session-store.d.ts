import { BaseMessage } from '@langchain/core/messages';
interface LocalSession {
    messages: Array<{
        type: 'human' | 'ai';
        content: string;
    }>;
    workflowState?: {
        activeGoals: string[];
        completedGoals: string[];
        capturedData: Record<string, any>;
        messageCount: number;
        lastUpdated: string;
    };
}
export declare class LocalSessionStore {
    private sessionDir;
    private logDir;
    private currentLogFile;
    constructor(sessionDir?: string);
    private getSessionPath;
    loadSession(sessionId: string): LocalSession | null;
    saveSession(sessionId: string, session: LocalSession): void;
    clearSession(sessionId: string): void;
    getMessages(sessionId: string): BaseMessage[];
    addMessage(sessionId: string, message: BaseMessage): void;
    getWorkflowState(sessionId: string): any;
    updateWorkflowState(sessionId: string, workflowState: any): void;
    /**
     * Start logging to a file for this session (LOCAL DEV ONLY)
     */
    startLogging(sessionId: string): void;
    /**
     * Append a log entry (LOCAL DEV ONLY)
     */
    appendLog(message: string): void;
    /**
     * Get the current log file path
     */
    getLogFilePath(): string | null;
}
export {};
