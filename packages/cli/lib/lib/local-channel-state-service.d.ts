/**
 * @fileoverview
 * Local Channel State Service for CLI Development
 *
 * Implements the same interface as ChannelStateService but uses LocalSessionStore
 * instead of DynamoDB, allowing local testing of goal workflows without AWS.
 */
import type { ChannelWorkflowState } from '@toldyaonce/kx-langchain-agent-runtime';
import { LocalSessionStore } from './local-session-store.js';
/**
 * Local implementation of ChannelStateService for CLI development
 */
export declare class LocalChannelStateService {
    private sessionStore;
    private sessionId;
    constructor(sessionStore: LocalSessionStore, sessionId: string);
    /**
     * Load workflow state for a channel
     */
    loadWorkflowState(channelId: string, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Save workflow state for a channel
     */
    saveWorkflowState(channelId: string, state: ChannelWorkflowState, tenantId?: string): Promise<void>;
    /**
     * Update specific fields in the workflow state (partial update)
     */
    updateWorkflowState(channelId: string, updates: Partial<ChannelWorkflowState>, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Mark a data field as captured
     */
    markFieldCaptured(channelId: string, fieldName: string, fieldValue: any, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Mark a goal as completed
     */
    markGoalCompleted(channelId: string, goalId: string, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Set active goals
     */
    setActiveGoals(channelId: string, goalIds: string[], tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Increment message count
     */
    incrementMessageCount(channelId: string, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Record that an event was emitted (prevent duplicate events)
     */
    recordEventEmitted(channelId: string, eventName: string, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Rollback workflow state to a previous snapshot
     */
    rollbackState(channelId: string, snapshot: {
        attemptCounts: Record<string, number>;
        capturedData: Record<string, any>;
        activeGoals: string[];
        completedGoals: string[];
        messageCount: number;
    }, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Check if all required contact info has been captured
     */
    isContactInfoComplete(state: ChannelWorkflowState): boolean;
    /**
     * Check if an event has already been emitted
     */
    hasEventBeenEmitted(state: ChannelWorkflowState, eventName: string): boolean;
    /**
     * Get default workflow state
     */
    private getDefaultWorkflowState;
}
