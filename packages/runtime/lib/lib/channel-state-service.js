"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelStateService = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
/**
 * Service for managing agent workflow state
 */
class ChannelStateService {
    constructor(client, workflowStateTable) {
        this.client = client;
        this.workflowStateTable = workflowStateTable;
        this.createdAt = 'STATE'; // Fixed sort key for workflow state records
    }
    /**
     * Load workflow state for a channel
     * Returns default state if channel doesn't exist or has no workflow state
     */
    async loadWorkflowState(channelId, tenantId) {
        console.log(`📊 Loading workflow state for channel: ${channelId}`);
        try {
            // Simple GetItem since we own this table
            const result = await this.client.send(new lib_dynamodb_1.GetCommand({
                TableName: this.workflowStateTable,
                Key: {
                    channelId,
                    createdAt: this.createdAt
                }
            }));
            if (result.Item) {
                const record = result.Item;
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
        }
        catch (error) {
            console.error(`❌ Error loading workflow state for ${channelId}:`, error);
            return this.getDefaultWorkflowState();
        }
    }
    /**
     * Save workflow state for a channel
     * Uses PutCommand to create/update the workflow state record
     */
    async saveWorkflowState(channelId, state, tenantId) {
        console.log(`💾 Saving workflow state for channel: ${channelId}`);
        console.log(`   State: ${JSON.stringify(state, null, 2)}`);
        try {
            const now = new Date().toISOString();
            // Build the record
            const record = {
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
            await this.client.send(new lib_dynamodb_1.PutCommand({
                TableName: this.workflowStateTable,
                Item: record
            }));
            console.log(`✅ Workflow state saved successfully`);
        }
        catch (error) {
            console.error(`❌ Error saving workflow state for ${channelId}:`, error);
            throw error;
        }
    }
    /**
     * Update specific fields in the workflow state (partial update)
     */
    async updateWorkflowState(channelId, updates, tenantId) {
        console.log(`🔄 Updating workflow state for channel: ${channelId}`);
        console.log(`   Updates: ${JSON.stringify(updates, null, 2)}`);
        // Load current state
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        // Merge updates
        const newState = {
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
    async markFieldCaptured(channelId, fieldName, fieldValue, tenantId) {
        console.log(`✔️ Marking field captured: ${fieldName} = ${fieldValue}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        const updates = {
            capturedData: {
                ...currentState.capturedData,
                [fieldName]: fieldValue
            }
        };
        // Update tracking flags for standard contact fields
        if (fieldName === 'email') {
            updates.isEmailCaptured = true;
        }
        else if (fieldName === 'phone') {
            updates.isPhoneCaptured = true;
        }
        else if (fieldName === 'firstName') {
            updates.isFirstNameCaptured = true;
        }
        else if (fieldName === 'lastName') {
            updates.isLastNameCaptured = true;
        }
        return this.updateWorkflowState(channelId, updates, tenantId);
    }
    /**
     * Mark a goal as completed
     */
    async markGoalCompleted(channelId, goalId, tenantId) {
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
    async setActiveGoals(channelId, goalIds, tenantId) {
        console.log(`🎯 Setting active goals: ${goalIds.join(', ')}`);
        return this.updateWorkflowState(channelId, {
            activeGoals: goalIds
        }, tenantId);
    }
    /**
     * Increment message count
     */
    async incrementMessageCount(channelId, tenantId) {
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        return this.updateWorkflowState(channelId, {
            messageCount: currentState.messageCount + 1
        }, tenantId);
    }
    /**
     * Record that an event was emitted (prevent duplicate events)
     */
    async recordEventEmitted(channelId, eventName, tenantId) {
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
    async rollbackState(channelId, snapshot, tenantId) {
        console.log(`⏪ Rolling back workflow state for channel: ${channelId}`);
        console.log(`   Snapshot: ${JSON.stringify(snapshot, null, 2)}`);
        const currentState = await this.loadWorkflowState(channelId, tenantId);
        // Restore the snapshot fields
        const rolledBackState = {
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
    isContactInfoComplete(state) {
        return (state.isEmailCaptured &&
            state.isPhoneCaptured &&
            state.isFirstNameCaptured);
    }
    /**
     * Check if an event has already been emitted
     */
    hasEventBeenEmitted(state, eventName) {
        return state.emittedEvents.includes(eventName);
    }
    /**
     * Clear a specific field's data (for error recovery)
     */
    async clearFieldData(channelId, fieldName, tenantId) {
        const state = await this.loadWorkflowState(channelId, tenantId);
        // Remove from capturedData
        delete state.capturedData[fieldName];
        // Update legacy flags
        if (fieldName === 'email') {
            state.isEmailCaptured = false;
        }
        else if (fieldName === 'phone') {
            state.isPhoneCaptured = false;
        }
        else if (fieldName === 'firstName') {
            state.isFirstNameCaptured = false;
        }
        else if (fieldName === 'lastName') {
            state.isLastNameCaptured = false;
        }
        await this.saveWorkflowState(channelId, state, tenantId);
    }
    /**
     * Mark a goal as incomplete (for error recovery)
     */
    async markGoalIncomplete(channelId, goalId, tenantId) {
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
    async updateLastProcessedMessageId(channelId, messageId, tenantId) {
        console.log(`🔄 Updating lastProcessedMessageId for channel ${channelId} to: ${messageId}`);
        try {
            await this.client.send(new lib_dynamodb_1.UpdateCommand({
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
        }
        catch (error) {
            console.error(`❌ Error updating lastProcessedMessageId:`, error);
            throw error;
        }
    }
    /**
     * Update conversation aggregates with new message analysis data
     * Uses rolling averages to track engagement over time
     * Also maintains per-message history for trend analysis
     */
    async updateConversationAggregates(channelId, messageAnalysis, tenantId) {
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
        const newLanguageProfile = {
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
        const newMessageEntry = {
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
        const newAggregates = {
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
    getDefaultAggregates() {
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
    getDefaultWorkflowState() {
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
exports.ChannelStateService = ChannelStateService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbm5lbC1zdGF0ZS1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9jaGFubmVsLXN0YXRlLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUJHOzs7QUFFSCx3REFBc0c7QUFtQnRHOztHQUVHO0FBQ0gsTUFBYSxtQkFBbUI7SUFLOUIsWUFBWSxNQUE4QixFQUFFLGtCQUEwQjtRQUNwRSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsa0JBQWtCLEdBQUcsa0JBQWtCLENBQUM7UUFDN0MsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLENBQUMsQ0FBQyw0Q0FBNEM7SUFDeEUsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxTQUFpQixFQUFFLFFBQWlCO1FBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFbkUsSUFBSSxDQUFDO1lBQ0gseUNBQXlDO1lBQ3pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSx5QkFBVSxDQUFDO2dCQUNuRCxTQUFTLEVBQUUsSUFBSSxDQUFDLGtCQUFrQjtnQkFDbEMsR0FBRyxFQUFFO29CQUNILFNBQVM7b0JBQ1QsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO2lCQUMxQjthQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUosSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUEyQixDQUFDO2dCQUVsRCxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO29CQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixN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QkFDaEIsVUFBVSxFQUFFLENBQUM7Z0JBQ2IsUUFBUSxFQUFFLElBQUk7YUFDZjtZQUNELG9CQUFvQixFQUFFLENBQUM7U0FDeEIsQ0FBQztJQUNKLENBQUM7SUFFTyx1QkFBdUI7UUFDN0IsT0FBTztZQUNMLGVBQWUsRUFBRSxLQUFLO1lBQ3RCLGVBQWUsRUFBRSxLQUFLO1lBQ3RCLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIsa0JBQWtCLEVBQUUsS0FBSztZQUN6QixZQUFZLEVBQUUsRUFBRTtZQUNoQixjQUFjLEVBQUUsRUFBRTtZQUNsQixXQUFXLEVBQUUsRUFBRTtZQUNmLGdCQUFnQixFQUFFLENBQUM7WUFDbkIsY0FBYyxFQUFFLEVBQUUsRUFBRSxnRUFBZ0U7WUFDcEYsWUFBWSxFQUFFLENBQUM7WUFDZixzQkFBc0IsRUFBRSxTQUFTO1lBQ2pDLFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNyQyxhQUFhLEVBQUUsRUFBRTtZQUNqQixzQkFBc0IsRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUU7U0FDcEQsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTllRCxrREE4ZUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBmaWxlb3ZlcnZpZXdcbiAqIEFnZW50IFdvcmtmbG93IFN0YXRlIFNlcnZpY2VcbiAqIFxuICogTWFuYWdlcyBwZXJzaXN0ZW50IHdvcmtmbG93IHN0YXRlIGF0IHRoZSBjaGFubmVsIGxldmVsLCB0cmFja2luZzpcbiAqIC0gV2hpY2ggZGF0YSBmaWVsZHMgaGF2ZSBiZWVuIGNhcHR1cmVkXG4gKiAtIFdoaWNoIGdvYWxzIGhhdmUgYmVlbiBjb21wbGV0ZWRcbiAqIC0gTWVzc2FnZSBjb3VudCBhbmQgY29udmVyc2F0aW9uIHN0YXRlXG4gKiBcbiAqIFRoaXMgZW5hYmxlczpcbiAqIC0gUGVyc2lzdGVudCBzdGF0ZSBhY3Jvc3MgTGFtYmRhIGNvbGQgc3RhcnRzXG4gKiAtIE5vIHJlcGVhdGVkIHF1ZXN0aW9uc1xuICogLSBFdmVudCBlbWlzc2lvbiBsb2dpYyBiYXNlZCBvbiBjb21wbGV0aW9uIHN0YXRlXG4gKiAtIE11bHRpLXNlc3Npb24gY29udmVyc2F0aW9uc1xuICogXG4gKiAqKkFSQ0hJVEVDVFVSRSBOT1RFOioqXG4gKiBUaGlzIHNlcnZpY2UgdXNlcyB0aGUgYWdlbnQtb3duZWQgYEt4R2VuLWFnZW50LXdvcmtmbG93LXN0YXRlYCB0YWJsZVxuICogaW5zdGVhZCBvZiB3cml0aW5nIHRvIHRoZSBgS3hHZW4tY2hhbm5lbHMtdjJgIHRhYmxlIChvd25lZCBieSBreC1ub3RpZmljYXRpb25zLW1lc3NhZ2luZykuXG4gKiBUaGlzIGVsaW1pbmF0ZXMgY3Jvc3MtcGFja2FnZSBkZXBlbmRlbmNpZXMgYW5kIGZvbGxvd3MgYm91bmRlZCBjb250ZXh0IHByaW5jaXBsZXMuXG4gKi9cblxuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCwgUHV0Q29tbWFuZCwgVXBkYXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgdHlwZSB7IENoYW5uZWxXb3JrZmxvd1N0YXRlLCBDb252ZXJzYXRpb25BZ2dyZWdhdGVzLCBMYW5ndWFnZVByb2ZpbGUsIE1lc3NhZ2VBbmFseXNpcyB9IGZyb20gJy4uL3R5cGVzL2R5bmFtb2RiLXNjaGVtYXMuanMnO1xuXG4vKipcbiAqIFdvcmtmbG93IHN0YXRlIHJlY29yZCBpbiBEeW5hbW9EQlxuICovXG5pbnRlcmZhY2UgV29ya2Zsb3dTdGF0ZVJlY29yZCB7XG4gIGNoYW5uZWxJZDogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IHN0cmluZztcbiAgdGVuYW50SWQ6IHN0cmluZztcbiAgd29ya2Zsb3dTdGF0ZTogQ2hhbm5lbFdvcmtmbG93U3RhdGU7XG4gIHVwZGF0ZWRfYXQ6IHN0cmluZztcbiAgLy8gR1NJIGF0dHJpYnV0ZXMgZm9yIHF1ZXJ5aW5nXG4gIEdTSTFQSz86IHN0cmluZzsgLy8gdGVuYW50SWRcbiAgR1NJMVNLPzogc3RyaW5nOyAvLyBsYXN0VXBkYXRlZFxuICBHU0kyUEs/OiBzdHJpbmc7IC8vIHRlbmFudElkI2dvYWxJZFxuICBHU0kyU0s/OiBzdHJpbmc7IC8vIG1lc3NhZ2VDb3VudFxufVxuXG4vKipcbiAqIFNlcnZpY2UgZm9yIG1hbmFnaW5nIGFnZW50IHdvcmtmbG93IHN0YXRlXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGFubmVsU3RhdGVTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBjbGllbnQ6IER5bmFtb0RCRG9jdW1lbnRDbGllbnQ7XG4gIHByaXZhdGUgd29ya2Zsb3dTdGF0ZVRhYmxlOiBzdHJpbmc7XG4gIHByaXZhdGUgY3JlYXRlZEF0OiBzdHJpbmc7IC8vIFN0b3JlIGNyZWF0ZWRBdCBmb3IgdGhpcyBjaGFubmVsIChzZXQgb24gZmlyc3QgbG9hZC9zYXZlKVxuXG4gIGNvbnN0cnVjdG9yKGNsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudCwgd29ya2Zsb3dTdGF0ZVRhYmxlOiBzdHJpbmcpIHtcbiAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICB0aGlzLndvcmtmbG93U3RhdGVUYWJsZSA9IHdvcmtmbG93U3RhdGVUYWJsZTtcbiAgICB0aGlzLmNyZWF0ZWRBdCA9ICdTVEFURSc7IC8vIEZpeGVkIHNvcnQga2V5IGZvciB3b3JrZmxvdyBzdGF0ZSByZWNvcmRzXG4gIH1cblxuICAvKipcbiAgICogTG9hZCB3b3JrZmxvdyBzdGF0ZSBmb3IgYSBjaGFubmVsXG4gICAqIFJldHVybnMgZGVmYXVsdCBzdGF0ZSBpZiBjaGFubmVsIGRvZXNuJ3QgZXhpc3Qgb3IgaGFzIG5vIHdvcmtmbG93IHN0YXRlXG4gICAqL1xuICBhc3luYyBsb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQ6IHN0cmluZywgdGVuYW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XG4gICAgY29uc29sZS5sb2coYPCfk4ogTG9hZGluZyB3b3JrZmxvdyBzdGF0ZSBmb3IgY2hhbm5lbDogJHtjaGFubmVsSWR9YCk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNpbXBsZSBHZXRJdGVtIHNpbmNlIHdlIG93biB0aGlzIHRhYmxlXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0aGlzLndvcmtmbG93U3RhdGVUYWJsZSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgY2hhbm5lbElkLFxuICAgICAgICAgIGNyZWF0ZWRBdDogdGhpcy5jcmVhdGVkQXRcbiAgICAgICAgfVxuICAgICAgfSkpO1xuXG4gICAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgICAgY29uc3QgcmVjb3JkID0gcmVzdWx0Lkl0ZW0gYXMgV29ya2Zsb3dTdGF0ZVJlY29yZDtcbiAgICAgICAgXG4gICAgICAgIGlmIChyZWNvcmQud29ya2Zsb3dTdGF0ZSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgTG9hZGVkIGV4aXN0aW5nIHdvcmtmbG93IHN0YXRlYCk7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgIE1lc3NhZ2UgY291bnQ6ICR7cmVjb3JkLndvcmtmbG93U3RhdGUubWVzc2FnZUNvdW50fWApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICBDYXB0dXJlZCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KHJlY29yZC53b3JrZmxvd1N0YXRlLmNhcHR1cmVkRGF0YSl9YCk7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgIEFjdGl2ZSBnb2FsczogJHtyZWNvcmQud29ya2Zsb3dTdGF0ZS5hY3RpdmVHb2Fscy5qb2luKCcsICcpIHx8ICdub25lJ31gKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICAgQ29tcGxldGVkIGdvYWxzOiAke3JlY29yZC53b3JrZmxvd1N0YXRlLmNvbXBsZXRlZEdvYWxzLmpvaW4oJywgJykgfHwgJ25vbmUnfWApO1xuICAgICAgICAgIHJldHVybiByZWNvcmQud29ya2Zsb3dTdGF0ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBObyBleGlzdGluZyB3b3JrZmxvdyBzdGF0ZSwgcmV0dXJuaW5nIGRlZmF1bHRgKTtcbiAgICAgIHJldHVybiB0aGlzLmdldERlZmF1bHRXb3JrZmxvd1N0YXRlKCk7XG4gICAgICBcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGxvYWRpbmcgd29ya2Zsb3cgc3RhdGUgZm9yICR7Y2hhbm5lbElkfTpgLCBlcnJvcik7XG4gICAgICByZXR1cm4gdGhpcy5nZXREZWZhdWx0V29ya2Zsb3dTdGF0ZSgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTYXZlIHdvcmtmbG93IHN0YXRlIGZvciBhIGNoYW5uZWxcbiAgICogVXNlcyBQdXRDb21tYW5kIHRvIGNyZWF0ZS91cGRhdGUgdGhlIHdvcmtmbG93IHN0YXRlIHJlY29yZFxuICAgKi9cbiAgYXN5bmMgc2F2ZVdvcmtmbG93U3RhdGUoXG4gICAgY2hhbm5lbElkOiBzdHJpbmcsXG4gICAgc3RhdGU6IENoYW5uZWxXb3JrZmxvd1N0YXRlLFxuICAgIHRlbmFudElkPzogc3RyaW5nXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKGDwn5K+IFNhdmluZyB3b3JrZmxvdyBzdGF0ZSBmb3IgY2hhbm5lbDogJHtjaGFubmVsSWR9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFN0YXRlOiAke0pTT04uc3RyaW5naWZ5KHN0YXRlLCBudWxsLCAyKX1gKTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgICAgXG4gICAgICAvLyBCdWlsZCB0aGUgcmVjb3JkXG4gICAgICBjb25zdCByZWNvcmQ6IFdvcmtmbG93U3RhdGVSZWNvcmQgPSB7XG4gICAgICAgIGNoYW5uZWxJZCxcbiAgICAgICAgY3JlYXRlZEF0OiB0aGlzLmNyZWF0ZWRBdCxcbiAgICAgICAgdGVuYW50SWQ6IHRlbmFudElkIHx8ICd1bmtub3duJyxcbiAgICAgICAgd29ya2Zsb3dTdGF0ZTogc3RhdGUsXG4gICAgICAgIHVwZGF0ZWRfYXQ6IG5vdyxcbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBHU0kgYXR0cmlidXRlcyBmb3IgcXVlcnlpbmdcbiAgICAgIGlmICh0ZW5hbnRJZCkge1xuICAgICAgICByZWNvcmQuR1NJMVBLID0gdGVuYW50SWQ7XG4gICAgICAgIHJlY29yZC5HU0kxU0sgPSBzdGF0ZS5sYXN0VXBkYXRlZDtcbiAgICAgICAgXG4gICAgICAgIC8vIEdTSTIgZm9yIGFjdGl2ZSBnb2FsIHF1ZXJpZXNcbiAgICAgICAgaWYgKHN0YXRlLmFjdGl2ZUdvYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICByZWNvcmQuR1NJMlBLID0gYCR7dGVuYW50SWR9IyR7c3RhdGUuYWN0aXZlR29hbHNbMF19YDtcbiAgICAgICAgICByZWNvcmQuR1NJMlNLID0gc3RhdGUubWVzc2FnZUNvdW50LnRvU3RyaW5nKCkucGFkU3RhcnQoNiwgJzAnKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiB0aGlzLndvcmtmbG93U3RhdGVUYWJsZSxcbiAgICAgICAgSXRlbTogcmVjb3JkXG4gICAgICB9KSk7XG5cbiAgICAgIGNvbnNvbGUubG9nKGDinIUgV29ya2Zsb3cgc3RhdGUgc2F2ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBzYXZpbmcgd29ya2Zsb3cgc3RhdGUgZm9yICR7Y2hhbm5lbElkfTpgLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIHNwZWNpZmljIGZpZWxkcyBpbiB0aGUgd29ya2Zsb3cgc3RhdGUgKHBhcnRpYWwgdXBkYXRlKVxuICAgKi9cbiAgYXN5bmMgdXBkYXRlV29ya2Zsb3dTdGF0ZShcbiAgICBjaGFubmVsSWQ6IHN0cmluZyxcbiAgICB1cGRhdGVzOiBQYXJ0aWFsPENoYW5uZWxXb3JrZmxvd1N0YXRlPixcbiAgICB0ZW5hbnRJZD86IHN0cmluZ1xuICApOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XG4gICAgY29uc29sZS5sb2coYPCflIQgVXBkYXRpbmcgd29ya2Zsb3cgc3RhdGUgZm9yIGNoYW5uZWw6ICR7Y2hhbm5lbElkfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBVcGRhdGVzOiAke0pTT04uc3RyaW5naWZ5KHVwZGF0ZXMsIG51bGwsIDIpfWApO1xuICAgIFxuICAgIC8vIExvYWQgY3VycmVudCBzdGF0ZVxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCB0ZW5hbnRJZCk7XG4gICAgXG4gICAgLy8gTWVyZ2UgdXBkYXRlc1xuICAgIGNvbnN0IG5ld1N0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSA9IHtcbiAgICAgIC4uLmN1cnJlbnRTdGF0ZSxcbiAgICAgIC4uLnVwZGF0ZXMsXG4gICAgICBsYXN0VXBkYXRlZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgfTtcbiAgICBcbiAgICAvLyBTYXZlIG1lcmdlZCBzdGF0ZVxuICAgIGF3YWl0IHRoaXMuc2F2ZVdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCBuZXdTdGF0ZSwgdGVuYW50SWQpO1xuICAgIFxuICAgIHJldHVybiBuZXdTdGF0ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNYXJrIGEgZGF0YSBmaWVsZCBhcyBjYXB0dXJlZFxuICAgKi9cbiAgYXN5bmMgbWFya0ZpZWxkQ2FwdHVyZWQoXG4gICAgY2hhbm5lbElkOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgZmllbGRWYWx1ZTogYW55LFxuICAgIHRlbmFudElkPzogc3RyaW5nXG4gICk6IFByb21pc2U8Q2hhbm5lbFdvcmtmbG93U3RhdGU+IHtcbiAgICBjb25zb2xlLmxvZyhg4pyU77iPIE1hcmtpbmcgZmllbGQgY2FwdHVyZWQ6ICR7ZmllbGROYW1lfSA9ICR7ZmllbGRWYWx1ZX1gKTtcbiAgICBcbiAgICBjb25zdCBjdXJyZW50U3RhdGUgPSBhd2FpdCB0aGlzLmxvYWRXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgdGVuYW50SWQpO1xuICAgIFxuICAgIGNvbnN0IHVwZGF0ZXM6IFBhcnRpYWw8Q2hhbm5lbFdvcmtmbG93U3RhdGU+ID0ge1xuICAgICAgY2FwdHVyZWREYXRhOiB7XG4gICAgICAgIC4uLmN1cnJlbnRTdGF0ZS5jYXB0dXJlZERhdGEsXG4gICAgICAgIFtmaWVsZE5hbWVdOiBmaWVsZFZhbHVlXG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIFVwZGF0ZSB0cmFja2luZyBmbGFncyBmb3Igc3RhbmRhcmQgY29udGFjdCBmaWVsZHNcbiAgICBpZiAoZmllbGROYW1lID09PSAnZW1haWwnKSB7XG4gICAgICB1cGRhdGVzLmlzRW1haWxDYXB0dXJlZCA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdwaG9uZScpIHtcbiAgICAgIHVwZGF0ZXMuaXNQaG9uZUNhcHR1cmVkID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ2ZpcnN0TmFtZScpIHtcbiAgICAgIHVwZGF0ZXMuaXNGaXJzdE5hbWVDYXB0dXJlZCA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdsYXN0TmFtZScpIHtcbiAgICAgIHVwZGF0ZXMuaXNMYXN0TmFtZUNhcHR1cmVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy51cGRhdGVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgdXBkYXRlcywgdGVuYW50SWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIE1hcmsgYSBnb2FsIGFzIGNvbXBsZXRlZFxuICAgKi9cbiAgYXN5bmMgbWFya0dvYWxDb21wbGV0ZWQoXG4gICAgY2hhbm5lbElkOiBzdHJpbmcsXG4gICAgZ29hbElkOiBzdHJpbmcsXG4gICAgdGVuYW50SWQ/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxDaGFubmVsV29ya2Zsb3dTdGF0ZT4ge1xuICAgIGNvbnNvbGUubG9nKGDwn46vIE1hcmtpbmcgZ29hbCBjb21wbGV0ZWQ6ICR7Z29hbElkfWApO1xuICAgIFxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCB0ZW5hbnRJZCk7XG4gICAgXG4gICAgLy8gRG9uJ3QgYWRkIGR1cGxpY2F0ZXNcbiAgICBpZiAoY3VycmVudFN0YXRlLmNvbXBsZXRlZEdvYWxzLmluY2x1ZGVzKGdvYWxJZCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBHb2FsICR7Z29hbElkfSBhbHJlYWR5IGNvbXBsZXRlZGApO1xuICAgICAgcmV0dXJuIGN1cnJlbnRTdGF0ZTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHtcbiAgICAgIGNvbXBsZXRlZEdvYWxzOiBbLi4uY3VycmVudFN0YXRlLmNvbXBsZXRlZEdvYWxzLCBnb2FsSWRdLFxuICAgICAgYWN0aXZlR29hbHM6IGN1cnJlbnRTdGF0ZS5hY3RpdmVHb2Fscy5maWx0ZXIoaWQgPT4gaWQgIT09IGdvYWxJZClcbiAgICB9LCB0ZW5hbnRJZCk7XG4gIH1cblxuICAvKipcbiAgICogU2V0IGFjdGl2ZSBnb2Fsc1xuICAgKi9cbiAgYXN5bmMgc2V0QWN0aXZlR29hbHMoXG4gICAgY2hhbm5lbElkOiBzdHJpbmcsXG4gICAgZ29hbElkczogc3RyaW5nW10sXG4gICAgdGVuYW50SWQ/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxDaGFubmVsV29ya2Zsb3dTdGF0ZT4ge1xuICAgIGNvbnNvbGUubG9nKGDwn46vIFNldHRpbmcgYWN0aXZlIGdvYWxzOiAke2dvYWxJZHMuam9pbignLCAnKX1gKTtcbiAgICBcbiAgICByZXR1cm4gdGhpcy51cGRhdGVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwge1xuICAgICAgYWN0aXZlR29hbHM6IGdvYWxJZHNcbiAgICB9LCB0ZW5hbnRJZCk7XG4gIH1cblxuICAvKipcbiAgICogSW5jcmVtZW50IG1lc3NhZ2UgY291bnRcbiAgICovXG4gIGFzeW5jIGluY3JlbWVudE1lc3NhZ2VDb3VudChjaGFubmVsSWQ6IHN0cmluZywgdGVuYW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPENoYW5uZWxXb3JrZmxvd1N0YXRlPiB7XG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gYXdhaXQgdGhpcy5sb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHRlbmFudElkKTtcbiAgICBcbiAgICByZXR1cm4gdGhpcy51cGRhdGVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwge1xuICAgICAgbWVzc2FnZUNvdW50OiBjdXJyZW50U3RhdGUubWVzc2FnZUNvdW50ICsgMVxuICAgIH0sIHRlbmFudElkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWNvcmQgdGhhdCBhbiBldmVudCB3YXMgZW1pdHRlZCAocHJldmVudCBkdXBsaWNhdGUgZXZlbnRzKVxuICAgKi9cbiAgYXN5bmMgcmVjb3JkRXZlbnRFbWl0dGVkKFxuICAgIGNoYW5uZWxJZDogc3RyaW5nLFxuICAgIGV2ZW50TmFtZTogc3RyaW5nLFxuICAgIHRlbmFudElkPzogc3RyaW5nXG4gICk6IFByb21pc2U8Q2hhbm5lbFdvcmtmbG93U3RhdGU+IHtcbiAgICBjb25zb2xlLmxvZyhg8J+TpCBSZWNvcmRpbmcgZXZlbnQgZW1pdHRlZDogJHtldmVudE5hbWV9YCk7XG4gICAgXG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gYXdhaXQgdGhpcy5sb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHRlbmFudElkKTtcbiAgICBcbiAgICAvLyBEb24ndCBhZGQgZHVwbGljYXRlc1xuICAgIGlmIChjdXJyZW50U3RhdGUuZW1pdHRlZEV2ZW50cy5pbmNsdWRlcyhldmVudE5hbWUpKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAgRXZlbnQgJHtldmVudE5hbWV9IGFscmVhZHkgZW1pdHRlZGApO1xuICAgICAgcmV0dXJuIGN1cnJlbnRTdGF0ZTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHRoaXMudXBkYXRlV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHtcbiAgICAgIGVtaXR0ZWRFdmVudHM6IFsuLi5jdXJyZW50U3RhdGUuZW1pdHRlZEV2ZW50cywgZXZlbnROYW1lXVxuICAgIH0sIHRlbmFudElkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSb2xsYmFjayB3b3JrZmxvdyBzdGF0ZSB0byBhIHByZXZpb3VzIHNuYXBzaG90XG4gICAqIFVzZWQgd2hlbiBhIHJlc3BvbnNlIGlzIGludGVycnVwdGVkIGFuZCBuZWVkcyB0byBiZSBkaXNjYXJkZWRcbiAgICogXG4gICAqIEBwYXJhbSBjaGFubmVsSWQgLSBDaGFubmVsIGlkZW50aWZpZXJcbiAgICogQHBhcmFtIHNuYXBzaG90IC0gU3RhdGUgc25hcHNob3QgdG8gcmVzdG9yZVxuICAgKiBAcGFyYW0gdGVuYW50SWQgLSBUZW5hbnQgaWRlbnRpZmllclxuICAgKi9cbiAgYXN5bmMgcm9sbGJhY2tTdGF0ZShcbiAgICBjaGFubmVsSWQ6IHN0cmluZyxcbiAgICBzbmFwc2hvdDoge1xuICAgICAgYXR0ZW1wdENvdW50czogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgICAgIGNhcHR1cmVkRGF0YTogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICAgIGFjdGl2ZUdvYWxzOiBzdHJpbmdbXTtcbiAgICAgIGNvbXBsZXRlZEdvYWxzOiBzdHJpbmdbXTtcbiAgICAgIG1lc3NhZ2VDb3VudDogbnVtYmVyO1xuICAgIH0sXG4gICAgdGVuYW50SWQ/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxDaGFubmVsV29ya2Zsb3dTdGF0ZT4ge1xuICAgIGNvbnNvbGUubG9nKGDij6ogUm9sbGluZyBiYWNrIHdvcmtmbG93IHN0YXRlIGZvciBjaGFubmVsOiAke2NoYW5uZWxJZH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgU25hcHNob3Q6ICR7SlNPTi5zdHJpbmdpZnkoc25hcHNob3QsIG51bGwsIDIpfWApO1xuICAgIFxuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCB0ZW5hbnRJZCk7XG4gICAgXG4gICAgLy8gUmVzdG9yZSB0aGUgc25hcHNob3QgZmllbGRzXG4gICAgY29uc3Qgcm9sbGVkQmFja1N0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSA9IHtcbiAgICAgIC4uLmN1cnJlbnRTdGF0ZSxcbiAgICAgIGNhcHR1cmVkRGF0YTogc25hcHNob3QuY2FwdHVyZWREYXRhLFxuICAgICAgYWN0aXZlR29hbHM6IHNuYXBzaG90LmFjdGl2ZUdvYWxzLFxuICAgICAgY29tcGxldGVkR29hbHM6IHNuYXBzaG90LmNvbXBsZXRlZEdvYWxzLFxuICAgICAgbWVzc2FnZUNvdW50OiBzbmFwc2hvdC5tZXNzYWdlQ291bnQsXG4gICAgICBsYXN0VXBkYXRlZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgfTtcbiAgICBcbiAgICAvLyBOb3RlOiBhdHRlbXB0Q291bnRzIGlzIHRyYWNrZWQgaW4gR29hbE9yY2hlc3RyYXRvciwgbm90IENoYW5uZWxXb3JrZmxvd1N0YXRlXG4gICAgLy8gVGhlIG9yY2hlc3RyYXRvciB3aWxsIHVzZSB0aGUgc25hcHNob3QgZGF0YSBkaXJlY3RseVxuICAgIFxuICAgIGF3YWl0IHRoaXMuc2F2ZVdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCByb2xsZWRCYWNrU3RhdGUsIHRlbmFudElkKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhg4pyFIFdvcmtmbG93IHN0YXRlIHJvbGxlZCBiYWNrIHN1Y2Nlc3NmdWxseWApO1xuICAgIHJldHVybiByb2xsZWRCYWNrU3RhdGU7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYWxsIHJlcXVpcmVkIGNvbnRhY3QgaW5mbyBoYXMgYmVlbiBjYXB0dXJlZFxuICAgKi9cbiAgaXNDb250YWN0SW5mb0NvbXBsZXRlKHN0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAoXG4gICAgICBzdGF0ZS5pc0VtYWlsQ2FwdHVyZWQgJiZcbiAgICAgIHN0YXRlLmlzUGhvbmVDYXB0dXJlZCAmJlxuICAgICAgc3RhdGUuaXNGaXJzdE5hbWVDYXB0dXJlZFxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYW4gZXZlbnQgaGFzIGFscmVhZHkgYmVlbiBlbWl0dGVkXG4gICAqL1xuICBoYXNFdmVudEJlZW5FbWl0dGVkKHN0YXRlOiBDaGFubmVsV29ya2Zsb3dTdGF0ZSwgZXZlbnROYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gc3RhdGUuZW1pdHRlZEV2ZW50cy5pbmNsdWRlcyhldmVudE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFyIGEgc3BlY2lmaWMgZmllbGQncyBkYXRhIChmb3IgZXJyb3IgcmVjb3ZlcnkpXG4gICAqL1xuICBhc3luYyBjbGVhckZpZWxkRGF0YShjaGFubmVsSWQ6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHRlbmFudElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCB0ZW5hbnRJZCk7XG4gICAgXG4gICAgLy8gUmVtb3ZlIGZyb20gY2FwdHVyZWREYXRhXG4gICAgZGVsZXRlIHN0YXRlLmNhcHR1cmVkRGF0YVtmaWVsZE5hbWVdO1xuICAgIFxuICAgIC8vIFVwZGF0ZSBsZWdhY3kgZmxhZ3NcbiAgICBpZiAoZmllbGROYW1lID09PSAnZW1haWwnKSB7XG4gICAgICBzdGF0ZS5pc0VtYWlsQ2FwdHVyZWQgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3Bob25lJykge1xuICAgICAgc3RhdGUuaXNQaG9uZUNhcHR1cmVkID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdmaXJzdE5hbWUnKSB7XG4gICAgICBzdGF0ZS5pc0ZpcnN0TmFtZUNhcHR1cmVkID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT09ICdsYXN0TmFtZScpIHtcbiAgICAgIHN0YXRlLmlzTGFzdE5hbWVDYXB0dXJlZCA9IGZhbHNlO1xuICAgIH1cbiAgICBcbiAgICBhd2FpdCB0aGlzLnNhdmVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgc3RhdGUsIHRlbmFudElkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNYXJrIGEgZ29hbCBhcyBpbmNvbXBsZXRlIChmb3IgZXJyb3IgcmVjb3ZlcnkpXG4gICAqL1xuICBhc3luYyBtYXJrR29hbEluY29tcGxldGUoY2hhbm5lbElkOiBzdHJpbmcsIGdvYWxJZDogc3RyaW5nLCB0ZW5hbnRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc3RhdGUgPSBhd2FpdCB0aGlzLmxvYWRXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwgdGVuYW50SWQpO1xuICAgIFxuICAgIC8vIFJlbW92ZSBmcm9tIGNvbXBsZXRlZEdvYWxzXG4gICAgc3RhdGUuY29tcGxldGVkR29hbHMgPSBzdGF0ZS5jb21wbGV0ZWRHb2Fscy5maWx0ZXIoaWQgPT4gaWQgIT09IGdvYWxJZCk7XG4gICAgXG4gICAgLy8gQWRkIHRvIGFjdGl2ZUdvYWxzIGlmIG5vdCBhbHJlYWR5IHRoZXJlXG4gICAgaWYgKCFzdGF0ZS5hY3RpdmVHb2Fscy5pbmNsdWRlcyhnb2FsSWQpKSB7XG4gICAgICBzdGF0ZS5hY3RpdmVHb2Fscy5wdXNoKGdvYWxJZCk7XG4gICAgfVxuICAgIFxuICAgIGF3YWl0IHRoaXMuc2F2ZVdvcmtmbG93U3RhdGUoY2hhbm5lbElkLCBzdGF0ZSwgdGVuYW50SWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBkZWZhdWx0IHdvcmtmbG93IHN0YXRlXG4gICAqL1xuICAvKipcbiAgICogVXBkYXRlIHRoZSBsYXN0IHByb2Nlc3NlZCBtZXNzYWdlIElEIChmb3IgaW50ZXJydXB0aW9uIGRldGVjdGlvbilcbiAgICovXG4gIGFzeW5jIHVwZGF0ZUxhc3RQcm9jZXNzZWRNZXNzYWdlSWQoY2hhbm5lbElkOiBzdHJpbmcsIG1lc3NhZ2VJZDogc3RyaW5nLCB0ZW5hbnRJZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKGDwn5SEIFVwZGF0aW5nIGxhc3RQcm9jZXNzZWRNZXNzYWdlSWQgZm9yIGNoYW5uZWwgJHtjaGFubmVsSWR9IHRvOiAke21lc3NhZ2VJZH1gKTtcbiAgICBcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgVXBkYXRlQ29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogdGhpcy53b3JrZmxvd1N0YXRlVGFibGUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIGNoYW5uZWxJZCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IHRoaXMuY3JlYXRlZEF0XG4gICAgICAgIH0sXG4gICAgICAgIFVwZGF0ZUV4cHJlc3Npb246ICdTRVQgbGFzdFByb2Nlc3NlZE1lc3NhZ2VJZCA9IDptZXNzYWdlSWQsIHVwZGF0ZWRfYXQgPSA6bm93JyxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICc6bWVzc2FnZUlkJzogbWVzc2FnZUlkLFxuICAgICAgICAgICc6bm93JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgIH1cbiAgICAgIH0pKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYOKchSBVcGRhdGVkIGxhc3RQcm9jZXNzZWRNZXNzYWdlSWQgdG8gJHttZXNzYWdlSWR9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciB1cGRhdGluZyBsYXN0UHJvY2Vzc2VkTWVzc2FnZUlkOmAsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgY29udmVyc2F0aW9uIGFnZ3JlZ2F0ZXMgd2l0aCBuZXcgbWVzc2FnZSBhbmFseXNpcyBkYXRhXG4gICAqIFVzZXMgcm9sbGluZyBhdmVyYWdlcyB0byB0cmFjayBlbmdhZ2VtZW50IG92ZXIgdGltZVxuICAgKiBBbHNvIG1haW50YWlucyBwZXItbWVzc2FnZSBoaXN0b3J5IGZvciB0cmVuZCBhbmFseXNpc1xuICAgKi9cbiAgYXN5bmMgdXBkYXRlQ29udmVyc2F0aW9uQWdncmVnYXRlcyhcbiAgICBjaGFubmVsSWQ6IHN0cmluZyxcbiAgICBtZXNzYWdlQW5hbHlzaXM6IHtcbiAgICAgIG1lc3NhZ2VUZXh0OiBzdHJpbmc7ICAgICAgICAgLy8gVGhlIHVzZXIncyBtZXNzYWdlIHRleHQgKGZvciBtYXRjaGluZylcbiAgICAgIGludGVyZXN0TGV2ZWw6IG51bWJlcjsgICAgICAgLy8gMS01XG4gICAgICBjb252ZXJzaW9uTGlrZWxpaG9vZDogbnVtYmVyOyAvLyAwLTFcbiAgICAgIGVtb3Rpb25hbFRvbmU6IHN0cmluZzsgICAgICAgLy8gXCJwb3NpdGl2ZVwiLCBcIm5ldXRyYWxcIiwgZXRjLlxuICAgICAgbGFuZ3VhZ2VQcm9maWxlOiBMYW5ndWFnZVByb2ZpbGU7XG4gICAgICBwcmltYXJ5SW50ZW50Pzogc3RyaW5nOyAgICAgIC8vIE9wdGlvbmFsOiB3aGF0IHRoZSB1c2VyIHdhcyB0cnlpbmcgdG8gZG9cbiAgICB9LFxuICAgIHRlbmFudElkPzogc3RyaW5nXG4gICk6IFByb21pc2U8Q2hhbm5lbFdvcmtmbG93U3RhdGU+IHtcbiAgICBjb25zb2xlLmxvZyhg8J+TiiBVcGRhdGluZyBjb252ZXJzYXRpb24gYWdncmVnYXRlcyBmb3IgY2hhbm5lbDogJHtjaGFubmVsSWR9YCk7XG4gICAgXG4gICAgY29uc3QgY3VycmVudFN0YXRlID0gYXdhaXQgdGhpcy5sb2FkV29ya2Zsb3dTdGF0ZShjaGFubmVsSWQsIHRlbmFudElkKTtcbiAgICBjb25zdCBjdXJyZW50ID0gY3VycmVudFN0YXRlLmNvbnZlcnNhdGlvbkFnZ3JlZ2F0ZXMgfHwgdGhpcy5nZXREZWZhdWx0QWdncmVnYXRlcygpO1xuICAgIGNvbnN0IGNvdW50ID0gY3VycmVudC5tZXNzYWdlQW5hbHlzaXNDb3VudDtcbiAgICBcbiAgICAvLyBDYWxjdWxhdGUgcm9sbGluZyBhdmVyYWdlc1xuICAgIGNvbnN0IG5ld0NvdW50ID0gY291bnQgKyAxO1xuICAgIGNvbnN0IG5ld0F2Z0ludGVyZXN0ID0gKChjdXJyZW50LmF2Z0ludGVyZXN0TGV2ZWwgKiBjb3VudCkgKyBtZXNzYWdlQW5hbHlzaXMuaW50ZXJlc3RMZXZlbCkgLyBuZXdDb3VudDtcbiAgICBjb25zdCBuZXdBdmdDb252ZXJzaW9uID0gKChjdXJyZW50LmF2Z0NvbnZlcnNpb25MaWtlbGlob29kICogY291bnQpICsgbWVzc2FnZUFuYWx5c2lzLmNvbnZlcnNpb25MaWtlbGlob29kKSAvIG5ld0NvdW50O1xuICAgIFxuICAgIC8vIENhbGN1bGF0ZSBlbmdhZ2VtZW50IHNjb3JlICh3ZWlnaHRlZCBjb21iaW5hdGlvbilcbiAgICBjb25zdCBlbmdhZ2VtZW50U2NvcmUgPSAobmV3QXZnSW50ZXJlc3QgLyA1KSAqIDAuNCArIG5ld0F2Z0NvbnZlcnNpb24gKiAwLjQgKyBcbiAgICAgIChtZXNzYWdlQW5hbHlzaXMuZW1vdGlvbmFsVG9uZSA9PT0gJ3Bvc2l0aXZlJyA/IDAuMiA6IFxuICAgICAgIG1lc3NhZ2VBbmFseXNpcy5lbW90aW9uYWxUb25lID09PSAnbmVnYXRpdmUnIHx8IG1lc3NhZ2VBbmFseXNpcy5lbW90aW9uYWxUb25lID09PSAnZnJ1c3RyYXRlZCcgPyAwIDogMC4xKTtcbiAgICBcbiAgICAvLyBVcGRhdGUgbGFuZ3VhZ2UgcHJvZmlsZSB3aXRoIHJvbGxpbmcgYXZlcmFnZXNcbiAgICBjb25zdCBuZXdMYW5ndWFnZVByb2ZpbGU6IExhbmd1YWdlUHJvZmlsZSA9IHtcbiAgICAgIGZvcm1hbGl0eTogKChjdXJyZW50Lmxhbmd1YWdlUHJvZmlsZS5mb3JtYWxpdHkgKiBjb3VudCkgKyBtZXNzYWdlQW5hbHlzaXMubGFuZ3VhZ2VQcm9maWxlLmZvcm1hbGl0eSkgLyBuZXdDb3VudCxcbiAgICAgIGh5cGVUb2xlcmFuY2U6ICgoY3VycmVudC5sYW5ndWFnZVByb2ZpbGUuaHlwZVRvbGVyYW5jZSAqIGNvdW50KSArIG1lc3NhZ2VBbmFseXNpcy5sYW5ndWFnZVByb2ZpbGUuaHlwZVRvbGVyYW5jZSkgLyBuZXdDb3VudCxcbiAgICAgIGVtb2ppVXNhZ2U6ICgoY3VycmVudC5sYW5ndWFnZVByb2ZpbGUuZW1vamlVc2FnZSAqIGNvdW50KSArIG1lc3NhZ2VBbmFseXNpcy5sYW5ndWFnZVByb2ZpbGUuZW1vamlVc2FnZSkgLyBuZXdDb3VudCxcbiAgICAgIGxhbmd1YWdlOiBtZXNzYWdlQW5hbHlzaXMubGFuZ3VhZ2VQcm9maWxlLmxhbmd1YWdlIC8vIFVzZSBtb3N0IHJlY2VudCBsYW5ndWFnZVxuICAgIH07XG4gICAgXG4gICAgLy8gVXBkYXRlIGVtb3Rpb25hbCB0b25lIGZyZXF1ZW5jeSBtYXBcbiAgICBjb25zdCB0b25lRnJlcXVlbmN5ID0geyAuLi4oY3VycmVudC5lbW90aW9uYWxUb25lRnJlcXVlbmN5IHx8IHt9KSB9O1xuICAgIGNvbnN0IHRvbmUgPSBtZXNzYWdlQW5hbHlzaXMuZW1vdGlvbmFsVG9uZSB8fCAnbmV1dHJhbCc7XG4gICAgdG9uZUZyZXF1ZW5jeVt0b25lXSA9ICh0b25lRnJlcXVlbmN5W3RvbmVdIHx8IDApICsgMTtcbiAgICBcbiAgICAvLyBGaW5kIGRvbWluYW50IHRvbmUgZnJvbSBmcmVxdWVuY3kgbWFwXG4gICAgY29uc3QgZG9taW5hbnRUb25lID0gT2JqZWN0LmVudHJpZXModG9uZUZyZXF1ZW5jeSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSlbMF0/LlswXSB8fCAnbmV1dHJhbCc7XG4gICAgXG4gICAgLy8gQWRkIHRvIG1lc3NhZ2UgaGlzdG9yeSAoY2FwcGVkIGF0IDUwIG1lc3NhZ2VzIHRvIHByZXZlbnQgdW5ib3VuZGVkIGdyb3d0aClcbiAgICBjb25zdCBNQVhfSElTVE9SWSA9IDUwO1xuICAgIGNvbnN0IG1lc3NhZ2VIaXN0b3J5ID0gWy4uLihjdXJyZW50Lm1lc3NhZ2VIaXN0b3J5IHx8IFtdKV07XG4gICAgY29uc3QgbmV3TWVzc2FnZUVudHJ5OiBNZXNzYWdlQW5hbHlzaXMgPSB7XG4gICAgICBtZXNzYWdlSW5kZXg6IG5ld0NvdW50LFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBtZXNzYWdlVGV4dDogbWVzc2FnZUFuYWx5c2lzLm1lc3NhZ2VUZXh0LCAvLyBTdG9yZSB0aGUgbWVzc2FnZSB0ZXh0IGZvciBtYXRjaGluZ1xuICAgICAgaW50ZXJlc3RMZXZlbDogbWVzc2FnZUFuYWx5c2lzLmludGVyZXN0TGV2ZWwsXG4gICAgICBjb252ZXJzaW9uTGlrZWxpaG9vZDogbWVzc2FnZUFuYWx5c2lzLmNvbnZlcnNpb25MaWtlbGlob29kLFxuICAgICAgZW1vdGlvbmFsVG9uZTogbWVzc2FnZUFuYWx5c2lzLmVtb3Rpb25hbFRvbmUsXG4gICAgICBsYW5ndWFnZVByb2ZpbGU6IHsgLi4ubWVzc2FnZUFuYWx5c2lzLmxhbmd1YWdlUHJvZmlsZSB9LFxuICAgICAgcHJpbWFyeUludGVudDogbWVzc2FnZUFuYWx5c2lzLnByaW1hcnlJbnRlbnQgfHwgJ3Vua25vd24nXG4gICAgfTtcbiAgICBtZXNzYWdlSGlzdG9yeS5wdXNoKG5ld01lc3NhZ2VFbnRyeSk7XG4gICAgXG4gICAgLy8gQ2FwIGhpc3RvcnkgYXQgTUFYX0hJU1RPUlkgKGtlZXAgbW9zdCByZWNlbnQpXG4gICAgaWYgKG1lc3NhZ2VIaXN0b3J5Lmxlbmd0aCA+IE1BWF9ISVNUT1JZKSB7XG4gICAgICBtZXNzYWdlSGlzdG9yeS5zcGxpY2UoMCwgbWVzc2FnZUhpc3RvcnkubGVuZ3RoIC0gTUFYX0hJU1RPUlkpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBuZXdBZ2dyZWdhdGVzOiBDb252ZXJzYXRpb25BZ2dyZWdhdGVzID0ge1xuICAgICAgZW5nYWdlbWVudFNjb3JlOiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBlbmdhZ2VtZW50U2NvcmUpKSxcbiAgICAgIGF2Z0ludGVyZXN0TGV2ZWw6IE1hdGgucm91bmQobmV3QXZnSW50ZXJlc3QgKiAxMCkgLyAxMCwgLy8gMSBkZWNpbWFsIHBsYWNlXG4gICAgICBhdmdDb252ZXJzaW9uTGlrZWxpaG9vZDogTWF0aC5yb3VuZChuZXdBdmdDb252ZXJzaW9uICogMTAwKSAvIDEwMCwgLy8gMiBkZWNpbWFsIHBsYWNlc1xuICAgICAgZG9taW5hbnRFbW90aW9uYWxUb25lOiBkb21pbmFudFRvbmUsXG4gICAgICBsYW5ndWFnZVByb2ZpbGU6IHtcbiAgICAgICAgZm9ybWFsaXR5OiBNYXRoLnJvdW5kKG5ld0xhbmd1YWdlUHJvZmlsZS5mb3JtYWxpdHkgKiAxMCkgLyAxMCxcbiAgICAgICAgaHlwZVRvbGVyYW5jZTogTWF0aC5yb3VuZChuZXdMYW5ndWFnZVByb2ZpbGUuaHlwZVRvbGVyYW5jZSAqIDEwKSAvIDEwLFxuICAgICAgICBlbW9qaVVzYWdlOiBNYXRoLnJvdW5kKG5ld0xhbmd1YWdlUHJvZmlsZS5lbW9qaVVzYWdlICogMTApIC8gMTAsXG4gICAgICAgIGxhbmd1YWdlOiBuZXdMYW5ndWFnZVByb2ZpbGUubGFuZ3VhZ2VcbiAgICAgIH0sXG4gICAgICBtZXNzYWdlQW5hbHlzaXNDb3VudDogbmV3Q291bnQsXG4gICAgICBtZXNzYWdlSGlzdG9yeSxcbiAgICAgIGVtb3Rpb25hbFRvbmVGcmVxdWVuY3k6IHRvbmVGcmVxdWVuY3lcbiAgICB9O1xuICAgIFxuICAgIGNvbnNvbGUubG9nKGAgICBOZXcgYWdncmVnYXRlczogZW5nYWdlbWVudD0ke25ld0FnZ3JlZ2F0ZXMuZW5nYWdlbWVudFNjb3JlLnRvRml4ZWQoMil9LCBpbnRlcmVzdD0ke25ld0FnZ3JlZ2F0ZXMuYXZnSW50ZXJlc3RMZXZlbH0sIGNvbnZlcnNpb249JHtuZXdBZ2dyZWdhdGVzLmF2Z0NvbnZlcnNpb25MaWtlbGlob29kfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBNZXNzYWdlIGhpc3Rvcnk6ICR7bWVzc2FnZUhpc3RvcnkubGVuZ3RofSBlbnRyaWVzLCBkb21pbmFudCB0b25lOiAke2RvbWluYW50VG9uZX1gKTtcbiAgICBcbiAgICByZXR1cm4gdGhpcy51cGRhdGVXb3JrZmxvd1N0YXRlKGNoYW5uZWxJZCwge1xuICAgICAgY29udmVyc2F0aW9uQWdncmVnYXRlczogbmV3QWdncmVnYXRlc1xuICAgIH0sIHRlbmFudElkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgZGVmYXVsdCBjb252ZXJzYXRpb24gYWdncmVnYXRlc1xuICAgKi9cbiAgcHJpdmF0ZSBnZXREZWZhdWx0QWdncmVnYXRlcygpOiBDb252ZXJzYXRpb25BZ2dyZWdhdGVzIHtcbiAgICByZXR1cm4ge1xuICAgICAgZW5nYWdlbWVudFNjb3JlOiAwLjUsXG4gICAgICBhdmdJbnRlcmVzdExldmVsOiAzLFxuICAgICAgYXZnQ29udmVyc2lvbkxpa2VsaWhvb2Q6IDAuNSxcbiAgICAgIGRvbWluYW50RW1vdGlvbmFsVG9uZTogJ25ldXRyYWwnLFxuICAgICAgbGFuZ3VhZ2VQcm9maWxlOiB7XG4gICAgICAgIGZvcm1hbGl0eTogMyxcbiAgICAgICAgaHlwZVRvbGVyYW5jZTogMyxcbiAgICAgICAgZW1vamlVc2FnZTogMCxcbiAgICAgICAgbGFuZ3VhZ2U6ICdlbidcbiAgICAgIH0sXG4gICAgICBtZXNzYWdlQW5hbHlzaXNDb3VudDogMFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGdldERlZmF1bHRXb3JrZmxvd1N0YXRlKCk6IENoYW5uZWxXb3JrZmxvd1N0YXRlIHtcbiAgICByZXR1cm4ge1xuICAgICAgaXNFbWFpbENhcHR1cmVkOiBmYWxzZSxcbiAgICAgIGlzUGhvbmVDYXB0dXJlZDogZmFsc2UsXG4gICAgICBpc0ZpcnN0TmFtZUNhcHR1cmVkOiBmYWxzZSxcbiAgICAgIGlzTGFzdE5hbWVDYXB0dXJlZDogZmFsc2UsXG4gICAgICBjYXB0dXJlZERhdGE6IHt9LFxuICAgICAgY29tcGxldGVkR29hbHM6IFtdLFxuICAgICAgYWN0aXZlR29hbHM6IFtdLFxuICAgICAgY3VycmVudEdvYWxPcmRlcjogMCxcbiAgICAgIGZhc3RUcmFja0dvYWxzOiBbXSwgLy8gRmFzdC10cmFjayBtb2RlOiBvcmRlcmVkIGxpc3Qgb2YgcHJlcmVxdWlzaXRlICsgcHJpbWFyeSBnb2Fsc1xuICAgICAgbWVzc2FnZUNvdW50OiAwLFxuICAgICAgbGFzdFByb2Nlc3NlZE1lc3NhZ2VJZDogdW5kZWZpbmVkLFxuICAgICAgbGFzdFVwZGF0ZWQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIGVtaXR0ZWRFdmVudHM6IFtdLFxuICAgICAgY29udmVyc2F0aW9uQWdncmVnYXRlczogdGhpcy5nZXREZWZhdWx0QWdncmVnYXRlcygpXG4gICAgfTtcbiAgfVxufVxuXG4iXX0=