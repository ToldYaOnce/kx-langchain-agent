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

import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { ChannelWorkflowState, ConversationAggregates, LanguageProfile, MessageAnalysis } from '../types/dynamodb-schemas.js';

/**
 * Workflow state record in DynamoDB
 */
interface WorkflowStateRecord {
  channelId: string;
  createdAt: string;
  tenantId: string;
  workflowState: ChannelWorkflowState;
  updated_at: string;
  // GSI attributes for querying
  GSI1PK?: string; // tenantId
  GSI1SK?: string; // lastUpdated
  GSI2PK?: string; // tenantId#goalId
  GSI2SK?: string; // messageCount
}

/**
 * Service for managing agent workflow state
 */
export class ChannelStateService {
  private client: DynamoDBDocumentClient;
  private workflowStateTable: string;
  private createdAt: string; // Store createdAt for this channel (set on first load/save)

  constructor(client: DynamoDBDocumentClient, workflowStateTable: string) {
    this.client = client;
    this.workflowStateTable = workflowStateTable;
    this.createdAt = 'STATE'; // Fixed sort key for workflow state records
  }

  /**
   * Load workflow state for a channel
   * Returns default state if channel doesn't exist or has no workflow state
   */
  async loadWorkflowState(channelId: string, tenantId?: string): Promise<ChannelWorkflowState> {
    console.log(`📊 Loading workflow state for channel: ${channelId}`);
    
    try {
      // Simple GetItem since we own this table
      const result = await this.client.send(new GetCommand({
        TableName: this.workflowStateTable,
        Key: {
          channelId,
          createdAt: this.createdAt
        }
      }));

      if (result.Item) {
        const record = result.Item as WorkflowStateRecord;
        
        if (record.workflowState) {
          console.log(`✅ Loaded existing workflow state`);
          console.log(`   Message count: ${record.workflowState.messageCount}`);
          console.log(`   Captured data: ${JSON.stringify(record.workflowState.capturedData)}`);
          console.log(`   Active goals: ${record.workflowState.activeGoals.join(', ') || 'none'}`);
          console.log(`   Completed goals: ${record.workflowState.completedGoals.join(', ') || 'none'}`);
          return record.workflowState;
        }
      }

      console.log(`📝 No existing workflow state, returning default`);
      return this.getDefaultWorkflowState();
      
    } catch (error) {
      console.error(`❌ Error loading workflow state for ${channelId}:`, error);
      return this.getDefaultWorkflowState();
    }
  }

  /**
   * Save workflow state for a channel
   * Uses PutCommand to create/update the workflow state record
   */
  async saveWorkflowState(
    channelId: string,
    state: ChannelWorkflowState,
    tenantId?: string
  ): Promise<void> {
    console.log(`💾 Saving workflow state for channel: ${channelId}`);
    console.log(`   State: ${JSON.stringify(state, null, 2)}`);
    
    try {
      const now = new Date().toISOString();
      
      // Build the record
      const record: WorkflowStateRecord = {
        channelId,
        createdAt: this.createdAt,
        tenantId: tenantId || 'unknown',
        workflowState: state,
        updated_at: now,
      };

      // Add GSI attributes for querying
      if (tenantId) {
        record.GSI1PK = tenantId;
        record.GSI1SK = state.lastUpdated;
        
        // GSI2 for active goal queries
        if (state.activeGoals.length > 0) {
          record.GSI2PK = `${tenantId}#${state.activeGoals[0]}`;
          record.GSI2SK = state.messageCount.toString().padStart(6, '0');
        }
      }

      await this.client.send(new PutCommand({
        TableName: this.workflowStateTable,
        Item: record
      }));

      console.log(`✅ Workflow state saved successfully`);
    } catch (error) {
      console.error(`❌ Error saving workflow state for ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Update specific fields in the workflow state (partial update)
   */
  async updateWorkflowState(
    channelId: string,
    updates: Partial<ChannelWorkflowState>,
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`🔄 Updating workflow state for channel: ${channelId}`);
    console.log(`   Updates: ${JSON.stringify(updates, null, 2)}`);
    
    // Load current state
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    // Merge updates
    const newState: ChannelWorkflowState = {
      ...currentState,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    // Save merged state
    await this.saveWorkflowState(channelId, newState, tenantId);
    
    return newState;
  }

  /**
   * Mark a data field as captured
   */
  async markFieldCaptured(
    channelId: string,
    fieldName: string,
    fieldValue: any,
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`✔️ Marking field captured: ${fieldName} = ${fieldValue}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    const updates: Partial<ChannelWorkflowState> = {
      capturedData: {
        ...currentState.capturedData,
        [fieldName]: fieldValue
      }
    };

    // Update tracking flags for standard contact fields
    if (fieldName === 'email') {
      updates.isEmailCaptured = true;
    } else if (fieldName === 'phone') {
      updates.isPhoneCaptured = true;
    } else if (fieldName === 'firstName') {
      updates.isFirstNameCaptured = true;
    } else if (fieldName === 'lastName') {
      updates.isLastNameCaptured = true;
    }

    return this.updateWorkflowState(channelId, updates, tenantId);
  }

  /**
   * Mark a goal as completed
   */
  async markGoalCompleted(
    channelId: string,
    goalId: string,
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`🎯 Marking goal completed: ${goalId}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    // Don't add duplicates
    if (currentState.completedGoals.includes(goalId)) {
      console.log(`   Goal ${goalId} already completed`);
      return currentState;
    }
    
    return this.updateWorkflowState(channelId, {
      completedGoals: [...currentState.completedGoals, goalId],
      activeGoals: currentState.activeGoals.filter(id => id !== goalId)
    }, tenantId);
  }

  /**
   * Set active goals
   */
  async setActiveGoals(
    channelId: string,
    goalIds: string[],
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`🎯 Setting active goals: ${goalIds.join(', ')}`);
    
    return this.updateWorkflowState(channelId, {
      activeGoals: goalIds
    }, tenantId);
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(channelId: string, tenantId?: string): Promise<ChannelWorkflowState> {
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    return this.updateWorkflowState(channelId, {
      messageCount: currentState.messageCount + 1
    }, tenantId);
  }

  /**
   * Record that an event was emitted (prevent duplicate events)
   */
  async recordEventEmitted(
    channelId: string,
    eventName: string,
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`📤 Recording event emitted: ${eventName}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    // Don't add duplicates
    if (currentState.emittedEvents.includes(eventName)) {
      console.log(`   Event ${eventName} already emitted`);
      return currentState;
    }
    
    return this.updateWorkflowState(channelId, {
      emittedEvents: [...currentState.emittedEvents, eventName]
    }, tenantId);
  }

  /**
   * Rollback workflow state to a previous snapshot
   * Used when a response is interrupted and needs to be discarded
   * 
   * @param channelId - Channel identifier
   * @param snapshot - State snapshot to restore
   * @param tenantId - Tenant identifier
   */
  async rollbackState(
    channelId: string,
    snapshot: {
      attemptCounts: Record<string, number>;
      capturedData: Record<string, any>;
      activeGoals: string[];
      completedGoals: string[];
      messageCount: number;
    },
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`⏪ Rolling back workflow state for channel: ${channelId}`);
    console.log(`   Snapshot: ${JSON.stringify(snapshot, null, 2)}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    // Restore the snapshot fields
    const rolledBackState: ChannelWorkflowState = {
      ...currentState,
      capturedData: snapshot.capturedData,
      activeGoals: snapshot.activeGoals,
      completedGoals: snapshot.completedGoals,
      messageCount: snapshot.messageCount,
      lastUpdated: new Date().toISOString()
    };
    
    // Note: attemptCounts is tracked in GoalOrchestrator, not ChannelWorkflowState
    // The orchestrator will use the snapshot data directly
    
    await this.saveWorkflowState(channelId, rolledBackState, tenantId);
    
    console.log(`✅ Workflow state rolled back successfully`);
    return rolledBackState;
  }

  /**
   * Check if all required contact info has been captured
   */
  isContactInfoComplete(state: ChannelWorkflowState): boolean {
    return (
      state.isEmailCaptured &&
      state.isPhoneCaptured &&
      state.isFirstNameCaptured
    );
  }

  /**
   * Check if an event has already been emitted
   */
  hasEventBeenEmitted(state: ChannelWorkflowState, eventName: string): boolean {
    return state.emittedEvents.includes(eventName);
  }

  /**
   * Clear a specific field's data (for error recovery)
   */
  async clearFieldData(channelId: string, fieldName: string, tenantId: string): Promise<void> {
    const state = await this.loadWorkflowState(channelId, tenantId);
    
    // Remove from capturedData
    delete state.capturedData[fieldName];
    
    // Update legacy flags
    if (fieldName === 'email') {
      state.isEmailCaptured = false;
    } else if (fieldName === 'phone') {
      state.isPhoneCaptured = false;
    } else if (fieldName === 'firstName') {
      state.isFirstNameCaptured = false;
    } else if (fieldName === 'lastName') {
      state.isLastNameCaptured = false;
    }
    
    await this.saveWorkflowState(channelId, state, tenantId);
  }

  /**
   * Mark a goal as incomplete (for error recovery)
   */
  async markGoalIncomplete(channelId: string, goalId: string, tenantId: string): Promise<void> {
    const state = await this.loadWorkflowState(channelId, tenantId);
    
    // Remove from completedGoals
    state.completedGoals = state.completedGoals.filter(id => id !== goalId);
    
    // Add to activeGoals if not already there
    if (!state.activeGoals.includes(goalId)) {
      state.activeGoals.push(goalId);
    }
    
    await this.saveWorkflowState(channelId, state, tenantId);
  }

  /**
   * Get default workflow state
   */
  /**
   * Update the last processed message ID (for interruption detection)
   */
  async updateLastProcessedMessageId(channelId: string, messageId: string, tenantId?: string): Promise<void> {
    console.log(`🔄 Updating lastProcessedMessageId for channel ${channelId} to: ${messageId}`);
    
    try {
      await this.client.send(new UpdateCommand({
        TableName: this.workflowStateTable,
        Key: {
          channelId,
          createdAt: this.createdAt
        },
        UpdateExpression: 'SET lastProcessedMessageId = :messageId, updated_at = :now',
        ExpressionAttributeValues: {
          ':messageId': messageId,
          ':now': new Date().toISOString()
        }
      }));
      
      console.log(`✅ Updated lastProcessedMessageId to ${messageId}`);
    } catch (error) {
      console.error(`❌ Error updating lastProcessedMessageId:`, error);
      throw error;
    }
  }

  /**
   * Update conversation aggregates with new message analysis data
   * Uses rolling averages to track engagement over time
   * Also maintains per-message history for trend analysis
   */
  async updateConversationAggregates(
    channelId: string,
    messageAnalysis: {
      messageText: string;         // The user's message text (for matching)
      interestLevel: number;       // 1-5
      conversionLikelihood: number; // 0-1
      emotionalTone: string;       // "positive", "neutral", etc.
      languageProfile: LanguageProfile;
      primaryIntent?: string;      // Optional: what the user was trying to do
    },
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`📊 Updating conversation aggregates for channel: ${channelId}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    const current = currentState.conversationAggregates || this.getDefaultAggregates();
    const count = current.messageAnalysisCount;
    
    // Calculate rolling averages
    const newCount = count + 1;
    const newAvgInterest = ((current.avgInterestLevel * count) + messageAnalysis.interestLevel) / newCount;
    const newAvgConversion = ((current.avgConversionLikelihood * count) + messageAnalysis.conversionLikelihood) / newCount;
    
    // Calculate engagement score (weighted combination)
    const engagementScore = (newAvgInterest / 5) * 0.4 + newAvgConversion * 0.4 + 
      (messageAnalysis.emotionalTone === 'positive' ? 0.2 : 
       messageAnalysis.emotionalTone === 'negative' || messageAnalysis.emotionalTone === 'frustrated' ? 0 : 0.1);
    
    // Update language profile with rolling averages
    const newLanguageProfile: LanguageProfile = {
      formality: ((current.languageProfile.formality * count) + messageAnalysis.languageProfile.formality) / newCount,
      hypeTolerance: ((current.languageProfile.hypeTolerance * count) + messageAnalysis.languageProfile.hypeTolerance) / newCount,
      emojiUsage: ((current.languageProfile.emojiUsage * count) + messageAnalysis.languageProfile.emojiUsage) / newCount,
      language: messageAnalysis.languageProfile.language // Use most recent language
    };
    
    // Update emotional tone frequency map
    const toneFrequency = { ...(current.emotionalToneFrequency || {}) };
    const tone = messageAnalysis.emotionalTone || 'neutral';
    toneFrequency[tone] = (toneFrequency[tone] || 0) + 1;
    
    // Find dominant tone from frequency map
    const dominantTone = Object.entries(toneFrequency)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
    
    // Add to message history (capped at 50 messages to prevent unbounded growth)
    const MAX_HISTORY = 50;
    const messageHistory = [...(current.messageHistory || [])];
    const newMessageEntry: MessageAnalysis = {
      messageIndex: newCount,
      timestamp: new Date().toISOString(),
      messageText: messageAnalysis.messageText, // Store the message text for matching
      interestLevel: messageAnalysis.interestLevel,
      conversionLikelihood: messageAnalysis.conversionLikelihood,
      emotionalTone: messageAnalysis.emotionalTone,
      languageProfile: { ...messageAnalysis.languageProfile },
      primaryIntent: messageAnalysis.primaryIntent || 'unknown'
    };
    messageHistory.push(newMessageEntry);
    
    // Cap history at MAX_HISTORY (keep most recent)
    if (messageHistory.length > MAX_HISTORY) {
      messageHistory.splice(0, messageHistory.length - MAX_HISTORY);
    }
    
    const newAggregates: ConversationAggregates = {
      engagementScore: Math.min(1, Math.max(0, engagementScore)),
      avgInterestLevel: Math.round(newAvgInterest * 10) / 10, // 1 decimal place
      avgConversionLikelihood: Math.round(newAvgConversion * 100) / 100, // 2 decimal places
      dominantEmotionalTone: dominantTone,
      languageProfile: {
        formality: Math.round(newLanguageProfile.formality * 10) / 10,
        hypeTolerance: Math.round(newLanguageProfile.hypeTolerance * 10) / 10,
        emojiUsage: Math.round(newLanguageProfile.emojiUsage * 10) / 10,
        language: newLanguageProfile.language
      },
      messageAnalysisCount: newCount,
      messageHistory,
      emotionalToneFrequency: toneFrequency
    };
    
    console.log(`   New aggregates: engagement=${newAggregates.engagementScore.toFixed(2)}, interest=${newAggregates.avgInterestLevel}, conversion=${newAggregates.avgConversionLikelihood}`);
    console.log(`   Message history: ${messageHistory.length} entries, dominant tone: ${dominantTone}`);
    
    return this.updateWorkflowState(channelId, {
      conversationAggregates: newAggregates
    }, tenantId);
  }

  /**
   * Get default conversation aggregates
   */
  private getDefaultAggregates(): ConversationAggregates {
    return {
      engagementScore: 0.5,
      avgInterestLevel: 3,
      avgConversionLikelihood: 0.5,
      dominantEmotionalTone: 'neutral',
      languageProfile: {
        formality: 3,
        hypeTolerance: 3,
        emojiUsage: 0,
        language: 'en'
      },
      messageAnalysisCount: 0
    };
  }

  private getDefaultWorkflowState(): ChannelWorkflowState {
    return {
      isEmailCaptured: false,
      isPhoneCaptured: false,
      isFirstNameCaptured: false,
      isLastNameCaptured: false,
      capturedData: {},
      completedGoals: [],
      activeGoals: [],
      currentGoalOrder: 0,
      fastTrackGoals: [], // Fast-track mode: ordered list of prerequisite + primary goals
      messageCount: 0,
      lastProcessedMessageId: undefined,
      lastUpdated: new Date().toISOString(),
      emittedEvents: [],
      conversationAggregates: this.getDefaultAggregates()
    };
  }
}

