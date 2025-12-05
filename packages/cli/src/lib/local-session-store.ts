import * as fs from 'fs';
import * as path from 'path';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

interface LocalSession {
  messages: Array<{ type: 'human' | 'ai'; content: string }>;
  workflowState?: {
    activeGoals: string[];
    completedGoals: string[];
    capturedData: Record<string, any>;
    messageCount: number;
    lastUpdated: string;
  };
}

export class LocalSessionStore {
  private sessionDir: string;
  private logDir: string;
  private currentLogFile: string | null = null;

  constructor(sessionDir: string = '.local-sessions') {
    this.sessionDir = sessionDir;
    this.logDir = path.join(sessionDir, 'logs');
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionDir, `${sessionId}.json`);
  }

  loadSession(sessionId: string): LocalSession | null {
    const sessionPath = this.getSessionPath(sessionId);
    if (!fs.existsSync(sessionPath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  saveSession(sessionId: string, session: LocalSession): void {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save session ${sessionId}:`, error);
    }
  }

  clearSession(sessionId: string): void {
    const sessionPath = this.getSessionPath(sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  }

  getMessages(sessionId: string): BaseMessage[] {
    const session = this.loadSession(sessionId);
    if (!session) {
      return [];
    }

    return session.messages.map(msg => 
      msg.type === 'human' 
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content)
    );
  }

  addMessage(sessionId: string, message: BaseMessage): void {
    let session = this.loadSession(sessionId) || { messages: [] };
    
    session.messages.push({
      type: message._getType() as 'human' | 'ai',
      content: message.content.toString()
    });

    this.saveSession(sessionId, session);
  }

  getWorkflowState(sessionId: string): any {
    const session = this.loadSession(sessionId);
    return session?.workflowState || null;
  }

  updateWorkflowState(sessionId: string, workflowState: any): void {
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
  startLogging(sessionId: string): void {
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
  appendLog(message: string): void {
    if (!this.currentLogFile) return;
    
    try {
      // Strip ANSI color codes for cleaner file logs
      const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
      fs.appendFileSync(this.currentLogFile, cleanMessage);
    } catch (error) {
      // Fail silently - don't break the app if logging fails
    }
  }

  /**
   * Get the current log file path
   */
  getLogFilePath(): string | null {
    return this.currentLogFile;
  }
}

