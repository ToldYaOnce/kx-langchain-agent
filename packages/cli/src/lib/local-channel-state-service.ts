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
export class LocalChannelStateService {
  private sessionStore: LocalSessionStore;
  private sessionId: string;

  constructor(sessionStore: LocalSessionStore, sessionId: string) {
    this.sessionStore = sessionStore;
    this.sessionId = sessionId;
  }

  /**
   * Load workflow state for a channel
   */
  async loadWorkflowState(channelId: string, tenantId?: string): Promise<ChannelWorkflowState> {
    console.log(`📊 [LOCAL] Loading workflow state for session: ${this.sessionId}`);
    
    const state = this.sessionStore.getWorkflowState(this.sessionId);
    
    if (state) {
      console.log(`✅ [LOCAL] Loaded existing workflow state`);
      console.log(`   Message count: ${state.messageCount}`);
      console.log(`   Captured data: ${JSON.stringify(state.capturedData)}`);
      console.log(`   Active goals: ${state.activeGoals.join(', ') || 'none'}`);
      console.log(`   Completed goals: ${state.completedGoals.join(', ') || 'none'}`);
      return state;
    }

    console.log(`📝 [LOCAL] No existing workflow state, returning default`);
    return this.getDefaultWorkflowState();
  }

  /**
   * Save workflow state for a channel
   */
  async saveWorkflowState(
    channelId: string,
    state: ChannelWorkflowState,
    tenantId?: string
  ): Promise<void> {
    console.log(`💾 [LOCAL] Saving workflow state for session: ${this.sessionId}`);
    console.log(`   Captured data: ${JSON.stringify(state.capturedData)}`);
    console.log(`   Active goals: ${state.activeGoals.join(', ')}`);
    console.log(`   Completed goals: ${state.completedGoals.join(', ')}`);
    
    this.sessionStore.updateWorkflowState(this.sessionId, state);
    console.log(`✅ [LOCAL] Workflow state saved to file`);
  }

  /**
   * Update specific fields in the workflow state (partial update)
   */
  async updateWorkflowState(
    channelId: string,
    updates: Partial<ChannelWorkflowState>,
    tenantId?: string
  ): Promise<ChannelWorkflowState> {
    console.log(`🔄 [LOCAL] Updating workflow state for session: ${this.sessionId}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    const newState: ChannelWorkflowState = {
      ...currentState,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
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
    console.log(`✔️ [LOCAL] Marking field captured: ${fieldName} = ${fieldValue}`);
    
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
    console.log(`🎯 [LOCAL] Marking goal completed: ${goalId}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
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
    console.log(`🎯 [LOCAL] Setting active goals: ${goalIds.join(', ')}`);
    
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
    console.log(`📤 [LOCAL] Recording event emitted: ${eventName}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
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
    console.log(`⏪ [LOCAL] Rolling back workflow state for session: ${this.sessionId}`);
    
    const currentState = await this.loadWorkflowState(channelId, tenantId);
    
    const rolledBackState: ChannelWorkflowState = {
      ...currentState,
      capturedData: snapshot.capturedData,
      activeGoals: snapshot.activeGoals,
      completedGoals: snapshot.completedGoals,
      messageCount: snapshot.messageCount,
      lastUpdated: new Date().toISOString()
    };
    
    await this.saveWorkflowState(channelId, rolledBackState, tenantId);
    
    console.log(`✅ [LOCAL] Workflow state rolled back successfully`);
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
   * Get default workflow state
   */
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
      messageCount: 0,
      lastUpdated: new Date().toISOString(),
      emittedEvents: []
    };
  }
}

