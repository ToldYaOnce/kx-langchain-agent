/**
 * @fileoverview
 * Agent Workflow State Service
 *
 * Manages persistent workflow state at the channel level, tracking:
 * - Which data fields have been captured
 * - Which goals have been completed
 * - Message count and conversation state
 *
 * This enables:
 * - Persistent state across Lambda cold starts
 * - No repeated questions
 * - Event emission logic based on completion state
 * - Multi-session conversations
 *
 * **ARCHITECTURE NOTE:**
 * This service uses the agent-owned `KxGen-agent-workflow-state` table
 * instead of writing to the `KxGen-channels-v2` table (owned by kx-notifications-messaging).
 * This eliminates cross-package dependencies and follows bounded context principles.
 */
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ChannelWorkflowState, LanguageProfile } from '../types/dynamodb-schemas.js';
/**
 * Service for managing agent workflow state
 */
export declare class ChannelStateService {
    private client;
    private workflowStateTable;
    private createdAt;
    constructor(client: DynamoDBDocumentClient, workflowStateTable: string);
    /**
     * Load workflow state for a channel
     * Returns default state if channel doesn't exist or has no workflow state
     */
    loadWorkflowState(channelId: string, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Save workflow state for a channel
     * Uses PutCommand to create/update the workflow state record
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
     * Used when a response is interrupted and needs to be discarded
     *
     * @param channelId - Channel identifier
     * @param snapshot - State snapshot to restore
     * @param tenantId - Tenant identifier
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
     * Clear a specific field's data (for error recovery)
     */
    clearFieldData(channelId: string, fieldName: string, tenantId: string): Promise<void>;
    /**
     * Mark a goal as incomplete (for error recovery)
     */
    markGoalIncomplete(channelId: string, goalId: string, tenantId: string): Promise<void>;
    /**
     * Get default workflow state
     */
    /**
     * Update the last processed message ID (for interruption detection)
     */
    updateLastProcessedMessageId(channelId: string, messageId: string, tenantId?: string): Promise<void>;
    /**
     * Update conversation aggregates with new message analysis data
     * Uses rolling averages to track engagement over time
     * Also maintains per-message history for trend analysis
     */
    updateConversationAggregates(channelId: string, messageAnalysis: {
        messageText: string;
        interestLevel: number;
        conversionLikelihood: number;
        emotionalTone: string;
        languageProfile: LanguageProfile;
        primaryIntent?: string;
    }, tenantId?: string): Promise<ChannelWorkflowState>;
    /**
     * Get default conversation aggregates
     */
    private getDefaultAggregates;
    private getDefaultWorkflowState;
}
